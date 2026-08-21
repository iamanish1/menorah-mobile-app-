const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockExists = jest.fn();
const mockUpdateOne = jest.fn();
const mockBcryptHash = jest.fn();
const mockDisconnectSockets = jest.fn();
const mockSendPasswordResetEmail = jest.fn();

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockFindOne(...args),
  findOneAndUpdate: (...args) => mockFindOneAndUpdate(...args),
  exists: (...args) => mockExists(...args),
  updateOne: (...args) => mockUpdateOne(...args),
}));

jest.mock('bcryptjs', () => ({
  hash: (...args) => mockBcryptHash(...args),
}));

jest.mock('../../middleware/auth', () => ({
  auth: (_req, _res, next) => next(),
}));

jest.mock('../../utils/email', () => ({
  sendOTPEmail: jest.fn(),
  sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
}));

jest.mock('../../utils/sessionLifecycle', () => ({
  revokeAllSessions: jest.fn(),
  disconnectUserSockets: (...args) => mockDisconnectSockets(...args),
}));

jest.mock('../../config/webSessions', () => ({
  clearMappedSessionCookie: jest.fn(),
  isCookieTransportRequested: jest.fn(() => false),
  setSessionCookieForRequest: jest.fn(),
}));

const authRouter = require('../auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

const mockForgotPasswordLookup = (user) => {
  const select = jest.fn(async () => user);
  mockFindOne.mockReturnValue({ select });
  return select;
};

describe('atomic password reset redemption', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindOneAndUpdate.mockReset();
    mockExists.mockReset();
    mockUpdateOne.mockReset();
    mockBcryptHash.mockReset();
    mockDisconnectSockets.mockReset();
    mockSendPasswordResetEmail.mockReset();
  });

  test('uses an expiry boundary captured after bcrypt completes', async () => {
    let hashCompletedAt = 0;
    mockBcryptHash.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      hashCompletedAt = Date.now();
      return '$2b$already-hashed-password';
    });
    mockExists.mockResolvedValue({ _id: '64f000000000000000000021' });
    mockFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => '64f000000000000000000021' } });

    await request(buildApp())
      .post('/api/auth/reset-password')
      .send({ token: 'reset-token', password: 'StrongPass1' })
      .expect(200);

    const [filter, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter.passwordResetExpires.$gt.getTime()).toBeGreaterThanOrEqual(hashCompletedAt);
    expect(update).toMatchObject({
      $set: { loginAttempts: 0 },
      $inc: { sessionVersion: 1 },
      $unset: {
        lockUntil: '',
        passwordResetToken: '',
        passwordResetExpires: '',
      },
    });
    expect(filter.role).toEqual({ $in: ['user', 'counsellor'] });
    expect(mockDisconnectSockets).toHaveBeenCalled();
  });

  test('rejects invalid or expired reset tokens without mutating an account', async () => {
    mockExists.mockResolvedValue(null);

    const response = await request(buildApp())
      .post('/api/auth/reset-password')
      .send({ token: 'invalid-or-expired-token', password: 'StrongPass1' })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: 'Invalid or expired reset token',
    });
    expect(mockExists).toHaveBeenCalledTimes(1);
    expect(mockBcryptHash).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockDisconnectSockets).not.toHaveBeenCalled();
  });

  test('allows a reset token to be redeemed only once', async () => {
    // The preflight can observe the token in both concurrent/replayed
    // requests; the final findOneAndUpdate remains the one-time claim.
    mockExists.mockResolvedValue({ _id: '64f000000000000000000021' });
    mockBcryptHash.mockResolvedValue('$2b$already-hashed-password');
    mockFindOneAndUpdate
      .mockResolvedValueOnce({ _id: { toString: () => '64f000000000000000000021' } })
      .mockResolvedValueOnce(null);

    const payload = { token: 'one-time-reset-token', password: 'StrongPass1' };

    await request(buildApp())
      .post('/api/auth/reset-password')
      .send(payload)
      .expect(200);

    const replay = await request(buildApp())
      .post('/api/auth/reset-password')
      .send(payload)
      .expect(400);

    expect(replay.body.message).toBe('Invalid or expired reset token');
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockDisconnectSockets).toHaveBeenCalledTimes(1);
  });
});

