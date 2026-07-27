const express = require('express');
const request = require('supertest');
const {
  createRateLimitStores,
  getRateLimitClientIp,
  mountRateLimiters,
  RATE_LIMIT_STORE_PREFIXES
} = require('../startService');

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

  test('keeps authentication and general API counters in distinct Redis namespaces', () => {
    const stores = createRateLimitStores(true);

    expect(RATE_LIMIT_STORE_PREFIXES).toEqual({
      auth: 'rl:auth:',
      api: 'rl:api:'
    });
    expect(stores.auth.store.prefix).toBe(RATE_LIMIT_STORE_PREFIXES.auth);
    expect(stores.api.store.prefix).toBe(RATE_LIMIT_STORE_PREFIXES.api);
    expect(stores.auth.store.prefix).not.toBe(stores.api.store.prefix);
  });

  test('returns a JSON message when an authentication request is rate limited', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';

    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    mountRateLimiters(app, { redisReady: false });
    app.post('/api/auth/google', (_req, res) => res.json({ success: true }));

    await request(app)
      .post('/api/auth/google')
      .send({})
      .expect(200);

    await request(app)
      .post('/api/auth/google')
      .send({})
      .expect(429)
      .expect('Content-Type', /json/)
      .expect({
        success: false,
        message: 'Too many authentication attempts. Please try again later.'
      });
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
