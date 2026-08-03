const express = require('express');
const supertest = require('supertest');

const {
  renderSecurityMetrics,
  resetSecurityMetricsForTests,
  securityAuditTrail,
} = require('../securityAudit');

describe('request telemetry middleware', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_NAME = 'api-web';
    resetSecurityMetricsForTests();
  });

  test('records exact watched statuses with bounded routes and auth subjects', async () => {
    const app = express();
    app.set('serviceName', 'api-web');
    app.use(securityAuditTrail);
    app.post('/api/auth/login', (_req, res) => {
      res.locals.authenticationSubject = 'counsellor';
      res.status(401).end();
    });
    app.get('/api/bookings/:bookingId', (_req, res) => {
      res.status(403).end();
    });

    await supertest(app)
      .post('/api/auth/login?email=person@example.com')
      .expect(401);
    await supertest(app)
      .get('/api/bookings/507f1f77bcf86cd799439011')
      .expect(403);

    const metrics = renderSecurityMetrics();
    expect(metrics).toContain(
      'menorah_auth_attempts_total{service="api-web",subject="counsellor",method="password",outcome="failure"} 1'
    );
    expect(metrics).toContain(
      'menorah_http_responses_total{service="api-web",route="/api/auth/*",status="401"} 1'
    );
    expect(metrics).toContain(
      'menorah_http_responses_total{service="api-web",route="/api/bookings/*",status="403"} 1'
    );
    expect(metrics).not.toContain('person@example.com');
    expect(metrics).not.toContain('507f1f77bcf86cd799439011');
  });
});
