#!/usr/bin/env node

import {
  createHash,
  randomBytes,
} from 'node:crypto';
import { execFile } from 'node:child_process';
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
import { promisify } from 'node:util';

export const VALIDATION_PROJECT = 'menorah-server-staging-validation';
export const VALIDATION_RESOURCE_PREFIX =
  'menorah-server-staging-validation';
export const ENVIRONMENT_ID = 'menorah-server-staging-v1';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..', '..');
const CONTRACT_FILE = path.resolve(
  MODULE_DIRECTORY,
  '..',
  'env',
  'server-staging.env.example',
);
const DEFAULT_GENERATED_DIRECTORY = path.join(
  MODULE_DIRECTORY,
  'generated',
);
const execFileAsync = promisify(execFile);

const HOSTS = Object.freeze({
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

export const SECRET_KEYS = Object.freeze([
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
  'MENORAH_SERVER_STAGING_USER_A_PASSWORD',
  'MENORAH_SERVER_STAGING_USER_B_PASSWORD',
  'MENORAH_SERVER_STAGING_COUNSELLOR_A_PASSWORD',
  'MENORAH_SERVER_STAGING_COUNSELLOR_DRAFT_PASSWORD',
  'MENORAH_SERVER_STAGING_COUNSELLOR_SUSPENDED_PASSWORD',
  'MENORAH_SERVER_STAGING_ADMIN_SUPPORT_PASSWORD',
  'MENORAH_SERVER_STAGING_ADMIN_FINANCE_PASSWORD',
  'MENORAH_SERVER_STAGING_ADMIN_CONTENT_PASSWORD',
  'MENORAH_SERVER_STAGING_ADMIN_FULL_1_PASSWORD',
  'MENORAH_SERVER_STAGING_ADMIN_FULL_2_PASSWORD',
]);

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

const SYNTHETIC_PRIVACY_ADMIN_ID = '7a110ca15a6e000000000104';

const REQUIRED_CONTRACT_KEYS = Object.freeze([
  'NODE_ENV',
  'DEPLOYMENT_ENVIRONMENT',
  'MENORAH_SERVER_STAGING_PROJECT_NAME',
  'MENORAH_SERVER_STAGING_RESOURCE_PREFIX',
  'MENORAH_SERVER_STAGING_ENVIRONMENT_ID',
  'MENORAH_RUNTIME_CANDIDATE_SHA',
  'MENORAH_SERVER_STAGING_ROOT',
  'MENORAH_SERVER_STAGING_DATA_ROOT',
  'MENORAH_SERVER_STAGING_BACKUP_ROOT',
  'MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT',
  'MENORAH_SERVER_STAGING_LOGS_ROOT',
  'MENORAH_SERVER_STAGING_ENV_ROOT',
  'MENORAH_SERVER_STAGING_APP_ROOT',
  'MONGO_DATABASE',
  'MONGODB_REPLICA_SET_NAME',
  'REDIS_STAGING_USERNAME',
  'REDIS_STAGING_PASSWORD',
  'KYC_CONSENT_VERSION',
  'PRIVACY_RETENTION_POLICY_JSON',
  'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON',
  'PROMETHEUS_EXTERNAL_ENVIRONMENT',
  'ALERTMANAGER_ENVIRONMENT',
]);

const sha256 = (value) => (
  createHash('sha256').update(value).digest('hex')
);

const slashPath = (value) => path.resolve(value).replaceAll('\\', '/');

const randomToken = (length, randomBytesFunction) => (
  randomBytesFunction(length).toString('hex')
);

const strongPassword = (randomBytesFunction) => (
  `Aa1!${randomToken(36, randomBytesFunction)}`
);

export const parseContractKeys = (source) => {
  const keys = [];
  const seen = new Set();
  for (const line of String(source).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    keys.push(match[1]);
  }
  return keys;
};

export const assertDistinctSecrets = (
  values,
  additionalValues = [],
) => {
  const candidates = [
    ...SECRET_KEYS.map((key) => values[key]),
    ...additionalValues,
  ];
  if (
    candidates.some(
      (value) => typeof value !== 'string' || value.length < 16,
    )
    || new Set(candidates).size !== candidates.length
  ) {
    throw new Error(
      'Synthetic staging credentials must be present, long, and unique',
    );
  }
};

const retentionPolicy = JSON.stringify({
  version: 'synthetic-server-staging-retention-v1',
  categories: Object.fromEntries(RETENTION_CATEGORIES.map((category) => [
    category,
    {
      mode: 'manual',
      policyReference:
        `synthetic-server-staging-${category}-manual-v1`,
    },
  ])),
});

const privacyPermissionGrants = JSON.stringify([{
  adminId: SYNTHETIC_PRIVACY_ADMIN_ID,
  permissions: [
    'privacy_reader',
    'privacy_reviewer',
    'privacy_legal_hold',
  ],
}]);

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
});

