#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  lstatSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';

export const EXPECTED_PROJECT = 'menorah-local-staging';
export const EXPECTED_ENVIRONMENT_ID = 'menorah-local-staging-v1';
export const EXPECTED_HTTPS_PORT = '28443';

export const EXPECTED_NETWORK_NAMES = Object.freeze([
  'menorah-local-staging',
  'menorah-local-staging-data',
  'menorah-local-staging-monitoring',
  'menorah-local-staging-restore',
]);

export const EXPECTED_VOLUME_NAMES = Object.freeze([
  'menorah-local-staging-mongo',
  'menorah-local-staging-redis',
  'menorah-local-staging-uploads',
  'menorah-local-staging-backups',
  'menorah-local-staging-retrieval',
  'menorah-local-staging-prometheus',
  'menorah-local-staging-alertmanager',
  'menorah-local-staging-loki',
  'menorah-local-staging-alloy',
  'menorah-local-staging-restore-mongodb',
  'menorah-local-staging-restore-media',
  'menorah-local-staging-logs',
]);

export const EXPECTED_DOMAINS = Object.freeze({
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
});

export const OPTIONAL_PROVIDER_FLAGS = Object.freeze([
  'BOOKING_PAYMENTS_ENABLED',
  'PAYOUTS_ENABLED',
  'SUBSCRIPTION_PAYMENTS_ENABLED',
  'RESEND_PROVIDER_ENABLED',
  'APPLE_SIGN_IN_ENABLED',
  'UAE_CALLING_ENABLED',
  'VSEE_ENABLED',
  'DOXY_ENABLED',
  'ZOOM_ENABLED',
  'GOOGLE_MEET_ENABLED',
  'TEAMS_ENABLED',
  'SOCIAL_STUDIO_ENABLED',
  'SOCIAL_STUDIO_AUTO_PUBLISH',
  'ENABLE_SOCIAL_SCHEDULER',
  'ENABLE_ARTICLE_SCHEDULER',
  'ENABLE_BACKUP_JOBS',
  'ENABLE_EMAIL_JOBS',
  'ENABLE_NOTIFICATION_JOBS',
  'BACKUP_AUTOMATION_ENABLED',
  'PRIVACY_RETENTION_EXECUTION_ENABLED',
]);

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..', '..');
const DEFAULT_COMPOSE_FILE = path.join(MODULE_DIRECTORY, 'compose.yml');
const DEFAULT_ENVIRONMENT_FILE = path.join(
  MODULE_DIRECTORY,
  'generated',
  'local-staging.env',
);
const DEFAULT_MONGO_KEYFILE = path.join(
  MODULE_DIRECTORY,
  'generated',
  'mongo-keyfile',
);
const DEFAULT_BACKUP_PASSWORD_FILE = path.join(
  MODULE_DIRECTORY,
  'generated',
  'backup-encryption-password',
);
const DEFAULT_BACKUP_HMAC_FILE = path.join(
  MODULE_DIRECTORY,
  'generated',
  'backup-integrity-hmac-key',
);
const SHARED_ALERT_RULES_FILE = path.resolve(
  MODULE_DIRECTORY,
  '..',
  'monitoring',
  'alert-rules.yml',
);

const REQUIRED_SECRET_KEYS = Object.freeze([
  'MONGO_ROOT_PASSWORD',
  'MONGO_APP_PASSWORD',
  'MONGO_BACKUP_PASSWORD',
  'MONGO_RESTORE_PASSWORD',
  'MONGO_MONITOR_PASSWORD',
  'REDIS_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATA_ENCRYPTION_KEY',
  'AUDIT_LOG_SIGNING_KEY',
  'BACKUP_ENCRYPTION_PASSWORD',
  'BACKUP_INTEGRITY_HMAC_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_X_KEY_ID',
  'RAZORPAY_X_KEY_SECRET',
  'RAZORPAY_X_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'MENORAH_LOCAL_STAGING_USER_A_PASSWORD',
  'MENORAH_LOCAL_STAGING_USER_B_PASSWORD',
  'MENORAH_LOCAL_STAGING_COUNSELLOR_A_PASSWORD',
  'MENORAH_LOCAL_STAGING_COUNSELLOR_DRAFT_PASSWORD',
  'MENORAH_LOCAL_STAGING_COUNSELLOR_SUSPENDED_PASSWORD',
  'MENORAH_LOCAL_STAGING_ADMIN_SUPPORT_PASSWORD',
  'MENORAH_LOCAL_STAGING_ADMIN_FINANCE_PASSWORD',
  'MENORAH_LOCAL_STAGING_ADMIN_CONTENT_PASSWORD',
  'MENORAH_LOCAL_STAGING_ADMIN_FULL_1_PASSWORD',
  'MENORAH_LOCAL_STAGING_ADMIN_FULL_2_PASSWORD',
]);

const EMPTY_PROVIDER_CREDENTIALS = Object.freeze([
  'GOOGLE_WEB_CLIENT_ID',
  'GOOGLE_IOS_CLIENT_ID',
  'GOOGLE_ANDROID_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'LUXAND_API_TOKEN',
  'OPENAI_API_KEY',
  'SOCIAL_STUDIO_OPENAI_API_KEY',
  'META_APP_ID',
  'META_APP_SECRET',
  'SOCIAL_TOKEN_ENCRYPTION_KEY',
]);

const EXPECTED_PORTS = Object.freeze({
  caddy: Object.freeze([
    Object.freeze({
      published: '28443',
      target: '443',
      protocol: 'tcp',
    }),
  ]),
  'api-ios': Object.freeze([
    Object.freeze({
      published: '28080',
      target: '8080',
      protocol: 'tcp',
    }),
  ]),
  'api-android': Object.freeze([
    Object.freeze({
      published: '28081',
      target: '8080',
      protocol: 'tcp',
    }),
  ]),
  'api-web': Object.freeze([
    Object.freeze({
      published: '28082',
      target: '8080',
      protocol: 'tcp',
    }),
  ]),
  'api-admin': Object.freeze([
    Object.freeze({
      published: '28083',
      target: '8080',
      protocol: 'tcp',
    }),
  ]),
  worker: Object.freeze([
    Object.freeze({
      published: '28084',
      target: '8080',
      protocol: 'tcp',
    }),
  ]),
  'web-app': Object.freeze([
    Object.freeze({
      published: '23001',
      target: '3001',
      protocol: 'tcp',
    }),
  ]),
  'user-web-app': Object.freeze([
    Object.freeze({
      published: '23002',
      target: '3002',
      protocol: 'tcp',
    }),
  ]),
  'admin-panel': Object.freeze([
    Object.freeze({
      published: '23003',
      target: '3003',
      protocol: 'tcp',
    }),
  ]),
  livekit: Object.freeze([
    Object.freeze({
      published: '27880',
      target: '7880',
      protocol: 'tcp',
    }),
    Object.freeze({
      published: '27881',
      target: '27881',
      protocol: 'tcp',
    }),
    Object.freeze({
      published: '25000-25100',
      target: '25000-25100',
      protocol: 'udp',
    }),
  ]),
  prometheus: Object.freeze([
    Object.freeze({
      published: '29090',
      target: '9090',
      protocol: 'tcp',
    }),
  ]),
  alertmanager: Object.freeze([
    Object.freeze({
      published: '29093',
      target: '9093',
      protocol: 'tcp',
    }),
  ]),
  loki: Object.freeze([
    Object.freeze({
      published: '23100',
      target: '3100',
      protocol: 'tcp',
    }),
  ]),
  alloy: Object.freeze([
    Object.freeze({
      published: '22345',
      target: '12345',
      protocol: 'tcp',
    }),
  ]),
});

