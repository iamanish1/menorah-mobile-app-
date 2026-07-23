#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
const MENORAH_ROOT = path.resolve(QA_DIR, '..', '..');

const FILES = {
  prometheus: path.join(MENORAH_ROOT, 'deploy', 'monitoring', 'prometheus.yml'),
  alerts: path.join(MENORAH_ROOT, 'deploy', 'monitoring', 'alert-rules.yml'),
  blackbox: path.join(MENORAH_ROOT, 'deploy', 'monitoring', 'blackbox.yml'),
  alertmanager: path.join(MENORAH_ROOT, 'deploy', 'monitoring', 'alertmanager.yml'),
  coverage: path.join(MENORAH_ROOT, 'deploy', 'monitoring', 'observability-coverage.yml'),
  compose: path.join(MENORAH_ROOT, 'deploy', 'docker-compose.production.yml'),
  backupScript: path.join(MENORAH_ROOT, 'deploy', 'monitoring', 'export-backup-metrics.sh'),
  backupResultRecorder: path.join(
    MENORAH_ROOT,
    'deploy',
    'ubuntu',
    'record-backup-result.sh',
  ),
  backupNow: path.join(MENORAH_ROOT, 'deploy', 'ubuntu', 'backup-now.sh'),
  backupSchedule: path.join(
    MENORAH_ROOT,
    'deploy',
    'ubuntu',
    'install-backup-schedule.sh',
  ),
  dockerExporter: path.join(
    MENORAH_ROOT,
    'deploy',
    'monitoring',
    'docker-stats-exporter.mjs',
  ),
  mongoUsers: path.join(MENORAH_ROOT, 'deploy', 'mongo', 'create-users.js'),
  alloy: path.join(MENORAH_ROOT, 'deploy', 'logging', 'config.alloy'),
  loki: path.join(MENORAH_ROOT, 'deploy', 'logging', 'loki-config.yml'),
  prepareHost: path.join(MENORAH_ROOT, 'deploy', 'ubuntu', 'prepare-host.sh'),
  caddy: path.join(MENORAH_ROOT, 'deploy', 'caddy', 'Caddyfile.production'),
  runbook: path.join(MENORAH_ROOT, 'docs', 'monitoring-alert-runbook.md'),
};

const REQUIRED_SCRAPE_JOBS = [
  'blackbox-http-internal',
  'blackbox-tcp-internal',
  'blackbox-https-public',
  'blackbox-https-calls',
  'security-events',
  'blackbox-exporter',
  'mongodb-exporter',
  'redis-exporter',
  'node-exporter',
  'docker-stats-exporter',
  'alloy',
  'loki',
  'alertmanager',
  'prometheus',
];

const REQUIRED_TARGETS = [
  'http://api-ios:8080/health/ready',
  'http://api-android:8080/health/ready',
  'http://api-web:8080/health/ready',
  'http://api-admin:8080/health/ready',
  'http://worker:8080/health/ready',
  'http://landing-page:3002/',
  'http://user-web-app:3002/',
  'http://web-app:3001/',
  'http://admin-panel:3003/',
  'livekit:7880',
  'mongo-primary:27017',
  'redis:6379',
  'https://www.menorah.me/',
  'https://app.menorah.me/',
  'https://admin.menorah.me/',
  'https://counsellor.menorah.me/',
  'https://api-ios.menorah.me/health/ready',
  'https://api-android.menorah.me/health/ready',
  'https://api-web.menorah.me/health/ready',
  'https://api-admin.menorah.me/health/ready',
  'https://calls.menorah.me/',
  'https://mentle.org/',
  'https://www.mentle.org/',
  'https://mentle.mentle.org/',
  'https://app.mentle.org/',
  'https://business.mentle.org/',
  'https://admin.mentle.org/',
  'https://counsellor.mentle.org/',
  'https://api.mentle.org/health/ready',
  'https://api-business.mentle.org/health/ready',
  'https://api-admin.mentle.org/health/ready',
  'https://api-counsellor.mentle.org/health/ready',
  'https://calls.mentle.org/',
];