export const buildValidationEnvironment = ({
  candidateSha,
  contractKeys,
  generatedDirectory = DEFAULT_GENERATED_DIRECTORY,
  randomBytesFunction = randomBytes,
} = {}) => {
  if (!/^[a-f0-9]{40}$/.test(String(candidateSha || ''))) {
    throw new Error(
      'A lowercase 40-character runtime candidate SHA is required',
    );
  }
  if (!Array.isArray(contractKeys) || contractKeys.length === 0) {
    throw new Error('The tracked server-staging environment contract is empty');
  }
  const missing = REQUIRED_CONTRACT_KEYS.filter(
    (key) => !contractKeys.includes(key),
  );
  if (missing.length > 0) {
    throw new Error(
      `The server-staging contract is missing: ${missing.join(', ')}`,
    );
  }

  const envFile = path.join(
    generatedDirectory,
    'server-staging-validation.env',
  );
  const mongoKeyfile = path.join(generatedDirectory, 'mongo-keyfile');
  const backupPasswordFile = path.join(
    generatedDirectory,
    'backup-encryption-password',
  );
  const backupHmacFile = path.join(
    generatedDirectory,
    'backup-integrity-hmac-key',
  );
  const hostRoot = path.join(generatedDirectory, 'host');
  const hostDataRoot = path.join(hostRoot, 'data');
  const hostBackupRoot = path.join(hostRoot, 'backups');
  const hostStateRoot = path.join(hostRoot, 'deploy-state');
  const hostLogsRoot = path.join(hostRoot, 'logs');
  const hostEnvRoot = path.join(hostRoot, 'env');
  const hostAppRoot = path.join(hostRoot, 'app');
  const disabled = 'disabled-for-synthetic-server-staging';

  const secrets = Object.fromEntries(
    SECRET_KEYS.map((key) => [
      key,
      key.includes('_PASSWORD')
        ? strongPassword(randomBytesFunction)
        : randomToken(48, randomBytesFunction),
    ]),
  );
  secrets.RAZORPAY_KEY_ID =
    `rzp_test_${randomBytesFunction(12).toString('hex')}`;
  secrets.RAZORPAY_X_KEY_ID =
    `rzp_test_${randomBytesFunction(12).toString('hex')}`;
  secrets.RESEND_API_KEY =
    `re_server_staging_${randomToken(32, randomBytesFunction)}`;
  secrets.LIVEKIT_API_KEY =
    randomBytesFunction(16).toString('hex');

  const localHttpsPort = '38443';
  const localHttpsOrigin = (hostname) => (
    `https://${hostname}:${localHttpsPort}`
  );
  const appOrigin = localHttpsOrigin(HOSTS.APP_DOMAIN);
  const adminOrigin = localHttpsOrigin(HOSTS.ADMIN_DOMAIN);
  const counsellorOrigin = localHttpsOrigin(HOSTS.COUNSELLOR_DOMAIN);
  const webOrigin = localHttpsOrigin(HOSTS.WWW_DOMAIN);
  const apiWebOrigin = localHttpsOrigin(HOSTS.API_WEB_DOMAIN);
  const apiAdminOrigin = localHttpsOrigin(HOSTS.API_ADMIN_DOMAIN);
  const mongoAuthority = 'staging-mongo-primary:27017';
  const restoreAuthority = 'staging-mongo-restore:27017';
  const database = 'menorah_staging';
  const replicaSet = 'menorah-staging-rs';
  const restoreReplicaSet = 'menorah-staging-restore-rs';
  const encode = encodeURIComponent;

  const values = {
    ...Object.fromEntries(contractKeys.map((key) => [key, disabled])),
    ...HOSTS,
    ...secrets,

    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SERVICE_RUNTIME: 'server-staging',
    MENORAH_SYNTHETIC_DATA_ONLY: 'true',
    COMPOSE_PROJECT_NAME: VALIDATION_PROJECT,
    MENORAH_SERVER_STAGING_PROJECT_NAME: VALIDATION_PROJECT,
    MENORAH_SERVER_STAGING_RESOURCE_PREFIX: VALIDATION_RESOURCE_PREFIX,
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID: ENVIRONMENT_ID,
    MENORAH_RUNTIME_CANDIDATE_SHA: candidateSha,
    MENORAH_SERVER_STAGING_RUNTIME_SHA: candidateSha,
    MENORAH_SERVER_STAGING_SEED_CONFIRM:
      'CREATE_SYNTHETIC_ROSTER_ONLY_IN_MENORAH_SERVER_STAGING_V1',
    MENORAH_STAGING_ALLOWED_HOSTS: Object.values(HOSTS).join(','),
    MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.menorah.me',

    MENORAH_SERVER_STAGING_ROOT: slashPath(hostRoot),
    MENORAH_SERVER_STAGING_DATA_ROOT: slashPath(hostDataRoot),
    MENORAH_SERVER_STAGING_BACKUP_ROOT: slashPath(hostBackupRoot),
    MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT: slashPath(hostStateRoot),
    MENORAH_SERVER_STAGING_LOGS_ROOT: slashPath(hostLogsRoot),
    MENORAH_SERVER_STAGING_ENV_ROOT: slashPath(hostEnvRoot),
    MENORAH_SERVER_STAGING_APP_ROOT: slashPath(hostAppRoot),
    MENORAH_DATA_ROOT: slashPath(hostDataRoot),
    MENORAH_BACKUP_ROOT: slashPath(hostBackupRoot),
    MENORAH_DEPLOY_STATE_ROOT: slashPath(hostStateRoot),
    MENORAH_LOG_ROOT: slashPath(hostLogsRoot),
    MENORAH_ENV_ROOT: slashPath(hostEnvRoot),
    MENORAH_APP_ROOT: slashPath(hostAppRoot),
    MENORAH_RESTORE_ROOT: slashPath(path.join(hostDataRoot, 'restore')),
    MENORAH_RETRIEVAL_ROOT: slashPath(
      path.join(hostDataRoot, 'backup-retrieval'),
    ),
    MENORAH_MIGRATION_TEMP_ROOT: slashPath(
      path.join(hostDataRoot, 'migration-tmp'),
    ),
    MENORAH_SERVER_STAGING_ENV_FILE: slashPath(envFile),
    MENORAH_SERVER_STAGING_MONGO_KEYFILE: slashPath(mongoKeyfile),
    MENORAH_SERVER_STAGING_BACKUP_PASSWORD_FILE:
      slashPath(backupPasswordFile),
    MENORAH_SERVER_STAGING_BACKUP_HMAC_FILE:
      slashPath(backupHmacFile),

    PUBLIC_EMAIL: 'staging-operator@mail.staging.menorah.me',
    EMAIL_FROM:
      'Menorah Synthetic Staging <noreply@mail.staging.menorah.me>',
    CONTACT_TO_EMAIL: 'sink@mail.staging.menorah.me',
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
    MENORAH_API_BASE_URL: 'http://staging-api-web:8080/api',
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
    COUNSELLOR_ONBOARDING_NOTICE_URL:
      `${counsellorOrigin}/onboarding/privacy`,

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
    LIVEKIT_RTC_TCP_PORT: '37881',
    PROMETHEUS_LOCAL_PORT: '127.0.0.1:39090',
    ALERTMANAGER_LOCAL_PORT: '127.0.0.1:39093',
    LOKI_LOCAL_PORT: '127.0.0.1:33100',
    ALLOY_LOCAL_PORT: '127.0.0.1:32345',
    MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
    MENORAH_SERVER_STAGING_TUNNEL_ORIGIN_PORT: '38000',
    MENORAH_SERVER_STAGING_BACKEND_IMAGE:
      'menorah-server-staging-validation/backend:runtime',
    MENORAH_SERVER_STAGING_USER_WEB_IMAGE:
      'menorah-server-staging-validation/user-web:runtime',
    MENORAH_SERVER_STAGING_COUNSELLOR_WEB_IMAGE:
      'menorah-server-staging-validation/counsellor-web:runtime',
    MENORAH_SERVER_STAGING_ADMIN_PANEL_IMAGE:
      'menorah-server-staging-validation/admin-panel:runtime',
    MENORAH_SERVER_STAGING_MAIL_CAPTURE_IMAGE:
      'menorah-server-staging-validation/mail-capture:runtime',
    MENORAH_SERVER_STAGING_ALERT_FIXTURE_IMAGE:
      'menorah-server-staging-validation/alert-fixture:runtime',
    MENORAH_SERVER_STAGING_MONGODB_EXPORTER_IMAGE:
      'menorah-server-staging-validation/mongodb-exporter:runtime',
    MENORAH_SERVER_STAGING_REDIS_EXPORTER_IMAGE:
      'menorah-server-staging-validation/redis-exporter:runtime',
    MENORAH_SERVER_STAGING_LOKI_IMAGE:
      'menorah-server-staging-validation/loki:runtime',
    MENORAH_SERVER_STAGING_ALLOY_IMAGE:
      'menorah-server-staging-validation/alloy:runtime',
    MENORAH_SERVER_STAGING_BACKUP_TOOLS_IMAGE:
      'menorah-server-staging-validation/backup-tools:runtime',

    MONGO_STAGING_ROOT_USER: 'menorah-staging-root',
    MONGO_STAGING_APP_USER: 'menorah-staging-app',
    MONGO_STAGING_MIGRATION_USER: 'menorah-staging-migration',
    MONGO_STAGING_BACKUP_USER: 'menorah-staging-backup',
    MONGO_STAGING_RESTORE_USER: 'menorah-staging-restore',
    MONGO_STAGING_MONITOR_USER: 'menorah-staging-monitor',
    MONGO_DATABASE: database,
    MONGO_RESTORE_DATABASE: database,
    MONGODB_REPLICA_SET_NAME: replicaSet,
    MONGODB_RESTORE_REPLICA_SET_NAME: restoreReplicaSet,
    MONGODB_READ_PREFERENCE: 'primaryPreferred',
    MONGODB_RETRY_WRITES: 'true',
    MONGODB_URI:
      `mongodb://${valuesOr(secrets, 'MONGO_STAGING_APP_USER', 'menorah-staging-app')}:`
      + `${encode(secrets.MONGO_STAGING_APP_PASSWORD)}@${mongoAuthority}/`
      + `${database}?replicaSet=${replicaSet}&authSource=admin&retryWrites=true`,
    MONGODB_MIGRATION_URI:
      `mongodb://menorah-staging-migration:`
      + `${encode(secrets.MONGO_STAGING_MIGRATION_PASSWORD)}@`
      + `${mongoAuthority}/${database}?replicaSet=${replicaSet}`
      + '&authSource=admin&retryWrites=true',
    MONGODB_BACKUP_URI:
      `mongodb://menorah-staging-backup:`
      + `${encode(secrets.MONGO_STAGING_BACKUP_PASSWORD)}@`
      + `${mongoAuthority}/${database}?replicaSet=${replicaSet}`
      + '&authSource=admin',
    MONGODB_STAGING_BACKUP_URI:
      `mongodb://menorah-staging-backup:`
      + `${encode(secrets.MONGO_STAGING_BACKUP_PASSWORD)}@`
      + `${mongoAuthority}/${database}?replicaSet=${replicaSet}`
      + '&authSource=admin',
    MONGODB_RESTORE_URI:
      `mongodb://menorah-staging-restore:`
      + `${encode(secrets.MONGO_STAGING_RESTORE_PASSWORD)}@`
      + `${restoreAuthority}/${database}?replicaSet=${restoreReplicaSet}`
      + '&authSource=admin',
    MONGODB_STAGING_RESTORE_URI:
      `mongodb://menorah-staging-restore:`
      + `${encode(secrets.MONGO_STAGING_RESTORE_PASSWORD)}@`
      + `${restoreAuthority}/${database}?replicaSet=${restoreReplicaSet}`
      + '&authSource=admin',
    MONGODB_MONITORING_URI:
      `mongodb://menorah-staging-monitor:`
      + `${encode(secrets.MONGO_STAGING_MONITOR_PASSWORD)}@`
      + `${mongoAuthority}/admin?replicaSet=${replicaSet}`
      + '&authSource=admin',
    MONGODB_RESTORE_TEST_URI:
      `mongodb://menorah-staging-restore:`
      + `${encode(secrets.MONGO_STAGING_RESTORE_PASSWORD)}@`
      + `${restoreAuthority}/${database}?replicaSet=${restoreReplicaSet}`
      + '&authSource=admin',
    MONGO_KEYFILE_PATH: '/run/secrets/mongo-keyfile',

    REDIS_STAGING_USERNAME: 'menorah-staging-app',
    REDIS_URL:
      `redis://menorah-staging-app:${encode(secrets.REDIS_STAGING_PASSWORD)}`
      + '@staging-redis:6379/0',
    REDIS_MONITORING_URL:
      `redis://menorah-staging-app:${encode(secrets.REDIS_STAGING_PASSWORD)}`
      + '@staging-redis:6379/0',

    JWT_ISSUER: 'menorah-server-staging-api',
    JWT_EXPIRES_IN: '7d',
    JWT_REFRESH_EXPIRES_IN: '30d',
    ADMIN_JWT_EXPIRES_IN: '30m',
    ADMIN_MFA_REQUIRED: 'true',
    ENABLE_SOCKET_IO: 'true',
    ENABLE_SOCKET_ADAPTER: 'true',
    WORKER_MODE: 'active',
    ENABLE_ARTICLE_SCHEDULER: 'false',
    ENABLE_SOCIAL_SCHEDULER: 'false',
    ENABLE_BACKUP_JOBS: 'false',
    ENABLE_EMAIL_JOBS: 'false',
    ENABLE_NOTIFICATION_JOBS: 'false',

    MEDIA_STORAGE_BACKEND: 'local',
    MEDIA_STORAGE_BUCKET: 'menorah-staging',
    MEDIA_PUBLIC_BASE_URL: apiWebOrigin,
    UPLOAD_PATH: '/app/uploads',
    SERVER_USAGE_LABEL: 'Synthetic isolated server staging',
    SERVER_USAGE_PATH: '/app/uploads',

    LIVEKIT_UPSTREAM: 'http://staging-livekit:7880',
    LIVEKIT_URL:
      `wss://${HOSTS.CALLS_DOMAIN}:${localHttpsPort}`,
    LIVEKIT_API_URL: 'http://staging-livekit:7880',
    LIVEKIT_CONFIG_FILE: '/etc/livekit/livekit.yaml',
    LIVEKIT_NODE_IP: '127.0.0.1',
    CALLING_REGION_MODE: 'hybrid',
    LIVEKIT_BLOCKED_COUNTRIES: 'AE',
    BLOCKED_COUNTRY_CALL_PROVIDER: 'zoom',
    BLOCK_LIVEKIT_FOR_UAE: 'true',
    BLOCK_LIVEKIT_FOR_UNKNOWN_REGION: 'false',
    UAE_CALL_PROVIDER: 'zoom',
    UAE_CALLING_ENABLED: 'false',
    VSEE_ENABLED: 'false',
    VSEE_INTEGRATION_MODE: 'external_link',
    DOXY_ENABLED: 'false',
    ZOOM_ENABLED: 'false',
    GOOGLE_MEET_ENABLED: 'false',
    TEAMS_ENABLED: 'false',

    BOOKING_PAYMENTS_ENABLED: 'false',
    PAYOUTS_ENABLED: 'false',
    SUBSCRIPTION_PAYMENTS_ENABLED: 'false',
    RAZORPAY_MODE: 'test',
    RAZORPAY_X_MODE: 'test',
    NEXT_PUBLIC_RAZORPAY_KEY_ID: secrets.RAZORPAY_KEY_ID,
    RAZORPAY_PAYOUT_ACCOUNT_NUMBER: '1000000000000000',
    PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS: '5',
    MAX_PAYOUT_AMOUNT_PAISE: '5000000',
    RESEND_PROVIDER_ENABLED: 'false',
    RESEND_MODE: 'sandbox',
    RESEND_API_URL: 'http://staging-mail-capture:8025/emails',
    EMAIL_FROM:
      'Menorah Synthetic Staging <noreply@mail.staging.menorah.me>',
    CONTACT_TO_EMAIL: 'sink@mail.staging.menorah.me',

    APPLE_SIGN_IN_ENABLED: 'false',
    APPLE_IOS_BUNDLE_ID: 'com.menorah.health.serverstaging',
    APPLE_WEB_SERVICE_ID: disabled,
    APPLE_TEAM_ID: disabled,
    APPLE_KEY_ID: disabled,
    APPLE_PRIVATE_KEY: disabled,
    GOOGLE_WEB_CLIENT_ID: disabled,
    GOOGLE_IOS_CLIENT_ID: disabled,
    GOOGLE_ANDROID_CLIENT_ID: disabled,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: disabled,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: disabled,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: disabled,
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: disabled,
    EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: disabled,
    CLOUDINARY_CLOUD_NAME: disabled,
    CLOUDINARY_API_KEY: disabled,
    CLOUDINARY_API_SECRET: disabled,
    CLOUDINARY_UPLOAD_PREFIX: 'menorah-staging',
    LUXAND_API_TOKEN: disabled,
    LUXAND_DETECT_URL: disabled,
    OPENAI_API_KEY: disabled,
    SOCIAL_STUDIO_OPENAI_API_KEY: disabled,
    SOCIAL_TOKEN_ENCRYPTION_KEY: disabled,
    META_APP_ID: disabled,
    META_APP_SECRET: disabled,
    SOCIAL_STUDIO_ENABLED: 'false',
    SOCIAL_STUDIO_AUTO_PUBLISH: 'false',

    MENORAH_STAGING_TUNNEL_ENABLED: 'false',
    CLOUDFLARE_TUNNEL_ENVIRONMENT: 'staging',
    CLOUDFLARE_TUNNEL_ID: disabled,
    CLOUDFLARE_ACCOUNT_ID: disabled,
    CLOUDFLARE_TUNNEL_CREDENTIAL_FILE: slashPath(
      path.join(hostEnvRoot, 'cloudflared-staging-credentials.json'),
    ),

    BACKUP_AUTOMATION_ENABLED: 'false',
    BACKUP_REQUIRE_MOUNT: 'false',
    BACKUP_REQUIRE_ENCRYPTION: 'true',
    BACKUP_EXPECT_RAID: 'false',
    BACKUP_RAID_DEVICE: disabled,
    BACKUP_METRICS_RUN_AS: '1000:1000',
    BACKUP_STATUS_GROUP: VALIDATION_PROJECT,
    BACKUP_MAX_AGE_HOURS: '24',
    BACKUP_MIN_SIZE_BYTES: '1024',
    BACKUP_DISK_USAGE_MAX_PERCENT: '80',
    BACKUP_RESTORE_TEST_MAX_AGE_HOURS: '24',
    BACKUP_COLD_STORAGE_LABEL:
      'Synthetic isolated server staging retrieval',
    BACKUP_HEALTH_PUSH_URL: disabled,
    BACKUP_METADATA_FILE: slashPath(
      path.join(hostBackupRoot, '.metadata.json'),
    ),
    BACKUP_LOCK_FILE: slashPath(
      path.join(hostBackupRoot, '.backup.lock'),
    ),
    BACKUP_RESTORE_ACKNOWLEDGEMENT:
      'RESTORE_ONLY_MENORAH_SERVER_STAGING',

    MENORAH_CURRENT_SHA_FILE: slashPath(
      path.join(hostStateRoot, 'current-sha'),
    ),
    MENORAH_LAST_GOOD_SHA_FILE: slashPath(
      path.join(hostStateRoot, 'last-good-sha'),
    ),
    MENORAH_MIGRATION_APPLIED_MARKER: slashPath(
      path.join(hostStateRoot, 'migration-applied-sha'),
    ),
    MENORAH_MIGRATION_IN_PROGRESS_MARKER: slashPath(
      path.join(hostStateRoot, 'migration-in-progress-sha'),
    ),
    MENORAH_IDENTITY_RECONCILIATION_MARKER: slashPath(
      path.join(
        hostStateRoot,
        'mongo-identity-reconciliation-in-progress-sha',
      ),
    ),
    MENORAH_POST_MIGRATION_RECOVERY_MARKER: slashPath(
      path.join(hostStateRoot, 'post-migration-recovery-sha'),
    ),
    MENORAH_DEPLOY_LOCK_FILE: slashPath(
      path.join(hostStateRoot, '.deploy.lock'),
    ),
    MENORAH_ROLLBACK_LOCK_FILE: slashPath(
      path.join(hostStateRoot, '.rollback.lock'),
    ),

    PROMETHEUS_EXTERNAL_ENVIRONMENT: 'staging',
    PROMETHEUS_EXTERNAL_PROJECT: VALIDATION_PROJECT,
    ALERTMANAGER_ENVIRONMENT: 'staging',
    ALERTMANAGER_RECEIVER: 'staging-unconfigured-destination',
    ALERTMANAGER_CONFIG_FILE:
      '/etc/alertmanager/alertmanager.yml',
    ALERTMANAGER_CONFIG_SHA256: sha256(
      'synthetic-server-staging-alertmanager',
    ),
    ALERTMANAGER_DELIVERY_RECEIVER:
      'staging-unconfigured-destination',
    ALERTMANAGER_DELIVERY_VERIFIED_AT: '1970-01-01T00:00:00Z',
    ALERTMANAGER_DELIVERY_TEST_REFERENCE:
      'synthetic-server-staging-only',

    PRIVACY_RETENTION_EXECUTION_ENABLED: 'false',
    PRIVACY_RETENTION_BATCH_SIZE: '25',
    PRIVACY_RETENTION_POLICY_JSON: retentionPolicy,
    PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: privacyPermissionGrants,
    ADMIN_ROLE_GRANTS_JSON: JSON.stringify([]),
    BOOKING_SERVICE_CATALOG_JSON: bookingCatalog,
    KYC_CONSENT_VERSION: 'ordinary-face-check-v1-2026-07-22',
    KYC_RETENTION_DAYS: '365',
    PRIVACY_NOTICE_VERSION:
      'synthetic-server-staging-privacy-notice-v1',
    COUNSELLOR_ONBOARDING_CONSENT_VERSION:
      'synthetic-server-staging-counsellor-consent-v1',
    COUNSELLOR_CREDENTIAL_POLICY_VERSION:
      'synthetic-server-staging-credential-policy-v1',
    SECURITY_AUDIT_PENDING_MAX: '1024',
  };

  assertDistinctSecrets(values);
  return Object.freeze({
    values,
    paths: Object.freeze({
      envFile,
      mongoKeyfile,
      backupPasswordFile,
      backupHmacFile,
      hostRoot,
      hostDataRoot,
      hostBackupRoot,
      hostStateRoot,
      hostLogsRoot,
      hostEnvRoot,
      hostAppRoot,
    }),
  });
};

