#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';

export const REAL_PROJECT = 'menorah-staging';
export const VALIDATION_PROJECT =
  'menorah-server-staging-validation';
export const ENVIRONMENT_ID = 'menorah-server-staging-v1';

const EXPECTED_KYC_CONSENT_VERSION =
  'ordinary-face-check-v1-2026-07-22';
const EXPECTED_PRIVACY_RETENTION_POLICY_VERSION =
  'synthetic-server-staging-retention-v1';
const EXPECTED_PRIVACY_RETENTION_CATEGORIES = Object.freeze([
  'account_profile',
  'booking_clinical',
  'chat_content',
  'call_metadata',
  'payment_finance',
  'security_audit',
  'privacy_consent_evidence',
  'privacy_rights_request_payload',
  'face_check_metadata',
  'backups',
  'operational_logs',
  'vendor_copies',
]);
const EXPECTED_PRIVACY_ADMIN_ID = '7a110ca15a6e000000000104';
const EXPECTED_PRIVACY_PERMISSIONS = Object.freeze([
  'privacy_reader',
  'privacy_reviewer',
  'privacy_legal_hold',
]);

export const EXPECTED_HOSTS = Object.freeze([
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

export const EXPECTED_PORT_VARIABLES = Object.freeze({
  CADDY_HTTP_PORT: '127.0.0.1:38000',
  CADDY_HTTPS_PORT: '127.0.0.1:38443',
  API_IOS_LOCAL_PORT: '127.0.0.1:38080',
  API_ANDROID_LOCAL_PORT: '127.0.0.1:38081',
  API_WEB_LOCAL_PORT: '127.0.0.1:38082',
  API_ADMIN_LOCAL_PORT: '127.0.0.1:38083',
  WORKER_LOCAL_PORT: '127.0.0.1:38084',
  WEB_APP_LOCAL_PORT: '127.0.0.1:33001',
  USER_WEB_APP_LOCAL_PORT: '127.0.0.1:33002',
  ADMIN_PANEL_LOCAL_PORT: '127.0.0.1:33003',
  LIVEKIT_LOCAL_PORT: '127.0.0.1:37880',
  LIVEKIT_RTC_TCP_LOCAL_PORT: '127.0.0.1:37881',
  LIVEKIT_RTC_UDP_PORT_RANGE: '35000-35100',
  PROMETHEUS_LOCAL_PORT: '127.0.0.1:39090',
  ALERTMANAGER_LOCAL_PORT: '127.0.0.1:39093',
  LOKI_LOCAL_PORT: '127.0.0.1:33100',
  ALLOY_LOCAL_PORT: '127.0.0.1:32345',
  MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
  MENORAH_SERVER_STAGING_TUNNEL_ORIGIN_PORT: '38000',
});

export const PRODUCTION_ROOTS = Object.freeze([
  '/opt/menorah/data',
  '/opt/menorah/backups',
  '/opt/menorah/deploy-state',
  '/opt/menorah/menorah',
  '/srv/menorah',
  '/mnt/menorah',
  '/mnt/menorah-backups',
]);

const IMAGE_KEYS = Object.freeze([
  'MENORAH_SERVER_STAGING_BACKEND_IMAGE',
  'MENORAH_SERVER_STAGING_USER_WEB_IMAGE',
  'MENORAH_SERVER_STAGING_COUNSELLOR_WEB_IMAGE',
  'MENORAH_SERVER_STAGING_ADMIN_PANEL_IMAGE',
  'MENORAH_SERVER_STAGING_MAIL_CAPTURE_IMAGE',
  'MENORAH_SERVER_STAGING_ALERT_FIXTURE_IMAGE',
  'MENORAH_SERVER_STAGING_MONGODB_EXPORTER_IMAGE',
  'MENORAH_SERVER_STAGING_REDIS_EXPORTER_IMAGE',
  'MENORAH_SERVER_STAGING_LOKI_IMAGE',
  'MENORAH_SERVER_STAGING_ALLOY_IMAGE',
  'MENORAH_SERVER_STAGING_BACKUP_TOOLS_IMAGE',
]);

export const REQUIRED_KEYS = Object.freeze([
  'NODE_ENV',
  'DEPLOYMENT_ENVIRONMENT',
  'SERVICE_RUNTIME',
  'MENORAH_SYNTHETIC_DATA_ONLY',
  'MENORAH_SERVER_STAGING_PROJECT_NAME',
  'MENORAH_SERVER_STAGING_RESOURCE_PREFIX',
  'MENORAH_SERVER_STAGING_ENVIRONMENT_ID',
  'MENORAH_RUNTIME_CANDIDATE_SHA',
  'MENORAH_SERVER_STAGING_RUNTIME_SHA',
  'MENORAH_SERVER_STAGING_ROOT',
  'MENORAH_SERVER_STAGING_DATA_ROOT',
  'MENORAH_SERVER_STAGING_BACKUP_ROOT',
  'MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT',
  'MENORAH_SERVER_STAGING_LOGS_ROOT',
  'MENORAH_SERVER_STAGING_ENV_ROOT',
  'MENORAH_SERVER_STAGING_APP_ROOT',
  'MENORAH_SERVER_STAGING_ENV_FILE',
  'MENORAH_SERVER_STAGING_MONGO_KEYFILE',
  'MENORAH_SERVER_STAGING_BACKUP_PASSWORD_FILE',
  'MENORAH_SERVER_STAGING_BACKUP_HMAC_FILE',
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
  'MENORAH_STAGING_ALLOWED_HOSTS',
  'MENORAH_STAGING_EMAIL_DOMAIN',
  'MONGO_DATABASE',
  'MONGO_RESTORE_DATABASE',
  'MONGODB_REPLICA_SET_NAME',
  'MONGODB_RESTORE_REPLICA_SET_NAME',
  'MONGODB_URI',
  'MONGODB_MIGRATION_URI',
  'MONGODB_BACKUP_URI',
  'MONGODB_RESTORE_URI',
  'MONGODB_STAGING_BACKUP_URI',
  'MONGODB_STAGING_RESTORE_URI',
  'MONGODB_MONITORING_URI',
  'MONGODB_RESTORE_TEST_URI',
  'REDIS_STAGING_USERNAME',
  'REDIS_STAGING_PASSWORD',
  'REDIS_URL',
  'REDIS_MONITORING_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATA_ENCRYPTION_KEY',
  'AUDIT_LOG_SIGNING_KEY',
  'BACKUP_ENCRYPTION_PASSWORD',
  'BACKUP_INTEGRITY_HMAC_KEY',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'KYC_CONSENT_VERSION',
  'PRIVACY_RETENTION_POLICY_JSON',
  'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON',
  'MEDIA_STORAGE_BUCKET',
  'PROMETHEUS_EXTERNAL_ENVIRONMENT',
  'PROMETHEUS_EXTERNAL_PROJECT',
  'ALERTMANAGER_ENVIRONMENT',
  'ALERTMANAGER_RECEIVER',
  'BACKUP_METADATA_FILE',
  'BACKUP_LOCK_FILE',
  'BACKUP_RESTORE_ACKNOWLEDGEMENT',
  'MENORAH_CURRENT_SHA_FILE',
  'MENORAH_LAST_GOOD_SHA_FILE',
  'MENORAH_MIGRATION_APPLIED_MARKER',
  'MENORAH_MIGRATION_IN_PROGRESS_MARKER',
  'MENORAH_IDENTITY_RECONCILIATION_MARKER',
  'MENORAH_POST_MIGRATION_RECOVERY_MARKER',
  'MENORAH_DEPLOY_LOCK_FILE',
  'MENORAH_ROLLBACK_LOCK_FILE',
  ...IMAGE_KEYS,
  ...Object.keys(EXPECTED_PORT_VARIABLES),
]);

const SECRET_KEYS = Object.freeze([
  'MONGO_STAGING_ROOT_PASSWORD',
  'MONGO_STAGING_APP_PASSWORD',
  'MONGO_STAGING_MIGRATION_PASSWORD',
  'MONGO_STAGING_BACKUP_PASSWORD',
  'MONGO_STAGING_RESTORE_PASSWORD',
  'MONGO_STAGING_MONITOR_PASSWORD',
  'REDIS_STAGING_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATA_ENCRYPTION_KEY',
  'AUDIT_LOG_SIGNING_KEY',
  'BACKUP_ENCRYPTION_PASSWORD',
  'BACKUP_INTEGRITY_HMAC_KEY',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_X_KEY_ID',
  'RAZORPAY_X_KEY_SECRET',
  'RAZORPAY_X_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
]);

const MONGO_IDENTITIES = Object.freeze({
  root: ['MONGO_STAGING_ROOT_USER', 'MONGO_STAGING_ROOT_PASSWORD'],
  app: ['MONGO_STAGING_APP_USER', 'MONGO_STAGING_APP_PASSWORD'],
  migration: [
    'MONGO_STAGING_MIGRATION_USER',
    'MONGO_STAGING_MIGRATION_PASSWORD',
  ],
  backup: [
    'MONGO_STAGING_BACKUP_USER',
    'MONGO_STAGING_BACKUP_PASSWORD',
  ],
  restore: [
    'MONGO_STAGING_RESTORE_USER',
    'MONGO_STAGING_RESTORE_PASSWORD',
  ],
  monitor: [
    'MONGO_STAGING_MONITOR_USER',
    'MONGO_STAGING_MONITOR_PASSWORD',
  ],
});

const MONGO_URI_CONTRACT = Object.freeze({
  MONGODB_URI: {
    identity: 'app',
    hostname: 'staging-mongo-primary',
    database: 'menorah_staging',
    replicaSet: 'menorah-staging-rs',
  },
  MONGODB_MIGRATION_URI: {
    identity: 'migration',
    hostname: 'staging-mongo-primary',
    database: 'menorah_staging',
    replicaSet: 'menorah-staging-rs',
  },
  MONGODB_BACKUP_URI: {
    identity: 'backup',
    hostname: 'staging-mongo-primary',
    database: 'menorah_staging',
    replicaSet: 'menorah-staging-rs',
  },
  MONGODB_STAGING_BACKUP_URI: {
    identity: 'backup',
    hostname: 'staging-mongo-primary',
    database: 'menorah_staging',
    replicaSet: 'menorah-staging-rs',
  },
  MONGODB_RESTORE_URI: {
    identity: 'restore',
    hostname: 'staging-mongo-restore',
    database: 'menorah_staging',
    replicaSet: 'menorah-staging-restore-rs',
  },
  MONGODB_STAGING_RESTORE_URI: {
    identity: 'restore',
    hostname: 'staging-mongo-restore',
    database: 'menorah_staging',
    replicaSet: 'menorah-staging-restore-rs',
  },
  MONGODB_RESTORE_TEST_URI: {
    identity: 'restore',
    hostname: 'staging-mongo-restore',
    database: 'menorah_staging',
    replicaSet: 'menorah-staging-restore-rs',
  },
  MONGODB_MONITORING_URI: {
    identity: 'monitor',
    hostname: 'staging-mongo-primary',
    database: 'admin',
    replicaSet: 'menorah-staging-rs',
  },
});

const EXTERNAL_URL_KEYS = Object.freeze([
  'PUBLIC_WEB_BASE_URL',
  'FRONTEND_WWW_URL',
  'FRONTEND_APP_URL',
  'FRONTEND_COUNSELLOR_URL',
  'FRONTEND_API_WEB_URL',
  'FRONTEND_API_ADMIN_URL',
  'FRONTEND_SOCKET_WEB_URL',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SOCKET_URL',
  'NEXT_PUBLIC_WEB_BASE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'PASSWORD_RESET_BASE_URL',
  'CHECKOUT_RETURN_URL',
  'COUNSELLOR_ONBOARDING_NOTICE_URL',
  'MEDIA_PUBLIC_BASE_URL',
  'LIVEKIT_URL',
]);

const OPTIONAL_PROVIDER_RULES = Object.freeze([
  {
    flag: 'BOOKING_PAYMENTS_ENABLED',
    modeKey: 'RAZORPAY_MODE',
    mode: 'test',
    keys: [
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
    ],
  },
  {
    flag: 'PAYOUTS_ENABLED',
    modeKey: 'RAZORPAY_X_MODE',
    mode: 'test',
    keys: [
      'RAZORPAY_X_KEY_ID',
      'RAZORPAY_X_KEY_SECRET',
      'RAZORPAY_X_WEBHOOK_SECRET',
      'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
    ],
  },
  {
    flag: 'RESEND_PROVIDER_ENABLED',
    modeKey: 'RESEND_MODE',
    mode: 'sandbox',
    keys: [
      'RESEND_API_URL',
      'RESEND_API_KEY',
      'RESEND_WEBHOOK_SECRET',
      'EMAIL_FROM',
    ],
  },
  {
    flag: 'APPLE_SIGN_IN_ENABLED',
    modeKey: null,
    mode: null,
    keys: [
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
      'APPLE_WEB_SERVICE_ID',
    ],
  },
]);

const ALWAYS_DISABLED_PROVIDER_FLAGS = Object.freeze([
  'UAE_CALLING_ENABLED',
  'VSEE_ENABLED',
  'DOXY_ENABLED',
  'ZOOM_ENABLED',
  'GOOGLE_MEET_ENABLED',
  'TEAMS_ENABLED',
  'SOCIAL_STUDIO_ENABLED',
  'SOCIAL_STUDIO_AUTO_PUBLISH',
]);

const PLACEHOLDER_PATTERN =
  /(?:<(?:replace|insert|set|your)[^>]+>|change[-_ ]?me|replace[-_ ]?with|example(?:[.-]|$)|placeholder|your[-_]|todo|tbd|secret[-_ ]?here|\bx{3,}\b)/i;
const PRODUCTION_DOMAIN_PATTERN =
  /(?:^|[^a-z0-9.-])(?:menorah\.me|www\.menorah\.me|app\.menorah\.me|admin\.menorah\.me|counsellor\.menorah\.me|api(?:-ios|-android|-web|-admin)?\.menorah\.me|calls\.menorah\.me|(?:[a-z0-9-]+\.)*mentle\.org)(?=$|[^a-z0-9.-])/i;
const LIVE_MODE_PATTERN =
  /(?:^|[-_:/.\s])(live|production|prod)(?:$|[-_:/.\s])/i;

const normalizePath = (value) => {
  const normalized = String(value).trim().replaceAll('\\', '/');
  if (/^(?:[A-Za-z]:)?\/+$/.test(normalized)) {
    return normalized.startsWith('/') ? '/' : `${normalized.slice(0, 2)}/`;
  }
  return normalized.replace(/\/+$/, '');
};

const isWithin = (candidate, root) => {
  const normalizedCandidate = normalizePath(candidate).toLowerCase();
  const normalizedRoot = normalizePath(root).toLowerCase();
  return (
    normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
};

const setEqual = (left, right) => (
  left.size === right.size
  && [...left].every((value) => right.has(value))
);

const isPlainRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

export const parseEnvironmentSource = (source, sourceName = '<memory>') => {
  const record = {};
  const lineNumbers = {};
  const lines = String(source).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) {
      throw new Error(
        `${sourceName}:${index + 1}: expected literal KEY=value syntax`,
      );
    }
    const [, key, rawValue] = match;
    if (Object.hasOwn(record, key)) {
      throw new Error(
        `${sourceName}:${index + 1}: duplicate key ${key}`
        + ` (first declared on line ${lineNumbers[key]})`,
      );
    }
    if (
      rawValue.includes('\0')
      || rawValue.includes('${')
      || rawValue.includes('$(')
      || rawValue.includes('`')
    ) {
      throw new Error(
        `${sourceName}:${index + 1}: shell syntax is forbidden`,
      );
    }
    let value = rawValue;
    if (rawValue.startsWith('"')) {
      try {
        value = JSON.parse(rawValue);
      } catch {
        throw new Error(
          `${sourceName}:${index + 1}: invalid JSON string value`,
        );
      }
      if (typeof value !== 'string') {
        throw new Error(
          `${sourceName}:${index + 1}: quoted value must be a string`,
        );
      }
    } else if (
      rawValue.startsWith("'")
      || rawValue.endsWith("'")
      || rawValue.endsWith('"')
    ) {
      throw new Error(
        `${sourceName}:${index + 1}: only JSON double quotes are supported`,
      );
    }
    record[key] = value;
    lineNumbers[key] = index + 1;
  }
  return record;
};

export const parseEnvironmentFile = (filename) => (
  parseEnvironmentSource(readFileSync(filename, 'utf8'), filename)
);

const validateMongoUri = (errors, environment, key, contract) => {
  let uri;
  try {
    uri = new URL(environment[key]);
  } catch {
    errors.push(`${key} must be a valid MongoDB URI`);
    return;
  }
  const [usernameKey] = MONGO_IDENTITIES[contract.identity];
  if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol)) {
    errors.push(`${key} must use the mongodb scheme`);
  }
  if (uri.hostname !== contract.hostname) {
    errors.push(
      `${key} must use isolated service ${contract.hostname}`,
    );
  }
  if (decodeURIComponent(uri.username) !== environment[usernameKey]) {
    errors.push(`${key} must use the ${contract.identity} identity`);
  }
  const database = uri.pathname.replace(/^\/+/, '');
  if (database !== contract.database) {
    errors.push(`${key} must use database ${contract.database}`);
  }
  if (uri.searchParams.get('replicaSet') !== contract.replicaSet) {
    errors.push(`${key} must use replica set ${contract.replicaSet}`);
  }
  if (uri.hostname === 'mongo-primary' || database === 'menorah') {
    errors.push(`${key} collides with production MongoDB identity`);
  }
};

