#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';

import {
  EXPECTED_HOSTS,
  NETWORK_CONTRACTS,
  REAL_PROJECT,
  VALIDATION_PROJECT,
  assertValidEnvironment,
  parseEnvironmentFile,
  validateAlertmanagerConfigContent,
} from './validate-environment.mjs';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..', '..');
const DEFAULTS = Object.freeze({
  compose: path.join(MODULE_DIRECTORY, 'rendered-compose.json'),
  environment: path.join(
    MODULE_DIRECTORY,
    'generated',
    'server-staging-validation.env',
  ),
  productionMetadata: path.join(
    MODULE_DIRECTORY,
    'production-metadata.fixture.json',
  ),
  manifest: path.join(MODULE_DIRECTORY, 'ingress-manifest.json'),
  caddy: path.join(MODULE_DIRECTORY, 'Caddyfile'),
  tunnel: path.join(MODULE_DIRECTORY, 'tunnel-config.yml.example'),
  prometheus: path.join(MODULE_DIRECTORY, 'prometheus.yml'),
  alertmanager: path.join(MODULE_DIRECTORY, 'alertmanager.yml'),
  blackbox: path.join(MODULE_DIRECTORY, 'blackbox.yml'),
  alloy: path.join(MODULE_DIRECTORY, 'config.alloy'),
  loki: path.join(MODULE_DIRECTORY, 'loki.yml'),
  livekit: path.join(MODULE_DIRECTORY, 'livekit.yaml'),
  alertRules: path.resolve(
    MODULE_DIRECTORY,
    '..',
    'monitoring',
    'alert-rules.yml',
  ),
});

export const EXPECTED_PUBLISHED_PORTS = Object.freeze([
  ['38000', 'tcp'],
  ['38443', 'tcp'],
  ['38080', 'tcp'],
  ['38081', 'tcp'],
  ['38082', 'tcp'],
  ['38083', 'tcp'],
  ['38084', 'tcp'],
  ['33001', 'tcp'],
  ['33002', 'tcp'],
  ['33003', 'tcp'],
  ['37880', 'tcp'],
  ['37881', 'tcp'],
  ['35000-35100', 'udp'],
  ['39090', 'tcp'],
  ['39093', 'tcp'],
  ['33100', 'tcp'],
  ['32345', 'tcp'],
]);

export const REQUIRED_VOLUME_SUFFIXES = Object.freeze([
  'filesystem-root',
  'app-root',
  'data-root',
  'env-root',
  'mongo',
  'redis',
  'uploads',
  'managed-media',
  'backups',
  'retrieval',
  'migration-temp',
  'prometheus',
  'alertmanager',
  'loki',
  'alloy',
  'caddy-data',
  'caddy-config',
  'restore-mongodb',
  'restore-media',
  'restore-root',
  'logs',
]);

export const REQUIRED_NETWORK_SUFFIXES = Object.freeze([
  'ingress',
  'app',
  'data',
  'monitoring',
  'restore',
  'egress',
]);

const REQUIRED_MONITORING_PRIVATE_TARGETS = Object.freeze([
  Object.freeze({
    service: 'staging-api-ios',
    alias: 'staging-private-api-ios',
    network: 'staging-app',
    port: '8080',
  }),
  Object.freeze({
    service: 'staging-api-android',
    alias: 'staging-private-api-android',
    network: 'staging-app',
    port: '8080',
  }),
  Object.freeze({
    service: 'staging-api-web',
    alias: 'staging-private-api-web',
    network: 'staging-app',
    port: '8080',
  }),
  Object.freeze({
    service: 'staging-api-admin',
    alias: 'staging-private-api-admin',
    network: 'staging-app',
    port: '8080',
  }),
  Object.freeze({
    service: 'staging-worker',
    alias: 'staging-private-worker',
    network: 'staging-app',
    port: '8080',
  }),
  Object.freeze({
    service: 'staging-user-web-app',
    alias: 'staging-private-user-web',
    network: 'staging-app',
    port: '3002',
  }),
  Object.freeze({
    service: 'staging-web-app',
    alias: 'staging-private-counsellor-web',
    network: 'staging-app',
    port: '3001',
  }),
  Object.freeze({
    service: 'staging-admin-panel',
    alias: 'staging-private-admin-panel',
    network: 'staging-app',
    port: '3003',
  }),
  Object.freeze({
    service: 'staging-livekit',
    alias: 'staging-private-livekit',
    network: 'staging-app',
    port: '7880',
  }),
  Object.freeze({
    service: 'staging-alertmanager',
    alias: 'staging-private-alertmanager',
    network: 'staging-monitoring',
    port: '9093',
  }),
  Object.freeze({
    service: 'staging-loki',
    alias: 'staging-private-loki',
    network: 'staging-monitoring',
    port: '3100',
  }),
  Object.freeze({
    service: 'staging-alloy',
    alias: 'staging-private-alloy',
    network: 'staging-monitoring',
    port: '12345',
  }),
]);

const MEDIA_VOLUME_CONTRACTS = Object.freeze([
  Object.freeze({
    source: 'staging-uploads',
    target: '/app/uploads',
  }),
  Object.freeze({
    source: 'staging-managed-media',
    target: '/app/managed-media',
  }),
]);

const MEDIA_WRITER_SERVICES = Object.freeze([
  'staging-api-ios',
  'staging-api-android',
  'staging-api-web',
  'staging-api-admin',
  'staging-worker',
]);

const PRODUCTION_METADATA_ARRAY_FIELDS = Object.freeze([
  'projectNames',
  'resourcePrefixes',
  'containerNames',
  'hostVisibleServiceNames',
  'ports',
  'networkNames',
  'networkSubnets',
  'volumeNames',
  'filesystemRoots',
  'backupRoots',
  'restoreRoots',
  'retrievalRoots',
  'deploymentStateRoots',
  'migrationMarkers',
  'lockFiles',
  'logDirectories',
  'databaseNames',
  'mongoReplicaSets',
  'mongoIdentities',
  'redisAuthorities',
  'caddyHosts',
  'tunnelHosts',
  'monitoringLabels',
  'alertLabels',
  'providerModes',
  'callbackUrls',
  'tunnelIds',
  'storageBuckets',
]);

export const REQUIRED_SERVICE_NETWORKS = Object.freeze({
  'staging-storage-init': [],
  'staging-media-permissions-init': [],
  'staging-logs-init': [],
  'staging-mongo-primary': ['staging-data'],
  'staging-mongo-replica-init': ['staging-data'],
  'staging-redis': ['staging-data'],
  'staging-api-ios': [
    'staging-app',
    'staging-data',
    'staging-egress',
    'staging-ingress',
  ],
  'staging-api-android': [
    'staging-app',
    'staging-data',
    'staging-egress',
    'staging-ingress',
  ],
  'staging-api-web': [
    'staging-app',
    'staging-data',
    'staging-egress',
    'staging-ingress',
  ],
  'staging-api-admin': [
    'staging-app',
    'staging-data',
    'staging-egress',
    'staging-ingress',
  ],
  'staging-worker': ['staging-app', 'staging-data', 'staging-ingress'],
  'staging-migrate': ['staging-data'],
  'staging-seed': ['staging-data'],
  'staging-user-web-app': [
    'staging-app',
    'staging-data',
    'staging-egress',
    'staging-ingress',
  ],
  'staging-web-app': ['staging-app', 'staging-ingress'],
  'staging-admin-panel': ['staging-app', 'staging-ingress'],
  'staging-livekit': ['staging-app', 'staging-ingress'],
  'staging-mail-capture': ['staging-app'],
  'staging-caddy': ['staging-app', 'staging-ingress'],
  'staging-alert-sink': ['staging-monitoring'],
  'staging-alert-fixture': ['staging-monitoring'],
  'staging-mongodb-exporter': ['staging-data', 'staging-monitoring'],
  'staging-redis-exporter': ['staging-data', 'staging-monitoring'],
  'staging-blackbox-exporter': [
    'staging-app',
    'staging-data',
    'staging-monitoring',
  ],
  'staging-prometheus': [
    'staging-app',
    'staging-data',
    'staging-ingress',
    'staging-monitoring',
  ],
  'staging-alertmanager': ['staging-egress', 'staging-monitoring'],
  'staging-alloy': ['staging-ingress', 'staging-monitoring'],
  'staging-loki': ['staging-ingress', 'staging-monitoring'],
  'staging-mongo-restore': ['staging-restore'],
  'staging-mongo-restore-replica-init': ['staging-restore'],
  'staging-backup-job': ['staging-data', 'staging-monitoring'],
  'staging-restore-job': ['staging-restore'],
});

export const EGRESS_SERVICE_NAMES = Object.freeze([
  'staging-alertmanager',
  'staging-api-ios',
  'staging-api-android',
  'staging-api-web',
  'staging-api-admin',
  'staging-user-web-app',
]);

const RESOURCE_ENVELOPE = Object.freeze({
  serviceMemoryBytes: 1024 * 1024 * 1024,
  serviceCpus: 1,
  servicePids: 256,
  aggregateMemoryBytes: 9 * 1024 * 1024 * 1024,
  aggregateCpus: 8,
  aggregatePids: 3584,
});

const PRIMARY_INITIALIZER_ENVIRONMENT = Object.freeze([
  'MONGO_STAGING_ROOT_USER',
  'MONGO_STAGING_ROOT_PASSWORD',
  'MONGO_STAGING_APP_USER',
  'MONGO_STAGING_APP_PASSWORD',
  'MONGO_STAGING_MIGRATION_USER',
  'MONGO_STAGING_MIGRATION_PASSWORD',
  'MONGO_STAGING_BACKUP_USER',
  'MONGO_STAGING_BACKUP_PASSWORD',
  'MONGO_STAGING_RESTORE_USER',
  'MONGO_STAGING_RESTORE_PASSWORD',
  'MONGO_STAGING_MONITOR_USER',
  'MONGO_STAGING_MONITOR_PASSWORD',
]);

const RESTORE_INITIALIZER_ENVIRONMENT = Object.freeze([
  'MONGO_STAGING_ROOT_USER',
  'MONGO_STAGING_ROOT_PASSWORD',
  'MONGO_STAGING_RESTORE_USER',
  'MONGO_STAGING_RESTORE_PASSWORD',
]);

