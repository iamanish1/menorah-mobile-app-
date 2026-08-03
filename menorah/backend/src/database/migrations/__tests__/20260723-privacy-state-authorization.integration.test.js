const mongoose = require('mongoose');
const PrivacyConsentState = require('../../../models/PrivacyConsentState');
const PrivacyEvent = require('../../../models/PrivacyEvent');
const PrivacyRightsRequest = require('../../../models/PrivacyRightsRequest');
const User = require('../../../models/User');
const {
  up,
} = require('../20260723-privacy-state-authorization');
const {
  buildConsentTransitionIdentity,
} = require('../../../services/privacyConsentService');
const {
  appendPrivacyEvent,
} = require('../../../services/privacyEventService');

const TEST_URI = process.env.PRIVACY_STATE_MIGRATION_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;

jest.setTimeout(30000);

const userFields = (suffix, overrides = {}) => ({
  email: `privacy-state-${suffix}@example.test`,
  phone: `+1555020${String(suffix).padStart(4, '0')}`,
  password: 'MigrationPass123',
  firstName: 'Privacy',
  lastName: 'Migration',
  dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
  gender: 'prefer-not-to-say',
  ...overrides,
});

describeWithMongo('privacy state migration on isolated MongoDB', () => {
  const originalAuditKey = process.env.AUDIT_LOG_SIGNING_KEY;
  const originalBcryptRounds = process.env.BCRYPT_ROUNDS;

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_privacy_state_migration_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'PRIVACY_STATE_MIGRATION_TEST_URI must name a disposable '
        + 'menorah_privacy_state_migration_test* database.'
      );
    }
    process.env.AUDIT_LOG_SIGNING_KEY =
      'isolated-privacy-state-migration-signing-key';
    process.env.BCRYPT_ROUNDS = '4';
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.createIndexes(),
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
    if (originalBcryptRounds === undefined) delete process.env.BCRYPT_ROUNDS;
    else process.env.BCRYPT_ROUNDS = originalBcryptRounds;
  });

  test('backfills state and security fences while purging persisted grants idempotently', async () => {
    const [admin, socialOnly, passwordUser, ungrantedAdmin] = await User.create([
      userFields(1, { role: 'admin' }),
      userFields(2, {
        socialAuth: { googleSub: 'migration-google-subject' },
      }),
      userFields(3),
      userFields(4, { role: 'admin' }),
    ]);
    await User.collection.updateMany(
      {},
      {
        $set: {
          privacyPermissions: [
            'privacy_reader',
            'privacy_reviewer',
            'privacy_legal_hold',
          ],
        },
      }
    );
    await User.collection.updateMany(
      { _id: { $in: [admin._id, socialOnly._id, passwordUser._id] } },
      {
        $unset: {
          passwordAuthEnabled: '',
        },
      }
    );
    const rightsRequest = await PrivacyRightsRequest.create({
      user: passwordUser._id,
      requestType: 'grievance',
      status: 'submitted',
      source: 'api-web',
      payloadEncrypted: 'v1:migration-payload',
    });
    await PrivacyRightsRequest.collection.updateOne(
      { _id: rightsRequest._id },
      { $unset: { workflowVersion: '' } }
    );

    const transitionIdentityHash = buildConsentTransitionIdentity({
      subjectUser: passwordUser._id,
      action: 'accepted',
      noticeVersion: 'migration-privacy-v1',
    });
    const event = await appendPrivacyEvent({
      eventType: 'privacy_notice_accepted',
      actor: passwordUser._id,
      actorRole: 'user',
      subjectUser: passwordUser._id,
      noticeVersion: 'migration-privacy-v1',
      consentAction: 'accepted',
      source: 'privacy-workflow-migration',
      idempotencyKey: `privacy-consent:${transitionIdentityHash}`,
      clientIdempotencyKey: 'migration-client-key-0001',
      predecessorEventId: null,
      transitionIdentityHash,
    });
    await up();
    await up();

    const [
      storedAdmin,
      storedSocial,
      storedPassword,
      storedUngrantAdmin,
      storedRequest,
      state,
    ] =
      await Promise.all([
        User.findById(admin._id).select('+passwordAuthEnabled').lean(),
        User.findById(socialOnly._id).select('+passwordAuthEnabled').lean(),
        User.findById(passwordUser._id).select('+passwordAuthEnabled').lean(),
        User.findById(ungrantedAdmin._id).lean(),
        PrivacyRightsRequest.findById(rightsRequest._id).lean(),
        PrivacyConsentState.findOne({
          subjectUser: passwordUser._id,
        }).lean(),
      ]);
    expect(storedAdmin).not.toHaveProperty('privacyPermissions');
    expect(storedSocial.passwordAuthEnabled).toBe(false);
    expect(storedPassword.passwordAuthEnabled).toBe(true);
    expect(storedUngrantAdmin).not.toHaveProperty('privacyPermissions');
    expect(await User.collection.countDocuments({
      privacyPermissions: { $exists: true },
    })).toBe(0);
    expect(storedRequest.workflowVersion).toBe(1);
    expect(state).toMatchObject({
      currentEvent: event._id,
      action: 'accepted',
      noticeVersion: 'migration-privacy-v1',
      version: 0,
    });
    expect(await PrivacyConsentState.countDocuments({
      subjectUser: passwordUser._id,
    })).toBe(1);
  });
});
