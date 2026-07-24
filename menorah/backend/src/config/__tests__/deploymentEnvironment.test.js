const {
  SERVER_STAGING_LIVEKIT_API_URL,
  isExactServerStagingSyntheticRuntime,
  validateStagingEnvironmentIsolation,
} = require('../deploymentEnvironment');

const SERVER_STAGING_ENVIRONMENT_ID = 'menorah-server-staging-v1';
const SERVER_STAGING_PROJECT = 'menorah-staging';
const SERVER_STAGING_VALIDATION_PROJECT =
  'menorah-server-staging-validation';
const SERVER_STAGING_VALIDATION_PORT = '38443';

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

const baseEnvironment = ({
  project,
  environmentId = SERVER_STAGING_ENVIRONMENT_ID,
  externalPort = '',
  serverHttpsPort = SERVER_STAGING_VALIDATION_PORT,
} = {}) => ({
  ...stagingHosts,
  ...externalTopology(externalPort),
  MENORAH_SERVER_STAGING_ENVIRONMENT_ID: environmentId,
  MENORAH_SERVER_STAGING_PROJECT_NAME: project,
  MENORAH_SERVER_STAGING_HTTPS_PORT: serverHttpsPort,
  MENORAH_STAGING_ALLOWED_HOSTS: Object.values(stagingHosts).join(','),
  MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.menorah.me',
  CONTACT_TO_EMAIL: 'contact@mail.staging.menorah.me',
  EMAIL_FROM: 'Menorah Staging <noreply@mail.staging.menorah.me>',
  LIVEKIT_API_URL: SERVER_STAGING_LIVEKIT_API_URL,
  RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
  RAZORPAY_X_KEY_ID: '',
  NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
});

const validationEnvironment = () => baseEnvironment({
  project: SERVER_STAGING_VALIDATION_PROJECT,
  externalPort: SERVER_STAGING_VALIDATION_PORT,
});