const BOOKING_PROVIDER_ENVIRONMENT = Object.freeze([
  'BOOKING_PAYMENTS_ENABLED',
  'SUBSCRIPTION_PAYMENTS_ENABLED',
  'RAZORPAY_MODE',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS',
  'CHECKOUT_RETURN_URL',
]);
const BOOKING_WEBHOOK_ENVIRONMENT = Object.freeze([
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_WEBHOOK_SECRET_PREVIOUS',
]);
const PAYOUT_PROVIDER_ENVIRONMENT = Object.freeze([
  'PAYOUTS_ENABLED',
  'RAZORPAY_X_MODE',
  'RAZORPAY_X_KEY_ID',
  'RAZORPAY_X_KEY_SECRET',
  'RAZORPAY_X_WEBHOOK_SECRET',
  'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
]);
const RESEND_PROVIDER_ENVIRONMENT = Object.freeze([
  'RESEND_PROVIDER_ENABLED',
  'RESEND_MODE',
  'RESEND_API_KEY',
  'RESEND_API_URL',
  'EMAIL_FROM',
  'CONTACT_TO_EMAIL',
]);
const CLOUDINARY_PROVIDER_ENVIRONMENT = Object.freeze([
  'MEDIA_STORAGE_BACKEND',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_UPLOAD_PREFIX',
  'MEDIA_PUBLIC_BASE_URL',
  'UPLOAD_PATH',
]);
const PROVIDER_ENVIRONMENT_BY_SERVICE = Object.freeze({
  'staging-api-ios': Object.freeze([
    ...BOOKING_PROVIDER_ENVIRONMENT,
    ...BOOKING_WEBHOOK_ENVIRONMENT,
    ...RESEND_PROVIDER_ENVIRONMENT,
    ...CLOUDINARY_PROVIDER_ENVIRONMENT,
  ]),
  'staging-api-android': Object.freeze([
    ...RESEND_PROVIDER_ENVIRONMENT,
    ...CLOUDINARY_PROVIDER_ENVIRONMENT,
  ]),
  'staging-api-web': Object.freeze([
    ...RESEND_PROVIDER_ENVIRONMENT,
    'RESEND_WEBHOOK_SECRET',
    ...CLOUDINARY_PROVIDER_ENVIRONMENT,
  ]),
  'staging-api-admin': Object.freeze([
    ...PAYOUT_PROVIDER_ENVIRONMENT,
    ...RESEND_PROVIDER_ENVIRONMENT,
    ...CLOUDINARY_PROVIDER_ENVIRONMENT,
  ]),
  'staging-user-web-app': Object.freeze([
    ...RESEND_PROVIDER_ENVIRONMENT,
    'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  ]),
  'staging-mail-capture': Object.freeze([
    'MAIL_CAPTURE_API_KEY',
  ]),
});
const ALL_SCOPED_PROVIDER_ENVIRONMENT_KEYS = Object.freeze([
  ...new Set([
    ...Object.values(PROVIDER_ENVIRONMENT_BY_SERVICE).flat(),
    'MAIL_CAPTURE_API_KEY',
  ].filter(
    (key) => ![
      'BOOKING_PAYMENTS_ENABLED',
      'PAYOUTS_ENABLED',
    ].includes(key),
  )),
]);
const BACKEND_RUNTIME_SERVICE_NAMES = Object.freeze([
  'staging-api-ios',
  'staging-api-android',
  'staging-api-web',
  'staging-api-admin',
  'staging-worker',
  'staging-migrate',
  'staging-seed',
]);

export const REQUIRED_P0_ALERTS = Object.freeze([
  'WorkerQueueBacklogHigh',
  'BackupJobFailed',
  'PaymentProviderFailure',
  'PaymentWebhookFailure',
  'EmailDispatchFailed',
  'EmailDeliveryOutcomeFailed',
  'CallProviderFailure',
  'CallMediaFailure',
  'PrivilegedRoleChanged',
  'AdminRoleChanged',
  'UserAuthenticationFailureSpike',
  'CounsellorAuthenticationFailureSpike',
  'AdminAuthenticationMfaFailureSpike',
  'ElevatedHttp401Rate',
  'ElevatedHttp403Rate',
  'ElevatedHttp429Rate',
  'ElevatedHttp500Rate',
  'UserFrontendProbeFailed',
  'AdminFrontendProbeFailed',
  'CounsellorFrontendProbeFailed',
]);

const normalizePath = (value) => {
  const normalized = String(value).replaceAll('\\', '/');
  if (/^(?:[A-Za-z]:)?\/+$/.test(normalized)) {
    return normalized.startsWith('/') ? '/' : `${normalized.slice(0, 2)}/`;
  }
  return normalized.replace(/\/+$/, '');
};

const isWithin = (candidate, root) => {
  const left = normalizePath(candidate).toLowerCase();
  const right = normalizePath(root).toLowerCase();
  return left === right || left.startsWith(`${right}/`);
};

const normalizeComparable = (value) => (
  normalizePath(value).toLowerCase()
);

const equalSets = (left, right) => (
  left.size === right.size
  && [...left].every((value) => right.has(value))
);

const ipv4ToInteger = (value) => {
  const parts = String(value).split('.');
  if (
    parts.length !== 4
    || parts.some((part) => !/^(?:0|[1-9][0-9]{0,2})$/.test(part))
  ) {
    return null;
  }
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((part) => part > 255)) return null;
  return octets.reduce(
    (result, octet) => (result * 256) + octet,
    0,
  );
};

const cidrRange = (value) => {
  const match = String(value).match(/^([^/]+)\/([0-9]|[12][0-9]|3[0-2])$/);
  if (!match) return null;
  const address = ipv4ToInteger(match[1]);
  if (address === null) return null;
  const prefix = Number.parseInt(match[2], 10);
  const size = 2 ** (32 - prefix);
  const start = Math.floor(address / size) * size;
  return [start, start + size - 1];
};

const cidrsOverlap = (left, right) => {
  const leftRange = cidrRange(left);
  const rightRange = cidrRange(right);
  return Boolean(
    leftRange
    && rightRange
    && leftRange[0] <= rightRange[1]
    && rightRange[0] <= leftRange[1],
  );
};

export const validateProductionMetadata = (metadata) => {
  const errors = [];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return ['production metadata must be an object'];
  }
  if (metadata.schemaVersion !== 1) {
    errors.push('production metadata schemaVersion must equal 1');
  }
  if (
    typeof metadata.description !== 'string'
    || metadata.description.trim() === ''
  ) {
    errors.push('production metadata description is required');
  }
  for (const field of PRODUCTION_METADATA_ARRAY_FIELDS) {
    if (!Object.hasOwn(metadata, field) || !Array.isArray(metadata[field])) {
      errors.push(`production metadata ${field} array is required`);
      continue;
    }
    if (field === 'ports') {
      for (const port of metadata[field]) {
        if (
          !port
          || typeof port !== 'object'
          || typeof port.hostIp !== 'string'
          || !portRange(port.published)
          || !portRange(port.target)
          || !['tcp', 'udp'].includes(String(port.protocol || 'tcp'))
        ) {
          errors.push('production metadata contains an invalid port record');
          break;
        }
      }
      continue;
    }
    if (metadata[field].some(
      (entry) => typeof entry !== 'string' || entry.trim() === '',
    )) {
      errors.push(`production metadata ${field} contains an invalid value`);
    }
    const normalized = metadata[field].map(
      (entry) => String(entry).trim().toLowerCase(),
    );
    if (new Set(normalized).size !== normalized.length) {
      errors.push(`production metadata ${field} contains duplicates`);
    }
  }
  return errors;
};

const normalizeLabels = (labels) => {
  if (!labels) return {};
  if (!Array.isArray(labels)) return labels;
  return Object.fromEntries(labels.map((label) => {
    const separator = String(label).indexOf('=');
    return separator < 0
      ? [String(label), '']
      : [
        String(label).slice(0, separator),
        String(label).slice(separator + 1),
      ];
  }));
};

const normalizeEnvironment = (environment) => {
  if (!environment) return {};
  if (!Array.isArray(environment)) return environment;
  return Object.fromEntries(environment.map((entry) => {
    const separator = String(entry).indexOf('=');
    return separator < 0
      ? [String(entry), '']
      : [
        String(entry).slice(0, separator),
        String(entry).slice(separator + 1),
      ];
  }));
};

const normalizePort = (port, serviceName = '<unknown>') => {
  if (typeof port === 'string' || typeof port === 'number') {
    const source = String(port);
    const protocolParts = source.split('/');
    const protocol = protocolParts[1] || 'tcp';
    const addressParts = protocolParts[0].split(':');
    if (addressParts.length === 3) {
      return {
        serviceName,
        hostIp: addressParts[0],
        published: addressParts[1],
        target: addressParts[2],
        protocol,
      };
    }
    if (addressParts.length === 2) {
      return {
        serviceName,
        hostIp: '0.0.0.0',
        published: addressParts[0],
        target: addressParts[1],
        protocol,
      };
    }
    return {
      serviceName,
      hostIp: '0.0.0.0',
      published: addressParts[0],
      target: addressParts[0],
      protocol,
    };
  }
  return {
    serviceName,
    hostIp: String(port.host_ip || port.hostIp || '0.0.0.0'),
    published: String(port.published),
    target: String(port.target),
    protocol: String(port.protocol || 'tcp'),
  };
};

const portRange = (value) => {
  const [start, end = start] = String(value)
    .split('-')
    .map((part) => Number.parseInt(part, 10));
  return Number.isFinite(start) && Number.isFinite(end)
    ? [start, end]
    : null;
};

const portsOverlap = (left, right) => {
  if ((left.protocol || 'tcp') !== (right.protocol || 'tcp')) {
    return false;
  }
  const leftRange = portRange(left.published);
  const rightRange = portRange(right.published);
  return Boolean(
    leftRange
    && rightRange
    && leftRange[0] <= rightRange[1]
    && rightRange[0] <= leftRange[1],
  );
};

const normalizeMounts = (volumes) => (volumes || []).map((volume) => {
  if (typeof volume === 'string') {
    const parts = volume.split(':');
    return {
      type: parts[0].startsWith('/') || /^[A-Za-z]:[\\/]/.test(parts[0])
        ? 'bind'
        : 'volume',
      source: parts[0],
      target: parts[1] || '',
      readOnly: parts[2] === 'ro',
    };
  }
  return {
    type: volume.type || 'volume',
    source: volume.source,
    target: volume.target,
    readOnly: Boolean(volume.read_only || volume.readOnly),
  };
});

const stringValues = (value, output = []) => {
  if (typeof value === 'string') {
    output.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => stringValues(entry, output));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => stringValues(entry, output));
  }
  return output;
};

const topLevelResourceName = (key, model) => String(model?.name || key);

const requireStagingLabels = (
  errors,
  resourceType,
  resourceName,
  labels,
  project,
) => {
  const normalized = normalizeLabels(labels);
  if (normalized['com.menorah.environment'] !== 'staging') {
    errors.push(`${resourceType} ${resourceName} lacks environment=staging`);
  }
  if (normalized['com.menorah.project'] !== project) {
    errors.push(
      `${resourceType} ${resourceName} project label must equal ${project}`,
    );
  }
  if (normalized['com.menorah.stack'] !== 'server-staging') {
    errors.push(`${resourceType} ${resourceName} lacks server-staging label`);
  }
};

const extractNetworkAliases = (networkModel) => {
  if (!networkModel || Array.isArray(networkModel)) return [];
  return Object.values(networkModel).flatMap(
    (config) => config?.aliases || [],
  );
};

const environmentValues = (environment, keys) => keys
  .map((key) => environment[key])
  .filter((value) => typeof value === 'string' && value.trim() !== '');

const redisAuthorities = (environment) => environmentValues(
  environment,
  ['REDIS_URL', 'REDIS_MONITORING_URL'],
).flatMap((value) => {
  try {
    const url = new URL(value);
    return [url.hostname, url.host];
  } catch {
    return [];
  }
});

