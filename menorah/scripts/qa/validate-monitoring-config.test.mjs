import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadMonitoringDocuments,
  validateMonitoringDocuments,
} from './validate-monitoring-config.mjs';

const cloneDocuments = () => structuredClone(loadMonitoringDocuments());

test('repository monitoring configuration is internally consistent', () => {
  assert.deepEqual(validateMonitoringDocuments(cloneDocuments()), []);
});

test('rejects scraping a JSON health endpoint as Prometheus metrics', () => {
  const documents = cloneDocuments();
  documents.prometheus.scrape_configs.push({
    job_name: 'invalid-json-scrape',
    metrics_path: '/health/ready',
    static_configs: [{ targets: ['api-web:8080'] }],
  });

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /scrapes JSON health path/,
  );
});

test('rejects an alert without an explicit owner', () => {
  const documents = cloneDocuments();
  delete documents.alerts.groups[0].rules[0].labels.owner;

  assert.match(validateMonitoringDocuments(documents).join('\n'), /missing owner/);
});

test('rejects fake alert coverage for an unavailable signal', () => {
  const documents = cloneDocuments();
  const queueSignal = documents.coverage.signals.find(
    (signal) => signal.id === 'queue-backlog',
  );
  queueSignal.alerts = ['WorkerReadinessProbeFailed'];

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /queue-backlog is unavailable but claims alert coverage/,
  );
});

test('rejects overlapping product frontend probe rules', () => {
  const documents = cloneDocuments();
  const rule = documents.alerts.groups
    .flatMap((group) => group.rules)
    .find((candidate) => candidate.alert === 'UserFrontendProbeFailed');
  rule.expr = 'probe_success{job="blackbox-http-internal",component="frontend"} == 0';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /UserFrontendProbeFailed must select only the user-web-app probe/,
  );
});

test('rejects a backup failure alert without the immediate result metric', () => {
  const documents = cloneDocuments();
  const rule = documents.alerts.groups
    .flatMap((group) => group.rules)
    .find((candidate) => candidate.alert === 'BackupJobFailed');
  rule.expr = 'menorah_backup_metadata_present{backup_type="daily"} == 0';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /must alert only on a validated latest-attempt failure/,
  );
});

test('rejects backup execution state mounted read-write', () => {
  const documents = cloneDocuments();
  documents.compose.services['backup-metrics'].volumes =
    documents.compose.services['backup-metrics'].volumes.map((volume) =>
      String(volume).replace('/backup-attempts:/backup-attempts:ro', '/backup-attempts:/backup-attempts'),
    );

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /does not mount latest-attempt state read-only/,
  );
});

test('rejects a mutable monitoring image reference', () => {
  const documents = cloneDocuments();
  documents.compose.services['blackbox-exporter'].image =
    'prom/blackbox-exporter:v0.28.0';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /blackbox-exporter image is not pinned/,
  );
});

test('rejects replacing the constrained exporter with cAdvisor', () => {
  const documents = cloneDocuments();
  documents.compose.services['docker-stats-exporter'].image =
    'gcr.io/cadvisor/cadvisor:v0.49.1@sha256:3cde6faf0791ebf7b41d6f8ae7145466fed712ea6f252c935294d2608b1af388';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /docker-stats-exporter image does not match the registry-verified monitoring image lock/,
  );
});

test('rejects a runtime socket mounted into the Docker stats exporter', () => {
  const documents = cloneDocuments();
  documents.compose.services['docker-stats-exporter'].volumes.push(
    '/run/containerd/containerd.sock:/run/containerd/containerd.sock:ro',
  );

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /must not receive a host runtime socket/,
  );
});

test('rejects a general Docker proxy in place of the reviewed path gateway', () => {
  const documents = cloneDocuments();
  documents.compose.services['docker-metrics-gateway'].image =
    'ghcr.io/tecnativa/docker-socket-proxy:v0.4.2@sha256:1f3a6f303320723d199d2316a3e82b2e2685d86c275d5e3deeaf182573b47476';
  documents.compose.services['docker-metrics-gateway'].volumes = [
    '/var/run/docker.sock:/var/run/docker.sock:ro',
  ];

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /docker-metrics-gateway image does not match|reviewed repository allowlist/,
  );
});

