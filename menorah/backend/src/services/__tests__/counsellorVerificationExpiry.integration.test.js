const mongoose = require('mongoose');
const Counsellor = require('../../models/Counsellor');
const PendingApplication = require('../../models/PendingApplication');
const User = require('../../models/User');
const {
  createCounsellorVerificationExpiryReconciler,
} = require('../counsellorVerificationExpiry');
const {
  expire,
} = require('../counsellorVerificationService');

const BASE_TEST_URI = process.env.KYC_MIGRATION_TEST_URI;
const describeWithMongo = BASE_TEST_URI ? describe : describe.skip;

jest.setTimeout(90000);

const buildDisposableSuiteUri = (baseUri) => {
  const parsed = new URL(baseUri);
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!/^menorah_kyc_migration_test(?:_|$)/.test(databaseName)) {
    throw new Error(
      'KYC_MIGRATION_TEST_URI must name a disposable '
      + 'menorah_kyc_migration_test* database.'
    );
  }
  parsed.pathname = `/menorah_kyc_migration_test_expiry_${process.pid}`;
  return parsed.toString();
};

const seedDueApproval = async () => {
  const now = new Date();
  const userId = new mongoose.Types.ObjectId();
  const counsellorId = new mongoose.Types.ObjectId();
  const applicationId = new mongoose.Types.ObjectId();
  const reviewerId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const approvedAt = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const expiresAt = new Date(now.getTime() - 1000);

  await User.collection.insertOne({
    _id: userId,
    email: 'expiry-integration@example.org',
    phone: '+971501111111',
    password: '$2b$12$.....................................................',
    firstName: 'Expiry',
    lastName: 'Integration',
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    gender: 'prefer-not-to-say',
    role: 'counsellor',
    isActive: true,
    sessionVersion: 7,
    marketplaceAssignmentFence: 0,
    createdAt: approvedAt,
    updatedAt: approvedAt,
  });
  await PendingApplication.collection.insertOne({
    _id: applicationId,
    firstName: 'Expiry',
    lastName: 'Integration',
    email: 'expiry-integration@example.org',
    phone: '+971501111111',
    licenseNumber: 'EXPIRY-INTEGRATION-LICENSE',
    status: 'approved',
    linkedUser: userId,
    linkedCounsellor: counsellorId,
    legacyReviewRequired: false,
    lifecycleSchemaVersion: 1,
    verificationExpiresAt: expiresAt,
    statusHistory: [],
    createdAt: approvedAt,
    updatedAt: approvedAt,
  });
  await Counsellor.collection.insertOne({
    _id: counsellorId,
    user: userId,
    licenseNumber: 'EXPIRY-INTEGRATION-LICENSE',
    specialization: 'Integration testing',
    specializations: ['Integration testing'],
    experience: 8,
    bio: 'A production-shaped profile used for transaction expiry testing.',
    languages: ['English'],
    hourlyRate: 1000,
    currency: 'INR',
    status: 'approved',
    isVerified: true,
    isActive: true,
    isAvailable: true,
    professionalVerification: {
      application: applicationId,
      onboardingConsent: {
        accepted: true,
        version: 'integration-consent-v1',
        acceptedAt: approvedAt,
        source: 'counsellor_web_registration',
      },
      credentialReview: {
        decision: 'approved',
        policyVersion: 'integration-policy-v1',
        evidenceIds: [evidenceId],
        reviewedBy: reviewerId,
        reviewedAt: approvedAt,
      },
      approvedBy: reviewerId,
      approvedAt,
      expiresAt,
      legacyReviewRequired: false,
      schemaVersion: 1,
      marketplaceAssignmentFence: 0,
      statusHistory: [],
    },
    createdAt: approvedAt,
    updatedAt: approvedAt,
  });

  return {
    applicationId,
    counsellorId,
    expiresAt,
    userId,
  };
};

describeWithMongo(
  'professional-verification expiry transactions on isolated MongoDB',
  () => {
    let suiteUri;

    beforeAll(async () => {
      suiteUri = buildDisposableSuiteUri(BASE_TEST_URI);
      await mongoose.connect(suiteUri, {
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 10000,
      });

      const admin = mongoose.connection.db.admin();
      const [buildInfo, hello] = await Promise.all([
        admin.command({ buildInfo: 1 }),
        admin.command({ hello: 1 }),
      ]);
      if (Number(buildInfo.versionArray?.[0]) !== 7) {
        throw new Error(
          `KYC expiry integration tests require MongoDB 7; received ${buildInfo.version}.`
        );
      }
      if (typeof hello.setName !== 'string' || hello.setName.length === 0) {
        throw new Error(
          'KYC expiry integration tests require a MongoDB replica set.'
        );
      }
      await mongoose.connection.dropDatabase();
    });

    beforeEach(async () => {
      await Promise.all([
        User.collection.deleteMany({}),
        Counsellor.collection.deleteMany({}),
        PendingApplication.collection.deleteMany({}),
      ]);
    });

    afterAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        try {
          await mongoose.connection.dropDatabase();
        } finally {
          await mongoose.disconnect();
        }
      }
    });

    test('concurrent instances expire once and atomically revoke the linked graph', async () => {
      const graph = await seedDueApproval();
      const reconciler = createCounsellorVerificationExpiryReconciler({
        expireVerification: expire,
      });
      const now = new Date(graph.expiresAt.getTime() + 2000);

      const outcomes = await Promise.all([
        reconciler.reconcileOne({ counsellorId: graph.counsellorId, now }),
        reconciler.reconcileOne({ counsellorId: graph.counsellorId, now }),
      ]);

      expect(outcomes.filter(({ outcome }) => outcome === 'expired'))
        .toHaveLength(1);
      expect(outcomes.map(({ outcome }) => outcome)).toEqual(
        expect.arrayContaining([
          'expired',
          expect.stringMatching(/^(already_reconciled|not_due)$/),
        ])
      );

      const [counsellor, user, application] = await Promise.all([
        Counsellor.findById(graph.counsellorId).lean(),
        User.findById(graph.userId)
          .select('+lastSessionRevokedAt')
          .lean(),
        PendingApplication.findById(graph.applicationId).lean(),
      ]);
      expect(counsellor).toEqual(expect.objectContaining({
        status: 'expired',
        isVerified: false,
        isActive: false,
        isAvailable: false,
      }));
      expect(counsellor.professionalVerification.expiredAt).toEqual(now);
      expect(counsellor.professionalVerification.statusHistory).toEqual([
        expect.objectContaining({
          from: 'approved',
          to: 'expired',
          actorType: 'system',
          actor: null,
          reason: 'verification_expired',
        }),
      ]);
      expect(user).toEqual(expect.objectContaining({
        isActive: false,
        sessionVersion: 8,
        lastSessionRevokedAt: expect.any(Date),
      }));
      expect(application.status).toBe('expired');
      expect(application.statusHistory).toEqual([
        expect.objectContaining({
          from: 'approved',
          to: 'expired',
          actorType: 'system',
          actor: null,
          reason: 'verification_expired',
        }),
      ]);

      await expect(reconciler.reconcileBatch({ now })).resolves.toEqual({
        scanned: 0,
        expired: 0,
        alreadyReconciled: 0,
        failed: 0,
        failures: [],
      });
    });
  }
);
