const express = require('express');
const request = require('supertest');

const mockAdminIds = Object.freeze({
  'Bearer admin-a': '64f000000000000000000002',
  'Bearer admin-reader': '64f000000000000000000003',
  'Bearer admin-reviewer': '64f000000000000000000004',
  'Bearer admin-unassigned': '64f000000000000000000005',
});
const mockRequestId = '64f000000000000000000011';
const mockListAdminRequests = jest.fn();
const mockListAdminDeletionRequests = jest.fn();
const mockGetPayload = jest.fn();
const mockTransitionRights = jest.fn();
const mockTransitionDeletion = jest.fn();
const mockSetLegalHold = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, res, next) => {
    const token = req.header('Authorization');
    if (![
      'Bearer admin-a',
      'Bearer admin-reader',
      'Bearer admin-reviewer',
      'Bearer admin-unassigned',
    ].includes(token)) {
      return res.status(401).json({ success: false });
    }
    req.user = {
      _id: mockAdminIds[token],
      role: 'admin',
      // Deliberately stale legacy state: authorization must ignore it.
      privacyPermissions: [
        'privacy_reader',
        'privacy_reviewer',
        'privacy_legal_hold',
      ],
    };
    req.auth = { decoded: { mfaVerifiedAt: Date.now() } };
    return next();
  },
  requireRecentAdminMfa: (req, res, next) => (
    req.header('X-Test-Fresh-Mfa') === 'true'
      ? next()
      : res.status(403).json({ success: false, code: 'ADMIN_MFA_FRESHNESS_REQUIRED' })
  ),
}));

jest.mock('../../services/privacyRightsWorkflow', () => ({
  privacyRightsWorkflow: {
    listAdminRequests: (...args) => mockListAdminRequests(...args),
    listAdminDeletionRequests: (...args) => mockListAdminDeletionRequests(...args),
    getRequestPayloadForAdmin: (...args) => mockGetPayload(...args),
    transitionRightsRequest: (...args) => mockTransitionRights(...args),
    transitionDeletionRequest: (...args) => mockTransitionDeletion(...args),
    setLegalHold: (...args) => mockSetLegalHold(...args),
  },
  serializeRightsRequest: (value) => ({
    id: String(value._id),
    requestType: value.requestType,
    status: value.status,
  }),
  serializeDeletionRequest: (value) => ({
    id: String(value._id),
    status: value.status,
  }),
}));

jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: jest.fn(),
}));

const privacyAdminRouter = require('../privacy-admin');

const buildApp = () => {
  const app = express();
  app.set('serviceName', 'api-admin');
  app.use(express.json());
  app.use('/api/privacy', privacyAdminRouter);
  return app;
};

describe('privacy admin authorization', () => {
  const originalGrants = process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = JSON.stringify([
      {
        adminId: mockAdminIds['Bearer admin-a'],
        permissions: [
          'privacy_reader',
          'privacy_reviewer',
          'privacy_legal_hold',
        ],
      },
      {
        adminId: mockAdminIds['Bearer admin-reader'],
        permissions: ['privacy_reader'],
      },
      {
        adminId: mockAdminIds['Bearer admin-reviewer'],
        permissions: ['privacy_reviewer'],
      },
    ]);
    mockListAdminRequests.mockResolvedValue([]);
    mockListAdminDeletionRequests.mockResolvedValue([]);
    mockGetPayload.mockResolvedValue({
      request: {
        _id: mockRequestId,
        requestType: 'correction',
        status: 'under_review',
      },
      payload: { description: 'Sensitive correction detail.' },
    });
  });

  afterAll(() => {
    if (originalGrants === undefined) {
      delete process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON;
    } else {
      process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = originalGrants;
    }
  });

  test('rejects a user token from the admin queue', async () => {
    const response = await request(buildApp())
      .get('/api/privacy/requests')
      .set('Authorization', 'Bearer user-a')
      .expect(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(mockListAdminRequests).not.toHaveBeenCalled();
  });

  test('does not grant privacy queue access to an unassigned admin', async () => {
    const response = await request(buildApp())
      .get('/api/privacy/requests')
      .set('Authorization', 'Bearer admin-unassigned')
      .expect(403);

    expect(response.body.code).toBe('PRIVACY_PERMISSION_REQUIRED');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(mockListAdminRequests).not.toHaveBeenCalled();
  });

  test('fails closed when the authoritative map becomes invalid', async () => {
    process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = '[]';

    const response = await request(buildApp())
      .get('/api/privacy/requests')
      .set('Authorization', 'Bearer admin-a')
      .expect(503);

    expect(response.body.code)
      .toBe('PRIVACY_PERMISSION_CONFIGURATION_INVALID');
    expect(mockListAdminRequests).not.toHaveBeenCalled();
  });

  test('keeps reader, reviewer, and legal-hold functions distinct', async () => {
    await request(buildApp())
      .get('/api/privacy/requests')
      .set('Authorization', 'Bearer admin-reader')
      .expect(200);

    await request(buildApp())
      .get(`/api/privacy/requests/${mockRequestId}/payload`)
      .set('Authorization', 'Bearer admin-reader')
      .set('X-Test-Fresh-Mfa', 'true')
      .expect(403);

    await request(buildApp())
      .post(`/api/privacy/requests/${mockRequestId}/legal-hold`)
      .set('Authorization', 'Bearer admin-reviewer')
      .set('X-Test-Fresh-Mfa', 'true')
      .send({ action: 'apply', policyReference: 'hold-policy-0001' })
      .expect(403);
    expect(mockGetPayload).not.toHaveBeenCalled();
    expect(mockSetLegalHold).not.toHaveBeenCalled();
  });

  test.each([
    ['GET', `/api/privacy/requests/${mockRequestId}/payload`],
    ['POST', `/api/privacy/requests/${mockRequestId}/status`],
    ['POST', `/api/privacy/deletion-requests/${mockRequestId}/status`],
    ['POST', `/api/privacy/requests/${mockRequestId}/legal-hold`],
  ])('requires fresh MFA for sensitive admin %s %s', async (method, path) => {
    const pending = request(buildApp())[method.toLowerCase()](path)
      .set('Authorization', 'Bearer admin-a');
    if (method === 'POST') {
      pending.send({
        status: 'under_review',
        action: 'apply',
        evidenceReference: 'case-evidence-0001',
        policyReference: 'hold-policy-0001',
      });
    }
    await pending.expect(403);
  });

  test('allows fresh-MFA payload review and does not place payload in route parameters', async () => {
    const response = await request(buildApp())
      .get(`/api/privacy/requests/${mockRequestId}/payload`)
      .set('Authorization', 'Bearer admin-a')
      .set('X-Test-Fresh-Mfa', 'true')
      .expect(200);

    expect(mockGetPayload).toHaveBeenCalledWith({ requestId: mockRequestId });
    expect(response.body.data.payload).toEqual({
      description: 'Sensitive correction detail.',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });
});
