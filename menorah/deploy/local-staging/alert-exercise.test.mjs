import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ALERT_SPECS,
  buildEvidence,
  findExpectedAlerts,
} from './exercise-p0-alerts.mjs';

const exerciseSource = readFileSync(
  new URL('./exercise-p0-alerts.mjs', import.meta.url),
  'utf8',
);
const rulesSource = readFileSync(
  new URL('../monitoring/alert-rules.yml', import.meta.url),
  'utf8',
);
const composeSource = readFileSync(
  new URL('./compose.yml', import.meta.url),
  'utf8',
);
const prometheusSource = readFileSync(
  new URL('./prometheus.yml', import.meta.url),
  'utf8',
);
const backupSource = readFileSync(
  new URL('./backup-local.sh', import.meta.url),
  'utf8',
);
const backupDockerfileSource = readFileSync(
  new URL('./Dockerfile.local-backup', import.meta.url),
  'utf8',
);

test('exercise covers the exact requested 20 alert names', () => {
  assert.deepEqual(
    ALERT_SPECS.map(({ alertName }) => alertName),
    [
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
    ],
  );
  assert.equal(new Set(ALERT_SPECS.map(({ alertName }) => alertName)).size, 20);
  for (const { alertName, runbook } of ALERT_SPECS) {
    assert.match(rulesSource, new RegExp(`alert: ${alertName}\\r?$`, 'm'));
    assert.match(rulesSource, new RegExp(
      `monitoring-alert-runbook\\.md#${alertName.toLowerCase()}`,
    ));
    assert.equal(runbook.endsWith(`#${alertName.toLowerCase()}`), true);
  }
});

test('matching requires synthetic labels and the requested state', () => {
  const alerts = ALERT_SPECS.map((spec) => ({
    labels: {
      alertname: spec.alertName,
      ...spec.labels,
    },
    annotations: {
      runbook_url: spec.runbook,
    },
    state: 'firing',
  }));
  alerts.push({
    labels: {
      alertname: 'ElevatedHttp500Rate',
      service: 'unrelated',
    },
    state: 'firing',
  });

  assert.equal(findExpectedAlerts(alerts, 'firing').size, 20);
  assert.equal(findExpectedAlerts(alerts, 'pending').size, 0);
  assert.equal(
    findExpectedAlerts(alerts.slice(1), 'firing').has(
      'WorkerQueueBacklogHigh',
    ),
    false,
  );
});

test('evidence contains only alert name, status, timestamps and runbook', () => {
  const timestamps = {
    triggeredAt: '2026-01-01T00:00:00.000Z',
    prometheusFiringObservedAt: '2026-01-01T00:06:00.000Z',
    alertmanagerFiringObservedAt: '2026-01-01T00:06:05.000Z',
    resetAt: '2026-01-01T00:06:06.000Z',
    prometheusResolvedObservedAt: '2026-01-01T00:17:00.000Z',
    alertmanagerResolvedObservedAt: '2026-01-01T00:17:05.000Z',
  };
  const evidence = buildEvidence(timestamps);

  assert.equal(evidence.length, 20);
  for (const record of evidence) {
    assert.deepEqual(
      Object.keys(record).sort(),
      ['alertName', 'runbook', 'status', 'timestamps'],
    );
    assert.deepEqual(record.timestamps, timestamps);
    assert.equal(record.status.evidenceKind, 'local_synthetic_fixture');
    assert.equal(record.status.prometheus, 'firing_then_resolved');
    assert.equal(record.status.alertmanager, 'firing_then_resolved');
    assert.doesNotMatch(JSON.stringify(record), /description|summary|secret/i);
  }
});

test('runner preserves rule durations and targets only exact local services', () => {
  assert.doesNotMatch(exerciseSource, /alert-rules\.yml.*write|duration.*replace/i);
  assert.match(
    exerciseSource,
    /runCompose\('stop', '--timeout', '30', \.\.\.FRONTEND_SERVICES\)/,
  );
  assert.match(
    exerciseSource,
    /runCompose\('start', \.\.\.FRONTEND_SERVICES\)/,
  );
  assert.doesNotMatch(
    exerciseSource,
    /docker\s+(?:kill|rm|system\s+prune)|docker\.sock|menorah\.me|mentle\.org/i,
  );
  assert.match(exerciseSource, /14 \* 60 \* 1000/);
  assert.match(exerciseSource, /8 \* 60 \* 1000/);
});