const validateProductionCollisions = (
  errors,
  environment,
  productionMetadata,
) => {
  const contracts = [
    {
      label: 'Compose project',
      staging: [environment.MENORAH_SERVER_STAGING_PROJECT_NAME],
      production: productionMetadata.projectNames,
    },
    {
      label: 'resource prefix',
      staging: [environment.MENORAH_SERVER_STAGING_RESOURCE_PREFIX],
      production: productionMetadata.resourcePrefixes,
    },
    {
      label: 'filesystem root',
      staging: environmentValues(environment, [
        'MENORAH_SERVER_STAGING_ROOT',
        'MENORAH_SERVER_STAGING_DATA_ROOT',
        'MENORAH_SERVER_STAGING_BACKUP_ROOT',
        'MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT',
        'MENORAH_SERVER_STAGING_LOGS_ROOT',
        'MENORAH_SERVER_STAGING_ENV_ROOT',
        'MENORAH_SERVER_STAGING_APP_ROOT',
        'MENORAH_DATA_ROOT',
        'MENORAH_BACKUP_ROOT',
        'MENORAH_DEPLOY_STATE_ROOT',
        'MENORAH_LOG_ROOT',
        'MENORAH_ENV_ROOT',
        'MENORAH_APP_ROOT',
      ]),
      production: productionMetadata.filesystemRoots,
      pathLike: true,
      containment: true,
    },
    {
      label: 'backup root',
      staging: environmentValues(environment, [
        'MENORAH_SERVER_STAGING_BACKUP_ROOT',
        'MENORAH_BACKUP_ROOT',
      ]),
      production: productionMetadata.backupRoots,
      pathLike: true,
      containment: true,
    },
    {
      label: 'restore root',
      staging: environmentValues(environment, ['MENORAH_RESTORE_ROOT']),
      production: productionMetadata.restoreRoots,
      pathLike: true,
      containment: true,
    },
    {
      label: 'retrieval root',
      staging: environmentValues(environment, ['MENORAH_RETRIEVAL_ROOT']),
      production: productionMetadata.retrievalRoots,
      pathLike: true,
      containment: true,
    },
    {
      label: 'deployment-state root',
      staging: environmentValues(environment, [
        'MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT',
        'MENORAH_DEPLOY_STATE_ROOT',
      ]),
      production: productionMetadata.deploymentStateRoots,
      pathLike: true,
      containment: true,
    },
    {
      label: 'migration marker',
      staging: environmentValues(environment, [
        'MENORAH_MIGRATION_APPLIED_MARKER',
        'MENORAH_MIGRATION_IN_PROGRESS_MARKER',
        'MENORAH_IDENTITY_RECONCILIATION_MARKER',
        'MENORAH_POST_MIGRATION_RECOVERY_MARKER',
      ]),
      production: productionMetadata.migrationMarkers,
      pathLike: true,
    },
    {
      label: 'lock file',
      staging: environmentValues(environment, [
        'BACKUP_LOCK_FILE',
        'MENORAH_DEPLOY_LOCK_FILE',
        'MENORAH_ROLLBACK_LOCK_FILE',
      ]),
      production: productionMetadata.lockFiles,
      pathLike: true,
    },
    {
      label: 'log directory',
      staging: environmentValues(environment, [
        'MENORAH_SERVER_STAGING_LOGS_ROOT',
        'MENORAH_LOG_ROOT',
      ]),
      production: productionMetadata.logDirectories,
      pathLike: true,
      containment: true,
    },
    {
      label: 'database name',
      staging: environmentValues(environment, [
        'MONGO_DATABASE',
        'MONGO_RESTORE_DATABASE',
      ]),
      production: productionMetadata.databaseNames,
    },
    {
      label: 'Mongo replica set',
      staging: environmentValues(environment, [
        'MONGODB_REPLICA_SET_NAME',
        'MONGODB_RESTORE_REPLICA_SET_NAME',
      ]),
      production: productionMetadata.mongoReplicaSets,
    },
    {
      label: 'Mongo identity',
      staging: environmentValues(environment, [
        'MONGO_STAGING_ROOT_USER',
        'MONGO_STAGING_APP_USER',
        'MONGO_STAGING_MIGRATION_USER',
        'MONGO_STAGING_BACKUP_USER',
        'MONGO_STAGING_RESTORE_USER',
        'MONGO_STAGING_MONITOR_USER',
      ]),
      production: productionMetadata.mongoIdentities,
    },
    {
      label: 'Redis authority',
      staging: redisAuthorities(environment),
      production: productionMetadata.redisAuthorities,
    },
    {
      label: 'monitoring label',
      staging: [
        `environment=${environment.PROMETHEUS_EXTERNAL_ENVIRONMENT}`,
        `project=${environment.PROMETHEUS_EXTERNAL_PROJECT}`,
      ],
      production: productionMetadata.monitoringLabels,
    },
    {
      label: 'alert label',
      staging: [`environment=${environment.ALERTMANAGER_ENVIRONMENT}`],
      production: productionMetadata.alertLabels,
    },
    {
      label: 'provider mode',
      staging: [
        `razorpay=${environment.RAZORPAY_MODE}`,
        `razorpayx=${environment.RAZORPAY_X_MODE}`,
        `resend=${environment.RESEND_MODE}`,
      ],
      production: productionMetadata.providerModes,
    },
    {
      label: 'callback URL',
      staging: Object.entries(environment)
        .filter(([key, value]) => (
          /(?:URL|ORIGIN)$/.test(key)
          && typeof value === 'string'
          && /^(?:https?|wss):\/\//i.test(value)
        ))
        .map(([, value]) => value),
      production: productionMetadata.callbackUrls,
    },
  ];

  for (const contract of contracts) {
    const production = (contract.production || []).map(normalizeComparable);
    for (const stagingValue of contract.staging.filter(Boolean)) {
      const staging = normalizeComparable(stagingValue);
      const collides = production.some((productionValue) => (
        contract.containment
          ? (
            isWithin(staging, productionValue)
            || isWithin(productionValue, staging)
          )
          : staging === productionValue
      ));
      if (collides) {
        errors.push(`${contract.label} collides with production metadata`);
      }
    }
  }
};

const validateRoleUse = (errors, services, environment) => {
  const contracts = [
    [
      /^staging-api-|^staging-worker$|^staging-user-web-app$/,
      'MONGO_STAGING_APP_USER',
      'MONGODB_URI',
    ],
    [
      /^staging-(?:migrate|seed)$/,
      'MONGO_STAGING_MIGRATION_USER',
      'MONGODB_URI',
    ],
    [
      /^staging-backup-job$/,
      'MONGO_STAGING_BACKUP_USER',
      'MONGODB_STAGING_BACKUP_URI',
    ],
    [
      /^staging-mongodb-exporter$/,
      'MONGO_STAGING_MONITOR_USER',
      'MONGODB_URI',
    ],
    [
      /^staging-restore-job$/,
      'MONGO_STAGING_RESTORE_USER',
      'MONGODB_STAGING_RESTORE_URI',
    ],
  ];
  for (const [serviceName, service] of Object.entries(services)) {
    const serviceEnvironment = normalizeEnvironment(service.environment);
    for (const [pattern, userKey, uriKey] of contracts) {
      if (!pattern.test(serviceName)) continue;
      const value = serviceEnvironment[uriKey];
      if (typeof value !== 'string' || !value.startsWith('mongodb')) {
        errors.push(`${serviceName} must receive ${uriKey}`);
        continue;
      }
      try {
        if (
          decodeURIComponent(new URL(value).username)
          !== environment[userKey]
        ) {
          errors.push(
            `${serviceName} ${uriKey} uses the wrong MongoDB role`,
          );
        }
      } catch {
        errors.push(`${serviceName} ${uriKey} is not a valid MongoDB URI`);
      }
    }
    if (
      /^staging-api-|^staging-worker$|^staging-user-web-app$/
        .test(serviceName)
    ) {
      const forbidden = Object.entries(serviceEnvironment).filter(
        ([key, value]) => (
          /(?:ROOT|MIGRATION|BACKUP|RESTORE|MONITOR).*(?:PASSWORD|URI)/.test(key)
          && typeof value === 'string'
          && value.trim() !== ''
        ),
      );
      if (forbidden.length > 0) {
        errors.push(
          `${serviceName} receives privileged MongoDB credentials`,
        );
      }
    }
  }
};

const completedDependency = (service, dependency) => (
  service?.depends_on?.[dependency]?.condition
  === 'service_completed_successfully'
);

const volumeSourceNames = (volumes, source) => new Set(
  [
    source,
    volumes?.[source]?.name,
  ].filter(Boolean).map(String),
);

const contractMountPresent = (
  service,
  volumes,
  contract,
  { requireWritable = true } = {},
) => normalizeMounts(service?.volumes).some((mount) => (
  mount.type === 'volume'
  && volumeSourceNames(volumes, contract.source).has(String(mount.source))
  && mount.target === contract.target
  && (!requireWritable || !mount.readOnly)
));

const serviceNetworkNames = (service) => {
  if (!service?.networks) return new Set();
  return new Set(
    Array.isArray(service.networks)
      ? service.networks.map(String)
      : Object.keys(service.networks),
  );
};

const validateNetworkTopology = (errors, services) => {
  for (const [serviceName, expectedNames] of Object.entries(
    REQUIRED_SERVICE_NETWORKS,
  )) {
    const service = services[serviceName];
    if (!service) {
      errors.push(`missing required staging service ${serviceName}`);
      continue;
    }
    const actual = serviceNetworkNames(service);
    const expected = new Set(expectedNames);
    if (!equalSets(actual, expected)) {
      errors.push(`${serviceName} has an invalid network topology`);
    }
    if (
      expected.size === 0
      && service.network_mode !== 'none'
    ) {
      errors.push(`${serviceName} must use network_mode=none`);
    }
  }
};

const mountMatches = (mount, volumes, contract) => {
  if (
    mount.type !== contract.type
    || mount.target !== contract.target
    || mount.readOnly !== contract.readOnly
  ) {
    return false;
  }
  if (contract.type === 'bind') {
    return (
      normalizeComparable(mount.source)
      === normalizeComparable(contract.source)
    );
  }
  return volumeSourceNames(volumes, contract.source)
    .has(String(mount.source));
};

const validateRequiredMounts = (
  errors,
  serviceName,
  service,
  volumes,
  contracts,
) => {
  const mounts = normalizeMounts(service?.volumes);
  for (const contract of contracts) {
    const matching = mounts.filter(
      (mount) => mountMatches(mount, volumes, contract),
    );
    if (matching.length !== 1) {
      errors.push(
        `${serviceName} must mount ${contract.target} exactly once as `
        + `${contract.readOnly ? 'read-only' : 'writable'}`,
      );
    }
  }
};

const validateRecoveryMounts = (
  errors,
  services,
  volumes,
  environment,
) => {
  const stateContract = {
    type: 'bind',
    source: environment.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT,
    target: '/opt/menorah-staging/deploy-state',
    readOnly: false,
  };
  const stateOwners = [
    'staging-storage-init',
    'staging-backup-job',
    'staging-restore-job',
  ];
  for (const serviceName of stateOwners) {
    validateRequiredMounts(
      errors,
      serviceName,
      services[serviceName],
      volumes,
      [stateContract],
    );
  }
  for (const [serviceName, service] of Object.entries(services)) {
    const stateMounts = normalizeMounts(service.volumes).filter(
      (mount) => (
        mount.target === stateContract.target
        && !mount.readOnly
      ),
    );
    if (stateMounts.length > 0 && !stateOwners.includes(serviceName)) {
      errors.push(
        `${serviceName} has unauthorized writable deployment-state access`,
      );
    }
  }
  if (volumes['staging-deploy-state']) {
    errors.push('deployment state must not use a hidden Compose volume');
  }

  const backupContracts = [
    ['staging-filesystem-root', '/opt/menorah-staging', true],
    ['staging-app-root', '/opt/menorah-staging/app', true],
    ['staging-data-root', '/opt/menorah-staging/data', true],
    ['staging-backups', '/opt/menorah-staging/backups', false],
    [
      'staging-retrieval',
      '/opt/menorah-staging/data/backup-retrieval',
      false,
    ],
    ['staging-uploads', '/opt/menorah-staging/data/uploads', true],
    [
      'staging-managed-media',
      '/opt/menorah-staging/data/managed-media',
      true,
    ],
    ['staging-logs', '/opt/menorah-staging/logs', true],
    ['staging-env-root', '/opt/menorah-staging/env', true],
  ].map(([source, target, readOnly]) => ({
    type: 'volume',
    source,
    target,
    readOnly,
  }));
  validateRequiredMounts(
    errors,
    'staging-backup-job',
    services['staging-backup-job'],
    volumes,
    backupContracts,
  );

  const restoreContracts = [
    ['staging-filesystem-root', '/opt/menorah-staging', true],
    ['staging-app-root', '/opt/menorah-staging/app', true],
    ['staging-data-root', '/opt/menorah-staging/data', true],
    ['staging-backups', '/opt/menorah-staging/backups', true],
    [
      'staging-retrieval',
      '/opt/menorah-staging/data/backup-retrieval',
      true,
    ],
    ['staging-restore-root', '/opt/menorah-staging/data/restore', false],
    [
      'staging-restore-media',
      '/opt/menorah-staging/data/restore-media',
      false,
    ],
    ['staging-logs', '/opt/menorah-staging/logs', true],
    ['staging-env-root', '/opt/menorah-staging/env', true],
  ].map(([source, target, readOnly]) => ({
    type: 'volume',
    source,
    target,
    readOnly,
  }));
  validateRequiredMounts(
    errors,
    'staging-restore-job',
    services['staging-restore-job'],
    volumes,
    restoreContracts,
  );
};

