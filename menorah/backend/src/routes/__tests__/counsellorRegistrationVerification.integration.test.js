const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const {
  TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  installCounsellorVerificationTestConfig,
} = require('../../testUtils/counsellorVerification');
const {
  up: migrateProfessionalVerification,
} = require('../../database/migrations/20260723-professional-verification-state-machine');

installCounsellorVerificationTestConfig();

const Counsellor = require('../../models/Counsellor');
const PendingApplication = require('../../models/PendingApplication');
const User = require('../../models/User');
const counsellorRouter = require('../counsellors');

const BASE_TEST_URI = process.env.KYC_MIGRATION_TEST_URI;
const describeWithMongo = BASE_TEST_URI ? describe : describe.skip;
const INDEX_NAMES = Object.freeze([
  'current_application_email_unique_v1',
  'current_application_license_unique_v1',
]);

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

  parsed.pathname = `/menorah_kyc_migration_test_reg_${process.pid}`;
  return parsed.toString();
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/counsellors', counsellorRouter);
  return app;
};

const validRegistration = (overrides = {}) => ({
  firstName: 'Integration',
  lastName: 'Counsellor',
  email: 'counsellor-registration-integration@example.org',
  phone: '+971501234567',
  dateOfBirth: '1990-01-01',
  gender: 'prefer-not-to-say',
  licenseNumber: 'INTEGRATION-LICENSE-001',
  specialization: 'Integration testing',
  experience: 8,
  bio: 'A deliberately long applicant biography used by the registration integration suite.',
  languages: ['English'],
  hourlyRate: 1000,
  currency: 'INR',
  onboardingConsentAccepted: true,
  onboardingConsentVersion: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  ...overrides,
});

const seedReverificationGraph = async ({
  email = 'counsellor-registration-integration@example.org',
  phone = '+971501234567',
  licenseNumber = 'INTEGRATION-LICENSE-001',
  token = crypto.randomBytes(32).toString('hex'),
} = {}) => {
  const userId = new mongoose.Types.ObjectId();
  const counsellorId = new mongoose.Types.ObjectId();
  const previousApplicationId = new mongoose.Types.ObjectId();
  const issuingAdminId = new mongoose.Types.ObjectId();
  const issuedAt = new Date(Date.now() - (5 * 60 * 1000));
  const expiresAt = new Date(Date.now() + (60 * 60 * 1000));
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const timestamps = {
    createdAt: new Date(issuedAt),
    updatedAt: new Date(issuedAt),
  };

  await User.collection.insertOne({
    _id: userId,
    email,
    phone,
    password: 'not-used-by-this-integration-test',
    firstName: 'Existing',
    lastName: 'Counsellor',
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    gender: 'prefer-not-to-say',
    role: 'counsellor',
    isActive: false,
    sessionVersion: 1,
    ...timestamps,
  });
  await PendingApplication.collection.insertOne({
    _id: previousApplicationId,
    firstName: 'Existing',
    lastName: 'Counsellor',
    email,
    phone,
    licenseNumber,
    status: 'suspended',
    linkedUser: userId,
    linkedCounsellor: counsellorId,
    legacyReviewRequired: false,
    lifecycleSchemaVersion: 1,
    statusHistory: [],
    ...timestamps,
  });
  await Counsellor.collection.insertOne({
    _id: counsellorId,
    user: userId,
    licenseNumber,
    specialization: 'Integration testing',
    specializations: ['Integration testing'],
    experience: 8,
    bio: 'An existing inactive counsellor profile retained for re-verification testing.',
    languages: ['English'],
    hourlyRate: 1000,
    currency: 'INR',
    status: 'suspended',
    isVerified: false,
    isActive: false,
    isAvailable: false,
    professionalVerification: {
      application: previousApplicationId,
      schemaVersion: 1,
      legacyReviewRequired: false,
      reverificationInviteTokenHash: tokenHash,
      reverificationInviteIssuedBy: issuingAdminId,
      reverificationInviteIssuedAt: issuedAt,
      reverificationInviteExpiresAt: expiresAt,
      reverificationInviteConsentVersion:
        TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      statusHistory: [],
    },
    ...timestamps,
  });

  return {
    counsellorId,
    email,
    expiresAt,
    issuedAt,
    issuingAdminId,
    licenseNumber,
    phone,
    previousApplicationId,
    token,
    tokenHash,
    userId,
  };
};

