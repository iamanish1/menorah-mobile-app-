const {
  recordSecurityEvent,
  renderSecurityMetrics,
  resetSecurityMetricsForTests,
} = require('../securityAudit');

describe('security audit logging', () => {
  const originalEnv = process.env;
  let infoSpy;
  let warnSpy;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SERVICE_NAME: 'api-web',
      SECURITY_AUDIT_TEST_OUTPUT: 'true',
    };
    resetSecurityMetricsForTests();
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('omits secrets and query strings from structured events', () => {
    recordSecurityEvent('session_created', {
      req: {
        method: 'POST',
        originalUrl: '/api/auth/reset-password?token=url-secret',
        ip: '192.0.2.10',
      },
      user: { _id: '64f000000000000000000021', role: 'user' },
      details: {
        action: 'password_reset',
        transport: 'cookie',
        token: 'token-secret',
        password: 'password-secret',
        cookie: 'cookie-secret',
        paymentData: 'payment-secret',
      },
    });

    const output = infoSpy.mock.calls[0][0];
    expect(output).toContain('"path":"/api/auth/reset-password"');
    expect(output).toContain('"transport":"cookie"');
    expect(output).not.toContain('url-secret');
    expect(output).not.toContain('token-secret');
    expect(output).not.toContain('password-secret');
    expect(output).not.toContain('cookie-secret');
    expect(output).not.toContain('payment-secret');
  });

  test('exports bounded Prometheus labels and counters', () => {
    recordSecurityEvent('csrf blocked!!', {
      req: { method: 'POST', originalUrl: '/api/users/profile' },
      outcome: 'failure',
      statusCode: 403,
    });

    expect(renderSecurityMetrics()).toContain(
      'menorah_security_events_total{event="csrf_blocked__",outcome="failure",service="api-web"} 1'
    );
  });
});
