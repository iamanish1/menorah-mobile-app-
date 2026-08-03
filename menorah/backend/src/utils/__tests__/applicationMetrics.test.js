const {
  normalizeHttpStatus,
  normalizeRouteTemplate,
  recordAuthenticationAttempt,
  recordHttpResponse,
  renderApplicationMetrics,
  resetApplicationMetricsForTests,
} = require('../applicationMetrics');
const {
  recordRoleChange,
  resetSecurityMetricsForTests,
  verifyAuditChain,
} = require('../securityAudit');
const User = require('../../models/User');

const request = (serviceName, originalUrl) => ({
  originalUrl,
  app: {
    get: (key) => key === 'serviceName' ? serviceName : undefined,
  },
});

describe('bounded application observability metrics', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SERVICE_NAME: 'api-web',
      AUDIT_LOG_SIGNING_KEY: 'test-only-audit-signing-key-32-bytes',
    };
    resetSecurityMetricsForTests();
    resetApplicationMetricsForTests();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('normalizes request paths into a fixed route-family inventory', () => {
    expect(normalizeRouteTemplate('/api/bookings/507f1f77bcf86cd799439011?token=secret'))
      .toBe('/api/bookings/*');
    expect(normalizeRouteTemplate('/api/unrecognized/customer@example.com'))
      .toBe('/api/other');
    expect(normalizeRouteTemplate('/totally/unrecognized/15551234567'))
      .toBe('/other');
  });

  test('bounds HTTP statuses while retaining the four launch-critical values', () => {
    expect([401, 403, 429, 500].map(normalizeHttpStatus))
      .toEqual(['401', '403', '429', '500']);
    expect(normalizeHttpStatus(404)).toBe('4xx');
    expect(normalizeHttpStatus(503)).toBe('5xx');
    expect(normalizeHttpStatus('invalid')).toBe('unknown');
  });

  test('never emits raw paths, IDs, contacts, tokens, or unbounded labels', () => {
    const req = request(
      'api-web',
      '/api/bookings/507f1f77bcf86cd799439011?email=person@example.com&token=secret'
    );
    recordHttpResponse({ req, statusCode: 403 });
    recordAuthenticationAttempt({
      req,
      subject: 'attacker-controlled@example.com',
      method: 'unbounded-method',
      outcome: 'unbounded-outcome',
    });

    const metrics = renderApplicationMetrics();
    expect(metrics).toContain(
      'menorah_http_responses_total{service="api-web",route="/api/bookings/*",status="403"} 1'
    );
    expect(metrics).toContain(
      'menorah_auth_attempts_total{service="api-web",subject="user",method="other",outcome="failure"} 1'
    );
    for (const forbidden of [
      '507f1f77bcf86cd799439011',
      'person@example.com',
      'attacker-controlled@example.com',
      'token=secret',
      'unbounded-method',
      'unbounded-outcome',
    ]) {
      expect(metrics).not.toContain(forbidden);
    }
  });

  test('role changes retain a signed audit event and a separate bounded metric', () => {
    const entry = recordRoleChange({
      target: '507f1f77bcf86cd799439011',
      previousRole: 'user',
      nextRole: 'admin',
      actor: { _id: '507f191e810c19729de860ea', role: 'admin' },
    });

    expect(entry.event).toBe('admin_role_changed');
    expect(entry.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyAuditChain([entry], {
      signingKey: process.env.AUDIT_LOG_SIGNING_KEY,
    })).toEqual({ valid: true, head: entry.integrityHash });

    const metrics = renderApplicationMetrics();
    expect(metrics).toContain(
      'menorah_privilege_changes_total{service="api-web",category="admin_role",outcome="success"} 1'
    );
    expect(metrics).not.toContain('507f1f77bcf86cd799439011');
    expect(metrics).not.toContain('507f191e810c19729de860ea');
  });

  test('query updates cannot bypass document role-change auditing', async () => {
    await expect(User.updateOne(
      { _id: '507f1f77bcf86cd799439011' },
      { $set: { role: 'admin' } }
    )).rejects.toThrow(
      'Role changes must use a loaded User document and save()'
    );
  });
});