const DATA_SERVICE_NAME_PATTERN =
  /(?:^|[-_])(mongo(?:db)?|redis)(?:[-_]|$)/i;
const DATA_SERVICE_IMAGE_PATTERN =
  /(?:^|\/)(?:mongo(?:db)?|redis)(?=[:@/]|$)/i;
const PRODUCTION_DOMAIN_PATTERN =
  /(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\.)*(?:menorah\.me|mentle\.org)(?=$|[^a-z0-9.-])/i;
const BRANDED_EXTERNAL_HOST_PATTERN =
  /\b(?:[a-z0-9-]+\.)*(?:menorah|mentle)[a-z0-9-]*\.(?:com|health|in|io|me|net|org)\b/i;
const PRODUCTION_PATH_PATTERN =
  /(?:^|[\s"'=])\/(?:opt\/menorah|srv\/menorah|mnt\/menorah(?:-backups)?)(?:\/|$)/i;
const DOCKER_SOCKET_PATTERN =
  /(?:docker\.sock|\/\/\.\/pipe\/docker_engine|\/run\/docker\/plugins)/i;
const CONTAINER_LOG_PATH_PATTERN =
  /\/var\/lib\/docker\/containers(?:\/|$)/i;
const TARGET_ENV_KEY_PATTERN =
  /(?:DOMAIN|HOSTS?|URL|URI|ORIGINS?|EMAIL|UPSTREAM)$/;
const LIVE_KEY_PATTERN =
  /(?:rzp_live_|(?:^|[_-])(?:sk|pk)[_-]live[_-]|(?:^|[_-])live[_-])/i;

const normalizeFilePath = (value) => (
  path.resolve(String(value)).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
);

const isPathWithin = (candidate, parent) => {
  const normalizedCandidate = normalizeFilePath(candidate);
  const normalizedParent = normalizeFilePath(parent);
  return (
    normalizedCandidate === normalizedParent
    || normalizedCandidate.startsWith(`${normalizedParent}/`)
  );
};

const sortedUnique = (values) => [...new Set(values)].sort();

const pushError = (errors, code, field, message) => {
  errors.push(Object.freeze({
    code,
    field,
    message,
  }));
};

const sha256 = (value) => (
  createHash('sha256').update(value).digest('hex')
);

export const parseEnvironmentFile = (source) => {
  const values = {};

  for (const [index, rawLine] of String(source).split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = rawLine.match(/^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/);
    if (!match) {
      throw new Error(
        `Generated environment contains invalid syntax at line ${index + 1}`,
      );
    }
    const [, key, rawValue] = match;
    if (Object.hasOwn(values, key)) {
      throw new Error(`Generated environment repeats key ${key}`);
    }

    const trimmedValue = rawValue.trim();
    if (trimmedValue.startsWith('"')) {
      try {
        values[key] = JSON.parse(trimmedValue);
      } catch {
        throw new Error(
          `Generated environment contains an invalid quoted value for ${key}`,
        );
      }
    } else if (
      trimmedValue.startsWith("'")
      && trimmedValue.endsWith("'")
    ) {
      values[key] = trimmedValue.slice(1, -1);
    } else {
      values[key] = trimmedValue;
    }
  }

  return values;
};

const getUrlHost = (value) => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
};

const extractTargetHosts = (value, { includeBare = true } = {}) => {
  const candidates = [];
  const text = String(value || '');
  const urlPattern = /[a-z][a-z0-9+.-]*:\/\/[^\s,'"]+/gi;
  for (const match of text.matchAll(urlPattern)) {
    const host = getUrlHost(match[0].replace(/=.+$/, ''));
    if (host) candidates.push(host);
  }
  const emailPattern = /@[a-z0-9.-]+\.[a-z]{2,}(?=[>\s,]|$)/gi;
  for (const match of text.matchAll(emailPattern)) {
    candidates.push(match[0].slice(1).toLowerCase());
  }
  if (
    includeBare
    &&
    /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)
    && !text.includes('/')
  ) {
    candidates.push(text.toLowerCase().replace(/\.$/, ''));
  }
  return sortedUnique(candidates);
};

const isAllowedRuntimeHost = (hostname) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost'
    || host === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(host)
    || !host.includes('.')
  ) return true;
  if (/^[a-z0-9-]+\.staging\.localhost$/.test(host)) return true;
  return (
    host === 'notice.staging.menorah-synthetic.internal'
    || host.endsWith('.staging.menorah-synthetic.internal')
  );
};

const expectedStagingUrls = () => {
  const origin = (domain) => (
    `https://${domain}:${EXPECTED_HTTPS_PORT}`
  );
  return {
    FRONTEND_COUNSELLOR_URL:
      origin(EXPECTED_DOMAINS.COUNSELLOR_DOMAIN),
    FRONTEND_API_WEB_URL: `${origin(EXPECTED_DOMAINS.API_WEB_DOMAIN)}/api`,
    FRONTEND_API_ADMIN_URL:
      `${origin(EXPECTED_DOMAINS.API_ADMIN_DOMAIN)}/api`,
    FRONTEND_SOCKET_WEB_URL: origin(EXPECTED_DOMAINS.API_WEB_DOMAIN),
    LIVEKIT_URL:
      `wss://${EXPECTED_DOMAINS.CALLS_DOMAIN}:${EXPECTED_HTTPS_PORT}`,
    LIVEKIT_API_URL: 'http://livekit:7880',
    MENORAH_API_BASE_URL: 'http://api-web:8080/api',
    PASSWORD_RESET_BASE_URL: origin(EXPECTED_DOMAINS.APP_DOMAIN),
    CHECKOUT_RETURN_URL:
      `${origin(EXPECTED_DOMAINS.APP_DOMAIN)}/checkout/return`,
    MEDIA_PUBLIC_BASE_URL: origin(EXPECTED_DOMAINS.API_WEB_DOMAIN),
    RESEND_API_URL: 'http://mail-capture:8025/emails',
  };
};

