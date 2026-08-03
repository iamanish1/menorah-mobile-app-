const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const applicationId = '64f000000000000000000081';
const userId = '64f000000000000000000001';
const counsellorId = '64f000000000000000000002';
const mockApprove = jest.fn();
const mockSendCounsellorCredentialsEmail = jest.fn();
const mockRevokeAllSessions = jest.fn();
const mockDisconnectUserSockets = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000099', role: 'admin' };
    next();
  },
  requireRecentAdminMfa: (_req, _res, next) => next(),
}));

jest.mock('../../middleware/adminAuthorization', () => ({
  hasAdminPermission: jest.fn(() => true),
  requireAdminPermission: jest.fn(() => (_req, _res, next) => next()),
  requireAssignedAdminRole: (_req, _res, next) => next(),
}));

jest.mock('../../services/counsellorVerificationService', () => {
  class CounsellorVerificationError extends Error {}
  return {
    CounsellorVerificationError,
    approve: (...args) => mockApprove(...args),
    expire: jest.fn(),
    issueReverificationInvitation: jest.fn(),
    reject: jest.fn(),
    startReview: jest.fn(),
    suspend: jest.fn(),
  };
});

jest.mock('../../services/counsellorDiscoveryCache', () => ({
  invalidateCounsellorDiscoveryCache: jest.fn(async () => undefined),
}));
jest.mock('../../models/User', () => ({}));
jest.mock('../../models/Counsellor', () => ({}));
jest.mock('../../models/Booking', () => ({}));
jest.mock('../../models/PendingApplication', () => ({}));
jest.mock('../../models/KycVerification', () => ({}));
jest.mock('../../models/Payout', () => ({}));
jest.mock('../../utils/email', () => ({
  sendCounsellorCredentialsEmail: (...args) => mockSendCounsellorCredentialsEmail(...args),
  sendCounsellorReverificationEmail: jest.fn(),
}));
jest.mock('../../utils/sessionLifecycle', () => ({
  revokeAllSessions: (...args) => mockRevokeAllSessions(...args),
  disconnectUserSockets: (...args) => mockDisconnectUserSockets(...args),
}));

const adminRouter = require('../admin');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

describe('admin counsellor onboarding credentials', () => {
  beforeEach(() => {
    mockApprove.mockReset();
    mockSendCounsellorCredentialsEmail.mockReset();
    mockRevokeAllSessions.mockReset();
    mockDisconnectUserSockets.mockReset();
  });

  test('emails temporary credentials only after the guarded professional approval succeeds', async () => {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const user = {
      _id: userId,
      firstName: 'Asha',
      lastName: 'Counsellor',
      email: 'asha@example.com',
      role: 'counsellor',
      isActive: true,
      save: jest.fn(async () => undefined),
    };
    const counsellor = {
      _id: counsellorId,
      status: 'approved',
      professionalVerification: { expiresAt },
    };
    const application = { _id: applicationId, status: 'approved' };
    mockApprove.mockResolvedValue({ application, counsellor, user });
    mockSendCounsellorCredentialsEmail.mockResolvedValue(true);

    const response = await request(buildApp())
      .put(`/api/admin/counsellors/${applicationId}/approve`)
      .send({
        credentialPolicyVersion: 'policy-2026-08',
        verificationExpiresAt: expiresAt.toISOString(),
        credentialEvidence: [{
          reference: 'credential-object-key',
          category: 'professional-license',
        }],
      })
      .expect(200);

    expect(mockApprove).toHaveBeenCalledWith(expect.objectContaining({
      applicationId,
      adminId: '64f000000000000000000099',
      credentialPolicyVersion: 'policy-2026-08',
      verificationExpiresAt: expiresAt.toISOString(),
    }));
    expect(response.body).toMatchObject({
      success: true,
      data: {
        applicationId,
        counsellorId,
        status: 'approved',
        username: 'asha@example.com',
        credentialEmailSent: true,
        credentialEmailRecipient: 'asha@example.com',
      },
    });
    expect(response.body.data.password).toBeUndefined();

    const [emailOptions] = mockSendCounsellorCredentialsEmail.mock.calls[0];
    expect(emailOptions).toMatchObject({
      email: 'asha@example.com',
      name: 'Asha Counsellor',
      kind: 'onboarding',
    });
    expect(emailOptions.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$!]).{12}$/);
    expect(emailOptions.resetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(user.passwordResetToken).toBe(
      crypto.createHash('sha256').update(emailOptions.resetToken).digest('hex'),
    );
    expect(user.passwordResetExpires).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(mockRevokeAllSessions).toHaveBeenCalledWith(user, { passwordChanged: true });
    expect(mockDisconnectUserSockets).toHaveBeenCalledWith(undefined, user, 'counsellor_approved');
  });
});
