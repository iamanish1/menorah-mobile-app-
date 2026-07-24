import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SECRET_VALUE_KEYS,
  assertGeneratedTargetsAbsent,
  buildEnvironmentValues,
  parseContractKeys,
  serializeEnvironment,
} from './generate-environment.mjs';
import {
  EXPECTED_DOMAINS,
  EXPECTED_NETWORK_NAMES,
  EXPECTED_PROJECT,
  EXPECTED_VOLUME_NAMES,
  parseEnvironmentFile,
  validateEnvironmentRecord,
  validateRenderedCompose,
} from './validate-isolation.mjs';

const FIXTURE_ROOT = 'C:/repo/menorah/deploy/local-staging';
const FIXTURE_ENV_FILE = `${FIXTURE_ROOT}/generated/local-staging.env`;
const FIXTURE_MONGO_KEYFILE = `${FIXTURE_ROOT}/generated/mongo-keyfile`;
const FIXTURE_BACKUP_PASSWORD =
  `${FIXTURE_ROOT}/generated/backup-encryption-password`;
const FIXTURE_BACKUP_HMAC =
  `${FIXTURE_ROOT}/generated/backup-integrity-hmac-key`;
const FIXTURE_SHARED_RULES =
  'C:/repo/menorah/deploy/monitoring/alert-rules.yml';
const FIXTURE_SHA = 'a'.repeat(40);
const composeSource = readFileSync(
  new URL('./compose.yml', import.meta.url),
  'utf8',
);
const generatorSource = readFileSync(
  new URL('./generate-environment.mjs', import.meta.url),
  'utf8',
);
const validatorSource = readFileSync(
  new URL('./validate-isolation.mjs', import.meta.url),
  'utf8',
);
const caddySource = readFileSync(
  new URL('./Caddyfile', import.meta.url),
  'utf8',
);
const prometheusSource = readFileSync(
  new URL('./prometheus.yml', import.meta.url),
  'utf8',
);
const dockerIgnoreSource = readFileSync(
  new URL('./.dockerignore', import.meta.url),
  'utf8',
);
const alertDockerIgnoreSource = readFileSync(
  new URL('./alert-fixture/.dockerignore', import.meta.url),
  'utf8',
);
const backupSource = readFileSync(
  new URL('./backup-local.sh', import.meta.url),
  'utf8',
);
const restoreSource = readFileSync(
  new URL('./restore-local.sh', import.meta.url),
  'utf8',
);
const redisServiceSource = composeSource.match(
  /\n  redis:\r?\n([\s\S]*?)\n  mail-capture:/,
)?.[1] || '';
const topLevelConfigsSource = composeSource.slice(
  composeSource.lastIndexOf('\nconfigs:'),
  composeSource.lastIndexOf('\nsecrets:'),
);

const requiredContractSource = `
NODE_ENV=
DEPLOYMENT_ENVIRONMENT=
MENORAH_STAGING_ALLOWED_HOSTS=
MENORAH_STAGING_EMAIL_DOMAIN=
MONGODB_URI=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
DATA_ENCRYPTION_KEY=
AUDIT_LOG_SIGNING_KEY=
BACKUP_ENCRYPTION_PASSWORD=
BACKUP_INTEGRITY_HMAC_KEY=
`;

const generatedEnvironment = () => buildEnvironmentValues({
  contractKeys: parseContractKeys(requiredContractSource),
  environmentFile: FIXTURE_ENV_FILE,
  mongoKeyfile: FIXTURE_MONGO_KEYFILE,
  backupPasswordFile: FIXTURE_BACKUP_PASSWORD,
  backupHmacFile: FIXTURE_BACKUP_HMAC,
  runtimeCandidateSha: FIXTURE_SHA,
});