describe('role-aware forgot-password delivery', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindOneAndUpdate.mockReset();
    mockExists.mockReset();
    mockUpdateOne.mockReset();
    mockBcryptHash.mockReset();
    mockDisconnectSockets.mockReset();
    mockSendPasswordResetEmail.mockReset();
  });

  test.each(['user', 'counsellor'])(
    'issues a hashed token and passes the %s role to the email service',
    async (role) => {
      const user = {
        _id: `id-${role}`,
        email: `${role}@example.com`,
        role,
        save: jest.fn(async () => undefined),
      };
      const select = mockForgotPasswordLookup(user);
      mockSendPasswordResetEmail.mockResolvedValue(true);

      await request(buildApp())
        .post('/api/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(mockFindOne).toHaveBeenCalledWith({
        email: user.email,
        role: { $in: ['user', 'counsellor'] },
      });
      expect(select).toHaveBeenCalledWith('+passwordResetToken +passwordResetExpires');
      expect(user.passwordResetToken).toMatch(/^[a-f0-9]{64}$/);
      expect(user.passwordResetExpires).toBeInstanceOf(Date);
      expect(user.save).toHaveBeenCalledTimes(1);
      expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [recipient, plaintextToken, options] = mockSendPasswordResetEmail.mock.calls[0];
      expect(recipient).toBe(user.email);
      expect(options).toEqual({ role });
      expect(user.passwordResetToken).toBe(
        crypto.createHash('sha256').update(plaintextToken).digest('hex'),
      );
      expect(user.passwordResetToken).not.toBe(plaintextToken);
      expect(mockUpdateOne).not.toHaveBeenCalled();
    },
  );

  test('uses the same neutral response and sends nothing when no participant account matches', async () => {
    const select = mockForgotPasswordLookup(null);

    const response = await request(buildApp())
      .post('/api/auth/forgot-password')
      .send({ email: 'admin-or-missing@example.com' })
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent',
    });
    expect(mockFindOne).toHaveBeenCalledWith({
      email: 'admin-or-missing@example.com',
      role: { $in: ['user', 'counsellor'] },
    });
    expect(select).toHaveBeenCalledWith('+passwordResetToken +passwordResetExpires');
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test.each([
    ['returns false', () => mockSendPasswordResetEmail.mockResolvedValue(false)],
    ['throws', () => mockSendPasswordResetEmail.mockRejectedValue(new Error('provider unavailable'))],
  ])(
    'preserves the previous usable token and returns a neutral response when email delivery %s',
    async (_deliveryFailure, arrangeDeliveryFailure) => {
      const previousResetToken = 'a'.repeat(64);
      const previousResetExpires = new Date(Date.now() + 5 * 60 * 1000);
      const user = {
        _id: 'participant-id',
        email: 'participant@example.com',
        role: 'user',
        passwordResetToken: previousResetToken,
        passwordResetExpires: previousResetExpires,
        save: jest.fn(async () => undefined),
      };
      mockForgotPasswordLookup(user);
      mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
      arrangeDeliveryFailure();

      const response = await request(buildApp())
        .post('/api/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'If an account exists for that email, a password reset link has been sent',
      });
      const [rollbackFilter, rollbackUpdate] = mockUpdateOne.mock.calls[0];
      expect(rollbackFilter).toEqual({
        _id: user._id,
        passwordResetToken: user.passwordResetToken,
      });
      expect(rollbackFilter.passwordResetToken).not.toBe(previousResetToken);
      expect(rollbackUpdate).toEqual({
        $set: {
          passwordResetToken: previousResetToken,
          passwordResetExpires: previousResetExpires,
        },
      });
    },
  );

  test('removes a newly issued token after failed delivery when there was no previous token', async () => {
    const user = {
      _id: 'participant-without-prior-token',
      email: 'new-reset@example.com',
      role: 'counsellor',
      save: jest.fn(async () => undefined),
    };
    mockForgotPasswordLookup(user);
    mockSendPasswordResetEmail.mockResolvedValue(false);
    mockUpdateOne.mockResolvedValue({ matchedCount: 1 });

    await request(buildApp())
      .post('/api/auth/forgot-password')
      .send({ email: user.email })
      .expect(200);

    expect(mockUpdateOne).toHaveBeenCalledWith({
      _id: user._id,
      passwordResetToken: user.passwordResetToken,
    }, {
      $unset: {
        passwordResetToken: '',
        passwordResetExpires: '',
      },
    });
  });
});
