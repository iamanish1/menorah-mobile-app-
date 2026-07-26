#!/usr/bin/env node

import {
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const PROJECT_NAME = 'menorah-local-staging';
export const HTTPS_PORT = '28443';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..', '..');
const CONTRACT_FILE = path.resolve(
  MODULE_DIRECTORY,
  '..',
  'env',
  'production.env.example',
);
const GENERATED_DIRECTORY = path.join(MODULE_DIRECTORY, 'generated');
const DEFAULT_ENVIRONMENT_FILE = path.join(
  GENERATED_DIRECTORY,
  'local-staging.env',
);
const DEFAULT_MONGO_KEYFILE = path.join(
  GENERATED_DIRECTORY,
  'mongo-keyfile',
);
const DEFAULT_BACKUP_PASSWORD_FILE = path.join(
  GENERATED_DIRECTORY,
  'backup-encryption-password',
);
const DEFAULT_BACKUP_HMAC_FILE = path.join(
  GENERATED_DIRECTORY,
  'backup-integrity-hmac-key',
);
const ALERTMANAGER_FILE = path.join(MODULE_DIRECTORY, 'alertmanager.yml');
const execFileAsync = promisify(execFile);

const REQUIRED_CONTRACT_KEYS = Object.freeze([
  'NODE_ENV',
  'DEPLOYMENT_ENVIRONMENT',
  'MENORAH_STAGING_ALLOWED_HOSTS',
  'MENORAH_STAGING_EMAIL_DOMAIN',
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATA_ENCRYPTION_KEY',
  'AUDIT_LOG_SIGNING_KEY',
  'BACKUP_ENCRYPTION_PASSWORD',
  'BACKUP_INTEGRITY_HMAC_KEY',
  'BACKUP_INTEGRITY_EPOCH_ID',
]);

export const SECRET_VALUE_KEYS = Object.freeze([
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

const STAGING_DOMAINS = Object.freeze({
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

const RETENTION_CATEGORIES = Object.freeze([
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

const SYNTHETIC_ADMIN_IDS = Object.freeze({
  support: '7a110ca15a6e000000000101',
  finance: '7a110ca15a6e000000000102',
  content: '7a110ca15a6e000000000103',
  adminPrimary: '7a110ca15a6e000000000104',
  adminSecondary: '7a110ca15a6e000000000105',
});

const slashPath = (value) => (
  /^[A-Za-z]:[\\/]/.test(value)
    ? value.replaceAll('\\', '/')
    : path.resolve(value).replaceAll('\\', '/')
);

const sha256 = (value) => (
  createHash('sha256').update(value).digest('hex')
);

const randomToken = (byteLength, randomBytesFunction) => (
  randomBytesFunction(byteLength).toString('base64url')
);

const strongRosterPassword = (randomBytesFunction) => (
  `Aa1!${randomToken(32, randomBytesFunction)}`
);

export const parseContractKeys = (source) => {
  const keys = [];
  const seen = new Set();

  for (const line of String(source).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    keys.push(match[1]);
  }

  return keys;
};

export const assertDistinctSecretValues = (
  values,
  secretKeys = SECRET_VALUE_KEYS,
  additionalValues = [],
) => {
  const candidates = [
    ...secretKeys.map((key) => values[key]),
    ...additionalValues,
  ];

  if (
    candidates.some((value) => typeof value !== 'string' || value.length < 16)
    || new Set(candidates).size !== candidates.length
  ) {
    throw new Error(
      'Generated credentials must be present, sufficiently long, and unique',
    );
  }
};

const retentionPolicy = JSON.stringify({
  version: 'synthetic-local-staging-retention-v1',
  categories: Object.fromEntries(RETENTION_CATEGORIES.map((category) => [
    category,
    {
      mode: 'manual',
      policyReference: `synthetic-local-staging-${category}-manual-v1`,
    },
  ])),
});

const adminRoleGrants = JSON.stringify(
  Object.entries(SYNTHETIC_ADMIN_IDS).map(([identity, adminId]) => ({
    adminId,
    role: identity.startsWith('admin') ? 'admin' : identity,
  })),
);

const privacyPermissionGrants = JSON.stringify([
  {
    adminId: SYNTHETIC_ADMIN_IDS.adminPrimary,
    permissions: [
      'privacy_reader',
      'privacy_reviewer',
      'privacy_legal_hold',
    ],
  },
]);

const bookingCatalog = JSON.stringify({
  basic: {
    durationMinutes: 30,
    amountMinor: 100,
    currency: 'INR',
  },
  premium: {
    durationMinutes: 45,
    amountMinor: 200,
    currency: 'INR',
  },
  pro: {
    durationMinutes: 60,
    amountMinor: 300,
    currency: 'INR',
  },
  'unassigned-30': {
    durationMinutes: 30,
    amountMinor: 100,
    currency: 'INR',
  },
  'unassigned-45': {
    durationMinutes: 45,
    amountMinor: 200,
    currency: 'INR',
  },
  'unassigned-60': {
    durationMinutes: 60,
    amountMinor: 300,
    currency: 'INR',
  },
  'unassigned-90': {
    durationMinutes: 90,
    amountMinor: 400,
    currency: 'INR',
  },
});

export const buildEnvironmentValues = ({
  contractKeys,
  environmentFile = DEFAULT_ENVIRONMENT_FILE,
  mongoKeyfile = DEFAULT_MONGO_KEYFILE,
  backupPasswordFile = DEFAULT_BACKUP_PASSWORD_FILE,
  backupHmacFile = DEFAULT_BACKUP_HMAC_FILE,
  runtimeCandidateSha,
  alertmanagerDigest = sha256('local-staging-alertmanager-not-present'),
  randomBytesFunction = randomBytes,
} = {}) => {
  if (!Array.isArray(contractKeys) || contractKeys.length === 0) {
    throw new Error('The source-controlled environment contract is empty');
  }
  if (!/^[a-f0-9]{40}$/.test(String(runtimeCandidateSha || ''))) {
    throw new Error(
      'A lowercase 40-character runtime candidate SHA is required',
    );
  }

  const missingContractKeys = REQUIRED_CONTRACT_KEYS.filter(
    (key) => !contractKeys.includes(key),
  );
  if (missingContractKeys.length > 0) {
    throw new Error(
      `The source-controlled environment contract is missing required keys: ${missingContractKeys.join(', ')}`,
    );
  }

  const secrets = {
    MONGO_ROOT_PASSWORD: randomToken(48, randomBytesFunction),
    MONGO_APP_PASSWORD: randomToken(48, randomBytesFunction),
    MONGO_BACKUP_PASSWORD: randomToken(48, randomBytesFunction),
    MONGO_RESTORE_PASSWORD: randomToken(48, randomBytesFunction),
    MONGO_MONITOR_PASSWORD: randomToken(48, randomBytesFunction),
    REDIS_PASSWORD: randomToken(48, randomBytesFunction),
    JWT_SECRET: randomToken(64, randomBytesFunction),
    JWT_REFRESH_SECRET: randomToken(64, randomBytesFunction),
    DATA_ENCRYPTION_KEY: randomToken(48, randomBytesFunction),
    AUDIT_LOG_SIGNING_KEY: randomToken(48, randomBytesFunction),
    BACKUP_ENCRYPTION_PASSWORD: randomToken(48, randomBytesFunction),
    BACKUP_INTEGRITY_HMAC_KEY: randomToken(48, randomBytesFunction),
    RAZORPAY_KEY_ID: `rzp_test_${randomBytesFunction(12).toString('hex')}`,
    RAZORPAY_KEY_SECRET: randomToken(32, randomBytesFunction),
    RAZORPAY_WEBHOOK_SECRET: randomToken(32, randomBytesFunction),
    RAZORPAY_X_KEY_ID: `rzp_test_${randomBytesFunction(12).toString('hex')}`,
    RAZORPAY_X_KEY_SECRET: randomToken(32, randomBytesFunction),
    RAZORPAY_X_WEBHOOK_SECRET: randomToken(32, randomBytesFunction),
    RESEND_API_KEY:
      `re_local_${randomToken(32, randomBytesFunction)}`,
    RESEND_WEBHOOK_SECRET: randomToken(32, randomBytesFunction),
    LIVEKIT_API_KEY: randomBytesFunction(12).toString('hex'),
    LIVEKIT_API_SECRET: randomToken(32, randomBytesFunction),
    MENORAH_LOCAL_STAGING_USER_A_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_USER_B_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_COUNSELLOR_A_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_COUNSELLOR_DRAFT_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_COUNSELLOR_SUSPENDED_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_ADMIN_SUPPORT_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_ADMIN_FINANCE_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_ADMIN_CONTENT_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_ADMIN_FULL_1_PASSWORD:
      strongRosterPassword(randomBytesFunction),
    MENORAH_LOCAL_STAGING_ADMIN_FULL_2_PASSWORD:
      strongRosterPassword(randomBytesFunction),
  };

  const appOrigin = `https://${STAGING_DOMAINS.APP_DOMAIN}:${HTTPS_PORT}`;
  const adminOrigin =
    `https://${STAGING_DOMAINS.ADMIN_DOMAIN}:${HTTPS_PORT}`;
  const counsellorOrigin =
    `https://${STAGING_DOMAINS.COUNSELLOR_DOMAIN}:${HTTPS_PORT}`;
  const webOrigin = `https://${STAGING_DOMAINS.WWW_DOMAIN}:${HTTPS_PORT}`;
  const apiWebOrigin =
    `https://${STAGING_DOMAINS.API_WEB_DOMAIN}:${HTTPS_PORT}`;
  const apiAdminOrigin =
    `https://${STAGING_DOMAINS.API_ADMIN_DOMAIN}:${HTTPS_PORT}`;
  const callsOrigin =
    `https://${STAGING_DOMAINS.CALLS_DOMAIN}:${HTTPS_PORT}`;

  const overrides = {
    ...STAGING_DOMAINS,
    ...secrets,

    COMPOSE_PROJECT_NAME: PROJECT_NAME,
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SERVICE_RUNTIME: 'home',
    MENORAH_SYNTHETIC_DATA_ONLY: 'true',
    MENORAH_LOCAL_STAGING_ENV_FILE: slashPath(environmentFile),
    MENORAH_LOCAL_STAGING_MONGO_KEYFILE: slashPath(mongoKeyfile),
    MENORAH_LOCAL_STAGING_BACKUP_PASSWORD_FILE:
      slashPath(backupPasswordFile),
    MENORAH_LOCAL_STAGING_BACKUP_HMAC_FILE: slashPath(backupHmacFile),
    MENORAH_LOCAL_STAGING_HTTPS_PORT: HTTPS_PORT,
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: 'menorah-local-staging-v1',
    MENORAH_RUNTIME_CANDIDATE_SHA: runtimeCandidateSha,
    MENORAH_LOCAL_STAGING_SEED_CONFIRM:
      'CREATE_SYNTHETIC_ROSTER_ONLY_IN_MENORAH_LOCAL_STAGING_V1',
    MENORAH_STAGING_ALLOWED_HOSTS: Object.values(STAGING_DOMAINS).join(','),
    MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.localhost',

    PUBLIC_EMAIL: 'admin@mail.staging.localhost',
    API_BASE_URL: `${apiWebOrigin}/api`,
    PUBLIC_WEB_BASE_URL: webOrigin,
    FRONTEND_WWW_URL: webOrigin,
    FRONTEND_APP_URL: appOrigin,
    FRONTEND_COUNSELLOR_URL: counsellorOrigin,
    FRONTEND_API_WEB_URL: `${apiWebOrigin}/api`,
    FRONTEND_API_ADMIN_URL: `${apiAdminOrigin}/api`,
    FRONTEND_SOCKET_WEB_URL: apiWebOrigin,
    NEXT_PUBLIC_API_URL: `${apiWebOrigin}/api`,
    NEXT_PUBLIC_SOCKET_URL: apiWebOrigin,
    NEXT_PUBLIC_WEB_BASE_URL: webOrigin,
    NEXT_PUBLIC_SITE_URL: webOrigin,
    MENORAH_API_BASE_URL: 'http://api-web:8080/api',
    ALLOWED_ORIGINS: [
      webOrigin,
      appOrigin,
      adminOrigin,
      counsellorOrigin,
    ].join(','),
    WEB_SESSION_ORIGINS: [
      `${webOrigin}=user`,
      `${appOrigin}=user`,
      `${counsellorOrigin}=counsellor`,
      `${adminOrigin}=admin`,
    ].join(','),
    PASSWORD_RESET_BASE_URL: appOrigin,
    CHECKOUT_RETURN_URL: `${appOrigin}/checkout/return`,

    MONGO_ROOT_USER: 'menorah-local-root',
    MONGO_APP_USER: 'menorah-local-app',
    MONGO_BACKUP_USER: 'menorah-local-backup',
    MONGO_RESTORE_USER: 'menorah-local-restore',
    MONGO_MONITOR_USER: 'menorah-local-monitor',
    MONGO_INITDB_DATABASE: 'menorah',
    MONGODB_REPLICA_SET_NAME: 'menorah-rs',
    MONGODB_READ_PREFERENCE: 'primaryPreferred',
    MONGODB_RETRY_WRITES: 'true',
    MONGODB_URI:
      `mongodb://menorah-local-app:${secrets.MONGO_APP_PASSWORD}`
      + '@mongo-primary:27017/menorah'
      + '?replicaSet=menorah-rs&authSource=admin&retryWrites=true',
    MONGODB_BACKUP_URI:
      `mongodb://menorah-local-backup:${secrets.MONGO_BACKUP_PASSWORD}`
      + '@mongo-primary:27017/?replicaSet=menorah-rs&authSource=admin',
    MONGODB_PRODUCTION_RESTORE_URI:
      `mongodb://menorah-local-restore:${secrets.MONGO_RESTORE_PASSWORD}`
      + '@mongo-primary:27017/?replicaSet=menorah-rs&authSource=admin',
    MONGODB_MONITORING_URI:
      `mongodb://menorah-local-monitor:${secrets.MONGO_MONITOR_PASSWORD}`
      + '@mongo-primary:27017/admin'
      + '?replicaSet=menorah-rs&authSource=admin',
    MONGODB_RESTORE_TEST_URI:
      'mongodb://mongo-restore:27017/menorah'
      + '?replicaSet=menorah-restore-rs',
    MONGO_KEYFILE_PATH: '/run/secrets/mongo-keyfile',

    REDIS_URL: `redis://:${secrets.REDIS_PASSWORD}@redis:6379`,
    REDIS_MONITORING_URL:
      `redis://:${secrets.REDIS_PASSWORD}@redis:6379`,

    JWT_ISSUER: 'menorah-local-staging-api',
    JWT_EXPIRES_IN: '7d',
    JWT_REFRESH_EXPIRES_IN: '30d',
    ADMIN_JWT_EXPIRES_IN: '30m',
    ADMIN_MFA_REQUIRED: 'true',
    ADMIN_BOOTSTRAP_EMAIL: '',
    ADMIN_BOOTSTRAP_PASSWORD: '',
    ADMIN_BOOTSTRAP_CONFIRM: 'create-admin',

    MAX_PAYOUT_AMOUNT_PAISE: '5000000',
    KYC_CONSENT_VERSION: 'ordinary-face-check-v1-2026-07-22',
    KYC_RETENTION_DAYS: '365',
    PRIVACY_NOTICE_VERSION: 'synthetic-local-staging-privacy-notice-v1',
    PRIVACY_RETENTION_EXECUTION_ENABLED: 'false',
    PRIVACY_RETENTION_POLICY_JSON: retentionPolicy,
    PRIVACY_RETENTION_BATCH_SIZE: '25',
    PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: privacyPermissionGrants,
    ADMIN_ROLE_GRANTS_JSON: adminRoleGrants,
    COUNSELLOR_ONBOARDING_CONSENT_VERSION:
      'synthetic-local-staging-counsellor-consent-v1',
    COUNSELLOR_CREDENTIAL_POLICY_VERSION:
      'synthetic-local-staging-credential-policy-v1',
    COUNSELLOR_ONBOARDING_NOTICE_URL:
      'https://notice.staging.menorah-synthetic.internal/onboarding',
    SECURITY_AUDIT_PENDING_MAX: '1024',

    MEDIA_STORAGE_BACKEND: 'local',
    MEDIA_PUBLIC_BASE_URL: apiWebOrigin,
    UPLOAD_PATH: '/app/uploads',
    SERVER_USAGE_LABEL: 'Synthetic local Docker staging',
    SERVER_USAGE_PATH: '/app/uploads',
    MENORAH_DATA_ROOT: '/var/lib/menorah-local-staging',
    MENORAH_BACKUP_ROOT: '/backups',
    MENORAH_SECRETS_ROOT: '/run/secrets',

    BOOKING_PAYMENTS_ENABLED: 'false',
    PAYOUTS_ENABLED: 'false',
    SUBSCRIPTION_PAYMENTS_ENABLED: 'false',
    PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS: '',
    BOOKING_SERVICE_CATALOG_JSON: bookingCatalog,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: secrets.RAZORPAY_KEY_ID,
    RAZORPAY_WEBHOOK_SECRET_PREVIOUS: '',
    RAZORPAY_PAYOUT_ACCOUNT_NUMBER: '1000000000000000',

    RESEND_PROVIDER_ENABLED: 'false',
    RESEND_API_URL: 'http://mail-capture:8025/emails',
    RESEND_API_KEY: secrets.RESEND_API_KEY,
    EMAIL_FROM: 'Menorah Synthetic <noreply@mail.staging.localhost>',
    CONTACT_TO_EMAIL: 'sink@mail.staging.localhost',

    LIVEKIT_UPSTREAM: 'http://livekit:7880',
    LIVEKIT_URL: `wss://${STAGING_DOMAINS.CALLS_DOMAIN}:${HTTPS_PORT}`,
    LIVEKIT_API_URL: 'http://livekit:7880',
    LIVEKIT_CONFIG_FILE: '/etc/livekit/livekit.yaml',
    LIVEKIT_RTC_TCP_PORT: '27881',
    LIVEKIT_RTC_UDP_PORT_RANGE: '25000-25100',
    CALLING_REGION_MODE: 'hybrid',
    LIVEKIT_BLOCKED_COUNTRIES: 'AE',
    BLOCKED_COUNTRY_CALL_PROVIDER: 'zoom',
    BLOCK_LIVEKIT_FOR_UAE: 'true',
    BLOCK_LIVEKIT_FOR_UNKNOWN_REGION: 'false',
    UAE_CALL_PROVIDER: 'zoom',
    UAE_CALLING_ENABLED: 'false',
    VSEE_ENABLED: 'false',
    DOXY_ENABLED: 'false',
    ZOOM_ENABLED: 'false',
    GOOGLE_MEET_ENABLED: 'false',
    TEAMS_ENABLED: 'false',

    APPLE_SIGN_IN_ENABLED: 'false',
    APPLE_IOS_BUNDLE_ID: '',
    APPLE_WEB_SERVICE_ID: '',
    APPLE_TEAM_ID: '',
    APPLE_KEY_ID: '',
    APPLE_PRIVATE_KEY: '',
    GOOGLE_WEB_CLIENT_ID: '',
    GOOGLE_IOS_CLIENT_ID: '',
    GOOGLE_ANDROID_CLIENT_ID: '',
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: '',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '',
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: '',
    EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: '',

    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    LUXAND_API_TOKEN: '',
    LUXAND_DETECT_URL: '',
    OPENAI_API_KEY: '',
    SOCIAL_STUDIO_OPENAI_API_KEY: '',
    SOCIAL_TOKEN_ENCRYPTION_KEY: '',
    META_APP_ID: '',
    META_APP_SECRET: '',
    SOCIAL_STUDIO_ENABLED: 'false',
    SOCIAL_STUDIO_AUTO_PUBLISH: 'false',
    ENABLE_SOCIAL_SCHEDULER: 'false',
    AI_PROVIDER: 'local_stub',
    AI_MOCK_MODE: 'true',

    ENABLE_SOCKET_IO: 'true',
    ENABLE_SOCKET_ADAPTER: 'true',
    WORKER_MODE: 'active',
    ENABLE_ARTICLE_SCHEDULER: 'false',
    ENABLE_BACKUP_JOBS: 'false',
    ENABLE_EMAIL_JOBS: 'false',
    ENABLE_NOTIFICATION_JOBS: 'false',

    BACKUP_AUTOMATION_ENABLED: 'false',
    BACKUP_REQUIRE_MOUNT: 'false',
    BACKUP_REQUIRE_ENCRYPTION: 'true',
    BACKUP_EXPECT_RAID: 'false',
    BACKUP_RAID_DEVICE: '',
    BACKUP_METRICS_RUN_AS: '1000:1000',
    BACKUP_STATUS_GROUP: '',
    BACKUP_MAX_AGE_HOURS: '24',
    BACKUP_MIN_SIZE_BYTES: '1024',
    BACKUP_DISK_USAGE_MAX_PERCENT: '80',
    BACKUP_INTEGRITY_EPOCH_ID: 'local-staging-initial-epoch',
    BACKUP_WEEKLY_MAX_AGE_HOURS: '192',
    BACKUP_RESTORE_TEST_MAX_AGE_HOURS: '24',
    BACKUP_COLD_STORAGE_LABEL: 'Synthetic local retrieval volume',
    BACKUP_HEALTH_PUSH_URL: '',

    ALERTMANAGER_CONFIG_FILE: '/etc/alertmanager/alertmanager.yml',
    ALERTMANAGER_CONFIG_SHA256: alertmanagerDigest,
    ALERTMANAGER_DELIVERY_RECEIVER: 'local-synthetic-sink',
    ALERTMANAGER_DELIVERY_VERIFIED_AT: '1970-01-01T00:00:00Z',
    ALERTMANAGER_DELIVERY_TEST_REFERENCE: 'local-synthetic-only',

    CADDY_HTTP_PORT: '',
    CADDY_HTTPS_PORT: '127.0.0.1:28443',
    API_IOS_LOCAL_PORT: '127.0.0.1:28080',
    API_ANDROID_LOCAL_PORT: '127.0.0.1:28081',
    API_WEB_LOCAL_PORT: '127.0.0.1:28082',
    API_ADMIN_LOCAL_PORT: '127.0.0.1:28083',
    WORKER_LOCAL_PORT: '127.0.0.1:28084',
    WEB_APP_LOCAL_PORT: '127.0.0.1:23001',
    USER_WEB_APP_LOCAL_PORT: '127.0.0.1:23002',
    ADMIN_PANEL_LOCAL_PORT: '127.0.0.1:23003',
    LIVEKIT_LOCAL_PORT: '127.0.0.1:27880',
    LIVEKIT_RTC_TCP_LOCAL_PORT: '127.0.0.1:27881',
    PROMETHEUS_LOCAL_PORT: '127.0.0.1:29090',
    ALERTMANAGER_LOCAL_PORT: '127.0.0.1:29093',
    LOKI_LOCAL_PORT: '127.0.0.1:23100',
    ALLOY_LOCAL_PORT: '127.0.0.1:22345',
  };

  const values = Object.fromEntries(
    contractKeys.map((key) => [key, overrides[key] ?? '']),
  );
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(values, key)) values[key] = value;
  }

  assertDistinctSecretValues(values);
  return values;
};

export const serializeEnvironment = (values) => {
  const lines = [
    '# Generated synthetic local staging configuration.',
    '# Contains credentials. Do not commit, print, or reuse.',
  ];

  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new Error(`Unsafe environment key: ${key}`);
    }
    lines.push(`${key}=${JSON.stringify(String(value))}`);
  }

  return `${lines.join('\n')}\n`;
};

export const assertGeneratedTargetsAbsent = async (targets) => {
  const existingTargets = [];
  for (const target of targets) {
    let metadata;
    try {
      metadata = await lstat(target);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`Refusing unsafe generated target: ${target}`);
    }
    existingTargets.push(target);
  }

  if (existingTargets.length > 0) {
    throw new Error(
      'Refusing to rotate existing local staging credentials or backup keys',
    );
  }
};

const writePrivateFile = async (target, contents, mode) => {
  try {
    await writeFile(target, contents, {
      flag: 'wx',
      mode,
    });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        'Refusing to rotate existing local staging credentials or backup keys',
      );
    }
    throw error;
  }
  await chmod(target, mode);
};

