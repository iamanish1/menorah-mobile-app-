const express = require('express');
const crypto = require('crypto');
const request = require('supertest');
const {
  TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  installCounsellorVerificationTestConfig,
} = require('../../testUtils/counsellorVerification');

installCounsellorVerificationTestConfig();

const mockApplicationSave = jest.fn();
const mockPendingFindOne = jest.fn();
const mockPendingFindById = jest.fn();
const mockUserFindOne = jest.fn();
const mockCounsellorFindOne = jest.fn();
const mockCounsellorFindOneAndUpdate = jest.fn();
const mockRegistrationSession = {
  withTransaction: jest.fn(async (operation) => operation()),
  endSession: jest.fn(async () => undefined),
};
const mockStartSession = jest.fn(async () => mockRegistrationSession);

jest.mock('mongoose', () => ({
  startSession: (...args) => mockStartSession(...args),
}));

jest.mock('../../models/PendingApplication', () => {
  const PendingApplication = jest.fn(function Application(data) {
    Object.assign(this, data);
    this._id = '64f000000000000000000051';
    this.save = (...args) => mockApplicationSave(this, ...args);
  });
  PendingApplication.findOne = (...args) => mockPendingFindOne(...args);
  PendingApplication.findById = (...args) => mockPendingFindById(...args);
  return PendingApplication;
});

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockUserFindOne(...args),
  find: jest.fn(),
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: (...args) => mockCounsellorFindOne(...args),
  findOneAndUpdate: (...args) => mockCounsellorFindOneAndUpdate(...args),
}));

jest.mock('../../models/Booking', () => ({}));
jest.mock('../../config/redis', () => ({ getRedisClient: jest.fn() }));
jest.mock('../../utils/email', () => ({ sendVerificationEmail: jest.fn() }));
jest.mock('../../utils/sms', () => ({ sendSMS: jest.fn() }));

const PendingApplication = require('../../models/PendingApplication');
const counsellorRouter = require('../counsellors');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/counsellors', counsellorRouter);
  return app;
};

