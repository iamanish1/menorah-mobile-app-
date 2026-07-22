const { validateStartupEnv } = require('../startupValidation');
const {
  FACE_CHECK_CONSENT_VERSION,
  FACE_CHECK_RETENTION_DAYS,
} = require('../../../config/kyc');

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
      DATA_ENCRYPTION_KEY: 'x'.repeat(64),
      AUDIT_LOG_SIGNING_KEY: 'y'.repeat(64),
      MAX_PAYOUT_AMOUNT_PAISE: '5000000',
      KYC_CONSENT_VERSION: FACE_CHECK_CONSENT_VERSION,
      KYC_RETENTION_DAYS: String(FACE_CHECK_RETENTION_DAYS),
      RAZORPAY_KEY_ID: 'razorpay-key',
      RAZORPAY_KEY_SECRET: 'razorpay-secret',
      RAZORPAY_WEBHOOK_SECRET: 'razorpay-webhook',
      LIVEKIT_URL: 'wss://calls.example.com',
      LIVEKIT_API_URL: 'https://calls.example.com',
      LIVEKIT_API_KEY: 'livekit-key',
      LIVEKIT_API_SECRET: 'livekit-secret',
      ADMIN_MFA_REQUIRED: 'true',
      ADMIN_JWT_EXPIRES_IN: '30m',
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

  test('requires the bank-account encryption key for API services', () => {
    delete process.env.DATA_ENCRYPTION_KEY;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/DATA_ENCRYPTION_KEY must contain at least 32/);
  });

  test('requires explicit finance and privacy policy settings in production', () => {
    delete process.env.MAX_PAYOUT_AMOUNT_PAISE;
    delete process.env.KYC_CONSENT_VERSION;
    delete process.env.KYC_RETENTION_DAYS;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/MAX_PAYOUT_AMOUNT_PAISE.*KYC_RETENTION_DAYS.*KYC_CONSENT_VERSION/);
  });

  test('rejects a payout limit above the approved INR 50,000 cap', () => {
    process.env.MAX_PAYOUT_AMOUNT_PAISE = '5000001';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/MAX_PAYOUT_AMOUNT_PAISE must equal 5000000/);
  });

  test('rejects an unapproved face-check notice version', () => {
    process.env.KYC_CONSENT_VERSION = 'legacy-notice';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/KYC_CONSENT_VERSION must equal ordinary-face-check-v1-2026-07-22/);
  });

  test('rejects a face-check retention period other than 365 days', () => {
    process.env.KYC_RETENTION_DAYS = '366';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/KYC_RETENTION_DAYS must equal 365/);
  });

  test('rejects weak production integrity keys', () => {
    process.env.AUDIT_LOG_SIGNING_KEY = 'too-short';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/AUDIT_LOG_SIGNING_KEY must contain at least 32/);
  });

  test('requires distinct encryption and audit signing keys', () => {
    process.env.AUDIT_LOG_SIGNING_KEY = process.env.DATA_ENCRYPTION_KEY;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/DATA_ENCRYPTION_KEY and AUDIT_LOG_SIGNING_KEY must be distinct/);
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

  test('rejects a production admin session longer than 30 minutes', () => {
    process.env.ADMIN_JWT_EXPIRES_IN = '8h';

    expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
      .toThrow(/ADMIN_JWT_EXPIRES_IN must be a duration of 30m or less/);
  });

  test('requires admin MFA in production', () => {
    process.env.ADMIN_MFA_REQUIRED = 'false';

    expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
      .toThrow(/ADMIN_MFA_REQUIRED must be true/);
  });

  test('passes with redacted provider configuration present', () => {
    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });
});
