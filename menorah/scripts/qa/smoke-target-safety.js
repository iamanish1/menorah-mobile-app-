const PRODUCTION_HOSTS = new Set([
  'api-web.menorah.me',
  'api-ios.menorah.me',
  'api-android.menorah.me',
  'api-admin.menorah.me',
  'api.menorah.me',
  'menorah.me',
  'www.menorah.me',
  'app.menorah.me',
  'admin.menorah.me',
  'counsellor.menorah.me',
  'calls.menorah.me',
  'vps.menorah.me',
]);

const PRODUCTION_CONFIRMATION = 'ALLOW_APPROVED_PRODUCTION_SMOKE';
const SYNTHETIC_DATA_CONFIRMATION = 'PROJECT_OWNED_SYNTHETIC_DATA_ONLY';
const LOCAL_MAIL_CAPTURE_CONFIRMATION =
  'USE_INTERNAL_SYNTHETIC_OTP_CAPTURE';
const SERVER_STAGING_VALIDATION_CONFIRMATION =
  'USE_EXACT_MENORAH_SERVER_STAGING_VALIDATION';
const SERVER_STAGING_VALIDATION_PROJECT =
  'menorah-server-staging-validation';
const SERVER_STAGING_MAIL_CAPTURE_SERVICE =
  'staging-mail-capture';
const SERVER_STAGING_HTTPS_PORT = '38443';
const SERVER_STAGING_HOSTS = Object.freeze([
  'staging.menorah.me',
  'www.staging.menorah.me',
  'app.staging.menorah.me',
  'admin.staging.menorah.me',
  'counsellor.staging.menorah.me',
  'api-ios.staging.menorah.me',
  'api-android.staging.menorah.me',
  'api-web.staging.menorah.me',
  'api-admin.staging.menorah.me',
  'calls.staging.menorah.me',
]);
const SERVER_STAGING_BROWSER_TARGETS = Object.freeze({
  QA_WWW_URL: `https://www.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
  QA_APP_URL: `https://app.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
  QA_ADMIN_URL:
    `https://admin.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
  QA_COUNSELLOR_WEB_URL:
    `https://counsellor.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
});
const SERVER_STAGING_API_TARGETS = Object.freeze({
  apiIos: 'http://127.0.0.1:38080',
  apiAndroid: 'http://127.0.0.1:38081',
  apiWeb: 'http://127.0.0.1:38082',
  apiAdmin: 'http://127.0.0.1:38083',
  worker: 'http://127.0.0.1:38084',
});
const SERVER_STAGING_NAMED_HTTPS_TARGETS = Object.freeze({
  ...SERVER_STAGING_BROWSER_TARGETS,
  QA_API_IOS_URL:
    `https://api-ios.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
  QA_API_ANDROID_URL:
    `https://api-android.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
  QA_API_WEB_URL:
    `https://api-web.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
  QA_API_ADMIN_URL:
    `https://api-admin.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}`,
  QA_API_BASE:
    `https://api-web.staging.menorah.me:${SERVER_STAGING_HTTPS_PORT}/api`,
});
const SERVER_STAGING_HOST_RESOLVER_RULES = [
  ...SERVER_STAGING_HOSTS.map((host) => `MAP ${host} 127.0.0.1`),
  'EXCLUDE localhost',
].join(',');

