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
  const originalCredentialLimit = process.env.CREDENTIAL_RATE_LIMIT_MAX;
  const originalOtpLimit = process.env.OTP_MFA_RATE_LIMIT_MAX;
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
    if (originalCredentialLimit === undefined) delete process.env.CREDENTIAL_RATE_LIMIT_MAX;
    else process.env.CREDENTIAL_RATE_LIMIT_MAX = originalCredentialLimit;
    if (originalOtpLimit === undefined) delete process.env.OTP_MFA_RATE_LIMIT_MAX;
    else process.env.OTP_MFA_RATE_LIMIT_MAX = originalOtpLimit;
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
      credential: 'rl:auth:credential:',
      otp: 'rl:auth:otp:',
      email: 'rl:auth:email:',
      api: 'rl:api:'
    });
    expect(stores.credential.store.prefix).toBe(RATE_LIMIT_STORE_PREFIXES.credential);
    expect(stores.otp.store.prefix).toBe(RATE_LIMIT_STORE_PREFIXES.otp);
    expect(stores.email.store.prefix).toBe(RATE_LIMIT_STORE_PREFIXES.email);
    expect(stores.api.store.prefix).toBe(RATE_LIMIT_STORE_PREFIXES.api);
    expect(stores.credential.store.prefix).not.toBe(stores.otp.store.prefix);
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

  test('does not apply the credential limiter to the MFA endpoint', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1';
    process.env.OTP_MFA_RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    mountRateLimiters(app, { redisReady: false });
    app.post('/api/auth/login', (_req, res) => res.json({ success: true }));
    app.post('/api/auth/login/mfa', (_req, res) => res.json({ success: true }));

    await request(app).post('/api/auth/login').send({ email: 'a@example.com' }).expect(200);
    await request(app)
      .post('/api/auth/login/mfa')
      .send({ challengeId: 'challenge-one' })
      .expect(200);
    await request(app)
      .post('/api/auth/login/mfa')
      .send({ challengeId: 'challenge-one' })
      .expect(429)
      .expect({ success: false, message: 'Too many verification attempts. Please try again later.' });
  });

  test('does not consume the generic API bucket for exact auth paths, including trailing slashes', async () => {
    process.env.CREDENTIAL_RATE_LIMIT_MAX = '10';
    process.env.RATE_LIMIT_MAX_REQUESTS = '1';
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    mountRateLimiters(app, { redisReady: false });
    app.post('/api/auth/login', (_req, res) => res.json({ success: true }));
    app.post('/api/health-check', (_req, res) => res.json({ success: true }));

    await request(app).post('/api/auth/login/').send({ email: 'a@example.com' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'a@example.com' }).expect(200);
    await request(app).post('/api/health-check').expect(200);
    await request(app).post('/api/health-check').expect(429);
  });

  test('social linking is rate limited by session rather than a caller-controlled provider email', async () => {
    process.env.CREDENTIAL_RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    mountRateLimiters(app, { redisReady: false });
    app.post('/api/auth/social/link', (_req, res) => res.json({ success: true }));

    await request(app)
      .post('/api/auth/social/link')
      .set('Authorization', 'Bearer session-token-for-rate-test')
      .send({ email: 'first-provider@example.com' })
      .expect(200);
    await request(app)
      .post('/api/auth/social/link')
      .set('Authorization', 'Bearer session-token-for-rate-test')
      .send({ email: 'different-provider@example.com' })
      .expect(429);
  });
});
