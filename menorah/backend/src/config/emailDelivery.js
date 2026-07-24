const {
  DEPLOYMENT_ENVIRONMENTS,
  STAGING_HOST_ENV_KEYS,
  getDeploymentEnvironment,
  validateStagingEnvironmentIsolation,
} = require('./deploymentEnvironment');

const CANONICAL_RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const LOCAL_STAGING_RESEND_EMAIL_URL =
  'http://mail-capture:8025/emails';
const LOCAL_STAGING_ENVIRONMENT_ID = 'menorah-local-staging-v1';
const LOCAL_STAGING_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.staging\.localhost$/;
const LOCAL_STAGING_RESEND_KEY_PATTERN =
  /^re_local_[A-Za-z0-9_-]{32,}$/;

const isExactLocalStagingIdentity = (env = process.env) => {
  const httpsPort = String(
    env.MENORAH_LOCAL_STAGING_HTTPS_PORT || ''
  ).trim();
  const parsedPort = /^\d+$/.test(httpsPort) ? Number(httpsPort) : NaN;

  return (
    env.NODE_ENV === 'production'
    && getDeploymentEnvironment(env) === DEPLOYMENT_ENVIRONMENTS.STAGING
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

const resolveResendEmailUrl = (env = process.env) => {
  const configuredUrl = String(env.RESEND_API_URL || '').trim();
  if (!configuredUrl) return CANONICAL_RESEND_EMAIL_URL;

  if (
    configuredUrl !== LOCAL_STAGING_RESEND_EMAIL_URL
    || !isExactLocalStagingIdentity(env)
  ) {
    throw new Error(
      'RESEND_API_URL is allowed only as the exact internal endpoint '
      + 'for the generated Menorah local staging identity'
    );
  }

  return LOCAL_STAGING_RESEND_EMAIL_URL;
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
  if (endpoint === LOCAL_STAGING_RESEND_EMAIL_URL) {
    if (!LOCAL_STAGING_RESEND_KEY_PATTERN.test(apiKey)) {
      errors.push(
        'RESEND_API_KEY must use a strong re_local_ key for local staging'
      );
    }
  } else if (apiKey.startsWith('re_local_')) {
    errors.push(
      'A local mail-capture key must never be sent to the external Resend endpoint'
    );
  }

  return errors;
};

module.exports = {
  CANONICAL_RESEND_EMAIL_URL,
  LOCAL_STAGING_ENVIRONMENT_ID,
  LOCAL_STAGING_RESEND_EMAIL_URL,
  isExactLocalStagingIdentity,
  resolveResendEmailUrl,
  validateResendDeliveryConfiguration,
};
