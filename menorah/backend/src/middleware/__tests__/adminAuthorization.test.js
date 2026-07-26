const express = require('express');
const request = require('supertest');

const ADMIN_ID = '64f000000000000000000111';
const SUPPORT_ID = '64f000000000000000000112';
const FINANCE_ID = '64f000000000000000000113';
const CONTENT_ID = '64f000000000000000000114';
const mockRecordSecurityEvent = jest.fn();

jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: (...args) => mockRecordSecurityEvent(...args),
}));

const {
  requireAdminPermission,
  requireAssignedAdminRole,
} = require('../adminAuthorization');

const grants = (overrides = []) => JSON.stringify([
  { adminId: ADMIN_ID, role: 'admin' },
  { adminId: SUPPORT_ID, role: 'support' },
  { adminId: FINANCE_ID, role: 'finance' },
  { adminId: CONTENT_ID, role: 'content' },
  ...overrides,
]);

const buildApp = () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      _id: req.get('x-test-admin-id'),
      role: req.get('x-test-database-role') || 'admin',
    };
    next();
  });
  app.get('/assigned', requireAssignedAdminRole, (_req, res) => res.sendStatus(204));
  app.get('/support', requireAdminPermission('support_read'), (_req, res) => res.sendStatus(204));
  app.get('/finance', requireAdminPermission('finance_read'), (_req, res) => res.sendStatus(204));
  app.get('/clinical', requireAdminPermission('clinical_read'), (_req, res) => res.sendStatus(204));
  app.get('/content-file', requireAdminPermission('content_manage'), (_req, res) => res.sendStatus(204));
  return app;
};

const getAs = (app, adminId, path) => request(app)
  .get(path)
  .set('x-test-admin-id', adminId);

describe('admin operational authorization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADMIN_ROLE_GRANTS_JSON: grants(),
    };
    mockRecordSecurityEvent.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('support cannot access finance, clinical, or content-file functions', async () => {
    const app = buildApp();
    await getAs(app, SUPPORT_ID, '/support').expect(204);
    await getAs(app, SUPPORT_ID, '/finance').expect(403);
    await getAs(app, SUPPORT_ID, '/clinical').expect(403);
    await getAs(app, SUPPORT_ID, '/content-file').expect(403);
  });

  test('finance cannot access support or clinical functions', async () => {
    const app = buildApp();
    await getAs(app, FINANCE_ID, '/finance').expect(204);
    await getAs(app, FINANCE_ID, '/support').expect(403);
    await getAs(app, FINANCE_ID, '/clinical').expect(403);
  });

  test('content can manage content files but cannot access support or finance', async () => {
    const app = buildApp();
    await getAs(app, CONTENT_ID, '/content-file').expect(204);
    await getAs(app, CONTENT_ID, '/support').expect(403);
    await getAs(app, CONTENT_ID, '/finance').expect(403);
  });

  test('a full administrator can access every bounded function', async () => {
    const app = buildApp();
    await getAs(app, ADMIN_ID, '/support').expect(204);
    await getAs(app, ADMIN_ID, '/finance').expect(204);
    await getAs(app, ADMIN_ID, '/clinical').expect(204);
    await getAs(app, ADMIN_ID, '/content-file').expect(204);
  });

  test('permission removal takes effect for the next request without a new token', async () => {
    const app = buildApp();
    await getAs(app, SUPPORT_ID, '/support').expect(204);

    process.env.ADMIN_ROLE_GRANTS_JSON = JSON.stringify([
      { adminId: ADMIN_ID, role: 'admin' },
      { adminId: FINANCE_ID, role: 'finance' },
      { adminId: CONTENT_ID, role: 'content' },
    ]);

    const response = await getAs(app, SUPPORT_ID, '/support').expect(403);
    expect(response.body.code).toBe('ADMIN_ROLE_ASSIGNMENT_REQUIRED');
  });

  test('invalid configuration fails closed before route execution', async () => {
    process.env.ADMIN_ROLE_GRANTS_JSON = '[]';
    const response = await getAs(buildApp(), ADMIN_ID, '/clinical').expect(503);
    expect(response.body.code).toBe('ADMIN_ROLE_CONFIGURATION_INVALID');
  });

  test('denials emit a bounded security event without request credentials', async () => {
    await getAs(buildApp(), SUPPORT_ID, '/finance').expect(403);

    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'admin_permission_denied',
      expect.objectContaining({
        outcome: 'failure',
        statusCode: 403,
        details: {
          reason: 'admin_permission_required',
          permission: 'finance_read',
          operationalRole: 'support',
        },
      })
    );
    const event = mockRecordSecurityEvent.mock.calls[0][1];
    expect(event.details).not.toHaveProperty('token');
    expect(event.details).not.toHaveProperty('password');
  });
});
