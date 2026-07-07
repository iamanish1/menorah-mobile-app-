const express = require('express');
const request = require('supertest');
const { getRateLimitClientIp, mountRateLimiters } = require('../startService');

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

  test('prefers Cloudflare client IP before proxy IP', () => {
    const req = {
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.5, 172.22.0.3'
      },
      ip: '172.22.0.3'
    };

    expect(getRateLimitClientIp(req)).toBe('203.0.113.10');
  });

  test('uses separate login rate-limit buckets for separate client IPs', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';

    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    mountRateLimiters(app, { redisReady: false });
    app.post('/api/auth/login', (_req, res) => res.json({ success: true }));

    await request(app)
      .post('/api/auth/login')
      .set('CF-Connecting-IP', '203.0.113.10')
      .send({})
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .set('CF-Connecting-IP', '203.0.113.10')
      .send({})
      .expect(429);

    await request(app)
      .post('/api/auth/login')
      .set('CF-Connecting-IP', '203.0.113.11')
      .send({})
      .expect(200);
  });
});