const validateMainMongoUri = (env, errors, key, expectedUser) => {
  let parsed;
  try {
    parsed = new URL(String(env[key] || ''));
  } catch {
    pushError(
      errors,
      'mongo_uri_invalid',
      key,
      'Mongo URI is not parseable',
    );
    return;
  }

  if (
    parsed.protocol !== 'mongodb:'
    || parsed.hostname !== 'mongo-primary'
    || parsed.port !== '27017'
    || !['/menorah', '/', '/admin'].includes(parsed.pathname)
    || parsed.username !== expectedUser
    || parsed.searchParams.get('replicaSet') !== 'menorah-rs'
    || parsed.searchParams.get('authSource') !== 'admin'
  ) {
    pushError(
      errors,
      'mongo_uri_not_isolated',
      key,
      'Mongo URI must target only the managed local primary and replica set',
    );
  }
};

const validateRedisUri = (env, errors, key) => {
  let parsed;
  try {
    parsed = new URL(String(env[key] || ''));
  } catch {
    pushError(
      errors,
      'redis_uri_invalid',
      key,
      'Redis URI is not parseable',
    );
    return;
  }
  if (
    parsed.protocol !== 'redis:'
    || parsed.hostname !== 'redis'
    || parsed.port !== '6379'
    || !parsed.password
    || decodeURIComponent(parsed.password) !== env.REDIS_PASSWORD
  ) {
    pushError(
      errors,
      'redis_uri_not_isolated',
      key,
      'Redis URI must target only the authenticated local Redis service',
    );
  }
};

export const validateEnvironmentRecord = (
  environment,
  {
    fieldPrefix = 'environment',
    requireGeneratedContract = false,
    expectedRuntimeCandidateSha,
  } = {},
) => {
  const env = environment && typeof environment === 'object'
    ? environment
    : {};
  const errors = [];

  for (const [key, rawValue] of Object.entries(env)) {
    const value = rawValue === null || rawValue === undefined
      ? ''
      : String(rawValue);
    const field = `${fieldPrefix}.${key}`;

    const isBundleIdentifier = /(?:^|_)BUNDLE_ID$/.test(key);
    if (
      PRODUCTION_DOMAIN_PATTERN.test(value)
      || (
        !isBundleIdentifier
        &&
        BRANDED_EXTERNAL_HOST_PATTERN.test(value)
        && !value.includes('menorah-synthetic.internal')
      )
    ) {
      pushError(
        errors,
        'production_domain',
        field,
        'Production Menorah/Mentle domains are prohibited',
      );
    }
    if (PRODUCTION_PATH_PATTERN.test(value)) {
      pushError(
        errors,
        'production_path',
        field,
        'Production filesystem roots are prohibited',
      );
    }
    if (TARGET_ENV_KEY_PATTERN.test(key)) {
      for (const hostname of extractTargetHosts(value)) {
        if (!isAllowedRuntimeHost(hostname)) {
          pushError(
            errors,
            'external_runtime_host',
            field,
            'Runtime targets must be internal or approved synthetic staging hosts',
          );
        }
      }
    }
    if (
      LIVE_KEY_PATTERN.test(value)
      || (
        /KEY_ID$/.test(key)
        && /(?:^|[_-])live(?:[_-]|$)/i.test(value)
      )
    ) {
      pushError(
        errors,
        'live_provider_key',
        field,
        'Live provider key IDs are prohibited',
      );
    }
    if (
      OPTIONAL_PROVIDER_FLAGS.includes(key)
      && value !== 'false'
    ) {
      pushError(
        errors,
        'provider_enabled',
        field,
        'Optional provider and automation flags must be exactly false',
      );
    }
  }

  if (!requireGeneratedContract) return errors;

  const requiredExact = {
    COMPOSE_PROJECT_NAME: EXPECTED_PROJECT,
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    MENORAH_SYNTHETIC_DATA_ONLY: 'true',
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: EXPECTED_ENVIRONMENT_ID,
    MENORAH_LOCAL_STAGING_HTTPS_PORT: EXPECTED_HTTPS_PORT,
    MONGO_INITDB_DATABASE: 'menorah',
    MONGODB_REPLICA_SET_NAME: 'menorah-rs',
    MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.localhost',
    MENORAH_LOCAL_STAGING_SEED_CONFIRM:
      'CREATE_SYNTHETIC_ROSTER_ONLY_IN_MENORAH_LOCAL_STAGING_V1',
    MEDIA_STORAGE_BACKEND: 'local',
    AI_MOCK_MODE: 'true',
    ...EXPECTED_DOMAINS,
    ...expectedStagingUrls(),
  };
  if (expectedRuntimeCandidateSha) {
    requiredExact.MENORAH_RUNTIME_CANDIDATE_SHA =
      expectedRuntimeCandidateSha;
  }

  for (const [key, expected] of Object.entries(requiredExact)) {
    if (String(env[key] ?? '') !== expected) {
      pushError(
        errors,
        'generated_contract_mismatch',
        `${fieldPrefix}.${key}`,
        'Generated local staging identity does not match its fixed contract',
      );
    }
  }

  const expectedHosts = Object.values(EXPECTED_DOMAINS);
  if (
    String(env.MENORAH_STAGING_ALLOWED_HOSTS || '')
      .split(',')
      .join(',') !== expectedHosts.join(',')
  ) {
    pushError(
      errors,
      'staging_host_allowlist_mismatch',
      `${fieldPrefix}.MENORAH_STAGING_ALLOWED_HOSTS`,
      'The staging host allowlist must exactly match the ten local hosts',
    );
  }

  const origin = (domain) => (
    `https://${domain}:${EXPECTED_HTTPS_PORT}`
  );
  const expectedAllowedOrigins = [
    origin(EXPECTED_DOMAINS.WWW_DOMAIN),
    origin(EXPECTED_DOMAINS.APP_DOMAIN),
    origin(EXPECTED_DOMAINS.ADMIN_DOMAIN),
    origin(EXPECTED_DOMAINS.COUNSELLOR_DOMAIN),
  ].join(',');
  const expectedSessionOrigins = [
    `${origin(EXPECTED_DOMAINS.WWW_DOMAIN)}=user`,
    `${origin(EXPECTED_DOMAINS.APP_DOMAIN)}=user`,
    `${origin(EXPECTED_DOMAINS.COUNSELLOR_DOMAIN)}=counsellor`,
    `${origin(EXPECTED_DOMAINS.ADMIN_DOMAIN)}=admin`,
  ].join(',');
  for (const [key, expected] of Object.entries({
    ALLOWED_ORIGINS: expectedAllowedOrigins,
    WEB_SESSION_ORIGINS: expectedSessionOrigins,
  })) {
    if (String(env[key] || '') !== expected) {
      pushError(
        errors,
        'staging_origin_mismatch',
        `${fieldPrefix}.${key}`,
        'Staging browser origins must match the fixed HTTPS host set and port',
      );
    }
  }

  for (const key of OPTIONAL_PROVIDER_FLAGS) {
    if (env[key] !== 'false') {
      pushError(
        errors,
        'provider_flag_missing_or_enabled',
        `${fieldPrefix}.${key}`,
        'Every optional provider and automation flag must be present and false',
      );
    }
  }
  for (const key of EMPTY_PROVIDER_CREDENTIALS) {
    if (String(env[key] || '') !== '') {
      pushError(
        errors,
        'optional_provider_credential_present',
        `${fieldPrefix}.${key}`,
        'Disabled optional provider credentials must remain empty',
      );
    }
  }
  if (
    !/^re_local_[A-Za-z0-9_-]{32,}$/.test(
      String(env.RESEND_API_KEY || ''),
    )
  ) {
    pushError(
      errors,
      'local_mail_key_invalid',
      `${fieldPrefix}.RESEND_API_KEY`,
      'Local mail capture must use a strong generated re_local_ key',
    );
  }

  for (const key of [
    'RAZORPAY_KEY_ID',
    'RAZORPAY_X_KEY_ID',
    'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  ]) {
    if (!/^rzp_test_[A-Za-z0-9]{14,64}$/.test(String(env[key] || ''))) {
      pushError(
        errors,
        'razorpay_key_not_test',
        `${fieldPrefix}.${key}`,
        'Razorpay key IDs must have the sandbox test shape',
      );
    }
  }

  const secretValues = REQUIRED_SECRET_KEYS.map((key) => env[key]);
  if (
    secretValues.some(
      (value) => typeof value !== 'string' || value.length < 16,
    )
    || new Set(secretValues).size !== secretValues.length
  ) {
    pushError(
      errors,
      'generated_secrets_not_unique',
      fieldPrefix,
      'Generated local credentials must be present, strong, and unique',
    );
  }

  validateMainMongoUri(
    env,
    errors,
    'MONGODB_URI',
    'menorah-local-app',
  );
  validateMainMongoUri(
    env,
    errors,
    'MONGODB_BACKUP_URI',
    'menorah-local-backup',
  );
  validateMainMongoUri(
    env,
    errors,
    'MONGODB_PRODUCTION_RESTORE_URI',
    'menorah-local-restore',
  );
  validateMainMongoUri(
    env,
    errors,
    'MONGODB_MONITORING_URI',
    'menorah-local-monitor',
  );
  if (
    env.MONGODB_RESTORE_TEST_URI
    !== 'mongodb://mongo-restore:27017/menorah?replicaSet=menorah-restore-rs'
  ) {
    pushError(
      errors,
      'restore_uri_not_isolated',
      `${fieldPrefix}.MONGODB_RESTORE_TEST_URI`,
      'Restore URI must target only the disposable restore replica set',
    );
  }
  validateRedisUri(env, errors, 'REDIS_URL');
  validateRedisUri(env, errors, 'REDIS_MONITORING_URL');

  return errors;
};

const normalizePort = (port) => {
  if (port && typeof port === 'object') {
    return {
      hostIp: String(port.host_ip ?? port.hostIp ?? ''),
      published: String(port.published ?? ''),
      target: String(port.target ?? ''),
      protocol: String(port.protocol || 'tcp').toLowerCase(),
    };
  }

  const source = String(port || '');
  const protocolSplit = source.split('/');
  const protocol = (protocolSplit[1] || 'tcp').toLowerCase();
  const address = protocolSplit[0];
  const ipv6Match = address.match(/^\[([^\]]+)]:(.+):([^:]+)$/);
  if (ipv6Match) {
    return {
      hostIp: ipv6Match[1],
      published: ipv6Match[2],
      target: ipv6Match[3],
      protocol,
    };
  }
  const parts = address.split(':');
  if (parts.length === 3) {
    return {
      hostIp: parts[0],
      published: parts[1],
      target: parts[2],
      protocol,
    };
  }
  return {
    hostIp: '',
    published: parts.length === 2 ? parts[0] : '',
    target: parts.at(-1) || '',
    protocol,
  };
};

