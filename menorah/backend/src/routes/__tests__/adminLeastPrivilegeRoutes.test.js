const express = require('express');
const request = require('supertest');

const ADMIN_ID = '64f000000000000000000161';
const SUPPORT_ID = '64f000000000000000000162';
const FINANCE_ID = '64f000000000000000000163';
const USER_ID = '64f000000000000000000164';
const mockUserFind = jest.fn();
const mockUserCountDocuments = jest.fn();
const mockBookingAggregate = jest.fn();
let capturedProjection;

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = {
      _id: req.get('x-test-admin-id'),
      role: 'admin',
    };
    next();
  },
  requireRecentAdminMfa: (_req, _res, next) => next(),
}));

jest.mock('../../models/User', () => ({
  find: (...args) => mockUserFind(...args),
  countDocuments: (...args) => mockUserCountDocuments(...args),
}));

jest.mock('../../models/Booking', () => ({
  aggregate: (...args) => mockBookingAggregate(...args),
}));

jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: jest.fn(),
}));

const adminRouter = require('../admin');

const userRow = () => ({
  _id: { toString: () => USER_ID },
  firstName: 'User',
  lastName: 'Example',
  email: 'user@example.test',
  phone: '+971500000000',
  role: 'user',
  isEmailVerified: true,
  isPhoneVerified: true,
  profileImage: null,
  isActive: true,
  lastLogin: new Date('2026-07-20T00:00:00.000Z'),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-20T00:00:00.000Z'),
  kyc: { status: 'manual_review', faceCheckConfidence: 0.91 },
  subscription: { plan: 'premium', isActive: true },
  internalOnly: 'must-not-leak',
});

const installUserQuery = (rows = [userRow()]) => {
  const chain = {
    select: jest.fn((projection) => {
      capturedProjection = projection;
      return chain;
    }),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn(async () => rows),
  };
  mockUserFind.mockReturnValue(chain);
  return chain;
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

const getAs = (app, adminId, path) => request(app)
  .get(path)
  .set('x-test-admin-id', adminId);

describe('admin route least privilege', () => {
  const originalRoleGrants = process.env.ADMIN_ROLE_GRANTS_JSON;

  beforeEach(() => {
    process.env.ADMIN_ROLE_GRANTS_JSON = JSON.stringify([
      { adminId: ADMIN_ID, role: 'admin' },
      { adminId: SUPPORT_ID, role: 'support' },
      { adminId: FINANCE_ID, role: 'finance' },
    ]);
    jest.clearAllMocks();
    capturedProjection = null;
    installUserQuery();
    mockUserCountDocuments.mockResolvedValue(1);
    mockBookingAggregate.mockResolvedValue([]);
  });

  afterAll(() => {
    if (originalRoleGrants === undefined) delete process.env.ADMIN_ROLE_GRANTS_JSON;
    else process.env.ADMIN_ROLE_GRANTS_JSON = originalRoleGrants;
  });

  test('support user search excludes KYC, subscription, and unlisted fields', async () => {
    const response = await getAs(buildApp(), SUPPORT_ID, '/api/admin/users?search=user')
      .expect(200);

    expect(capturedProjection).not.toMatch(/\bkyc\b|\bsubscription\b/);
    expect(response.body.data.users[0]).toEqual(expect.objectContaining({
      email: 'user@example.test',
      bookingCount: 0,
    }));
    expect(response.body.data.users[0]).not.toHaveProperty('kyc');
    expect(response.body.data.users[0]).not.toHaveProperty('subscription');
    expect(response.body.data.users[0]).not.toHaveProperty('internalOnly');
  });

  test('support cannot enumerate counsellor or administrator accounts', async () => {
    const response = await getAs(buildApp(), SUPPORT_ID, '/api/admin/users?role=admin')
      .expect(403);

    expect(response.body.code).toBe('ADMIN_PERMISSION_REQUIRED');
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  test('support cannot enter finance routes and finance cannot enter clinical routes', async () => {
    await getAs(buildApp(), SUPPORT_ID, '/api/admin/revenue').expect(403);
    await getAs(buildApp(), FINANCE_ID, '/api/admin/counsellors').expect(403);

    expect(mockBookingAggregate).not.toHaveBeenCalled();
  });

  test('full administrator receives explicitly selected sensitive user fields', async () => {
    const response = await getAs(buildApp(), ADMIN_ID, '/api/admin/users?role=all')
      .expect(200);

    expect(capturedProjection).toMatch(/\bkyc\b/);
    expect(capturedProjection).toMatch(/\bsubscription\b/);
    expect(response.body.data.users[0].kyc.status).toBe('manual_review');
    expect(response.body.data.users[0].subscription.plan).toBe('premium');
    expect(response.body.data.users[0]).not.toHaveProperty('internalOnly');
  });
});