const portModel = Object.freeze({
  caddy: [{ host_ip: '127.0.0.1', published: '28443', target: 443 }],
  'api-ios': [{ host_ip: '127.0.0.1', published: '28080', target: 8080 }],
  'api-android': [
    { host_ip: '127.0.0.1', published: '28081', target: 8080 },
  ],
  'api-web': [{ host_ip: '127.0.0.1', published: '28082', target: 8080 }],
  'api-admin': [
    { host_ip: '127.0.0.1', published: '28083', target: 8080 },
  ],
  worker: [{ host_ip: '127.0.0.1', published: '28084', target: 8080 }],
  'web-app': [{ host_ip: '127.0.0.1', published: '23001', target: 3001 }],
  'user-web-app': [
    { host_ip: '127.0.0.1', published: '23002', target: 3002 },
  ],
  'admin-panel': [
    { host_ip: '127.0.0.1', published: '23003', target: 3003 },
  ],
  livekit: [
    {
      host_ip: '127.0.0.1',
      published: '27880',
      target: 7880,
      protocol: 'tcp',
    },
    {
      host_ip: '127.0.0.1',
      published: '27881',
      target: 27881,
      protocol: 'tcp',
    },
    {
      host_ip: '127.0.0.1',
      published: '25000-25100',
      target: '25000-25100',
      protocol: 'udp',
    },
  ],
  prometheus: [
    { host_ip: '127.0.0.1', published: '29090', target: 9090 },
  ],
  alertmanager: [
    { host_ip: '127.0.0.1', published: '29093', target: 9093 },
  ],
  loki: [{ host_ip: '127.0.0.1', published: '23100', target: 3100 }],
  alloy: [{ host_ip: '127.0.0.1', published: '22345', target: 12345 }],
});

const validModel = () => {
  const environment = generatedEnvironment();
  const networkKeys = ['ingress', 'app', 'data', 'monitoring', 'restore'];
  const networks = Object.fromEntries(
    EXPECTED_NETWORK_NAMES.map((name, index) => [
      networkKeys[index],
      {
        name,
        internal: networkKeys[index] !== 'ingress',
        ...(networkKeys[index] === 'ingress'
          ? {
            driver: 'bridge',
            driver_opts: {
              'com.docker.network.bridge.enable_icc': 'false',
              'com.docker.network.bridge.enable_ip_masquerade': 'false',
              'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1',
            },
            ipam: {
              config: [{
                subnet: '10.254.244.0/24',
                ip_range: '10.254.244.128/25',
              }],
            },
          }
          : {}),
      },
    ]),
  );
  const volumes = Object.fromEntries(
    EXPECTED_VOLUME_NAMES.map((name, index) => [
      `volume-${index}`,
      { name },
    ]),
  );
  const services = Object.fromEntries(
    Object.entries(portModel).map(([serviceName, ports]) => [
      serviceName,
      {
        image: `local/${serviceName}:test`,
        ports,
        networks: ['ingress', 'app'],
      },
    ]),
  );
  services['api-ios'].environment = environment;
  services['user-web-app'].environment = {
    RESEND_API_URL: environment.RESEND_API_URL,
    RESEND_API_KEY: environment.RESEND_API_KEY,
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:
      environment.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID,
    MENORAH_LOCAL_STAGING_HTTPS_PORT:
      environment.MENORAH_LOCAL_STAGING_HTTPS_PORT,
    MENORAH_API_BASE_URL: environment.MENORAH_API_BASE_URL,
  };
  services['mail-capture'] = {
    image: 'local/mail-capture:test',
    environment: {
      NODE_ENV: 'production',
      MAIL_CAPTURE_PORT: '8025',
      MAIL_CAPTURE_API_KEY: environment.RESEND_API_KEY,
    },
    networks: ['app'],
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    pids_limit: 64,
    mem_limit: 128 * 1024 * 1024,
    cpus: 0.25,
    healthcheck: {
      test: ['CMD', 'node', '-e', 'process.exit(0)'],
    },
  };
  services['alert-fixture'] = {
    image: 'local/alert-fixture:test',
    environment: {
      COMPOSE_PROJECT_NAME: EXPECTED_PROJECT,
      MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:
        'menorah-local-staging-v1',
      ALERT_FIXTURE_PORT: '9101',
    },
    networks: ['monitoring'],
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    pids_limit: 64,
    mem_limit: 128 * 1024 * 1024,
    cpus: 0.25,
    healthcheck: {
      test: ['CMD', 'node', '-e', 'process.exit(0)'],
    },
  };
  services['mongo-primary'] = {
    image: 'mongo:7',
    networks: ['data'],
  };
  services.redis = {
    image: 'redis:7',
    networks: ['data'],
  };
  return {
    name: EXPECTED_PROJECT,
    networks,
    volumes,
    services,
  };
};

