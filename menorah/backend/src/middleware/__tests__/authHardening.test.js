const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const USER_ID = '64f000000000000000000111';
const ADMIN_ID = '64f000000000000000000112';
const COUNSELLOR_ID = '64f000000000000000000113';

const mockFindById = jest.fn();
const mockRedisGet = jest.fn();
const mockEvaluateCounsellorAccountAccess = jest.fn();
const mockRecordSecurityEvent = jest.fn();

jest.mock('../../models/User', () => ({
  findById: (...args) => mockFindById(...args),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    get: (...args) => mockRedisGet(...args),
  }),
}));

jest.mock('../../services/counsellorVerificationExpiry', () => ({
  evaluateAccountAccess: (...args) => mockEvaluateCounsellorAccountAccess(...args),
}));

jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: (...args) => mockRecordSecurityEvent(...args),
}));

const {
  adminAuth,
  auth,
  authAny,
  counsellorAuth,
} = require('../auth');
const {
  signAdminToken,
  signUserToken,
} = require('../../utils/authTokens');

const makeAccount = ({
  id = USER_ID,
  role = 'user',
  sessionVersion = 0,
  isActive = true,
  isEmailVerified = true,
} = {}) => ({
  _id: id,
  firstName: 'Current',
  lastName: 'Account',
  role,
  sessionVersion,
  isActive,
  isEmailVerified,
});

const buildApp = (onAuthorized = jest.fn()) => {
  const app = express();
  app.get('/user', auth, (req, res) => {
    onAuthorized('user');
    res.json({ success: true, role: req.user.role });
  });
  app.get('/admin', adminAuth, (req, res) => {
    onAuthorized('admin');
    res.json({ success: true, role: req.user.role });
  });
  app.get('/any', authAny, (req, res) => {
    onAuthorized('any');
    res.json({ success: true, role: req.user.role });
  });
  app.get('/counsellor', counsellorAuth, (req, res) => {
    onAuthorized('counsellor');
    res.json({ success: true, role: req.user.role });
  });
  return app;
};

