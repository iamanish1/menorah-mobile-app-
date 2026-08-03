const express = require('express');
const request = require('supertest');

const mockFindById = jest.fn();
const mockFindOne = jest.fn();
const mockConsumeOtp = jest.fn();
const mockConsumeAdminMfaChallenge = jest.fn();
const mockClearMappedCookie = jest.fn();
const mockSignAdminToken = jest.fn(() => 'admin-session-token');
const mockSendVerificationEmail = jest.fn();
const mockRedis = {
  del: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
};

jest.mock('../../models/User', () => ({
  findById: (...args) => mockFindById(...args),
  findOne: (...args) => mockFindOne(...args),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => mockRedis,
}));

jest.mock('../../utils/redisOtp', () => ({
  hashOtp: jest.fn(() => 'otp-hash'),
  consumeOtp: (...args) => mockConsumeOtp(...args),
}));

jest.mock('../../utils/authTokens', () => ({
  signAdminToken: (...args) => mockSignAdminToken(...args),
}));

jest.mock('../../middleware/auth', () => ({
  adminAuth: (_req, _res, next) => next(),
  requireRecentAdminMfa: (_req, _res, next) => next(),
}));

jest.mock('../../services/adminMfaChallenge', () => ({
  adminMfaKey: jest.fn((challengeId) => `admin:mfa:${challengeId}`),
  createAdminMfaChallengeRecord: jest.fn(),
  consumeAdminMfaChallenge: (...args) => mockConsumeAdminMfaChallenge(...args),
}));

jest.mock('../../utils/email', () => ({
  sendOTPEmail: jest.fn(),
  sendVerificationEmail: (...args) => mockSendVerificationEmail(...args),
}));

jest.mock('../../utils/sessionLifecycle', () => ({
  revokeAllSessions: jest.fn(),
  disconnectUserSockets: jest.fn(),
}));

jest.mock('../../config/webSessions', () => ({
  clearMappedSessionCookie: (...args) => mockClearMappedCookie(...args),
  isCookieTransportRequested: jest.fn(() => false),
  setSessionCookieForRequest: jest.fn(),
}));

const authAdminRouter = require('../auth-admin');

const selectable = (value) => {
  const resolved = Promise.resolve(value);
  return {
    select: jest.fn(() => resolved),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
  };
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authAdminRouter);
  return app;
};

describe('admin MFA verification boundary', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([{
        adminId: '64f000000000000000000021',
        role: 'admin',
      }]),
    };
    mockFindById.mockReset();
    mockFindOne.mockReset();
    mockConsumeOtp.mockReset();
    mockConsumeAdminMfaChallenge.mockReset();
    mockClearMappedCookie.mockReset();
    mockSignAdminToken.mockClear();
    mockSendVerificationEmail.mockReset();
    mockRedis.del.mockReset();
    mockRedis.set.mockReset();
    mockRedis.setEx.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('a correct MFA code for an unverified admin never issues a session', async () => {
    const admin = {
      _id: { toString: () => '64f000000000000000000021' },
      email: 'admin@example.com',
      role: 'admin',
      isActive: true,
      isEmailVerified: false,
      resetLoginAttempts: jest.fn(),
    };
    mockConsumeAdminMfaChallenge.mockResolvedValue({
      userId: admin._id.toString(),
    });
    mockFindById.mockReturnValue(selectable(admin));

    const res = await request(buildApp())
      .post('/api/auth/login/mfa')
      .send({
        challengeId: '123e4567-e89b-42d3-a456-426614174000',
        otp: '123456',
      })
      .expect(403);

    expect(res.body).toMatchObject({
      success: false,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      data: { email: 'admin@example.com' },
    });
    expect(res.body.data.token).toBeUndefined();
    expect(mockSignAdminToken).not.toHaveBeenCalled();
    expect(mockClearMappedCookie).toHaveBeenCalled();
  });

  test('resends an OTP only for an unverified active admin without exposing membership', async () => {
    const admin = {
      _id: { toString: () => '64f000000000000000000021' },
      email: 'admin@example.com',
      role: 'admin',
      isActive: true,
      isEmailVerified: false,
    };
    mockFindOne.mockReturnValue(selectable(admin));
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.setEx.mockResolvedValue('OK');
    mockSendVerificationEmail.mockResolvedValue(true);

    const res = await request(buildApp())
      .post('/api/auth/resend-email-verification')
      .send({ email: 'ADMIN@example.com' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockFindOne).toHaveBeenCalledWith({
      email: 'admin@example.com',
      role: 'admin',
      isActive: true,
      isEmailVerified: false,
    });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'pending:admin-email-verification:resend:admin@example.com',
      '1',
      { EX: 60, NX: true },
    );
    expect(mockRedis.setEx).toHaveBeenCalledWith(
      'pending:admin-email-verification:admin@example.com',
      600,
      expect.stringContaining('"attempts":0'),
    );
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(
      'admin@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  test('verifies only an admin challenge and requires a fresh login instead of issuing a session', async () => {
    const admin = {
      _id: { toString: () => '64f000000000000000000021' },
      email: 'admin@example.com',
      role: 'admin',
      isActive: true,
      isEmailVerified: false,
      save: jest.fn(async () => undefined),
    };
    mockFindOne.mockReturnValue(selectable(admin));
    mockConsumeOtp.mockResolvedValue({ status: 1, value: { otp: 'unused' } });

    const res = await request(buildApp())
      .post('/api/auth/verify-email')
      .send({ email: 'ADMIN@example.com', code: '123456' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, message: expect.stringMatching(/sign in/i) });
    expect(res.body.data?.token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(admin.isEmailVerified).toBe(true);
    expect(admin.save).toHaveBeenCalledTimes(1);
    expect(mockConsumeOtp).toHaveBeenCalledWith(
      mockRedis,
      'pending:admin-email-verification:admin@example.com',
      '123456',
      5,
    );
    expect(mockSignAdminToken).not.toHaveBeenCalled();
  });

  test('does not consume a non-admin verification challenge through the admin API', async () => {
    mockFindOne.mockReturnValue(selectable(null));

    await request(buildApp())
      .post('/api/auth/verify-email')
      .send({ email: 'patient@example.com', code: '123456' })
      .expect(400);

    expect(mockConsumeOtp).not.toHaveBeenCalled();
  });
});