const validateFixture = (model) => validateRenderedCompose(model, {
  localStagingDirectory: FIXTURE_ROOT,
  allowedEnvironmentFile: FIXTURE_ENV_FILE,
  sharedAlertRulesFile: FIXTURE_SHARED_RULES,
});

const errorCodes = (errors) => new Set(errors.map(({ code }) => code));

test('generator derives a complete synthetic contract with unique secrets', () => {
  const environment = generatedEnvironment();
  assert.equal(environment.COMPOSE_PROJECT_NAME, EXPECTED_PROJECT);
  assert.equal(environment.MENORAH_SYNTHETIC_DATA_ONLY, 'true');
  assert.equal(environment.MENORAH_RUNTIME_CANDIDATE_SHA, FIXTURE_SHA);
  assert.equal(
    environment.RESEND_API_URL,
    'http://mail-capture:8025/emails',
  );
  assert.match(environment.RESEND_API_KEY, /^re_local_[A-Za-z0-9_-]{32,}$/);
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(EXPECTED_DOMAINS).map((key) => [key, environment[key]]),
    ),
    EXPECTED_DOMAINS,
  );

  const secrets = SECRET_VALUE_KEYS.map((key) => environment[key]);
  assert.equal(new Set(secrets).size, secrets.length);
  for (const key of SECRET_VALUE_KEYS.filter(
    (name) => name.startsWith('MENORAH_LOCAL_STAGING_')
      && name.endsWith('_PASSWORD'),
  )) {
    assert.match(environment[key], /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*!).{20,}$/);
  }
});

test('generator refuses to rotate any existing credential artifact', async (t) => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'menorah-local-staging-generator-'),
  );
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const targets = [
    'local-staging.env',
    'mongo-keyfile',
    'backup-encryption-password',
    'backup-integrity-hmac-key',
  ].map((name) => path.join(temporaryDirectory, name));

  await assert.doesNotReject(assertGeneratedTargetsAbsent(targets));
  await writeFile(targets[2], 'fixture-only-existing-key', {
    flag: 'wx',
    mode: 0o600,
  });
  await assert.rejects(
    assertGeneratedTargetsAbsent(targets),
    /Refusing to rotate existing local staging credentials or backup keys/,
  );
});

test('candidate binding includes untracked runtime source and build contexts exclude generated secrets', () => {
  assert.match(generatorSource, /--untracked-files=all/);
  assert.match(validatorSource, /--untracked-files=all/);
  assert.doesNotMatch(generatorSource, /--untracked-files=no/);
  assert.doesNotMatch(validatorSource, /--untracked-files=no/);
  assert.match(dockerIgnoreSource, /^\*\r?\n/m);
  assert.match(dockerIgnoreSource, /!Dockerfile\.local-backup/);
  assert.match(dockerIgnoreSource, /!Dockerfile\.monitoring-health/);
  assert.doesNotMatch(dockerIgnoreSource, /!generated/);
  assert.match(alertDockerIgnoreSource, /^\*\r?\n/m);
  assert.match(alertDockerIgnoreSource, /!server\.mjs/);
  assert.match(alertDockerIgnoreSource, /!control\.mjs/);
});

