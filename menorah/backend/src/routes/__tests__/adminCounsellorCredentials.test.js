const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

const counsellorId = '64f000000000000000000081';
const userId = '64f000000000000000000001';
const mockCounsellorFindById = jest.fn();
const mockUserFindById = jest.fn();
const mockSendCounsellorCredentialsEmail = jest.fn();
const mockRevokeAllSessions = jest.fn();
const mockDisconnectUserSockets = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: { toString: () => '64f000000000000000000099' }, role: 'admin' };
    next();
  },
}));

jest.mock('../../models/User', () => ({
  findById: (...args) => mockUserFindById(...args),
}));

jest.mock('../../models/Counsellor', () => ({
  findById: (...args) => mockCounsellorFindById(...args),
}));

jest.mock('../../models/Booking', () => ({}));
jest.mock('../../models/PendingApplication', () => ({}));
jest.mock('../../models/KycVerification', () => ({}));
jest.mock('../../utils/email', () => ({
  sendCounsellorCredentialsEmail: (...args) => mockSendCounsellorCredentialsEmail(...args),
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

describe('admin counsellor credential delivery', () => {
  beforeEach(() => {
    mockCounsellorFindById.mockReset();
    mockUserFindById.mockReset();
    mockSendCounsellorCredentialsEmail.mockReset();
    mockRevokeAllSessions.mockReset();
    mockDisconnectUserSockets.mockReset();
  });

  test('emails a new temporary password and reset link when an admin resets a counsellor password', async () => {
    const counsellor = {
      _id: counsellorId,
      user: { _id: userId },
      status: 'approved',
      isActive: true,
      isAvailable: true,
      save: jest.fn(async () => undefined),
    };
    const user = {
      _id: userId,
      firstName: 'Asha',
      lastName: 'Counsellor',
      email: 'asha@example.com',
      isActive: true,
      loginAttempts: 5,
      lockUntil: new Date(Date.now() + 60 * 60 * 1000),
      save: jest.fn(async () => undefined),
    };

    mockCounsellorFindById.mockReturnValue({
      populate: jest.fn(async () => counsellor),
    });
    mockUserFindById.mockResolvedValue(user);
    mockSendCounsellorCredentialsEmail.mockResolvedValue(true);

    const response = await request(buildApp())
      .post(`/api/admin/counsellors/${counsellorId}/generate-password`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        username: 'asha@example.com',
        counsellorId,
        userId,
        credentialEmailSent: true,
        credentialEmailRecipient: 'asha@example.com',
      },
    });
    expect(response.body.data.password).toBeUndefined();

    const [emailOptions] = mockSendCounsellorCredentialsEmail.mock.calls[0];
    expect(emailOptions).toMatchObject({
      email: 'asha@example.com',
      name: 'Asha Counsellor',
      kind: 'password_reset',
    });
    expect(emailOptions.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$!]).{12}$/);
    expect(emailOptions.resetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(user.passwordResetToken).toBe(
      crypto.createHash('sha256').update(emailOptions.resetToken).digest('hex'),
    );
    expect(user.passwordResetToken).not.toBe(emailOptions.resetToken);
    expect(user.passwordResetExpires).toBeInstanceOf(Date);
    expect(user.loginAttempts).toBe(0);
    expect(user.lockUntil).toBeNull();
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(counsellor.save).toHaveBeenCalledTimes(1);
    expect(mockRevokeAllSessions).toHaveBeenCalledWith(user, { passwordChanged: true });
    expect(mockDisconnectUserSockets).toHaveBeenCalledWith(undefined, user, 'password_generated');
  });
});
