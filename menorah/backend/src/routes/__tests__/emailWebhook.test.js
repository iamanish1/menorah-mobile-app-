const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockRedisSet = jest.fn();
jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({ set: mockRedisSet }),
}));

const emailWebhookRouter = require('../email-webhook');
const {
  renderReliabilityMetrics,
  resetReliabilityMetricsForTests,
} = require('../../utils/reliabilityMetrics');

const secretBytes = Buffer.from('synthetic-resend-webhook-secret-32b');
const secret = `whsec_${secretBytes.toString('base64')}`;

const signedHeaders = (body, {
  id = 'msg_synthetic_event_123456',
  timestamp = Math.floor(Date.now() / 1000),
} = {}) => {
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  };
};

const buildApp = () => {
  const app = express();
  app.use('/api/email/resend', express.raw({ type: 'application/json' }));
  app.use('/api/email', emailWebhookRouter);
  return app;
};

describe('Resend delivery webhook', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SERVICE_NAME: 'api-web',
      RESEND_WEBHOOK_SECRET: secret,
    };
    mockRedisSet.mockReset().mockResolvedValue('OK');
    resetReliabilityMetricsForTests();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('accepts a signed bounce without exporting recipient or message identity', async () => {
    const body = JSON.stringify({
      type: 'email.bounced',
      data: {
        email_id: 'synthetic-message-id',
        to: ['recipient@example.com'],
      },
    });
    await request(buildApp())
      .post('/api/email/resend')
      .set('content-type', 'application/json')
      .set(signedHeaders(body))
      .send(body)
      .expect(200);

    const metrics = renderReliabilityMetrics();
    expect(metrics).toContain(
      'menorah_email_delivery_outcomes_total{service="api-web",provider="resend",outcome="bounced"} 1'
    );
    expect(metrics).not.toContain('recipient@example.com');
    expect(metrics).not.toContain('synthetic-message-id');
  });

  test('deduplicates at-least-once delivery by the hashed Svix identity', async () => {
    const body = JSON.stringify({ type: 'email.failed', data: {} });
    mockRedisSet.mockResolvedValue(null);
    const response = await request(buildApp())
      .post('/api/email/resend')
      .set('content-type', 'application/json')
      .set(signedHeaders(body))
      .send(body)
      .expect(200);

    expect(response.body).toEqual({ success: true, duplicate: true });
    expect(renderReliabilityMetrics()).not.toContain(
      'menorah_email_delivery_outcomes_total{'
    );
    const [key] = mockRedisSet.mock.calls[0];
    expect(key).toMatch(/^email:webhook:[a-f0-9]{64}$/);
    expect(key).not.toContain('msg_synthetic_event');
  });

  test('rejects invalid signatures before replay state or metrics mutate', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: {} });
    await request(buildApp())
      .post('/api/email/resend')
      .set('content-type', 'application/json')
      .set({
        ...signedHeaders(body),
        'svix-signature': `v1,${Buffer.alloc(32).toString('base64')}`,
      })
      .send(body)
      .expect(400);

    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(renderReliabilityMetrics()).not.toContain(
      'menorah_email_delivery_outcomes_total{'
    );
  });
});