test('serialized generated environment round-trips without interpolation', () => {
  const environment = generatedEnvironment();
  const parsed = parseEnvironmentFile(serializeEnvironment(environment));
  assert.deepEqual(parsed, environment);
});

test('generated contract validator accepts the isolated synthetic fixture', () => {
  assert.deepEqual(
    validateEnvironmentRecord(generatedEnvironment(), {
      requireGeneratedContract: true,
      expectedRuntimeCandidateSha: FIXTURE_SHA,
    }),
    [],
  );
});

test('rendered Compose validator accepts the fully isolated fixture', () => {
  assert.deepEqual(validateFixture(validModel()), []);
});

test('every shared image has only one canonical build owner', () => {
  const model = validModel();
  model.services['api-ios'].image = 'local/backend:test';
  model.services['api-ios'].build = {
    context: '../../backend',
    dockerfile: 'Dockerfile',
  };
  model.services['api-web'].image = 'local/backend:test';
  model.services['api-web'].build = {
    context: '../../backend',
    dockerfile: 'Dockerfile',
  };
  assert.ok(
    errorCodes(validateFixture(model))
      .has('duplicate_image_build_owner'),
  );
});

test('Redis starts directly as its pinned non-root volume identity', () => {
  assert.match(redisServiceSource, /\n    user: "999:1000"/);
  assert.match(
    redisServiceSource,
    /\/run\/redis:rw,noexec,nosuid,nodev,size=1m,mode=700,uid=999,gid=1000/,
  );
  assert.doesNotMatch(redisServiceSource, /\bchown\b|\bsetpriv\b|cap_add:/);
});

test('mail capture must remain internal, generated, and hardened', () => {
  const missing = validModel();
  delete missing.services['mail-capture'];
  assert.ok(
    errorCodes(validateFixture(missing)).has('required_service_missing'),
  );

  const exposed = validModel();
  exposed.services['mail-capture'].ports = [{
    host_ip: '127.0.0.1',
    published: '28025',
    target: 8025,
  }];
  const exposedCodes = errorCodes(validateFixture(exposed));
  assert.ok(exposedCodes.has('port_not_allowlisted'));
  assert.ok(exposedCodes.has('mail_capture_network_not_internal'));

  const weak = validModel();
  weak.services['mail-capture'].environment.MAIL_CAPTURE_API_KEY =
    'ordinary-test-key';
  weak.services['mail-capture'].read_only = false;
  const weakCodes = errorCodes(validateFixture(weak));
  assert.ok(weakCodes.has('mail_capture_identity_invalid'));
  assert.ok(weakCodes.has('mail_capture_hardening_missing'));

  const splitUserWeb = validModel();
  splitUserWeb.services['user-web-app'].environment.RESEND_API_KEY =
    `re_local_${'z'.repeat(40)}`;
  assert.ok(
    errorCodes(validateFixture(splitUserWeb))
      .has('user_web_mail_capture_mismatch'),
  );

  const publicServerApi = validModel();
  publicServerApi.services['user-web-app'].environment
    .MENORAH_API_BASE_URL =
      'https://api-web.staging.localhost:28443/api';
  assert.ok(
    errorCodes(validateFixture(publicServerApi))
      .has('user_web_mail_capture_mismatch'),
  );
});

test('alert exercise fixture must remain internal, exact, and hardened', () => {
  const missing = validModel();
  delete missing.services['alert-fixture'];
  assert.ok(
    errorCodes(validateFixture(missing)).has('required_service_missing'),
  );

  const exposed = validModel();
  exposed.services['alert-fixture'].ports = [{
    host_ip: '127.0.0.1',
    published: '29101',
    target: 9101,
  }];
  exposed.services['alert-fixture'].networks = ['app'];
  const exposedCodes = errorCodes(validateFixture(exposed));
  assert.ok(exposedCodes.has('port_not_allowlisted'));
  assert.ok(exposedCodes.has('alert_fixture_network_not_internal'));

  const weak = validModel();
  weak.services['alert-fixture'].environment.COMPOSE_PROJECT_NAME =
    'shared-staging';
  weak.services['alert-fixture'].read_only = false;
  const weakCodes = errorCodes(validateFixture(weak));
  assert.ok(weakCodes.has('alert_fixture_identity_invalid'));
  assert.ok(weakCodes.has('alert_fixture_hardening_missing'));
});

