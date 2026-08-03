const express = require('express');
const request = require('supertest');

const mockUserId = '64f000000000000000000001';
const mockRequestId = '64f000000000000000000011';
const mockOtherRequestId = '64f000000000000000000012';
const mockSubmitRequest = jest.fn();
const mockListOwnRequests = jest.fn();
const mockGetOwnRequest = jest.fn();
const mockGetOwnDeletionRequest = jest.fn();
const mockGetConsent = jest.fn();
const mockRecordConsent = jest.fn();
const mockRecordSecurityEvent = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => {
    const token = req.header('Authorization');
    if (token !== 'Bearer user-a') {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
    req.user = { _id: mockUserId, role: 'user' };
    return next();
  },
}));

jest.mock('../../services/privacyConsentService', () => ({
  privacyConsentService: {
    getCurrent: (...args) => mockGetConsent(...args),
    record: (...args) => mockRecordConsent(...args),
  },
}));

jest.mock('../../services/privacyRightsWorkflow', () => ({
  privacyRightsWorkflow: {
    submitRequest: (...args) => mockSubmitRequest(...args),
    listOwnRequests: (...args) => mockListOwnRequests(...args),
    getOwnRequest: (...args) => mockGetOwnRequest(...args),
    getOwnDeletionRequest: (...args) => mockGetOwnDeletionRequest(...args),
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
  recordSecurityEvent: (...args) => mockRecordSecurityEvent(...args),
}));

const privacyRouter = require('../privacy');

const buildApp = () => {
  const app = express();
  app.set('serviceName', 'api-web');
  app.use(express.json());
  app.use('/api/privacy', privacyRouter);
  return app;
};

const makeRightsRequest = (requestType = 'export') => ({
  _id: mockRequestId,
  user: mockUserId,
  requestType,
  status: 'submitted',
});

describe('privacy self-service authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitRequest.mockImplementation(async ({ requestType }) => ({
      request: makeRightsRequest(requestType),
      created: true,
    }));
    mockListOwnRequests.mockResolvedValue([makeRightsRequest()]);
    mockGetOwnRequest.mockImplementation(async ({ userId, requestId }) => (
      userId === mockUserId && requestId === mockRequestId
        ? makeRightsRequest()
        : null
    ));
    mockGetOwnDeletionRequest.mockImplementation(async ({ userId, requestId }) => (
      userId === mockUserId && (!requestId || requestId === mockRequestId)
        ? { _id: mockRequestId, user: mockUserId, status: 'pending' }
        : null
    ));
    mockGetConsent.mockResolvedValue(null);
    mockRecordConsent.mockResolvedValue({
      event: {
        _id: mockRequestId,
        consentAction: 'withdrawn',
        noticeVersion: 'approved-privacy-v1',
        occurredAt: new Date('2026-07-23T10:00:00.000Z'),
        source: 'api-web',
      },
      created: true,
    });
  });

  test.each([
    ['missing token', undefined],
    ['admin token', 'Bearer admin-a'],
  ])('rejects %s on export self-service', async (_label, authorization) => {
    const pending = request(buildApp()).post('/api/privacy/requests/export');
    if (authorization) pending.set('Authorization', authorization);
    await pending.send({ scope: 'account_data' }).expect(401);
    expect(mockSubmitRequest).not.toHaveBeenCalled();
  });

  test.each([
    ['export', { scope: 'account_data' }],
    ['correction', {
      correctionFields: ['email'],
      description: 'Please correct my account email address.',
    }],
    ['grievance', {
      description: 'Please review my privacy grievance and contact me.',
    }],
  ])('creates only the authenticated user %s request', async (type, body) => {
    await request(buildApp())
      .post(`/api/privacy/requests/${type}`)
      .set('Authorization', 'Bearer user-a')
      .set('Idempotency-Key', `${type}-request-0001`)
      .send(body)
      .expect(202);

    expect(mockSubmitRequest).toHaveBeenCalledWith(expect.objectContaining({
      user: { _id: mockUserId, role: 'user' },
      requestType: type,
      source: 'api-web',
    }));
    expect(mockSubmitRequest.mock.calls[0][0]).not.toHaveProperty('userId');
  });

  test('does not leak correction or grievance text into security audit metadata', async () => {
    const sensitive = 'Sensitive correction detail that must not appear in logs.';
    await request(buildApp())
      .post('/api/privacy/requests/correction')
      .set('Authorization', 'Bearer user-a')
      .send({
        correctionFields: ['other'],
        description: sensitive,
      })
      .expect(202);

    const auditDetails = mockRecordSecurityEvent.mock.calls
      .map(([, options]) => options.details);
    expect(JSON.stringify(auditDetails)).not.toContain(sensitive);
    expect(JSON.stringify(auditDetails)).not.toContain('correctionFields');
  });

  test('uses an exact owner predicate and returns not-found for another request ID', async () => {
    await request(buildApp())
      .get(`/api/privacy/requests/${mockOtherRequestId}`)
      .set('Authorization', 'Bearer user-a')
      .expect(404);

    expect(mockGetOwnRequest).toHaveBeenCalledWith({
      userId: mockUserId,
      requestId: mockOtherRequestId,
    });
  });

  test('uses an exact owner predicate for deletion requests', async () => {
    await request(buildApp())
      .get(`/api/privacy/deletion-requests/${mockOtherRequestId}`)
      .set('Authorization', 'Bearer user-a')
      .expect(404);

    expect(mockGetOwnDeletionRequest).toHaveBeenCalledWith({
      userId: mockUserId,
      requestId: mockOtherRequestId,
    });
  });

  test('returns only durable export-request metadata, never an inline archive', async () => {
    const response = await request(buildApp())
      .post('/api/privacy/requests/export')
      .set('Authorization', 'Bearer user-a')
      .send({ scope: 'account_data' })
      .expect(202);

    expect(response.body.data.request).toEqual({
      id: mockRequestId,
      requestType: 'export',
      status: 'submitted',
    });
    expect(response.body).not.toHaveProperty('downloadUrl');
    expect(JSON.stringify(response.body)).not.toMatch(/email|phone|password|clinical/i);
    expect(response.body.message).toMatch(/secure delivery.*not available/i);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });

  test('withdrawal response explicitly avoids an immediate-erasure promise', async () => {
    const response = await request(buildApp())
      .post('/api/privacy/consent')
      .set('Authorization', 'Bearer user-a')
      .send({ action: 'withdrawn' })
      .expect(201);

    expect(mockRecordConsent).toHaveBeenCalledWith(expect.objectContaining({
      user: { _id: mockUserId, role: 'user' },
      action: 'withdrawn',
      source: 'api-web',
    }));
    expect(response.body.message).toMatch(/does not promise immediate erasure/i);
  });
});