const REQUIRED_COMPOSE_SERVICES = [
  'prometheus',
  'alertmanager',
  'blackbox-exporter',
  'mongodb-exporter',
  'redis-exporter',
  'node-exporter',
  'backup-metrics',
  'docker-metrics-gateway',
  'docker-stats-exporter',
  'log-collector',
  'loki',
];

const EXPECTED_MONITORING_IMAGES = {
  prometheus:
    'prom/prometheus:v2.55.1@sha256:2659f4c2ebb718e7695cb9b25ffa7d6be64db013daba13e05c875451cf51b0d3',
  alertmanager:
    'prom/alertmanager:v0.32.1@sha256:51a825c2a40acc3e338fdd00d622e01ec090f72be2b3ea46be0839cd47a4d286',
  'blackbox-exporter':
    'prom/blackbox-exporter:v0.28.0@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc',
  'mongodb-exporter':
    'percona/mongodb_exporter:0.51.0@sha256:852b90b9f38ab489762b8a8b8c074ce852272c2495d725b922bdb5bc7d659e16',
  'redis-exporter':
    'oliver006/redis_exporter:v1.84.0@sha256:7ef8e9c26638158fa4e7ad60df8c7e53d1919986753d6c1d2d1876b6ec38d87b',
  'node-exporter':
    'prom/node-exporter:v1.11.1@sha256:e9cff4fc67b1818f8c97adb115b9f12c9a54b533de86765d4a0effc01b357205',
  'backup-metrics':
    'busybox:1.37.0-glibc@sha256:4279d9b47df4c1b02d80efd8d02cd59b3a8182c1e785a4ff3f6983bee19dc8b0',
  'docker-metrics-gateway':
    'node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2',
  'docker-stats-exporter':
    'node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2',
  'log-collector':
    'grafana/alloy:v1.18.0@sha256:491b0578c04983fd54fe99b587b6fab4404dc46d0dc16677bd6b00cc1140b308',
  loki:
    'grafana/loki:3.7.3@sha256:70b9f699fc9bb868b62f1cfd4f787dfa50242f1fd92e6089787d5d7daea75fe8',
};

const REQUIRED_COVERAGE_IDS = [
  'api-availability',
  'frontend-availability',
  'call-service-availability',
  'mongodb-health',
  'redis-health',
  'worker-readiness',
  'queue-backlog',
  'backup-age',
  'backup-immediate-failure',
  'host-capacity',
  'container-restarts-and-memory',
  'tls-certificate-expiry',
  'authentication-mfa-admin-events',
  'durable-security-audit-sink',
  'specific-privilege-change-events',
  'payout-action-failures',
  'payment-webhook-terminal-reconciliation',
  'general-payment-provider-failures',
  'email-delivery-failures',
  'call-provider-failures',
  'call-authorization-denials',
  'http-401-rate',
  'http-403-rate',
  'http-429-rate',
  'http-500-rate',
  'monitoring-stack-health',
];

const FORBIDDEN_UNAVAILABLE_METRICS =
  /\bmenorah_(?:queue_backlog|email_delivery|call_provider|payment_provider|http_requests)_/;

const EXPECTED_CONTAINER_METRICS = new Set([
  'menorah_container_running',
  'menorah_container_restarts_total',
  'menorah_container_start_time_seconds',
  'menorah_container_memory_working_set_bytes',
  'menorah_container_memory_limit_bytes',
]);