test('backup telemetry can target only the internal alert fixture', () => {
  const valid = validModel();
  valid.services['backup-job'] = {
    image: 'local/backup:test',
    environment: {
      MENORAH_LOCAL_STAGING_BACKUP_METRICS_URL:
        'http://alert-fixture:9101/control/backup',
    },
    networks: ['data', 'monitoring'],
  };
  assert.deepEqual(validateFixture(valid), []);

  valid.services['backup-job'].environment
    .MENORAH_LOCAL_STAGING_BACKUP_METRICS_URL =
      'https://telemetry.example.invalid/backup';
  assert.ok(
    errorCodes(validateFixture(valid)).has('backup_alert_telemetry_invalid'),
  );
});

test('production Menorah and Mentle domains fail closed', () => {
  for (const productionHost of [
    'https://api-web.menorah.me/api',
    'https://admin.mentle.org/api',
  ]) {
    const model = validModel();
    model.services['api-ios'].environment.FRONTEND_API_WEB_URL =
      productionHost;
    assert.ok(
      errorCodes(validateFixture(model)).has('production_domain'),
    );
  }
});

test('published ports require exact service mapping and loopback binding', () => {
  const model = validModel();
  model.services.caddy.ports[0].host_ip = '0.0.0.0';
  model.services.caddy.ports[0].published = '443';
  const codes = errorCodes(validateFixture(model));
  assert.ok(codes.has('non_loopback_port'));
  assert.ok(codes.has('port_not_allowlisted'));
  assert.ok(codes.has('required_port_missing'));
});

test('published services require the hardened ingress network', () => {
  const missingIngress = validModel();
  missingIngress.services['api-ios'].networks = ['app'];
  assert.ok(
    errorCodes(validateFixture(missingIngress))
      .has('published_service_ingress_missing'),
  );

  const exposedInternalService = validModel();
  exposedInternalService.services.redis.networks = ['data', 'ingress'];
  assert.ok(
    errorCodes(validateFixture(exposedInternalService))
      .has('unpublished_service_on_ingress'),
  );

  const masqueradingIngress = validModel();
  masqueradingIngress.networks.ingress.driver_opts[
    'com.docker.network.bridge.enable_ip_masquerade'
  ] = 'true';
  assert.ok(
    errorCodes(validateFixture(masqueradingIngress))
      .has('network_not_isolated'),
  );
});

test('MongoDB and Redis cannot publish even loopback ports', () => {
  for (const serviceName of ['mongo-primary', 'redis']) {
    const model = validModel();
    model.services[serviceName].ports = [{
      host_ip: '127.0.0.1',
      published: '29999',
      target: serviceName === 'redis' ? 6379 : 27017,
    }];
    assert.ok(
      errorCodes(validateFixture(model)).has('data_service_published'),
    );
  }
});

test('project, network, and named-volume identity is exact', () => {
  const model = validModel();
  model.name = 'shared-staging';
  model.networks.app.external = true;
  model.networks.app.internal = false;
  delete model.volumes['volume-0'];
  const codes = errorCodes(validateFixture(model));
  assert.ok(codes.has('project_mismatch'));
  assert.ok(codes.has('network_not_isolated'));
  assert.ok(codes.has('volume_set_mismatch'));
});