test('all original rule for-durations remain unchanged', () => {
  const expectedDurations = new Map([
    ['WorkerQueueBacklogHigh', '5m'],
    ['BackupJobFailed', '0m'],
    ['PaymentProviderFailure', '2m'],
    ['PaymentWebhookFailure', '1m'],
    ['EmailDispatchFailed', '2m'],
    ['EmailDeliveryOutcomeFailed', '1m'],
    ['CallProviderFailure', '2m'],
    ['CallMediaFailure', '2m'],
    ['PrivilegedRoleChanged', '0m'],
    ['AdminRoleChanged', '0m'],
    ['UserAuthenticationFailureSpike', '2m'],
    ['CounsellorAuthenticationFailureSpike', '2m'],
    ['AdminAuthenticationMfaFailureSpike', '1m'],
    ['ElevatedHttp401Rate', '2m'],
    ['ElevatedHttp403Rate', '2m'],
    ['ElevatedHttp429Rate', '5m'],
    ['ElevatedHttp500Rate', '2m'],
    ['UserFrontendProbeFailed', '3m'],
    ['AdminFrontendProbeFailed', '3m'],
    ['CounsellorFrontendProbeFailed', '3m'],
  ]);
  for (const [alertName, duration] of expectedDurations) {
    assert.match(
      rulesSource,
      new RegExp(
        `alert: ${alertName}[\\s\\S]{1,1000}?\\n\\s*for: ${duration}\\r?\\n`,
      ),
      alertName,
    );
  }
});

test('Prometheus scrapes only the internal unexposed alert fixture', () => {
  assert.match(
    prometheusSource,
    /job_name: local-alert-fixture[\s\S]*?metrics_path: \/metrics[\s\S]*?- alert-fixture:9101/,
  );
  assert.doesNotMatch(
    prometheusSource,
    /menorah\.me|mentle\.org|host\.docker\.internal|docker\.sock/i,
  );
  assert.match(
    composeSource,
    /alert-fixture:[\s\S]*?networks:\r?\n\s+- monitoring[\s\S]*?healthcheck:/,
  );
  assert.doesNotMatch(
    composeSource.match(
      /\n  alert-fixture:[\s\S]*?(?=\n  alertmanager:)/,
    )?.[0] || '',
    /\n\s+ports:/,
  );
  assert.match(
    composeSource,
    /prometheus:[\s\S]*?depends_on:[\s\S]*?alert-fixture:[\s\S]*?condition: service_healthy/,
  );
});

test('runner fails fast unless Prometheus can reach Alertmanager privately', () => {
  assert.equal(
    (prometheusSource.match(/private-alertmanager:9093/g) || []).length,
    2,
  );
  assert.doesNotMatch(prometheusSource, /(?:^|\s)- alertmanager:9093\b/m);
  assert.match(
    composeSource,
    /alertmanager:[\s\S]*?monitoring:\r?\n\s+aliases:\r?\n\s+- private-alertmanager\b/,
  );
  assert.match(
    exerciseSource,
    /'up\{job="alertmanager"\} == 1'/,
  );
  assert.match(
    exerciseSource,
    /Promise\.all\(\[\s*waitForFixtureScrape\(\),\s*waitForAlertmanagerScrape\(\),\s*\]\)/,
  );
});

test('backup telemetry is exact, best-effort, and never logs a body', () => {
  assert.match(
    backupSource,
    /EXPECTED_BACKUP_METRICS_URL='http:\/\/alert-fixture:9101\/control\/backup'/,
  );
  assert.match(backupSource, /backup_exit_handler\(\)/);
  assert.match(backupSource, /report_backup_result success/);
  assert.match(backupSource, /report_backup_result failure/);
  assert.match(
    backupSource,
    /--post-data="\{\\"result\\":\\"\$\{backup_result\}\\"\}"[\s\S]*?\|\| :/,
  );
  assert.match(backupDockerfileSource, /\n\s+wget \\\r?\n/);
  assert.doesNotMatch(
    composeSource,
    /process\.stdout\.write\(`local-alert|Buffer\.concat\(chunks\)/,
  );
});