// Keeps URI construction visibly tied to the declared staging identity.
const valuesOr = (record, key, fallback) => record[key] || fallback;

export const serializeEnvironment = (values) => {
  const lines = [
    '# Generated synthetic server-staging validation configuration.',
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
  const existing = [];
  for (const target of targets) {
    try {
      await lstat(target);
      existing.push(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (existing.length > 0) {
    throw new Error(
      'Refusing to overwrite or rotate existing server-staging validation credentials',
    );
  }
};

const writePrivateFile = async (target, contents, mode) => {
  await writeFile(target, contents, { flag: 'wx', mode });
  await chmod(target, mode);
};

const currentGitSha = async () => {
  const { stdout } = await execFileAsync(
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
  );
  const candidateSha = stdout.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(candidateSha)) {
    throw new Error('Git HEAD did not resolve to a full commit SHA');
  }
  return candidateSha;
};

export const generateValidationEnvironment = async ({
  candidateSha,
  generatedDirectory = DEFAULT_GENERATED_DIRECTORY,
  randomBytesFunction = randomBytes,
} = {}) => {
  const resolvedGeneratedDirectory = path.resolve(generatedDirectory);
  await mkdir(resolvedGeneratedDirectory, {
    recursive: true,
    mode: 0o700,
  });
  const directoryMetadata = await lstat(resolvedGeneratedDirectory);
  if (
    directoryMetadata.isSymbolicLink()
    || !directoryMetadata.isDirectory()
  ) {
    throw new Error(
      `Refusing unsafe generated directory: ${resolvedGeneratedDirectory}`,
    );
  }

  const contractSource = await readFile(CONTRACT_FILE, 'utf8');
  const contractKeys = parseContractKeys(contractSource);
  const exactSha = candidateSha || await currentGitSha();
  const model = buildValidationEnvironment({
    candidateSha: exactSha,
    contractKeys,
    generatedDirectory: resolvedGeneratedDirectory,
    randomBytesFunction,
  });
  const mongoKeyfileContents =
    randomBytesFunction(756).toString('base64');
  assertDistinctSecrets(model.values, [mongoKeyfileContents]);
  await assertGeneratedTargetsAbsent([
    model.paths.envFile,
    model.paths.mongoKeyfile,
    model.paths.backupPasswordFile,
    model.paths.backupHmacFile,
  ]);

  await Promise.all([
    model.paths.hostDataRoot,
    model.paths.hostBackupRoot,
    model.paths.hostStateRoot,
    model.paths.hostLogsRoot,
    model.paths.hostEnvRoot,
    model.paths.hostAppRoot,
  ].map((directory) => mkdir(directory, {
    recursive: true,
    mode: 0o700,
  })));

  const serialized = serializeEnvironment(model.values);
  await writePrivateFile(model.paths.envFile, serialized, 0o600);
  await writePrivateFile(
    model.paths.mongoKeyfile,
    mongoKeyfileContents,
    0o400,
  );
  await writePrivateFile(
    model.paths.backupPasswordFile,
    model.values.BACKUP_ENCRYPTION_PASSWORD,
    0o400,
  );
  await writePrivateFile(
    model.paths.backupHmacFile,
    model.values.BACKUP_INTEGRITY_HMAC_KEY,
    0o400,
  );

  return Object.freeze({
    project: VALIDATION_PROJECT,
    resourcePrefix: VALIDATION_RESOURCE_PREFIX,
    environmentId: ENVIRONMENT_ID,
    runtimeCandidateSha: exactSha,
    environmentFile: slashPath(model.paths.envFile),
    environmentSha256: sha256(serialized),
    mongoKeyfile: slashPath(model.paths.mongoKeyfile),
    mongoKeyfileSha256: sha256(mongoKeyfileContents),
    backupPasswordFile: slashPath(model.paths.backupPasswordFile),
    backupPasswordSha256: sha256(
      model.values.BACKUP_ENCRYPTION_PASSWORD,
    ),
    backupHmacFile: slashPath(model.paths.backupHmacFile),
    backupHmacSha256: sha256(
      model.values.BACKUP_INTEGRITY_HMAC_KEY,
    ),
    contractFile: slashPath(CONTRACT_FILE),
    contractSha256: sha256(contractSource),
    contractKeyCount: contractKeys.length,
    syntheticOnly: true,
    optionalProvidersEnabled: false,
  });
};

const parseArguments = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--candidate-sha') {
      options.candidateSha = argv[++index];
    } else if (argument === '--output-directory') {
      options.generatedDirectory = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
};

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    const metadata = await generateValidationEnvironment(
      parseArguments(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `Server-staging validation environment generation failed: ${error.message}\n`,
    );
    process.exitCode = 1;
  }
}