test('Docker socket, host-root, container-log, and writable binds fail', () => {
  const cases = [
    {
      source: '/var/run/docker.sock',
      target: '/var/run/docker.sock',
      read_only: true,
      expected: 'host_runtime_mount',
    },
    {
      source: '/',
      target: '/host',
      read_only: true,
      expected: 'bind_outside_allowlist',
    },
    {
      source: '/var/lib/docker/containers',
      target: '/host-logs',
      read_only: true,
      expected: 'host_runtime_mount',
    },
    {
      source: `${FIXTURE_ROOT}/Caddyfile`,
      target: '/etc/caddy/Caddyfile',
      read_only: false,
      expected: 'writable_bind',
    },
  ];
  for (const entry of cases) {
    const model = validModel();
    model.services.caddy.volumes = [{
      type: 'bind',
      source: entry.source,
      target: entry.target,
      read_only: entry.read_only,
    }];
    assert.ok(
      errorCodes(validateFixture(model)).has(entry.expected),
      entry.expected,
    );
  }
});

test('persistence cannot escape into host binds or volume driver options', () => {
  const model = validModel();
  model.services['mongo-primary'].volumes = [{
    type: 'bind',
    source: `${FIXTURE_ROOT}/generated/mongo-data`,
    target: '/data/db',
    read_only: true,
  }];
  model.volumes['volume-0'].driver_opts = {
    type: 'none',
    o: 'bind',
    device: '/shared/data',
  };
  const codes = errorCodes(validateFixture(model));
  assert.ok(codes.has('bind_persistence'));
  assert.ok(codes.has('volume_not_local'));
});

test('only the generated ignored env file may be referenced', () => {
  const model = validModel();
  model.services['api-ios'].env_file = [
    'C:/repo/menorah/deploy/env/production.env',
  ];
  assert.ok(
    errorCodes(validateFixture(model)).has('prohibited_env_file'),
  );
});

test('live provider IDs and enabled optional providers fail', () => {
  const model = validModel();
  model.services['api-ios'].environment.RAZORPAY_KEY_ID =
    `rzp_${'live'}_ABCDEFGHIJKLMN`;
  model.services['api-ios'].environment.ZOOM_ENABLED = 'true';
  const codes = errorCodes(validateFixture(model));
  assert.ok(codes.has('live_provider_key'));
  assert.ok(codes.has('provider_enabled'));
});

test('staging URLs must use the fixed high HTTPS/WSS port', () => {
  const environment = generatedEnvironment();
  environment.LIVEKIT_URL =
    `wss://${EXPECTED_DOMAINS.CALLS_DOMAIN}:443`;
  const codes = errorCodes(validateEnvironmentRecord(environment, {
    requireGeneratedContract: true,
    expectedRuntimeCandidateSha: FIXTURE_SHA,
  }));
  assert.ok(codes.has('generated_contract_mismatch'));
});

