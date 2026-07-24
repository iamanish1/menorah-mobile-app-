const { validateStartupEnv } = require('../startupValidation');
const {
  FACE_CHECK_CONSENT_VERSION,
  FACE_CHECK_RETENTION_DAYS,
} = require('../../../config/kyc');
const { RETENTION_CATEGORIES } = require('../../../config/privacy');

describe('startup validation', () => {
  const originalEnv = process.env;
  const stagingHosts = {
    ROOT_DOMAIN: 'staging.example.com',
    WWW_DOMAIN: 'www.staging.example.com',
    APP_DOMAIN: 'app.staging.example.com',
    ADMIN_DOMAIN: 'admin.staging.example.com',
    COUNSELLOR_DOMAIN: 'counsellor.staging.example.com',
    API_IOS_DOMAIN: 'api-ios.staging.example.com',
    API_ANDROID_DOMAIN: 'api-android.staging.example.com',
    API_WEB_DOMAIN: 'api-web.staging.example.com',
    API_ADMIN_DOMAIN: 'api-admin.staging.example.com',
    CALLS_DOMAIN: 'calls.staging.example.com',
  };

  const configureValidStagingEnvironment = () => {
    Object.assign(process.env, {
      ...stagingHosts,
      MENORAH_STAGING_ALLOWED_HOSTS: Object.values(stagingHosts).join(','),
      MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.example.com',
      CONTACT_TO_EMAIL: 'contact@mail.staging.example.com',
      EMAIL_FROM: 'Menorah Staging <noreply@mail.staging.example.com>',
      LIVEKIT_URL: `wss://${stagingHosts.CALLS_DOMAIN}`,
      LIVEKIT_API_URL: `https://${stagingHosts.CALLS_DOMAIN}`,
      PASSWORD_RESET_BASE_URL: `https://${stagingHosts.APP_DOMAIN}`,
      CHECKOUT_RETURN_URL:
        `https://${stagingHosts.APP_DOMAIN}/checkout/return`,
      FRONTEND_COUNSELLOR_URL:
        `https://${stagingHosts.COUNSELLOR_DOMAIN}`,
      FRONTEND_API_WEB_URL: `https://${stagingHosts.API_WEB_DOMAIN}/api`,
      FRONTEND_API_ADMIN_URL: `https://${stagingHosts.API_ADMIN_DOMAIN}/api`,
      FRONTEND_SOCKET_WEB_URL: `https://${stagingHosts.API_WEB_DOMAIN}`,
      MEDIA_PUBLIC_BASE_URL: `https://${stagingHosts.API_WEB_DOMAIN}`,
      ALLOWED_ORIGINS: [
        `https://${stagingHosts.WWW_DOMAIN}`,
        `https://${stagingHosts.APP_DOMAIN}`,
        `https://${stagingHosts.ADMIN_DOMAIN}`,
        `https://${stagingHosts.COUNSELLOR_DOMAIN}`,
      ].join(','),
      WEB_SESSION_ORIGINS: [
        `https://${stagingHosts.WWW_DOMAIN}=user`,
        `https://${stagingHosts.APP_DOMAIN}=user`,
        `https://${stagingHosts.COUNSELLOR_DOMAIN}=counsellor`,
        `https://${stagingHosts.ADMIN_DOMAIN}=admin`,
      ].join(','),
      RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
      RAZORPAY_X_KEY_ID: '',
      NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
    });
  };

  const configureValidLocalStagingEnvironment = () => {
    const localHosts = {
      ROOT_DOMAIN: 'root.staging.localhost',
      WWW_DOMAIN: 'www.staging.localhost',
      APP_DOMAIN: 'app.staging.localhost',
      ADMIN_DOMAIN: 'admin.staging.localhost',
      COUNSELLOR_DOMAIN: 'counsellor.staging.localhost',
      API_IOS_DOMAIN: 'api-ios.staging.localhost',
      API_ANDROID_DOMAIN: 'api-android.staging.localhost',
      API_WEB_DOMAIN: 'api-web.staging.localhost',
      API_ADMIN_DOMAIN: 'api-admin.staging.localhost',
      CALLS_DOMAIN: 'calls.staging.localhost',
    };
    const port = '28443';
    const httpsOrigin = (host) => `https://${host}:${port}`;
    Object.assign(process.env, {
      ...localHosts,
      MENORAH_LOCAL_STAGING_HTTPS_PORT: port,
      MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:
        'menorah-local-staging-v1',
      MENORAH_STAGING_ALLOWED_HOSTS: Object.values(localHosts).join(','),
      MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.localhost',
      CONTACT_TO_EMAIL: 'contact@mail.staging.localhost',
      EMAIL_FROM: 'Menorah Staging <noreply@mail.staging.localhost>',
      LIVEKIT_URL: `wss://${localHosts.CALLS_DOMAIN}:${port}`,
      LIVEKIT_API_URL: 'http://livekit:7880',
      PASSWORD_RESET_BASE_URL: httpsOrigin(localHosts.APP_DOMAIN),
      CHECKOUT_RETURN_URL:
        `${httpsOrigin(localHosts.APP_DOMAIN)}/checkout/return`,
      FRONTEND_COUNSELLOR_URL:
        httpsOrigin(localHosts.COUNSELLOR_DOMAIN),
      FRONTEND_API_WEB_URL:
        `${httpsOrigin(localHosts.API_WEB_DOMAIN)}/api`,
      FRONTEND_API_ADMIN_URL:
        `${httpsOrigin(localHosts.API_ADMIN_DOMAIN)}/api`,
      FRONTEND_SOCKET_WEB_URL: httpsOrigin(localHosts.API_WEB_DOMAIN),
      MEDIA_PUBLIC_BASE_URL: httpsOrigin(localHosts.API_WEB_DOMAIN),
      ALLOWED_ORIGINS: [
        httpsOrigin(localHosts.WWW_DOMAIN),
        httpsOrigin(localHosts.APP_DOMAIN),
        httpsOrigin(localHosts.ADMIN_DOMAIN),
        httpsOrigin(localHosts.COUNSELLOR_DOMAIN),
      ].join(','),
      WEB_SESSION_ORIGINS: [
        `${httpsOrigin(localHosts.WWW_DOMAIN)}=user`,
        `${httpsOrigin(localHosts.APP_DOMAIN)}=user`,
        `${httpsOrigin(localHosts.COUNSELLOR_DOMAIN)}=counsellor`,
        `${httpsOrigin(localHosts.ADMIN_DOMAIN)}=admin`,
      ].join(','),
      RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
      RAZORPAY_X_KEY_ID: '',
      NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
    });
  };

  const configureServerStagingEnvironment = ({
    project = 'menorah-server-staging-validation',
  } = {}) => {
    const hosts = {
      ROOT_DOMAIN: 'staging.menorah.me',
      WWW_DOMAIN: 'www.staging.menorah.me',
      APP_DOMAIN: 'app.staging.menorah.me',
      ADMIN_DOMAIN: 'admin.staging.menorah.me',
      COUNSELLOR_DOMAIN: 'counsellor.staging.menorah.me',
      API_IOS_DOMAIN: 'api-ios.staging.menorah.me',
      API_ANDROID_DOMAIN: 'api-android.staging.menorah.me',
      API_WEB_DOMAIN: 'api-web.staging.menorah.me',
      API_ADMIN_DOMAIN: 'api-admin.staging.menorah.me',
      CALLS_DOMAIN: 'calls.staging.menorah.me',
    };
    const suffix = project === 'menorah-server-staging-validation'
      ? ':38443'
      : '';
    const httpsOrigin = (host) => `https://${host}${suffix}`;
    Object.assign(process.env, {
      ...hosts,
      MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
        'menorah-server-staging-v1',
      MENORAH_SERVER_STAGING_PROJECT_NAME: project,
      MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
      MENORAH_STAGING_ALLOWED_HOSTS: Object.values(hosts).join(','),
      MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.menorah.me',
      CONTACT_TO_EMAIL: 'contact@mail.staging.menorah.me',
      EMAIL_FROM:
        'Menorah Staging <noreply@mail.staging.menorah.me>',
      LIVEKIT_URL: `wss://${hosts.CALLS_DOMAIN}${suffix}`,
      LIVEKIT_API_URL: 'http://staging-livekit:7880',
      PASSWORD_RESET_BASE_URL: httpsOrigin(hosts.APP_DOMAIN),
      CHECKOUT_RETURN_URL:
        `${httpsOrigin(hosts.APP_DOMAIN)}/checkout/return`,
      FRONTEND_COUNSELLOR_URL:
        httpsOrigin(hosts.COUNSELLOR_DOMAIN),
      FRONTEND_API_WEB_URL:
        `${httpsOrigin(hosts.API_WEB_DOMAIN)}/api`,
      FRONTEND_API_ADMIN_URL:
        `${httpsOrigin(hosts.API_ADMIN_DOMAIN)}/api`,
      FRONTEND_SOCKET_WEB_URL: httpsOrigin(hosts.API_WEB_DOMAIN),
      MEDIA_PUBLIC_BASE_URL: httpsOrigin(hosts.API_WEB_DOMAIN),
      ALLOWED_ORIGINS: [
        httpsOrigin(hosts.WWW_DOMAIN),
        httpsOrigin(hosts.APP_DOMAIN),
        httpsOrigin(hosts.ADMIN_DOMAIN),
        httpsOrigin(hosts.COUNSELLOR_DOMAIN),
      ].join(','),
      WEB_SESSION_ORIGINS: [
        `${httpsOrigin(hosts.WWW_DOMAIN)}=user`,
        `${httpsOrigin(hosts.APP_DOMAIN)}=user`,
        `${httpsOrigin(hosts.COUNSELLOR_DOMAIN)}=counsellor`,
        `${httpsOrigin(hosts.ADMIN_DOMAIN)}=admin`,
      ].join(','),
      RESEND_API_URL: 'http://staging-mail-capture:8025/emails',
      RESEND_API_KEY: `re_server_staging_${'a'.repeat(40)}`,
      RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
      RAZORPAY_X_KEY_ID: '',
      NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
    });
  };

  const configureExactSyntheticServerStagingEnvironment = ({
    project = 'menorah-staging',
  } = {}) => {
    configureServerStagingEnvironment({ project });
    Object.assign(process.env, {
      SERVICE_RUNTIME: 'server-staging',
      MENORAH_SYNTHETIC_DATA_ONLY: 'true',
      MONGODB_URI:
        'mongodb://menorah-staging-app:synthetic@'
        + 'staging-mongo-primary:27017/menorah_staging'
        + '?replicaSet=menorah-staging-rs'
        + '&authSource=admin&retryWrites=true',
      MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
      MONGODB_READ_PREFERENCE: 'primaryPreferred',
      MONGODB_RETRY_WRITES: 'true',
      SOCIAL_STUDIO_ENABLED: 'false',
      SOCIAL_STUDIO_AUTO_PUBLISH: 'false',
      ENABLE_SOCIAL_SCHEDULER: 'false',
      APPLE_SIGN_IN_ENABLED: 'false',
      RAZORPAY_MODE: 'test',
      RAZORPAY_X_MODE: 'test',
    });
    [
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'RAZORPAY_WEBHOOK_SECRET_PREVIOUS',
      'RAZORPAY_X_KEY_ID',
      'RAZORPAY_X_KEY_SECRET',
      'RAZORPAY_X_WEBHOOK_SECRET',
      'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
    ].forEach((key) => delete process.env[key]);
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'production',
      JWT_SECRET: 'x'.repeat(64),
      MONGODB_URI: 'mongodb://mongo-primary:27017/menorah',
      ALLOWED_ORIGINS: 'https://app.example.com',
      WEB_SESSION_ORIGINS: 'https://app.example.com=user,https://counsellor.example.com=counsellor,https://admin.example.com=admin',
      REDIS_URL: 'redis://redis:6379',
      RESEND_API_KEY: 'resend-key',
      RESEND_WEBHOOK_SECRET: `whsec_${'a'.repeat(32)}`,
      EMAIL_FROM: 'Menorah <noreply@example.com>',
      CONTACT_TO_EMAIL: 'contact@example.com',
      PASSWORD_RESET_BASE_URL: 'https://app.menorah.me',
      CHECKOUT_RETURN_URL: 'https://app.menorah.me/checkout/return',
      MEDIA_STORAGE_BACKEND: 'local',
      MEDIA_PUBLIC_BASE_URL: 'https://media.example.com',
      UPLOAD_PATH: '/app/uploads',
      DATA_ENCRYPTION_KEY: 'x'.repeat(64),
      AUDIT_LOG_SIGNING_KEY: 'y'.repeat(64),
      APPLE_SIGN_IN_ENABLED: 'true',
      APPLE_IOS_BUNDLE_ID: 'com.menorah.health.app',
      APPLE_TEAM_ID: 'A1B2C3D4E5',
      APPLE_KEY_ID: 'F6G7H8I9J0',
      APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest-only-key\n-----END PRIVATE KEY-----',
      MAX_PAYOUT_AMOUNT_PAISE: '5000000',
      KYC_CONSENT_VERSION: FACE_CHECK_CONSENT_VERSION,
      KYC_RETENTION_DAYS: String(FACE_CHECK_RETENTION_DAYS),
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'test-counsellor-onboarding-v1',
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: 'test-counsellor-credential-policy-v1',
      COUNSELLOR_ONBOARDING_NOTICE_URL: 'https://consent.unit-test.org/counsellor-notice',
      PRIVACY_NOTICE_VERSION: 'unit-privacy-notice-v1',
      PRIVACY_RETENTION_EXECUTION_ENABLED: 'false',
      PRIVACY_RETENTION_POLICY_JSON: JSON.stringify({
        version: 'unit-privacy-retention-v1',
        categories: Object.fromEntries(RETENTION_CATEGORIES.map((category) => [
          category,
          {
            mode: 'manual',
            policyReference: `unit-policy-${category}`,
          },
        ])),
      }),
      PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: JSON.stringify([{
        adminId: '64f000000000000000000001',
        permissions: [
          'privacy_reader',
          'privacy_reviewer',
          'privacy_legal_hold',
        ],
      }]),
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([{
        adminId: '64f000000000000000000001',
        role: 'admin',
      }]),
      BOOKING_SERVICE_CATALOG_JSON: JSON.stringify({
        test_service: {
          durationMinutes: 60,
          amountMinor: 12345,
          currency: 'INR',
        },
      }),
      RAZORPAY_KEY_ID: 'rzp_live_A1b2C3d4E5f6G7',
      RAZORPAY_KEY_SECRET: ['A1b2C3', 'd4E5f6', 'G7h8I9', 'j0K1l2'].join(''),
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
    delete process.env.PASSWORD_RESET_URL_TEMPLATE;
    delete process.env.COUNSELLOR_MEDIA_STORAGE;
    delete process.env.SOCIAL_STUDIO_STORAGE;
    delete process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT;
    delete process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID;
    delete process.env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID;
    delete process.env.MENORAH_SERVER_STAGING_PROJECT_NAME;
    delete process.env.MENORAH_SERVER_STAGING_HTTPS_PORT;
    delete process.env.RESEND_API_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('requires LiveKit configuration in production', () => {
    delete process.env.LIVEKIT_API_URL;

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).toThrow(/LIVEKIT_API_URL is missing/);
  });

  test('requires a usable Resend webhook secret on api-web in production', () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RESEND_WEBHOOK_SECRET must contain at least 24/);
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

  test.each(['127', '8193', '1.5', 'placeholder'])(
    'rejects an invalid durable audit queue bound (%s)',
    (value) => {
      process.env.SECURITY_AUDIT_PENDING_MAX = value;

      expect(() => validateStartupEnv({ serviceName: 'api-web' }))
        .toThrow(/SECURITY_AUDIT_PENDING_MAX/);
    },
  );

  test('requires the canonical mobile password-reset origin in production', () => {
    process.env.PASSWORD_RESET_BASE_URL = 'https://menorah.me';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/PASSWORD_RESET_BASE_URL must equal https:\/\/app\.menorah\.me/);
  });

  test('defaults an omitted deployment environment to production', () => {
    delete process.env.DEPLOYMENT_ENVIRONMENT;
    process.env.PASSWORD_RESET_BASE_URL = 'https://app.staging.example.com';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/PASSWORD_RESET_BASE_URL must equal https:\/\/app\.menorah\.me/);
  });

  test.each(['preview', 'Production', 'prod'])(
    'rejects unsupported deployment environment %s',
    (value) => {
      process.env.DEPLOYMENT_ENVIRONMENT = value;

      expect(() => validateStartupEnv({ serviceName: 'api-web' }))
        .toThrow(/DEPLOYMENT_ENVIRONMENT must be exactly production or staging/);
    }
  );

  test('rejects an invalid deployment environment outside production mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.DEPLOYMENT_ENVIRONMENT = 'preview';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/DEPLOYMENT_ENVIRONMENT must be exactly production or staging/);
  });

  test('rejects staging when NODE_ENV would skip production hardening', () => {
    process.env.NODE_ENV = 'development';
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/DEPLOYMENT_ENVIRONMENT=staging requires NODE_ENV=production/);
  });

  test('accepts a fully reviewed isolated production-like staging topology', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });

  test('accepts an exact high-port HTTPS topology only for local staging hosts', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidLocalStagingEnvironment();

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });

  test('accepts the internal mail capture only for the exact local staging identity', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidLocalStagingEnvironment();
    process.env.RESEND_API_URL =
      'http://mail-capture:8025/emails';
    process.env.RESEND_API_KEY = `re_local_${'a'.repeat(40)}`;

    expect(() => validateStartupEnv({ serviceName: 'api-web' })).not.toThrow();
  });

  test.each([
    'https://api.resend.com/emails',
    'http://mail-capture:8025',
    'http://mail-capture:8025/emails/',
    'http://other-mail-capture:8025/emails',
  ])('rejects a configured email endpoint outside the one exact local URL (%s)', (url) => {
    process.env.RESEND_API_URL = url;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RESEND_API_URL is allowed only/);
  });

  test('rejects the local mail capture for an ordinary external staging identity', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env.RESEND_API_URL =
      'http://mail-capture:8025/emails';
    process.env.RESEND_API_KEY = `re_local_${'a'.repeat(40)}`;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RESEND_API_URL is allowed only/);
  });

  test('rejects the local mail capture when the generated environment ID is absent', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidLocalStagingEnvironment();
    delete process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID;
    process.env.RESEND_API_URL =
      'http://mail-capture:8025/emails';
    process.env.RESEND_API_KEY = `re_local_${'a'.repeat(40)}`;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RESEND_API_URL is allowed only/);
  });

  test.each([
    'ordinary-test-key',
    're_local_short',
    `re_test_${'a'.repeat(40)}`,
  ])('rejects an invalid local mail-capture key (%s)', (apiKey) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidLocalStagingEnvironment();
    process.env.RESEND_API_URL =
      'http://mail-capture:8025/emails';
    process.env.RESEND_API_KEY = apiKey;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/RESEND_API_KEY must use a strong re_local_ key/);
  });

  test('rejects a local capture key on the hardcoded external endpoint', () => {
    process.env.RESEND_API_KEY = `re_local_${'a'.repeat(40)}`;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/must never be sent to the external Resend endpoint/);
  });

  test('rejects a local staging port for a non-local staging topology', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT = '28443';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/MENORAH_LOCAL_STAGING_HTTPS_PORT is allowed only/);
  });

  test.each(['443', '1023', '65536', 'not-a-port'])(
    'rejects an unsafe local staging HTTPS port %s',
    (port) => {
      process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
      configureValidLocalStagingEnvironment();
      process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT = port;

      expect(() => validateStartupEnv({ serviceName: 'api-web' }))
        .toThrow(/MENORAH_LOCAL_STAGING_HTTPS_PORT/);
    }
  );

  test('rejects a mismatched URL port in a local staging topology', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidLocalStagingEnvironment();
    process.env.FRONTEND_API_WEB_URL =
      'https://api-web.staging.localhost:28444/api';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/FRONTEND_API_WEB_URL must equal/);
  });

  test('rejects the local staging port selector in production', () => {
    process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT = '28443';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/MENORAH_LOCAL_STAGING_HTTPS_PORT must be unset outside staging/);
  });

  test('rejects the server staging identity selector in production', () => {
    process.env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID =
      'menorah-server-staging-v1';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(
        /MENORAH_SERVER_STAGING_ENVIRONMENT_ID must be unset outside staging/
      );
  });

  test('rejects staging when every topology variable is omitted', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    [
      'MENORAH_STAGING_ALLOWED_HOSTS',
      'MENORAH_STAGING_EMAIL_DOMAIN',
      ...Object.keys(stagingHosts),
      'LIVEKIT_URL',
      'LIVEKIT_API_URL',
      'PASSWORD_RESET_BASE_URL',
      'CHECKOUT_RETURN_URL',
      'FRONTEND_COUNSELLOR_URL',
      'FRONTEND_API_WEB_URL',
      'FRONTEND_API_ADMIN_URL',
      'FRONTEND_SOCKET_WEB_URL',
      'MEDIA_PUBLIC_BASE_URL',
      'ALLOWED_ORIGINS',
      'WEB_SESSION_ORIGINS',
      'CONTACT_TO_EMAIL',
      'EMAIL_FROM',
    ].forEach((key) => delete process.env[key]);

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/MENORAH_STAGING_ALLOWED_HOSTS.*ROOT_DOMAIN/);
  });

  test('rejects production-default topology values when staging is selected', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    const productionHosts = {
      ROOT_DOMAIN: 'menorah.me',
      WWW_DOMAIN: 'www.menorah.me',
      APP_DOMAIN: 'app.menorah.me',
      ADMIN_DOMAIN: 'admin.menorah.me',
      COUNSELLOR_DOMAIN: 'counsellor.menorah.me',
      API_IOS_DOMAIN: 'api-ios.menorah.me',
      API_ANDROID_DOMAIN: 'api-android.menorah.me',
      API_WEB_DOMAIN: 'api-web.menorah.me',
      API_ADMIN_DOMAIN: 'api-admin.menorah.me',
      CALLS_DOMAIN: 'calls.menorah.me',
    };
    Object.assign(process.env, {
      ...productionHosts,
      MENORAH_STAGING_ALLOWED_HOSTS: Object.values(productionHosts).join(','),
      LIVEKIT_URL: 'wss://calls.menorah.me',
      LIVEKIT_API_URL: 'https://calls.menorah.me',
      PASSWORD_RESET_BASE_URL: 'https://app.menorah.me',
      FRONTEND_COUNSELLOR_URL: 'https://counsellor.menorah.me',
      FRONTEND_API_WEB_URL: 'https://api-web.menorah.me/api',
      FRONTEND_API_ADMIN_URL: 'https://api-admin.menorah.me/api',
      FRONTEND_SOCKET_WEB_URL: 'https://api-web.menorah.me',
      MEDIA_PUBLIC_BASE_URL: 'https://api-web.menorah.me',
      ALLOWED_ORIGINS:
        'https://www.menorah.me,https://app.menorah.me,https://admin.menorah.me,https://counsellor.menorah.me',
      WEB_SESSION_ORIGINS:
        'https://www.menorah.me=user,https://app.menorah.me=user,https://counsellor.menorah.me=counsellor,https://admin.menorah.me=admin',
      RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
    });

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/staging as a full label/);
  });

  test('rejects staging service-host aliases', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env.API_ANDROID_DOMAIN = process.env.API_IOS_DOMAIN;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/API_ANDROID_DOMAIN must not alias another staging service host/);
  });

  test('rejects staging as a hostname substring rather than a full label', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    const invalidHost = 'api-ios-staging.example.com';
    process.env.MENORAH_STAGING_ALLOWED_HOSTS =
      process.env.MENORAH_STAGING_ALLOWED_HOSTS.replace(
        stagingHosts.API_IOS_DOMAIN,
        invalidHost
      );
    process.env.API_IOS_DOMAIN = invalidHost;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/API_IOS_DOMAIN must be a lowercase DNS host with staging as a full label/);
  });

  test.each([
    ['LIVEKIT_URL', 'wss://calls.other-staging.example.com'],
    ['LIVEKIT_API_URL', 'https://calls.other-staging.example.com'],
    ['PASSWORD_RESET_BASE_URL', 'https://other.staging.example.com'],
    ['CHECKOUT_RETURN_URL', 'https://app.menorah.me/checkout/return'],
    ['FRONTEND_COUNSELLOR_URL', 'https://counsellor.menorah.me'],
    ['FRONTEND_API_WEB_URL', 'https://api-web.staging.example.com'],
    ['FRONTEND_API_ADMIN_URL', 'https://api-web.staging.example.com/api'],
    ['FRONTEND_SOCKET_WEB_URL', 'https://api-admin.staging.example.com'],
    ['MEDIA_PUBLIC_BASE_URL', 'https://media.staging.example.com'],
  ])('rejects a staging target that does not exactly map %s', (key, value) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env[key] = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(new RegExp(`${key} must equal`));
  });

  test.each([
    ['MENORAH_STAGING_EMAIL_DOMAIN', 'mail.example.com'],
    ['MENORAH_STAGING_EMAIL_DOMAIN', 'mail-staging.example.com'],
    ['CONTACT_TO_EMAIL', 'Menorah <contact@mail.staging.example.com>'],
    ['CONTACT_TO_EMAIL', 'contact@menorah.me'],
    ['EMAIL_FROM', 'Menorah <noreply@menorah.me>'],
    ['EMAIL_FROM', 'not-an-address'],
  ])('rejects unsafe staging email routing through %s', (key, value) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env[key] = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(
        /MENORAH_STAGING_EMAIL_DOMAIN|CONTACT_TO_EMAIL|EMAIL_FROM/
      );
  });

  test('retains the canonical checkout return URL in production', () => {
    process.env.CHECKOUT_RETURN_URL =
      'https://app.staging.example.com/checkout/return';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(
        /CHECKOUT_RETURN_URL must equal https:\/\/app\.menorah\.me\/checkout\/return/
      );
  });

  test.each([
    [
      'ALLOWED_ORIGINS',
      'https://www.staging.example.com,https://app.staging.example.com,https://admin.staging.example.com,https://app.menorah.me',
    ],
    [
      'WEB_SESSION_ORIGINS',
      'https://www.staging.example.com=user,https://app.staging.example.com=user,https://counsellor.staging.example.com=counsellor,https://admin.menorah.me=admin',
    ],
  ])('rejects mixed or aliased staging origin mapping %s', (key, value) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env[key] = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(new RegExp(`${key} must contain exactly`));
  });

  test.each([
    'RAZORPAY_KEY_ID',
    'RAZORPAY_X_KEY_ID',
    'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  ])('rejects a live Razorpay key ID in staging via %s', (key) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env[key] = 'rzp_live_A1b2C3d4E5f6G7';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(new RegExp(`${key} must use an rzp_test_ key ID in staging`));
  });

  test.each([
    'https://app.menorah.me',
    'https://app.menorah.me.',
    'https://app.menorah.me:8443',
    'http://app.staging.example.com',
    'https://app.staging.example.com:8443',
    'https://app.staging.example.com/',
    'https://app.staging.example.com/reset-password',
  ])('rejects an unsafe staging password-reset origin %s', (value) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env.PASSWORD_RESET_BASE_URL = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/PASSWORD_RESET_BASE_URL/);
  });

  test('permits Apple sign-in to be explicitly disabled in staging', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env.APPLE_SIGN_IN_ENABLED = 'false';
    delete process.env.APPLE_IOS_BUNDLE_ID;
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY;

    expect(() => validateStartupEnv({
      serviceName: 'api-ios',
      requirePaymentEnv: false,
    })).not.toThrow();
  });

  test('accepts the complete exact :38443 server-staging validation startup', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureServerStagingEnvironment();

    expect(() => validateStartupEnv({
      serviceName: 'api-web',
    })).not.toThrow();
  });

  test('keeps complete real server staging portless', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureServerStagingEnvironment({
      project: 'menorah-staging',
    });

    expect(() => validateStartupEnv({
      serviceName: 'api-web',
    })).not.toThrow();
  });

  test('accepts explicit disabled providers in exact synthetic server staging', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();

    expect(() => validateStartupEnv({
      serviceName: 'api-ios',
      requirePaymentEnv: false,
    })).not.toThrow();
  });

  test.each([
    ['SOCIAL_STUDIO_ENABLED', undefined],
    ['SOCIAL_STUDIO_ENABLED', 'true'],
    ['SOCIAL_STUDIO_AUTO_PUBLISH', undefined],
    ['SOCIAL_STUDIO_AUTO_PUBLISH', 'true'],
    ['ENABLE_SOCIAL_SCHEDULER', undefined],
    ['ENABLE_SOCIAL_SCHEDULER', 'true'],
  ])('requires exact social disablement in synthetic server staging: %s=%s', (
    key,
    value
  ) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;

    expect(() => validateStartupEnv({
      serviceName: 'api-web',
      requirePaymentEnv: false,
    })).toThrow(new RegExp(`${key} must equal false`));
  });

  test.each(['api-ios', 'worker'])(
    'requires Apple sign-in disabled for %s in synthetic server staging',
    (serviceName) => {
      process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
      configureExactSyntheticServerStagingEnvironment();
      process.env.APPLE_SIGN_IN_ENABLED = 'true';

      expect(() => validateStartupEnv({
        serviceName,
        requirePaymentEnv: false,
      })).toThrow(/APPLE_SIGN_IN_ENABLED must equal false/);
    }
  );

  test('requires Razorpay test mode when staging booking initiation is enabled', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    process.env.BOOKING_PAYMENTS_ENABLED = 'true';
    process.env.PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS = '5';
    process.env.RAZORPAY_MODE = 'live';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_A1b2C3d4E5f6G7';
    process.env.RAZORPAY_KEY_SECRET =
      'Booking-A1b2C3d4E5f6G7h8';
    process.env.RAZORPAY_WEBHOOK_SECRET =
      'Booking-Webhook-A1b2C3d4E5';

    expect(() => validateStartupEnv({
      serviceName: 'api-ios',
    })).toThrow(/RAZORPAY_MODE must equal test/);
  });

  test('requires RazorpayX test mode when staging payouts are enabled', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    process.env.PAYOUTS_ENABLED = 'true';
    process.env.RAZORPAY_X_MODE = 'live';
    process.env.RAZORPAY_X_KEY_ID = 'rzp_test_X1b2C3d4E5f6G7';
    process.env.RAZORPAY_X_KEY_SECRET =
      'RazorpayX-A1b2C3d4E5f6G7h8';
    process.env.RAZORPAY_X_WEBHOOK_SECRET =
      'RazorpayX-Webhook-A1b2C3d4E5';
    process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER = '787808008031';

    expect(() => validateStartupEnv({
      serviceName: 'api-admin',
    })).toThrow(/RAZORPAY_X_MODE must equal test/);
  });

  test('scopes enabled booking credentials to api-ios in server staging', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    process.env.BOOKING_PAYMENTS_ENABLED = 'true';
    process.env.PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS = '5';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_A1b2C3d4E5f6G7';
    process.env.RAZORPAY_KEY_SECRET =
      'Booking-A1b2C3d4E5f6G7h8';
    process.env.RAZORPAY_WEBHOOK_SECRET =
      'Booking-Webhook-A1b2C3d4E5';

    expect(() => validateStartupEnv({
      serviceName: 'api-ios',
    })).not.toThrow();
  });

  test('scopes enabled payout credentials to api-admin in server staging', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    process.env.PAYOUTS_ENABLED = 'true';
    process.env.RAZORPAY_X_KEY_ID = 'rzp_test_X1b2C3d4E5f6G7';
    process.env.RAZORPAY_X_KEY_SECRET =
      'RazorpayX-A1b2C3d4E5f6G7h8';
    process.env.RAZORPAY_X_WEBHOOK_SECRET =
      'RazorpayX-Webhook-A1b2C3d4E5';
    process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER = '787808008031';

    expect(() => validateStartupEnv({
      serviceName: 'api-admin',
    })).not.toThrow();
  });

  test.each([
    ['api-web', false],
    ['api-android', false],
    ['worker', true],
  ])('boots %s server staging without either provider secret set', (
    serviceName,
    omitPaymentValidation
  ) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();

    expect(() => validateStartupEnv({
      serviceName,
      requirePaymentEnv: !omitPaymentValidation,
    })).not.toThrow();
  });

  test.each([
    ['api-ios', 'RAZORPAY_X_WEBHOOK_SECRET', 'payout-secret'],
    ['api-admin', 'RAZORPAY_WEBHOOK_SECRET', 'booking-secret'],
    ['api-web', 'RAZORPAY_KEY_SECRET', 'booking-secret'],
    ['api-android', 'RAZORPAY_X_KEY_SECRET', 'payout-secret'],
    ['worker', 'RAZORPAY_KEY_SECRET', 'booking-secret'],
  ])('rejects %s receiving cross-role provider value %s', (
    serviceName,
    key,
    value
  ) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    process.env[key] = value;

    expect(() => validateStartupEnv({
      serviceName,
      requirePaymentEnv: serviceName !== 'worker',
    })).toThrow(new RegExp(`${key} must be unset for ${serviceName}`));
  });

  test.each([
    ['api-ios', 'RAZORPAY_KEY_SECRET'],
    ['api-admin', 'RAZORPAY_X_WEBHOOK_SECRET'],
  ])('rejects inactive %s provider credentials via %s', (
    serviceName,
    key
  ) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    process.env[key] = 'inactive-provider-secret';

    expect(() => validateStartupEnv({
      serviceName,
    })).toThrow(new RegExp(`${key} must be unset for ${serviceName}`));
  });

  test.each([
    ['api-web', 'BOOKING_PAYMENTS_ENABLED'],
    ['api-ios', 'PAYOUTS_ENABLED'],
  ])('rejects %s enabling provider flag %s owned by another API', (
    serviceName,
    key
  ) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureExactSyntheticServerStagingEnvironment();
    process.env[key] = 'true';

    expect(() => validateStartupEnv({
      serviceName,
    })).toThrow(new RegExp(`${key} must equal false outside`));
  });

  test('preserves ordinary production booking validation on api-admin', () => {
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(() => validateStartupEnv({
      serviceName: 'api-admin',
    })).toThrow(/RAZORPAY_KEY_SECRET/);
  });

  test.each([
    [
      'real project with validation URLs',
      'MENORAH_SERVER_STAGING_PROJECT_NAME',
      'menorah-staging',
    ],
    [
      'wrong server identity',
      'MENORAH_SERVER_STAGING_ENVIRONMENT_ID',
      'menorah-server-staging-v2',
    ],
    [
      'mixed local identity',
      'MENORAH_LOCAL_STAGING_ENVIRONMENT_ID',
      'menorah-local-staging-v1',
    ],
  ])('rejects crossed server validation startup selector: %s', (
    _label,
    key,
    value
  ) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureServerStagingEnvironment();
    process.env[key] = value;

    expect(() => validateStartupEnv({
      serviceName: 'api-web',
    })).toThrow(
      /Server staging|Server-staging|PASSWORD_RESET_BASE_URL|RESEND_API_URL/
    );
  });

  test('requires an explicit Apple sign-in decision in staging', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    delete process.env.APPLE_SIGN_IN_ENABLED;

    expect(() => validateStartupEnv({
      serviceName: 'worker',
      requirePaymentEnv: false,
    })).toThrow(/APPLE_SIGN_IN_ENABLED must be exactly true or false in staging/);
  });

  test('validates complete Apple credentials when enabled in staging', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    configureValidStagingEnvironment();
    process.env.APPLE_IOS_BUNDLE_ID = 'com.menorah.health.staging';
    delete process.env.APPLE_TEAM_ID;

    expect(() => validateStartupEnv({
      serviceName: 'api-ios',
      requirePaymentEnv: false,
    })).toThrow(/APPLE_TEAM_ID must be a 10-character Apple Team ID/);
  });

  test('retains mandatory Apple sign-in and the canonical bundle ID in production', () => {
    process.env.APPLE_SIGN_IN_ENABLED = 'false';
    process.env.APPLE_IOS_BUNDLE_ID = 'com.menorah.health.staging';

    expect(() => validateStartupEnv({
      serviceName: 'api-ios',
      requirePaymentEnv: false,
    })).toThrow(
      /APPLE_SIGN_IN_ENABLED must equal true.*APPLE_IOS_BUNDLE_ID must equal com\.menorah\.health\.app/
    );
  });

  test('rejects the legacy password-reset URL template in production', () => {
    process.env.PASSWORD_RESET_URL_TEMPLATE =
      'https://app.menorah.me/reset-password?token={token}';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/PASSWORD_RESET_URL_TEMPLATE must be unset/);
  });

  test('requires the recoverable local media backend in production', () => {
    process.env.MEDIA_STORAGE_BACKEND = 'cloudinary';
    process.env.CLOUDINARY_CLOUD_NAME = 'unit-cloud';
    process.env.CLOUDINARY_API_KEY = 'unit-key';
    process.env.CLOUDINARY_API_SECRET = 'unit-secret';

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/MEDIA_STORAGE_BACKEND must equal local in production/);
  });

  test.each([
    '',
    'http://media.example.com',
    'https://localhost:8080',
  ])('rejects an unsafe production media origin (%s)', (value) => {
    process.env.MEDIA_PUBLIC_BASE_URL = value;

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(/MEDIA_PUBLIC_BASE_URL/);
  });

  test('rejects split legacy media backend selectors in production', () => {
    process.env.SOCIAL_STUDIO_STORAGE = 'local';

    expect(() => validateStartupEnv({ serviceName: 'worker', requirePaymentEnv: false }))
      .toThrow(/SOCIAL_STUDIO_STORAGE must be unset/);
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

  test.each([
    'PRIVACY_NOTICE_VERSION',
    'PRIVACY_RETENTION_POLICY_JSON',
    'PRIVACY_RETENTION_EXECUTION_ENABLED',
    'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON',
  ])('requires explicit production privacy configuration %s', (key) => {
    delete process.env[key];

    expect(() => validateStartupEnv({ serviceName: 'api-web' }))
      .toThrow(new RegExp(key));
  });

  test('rejects privacy grants that omit a least-privilege function', () => {
    process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = JSON.stringify([{
      adminId: '64f000000000000000000001',
      permissions: ['privacy_reader'],
    }]);

    expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
      .toThrow(/PRIVACY_ADMIN_PERMISSION_GRANTS_JSON/);
  });

  test.each([
    [undefined, 'missing'],
    ['[]', 'empty'],
    [JSON.stringify([{
      adminId: '64f000000000000000000001',
      role: 'support',
    }]), 'without a full administrator'],
  ])('rejects %s admin operational role grants (%s)', (value) => {
    if (value === undefined) delete process.env.ADMIN_ROLE_GRANTS_JSON;
    else process.env.ADMIN_ROLE_GRANTS_JSON = value;

    expect(() => validateStartupEnv({ serviceName: 'api-admin' }))
      .toThrow(/ADMIN_ROLE_GRANTS_JSON/);
  });

  test('rejects retention execution when no approved automated category exists', () => {
    process.env.PRIVACY_RETENTION_EXECUTION_ENABLED = 'true';

    expect(() => validateStartupEnv({ serviceName: 'worker', requirePaymentEnv: false }))
      .toThrow(/PRIVACY_RETENTION_EXECUTION_ENABLED/);
  });

  test('accepts a bounded automated request-payload category without enabling it by default', () => {
    const policy = JSON.parse(process.env.PRIVACY_RETENTION_POLICY_JSON);
    policy.categories.privacy_rights_request_payload = {
      mode: 'automated',
      policyReference: 'unit-approved-request-payload-policy',
      retentionDays: 30,
    };
    process.env.PRIVACY_RETENTION_POLICY_JSON = JSON.stringify(policy);

    expect(() => validateStartupEnv({ serviceName: 'worker', requirePaymentEnv: false }))
      .not.toThrow();
    expect(process.env.PRIVACY_RETENTION_EXECUTION_ENABLED).toBe('false');
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
        process.env.RAZORPAY_X_KEY_SECRET = ['Razorp', 'ayX-A1', 'b2C3d4', 'E5f6G7', 'h8'].join('');
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
    process.env.RAZORPAY_X_KEY_SECRET = ['Razorp', 'ayX-A1', 'b2C3d4', 'E5f6G7', 'h8'].join('');
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