function resolveLocalValidationProfile(env = process.env) {
  const confirmation = String(
    env.QA_SERVER_STAGING_VALIDATION_CONFIRM || ''
  ).trim();
  const serverIndicators = [
    env.QA_LOCAL_STAGING_HTTPS_PORT === SERVER_STAGING_HTTPS_PORT,
    env.COMPOSE_PROJECT_NAME === SERVER_STAGING_VALIDATION_PROJECT,
    Boolean(env.QA_SERVER_STAGING_VALIDATION_PROJECT),
    Boolean(env.QA_MAIL_CAPTURE_SERVICE),
  ];

  if (!confirmation) {
    if (serverIndicators.some(Boolean)) {
      throw new Error(
        `Server-staging validation requires QA_SERVER_STAGING_VALIDATION_CONFIRM=${SERVER_STAGING_VALIDATION_CONFIRMATION}`
      );
    }
    return Object.freeze({
      kind: 'local-staging',
      apiTargets: null,
      browserTargets: null,
      dockerProject: 'menorah-local-staging',
      mailCaptureService: 'mail-capture',
      syntheticEmailSuffix: '@mail.staging.localhost',
      httpsPort: String(env.QA_LOCAL_STAGING_HTTPS_PORT || '').trim(),
      hostResolverRules: '',
    });
  }

  if (confirmation !== SERVER_STAGING_VALIDATION_CONFIRMATION) {
    throw new Error(
      `QA_SERVER_STAGING_VALIDATION_CONFIRM must equal ${SERVER_STAGING_VALIDATION_CONFIRMATION}`
    );
  }
  if (
    env.QA_TARGET_ENVIRONMENT
    && env.QA_TARGET_ENVIRONMENT !== 'staging'
  ) {
    throw new Error(
      'Server-staging validation is restricted to QA_TARGET_ENVIRONMENT=staging'
    );
  }
  if (
    env.QA_LOCAL_STAGING_HTTPS_PORT
    && env.QA_LOCAL_STAGING_HTTPS_PORT !== SERVER_STAGING_HTTPS_PORT
  ) {
    throw new Error(
      `Server-staging validation requires the exact HTTPS port ${SERVER_STAGING_HTTPS_PORT}`
    );
  }
  for (const [key, expected] of [
    ['COMPOSE_PROJECT_NAME', SERVER_STAGING_VALIDATION_PROJECT],
    ['QA_SERVER_STAGING_VALIDATION_PROJECT',
      SERVER_STAGING_VALIDATION_PROJECT],
    ['QA_MAIL_CAPTURE_SERVICE', SERVER_STAGING_MAIL_CAPTURE_SERVICE],
  ]) {
    if (env[key] && env[key] !== expected) {
      throw new Error(
        `Server-staging validation requires ${key}=${expected}`
      );
    }
  }

  return Object.freeze({
    kind: 'server-staging-validation',
    apiTargets: SERVER_STAGING_API_TARGETS,
    browserTargets: SERVER_STAGING_BROWSER_TARGETS,
    dockerProject: SERVER_STAGING_VALIDATION_PROJECT,
    mailCaptureService: SERVER_STAGING_MAIL_CAPTURE_SERVICE,
    syntheticEmailSuffix: '@mail.staging.menorah.me',
    httpsPort: SERVER_STAGING_HTTPS_PORT,
    hostResolverRules: SERVER_STAGING_HOST_RESOLVER_RULES,
  });
}