const isAllowedLoopback = (hostIp) => (
  hostIp === '127.0.0.1'
);

const isExpectedPort = (serviceName, actual) => {
  const expected = EXPECTED_PORTS[serviceName] || [];
  if (
    expected.some((entry) => (
      entry.published === actual.published
      && entry.target === actual.target
      && entry.protocol === actual.protocol
    ))
  ) return true;

  if (
    serviceName === 'livekit'
    && actual.protocol === 'udp'
    && /^\d+$/.test(actual.published)
    && actual.published === actual.target
  ) {
    const port = Number(actual.published);
    return port >= 25000 && port <= 25100;
  }
  return false;
};

const hasExpectedPort = (actualPorts, expected) => {
  if (
    actualPorts.some((actual) => (
      actual.published === expected.published
      && actual.target === expected.target
      && actual.protocol === expected.protocol
    ))
  ) return true;
  if (
    expected.protocol === 'udp'
    && expected.published === '25000-25100'
  ) {
    return actualPorts.some((actual) => (
      actual.protocol === 'udp'
      && (
        (
          actual.published === '25000-25100'
          && actual.target === '25000-25100'
        )
        || (
          /^\d+$/.test(actual.published)
          && Number(actual.published) >= 25000
          && Number(actual.published) <= 25100
          && actual.published === actual.target
        )
      )
    ));
  }
  return false;
};

const modelEnvironment = (service) => {
  if (!service?.environment || typeof service.environment !== 'object') {
    return {};
  }
  return service.environment;
};

const envFileReferences = (service) => {
  const configured = service?.env_file;
  if (!configured) return [];
  const entries = Array.isArray(configured) ? configured : [configured];
  return entries.map((entry) => (
    typeof entry === 'string' ? entry : entry?.path
  )).filter(Boolean);
};

const serviceNetworkKeys = (service) => {
  const networks = service?.networks;
  if (Array.isArray(networks)) return networks;
  if (networks && typeof networks === 'object') return Object.keys(networks);
  return [];
};

