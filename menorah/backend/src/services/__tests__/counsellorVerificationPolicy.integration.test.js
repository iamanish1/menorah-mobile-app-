const { Mongoose, Types } = require('mongoose');
const {
  buildProfessionallyApprovedCounsellorQuery,
  isCounsellorProfessionallyApproved,
} = require('../counsellorVerificationPolicy');

const TEST_URI = process.env.KYC_MIGRATION_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;
const NOW = new Date('2026-07-23T12:00:00.000Z');
const ACCOUNT_ID = new Types.ObjectId('66f000000000000000000001');
const REVIEWER_ID = new Types.ObjectId('66f000000000000000000002');
const APPLICATION_ID = new Types.ObjectId('66f000000000000000000003');
const EVIDENCE_ID = new Types.ObjectId('66f000000000000000000004');
const CONFIG = Object.freeze({
  configured: false,
  verificationConfigured: true,
  registrationConfigured: false,
  onboardingConsentVersion: 'counsellor-onboarding-v1-2026-07-23',
  credentialPolicyVersion: 'credential-review-v1-2026-07-23',
  onboardingNoticeUrl: null,
});

const makeApprovedCounsellor = (_id, overrides = {}) => ({
  _id,
  user: ACCOUNT_ID,
  status: 'approved',
  isActive: true,
  isAvailable: true,
  professionalVerification: {
    schemaVersion: 1,
    application: APPLICATION_ID,
    legacyReviewRequired: false,
    onboardingConsent: {
      accepted: true,
      version: CONFIG.onboardingConsentVersion,
      acceptedAt: new Date('2026-07-20T08:00:00.000Z'),
      source: 'counsellor_web_registration',
    },
    credentialReview: {
      decision: 'approved',
      policyVersion: CONFIG.credentialPolicyVersion,
      evidenceIds: [EVIDENCE_ID],
      reviewedBy: REVIEWER_ID,
      reviewedAt: new Date('2026-07-21T08:00:00.000Z'),
    },
    approvedBy: REVIEWER_ID,
    approvedAt: new Date('2026-07-21T09:00:00.000Z'),
    expiresAt: new Date('2027-07-23T12:00:00.000Z'),
  },
  ...overrides,
});

describeWithMongo('professional-verification predicate/query parity on isolated MongoDB', () => {
  let isolatedMongoose;
  let collection;

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_kyc_migration_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'KYC_MIGRATION_TEST_URI must name a disposable '
        + 'menorah_kyc_migration_test* database.'
      );
    }

    isolatedMongoose = new Mongoose();
    await isolatedMongoose.connect(TEST_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    collection = isolatedMongoose.connection.db.collection(
      'policyparitycounsellors'
    );
  });

  beforeEach(async () => {
    await collection.deleteMany({});
  });

  afterAll(async () => {
    if (isolatedMongoose) {
      await collection.drop().catch((error) => {
        if (error?.codeName !== 'NamespaceNotFound') throw error;
      });
      await isolatedMongoose.disconnect();
    }
  });

  test('database candidates and the in-memory predicate agree on stored approval gates', async () => {
    const valid = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000010')
    );
    const duplicateEvidence = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000011')
    );
    duplicateEvidence.professionalVerification.credentialReview.evidenceIds = [
      EVIDENCE_ID,
      EVIDENCE_ID,
    ];
    const expired = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000012')
    );
    expired.professionalVerification.expiresAt = new Date(NOW);
    const legacyFlagMissing = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000013')
    );
    delete legacyFlagMissing.professionalVerification.legacyReviewRequired;
    const applicationMissing = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000014')
    );
    delete applicationMissing.professionalVerification.application;
    const arrayStatus = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000015'),
      { status: ['approved'] }
    );
    const arrayActive = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000016'),
      { isActive: [true] }
    );
    const arrayUser = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000017'),
      { user: [ACCOUNT_ID] }
    );
    const arraySchemaVersion = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000018')
    );
    arraySchemaVersion.professionalVerification.schemaVersion = [1];
    const arrayApplication = makeApprovedCounsellor(
      new Types.ObjectId('66f000000000000000000019')
    );
    arrayApplication.professionalVerification.application = [APPLICATION_ID];
    const candidates = [
      valid,
      duplicateEvidence,
      expired,
      legacyFlagMissing,
      applicationMissing,
      arrayStatus,
      arrayActive,
      arrayUser,
      arraySchemaVersion,
      arrayApplication,
    ];
    await collection.insertMany(candidates);

    const queryMatches = await collection.find(
      buildProfessionallyApprovedCounsellorQuery({
        now: NOW,
        config: CONFIG,
        requireAvailability: true,
      }),
      { projection: { _id: 1 } }
    ).toArray();
    const predicateMatches = candidates.filter((counsellor) => (
      isCounsellorProfessionallyApproved(counsellor, {
        now: NOW,
        config: CONFIG,
        requireAvailability: true,
        account: {
          _id: ACCOUNT_ID,
          role: 'counsellor',
          isActive: true,
        },
      })
    ));

    expect(queryMatches.map(({ _id }) => _id.toHexString())).toEqual([
      valid._id.toHexString(),
    ]);
    expect(predicateMatches.map(({ _id }) => _id.toHexString())).toEqual([
      valid._id.toHexString(),
    ]);
  });
});