test('rejects container alert and exporter metric-name drift', () => {
  const documents = cloneDocuments();
  const memoryRule = documents.alerts.groups
    .flatMap((group) => group.rules)
    .find((rule) => rule.alert === 'ContainerMemoryNearLimit');
  memoryRule.expr = String(memoryRule.expr).replace(
    /menorah_container_memory_limit_bytes/g,
    'menorah_container_spec_memory_limit_bytes',
  );

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /references container metric not emitted by the exporter/,
  );
});

test('rejects treating the restart counter as an untyped gauge expression', () => {
  const documents = cloneDocuments();
  const restartRule = documents.alerts.groups
    .flatMap((group) => group.rules)
    .find((rule) => rule.alert === 'ContainerRestartLoop');
  restartRule.expr = 'menorah_container_restarts_total > 2';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /must use increase\(\) over the monotonic restart counter/,
  );
});

test('rejects an eight-day restore-test alert window', () => {
  const documents = cloneDocuments();
  const restoreRule = documents.alerts.groups
    .flatMap((group) => group.rules)
    .find((rule) => rule.alert === 'RestoreTestTooOld');
  restoreRule.expr = String(restoreRule.expr).replace('86400', '691200');

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /RestoreTestTooOld must use the schedule-aligned 86400-second age limit/,
  );
});

test('rejects direct thresholding of an audit-sink counter', () => {
  const documents = cloneDocuments();
  const integrityRule = documents.alerts.groups
    .flatMap((group) => group.rules)
    .find((rule) => rule.alert === 'SecurityAuditEvidenceIntegrityFailure');
  integrityRule.expr =
    'menorah_security_audit_sink_failures_total{reason="queue_overflow"} > 0';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /uses an audit-sink counter without increase\(\)/,
  );
});

test('rejects disabled Loki retention', () => {
  const documents = cloneDocuments();
  documents.loki.compactor.retention_enabled = false;
  documents.loki.limits_config.retention_period = '0s';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /Loki local operational-log retention must be 720h|Loki compactor retention/,
  );
});

test('rejects replacing Alloy with end-of-life Promtail', () => {
  const documents = cloneDocuments();
  documents.compose.services['log-collector'].image =
    'grafana/promtail:3.2.1@sha256:bf617e9d67e80247a59f717f9c1ad388d7d32dc0a1d29abd5799516d15e0a9b5';

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /log-collector image does not match the registry-verified monitoring image lock/,
  );
});

test('rejects an impossible shell runner image for backup metrics', () => {
  const documents = cloneDocuments();
  documents.compose.services['backup-metrics'].image =
    documents.compose.services['node-exporter'].image;

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /backup-metrics image does not match the registry-verified monitoring image lock/,
  );
});

test('rejects a MongoDB bootstrap without the least-privilege monitoring roles', () => {
  const documents = cloneDocuments();
  documents.mongoUsers = documents.mongoUsers.replace(
    "{ role: 'read', db: 'local' }",
    "{ role: 'readAnyDatabase', db: 'admin' }",
  );

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /MongoDB bootstrap is missing monitoring control/,
  );
});

test('rejects a MongoDB service that cannot bootstrap the monitoring identity', () => {
  const documents = cloneDocuments();
  delete documents.compose.services['mongo-primary'].environment.MONGO_MONITOR_USER;

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /MongoDB bootstrap does not receive the dedicated monitoring username/,
  );
});

test('rejects a committed Alertmanager destination', () => {
  const documents = cloneDocuments();
  documents.alertmanager.receivers[0].webhook_configs = [
    { url: 'https://example.invalid/hook' },
  ];

  assert.match(
    validateMonitoringDocuments(documents).join('\n'),
    /must not contain destinations/,
  );
});