const walkStrings = (value, visitor, field = 'compose') => {
  if (typeof value === 'string') {
    visitor(value, field);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => (
      walkStrings(entry, visitor, `${field}[${index}]`)
    ));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => (
      walkStrings(entry, visitor, `${field}.${key}`)
    ));
  }
};

const isHostRoot = (source) => (
  source === '/'
  || /^[a-z]:\/?$/i.test(source)
  || /^\/\/[^/]+\/?$/i.test(source)
);

export const validateRenderedCompose = (
  model,
  {
    localStagingDirectory = MODULE_DIRECTORY,
    allowedEnvironmentFile = DEFAULT_ENVIRONMENT_FILE,
    sharedAlertRulesFile = SHARED_ALERT_RULES_FILE,
  } = {},
) => {
  const errors = [];
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    pushError(
      errors,
      'compose_model_invalid',
      'compose',
      'Rendered Compose output must be a JSON object',
    );
    return errors;
  }

  if (model.name !== EXPECTED_PROJECT) {
    pushError(
      errors,
      'project_mismatch',
      'compose.name',
      'Rendered Compose project name is not the isolated staging project',
    );
  }

  walkStrings(model, (value, field) => {
    const isBundleIdentifierField = /(?:^|_)BUNDLE_ID$/i
      .test(field.split('.').at(-1) || '');
    if (
      PRODUCTION_DOMAIN_PATTERN.test(value)
      || (
        !isBundleIdentifierField
        &&
        BRANDED_EXTERNAL_HOST_PATTERN.test(value)
        && !value.includes('menorah-synthetic.internal')
      )
    ) {
      pushError(
        errors,
        'production_domain',
        field,
        'Rendered Compose contains a prohibited production domain',
      );
    }
    if (PRODUCTION_PATH_PATTERN.test(value)) {
      pushError(
        errors,
        'production_path',
        field,
        'Rendered Compose contains a prohibited production filesystem root',
      );
    }
    for (const hostname of extractTargetHosts(value, {
      includeBare: false,
    })) {
      if (!isAllowedRuntimeHost(hostname)) {
        pushError(
          errors,
          'external_runtime_host',
          field,
          'Rendered runtime targets must remain inside isolated local staging',
        );
      }
    }
  });

  const networks = model.networks && typeof model.networks === 'object'
    ? model.networks
    : {};
  const actualNetworkNames = Object.values(networks)
    .map((network) => network?.name)
    .filter(Boolean);
  if (
    JSON.stringify(sortedUnique(actualNetworkNames))
    !== JSON.stringify(sortedUnique(EXPECTED_NETWORK_NAMES))
  ) {
    pushError(
      errors,
      'network_set_mismatch',
      'compose.networks',
      'Rendered Compose must declare exactly the isolated staging networks',
    );
  }
  for (const [networkKey, network] of Object.entries(networks)) {
    if (
      network?.external === true
      || network?.internal !== true
      || !EXPECTED_NETWORK_NAMES.includes(network?.name)
    ) {
      pushError(
        errors,
        'network_not_isolated',
        `compose.networks.${networkKey}`,
        'Every network must be internal, project-scoped, and Docker-managed',
      );
    }
  }

  const volumes = model.volumes && typeof model.volumes === 'object'
    ? model.volumes
    : {};
  const actualVolumeNames = Object.values(volumes)
    .map((volume) => volume?.name)
    .filter(Boolean);
  if (
    JSON.stringify(sortedUnique(actualVolumeNames))
    !== JSON.stringify(sortedUnique(EXPECTED_VOLUME_NAMES))
  ) {
    pushError(
      errors,
      'volume_set_mismatch',
      'compose.volumes',
      'Rendered Compose must declare exactly the required local named volumes',
    );
  }
  for (const [volumeKey, volume] of Object.entries(volumes)) {
    if (
      volume?.external === true
      || !EXPECTED_VOLUME_NAMES.includes(volume?.name)
      || (
        volume?.driver_opts
        && Object.keys(volume.driver_opts).length > 0
      )
    ) {
      pushError(
        errors,
        'volume_not_local',
        `compose.volumes.${volumeKey}`,
        'Named volumes must be local, project-scoped, and non-external',
      );
    }
  }

  const allowedEnvPath = normalizeFilePath(allowedEnvironmentFile);
  const localRoot = normalizeFilePath(localStagingDirectory);
  const allowedSharedRules = normalizeFilePath(sharedAlertRulesFile);
  const knownVolumeSources = new Set([
    ...Object.keys(volumes),
    ...actualVolumeNames,
  ]);

  const services = model.services && typeof model.services === 'object'
    ? model.services
    : {};
  let fullStagingEnvironmentCount = 0;
  const backendMailKeys = [];
  for (const [serviceName, service] of Object.entries(services)) {
    const field = `compose.services.${serviceName}`;
    const isDataService = (
      DATA_SERVICE_NAME_PATTERN.test(serviceName)
      || DATA_SERVICE_IMAGE_PATTERN.test(String(service?.image || ''))
    );

    if (service?.privileged === true) {
      pushError(
        errors,
        'privileged_service',
        `${field}.privileged`,
        'Privileged containers are prohibited',
      );
    }
    if (
      String(service?.network_mode || '').toLowerCase() === 'host'
      || String(service?.pid || '').toLowerCase() === 'host'
      || String(service?.ipc || '').toLowerCase() === 'host'
    ) {
      pushError(
        errors,
        'host_namespace',
        field,
        'Host namespaces are prohibited',
      );
    }
    if (service?.volumes_from) {
      pushError(
        errors,
        'volumes_from',
        `${field}.volumes_from`,
        'Shared container volumes are prohibited',
      );
    }

    for (const networkKey of serviceNetworkKeys(service)) {
      if (!Object.hasOwn(networks, networkKey)) {
        pushError(
          errors,
          'undeclared_network',
          `${field}.networks.${networkKey}`,
          'Services may use only declared isolated networks',
        );
      }
    }

    const ports = (service?.ports || []).map(normalizePort);
    if (isDataService && ports.length > 0) {
      pushError(
        errors,
        'data_service_published',
        `${field}.ports`,
        'MongoDB and Redis must not publish host ports',
      );
    }
    for (const [index, port] of ports.entries()) {
      if (!isAllowedLoopback(port.hostIp)) {
        pushError(
          errors,
          'non_loopback_port',
          `${field}.ports[${index}]`,
          'Every published port must bind exactly to 127.0.0.1',
        );
      }
      if (!isExpectedPort(serviceName, port)) {
        pushError(
          errors,
          'port_not_allowlisted',
          `${field}.ports[${index}]`,
          'Published port is not in the fixed local staging allowlist',
        );
      }
    }

    const mounts = Array.isArray(service?.volumes) ? service.volumes : [];
    for (const [index, rawMount] of mounts.entries()) {
      const mountField = `${field}.volumes[${index}]`;
      if (typeof rawMount === 'string') {
        pushError(
          errors,
          'noncanonical_mount',
          mountField,
          'Rendered mounts must use canonical object form',
        );
        continue;
      }
      const mount = rawMount || {};
      const source = String(mount.source || '');
      const target = String(mount.target || '');
      const normalizedSource = source
        ? normalizeFilePath(source)
        : '';
      if (
        DOCKER_SOCKET_PATTERN.test(source)
        || DOCKER_SOCKET_PATTERN.test(target)
        || CONTAINER_LOG_PATH_PATTERN.test(source)
        || CONTAINER_LOG_PATH_PATTERN.test(target)
      ) {
        pushError(
          errors,
          'host_runtime_mount',
          mountField,
          'Docker sockets and host container logs are prohibited',
        );
      }
      if (mount.type === 'bind') {
        if (
          isHostRoot(normalizedSource)
          || (
            !isPathWithin(normalizedSource, localRoot)
            && normalizedSource !== allowedSharedRules
          )
        ) {
          pushError(
            errors,
            'bind_outside_allowlist',
            mountField,
            'Bind mounts must remain inside local-staging or use the reviewed alert rules file',
          );
        }
        if (mount.read_only !== true) {
          pushError(
            errors,
            'writable_bind',
            mountField,
            'Every host bind mount must be read-only',
          );
        }
        if (
          /^(?:\/data(?:\/|$)|\/app\/uploads(?:\/|$)|\/backups?(?:\/|$)|\/prometheus(?:\/|$)|\/loki(?:\/|$)|\/alertmanager(?:\/|$)|\/var\/lib\/alloy(?:\/|$))/i
            .test(target)
        ) {
          pushError(
            errors,
            'bind_persistence',
            mountField,
            'Persistent container paths must use named local volumes',
          );
        }
      } else if (
        mount.type === 'volume'
        && !knownVolumeSources.has(source)
      ) {
        pushError(
          errors,
          'undeclared_volume',
          mountField,
          'Services may use only declared local named volumes',
        );
      } else if (!['volume', 'tmpfs'].includes(String(mount.type))) {
        pushError(
          errors,
          'unsupported_mount_type',
          mountField,
          'Only named volumes, tmpfs, and reviewed read-only binds are allowed',
        );
      }
    }

    for (const [index, envFile] of envFileReferences(service).entries()) {
      if (normalizeFilePath(envFile) !== allowedEnvPath) {
        pushError(
          errors,
          'prohibited_env_file',
          `${field}.env_file[${index}]`,
          'Only the generated local staging environment file may be referenced',
        );
      }
    }

    const environment = modelEnvironment(service);
    errors.push(...validateEnvironmentRecord(environment, {
      fieldPrefix: `${field}.environment`,
    }));
    if (
      environment.DEPLOYMENT_ENVIRONMENT === 'staging'
      && environment.ROOT_DOMAIN
    ) {
      fullStagingEnvironmentCount += 1;
      backendMailKeys.push(String(environment.RESEND_API_KEY || ''));
      for (const [key, expected] of Object.entries({
        ...EXPECTED_DOMAINS,
        ...expectedStagingUrls(),
      })) {
        if (String(environment[key] || '') !== expected) {
          pushError(
            errors,
            'service_staging_contract_mismatch',
            `${field}.environment.${key}`,
            'Backend service staging hosts and URLs must match the fixed local contract',
          );
        }
      }
    }
  }

  if (fullStagingEnvironmentCount === 0) {
    pushError(
      errors,
      'backend_staging_environment_missing',
      'compose.services',
      'At least one rendered backend must carry the complete staging contract',
    );
  }

  const mailCapture = services['mail-capture'];
  if (!mailCapture) {
    pushError(
      errors,
      'required_service_missing',
      'compose.services.mail-capture',
      'The internal local-staging mail capture service is required',
    );
  } else {
    const mailField = 'compose.services.mail-capture';
    const mailEnvironment = modelEnvironment(mailCapture);
    if (
      mailEnvironment.NODE_ENV !== 'production'
      || mailEnvironment.MAIL_CAPTURE_PORT !== '8025'
      || !/^re_local_[A-Za-z0-9_-]{32,}$/.test(
        String(mailEnvironment.MAIL_CAPTURE_API_KEY || ''),
      )
    ) {
      pushError(
        errors,
        'mail_capture_identity_invalid',
        `${mailField}.environment`,
        'Mail capture must use only the generated local credential and fixed internal port',
      );
    }
    if (
      backendMailKeys.length === 0
      || backendMailKeys.some(
        (value) => value !== mailEnvironment.MAIL_CAPTURE_API_KEY,
      )
    ) {
      pushError(
        errors,
        'mail_capture_key_mismatch',
        `${mailField}.environment.MAIL_CAPTURE_API_KEY`,
        'Backends and mail capture must share only the same generated local credential',
      );
    }
    const userWebEnvironment = modelEnvironment(services['user-web-app']);
    if (
      userWebEnvironment.RESEND_API_URL
        !== 'http://mail-capture:8025/emails'
      || userWebEnvironment.RESEND_API_KEY
        !== mailEnvironment.MAIL_CAPTURE_API_KEY
      || userWebEnvironment.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID
        !== EXPECTED_ENVIRONMENT_ID
      || userWebEnvironment.MENORAH_LOCAL_STAGING_HTTPS_PORT
        !== EXPECTED_HTTPS_PORT
      || userWebEnvironment.MENORAH_API_BASE_URL
        !== 'http://api-web:8080/api'
    ) {
      pushError(
        errors,
        'user_web_mail_capture_mismatch',
        'compose.services.user-web-app.environment',
        'User web email delivery must share the exact internal local capture identity',
      );
    }
    if (
      JSON.stringify(serviceNetworkKeys(mailCapture))
      !== JSON.stringify(['app'])
      || (mailCapture.ports || []).length > 0
    ) {
      pushError(
        errors,
        'mail_capture_network_not_internal',
        mailField,
        'Mail capture must use only the internal app network and publish no host port',
      );
    }
    const capDrop = Array.isArray(mailCapture.cap_drop)
      ? mailCapture.cap_drop.map((value) => String(value).toUpperCase())
      : [];
    const securityOptions = Array.isArray(mailCapture.security_opt)
      ? mailCapture.security_opt.map((value) => String(value).toLowerCase())
      : [];
    const memoryLimit = Number(mailCapture.mem_limit);
    const cpuLimit = Number(mailCapture.cpus);
    if (
      mailCapture.read_only !== true
      || !capDrop.includes('ALL')
      || !securityOptions.includes('no-new-privileges:true')
      || !mailCapture.healthcheck?.test
      || Number(mailCapture.pids_limit) < 1
      || Number(mailCapture.pids_limit) > 64
      || !Number.isFinite(memoryLimit)
      || memoryLimit < 1
      || memoryLimit > 128 * 1024 * 1024
      || !Number.isFinite(cpuLimit)
      || cpuLimit <= 0
      || cpuLimit > 0.25
    ) {
      pushError(
        errors,
        'mail_capture_hardening_missing',
        mailField,
        'Mail capture must remain read-only, capability-free, health-checked, and tightly resource-limited',
      );
    }
  }

  const alertFixture = services['alert-fixture'];
  if (!alertFixture) {
    pushError(
      errors,
      'required_service_missing',
      'compose.services.alert-fixture',
      'The internal local-staging alert fixture service is required',
    );
  } else {
    const fixtureField = 'compose.services.alert-fixture';
    const fixtureEnvironment = modelEnvironment(alertFixture);
    if (
      fixtureEnvironment.COMPOSE_PROJECT_NAME !== EXPECTED_PROJECT
      || fixtureEnvironment.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID
        !== EXPECTED_ENVIRONMENT_ID
      || fixtureEnvironment.ALERT_FIXTURE_PORT !== '9101'
    ) {
      pushError(
        errors,
        'alert_fixture_identity_invalid',
        `${fixtureField}.environment`,
        'Alert fixture identity and internal port must match the fixed local contract',
      );
    }
    if (
      JSON.stringify(serviceNetworkKeys(alertFixture))
      !== JSON.stringify(['monitoring'])
      || (alertFixture.ports || []).length > 0
    ) {
      pushError(
        errors,
        'alert_fixture_network_not_internal',
        fixtureField,
        'Alert fixture must use only the internal monitoring network and publish no host port',
      );
    }
    const capDrop = Array.isArray(alertFixture.cap_drop)
      ? alertFixture.cap_drop.map((value) => String(value).toUpperCase())
      : [];
    const securityOptions = Array.isArray(alertFixture.security_opt)
      ? alertFixture.security_opt.map((value) => String(value).toLowerCase())
      : [];
    const memoryLimit = Number(alertFixture.mem_limit);
    const cpuLimit = Number(alertFixture.cpus);
    if (
      alertFixture.read_only !== true
      || !capDrop.includes('ALL')
      || !securityOptions.includes('no-new-privileges:true')
      || !alertFixture.healthcheck?.test
      || Number(alertFixture.pids_limit) < 1
      || Number(alertFixture.pids_limit) > 64
      || !Number.isFinite(memoryLimit)
      || memoryLimit < 1
      || memoryLimit > 128 * 1024 * 1024
      || !Number.isFinite(cpuLimit)
      || cpuLimit <= 0
      || cpuLimit > 0.25
    ) {
      pushError(
        errors,
        'alert_fixture_hardening_missing',
        fixtureField,
        'Alert fixture must remain read-only, capability-free, health-checked, and tightly resource-limited',
      );
    }
  }

  const backupJob = services['backup-job'];
  if (backupJob) {
    const backupEnvironment = modelEnvironment(backupJob);
    if (
      backupEnvironment.MENORAH_LOCAL_STAGING_BACKUP_METRICS_URL
        !== 'http://alert-fixture:9101/control/backup'
      || !serviceNetworkKeys(backupJob).includes('monitoring')
    ) {
      pushError(
        errors,
        'backup_alert_telemetry_invalid',
        'compose.services.backup-job',
        'Local backup telemetry must use only the exact internal alert fixture endpoint',
      );
    }
  }

  for (const [serviceName, expectedPorts] of Object.entries(EXPECTED_PORTS)) {
    const service = services[serviceName];
    if (!service) {
      pushError(
        errors,
        'required_service_missing',
        `compose.services.${serviceName}`,
        'A required local staging service is missing',
      );
      continue;
    }
    const actualPorts = (service.ports || []).map(normalizePort);
    for (const expected of expectedPorts) {
      if (!hasExpectedPort(actualPorts, expected)) {
        pushError(
          errors,
          'required_port_missing',
          `compose.services.${serviceName}.ports`,
          'A required loopback port mapping is missing',
        );
      }
    }
  }

  const secrets = model.secrets && typeof model.secrets === 'object'
    ? model.secrets
    : {};
  const allowedSecretFiles = new Set([
    normalizeFilePath(DEFAULT_BACKUP_PASSWORD_FILE),
    normalizeFilePath(DEFAULT_BACKUP_HMAC_FILE),
  ]);
  for (const [secretName, secret] of Object.entries(secrets)) {
    const secretFile = secret?.file;
    if (
      secret?.external === true
      || !secretFile
      || !allowedSecretFiles.has(normalizeFilePath(secretFile))
    ) {
      pushError(
        errors,
        'secret_source_not_local',
        `compose.secrets.${secretName}`,
        'Compose secrets must use only generated local staging files',
      );
    }
  }

  return errors;
};

