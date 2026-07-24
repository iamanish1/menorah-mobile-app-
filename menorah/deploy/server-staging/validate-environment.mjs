#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';

export const REAL_PROJECT = 'menorah-staging';
export const VALIDATION_PROJECT =
  'menorah-server-staging-validation';
export const ENVIRONMENT_ID = 'menorah-server-staging-v1';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const REAL_ALERTMANAGER_CONFIG_SOURCE =
  '/opt/menorah-staging/env/alertmanager.yml';
export const TRACKED_ALERTMANAGER_CONFIG_SOURCE = path.join(
  MODULE_DIRECTORY,
  'alertmanager.yml',
);
export const ALERTMANAGER_CONFIG_TARGET =
  '/etc/alertmanager/alertmanager.yml';

const PROCESS_INFLUENCING_ENVIRONMENT_KEYS = new Set([
  'ALL_PROXY',
  'BASHOPTS',
  'BASH_ENV',
  'CDPATH',
  'ENV',
  'GLOBIGNORE',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'IFS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NO_PROXY',
  'PATH',
  'PROMPT_COMMAND',
  'PS4',
  'SHELLOPTS',
  'SSH_ASKPASS',
  'SSH_AUTH_SOCK',
  'TMP',
  'TEMP',
  'TMPDIR',
  'USERPROFILE',
  'XDG_CONFIG_HOME',
]);
const PROCESS_INFLUENCING_ENVIRONMENT_PREFIXES = Object.freeze([
  'BASH_FUNC_',
  'BUILDKIT_',
  'BUILDX_',
  'COMPOSE_',
  'DOCKER_',
  'DYLD_',
  'GIT_',
  'LD_',
]);
const PERSISTENT_OPERATION_ENVIRONMENT_KEYS = new Set([
  'BACKUP_RESTORE_ACKNOWLEDGEMENT',
  'MENORAH_SERVER_STAGING_ALERT_EXERCISE_CONFIRM',
  'MENORAH_STAGING_WRITERS_QUIESCED',
]);

export const isForbiddenServerStagingEnvironmentKey = (key) => (
  PROCESS_INFLUENCING_ENVIRONMENT_KEYS.has(key)
  || PROCESS_INFLUENCING_ENVIRONMENT_PREFIXES.some(
    (prefix) => key.startsWith(prefix),
  )
  || PERSISTENT_OPERATION_ENVIRONMENT_KEYS.has(key)
  || /^MENORAH_STAGING_[A-Z0-9_]+_ACK$/.test(key)
  || /_ACKNOWLEDGEMENT$/.test(key)
);

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
const EXPECTED_ADMIN_ROLE_GRANTS = Object.freeze([
  Object.freeze({
    adminId: '7a110ca15a6e000000000101',
    role: 'support',
  }),
  Object.freeze({
    adminId: '7a110ca15a6e000000000102',
    role: 'finance',
  }),
  Object.freeze({
    adminId: '7a110ca15a6e000000000103',
    role: 'content',
  }),
  Object.freeze({
    adminId: '7a110ca15a6e000000000104',
    role: 'admin',
  }),
  Object.freeze({
    adminId: '7a110ca15a6e000000000105',
    role: 'admin',
  }),
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
  LIVEKIT_RTC_TCP_PORT: '37881',
  LIVEKIT_RTC_UDP_PORT_RANGE: '35000-35100',
  PROMETHEUS_LOCAL_PORT: '127.0.0.1:39090',
  ALERTMANAGER_LOCAL_PORT: '127.0.0.1:39093',
  LOKI_LOCAL_PORT: '127.0.0.1:33100',
  ALLOY_LOCAL_PORT: '127.0.0.1:32345',
  MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
  MENORAH_SERVER_STAGING_TUNNEL_ORIGIN_PORT: '38000',
});

