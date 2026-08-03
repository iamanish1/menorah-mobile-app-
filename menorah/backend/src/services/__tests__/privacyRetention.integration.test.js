const mongoose = require('mongoose');
const PrivacyEvent = require('../../models/PrivacyEvent');
const PrivacyRightsRequest = require('../../models/PrivacyRightsRequest');
const {
  createPrivacyRetentionService,
} = require('../privacyRetention');
const {
  createPrivacyRightsWorkflow,
} = require('../privacyRightsWorkflow');
const {
  verifyPrivacyEventEvidence,
} = require('../privacyEventService');

const TEST_URI = process.env.PRIVACY_RETENTION_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;
const NOW = new Date('2026-07-23T10:00:00.000Z');

const automatedConfig = () => ({
  retentionExecutionEnabled: true,
  retentionPolicy: {
    version: 'isolated-approved-policy-v1',
    categories: {
      privacy_rights_request_payload: {
        mode: 'automated',
        retentionDays: 30,
      },
    },
  },
});

describeWithMongo('privacy retention on isolated replica-set MongoDB', () => {
  const originalAuditKey = process.env.AUDIT_LOG_SIGNING_KEY;
  const userId = new mongoose.Types.ObjectId('64f000000000000000000001');

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_privacy_retention_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'PRIVACY_RETENTION_TEST_URI must name a disposable '
        + 'menorah_privacy_retention_test* database.'
      );
    }
    process.env.AUDIT_LOG_SIGNING_KEY = 'isolated-privacy-retention-signing-key';
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([
      PrivacyEvent.createIndexes(),
      PrivacyRightsRequest.createIndexes(),
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    if (originalAuditKey === undefined) delete process.env.AUDIT_LOG_SIGNING_KEY;
    else process.env.AUDIT_LOG_SIGNING_KEY = originalAuditKey;
  });

  test('disposes due payload once and never touches a held request', async () => {
    const [due, held] = await PrivacyRightsRequest.create([
      {
        user: userId,
        requestType: 'correction',
        status: 'completed',
        activeKey: null,
        source: 'api-web',
        correctionFields: ['other'],
        payloadEncrypted: 'v1:due-payload',
        submittedAt: new Date('2026-07-01T10:00:00.000Z'),
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
        legalHold: { active: false },
        retention: {
          category: 'privacy_rights_request_payload',
          policyVersion: 'isolated-approved-policy-v1',
          dueAt: NOW,
        },
      },
      {
        user: userId,
        requestType: 'grievance',
        status: 'completed',
        activeKey: null,
        source: 'api-web',
        payloadEncrypted: 'v1:held-payload',
        submittedAt: new Date('2026-07-01T10:00:00.000Z'),
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
        legalHold: {
          active: true,
          setAt: new Date('2026-07-03T10:00:00.000Z'),
          setBy: userId,
          policyReference: 'isolated-hold-policy',
        },
        retention: {
          category: 'privacy_rights_request_payload',
          policyVersion: 'isolated-approved-policy-v1',
          dueAt: NOW,
        },
      },
    ]);
    const service = createPrivacyRetentionService({
      readConfig: automatedConfig,
    });

    const summary = await service.processBatch({
      now: new Date('2026-07-23T10:00:01.000Z'),
      limit: 10,
    });
    expect(summary).toEqual({
      disabled: false,
      scanned: 1,
      disposed: 1,
      protectedOrChanged: 0,
      failed: 0,
      failures: [],
    });

    const disposed = await PrivacyRightsRequest.findById(due._id)
      .select('+payloadEncrypted')
      .lean();
    const protectedRequest = await PrivacyRightsRequest.findById(held._id)
      .select('+payloadEncrypted')
      .lean();
    expect(disposed.payloadEncrypted).toBeUndefined();
    expect(disposed.retention.payloadDisposedAt)
      .toEqual(new Date('2026-07-23T10:00:01.000Z'));
    expect(protectedRequest.payloadEncrypted).toBe('v1:held-payload');
    expect(protectedRequest.retention.payloadDisposedAt).toBeNull();

    const events = await PrivacyEvent.find({
      eventType: 'retention_payload_disposed',
    }).select('+idempotencyKeyHash +clientIdempotencyKeyHash').lean();
    expect(events).toHaveLength(1);
    expect(events[0].requestId).toEqual(due._id);
    expect(verifyPrivacyEventEvidence(events[0])).toEqual({ valid: true });

    await expect(service.disposeOne({
      requestId: due._id,
      now: new Date('2026-07-23T10:00:02.000Z'),
    })).resolves.toEqual({
      requestId: String(due._id),
      outcome: 'not_due_or_protected',
    });
  });

  test('a hold that commits before disposition CAS wins the race', async () => {
    const request = await PrivacyRightsRequest.create({
      user: userId,
      requestType: 'grievance',
      status: 'completed',
      activeKey: null,
      workflowVersion: 1,
      source: 'api-web',
      payloadEncrypted: 'v1:race-payload',
      submittedAt: new Date('2026-07-01T10:00:00.000Z'),
      completedAt: new Date('2026-07-02T10:00:00.000Z'),
      legalHold: { active: false },
      retention: {
        category: 'privacy_rights_request_payload',
        policyVersion: 'isolated-approved-policy-v1',
        dueAt: NOW,
      },
    });
    let releaseDisposition;
    let dispositionHookCalls = 0;
    const dispositionEntered = new Promise((resolve) => {
      releaseDisposition = { resolve: null };
      releaseDisposition.promise = new Promise((release) => {
        releaseDisposition.resolve = release;
      });
      releaseDisposition.entered = resolve;
    });
    const retention = createPrivacyRetentionService({
      readConfig: automatedConfig,
      beforeDispositionWrite: async () => {
        dispositionHookCalls += 1;
        if (dispositionHookCalls !== 1) return;
        releaseDisposition.entered();
        await releaseDisposition.promise;
      },
    });
    const disposalPromise = retention.disposeOne({
      requestId: request._id,
      now: new Date('2026-07-23T10:00:01.000Z'),
    });
    await dispositionEntered;

    const workflow = createPrivacyRightsWorkflow();
    await workflow.setLegalHold({
      kind: 'rights',
      requestId: request._id,
      admin: { _id: userId },
      action: 'apply',
      policyReference: 'isolated-hold-policy',
      source: 'api-admin',
      now: new Date('2026-07-23T10:00:00.500Z'),
    });
    releaseDisposition.resolve();

    await expect(disposalPromise).resolves.toEqual({
      requestId: String(request._id),
      outcome: 'not_due_or_protected',
    });
    const stored = await PrivacyRightsRequest.findById(request._id)
      .select('+payloadEncrypted')
      .lean();
    expect(stored.legalHold.active).toBe(true);
    expect(stored.payloadEncrypted).toBe('v1:race-payload');
    expect(stored.retention.payloadDisposedAt).toBeNull();
    expect(await PrivacyEvent.countDocuments({
      requestId: request._id,
      eventType: 'retention_payload_disposed',
    })).toBe(0);
  });

  test('a hold racing after committed disposition is explicitly rejected', async () => {
    const request = await PrivacyRightsRequest.create({
      user: userId,
      requestType: 'correction',
      status: 'completed',
      activeKey: null,
      workflowVersion: 1,
      source: 'api-web',
      correctionFields: ['other'],
      payloadEncrypted: 'v1:reverse-race-payload',
      submittedAt: new Date('2026-07-01T10:00:00.000Z'),
      completedAt: new Date('2026-07-02T10:00:00.000Z'),
      legalHold: { active: false },
      retention: {
        category: 'privacy_rights_request_payload',
        policyVersion: 'isolated-approved-policy-v1',
        dueAt: NOW,
      },
    });
    let releaseHold;
    let holdHookCalls = 0;
    const holdEntered = new Promise((resolve) => {
      releaseHold = { resolve: null };
      releaseHold.promise = new Promise((release) => {
        releaseHold.resolve = release;
      });
      releaseHold.entered = resolve;
    });
    const workflow = createPrivacyRightsWorkflow({
      beforeLegalHoldWrite: async () => {
        holdHookCalls += 1;
        if (holdHookCalls !== 1) return;
        releaseHold.entered();
        await releaseHold.promise;
      },
    });
    const holdPromise = workflow.setLegalHold({
      kind: 'rights',
      requestId: request._id,
      admin: { _id: userId },
      action: 'apply',
      policyReference: 'isolated-hold-policy',
      source: 'api-admin',
      now: new Date('2026-07-23T10:00:00.500Z'),
    });
    await holdEntered;

    const retention = createPrivacyRetentionService({
      readConfig: automatedConfig,
    });
    await expect(retention.disposeOne({
      requestId: request._id,
      now: new Date('2026-07-23T10:00:01.000Z'),
    })).resolves.toEqual({
      requestId: String(request._id),
      outcome: 'payload_disposed',
    });
    releaseHold.resolve();

    await expect(holdPromise).rejects.toMatchObject({
      code: 'LEGAL_HOLD_PAYLOAD_ALREADY_DISPOSED',
      statusCode: 409,
    });
    const stored = await PrivacyRightsRequest.findById(request._id)
      .select('+payloadEncrypted')
      .lean();
    expect(stored.legalHold.active).toBe(false);
    expect(stored.payloadEncrypted).toBeUndefined();
    expect(stored.retention.payloadDisposedAt)
      .toEqual(new Date('2026-07-23T10:00:01.000Z'));
  });
});