const validateInitializerIsolation = (errors, services) => {
  const contracts = [
    {
      serviceName: 'staging-mongo-replica-init',
      environment: PRIMARY_INITIALIZER_ENVIRONMENT,
      profile: null,
      dependency: 'staging-mongo-primary',
      identity: [
        'menorah-staging-rs',
        'staging-mongo-primary:27017',
      ],
    },
    {
      serviceName: 'staging-mongo-restore-replica-init',
      environment: RESTORE_INITIALIZER_ENVIRONMENT,
      profile: 'recovery',
      dependency: 'staging-mongo-restore',
      identity: [
        'menorah-staging-restore-rs',
        'staging-mongo-restore:27017',
      ],
    },
  ];
  for (const contract of contracts) {
    const service = services[contract.serviceName];
    if (!service) continue;
    if (service.env_file) {
      errors.push(`${contract.serviceName} must not load a broad env file`);
    }
    const actualKeys = new Set(
      Object.keys(normalizeEnvironment(service.environment)),
    );
    const expectedKeys = new Set(contract.environment);
    if (!equalSets(actualKeys, expectedKeys)) {
      errors.push(
        `${contract.serviceName} must receive only its exact Mongo identities`,
      );
    }
    const profiles = new Set((service.profiles || []).map(String));
    const expectedProfiles = new Set(
      contract.profile ? [contract.profile] : [],
    );
    if (!equalSets(profiles, expectedProfiles)) {
      errors.push(`${contract.serviceName} has an invalid profile`);
    }
    if (
      String(service.restart ?? 'no') !== 'no'
      || service?.depends_on?.[contract.dependency]?.condition
        !== 'service_healthy'
    ) {
      errors.push(
        `${contract.serviceName} must be a dependency-gated one-shot`,
      );
    }
    const command = stringValues(service.command).join('\n');
    for (const identity of contract.identity) {
      if (!command.includes(identity)) {
        errors.push(
          `${contract.serviceName} must verify ${identity}`,
        );
      }
    }
  }
  if (
    !completedDependency(
      services['staging-restore-job'],
      'staging-mongo-restore-replica-init',
    )
  ) {
    errors.push(
      'staging-restore-job must wait for restore replica initialization',
    );
  }
};

const validateBackendRuntimeContracts = (
  errors,
  services,
  volumes,
  environment,
) => {
  const directNodeTasks = [
    ['staging-migrate', ['node', 'src/database/migrate.js']],
    ['staging-seed', ['node', 'src/database/seed-server-staging.js']],
  ];
  for (const [serviceName, expectedCommand] of directNodeTasks) {
    const service = services[serviceName];
    if (!service) {
      errors.push(`missing backend runtime task ${serviceName}`);
      continue;
    }
    const command = Array.isArray(service.command)
      ? service.command.map(String)
      : [];
    if (
      command.length !== expectedCommand.length
      || command.some((token, index) => token !== expectedCommand[index])
    ) {
      errors.push(`${serviceName} must invoke its Node script directly`);
    }
  }

  const backupJob = services['staging-backup-job'];
  if (!backupJob) {
    errors.push('missing staging-backup-job');
  } else {
    const backupCapabilities = (backupJob.cap_add || [])
      .map((capability) => String(capability).toUpperCase())
      .sort();
    if (
      String(backupJob.user) !== '0:0'
      || backupCapabilities.join(',') !== 'DAC_READ_SEARCH'
    ) {
      errors.push(
        'staging-backup-job must have only root DAC_READ_SEARCH access',
      );
    }
  }

  for (const serviceName of [
    'staging-backup-job',
    'staging-restore-job',
  ]) {
    const jobEnvironment = normalizeEnvironment(
      services[serviceName]?.environment,
    );
    if (jobEnvironment.HOME !== '/tmp') {
      errors.push(
        `${serviceName} must use writable /tmp as HOME for clean manifests`,
      );
    }
  }

  validateNetworkTopology(errors, services);
  validateRecoveryMounts(errors, services, volumes, environment);
  validateInitializerIsolation(errors, services);

  const storageInit = services['staging-storage-init'];
  const permissionsInit = services['staging-media-permissions-init'];
  if (!storageInit) {
    errors.push('missing staging-storage-init');
  } else {
    const storageCapabilities = (storageInit.cap_add || [])
      .map((capability) => String(capability).toUpperCase())
      .sort();
    if (
      String(storageInit.user) !== '0:0'
      || storageInit.read_only !== true
      || storageInit.network_mode !== 'none'
      || String(storageInit.restart ?? 'no') !== 'no'
      || storageCapabilities.join(',')
        !== ['DAC_OVERRIDE', 'FOWNER'].sort().join(',')
    ) {
      errors.push(
        'staging-storage-init must have only repeat-safe root filesystem capabilities',
      );
    }
  }
  if (!permissionsInit) {
    errors.push('missing staging-media-permissions-init');
    return;
  }

  if (String(permissionsInit.user) !== '0:0') {
    errors.push('staging-media-permissions-init must run as root');
  }
  if (permissionsInit.read_only !== true) {
    errors.push('staging-media-permissions-init root filesystem must be read-only');
  }
  if (permissionsInit.network_mode !== 'none') {
    errors.push('staging-media-permissions-init must disable networking');
  }
  if ((permissionsInit.profiles || []).length > 0) {
    errors.push('staging-media-permissions-init must run in the default profile');
  }
  const capabilities = (permissionsInit.cap_add || [])
    .map((capability) => String(capability).toUpperCase())
    .sort();
  if (
    capabilities.join(',')
    !== ['CHOWN', 'DAC_OVERRIDE', 'FOWNER'].sort().join(',')
  ) {
    errors.push(
      'staging-media-permissions-init must have only ownership capabilities',
    );
  }
  const entrypoint = Array.isArray(permissionsInit.entrypoint)
    ? permissionsInit.entrypoint.map(String)
    : [];
  if (
    entrypoint.length !== 2
    || entrypoint[0] !== '/bin/sh'
    || entrypoint[1] !== '-euc'
  ) {
    errors.push('staging-media-permissions-init must use the guarded shell entrypoint');
  }
  const permissionsCommand = stringValues(permissionsInit.command).join('\n');
  for (const [pattern, message] of [
    [/\bid -u menorah\b/, 'resolve the backend user UID'],
    [/\bid -g menorah\b/, 'resolve the backend user GID'],
    [/\breadlink -f\b/, 'verify canonical media roots'],
    [/\bfind\b[\s\S]*-xdev[\s\S]*-type l/, 'reject media-volume symlinks'],
    [/\bchown -R\b/, 'initialize recursive ownership'],
    [/\bchmod 0750\b/, 'restrict media-root permissions'],
  ]) {
    if (!pattern.test(permissionsCommand)) {
      errors.push(`staging-media-permissions-init must ${message}`);
    }
  }
  for (const { target } of MEDIA_VOLUME_CONTRACTS) {
    if (!permissionsCommand.includes(target)) {
      errors.push(`staging-media-permissions-init must constrain ${target}`);
    }
  }

  const permissionsMounts = normalizeMounts(permissionsInit.volumes);
  if (
    permissionsMounts.length !== MEDIA_VOLUME_CONTRACTS.length
    || MEDIA_VOLUME_CONTRACTS.some(
      (contract) => !contractMountPresent(
        permissionsInit,
        volumes,
        contract,
      ),
    )
  ) {
    errors.push(
      'staging-media-permissions-init must mount only the two writable media volumes',
    );
  }
  if (!completedDependency(permissionsInit, 'staging-storage-init')) {
    errors.push(
      'staging-media-permissions-init must wait for staging-storage-init completion',
    );
  }

  for (const serviceName of MEDIA_WRITER_SERVICES) {
    const writer = services[serviceName];
    if (!writer) {
      errors.push(`missing media writer ${serviceName}`);
      continue;
    }
    if (writer.image !== permissionsInit.image) {
      errors.push(
        `${serviceName} and staging-media-permissions-init must use the same backend image`,
      );
    }
    for (const contract of MEDIA_VOLUME_CONTRACTS) {
      if (!contractMountPresent(writer, volumes, contract)) {
        errors.push(
          `${serviceName} must mount ${contract.source} at ${contract.target}`,
        );
      }
    }
    if (!completedDependency(writer, 'staging-media-permissions-init')) {
      errors.push(
        `${serviceName} must wait for staging-media-permissions-init completion`,
      );
    }
  }

  const exemptWriters = new Set([
    'staging-storage-init',
    'staging-media-permissions-init',
    ...MEDIA_WRITER_SERVICES,
  ]);
  for (const [serviceName, service] of Object.entries(services)) {
    if (exemptWriters.has(serviceName)) continue;
    const mounts = normalizeMounts(service.volumes);
    const writesMediaVolume = mounts.some((mount) => (
      mount.type === 'volume'
      && !mount.readOnly
      && MEDIA_VOLUME_CONTRACTS.some((contract) => (
        volumeSourceNames(volumes, contract.source)
          .has(String(mount.source))
      ))
    ));
    if (
      writesMediaVolume
      && !completedDependency(service, 'staging-media-permissions-init')
    ) {
      errors.push(
        `${serviceName} writes a media volume without waiting for ownership initialization`,
      );
    }
  }
};