function requireHttpsTarget(name, value, { allowedPort = '' } = {}) {
  const candidate = String(value || '').trim();
  if (!candidate) throw new Error(`${name} is required; there is no default target`);

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL`);
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.port && parsed.port !== allowedPort)
    || (allowedPort && parsed.port !== allowedPort)
    || parsed.hostname.endsWith('.')
  ) {
    throw new Error(
      `${name} must be a credential-free HTTPS URL with the exact approved port, no trailing-dot alias, query, or fragment`
    );
  }

  return candidate.replace(/\/+$/, '');
}

function requireSyntheticEmail(env) {
  const email = String(env.QA_EMAIL || '').trim();
  if (
    !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)
    || env.QA_SYNTHETIC_DATA_CONFIRM !== SYNTHETIC_DATA_CONFIRMATION
  ) {
    throw new Error(
      `QA_EMAIL and QA_SYNTHETIC_DATA_CONFIRM=${SYNTHETIC_DATA_CONFIRMATION} are required`
    );
  }
  return email;
}

function validateOptionalSyntheticAdminCredentials(env) {
  const validationProfile = resolveLocalValidationProfile(env);
  const email = String(env.QA_ADMIN_EMAIL || '').trim();
  const password = String(env.QA_ADMIN_PASSWORD || '');
  if (!email && !password) return;
  if (
    !email
    || !password
    || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)
    || env.QA_SYNTHETIC_DATA_CONFIRM !== SYNTHETIC_DATA_CONFIRMATION
  ) {
    throw new Error(
      'Staging admin smoke requires both synthetic admin credentials and QA_SYNTHETIC_DATA_CONFIRM'
    );
  }
  if (
    validationProfile.httpsPort
    && env.QA_LOCAL_STAGING_MAIL_CAPTURE_CONFIRM
      !== LOCAL_MAIL_CAPTURE_CONFIRMATION
  ) {
    throw new Error(
      'Local staging admin smoke requires the exact internal synthetic OTP capture confirmation'
    );
  }
}

function validateSmokeTargets(env, namedTargets) {
  const environment = String(env.QA_TARGET_ENVIRONMENT || '').trim();
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('QA_TARGET_ENVIRONMENT must be exactly staging or production');
  }

  const validationProfile = resolveLocalValidationProfile(env);
  const localStagingPort = validationProfile.httpsPort;
  if (localStagingPort) {
    const numericPort = /^\d+$/.test(localStagingPort)
      ? Number(localStagingPort)
      : NaN;
    if (
      environment !== 'staging'
      || !Number.isSafeInteger(numericPort)
      || numericPort < 1024
      || numericPort > 65535
    ) {
      throw new Error(
        'QA_LOCAL_STAGING_HTTPS_PORT is restricted to high-port staging targets'
      );
    }
  }

  const targets = Object.fromEntries(
    Object.entries(namedTargets).map(([name, value]) => [
      name,
      requireHttpsTarget(name, value, { allowedPort: localStagingPort }),
    ])
  );
  if (validationProfile.kind === 'server-staging-validation') {
    for (const [name, value] of Object.entries(targets)) {
      const expected = SERVER_STAGING_NAMED_HTTPS_TARGETS[name];
      if (!expected || value !== expected) {
        throw new Error(
          `${name} must target exactly the approved server-staging validation URL`
        );
      }
    }
  }
  const productionTargets = Object.entries(targets).filter(([, value]) =>
    PRODUCTION_HOSTS.has(new URL(value).hostname.toLowerCase())
  );

  if (environment === 'staging') {
    if (productionTargets.length > 0) {
      throw new Error(
        `Staging smoke tests cannot target production: ${productionTargets
          .map(([name]) => name)
          .join(', ')}`
      );
    }

    const allowedHosts = new Set(
      String(
        env.QA_STAGING_ALLOWED_HOSTS
        || (
          validationProfile.kind === 'server-staging-validation'
            ? SERVER_STAGING_HOSTS.join(',')
            : ''
        )
      )
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    );
    if (allowedHosts.size === 0) {
      throw new Error('QA_STAGING_ALLOWED_HOSTS must list the approved staging hosts');
    }
    if (
      validationProfile.kind === 'server-staging-validation'
      && (
        allowedHosts.size !== SERVER_STAGING_HOSTS.length
        || SERVER_STAGING_HOSTS.some((host) => !allowedHosts.has(host))
      )
    ) {
      throw new Error(
        'Server-staging validation requires the exact approved staging host set'
      );
    }
    for (const host of allowedHosts) {
      if (
        host.endsWith('.')
        || PRODUCTION_HOSTS.has(host)
        || !/(?:^|[.-])(?:staging|security-test)(?:[.-]|$)/.test(host)
      ) {
        throw new Error(`QA_STAGING_ALLOWED_HOSTS contains an unsafe host: ${host}`);
      }
    }
    if (
      localStagingPort
      && validationProfile.kind === 'local-staging'
      && [...allowedHosts].some(
        (host) => !host.endsWith('.staging.localhost')
      )
    ) {
      throw new Error(
        'QA_LOCAL_STAGING_HTTPS_PORT requires only *.staging.localhost hosts'
      );
    }

    const unapprovedTargets = Object.entries(targets).filter(([, value]) =>
      !allowedHosts.has(new URL(value).hostname.toLowerCase())
    );
    if (unapprovedTargets.length > 0) {
      throw new Error(
        `Staging smoke targets are not in QA_STAGING_ALLOWED_HOSTS: ${unapprovedTargets
          .map(([name]) => name)
          .join(', ')}`
      );
    }
  }

  if (environment === 'production') {
    if (env.QA_ALLOW_PRODUCTION_SMOKE !== PRODUCTION_CONFIRMATION) {
      throw new Error(
        `Production smoke requires QA_ALLOW_PRODUCTION_SMOKE=${PRODUCTION_CONFIRMATION}`
      );
    }
    if (!String(env.QA_PRODUCTION_CHANGE_REFERENCE || '').trim()) {
      throw new Error('Production smoke requires QA_PRODUCTION_CHANGE_REFERENCE');
    }
    if (productionTargets.length !== Object.keys(targets).length) {
      throw new Error('Production smoke targets must use only approved Menorah production hosts');
    }
  }

  return targets;
}

module.exports = {
  LOCAL_MAIL_CAPTURE_CONFIRMATION,
  PRODUCTION_CONFIRMATION,
  PRODUCTION_HOSTS,
  SERVER_STAGING_API_TARGETS,
  SERVER_STAGING_BROWSER_TARGETS,
  SERVER_STAGING_HOSTS,
  SERVER_STAGING_HOST_RESOLVER_RULES,
  SERVER_STAGING_HTTPS_PORT,
  SERVER_STAGING_MAIL_CAPTURE_SERVICE,
  SERVER_STAGING_VALIDATION_CONFIRMATION,
  SERVER_STAGING_VALIDATION_PROJECT,
  SYNTHETIC_DATA_CONFIRMATION,
  requireHttpsTarget,
  requireSyntheticEmail,
  resolveLocalValidationProfile,
  validateOptionalSyntheticAdminCredentials,
  validateSmokeTargets,
};
