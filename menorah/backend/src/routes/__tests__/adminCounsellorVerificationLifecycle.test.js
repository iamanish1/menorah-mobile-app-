const express = require('express');
const request = require('supertest');

const mockRedisGet = jest.fn();
const mockUserFindById = jest.fn();
const mockVerifyAdminToken = jest.fn();
const mockStartReview = jest.fn();
const mockApprove = jest.fn();
const mockReject = jest.fn();
const mockSuspend = jest.fn();
const mockExpire = jest.fn();
const mockIssueReverificationInvitation = jest.fn();
const mockSendApprovalEmail = jest.fn();
const mockSendReverificationEmail = jest.fn();
const mockInvalidateCounsellorDiscoveryCache = jest.fn();
const mockReconcileExpiryBatch = jest.fn();
const mockReconcileExpiryOne = jest.fn();
const mockCounsellorFind = jest.fn();
const mockCounsellorFindById = jest.fn();
const mockCounsellorCountDocuments = jest.fn();
const mockBookingAggregate = jest.fn();

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({ get: mockRedisGet }),
}));

jest.mock('../../config/webSessions', () => ({
  clearSessionCookie: jest.fn(),
  getCookieToken: jest.fn(),
  getWebSessionForRequest: jest.fn(() => null),
}));

jest.mock('../../utils/authTokens', () => ({
  verifyAdminToken: (...args) => mockVerifyAdminToken(...args),
  verifyUserToken: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  findById: (...args) => mockUserFindById(...args),
}));
jest.mock('../../models/Counsellor', () => ({
  find: (...args) => mockCounsellorFind(...args),
  findById: (...args) => mockCounsellorFindById(...args),
  countDocuments: (...args) => mockCounsellorCountDocuments(...args),
}));
jest.mock('../../models/Booking', () => ({
  aggregate: (...args) => mockBookingAggregate(...args),
}));

jest.mock('../../services/counsellorVerificationService', () => ({
  CounsellorVerificationError: class CounsellorVerificationError extends Error {},
  approve: (...args) => mockApprove(...args),
  expire: (...args) => mockExpire(...args),
  issueReverificationInvitation: (...args) => mockIssueReverificationInvitation(...args),
  prepareCounsellorActivation: jest.fn(),
  reject: (...args) => mockReject(...args),
  startReview: (...args) => mockStartReview(...args),
  suspend: (...args) => mockSuspend(...args),
}));

jest.mock('../../services/counsellorDiscoveryCache', () => ({
  invalidateCounsellorDiscoveryCache: (...args) =>
    mockInvalidateCounsellorDiscoveryCache(...args),
}));
jest.mock('../../services/counsellorVerificationExpiry', () => ({
  evaluateAccountAccess: jest.fn(async () => ({ allowed: true })),
  reconcileBatch: (...args) => mockReconcileExpiryBatch(...args),
  reconcileOne: (...args) => mockReconcileExpiryOne(...args),
}));

jest.mock('../../utils/email', () => ({
  sendCounsellorApprovalEmail: (...args) => mockSendApprovalEmail(...args),
  sendCounsellorReverificationEmail: (...args) => mockSendReverificationEmail(...args),
}));

const adminRouter = require('../admin');

const ADMIN_ID = '64f000000000000000000001';
const NON_ADMIN_ID = '64f000000000000000000002';
const APPLICATION_ID = '64f000000000000000000003';
const COUNSELLOR_ID = '64f000000000000000000004';
const USER_ID = '64f000000000000000000005';
const MFA_MAX_AGE_MS = 5 * 60 * 1000;
const ACTIVATION_TOKEN = 'activation-token-that-must-not-be-returned';
const INVITATION_TOKEN = 'invitation-token-that-must-not-be-returned';

const approvalBody = {
  credentialPolicyVersion: 'credential-policy-v1',
  verificationExpiresAt: '2035-01-01T00:00:00.000Z',
  credentialEvidence: [{
    reference: 'gs://verification-evidence/license.pdf',
    category: 'professional-license',
    sha256: 'a'.repeat(64),
    contentType: 'application/pdf',
    sizeBytes: 1024,
  }],
};

