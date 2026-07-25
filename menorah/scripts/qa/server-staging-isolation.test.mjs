import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  INACTIVE_PROVIDER_SECRET_KEYS,
  SECRET_KEYS,
  assertGeneratedTargetsAbsent,
  buildValidationEnvironment,
  parseContractKeys,
} from '../../deploy/server-staging/generate-validation-environment.mjs';
import {
  IDENTITY_RECONCILIATION_MARKER_BASENAME,
} from '../../deploy/server-staging/assert-context.mjs';
import {
  EXPECTED_HOSTS,
  EXPECTED_PORT_VARIABLES,
  REAL_PROJECT,
  parseEnvironmentSource,
  validateAlertmanagerConfigContent,
  validateAlertmanagerConfigSource,
  validateEnvironmentRecord,
} from '../../deploy/server-staging/validate-environment.mjs';
import {
  EXPECTED_PUBLISHED_PORTS,
  EGRESS_SERVICE_NAMES,
  REQUIRED_NETWORK_SUFFIXES,
  REQUIRED_SERVICE_NETWORKS,
  REQUIRED_VOLUME_SUFFIXES,
  validateProductionMetadata,
  validateIngress,
  validateLiveKitConfig,
  validateMonitoring,
  validateRenderedCompose,
} from '../../deploy/server-staging/validate-isolation.mjs';

const stagingDirectory = new URL(
  '../../deploy/server-staging/',
  import.meta.url,
);
const stagingPath = (name) => fileURLToPath(
  new URL(name, stagingDirectory),
);
const readStaging = (name) => readFileSync(
  new URL(name, stagingDirectory),
  'utf8',
);
const productionMetadata = JSON.parse(
  readStaging('production-metadata.fixture.json'),
);
const contractSource = readFileSync(
  new URL('../../deploy/env/server-staging.env.example', import.meta.url),
  'utf8',
);
const fixtureSha = 'a'.repeat(40);
const externalAlertmanagerSource = `global:
  resolve_timeout: 1m

route:
  receiver: unmatched-drop
  group_by:
    - environment
    - alertname
    - service
    - severity
  group_wait: 5s
  group_interval: 30s
  repeat_interval: 30m
  routes:
    - receiver: menorah-staging-operations
      matchers:
        - environment="staging"

receivers:
  - name: unmatched-drop
  - name: menorah-staging-operations
    webhook_configs:
      - url: https://alerts.staging-provider.invalid/hooks/staging-fixture
        send_resolved: true
        http_config:
          follow_redirects: false

inhibit_rules:
  - source_matchers:
      - environment="staging"
      - severity="critical"
    target_matchers:
      - environment="staging"
      - severity="warning"
    equal:
      - environment
      - alertname
      - service
`;

const validEnvironment = () => ({
  ...buildValidationEnvironment({
    candidateSha: fixtureSha,
    contractKeys: parseContractKeys(contractSource),
  }).values,
});

const realAlertmanagerEnvironment = (
  source = externalAlertmanagerSource,
) => ({
  ...validEnvironment(),
  MENORAH_SERVER_STAGING_PROJECT_NAME: REAL_PROJECT,
  MENORAH_SERVER_STAGING_RESOURCE_PREFIX: REAL_PROJECT,
  ALERTMANAGER_CONFIG_SOURCE:
    '/opt/menorah-staging/env/alertmanager.yml',
  ALERTMANAGER_CONFIG_SHA256: createHash('sha256')
    .update(source)
    .digest('hex'),
  ALERTMANAGER_RECEIVER: 'menorah-staging-operations',
  ALERTMANAGER_DELIVERY_RECEIVER: 'menorah-staging-operations',
  ALERTMANAGER_DELIVERY_ENDPOINT_HOST:
    'alerts.staging-provider.invalid',
  ALERTMANAGER_CONFIG_REVIEWED_AT: '2026-07-25T00:00:00.000Z',
  ALERTMANAGER_CONFIG_REVIEW_REFERENCE:
    'staging-alert-config-review-ops-20260725',
});

const validRealEnvironment = () => {
  const environment = realAlertmanagerEnvironment();
  const localRoot =
    environment.MENORAH_SERVER_STAGING_ROOT.replaceAll('\\', '/');
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value !== 'string') continue;
    const normalized = value.replaceAll('\\', '/');
    if (
      normalized === localRoot
      || normalized.startsWith(`${localRoot}/`)
    ) {
      environment[key] = normalized.replace(
        localRoot,
        '/opt/menorah-staging',
      );
    } else if (value.includes('://')) {
      environment[key] = value.replaceAll(':38443', '');
    }
  }
  Object.assign(environment, {
    MENORAH_SERVER_STAGING_ENV_FILE:
      '/opt/menorah-staging/env/server-staging.env',
    MENORAH_SERVER_STAGING_MONGO_KEYFILE:
      '/opt/menorah-staging/env/mongo-keyfile',
    MENORAH_SERVER_STAGING_BACKUP_PASSWORD_FILE:
      '/opt/menorah-staging/env/backup-encryption-password',
    MENORAH_SERVER_STAGING_BACKUP_HMAC_FILE:
      '/opt/menorah-staging/env/backup-integrity-hmac-key',
    LIVEKIT_MEDIA_BIND_IP: '192.168.50.10',
    LIVEKIT_NODE_IP: '8.8.8.8',
    PROMETHEUS_EXTERNAL_PROJECT: REAL_PROJECT,
    BACKUP_STATUS_GROUP: REAL_PROJECT,
    RESEND_API_URL: '',
    RESEND_API_KEY: '',
    RESEND_WEBHOOK_SECRET: '',
    EMAIL_FROM: '',
    CONTACT_TO_EMAIL: '',
  });
  for (const [key, value] of Object.entries(environment)) {
    if (
      key.startsWith('MENORAH_SERVER_STAGING_')
      && key.endsWith('_IMAGE')
    ) {
      const imageName = value.split('/').at(-1).split(':')[0];
      environment[key] =
        `registry.staging.invalid/menorah-staging/${imageName}`
        + `@sha256:${'b'.repeat(64)}`;
    }
  }
  return environment;
};

const enabledRealResendEnvironment = () => ({
  ...validRealEnvironment(),
  RESEND_PROVIDER_ENABLED: 'true',
  RESEND_MODE: 'sandbox',
  RESEND_API_URL: 'https://api.resend.com/emails',
  RESEND_API_KEY: `re_${'r'.repeat(40)}`,
  RESEND_WEBHOOK_SECRET: `resend_stage_${'w'.repeat(32)}`,
  EMAIL_FROM:
    'Menorah Staging <noreply@mail.staging.menorah.me>',
  CONTACT_TO_EMAIL: 'staging-contact@mail.staging.menorah.me',
});

const enabledRealCloudinaryEnvironment = () => ({
  ...validRealEnvironment(),
  MEDIA_STORAGE_BACKEND: 'cloudinary',
  CLOUDINARY_CLOUD_NAME: 'menorah-staging-cloud',
  CLOUDINARY_API_KEY: `cloud_key_${'k'.repeat(24)}`,
  CLOUDINARY_API_SECRET: `cloud_secret_${'s'.repeat(24)}`,
});

const alertmanagerFsAdapter = (
  source,
  {
    mode = 0o100400,
    uid = 65534,
    gid = 65534,
    symbolicLink = false,
    missing = false,
    parentUid = 0,
    parentMode = 0o40700,
    parentSymbolicLink = false,
    readError = false,
    reportedSize = Buffer.byteLength(source),
  } = {},
) => ({
  lstatSync(candidate) {
    if (missing) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    const isConfig = candidate
      === '/opt/menorah-staging/env/alertmanager.yml';
    return {
      mode: isConfig ? mode : parentMode,
      uid: isConfig ? uid : parentUid,
      gid: isConfig ? gid : 0,
      size: isConfig ? reportedSize : 0,
      isFile: () => isConfig,
      isDirectory: () => !isConfig,
      isSymbolicLink: () => (
        isConfig ? symbolicLink : parentSymbolicLink
      ),
    };
  },
  realpathSync(candidate) {
    return candidate;
  },
  readFileSync() {
    if (readError) throw Object.assign(
      new Error('unreadable'),
      { code: 'EACCES' },
    );
    return Buffer.from(source, 'utf8');
  },
});

const labels = (project) => ({
  'com.menorah.environment': 'staging',
  'com.menorah.project': project,
  'com.menorah.stack': 'server-staging',
  'com.menorah.resource-kind': 'service',
});

const safeService = (project, overrides = {}) => ({
  image: 'menorah-server-staging-validation/test:runtime',
  restart: 'on-failure:3',
  labels: labels(project),
  cap_drop: ['ALL'],
  security_opt: ['no-new-privileges:true'],
  pids_limit: 64,
  mem_limit: 64 * 1024 * 1024,
  mem_reservation: 32 * 1024 * 1024,
  cpus: 0.25,
  logging: {
    driver: 'local',
    options: { 'max-size': '10m', 'max-file': '3' },
  },
  networks: ['staging-app'],
  ...overrides,
});

const portServices = Object.freeze([
  ['staging-caddy', [
    ['38000', '80', 'tcp'],
    ['38443', '443', 'tcp'],
  ]],
  ['staging-api-ios', [['38080', '8080', 'tcp']]],
  ['staging-api-android', [['38081', '8080', 'tcp']]],
  ['staging-api-web', [['38082', '8080', 'tcp']]],
  ['staging-api-admin', [['38083', '8080', 'tcp']]],
  ['staging-worker', [['38084', '8080', 'tcp']]],
  ['staging-web-app', [['33001', '3001', 'tcp']]],
  ['staging-user-web-app', [['33002', '3002', 'tcp']]],
  ['staging-admin-panel', [['33003', '3003', 'tcp']]],
  ['staging-livekit', [
    ['37880', '7880', 'tcp'],
    ['37881', '37881', 'tcp'],
    ['35000-35100', '35000-35100', 'udp'],
  ]],
  ['staging-prometheus', [['39090', '9090', 'tcp']]],
  ['staging-alertmanager', [['39093', '9093', 'tcp']]],
  ['staging-loki', [['33100', '3100', 'tcp']]],
  ['staging-alloy', [['32345', '12345', 'tcp']]],
]);

