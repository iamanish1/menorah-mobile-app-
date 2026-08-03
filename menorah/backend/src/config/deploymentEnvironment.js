const DEPLOYMENT_ENVIRONMENTS = Object.freeze({
  PRODUCTION: 'production',
  STAGING: 'staging',
});

const SUPPORTED_DEPLOYMENT_ENVIRONMENTS = new Set(
  Object.values(DEPLOYMENT_ENVIRONMENTS)
);

const STAGING_HOST_ENV_KEYS = Object.freeze([
  'ROOT_DOMAIN',
  'WWW_DOMAIN',
  'APP_DOMAIN',
  'ADMIN_DOMAIN',
  'COUNSELLOR_DOMAIN',
  'API_IOS_DOMAIN',
  'API_ANDROID_DOMAIN',
  'API_WEB_DOMAIN',
  'API_ADMIN_DOMAIN',
  'CALLS_DOMAIN',
]);

const DNS_HOST_SOURCE =
  '(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?';
const STAGING_HOST_PATTERN = new RegExp(`^${DNS_HOST_SOURCE}$`);
const BARE_EMAIL_PATTERN = new RegExp(
  `^[A-Za-z0-9.!#$%&'*+/=?^_\`{|}~-]+@(${DNS_HOST_SOURCE})$`
);
const RAZORPAY_TEST_KEY_ID_PATTERN = /^rzp_test_[A-Za-z0-9]{14,64}$/;
const LOCAL_STAGING_HTTPS_PORT_ENV = 'MENORAH_LOCAL_STAGING_HTTPS_PORT';
const LOCAL_STAGING_ENVIRONMENT_ID_ENV =
  'MENORAH_LOCAL_STAGING_ENVIRONMENT_ID';
const LOCAL_STAGING_HOST_SUFFIX = '.staging.localhost';
const SERVER_STAGING_ENVIRONMENT_ID_ENV =
  'MENORAH_SERVER_STAGING_ENVIRONMENT_ID';
const SERVER_STAGING_ENVIRONMENT_ID = 'menorah-server-staging-v1';
const SERVER_STAGING_PROJECT_ENV =
  'MENORAH_SERVER_STAGING_PROJECT_NAME';
const SERVER_STAGING_HTTPS_PORT_ENV =
  'MENORAH_SERVER_STAGING_HTTPS_PORT';
const SERVER_STAGING_VALIDATION_PROJECT =
  'menorah-server-staging-validation';
const SERVER_STAGING_VALIDATION_HTTPS_PORT = '38443';
const SERVER_STAGING_PROJECTS = new Set([
  'menorah-staging',
  SERVER_STAGING_VALIDATION_PROJECT,
]);
const SERVER_STAGING_LIVEKIT_API_URL =
  'http://staging-livekit:7880';

const getDeploymentEnvironment = (env = process.env) => {
  const value = String(
    env.DEPLOYMENT_ENVIRONMENT || DEPLOYMENT_ENVIRONMENTS.PRODUCTION
  ).trim();

  if (!SUPPORTED_DEPLOYMENT_ENVIRONMENTS.has(value)) {
    throw new Error(
      'DEPLOYMENT_ENVIRONMENT must be exactly production or staging'
    );
  }

  return value;
};

const isExactServerStagingValidationSelector = (env = process.env) => (
  String(env[SERVER_STAGING_ENVIRONMENT_ID_ENV] || '').trim()
    === SERVER_STAGING_ENVIRONMENT_ID
  && String(env[SERVER_STAGING_PROJECT_ENV] || '').trim()
    === SERVER_STAGING_VALIDATION_PROJECT
  && String(env[SERVER_STAGING_HTTPS_PORT_ENV] || '').trim()
    === SERVER_STAGING_VALIDATION_HTTPS_PORT
  && !String(env[LOCAL_STAGING_ENVIRONMENT_ID_ENV] || '').trim()
  && !String(env[LOCAL_STAGING_HTTPS_PORT_ENV] || '').trim()
);