const validateExternalUrl = (
  errors,
  key,
  value,
  { validationProject = false } = {},
) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${key} must be an absolute staging URL`);
    return;
  }
  if (!['https:', 'wss:'].includes(url.protocol)) {
    errors.push(`${key} must use https or wss`);
  }
  if (!EXPECTED_HOSTS.includes(url.hostname)) {
    errors.push(`${key} must use an expected full-label staging host`);
  }
  if (
    (validationProject && url.port !== '38443')
    || (!validationProject && url.port)
  ) {
    errors.push(
      `${key} must use the exact ${
        validationProject ? 'local validation port 38443' : 'portless server URL'
      }`,
    );
  }
  if (
    url.hostname === 'localhost'
    || url.hostname.endsWith('.localhost')
    || /^[0-9.]+$/.test(url.hostname)
  ) {
    errors.push(`${key} cannot use localhost or an IP callback`);
  }
};

const validateSyntheticPrivacyContract = (errors, environment) => {
  if (
    environment.KYC_CONSENT_VERSION
    !== EXPECTED_KYC_CONSENT_VERSION
  ) {
    errors.push(
      `KYC_CONSENT_VERSION must be ${EXPECTED_KYC_CONSENT_VERSION}`,
    );
  }

  let retentionPolicy;
  try {
    retentionPolicy = JSON.parse(
      environment.PRIVACY_RETENTION_POLICY_JSON,
    );
  } catch {
    retentionPolicy = null;
  }
  const retentionCategories = retentionPolicy?.categories;
  const retentionCategoryNames = isPlainRecord(retentionCategories)
    ? Object.keys(retentionCategories)
    : [];
  const retentionPolicyValid = (
    isPlainRecord(retentionPolicy)
    && setEqual(
      new Set(Object.keys(retentionPolicy)),
      new Set(['version', 'categories']),
    )
    && retentionPolicy.version
      === EXPECTED_PRIVACY_RETENTION_POLICY_VERSION
    && setEqual(
      new Set(retentionCategoryNames),
      new Set(EXPECTED_PRIVACY_RETENTION_CATEGORIES),
    )
    && EXPECTED_PRIVACY_RETENTION_CATEGORIES.every((category) => {
      const configuration = retentionCategories[category];
      return (
        isPlainRecord(configuration)
        && setEqual(
          new Set(Object.keys(configuration)),
          new Set(['mode', 'policyReference']),
        )
        && configuration.mode === 'manual'
        && configuration.policyReference
          === `synthetic-server-staging-${category}-manual-v1`
      );
    })
  );
  if (!retentionPolicyValid) {
    errors.push(
      'PRIVACY_RETENTION_POLICY_JSON must be the exact synthetic '
      + 'server-staging manual-retention policy',
    );
  }

  let permissionGrants;
  try {
    permissionGrants = JSON.parse(
      environment.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON,
    );
  } catch {
    permissionGrants = null;
  }
  const permissionGrant = permissionGrants?.[0];
  const permissionGrantValid = (
    Array.isArray(permissionGrants)
    && permissionGrants.length === 1
    && isPlainRecord(permissionGrant)
    && setEqual(
      new Set(Object.keys(permissionGrant)),
      new Set(['adminId', 'permissions']),
    )
    && permissionGrant.adminId === EXPECTED_PRIVACY_ADMIN_ID
    && Array.isArray(permissionGrant.permissions)
    && permissionGrant.permissions.length
      === EXPECTED_PRIVACY_PERMISSIONS.length
    && setEqual(
      new Set(permissionGrant.permissions),
      new Set(EXPECTED_PRIVACY_PERMISSIONS),
    )
  );
  if (!permissionGrantValid) {
    errors.push(
      'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON must grant all privacy '
      + 'permissions to the synthetic server-staging primary admin',
    );
  }
};

export const validateEnvironmentRecord = (
  environment,
  { productionMetadata = {} } = {},
) => {
  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(environment, key)) {
      errors.push(`missing required environment key ${key}`);
    }
  }
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} must not be empty`);
      continue;
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      errors.push(`${key} contains an example or placeholder value`);
    }
    if (PRODUCTION_DOMAIN_PATTERN.test(value)) {
      errors.push(`${key} references a production domain`);
    }
    if (
      PRODUCTION_ROOTS.some((root) => isWithin(value, root))
      || (productionMetadata.filesystemRoots || []).some(
        (root) => isWithin(value, root),
      )
    ) {
      errors.push(`${key} references a production filesystem root`);
    }
    if (/^MENORAH_LOCAL_STAGING_/.test(key)) {
      errors.push(`${key} is a local-staging variable in server staging`);
    }
    if (
      /(?:^|_)PRODUCTION(?:_|$)/.test(key)
      && value !== 'false'
      && !value.startsWith('disabled-')
    ) {
      errors.push(`${key} is a production-origin variable`);
    }
  }

  if (environment.NODE_ENV !== 'production') {
    errors.push('NODE_ENV must retain production runtime behavior');
  }
  if (environment.DEPLOYMENT_ENVIRONMENT !== 'staging') {
    errors.push('DEPLOYMENT_ENVIRONMENT must be staging');
  }
  if (environment.SERVICE_RUNTIME !== 'server-staging') {
    errors.push('SERVICE_RUNTIME must be server-staging');
  }
  if (environment.MENORAH_SYNTHETIC_DATA_ONLY !== 'true') {
    errors.push('MENORAH_SYNTHETIC_DATA_ONLY must be true');
  }
  if (
    environment.MENORAH_SERVER_STAGING_ENVIRONMENT_ID
    !== ENVIRONMENT_ID
  ) {
    errors.push('server-staging environment identity is invalid');
  }

  const project = environment.MENORAH_SERVER_STAGING_PROJECT_NAME;
  if (![REAL_PROJECT, VALIDATION_PROJECT].includes(project)) {
    errors.push('Compose project must use an approved staging identity');
  }
  if (
    environment.MENORAH_SERVER_STAGING_RESOURCE_PREFIX !== project
  ) {
    errors.push('resource prefix must equal the isolated Compose project');
  }
  if (
    Object.hasOwn(environment, 'COMPOSE_PROJECT_NAME')
    && environment.COMPOSE_PROJECT_NAME !== project
  ) {
    errors.push('COMPOSE_PROJECT_NAME disagrees with staging project');
  }
  if (
    (productionMetadata.projectNames || []).includes(project)
    || project === 'menorah'
  ) {
    errors.push('Compose project collides with production');
  }

  for (const key of [
    'MENORAH_RUNTIME_CANDIDATE_SHA',
    'MENORAH_SERVER_STAGING_RUNTIME_SHA',
  ]) {
    if (!/^[a-f0-9]{40}$/.test(environment[key] || '')) {
      errors.push(`${key} must be a full lowercase immutable SHA`);
    }
  }
  if (
    environment.MENORAH_RUNTIME_CANDIDATE_SHA
    !== environment.MENORAH_SERVER_STAGING_RUNTIME_SHA
  ) {
    errors.push('server-staging runtime SHA markers must match');
  }
  for (const key of IMAGE_KEYS) {
    const image = environment[key] || '';
    const validImage = project === REAL_PROJECT
      ? /^[a-z0-9.-]+(?::[0-9]+)?\/menorah-staging\/[a-z0-9-]+@sha256:[a-f0-9]{64}$/.test(image)
      : /^menorah-server-staging-validation\/[a-z0-9-]+:runtime$/.test(image);
    if (!validImage) {
      errors.push(`${key} is not an approved immutable staging image reference`);
    }
  }

  const domainKeys = [
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
  ];
  domainKeys.forEach((key, index) => {
    if (environment[key] !== EXPECTED_HOSTS[index]) {
      errors.push(`${key} must be ${EXPECTED_HOSTS[index]}`);
    }
  });
  const allowedHosts = new Set(
    String(environment.MENORAH_STAGING_ALLOWED_HOSTS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!setEqual(allowedHosts, new Set(EXPECTED_HOSTS))) {
    errors.push('MENORAH_STAGING_ALLOWED_HOSTS must match the host manifest');
  }
  if (
    environment.MENORAH_STAGING_EMAIL_DOMAIN
    !== 'mail.staging.menorah.me'
  ) {
    errors.push('staging email domain must be mail.staging.menorah.me');
  }
  validateSyntheticPrivacyContract(errors, environment);

  for (const [key, expected] of Object.entries(
    EXPECTED_PORT_VARIABLES,
  )) {
    if (environment[key] !== expected) {
      errors.push(`${key} must be ${expected}`);
    }
  }

  const root = environment.MENORAH_SERVER_STAGING_ROOT;
  const realRoots = {
    MENORAH_SERVER_STAGING_ROOT: '/opt/menorah-staging',
    MENORAH_SERVER_STAGING_DATA_ROOT: '/opt/menorah-staging/data',
    MENORAH_SERVER_STAGING_BACKUP_ROOT:
      '/opt/menorah-staging/backups',
    MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT:
      '/opt/menorah-staging/deploy-state',
    MENORAH_SERVER_STAGING_LOGS_ROOT: '/opt/menorah-staging/logs',
    MENORAH_SERVER_STAGING_ENV_ROOT: '/opt/menorah-staging/env',
    MENORAH_SERVER_STAGING_APP_ROOT: '/opt/menorah-staging/app',
  };
  if (project === REAL_PROJECT) {
    for (const [key, expected] of Object.entries(realRoots)) {
      if (normalizePath(environment[key]) !== expected) {
        errors.push(`${key} must be ${expected} for server staging`);
      }
    }
  } else if (
    !/\/deploy\/server-staging\/generated\/host$/i.test(
      normalizePath(root),
    )
  ) {
    errors.push(
      'local validation root must stay under server-staging/generated/host',
    );
  }

  const pathKeys = Object.keys(environment).filter(
    (key) => (
      /(?:ROOT|_FILE|_MARKER)$/.test(key)
      && ![
        'MONGO_KEYFILE_PATH',
        'ALERTMANAGER_CONFIG_FILE',
        'LIVEKIT_CONFIG_FILE',
      ].includes(key)
    ),
  );
  const allowedPathRoots = project === VALIDATION_PROJECT
    ? [root, path.dirname(normalizePath(root))]
    : [root];
  for (const key of pathKeys) {
    if (!allowedPathRoots.some(
      (allowedRoot) => isWithin(environment[key], allowedRoot),
    )) {
      errors.push(`${key} escapes the server-staging root`);
    }
  }
  for (const key of [
    'BACKUP_METADATA_FILE',
    'BACKUP_LOCK_FILE',
  ]) {
    if (
      !isWithin(
        environment[key],
        environment.MENORAH_SERVER_STAGING_BACKUP_ROOT,
      )
    ) {
      errors.push(`${key} must stay in the staging backup root`);
    }
  }
  for (const key of [
    'MENORAH_CURRENT_SHA_FILE',
    'MENORAH_LAST_GOOD_SHA_FILE',
    'MENORAH_MIGRATION_APPLIED_MARKER',
    'MENORAH_MIGRATION_IN_PROGRESS_MARKER',
    'MENORAH_IDENTITY_RECONCILIATION_MARKER',
    'MENORAH_POST_MIGRATION_RECOVERY_MARKER',
    'MENORAH_DEPLOY_LOCK_FILE',
    'MENORAH_ROLLBACK_LOCK_FILE',
  ]) {
    if (
      !isWithin(
        environment[key],
        environment.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT,
      )
    ) {
      errors.push(`${key} must stay in staging deployment state`);
    }
  }
  if (
    environment.BACKUP_RESTORE_ACKNOWLEDGEMENT
    !== 'RESTORE_ONLY_MENORAH_SERVER_STAGING'
  ) {
    errors.push('restore requires the exact staging acknowledgement');
  }

  const identityUsers = [];
  for (const [identity, [userKey, passwordKey]] of Object.entries(
    MONGO_IDENTITIES,
  )) {
    const user = environment[userKey];
    const password = environment[passwordKey];
    if (!user?.startsWith('menorah-staging-')) {
      errors.push(`${identity} MongoDB user must be staging-prefixed`);
    }
    if (!password) errors.push(`${passwordKey} is required`);
    identityUsers.push(user);
  }
  if (
    identityUsers.some((value) => !value)
    || new Set(identityUsers).size !== identityUsers.length
  ) {
    errors.push('all six MongoDB identities must be distinct');
  }
  if (environment.MONGO_DATABASE !== 'menorah_staging') {
    errors.push('application database must be menorah_staging');
  }
  if (environment.MONGO_RESTORE_DATABASE !== 'menorah_staging') {
    errors.push('restore database must be logically menorah_staging');
  }
  if (environment.MONGODB_REPLICA_SET_NAME !== 'menorah-staging-rs') {
    errors.push('MongoDB replica set must be menorah-staging-rs');
  }
  if (
    environment.MONGODB_RESTORE_REPLICA_SET_NAME
    !== 'menorah-staging-restore-rs'
  ) {
    errors.push('restore replica set must be isolated');
  }
  for (const [key, contract] of Object.entries(MONGO_URI_CONTRACT)) {
    if (environment[key]) {
      validateMongoUri(errors, environment, key, contract);
    }
  }
  if (
    environment.MONGODB_BACKUP_URI
    !== environment.MONGODB_STAGING_BACKUP_URI
  ) {
    errors.push('staging backup URI aliases must match');
  }
  if (
    environment.MONGODB_RESTORE_URI
    !== environment.MONGODB_STAGING_RESTORE_URI
  ) {
    errors.push('staging restore URI aliases must match');
  }

  if (environment.REDIS_STAGING_USERNAME !== 'menorah-staging-app') {
    errors.push('Redis identity must be menorah-staging-app');
  }
  for (const key of ['REDIS_URL', 'REDIS_MONITORING_URL']) {
    try {
      const url = new URL(environment[key]);
      if (
        !['redis:', 'rediss:'].includes(url.protocol)
        || url.hostname !== 'staging-redis'
        || decodeURIComponent(url.username)
          !== environment.REDIS_STAGING_USERNAME
      ) {
        errors.push(`${key} must use the staging Redis identity`);
      }
    } catch {
      errors.push(`${key} must be a valid staging Redis URL`);
    }
  }

  const secretValues = [];
  for (const key of SECRET_KEYS) {
    const value = environment[key];
    if (!value) continue;
    if (value.length < 16) {
      errors.push(`${key} must contain at least 16 characters`);
    }
    if (!value.startsWith('disabled-')) secretValues.push(value);
  }
  if (new Set(secretValues).size !== secretValues.length) {
    errors.push('staging secret values must not be reused');
  }

  for (const key of EXTERNAL_URL_KEYS) {
    if (environment[key]) {
      validateExternalUrl(errors, key, environment[key], {
        validationProject:
          environment.MENORAH_SERVER_STAGING_PROJECT_NAME
          === VALIDATION_PROJECT,
      });
    }
  }
  if (
    environment.LIVEKIT_API_URL !== 'http://staging-livekit:7880'
    || environment.LIVEKIT_UPSTREAM !== 'http://staging-livekit:7880'
  ) {
    errors.push('LiveKit internal URLs must use staging-livekit');
  }

  for (const provider of OPTIONAL_PROVIDER_RULES) {
    const flag = environment[provider.flag];
    if (!['true', 'false'].includes(flag)) {
      errors.push(`${provider.flag} must be true or false`);
      continue;
    }
    if (flag !== 'true') continue;
    if (
      provider.modeKey
      && environment[provider.modeKey] !== provider.mode
    ) {
      errors.push(
        `${provider.flag} requires ${provider.modeKey}=${provider.mode}`,
      );
    }
    for (const key of provider.keys) {
      const value = environment[key];
      if (
        !value
        || value.startsWith('disabled-')
        || PLACEHOLDER_PATTERN.test(value)
      ) {
        errors.push(`${provider.flag} requires complete sandbox ${key}`);
      }
    }
  }
  for (const key of ALWAYS_DISABLED_PROVIDER_FLAGS) {
    if (environment[key] !== 'false') {
      errors.push(`${key} must remain disabled in server staging`);
    }
  }
  if (
    environment.RAZORPAY_MODE !== 'test'
    || environment.RAZORPAY_X_MODE !== 'test'
    || LIVE_MODE_PATTERN.test(environment.RAZORPAY_MODE || '')
    || LIVE_MODE_PATTERN.test(environment.RAZORPAY_X_MODE || '')
  ) {
    errors.push('Razorpay and RazorpayX must remain in test mode');
  }
  if (
    environment.RAZORPAY_KEY_ID
    && !environment.RAZORPAY_KEY_ID.startsWith('rzp_test_')
  ) {
    errors.push('Razorpay key ID must be a test key');
  }
  if (
    environment.RAZORPAY_X_KEY_ID
    && !environment.RAZORPAY_X_KEY_ID.startsWith('rzp_test_')
  ) {
    errors.push('RazorpayX key ID must be a test key');
  }
  if (
    environment.RESEND_MODE !== 'sandbox'
    || !String(environment.EMAIL_FROM || '')
      .includes('@mail.staging.menorah.me')
  ) {
    errors.push('Resend sender and mode must be staging-only');
  }
  if (
    environment.RESEND_PROVIDER_ENABLED === 'false'
    && !String(environment.RESEND_API_URL || '')
      .startsWith('http://staging-mail-capture:8025/')
  ) {
    errors.push('disabled Resend must use the isolated staging mail capture');
  }
  if (
    environment.RESEND_API_KEY
    && !environment.RESEND_API_KEY.startsWith('re_server_staging_')
  ) {
    errors.push('Resend key must have the server-staging test prefix');
  }
  if (
    environment.MEDIA_STORAGE_BACKEND !== 'local'
    && !String(environment.CLOUDINARY_UPLOAD_PREFIX || '')
      .startsWith('menorah-staging')
  ) {
    errors.push('remote media storage must use a staging-only prefix');
  }
  for (const [key, value] of Object.entries(environment)) {
    if (!/(?:BUCKET|STORAGE_CONTAINER)/.test(key)) continue;
    if (
      (productionMetadata.storageBuckets || []).includes(value)
      || (
        !String(value).includes('staging')
        && !String(value).startsWith('disabled-')
      )
    ) {
      errors.push(`${key} must identify staging-only storage`);
    }
  }

  if (
    !['true', 'false'].includes(
      environment.MENORAH_STAGING_TUNNEL_ENABLED,
    )
  ) {
    errors.push('MENORAH_STAGING_TUNNEL_ENABLED must be true or false');
  } else if (environment.MENORAH_STAGING_TUNNEL_ENABLED === 'true') {
    for (const key of [
      'CLOUDFLARE_TUNNEL_ID',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_TUNNEL_CREDENTIAL_FILE',
    ]) {
      const value = environment[key];
      if (
        !value
        || value.startsWith('disabled-')
        || PLACEHOLDER_PATTERN.test(value)
        || LIVE_MODE_PATTERN.test(value)
      ) {
        errors.push(`enabled staging Tunnel requires staging-only ${key}`);
      }
    }
  }
  if (environment.CLOUDFLARE_TUNNEL_ENVIRONMENT !== 'staging') {
    errors.push('Cloudflare Tunnel environment must be staging');
  }
  if (
    (productionMetadata.tunnelIds || [])
      .includes(environment.CLOUDFLARE_TUNNEL_ID)
  ) {
    errors.push('Cloudflare Tunnel ID collides with production metadata');
  }
  if (
    Object.hasOwn(environment, 'CLOUDFLARE_API_TOKEN')
    || Object.hasOwn(environment, 'TUNNEL_TOKEN')
    || Object.hasOwn(environment, 'CLOUDFLARE_TUNNEL_TOKEN')
  ) {
    errors.push('generic or production-origin Tunnel token is forbidden');
  }

  if (
    environment.PROMETHEUS_EXTERNAL_ENVIRONMENT !== 'staging'
    || environment.ALERTMANAGER_ENVIRONMENT !== 'staging'
  ) {
    errors.push('monitoring and alerts must identify environment=staging');
  }
  if (environment.PROMETHEUS_EXTERNAL_PROJECT !== project) {
    errors.push('Prometheus external project label must match Compose');
  }
  if (
    environment.ALERTMANAGER_RECEIVER
    !== 'staging-unconfigured-destination'
  ) {
    errors.push('Alertmanager receiver must be a staging-only value');
  }

  return errors;
};