const validCompose = (environment = validEnvironment()) => {
  const project = environment.MENORAH_SERVER_STAGING_PROJECT_NAME;
  const prefix = environment.MENORAH_SERVER_STAGING_RESOURCE_PREFIX;
  const services = Object.fromEntries(portServices.map(
    ([serviceName, ports]) => [
      serviceName,
      safeService(project, {
        ports: ports.map(([published, target, protocol]) => ({
          host_ip: (
            serviceName === 'staging-livekit'
            && (
              published === '37881'
              || protocol === 'udp'
            )
          )
            ? environment.LIVEKIT_MEDIA_BIND_IP
            : '127.0.0.1',
          published,
          target: Number.isNaN(Number(target)) ? target : Number(target),
          protocol,
        })),
      }),
    ],
  ));
  for (const [serviceName, networks] of Object.entries(
    REQUIRED_SERVICE_NETWORKS,
  )) {
    if (!services[serviceName]) {
      services[serviceName] = safeService(project);
    }
    services[serviceName].networks = [...networks];
  }
  services['staging-mongo-primary'] = safeService(project, {
    image: 'mongo:7',
    networks: ['staging-data'],
  });
  services['staging-mongo-restore'] = safeService(project, {
    image: 'mongo:7',
    networks: ['staging-restore'],
  });
  services['staging-redis'] = safeService(project, {
    image: 'redis:7',
    networks: ['staging-data'],
  });
  services['staging-storage-init'] = safeService(project, {
    restart: 'no',
    user: '0:0',
    read_only: true,
    cap_add: ['DAC_OVERRIDE', 'FOWNER'],
    network_mode: 'none',
    networks: [],
    volumes: [{
      type: 'bind',
      source: environment.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT,
      target: '/opt/menorah-staging/deploy-state',
    }],
  });
  services['staging-logs-init'] = safeService(project, {
    restart: 'no',
    network_mode: 'none',
    networks: [],
  });
  const mediaVolumes = [
    {
      type: 'volume',
      source: 'staging-uploads',
      target: '/app/uploads',
    },
    {
      type: 'volume',
      source: 'staging-managed-media',
      target: '/app/managed-media',
    },
  ];
  services['staging-media-permissions-init'] = safeService(project, {
    restart: 'no',
    user: '0:0',
    read_only: true,
    cap_add: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER'],
    network_mode: 'none',
    networks: [],
    entrypoint: ['/bin/sh', '-euc'],
    command: [`
      backend_uid="$(id -u menorah)"
      backend_gid="$(id -g menorah)"
      readlink -f /app/uploads
      find /app/uploads /app/managed-media -xdev -type l
      chown -R "$backend_uid:$backend_gid" /app/uploads /app/managed-media
      chmod 0750 /app/uploads /app/managed-media
    `],
    volumes: mediaVolumes,
    depends_on: {
      'staging-storage-init': {
        condition: 'service_completed_successfully',
      },
    },
  });
  services['staging-backup-job'] = safeService(project, {
    restart: 'no',
    user: '0:0',
    cap_add: ['DAC_READ_SEARCH'],
    networks: ['staging-data', 'staging-monitoring'],
    environment: {
      HOME: '/tmp',
      MONGODB_STAGING_BACKUP_URI: environment.MONGODB_BACKUP_URI,
    },
  });
  services['staging-migrate'] = safeService(project, {
    restart: 'no',
    command: ['node', 'src/database/migrate.js'],
    environment: {
      MONGODB_URI: environment.MONGODB_MIGRATION_URI,
    },
    networks: ['staging-data'],
  });
  services['staging-seed'] = safeService(project, {
    restart: 'no',
    command: ['node', 'src/database/seed-server-staging.js'],
    environment: {
      MONGODB_URI: environment.MONGODB_MIGRATION_URI,
    },
    networks: ['staging-data'],
  });
  services['staging-user-web-app'].environment = {
    MONGODB_URI: environment.MONGODB_URI,
  };
  services['staging-mongodb-exporter'].environment = {
    MONGODB_URI: environment.MONGODB_MONITORING_URI,
  };
  for (const serviceName of [
    'staging-api-ios',
    'staging-api-android',
    'staging-api-web',
    'staging-api-admin',
    'staging-worker',
  ]) {
    services[serviceName].environment = {
      MONGODB_URI: environment.MONGODB_URI,
      TRUST_PROXY: environment.MENORAH_SERVER_STAGING_CADDY_APP_IP,
    };
    services[serviceName].volumes = mediaVolumes.map((volume) => ({
      ...volume,
    }));
    services[serviceName].depends_on = {
      'staging-media-permissions-init': {
        condition: 'service_completed_successfully',
      },
    };
  }
  const disabledBackendEnvironment = {
    APPLE_SIGN_IN_ENABLED: 'false',
    ENABLE_SOCIAL_SCHEDULER: 'false',
    SOCIAL_STUDIO_ENABLED: 'false',
    SOCIAL_STUDIO_AUTO_PUBLISH: 'false',
    GOOGLE_WEB_CLIENT_ID: '',
    GOOGLE_IOS_CLIENT_ID: '',
    GOOGLE_ANDROID_CLIENT_ID: '',
    APPLE_IOS_BUNDLE_ID: '',
    APPLE_WEB_SERVICE_ID: '',
    APPLE_TEAM_ID: '',
    APPLE_KEY_ID: '',
    APPLE_PRIVATE_KEY: '',
    SOCIAL_STUDIO_OPENAI_API_KEY: '',
    SOCIAL_TOKEN_ENCRYPTION_KEY: '',
    META_APP_ID: '',
    META_APP_SECRET: '',
  };
  for (const serviceName of [
    'staging-api-ios',
    'staging-api-android',
    'staging-api-web',
    'staging-api-admin',
    'staging-worker',
    'staging-migrate',
    'staging-seed',
  ]) {
    Object.assign(
      services[serviceName].environment,
      disabledBackendEnvironment,
      {
        BOOKING_SERVICE_CATALOG_JSON:
          environment.BOOKING_SERVICE_CATALOG_JSON,
      },
    );
  }
  const selectEnvironment = (keys) => Object.fromEntries(
    keys.map((key) => [key, environment[key]]),
  );
  const bookingKeys = [
    'BOOKING_PAYMENTS_ENABLED',
    'SUBSCRIPTION_PAYMENTS_ENABLED',
    'RAZORPAY_MODE',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'RAZORPAY_WEBHOOK_SECRET_PREVIOUS',
    'PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS',
    'CHECKOUT_RETURN_URL',
  ];
  const payoutKeys = [
    'PAYOUTS_ENABLED',
    'RAZORPAY_X_MODE',
    'RAZORPAY_X_KEY_ID',
    'RAZORPAY_X_KEY_SECRET',
    'RAZORPAY_X_WEBHOOK_SECRET',
    'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
  ];
  const resendKeys = [
    'RESEND_PROVIDER_ENABLED',
    'RESEND_MODE',
    'RESEND_API_KEY',
    'RESEND_API_URL',
    'EMAIL_FROM',
    'CONTACT_TO_EMAIL',
  ];
  const cloudinaryKeys = [
    'MEDIA_STORAGE_BACKEND',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_UPLOAD_PREFIX',
    'MEDIA_PUBLIC_BASE_URL',
    'UPLOAD_PATH',
  ];
  Object.assign(
    services['staging-api-ios'].environment,
    selectEnvironment(bookingKeys),
    selectEnvironment(resendKeys),
    selectEnvironment(cloudinaryKeys),
    { PAYOUTS_ENABLED: 'false' },
  );
  for (const serviceName of [
    'staging-api-android',
    'staging-api-web',
  ]) {
    Object.assign(
      services[serviceName].environment,
      selectEnvironment(resendKeys),
      selectEnvironment(cloudinaryKeys),
      {
        BOOKING_PAYMENTS_ENABLED: 'false',
        PAYOUTS_ENABLED: 'false',
      },
    );
  }
  services['staging-api-web'].environment.RESEND_WEBHOOK_SECRET =
    environment.RESEND_WEBHOOK_SECRET;
  Object.assign(
    services['staging-api-admin'].environment,
    selectEnvironment(payoutKeys),
    selectEnvironment(resendKeys),
    selectEnvironment(cloudinaryKeys),
    { BOOKING_PAYMENTS_ENABLED: 'false' },
  );
  Object.assign(
    services['staging-worker'].environment,
    {
      BOOKING_PAYMENTS_ENABLED: 'false',
      PAYOUTS_ENABLED: 'false',
    },
  );
  Object.assign(
    services['staging-user-web-app'].environment,
    selectEnvironment(resendKeys),
    { NEXT_PUBLIC_RAZORPAY_KEY_ID:
      environment.NEXT_PUBLIC_RAZORPAY_KEY_ID },
  );
  services['staging-mail-capture'].environment = {
    MAIL_CAPTURE_API_KEY: environment.MAIL_CAPTURE_API_KEY,
  };
  const primaryInitializerEnvironment = Object.fromEntries(
    [
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
    ].map((key) => [key, environment[key]]),
  );
  services['staging-mongo-replica-init'] = safeService(project, {
    restart: 'no',
    networks: ['staging-data'],
    environment: primaryInitializerEnvironment,
    command: [
      'verify menorah-staging-rs staging-mongo-primary:27017',
    ],
    depends_on: {
      'staging-mongo-primary': { condition: 'service_healthy' },
    },
  });
  services['staging-mongo-restore'] = safeService(project, {
    image: 'mongo:7',
    profiles: ['recovery'],
    networks: ['staging-restore'],
  });
  services['staging-mongo-restore-replica-init'] = safeService(project, {
    restart: 'no',
    profiles: ['recovery'],
    networks: ['staging-restore'],
    environment: Object.fromEntries(
      [
        'MONGO_STAGING_ROOT_USER',
        'MONGO_STAGING_ROOT_PASSWORD',
        'MONGO_STAGING_RESTORE_USER',
        'MONGO_STAGING_RESTORE_PASSWORD',
      ].map((key) => [key, environment[key]]),
    ),
    command: [
      'verify menorah-staging-restore-rs staging-mongo-restore:27017',
    ],
    depends_on: {
      'staging-mongo-restore': { condition: 'service_healthy' },
    },
  });
  const volumeMount = (source, target, readOnly) => ({
    type: 'volume',
    source,
    target,
    read_only: readOnly,
  });
  services['staging-backup-job'].volumes = [
    volumeMount(
      'staging-filesystem-root',
      '/opt/menorah-staging',
      true,
    ),
    volumeMount(
      'staging-app-root',
      '/opt/menorah-staging/app',
      true,
    ),
    volumeMount(
      'staging-data-root',
      '/opt/menorah-staging/data',
      true,
    ),
    volumeMount(
      'staging-backups',
      '/opt/menorah-staging/backups',
      false,
    ),
    volumeMount(
      'staging-retrieval',
      '/opt/menorah-staging/data/backup-retrieval',
      false,
    ),
    volumeMount(
      'staging-uploads',
      '/opt/menorah-staging/data/uploads',
      true,
    ),
    volumeMount(
      'staging-managed-media',
      '/opt/menorah-staging/data/managed-media',
      true,
    ),
    {
      type: 'bind',
      source: environment.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT,
      target: '/opt/menorah-staging/deploy-state',
    },
    volumeMount('staging-logs', '/opt/menorah-staging/logs', true),
    volumeMount('staging-env-root', '/opt/menorah-staging/env', true),
  ];
  services['staging-restore-job'] = safeService(project, {
    restart: 'no',
    profiles: ['recovery'],
    networks: ['staging-restore'],
    environment: {
      HOME: '/tmp',
      MONGODB_STAGING_RESTORE_URI: environment.MONGODB_RESTORE_URI,
    },
    volumes: [
      volumeMount(
        'staging-filesystem-root',
        '/opt/menorah-staging',
        true,
      ),
      volumeMount(
        'staging-app-root',
        '/opt/menorah-staging/app',
        true,
      ),
      volumeMount(
        'staging-data-root',
        '/opt/menorah-staging/data',
        true,
      ),
      volumeMount(
        'staging-backups',
        '/opt/menorah-staging/backups',
        true,
      ),
      volumeMount(
        'staging-retrieval',
        '/opt/menorah-staging/data/backup-retrieval',
        true,
      ),
      volumeMount(
        'staging-restore-root',
        '/opt/menorah-staging/data/restore',
        false,
      ),
      volumeMount(
        'staging-restore-media',
        '/opt/menorah-staging/data/restore-media',
        false,
      ),
      {
        type: 'bind',
        source: environment.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT,
        target: '/opt/menorah-staging/deploy-state',
      },
      volumeMount('staging-logs', '/opt/menorah-staging/logs', true),
      volumeMount('staging-env-root', '/opt/menorah-staging/env', true),
    ],
    depends_on: {
      'staging-mongo-restore-replica-init': {
        condition: 'service_completed_successfully',
      },
    },
  });
  services['staging-prometheus'].environment = {
    MENORAH_SERVER_STAGING_PROJECT_NAME: project,
  };
  services['staging-prometheus'].command = [
    '--config.file=/etc/prometheus/prometheus.yml',
    '--enable-feature=expand-external-labels',
  ];
  services['staging-alertmanager'].volumes = [{
    type: 'bind',
    source: environment.ALERTMANAGER_CONFIG_SOURCE,
    target: '/etc/alertmanager/alertmanager.yml',
    read_only: true,
  }];
  services['staging-alertmanager'].user = '65534:65534';
  services['staging-alertmanager'].labels = {
    ...services['staging-alertmanager'].labels,
    'com.menorah.alertmanager-config-sha256':
      environment.ALERTMANAGER_CONFIG_SHA256,
  };
  services['staging-alertmanager'].networks = {
    'staging-egress': { gw_priority: 1 },
    'staging-monitoring': {
      aliases: ['staging-private-alertmanager'],
    },
  };
  for (const serviceName of EGRESS_SERVICE_NAMES) {
    if (serviceName === 'staging-alertmanager') continue;
    services[serviceName].networks = Object.fromEntries(
      services[serviceName].networks.map((networkName) => [
        networkName,
        networkName === 'staging-egress'
          ? { gw_priority: 1 }
          : {},
      ]),
    );
  }
  services['staging-caddy'].networks = {
    'staging-ingress': {},
    'staging-app': {
      ipv4_address: environment.MENORAH_SERVER_STAGING_CADDY_APP_IP,
    },
  };
  services['staging-caddy'].extra_hosts = Object.fromEntries(
    EXPECTED_HOSTS.map((hostname) => [hostname, '127.0.0.1']),
  );
  services['staging-caddy'].healthcheck = {
    test: [
      'CMD-SHELL',
      EXPECTED_HOSTS.map(
        (hostname) => (
          `wget --no-check-certificate -qO- `
          + `https://${hostname}/healthz | grep -qx ok`
        ),
      ).join(' && '),
    ],
  };
  services['staging-blackbox-exporter'].extra_hosts =
    Object.fromEntries(Object.values({
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
    }).map((hostname) => [
      hostname,
      environment.MENORAH_SERVER_STAGING_CADDY_APP_IP,
    ]));
  services['staging-livekit'].environment = {
    NODE_IP: environment.LIVEKIT_NODE_IP,
  };
  services['staging-livekit'].command = [
    '--config',
    environment.LIVEKIT_CONFIG_FILE,
  ];
  services['staging-livekit'].volumes = [{
    type: 'bind',
    source: stagingPath('livekit.yaml'),
    target: environment.LIVEKIT_CONFIG_FILE,
    read_only: true,
  }];
  const resourceLabels = {
    'com.menorah.environment': 'staging',
    'com.menorah.project': project,
    'com.menorah.stack': 'server-staging',
  };
  return {
    name: project,
    services,
    networks: Object.fromEntries(REQUIRED_NETWORK_SUFFIXES.map(
      (suffix, index) => [
        `staging-${suffix}`,
        {
          name: `${prefix}-${suffix}`,
          driver: 'bridge',
          internal: !['ingress', 'egress'].includes(suffix),
          ...(
            ['ingress', 'egress'].includes(suffix)
              ? {
                driver_opts: {
                  'com.docker.network.bridge.enable_icc': 'false',
                  'com.docker.network.bridge.enable_ip_masquerade':
                    suffix === 'egress' ? 'true' : 'false',
                  'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1',
                },
              }
              : {}
          ),
          labels: resourceLabels,
          ipam: {
            config: [{
              subnet: environment[
                `MENORAH_SERVER_STAGING_${suffix.toUpperCase()}_SUBNET`
              ],
              ip_range: environment[
                `MENORAH_SERVER_STAGING_${suffix.toUpperCase()}_IP_RANGE`
              ],
            }],
          },
        },
      ],
    )),
    volumes: Object.fromEntries(REQUIRED_VOLUME_SUFFIXES.map(
      (suffix) => [
        `staging-${suffix}`,
        {
          name: `${prefix}-${suffix}`,
          labels: resourceLabels,
        },
      ],
    )),
  };
};

