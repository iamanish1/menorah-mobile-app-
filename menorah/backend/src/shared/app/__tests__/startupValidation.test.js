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
      REDIS_URL: 'redis://redis:6379',
      RESEND_API_KEY: 'resend-key',
      EMAIL_FROM: 'Menorah <noreply@example.com>',
      APP_DOMAIN: 'app.example.com',
      PASSWORD_RESET_URL_TEMPLATE: 'https://app.example.com/reset-password?token={token}',
      RAZORPAY_KEY_ID: 'razorpay-key',
      RAZORPAY_KEY_SECRET: 'razorpay-secret',
      RAZORPAY_WEBHOOK_SECRET: 'razorpay-webhook',
      LIVEKIT_URL: 'wss://calls.example.com',
      LIVEKIT_API_URL: 'https://calls.example.com',
      LIVEKIT_API_KEY: 'livekit-key',
      LIVEKIT_API_SECRET: 'livekit-secret',
    };
    delete process.env.SESSION_COOKIE_DOMAIN;
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

  test('rejects domain-scoped browser session cookies in production', () => {
    process.env.SESSION_COOKIE_DOMAIN = '.example.com';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/SESSION_COOKIE_DOMAIN must be unset/);
  });

  test('requires a HTTPS password reset template with a token placeholder in production', () => {
    process.env.PASSWORD_RESET_URL_TEMPLATE = 'menorah-health://reset-password';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/PASSWORD_RESET_URL_TEMPLATE/);
  });

  test('pins reset links to the canonical app domain and path in production', () => {
    process.env.PASSWORD_RESET_URL_TEMPLATE = 'https://other.example.com/reset-password?token={token}';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/canonical APP_DOMAIN/);
  });

  test('passes with redacted provider configuration present', () => {
    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });
});