export const NETWORK_CONTRACTS = Object.freeze([
  Object.freeze({
    name: 'ingress',
    subnetKey: 'MENORAH_SERVER_STAGING_INGRESS_SUBNET',
    rangeKey: 'MENORAH_SERVER_STAGING_INGRESS_IP_RANGE',
  }),
  Object.freeze({
    name: 'app',
    subnetKey: 'MENORAH_SERVER_STAGING_APP_SUBNET',
    rangeKey: 'MENORAH_SERVER_STAGING_APP_IP_RANGE',
  }),
  Object.freeze({
    name: 'data',
    subnetKey: 'MENORAH_SERVER_STAGING_DATA_SUBNET',
    rangeKey: 'MENORAH_SERVER_STAGING_DATA_IP_RANGE',
  }),
  Object.freeze({
    name: 'monitoring',
    subnetKey: 'MENORAH_SERVER_STAGING_MONITORING_SUBNET',
    rangeKey: 'MENORAH_SERVER_STAGING_MONITORING_IP_RANGE',
  }),
  Object.freeze({
    name: 'restore',
    subnetKey: 'MENORAH_SERVER_STAGING_RESTORE_SUBNET',
    rangeKey: 'MENORAH_SERVER_STAGING_RESTORE_IP_RANGE',
  }),
  Object.freeze({
    name: 'egress',
    subnetKey: 'MENORAH_SERVER_STAGING_EGRESS_SUBNET',
    rangeKey: 'MENORAH_SERVER_STAGING_EGRESS_IP_RANGE',
  }),
]);

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
  'LIVEKIT_MEDIA_BIND_IP',
  'LIVEKIT_NODE_IP',
  'KYC_CONSENT_VERSION',
  'PRIVACY_RETENTION_POLICY_JSON',
  'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON',
  'ADMIN_ROLE_GRANTS_JSON',
  'MEDIA_STORAGE_BUCKET',
  'PROMETHEUS_EXTERNAL_ENVIRONMENT',
  'PROMETHEUS_EXTERNAL_PROJECT',
  'ALERTMANAGER_ENVIRONMENT',
  'ALERTMANAGER_CONFIG_SOURCE',
  'ALERTMANAGER_CONFIG_FILE',
  'ALERTMANAGER_CONFIG_SHA256',
  'ALERTMANAGER_RECEIVER',
  'ALERTMANAGER_DELIVERY_RECEIVER',
  'ALERTMANAGER_DELIVERY_ENDPOINT_HOST',
  'ALERTMANAGER_CONFIG_REVIEWED_AT',
  'ALERTMANAGER_CONFIG_REVIEW_REFERENCE',
  ...NETWORK_CONTRACTS.flatMap(({ subnetKey, rangeKey }) => [
    subnetKey,
    rangeKey,
  ]),
  'MENORAH_SERVER_STAGING_CADDY_APP_IP',
  'BACKUP_LOCK_FILE',
  'MENORAH_CURRENT_SHA_FILE',
  'MENORAH_LAST_GOOD_SHA_FILE',
  'MENORAH_MIGRATION_APPLIED_MARKER',
  'MENORAH_MIGRATION_IN_PROGRESS_MARKER',
  'MENORAH_IDENTITY_RECONCILIATION_MARKER',
  'MENORAH_POST_MIGRATION_RECOVERY_MARKER',
  'MENORAH_DEPLOY_LOCK_FILE',
  'MENORAH_ROLLBACK_LOCK_FILE',
  'BOOKING_PAYMENTS_ENABLED',
  'PAYOUTS_ENABLED',
  'SUBSCRIPTION_PAYMENTS_ENABLED',
  'RAZORPAY_MODE',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_WEBHOOK_SECRET_PREVIOUS',
  'RAZORPAY_X_MODE',
  'RAZORPAY_X_KEY_ID',
  'RAZORPAY_X_KEY_SECRET',
  'RAZORPAY_X_WEBHOOK_SECRET',
  'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  'CHECKOUT_RETURN_URL',
  'RESEND_PROVIDER_ENABLED',
  'RESEND_MODE',
  'RESEND_API_URL',
  'RESEND_API_KEY',
  'MAIL_CAPTURE_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'MEDIA_STORAGE_BACKEND',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_UPLOAD_PREFIX',
  'APPLE_SIGN_IN_ENABLED',
  'ENABLE_SOCIAL_SCHEDULER',
  'SOCIAL_STUDIO_ENABLED',
  'SOCIAL_STUDIO_AUTO_PUBLISH',
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
      'CHECKOUT_RETURN_URL',
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
]);

const ALWAYS_DISABLED_PROVIDER_FLAGS = Object.freeze([
  'UAE_CALLING_ENABLED',
  'VSEE_ENABLED',
  'DOXY_ENABLED',
  'ZOOM_ENABLED',
  'GOOGLE_MEET_ENABLED',
  'TEAMS_ENABLED',
  'APPLE_SIGN_IN_ENABLED',
  'ENABLE_SOCIAL_SCHEDULER',
  'SOCIAL_STUDIO_ENABLED',
  'SOCIAL_STUDIO_AUTO_PUBLISH',
]);

export const SERVER_STAGING_CLOUDINARY_PREFIX =
  'menorah-staging/menorah-server-staging-v1';
export const CANONICAL_RESEND_EMAIL_URL =
  'https://api.resend.com/emails';

const PLACEHOLDER_PATTERN =
  /(?:<(?:replace|insert|set|your)[^>]+>|change[-_ ]?me|replace[-_ ]?with|example(?:[.-]|$)|placeholder|your[-_]|todo|tbd|secret[-_ ]?here|\bx{3,}\b)/i;
const PRODUCTION_DOMAIN_PATTERN =
  /(?:^|[^a-z0-9.-])(?:menorah\.me|www\.menorah\.me|app\.menorah\.me|admin\.menorah\.me|counsellor\.menorah\.me|api(?:-ios|-android|-web|-admin)?\.menorah\.me|calls\.menorah\.me|(?:[a-z0-9-]+\.)*mentle\.org)(?=$|[^a-z0-9.-])/i;
const LIVE_MODE_PATTERN =
  /(?:^|[-_:/.\s])(live|production|prod)(?:$|[-_:/.\s])/i;