const includesError = (errors, pattern) => (
  errors.some((error) => pattern.test(error))
);

test('strict parser accepts generated JSON strings but never shell syntax', () => {
  assert.deepEqual(
    parseEnvironmentSource('A="safe value"\nB=literal\n'),
    { A: 'safe value', B: 'literal' },
  );
  assert.throws(
    () => parseEnvironmentSource('A=$(id)\n'),
    /shell syntax is forbidden/,
  );
  assert.throws(
    () => parseEnvironmentSource('export A=value\n'),
    /literal KEY=value/,
  );
  assert.throws(
    () => parseEnvironmentSource('A=one\nA=two\n'),
    /duplicate key/,
  );
});

test('generator builds a complete, unique, synthetic contract', () => {
  const environment = validEnvironment();
  assert.equal(Object.hasOwn(environment, 'COMPOSE_PROJECT_NAME'), false);
  assert.equal(
    Object.hasOwn(environment, 'BACKUP_RESTORE_ACKNOWLEDGEMENT'),
    false,
  );
  assert.equal(
    path.posix.basename(
      environment.MENORAH_IDENTITY_RECONCILIATION_MARKER,
    ),
    IDENTITY_RECONCILIATION_MARKER_BASENAME,
  );
  assert.equal(
    environment.MENORAH_SERVER_STAGING_PROJECT_NAME,
    'menorah-server-staging-validation',
  );
  assert.equal(
    environment.MENORAH_RUNTIME_CANDIDATE_SHA,
    fixtureSha,
  );
  const activeSecretKeys = SECRET_KEYS.filter(
    (key) => !INACTIVE_PROVIDER_SECRET_KEYS.includes(key),
  );
  assert.equal(
    new Set(activeSecretKeys.map((key) => environment[key])).size,
    activeSecretKeys.length,
  );
  assert.deepEqual(
    validateEnvironmentRecord(environment, { productionMetadata }),
    [],
  );
  for (const key of activeSecretKeys) {
    const value = environment[key];
    assert.doesNotMatch(value, /todo|tbd|placeholder|example/i);
    assert.match(
      value.replace(/^(?:Aa1!|re_server_staging_|rzp_test_)/, ''),
      /^[0-9a-f]+$/,
    );
  }
  for (const key of INACTIVE_PROVIDER_SECRET_KEYS) {
    assert.equal(environment[key], '', key);
  }
});

test('real server-staging addresses and disabled providers validate exactly', () => {
  const environment = validRealEnvironment();
  assert.deepEqual(
    validateEnvironmentRecord(environment, {
      productionMetadata,
      now: Date.parse('2026-07-25T12:00:00.000Z'),
    }),
    [],
  );
});

test('real server-staging accepts explicit Resend and Cloudinary sandboxes', () => {
  for (const environment of [
    enabledRealResendEnvironment(),
    enabledRealCloudinaryEnvironment(),
  ]) {
    assert.deepEqual(
      validateEnvironmentRecord(environment, {
        productionMetadata,
        now: Date.parse('2026-07-25T12:00:00.000Z'),
      }),
      [],
    );
  }
});

test('real server-staging accepts complete test payment sandboxes', () => {
  const environment = validRealEnvironment();
  Object.assign(environment, {
    BOOKING_PAYMENTS_ENABLED: 'true',
    RAZORPAY_KEY_ID: `rzp_test_${'i'.repeat(24)}`,
    RAZORPAY_KEY_SECRET: `booking_secret_${'s'.repeat(32)}`,
    RAZORPAY_WEBHOOK_SECRET: `booking_webhook_${'w'.repeat(32)}`,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: `rzp_test_${'i'.repeat(24)}`,
    CHECKOUT_RETURN_URL:
      'https://app.staging.menorah.me/checkout/return',
    PAYOUTS_ENABLED: 'true',
    RAZORPAY_X_KEY_ID: `rzp_test_${'x'.repeat(24)}`,
    RAZORPAY_X_KEY_SECRET: `payout_secret_${'p'.repeat(32)}`,
    RAZORPAY_X_WEBHOOK_SECRET: `payout_webhook_${'h'.repeat(32)}`,
    RAZORPAY_PAYOUT_ACCOUNT_NUMBER: 'staging-payout-account-01',
  });
  assert.deepEqual(
    validateEnvironmentRecord(environment, {
      productionMetadata,
      now: Date.parse('2026-07-25T12:00:00.000Z'),
    }),
    [],
  );
});

test('real Alertmanager source accepts a protected digest-bound external receiver', () => {
  const environment = realAlertmanagerEnvironment();
  assert.deepEqual(
    validateAlertmanagerConfigSource(environment, {
      fsAdapter: alertmanagerFsAdapter(externalAlertmanagerSource),
    }),
    [],
  );
});

test('real Alertmanager source rejects missing, wrong-path, weak-mode, symlink, and digest drift', () => {
  const environment = realAlertmanagerEnvironment();
  const cases = [
    [
      { ...environment, ALERTMANAGER_CONFIG_SOURCE: '/tmp/alerts.yml' },
      alertmanagerFsAdapter(externalAlertmanagerSource),
      /exact reviewed project path/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, { missing: true }),
      /missing or cannot be inspected/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, {
        readError: true,
      }),
      /missing or cannot be inspected/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, { mode: 0o100440 }),
      /uid\/gid 65534 with mode 0400/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, { uid: 65533 }),
      /uid\/gid 65534 with mode 0400/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, { gid: 65533 }),
      /uid\/gid 65534 with mode 0400/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, {
        symbolicLink: true,
      }),
      /canonical regular non-symlink/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, {
        parentSymbolicLink: true,
      }),
      /parent directories must be root-owned/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, {
        parentUid: 1000,
      }),
      /parent directories must be root-owned/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, {
        parentMode: 0o40720,
      }),
      /parent directories must be root-owned/,
    ],
    [
      { ...environment, ALERTMANAGER_CONFIG_SHA256: 'b'.repeat(64) },
      alertmanagerFsAdapter(externalAlertmanagerSource),
      /digest does not match/,
    ],
    [
      environment,
      alertmanagerFsAdapter(externalAlertmanagerSource, {
        reportedSize: 1024 * 1024 + 1,
      }),
      /non-empty and at most 1 MiB/,
    ],
  ];
  for (const [candidate, fsAdapter, expected] of cases) {
    const errors = validateAlertmanagerConfigSource(candidate, {
      fsAdapter,
    });
    assert.ok(
      includesError(errors, expected),
      `expected ${expected}, received:\n${errors.join('\n')}`,
    );
  }
});

test('Alertmanager canonical contract rejects route and delivery bypasses', () => {
  const environment = realAlertmanagerEnvironment();
  const cases = [
    [
      externalAlertmanagerSource
        .replace(
          '  receiver: unmatched-drop',
          '  receiver: menorah-staging-operations',
        )
        .replace(
          '    - receiver: menorah-staging-operations',
          '    - receiver: unmatched-drop',
        ),
      /exact staging-only canonical route/,
    ],
    [
      externalAlertmanagerSource.replace(
        '        http_config:',
        '    slack_configs: [{api_url: "https://hooks.invalid"}]\n'
          + '        http_config:',
      ),
      /forbidden YAML flow/,
    ],
    [
      externalAlertmanagerSource.replace(
        '      matchers:',
        '      continue: true\n      matchers:',
      ),
      /exact staging-only canonical route/,
    ],
    [
      externalAlertmanagerSource.replace(
        '        send_resolved: true',
        '        send_resolved: true\n'
          + '      - url: https://alerts.staging-provider.invalid/second',
      ),
      /exact staging-only canonical route/,
    ],
    [
      externalAlertmanagerSource.replace(
        '      - url: https://',
        '      - url: >-\n          https://',
      ),
      /forbidden YAML flow, alias, tag, or folded syntax/,
    ],
    [
      externalAlertmanagerSource.replace(
        '  - name: unmatched-drop',
        '  - &drop name: unmatched-drop',
      ),
      /forbidden YAML flow|exact staging-only canonical route/,
    ],
    [
      externalAlertmanagerSource.replace(
        '          follow_redirects: false',
        '          follow_redirects: true',
      ),
      /exact staging-only canonical route/,
    ],
    [
      externalAlertmanagerSource.replace(
        '          follow_redirects: false',
        '          follow_redirects: false\n'
          + '          proxy_url: http://proxy.invalid',
      ),
      /exact staging-only canonical route/,
    ],
    [
      externalAlertmanagerSource.replace(
        '          follow_redirects: false',
        '          follow_redirects: false\n'
          + '          tls_config:\n'
          + '            insecure_skip_verify: true',
      ),
      /exact staging-only canonical route/,
    ],
  ];
  for (const [source, expected] of cases) {
    const errors = validateAlertmanagerConfigContent(
      environment,
      source,
    );
    assert.ok(
      includesError(errors, expected),
      `expected ${expected}, received:\n${errors.join('\n')}`,
    );
  }
});

