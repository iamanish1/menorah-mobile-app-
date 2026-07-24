const {
  CANONICAL_RESEND_EMAIL_URL,
  SERVER_STAGING_RESEND_EMAIL_URL,
  isExactRealServerStagingResendSandbox,
  resolveResendEmailUrl,
  validateResendDeliveryConfiguration,
} = require('../emailDelivery');

const SERVER_STAGING_ENVIRONMENT_ID = 'menorah-server-staging-v1';
const SERVER_STAGING_PROJECT = 'menorah-staging';
const SERVER_STAGING_VALIDATION_PROJECT =
  'menorah-server-staging-validation';

const stagingHosts = Object.freeze({
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
});

const externalTopology = (port = '') => {
  const suffix = port ? `:${port}` : '';
  const httpsOrigin = (host) => `https://${host}${suffix}`;

  return {
    LIVEKIT_URL: `wss://${stagingHosts.CALLS_DOMAIN}${suffix}`,
    LIVEKIT_API_URL: 'http://staging-livekit:7880',
    PASSWORD_RESET_BASE_URL: httpsOrigin(stagingHosts.APP_DOMAIN),
    CHECKOUT_RETURN_URL:
      `${httpsOrigin(stagingHosts.APP_DOMAIN)}/checkout/return`,
    FRONTEND_COUNSELLOR_URL:
      httpsOrigin(stagingHosts.COUNSELLOR_DOMAIN),
    FRONTEND_API_WEB_URL:
      `${httpsOrigin(stagingHosts.API_WEB_DOMAIN)}/api`,
    FRONTEND_API_ADMIN_URL:
      `${httpsOrigin(stagingHosts.API_ADMIN_DOMAIN)}/api`,
    FRONTEND_SOCKET_WEB_URL:
      httpsOrigin(stagingHosts.API_WEB_DOMAIN),
    MEDIA_PUBLIC_BASE_URL:
      httpsOrigin(stagingHosts.API_WEB_DOMAIN),
    ALLOWED_ORIGINS: [
      httpsOrigin(stagingHosts.WWW_DOMAIN),
      httpsOrigin(stagingHosts.APP_DOMAIN),
      httpsOrigin(stagingHosts.ADMIN_DOMAIN),
      httpsOrigin(stagingHosts.COUNSELLOR_DOMAIN),
    ].join(','),
    WEB_SESSION_ORIGINS: [
      `${httpsOrigin(stagingHosts.WWW_DOMAIN)}=user`,
      `${httpsOrigin(stagingHosts.APP_DOMAIN)}=user`,
      `${httpsOrigin(stagingHosts.COUNSELLOR_DOMAIN)}=counsellor`,
      `${httpsOrigin(stagingHosts.ADMIN_DOMAIN)}=admin`,
    ].join(','),
  };
};

const exactServerStagingEnvironment = ({
  project = SERVER_STAGING_PROJECT,
  externalPort = '',
} = {}) => ({
  NODE_ENV: 'production',
  DEPLOYMENT_ENVIRONMENT: 'staging',
  SERVICE_RUNTIME: 'server-staging',
  MENORAH_SYNTHETIC_DATA_ONLY: 'true',
  ...stagingHosts,
  ...externalTopology(externalPort),
  MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
    SERVER_STAGING_ENVIRONMENT_ID,
  MENORAH_SERVER_STAGING_PROJECT_NAME: project,
  MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
  MENORAH_STAGING_ALLOWED_HOSTS:
    Object.values(stagingHosts).join(','),
  MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.menorah.me',
  CONTACT_TO_EMAIL: 'contact@mail.staging.menorah.me',
  EMAIL_FROM:
    'Menorah Staging <noreply@mail.staging.menorah.me>',
  MONGODB_URI:
    'mongodb://menorah-staging-app:synthetic@'
    + 'staging-mongo-primary:27017/menorah_staging'
    + '?replicaSet=menorah-staging-rs'
    + '&authSource=admin&retryWrites=true',
  MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
  MONGODB_READ_PREFERENCE: 'primaryPreferred',
  MONGODB_RETRY_WRITES: 'true',
  RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
  RAZORPAY_X_KEY_ID: '',
  NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
});