const readCounsellor = (counsellorId) => (
  Counsellor.collection.findOne({ _id: counsellorId })
);

const submittedApplications = (email) => (
  PendingApplication.collection.find({ email, status: 'submitted' }).toArray()
);

describeWithMongo(
  'public counsellor registration transactions on MongoDB 7 replica set',
  () => {
    let app;
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
          `KYC registration integration tests require MongoDB 7; received ${buildInfo.version}.`
        );
      }
      if (typeof hello.setName !== 'string' || hello.setName.length === 0) {
        throw new Error(
          'KYC registration integration tests require a MongoDB replica set.'
        );
      }

      await mongoose.connection.dropDatabase();
      await migrateProfessionalVerification({ mongoose });
      app = buildApp();
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

    test('atomically retains a submitted re-verification application and consumes its bound invitation once', async () => {
      const graph = await seedReverificationGraph();
      const applicantIssuedLicense = graph.licenseNumber.toLowerCase();
      const payload = validRegistration({
        email: graph.email,
        phone: graph.phone,
        licenseNumber: applicantIssuedLicense,
        reverificationToken: graph.token,
      });

      const firstResponse = await request(app)
        .post('/api/counsellors/register')
        .send(payload)
        .expect(201);

      const applicationsAfterFirstRequest = await PendingApplication.collection
        .find({ email: graph.email })
        .sort({ createdAt: 1 })
        .toArray();
      expect(applicationsAfterFirstRequest).toHaveLength(2);
      expect(applicationsAfterFirstRequest[0]).toEqual(expect.objectContaining({
        _id: graph.previousApplicationId,
        status: 'suspended',
      }));

      const submitted = applicationsAfterFirstRequest[1];
      expect(submitted).toEqual(expect.objectContaining({
        licenseNumber: applicantIssuedLicense,
        status: 'submitted',
        linkedUser: graph.userId,
        linkedCounsellor: graph.counsellorId,
        supersedesApplication: graph.previousApplicationId,
        legacyReviewRequired: false,
        onboardingConsent: expect.objectContaining({
          accepted: true,
          version: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
          source: 'counsellor_web_reverification',
        }),
        reverificationAuthorization: expect.objectContaining({
          tokenHash: graph.tokenHash,
          issuedBy: graph.issuingAdminId,
          issuedAt: graph.issuedAt,
          expiresAt: graph.expiresAt,
          consentVersion: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
        }),
      }));
      expect(submitted.statusLookupTokenHash).toBe(
        crypto.createHash('sha256')
          .update(firstResponse.body.data.statusTicket)
          .digest('hex')
      );
      const applicationWithDefaultProjection = await PendingApplication.findById(
        submitted._id
      );
      expect(applicationWithDefaultProjection.reverificationAuthorization)
        .toBeUndefined();
      const applicationWithAuthorization = await PendingApplication
        .findById(submitted._id)
        .select(
          '+reverificationAuthorization '
          + '+reverificationAuthorization.tokenHash'
        );
      expect(applicationWithAuthorization.reverificationAuthorization.tokenHash)
        .toBe(graph.tokenHash);

      const counsellorAfterFirstRequest = await readCounsellor(graph.counsellorId);
      [
        'reverificationInviteTokenHash',
        'reverificationInviteIssuedBy',
        'reverificationInviteIssuedAt',
        'reverificationInviteExpiresAt',
        'reverificationInviteConsentVersion',
      ].forEach((field) => {
        expect(counsellorAfterFirstRequest.professionalVerification)
          .not.toHaveProperty(field);
      });

      const replayResponse = await request(app)
        .post('/api/counsellors/register')
        .send(payload)
        .expect(409);

      expect(replayResponse.body.code).toBe(
        'COUNSELLOR_APPLICATION_ALREADY_ACTIVE'
      );
      expect(await submittedApplications(graph.email)).toHaveLength(1);
      expect(await PendingApplication.collection.countDocuments({
        _id: graph.previousApplicationId,
        status: 'suspended',
      })).toBe(1);
    });

    test('rolls invitation consumption back when the application write fails', async () => {
      const graph = await seedReverificationGraph();
      const payload = validRegistration({
        email: graph.email,
        phone: graph.phone,
        licenseNumber: graph.licenseNumber,
        reverificationToken: graph.token,
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const saveSpy = jest.spyOn(PendingApplication.prototype, 'save')
        .mockRejectedValueOnce(new Error('forced application write failure'));

      try {
        await request(app)
          .post('/api/counsellors/register')
          .send(payload)
          .expect(500);
      } finally {
        saveSpy.mockRestore();
        errorSpy.mockRestore();
      }

      expect(await submittedApplications(graph.email)).toHaveLength(0);
      expect(await PendingApplication.collection.countDocuments({
        _id: graph.previousApplicationId,
        status: 'suspended',
      })).toBe(1);
      const counsellorAfterFailure = await readCounsellor(graph.counsellorId);
      expect(counsellorAfterFailure.professionalVerification).toEqual(
        expect.objectContaining({
          reverificationInviteTokenHash: graph.tokenHash,
          reverificationInviteIssuedBy: graph.issuingAdminId,
          reverificationInviteIssuedAt: graph.issuedAt,
          reverificationInviteExpiresAt: graph.expiresAt,
          reverificationInviteConsentVersion:
            TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
        })
      );

      await request(app)
        .post('/api/counsellors/register')
        .send(payload)
        .expect(201);

      expect(await submittedApplications(graph.email)).toHaveLength(1);
      const counsellorAfterRetry = await readCounsellor(graph.counsellorId);
      expect(counsellorAfterRetry.professionalVerification)
        .not.toHaveProperty('reverificationInviteTokenHash');
    });

    test('migration-owned counsellor index rejects a case-only duplicate identity', async () => {
      const graph = await seedReverificationGraph({
        licenseNumber: 'INTEGRATION-CASE-IDENTITY',
      });
      const indexes = await Counsellor.collection.indexes();

      expect(indexes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'licenseNumber_1',
          key: { licenseNumber: 1 },
          unique: true,
        }),
        expect.objectContaining({
          name: 'counsellor_license_identity_unique_v1',
          key: { licenseNumber: 1 },
          unique: true,
          collation: expect.objectContaining({
            locale: 'en',
            strength: 2,
            normalization: true,
          }),
        }),
      ]));

      await expect(Counsellor.collection.insertOne({
        _id: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        licenseNumber: graph.licenseNumber.toLowerCase(),
        status: 'draft',
        isVerified: false,
        isActive: false,
        isAvailable: false,
      })).rejects.toMatchObject({ code: 11000 });
    });

    test('migration-owned unique indexes admit only one concurrent initial application', async () => {
      const indexes = await PendingApplication.collection.indexes();
      INDEX_NAMES.forEach((name) => {
        expect(indexes).toContainEqual(expect.objectContaining({
          name,
          unique: true,
        }));
      });

      const payload = validRegistration({
        email: 'concurrent-registration@example.org',
        phone: '+971501234568',
        licenseNumber: 'INTEGRATION-LICENSE-CONCURRENT',
      });
      const responses = await Promise.all([
        request(app).post('/api/counsellors/register').send(payload),
        request(app).post('/api/counsellors/register').send(payload),
      ]);
      const responsesByStatus = [...responses].sort(
        (left, right) => left.status - right.status
      );

      expect(responsesByStatus.map(({ status }) => status)).toEqual([201, 409]);
      expect(responsesByStatus[1].body.code).toBe(
        'COUNSELLOR_APPLICATION_ALREADY_ACTIVE'
      );
      expect(await submittedApplications(payload.email)).toHaveLength(1);
    });
  }
);
