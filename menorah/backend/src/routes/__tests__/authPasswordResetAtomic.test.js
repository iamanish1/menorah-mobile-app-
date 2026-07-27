const express = require('express');
const request = require('supertest');

const mockFindOneAndUpdate = jest.fn();
const mockBcryptHash = jest.fn();
const mockDisconnectSockets = jest.fn();

jest.mock('../../models/User', () => ({
  findOneAndUpdate: (...args) => mockFindOneAndUpdate(...args),
}));

jest.mock('bcryptjs', () => ({
  hash: (...args) => mockBcryptHash(...args),
}));

jest.mock('../../middleware/auth', () => ({
  auth: (_req, _res, next) => next(),
}));

jest.mock('../../utils/email', () => ({
  sendOTPEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
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

describe('atomic password reset redemption', () => {
  beforeEach(() => {
    mockFindOneAndUpdate.mockReset();
    mockBcryptHash.mockReset();
    mockDisconnectSockets.mockReset();
  });

  test('uses an expiry boundary captured after bcrypt completes', async () => {
    let hashCompletedAt = 0;
    mockBcryptHash.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      hashCompletedAt = Date.now();
      return '$2b$already-hashed-password';
    });
    mockFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => '64f000000000000000000021' } });

    await request(buildApp())
      .post('/api/auth/reset-password')
      .send({ token: 'reset-token', password: 'StrongPass1' })
      .expect(200);

    const [filter, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter.passwordResetExpires.$gt.getTime()).toBeGreaterThanOrEqual(hashCompletedAt);
    expect(update).toMatchObject({
      $inc: { sessionVersion: 1 },
      $unset: { passwordResetToken: '', passwordResetExpires: '' },
    });
    expect(mockDisconnectSockets).toHaveBeenCalled();
  });
});
