const mongoose = require('mongoose');
const PrivacyEvent = require('../../models/PrivacyEvent');
const PrivacyRightsRequest = require('../../models/PrivacyRightsRequest');
const {
  createPrivacyRightsWorkflow,
} = require('../privacyRightsWorkflow');
const {
  verifyPrivacyEventEvidence,
} = require('../privacyEventService');

const TEST_URI = process.env.PRIVACY_RIGHTS_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;
const USER = {
  _id: new mongoose.Types.ObjectId('64f000000000000000000001'),
  role: 'user',
};
const SIGNING_KEY = 'isolated-privacy-rights-signing-key';
const ENCRYPTION_KEY = 'isolated-privacy-rights-encryption-key';

jest.setTimeout(30000);

describeWithMongo('privacy rights idempotency on isolated replica-set MongoDB', () => {
  const originalAuditKey = process.env.AUDIT_LOG_SIGNING_KEY;
  const originalEncryptionKey = process.env.DATA_ENCRYPTION_KEY;
  const workflow = createPrivacyRightsWorkflow();

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_privacy_rights_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'PRIVACY_RIGHTS_TEST_URI must name a disposable '
        + 'menorah_privacy_rights_test* database.'
      );
    }
    process.env.AUDIT_LOG_SIGNING_KEY = SIGNING_KEY;
    process.env.DATA_ENCRYPTION_KEY = ENCRYPTION_KEY;
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
    if (originalEncryptionKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = originalEncryptionKey;
  });

  test('replays only an identical operation and rejects type or body mismatch', async () => {
    const key = 'privacy-rights-integration-key-0001';
    const body = {
      contactChannel: 'email',
      description: 'Please investigate this privacy handling concern.',
    };
    const created = await workflow.submitRequest({
      user: USER,
      requestType: 'grievance',
      body,
      source: 'api-web',
      idempotencyKey: key,
      now: new Date('2026-07-23T13:00:00.000Z'),
    });
    expect(created.created).toBe(true);

    const replayed = await workflow.submitRequest({
      user: USER,
      requestType: 'grievance',
      body,
      source: 'api-web',
      idempotencyKey: key,
      now: new Date('2026-07-23T13:00:01.000Z'),
    });
    expect(replayed.created).toBe(false);
    expect(String(replayed.request._id)).toBe(String(created.request._id));
    expect(replayed.request).not.toHaveProperty('payloadEncrypted');

    await expect(workflow.submitRequest({
      user: USER,
      requestType: 'grievance',
      body: {
        ...body,
        description: 'A different privacy concern sent with the reused key.',
      },
      source: 'api-web',
      idempotencyKey: key,
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    });

    await expect(workflow.submitRequest({
      user: USER,
      requestType: 'grievance',
      body: {
        ...body,
        description: 'Different evidence with a new key while review is active.',
      },
      source: 'api-web',
      idempotencyKey: 'privacy-rights-integration-key-new',
    })).rejects.toMatchObject({
      code: 'PRIVACY_ACTIVE_REQUEST_CONFLICT',
      statusCode: 409,
    });

    await expect(workflow.submitRequest({
      user: USER,
      requestType: 'export',
      body: { scope: 'account_data' },
      source: 'api-web',
      idempotencyKey: key,
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    });

    const [requests, events] = await Promise.all([
      PrivacyRightsRequest.find({ user: USER._id }).lean(),
      PrivacyEvent.find({
        subjectUser: USER._id,
        eventType: 'rights_request_submitted',
      }).select('+idempotencyKeyHash +clientIdempotencyKeyHash').lean(),
    ]);
    expect(requests).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0].requestId).toEqual(requests[0]._id);
    expect(verifyPrivacyEventEvidence(events[0])).toEqual({ valid: true });
  });

  test('a concurrent same-key body mismatch has one winner and one conflict', async () => {
    const key = 'privacy-rights-integration-key-0002';
    const outcomes = await Promise.allSettled([
      'Please correct the first version of my email request.',
      'Please correct the second version of my email request.',
    ].map((description, index) => workflow.submitRequest({
      user: USER,
      requestType: 'correction',
      body: {
        correctionFields: ['email'],
        description,
      },
      source: 'api-web',
      idempotencyKey: key,
      now: new Date(`2026-07-23T13:01:0${index}.000Z`),
    })));

    const fulfilled = outcomes.filter(({ status }) => status === 'fulfilled');
    const rejected = outcomes.filter(({ status }) => status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.created).toBe(true);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    });
    await expect(Promise.all([
      PrivacyRightsRequest.countDocuments({
        user: USER._id,
        requestType: 'correction',
      }),
      PrivacyEvent.countDocuments({
        subjectUser: USER._id,
        eventType: 'rights_request_submitted',
      }),
    ])).resolves.toEqual([1, 1]);
  });
});