test('local Alertmanager canonical contract rejects external HTTP delivery', () => {
  const source = readStaging('alertmanager.yml').replace(
    '        send_resolved: true',
    '        send_resolved: true\n'
      + '      - url: http://outside.invalid/alerts',
  );
  assert.ok(includesError(
    validateAlertmanagerConfigContent(validEnvironment(), source),
    /exact staging-only canonical route/,
  ));
});

test('real Alertmanager webhook requires exact HTTPS host and default port', () => {
  const environment = realAlertmanagerEnvironment();
  assert.deepEqual(
    validateAlertmanagerConfigContent(
      environment,
      externalAlertmanagerSource.replace(
        'https://alerts.staging-provider.invalid/',
        'https://alerts.staging-provider.invalid:443/',
      ),
    ),
    [],
  );
  for (const replacement of [
    'http://alerts.staging-provider.invalid/hooks/staging-fixture',
    'https://other.staging-provider.invalid/hooks/staging-fixture',
    'https://alerts.staging-provider.invalid:8443/hooks/staging-fixture',
  ]) {
    const source = externalAlertmanagerSource.replace(
      'https://alerts.staging-provider.invalid/hooks/staging-fixture',
      replacement,
    );
    assert.ok(includesError(
      validateAlertmanagerConfigContent(environment, source),
      /does not match the reviewed HTTPS endpoint/,
    ));
  }
});

test('real Alertmanager config review metadata must be fresh and not future-dated', () => {
  const now = Date.parse('2026-07-25T12:00:00.000Z');
  for (const reviewedAt of [
    '2026-06-24T11:59:59.000Z',
    '2026-07-25T12:05:01.000Z',
  ]) {
    const environment = {
      ...realAlertmanagerEnvironment(),
      ALERTMANAGER_CONFIG_REVIEWED_AT: reviewedAt,
    };
    const errors = validateEnvironmentRecord(environment, {
      productionMetadata,
      now,
    });
    assert.ok(includesError(
      errors,
      /config review must be exact, recent, and not future-dated/,
    ));
  }
  const wrongReference = {
    ...realAlertmanagerEnvironment(),
    ALERTMANAGER_CONFIG_REVIEW_REFERENCE:
      'staging-alert-delivery-ops-20260725',
  };
  assert.ok(includesError(
    validateEnvironmentRecord(wrongReference, {
      productionMetadata,
      now,
    }),
    /config review must use a staging-only reference/,
  ));
});

test('real Alertmanager rejects placeholder split and production receiver or token text', () => {
  const environment = realAlertmanagerEnvironment();
  const placeholderErrors = validateAlertmanagerConfigContent(
    environment,
    readStaging('alertmanager.yml'),
  );
  assert.ok(includesError(
    placeholderErrors,
    /exact staging-only canonical route/,
  ));

  const productionReceiver =
    externalAlertmanagerSource.replaceAll(
      'menorah-staging-operations',
      'menorah-production-operations',
    );
  const productionReceiverEnvironment = {
    ...environment,
    ALERTMANAGER_RECEIVER: 'menorah-production-operations',
    ALERTMANAGER_DELIVERY_RECEIVER: 'menorah-production-operations',
  };
  assert.ok(includesError(
    validateAlertmanagerConfigContent(
      productionReceiverEnvironment,
      productionReceiver,
    ),
    /production delivery state/,
  ));

  const productionToken = externalAlertmanagerSource.replace(
    'staging-fixture',
    'prod-token',
  );
  assert.ok(includesError(
    validateAlertmanagerConfigContent(environment, productionToken),
    /production delivery state/,
  ));
});

test('generator uses port 38443 for every externally reached local URL', () => {
  const environment = validEnvironment();
  const externalUrlKeys = [
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
    'COUNSELLOR_ONBOARDING_NOTICE_URL',
    'MEDIA_PUBLIC_BASE_URL',
    'LIVEKIT_URL',
  ];
  for (const key of externalUrlKeys) {
    assert.equal(
      new URL(environment[key]).port,
      '38443',
      `${key} must use the loopback-only Caddy TLS port`,
    );
  }
  for (const origin of environment.ALLOWED_ORIGINS.split(',')) {
    assert.equal(new URL(origin).port, '38443');
  }
  for (const sessionOrigin of environment.WEB_SESSION_ORIGINS.split(',')) {
    assert.equal(
      new URL(sessionOrigin.split('=')[0]).port,
      '38443',
    );
  }
  assert.equal(environment.CHECKOUT_RETURN_URL, '');
  assert.equal(
    environment.LIVEKIT_API_URL,
    'http://staging-livekit:7880',
  );
  assert.equal(
    environment.MENORAH_API_BASE_URL,
    'http://staging-api-web:8080/api',
  );
});

test('tracked real-server contract keeps external staging URLs portless', () => {
  const contract = parseEnvironmentSource(contractSource);
  for (const key of [
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
    'COUNSELLOR_ONBOARDING_NOTICE_URL',
    'MEDIA_PUBLIC_BASE_URL',
    'LIVEKIT_URL',
  ]) {
    assert.equal(new URL(contract[key]).port, '', key);
  }
});

test('tracked real-server contract is dry-render complete without persistent authority', () => {
  const contract = parseEnvironmentSource(contractSource);
  const composeSource = readStaging('compose.yml');
  const requiredComposeKeys = new Set(
    [...composeSource.matchAll(
      /\$\{([A-Z][A-Z0-9_]*):\?[^}]*\}/g,
    )].map((match) => match[1]),
  );
  const syntheticSeedInputs = [
    'MENORAH_SERVER_STAGING_ADMIN_CONTENT_PASSWORD',
    'MENORAH_SERVER_STAGING_ADMIN_FINANCE_PASSWORD',
    'MENORAH_SERVER_STAGING_ADMIN_FULL_1_PASSWORD',
    'MENORAH_SERVER_STAGING_ADMIN_FULL_2_PASSWORD',
    'MENORAH_SERVER_STAGING_ADMIN_SUPPORT_PASSWORD',
    'MENORAH_SERVER_STAGING_COUNSELLOR_A_PASSWORD',
    'MENORAH_SERVER_STAGING_COUNSELLOR_DRAFT_PASSWORD',
    'MENORAH_SERVER_STAGING_COUNSELLOR_SUSPENDED_PASSWORD',
    'MENORAH_SERVER_STAGING_SEED_CONFIRM',
    'MENORAH_SERVER_STAGING_USER_A_PASSWORD',
    'MENORAH_SERVER_STAGING_USER_B_PASSWORD',
  ].sort();
  const missingRequiredKeys = [...requiredComposeKeys]
    .filter((key) => !Object.hasOwn(contract, key))
    .sort();

  assert.equal(
    contract.MENORAH_SERVER_STAGING_PROJECT_NAME,
    REAL_PROJECT,
  );
  assert.equal(
    path.posix.basename(
      contract.MENORAH_IDENTITY_RECONCILIATION_MARKER,
    ),
    IDENTITY_RECONCILIATION_MARKER_BASENAME,
  );
  assert.deepEqual(missingRequiredKeys, []);
  for (const key of syntheticSeedInputs) {
    assert.equal(Object.hasOwn(contract, key), false, key);
    assert.match(
      composeSource,
      new RegExp(`\\$\\{${key}:-\\}`),
      `${key} must remain a command-scoped seed input`,
    );
  }
  for (const key of [
    'BACKUP_RESTORE_ACKNOWLEDGEMENT',
    'COMPOSE_FILE',
    'COMPOSE_PROJECT_NAME',
    'DOCKER_HOST',
    'GIT_DIR',
    'MENORAH_STAGING_BACKUP_ACK',
    'MENORAH_STAGING_DEPLOY_ACK',
    'MENORAH_STAGING_MANIFEST_ACK',
    'MENORAH_STAGING_MIGRATION_ACK',
    'MENORAH_STAGING_RESTORE_ACK',
    'MENORAH_STAGING_ROLLBACK_ACK',
    'MENORAH_STAGING_ROOTS_ACK',
  ]) {
    assert.equal(Object.hasOwn(contract, key), false, key);
  }

  for (const key of [
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
    'APPLE_TEAM_ID',
    'APPLE_WEB_SERVICE_ID',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_TUNNEL_ID',
    'GOOGLE_ANDROID_CLIENT_ID',
    'GOOGLE_IOS_CLIENT_ID',
    'GOOGLE_WEB_CLIENT_ID',
    'LUXAND_API_TOKEN',
    'OPENAI_API_KEY',
  ]) {
    assert.match(contract[key], /^disabled-for-server-staging/, key);
  }
  for (const key of [
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'NEXT_PUBLIC_RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
    'RAZORPAY_WEBHOOK_SECRET',
    'RAZORPAY_WEBHOOK_SECRET_PREVIOUS',
    'RAZORPAY_X_KEY_ID',
    'RAZORPAY_X_KEY_SECRET',
    'RAZORPAY_X_WEBHOOK_SECRET',
    'CHECKOUT_RETURN_URL',
    'CONTACT_TO_EMAIL',
    'EMAIL_FROM',
    'RESEND_API_KEY',
    'RESEND_API_URL',
    'RESEND_WEBHOOK_SECRET',
  ]) {
    assert.equal(contract[key], '', key);
  }
  assert.match(
    contract.MAIL_CAPTURE_API_KEY,
    /^re_server_staging_<replace-with-at-least-32-random-characters>$/,
  );
});

