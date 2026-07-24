const {
  DEPLOYMENT_ENVIRONMENTS,
  STAGING_HOST_ENV_KEYS,
  getDeploymentEnvironment,
  isExactRealServerStagingSyntheticRuntime,
  validateStagingEnvironmentIsolation,
} = require('./deploymentEnvironment');

const CANONICAL_RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const LOCAL_STAGING_RESEND_EMAIL_URL =
  'http://mail-capture:8025/emails';
const SERVER_STAGING_RESEND_EMAIL_URL =
  'http://staging-mail-capture:8025/emails';
const LOCAL_STAGING_ENVIRONMENT_ID = 'menorah-local-staging-v1';
const SERVER_STAGING_ENVIRONMENT_ID = 'menorah-server-staging-v1';
const LOCAL_STAGING_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.staging\.localhost$/;
const SERVER_STAGING_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)?staging\.menorah\.me$/;
const LOCAL_STAGING_RESEND_KEY_PATTERN =
  /^re_local_[A-Za-z0-9_-]{32,}$/;
const SERVER_STAGING_RESEND_KEY_PATTERN =
  /^re_server_staging_[A-Za-z0-9_-]{32,}$/;
const EXTERNAL_RESEND_KEY_PATTERN =
  /^re_[A-Za-z0-9_-]{32,}$/;
const SERVER_STAGING_PROJECTS = new Set([
  'menorah-staging',
  'menorah-server-staging-validation',
]);

const isExactLocalStagingIdentity = (env = process.env) => {
  const httpsPort = String(
    env.MENORAH_LOCAL_STAGING_HTTPS_PORT || ''
  ).trim();
  const parsedPort = /^\d+$/.test(httpsPort) ? Number(httpsPort) : NaN;

  return (
    env.NODE_ENV === 'production'
    && getDeploymentEnvironment(env) === DEPLOYMENT_ENVIRONMENTS.STAGING
    && !String(env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID || '').trim()
    && String(env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID || '').trim()
      === LOCAL_STAGING_ENVIRONMENT_ID
    && Number.isSafeInteger(parsedPort)
    && parsedPort >= 1024
    && parsedPort <= 65535
    && STAGING_HOST_ENV_KEYS.every((key) =>
      LOCAL_STAGING_HOST_PATTERN.test(String(env[key] || ''))
    )
    && validateStagingEnvironmentIsolation(env).length === 0
  );
};

const isExactServerStagingIdentity = (env = process.env) => (
  env.NODE_ENV === 'production'
  && getDeploymentEnvironment(env) === DEPLOYMENT_ENVIRONMENTS.STAGING
  && !String(env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID || '').trim()
  && !String(env.MENORAH_LOCAL_STAGING_HTTPS_PORT || '').trim()
  && String(env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID || '').trim()
    === SERVER_STAGING_ENVIRONMENT_ID
  && SERVER_STAGING_PROJECTS.has(
    String(env.MENORAH_SERVER_STAGING_PROJECT_NAME || '').trim()
  )
  && STAGING_HOST_ENV_KEYS.every((key) =>
    SERVER_STAGING_HOST_PATTERN.test(String(env[key] || ''))
  )
  && validateStagingEnvironmentIsolation(env).length === 0
);

const isExactRealServerStagingResendSandbox = (
  env = process.env
) => (
  isExactRealServerStagingSyntheticRuntime(env)
  && isExactServerStagingIdentity(env)
  && String(env.RESEND_PROVIDER_ENABLED || '').trim() === 'true'
  && String(env.RESEND_MODE || '').trim() === 'sandbox'
);

const resolveResendEmailUrl = (env = process.env) => {
  const configuredUrl = String(env.RESEND_API_URL || '').trim();
  if (!configuredUrl) {
    if (
      String(env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID || '').trim()
      || String(env.MENORAH_SERVER_STAGING_PROJECT_NAME || '').trim()
    ) {
      throw new Error(
        'Real server staging requires an explicitly approved Resend endpoint'
      );
    }
    return CANONICAL_RESEND_EMAIL_URL;
  }

  const isApprovedLocalCapture = (
    configuredUrl === LOCAL_STAGING_RESEND_EMAIL_URL
    && isExactLocalStagingIdentity(env)
  );
  const isApprovedServerCapture = (
    configuredUrl === SERVER_STAGING_RESEND_EMAIL_URL
    && isExactServerStagingIdentity(env)
  );
  const isApprovedRealServerStagingSandbox = (
    configuredUrl === CANONICAL_RESEND_EMAIL_URL
    && isExactRealServerStagingResendSandbox(env)
  );
  if (isApprovedRealServerStagingSandbox) {
    return CANONICAL_RESEND_EMAIL_URL;
  }
  if (!isApprovedLocalCapture && !isApprovedServerCapture) {
    throw new Error(
      'RESEND_API_URL is allowed only as the exact internal endpoint '
      + 'for a reviewed Menorah staging identity or as the exact '
      + 'external endpoint for approved real server-staging sandbox delivery'
    );
  }

  return configuredUrl;
};

const validateResendDeliveryConfiguration = (env = process.env) => {
  const errors = [];
  let endpoint;
  try {
    endpoint = resolveResendEmailUrl(env);
  } catch (error) {
    errors.push(error.message);
    return errors;
  }

  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (
    endpoint === LOCAL_STAGING_RESEND_EMAIL_URL
    || endpoint === SERVER_STAGING_RESEND_EMAIL_URL
  ) {
    if (
      isExactLocalStagingIdentity(env)
      && !LOCAL_STAGING_RESEND_KEY_PATTERN.test(apiKey)
    ) {
      errors.push(
        'RESEND_API_KEY must use a strong re_local_ key for local staging'
      );
    } else if (
      isExactServerStagingIdentity(env)
      && !SERVER_STAGING_RESEND_KEY_PATTERN.test(apiKey)
    ) {
      errors.push(
        'RESEND_API_KEY must use a strong server-staging capture key'
      );
    }
  } else if (isExactRealServerStagingResendSandbox(env)) {
    if (
      !EXTERNAL_RESEND_KEY_PATTERN.test(apiKey)
      || LOCAL_STAGING_RESEND_KEY_PATTERN.test(apiKey)
      || SERVER_STAGING_RESEND_KEY_PATTERN.test(apiKey)
    ) {
      errors.push(
        'Approved server-staging Resend sandbox delivery requires a strong '
        + 'external re_ key that is not a staging mail-capture key'
      );
    }
  } else if (
    apiKey.startsWith('re_local_')
    || apiKey.startsWith('re_server_staging_')
  ) {
    errors.push(
      'A staging mail-capture key must never be sent to the external Resend endpoint'
    );
  }

  return errors;
};

module.exports = {
  CANONICAL_RESEND_EMAIL_URL,
  LOCAL_STAGING_ENVIRONMENT_ID,
  LOCAL_STAGING_RESEND_EMAIL_URL,
  SERVER_STAGING_ENVIRONMENT_ID,
  SERVER_STAGING_RESEND_EMAIL_URL,
  isExactRealServerStagingResendSandbox,
  isExactLocalStagingIdentity,
  isExactServerStagingIdentity,
  resolveResendEmailUrl,
  validateResendDeliveryConfiguration,
};
