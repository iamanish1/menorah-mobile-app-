import assert from 'node:assert/strict';
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

import {
  SECRET_KEYS,
  assertGeneratedTargetsAbsent,
  buildValidationEnvironment,
  parseContractKeys,
} from '../../deploy/server-staging/generate-validation-environment.mjs';
import {
  EXPECTED_PORT_VARIABLES,
  REAL_PROJECT,
  parseEnvironmentSource,
  validateEnvironmentRecord,
} from '../../deploy/server-staging/validate-environment.mjs';
import {
  EXPECTED_PUBLISHED_PORTS,
  REQUIRED_NETWORK_SUFFIXES,
  REQUIRED_VOLUME_SUFFIXES,
  validateIngress,
  validateMonitoring,
  validateRenderedCompose,
} from '../../deploy/server-staging/validate-isolation.mjs';

const stagingDirectory = new URL(
  '../../deploy/server-staging/',
  import.meta.url,
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

const validEnvironment = () => ({
  ...buildValidationEnvironment({
    candidateSha: fixtureSha,
    contractKeys: parseContractKeys(contractSource),
  }).values,
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
          host_ip: '127.0.0.1',
          published,
          target: Number.isNaN(Number(target)) ? target : Number(target),
          protocol,
        })),
      }),
    ],
  ));
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
    networks: ['staging-data'],
  });
  for (const serviceName of [
    'staging-api-ios',
    'staging-api-android',
    'staging-api-web',
    'staging-api-admin',
    'staging-worker',
  ]) {
    services[serviceName].environment = {
      MONGODB_URI: environment.MONGODB_URI,
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
  services['staging-prometheus'].environment = {
    MENORAH_SERVER_STAGING_PROJECT_NAME: project,
  };
  services['staging-prometheus'].command = [
    '--config.file=/etc/prometheus/prometheus.yml',
    '--enable-feature=expand-external-labels',
  ];
  const resourceLabels = {
    'com.menorah.environment': 'staging',
    'com.menorah.project': project,
    'com.menorah.stack': 'server-staging',
  };
  return {
    name: project,
    services,
    networks: Object.fromEntries(REQUIRED_NETWORK_SUFFIXES.map(
      (suffix) => [
        `staging-${suffix}`,
        {
          name: `${prefix}-${suffix}`,
          internal: suffix !== 'ingress',
          labels: resourceLabels,
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
  assert.equal(
    environment.MENORAH_SERVER_STAGING_PROJECT_NAME,
    'menorah-server-staging-validation',
  );
  assert.equal(
    environment.MENORAH_RUNTIME_CANDIDATE_SHA,
    fixtureSha,
  );
  assert.equal(
    new Set(SECRET_KEYS.map((key) => environment[key])).size,
    SECRET_KEYS.length,
  );
  assert.deepEqual(
    validateEnvironmentRecord(environment, { productionMetadata }),
    [],
  );
  for (const key of SECRET_KEYS) {
    const value = environment[key];
    assert.doesNotMatch(value, /todo|tbd|placeholder|example/i);
    assert.match(
      value.replace(/^(?:Aa1!|re_server_staging_|rzp_test_)/, ''),
      /^[0-9a-f]+$/,
    );
  }
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
    'CHECKOUT_RETURN_URL',
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
  assert.match(
    environment.CHECKOUT_RETURN_URL,
    /^https:\/\/app\.staging\.menorah\.me:38443\//,
  );
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
    'CHECKOUT_RETURN_URL',
    'COUNSELLOR_ONBOARDING_NOTICE_URL',
    'MEDIA_PUBLIC_BASE_URL',
    'LIVEKIT_URL',
  ]) {
    assert.equal(new URL(contract[key]).port, '', key);
  }
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
    env.COMPOSE_PROJECT_NAME = 'menorah';
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
  ['incomplete sandbox', (env) => { env.BOOKING_PAYMENTS_ENABLED = 'true'; env.RAZORPAY_KEY_SECRET = 'disabled-for-synthetic-server-staging'; }, /complete sandbox/],
  ['generic Tunnel token', (env) => { env.TUNNEL_TOKEN = 'not-allowed-staging-token'; }, /Tunnel token is forbidden/],
  ['production Tunnel ID', (env) => { env.CLOUDFLARE_TUNNEL_ID = productionMetadata.tunnelIds[0]; }, /Tunnel ID collides/],
  ['production state marker', (env) => { env.MENORAH_CURRENT_SHA_FILE = '/opt/menorah/deploy-state/current-sha'; }, /production filesystem root/],
  ['production restore target', (env) => { env.MENORAH_RESTORE_ROOT = '/opt/menorah/data/restore'; }, /production filesystem root/],
  ['ambiguous restore ack', (env) => { env.BACKUP_RESTORE_ACKNOWLEDGEMENT = 'yes'; }, /exact staging acknowledgement/],
  ['non-loopback admin port', (env) => { env.API_ADMIN_LOCAL_PORT = '0.0.0.0:38083'; }, /API_ADMIN_LOCAL_PORT must be/],
  ['storage prefix', (env) => { env.MEDIA_STORAGE_BACKEND = 'cloudinary'; env.CLOUDINARY_UPLOAD_PREFIX = 'menorah-production'; }, /staging-only prefix/],
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
  environment.COMPOSE_PROJECT_NAME = REAL_PROJECT;
  const model = validCompose(environment);
  assert.deepEqual(
    validateRenderedCompose(model, environment, productionMetadata),
    [],
  );
});

const composeMutations = [
  ['project', (model) => { model.name = 'menorah'; }, /rendered Compose name/],
  ['container name', (model) => { model.services['staging-api-admin'].container_name = 'production-admin'; }, /non-staging container_name/],
  ['production port', (model) => { model.services['staging-api-admin'].ports[0].published = '18083'; }, /collides with production metadata/],
  ['public admin bind', (model) => { model.services['staging-api-admin'].ports[0].host_ip = '0.0.0.0'; }, /must bind to 127.0.0.1/],
  ['Mongo port', (model) => { model.services['staging-mongo-primary'].ports = [{ host_ip: '127.0.0.1', published: '27017', target: 27017 }]; }, /must not publish a host port/],
  ['Redis port', (model) => { model.services['staging-redis'].ports = [{ host_ip: '127.0.0.1', published: '6379', target: 6379 }]; }, /must not publish a host port/],
  ['external network', (model) => { model.networks['staging-data'].external = true; }, /must not be external/],
  ['production network', (model) => { model.networks['staging-data'].name = 'menorah_db_net'; }, /collides with production/],
  ['production subnet', (model) => { model.networks['staging-data'].ipam = { config: [{ subnet: productionMetadata.networkSubnets[0] }] }; }, /subnet collides with production/],
  ['production volume', (model) => { model.volumes['staging-restore-root'].name = 'menorah_restore_test_data'; }, /collides with production/],
  ['Docker socket', (model) => { model.services['staging-alloy'].volumes = [{ type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock' }]; }, /Docker socket/],
  ['host log mount', (model) => { model.services['staging-alloy'].volumes = [{ type: 'bind', source: '/var/lib/docker/containers', target: '/logs' }]; }, /host-wide Docker logs/],
  ['ambiguous bind root', (model) => { model.services['staging-alloy'].volumes = [{ type: 'bind', source: '/', target: '/host' }]; }, /ambiguous broad bind root/],
  ['host network', (model) => { model.services['staging-api-web'].network_mode = 'host'; }, /shares a host namespace/],
  ['privileged service', (model) => { model.services['staging-api-web'].privileged = true; }, /must not be privileged/],
  ['unbounded restart', (model) => { model.services['staging-api-web'].restart = 'always'; }, /unbounded restart policy/],
  ['missing limits', (model) => { delete model.services['staging-api-web'].mem_limit; }, /lacks CPU, memory, or PID limits/],
  ['memory reservation above limit', (model) => {
    model.services['staging-api-web'].mem_limit = 32 * 1024 * 1024;
    model.services['staging-api-web'].mem_reservation =
      64 * 1024 * 1024;
  }, /memory reservation exceeds its memory limit/],
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
  ['missing media writer ordering', (model) => {
    delete model.services['staging-worker']
      .depends_on['staging-media-permissions-init'];
  }, /staging-worker must wait for staging-media-permissions-init/],
  ['wrong application role', (model, env) => {
    model.services['staging-api-ios'].environment.MONGODB_URI =
      env.MONGODB_BACKUP_URI;
  }, /wrong MongoDB role/],
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
    compose: validCompose(),
    productionMetadata,
  }), []);
});

test('monitoring rejects production targets, missing labels, shared state, credentials, and missing P0 rules', () => {
  const model = validCompose();
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
    productionMetadata,
  });
  assert.ok(includesError(errors, /external staging labels/));
  assert.ok(includesError(errors, /production host/));
  assert.ok(includesError(errors, /Alertmanager/));
  assert.ok(includesError(errors, /host-wide or production/));
  assert.ok(includesError(errors, /missing required P0 alert/));
  assert.ok(includesError(errors, /missing or shared/));
});

test('monitoring rejects hardcoded or uninjected Compose project evidence', () => {
  const model = validCompose();
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
    productionMetadata,
  });
  assert.ok(includesError(errors, /external staging labels/));
  assert.ok(includesError(errors, /must equal the active Compose project/));
  assert.ok(includesError(errors, /external-label environment expansion/));
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

test('Compose source initializes Caddy state ownership before ingress', () => {
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
  assert.match(
    caddy,
    /wget --header='Host: app\.staging\.menorah\.me'\r?\n\s+-qO- http:\/\/127\.0\.0\.1\/healthz/,
  );
  assert.doesNotMatch(caddy, /--no-check-certificate/);
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
    assert.match(seed, new RegExp(`${key}: "\\$\\{${key}:\\?`));
    assert.doesNotMatch(backendEnvironment, new RegExp(`${key}:`));
  }
});
