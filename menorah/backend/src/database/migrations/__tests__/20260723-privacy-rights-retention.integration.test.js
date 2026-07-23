const mongoose = require('mongoose');
const {
  up,
} = require('../20260723-privacy-rights-retention');
const DataDeletionRequest = require('../../../models/DataDeletionRequest');
const PrivacyEvent = require('../../../models/PrivacyEvent');
const PrivacyRightsRequest = require('../../../models/PrivacyRightsRequest');
const {
  verifyPrivacyEventEvidence,
} = require('../../../services/privacyEventService');

const TEST_URI = process.env.PRIVACY_MIGRATION_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;

describeWithMongo('privacy-rights migration on isolated MongoDB', () => {
  const originalAuditKey = process.env.AUDIT_LOG_SIGNING_KEY;
  const userId = new mongoose.Types.ObjectId('64f000000000000000000001');
  const requestId = new mongoose.Types.ObjectId('64f000000000000000000002');

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_privacy_migration_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'PRIVACY_MIGRATION_TEST_URI must name a disposable '
        + 'menorah_privacy_migration_test* database.'
      );
    }
    process.env.AUDIT_LOG_SIGNING_KEY = 'isolated-privacy-migration-signing-key';
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    if (originalAuditKey === undefined) delete process.env.AUDIT_LOG_SIGNING_KEY;
    else process.env.AUDIT_LOG_SIGNING_KEY = originalAuditKey;
  });

  test('backfills conservatively, creates indexes, and reruns idempotently', async () => {
    const requestedAt = new Date('2026-07-20T10:00:00.000Z');
    await mongoose.connection.collection('datadeletionrequests').insertOne({
      _id: requestId,
      user: userId,
      status: 'pending',
      requestedAt,
      accountDeactivatedAt: requestedAt,
      retentionReviewAfter: requestedAt,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    });

    await up();
    const migrated = await DataDeletionRequest.findById(requestId).lean();
    expect(migrated).toEqual(expect.objectContaining({
      workflowVersion: 1,
      legalHold: false,
      status: 'pending',
    }));
    expect(migrated).not.toHaveProperty('completedAt');
    expect(migrated).not.toHaveProperty('reviewedBy');
    expect(migrated).not.toHaveProperty('resolutionEvidenceReference');

    const events = await PrivacyEvent.find({
      eventType: 'legacy_deletion_request_registered',
      requestId,
    }).select('+idempotencyKeyHash +clientIdempotencyKeyHash').lean();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      actor: null,
      actorRole: 'system',
      subjectUser: userId,
      requestType: 'deletion',
      source: 'privacy-workflow-migration',
      toStatus: 'pending',
      occurredAt: requestedAt,
    }));
    expect(verifyPrivacyEventEvidence(events[0])).toEqual({ valid: true });

    const requestIndexes = await PrivacyRightsRequest.collection.indexes();
    const eventIndexes = await PrivacyEvent.collection.indexes();
    expect(requestIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'privacy_request_retention_sweep_v1',
      }),
    ]));
    expect(eventIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'privacy_event_idempotency_unique_v1',
        unique: true,
      }),
    ]));

    await up();
    expect(await PrivacyEvent.countDocuments({
      eventType: 'legacy_deletion_request_registered',
      requestId,
    })).toBe(1);
    expect(await DataDeletionRequest.countDocuments({ _id: requestId })).toBe(1);
  });
});
