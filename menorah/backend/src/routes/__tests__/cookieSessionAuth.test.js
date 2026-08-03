const express = require('express');
const request = require('supertest');

const mockUserId = '64f000000000000000000021';
const mockFindOne = jest.fn();
const mockFindById = jest.fn();
const mockExists = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockUpdateOne = jest.fn();
const mockEvaluateCounsellorAccountAccess = jest.fn();
const mockSendPasswordResetEmail = jest.fn();

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockFindOne(...args),
  findById: (...args) => mockFindById(...args),
  exists: (...args) => mockExists(...args),
  findOneAndUpdate: (...args) => mockFindOneAndUpdate(...args),
  updateOne: (...args) => mockUpdateOne(...args),
}));
jest.mock('../../services/counsellorVerificationExpiry', () => ({
  evaluateAccountAccess: (...args) => mockEvaluateCounsellorAccountAccess(...args),
}));
jest.mock('../../utils/email', () => ({
  sendOTPEmail: jest.fn(),
  sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
}));

const authRouter = require('../auth');
const { auth, authAny, sharedParticipantAuth } = require('../../middleware/auth');
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
  app.get('/api/private-any', authAny, (req, res) => {
    res.json({ success: true, data: { userId: req.user._id.toString(), role: req.user.role } });
  });
  app.get('/api/private-participant', sharedParticipantAuth, (req, res) => {
    res.json({ success: true, data: { userId: req.user._id.toString(), role: req.user.role } });
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
      BCRYPT_ROUNDS: '4',
      WEB_SESSION_ORIGINS: 'https://app.example.com=user,https://admin.example.com=admin',
    };
    delete process.env.SESSION_COOKIE_DOMAIN;
    mockFindOne.mockReset();
    mockFindById.mockReset();
    mockExists.mockReset();
    mockFindOneAndUpdate.mockReset();
    mockUpdateOne.mockReset();
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

  test('an unverified password account receives no session', async () => {
    const user = makeUser({ isEmailVerified: false });
    mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(buildAuthApp())
      .post('/api/auth/login')
      .set('Origin', 'https://app.example.com')
      .send({ email: 'asha@example.com', password: 'correct-password', transport: 'cookie' })
      .expect(403);

    expect(res.body).toMatchObject({
      success: false,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      data: { email: 'asha@example.com' },
    });
    expect(res.body.data.token).toBeUndefined();
    const cookies = res.headers['set-cookie'] || [];
    // A stale mapped cookie may be explicitly cleared, but the failed login
    // must never issue a usable authenticated session.
    expect(cookies.every((cookie) => (
      !cookie.includes('__Host-menorah-user=') || /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/.test(cookie)
    ))).toBe(true);
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

  test('authAny accepts a valid admin token after the user verifier rejects it', async () => {
    const admin = makeUser({ role: 'admin' });
    const { signAdminToken } = require('../../utils/authTokens');
    const token = signAdminToken(admin);
    mockFindById.mockResolvedValue(admin);

    const res = await request(buildAuthApp())
      .get('/api/private-any')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toEqual({ userId: mockUserId, role: 'admin' });
  });

  test('shared participant access admits counsellors but excludes admins', async () => {
    const counsellor = makeUser({ role: 'counsellor' });
    mockFindById.mockResolvedValue(counsellor);

    const counsellorResult = await request(buildAuthApp())
      .get('/api/private-participant')
      .set('Authorization', `Bearer ${signUserToken(counsellor)}`)
      .expect(200);

    expect(counsellorResult.body.data.role).toBe('counsellor');

    const admin = makeUser({ role: 'admin' });
    const { signAdminToken } = require('../../utils/authTokens');
    await request(buildAuthApp())
      .get('/api/private-participant')
      .set('Authorization', `Bearer ${signAdminToken(admin)}`)
      .expect(401);
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
    const select = jest.fn().mockResolvedValue(null);
    mockFindOne.mockReturnValue({ select });

    await request(buildAuthApp())
      .post('/api/auth/forgot-password')
      .send({ email: 'reviewing@example.com' })
      .expect(200);

    expect(mockFindOne).toHaveBeenCalledWith({
      email: 'reviewing@example.com',
      isActive: true,
      role: { $in: ['user', 'counsellor'] },
    });
    expect(select).toHaveBeenCalledWith('+passwordResetToken +passwordResetExpires');
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('registration rejects a password below the shared strength policy before account lookup', async () => {
    await request(buildAuthApp())
      .post('/api/auth/register')
      .send({
        firstName: 'Asha',
        lastName: 'User',
        email: 'asha@example.com',
        phone: '+15551234567',
        password: 'weakpassword1',
        dateOfBirth: '1990-01-01',
        gender: 'female',
      })
      .expect(400);

    expect(mockFindOne).not.toHaveBeenCalled();
  });

  test('password reset rejects a password below the shared strength policy before token lookup', async () => {
    await request(buildAuthApp())
      .post('/api/auth/reset-password')
      .send({ token: 'reset-token', password: 'weakpassword1' })
      .expect(400);

    expect(mockExists).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a pre-issued reset token cannot mutate an inactive review account', async () => {
    mockExists.mockResolvedValue(null);

    await request(buildAuthApp())
      .post('/api/auth/reset-password')
      .send({ token: 'pre-review-reset-token', password: 'UpdatedPass123' })
      .expect(400);

    expect(mockExists).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
      role: { $in: ['user', 'counsellor'] },
      passwordResetToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      passwordResetExpires: { $gt: expect.any(Date) },
    }));
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test('verified reset establishes password auth for a social-only account', async () => {
    const user = makeUser({
      passwordAuthEnabled: false,
      socialAuth: { googleSub: 'google-social-subject' },
      passwordResetToken: 'hashed-reset-token',
      passwordResetExpires: Date.now() + 60000,
    });
    mockExists.mockResolvedValue({ _id: user._id });
    mockFindOneAndUpdate.mockResolvedValue(user);

    await request(buildAuthApp())
      .post('/api/auth/reset-password')
      .send({
        token: 'social-account-reset-token',
        password: 'UpdatedPass123',
      })
      .expect(200);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordResetToken: expect.stringMatching(/^[a-f0-9]{64}$/),
        passwordResetExpires: { $gt: expect.any(Date) },
        isActive: true,
        role: { $in: ['user', 'counsellor'] },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          password: expect.stringMatching(/^\$2[aby]\$/),
          passwordAuthEnabled: true,
          loginAttempts: 0,
          lastSessionRevokedAt: expect.any(Date),
          lastPasswordChangeAt: expect.any(Date),
        }),
        $unset: {
          lockUntil: '',
          passwordResetToken: '',
          passwordResetExpires: '',
        },
        $inc: { sessionVersion: 1 },
      }),
      { new: true },
    );
    expect(user.save).not.toHaveBeenCalled();
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