describe('server-staging deployment environment isolation', () => {
  test.each([
    SERVER_STAGING_PROJECT,
    SERVER_STAGING_VALIDATION_PROJECT,
  ])('recognizes the exact synthetic server runtime for %s', (project) => {
    expect(isExactServerStagingSyntheticRuntime({
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'staging',
      SERVICE_RUNTIME: 'server-staging',
      MENORAH_SYNTHETIC_DATA_ONLY: 'true',
      MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
        SERVER_STAGING_ENVIRONMENT_ID,
      MENORAH_SERVER_STAGING_PROJECT_NAME: project,
      MENORAH_SERVER_STAGING_HTTPS_PORT:
        SERVER_STAGING_VALIDATION_PORT,
      MONGODB_URI:
        'mongodb://menorah-staging-app:synthetic@staging-mongo-primary:27017/'
        + 'menorah_staging?replicaSet=menorah-staging-rs'
        + '&authSource=admin&retryWrites=true',
      MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
      MONGODB_READ_PREFERENCE: 'primaryPreferred',
      MONGODB_RETRY_WRITES: 'true',
    })).toBe(true);
  });

  test.each([
    ['production deployment', 'DEPLOYMENT_ENVIRONMENT', 'production'],
    ['non-staging runtime', 'SERVICE_RUNTIME', 'home'],
    ['non-synthetic data', 'MENORAH_SYNTHETIC_DATA_ONLY', 'false'],
    ['wrong environment', 'MENORAH_SERVER_STAGING_ENVIRONMENT_ID', 'other'],
    ['wrong project', 'MENORAH_SERVER_STAGING_PROJECT_NAME', 'menorah'],
    ['wrong port', 'MENORAH_SERVER_STAGING_HTTPS_PORT', '443'],
    [
      'wrong Mongo target',
      'MONGODB_URI',
      'mongodb://menorah-staging-app:synthetic@mongo:27017/menorah'
        + '?replicaSet=menorah&authSource=admin&retryWrites=true',
    ],
    [
      'wrong Mongo role',
      'MONGODB_URI',
      'mongodb://menorah-staging-migration:synthetic@'
        + 'staging-mongo-primary:27017/menorah_staging'
        + '?replicaSet=menorah-staging-rs'
        + '&authSource=admin&retryWrites=true',
    ],
    [
      'extra Mongo option',
      'MONGODB_URI',
      'mongodb://menorah-staging-app:synthetic@'
        + 'staging-mongo-primary:27017/menorah_staging'
        + '?replicaSet=menorah-staging-rs'
        + '&authSource=admin&retryWrites=true&readPreference=secondary',
    ],
    ['wrong Mongo replica', 'MONGODB_REPLICA_SET_NAME', 'menorah'],
    ['wrong read preference', 'MONGODB_READ_PREFERENCE', 'secondary'],
    ['wrong retry-writes setting', 'MONGODB_RETRY_WRITES', 'false'],
    [
      'local identity crossover',
      'MENORAH_LOCAL_STAGING_ENVIRONMENT_ID',
      'menorah-local-staging-v1',
    ],
    ['local port crossover', 'MENORAH_LOCAL_STAGING_HTTPS_PORT', '28443'],
  ])('rejects %s as a synthetic server runtime', (_label, key, value) => {
    const environment = {
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'staging',
      SERVICE_RUNTIME: 'server-staging',
      MENORAH_SYNTHETIC_DATA_ONLY: 'true',
      MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
        SERVER_STAGING_ENVIRONMENT_ID,
      MENORAH_SERVER_STAGING_PROJECT_NAME:
        SERVER_STAGING_VALIDATION_PROJECT,
      MENORAH_SERVER_STAGING_HTTPS_PORT:
        SERVER_STAGING_VALIDATION_PORT,
      MONGODB_URI:
        'mongodb://menorah-staging-app:synthetic@staging-mongo-primary:27017/'
        + 'menorah_staging?replicaSet=menorah-staging-rs'
        + '&authSource=admin&retryWrites=true',
      MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
      MONGODB_READ_PREFERENCE: 'primaryPreferred',
      MONGODB_RETRY_WRITES: 'true',
      [key]: value,
    };

    expect(isExactServerStagingSyntheticRuntime(environment)).toBe(false);
  });

  test('accepts the exact local validation selector and :38443 topology', () => {
    expect(
      validateStagingEnvironmentIsolation(validationEnvironment())
    ).toEqual([]);
  });

  test.each([
    'LIVEKIT_URL',
    'PASSWORD_RESET_BASE_URL',
    'CHECKOUT_RETURN_URL',
    'FRONTEND_COUNSELLOR_URL',
    'FRONTEND_API_WEB_URL',
    'FRONTEND_API_ADMIN_URL',
    'FRONTEND_SOCKET_WEB_URL',
    'MEDIA_PUBLIC_BASE_URL',
  ])('requires :38443 on validation URL %s', (key) => {
    const environment = validationEnvironment();
    environment[key] = externalTopology()[key];

    expect(validateStagingEnvironmentIsolation(environment))
      .toContainEqual(expect.stringMatching(new RegExp(`^${key} must equal`)));
  });

  test.each([
    'ALLOWED_ORIGINS',
    'WEB_SESSION_ORIGINS',
  ])('requires :38443 throughout validation origin mapping %s', (key) => {
    const environment = validationEnvironment();
    environment[key] = externalTopology()[key];

    expect(validateStagingEnvironmentIsolation(environment))
      .toContainEqual(
        expect.stringMatching(new RegExp(`^${key} must contain exactly`))
      );
  });

  test('keeps the validation LiveKit API on the isolated internal service', () => {
    const environment = validationEnvironment();
    environment.LIVEKIT_API_URL =
      `https://${stagingHosts.CALLS_DOMAIN}:${SERVER_STAGING_VALIDATION_PORT}`;

    expect(validateStagingEnvironmentIsolation(environment))
      .toContainEqual(
        `LIVEKIT_API_URL must equal ${SERVER_STAGING_LIVEKIT_API_URL} in staging`
      );
  });

  test.each([
    undefined,
    '',
    '38442',
    '38444',
  ])('requires the exact validation HTTPS selector port (%s)', (port) => {
    const environment = validationEnvironment();
    if (port === undefined) {
      delete environment.MENORAH_SERVER_STAGING_HTTPS_PORT;
    } else {
      environment.MENORAH_SERVER_STAGING_HTTPS_PORT = port;
    }

    expect(validateStagingEnvironmentIsolation(environment))
      .toContain(
        'MENORAH_SERVER_STAGING_HTTPS_PORT must equal 38443 '
        + 'for the reviewed local validation project'
      );
  });

  test('keeps the real server-staging project portless', () => {
    const environment = baseEnvironment({
      project: SERVER_STAGING_PROJECT,
    });

    expect(validateStagingEnvironmentIsolation(environment)).toEqual([]);
  });

  test.each([
    'LIVEKIT_URL',
    'PASSWORD_RESET_BASE_URL',
    'CHECKOUT_RETURN_URL',
    'FRONTEND_COUNSELLOR_URL',
    'FRONTEND_API_WEB_URL',
    'FRONTEND_API_ADMIN_URL',
    'FRONTEND_SOCKET_WEB_URL',
    'MEDIA_PUBLIC_BASE_URL',
  ])('rejects :38443 on real server-staging URL %s', (key) => {
    const environment = baseEnvironment({
      project: SERVER_STAGING_PROJECT,
    });
    environment[key] =
      externalTopology(SERVER_STAGING_VALIDATION_PORT)[key];

    expect(validateStagingEnvironmentIsolation(environment))
      .toContainEqual(expect.stringMatching(new RegExp(`^${key} must equal`)));
  });

  test.each([
    'ALLOWED_ORIGINS',
    'WEB_SESSION_ORIGINS',
  ])('rejects :38443 in real server-staging origin mapping %s', (key) => {
    const environment = baseEnvironment({
      project: SERVER_STAGING_PROJECT,
    });
    environment[key] =
      externalTopology(SERVER_STAGING_VALIDATION_PORT)[key];

    expect(validateStagingEnvironmentIsolation(environment))
      .toContainEqual(
        expect.stringMatching(new RegExp(`^${key} must contain exactly`))
      );
  });

  test.each([
    {
      environmentId: 'menorah-server-staging-v2',
      project: SERVER_STAGING_VALIDATION_PROJECT,
    },
    {
      environmentId: SERVER_STAGING_ENVIRONMENT_ID,
      project: 'menorah-staging-validation',
    },
    {
      environmentId: '',
      project: SERVER_STAGING_VALIDATION_PROJECT,
    },
  ])(
    'rejects crossed validation selectors (%o)',
    ({ environmentId, project }) => {
      const environment = baseEnvironment({
        environmentId,
        project,
        externalPort: SERVER_STAGING_VALIDATION_PORT,
      });
      const errors = validateStagingEnvironmentIsolation(environment);

      expect(errors).toContain(
        'Server staging identity and project selectors must match '
        + 'the reviewed namespace'
      );
      expect(errors).toContain(
        `LIVEKIT_URL must equal wss://${stagingHosts.CALLS_DOMAIN} in staging`
      );
    }
  );

  test('retains the existing local-staging port behavior', () => {
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
    const environment = {
      ...localHosts,
      MENORAH_LOCAL_STAGING_HTTPS_PORT: port,
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
      FRONTEND_SOCKET_WEB_URL:
        httpsOrigin(localHosts.API_WEB_DOMAIN),
      MEDIA_PUBLIC_BASE_URL:
        httpsOrigin(localHosts.API_WEB_DOMAIN),
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
    };

    expect(validateStagingEnvironmentIsolation(environment)).toEqual([]);
  });
});
