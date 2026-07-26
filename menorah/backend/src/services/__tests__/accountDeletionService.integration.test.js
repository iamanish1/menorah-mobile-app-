const mongoose = require('mongoose');
const User = require('../../models/User');
const DataDeletionRequest = require('../../models/DataDeletionRequest');
const PrivacyEvent = require('../../models/PrivacyEvent');
const ProviderRevocationTask = require('../../models/ProviderRevocationTask');
const {
  accountDeletionService,
  createAccountDeletionService,
  deletionEventIdempotencyKey,
} = require('../accountDeletionService');
const {
  hashIdempotencyKey,
  verifyPrivacyEventEvidence,
} = require('../privacyEventService');

const TEST_URI = process.env.PRIVACY_DELETION_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;
const NOW = new Date('2026-07-23T12:00:00.000Z');
const SIGNING_KEY = 'isolated-account-deletion-signing-key';
const PASSWORD = 'AccountDelete123';

const createUser = (suffix) => User.create({
  email: `privacy-delete-${suffix}@example.test`,
  phone: `+1555010${String(suffix).padStart(4, '0')}`,
  password: PASSWORD,
  firstName: 'Privacy',
  lastName: 'Delete',
  dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
  gender: 'prefer-not-to-say',
  role: 'user',
});

describeWithMongo('account deletion on isolated replica-set MongoDB', () => {
  const originalAuditKey = process.env.AUDIT_LOG_SIGNING_KEY;
  const originalBcryptRounds = process.env.BCRYPT_ROUNDS;

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_privacy_deletion_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'PRIVACY_DELETION_TEST_URI must name a disposable '
        + 'menorah_privacy_deletion_test* database.'
      );
    }
    process.env.AUDIT_LOG_SIGNING_KEY = SIGNING_KEY;
    process.env.BCRYPT_ROUNDS = '4';
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.createIndexes(),
      DataDeletionRequest.createIndexes(),
      PrivacyEvent.createIndexes(),
      ProviderRevocationTask.createIndexes(),
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    if (originalAuditKey === undefined) delete process.env.AUDIT_LOG_SIGNING_KEY;
    else process.env.AUDIT_LOG_SIGNING_KEY = originalAuditKey;
    if (originalBcryptRounds === undefined) delete process.env.BCRYPT_ROUNDS;
    else process.env.BCRYPT_ROUNDS = originalBcryptRounds;
  });

  test('concurrent duplicates create one request, one event, and one session revocation', async () => {
    const user = await createUser(1);

    const results = await Promise.all([
      accountDeletionService.requestDeletion({
        userId: user._id,
        password: PASSWORD,
        source: 'api-web',
        now: NOW,
      }),
      accountDeletionService.requestDeletion({
        userId: user._id,
        password: PASSWORD,
        source: 'api-web',
        now: NOW,
      }),
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(new Set(results.map((result) => String(result.request._id))).size).toBe(1);
    expect(new Set(results.map((result) => String(result.event._id))).size).toBe(1);

    const [storedUser, requests, events] = await Promise.all([
      User.findById(user._id).select('+lastSessionRevokedAt').lean(),
      DataDeletionRequest.find({ user: user._id }).lean(),
      PrivacyEvent.find({
        subjectUser: user._id,
        eventType: 'account_deletion_requested',
      }).select('+idempotencyKeyHash').lean(),
    ]);

    expect(storedUser).toMatchObject({
      isActive: false,
      sessionVersion: 1,
    });
    expect(storedUser.lastSessionRevokedAt).toBeInstanceOf(Date);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      requestedAt: NOW,
      accountDeactivatedAt: NOW,
      retentionReviewAfter: NOW,
      status: 'pending',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'account_deletion_requested',
      actor: user._id,
      actorRole: 'user',
      subjectUser: user._id,
      requestType: 'deletion',
      requestId: requests[0]._id,
      source: 'api-web',
      fromStatus: null,
      toStatus: 'pending',
      occurredAt: NOW,
    });
    expect(events[0].idempotencyKeyHash).toBe(hashIdempotencyKey({
      subjectUser: user._id,
      idempotencyKey: deletionEventIdempotencyKey(requests[0]._id),
    }));
    expect(verifyPrivacyEventEvidence(events[0])).toEqual({ valid: true });

    const repeated = await accountDeletionService.requestDeletion({
      userId: user._id,
      password: PASSWORD,
      source: 'api-web',
      now: new Date('2026-07-23T12:01:00.000Z'),
    });
    expect(repeated).toMatchObject({
      created: false,
      accountDeactivated: true,
    });
    expect(String(repeated.request._id)).toBe(String(requests[0]._id));
    expect(String(repeated.event._id)).toBe(String(events[0]._id));
    await expect(Promise.all([
      DataDeletionRequest.countDocuments({ user: user._id }),
      PrivacyEvent.countDocuments({
        subjectUser: user._id,
        eventType: 'account_deletion_requested',
      }),
    ])).resolves.toEqual([1, 1]);
  });

  test('missing audit signing configuration rolls every deletion write back', async () => {
    const user = await createUser(2);
    delete process.env.AUDIT_LOG_SIGNING_KEY;

    try {
      await expect(accountDeletionService.requestDeletion({
        userId: user._id,
        password: PASSWORD,
        source: 'api-web',
        now: NOW,
      })).rejects.toMatchObject({
        code: 'PRIVACY_AUDIT_NOT_CONFIGURED',
      });
    } finally {
      process.env.AUDIT_LOG_SIGNING_KEY = SIGNING_KEY;
    }

    const [storedUser, requestCount, eventCount] = await Promise.all([
      User.findById(user._id).lean(),
      DataDeletionRequest.countDocuments({ user: user._id }),
      PrivacyEvent.countDocuments({
        subjectUser: user._id,
        eventType: 'account_deletion_requested',
      }),
    ]);
    expect(storedUser).toMatchObject({
      isActive: true,
      sessionVersion: 0,
    });
    expect(requestCount).toBe(0);
    expect(eventCount).toBe(0);
  });

  test('downstream evidence failure rolls back Apple credential clearing and the provider outbox', async () => {
    const user = await createUser(3);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'socialAuth.appleSub': 'apple-subject-for-rollback',
          'socialAuth.appleClientId': 'com.menorah.health',
          'socialAuth.appleRefreshTokenEncrypted': 'v1:iv:tag:rollback-ciphertext',
        },
      }
    );
    const evidenceFailure = new Error('simulated audit evidence failure');
    const service = createAccountDeletionService({
      appendEvent: jest.fn().mockRejectedValue(evidenceFailure),
    });

    await expect(service.requestDeletion({
      userId: user._id,
      password: PASSWORD,
      source: 'api-ios',
      now: NOW,
    })).rejects.toBe(evidenceFailure);

    const [storedUser, requestCount, eventCount, providerTaskCount] = await Promise.all([
      User.findById(user._id)
        .select(
          '+socialAuth.appleRefreshTokenEncrypted '
          + '+socialAuth.appleClientId +lastSessionRevokedAt'
        )
        .lean(),
      DataDeletionRequest.countDocuments({ user: user._id }),
      PrivacyEvent.countDocuments({
        subjectUser: user._id,
        eventType: 'account_deletion_requested',
      }),
      ProviderRevocationTask.countDocuments({ user: user._id }),
    ]);
    expect(storedUser).toMatchObject({
      isActive: true,
      sessionVersion: 0,
      socialAuth: {
        appleSub: 'apple-subject-for-rollback',
        appleClientId: 'com.menorah.health',
        appleRefreshTokenEncrypted: 'v1:iv:tag:rollback-ciphertext',
      },
    });
    expect(storedUser.lastSessionRevokedAt).toBeFalsy();
    expect(requestCount).toBe(0);
    expect(eventCount).toBe(0);
    expect(providerTaskCount).toBe(0);
  });
});