const assertPrivateRegularFile = (target, label) => {
  const metadata = lstatSync(target);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular, non-symlink file`);
  }
  if (
    process.platform !== 'win32'
    && (metadata.mode & 0o077) !== 0
  ) {
    throw new Error(`${label} must not be group- or world-accessible`);
  }
};

const readCleanGitHead = () => {
  const commonOptions = {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  };
  const head = spawnSync('git', ['rev-parse', 'HEAD'], commonOptions);
  const status = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    commonOptions,
  );
  if (
    head.status !== 0
    || status.status !== 0
    || String(status.stdout || '').trim()
  ) {
    throw new Error(
      'Validator requires a clean runtime tree with a Git HEAD',
    );
  }
  const candidate = String(head.stdout || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(candidate)) {
    throw new Error('Git HEAD did not resolve to a commit SHA');
  }
  return candidate;
};

const safeChildEnvironment = (generatedEnvironment) => {
  const inheritedKeys = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'ProgramFiles',
    'ProgramData',
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'HOME',
    'TMP',
    'TEMP',
  ];
  const childEnvironment = {};
  for (const key of inheritedKeys) {
    if (process.env[key] !== undefined) {
      childEnvironment[key] = process.env[key];
    }
  }
  childEnvironment.COMPOSE_PROJECT_NAME = EXPECTED_PROJECT;
  childEnvironment.MENORAH_LOCAL_STAGING_ENV_FILE =
    generatedEnvironment.MENORAH_LOCAL_STAGING_ENV_FILE;
  childEnvironment.MENORAH_LOCAL_STAGING_MONGO_KEYFILE =
    generatedEnvironment.MENORAH_LOCAL_STAGING_MONGO_KEYFILE;
  childEnvironment.MENORAH_LOCAL_STAGING_BACKUP_PASSWORD_FILE =
    generatedEnvironment.MENORAH_LOCAL_STAGING_BACKUP_PASSWORD_FILE;
  childEnvironment.MENORAH_LOCAL_STAGING_BACKUP_HMAC_FILE =
    generatedEnvironment.MENORAH_LOCAL_STAGING_BACKUP_HMAC_FILE;
  return childEnvironment;
};

const parseArguments = (argv) => {
  const options = {
    composeFile: DEFAULT_COMPOSE_FILE,
    environmentFile: DEFAULT_ENVIRONMENT_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--compose' && argv[index + 1]) {
      options.composeFile = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === '--env-file' && argv[index + 1]) {
      options.environmentFile = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unsupported validator argument: ${argument}`);
    }
  }
  return options;
};