const hasExactServerStagingApplicationMongoTarget = (env) => {
  try {
    const mongodbUrl = new URL(String(env.MONGODB_URI || '').trim());
    const queryKeys = [...mongodbUrl.searchParams.keys()];
    return (
      mongodbUrl.protocol === 'mongodb:'
      && mongodbUrl.hostname === 'staging-mongo-primary'
      && mongodbUrl.port === '27017'
      && mongodbUrl.pathname === '/menorah_staging'
      && mongodbUrl.username === 'menorah-staging-app'
      && Boolean(mongodbUrl.password)
      && !mongodbUrl.hash
      && queryKeys.length === 3
      && new Set(queryKeys).size === 3
      && mongodbUrl.searchParams.getAll('replicaSet').length === 1
      && mongodbUrl.searchParams.get('replicaSet') === 'menorah-staging-rs'
      && mongodbUrl.searchParams.getAll('authSource').length === 1
      && mongodbUrl.searchParams.get('authSource') === 'admin'
      && mongodbUrl.searchParams.getAll('retryWrites').length === 1
      && mongodbUrl.searchParams.get('retryWrites') === 'true'
      && String(env.MONGODB_REPLICA_SET_NAME || '').trim()
        === 'menorah-staging-rs'
      && String(env.MONGODB_READ_PREFERENCE || '').trim()
        === 'primaryPreferred'
      && String(env.MONGODB_RETRY_WRITES || '').trim() === 'true'
    );
  } catch {
    return false;
  }
};

const isExactServerStagingSyntheticRuntime = (env = process.env) => (
  String(env.NODE_ENV || '').trim() === 'production'
  && String(env.DEPLOYMENT_ENVIRONMENT || '').trim()
    === DEPLOYMENT_ENVIRONMENTS.STAGING
  && String(env.SERVICE_RUNTIME || '').trim() === 'server-staging'
  && String(env.MENORAH_SYNTHETIC_DATA_ONLY || '').trim() === 'true'
  && String(env[SERVER_STAGING_ENVIRONMENT_ID_ENV] || '').trim()
    === SERVER_STAGING_ENVIRONMENT_ID
  && SERVER_STAGING_PROJECTS.has(
    String(env[SERVER_STAGING_PROJECT_ENV] || '').trim()
  )
  && String(env[SERVER_STAGING_HTTPS_PORT_ENV] || '').trim()
    === SERVER_STAGING_VALIDATION_HTTPS_PORT
  && !String(env[LOCAL_STAGING_ENVIRONMENT_ID_ENV] || '').trim()
  && !String(env[LOCAL_STAGING_HTTPS_PORT_ENV] || '').trim()
  && hasExactServerStagingApplicationMongoTarget(env)
);

const isExactRealServerStagingSyntheticRuntime = (env = process.env) => (
  isExactServerStagingSyntheticRuntime(env)
  && String(env[SERVER_STAGING_PROJECT_ENV] || '').trim()
    === 'menorah-staging'
);

const addExactCsvSetErrors = ({ key, value, expected, errors }) => {
  const entries = String(value || '').split(',');
  const actual = new Set(entries);
  const expectedSet = new Set(expected);

  if (
    entries.length !== expected.length
    || actual.size !== entries.length
    || actual.size !== expectedSet.size
    || entries.some((entry) => !expectedSet.has(entry))
  ) {
    errors.push(`${key} must contain exactly the reviewed staging mappings`);
  }
};

const getBareEmailDomain = (value) => {
  const match = String(value || '').trim().match(BARE_EMAIL_PATTERN);
  return match ? match[1] : null;
};

const getSenderEmailDomain = (value) => {
  const sender = String(value || '').trim();
  const displayNameMatch = sender.match(/^[^<>\r\n]+<([^<>\s]+)>$/);
  return getBareEmailDomain(displayNameMatch ? displayNameMatch[1] : sender);
};

const readLocalStagingHttpsPort = (env, errors) => {
  const raw = String(env[LOCAL_STAGING_HTTPS_PORT_ENV] || '').trim();
  if (!raw) return '';

  const port = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    errors.push(
      `${LOCAL_STAGING_HTTPS_PORT_ENV} must be an integer from 1024 through 65535`
    );
    return '';
  }

  const nonLocalHosts = STAGING_HOST_ENV_KEYS.filter(
    (key) => !String(env[key] || '').endsWith(LOCAL_STAGING_HOST_SUFFIX)
  );
  if (nonLocalHosts.length > 0) {
    errors.push(
      `${LOCAL_STAGING_HTTPS_PORT_ENV} is allowed only when every staging host ends with ${LOCAL_STAGING_HOST_SUFFIX}`
    );
    return '';
  }

  return raw;
};

