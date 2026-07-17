const { validateStartupEnv } = require('../startupValidation');

describe('startup validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(64),
      MONGODB_URI: 'mongodb://mongo-primary:27017/menorah',
      ALLOWED_ORIGINS: 'https://app.example.com',
      WEB_SESSION_ORIGINS: 'https://app.example.com=user,https://counsellor.example.com=counsellor,https://admin.example.com=admin',
      SESSION_COOKIE_DOMAIN: '.example.com',
      REDIS_URL: 'redis://redis:6379',
      RESEND_API_KEY: 'resend-key',
      EMAIL_FROM: 'Menorah <noreply@example.com>',
      RAZORPAY_KEY_ID: 'razorpay-key',
      RAZORPAY_KEY_SECRET: 'razorpay-secret',
      RAZORPAY_WEBHOOK_SECRET: 'razorpay-webhook',
      LIVEKIT_URL: 'wss://calls.example.com',
      LIVEKIT_API_URL: 'https://calls.example.com',
      LIVEKIT_API_KEY: 'livekit-key',
      LIVEKIT_API_SECRET: 'livekit-secret',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('requires LiveKit configuration in production', () => {
    delete process.env.LIVEKIT_API_URL;

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).toThrow(/LIVEKIT_API_URL is missing/);
  });

  test('requires trusted browser origins for every browser role in production', () => {
    process.env.WEB_SESSION_ORIGINS = 'https://app.example.com=user';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/WEB_SESSION_ORIGINS must include a trusted counsellor origin/);
  });

  test('passes with redacted provider configuration present', () => {
    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });
});
