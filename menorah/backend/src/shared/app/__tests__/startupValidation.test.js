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
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'test-counsellor-onboarding-v1',
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: 'test-counsellor-credential-policy-v1',
      COUNSELLOR_ONBOARDING_NOTICE_URL: 'https://consent.unit-test.org/counsellor-notice',
      BOOKING_SERVICE_CATALOG_JSON: JSON.stringify({
        test_service: {
          durationMinutes: 60,
          amountMinor: 12345,
          currency: 'INR',
        },
      }),
      RAZORPAY_KEY_ID: 'rzp_live_A1b2C3d4E5f6G7',
      RAZORPAY_KEY_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2',
      RAZORPAY_WEBHOOK_SECRET: 'Webhook-A1b2C3d4E5f6G7h8',
      BOOKING_PAYMENTS_ENABLED: 'false',
      PAYOUTS_ENABLED: 'false',
      RAZORPAY_X_WEBHOOK_SECRET: 'X-Webhook-A1b2C3d4E5f6G7h8',
      SUBSCRIPTION_PAYMENTS_ENABLED: 'false',
      LIVEKIT_URL: 'wss://calls.example.com',
      LIVEKIT_API_URL: 'https://calls.example.com',
      LIVEKIT_API_KEY: 'livekit-key',
      LIVEKIT_API_SECRET: 'livekit-secret',
      ADMIN_MFA_REQUIRED: 'true',
      ADMIN_JWT_EXPIRES_IN: '30m',
    };
    delete process.env.SESSION_COOKIE_DOMAIN;
    delete process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS;
    delete process.env.PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS;
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

  test('requires an explicit server-side booking catalog in production', () => {
    delete process.env.BOOKING_SERVICE_CATALOG_JSON;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/BOOKING_SERVICE_CATALOG_JSON must contain an explicit JSON service catalog/);
  });

  test.each([
    'REPLACE_WITH_APPROVED_SERVER_PRICING_JSON',
    '{"test_service":{"durationMinutes":60,"amountMinor":0,"currency":"INR"}}',
    '{"test_service":{"durationMinutes":60,"amountMinor":12345,"currency":"USD"}}',
  ])('rejects malformed or unsafe booking catalog configuration (%s)', (catalog) => {
    process.env.BOOKING_SERVICE_CATALOG_JSON = catalog;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/BOOKING_SERVICE_CATALOG_JSON|amountMinor|currency must be INR/);
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

  test.each([
    'COUNSELLOR_ONBOARDING_CONSENT_VERSION',
    'COUNSELLOR_CREDENTIAL_POLICY_VERSION',
    'COUNSELLOR_ONBOARDING_NOTICE_URL',
  ])('requires counsellor verification configuration %s', (key) => {
    delete process.env[key];

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(new RegExp(`${key} must contain an approved non-placeholder value`));
  });

  test.each([
    ['COUNSELLOR_ONBOARDING_CONSENT_VERSION', 'REPLACE_WITH_APPROVED_VERSION'],
    ['COUNSELLOR_CREDENTIAL_POLICY_VERSION', 'pending-owner-approval'],
    ['COUNSELLOR_ONBOARDING_NOTICE_URL', 'https://example.com/counsellor-notice'],
    ['COUNSELLOR_ONBOARDING_NOTICE_URL', 'http://consent.unit-test.org/counsellor-notice'],
    ['COUNSELLOR_ONBOARDING_NOTICE_URL', 'not-a-url'],
  ])('rejects unsafe counsellor verification configuration %s=%s', (key, value) => {
    process.env[key] = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(new RegExp(key));
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

  test.each([
    ['RAZORPAY_KEY_ID', ''],
    ['RAZORPAY_KEY_ID', 'rzp_live_REPLACE'],
    ['RAZORPAY_KEY_ID', 'rzp_live_xxxxxxxxxxxxxx'],
    ['RAZORPAY_KEY_ID', 'not-a-razorpay-key'],
    ['RAZORPAY_KEY_SECRET', 'REPLACE_WITH_RAZORPAY_SECRET'],
    ['RAZORPAY_KEY_SECRET', 'local_razorpay_secret'],
    ['RAZORPAY_KEY_SECRET', 'too-short'],
    ['RAZORPAY_WEBHOOK_SECRET', 'replace_with_webhook_secret'],
    ['RAZORPAY_WEBHOOK_SECRET', 'razorpay-webhook'],
  ])('rejects malformed or placeholder payment credential %s', (key, value) => {
    process.env[key] = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(new RegExp(key));
  });

  test.each(['true', 'false'])(
    'accepts the exact booking payment gate value %s',
    (value) => {
      process.env.BOOKING_PAYMENTS_ENABLED = value;
      if (value === 'true') {
        process.env.PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS = '5';
      }

      expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
    }
  );

  test('requires an owner-approved webhook attempt bound before enabling payments', () => {
    process.env.BOOKING_PAYMENTS_ENABLED = 'true';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS is required/);
  });

  test.each(['0', '1001', '01', ' 5 ', 'five'])(
    'rejects an invalid webhook attempt bound (%p)',
    (value) => {
      process.env.PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS = value;

      expect(() => validateStartupEnv({ serviceName: 'api-web' }))
        .toThrow(/PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS must be an integer/);
    }
  );

  test('accepts a distinct optional previous webhook secret for planned rotation', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = 'Previous-Webhook-Z9y8X7w6V5u4';

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });

  test.each([
    'too-short',
    'replace_with_previous_webhook_secret',
    ' Previous-Webhook-Z9y8X7w6V5u4 ',
  ])('rejects an unsafe optional previous webhook secret (%p)', (value) => {
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RAZORPAY_WEBHOOK_SECRET_PREVIOUS/);
  });

  test('requires current and previous webhook secrets to differ', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = process.env.RAZORPAY_WEBHOOK_SECRET;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RAZORPAY_WEBHOOK_SECRET_PREVIOUS must differ/);
  });

  test('does not let a previous webhook secret replace the required current secret', () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = 'Previous-Webhook-Z9y8X7w6V5u4';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RAZORPAY_WEBHOOK_SECRET must contain/);
  });

  test.each(['TRUE', '1', 'yes', ' true '])(
    'rejects ambiguous booking payment gate value %s',
    (value) => {
      process.env.BOOKING_PAYMENTS_ENABLED = value;

      expect(() => validateStartupEnv({ serviceName: 'api-web' }))
        .toThrow(/BOOKING_PAYMENTS_ENABLED must be exactly true or false/);
    }
  );

  test('allows the booking payment gate to be unset so it defaults off', () => {
    delete process.env.BOOKING_PAYMENTS_ENABLED;

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });

  test.each(['true', 'false'])(
    'accepts the exact payout gate value %s',
    (value) => {
      process.env.PAYOUTS_ENABLED = value;
      if (value === 'true') {
        process.env.RAZORPAY_X_KEY_ID = 'rzp_live_X1b2C3d4E5f6G7';
        process.env.RAZORPAY_X_KEY_SECRET = 'RazorpayX-A1b2C3d4E5f6G7h8';
        process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER = '787808008031';
      }

      expect(() => validateStartupEnv({ serviceName: 'api-admin' })).not.toThrow();
    }
  );

  test.each(['TRUE', '1', 'yes', ' true '])(
    'rejects ambiguous payout gate value %s',
    (value) => {
      process.env.PAYOUTS_ENABLED = value;

      expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
        .toThrow(/PAYOUTS_ENABLED must be exactly true or false/);
    }
  );

  test('allows the payout gate to be unset so it defaults off', () => {
    delete process.env.PAYOUTS_ENABLED;

    expect(() => validateStartupEnv({ serviceName: 'api-admin' })).not.toThrow();
  });

  test('requires a usable payout webhook secret on api-admin while initiation is off', () => {
    delete process.env.RAZORPAY_X_WEBHOOK_SECRET;

    expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
      .toThrow(/RAZORPAY_X_WEBHOOK_SECRET must contain/);
  });

  test('does not require payout execution credentials while initiation is off', () => {
    delete process.env.RAZORPAY_X_KEY_ID;
    delete process.env.RAZORPAY_X_KEY_SECRET;
    delete process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER;

    expect(() => validateStartupEnv({ serviceName: 'api-admin' })).not.toThrow();
  });

  test.each([
    ['RAZORPAY_X_KEY_ID', 'rzp_live_REPLACE'],
    ['RAZORPAY_X_KEY_SECRET', 'replace_with_razorpay_x_key_secret'],
    ['RAZORPAY_PAYOUT_ACCOUNT_NUMBER', '111111111111'],
  ])('rejects unusable payout execution setting %s when enabled', (key, value) => {
    process.env.PAYOUTS_ENABLED = 'true';
    process.env.RAZORPAY_X_KEY_ID = 'rzp_live_X1b2C3d4E5f6G7';
    process.env.RAZORPAY_X_KEY_SECRET = 'RazorpayX-A1b2C3d4E5f6G7h8';
    process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER = '787808008031';
    process.env[key] = value;

    expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
      .toThrow(new RegExp(key));
  });

  test('does not accept checkout credentials as a payout execution fallback', () => {
    process.env.PAYOUTS_ENABLED = 'true';
    delete process.env.RAZORPAY_X_KEY_ID;
    delete process.env.RAZORPAY_X_KEY_SECRET;
    process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER = '787808008031';

    expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
      .toThrow(/RAZORPAY_X_KEY_ID.*RAZORPAY_X_KEY_SECRET/);
  });

  test('rejects attempts to enable the hard-disabled subscription payment flow', () => {
    process.env.SUBSCRIPTION_PAYMENTS_ENABLED = 'true';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/SUBSCRIPTION_PAYMENTS_ENABLED must remain false/);
  });

  test('does not require payment credentials for a non-payment production service', () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    expect(() => validateStartupEnv({
      serviceName: 'worker',
      requirePaymentEnv: false,
    })).not.toThrow();
  });

  test('does not require payment credentials in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });

  test('passes with structurally valid redacted provider configuration', () => {
    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });
});