export const assertValidEnvironment = (
  environment,
  options,
) => {
  const errors = validateEnvironmentRecord(environment, options);
  if (errors.length > 0) {
    throw new Error(
      `Server-staging environment validation failed (${errors.length}):\n`
      + errors.map((error) => `- ${error}`).join('\n'),
    );
  }
  return environment;
};

const parseArguments = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--env') {
      options.environmentFile = argv[++index];
    } else if (argument === '--production-metadata') {
      options.productionMetadataFile = argv[++index];
    } else if (argument === '--print-project') {
      options.printProject = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.environmentFile) {
    throw new Error('--env is required');
  }
  return options;
};

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const environment = parseEnvironmentFile(options.environmentFile);
    const productionMetadata = options.productionMetadataFile
      ? JSON.parse(readFileSync(options.productionMetadataFile, 'utf8'))
      : {};
    assertValidEnvironment(environment, { productionMetadata });
    if (options.printProject) {
      process.stdout.write(
        `${environment.MENORAH_SERVER_STAGING_PROJECT_NAME}\n`,
      );
    } else {
      process.stdout.write(
        `${JSON.stringify({
          status: 'passed',
          project:
            environment.MENORAH_SERVER_STAGING_PROJECT_NAME,
          runtimeCandidateSha:
            environment.MENORAH_RUNTIME_CANDIDATE_SHA,
          checkedKeys: Object.keys(environment).length,
        }, null, 2)}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