const validateProviderEnvironmentScope = (
  errors,
  services,
  environment,
) => {
  for (const serviceName of BACKEND_RUNTIME_SERVICE_NAMES) {
    const serviceEnvironment = normalizeEnvironment(
      services[serviceName]?.environment,
    );
    if (
      String(serviceEnvironment.BOOKING_SERVICE_CATALOG_JSON)
      !== String(environment.BOOKING_SERVICE_CATALOG_JSON)
    ) {
      errors.push(
        `${serviceName} must receive the exact shared booking service catalog`,
      );
    }
  }

  for (const [serviceName, expectedKeys] of Object.entries(
    PROVIDER_ENVIRONMENT_BY_SERVICE,
  )) {
    const serviceEnvironment = normalizeEnvironment(
      services[serviceName]?.environment,
    );
    const expected = new Set(expectedKeys);
    for (const key of ALL_SCOPED_PROVIDER_ENVIRONMENT_KEYS) {
      const present = Object.hasOwn(serviceEnvironment, key);
      if (!expected.has(key)) {
        if (present) {
          errors.push(
            `${serviceName} must not receive provider-scoped ${key}`,
          );
        }
        continue;
      }
      if (!present || String(serviceEnvironment[key])
        !== String(environment[key])) {
        errors.push(
          `${serviceName} must receive the exact reviewed ${key}`,
        );
      }
    }
  }

  for (const [serviceName, service] of Object.entries(services)) {
    if (Object.hasOwn(PROVIDER_ENVIRONMENT_BY_SERVICE, serviceName)) {
      continue;
    }
    const serviceEnvironment = normalizeEnvironment(service.environment);
    for (const key of ALL_SCOPED_PROVIDER_ENVIRONMENT_KEYS) {
      if (Object.hasOwn(serviceEnvironment, key)) {
        errors.push(
          `${serviceName} must not receive provider-scoped ${key}`,
        );
      }
    }
  }

  const mailCaptureEnvironment = normalizeEnvironment(
    services['staging-mail-capture']?.environment,
  );
  if (
    String(mailCaptureEnvironment.MAIL_CAPTURE_API_KEY)
    !== String(environment.MAIL_CAPTURE_API_KEY)
    || Object.hasOwn(mailCaptureEnvironment, 'RESEND_API_KEY')
  ) {
    errors.push(
      'staging-mail-capture must receive only its isolated capture key',
    );
  }

  const exactFlags = {
    'staging-api-ios': {
      BOOKING_PAYMENTS_ENABLED: environment.BOOKING_PAYMENTS_ENABLED,
      PAYOUTS_ENABLED: 'false',
    },
    'staging-api-android': {
      BOOKING_PAYMENTS_ENABLED: 'false',
      PAYOUTS_ENABLED: 'false',
    },
    'staging-api-web': {
      BOOKING_PAYMENTS_ENABLED: 'false',
      PAYOUTS_ENABLED: 'false',
    },
    'staging-api-admin': {
      BOOKING_PAYMENTS_ENABLED: 'false',
      PAYOUTS_ENABLED: environment.PAYOUTS_ENABLED,
    },
    'staging-worker': {
      BOOKING_PAYMENTS_ENABLED: 'false',
      PAYOUTS_ENABLED: 'false',
    },
  };
  for (const [serviceName, expected] of Object.entries(exactFlags)) {
    const serviceEnvironment = normalizeEnvironment(
      services[serviceName]?.environment,
    );
    for (const [key, value] of Object.entries(expected)) {
      if (String(serviceEnvironment[key]) !== String(value)) {
        errors.push(
          `${serviceName} must render ${key}=${value}`,
        );
      }
    }
  }
  for (const [serviceName, service] of Object.entries(services)) {
    if (Object.hasOwn(exactFlags, serviceName)) continue;
    const serviceEnvironment = normalizeEnvironment(service.environment);
    for (const key of [
      'BOOKING_PAYMENTS_ENABLED',
      'PAYOUTS_ENABLED',
    ]) {
      if (Object.hasOwn(serviceEnvironment, key)) {
        errors.push(
          `${serviceName} must not receive provider gate ${key}`,
        );
      }
    }
  }

  const disabledIdentityKeys = [
    'GOOGLE_WEB_CLIENT_ID',
    'GOOGLE_IOS_CLIENT_ID',
    'GOOGLE_ANDROID_CLIENT_ID',
    'APPLE_IOS_BUNDLE_ID',
    'APPLE_WEB_SERVICE_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
    'SOCIAL_STUDIO_OPENAI_API_KEY',
    'SOCIAL_TOKEN_ENCRYPTION_KEY',
    'META_APP_ID',
    'META_APP_SECRET',
  ];
  for (const serviceName of BACKEND_RUNTIME_SERVICE_NAMES) {
    const serviceEnvironment = normalizeEnvironment(
      services[serviceName]?.environment,
    );
    for (const key of [
      'APPLE_SIGN_IN_ENABLED',
      'ENABLE_SOCIAL_SCHEDULER',
      'SOCIAL_STUDIO_ENABLED',
      'SOCIAL_STUDIO_AUTO_PUBLISH',
    ]) {
      if (serviceEnvironment[key] !== 'false') {
        errors.push(
          `${serviceName} must render disabled Apple/social gate ${key}`,
        );
      }
    }
    for (const key of disabledIdentityKeys) {
      if (serviceEnvironment[key] !== '') {
        errors.push(
          `${serviceName} must render empty disabled provider identity ${key}`,
        );
      }
    }
  }
};

const extraHostEntries = (extraHosts) => {
  if (!extraHosts) return [];
  if (!Array.isArray(extraHosts)) {
    return Object.entries(extraHosts).map(([host, address]) => (
      [String(host), String(address)]
    ));
  }
  return extraHosts.map((entry) => {
    const text = String(entry);
    const separator = text.includes('=')
      ? text.indexOf('=')
      : text.lastIndexOf(':');
    return separator < 0
      ? [text, '']
      : [text.slice(0, separator), text.slice(separator + 1)];
  });
};

const normalizeExtraHosts = (extraHosts) => (
  Object.fromEntries(extraHostEntries(extraHosts))
);

const validateRenderedNetworkInputs = (
  errors,
  services,
  networks,
  environment,
) => {
  for (const { name, subnetKey, rangeKey } of NETWORK_CONTRACTS) {
    const config = networks[`staging-${name}`]?.ipam?.config || [];
    if (
      config.length !== 1
      || config[0].subnet !== environment[subnetKey]
      || (config[0].ip_range || config[0].ipRange)
        !== environment[rangeKey]
    ) {
      errors.push(
        `staging-${name} subnet and dynamic range must exactly match the reviewed environment`,
      );
    }
  }

  const caddyNetworks = services['staging-caddy']?.networks;
  if (
    Array.isArray(caddyNetworks)
    || caddyNetworks?.['staging-app']?.ipv4_address
      !== environment.MENORAH_SERVER_STAGING_CADDY_APP_IP
  ) {
    errors.push(
      'staging-caddy must use the exact reviewed static app address',
    );
  }
  const caddy = services['staging-caddy'];
  const caddyReadinessEntries = extraHostEntries(
    caddy?.extra_hosts,
  );
  const caddyReadinessHosts = Object.fromEntries(caddyReadinessEntries);
  if (
    caddyReadinessEntries.length !== EXPECTED_HOSTS.length
    || Object.keys(caddyReadinessHosts).length !== EXPECTED_HOSTS.length
    || EXPECTED_HOSTS.some(
      (host) => caddyReadinessHosts[host] !== '127.0.0.1',
    )
  ) {
    errors.push(
      'staging-caddy TLS readiness hosts must resolve only to its own loopback',
    );
  }
  const caddyEnvironment = normalizeEnvironment(caddy?.environment);
  if (
    Object.keys(caddyEnvironment).some(
      (key) => /^(?:ALL|FTP|HTTP|HTTPS|NO)_PROXY$/i.test(key),
    )
  ) {
    errors.push(
      'staging-caddy TLS readiness must not inherit proxy environment',
    );
  }
  const caddyHealthTest = caddy?.healthcheck?.test;
  const expectedCaddyHealthCommand = EXPECTED_HOSTS.map(
    (host) => (
      'wget --no-check-certificate -Y off -qO- '
      + `https://${host}/healthz | grep -qx ok`
    ),
  ).join(' && ');
  if (
    !Array.isArray(caddyHealthTest)
    || caddyHealthTest.length !== 2
    || caddyHealthTest[0] !== 'CMD-SHELL'
    || caddyHealthTest[1] !== expectedCaddyHealthCommand
  ) {
    errors.push(
      'staging-caddy healthcheck must prove every reviewed HTTPS certificate ready',
    );
  }
  for (const serviceName of [
    'staging-api-ios',
    'staging-api-android',
    'staging-api-web',
    'staging-api-admin',
  ]) {
    const serviceEnvironment = normalizeEnvironment(
      services[serviceName]?.environment,
    );
    if (
      serviceEnvironment.TRUST_PROXY
      !== environment.MENORAH_SERVER_STAGING_CADDY_APP_IP
    ) {
      errors.push(
        `${serviceName} TRUST_PROXY must equal the reviewed Caddy address`,
      );
    }
  }

  const monitoringHosts = normalizeExtraHosts(
    services['staging-blackbox-exporter']?.extra_hosts,
  );
  if (
    Object.keys(monitoringHosts).length !== EXPECTED_HOSTS.length
    || EXPECTED_HOSTS.some(
      (host) => (
        monitoringHosts[host]
        !== environment.MENORAH_SERVER_STAGING_CADDY_APP_IP
      ),
    )
  ) {
    errors.push(
      'blackbox monitoring hosts must resolve only to the reviewed Caddy address',
    );
  }
};

