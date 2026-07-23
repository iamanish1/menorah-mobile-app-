const express = require('express');
const request = require('supertest');
const { getRateLimitClientIp, mountRateLimiters } = require('../startService');
const { attachValidatedRequestProvenance } = require('../requestProvenance');

describe('rate limit client IP handling', () => {
  const originalAuthLimit = process.env.AUTH_RATE_LIMIT_MAX;
  const originalApiLimit = process.env.RATE_LIMIT_MAX_REQUESTS;

  afterEach(() => {
    if (originalAuthLimit === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX = originalAuthLimit;
    }

    if (originalApiLimit === undefined) {
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.RATE_LIMIT_MAX_REQUESTS = originalApiLimit;
    }
  });

  test('uses the validated Express IP and ignores raw forwarding headers', () => {
    const req = {
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.5, 172.22.0.3'
      },
      ip: '172.22.0.3'
    };

    expect(getRateLimitClientIp(req)).toBe('172.22.0.3');
  });

  test('direct spoofed headers cannot create separate login buckets', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';

    const app = express();
    app.set('trust proxy', false);
    app.use(attachValidatedRequestProvenance);
    app.use(express.json());
    mountRateLimiters(app, { redisReady: false });
    app.post('/api/auth/login', (_req, res) => res.json({ success: true }));

    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({})
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.11')
      .send({})
      .expect(429);
  });

  test('uses separate login buckets for clients forwarded by the trusted proxy', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';

    const app = express();
    app.set('trust proxy', 'loopback');
    app.use(attachValidatedRequestProvenance);
    app.use(express.json());
    mountRateLimiters(app, { redisReady: false });
    app.post('/api/auth/login', (_req, res) => res.json({ success: true }));

    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({})
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.11')
      .send({})
      .expect(200);
  });
});
