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
  REAL_PROJECT,
  VALIDATION_PROJECT,
  assertValidEnvironment,
  parseEnvironmentFile,
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
  'deploy-state',
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

const validateRoleUse = (errors, services, environment) => {
  const contracts = [
    [/^staging-api-|^staging-worker$/, 'MONGO_STAGING_APP_USER'],
    [/^staging-migrate$/, 'MONGO_STAGING_MIGRATION_USER'],
    [/^staging-backup-job$/, 'MONGO_STAGING_BACKUP_USER'],
    [/^staging-mongodb-exporter$/, 'MONGO_STAGING_MONITOR_USER'],
    [/^staging-restore-job$/, 'MONGO_STAGING_RESTORE_USER'],
  ];
  for (const [serviceName, service] of Object.entries(services)) {
    const serviceEnvironment = normalizeEnvironment(service.environment);
    for (const [pattern, userKey] of contracts) {
      if (!pattern.test(serviceName)) continue;
      const uris = Object.entries(serviceEnvironment)
        .filter(([key, value]) => (
          /MONGODB.*URI/.test(key)
          && typeof value === 'string'
          && value.startsWith('mongodb')
        ));
      for (const [key, value] of uris) {
        try {
          if (
            decodeURIComponent(new URL(value).username)
            !== environment[userKey]
          ) {
            errors.push(
              `${serviceName} ${key} uses the wrong MongoDB role`,
            );
          }
        } catch {
          errors.push(`${serviceName} ${key} is not a valid MongoDB URI`);
        }
      }
    }
    if (/^staging-api-|^staging-worker$/.test(serviceName)) {
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

const validateBackendRuntimeContracts = (errors, services, volumes) => {
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

  const storageInit = services['staging-storage-init'];
  const permissionsInit = services['staging-media-permissions-init'];
  if (!storageInit) {
    errors.push('missing staging-storage-init');
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

export const validateRenderedCompose = (
  model,
  environment,
  productionMetadata,
) => {
  const errors = [];
  const project = environment.MENORAH_SERVER_STAGING_PROJECT_NAME;
  const prefix = environment.MENORAH_SERVER_STAGING_RESOURCE_PREFIX;
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
      (productionMetadata.containerNames || [])
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
    if (
      !securityOptions.some(
        (value) => String(value).startsWith('no-new-privileges'),
      )
    ) {
      errors.push(`${serviceName} must set no-new-privileges`);
    }
    if (
      !service.pids_limit
      || !service.mem_limit
      || !service.cpus
    ) {
      errors.push(`${serviceName} lacks CPU, memory, or PID limits`);
    } else if (
      service.mem_reservation
      && Number(service.mem_reservation) > Number(service.mem_limit)
    ) {
      errors.push(
        `${serviceName} memory reservation exceeds its memory limit`,
      );
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
        (productionMetadata.hostVisibleServiceNames || []).includes(alias)
      ) {
        errors.push(`${serviceName} alias collides with production`);
      }
    }

    for (const port of service.ports || []) {
      const normalized = normalizePort(port, serviceName);
      renderedPorts.push(normalized);
      if (normalized.hostIp !== '127.0.0.1') {
        errors.push(
          `${serviceName} port ${normalized.published}`
          + ' must bind to 127.0.0.1',
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
  );

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
    for (const productionPort of productionMetadata.ports || []) {
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
  for (const [key, network] of Object.entries(networks)) {
    const name = topLevelResourceName(key, network);
    networkNames.push(name);
    if (!name.startsWith(`${prefix}-`)) {
      errors.push(`network ${name} is not staging-prefixed`);
    }
    if (network.external) errors.push(`network ${name} must not be external`);
    if ((productionMetadata.networkNames || []).includes(name)) {
      errors.push(`network ${name} collides with production`);
    }
    requireStagingLabels(errors, 'network', name, network.labels, project);
    for (const config of network.ipam?.config || []) {
      if (
        (productionMetadata.networkSubnets || []).includes(config.subnet)
      ) {
        errors.push(`network ${name} subnet collides with production`);
      }
    }
  }
  for (const suffix of REQUIRED_NETWORK_SUFFIXES) {
    if (!networkNames.includes(`${prefix}-${suffix}`)) {
      errors.push(`missing isolated ${suffix} network`);
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
    if ((productionMetadata.volumeNames || []).includes(name)) {
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
    for (const productionRoot of productionMetadata.filesystemRoots || []) {
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
  for (const productionRoot of productionMetadata.filesystemRoots || []) {
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
  productionMetadata,
}) => {
  const errors = [];
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
  if (
    !/matchers:[\s\S]*environment="staging"/i.test(alertmanagerSource)
    || !/server-staging-placeholder/.test(alertmanagerSource)
    || /slack|pagerduty|opsgenie|smtp_|victorops/i.test(alertmanagerSource)
  ) {
    errors.push('Alertmanager is not isolated to the staging placeholder');
  }
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
    productionMetadata,
  }));
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