const verificationEndpoints = [
  {
    label: 'start-review',
    method: 'put',
    path: `/api/admin/counsellors/${APPLICATION_ID}/start-review`,
  },
  {
    label: 'approve',
    method: 'put',
    path: `/api/admin/counsellors/${APPLICATION_ID}/approve`,
    body: approvalBody,
  },
  {
    label: 'reject',
    method: 'put',
    path: `/api/admin/counsellors/${APPLICATION_ID}/reject`,
    body: { reason: 'Credential could not be verified.' },
  },
  {
    label: 'suspend through block',
    method: 'put',
    path: `/api/admin/counsellors/${COUNSELLOR_ID}/block`,
    body: { reason: 'Professional credential was revoked.' },
  },
  {
    label: 'reverification-invite',
    method: 'post',
    path: `/api/admin/counsellors/${COUNSELLOR_ID}/reverification-invite`,
  },
  {
    label: 'expire',
    method: 'put',
    path: `/api/admin/counsellors/${COUNSELLOR_ID}/expire`,
  },
];

const mutationMocks = [
  mockStartReview,
  mockApprove,
  mockReject,
  mockSuspend,
  mockExpire,
  mockIssueReverificationInvitation,
  mockSendApprovalEmail,
  mockSendReverificationEmail,
  mockInvalidateCounsellorDiscoveryCache,
];

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

const makeRequest = (app, endpoint, token) => {
  let pendingRequest = request(app)[endpoint.method](endpoint.path);
  if (token) pendingRequest = pendingRequest.set('Authorization', `Bearer ${token}`);
  if (endpoint.body) pendingRequest = pendingRequest.send(endpoint.body);
  return pendingRequest;
};

const counsellorListQuery = (value) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn(async () => value),
  };
  return chain;
};

const counsellorDetailQuery = (value) => {
  const chain = {
    populate: jest.fn(() => chain),
    lean: jest.fn(async () => value),
  };
  return chain;
};

const expectNoVerificationMutation = () => {
  mutationMocks.forEach((mockFunction) => {
    expect(mockFunction).not.toHaveBeenCalled();
  });
};