const ALERTMANAGER_LOCAL_PLACEHOLDER_KEYS = new Set([
  'ALERTMANAGER_RECEIVER',
  'ALERTMANAGER_DELIVERY_RECEIVER',
]);
const ALERTMANAGER_REAL_RECEIVER_PATTERN =
  /^(?:menorah|server)-staging-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALERTMANAGER_CONFIG_REVIEW_REFERENCE_PATTERN =
  /^staging-alert-config-review-[a-z0-9][a-z0-9._/-]{7,}$/;
const ALERTMANAGER_CONFIG_REVIEW_MAX_AGE_MILLISECONDS =
  30 * 24 * 60 * 60 * 1000;
const ALERTMANAGER_CONFIG_REVIEW_FUTURE_SKEW_MILLISECONDS =
  5 * 60 * 1000;
const ALERTMANAGER_CONFIG_MAX_BYTES = 1024 * 1024;
const CONDITIONALLY_EMPTY_PROVIDER_KEYS = new Set([
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_WEBHOOK_SECRET_PREVIOUS',
  'RAZORPAY_X_KEY_ID',
  'RAZORPAY_X_KEY_SECRET',
  'RAZORPAY_X_WEBHOOK_SECRET',
  'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  'CHECKOUT_RETURN_URL',
  'RESEND_API_URL',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'EMAIL_FROM',
  'CONTACT_TO_EMAIL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
]);

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

const parseCanonicalIpv4 = (value) => {
  const text = String(value || '');
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(text)) {
    return null;
  }
  const octets = text.split('.').map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  const numeric = (
    (
      (octets[0] * (2 ** 24))
      + (octets[1] * (2 ** 16))
      + (octets[2] * (2 ** 8))
      + octets[3]
    ) >>> 0
  );
  return { text, octets, numeric };
};

const parseCanonicalCidr = (value, expectedPrefix) => {
  const match = String(value || '').match(/^(.+)\/(\d{1,2})$/);
  if (!match) return null;
  const address = parseCanonicalIpv4(match[1]);
  const prefix = Number(match[2]);
  if (
    !address
    || prefix < 0
    || prefix > 32
    || (
      expectedPrefix !== undefined
      && prefix !== expectedPrefix
    )
  ) {
    return null;
  }
  const size = 2 ** (32 - prefix);
  const start = Math.floor(address.numeric / size) * size;
  if (address.numeric !== start) return null;
  return {
    source: String(value),
    prefix,
    start,
    end: start + size - 1,
  };
};

const rangesOverlap = (left, right) => (
  left.start <= right.end && right.start <= left.end
);

const numericInRange = (numeric, range) => (
  range.start <= numeric && numeric <= range.end
);

const isRfc1918 = (numeric) => (
  numericInRange(numeric, { start: 0x0a000000, end: 0x0affffff })
  || numericInRange(numeric, { start: 0xac100000, end: 0xac1fffff })
  || numericInRange(numeric, { start: 0xc0a80000, end: 0xc0a8ffff })
);

const isNonRoutableIpv4 = (numeric) => [
  [0x00000000, 0x00ffffff],
  [0x64400000, 0x647fffff],
  [0x7f000000, 0x7fffffff],
  [0xa9fe0000, 0xa9feffff],
  [0xc0000000, 0xc00000ff],
  [0xc0000200, 0xc00002ff],
  [0xc0586300, 0xc05863ff],
  [0xc6120000, 0xc613ffff],
  [0xc6336400, 0xc63364ff],
  [0xcb007100, 0xcb0071ff],
  [0xe0000000, 0xffffffff],
].some(([start, end]) => start <= numeric && numeric <= end);

const cidrOverlapsValue = (left, right) => {
  const leftRange = parseCanonicalCidr(left);
  const rightRange = parseCanonicalCidr(right);
  return Boolean(
    leftRange
    && rightRange
    && rangesOverlap(leftRange, rightRange)
  );
};