describe('authentication role and session hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      JWT_SECRET: 'h'.repeat(64),
      JWT_ISSUER: 'menorah-auth-hardening-test',
    };
    delete process.env.WEB_SESSION_ORIGINS;
    mockFindById.mockReset();
    mockRedisGet.mockReset().mockResolvedValue(null);
    mockEvaluateCounsellorAccountAccess.mockReset().mockResolvedValue({
      allowed: true,
      reason: null,
    });
    mockRecordSecurityEvent.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('tries the admin verifier after a user-audience miss and authorizes exactly once', async () => {
    const onAuthorized = jest.fn();
    const admin = makeAccount({ id: ADMIN_ID, role: 'admin' });
    const token = signAdminToken(admin);
    mockFindById.mockResolvedValue(admin);

    const response = await request(buildApp(onAuthorized))
      .get('/any')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.role).toBe('admin');
    expect(onAuthorized).toHaveBeenCalledTimes(1);
    expect(mockFindById).toHaveBeenCalledWith(ADMIN_ID);
    expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
  });

  test('writes one generic denial for a token rejected by both verifiers', async () => {
    const onAuthorized = jest.fn();
    const token = 'not-a-jwt';

    const response = await request(buildApp(onAuthorized))
      .get('/any')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body).toEqual({
      success: false,
      message: 'Invalid token.',
    });
    expect(onAuthorized).not.toHaveBeenCalled();
    expect(mockRecordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'authentication_denied',
      expect.objectContaining({
        outcome: 'failure',
        statusCode: 401,
        details: {
          reason: 'invalid_or_expired_token',
          transport: 'bearer',
        },
      })
    );
    const eventOptions = mockRecordSecurityEvent.mock.calls[0][1];
    expect(eventOptions).not.toHaveProperty('token');
    expect(eventOptions.details).not.toHaveProperty('token');
  });

  test('rejects a user token at the admin boundary before loading an account', async () => {
    const token = signUserToken(makeAccount());

    await request(buildApp())
      .get('/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('rejects an admin token where a user token is mandatory', async () => {
    const token = signAdminToken(makeAccount({ id: ADMIN_ID, role: 'admin' }));

    await request(buildApp())
      .get('/user')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('accepts a current counsellor token only after professional-access validation', async () => {
    const counsellor = makeAccount({
      id: COUNSELLOR_ID,
      role: 'counsellor',
      sessionVersion: 2,
    });
    const token = signUserToken(counsellor);
    mockFindById.mockResolvedValue(counsellor);

    const response = await request(buildApp())
      .get('/counsellor')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.role).toBe('counsellor');
    expect(mockEvaluateCounsellorAccountAccess).toHaveBeenCalledWith({
      account: counsellor,
    });
  });

  test('rejects a normal user token at the counsellor boundary', async () => {
    const user = makeAccount();
    const token = signUserToken(user);
    mockFindById.mockResolvedValue(user);

    await request(buildApp())
      .get('/counsellor')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'authorization_denied',
      expect.objectContaining({
        details: expect.objectContaining({
          reason: 'counsellor_role_required',
        }),
      })
    );
  });

  test('rejects an admin token at counsellor self-service boundaries', async () => {
    const admin = makeAccount({ id: ADMIN_ID, role: 'admin' });
    const token = signAdminToken(admin);

    await request(buildApp())
      .get('/counsellor')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(mockFindById).not.toHaveBeenCalled();
  });

  test.each([
    ['stale role', { role: 'user', sessionVersion: 2 }],
    ['stale session', { role: 'counsellor', sessionVersion: 3 }],
    ['suspended or deleted account', { role: 'counsellor', sessionVersion: 2, isActive: false }],
  ])('rejects a counsellor token with a %s', async (_label, storedAccount) => {
    const token = signUserToken(makeAccount({
      id: COUNSELLOR_ID,
      role: 'counsellor',
      sessionVersion: 2,
    }));
    mockFindById.mockResolvedValue(makeAccount({
      id: COUNSELLOR_ID,
      ...storedAccount,
    }));

    await request(buildApp())
      .get('/counsellor')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  test.each([
    ['stale role', makeAccount({ id: ADMIN_ID, role: 'user', sessionVersion: 2 })],
    ['stale session', makeAccount({ id: ADMIN_ID, role: 'admin', sessionVersion: 3 })],
    ['suspended account', makeAccount({
      id: ADMIN_ID,
      role: 'admin',
      sessionVersion: 2,
      isActive: false,
    })],
    ['deleted account', null],
  ])('rejects an admin token bound to a %s', async (_label, storedAccount) => {
    const token = signAdminToken(makeAccount({
      id: ADMIN_ID,
      role: 'admin',
      sessionVersion: 2,
    }));
    mockFindById.mockResolvedValue(storedAccount);

    await request(buildApp())
      .get('/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  test('allows simultaneous current sessions and invalidates both after session revocation', async () => {
    const currentAdmin = makeAccount({
      id: ADMIN_ID,
      role: 'admin',
      sessionVersion: 4,
    });
    const firstToken = signAdminToken(currentAdmin);
    const secondToken = signAdminToken(currentAdmin);
    mockFindById.mockResolvedValue(currentAdmin);

    await Promise.all([
      request(buildApp())
        .get('/admin')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(200),
      request(buildApp())
        .get('/admin')
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200),
    ]);

    mockFindById.mockResolvedValue(makeAccount({
      id: ADMIN_ID,
      role: 'admin',
      sessionVersion: 5,
    }));
    await Promise.all([
      request(buildApp())
        .get('/admin')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(401),
      request(buildApp())
        .get('/admin')
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(401),
    ]);
  });

  test('rejects a blocklisted token before account authorization', async () => {
    const user = makeAccount();
    const token = signUserToken(user);
    mockRedisGet.mockResolvedValue('1');

    await request(buildApp())
      .get('/user')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'authentication_denied',
      expect.objectContaining({
        details: expect.objectContaining({ reason: 'revoked_token' }),
      })
    );
  });

  test('rejects an expired token without querying the account', async () => {
    const token = jwt.sign(
      {
        userId: USER_ID,
        role: 'user',
        purpose: 'access',
        sessionVersion: 0,
      },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER,
        audience: 'menorah-users',
        expiresIn: -1,
      }
    );

    await request(buildApp())
      .get('/user')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(mockFindById).not.toHaveBeenCalled();
  });
});
