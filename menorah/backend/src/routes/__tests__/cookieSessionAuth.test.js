const express = require('express');
const request = require('supertest');

const mockUserId = '64f000000000000000000021';
const mockFindOne = jest.fn();
const mockFindById = jest.fn();

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockFindOne(...args),
  findById: (...args) => mockFindById(...args),
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
      WEB_SESSION_ORIGINS: 'https://app.example.com=user,https://admin.example.com=admin',
    };
    delete process.env.SESSION_COOKIE_DOMAIN;
    mockFindOne.mockReset();
    mockFindById.mockReset();
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

    const adminAsUserAudience = makeUser({ role: 'admin' });
    mockFindById.mockResolvedValue(adminAsUserAudience);
    await request(buildAuthApp())
      .get('/api/private-participant')
      .set('Authorization', `Bearer ${signUserToken(adminAsUserAudience)}`)
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('PARTICIPANT_ROLE_REQUIRED'));
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