const readOptionalDigest = async (target) => {
  try {
    return sha256(await readFile(target));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sha256('local-staging-alertmanager-not-present');
    }
    throw error;
  }
};

const readCleanRuntimeCandidate = async () => {
  const [{ stdout: headOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    }),
    execFileAsync(
      'git',
      ['status', '--porcelain', '--untracked-files=all'],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
      },
    ),
  ]);
  const runtimeCandidateSha = headOutput.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(runtimeCandidateSha)) {
    throw new Error('Git HEAD did not resolve to a commit SHA');
  }
  if (statusOutput.trim()) {
    throw new Error(
      'Refusing to generate local staging credentials from a dirty runtime tree',
    );
  }
  return runtimeCandidateSha;
};

export const generateEnvironmentArtifacts = async ({
  contractFile = CONTRACT_FILE,
  generatedDirectory = GENERATED_DIRECTORY,
  environmentFile = DEFAULT_ENVIRONMENT_FILE,
  mongoKeyfile = DEFAULT_MONGO_KEYFILE,
  backupPasswordFile = DEFAULT_BACKUP_PASSWORD_FILE,
  backupHmacFile = DEFAULT_BACKUP_HMAC_FILE,
  randomBytesFunction = randomBytes,
} = {}) => {
  await mkdir(generatedDirectory, {
    recursive: true,
    mode: 0o700,
  });
  const directoryMetadata = await lstat(generatedDirectory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new Error(
      `Refusing unsafe generated directory: ${generatedDirectory}`,
    );
  }
  await assertGeneratedTargetsAbsent([
    environmentFile,
    mongoKeyfile,
    backupPasswordFile,
    backupHmacFile,
  ]);

  const contractSource = await readFile(contractFile, 'utf8');
  const contractKeys = parseContractKeys(contractSource);
  const mongoKeyfileContents = randomBytesFunction(756).toString('base64');
  const runtimeCandidateSha = await readCleanRuntimeCandidate();
  const values = buildEnvironmentValues({
    contractKeys,
    environmentFile,
    mongoKeyfile,
    backupPasswordFile,
    backupHmacFile,
    runtimeCandidateSha,
    alertmanagerDigest: await readOptionalDigest(ALERTMANAGER_FILE),
    randomBytesFunction,
  });
  assertDistinctSecretValues(values, SECRET_VALUE_KEYS, [
    mongoKeyfileContents,
  ]);

  const serializedEnvironment = serializeEnvironment(values);
  await writePrivateFile(environmentFile, serializedEnvironment, 0o600);
  await writePrivateFile(mongoKeyfile, mongoKeyfileContents, 0o400);
  await writePrivateFile(
    backupPasswordFile,
    values.BACKUP_ENCRYPTION_PASSWORD,
    0o400,
  );
  await writePrivateFile(
    backupHmacFile,
    values.BACKUP_INTEGRITY_HMAC_KEY,
    0o400,
  );

  return Object.freeze({
    project: PROJECT_NAME,
    runtimeCandidateSha,
    environmentFile: slashPath(environmentFile),
    environmentSha256: sha256(serializedEnvironment),
    mongoKeyfile: slashPath(mongoKeyfile),
    mongoKeyfileSha256: sha256(mongoKeyfileContents),
    backupPasswordFile: slashPath(backupPasswordFile),
    backupPasswordFileSha256: sha256(values.BACKUP_ENCRYPTION_PASSWORD),
    backupHmacFile: slashPath(backupHmacFile),
    backupHmacFileSha256: sha256(values.BACKUP_INTEGRITY_HMAC_KEY),
    contractFile: slashPath(contractFile),
    contractSha256: sha256(contractSource),
    contractKeyCount: contractKeys.length,
    syntheticOnly: true,
    optionalProvidersEnabled: false,
  });
};

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    const metadata = await generateEnvironmentArtifacts();
    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `Local staging environment generation failed: ${error.message}\n`,
    );
    process.exitCode = 1;
  }
}
