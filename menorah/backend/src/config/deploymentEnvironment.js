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

const validateStagingEnvironmentIsolation = (env = process.env) => {
  const errors = [];
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

  const exactValues = {
    LIVEKIT_URL: `wss://${env.CALLS_DOMAIN || ''}`,
    LIVEKIT_API_URL: `https://${env.CALLS_DOMAIN || ''}`,
    PASSWORD_RESET_BASE_URL: `https://${env.APP_DOMAIN || ''}`,
    CHECKOUT_RETURN_URL: `https://${env.APP_DOMAIN || ''}/checkout/return`,
    FRONTEND_API_WEB_URL: `https://${env.API_WEB_DOMAIN || ''}/api`,
    FRONTEND_API_ADMIN_URL: `https://${env.API_ADMIN_DOMAIN || ''}/api`,
    FRONTEND_SOCKET_WEB_URL: `https://${env.API_WEB_DOMAIN || ''}`,
    MEDIA_PUBLIC_BASE_URL: `https://${env.API_WEB_DOMAIN || ''}`,
  };
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
    errors.push('EMAIL_FROM must contain a valid sender email address in staging');
  } else if (senderDomain !== stagingEmailDomain) {
    errors.push(
      'EMAIL_FROM sender domain must exactly match MENORAH_STAGING_EMAIL_DOMAIN'
    );
  }

  addExactCsvSetErrors({
    key: 'ALLOWED_ORIGINS',
    value: env.ALLOWED_ORIGINS,
    expected: [
      `https://${env.WWW_DOMAIN || ''}`,
      `https://${env.APP_DOMAIN || ''}`,
      `https://${env.ADMIN_DOMAIN || ''}`,
      `https://${env.COUNSELLOR_DOMAIN || ''}`,
    ],
    errors,
  });
  addExactCsvSetErrors({
    key: 'WEB_SESSION_ORIGINS',
    value: env.WEB_SESSION_ORIGINS,
    expected: [
      `https://${env.WWW_DOMAIN || ''}=user`,
      `https://${env.APP_DOMAIN || ''}=user`,
      `https://${env.COUNSELLOR_DOMAIN || ''}=counsellor`,
      `https://${env.ADMIN_DOMAIN || ''}=admin`,
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
  STAGING_HOST_ENV_KEYS,
  getDeploymentEnvironment,
  validateStagingEnvironmentIsolation,
};