const parseYaml = (filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const document = YAML.parseDocument(source, { prettyErrors: true });
  if (document.errors.length > 0) {
    throw new Error(`${filename}: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  return document.toJS();
};

export const loadMonitoringDocuments = () => ({
  prometheus: parseYaml(FILES.prometheus),
  alerts: parseYaml(FILES.alerts),
  blackbox: parseYaml(FILES.blackbox),
  alertmanager: parseYaml(FILES.alertmanager),
  coverage: parseYaml(FILES.coverage),
  compose: parseYaml(FILES.compose),
  backupScript: fs.readFileSync(FILES.backupScript, 'utf8'),
  backupResultRecorder: fs.readFileSync(FILES.backupResultRecorder, 'utf8'),
  backupNow: fs.readFileSync(FILES.backupNow, 'utf8'),
  backupSchedule: fs.readFileSync(FILES.backupSchedule, 'utf8'),
  dockerExporter: fs.readFileSync(FILES.dockerExporter, 'utf8'),
  mongoUsers: fs.readFileSync(FILES.mongoUsers, 'utf8'),
  alloy: fs.readFileSync(FILES.alloy, 'utf8'),
  loki: parseYaml(FILES.loki),
  prepareHost: fs.readFileSync(FILES.prepareHost, 'utf8'),
  caddy: fs.readFileSync(FILES.caddy, 'utf8'),
  runbook: fs.readFileSync(FILES.runbook, 'utf8'),
});

const collectTargets = (scrapeConfigs) =>
  scrapeConfigs.flatMap((scrape) =>
    (scrape.static_configs || []).flatMap((config) => config.targets || []),
  );

const collectRules = (alertConfig) =>
  (alertConfig.groups || []).flatMap((group) => group.rules || []);

const requireValue = (errors, value, message) => {
  if (!value) errors.push(message);
};

export const validateMonitoringDocuments = (documents) => {
  const errors = [];
  const {
    prometheus,
    alerts,
    blackbox,
    alertmanager,
    coverage,
    compose,
    backupScript,
    backupResultRecorder,
    backupNow,
    backupSchedule,
    dockerExporter,
    mongoUsers,
    alloy,
    loki,
    prepareHost,
    caddy,
    runbook,
  } = documents;

  const scrapeConfigs = prometheus?.scrape_configs || [];
  const scrapeJobs = new Set(scrapeConfigs.map((scrape) => scrape.job_name));

  for (const job of REQUIRED_SCRAPE_JOBS) {
    requireValue(errors, scrapeJobs.has(job), `missing required Prometheus scrape job: ${job}`);
  }

  for (const scrape of scrapeConfigs) {
    if (/^\/health(?:\/|$)/.test(scrape.metrics_path || '')) {
      errors.push(
        `Prometheus job ${scrape.job_name || '<unnamed>'} scrapes JSON health path ${scrape.metrics_path} as metrics`,
      );
    }
  }

  const targets = new Set(collectTargets(scrapeConfigs));
  for (const target of REQUIRED_TARGETS) {
    requireValue(errors, targets.has(target), `missing required availability probe target: ${target}`);
  }

  requireValue(
    errors,
    prometheus?.alerting?.alertmanagers?.length > 0,
    'Prometheus has no Alertmanager target',
  );

  for (const moduleName of [
    'http_success',
    'http_ready',
    'https_success',
    'https_ready',
    'https_calls',
    'tcp_connect',
  ]) {
    requireValue(errors, blackbox?.modules?.[moduleName], `missing blackbox module: ${moduleName}`);
  }
  for (const [moduleName, module] of Object.entries(blackbox?.modules || {})) {
    if (module?.http?.tls_config?.insecure_skip_verify === true) {
      errors.push(`blackbox module ${moduleName} disables TLS certificate verification`);
    }
  }
  for (const moduleName of ['http_ready', 'https_ready', 'https_calls']) {
    const module = blackbox?.modules?.[moduleName];
    requireValue(
      errors,
      JSON.stringify(module?.http?.valid_status_codes) === '[200]',
      `blackbox module ${moduleName} must accept only HTTP 200`,
    );
    if (module?.http?.follow_redirects !== false) {
      errors.push(`blackbox module ${moduleName} must reject redirects`);
    }
  }

  const rules = collectRules(alerts);
  const alertNames = new Set();
  for (const rule of rules) {
    requireValue(errors, rule.alert, 'an alert rule is missing alert');
    if (rule.alert) alertNames.add(rule.alert);
    requireValue(errors, rule.expr, `${rule.alert || '<unnamed>'} is missing expr`);
    requireValue(errors, rule.labels?.severity, `${rule.alert || '<unnamed>'} is missing severity`);
    requireValue(errors, rule.labels?.owner, `${rule.alert || '<unnamed>'} is missing owner`);
    requireValue(errors, rule.annotations?.summary, `${rule.alert || '<unnamed>'} is missing summary`);
    requireValue(
      errors,
      /^https:\/\/github\.com\/menorahsoftware-cmyk\/menorah-mobile-app-\/blob\/release\/final-production-readiness\/menorah\/docs\/monitoring-alert-runbook\.md#[a-z0-9-]+$/.test(
        rule.annotations?.runbook_url || '',
      ),
      `${rule.alert || '<unnamed>'} has no canonical HTTPS runbook_url`,
    );
    if (FORBIDDEN_UNAVAILABLE_METRICS.test(String(rule.expr || ''))) {
      errors.push(`${rule.alert || '<unnamed>'} claims an explicitly unavailable application metric`);
    }
    if (
      /\bmenorah_security_audit_sink_(?:persisted|failures)_total\b/.test(
        String(rule.expr || ''),
      )
      && !/\bincrease\s*\(/.test(String(rule.expr || ''))
    ) {
      errors.push(
        `${rule.alert || '<unnamed>'} uses an audit-sink counter without increase()`,
      );
    }
    if (rule.alert) {
      requireValue(
        errors,
        runbook.includes(`### ${rule.alert}`),
        `runbook is missing a heading for ${rule.alert}`,
      );
    }
  }

  const frontendAlertServices = new Map([
    ['InternalFrontendProbeFailed', 'landing-page'],
    ['UserFrontendProbeFailed', 'user-web-app'],
    ['AdminFrontendProbeFailed', 'admin-panel'],
    ['CounsellorFrontendProbeFailed', 'counsellor-web'],
  ]);
  for (const [alertName, service] of frontendAlertServices) {
    const rule = rules.find((candidate) => candidate.alert === alertName);
    requireValue(errors, rule, `missing required frontend alert: ${alertName}`);
    requireValue(
      errors,
      String(rule?.expr || '').includes(`service="${service}"`),
      `${alertName} must select only the ${service} probe`,
    );
  }
  const productFrontendRules = [
    'UserFrontendProbeFailed',
    'AdminFrontendProbeFailed',
    'CounsellorFrontendProbeFailed',
  ];
  for (const alertName of productFrontendRules) {
    const rule = rules.find((candidate) => candidate.alert === alertName);
    requireValue(
      errors,
      rule?.annotations?.resolution,
      `${alertName} is missing a clear resolution message`,
    );
  }

  const backupFailureRule = rules.find((rule) => rule.alert === 'BackupJobFailed');
  requireValue(errors, backupFailureRule, 'missing required backup alert: BackupJobFailed');
  requireValue(
    errors,
    /menorah_backup_attempt_metadata_present\s*==\s*1/.test(
      String(backupFailureRule?.expr || ''),
    )
      && /menorah_backup_last_attempt_result\s*==\s*0/.test(
        String(backupFailureRule?.expr || ''),
      ),
    'BackupJobFailed must alert only on a validated latest-attempt failure',
  );
  requireValue(
    errors,
    backupFailureRule?.annotations?.resolution,
    'BackupJobFailed is missing a clear resolution message',
  );

  const exportedContainerMetrics = new Set(
    [...dockerExporter.matchAll(
      /# TYPE (menorah_container_[a-z0-9_]+) (?:counter|gauge)/g,
    )].map((match) => match[1]),
  );
  requireValue(
    errors,
    JSON.stringify([...exportedContainerMetrics].sort())
      === JSON.stringify([...EXPECTED_CONTAINER_METRICS].sort()),
    'Docker exporter container metric declarations have drifted from the bounded contract',
  );
  for (const rule of rules) {
    const references = String(rule.expr || '').match(
      /\bmenorah_container_[a-z0-9_]+\b/g,
    ) || [];
    for (const metricName of references) {
      requireValue(
        errors,
        exportedContainerMetrics.has(metricName),
        `${rule.alert} references container metric not emitted by the exporter: ${metricName}`,
      );
    }
  }
  const restartAlert = rules.find((rule) => rule.alert === 'ContainerRestartLoop');
  requireValue(
    errors,
    /\bincrease\s*\(\s*menorah_container_restarts_total\{[^}]*\}\[15m\]\s*\)/.test(
      String(restartAlert?.expr || ''),
    ),
    'ContainerRestartLoop must use increase() over the monotonic restart counter',
  );
  const backupAgeContracts = new Map([
    ['SixHourlyBackupTooOld', '21600'],
    ['DailyBackupTooOld', '86400'],
    ['WeeklyBackupTooOld', '604800'],
    ['MonthlyBackupTooOld', '2678400'],
    ['RestoreTestTooOld', '86400'],
  ]);
  for (const [alertName, maxAgeSeconds] of backupAgeContracts) {
    const rule = rules.find((candidate) => candidate.alert === alertName);
    requireValue(
      errors,
      new RegExp(`>\\s*${maxAgeSeconds}\\b`).test(String(rule?.expr || '')),
      `${alertName} must use the schedule-aligned ${maxAgeSeconds}-second age limit`,
    );
  }

  const coverageSignals = coverage?.signals || [];
  const coverageById = new Map(coverageSignals.map((signal) => [signal.id, signal]));
  for (const id of REQUIRED_COVERAGE_IDS) {
    requireValue(errors, coverageById.has(id), `observability coverage is missing signal: ${id}`);
  }

  const coveredAlertNames = new Set();
  for (const signal of coverageSignals) {
    if (!['covered', 'unavailable'].includes(signal.status)) {
      errors.push(`${signal.id || '<unnamed signal>'} has invalid coverage status: ${signal.status}`);
    }
    if (signal.status === 'unavailable') {
      if ((signal.alerts || []).length > 0) {
        errors.push(`${signal.id} is unavailable but claims alert coverage`);
      }
      requireValue(errors, signal.limitation, `${signal.id} is unavailable without a limitation`);
      requireValue(errors, signal.action, `${signal.id} is unavailable without an action`);
    }
    for (const alertName of signal.alerts || []) {
      coveredAlertNames.add(alertName);
      requireValue(
        errors,
        alertNames.has(alertName),
        `${signal.id} references missing alert ${alertName}`,
      );
    }
  }
  for (const alertName of alertNames) {
    requireValue(
      errors,
      coveredAlertNames.has(alertName),
      `${alertName} is not mapped in observability-coverage.yml`,
    );
  }

  requireValue(
    errors,
    alertmanager?.route?.receiver === 'unconfigured-destination',
    'committed Alertmanager route must use the explicit unconfigured placeholder',
  );
  const receivers = alertmanager?.receivers || [];
  requireValue(errors, receivers.length === 1, 'committed Alertmanager config must have one placeholder receiver');
  for (const receiver of receivers) {
    const integrationKeys = Object.keys(receiver || {}).filter((key) => key !== 'name');
    if (integrationKeys.length > 0) {
      errors.push(
        `committed Alertmanager receiver must not contain destinations: ${integrationKeys.join(', ')}`,
      );
    }
  }

  const services = compose?.services || {};
  for (const serviceName of REQUIRED_COMPOSE_SERVICES) {
    const service = services[serviceName];
    requireValue(errors, service, `production Compose is missing ${serviceName}`);
    if (service?.image && !/@sha256:[a-f0-9]{64}$/.test(service.image)) {
      errors.push(`${serviceName} image is not pinned by immutable sha256 digest`);
    }
    if (service?.image && service.image !== EXPECTED_MONITORING_IMAGES[serviceName]) {
      errors.push(`${serviceName} image does not match the registry-verified monitoring image lock`);
    }
  }
  requireValue(
    errors,
    (services.alertmanager?.volumes || []).some((volume) =>
      String(volume).includes('ALERTMANAGER_CONFIG_FILE'),
    ),
    'Alertmanager config mount must retain the operator-controlled file override',
  );
  requireValue(
    errors,
    (services['blackbox-exporter']?.networks || []).includes('public_net'),
    'blackbox exporter has no egress network for public probes',
  );
  requireValue(
    errors,
    (services['blackbox-exporter']?.networks || []).includes('db_net'),
    'blackbox exporter cannot reach private datastore probe targets',
  );
  requireValue(
    errors,
    (services.alertmanager?.networks || []).includes('public_net'),
    'Alertmanager has no controlled egress network for notification delivery',
  );
  requireValue(
    errors,
    (services['uptime-kuma']?.networks || []).includes('public_net'),
    'Uptime Kuma has no controlled egress network for public monitors',
  );
  requireValue(
    errors,
    String(services['mongodb-exporter']?.environment?.MONGODB_URI || '').includes(
      'MONGODB_MONITORING_URI',
    ),
    'MongoDB exporter does not use the dedicated monitoring URI variable',
  );
  requireValue(
    errors,
    String(services['mongo-primary']?.environment?.MONGO_MONITOR_USER || '').includes(
      'MONGO_MONITOR_USER',
    ),
    'MongoDB bootstrap does not receive the dedicated monitoring username',
  );
  for (const requiredMongoUserControl of [
    'MONGO_MONITOR_USER',
    'MONGO_MONITOR_PASSWORD',
    "{ role: 'clusterMonitor', db: 'admin' }",
    "{ role: 'read', db: 'local' }",
  ]) {
    requireValue(
      errors,
      mongoUsers.includes(requiredMongoUserControl),
      `MongoDB bootstrap is missing monitoring control: ${requiredMongoUserControl}`,
    );
  }
  requireValue(
    errors,
    (services['node-exporter']?.command || []).some((argument) =>
      String(argument).includes('--collector.textfile.directory='),
    ),
    'node_exporter textfile collector is not configured',
  );
  requireValue(
    errors,
    String(services['node-exporter']?.user || '') === '65534:65534',
    'node-exporter must run explicitly as its non-root identity',
  );
  requireValue(
    errors,
    String(services['backup-metrics']?.user || '').includes('BACKUP_METRICS_RUN_AS'),
    'backup-metrics must use the explicit operator uid:gid needed to read backup metadata',
  );
  for (const serviceName of ['node-exporter', 'backup-metrics']) {
    requireValue(
      errors,
      (services[serviceName]?.volumes || []).some((volume) =>
        String(volume).includes('/monitoring-textfile:/textfile'),
      ),
      `${serviceName} must use the prepared host textfile directory`,
    );
  }
  requireValue(
    errors,
    Boolean(services['backup-metrics']?.healthcheck),
    'backup metric writer has no freshness healthcheck',
  );
  requireValue(
    errors,
    services['backup-metrics']?.environment?.BACKUP_ATTEMPT_ROOT
      === '/backup-attempts',
    'backup metric writer has no bounded latest-attempt state root',
  );
  requireValue(
    errors,
    (services['backup-metrics']?.volumes || []).some((volume) =>
      String(volume).includes('/backup-attempts:/backup-attempts:ro'),
    ),
    'backup metric writer does not mount latest-attempt state read-only',
  );
  requireValue(
    errors,
    !(services['docker-stats-exporter']?.volumes || []).some((volume) =>
      /docker\.sock|containerd\.sock|^\/:|^\/var\/run:|^\/sys:|^\/var\/lib\/docker:/.test(
        String(volume),
      ),
    ),
    'Docker stats exporter must not receive a host runtime socket or host metrics filesystem',
  );
  requireValue(
    errors,
    services['docker-stats-exporter']?.environment?.DOCKER_API_URL
      === 'http://docker-metrics-gateway:2375',
    'Docker stats exporter must use the isolated path-gating Docker API component',
  );
  requireValue(
    errors,
    String(services['docker-stats-exporter']?.user || '') === '1000:1000',
    'Docker stats exporter must run as the non-root node image identity',
  );
  requireValue(
    errors,
    Boolean(services['docker-stats-exporter']?.healthcheck),
    'Docker stats exporter must have a collection-aware healthcheck',
  );
  requireValue(
    errors,
    (services['docker-metrics-gateway']?.networks || []).length === 1
      && services['docker-metrics-gateway'].networks.includes(
        'docker_metrics_socket_net',
      ),
    'Docker metrics gateway must be isolated from every general-purpose network',
  );
  requireValue(
    errors,
    String(services['docker-metrics-gateway']?.user || '') === '0:0',
    'Docker metrics gateway must make its trusted root identity explicit',
  );
  requireValue(
    errors,
    services['docker-metrics-gateway']?.environment?.DOCKER_COMPOSE_PROJECT
      === '${COMPOSE_PROJECT_NAME:-menorah}',
    'Docker metrics gateway must scope container discovery to the Compose project',
  );
  const gatewayVolumes = services['docker-metrics-gateway']?.volumes || [];
  requireValue(
    errors,
    gatewayVolumes.includes(
      './monitoring/docker-metrics-gateway.mjs:/app/docker-metrics-gateway.mjs:ro',
    ),
    'Docker metrics gateway must run the reviewed repository allowlist',
  );
  requireValue(
    errors,
    gatewayVolumes.includes('/var/run/docker.sock:/var/run/docker.sock'),
    'Docker metrics gateway must be the sole explicit Docker socket trust boundary',
  );
  requireValue(
    errors,
    Boolean(services['docker-metrics-gateway']?.healthcheck),
    'Docker metrics gateway must have a process healthcheck',
  );
  for (const [serviceName, service] of Object.entries(services)) {
    if (serviceName === 'docker-metrics-gateway') continue;
    requireValue(
      errors,
      !(service?.volumes || []).some((volume) =>
        /docker\.sock|containerd\.sock/.test(String(volume))),
      `${serviceName} must not receive a host runtime socket`,
    );
  }
  requireValue(
    errors,
    String(services['log-collector']?.user || '') === '0:0',
    'Alloy must make its privileged host-log reader identity explicit',
  );
  requireValue(
    errors,
    (services['log-collector']?.volumes || []).includes(
      './logging/config.alloy:/etc/alloy/config.alloy:ro',
    ),
    'Alloy must run the reviewed repository configuration',
  );
  requireValue(
    errors,
    (services['log-collector']?.volumes || []).some((volume) =>
      String(volume).endsWith('/alloy:/var/lib/alloy/data')),
    'Alloy must persist file positions outside its container filesystem',
  );
  requireValue(
    errors,
    (services['log-collector']?.volumes || []).includes(
      '/var/lib/docker/containers:/var/lib/docker/containers:ro',
    ),
    'Alloy must receive only a read-only Docker log-files mount',
  );
  requireValue(
    errors,
    !JSON.stringify(services['log-collector']).includes('docker.sock'),
    'Alloy must not receive the Docker control socket',
  );
  requireValue(
    errors,
    String((services['log-collector']?.command || []).join(' ')).includes(
      '--storage.path=/var/lib/alloy/data',
    ),
    'Alloy must persist its tail positions under the mounted storage path',
  );
  requireValue(
    errors,
    String(services.loki?.user || '') === '10001:10001',
    'Loki must run explicitly as the image non-root identity',
  );
  requireValue(
    errors,
    loki?.limits_config?.retention_period === '720h',
    'Loki local operational-log retention must be 720h',
  );
  requireValue(
    errors,
    loki?.limits_config?.deletion_mode === 'disabled',
    'Loki ad-hoc deletion API must remain disabled',
  );
  requireValue(
    errors,
    loki?.compactor?.retention_enabled === true
      && loki?.compactor?.delete_request_store === 'filesystem',
    'Loki compactor retention and its filesystem delete-request store are required',
  );
  for (const sourceContract of [
    ['local.file_match "caddy"', 'Alloy has no Caddy file source'],
    ['local.file_match "docker"', 'Alloy has no Docker file source'],
    ['stage.docker {}', 'Alloy does not decode Docker json-file framing'],
    ['url = "http://loki:3100/loki/api/v1/push"', 'Alloy has no local Loki writer'],
  ]) {
    requireValue(errors, alloy.includes(sourceContract[0]), sourceContract[1]);
  }
  for (const hostLoggingContract of [
    ["'log-driver': 'json-file'", 'host preparation does not set json-file logging'],
    ["'max-size': '25m'", 'host preparation does not bound Docker log size'],
    ["'max-file': '5'", 'host preparation does not bound Docker log generations'],
    ['dockerd --validate', 'host preparation does not validate Docker daemon config'],
  ]) {
    requireValue(
      errors,
      prepareHost.includes(hostLoggingContract[0]),
      hostLoggingContract[1],
    );
  }
  for (const caddyRotationContract of [
    'roll_size 25MiB',
    'roll_keep 5',
    'roll_keep_for 720h',
  ]) {
    requireValue(
      errors,
      caddy.includes(caddyRotationContract),
      `Caddy access-log rotation is missing ${caddyRotationContract}`,
    );
  }
  requireValue(
    errors,
    String((services['backup-metrics']?.command || []).join(' ')).includes('then exit 1'),
    'backup metric writer must terminate when an export fails',
  );
  requireValue(
    errors,
    String((services['backup-metrics']?.command || []).join(' ')).includes('sleep 30'),
    'backup metric writer must refresh immediate failure state within 30 seconds',
  );

  requireValue(
    errors,
    backupScript.includes('mv -f "${TEMP_FILE}" "${OUTPUT_FILE}"'),
    'backup metric writer is not atomic',
  );
  requireValue(
    errors,
    backupScript.includes('menorah_backup_last_success_timestamp_seconds'),
    'backup metric writer does not expose backup age',
  );
  for (const metricName of [
    'menorah_backup_attempt_metadata_present',
    'menorah_backup_last_attempt_result',
    'menorah_backup_last_attempt_timestamp_seconds',
  ]) {
    requireValue(
      errors,
      backupScript.includes(`# TYPE ${metricName} gauge`),
      `backup metric writer does not declare ${metricName}`,
    );
  }
  requireValue(
    errors,
    backupResultRecorder.includes('mv -f -- "${TEMP_FILE}"'),
    'backup result recorder must publish state atomically',
  );
  requireValue(
    errors,
    backupResultRecorder.includes('chmod 0600 "${TEMP_FILE}"'),
    'backup result recorder must keep execution state operator-only',
  );
  requireValue(
    errors,
    backupNow.includes('"${SCRIPT_DIR}/record-backup-result.sh"'),
    'direct backup execution does not record its final result',
  );
  requireValue(
    errors,
    /ExecStopPost=.*record-backup-result\.sh.*\\\$SERVICE_RESULT.*\\\$EXIT_CODE.*\\\$EXIT_STATUS/.test(
      backupSchedule,
    ),
    'scheduled backup execution does not record systemd failure state',
  );
  requireValue(
    errors,
    prepareHost.includes('"${DEPLOY_STATE_ROOT}/backup-attempts"'),
    'host preparation does not create the bounded backup-attempt state directory',
  );
  if (/(PASSWORD|SECRET|TOKEN)=['"][^'"]+['"]/.test(backupScript)) {
    errors.push('backup metric writer contains a literal credential');
  }

  return errors;
};

export const validateRepositoryMonitoring = () => {
  const documents = loadMonitoringDocuments();
  const errors = validateMonitoringDocuments(documents);
  if (errors.length > 0) {
    throw new Error(`Monitoring validation failed:\n- ${errors.join('\n- ')}`);
  }
  return {
    alerts: collectRules(documents.alerts).length,
    scrapeJobs: documents.prometheus.scrape_configs.length,
    coverageSignals: documents.coverage.signals.length,
  };
};

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  try {
    const result = validateRepositoryMonitoring();
    console.log(
      `Monitoring config valid: ${result.scrapeJobs} scrape jobs, ${result.alerts} alerts, ${result.coverageSignals} signal records.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
