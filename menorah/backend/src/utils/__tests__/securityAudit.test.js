const express = require('express');
const request = require('supertest');
const {
  recordSecurityEvent,
  renderSecurityMetrics,
  resetSecurityMetricsForTests,
  securityAuditTrail,
  verifyAuditChain,
} = require('../securityAudit');
const { buildPasswordResetUrl } = require('../email');
const { attachValidatedRequestProvenance } = require('../../shared/app/requestProvenance');

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

  test('retains bounded operational-role denial evidence', () => {
    recordSecurityEvent('admin_permission_denied', {
      req: { method: 'GET', originalUrl: '/api/admin/revenue' },
      outcome: 'failure',
      statusCode: 403,
      details: {
        reason: 'admin_permission_required',
        permission: 'finance_read',
        operationalRole: 'support',
        token: 'must-not-be-recorded',
      },
    });

    const entry = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(entry).toMatchObject({
      event: 'admin_permission_denied',
      permission: 'finance_read',
      operationalRole: 'support',
      reason: 'admin_permission_required',
    });
    expect(JSON.stringify(entry)).not.toContain('must-not-be-recorded');
  });

  test('keeps successful account deletion classified as session revocation', async () => {
    const app = express();
    app.use(securityAuditTrail);
    app.delete('/api/users/account', (req, res) => {
      req.user = {
        _id: '64f000000000000000000021',
        role: 'user',
      };
      res.status(200).json({ success: true });
    });

    await request(app).delete('/api/users/account').expect(200);

    const entries = infoSpy.mock.calls.map(([line]) => JSON.parse(line));
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'session_revoked',
        outcome: 'success',
        path: '/api/users/account',
        statusCode: 200,
        action: 'account_disabled',
      }),
    ]));
  });

  test('does not audit a direct caller under a spoofed forwarded IP', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(attachValidatedRequestProvenance);
    app.post('/audit', (req, res) => {
      recordSecurityEvent('manual_probe', { req });
      res.sendStatus(204);
    });

    await request(app)
      .post('/audit')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('CF-Connecting-IP', '203.0.113.11')
      .expect(204);

    const entry = JSON.parse(infoSpy.mock.calls[0][0]);
    expect(entry.sourceIp).not.toBe('203.0.113.10');
    expect(entry.sourceIp).not.toBe('203.0.113.11');
  });

  test('audits the client IP supplied through the explicitly trusted proxy', async () => {
    const app = express();
    app.set('trust proxy', 'loopback');
    app.use(attachValidatedRequestProvenance);
    app.post('/audit', (req, res) => {
      recordSecurityEvent('manual_probe', { req });
      res.sendStatus(204);
    });

    await request(app)
      .post('/audit')
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(204);

    expect(JSON.parse(infoSpy.mock.calls[0][0]).sourceIp).toBe('203.0.113.10');
  });
});

describe('password reset email URLs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'production',
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
    process.env.NODE_ENV = 'test';
    process.env.PASSWORD_RESET_URL_TEMPLATE =
      'https://app.menorah.me/reset-password?token={token}';
    const resetUrl = new URL(buildPasswordResetUrl('reset-token'));

    expect(resetUrl.searchParams.has('token')).toBe(false);
    expect(resetUrl.hash).toBe('#token=reset-token');
  });

  test('fails closed for non-canonical production reset destinations', () => {
    process.env.PASSWORD_RESET_BASE_URL = 'http://untrusted.example/reset-password';
    expect(() => buildPasswordResetUrl('reset-token'))
      .toThrow(/PASSWORD_RESET_BASE_URL must equal https:\/\/app\.menorah\.me/);
  });

  test('supports a distinct HTTPS reset origin in production-like staging', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    process.env.PASSWORD_RESET_BASE_URL = 'https://app.staging.example.com';
    const resetUrl = new URL(buildPasswordResetUrl('reset-token'));

    expect(resetUrl.origin).toBe('https://app.staging.example.com');
    expect(resetUrl.pathname).toBe('/reset-password');
    expect(resetUrl.search).toBe('');
    expect(resetUrl.hash).toBe('#token=reset-token');
  });

  test.each([
    'https://app.menorah.me',
    'https://app.menorah.me.',
    'https://app.menorah.me:8443',
    'http://app.staging.example.com',
    'https://app.staging.example.com:8443',
    'https://app.staging.example.com/',
    'https://app.staging.example.com/reset-password',
  ])('fails closed for an unsafe staging reset origin %s', (value) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    process.env.PASSWORD_RESET_BASE_URL = value;

    expect(() => buildPasswordResetUrl('reset-token'))
      .toThrow(/PASSWORD_RESET_BASE_URL/);
  });

  test('fails closed for an invalid deployment environment', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'preview';

    expect(() => buildPasswordResetUrl('reset-token'))
      .toThrow(/DEPLOYMENT_ENVIRONMENT must be exactly production or staging/);
  });

  test('fails closed when staging would suppress production email behavior', () => {
    process.env.NODE_ENV = 'development';
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    process.env.PASSWORD_RESET_BASE_URL = 'https://app.staging.example.com';

    expect(() => buildPasswordResetUrl('reset-token'))
      .toThrow(/DEPLOYMENT_ENVIRONMENT=staging requires NODE_ENV=production/);
  });
});