export const validateRenderedCompose = (
  model,
  environment,
  productionMetadata,
) => {
  const metadata = (
    productionMetadata
    && typeof productionMetadata === 'object'
    && !Array.isArray(productionMetadata)
  ) ? productionMetadata : {};
  const errors = [
    ...validateProductionMetadata(productionMetadata),
  ];
  const project = environment.MENORAH_SERVER_STAGING_PROJECT_NAME;
  const prefix = environment.MENORAH_SERVER_STAGING_RESOURCE_PREFIX;
  validateProductionCollisions(errors, environment, metadata);
  if (model.name !== project) {
    errors.push(`rendered Compose name must be ${project}`);
  }
  if (![REAL_PROJECT, VALIDATION_PROJECT].includes(model.name)) {
    errors.push('rendered Compose uses an unapproved project');
  }

  const services = model.services || {};
  const serviceNames = Object.keys(services);
  if (serviceNames.length === 0) errors.push('rendered Compose has no services');
  for (const serviceName of serviceNames) {
    if (!serviceName.startsWith('staging-')) {
      errors.push(`service ${serviceName} is not staging-prefixed`);
    }
  }

  const expectedPorts = new Set(
    EXPECTED_PUBLISHED_PORTS.map(([published, protocol]) => (
      `${published}/${protocol}`
    )),
  );
  const renderedPorts = [];
  const bindMounts = [];
  let aggregateMemoryBytes = 0;
  let aggregateCpus = 0;
  let aggregatePids = 0;
  for (const [serviceName, service] of Object.entries(services)) {
    const labels = normalizeLabels(service.labels);
    requireStagingLabels(
      errors,
      'service',
      serviceName,
      labels,
      project,
    );
    if (
      service.container_name
      && !service.container_name.startsWith(`${prefix}-`)
    ) {
      errors.push(`${serviceName} has a non-staging container_name`);
    }
    if (
      (metadata.containerNames || [])
        .includes(service.container_name)
    ) {
      errors.push(`${serviceName} container_name collides with production`);
    }
    if (service.privileged === true) {
      errors.push(`${serviceName} must not be privileged`);
    }
    if (
      service.network_mode === 'host'
      || service.pid === 'host'
      || service.ipc === 'host'
    ) {
      errors.push(`${serviceName} shares a host namespace`);
    }
    if (
      service.network_mode
      && !['none'].includes(service.network_mode)
    ) {
      errors.push(`${serviceName} uses forbidden network_mode`);
    }
    const capDrop = service.cap_drop || [];
    if (!capDrop.includes('ALL')) {
      errors.push(`${serviceName} must drop all Linux capabilities`);
    }
    const securityOptions = service.security_opt || [];
    const noNewPrivilegesOptions = securityOptions.filter(
      (value) => String(value).startsWith('no-new-privileges'),
    );
    if (
      noNewPrivilegesOptions.length !== 1
      || String(noNewPrivilegesOptions[0]) !== 'no-new-privileges:true'
    ) {
      errors.push(`${serviceName} must set no-new-privileges:true`);
    }
    const pidsLimit = Number(service.pids_limit);
    const memoryLimit = Number(service.mem_limit);
    const memoryReservation = Number(service.mem_reservation);
    const cpus = Number(service.cpus);
    if (
      !Number.isFinite(pidsLimit)
      || pidsLimit <= 0
      || !Number.isFinite(memoryLimit)
      || memoryLimit <= 0
      || !Number.isFinite(memoryReservation)
      || memoryReservation <= 0
      || !Number.isFinite(cpus)
      || cpus <= 0
    ) {
      errors.push(
        `${serviceName} lacks CPU, memory, or PID limits or a memory reservation`,
      );
    } else {
      aggregateMemoryBytes += memoryLimit;
      aggregateCpus += cpus;
      aggregatePids += pidsLimit;
      if (memoryReservation > memoryLimit) {
        errors.push(
          `${serviceName} memory reservation exceeds its memory limit`,
        );
      }
      if (memoryLimit > RESOURCE_ENVELOPE.serviceMemoryBytes) {
        errors.push(`${serviceName} exceeds the per-service memory ceiling`);
      }
      if (cpus > RESOURCE_ENVELOPE.serviceCpus) {
        errors.push(`${serviceName} exceeds the per-service CPU ceiling`);
      }
      if (pidsLimit > RESOURCE_ENVELOPE.servicePids) {
        errors.push(`${serviceName} exceeds the per-service PID ceiling`);
      }
    }
    const logging = service.logging || {};
    if (
      !['local', 'json-file'].includes(logging.driver)
      || !logging.options?.['max-size']
      || !(logging.options?.['max-file'] || logging.options?.['max-file'])
    ) {
      errors.push(`${serviceName} lacks bounded container logs`);
    }
    const oneShot =
      /(?:-init|-migrate|-seed|-job|-validator)$/.test(serviceName);
    const restart = String(service.restart ?? 'no');
    if (oneShot && restart !== 'no') {
      errors.push(`${serviceName} one-shot task must use restart=no`);
    }
    if (!oneShot && !['on-failure:3', 'no'].includes(restart)) {
      errors.push(`${serviceName} has an unbounded restart policy`);
    }
    if (!service.image) errors.push(`${serviceName} lacks an image reference`);

    const aliases = extractNetworkAliases(service.networks);
    for (const alias of aliases) {
      if (
        !String(alias).startsWith('staging-')
        && !EXPECTED_HOSTS.includes(String(alias))
      ) {
        errors.push(`${serviceName} exposes non-staging network alias ${alias}`);
      }
      if (
        (metadata.hostVisibleServiceNames || []).includes(alias)
      ) {
        errors.push(`${serviceName} alias collides with production`);
      }
    }

    for (const port of service.ports || []) {
      const normalized = normalizePort(port, serviceName);
      renderedPorts.push(normalized);
      const numericPublished = Number(normalized.published);
      const numericTarget = Number(normalized.target);
      const exactLiveKitMediaPort = (
        serviceName === 'staging-livekit'
        && (
          (
            normalized.protocol === 'tcp'
            && normalized.published === '37881'
            && normalized.target === '37881'
          )
          || (
            normalized.protocol === 'udp'
            && (
              (
                normalized.published === '35000-35100'
                && normalized.target === '35000-35100'
              )
              || (
                Number.isInteger(numericPublished)
                && numericPublished >= 35000
                && numericPublished <= 35100
                && numericPublished === numericTarget
              )
            )
          )
        )
      );
      const expectedHostIp = exactLiveKitMediaPort
        ? environment.LIVEKIT_MEDIA_BIND_IP
        : '127.0.0.1';
      if (normalized.hostIp !== expectedHostIp) {
        errors.push(
          `${serviceName} port ${normalized.published}`
          + ` must bind to ${expectedHostIp}`,
        );
      }
      const identity = `${normalized.published}/${normalized.protocol}`;
      const expandedRtcPort = (
        normalized.protocol === 'udp'
        && Number(normalized.published) >= 35000
        && Number(normalized.published) <= 35100
      );
      if (!expectedPorts.has(identity) && !expandedRtcPort) {
        errors.push(`${serviceName} publishes unexpected port ${identity}`);
      }
    }

    const mounts = normalizeMounts(service.volumes);
    bindMounts.push(
      ...mounts
        .filter((mount) => mount.type === 'bind')
        .map((mount) => ({ ...mount, serviceName })),
    );
    for (const mount of mounts) {
      const material = `${mount.source || ''} ${mount.target || ''}`;
      if (
        /(?:docker\.sock|\/\/\.\/pipe\/docker_engine)/i.test(material)
      ) {
        errors.push(`${serviceName} mounts the Docker socket`);
      }
      if (/\/var\/lib\/docker\/containers(?:[\/\s]|$)/i.test(material)) {
        errors.push(`${serviceName} mounts host-wide Docker logs`);
      }
      if (
        mount.type === 'bind'
        && ['/', '/opt/menorah', 'C:/'].includes(
          normalizePath(mount.source),
        )
      ) {
        errors.push(`${serviceName} has an ambiguous broad bind root`);
      }
    }
  }

  validateBackendRuntimeContracts(
    errors,
    services,
    model.volumes || {},
    environment,
  );
  validateProviderEnvironmentScope(errors, services, environment);

  if (aggregateMemoryBytes > RESOURCE_ENVELOPE.aggregateMemoryBytes) {
    errors.push('rendered Compose exceeds the aggregate memory ceiling');
  }
  if (aggregateCpus > RESOURCE_ENVELOPE.aggregateCpus) {
    errors.push('rendered Compose exceeds the aggregate CPU ceiling');
  }
  if (aggregatePids > RESOURCE_ENVELOPE.aggregatePids) {
    errors.push('rendered Compose exceeds the aggregate PID ceiling');
  }

  const alertmanagerMounts = normalizeMounts(
    services['staging-alertmanager']?.volumes,
  ).filter(
    (mount) => mount.target === '/etc/alertmanager/alertmanager.yml',
  );
  if (
    alertmanagerMounts.length !== 1
    || alertmanagerMounts[0].type !== 'bind'
    || normalizePath(alertmanagerMounts[0].source)
      !== normalizePath(environment.ALERTMANAGER_CONFIG_SOURCE)
    || !alertmanagerMounts[0].readOnly
  ) {
    errors.push(
      'Alertmanager must bind the reviewed config source read-only to the exact target',
    );
  }
  if (String(services['staging-alertmanager']?.user) !== '65534:65534') {
    errors.push(
      'Alertmanager must run as the uid/gid that exclusively owns its config',
    );
  }
  const alertmanagerLabels = normalizeLabels(
    services['staging-alertmanager']?.labels,
  );
  if (
    alertmanagerLabels[
      'com.menorah.alertmanager-config-sha256'
    ] !== environment.ALERTMANAGER_CONFIG_SHA256
  ) {
    errors.push(
      'Alertmanager service must carry the exact reviewed config digest label',
    );
  }
  const alertmanagerNetworks =
    services['staging-alertmanager']?.networks;
  if (
    Array.isArray(alertmanagerNetworks)
    || Number(
      alertmanagerNetworks?.['staging-egress']?.gw_priority,
    ) !== 1
  ) {
    errors.push(
      'Alertmanager egress-capable NAT must be its explicit default gateway',
    );
  }

  const livekit = services['staging-livekit'];
  const livekitEnvironment = normalizeEnvironment(livekit?.environment);
  const livekitCommand = (livekit?.command || []).map(String);
  const livekitMounts = normalizeMounts(livekit?.volumes).filter(
    (mount) => mount.target === environment.LIVEKIT_CONFIG_FILE,
  );
  const livekitPorts = renderedPorts.filter(
    ({ serviceName }) => serviceName === 'staging-livekit',
  );
  const signalPorts = livekitPorts.filter(
    (port) => (
      port.protocol === 'tcp'
      && port.hostIp === '127.0.0.1'
      && port.published === '37880'
      && port.target === '7880'
    ),
  );
  const rtcTcpPorts = livekitPorts.filter(
    (port) => (
      port.protocol === 'tcp'
      && port.hostIp === environment.LIVEKIT_MEDIA_BIND_IP
      && port.published === '37881'
      && port.target === '37881'
    ),
  );
  const rtcUdpPorts = livekitPorts.filter((port) => {
    if (
      port.protocol !== 'udp'
      || port.hostIp !== environment.LIVEKIT_MEDIA_BIND_IP
    ) {
      return false;
    }
    if (
      port.published === '35000-35100'
      && port.target === '35000-35100'
    ) {
      return true;
    }
    const published = Number(port.published);
    return (
      Number.isInteger(published)
      && published >= 35000
      && published <= 35100
      && port.target === port.published
    );
  });
  const exactUdpSet = (
    rtcUdpPorts.length === 1
    && rtcUdpPorts[0].published === '35000-35100'
  ) || (
    rtcUdpPorts.length === 101
    && new Set(rtcUdpPorts.map(({ published }) => published)).size === 101
  );
  if (
    livekitEnvironment.NODE_IP !== environment.LIVEKIT_NODE_IP
    || livekitCommand.length !== 2
    || livekitCommand[0] !== '--config'
    || livekitCommand[1] !== environment.LIVEKIT_CONFIG_FILE
    || livekitMounts.length !== 1
    || livekitMounts[0].type !== 'bind'
    || !livekitMounts[0].readOnly
    || normalizeComparable(livekitMounts[0].source)
      !== normalizeComparable(DEFAULTS.livekit)
    || signalPorts.length !== 1
    || rtcTcpPorts.length !== 1
    || !exactUdpSet
    || livekitPorts.length
      !== signalPorts.length + rtcTcpPorts.length + rtcUdpPorts.length
  ) {
    errors.push(
      'LiveKit must use the exact signaling, config, advertised-IP, and public media contract',
    );
  }

  for (const serviceName of [
    'staging-mongo-primary',
    'staging-mongo-restore',
    'staging-redis',
  ]) {
    if (!services[serviceName]) {
      errors.push(`missing isolated datastore service ${serviceName}`);
    } else if ((services[serviceName].ports || []).length > 0) {
      errors.push(`${serviceName} must not publish a host port`);
    }
  }

  const renderedPortSet = new Set(renderedPorts.map(
    (port) => `${port.published}/${port.protocol}`,
  ));
  for (const expected of expectedPorts) {
    const expandedRangePresent = expected === '35000-35100/udp'
      && Array.from(
        { length: 101 },
        (_, index) => `${35000 + index}/udp`,
      ).every((port) => renderedPortSet.has(port));
    if (!renderedPortSet.has(expected) && !expandedRangePresent) {
      errors.push(`missing required staging publication ${expected}`);
    }
  }
  for (const port of renderedPorts) {
    for (const productionPort of metadata.ports || []) {
      if (portsOverlap(port, productionPort)) {
        errors.push(
          `${port.serviceName} port ${port.published}/${port.protocol}`
          + ' collides with production metadata',
        );
      }
    }
  }

  const networks = model.networks || {};
  const networkNames = [];
  const stagingSubnets = [];
  for (const [key, network] of Object.entries(networks)) {
    const name = topLevelResourceName(key, network);
    networkNames.push(name);
    if (!name.startsWith(`${prefix}-`)) {
      errors.push(`network ${name} is not staging-prefixed`);
    }
    if (network.external) errors.push(`network ${name} must not be external`);
    if ((metadata.networkNames || []).includes(name)) {
      errors.push(`network ${name} collides with production`);
    }
    requireStagingLabels(errors, 'network', name, network.labels, project);
    const ipamConfigs = network.ipam?.config || [];
    if (ipamConfigs.length !== 1) {
      errors.push(`network ${name} must define exactly one IPv4 subnet`);
    }
    for (const config of ipamConfigs) {
      if (!cidrRange(config.subnet)) {
        errors.push(`network ${name} has an invalid IPv4 subnet`);
      }
      if ((metadata.networkSubnets || []).some(
        (productionSubnet) => cidrsOverlap(
          config.subnet,
          productionSubnet,
        ),
      )) {
        errors.push(`network ${name} subnet collides with production`);
      }
      for (const existing of stagingSubnets) {
        if (cidrsOverlap(config.subnet, existing.subnet)) {
          errors.push(
            `network ${name} subnet overlaps staging network ${existing.name}`,
          );
        }
      }
      stagingSubnets.push({ name, subnet: config.subnet });
    }
  }
  for (const suffix of REQUIRED_NETWORK_SUFFIXES) {
    if (!networkNames.includes(`${prefix}-${suffix}`)) {
      errors.push(`missing isolated ${suffix} network`);
    }
  }
  validateRenderedNetworkInputs(
    errors,
    services,
    networks,
    environment,
  );
  const ingress = networks['staging-ingress'] || {};
  const ingressOptions =
    ingress.driver_opts || ingress.driverOpts || {};
  if (
    ingress.internal === true
    || ingress.driver !== 'bridge'
    || String(
      ingressOptions['com.docker.network.bridge.enable_ip_masquerade'],
    ) !== 'false'
    || String(
      ingressOptions['com.docker.network.bridge.enable_icc'],
    ) !== 'false'
    || ingressOptions['com.docker.network.bridge.host_binding_ipv4']
      !== '127.0.0.1'
  ) {
    errors.push(
      'staging-ingress must be the reviewed non-NAT ingress bridge with ICC disabled',
    );
  }
  for (const networkName of [
    'staging-app',
    'staging-data',
    'staging-monitoring',
    'staging-restore',
  ]) {
    if (networks[networkName]?.internal !== true) {
      errors.push(
        `${networkName} must remain internal and non-egress-capable`,
      );
    }
  }
  const egress = networks['staging-egress'] || {};
  const egressOptions = egress.driver_opts || egress.driverOpts || {};
  const egressIpam = egress.ipam?.config || [];
  if (
    egress.internal === true
    || egress.driver !== 'bridge'
    || String(
      egressOptions['com.docker.network.bridge.enable_ip_masquerade'],
    ) !== 'true'
    || String(
      egressOptions['com.docker.network.bridge.enable_icc'],
    ) !== 'false'
    || egressOptions['com.docker.network.bridge.host_binding_ipv4']
      !== '127.0.0.1'
  ) {
    errors.push(
      'staging-egress must be the reviewed egress-capable NAT bridge with ICC disabled',
    );
  }
  if (
    egressIpam.length !== 1
    || egressIpam[0].subnet
      !== environment.MENORAH_SERVER_STAGING_EGRESS_SUBNET
    || (egressIpam[0].ip_range || egressIpam[0].ipRange)
      !== environment.MENORAH_SERVER_STAGING_EGRESS_IP_RANGE
  ) {
    errors.push(
      'staging-egress subnet and dynamic range must exactly match the reviewed environment',
    );
  }
  const egressMembers = Object.entries(services)
    .filter(([, service]) => (
      Array.isArray(service.networks)
        ? service.networks.includes('staging-egress')
        : Object.hasOwn(service.networks || {}, 'staging-egress')
    ))
    .map(([serviceName]) => serviceName)
    .sort();
  const expectedEgressMembers = [...EGRESS_SERVICE_NAMES].sort();
  if (
    !equalSets(
      new Set(egressMembers),
      new Set(expectedEgressMembers),
    )
  ) {
    errors.push(
      'staging-egress must contain only the six approved provider services',
    );
  }
  for (const serviceName of expectedEgressMembers) {
    const serviceNetworks = services[serviceName]?.networks;
    if (
      Array.isArray(serviceNetworks)
      || Number(
        serviceNetworks?.['staging-egress']?.gw_priority,
      ) !== 1
    ) {
      errors.push(
        `${serviceName} must use staging-egress as its explicit default gateway`,
      );
    }
  }

  const volumes = model.volumes || {};
  const volumeNames = [];
  for (const [key, volume] of Object.entries(volumes)) {
    const name = topLevelResourceName(key, volume);
    volumeNames.push(name);
    if (!name.startsWith(`${prefix}-`)) {
      errors.push(`volume ${name} is not staging-prefixed`);
    }
    if (volume.external) errors.push(`volume ${name} must not be external`);
    if ((metadata.volumeNames || []).includes(name)) {
      errors.push(`volume ${name} collides with production`);
    }
    requireStagingLabels(errors, 'volume', name, volume.labels, project);
  }
  for (const suffix of REQUIRED_VOLUME_SUFFIXES) {
    if (!volumeNames.includes(`${prefix}-${suffix}`)) {
      errors.push(`missing isolated ${suffix} volume`);
    }
  }

  const allowedBindRoots = [
    environment.MENORAH_SERVER_STAGING_ROOT,
    REPOSITORY_ROOT,
  ];
  for (const mount of bindMounts) {
    const source = path.resolve(mount.source);
    const allowed = allowedBindRoots.some(
      (root) => isWithin(source, root),
    );
    if (!allowed) {
      errors.push(`${mount.serviceName} bind source escapes staging/repository roots`);
    }
    for (const productionRoot of metadata.filesystemRoots || []) {
      if (isWithin(source, productionRoot)) {
        errors.push(`${mount.serviceName} bind source enters production root`);
      }
    }
    if (existsSync(source)) {
      const realSource = realpathSync(source);
      if (
        !allowedBindRoots.some((root) => isWithin(realSource, root))
      ) {
        errors.push(`${mount.serviceName} bind source escapes through symlink`);
      }
    }
  }

  const allStrings = stringValues(model);
  for (const productionRoot of metadata.filesystemRoots || []) {
    const normalizedProductionRoot = normalizePath(productionRoot);
    if (allStrings.some(
      (value) => (
        normalizePath(value) === normalizedProductionRoot
        || normalizePath(value).includes(`${normalizedProductionRoot}/`)
      ),
    )) {
      errors.push(`rendered Compose references production root ${productionRoot}`);
    }
  }
  if (
    allStrings.some(
      (value) => /(?:docker\.sock|\/var\/lib\/docker\/containers)/i.test(value),
    )
  ) {
    errors.push('rendered Compose contains host-wide Docker access');
  }
  if (
    allStrings.some(
      (value) => /(?:network_mode|pid|ipc)\s*[:=]\s*host/i.test(value),
    )
  ) {
    errors.push('rendered Compose contains a host namespace');
  }

  validateRoleUse(errors, services, environment);
  return errors;
};