test('replica initialization uses the connected database handle', () => {
  assert.doesNotMatch(composeSource, /\brs\.(?:status|initiate)\s*\(/);
  assert.equal(
    (composeSource.match(/adminCommand\(\{\s*replSetInitiate:/g) || []).length,
    2,
  );
});

test('Caddy proxy address is outside the dynamic network allocation range', () => {
  assert.match(composeSource, /TRUST_PROXY: 10\.254\.240\.10/);
  assert.match(composeSource, /ipv4_address: 10\.254\.240\.10/);
  assert.match(
    composeSource,
    /subnet: 10\.254\.240\.0\/24\r?\n\s+ip_range: 10\.254\.240\.128\/25/,
  );
});

test('Caddy uses an init reaper for healthcheck child processes', () => {
  const caddyService = composeSource.match(
    /\n  caddy:\r?\n([\s\S]*?)(?=\n  alert-sink:\r?\n)/,
  )?.[1] || '';
  assert.match(caddyService, /\n    init: true\b/);
});

test('Caddy upstreams use private app-network aliases, not ingress service names', () => {
  const upstreams = [
    ['api-ios', 'private-api-ios', 8080],
    ['api-android', 'private-api-android', 8080],
    ['api-web', 'private-api-web', 8080],
    ['api-admin', 'private-api-admin', 8080],
    ['user-web-app', 'private-user-web', 3002],
    ['web-app', 'private-counsellor-web', 3001],
    ['admin-panel', 'private-admin-panel', 3003],
    ['livekit', 'private-livekit', 7880],
  ];

  for (const [service, alias, port] of upstreams) {
    const serviceBlock = composeSource.match(
      new RegExp(
        `\\n  ${service}:\\r?\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9-]+:\\r?\\n)`,
      ),
    )?.[1] || '';
    assert.match(
      serviceBlock,
      new RegExp(`\\n      app:\\r?\\n\\s+aliases:\\r?\\n\\s+- ${alias}\\b`),
    );
    assert.match(caddySource, new RegExp(`local_proxy ${alias}:${port}\\b`));
    assert.doesNotMatch(
      caddySource,
      new RegExp(`local_proxy ${service}:${port}\\b`),
    );
  }
});

test('Prometheus reaches Alertmanager through its private monitoring alias', () => {
  const alertmanagerService = composeSource.match(
    /\n  alertmanager:\r?\n([\s\S]*?)(?=\n  blackbox-exporter:\r?\n)/,
  )?.[1] || '';
  assert.match(
    alertmanagerService,
    /\n      monitoring:\r?\n\s+aliases:\r?\n\s+- private-alertmanager\b/,
  );
  assert.equal(
    (prometheusSource.match(/private-alertmanager:9093/g) || []).length,
    2,
  );
  assert.doesNotMatch(prometheusSource, /(?:^|\s)- alertmanager:9093\b/m);
});

test('read-only monitoring services use file-backed Compose configs', () => {
  assert.doesNotMatch(topLevelConfigsSource, /\bcontent:/);
  assert.match(topLevelConfigsSource, /blackbox:\r?\n\s+file: \.\/blackbox\.yml/);
  assert.match(topLevelConfigsSource, /loki:\r?\n\s+file: \.\/loki\.yml/);
});

test('backup and restore bind evidence to a quiesced exact database scope', () => {
  assert.match(
    backupSource,
    /MENORAH_LOCAL_STAGING_WRITERS_QUIESCED:-.*APPLICATION_WRITERS_STOPPED/s,
  );
  assert.match(backupSource, /--db=menorah/);
  assert.match(backupSource, /getSiblingDB\("menorah"\)/);
  assert.match(backupSource, /database-manifest\.json/);
  assert.doesNotMatch(backupSource, /--oplog(?:\s|\\)/);

  assert.match(restoreSource, /dropDatabase\(\)/);
  assert.match(restoreSource, /--nsInclude=menorah\.\*/);
  assert.match(restoreSource, /restored-database-manifest\.json/);
  assert.match(
    restoreSource,
    /consistency=application_writers_quiesced/,
  );
  assert.doesNotMatch(restoreSource, /--oplogReplay/);
});

test('backup signature input slurping keeps signature newline handling exact', () => {
  for (const source of [backupSource, restoreSource]) {
    assert.match(source, /my \$key = do \{ local \$\/; <\$key_fh> \};/);
    assert.match(source, /\$payload \.= do \{ local \$\/; <\$fh> \};/);
    assert.doesNotMatch(source, /local \$\/;\s+my \$key = <\$key_fh>;/);
  }
  assert.match(
    restoreSource,
    /my \$expected = <\$expected_fh>;\s+chomp \$expected;/,
  );
});

test('media restore preserves content without applying archived numeric owners', () => {
  assert.match(
    restoreSource,
    /tar --no-same-owner -C "\$\{RESTORE_MEDIA_ROOT\}"/,
  );
  assert.match(restoreSource, /restored-media-manifest\.sha256/);
  assert.match(
    restoreSource,
    /cmp -s\s+.*media-manifest\.sha256.*restored-media-manifest\.sha256/s,
  );
});