const queryResult = (value) => {
  const query = {
    collation: jest.fn(() => query),
    lean: jest.fn(async () => value),
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    session: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const validRegistration = (overrides = {}) => ({
  firstName: 'Test',
  lastName: 'Counsellor',
  email: 'applicant@unit-test.org',
  phone: '+971501234567',
  dateOfBirth: '1990-01-01',
  gender: 'prefer-not-to-say',
  licenseNumber: 'APPLICANT-DECLARED-001',
  specialization: 'Applicant-declared specialty',
  experience: 5,
  bio: 'Applicant-declared biography with enough characters for validation purposes.',
  languages: ['English'],
  hourlyRate: 1000,
  onboardingConsentAccepted: true,
  onboardingConsentVersion: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  ...overrides,
});

const buildRecoveryGraph = ({
  status = 'suspended',
  token = 'a'.repeat(64),
  inviteExpiresAt = new Date(Date.now() + 60 * 60 * 1000),
} = {}) => {
  const user = {
    _id: '64f000000000000000000061',
    role: 'counsellor',
    isActive: false,
  };
  const previousApplication = {
    _id: '64f000000000000000000062',
    status,
    linkedUser: user._id,
    linkedCounsellor: '64f000000000000000000063',
  };
  const counsellor = {
    _id: previousApplication.linkedCounsellor,
    user: user._id,
    status,
    licenseNumber: 'APPLICANT-DECLARED-001',
    professionalVerification: {
      application: previousApplication._id,
      legacyReviewRequired: status === 'draft',
      reverificationInviteTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      reverificationInviteIssuedBy: '64f000000000000000000064',
      reverificationInviteIssuedAt: new Date(Date.now() - 60 * 1000),
      reverificationInviteExpiresAt: inviteExpiresAt,
      reverificationInviteConsentVersion: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
    },
  };
  return { counsellor, previousApplication, token, user };
};

describe('counsellor registration verification boundary', () => {
  beforeEach(() => {
    installCounsellorVerificationTestConfig();
    jest.clearAllMocks();
    mockRegistrationSession.withTransaction.mockImplementation(async (operation) => operation());
    mockUserFindOne.mockImplementation(() => queryResult(null));
    mockCounsellorFindOne.mockImplementation(() => queryResult(null));
    mockCounsellorFindOneAndUpdate.mockImplementation(() => queryResult(null));
    mockPendingFindById.mockImplementation(() => queryResult(null));
    mockPendingFindOne
      .mockReturnValueOnce(queryResult(null))
      .mockReturnValueOnce(queryResult(null));
    mockApplicationSave.mockImplementation(async (application) => application);
  });

  test('publishes only the exact approved registration notice requirements', async () => {
    const response = await request(buildApp())
      .get('/api/counsellors/verification-requirements')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        consentVersion: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
        noticeUrl: process.env.COUNSELLOR_ONBOARDING_NOTICE_URL,
      },
    });
    expect(response.body.data).not.toHaveProperty('credentialPolicyVersion');
  });

  test('fails closed when the approved notice URL is unavailable', async () => {
    delete process.env.COUNSELLOR_ONBOARDING_NOTICE_URL;

    await request(buildApp())
      .get('/api/counsellors/verification-requirements')
      .expect(503);
  });

  test.each([
    ['missing explicit acceptance', { onboardingConsentAccepted: undefined }],
    ['non-boolean acceptance', { onboardingConsentAccepted: 'true' }],
  ])('rejects %s', async (_label, overrides) => {
    await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration(overrides))
      .expect(400);

    expect(PendingApplication).not.toHaveBeenCalled();
  });

  test('rejects a stale or forged notice version before writing', async () => {
    const response = await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ onboardingConsentVersion: 'stale-notice-version' }))
      .expect(422);

    expect(response.body.message).toMatch(/missing or no longer current/i);
    expect(response.body.code).toBe('COUNSELLOR_ONBOARDING_CONSENT_STALE');
    expect(PendingApplication).not.toHaveBeenCalled();
  });

  test('retains a submitted application with server-stamped consent evidence', async () => {
    const response = await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration())
      .expect(201);

    expect(PendingApplication).toHaveBeenCalledTimes(1);
    const stored = PendingApplication.mock.calls[0][0];
    expect(stored).toEqual(expect.objectContaining({
      status: 'submitted',
      onboardingConsent: {
        accepted: true,
        version: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
        acceptedAt: expect.any(Date),
        source: 'counsellor_web_registration',
      },
      supersedesApplication: null,
      statusHistory: [expect.objectContaining({
        from: 'draft',
        to: 'submitted',
        actorType: 'applicant',
      })],
    }));
    expect(response.body.data).toEqual(expect.objectContaining({
      applicationId: '64f000000000000000000051',
      status: 'submitted',
      statusTicket: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(PendingApplication.deleteOne).toBeUndefined();
  });

  test('retains the prior rejection as the superseded audit record', async () => {
    const rejectedId = '64f000000000000000000052';
    mockPendingFindOne
      .mockReset()
      .mockReturnValueOnce(queryResult(null))
      .mockReturnValueOnce(queryResult({ _id: rejectedId }));

    await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration())
      .expect(201);

    expect(PendingApplication.mock.calls[0][0].supersedesApplication).toBe(rejectedId);
  });

  test('does not create a second active application for the same identity', async () => {
    mockPendingFindOne.mockReset().mockReturnValueOnce(queryResult({
      _id: '64f000000000000000000053',
      status: 'under_review',
    }));

    await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration())
      .expect(409);

    expect(PendingApplication).not.toHaveBeenCalled();
  });

  test('redeems a bound invitation and stores its audit snapshot with the application', async () => {
    const { counsellor, previousApplication, token, user } = buildRecoveryGraph();
    mockUserFindOne.mockImplementation(() => queryResult(user));
    mockCounsellorFindOne.mockImplementation(() => queryResult(counsellor));
    mockPendingFindOne.mockReset().mockImplementation((filter) => (
      queryResult(filter._id ? previousApplication : null)
    ));
    mockCounsellorFindOneAndUpdate.mockImplementation(() => queryResult(counsellor));

    const response = await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ reverificationToken: token }))
      .expect(201);

    expect(mockCounsellorFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const [redemptionFilter, redemptionUpdate, redemptionOptions] =
      mockCounsellorFindOneAndUpdate.mock.calls[0];
    expect(redemptionFilter).toEqual(expect.objectContaining({
      _id: counsellor._id,
      user: user._id,
      status: 'suspended',
      licenseNumber: counsellor.licenseNumber,
      'professionalVerification.reverificationInviteTokenHash':
        crypto.createHash('sha256').update(token).digest('hex'),
      'professionalVerification.reverificationInviteConsentVersion':
        TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
    }));
    expect(redemptionUpdate.$unset).toEqual(expect.objectContaining({
      'professionalVerification.reverificationInviteTokenHash': '',
      'professionalVerification.reverificationInviteExpiresAt': '',
    }));
    expect(redemptionOptions).toEqual(expect.objectContaining({
      new: false,
      session: mockRegistrationSession,
    }));
    expect(mockCounsellorFindOne.mock.results[0].value.collation).toHaveBeenCalledWith({
      locale: 'en',
      strength: 2,
      normalization: true,
    });
    expect(mockPendingFindOne.mock.results[0].value.collation).toHaveBeenCalledWith({
      locale: 'en',
      strength: 2,
      normalization: true,
    });
    expect(mockPendingFindOne.mock.results[1].value.collation).toHaveBeenCalledWith({
      locale: 'en',
      strength: 2,
      normalization: true,
    });
    expect(mockCounsellorFindOneAndUpdate.mock.results[0].value.collation)
      .toHaveBeenCalledWith({
        locale: 'en',
        strength: 2,
        normalization: true,
      });

    const stored = PendingApplication.mock.calls[0][0];
    expect(stored).toEqual(expect.objectContaining({
      linkedUser: user._id,
      linkedCounsellor: counsellor._id,
      supersedesApplication: previousApplication._id,
      onboardingConsent: expect.objectContaining({
        source: 'counsellor_web_reverification',
      }),
      reverificationAuthorization: {
        tokenHash: counsellor.professionalVerification.reverificationInviteTokenHash,
        issuedBy: counsellor.professionalVerification.reverificationInviteIssuedBy,
        issuedAt: counsellor.professionalVerification.reverificationInviteIssuedAt,
        expiresAt: counsellor.professionalVerification.reverificationInviteExpiresAt,
        consentVersion: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
        redeemedAt: expect.any(Date),
      },
    }));
    expect(mockApplicationSave).toHaveBeenCalledWith(
      expect.anything(),
      { session: mockRegistrationSession }
    );
    expect(response.body.data).not.toHaveProperty('reverificationAuthorization');
    expect(response.body.data).not.toHaveProperty('reverificationToken');
  });

  test('treats a case-only recovery license variant as one identity without rewriting applicant input', async () => {
    const { counsellor, previousApplication, token, user } = buildRecoveryGraph();
    const applicantIssuedLicense = counsellor.licenseNumber.toLowerCase();
    mockUserFindOne.mockImplementation(() => queryResult(user));
    mockCounsellorFindOne.mockImplementation(() => queryResult(counsellor));
    mockPendingFindOne.mockReset().mockImplementation((filter) => (
      queryResult(filter._id ? previousApplication : null)
    ));
    mockCounsellorFindOneAndUpdate.mockImplementation(() => queryResult(counsellor));

    await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({
        licenseNumber: applicantIssuedLicense,
        reverificationToken: token,
      }))
      .expect(201);

    expect(mockCounsellorFindOne).toHaveBeenNthCalledWith(1, {
      licenseNumber: applicantIssuedLicense,
    });
    expect(mockPendingFindOne).toHaveBeenCalledWith({
      _id: previousApplication._id,
      licenseNumber: applicantIssuedLicense,
    });
    expect(mockCounsellorFindOneAndUpdate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ licenseNumber: applicantIssuedLicense })
    );
    expect(PendingApplication.mock.calls[0][0].licenseNumber)
      .toBe(applicantIssuedLicense);
  });

  test('rejects an invalid, expired, or replayed invitation without creating an application', async () => {
    const { counsellor, previousApplication, token, user } = buildRecoveryGraph();
    mockUserFindOne.mockImplementation(() => queryResult(user));
    mockCounsellorFindOne.mockImplementation(() => queryResult(counsellor));
    mockPendingFindOne.mockReset().mockImplementation((filter) => (
      queryResult(filter._id ? previousApplication : null)
    ));
    mockCounsellorFindOneAndUpdate.mockImplementation(() => queryResult(null));

    const response = await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ reverificationToken: token }))
      .expect(409);

    expect(response.body.message).toMatch(/cannot be accepted/i);
    expect(response.body.code).toBe('REVERIFICATION_AUTHORIZATION_INVALID');
    expect(PendingApplication).not.toHaveBeenCalled();
    expect(mockApplicationSave).not.toHaveBeenCalled();
  });

  test('allows a re-verification invitation to be redeemed only once', async () => {
    const { counsellor, previousApplication, token, user } = buildRecoveryGraph();
    mockUserFindOne.mockImplementation(() => queryResult(user));
    mockCounsellorFindOne.mockImplementation(() => queryResult(counsellor));
    mockPendingFindOne.mockReset().mockImplementation((filter) => (
      queryResult(filter._id ? previousApplication : null)
    ));
    let redemptionAttempt = 0;
    mockCounsellorFindOneAndUpdate.mockImplementation(() => {
      redemptionAttempt += 1;
      return queryResult(redemptionAttempt === 1 ? counsellor : null);
    });

    await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ reverificationToken: token }))
      .expect(201);
    const replayResponse = await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ reverificationToken: token }))
      .expect(409);

    expect(mockCounsellorFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockApplicationSave).toHaveBeenCalledTimes(1);
    expect(replayResponse.body.code).toBe('REVERIFICATION_AUTHORIZATION_INVALID');
  });

  test('accepts a bound invitation for a fail-closed migrated profile without inventing history', async () => {
    const { counsellor, token, user } = buildRecoveryGraph();
    counsellor.professionalVerification.application = null;
    counsellor.professionalVerification.legacyReviewRequired = true;
    counsellor.professionalVerification.migrationVersion =
      '20260723-professional-verification-v1';
    mockUserFindOne.mockImplementation(() => queryResult(user));
    mockCounsellorFindOne.mockImplementation(() => queryResult(counsellor));
    mockPendingFindOne.mockReset()
      .mockReturnValueOnce(queryResult(null))
      .mockReturnValueOnce(queryResult(null));
    mockCounsellorFindOneAndUpdate.mockImplementation(() => queryResult(counsellor));

    await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ reverificationToken: token }))
      .expect(201);

    expect(mockPendingFindById).not.toHaveBeenCalled();
    expect(mockCounsellorFindOneAndUpdate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        _id: counsellor._id,
        'professionalVerification.legacyReviewRequired': true,
        'professionalVerification.migrationVersion':
          '20260723-professional-verification-v1',
      })
    );
    expect(PendingApplication.mock.calls[0][0]).toEqual(expect.objectContaining({
      linkedUser: user._id,
      linkedCounsellor: counsellor._id,
      supersedesApplication: null,
      legacyReviewRequired: false,
    }));
  });

  test('rejects a re-verification token when no canonical inactive profile exists', async () => {
    const response = await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ reverificationToken: 'b'.repeat(64) }))
      .expect(409);

    expect(response.body.code).toBe('REVERIFICATION_AUTHORIZATION_INVALID');
    expect(mockCounsellorFindOneAndUpdate).not.toHaveBeenCalled();
    expect(PendingApplication).not.toHaveBeenCalled();
  });

  test('keeps invitation redemption and application persistence in one transaction', async () => {
    const { counsellor, previousApplication, token, user } = buildRecoveryGraph();
    mockUserFindOne.mockImplementation(() => queryResult(user));
    mockCounsellorFindOne.mockImplementation(() => queryResult(counsellor));
    mockPendingFindOne.mockReset().mockImplementation((filter) => (
      queryResult(filter._id ? previousApplication : null)
    ));
    mockCounsellorFindOneAndUpdate.mockImplementation(() => queryResult(counsellor));
    mockApplicationSave.mockRejectedValueOnce(new Error('simulated application write failure'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration({ reverificationToken: token }))
      .expect(500);

    expect(mockRegistrationSession.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      }
    );
    expect(mockCounsellorFindOneAndUpdate.mock.calls[0][2].session)
      .toBe(mockRegistrationSession);
    expect(mockApplicationSave).toHaveBeenCalledWith(
      expect.anything(),
      { session: mockRegistrationSession }
    );
    expect(mockRegistrationSession.endSession).toHaveBeenCalled();
    console.error.mockRestore();
  });

  test('maps the unique current-application index race to a conflict', async () => {
    const duplicateError = Object.assign(new Error('duplicate current application'), {
      code: 11000,
    });
    mockApplicationSave.mockRejectedValueOnce(duplicateError);

    const response = await request(buildApp())
      .post('/api/counsellors/register')
      .send(validRegistration())
      .expect(409);

    expect(response.body.code).toBe('COUNSELLOR_APPLICATION_ALREADY_ACTIVE');
    expect(mockRegistrationSession.endSession).toHaveBeenCalled();
  });
});