const caddyHostSet = (source) => new Set(
  [...String(source).matchAll(/https?:\/\/([a-z0-9.-]+)(?=[,\s{])/gi)]
    .map((match) => match[1]),
);

const caddyRouteMap = (source) => {
  const matchers = new Map();
  for (const match of String(source).matchAll(
    /^\s*@([a-z0-9_]+)\s+host\s+([^\r\n]+)$/gmi,
  )) {
    matchers.set(
      match[1],
      match[2].trim().split(/\s+/).filter(Boolean),
    );
  }
  const routes = new Map();
  for (const match of String(source).matchAll(
    /handle\s+@([a-z0-9_]+)\s*\{[\s\S]*?import\s+staging_proxy\s+([^\s}]+)/gi,
  )) {
    const hosts = matchers.get(match[1]) || [];
    for (const host of hosts) {
      if (routes.has(host)) {
        routes.set(host, '<duplicate>');
      } else {
        routes.set(host, match[2]);
      }
    }
  }
  return routes;
};

const tunnelRoutes = (source) => {
  const routes = [];
  const lines = String(source).split(/\r?\n/);
  let pendingHost = null;
  for (const line of lines) {
    const host = line.match(/^\s*-\s*hostname:\s*([a-z0-9.-]+)\s*$/i);
    if (host) {
      pendingHost = host[1];
      continue;
    }
    const service = line.match(/^\s*(?:-\s*)?service:\s*(\S+)\s*$/);
    if (service) {
      routes.push({ host: pendingHost, service: service[1] });
      pendingHost = null;
    }
  }
  return routes;
};

const setDifference = (left, right) => (
  [...left].filter((value) => !right.has(value))
);

export const validateIngress = ({
  manifest,
  caddySource,
  tunnelSource,
  compose,
  productionMetadata,
}) => {
  const errors = [];
  const expected = new Set(EXPECTED_HOSTS);
  const manifestHosts = new Set(manifest.expectedHosts || []);
  const routeHosts = new Set(
    (manifest.routes || []).map((route) => route.host),
  );
  if (
    setDifference(expected, manifestHosts).length
    || setDifference(manifestHosts, expected).length
    || setDifference(expected, routeHosts).length
    || setDifference(routeHosts, expected).length
  ) {
    errors.push('ingress manifest host sets do not match exactly');
  }
  if (
    manifest.environment !== 'staging'
    || manifest.composeProject !== REAL_PROJECT
  ) {
    errors.push('ingress manifest lacks staging project identity');
  }
  const targets = new Set(
    (manifest.routes || []).map((route) => route.target),
  );
  const services = compose.services || {};
  if (!Object.hasOwn(
    services['staging-caddy']?.networks || {},
    'staging-app',
  )) {
    errors.push('Caddy must join the private staging-app network');
  }
  for (const target of targets) {
    if (!String(target).startsWith('staging-')) {
      errors.push(`manifest target ${target} is not staging-prefixed`);
    }
    const privateTarget = String(target).match(
      /^(staging-private-[a-z0-9-]+):([1-9][0-9]*)$/,
    );
    if (!privateTarget) {
      errors.push(
        `manifest target ${target} must use a private staging-app alias`,
      );
    } else {
      const [, alias] = privateTarget;
      const owners = Object.entries(services).filter(([, service]) => (
        service.networks?.['staging-app']?.aliases || []
      ).includes(alias));
      if (owners.length !== 1) {
        errors.push(
          `manifest target ${target} is not owned by exactly one staging-app service`,
        );
      }
      if (owners.some(([, service]) => (
        service.networks?.['staging-ingress']?.aliases || []
      ).includes(alias))) {
        errors.push(
          `manifest target ${target} leaks its private alias onto staging-ingress`,
        );
      }
    }
    if (!String(caddySource).includes(`staging_proxy ${target}`)) {
      errors.push(`Caddy is missing manifest target ${target}`);
    }
  }
  const caddyHosts = caddyHostSet(caddySource);
  if (
    setDifference(expected, caddyHosts).length
    || setDifference(caddyHosts, expected).length
  ) {
    errors.push('Caddy hosts do not exactly match the manifest');
  }
  const expectedCaddyRoutes = new Map(
    (manifest.routes || []).map(({ host, target }) => [host, target]),
  );
  const renderedCaddyRoutes = caddyRouteMap(caddySource);
  if (
    expectedCaddyRoutes.size !== renderedCaddyRoutes.size
    || [...expectedCaddyRoutes].some(
      ([host, target]) => renderedCaddyRoutes.get(host) !== target,
    )
  ) {
    errors.push('Caddy host-to-target mappings do not match the manifest');
  }

  const routes = tunnelRoutes(tunnelSource);
  const tunnelHosts = new Set(
    routes.filter((route) => route.host).map((route) => route.host),
  );
  if (
    setDifference(expected, tunnelHosts).length
    || setDifference(tunnelHosts, expected).length
  ) {
    errors.push('Tunnel hosts do not exactly match the manifest');
  }
  for (const route of routes.filter((entry) => entry.host)) {
    if (route.service !== 'http://127.0.0.1:38000') {
      errors.push(`${route.host} Tunnel target is not the loopback Caddy origin`);
    }
  }
  const terminal = routes.at(-1);
  if (terminal?.host !== null || terminal?.service !== 'http_status:404') {
    errors.push('Tunnel must terminate with http_status:404');
  }
  if (/noTLSVerify\s*:\s*true/i.test(tunnelSource)) {
    errors.push('Tunnel must not disable TLS verification');
  }
  for (const host of productionMetadata.tunnelHosts || []) {
    if (tunnelHosts.has(host)) errors.push(`Tunnel collides with ${host}`);
  }
  for (const host of productionMetadata.caddyHosts || []) {
    const hostPattern = new RegExp(
      `(^|[^a-z0-9.-])${host.replaceAll('.', '\\.')}(?=$|[^a-z0-9.-])`,
      'i',
    );
    if (caddyHosts.has(host) || hostPattern.test(caddySource)) {
      errors.push(`Caddy collides with ${host}`);
    }
  }

  const caddyPorts = (compose.services?.['staging-caddy']?.ports || [])
    .map((port) => normalizePort(port, 'staging-caddy'));
  for (const expectedPort of [
    ['38000', '80'],
    ['38443', '443'],
  ]) {
    if (
      !caddyPorts.some(
        (port) => (
          port.hostIp === '127.0.0.1'
          && port.published === expectedPort[0]
          && port.target === expectedPort[1]
        ),
      )
    ) {
      errors.push(
        `Caddy lacks ${expectedPort[0]} -> ${expectedPort[1]} loopback publication`,
      );
    }
  }
  return errors;
};

const extractTargets = (source) => (
  [...String(source).matchAll(
    /(?:(?:https?|wss):\/\/)?([a-z0-9.-]+):(\d+)(?:\/[^\s,\]}]*)?/gi,
  )].map((match) => `${match[1]}:${match[2]}`)
);

