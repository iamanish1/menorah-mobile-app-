const express = require('express');
const request = require('supertest');

const ADMIN_ID = '64f000000000000000000151';
let mockAuthenticatedAdmin;

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = mockAuthenticatedAdmin;
    req.auth = { decoded: {}, token: null };
    next();
  },
  requireRecentAdminMfa: (_req, _res, next) => next(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
  }),
}));

jest.mock('../../utils/email', () => ({
  sendOTPEmail: jest.fn(),
}));

jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: jest.fn(),
}));

const authAdminRouter = require('../auth-admin');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authAdminRouter);
  return app;
};

describe('admin logout lifecycle', () => {
  const originalRoleGrants = process.env.ADMIN_ROLE_GRANTS_JSON;

  beforeEach(() => {
    delete process.env.ADMIN_ROLE_GRANTS_JSON;
    mockAuthenticatedAdmin = {
      _id: ADMIN_ID,
      role: 'admin',
      isActive: true,
      sessionVersion: 6,
      save: jest.fn(async () => undefined),
    };
  });

  afterAll(() => {
    if (originalRoleGrants === undefined) delete process.env.ADMIN_ROLE_GRANTS_JSON;
    else process.env.ADMIN_ROLE_GRANTS_JSON = originalRoleGrants;
  });

  test('current-session logout remains available after operational assignment removal', async () => {
    await request(buildApp())
      .post('/api/auth/logout')
      .expect(200);

    expect(mockAuthenticatedAdmin.sessionVersion).toBe(6);
    expect(mockAuthenticatedAdmin.save).not.toHaveBeenCalled();
  });

  test('logout-all remains available and invalidates every current device session', async () => {
    await request(buildApp())
      .post('/api/auth/logout-all')
      .expect(200);

    expect(mockAuthenticatedAdmin.sessionVersion).toBe(7);
    expect(mockAuthenticatedAdmin.lastSessionRevokedAt).toBeInstanceOf(Date);
    expect(mockAuthenticatedAdmin.save).toHaveBeenCalledTimes(1);
  });
});