test('generator refuses overwrite and invalid runtime SHA', async () => {
  assert.throws(
    () => buildValidationEnvironment({
      candidateSha: 'main',
      contractKeys: parseContractKeys(contractSource),
    }),
    /40-character runtime candidate SHA/,
  );
  const temporary = await mkdtemp(
    path.join(tmpdir(), 'menorah-staging-generator-'),
  );
  try {
    const target = path.join(temporary, 'existing');
    await writeFile(target, 'do not overwrite');
    await assert.rejects(
      assertGeneratedTargetsAbsent([target]),
      /Refusing to overwrite or rotate/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

const environmentMutations = [
  ['empty value', (env) => { env.JWT_SECRET = ''; }, /must not be empty/],
  ['placeholder', (env) => { env.JWT_SECRET = '<replace-with-secret>'; }, /placeholder/],
  ['runtime mode', (env) => { env.DEPLOYMENT_ENVIRONMENT = 'production'; }, /must be staging/],
  ['production domain', (env) => { env.APP_DOMAIN = 'app.menorah.me'; }, /production domain/],
  ['production root', (env) => { env.MENORAH_BACKUP_ROOT = '/opt/menorah/backups'; }, /production filesystem root/],
  ['production project', (env) => {
    env.MENORAH_SERVER_STAGING_PROJECT_NAME = 'menorah';
    env.MENORAH_SERVER_STAGING_RESOURCE_PREFIX = 'menorah';
  }, /collides with production/],
  ['database name', (env) => { env.MONGO_DATABASE = 'menorah'; }, /database must be menorah_staging/],
  ['replica set', (env) => { env.MONGODB_REPLICA_SET_NAME = 'menorah-rs'; }, /replica set must be/],
  ['Redis discovery', (env) => { env.REDIS_URL = env.REDIS_URL.replace('staging-redis', 'redis'); }, /staging Redis identity/],
  ['Mongo role reuse', (env) => { env.MONGO_STAGING_BACKUP_USER = env.MONGO_STAGING_APP_USER; }, /six MongoDB identities/],
  ['secret reuse', (env) => { env.JWT_REFRESH_SECRET = env.JWT_SECRET; }, /secret values must not be reused/],
  ['live Razorpay', (env) => { env.RAZORPAY_MODE = 'live'; }, /must remain in test mode/],
  ['live RazorpayX', (env) => { env.RAZORPAY_X_MODE = 'production'; }, /must remain in test mode/],
  ['production Resend', (env) => { env.EMAIL_FROM = 'Menorah <noreply@menorah.me>'; }, /production domain/],
  ['production LiveKit', (env) => { env.LIVEKIT_URL = 'wss://calls.menorah.me'; }, /production domain/],
  ['localhost callback', (env) => { env.CHECKOUT_RETURN_URL = 'https://localhost/callback'; }, /expected full-label staging host/],
  ['wrong local validation HTTPS port', (env) => { env.MEDIA_PUBLIC_BASE_URL = 'https://api-web.staging.menorah.me:38444'; }, /exact local validation port 38443/],
  ['live payout flag', (env) => { env.PAYOUTS_ENABLED = 'true'; env.RAZORPAY_X_MODE = 'live'; }, /requires RAZORPAY_X_MODE=test/],
  ['incomplete payment test mode', (env) => { env.BOOKING_PAYMENTS_ENABLED = 'true'; env.RAZORPAY_KEY_SECRET = 'disabled-for-synthetic-server-staging'; }, /complete test-mode/],
  ['inactive booking credential', (env) => {
    env.RAZORPAY_KEY_ID = `rzp_test_${'b'.repeat(24)}`;
  }, /BOOKING_PAYMENTS_ENABLED=false requires empty RAZORPAY_KEY_ID/],
  ['public payment key drift', (env) => {
    env.NEXT_PUBLIC_RAZORPAY_KEY_ID = `rzp_test_${'p'.repeat(24)}`;
  }, /public and private Razorpay test key IDs must match exactly/],
  ['inactive Cloudinary credential', (env) => {
    env.CLOUDINARY_API_KEY = 'staging-cloudinary-key';
  }, /local media storage must omit Cloudinary credentials/],
  ['non-canonical network subnet', (env) => {
    env.MENORAH_SERVER_STAGING_INGRESS_SUBNET =
      '10.252.240.1/24';
  }, /INGRESS_SUBNET must be one canonical RFC1918 \/24/],
  ['non-private network subnet', (env) => {
    env.MENORAH_SERVER_STAGING_INGRESS_SUBNET =
      '100.64.10.0/24';
  }, /INGRESS_SUBNET must be one canonical RFC1918 \/24/],
  ['network range outside its subnet', (env) => {
    env.MENORAH_SERVER_STAGING_APP_IP_RANGE =
      '10.252.250.128/25';
  }, /APP_IP_RANGE must be contained by .*APP_SUBNET/],
  ['overlapping environment networks', (env) => {
    env.MENORAH_SERVER_STAGING_DATA_SUBNET =
      env.MENORAH_SERVER_STAGING_APP_SUBNET;
    env.MENORAH_SERVER_STAGING_DATA_IP_RANGE =
      env.MENORAH_SERVER_STAGING_APP_IP_RANGE;
  }, /DATA_SUBNET overlaps .*APP_SUBNET/],
  ['Caddy address inside dynamic range', (env) => {
    env.MENORAH_SERVER_STAGING_CADDY_APP_IP =
      '10.252.241.130';
  }, /usable app-network host outside its dynamic range/],
  ['Caddy address on Docker gateway', (env) => {
    env.MENORAH_SERVER_STAGING_CADDY_APP_IP =
      '10.252.241.1';
  }, /usable app-network host outside its dynamic range/],
  ['local LiveKit public media address', (env) => {
    env.LIVEKIT_MEDIA_BIND_IP = '192.168.50.10';
  }, /local validation LiveKit bind and advertised addresses must be 127\.0\.0\.1/],
  ['backup lock outside deployment state', (env) => {
    env.BACKUP_LOCK_FILE =
      `${env.MENORAH_SERVER_STAGING_BACKUP_ROOT}/.backup.lock`;
  }, /exact deployment-state \.backup\.lock/],
  ['persistent backup metadata authority', (env) => {
    env.BACKUP_METADATA_FILE =
      `${env.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT}/backup.json`;
  }, /BACKUP_METADATA_FILE is not a persistent environment authority/],
  ['mail capture key identity drift', (env) => {
    env.MAIL_CAPTURE_API_KEY = `re_local_${'m'.repeat(40)}`;
  }, /strong isolated server-staging capture key/],
  ['validation Resend capture drift', (env) => {
    env.RESEND_API_URL = 'https://api.resend.com/emails';
  }, /exact isolated capture identity/],
  ['generic Tunnel token', (env) => { env.TUNNEL_TOKEN = 'not-allowed-staging-token'; }, /Tunnel token is forbidden/],
  ['production Tunnel ID', (env) => { env.CLOUDFLARE_TUNNEL_ID = productionMetadata.tunnelIds[0]; }, /Tunnel ID collides/],
  ['production state marker', (env) => { env.MENORAH_CURRENT_SHA_FILE = '/opt/menorah/deploy-state/current-sha'; }, /production filesystem root/],
  ['production restore target', (env) => { env.MENORAH_RESTORE_ROOT = '/opt/menorah/data/restore'; }, /production filesystem root/],
  ['persistent restore ack', (env) => { env.BACKUP_RESTORE_ACKNOWLEDGEMENT = 'yes'; }, /forbidden in the persistent/],
  ['Compose authority', (env) => { env.COMPOSE_PROJECT_NAME = REAL_PROJECT; }, /forbidden in the persistent/],
  ['Docker authority', (env) => { env.DOCKER_HOST = 'tcp://production.invalid:2376'; }, /forbidden in the persistent/],
  ['Git authority', (env) => { env.GIT_DIR = '/opt/menorah/.git'; }, /forbidden in the persistent/],
  ['operation authority', (env) => { env.MENORAH_STAGING_DEPLOY_ACK = 'DEPLOY_EXACT_MENORAH_STAGING_SHA'; }, /forbidden in the persistent/],
  ['non-loopback admin port', (env) => { env.API_ADMIN_LOCAL_PORT = '0.0.0.0:38083'; }, /API_ADMIN_LOCAL_PORT must be/],
  ['storage prefix', (env) => { env.MEDIA_STORAGE_BACKEND = 'cloudinary'; env.CLOUDINARY_UPLOAD_PREFIX = 'menorah-production'; }, /CLOUDINARY_UPLOAD_PREFIX must equal/],
  ['production storage bucket', (env) => { env.MEDIA_STORAGE_BUCKET = productionMetadata.storageBuckets[0]; }, /staging-only storage/],
  ['mutable image', (env) => { env.MENORAH_SERVER_STAGING_BACKEND_IMAGE = 'menorah/backend:latest'; }, /immutable staging image/],
];

for (const [name, mutate, expected] of environmentMutations) {
  test(`environment rejects ${name}`, () => {
    const environment = validEnvironment();
    mutate(environment);
    const errors = validateEnvironmentRecord(
      environment,
      { productionMetadata },
    );
    assert.ok(
      includesError(errors, expected),
      `expected ${expected}, received:\n${errors.join('\n')}`,
    );
  });
}

const realEnvironmentMutations = [
  ['internal Resend capture', (env) => {
    env.RESEND_API_URL = 'http://staging-mail-capture:8025/emails';
    env.RESEND_API_KEY = env.MAIL_CAPTURE_API_KEY;
    env.RESEND_WEBHOOK_SECRET = `capture_webhook_${'w'.repeat(32)}`;
    env.EMAIL_FROM =
      'Menorah Staging <noreply@mail.staging.menorah.me>';
    env.CONTACT_TO_EMAIL = 'sink@mail.staging.menorah.me';
  }, /real server staging with Resend disabled requires empty RESEND_API_URL/],
  ['disabled Resend residue', (env) => {
    env.CONTACT_TO_EMAIL = 'sink@mail.staging.menorah.me';
  }, /Resend disabled requires empty CONTACT_TO_EMAIL/],
  ['non-canonical media bind', (env) => {
    env.LIVEKIT_MEDIA_BIND_IP = '192.168.050.10';
  }, /LIVEKIT_MEDIA_BIND_IP must be a canonical non-special host address/],
  ['media bind inside Docker network', (env) => {
    env.LIVEKIT_MEDIA_BIND_IP = '10.252.241.10';
  }, /outside all six Docker networks/],
  ['private advertised LiveKit node', (env) => {
    env.LIVEKIT_NODE_IP = '192.168.50.10';
  }, /LIVEKIT_NODE_IP must be a canonical globally routable IPv4 address/],
  ['enabled Resend endpoint drift', (env) => {
    Object.assign(env, enabledRealResendEnvironment(), {
      RESEND_API_URL: 'https://api.resend.com/batch',
    });
  }, /enabled Resend must use exact endpoint/],
  ['enabled Resend incomplete routing', (env) => {
    Object.assign(env, enabledRealResendEnvironment(), {
      CONTACT_TO_EMAIL: '',
    });
  }, /complete staging-domain sender and recipient/],
  ['enabled Resend weak webhook', (env) => {
    Object.assign(env, enabledRealResendEnvironment(), {
      RESEND_WEBHOOK_SECRET: 'weak-webhook-key',
    });
  }, /complete external sandbox webhook secret/],
  ['incomplete Cloudinary sandbox', (env) => {
    Object.assign(env, enabledRealCloudinaryEnvironment(), {
      CLOUDINARY_API_SECRET: '',
    });
  }, /requires complete staging-only CLOUDINARY_API_SECRET/],
];

for (const [name, mutate, expected] of realEnvironmentMutations) {
  test(`real environment rejects ${name}`, () => {
    const environment = validRealEnvironment();
    mutate(environment);
    const errors = validateEnvironmentRecord(environment, {
      productionMetadata,
      now: Date.parse('2026-07-25T12:00:00.000Z'),
    });
    assert.ok(
      includesError(errors, expected),
      `expected ${expected}, received:\n${errors.join('\n')}`,
    );
  });
}

test('rendered collision model accepts the isolated synthetic baseline', () => {
  const environment = validEnvironment();
  const model = validCompose(environment);
  assert.equal(
    EXPECTED_PUBLISHED_PORTS.length,
    Object.values(model.services).reduce(
      (count, service) => count + (service.ports || []).length,
      0,
    ),
  );
  assert.deepEqual(
    validateRenderedCompose(model, environment, productionMetadata),
    [],
  );
});

test('rendered collision model preserves the exact real-project default', () => {
  const environment = validEnvironment();
  environment.MENORAH_SERVER_STAGING_PROJECT_NAME = REAL_PROJECT;
  environment.MENORAH_SERVER_STAGING_RESOURCE_PREFIX = REAL_PROJECT;
  const model = validCompose(environment);
  assert.deepEqual(
    validateRenderedCompose(model, environment, productionMetadata),
    [],
  );
});

test('production collision metadata is fail-closed and structurally complete', () => {
  assert.deepEqual(validateProductionMetadata(productionMetadata), []);
  const errors = validateProductionMetadata({});
  assert.ok(includesError(errors, /schemaVersion/));
  assert.ok(includesError(errors, /projectNames array is required/));
  assert.ok(includesError(errors, /callbackUrls array is required/));
});

const composeMutations = [
  ['production retrieval root metadata', (_model, env) => {
    env.MENORAH_RETRIEVAL_ROOT = productionMetadata.retrievalRoots[0];
  }, /retrieval root collides with production metadata/],
  ['project', (model) => { model.name = 'menorah'; }, /rendered Compose name/],
  ['container name', (model) => { model.services['staging-api-admin'].container_name = 'production-admin'; }, /non-staging container_name/],
  ['production port', (model) => { model.services['staging-api-admin'].ports[0].published = '18083'; }, /collides with production metadata/],
  ['public admin bind', (model) => { model.services['staging-api-admin'].ports[0].host_ip = '0.0.0.0'; }, /must bind to 127.0.0.1/],
  ['Mongo port', (model) => { model.services['staging-mongo-primary'].ports = [{ host_ip: '127.0.0.1', published: '27017', target: 27017 }]; }, /must not publish a host port/],
  ['Redis port', (model) => { model.services['staging-redis'].ports = [{ host_ip: '127.0.0.1', published: '6379', target: 6379 }]; }, /must not publish a host port/],
  ['external network', (model) => { model.networks['staging-data'].external = true; }, /must not be external/],
  ['disabled egress NAT', (model) => {
    model.networks['staging-egress'].driver_opts[
      'com.docker.network.bridge.enable_ip_masquerade'
    ] = 'false';
  }, /reviewed egress-capable NAT bridge/],
  ['enabled ingress NAT', (model) => {
    model.networks['staging-ingress'].driver_opts[
      'com.docker.network.bridge.enable_ip_masquerade'
    ] = 'true';
  }, /reviewed non-NAT ingress bridge/],
  ['internal ingress network', (model) => {
    model.networks['staging-ingress'].internal = true;
  }, /reviewed non-NAT ingress bridge/],
  ['non-internal data network', (model) => {
    model.networks['staging-data'].internal = false;
  }, /staging-data must remain internal and non-egress-capable/],
  ['wrong egress dynamic range', (model) => {
    model.networks['staging-egress'].ipam.config[0].ip_range =
      '10.252.245.0/25';
  }, /dynamic range must exactly match/],
  ['wrong app dynamic range', (model) => {
    model.networks['staging-app'].ipam.config[0].ip_range =
      '10.252.241.0/25';
  }, /staging-app subnet and dynamic range must exactly match/],
  ['missing API egress gateway priority', (model) => {
    delete model.services['staging-api-android']
      .networks['staging-egress'].gw_priority;
  }, /staging-api-android must use staging-egress as its explicit default gateway/],
  ['unapproved egress member', (model) => {
    model.services['staging-worker'].networks = {
      'staging-app': {},
      'staging-data': {},
      'staging-ingress': {},
      'staging-egress': { gw_priority: 1 },
    };
  }, /only the six approved provider services/],
  ['production network', (model) => { model.networks['staging-data'].name = 'menorah_db_net'; }, /collides with production/],
  ['production subnet', (model) => { model.networks['staging-data'].ipam = { config: [{ subnet: productionMetadata.networkSubnets[0] }] }; }, /subnet collides with production/],
  ['containing production subnet', (model) => {
    model.networks['staging-data'].ipam = {
      config: [{ subnet: '10.250.240.0/23' }],
    };
  }, /subnet collides with production/],
  ['overlapping staging subnet', (model) => {
    model.networks['staging-data'].ipam = {
      config: [{ subnet: '10.252.241.128/25' }],
    };
  }, /overlaps staging network/],
  ['wrong Caddy static address', (model) => {
    model.services['staging-caddy'].networks[
      'staging-app'
    ].ipv4_address = '10.252.241.11';
  }, /staging-caddy must use the exact reviewed static app address/],
  ['wrong Caddy readiness address', (model) => {
    model.services['staging-caddy'].extra_hosts[
      'admin.staging.menorah.me'
    ] = '10.252.241.10';
  }, /staging-caddy TLS readiness hosts must resolve only to its own loopback/],
  ['incomplete Caddy TLS readiness probe', (model) => {
    model.services['staging-caddy'].healthcheck.test[1] =
      model.services['staging-caddy'].healthcheck.test[1].replace(
        'https://admin.staging.menorah.me/healthz',
        'https://staging.menorah.me/healthz',
      );
  }, /staging-caddy healthcheck must prove every reviewed HTTPS certificate ready/],
  ['wrong API trusted proxy address', (model) => {
    model.services['staging-api-ios'].environment.TRUST_PROXY =
      '10.252.241.11';
  }, /staging-api-ios TRUST_PROXY must equal the reviewed Caddy address/],
  ['wrong blackbox staging-host address', (model) => {
    model.services['staging-blackbox-exporter'].extra_hosts[
      'calls.staging.menorah.me'
    ] = '10.252.241.11';
  }, /blackbox monitoring hosts must resolve only to the reviewed Caddy address/],
  ['wrong LiveKit media bind', (model) => {
    model.services['staging-livekit'].ports.find(
      ({ published }) => published === '37881',
    ).host_ip = '127.0.0.2';
  }, /LiveKit must use the exact signaling, config, advertised-IP, and public media contract/],
  ['wrong LiveKit media target', (model) => {
    model.services['staging-livekit'].ports.find(
      ({ published }) => published === '37881',
    ).target = 7881;
  }, /LiveKit must use the exact signaling, config, advertised-IP, and public media contract/],
  ['wrong LiveKit config source', (model) => {
    model.services['staging-livekit'].volumes[0].source =
      stagingPath('other.yaml');
  }, /LiveKit must use the exact signaling, config, advertised-IP, and public media contract/],
  ['worker Resend secret leakage', (model, env) => {
    model.services['staging-worker'].environment.RESEND_API_KEY =
      env.RESEND_API_KEY;
  }, /staging-worker must not receive provider-scoped RESEND_API_KEY/],
  ['missing shared worker booking catalog', (model) => {
    delete model.services['staging-worker'].environment
      .BOOKING_SERVICE_CATALOG_JSON;
  }, /staging-worker must receive the exact shared booking service catalog/],
  ['migration Cloudinary secret leakage', (model, env) => {
    model.services['staging-migrate'].environment
      .CLOUDINARY_API_SECRET = env.CLOUDINARY_API_SECRET;
  }, /staging-migrate must not receive provider-scoped CLOUDINARY_API_SECRET/],
  ['seed payment secret leakage', (model, env) => {
    model.services['staging-seed'].environment.RAZORPAY_KEY_SECRET =
      env.RAZORPAY_KEY_SECRET;
  }, /staging-seed must not receive provider-scoped RAZORPAY_KEY_SECRET/],
  ['booking secret leakage to Android API', (model, env) => {
    model.services['staging-api-android'].environment
      .RAZORPAY_KEY_SECRET = env.RAZORPAY_KEY_SECRET;
  }, /staging-api-android must not receive provider-scoped RAZORPAY_KEY_SECRET/],
  ['missing web Resend webhook scope', (model) => {
    delete model.services['staging-api-web'].environment
      .RESEND_WEBHOOK_SECRET;
  }, /staging-api-web must receive the exact reviewed RESEND_WEBHOOK_SECRET/],
  ['Resend secret leakage into mail capture', (model, env) => {
    model.services['staging-mail-capture'].environment.RESEND_API_KEY =
      env.RESEND_API_KEY;
  }, /staging-mail-capture must receive only its isolated capture key/],
  ['mail-capture key leakage into worker', (model, env) => {
    model.services['staging-worker'].environment
      .MAIL_CAPTURE_API_KEY = env.MAIL_CAPTURE_API_KEY;
  }, /staging-worker must not receive provider-scoped MAIL_CAPTURE_API_KEY/],
  ['payment gate leakage into migration', (model) => {
    model.services['staging-migrate'].environment
      .BOOKING_PAYMENTS_ENABLED = 'false';
  }, /staging-migrate must not receive provider gate BOOKING_PAYMENTS_ENABLED/],
  ['disabled Apple identity residue', (model) => {
    model.services['staging-api-admin'].environment.APPLE_TEAM_ID =
      'staging-apple-team';
  }, /staging-api-admin must render empty disabled provider identity APPLE_TEAM_ID/],
  ['enabled social gate', (model) => {
    model.services['staging-worker'].environment
      .SOCIAL_STUDIO_ENABLED = 'true';
  }, /staging-worker must render disabled Apple\/social gate SOCIAL_STUDIO_ENABLED/],
  ['production volume', (model) => { model.volumes['staging-restore-root'].name = 'menorah_restore_test_data'; }, /collides with production/],
  ['Docker socket', (model) => { model.services['staging-alloy'].volumes = [{ type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock' }]; }, /Docker socket/],
  ['host log mount', (model) => { model.services['staging-alloy'].volumes = [{ type: 'bind', source: '/var/lib/docker/containers', target: '/logs' }]; }, /host-wide Docker logs/],
  ['ambiguous bind root', (model) => { model.services['staging-alloy'].volumes = [{ type: 'bind', source: '/', target: '/host' }]; }, /ambiguous broad bind root/],
  ['wrong Alertmanager config bind', (model) => {
    model.services['staging-alertmanager'].volumes[0].source =
      '/opt/menorah-staging/env/other-alertmanager.yml';
  }, /bind the reviewed config source read-only/],
  ['writable Alertmanager config bind', (model) => {
    model.services['staging-alertmanager'].volumes[0].read_only = false;
  }, /bind the reviewed config source read-only/],
  ['wrong Alertmanager config digest label', (model) => {
    model.services['staging-alertmanager'].labels[
      'com.menorah.alertmanager-config-sha256'
    ] = 'b'.repeat(64);
  }, /exact reviewed config digest label/],
  ['missing Alertmanager egress gateway priority', (model) => {
    delete model.services['staging-alertmanager']
      .networks['staging-egress'].gw_priority;
  }, /explicit default gateway/],
  ['host network', (model) => { model.services['staging-api-web'].network_mode = 'host'; }, /shares a host namespace/],
  ['privileged service', (model) => { model.services['staging-api-web'].privileged = true; }, /must not be privileged/],
  ['unbounded restart', (model) => { model.services['staging-api-web'].restart = 'always'; }, /unbounded restart policy/],
  ['missing limits', (model) => { delete model.services['staging-api-web'].mem_limit; }, /lacks CPU, memory, or PID limits/],
  ['memory reservation above limit', (model) => {
    model.services['staging-api-web'].mem_limit = 32 * 1024 * 1024;
    model.services['staging-api-web'].mem_reservation =
      64 * 1024 * 1024;
  }, /memory reservation exceeds its memory limit/],
  ['per-service memory ceiling', (model) => {
    model.services['staging-api-web'].mem_limit =
      (1024 * 1024 * 1024) + 1;
  }, /per-service memory ceiling/],
  ['aggregate CPU ceiling', (model) => {
    model.services['staging-api-web'].cpus = 0.51;
  }, /aggregate CPU ceiling/],
  ['missing labels', (model) => { model.services['staging-api-web'].labels = {}; }, /lacks environment=staging/],
  ['stale project label', (model) => {
    model.services['staging-api-web'].labels['com.menorah.project'] =
      REAL_PROJECT;
  }, /project label must equal/],
  ['production alias', (model) => { model.services['staging-redis'].networks = { 'staging-data': { aliases: ['redis'] } }; }, /non-staging network alias/],
  ['npm migration wrapper', (model) => {
    model.services['staging-migrate'].command = ['npm', 'run', 'migrate'];
  }, /invoke its Node script directly/],
  ['expanded media-init capabilities', (model) => {
    model.services['staging-media-permissions-init'].cap_add.push('SYS_ADMIN');
  }, /only ownership capabilities/],
  ['expanded storage-init capabilities', (model) => {
    model.services['staging-storage-init'].cap_add.push('CHOWN');
  }, /staging-storage-init must have only repeat-safe root filesystem capabilities/],
  ['expanded backup capabilities', (model) => {
    model.services['staging-backup-job'].cap_add.push('DAC_OVERRIDE');
  }, /only root DAC_READ_SEARCH access/],
  ['backup manifest HOME drift', (model) => {
    model.services['staging-backup-job'].environment.HOME = '/data/db';
  }, /staging-backup-job must use writable \/tmp as HOME for clean manifests/],
  ['missing media writer ordering', (model) => {
    delete model.services['staging-worker']
      .depends_on['staging-media-permissions-init'];
  }, /staging-worker must wait for staging-media-permissions-init/],
  ['wrong application role', (model, env) => {
    model.services['staging-api-ios'].environment.MONGODB_URI =
      env.MONGODB_BACKUP_URI;
  }, /wrong MongoDB role/],
  ['missing application URI', (model) => {
    delete model.services['staging-user-web-app'].environment.MONGODB_URI;
  }, /staging-user-web-app must receive MONGODB_URI/],
  ['restore datastore topology', (model) => {
    model.services['staging-mongo-restore'].networks = ['staging-data'];
  }, /invalid network topology/],
  ['broad initializer environment', (model) => {
    model.services['staging-mongo-replica-init']
      .environment.JWT_SECRET = 'synthetic-not-a-real-secret';
  }, /only its exact Mongo identities/],
  ['hidden deployment-state volume', (model) => {
    model.volumes['staging-deploy-state'] = {
      name: 'menorah-staging-deploy-state',
      labels: model.volumes['staging-data-root'].labels,
    };
  }, /must not use a hidden Compose volume/],
  ['missing host-visible deployment state', (model) => {
    model.services['staging-backup-job'].volumes =
      model.services['staging-backup-job'].volumes.filter(
        (mount) => mount.target !== '/opt/menorah-staging/deploy-state',
      );
  }, /deploy-state exactly once as writable/],
  ['writable backup application root', (model) => {
    const mount = model.services['staging-backup-job'].volumes.find(
      (candidate) => candidate.target === '/opt/menorah-staging/app',
    );
    mount.read_only = false;
  }, /app exactly once as read-only/],
];

for (const [name, mutate, expected] of composeMutations) {
  test(`rendered model rejects ${name}`, () => {
    const environment = validEnvironment();
    const model = validCompose(environment);
    mutate(model, environment);
    const errors = validateRenderedCompose(
      model,
      environment,
      productionMetadata,
    );
    assert.ok(
      includesError(errors, expected),
      `expected ${expected}, received:\n${errors.join('\n')}`,
    );
  });
}

test('rendered model rejects a bind symlink escaping the staging root', async () => {
  const environment = validEnvironment();
  const model = validCompose(environment);
  const stagingRoot = environment.MENORAH_SERVER_STAGING_ROOT;
  const outside = await mkdtemp(
    path.join(tmpdir(), 'menorah-staging-symlink-target-'),
  );
  const link = path.join(
    stagingRoot,
    `escape-fixture-${process.pid}-${Date.now()}`,
  );
  await mkdir(stagingRoot, { recursive: true });
  try {
    await symlink(outside, link, 'junction');
    model.services['staging-alloy'].volumes = [{
      type: 'bind',
      source: link,
      target: '/logs',
    }];
    const errors = validateRenderedCompose(
      model,
      environment,
      productionMetadata,
    );
    assert.ok(includesError(errors, /escapes through symlink/));
  } finally {
    await unlink(link).catch(() => {});
    await rm(outside, { recursive: true, force: true });
  }
});

test('LiveKit config preserves the exact public-media RTC contract', () => {
  const source = readStaging('livekit.yaml');
  assert.deepEqual(validateLiveKitConfig(source), []);
  for (const mutation of [
    source.replace('use_external_ip: false', 'use_external_ip: true'),
    source.replace('tcp_port: 37881', 'tcp_port: 7881'),
    source.replace('port_range_end: 35100', 'port_range_end: 35200'),
    source.replace(
      'skip_external_ip_validation: false',
      'skip_external_ip_validation: false\n  stun_servers: unsafe',
    ),
    `${source}\nrtc:\n  tcp_port: 37881\n`,
  ]) {
    assert.ok(includesError(
      validateLiveKitConfig(mutation),
      /exact reviewed ports and use_external_ip=false/,
    ));
  }
});

const validIngressCompose = () => {
  const compose = validCompose();
  compose.services['staging-caddy'].networks = {
    'staging-app': {},
    'staging-ingress': {},
  };
  for (const [serviceName, alias] of [
    ['staging-user-web-app', 'staging-private-user-web'],
    ['staging-admin-panel', 'staging-private-admin-panel'],
    ['staging-web-app', 'staging-private-counsellor-web'],
    ['staging-api-ios', 'staging-private-api-ios'],
    ['staging-api-android', 'staging-private-api-android'],
    ['staging-api-web', 'staging-private-api-web'],
    ['staging-api-admin', 'staging-private-api-admin'],
    ['staging-livekit', 'staging-private-livekit'],
  ]) {
    compose.services[serviceName].networks = {
      'staging-app': { aliases: [alias] },
      'staging-ingress': {},
    };
  }
  return compose;
};

const validMonitoringCompose = () => {
  const compose = validIngressCompose();
  compose.services['staging-worker'].networks = {
    'staging-app': { aliases: ['staging-private-worker'] },
    'staging-ingress': {},
  };
  for (const [serviceName, alias] of [
    ['staging-alertmanager', 'staging-private-alertmanager'],
    ['staging-loki', 'staging-private-loki'],
    ['staging-alloy', 'staging-private-alloy'],
  ]) {
    compose.services[serviceName].networks = {
      'staging-monitoring': { aliases: [alias] },
      ...(
        serviceName === 'staging-alertmanager'
          ? { 'staging-egress': { gw_priority: 1 } }
          : { 'staging-ingress': {} }
      ),
    };
  }
  return compose;
};

test('ingress sources match the exact host and target manifest', () => {
  const errors = validateIngress({
    manifest: JSON.parse(readStaging('ingress-manifest.json')),
    caddySource: readStaging('Caddyfile'),
    tunnelSource: readStaging('tunnel-config.yml.example'),
    compose: validIngressCompose(),
    productionMetadata,
  });
  assert.deepEqual(errors, []);
});

test('ingress rejects host-to-target swaps even when both sets are unchanged', () => {
  const caddy = readStaging('Caddyfile')
    .replaceAll(
      'staging-private-admin-panel:3003',
      'staging-private-swap-placeholder:3999',
    )
    .replaceAll(
      'staging-private-counsellor-web:3001',
      'staging-private-admin-panel:3003',
    )
    .replaceAll(
      'staging-private-swap-placeholder:3999',
      'staging-private-counsellor-web:3001',
    );
  const errors = validateIngress({
    manifest: JSON.parse(readStaging('ingress-manifest.json')),
    caddySource: caddy,
    tunnelSource: readStaging('tunnel-config.yml.example'),
    compose: validIngressCompose(),
    productionMetadata,
  });
  assert.ok(includesError(errors, /host-to-target mappings/));
});

test('ingress targets use app-network-only private aliases', () => {
  const compose = validIngressCompose();
  compose.services['staging-user-web-app']
    .networks['staging-app'].aliases = [];
  const errors = validateIngress({
    manifest: JSON.parse(readStaging('ingress-manifest.json')),
    caddySource: readStaging('Caddyfile'),
    tunnelSource: readStaging('tunnel-config.yml.example'),
    compose,
    productionMetadata,
  });

  assert.ok(includesError(
    errors,
    /not owned by exactly one staging-app service/,
  ));
});

test('ingress rejects host, target, port, Tunnel fallback, and TLS drift', () => {
  const manifest = JSON.parse(readStaging('ingress-manifest.json'));
  manifest.routes[0].target = 'api-web:8080';
  const compose = validIngressCompose();
  compose.services['staging-caddy'].ports[0].host_ip = '0.0.0.0';
  const errors = validateIngress({
    manifest,
    caddySource: readStaging('Caddyfile').replaceAll(
      '.staging.menorah.me',
      '.menorah.me',
    ),
    tunnelSource: readStaging('tunnel-config.yml.example')
      .replace('http://127.0.0.1:38000', 'http://api-web:8080')
      .replace('http_status:404', 'http://production:8080')
      .concat('\noriginRequest:\n  noTLSVerify: true\n'),
    compose,
    productionMetadata,
  });
  assert.ok(includesError(errors, /not staging-prefixed/));
  assert.ok(includesError(errors, /Caddy hosts/));
  assert.ok(includesError(errors, /Tunnel target/));
  assert.ok(includesError(errors, /http_status:404/));
  assert.ok(includesError(errors, /disable TLS verification/));
});

test('monitoring sources preserve isolated storage and all 20 P0 alerts', () => {
  assert.deepEqual(validateMonitoring({
    prometheusSource: readStaging('prometheus.yml'),
    alertmanagerSource: readStaging('alertmanager.yml'),
    blackboxSource: readStaging('blackbox.yml'),
    alloySource: readStaging('config.alloy'),
    lokiSource: readStaging('loki.yml'),
    alertRulesSource: readFileSync(
      new URL('../../deploy/monitoring/alert-rules.yml', import.meta.url),
      'utf8',
    ),
    compose: validMonitoringCompose(),
    environment: validEnvironment(),
    productionMetadata,
  }), []);
});

test('monitoring rejects production targets, missing labels, shared state, credentials, and missing P0 rules', () => {
  const model = validMonitoringCompose();
  model.volumes['staging-alertmanager'].name =
    model.volumes['staging-prometheus'].name;
  const errors = validateMonitoring({
    prometheusSource: readStaging('prometheus.yml')
      .replace('environment: staging', 'environment: production')
      .concat('\n  - targets: [https://app.menorah.me]\n'),
    alertmanagerSource: readStaging('alertmanager.yml')
      .replace('environment=\"staging\"', 'environment=\"production\"')
      .concat('\nslack_configs: []\n'),
    blackboxSource: readStaging('blackbox.yml'),
    alloySource: `${readStaging('config.alloy')}\n/var/run/docker.sock`,
    lokiSource: readStaging('loki.yml'),
    alertRulesSource: '',
    compose: model,
    environment: validEnvironment(),
    productionMetadata,
  });
  assert.ok(includesError(errors, /external staging labels/));
  assert.ok(includesError(errors, /production host/));
  assert.ok(includesError(errors, /Alertmanager/));
  assert.ok(includesError(errors, /host-wide or production/));
  assert.ok(includesError(errors, /missing required P0 alert/));
  assert.ok(includesError(errors, /missing or shared/));
});

test('monitoring rejects redirect, probe-class, TLS-scope, and inventory-threshold drift', () => {
  const sharedRules = readFileSync(
    new URL('../../deploy/monitoring/alert-rules.yml', import.meta.url),
    'utf8',
  );
  const errors = validateMonitoring({
    prometheusSource: readStaging('prometheus.yml')
      .replace(
        'probe_module: https_staging_ready',
        'probe_module: https_staging_success',
      )
      .replace(
        'replacement: internal-diagnostics',
        'replacement: public-edge',
      ),
    alertmanagerSource: readStaging('alertmanager.yml'),
    blackboxSource: readStaging('blackbox.yml').replace(
      /(  https_staging_success:[\s\S]*?follow_redirects:\s*)true/,
      '$1false',
    ),
    alloySource: readStaging('config.alloy'),
    lokiSource: readStaging('loki.yml'),
    alertRulesSource: sharedRules
      .replace(
        'monitoring_scope="server-staging"}) < 9',
        'monitoring_scope="server-staging"}) < 19',
      )
      .replace(
        'monitoring_scope!="server-staging"} - time()) < 1209600',
        'monitoring_scope="server-staging"} - time()) < 1209600',
      ),
    compose: validMonitoringCompose(),
    environment: validEnvironment(),
    productionMetadata,
  });

  assert.ok(includesError(errors, /https_staging_success/));
  assert.ok(includesError(errors, /redirecting frontends/));
  assert.ok(includesError(errors, /internal TLS scope/));
  assert.ok(includesError(errors, /scoped staging coverage and TLS/));
});

test('monitoring rejects hardcoded or uninjected Compose project evidence', () => {
  const model = validMonitoringCompose();
  model.services['staging-prometheus']
    .environment.MENORAH_SERVER_STAGING_PROJECT_NAME = REAL_PROJECT;
  model.services['staging-prometheus'].command = [];
  const errors = validateMonitoring({
    prometheusSource: readStaging('prometheus.yml').replace(
      'compose_project: "${MENORAH_SERVER_STAGING_PROJECT_NAME}"',
      `compose_project: ${REAL_PROJECT}`,
    ),
    alertmanagerSource: readStaging('alertmanager.yml'),
    blackboxSource: readStaging('blackbox.yml'),
    alloySource: readStaging('config.alloy'),
    lokiSource: readStaging('loki.yml'),
    alertRulesSource: readFileSync(
      new URL('../../deploy/monitoring/alert-rules.yml', import.meta.url),
      'utf8',
    ),
    compose: model,
    environment: validEnvironment(),
    productionMetadata,
  });
  assert.ok(includesError(errors, /external staging labels/));
  assert.ok(includesError(errors, /must equal the active Compose project/));
  assert.ok(includesError(errors, /external-label environment expansion/));
});

test('monitoring rejects cross-network names and leaked private aliases', () => {
  const model = validMonitoringCompose();
  model.services['staging-alertmanager'].networks['staging-ingress'] = {
    aliases: [
      'staging-private-alertmanager',
    ],
  };
  const errors = validateMonitoring({
    prometheusSource: readStaging('prometheus.yml')
      .replaceAll(
        'staging-private-alertmanager:9093',
        'staging-alertmanager:9093',
      ),
    alertmanagerSource: readStaging('alertmanager.yml'),
    blackboxSource: readStaging('blackbox.yml'),
    alloySource: readStaging('config.alloy'),
    lokiSource: readStaging('loki.yml'),
    alertRulesSource: readFileSync(
      new URL('../../deploy/monitoring/alert-rules.yml', import.meta.url),
      'utf8',
    ),
    compose: model,
    environment: validEnvironment(),
    productionMetadata,
  });

  assert.ok(includesError(errors, /private target/));
  assert.ok(includesError(errors, /cross-network service target/));
  assert.ok(includesError(errors, /must not leak onto staging-ingress/));
});

test('tracked example has the exact public port contract and no secret values', () => {
  for (const [key, value] of Object.entries(EXPECTED_PORT_VARIABLES)) {
    assert.match(contractSource, new RegExp(`^${key}=${value.replaceAll('.', '\\.')}$`, 'm'));
  }
  assert.doesNotMatch(contractSource, /CLOUDFLARE_TUNNEL_TOKEN=/);
  assert.match(
    contractSource,
    /registry\.example\.invalid\/menorah-staging\/backend@sha256:/,
  );
});

test('Compose source pins direct Node tasks and project-aware evidence', () => {
  const composeSource = readStaging('compose.yml');
  const serviceBlock = (serviceName) => {
    const match = composeSource.match(new RegExp(
      `^  ${serviceName}:[\\s\\S]*?(?=^  [a-z0-9][a-z0-9-]*:|^configs:)`,
      'm',
    ));
    assert.ok(match, `missing ${serviceName} source block`);
    return match[0];
  };
  const resourceLabels = composeSource.match(
    /^x-staging-resource-labels:[\s\S]*?(?=^x-staging-service-labels:)/m,
  )?.[0] || '';
  assert.match(
    composeSource,
    /^name: "\$\{MENORAH_SERVER_STAGING_PROJECT_NAME:-menorah-staging\}"$/m,
  );
  assert.match(
    resourceLabels,
    /^  com\.menorah\.project: "\$\{MENORAH_SERVER_STAGING_PROJECT_NAME:-menorah-staging\}"$/m,
  );
  assert.doesNotMatch(
    resourceLabels,
    /^  com\.menorah\.project: menorah-staging$/m,
  );

  const migrate = serviceBlock('staging-migrate');
  const seed = serviceBlock('staging-seed');
  assert.match(
    migrate,
    /^    command: \["node", "src\/database\/migrate\.js"\]$/m,
  );
  assert.match(
    seed,
    /^    command: \["node", "src\/database\/seed-server-staging\.js"\]$/m,
  );
  assert.doesNotMatch(migrate, /\bnpm\b/);
  assert.doesNotMatch(seed, /\bnpm\b/);

  const prometheus = serviceBlock('staging-prometheus');
  assert.match(
    prometheus,
    /^      - --enable-feature=expand-external-labels$/m,
  );
  assert.match(
    prometheus,
    /^      MENORAH_SERVER_STAGING_PROJECT_NAME: "\$\{MENORAH_SERVER_STAGING_PROJECT_NAME:-menorah-staging\}"$/m,
  );
  assert.match(
    readStaging('prometheus.yml'),
    /^    compose_project: "\$\{MENORAH_SERVER_STAGING_PROJECT_NAME\}"$/m,
  );
});

test('Compose source initializes media ownership before every backend writer', () => {
  const composeSource = readStaging('compose.yml');
  const serviceBlock = (serviceName) => {
    const match = composeSource.match(new RegExp(
      `^  ${serviceName}:[\\s\\S]*?(?=^  [a-z0-9][a-z0-9-]*:|^configs:)`,
      'm',
    ));
    assert.ok(match, `missing ${serviceName} source block`);
    return match[0];
  };
  const permissionsInit = serviceBlock(
    'staging-media-permissions-init',
  );
  assert.match(
    permissionsInit,
    /^    <<: \[\*staging-service-common, \*backend-build\]$/m,
  );
  assert.match(permissionsInit, /^    user: "0:0"$/m);
  assert.match(permissionsInit, /^    read_only: true$/m);
  assert.match(permissionsInit, /^    network_mode: none$/m);
  assert.match(
    permissionsInit,
    /^    entrypoint: \["\/bin\/sh", "-euc"\]$/m,
  );
  const capAdd = permissionsInit.match(
    /^    cap_add:\r?\n((?:^      - .*\r?\n?)*)/m,
  )?.[1]
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.replace(/^\s*-\s*/, ''))
    .sort();
  assert.deepEqual(capAdd, ['CHOWN', 'DAC_OVERRIDE', 'FOWNER']);
  for (const command of [
    'backend_uid="$$(id -u menorah)"',
    'backend_gid="$$(id -g menorah)"',
    'readlink -f "$${media_root}"',
    'find "$${media_root}" -xdev -type l',
    'chown -R "$${backend_uid}:$${backend_gid}" "$${media_root}"',
    'chmod 0750 "$${media_root}"',
  ]) {
    assert.ok(
      permissionsInit.includes(command),
      `media ownership init lacks ${command}`,
    );
  }
  assert.deepEqual(
    [...permissionsInit.matchAll(/^        source: (staging-[a-z-]+)$/gm)]
      .map((match) => match[1]),
    ['staging-uploads', 'staging-managed-media'],
  );
  assert.deepEqual(
    [...permissionsInit.matchAll(/^        target: (\/app\/[a-z-]+)$/gm)]
      .map((match) => match[1]),
    ['/app/uploads', '/app/managed-media'],
  );
  assert.match(
    permissionsInit,
    /staging-storage-init:\r?\n        condition: service_completed_successfully/,
  );

  for (const serviceName of [
    'staging-api-ios',
    'staging-api-android',
    'staging-api-web',
    'staging-api-admin',
    'staging-worker',
  ]) {
    const writer = serviceBlock(serviceName);
    assert.match(
      writer,
      /source: staging-uploads\r?\n        target: \/app\/uploads/,
    );
    assert.match(
      writer,
      /source: staging-managed-media\r?\n        target: \/app\/managed-media/,
    );
    assert.match(
      writer,
      /staging-media-permissions-init:\r?\n        condition: service_completed_successfully/,
    );
  }
});

test('Compose source keeps storage initialization repeat-safe', () => {
  const composeSource = readStaging('compose.yml');
  const storageInit = composeSource.match(
    /^  staging-storage-init:[\s\S]*?(?=^  staging-media-permissions-init:)/m,
  )?.[0] || '';

  assert.match(storageInit, /^    user: "0:0"$/m);
  assert.match(storageInit, /^    read_only: true$/m);
  assert.match(storageInit, /^    network_mode: none$/m);
  assert.match(
    storageInit,
    /cap_add:\r?\n      - DAC_OVERRIDE\r?\n      - FOWNER/,
  );
  assert.doesNotMatch(
    storageInit,
    /^\s+- (?:CHOWN|DAC_READ_SEARCH|SYS_ADMIN)$/m,
  );
});

test('Compose source initializes Caddy state and gates every TLS host', () => {
  const composeSource = readStaging('compose.yml');
  const logsInit = composeSource.match(
    /^  staging-logs-init:[\s\S]*?(?=^  staging-caddy:)/m,
  )?.[0] || '';
  const caddy = composeSource.match(
    /^  staging-caddy:[\s\S]*?(?=^  staging-alert-sink:)/m,
  )?.[0] || '';

  assert.match(logsInit, /for caddy_root in \/config \/data/);
  assert.match(logsInit, /find "\$\${caddy_root}" -xdev -type l/);
  assert.match(logsInit, /chown -R 473:473 "\$\${caddy_root}"/);
  assert.match(logsInit, /source: staging-caddy-config\r?\n        target: \/config/);
  assert.match(logsInit, /source: staging-caddy-data\r?\n        target: \/data/);
  assert.match(logsInit, /cap_add:\r?\n      - CHOWN\r?\n      - DAC_OVERRIDE\r?\n      - FOWNER/);
  assert.match(
    caddy,
    /staging-logs-init:\r?\n        condition: service_completed_successfully/,
  );
  for (const host of EXPECTED_HOSTS) {
    assert.ok(caddy.includes(`${host}: "127.0.0.1"`));
    assert.ok(caddy.includes(`https://${host}/healthz`));
  }
  assert.match(caddy, /wget --no-check-certificate -qO-/);
  assert.doesNotMatch(caddy, /http:\/\/127\.0\.0\.1\/healthz/);
});

test('Compose source grants backup only staged-media read traversal', () => {
  const composeSource = readStaging('compose.yml');
  const backup = composeSource.match(
    /^  staging-backup-job:[\s\S]*?(?=^  staging-restore-job:)/m,
  )?.[0] || '';

  assert.match(backup, /^    user: "0:0"$/m);
  assert.match(backup, /^    cap_drop:\r?\n      - ALL$/m);
  assert.match(backup, /^    cap_add:\r?\n      - DAC_READ_SEARCH$/m);
  assert.doesNotMatch(
    backup,
    /^\s+- (?:DAC_OVERRIDE|SYS_ADMIN|CHOWN|FOWNER)$/m,
  );
});

test('runtime selectors reach backend and mail-capture services as an exact pair', () => {
  const composeSource = readStaging('compose.yml');
  const backendEnvironment = composeSource.match(
    /^x-backend-environment:[\s\S]*?(?=^x-app-security:)/m,
  )?.[0] || '';
  const mailCapture = composeSource.match(
    /^  staging-mail-capture:[\s\S]*?(?=^  staging-api-ios:)/m,
  )?.[0] || '';
  const migrate = composeSource.match(
    /^  staging-migrate:[\s\S]*?(?=^  staging-seed:)/m,
  )?.[0] || '';
  const userWeb = composeSource.match(
    /^  staging-user-web-app:[\s\S]*?(?=^  staging-web-app:)/m,
  )?.[0] || '';
  const counsellorWeb = composeSource.match(
    /^  staging-web-app:[\s\S]*?(?=^  staging-admin-panel:)/m,
  )?.[0] || '';

  for (const source of [backendEnvironment, mailCapture]) {
    assert.match(source, /MENORAH_SERVER_STAGING_ENVIRONMENT_ID:/);
    assert.match(source, /MENORAH_SERVER_STAGING_PROJECT_NAME:/);
  }
  assert.match(
    backendEnvironment,
    /MENORAH_SYNTHETIC_DATA_ONLY: "\$\{MENORAH_SYNTHETIC_DATA_ONLY:\?Synthetic-only staging guard required\}"/,
  );
  const selectorTriple =
    /MENORAH_SERVER_STAGING_ENVIRONMENT_ID:[\s\S]*MENORAH_SERVER_STAGING_PROJECT_NAME:[\s\S]*MENORAH_SERVER_STAGING_HTTPS_PORT:/;
  for (const source of [userWeb, counsellorWeb]) {
    const build = source.match(
      /^    build:[\s\S]*?(?=^    environment:)/m,
    )?.[0] || '';
    const runtimeEnvironment = source.match(
      /^    environment:[\s\S]*?(?=^    [A-Za-z][A-Za-z0-9_-]*:)/m,
    )?.[0] || '';

    assert.match(build, selectorTriple);
    assert.match(runtimeEnvironment, selectorTriple);
  }
  assert.match(migrate, /profiles: \["migration", "seed"\]/);
});

test('synthetic account passwords reach only the explicit seed job', () => {
  const composeSource = readStaging('compose.yml');
  const backendEnvironment = composeSource.match(
    /^x-backend-environment:[\s\S]*?(?=^x-app-security:)/m,
  )?.[0] || '';
  const seed = composeSource.match(
    /^  staging-seed:[\s\S]*?(?=^  staging-user-web-app:)/m,
  )?.[0] || '';
  const seedPasswordKeys = SECRET_KEYS.filter(
    (key) => (
      key.startsWith('MENORAH_SERVER_STAGING_')
      && key.endsWith('_PASSWORD')
    ),
  );

  assert.equal(seedPasswordKeys.length, 10);
  for (const key of seedPasswordKeys) {
    assert.match(seed, new RegExp(`${key}: "\\$\\{${key}:-\\}"`));
    assert.doesNotMatch(backendEnvironment, new RegExp(`${key}:`));
  }
});
