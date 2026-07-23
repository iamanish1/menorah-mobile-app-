const express = require('express');
const request = require('supertest');

const ADMIN_ID = '64f000000000000000000131';
const mockFindById = jest.fn();

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  findById: (...args) => mockFindById(...args),
}));

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = {
      _id: ADMIN_ID,
      role: 'admin',
      isActive: true,
      sessionVersion: 4,
    };
    req.auth = { decoded: { mfaAuthenticatedAt: Date.now() } };
    next();
  },
  requireRecentAdminMfa: (req, res, next) => (
    req.get('x-test-fresh-mfa') === 'true'
      ? next()
      : res.status(403).json({
          success: false,
          code: 'ADMIN_MFA_FRESHNESS_REQUIRED',
        })
  ),
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

const makeAdmin = ({
  currentPasswordValid = true,
  newPasswordReused = false,
} = {}) => ({
  _id: ADMIN_ID,
  role: 'admin',
  isActive: true,
  sessionVersion: 4,
  password: 'stored-hash',
  passwordAuthEnabled: true,
  comparePassword: jest.fn()
    .mockResolvedValueOnce(currentPasswordValid)
    .mockResolvedValueOnce(newPasswordReused),
  save: jest.fn(async () => undefined),
});

const installAdminQuery = (admin) => {
  const select = jest.fn().mockResolvedValue(admin);
  mockFindById.mockReturnValue({ select });
  return select;
};

const changePassword = (app, body, { freshMfa = true } = {}) => {
  const pending = request(app)
    .put('/api/auth/change-password')
    .send(body);
  if (freshMfa) pending.set('x-test-fresh-mfa', 'true');
  return pending;
};

describe('admin password change hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
        { adminId: ADMIN_ID, role: 'admin' },
      ]),
    };
    mockFindById.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('requires the same strong policy used by registration and reset', async () => {
    await changePassword(buildApp(), {
      currentPassword: 'CurrentPassword1',
      newPassword: 'weak',
    }).expect(400);

    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('requires a fresh MFA-authenticated admin session', async () => {
    await changePassword(buildApp(), {
      currentPassword: 'CurrentPassword1',
      newPassword: 'DifferentPassword2',
    }, { freshMfa: false }).expect(403);

    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('verifies the current password, changes it, and revokes every session', async () => {
    const admin = makeAdmin();
    const select = installAdminQuery(admin);

    const response = await changePassword(buildApp(), {
      currentPassword: 'CurrentPassword1',
      newPassword: 'DifferentPassword2',
    }).expect(200);

    expect(select).toHaveBeenCalledWith('+password +passwordAuthEnabled');
    expect(admin.comparePassword).toHaveBeenNthCalledWith(1, 'CurrentPassword1');
    expect(admin.comparePassword).toHaveBeenNthCalledWith(2, 'DifferentPassword2');
    expect(admin.password).toBe('DifferentPassword2');
    expect(admin.passwordAuthEnabled).toBe(true);
    expect(admin.sessionVersion).toBe(5);
    expect(admin.lastPasswordChangeAt).toBeInstanceOf(Date);
    expect(admin.lastSessionRevokedAt).toBeInstanceOf(Date);
    expect(admin.save).toHaveBeenCalledTimes(1);
    expect(response.body.message).toMatch(/Sign in again on every device/);
  });

  test('rejects an incorrect current password without changing session state', async () => {
    const admin = makeAdmin({ currentPasswordValid: false });
    installAdminQuery(admin);

    await changePassword(buildApp(), {
      currentPassword: 'IncorrectPassword1',
      newPassword: 'DifferentPassword2',
    }).expect(400);

    expect(admin.sessionVersion).toBe(4);
    expect(admin.save).not.toHaveBeenCalled();
  });

  test('rejects reuse of the current password', async () => {
    const admin = makeAdmin({ newPasswordReused: true });
    installAdminQuery(admin);

    await changePassword(buildApp(), {
      currentPassword: 'CurrentPassword1',
      newPassword: 'CurrentPassword1',
    }).expect(409);

    expect(admin.sessionVersion).toBe(4);
    expect(admin.save).not.toHaveBeenCalled();
  });
});