const validateNetworkAndMediaAddresses = (
  errors,
  environment,
  productionMetadata,
  project,
) => {
  const networks = [];
  for (const contract of NETWORK_CONTRACTS) {
    const subnet = parseCanonicalCidr(
      environment[contract.subnetKey],
      24,
    );
    const dynamicRange = parseCanonicalCidr(
      environment[contract.rangeKey],
      25,
    );
    if (!subnet || !isRfc1918(subnet.start)) {
      errors.push(
        `${contract.subnetKey} must be one canonical RFC1918 /24`,
      );
    }
    if (!dynamicRange || !isRfc1918(dynamicRange.start)) {
      errors.push(
        `${contract.rangeKey} must be one canonical RFC1918 /25`,
      );
    }
    if (
      subnet
      && dynamicRange
      && (
        dynamicRange.start < subnet.start
        || dynamicRange.end > subnet.end
      )
    ) {
      errors.push(
        `${contract.rangeKey} must be contained by ${contract.subnetKey}`,
      );
    }
    if (subnet) {
      for (const existing of networks) {
        if (rangesOverlap(subnet, existing.subnet)) {
          errors.push(
            `${contract.subnetKey} overlaps ${existing.subnetKey}`,
          );
        }
      }
      for (const productionSubnet of productionMetadata.networkSubnets || []) {
        if (cidrOverlapsValue(environment[contract.subnetKey], productionSubnet)) {
          errors.push(
            `${contract.subnetKey} collides with production metadata`,
          );
        }
      }
      networks.push({ ...contract, subnet, dynamicRange });
    }
  }

  const app = networks.find(({ name }) => name === 'app');
  const caddy = parseCanonicalIpv4(
    environment.MENORAH_SERVER_STAGING_CADDY_APP_IP,
  );
  if (
    !caddy
    || !app
    || !numericInRange(caddy.numeric, app.subnet)
    || caddy.numeric === app.subnet.start
    || caddy.numeric === app.subnet.start + 1
    || caddy.numeric === app.subnet.end
    || (
      app.dynamicRange
      && numericInRange(caddy.numeric, app.dynamicRange)
    )
  ) {
    errors.push(
      'MENORAH_SERVER_STAGING_CADDY_APP_IP must be one usable app-network '
      + 'host outside its dynamic range',
    );
  }

  const bind = parseCanonicalIpv4(environment.LIVEKIT_MEDIA_BIND_IP);
  const advertised = parseCanonicalIpv4(environment.LIVEKIT_NODE_IP);
  if (project === VALIDATION_PROJECT) {
    if (
      environment.LIVEKIT_MEDIA_BIND_IP !== '127.0.0.1'
      || environment.LIVEKIT_NODE_IP !== '127.0.0.1'
    ) {
      errors.push(
        'local validation LiveKit bind and advertised addresses must be 127.0.0.1',
      );
    }
    return;
  }

  if (
    !bind
    || isNonRoutableIpv4(bind.numeric)
    || networks.some(({ subnet }) => numericInRange(bind.numeric, subnet))
  ) {
    errors.push(
      'LIVEKIT_MEDIA_BIND_IP must be a canonical non-special host address '
      + 'outside all six Docker networks',
    );
  }
  if (
    !advertised
    || isRfc1918(advertised.numeric)
    || isNonRoutableIpv4(advertised.numeric)
  ) {
    errors.push(
      'LIVEKIT_NODE_IP must be a canonical globally routable IPv4 address',
    );
  }
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

const sha256 = (value) => (
  createHash('sha256').update(value).digest('hex')
);

const pathComponents = (absolutePath) => {
  const normalized = normalizePath(absolutePath);
  if (!normalized.startsWith('/')) return [normalized];
  const components = ['/'];
  let current = '';
  for (const part of normalized.split('/').filter(Boolean)) {
    current += `/${part}`;
    components.push(current);
  }
  return components;
};

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

const validateSyntheticAdminRoleContract = (errors, environment) => {
  let adminRoleGrants;
  try {
    adminRoleGrants = JSON.parse(environment.ADMIN_ROLE_GRANTS_JSON);
  } catch {
    adminRoleGrants = null;
  }

  const actualGrants = new Map();
  const entriesValid = (
    Array.isArray(adminRoleGrants)
    && adminRoleGrants.length === EXPECTED_ADMIN_ROLE_GRANTS.length
    && adminRoleGrants.every((grant) => {
      if (
        !isPlainRecord(grant)
        || !setEqual(
          new Set(Object.keys(grant)),
          new Set(['adminId', 'role']),
        )
        || typeof grant.adminId !== 'string'
        || typeof grant.role !== 'string'
        || actualGrants.has(grant.adminId)
      ) {
        return false;
      }
      actualGrants.set(grant.adminId, grant.role);
      return true;
    })
  );
  const expectedGrants = new Map(
    EXPECTED_ADMIN_ROLE_GRANTS.map(({ adminId, role }) => [
      adminId,
      role,
    ]),
  );
  const contractValid = (
    entriesValid
    && actualGrants.size === expectedGrants.size
    && [...expectedGrants].every(
      ([adminId, role]) => actualGrants.get(adminId) === role,
    )
  );
  if (!contractValid) {
    errors.push(
      'ADMIN_ROLE_GRANTS_JSON must exactly match the five-member '
      + 'synthetic server-staging admin roster',
    );
  }
};

export const validateEnvironmentRecord = (
  environment,
  {
    productionMetadata = {},
    now = Date.now(),
  } = {},
) => {
  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(environment, key)) {
      errors.push(`missing required environment key ${key}`);
    }
  }
  for (const [key, value] of Object.entries(environment)) {
    if (isForbiddenServerStagingEnvironmentKey(key)) {
      errors.push(
        `${key} is forbidden in the persistent server-staging environment`,
      );
      continue;
    }
    if (
      typeof value !== 'string'
      || (
        value.trim() === ''
        && !CONDITIONALLY_EMPTY_PROVIDER_KEYS.has(key)
      )
    ) {
      errors.push(`${key} must not be empty`);
      continue;
    }
    if (value.trim() === '') continue;
    const approvedLocalAlertmanagerPlaceholder = (
      environment.MENORAH_SERVER_STAGING_PROJECT_NAME
        === VALIDATION_PROJECT
      && ALERTMANAGER_LOCAL_PLACEHOLDER_KEYS.has(key)
      && value === 'server-staging-placeholder'
    );
    if (
      PLACEHOLDER_PATTERN.test(value)
      && !approvedLocalAlertmanagerPlaceholder
    ) {
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
  validateSyntheticAdminRoleContract(errors, environment);

  for (const [key, expected] of Object.entries(
    EXPECTED_PORT_VARIABLES,
  )) {
    if (environment[key] !== expected) {
      errors.push(`${key} must be ${expected}`);
    }
  }
  validateNetworkAndMediaAddresses(
    errors,
    environment,
    productionMetadata,
    project,
  );

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
    !isWithin(
      root,
      path.join(MODULE_DIRECTORY, 'generated'),
    )
    || path.posix.basename(normalizePath(root)) !== 'host'
  ) {
    errors.push(
      'local validation root must stay under server-staging/generated/**/host',
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
  if (Object.hasOwn(environment, 'BACKUP_METADATA_FILE')) {
    errors.push(
      'BACKUP_METADATA_FILE is not a persistent environment authority',
    );
  }
  const exactBackupLock = `${
    normalizePath(environment.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT)
  }/.backup.lock`;
  if (normalizePath(environment.BACKUP_LOCK_FILE) !== exactBackupLock) {
    errors.push(
      'BACKUP_LOCK_FILE must be the exact deployment-state .backup.lock',
    );
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
    if (flag !== 'true') {
      const inactiveKeys = provider.flag === 'BOOKING_PAYMENTS_ENABLED'
        ? [...provider.keys, 'RAZORPAY_WEBHOOK_SECRET_PREVIOUS']
        : provider.keys;
      for (const key of inactiveKeys) {
        if (String(environment[key] || '') !== '') {
          errors.push(
            `${provider.flag}=false requires empty ${key}`,
          );
        }
      }
      continue;
    }
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
        errors.push(
          `${provider.flag} requires complete test-mode ${key}`,
        );
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
    environment.NEXT_PUBLIC_RAZORPAY_KEY_ID
    !== environment.RAZORPAY_KEY_ID
  ) {
    errors.push(
      'public and private Razorpay test key IDs must match exactly',
    );
  }
  if (environment.SUBSCRIPTION_PAYMENTS_ENABLED !== 'false') {
    errors.push(
      'SUBSCRIPTION_PAYMENTS_ENABLED must remain disabled in server staging',
    );
  }
  if (
    project === VALIDATION_PROJECT
    && (
      environment.BOOKING_PAYMENTS_ENABLED !== 'false'
      || environment.PAYOUTS_ENABLED !== 'false'
      || environment.RESEND_PROVIDER_ENABLED !== 'false'
      || environment.MEDIA_STORAGE_BACKEND !== 'local'
    )
  ) {
    errors.push(
      'local validation providers must remain disabled, captured, and local',
    );
  }
  if (environment.RESEND_MODE !== 'sandbox') {
    errors.push('Resend mode must remain staging-only sandbox');
  }
  const hasStagingSender = (
    /^(?:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@mail\.staging\.menorah\.me|[^<>\r\n]+<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@mail\.staging\.menorah\.me>)$/.test(
      String(environment.EMAIL_FROM || '').trim(),
    )
  );
  const hasStagingRecipient = (
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@mail\.staging\.menorah\.me$/.test(
      String(environment.CONTACT_TO_EMAIL || '').trim(),
    )
  );
  const hasCompleteResendWebhook = (
    String(environment.RESEND_WEBHOOK_SECRET || '').length >= 24
    && !String(environment.RESEND_WEBHOOK_SECRET)
      .startsWith('disabled-')
    && !PLACEHOLDER_PATTERN.test(environment.RESEND_WEBHOOK_SECRET)
  );
  if (
    !/^re_server_staging_[A-Za-z0-9_-]{32,}$/.test(
      environment.MAIL_CAPTURE_API_KEY || '',
    )
  ) {
    errors.push(
      'MAIL_CAPTURE_API_KEY must identify one strong isolated server-staging capture key',
    );
  }
  if (!['true', 'false'].includes(environment.RESEND_PROVIDER_ENABLED)) {
    errors.push('RESEND_PROVIDER_ENABLED must be true or false');
  } else if (environment.RESEND_PROVIDER_ENABLED === 'true') {
    if (project !== REAL_PROJECT) {
      errors.push(
        'external Resend delivery is allowed only for real server staging',
      );
    }
    if (environment.RESEND_API_URL !== CANONICAL_RESEND_EMAIL_URL) {
      errors.push(
        `enabled Resend must use exact endpoint ${CANONICAL_RESEND_EMAIL_URL}`,
      );
    }
    if (
      !/^re_[A-Za-z0-9_-]{32,}$/.test(
        environment.RESEND_API_KEY || '',
      )
      || environment.RESEND_API_KEY.startsWith('re_local_')
      || environment.RESEND_API_KEY.startsWith('re_server_staging_')
    ) {
      errors.push(
        'enabled Resend requires a complete external sandbox API key',
      );
    }
    if (!hasCompleteResendWebhook) {
      errors.push(
        'enabled Resend requires a complete external sandbox webhook secret',
      );
    }
    if (!hasStagingSender || !hasStagingRecipient) {
      errors.push(
        'enabled Resend requires complete staging-domain sender and recipient',
      );
    }
    if (
      !String(environment.MAIL_CAPTURE_API_KEY || '')
        .startsWith('re_server_staging_')
      || environment.MAIL_CAPTURE_API_KEY === environment.RESEND_API_KEY
    ) {
      errors.push(
        'external Resend credentials must not reach the isolated mail capture',
      );
    }
  } else if (project === VALIDATION_PROJECT) {
    if (
      environment.RESEND_API_URL
        !== 'http://staging-mail-capture:8025/emails'
      || !String(environment.RESEND_API_KEY || '')
        .startsWith('re_server_staging_')
      || environment.MAIL_CAPTURE_API_KEY !== environment.RESEND_API_KEY
      || !hasStagingSender
      || !hasStagingRecipient
      || !hasCompleteResendWebhook
    ) {
      errors.push(
        'local validation Resend must use only the exact isolated capture identity',
      );
    }
  } else {
    for (const key of [
      'RESEND_API_URL',
      'RESEND_API_KEY',
      'RESEND_WEBHOOK_SECRET',
      'EMAIL_FROM',
      'CONTACT_TO_EMAIL',
    ]) {
      if (String(environment[key] || '') !== '') {
        errors.push(
          `real server staging with Resend disabled requires empty ${key}`,
        );
      }
    }
  }

  if (!['local', 'cloudinary'].includes(
    environment.MEDIA_STORAGE_BACKEND,
  )) {
    errors.push(
      'MEDIA_STORAGE_BACKEND must be exactly local or cloudinary',
    );
  }
  if (
    environment.CLOUDINARY_UPLOAD_PREFIX
    !== SERVER_STAGING_CLOUDINARY_PREFIX
  ) {
    errors.push(
      `CLOUDINARY_UPLOAD_PREFIX must equal ${SERVER_STAGING_CLOUDINARY_PREFIX}`,
    );
  }
  if (environment.MEDIA_STORAGE_BACKEND === 'cloudinary') {
    if (project !== REAL_PROJECT) {
      errors.push(
        'Cloudinary media storage is allowed only for real server staging',
      );
    }
    for (const key of [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]) {
      const value = environment[key] || '';
      if (
        value.length < 8
        || value.startsWith('disabled-')
        || PLACEHOLDER_PATTERN.test(value)
        || LIVE_MODE_PATTERN.test(value)
      ) {
        errors.push(
          `Cloudinary media storage requires complete staging-only ${key}`,
        );
      }
    }
  } else if (
    [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ].some(
      (key) => String(environment[key] || '') !== '',
    )
  ) {
    errors.push(
      'local media storage must omit Cloudinary credentials',
    );
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
    environment.ALERTMANAGER_CONFIG_FILE
      !== ALERTMANAGER_CONFIG_TARGET
  ) {
    errors.push('Alertmanager container config target is invalid');
  }
  if (
    !/^[a-f0-9]{64}$/.test(
      environment.ALERTMANAGER_CONFIG_SHA256 || '',
    )
  ) {
    errors.push('Alertmanager config digest must be one SHA-256 value');
  }
  if (project === VALIDATION_PROJECT) {
    if (
      normalizePath(environment.ALERTMANAGER_CONFIG_SOURCE)
        !== normalizePath(TRACKED_ALERTMANAGER_CONFIG_SOURCE)
      || environment.ALERTMANAGER_RECEIVER
        !== 'server-staging-placeholder'
      || environment.ALERTMANAGER_DELIVERY_RECEIVER
        !== 'server-staging-placeholder'
      || environment.ALERTMANAGER_DELIVERY_ENDPOINT_HOST
        !== 'staging-alert-sink'
      || environment.ALERTMANAGER_CONFIG_REVIEWED_AT
        !== '1970-01-01T00:00:00Z'
      || environment.ALERTMANAGER_CONFIG_REVIEW_REFERENCE
        !== 'synthetic-server-staging-only'
    ) {
      errors.push(
        'local validation must use the tracked isolated Alertmanager sink',
      );
    }
  } else {
    const receiver = environment.ALERTMANAGER_RECEIVER || '';
    const endpointHost =
      environment.ALERTMANAGER_DELIVERY_ENDPOINT_HOST || '';
    const reviewedAt =
      environment.ALERTMANAGER_CONFIG_REVIEWED_AT || '';
    const reviewReference =
      environment.ALERTMANAGER_CONFIG_REVIEW_REFERENCE || '';
    const reviewedTimestamp = Date.parse(reviewedAt);
    const normalizedReviewedAt = reviewedAt.endsWith('Z')
      && !reviewedAt.includes('.')
      ? reviewedAt.replace(/Z$/, '.000Z')
      : reviewedAt;
    if (
      normalizePath(environment.ALERTMANAGER_CONFIG_SOURCE)
        !== REAL_ALERTMANAGER_CONFIG_SOURCE
    ) {
      errors.push(
        `real server staging must use ${REAL_ALERTMANAGER_CONFIG_SOURCE}`,
      );
    }
    if (
      !ALERTMANAGER_REAL_RECEIVER_PATTERN.test(receiver)
      || receiver !== environment.ALERTMANAGER_DELIVERY_RECEIVER
      || /(?:placeholder|unconfigured|production|(?:^|-)prod(?:-|$))/i
        .test(receiver)
    ) {
      errors.push(
        'Alertmanager delivery receiver must be one matching staging-only identity',
      );
    }
    if (
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(endpointHost)
      || !endpointHost.includes('.')
      || endpointHost === 'localhost'
      || /^[0-9.]+$/.test(endpointHost)
      || endpointHost.split('.').some(
        (label) => ['prod', 'production'].includes(label),
      )
      || PRODUCTION_DOMAIN_PATTERN.test(endpointHost)
      || (productionMetadata.caddyHosts || []).includes(endpointHost)
      || (productionMetadata.tunnelHosts || []).includes(endpointHost)
    ) {
      errors.push(
        'Alertmanager delivery endpoint must be an approved non-production hostname',
      );
    }
    if (
      !Number.isFinite(reviewedTimestamp)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
        .test(reviewedAt)
      || new Date(reviewedTimestamp).toISOString()
        !== normalizedReviewedAt
      || reviewedTimestamp
        > now + ALERTMANAGER_CONFIG_REVIEW_FUTURE_SKEW_MILLISECONDS
      || now - reviewedTimestamp
        > ALERTMANAGER_CONFIG_REVIEW_MAX_AGE_MILLISECONDS
    ) {
      errors.push(
        'Alertmanager config review must be exact, recent, and not future-dated',
      );
    }
    if (
      !ALERTMANAGER_CONFIG_REVIEW_REFERENCE_PATTERN.test(
        reviewReference,
      )
      || LIVE_MODE_PATTERN.test(reviewReference)
    ) {
      errors.push(
        'Alertmanager config review must use a staging-only reference',
      );
    }
  }

  return errors;
};

const canonicalAlertmanagerLines = (receiver) => [
  'global:',
  '  resolve_timeout: 1m',
  'route:',
  '  receiver: unmatched-drop',
  '  group_by:',
  '    - environment',
  '    - alertname',
  '    - service',
  '    - severity',
  '  group_wait: 5s',
  '  group_interval: 30s',
  '  repeat_interval: 30m',
  '  routes:',
  `    - receiver: ${receiver}`,
  '      matchers:',
  '        - environment="staging"',
  'receivers:',
  '  - name: unmatched-drop',
  `  - name: ${receiver}`,
  '    webhook_configs:',
  '      - url: __REVIEWED_WEBHOOK_URL__',
  '        send_resolved: true',
  '        http_config:',
  '          follow_redirects: false',
  'inhibit_rules:',
  '  - source_matchers:',
  '      - environment="staging"',
  '      - severity="critical"',
  '    target_matchers:',
  '      - environment="staging"',
  '      - severity="warning"',
  '    equal:',
  '      - environment',
  '      - alertname',
  '      - service',
];

const canonicalAlertmanagerSource = (source) => {
  const rawLines = String(source).split(/\r?\n/);
  if (
    rawLines.some((line) => line.includes('\t'))
    || rawLines.some((line) => /^\s*(?:---|\.\.\.)\s*$/.test(line))
    || rawLines.some((line) => /:\s*[>|][+-]?\s*$/.test(line))
    || rawLines.some((line) => (
      /^\s*[^#\s].*(?:\s[&*!][a-z0-9_-]+|[\[\]{}])/.test(line)
    ))
  ) {
    return {
      error:
        'Alertmanager config uses forbidden YAML flow, alias, tag, or folded syntax',
    };
  }
  const lines = rawLines.filter(
    (line) => line.trim() && !line.trimStart().startsWith('#'),
  );
  const urlIndexes = [];
  const urls = [];
  lines.forEach((line, index) => {
    const match = line.match(/^      - url: (\S+)$/);
    if (match) {
      urlIndexes.push(index);
      urls.push(match[1]);
    }
  });
  if (urlIndexes.length === 1) {
    lines[urlIndexes[0]] = '      - url: __REVIEWED_WEBHOOK_URL__';
  }
  return { lines, urls };
};

export const validateAlertmanagerConfigContent = (
  environment,
  source,
) => {
  const errors = [];
  const project = environment.MENORAH_SERVER_STAGING_PROJECT_NAME;
  const receiver = project === VALIDATION_PROJECT
    ? 'server-staging-placeholder'
    : environment.ALERTMANAGER_DELIVERY_RECEIVER || '';
  const endpointHost =
    environment.ALERTMANAGER_DELIVERY_ENDPOINT_HOST || '';
  const text = String(source);
  if (
    project !== VALIDATION_PROJECT
    && (
      PRODUCTION_DOMAIN_PATTERN.test(text)
      || /\bproduction\b|\bprod(?:[-_./]|$)/im.test(text)
    )
  ) {
    errors.push(
      'external Alertmanager config references production delivery state',
    );
  }
  const parsed = canonicalAlertmanagerSource(source);
  if (parsed.error) {
    errors.push(parsed.error);
    return errors;
  }
  const expectedLines = canonicalAlertmanagerLines(receiver);
  if (
    !receiver
    || parsed.urls.length !== 1
    || parsed.lines.length !== expectedLines.length
    || parsed.lines.some(
      (line, index) => line !== expectedLines[index],
    )
  ) {
    errors.push(
      'Alertmanager config must match the exact staging-only canonical route',
    );
  }
  if (parsed.urls.length !== 1) return errors;

  const [value] = parsed.urls;
  if (project === VALIDATION_PROJECT) {
    if (value !== 'http://staging-alert-sink:9099/alerts') {
      errors.push(
        'local Alertmanager config must use only the tracked isolated sink',
      );
    }
  } else {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:'
        || url.hostname !== endpointHost
        || !['', '443'].includes(url.port)
        || url.username
        || url.password
      ) {
        errors.push(
          'external Alertmanager webhook does not match the reviewed HTTPS endpoint',
        );
      }
    } catch {
      errors.push('external Alertmanager webhook URL is invalid');
    }
  }
  return errors;
};

export const validateAlertmanagerConfigSource = (
  environment,
  {
    fsAdapter = fs,
  } = {},
) => {
  const errors = [];
  const project = environment.MENORAH_SERVER_STAGING_PROJECT_NAME;
  const configuredSource =
    normalizePath(environment.ALERTMANAGER_CONFIG_SOURCE || '');
  const expectedSource = normalizePath(
    project === VALIDATION_PROJECT
      ? TRACKED_ALERTMANAGER_CONFIG_SOURCE
      : REAL_ALERTMANAGER_CONFIG_SOURCE,
  );
  if (configuredSource !== expectedSource) {
    return [
      'Alertmanager config source is not the exact reviewed project path',
    ];
  }

  let metadata;
  let resolved;
  let contents;
  try {
    metadata = fsAdapter.lstatSync(configuredSource);
    resolved = normalizePath(fsAdapter.realpathSync(configuredSource));
    contents = fsAdapter.readFileSync(configuredSource);
  } catch {
    return [
      'Alertmanager config source is missing or cannot be inspected',
    ];
  }
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || resolved !== configuredSource
  ) {
    errors.push(
      'Alertmanager config source must be a canonical regular non-symlink file',
    );
  }
  if (project === REAL_PROJECT) {
    try {
      for (
        const component
        of pathComponents(configuredSource).slice(0, -1)
      ) {
        const componentMetadata = fsAdapter.lstatSync(component);
        if (
          componentMetadata.isSymbolicLink()
          || !componentMetadata.isDirectory()
          || componentMetadata.uid !== 0
          || (componentMetadata.mode & 0o022) !== 0
        ) {
          errors.push(
            'Alertmanager config parent directories must be root-owned, non-writable, and non-symlink',
          );
          break;
        }
      }
    } catch {
      errors.push(
        'Alertmanager config source path components cannot be inspected',
      );
    }
    if (
      (metadata.mode & 0o777) !== 0o400
      || metadata.uid !== 65534
      || metadata.gid !== 65534
    ) {
      errors.push(
        'Alertmanager config source must be uid/gid 65534 with mode 0400',
      );
    }
  }
  if (
    !Number.isSafeInteger(metadata.size)
    || metadata.size <= 0
    || metadata.size > ALERTMANAGER_CONFIG_MAX_BYTES
    || contents.length > ALERTMANAGER_CONFIG_MAX_BYTES
  ) {
    errors.push(
      'Alertmanager config source must be non-empty and at most 1 MiB',
    );
  }
  const actualDigest = sha256(contents);
  if (actualDigest !== environment.ALERTMANAGER_CONFIG_SHA256) {
    errors.push(
      'Alertmanager config source digest does not match environment metadata',
    );
  }
  errors.push(...validateAlertmanagerConfigContent(
    environment,
    contents,
  ));
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
    } else if (argument === '--print-alertmanager-source') {
      options.printAlertmanagerSource = true;
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
    const alertmanagerErrors = validateAlertmanagerConfigSource(
      environment,
    );
    if (alertmanagerErrors.length > 0) {
      throw new Error(
        'Server-staging Alertmanager source validation failed '
        + `(${alertmanagerErrors.length}):\n`
        + alertmanagerErrors.map((error) => `- ${error}`).join('\n'),
      );
    }
    if (options.printAlertmanagerSource) {
      process.stdout.write(
        `${environment.ALERTMANAGER_CONFIG_SOURCE}\n`,
      );
    } else if (options.printProject) {
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