export const runIsolationValidation = ({
  composeFile = DEFAULT_COMPOSE_FILE,
  environmentFile = DEFAULT_ENVIRONMENT_FILE,
} = {}) => {
  if (
    normalizeFilePath(environmentFile)
    !== normalizeFilePath(DEFAULT_ENVIRONMENT_FILE)
  ) {
    throw new Error(
      'Validator accepts only generated/local-staging.env',
    );
  }
  if (
    normalizeFilePath(composeFile)
    !== normalizeFilePath(DEFAULT_COMPOSE_FILE)
  ) {
    throw new Error('Validator accepts only local-staging/compose.yml');
  }

  assertPrivateRegularFile(environmentFile, 'Generated environment');
  const environmentSource = readFileSync(environmentFile, 'utf8');
  const generatedEnvironment = parseEnvironmentFile(environmentSource);
  const currentHead = readCleanGitHead();
  const environmentErrors = validateEnvironmentRecord(
    generatedEnvironment,
    {
      fieldPrefix: 'generatedEnvironment',
      requireGeneratedContract: true,
      expectedRuntimeCandidateSha: currentHead,
    },
  );

  const expectedPrivatePaths = {
    MENORAH_LOCAL_STAGING_ENV_FILE: environmentFile,
    MENORAH_LOCAL_STAGING_MONGO_KEYFILE: DEFAULT_MONGO_KEYFILE,
    MENORAH_LOCAL_STAGING_BACKUP_PASSWORD_FILE:
      DEFAULT_BACKUP_PASSWORD_FILE,
    MENORAH_LOCAL_STAGING_BACKUP_HMAC_FILE:
      DEFAULT_BACKUP_HMAC_FILE,
  };
  for (const [key, expectedPath] of Object.entries(expectedPrivatePaths)) {
    if (
      normalizeFilePath(generatedEnvironment[key] || '')
      !== normalizeFilePath(expectedPath)
    ) {
      pushError(
        environmentErrors,
        'generated_path_mismatch',
        `generatedEnvironment.${key}`,
        'Generated private artifact path does not match the fixed ignored location',
      );
    }
  }

  for (const [target, label] of [
    [DEFAULT_MONGO_KEYFILE, 'Mongo keyfile'],
    [DEFAULT_BACKUP_PASSWORD_FILE, 'Backup password file'],
    [DEFAULT_BACKUP_HMAC_FILE, 'Backup HMAC file'],
  ]) {
    assertPrivateRegularFile(target, label);
  }
  const mongoKeyfileContents = readFileSync(DEFAULT_MONGO_KEYFILE, 'utf8');
  if (
    !/^[A-Za-z0-9+/]{1000,1024}={0,2}$/.test(mongoKeyfileContents)
  ) {
    pushError(
      environmentErrors,
      'mongo_keyfile_invalid',
      'generated.mongoKeyfile',
      'Mongo keyfile does not have the required random base64 shape',
    );
  }
  if (
    readFileSync(DEFAULT_BACKUP_PASSWORD_FILE, 'utf8')
    !== generatedEnvironment.BACKUP_ENCRYPTION_PASSWORD
  ) {
    pushError(
      environmentErrors,
      'backup_password_file_mismatch',
      'generated.backupPasswordFile',
      'Backup password secret file does not match the generated contract',
    );
  }
  if (
    readFileSync(DEFAULT_BACKUP_HMAC_FILE, 'utf8')
    !== generatedEnvironment.BACKUP_INTEGRITY_HMAC_KEY
  ) {
    pushError(
      environmentErrors,
      'backup_hmac_file_mismatch',
      'generated.backupHmacFile',
      'Backup HMAC secret file does not match the generated contract',
    );
  }

  const composeArguments = [
    'compose',
    '-p',
    EXPECTED_PROJECT,
    '--env-file',
    environmentFile,
    '--project-directory',
    MODULE_DIRECTORY,
    '--profile',
    '*',
    '-f',
    composeFile,
    'config',
    '--format',
    'json',
  ];
  const rendered = spawnSync('docker', composeArguments, {
    cwd: MODULE_DIRECTORY,
    env: safeChildEnvironment(generatedEnvironment),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (rendered.status !== 0) {
    throw new Error(
      'docker compose config failed; rendered output was suppressed',
    );
  }

  let model;
  try {
    model = JSON.parse(rendered.stdout);
  } catch {
    throw new Error(
      'docker compose config did not return valid JSON; output was suppressed',
    );
  }
  const modelErrors = validateRenderedCompose(model, {
    localStagingDirectory: MODULE_DIRECTORY,
    allowedEnvironmentFile: environmentFile,
    sharedAlertRulesFile: SHARED_ALERT_RULES_FILE,
  });
  const errors = [...environmentErrors, ...modelErrors];

  return Object.freeze({
    ok: errors.length === 0,
    project: EXPECTED_PROJECT,
    runtimeCandidateSha: currentHead,
    composeFile: normalizeFilePath(composeFile),
    environmentFile: normalizeFilePath(environmentFile),
    renderedConfigSha256: sha256(rendered.stdout),
    serviceCount: Object.keys(model.services || {}).length,
    networkCount: Object.keys(model.networks || {}).length,
    volumeCount: Object.keys(model.volumes || {}).length,
    errors,
  });
};

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = runIsolationValidation(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      project: EXPECTED_PROJECT,
      errors: [{
        code: 'validator_execution_failed',
        field: 'validator',
        message: error.message,
      }],
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