const validateStagingEnvironmentIsolation = (
  env = process.env,
  {
    requireCheckoutReturnUrl = true,
    requireEmailRouting = true,
    requireMediaPublicBaseUrl = true,
  } = {}
) => {
  const errors = [];
  const serverStagingIdentity = String(
    env[SERVER_STAGING_ENVIRONMENT_ID_ENV] || ''
  ).trim();
  const serverStagingProject = String(
    env[SERVER_STAGING_PROJECT_ENV] || ''
  ).trim();
  const isExactServerStagingSelector = (
    serverStagingIdentity === SERVER_STAGING_ENVIRONMENT_ID
    && SERVER_STAGING_PROJECTS.has(serverStagingProject)
  );
  const hasExactServerStagingValidationIdentity = (
    isExactServerStagingSelector
    && serverStagingProject === SERVER_STAGING_VALIDATION_PROJECT
  );
  if (
    (serverStagingIdentity || serverStagingProject)
    && !isExactServerStagingSelector
  ) {
    errors.push(
      'Server staging identity and project selectors must match the reviewed namespace'
    );
  }
  if (
    hasExactServerStagingValidationIdentity
    && String(env[SERVER_STAGING_HTTPS_PORT_ENV] || '').trim()
      !== SERVER_STAGING_VALIDATION_HTTPS_PORT
  ) {
    errors.push(
      `${SERVER_STAGING_HTTPS_PORT_ENV} must equal `
      + `${SERVER_STAGING_VALIDATION_HTTPS_PORT} for the reviewed local validation project`
    );
  }
  if (
    hasExactServerStagingValidationIdentity
    && (
      String(env[LOCAL_STAGING_ENVIRONMENT_ID_ENV] || '').trim()
      || String(env[LOCAL_STAGING_HTTPS_PORT_ENV] || '').trim()
    )
  ) {
    errors.push(
      'Server-staging validation selectors must not be combined with local-staging selectors'
    );
  }
  const allowlistEntries = String(env.MENORAH_STAGING_ALLOWED_HOSTS || '').split(',');
  const allowlist = new Set(allowlistEntries);

  if (
    allowlistEntries.length !== STAGING_HOST_ENV_KEYS.length
    || allowlist.size !== allowlistEntries.length
  ) {
    errors.push(
      `MENORAH_STAGING_ALLOWED_HOSTS must contain exactly ${STAGING_HOST_ENV_KEYS.length} unique hosts`
    );
  }

  allowlistEntries.forEach((host) => {
    if (!STAGING_HOST_PATTERN.test(host) || !host.split('.').includes('staging')) {
      errors.push(
        'MENORAH_STAGING_ALLOWED_HOSTS must contain only lowercase DNS hosts with staging as a full label'
      );
    }
  });

  const assignedHosts = new Set();
  STAGING_HOST_ENV_KEYS.forEach((key) => {
    const host = String(env[key] || '');
    if (!STAGING_HOST_PATTERN.test(host) || !host.split('.').includes('staging')) {
      errors.push(
        `${key} must be a lowercase DNS host with staging as a full label`
      );
    }
    if (!allowlist.has(host)) {
      errors.push(`${key} must be present in MENORAH_STAGING_ALLOWED_HOSTS`);
    }
    if (assignedHosts.has(host)) {
      errors.push(`${key} must not alias another staging service host`);
    }
    assignedHosts.add(host);
  });

  if (
    assignedHosts.size !== STAGING_HOST_ENV_KEYS.length
    || allowlist.size !== assignedHosts.size
    || [...allowlist].some((host) => !assignedHosts.has(host))
  ) {
    errors.push(
      'MENORAH_STAGING_ALLOWED_HOSTS must exactly match the unique staging service hosts'
    );
  }

  const localHttpsPort = readLocalStagingHttpsPort(env, errors);
  const stagingExternalPortSuffix = localHttpsPort
    ? `:${localHttpsPort}`
    : (
      isExactServerStagingValidationSelector(env)
        ? `:${SERVER_STAGING_VALIDATION_HTTPS_PORT}`
        : ''
    );
  const httpsOrigin = (host) =>
    `https://${host || ''}${stagingExternalPortSuffix}`;
  const wssOrigin = (host) =>
    `wss://${host || ''}${stagingExternalPortSuffix}`;
  const exactValues = {
    LIVEKIT_URL: wssOrigin(env.CALLS_DOMAIN),
    LIVEKIT_API_URL: localHttpsPort
      ? 'http://livekit:7880'
      : (
        isExactServerStagingSelector
          ? SERVER_STAGING_LIVEKIT_API_URL
          : httpsOrigin(env.CALLS_DOMAIN)
      ),
    PASSWORD_RESET_BASE_URL: httpsOrigin(env.APP_DOMAIN),
    FRONTEND_COUNSELLOR_URL: httpsOrigin(env.COUNSELLOR_DOMAIN),
    FRONTEND_API_WEB_URL: `${httpsOrigin(env.API_WEB_DOMAIN)}/api`,
    FRONTEND_API_ADMIN_URL: `${httpsOrigin(env.API_ADMIN_DOMAIN)}/api`,
    FRONTEND_SOCKET_WEB_URL: httpsOrigin(env.API_WEB_DOMAIN),
  };
  if (requireCheckoutReturnUrl) {
    exactValues.CHECKOUT_RETURN_URL =
      `${httpsOrigin(env.APP_DOMAIN)}/checkout/callback`;
  }
  if (requireMediaPublicBaseUrl) {
    exactValues.MEDIA_PUBLIC_BASE_URL =
      httpsOrigin(env.API_WEB_DOMAIN);
  }
  Object.entries(exactValues).forEach(([key, expected]) => {
    if (String(env[key] || '') !== expected) {
      errors.push(`${key} must equal ${expected} in staging`);
    }
  });

  const stagingEmailDomain = String(
    env.MENORAH_STAGING_EMAIL_DOMAIN || ''
  ).trim();
  if (
    !STAGING_HOST_PATTERN.test(stagingEmailDomain)
    || !stagingEmailDomain.split('.').includes('staging')
  ) {
    errors.push(
      'MENORAH_STAGING_EMAIL_DOMAIN must be a lowercase DNS host with staging as a full label'
    );
  }

  if (requireEmailRouting) {
    const contactDomain = getBareEmailDomain(env.CONTACT_TO_EMAIL);
    if (!contactDomain) {
      errors.push('CONTACT_TO_EMAIL must be a bare email address in staging');
    } else if (contactDomain !== stagingEmailDomain) {
      errors.push(
        'CONTACT_TO_EMAIL domain must exactly match MENORAH_STAGING_EMAIL_DOMAIN'
      );
    }

    const senderDomain = getSenderEmailDomain(env.EMAIL_FROM);
    if (!senderDomain) {
      errors.push(
        'EMAIL_FROM must contain a valid sender email address in staging'
      );
    } else if (senderDomain !== stagingEmailDomain) {
      errors.push(
        'EMAIL_FROM sender domain must exactly match MENORAH_STAGING_EMAIL_DOMAIN'
      );
    }
  }

  addExactCsvSetErrors({
    key: 'ALLOWED_ORIGINS',
    value: env.ALLOWED_ORIGINS,
    expected: [
      httpsOrigin(env.WWW_DOMAIN),
      httpsOrigin(env.APP_DOMAIN),
      httpsOrigin(env.ADMIN_DOMAIN),
      httpsOrigin(env.COUNSELLOR_DOMAIN),
    ],
    errors,
  });
  addExactCsvSetErrors({
    key: 'WEB_SESSION_ORIGINS',
    value: env.WEB_SESSION_ORIGINS,
    expected: [
      `${httpsOrigin(env.WWW_DOMAIN)}=user`,
      `${httpsOrigin(env.APP_DOMAIN)}=user`,
      `${httpsOrigin(env.COUNSELLOR_DOMAIN)}=counsellor`,
      `${httpsOrigin(env.ADMIN_DOMAIN)}=admin`,
    ],
    errors,
  });

  ['RAZORPAY_KEY_ID', 'RAZORPAY_X_KEY_ID', 'NEXT_PUBLIC_RAZORPAY_KEY_ID']
    .forEach((key) => {
      const value = String(env[key] || '');
      if (value && !RAZORPAY_TEST_KEY_ID_PATTERN.test(value)) {
        errors.push(`${key} must use an rzp_test_ key ID in staging`);
      }
    });

  return errors;
};

module.exports = {
  DEPLOYMENT_ENVIRONMENTS,
  LOCAL_STAGING_HTTPS_PORT_ENV,
  SERVER_STAGING_HTTPS_PORT_ENV,
  SERVER_STAGING_ENVIRONMENT_ID_ENV,
  SERVER_STAGING_LIVEKIT_API_URL,
  SERVER_STAGING_VALIDATION_HTTPS_PORT,
  STAGING_HOST_ENV_KEYS,
  getDeploymentEnvironment,
  isExactRealServerStagingSyntheticRuntime,
  isExactServerStagingValidationSelector,
  isExactServerStagingSyntheticRuntime,
  validateStagingEnvironmentIsolation,
};
