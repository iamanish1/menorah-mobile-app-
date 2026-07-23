const express = require('express');
const request = require('supertest');

const mockUserId = '64f000000000000000000021';
const mockFindOne = jest.fn();
const mockFindById = jest.fn();
const mockEvaluateCounsellorAccountAccess = jest.fn();
const mockSendPasswordResetEmail = jest.fn();

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockFindOne(...args),
  findById: (...args) => mockFindById(...args),
}));
jest.mock('../../services/counsellorVerificationExpiry', () => ({
  evaluateAccountAccess: (...args) => mockEvaluateCounsellorAccountAccess(...args),
}));
jest.mock('../../utils/email', () => ({
  sendOTPEmail: jest.fn(),
  sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
}));

const authRouter = require('../auth');
const { auth } = require('../../middleware/auth');
const { csrfProtection } = require('../../config/webSessions');
const { signUserToken } = require('../../utils/authTokens');

const makeUser = (overrides = {}) => ({
  _id: { toString: () => mockUserId },
  id: mockUserId,
  firstName: 'Asha',
  lastName: 'User',
  email: 'asha@example.com',
  phone: '+15551234567',
  role: 'user',
  isActive: true,
  isEmailVerified: true,
  isPhoneVerified: false,
  sessionVersion: 0,
  isLocked: jest.fn(() => false),
  comparePassword: jest.fn(async () => true),
  resetLoginAttempts: jest.fn(async () => undefined),
  save: jest.fn(async () => undefined),
  ...overrides,
});

const buildAuthApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.get('/api/private', auth, (req, res) => {
    res.json({ success: true, data: { userId: req.user._id.toString() } });
  });
  return app;
};

const buildCsrfApp = () => {
  const app = express();
  app.use(csrfProtection);
  app.post('/api/users/profile', (_req, res) => res.json({ success: true }));
  return app;
};

describe('browser cookie session authentication', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(64),
      WEB_SESSION_ORIGINS: 'https://app.example.com=user,https://admin.example.com=admin',
    };
    delete process.env.SESSION_COOKIE_DOMAIN;
    mockFindOne.mockReset();
    mockFindById.mockReset();
    mockEvaluateCounsellorAccountAccess.mockReset().mockResolvedValue({
      allowed: true,
      reason: null,
    });
    mockSendPasswordResetEmail.mockReset().mockResolvedValue(true);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('browser login cookie transport omits JWTs and sets a hardened cookie', async () => {
    const user = makeUser();
    mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(buildAuthApp())
      .post('/api/auth/login')
      .set('Origin', 'https://app.example.com')
      .send({ email: 'asha@example.com', password: 'correct-password', transport: 'cookie' })
      .expect(200);

    expect(res.body.data.user.email).toBe('asha@example.com');
    expect(res.body.data.token).toBeUndefined();

    const cookie = res.headers['set-cookie']?.join('; ') || '';
    expect(cookie).toContain('__Host-menorah-user=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
  });

  test('bearer auth remains valid for non-browser clients', async () => {
    const user = makeUser();
    const token = signUserToken(user);
    mockFindById.mockResolvedValue(user);

    const res = await request(buildAuthApp())
      .get('/api/private')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.userId).toBe(mockUserId);
  });

  test('trusted browser origins cannot use bearer tokens instead of mapped cookies', async () => {
    const user = makeUser();
    const token = signUserToken(user);
    mockFindById.mockResolvedValue(user);

    await request(buildAuthApp())
      .get('/api/private')
      .set('Origin', 'https://app.example.com')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  test('a counsellor token fails closed when professional approval is no longer current', async () => {
    const counsellor = makeUser({ role: 'counsellor' });
    const token = signUserToken(counsellor);
    mockFindById.mockResolvedValue(counsellor);
    mockEvaluateCounsellorAccountAccess.mockResolvedValue({
      allowed: false,
      reason: 'COUNSELLOR_VERIFICATION_EXPIRED',
    });

    await request(buildAuthApp())
      .get('/api/private')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(mockEvaluateCounsellorAccountAccess).toHaveBeenCalledWith({
      account: counsellor,
    });
  });

  test('forgot-password does not issue reset material for an inactive review account', async () => {
    mockFindOne.mockResolvedValue(null);

    await request(buildAuthApp())
      .post('/api/auth/forgot-password')
      .send({ email: 'reviewing@example.com' })
      .expect(200);

    expect(mockFindOne).toHaveBeenCalledWith({
      email: 'reviewing@example.com',
      isActive: true,
    });
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('a pre-issued reset token cannot mutate an inactive review account', async () => {
    const select = jest.fn().mockResolvedValue(null);
    mockFindOne.mockReturnValue({ select });

    await request(buildAuthApp())
      .post('/api/auth/reset-password')
      .send({ token: 'pre-review-reset-token', password: 'UpdatedPass123' })
      .expect(400);

    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
      passwordResetToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      passwordResetExpires: { $gt: expect.any(Number) },
    }));
    expect(select).toHaveBeenCalledWith('+passwordResetToken +passwordResetExpires');
  });

  test('cookie-authenticated cross-site writes are rejected by CSRF validation', async () => {
    await request(buildCsrfApp())
      .post('/api/users/profile')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', '__Host-menorah-user=opaque-session-token')
      .expect(403);
  });

  test('same-origin cookie writes pass CSRF validation', async () => {
    await request(buildCsrfApp())
      .post('/api/users/profile')
      .set('Origin', 'https://app.example.com')
      .set('Cookie', '__Host-menorah-user=opaque-session-token')
      .expect(200);
  });
});
