const {
  recordSecurityEvent,
  renderSecurityMetrics,
  resetSecurityMetricsForTests,
  verifyAuditChain,
} = require('../securityAudit');
const { buildPasswordResetUrl } = require('../email');

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
      AUDIT_LOG_SIGNING_KEY: 'test-only-audit-signing-key',
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
        headers: {
          authorization: 'Bearer authorization-secret',
          cookie: 'session=cookie-header-secret',
        },
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
    expect(output).not.toContain('authorization-secret');
    expect(output).not.toContain('cookie-header-secret');
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

  test('chains signed audit events so edits are detectable', () => {
    const first = recordSecurityEvent('first_event', { req: { method: 'POST', originalUrl: '/api/users/profile' } });
    const second = recordSecurityEvent('second_event', { req: { method: 'POST', originalUrl: '/api/users/profile' } });

    expect(first.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.previousIntegrityHash).toBe(first.integrityHash);
    expect(second.integrityHash).not.toBe(first.integrityHash);
    expect(verifyAuditChain([first, second])).toEqual({
      valid: true,
      head: second.integrityHash,
    });

    const tampered = [{ ...first }, { ...second, outcome: 'failure' }];
    expect(verifyAuditChain(tampered)).toEqual({
      valid: false,
      index: 1,
      reason: 'integrity_hash_mismatch',
    });
  });
});

describe('password reset email URLs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PASSWORD_RESET_BASE_URL: 'https://app.menorah.me',
    };
    delete process.env.PASSWORD_RESET_URL_TEMPLATE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('places reset tokens only in the URL fragment', () => {
    const resetUrl = new URL(buildPasswordResetUrl('reset-token'));

    expect(resetUrl.origin).toBe('https://app.menorah.me');
    expect(resetUrl.pathname).toBe('/reset-password');
    expect(resetUrl.search).toBe('');
    expect(resetUrl.hash).toBe('#token=reset-token');
  });

  test('upgrades a legacy query-string template to a fragment', () => {
    process.env.PASSWORD_RESET_URL_TEMPLATE =
      'https://app.menorah.me/reset-password?token={token}';
    const resetUrl = new URL(buildPasswordResetUrl('reset-token'));

    expect(resetUrl.searchParams.has('token')).toBe(false);
    expect(resetUrl.hash).toBe('#token=reset-token');
  });

  test('refuses non-HTTPS production reset destinations', () => {
    process.env.PASSWORD_RESET_BASE_URL = 'http://untrusted.example/reset-password';
    const resetUrl = new URL(buildPasswordResetUrl('reset-token'));

    expect(resetUrl.origin).toBe('https://menorah.me');
  });
});