const exactRealResendSandboxEnvironment = () => ({
  ...exactServerStagingEnvironment(),
  RESEND_PROVIDER_ENABLED: 'true',
  RESEND_MODE: 'sandbox',
  RESEND_API_URL: CANONICAL_RESEND_EMAIL_URL,
  RESEND_API_KEY: `re_${'a'.repeat(40)}`,
});

describe('Resend delivery routing', () => {
  test('allows only the exact real synthetic server-staging sandbox', () => {
    const environment = exactRealResendSandboxEnvironment();

    expect(isExactRealServerStagingResendSandbox(environment))
      .toBe(true);
    expect(resolveResendEmailUrl(environment))
      .toBe(CANONICAL_RESEND_EMAIL_URL);
    expect(validateResendDeliveryConfiguration(environment))
      .toEqual([]);
  });

  test('keeps the validation project on internal capture', () => {
    const environment = {
      ...exactServerStagingEnvironment({
        project: SERVER_STAGING_VALIDATION_PROJECT,
        externalPort: '38443',
      }),
      RESEND_API_URL: SERVER_STAGING_RESEND_EMAIL_URL,
      RESEND_API_KEY: `re_server_staging_${'b'.repeat(40)}`,
    };

    expect(isExactRealServerStagingResendSandbox(environment))
      .toBe(false);
    expect(resolveResendEmailUrl(environment))
      .toBe(SERVER_STAGING_RESEND_EMAIL_URL);
    expect(validateResendDeliveryConfiguration(environment))
      .toEqual([]);
  });

  test.each([
    ['provider disabled', 'RESEND_PROVIDER_ENABLED', 'false'],
    ['non-sandbox mode', 'RESEND_MODE', 'live'],
    ['non-synthetic data', 'MENORAH_SYNTHETIC_DATA_ONLY', 'false'],
    ['wrong runtime', 'SERVICE_RUNTIME', 'home'],
    [
      'validation project',
      'MENORAH_SERVER_STAGING_PROJECT_NAME',
      SERVER_STAGING_VALIDATION_PROJECT,
    ],
    [
      'wrong Mongo target',
      'MONGODB_URI',
      'mongodb://app:synthetic@mongo:27017/menorah',
    ],
  ])('rejects canonical Resend for %s', (_label, key, value) => {
    const environment = exactRealResendSandboxEnvironment();
    environment[key] = value;

    expect(() => resolveResendEmailUrl(environment))
      .toThrow(/approved.*server-staging sandbox delivery/i);
    expect(validateResendDeliveryConfiguration(environment).join('; '))
      .toMatch(/approved.*server-staging sandbox delivery/i);
  });

  test('requires an explicit canonical endpoint for server staging', () => {
    const environment = exactRealResendSandboxEnvironment();
    delete environment.RESEND_API_URL;

    expect(() => resolveResendEmailUrl(environment))
      .toThrow(/explicitly approved Resend endpoint/);
  });

  test.each([
    `re_local_${'a'.repeat(40)}`,
    `re_server_staging_${'b'.repeat(40)}`,
    're_too_short',
  ])('rejects a non-external sandbox key (%s)', (apiKey) => {
    const environment = exactRealResendSandboxEnvironment();
    environment.RESEND_API_KEY = apiKey;

    expect(validateResendDeliveryConfiguration(environment).join('; '))
      .toMatch(/external re_ key/);
  });

  test('preserves the omitted-selector production default', () => {
    const environment = {
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'production',
      RESEND_API_KEY: `re_${'p'.repeat(40)}`,
    };

    expect(resolveResendEmailUrl(environment))
      .toBe(CANONICAL_RESEND_EMAIL_URL);
    expect(validateResendDeliveryConfiguration(environment))
      .toEqual([]);
  });
});