export const validateMonitoring = ({
  prometheusSource,
  alertmanagerSource,
  blackboxSource,
  alloySource,
  lokiSource,
  alertRulesSource,
  compose,
  environment,
  productionMetadata,
}) => {
  const errors = [];
  const blackboxModuleBlocks = new Map();
  let currentBlackboxModule = '';
  for (const line of String(blackboxSource).split(/\r?\n/)) {
    const moduleMatch = line.match(/^  ([a-z][a-z0-9_]*):\s*$/);
    if (moduleMatch) {
      currentBlackboxModule = moduleMatch[1];
      blackboxModuleBlocks.set(currentBlackboxModule, `${line}\n`);
    } else if (currentBlackboxModule) {
      blackboxModuleBlocks.set(
        currentBlackboxModule,
        `${blackboxModuleBlocks.get(currentBlackboxModule)}${line}\n`,
      );
    }
  }
  for (const [moduleName, followRedirects] of [
    ['https_staging_success', true],
    ['https_staging_ready', false],
    ['https_calls_staging', false],
  ]) {
    const block = blackboxModuleBlocks.get(moduleName) || '';
    if (
      !new RegExp(`follow_redirects:\\s*${followRedirects}\\b`).test(block)
      || !/valid_status_codes:\s*\[200\]/.test(block)
      || !/fail_if_not_ssl:\s*true\b/.test(block)
      || !/insecure_skip_verify:\s*true\b/.test(block)
    ) {
      errors.push(
        `staging Blackbox module ${moduleName} has invalid HTTPS semantics`,
      );
    }
  }
  const successProbeAssignments = (
    String(prometheusSource).match(
      /\bprobe_module:\s*https_staging_success\b/g,
    ) || []
  ).length;
  const readyProbeAssignments = (
    String(prometheusSource).match(
      /\bprobe_module:\s*https_staging_ready\b/g,
    ) || []
  ).length;
  if (
    successProbeAssignments !== 5
    || readyProbeAssignments !== 4
    || !/source_labels:\s*\[probe_module\]\s*\r?\n\s*target_label:\s*__param_module/
      .test(prometheusSource)
  ) {
    errors.push(
      'staging HTTPS probes must separate redirecting frontends from strict readiness targets',
    );
  }
  const internalTlsScopeAssignments = (
    String(prometheusSource).match(
      /target_label:\s*tls_scope\s*\r?\n\s*replacement:\s*internal-diagnostics/g,
    ) || []
  ).length;
  if (internalTlsScopeAssignments !== 2) {
    errors.push(
      'staging internal HTTPS probes must carry the internal TLS scope',
    );
  }
  for (const requiredRuleFragment of [
    'monitoring_scope="server-staging"}) < 9',
    'monitoring_scope!="server-staging"}) < 19',
    'monitoring_scope="server-staging"}) < 1',
    'monitoring_scope!="server-staging"}) < 2',
    'monitoring_scope!="server-staging"} - time()) < 1209600',
  ]) {
    if (!String(alertRulesSource).includes(requiredRuleFragment)) {
      errors.push(
        'shared monitoring rules do not preserve scoped staging coverage and TLS semantics',
      );
      break;
    }
  }
  const externalLabelsBlock = String(prometheusSource).match(
    /^  external_labels:\s*\r?\n((?:^    .*(?:\r?\n|$))*)/m,
  )?.[1] || '';
  if (
    !/^\s*environment:\s*staging\s*$/mi.test(externalLabelsBlock)
    || !/^\s*compose_project:\s*(?:"\$\{MENORAH_SERVER_STAGING_PROJECT_NAME\}"|'\$\{MENORAH_SERVER_STAGING_PROJECT_NAME\}'|\$\{MENORAH_SERVER_STAGING_PROJECT_NAME\})\s*$/mi
      .test(externalLabelsBlock)
  ) {
    errors.push('Prometheus external staging labels are missing');
  }
  const prometheus = compose.services?.['staging-prometheus'] || {};
  const prometheusEnvironment = normalizeEnvironment(prometheus.environment);
  if (
    prometheusEnvironment.MENORAH_SERVER_STAGING_PROJECT_NAME
    !== compose.name
  ) {
    errors.push(
      'Prometheus project environment must equal the active Compose project',
    );
  }
  if (
    !stringValues(prometheus.command)
      .includes('--enable-feature=expand-external-labels')
  ) {
    errors.push(
      'Prometheus must enable external-label environment expansion',
    );
  }
  const targets = extractTargets(prometheusSource);
  for (const target of targets) {
    const host = target.split(':')[0];
    if (
      host !== '127.0.0.1'
      && !host.startsWith('staging-')
      && !EXPECTED_HOSTS.includes(host)
    ) {
      errors.push(`Prometheus target ${target} is not staging-only`);
    }
  }
  const monitoringTargets = new Set(extractTargets(
    `${prometheusSource}\n${alloySource}`,
  ));
  for (const {
    service,
    alias,
    network,
    port,
  } of REQUIRED_MONITORING_PRIVATE_TARGETS) {
    const expectedTarget = `${alias}:${port}`;
    if (!monitoringTargets.has(expectedTarget)) {
      errors.push(
        `monitoring must use private target ${expectedTarget}`,
      );
    }
    if (monitoringTargets.has(`${service}:${port}`)) {
      errors.push(
        `monitoring must not use cross-network service target ${service}:${port}`,
      );
    }
    const owners = Object.entries(compose.services || {}).filter(
      ([, candidate]) => (
        candidate.networks?.[network]?.aliases || []
      ).includes(alias),
    );
    if (
      owners.length !== 1
      || owners[0][0] !== service
    ) {
      errors.push(
        `private monitoring alias ${alias} must belong only to ${service} on ${network}`,
      );
    }
    if (owners.some(([, candidate]) => (
      candidate.networks?.['staging-ingress']?.aliases || []
    ).includes(alias))) {
      errors.push(
        `private monitoring alias ${alias} must not leak onto staging-ingress`,
      );
    }
  }
  for (const host of productionMetadata.caddyHosts || []) {
    if (
      new RegExp(`(^|[^a-z0-9.-])${host.replaceAll('.', '\\.')}(?=$|[^a-z0-9.-])`, 'i')
        .test(prometheusSource)
      || new RegExp(`(^|[^a-z0-9.-])${host.replaceAll('.', '\\.')}(?=$|[^a-z0-9.-])`, 'i')
        .test(blackboxSource)
    ) {
      errors.push(`monitoring probes reference production host ${host}`);
    }
  }
  for (const host of EXPECTED_HOSTS) {
    if (!blackboxSource.includes(host) && !prometheusSource.includes(host)) {
      errors.push(`staging Blackbox coverage is missing ${host}`);
    }
  }
  errors.push(...validateAlertmanagerConfigContent(
    environment,
    alertmanagerSource,
  ));
  if (
    /(?:docker\.sock|\/var\/lib\/docker\/containers)/i.test(alloySource)
    || /environment\s*[:=]\s*production/i.test(alloySource)
    || /environment\s*[:=]\s*production/i.test(lokiSource)
  ) {
    errors.push('logging configuration reaches host-wide or production state');
  }
  for (const alert of REQUIRED_P0_ALERTS) {
    if (!new RegExp(`\\balert:\\s*${alert}\\b`).test(alertRulesSource)) {
      errors.push(`missing required P0 alert ${alert}`);
    }
  }
  const storage = [
    'staging-prometheus',
    'staging-alertmanager',
    'staging-loki',
    'staging-alloy',
  ].map((key) => compose.volumes?.[key]?.name);
  if (
    storage.some((value) => !value)
    || new Set(storage).size !== storage.length
  ) {
    errors.push('monitoring storage volumes are missing or shared');
  }
  for (const name of storage) {
    if ((productionMetadata.volumeNames || []).includes(name)) {
      errors.push(`monitoring volume ${name} collides with production`);
    }
  }
  return errors;
};

export const validateLiveKitConfig = (source) => {
  const errors = [];
  const text = String(source || '');
  if (text.includes('\t')) {
    errors.push('LiveKit config must not contain tabs');
    return errors;
  }
  const rtcMatch = text.match(
    /^rtc:\s*\r?\n((?:^[ ]{2}[a-z0-9_]+:\s*[^\r\n]*\r?\n?)+)/m,
  );
  const rtcBlocks = text.match(/^rtc:\s*$/gm) || [];
  const entries = rtcMatch
    ? [...rtcMatch[1].matchAll(
      /^[ ]{2}([a-z0-9_]+):\s*([^\r\n]+)$/gm,
    )]
    : [];
  const actual = Object.fromEntries(
    entries.map(([, key, value]) => [key, value.trim()]),
  );
  const expected = {
    tcp_port: '37881',
    port_range_start: '35000',
    port_range_end: '35100',
    use_external_ip: 'false',
    skip_external_ip_validation: 'false',
  };
  if (
    rtcBlocks.length !== 1
    || entries.length !== Object.keys(expected).length
    || Object.keys(actual).length !== Object.keys(expected).length
    || Object.entries(expected).some(
      ([key, value]) => actual[key] !== value,
    )
  ) {
    errors.push(
      'LiveKit rtc config must retain the exact reviewed ports and use_external_ip=false',
    );
  }
  return errors;
};

export const validateAll = ({
  compose,
  environment,
  productionMetadata,
  manifest,
  caddySource,
  tunnelSource,
  prometheusSource,
  alertmanagerSource,
  blackboxSource,
  alloySource,
  lokiSource,
  livekitSource,
  alertRulesSource,
}) => {
  const errors = [];
  try {
    assertValidEnvironment(environment, { productionMetadata });
  } catch (error) {
    errors.push(...String(error.message).split('\n').slice(1)
      .map((line) => line.replace(/^- /, '')));
  }
  errors.push(...validateRenderedCompose(
    compose,
    environment,
    productionMetadata,
  ));
  errors.push(...validateIngress({
    manifest,
    caddySource,
    tunnelSource,
    compose,
    productionMetadata,
  }));
  errors.push(...validateMonitoring({
    prometheusSource,
    alertmanagerSource,
    blackboxSource,
    alloySource,
    lokiSource,
    alertRulesSource,
    compose,
    environment,
    productionMetadata,
  }));
  errors.push(...validateLiveKitConfig(livekitSource));
  return [...new Set(errors)];
};

const parseArguments = (argv) => {
  const options = { ...DEFAULTS };
  const names = {
    '--compose': 'compose',
    '--env': 'environment',
    '--production-metadata': 'productionMetadata',
    '--manifest': 'manifest',
    '--caddy': 'caddy',
    '--tunnel': 'tunnel',
    '--prometheus': 'prometheus',
    '--alertmanager': 'alertmanager',
    '--blackbox': 'blackbox',
    '--alloy': 'alloy',
    '--loki': 'loki',
    '--livekit': 'livekit',
    '--alert-rules': 'alertRules',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = names[argv[index]];
    if (!key) throw new Error(`Unknown argument: ${argv[index]}`);
    options[key] = path.resolve(argv[++index]);
  }
  return options;
};

const readJson = (filename) => JSON.parse(readFileSync(filename, 'utf8'));
const readText = (filename) => readFileSync(filename, 'utf8');

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    const files = parseArguments(process.argv.slice(2));
    const inputs = {
      compose: readJson(files.compose),
      environment: parseEnvironmentFile(files.environment),
      productionMetadata: readJson(files.productionMetadata),
      manifest: readJson(files.manifest),
      caddySource: readText(files.caddy),
      tunnelSource: readText(files.tunnel),
      prometheusSource: readText(files.prometheus),
      alertmanagerSource: readText(files.alertmanager),
      blackboxSource: readText(files.blackbox),
      alloySource: readText(files.alloy),
      lokiSource: readText(files.loki),
      livekitSource: readText(files.livekit),
      alertRulesSource: readText(files.alertRules),
    };
    const errors = validateAll(inputs);
    if (errors.length > 0) {
      throw new Error(
        `Server-staging isolation validation failed (${errors.length}):\n`
        + errors.map((error) => `- ${error}`).join('\n'),
      );
    }
    const portCount = Object.values(inputs.compose.services || {})
      .reduce((total, service) => total + (service.ports || []).length, 0);
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      project: inputs.compose.name,
      services: Object.keys(inputs.compose.services || {}).length,
      networks: Object.keys(inputs.compose.networks || {}).length,
      volumes: Object.keys(inputs.compose.volumes || {}).length,
      publishedPorts: portCount,
      productionCollisions: 0,
      ingressHosts: EXPECTED_HOSTS.length,
      requiredP0Alerts: REQUIRED_P0_ALERTS.length,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