describe('admin counsellor verification lifecycle routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockReconcileExpiryBatch.mockResolvedValue({
      scanned: 0,
      expired: 0,
      alreadyReconciled: 0,
      failed: 0,
      failures: [],
    });
    mockReconcileExpiryOne.mockResolvedValue({
      counsellorId: COUNSELLOR_ID,
      outcome: 'not_due',
    });
    mockCounsellorCountDocuments.mockResolvedValue(0);
    mockBookingAggregate.mockResolvedValue([]);
    mockUserFindById.mockImplementation(async (id) => ({
      _id: id,
      role: String(id) === NON_ADMIN_ID ? 'user' : 'admin',
      isActive: true,
      sessionVersion: 0,
    }));
    mockVerifyAdminToken.mockImplementation((token) => {
      if (token === 'admin-fresh') {
        return {
          userId: ADMIN_ID,
          sessionVersion: 0,
          mfaAuthenticatedAt: Date.now(),
        };
      }
      if (token === 'admin-no-mfa') {
        return { userId: ADMIN_ID, sessionVersion: 0 };
      }
      if (token === 'admin-stale-mfa') {
        return {
          userId: ADMIN_ID,
          sessionVersion: 0,
          mfaAuthenticatedAt: Date.now() - MFA_MAX_AGE_MS - 1000,
        };
      }
      if (token === 'non-admin') {
        return {
          userId: NON_ADMIN_ID,
          sessionVersion: 0,
          mfaAuthenticatedAt: Date.now(),
        };
      }
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      throw error;
    });
  });

  describe.each([
    ['without an admin token', undefined, 401],
    ['with a non-admin account', 'non-admin', 403],
  ])('%s', (_description, token, expectedStatus) => {
    test.each(verificationEndpoints)(
      '$label is isolated by inherited admin authentication',
      async (endpoint) => {
        const response = await makeRequest(buildApp(), endpoint, token).expect(expectedStatus);

        expect(response.body.success).toBe(false);
        expectNoVerificationMutation();
      },
    );
  });

  describe.each([
    ['missing', 'admin-no-mfa'],
    ['stale', 'admin-stale-mfa'],
  ])('%s MFA evidence', (_description, token) => {
    test.each(verificationEndpoints)(
      '$label denies the request before any verification or email mutation',
      async (endpoint) => {
        const response = await makeRequest(buildApp(), endpoint, token).expect(403);

        expect(response.body).toEqual({
          success: false,
          code: 'ADMIN_MFA_FRESHNESS_REQUIRED',
          message: 'A fresh multi-factor authenticated admin session is required for this action.',
        });
        expectNoVerificationMutation();
      },
    );
  });

  test.each(verificationEndpoints)(
    '$label rejects an invalid route identifier before service mutation',
    async (endpoint) => {
      const invalidIdEndpoint = {
        ...endpoint,
        path: endpoint.path.replace(
          endpoint.path.includes(APPLICATION_ID) ? APPLICATION_ID : COUNSELLOR_ID,
          'not-a-mongo-id',
        ),
      };

      const response = await makeRequest(
        buildApp(),
        invalidIdEndpoint,
        'admin-fresh',
      ).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(expect.any(Array));
      expectNoVerificationMutation();
    },
  );

  test('approve rejects malformed credential evidence before service or email mutation', async () => {
    const endpoint = {
      ...verificationEndpoints.find(({ label }) => label === 'approve'),
      body: {
        credentialPolicyVersion: '',
        verificationExpiresAt: 'not-a-date',
        credentialEvidence: [],
      },
    };

    const response = await makeRequest(buildApp(), endpoint, 'admin-fresh').expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual(expect.any(Array));
    expectNoVerificationMutation();
  });

  test('reject requires a non-empty bounded reason before service mutation', async () => {
    const endpoint = {
      ...verificationEndpoints.find(({ label }) => label === 'reject'),
      body: { reason: '   ' },
    };

    const response = await makeRequest(buildApp(), endpoint, 'admin-fresh').expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual(expect.any(Array));
    expectNoVerificationMutation();
  });

  test('start-review passes only the authenticated admin and application identifiers', async () => {
    mockStartReview.mockResolvedValue({
      application: { _id: APPLICATION_ID, status: 'under_review' },
      counsellor: { _id: COUNSELLOR_ID },
      createdDormantUser: true,
    });

    const response = await makeRequest(
      buildApp(),
      verificationEndpoints[0],
      'admin-fresh',
    ).expect(200);

    expect(mockStartReview).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      adminId: ADMIN_ID,
    });
    expect(mockInvalidateCounsellorDiscoveryCache).toHaveBeenCalledTimes(1);
    expect(response.body.data).toEqual({
      applicationId: APPLICATION_ID,
      counsellorId: COUNSELLOR_ID,
      status: 'under_review',
      accountCreated: true,
    });
  });

  test('approve forwards reviewed evidence and keeps the activation token out of the response', async () => {
    const expiresAt = new Date(approvalBody.verificationExpiresAt);
    mockApprove.mockResolvedValue({
      application: { _id: APPLICATION_ID },
      counsellor: {
        _id: COUNSELLOR_ID,
        status: 'active',
        professionalVerification: { expiresAt },
      },
      user: {
        _id: USER_ID,
        email: 'counsellor@example.com',
        firstName: 'Rina',
        lastName: 'Shah',
      },
      activationToken: ACTIVATION_TOKEN,
    });
    mockSendApprovalEmail.mockResolvedValue(true);

    const response = await makeRequest(
      buildApp(),
      verificationEndpoints[1],
      'admin-fresh',
    ).expect(200);

    expect(mockApprove).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      adminId: ADMIN_ID,
      credentialEvidence: approvalBody.credentialEvidence,
      credentialPolicyVersion: approvalBody.credentialPolicyVersion,
      verificationExpiresAt: approvalBody.verificationExpiresAt,
    });
    expect(mockSendApprovalEmail).toHaveBeenCalledWith({
      email: 'counsellor@example.com',
      name: 'Rina Shah',
      activationToken: ACTIVATION_TOKEN,
    });
    expect(mockInvalidateCounsellorDiscoveryCache).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response.body)).not.toContain(ACTIVATION_TOKEN);
  });

  test('reject forwards the bounded reason and authenticated admin identity', async () => {
    mockReject.mockResolvedValue({
      application: { _id: APPLICATION_ID, status: 'rejected' },
    });

    const response = await makeRequest(
      buildApp(),
      verificationEndpoints[2],
      'admin-fresh',
    ).expect(200);

    expect(mockReject).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      adminId: ADMIN_ID,
      reason: 'Credential could not be verified.',
    });
    expect(response.body.data).toEqual({
      applicationId: APPLICATION_ID,
      status: 'rejected',
    });
  });

  test('block is the MFA-gated suspension endpoint and records session revocation metadata', async () => {
    const suspendedUser = { _id: USER_ID };
    mockSuspend.mockResolvedValue({
      counsellor: { _id: COUNSELLOR_ID, status: 'suspended' },
      user: suspendedUser,
    });

    const response = await makeRequest(
      buildApp(),
      verificationEndpoints[3],
      'admin-fresh',
    ).expect(200);

    expect(mockSuspend).toHaveBeenCalledWith({
      counsellorId: COUNSELLOR_ID,
      adminId: ADMIN_ID,
      reason: 'Professional credential was revoked.',
    });
    expect(mockInvalidateCounsellorDiscoveryCache).toHaveBeenCalledTimes(1);
    expect(response.body.data).toEqual({
      counsellorId: COUNSELLOR_ID,
      status: 'suspended',
    });
  });

  test('reverification-invite emails the one-time secret but never returns it', async () => {
    const expiresAt = new Date('2030-01-02T00:00:00.000Z');
    mockIssueReverificationInvitation.mockResolvedValue({
      counsellor: { _id: COUNSELLOR_ID },
      user: {
        _id: USER_ID,
        email: 'counsellor@example.com',
        firstName: 'Rina',
        lastName: 'Shah',
      },
      invitationToken: INVITATION_TOKEN,
      expiresAt,
    });
    mockSendReverificationEmail.mockResolvedValue(true);

    const response = await makeRequest(
      buildApp(),
      verificationEndpoints[4],
      'admin-fresh',
    ).expect(200);

    expect(mockIssueReverificationInvitation).toHaveBeenCalledWith({
      counsellorId: COUNSELLOR_ID,
      adminId: ADMIN_ID,
    });
    expect(mockSendReverificationEmail).toHaveBeenCalledWith({
      email: 'counsellor@example.com',
      name: 'Rina Shah',
      invitationToken: INVITATION_TOKEN,
    });
    expect(response.body.data).toEqual({
      counsellorId: COUNSELLOR_ID,
      invitationEmailSent: true,
      invitationEmailRecipient: 'counsellor@example.com',
      expiresAt: expiresAt.toISOString(),
    });
    expect(JSON.stringify(response.body)).not.toContain(INVITATION_TOKEN);
  });

  test('expire forwards the authenticated admin identity and invalidates discovery', async () => {
    mockExpire.mockResolvedValue({
      counsellor: { _id: COUNSELLOR_ID, status: 'expired' },
      user: { _id: USER_ID },
    });

    const response = await makeRequest(
      buildApp(),
      verificationEndpoints[5],
      'admin-fresh',
    ).expect(200);

    expect(mockExpire).toHaveBeenCalledWith({
      counsellorId: COUNSELLOR_ID,
      adminId: ADMIN_ID,
    });
    expect(mockInvalidateCounsellorDiscoveryCache).toHaveBeenCalledTimes(1);
    expect(response.body.data).toEqual({
      counsellorId: COUNSELLOR_ID,
      status: 'expired',
    });
  });

  test('admin list reconciles first and never serializes an elapsed approval as approved', async () => {
    const elapsed = new Date(Date.now() - 60 * 1000);
    mockCounsellorFind.mockReturnValue(counsellorListQuery([{
      _id: COUNSELLOR_ID,
      user: {
        _id: USER_ID,
        firstName: 'Rina',
        lastName: 'Shah',
        isActive: true,
      },
      licenseNumber: 'LICENSE-EXPIRED',
      specialization: 'Counselling',
      experience: 8,
      hourlyRate: 1000,
      currency: 'INR',
      status: 'approved',
      isActive: true,
      isVerified: true,
      professionalVerification: {
        expiresAt: elapsed,
        legacyReviewRequired: false,
      },
      createdAt: new Date(),
    }]));
    mockCounsellorCountDocuments.mockResolvedValue(1);

    const response = await request(buildApp())
      .get('/api/admin/counsellors?status=all')
      .set('Authorization', 'Bearer admin-fresh')
      .expect(200);

    expect(mockReconcileExpiryBatch).toHaveBeenCalledWith({ limit: 100 });
    expect(response.body.data.counsellors[0]).toEqual(expect.objectContaining({
      status: 'expired',
      isActive: false,
      isVerified: false,
      user: expect.objectContaining({ isActive: false }),
    }));
  });

  test('admin detail reconciles the requested profile before reading it', async () => {
    const expiredProfile = {
      _id: COUNSELLOR_ID,
      user: {
        _id: USER_ID,
        role: 'counsellor',
        isActive: false,
      },
      status: 'expired',
      isActive: false,
      isVerified: false,
      professionalVerification: {
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    };
    mockCounsellorFindById.mockReturnValue(
      counsellorDetailQuery(expiredProfile)
    );

    const response = await request(buildApp())
      .get(`/api/admin/counsellors/${COUNSELLOR_ID}`)
      .set('Authorization', 'Bearer admin-fresh')
      .expect(200);

    expect(mockReconcileExpiryOne).toHaveBeenCalledWith({
      counsellorId: COUNSELLOR_ID,
    });
    expect(response.body.data.counsellor).toEqual(expect.objectContaining({
      status: 'expired',
      isActive: false,
      isVerified: false,
      professionallyEligible: false,
    }));
  });
});
