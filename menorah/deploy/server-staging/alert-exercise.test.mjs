import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION,
  SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY,
  SERVER_STAGING_VALIDATION_PROJECT,
  executeControlAction,
  resolveControlIdentity,
} from '../local-staging/alert-fixture/control.mjs';
import {
  ALERTMANAGER_URL,
  ALERT_SPECS,
  EXPECTED_ACTIVE_TARGET_COUNT,
  EXPECTED_TARGETS_BY_JOB,
  FRONTEND_SERVICES,
  PROMETHEUS_URL,
  activeTargetsAreHealthy,
  buildEvidence,
  composeArguments,
  findExpectedAlerts,
  monitoringBaselineIsExact,
} from './exercise-p0-alerts.mjs';

const exerciseSource = readFileSync(
  new URL('./exercise-p0-alerts.mjs', import.meta.url),
  'utf8',
);
const composeSource = readFileSync(
  new URL('./compose.yml', import.meta.url),
  'utf8',
);
const rulesSource = readFileSync(
  new URL('../monitoring/alert-rules.yml', import.meta.url),
  'utf8',
);

const exactAlerts = ({
  serverScope = false,
  state = 'firing',
} = {}) => ALERT_SPECS.map((spec) => ({
  annotations: {
    runbook_url: spec.runbook,
  },
  labels: {
    alertname: spec.alertName,
    ...spec.labels,
    ...(serverScope ? {
      compose_project: SERVER_STAGING_VALIDATION_PROJECT,
      environment: 'staging',
      monitoring_scope: 'server-staging',
      stack: 'menorah-staging',
    } : {}),
  },
  state,
}));

test('server exercise covers the exact 20 P0 alerts and original runbooks', () => {
  assert.equal(ALERT_SPECS.length, 20);
  assert.equal(
    new Set(ALERT_SPECS.map(({ alertName }) => alertName)).size,
    20,
  );
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
  for (const { alertName, runbook } of ALERT_SPECS) {
    assert.match(rulesSource, new RegExp(`alert: ${alertName}\\r?$`, 'm'));
    assert.equal(runbook.endsWith(`#${alertName.toLowerCase()}`), true);
  }
});

test('matching requires one exact alert and exact Alertmanager scope', () => {
  const prometheus = exactAlerts();
  const alertmanager = exactAlerts({ serverScope: true });

  assert.equal(
    findExpectedAlerts(prometheus, { state: 'firing' }).size,
    20,
  );
  assert.equal(
    findExpectedAlerts(alertmanager, {
      requireServerScope: true,
    }).size,
    20,
  );

  const duplicated = [...prometheus, prometheus[0]];
  assert.equal(
    findExpectedAlerts(duplicated, { state: 'firing' }).size,
    19,
  );

  const wrongScope = structuredClone(alertmanager);
  wrongScope[4].labels.monitoring_scope = 'local-staging';
  assert.equal(
    findExpectedAlerts(wrongScope, {
      requireServerScope: true,
    }).size,
    19,
  );
  const wrongProject = structuredClone(alertmanager);
  wrongProject[6].labels.compose_project = 'menorah-staging';
  assert.equal(
    findExpectedAlerts(wrongProject, {
      requireServerScope: true,
    }).size,
    19,
  );
  assert.equal(
    findExpectedAlerts(prometheus, { state: 'pending' }).size,
    0,
  );
});

test('quiet baseline rejects one or duplicate expected alerts', () => {
  const alert = exactAlerts()[0];
  const scoped = exactAlerts({ serverScope: true })[0];
  assert.equal(monitoringBaselineIsExact([], []), true);
  assert.equal(monitoringBaselineIsExact([alert], []), false);
  assert.equal(monitoringBaselineIsExact([alert, alert], []), false);
  assert.equal(monitoringBaselineIsExact([], [scoped]), false);
  assert.equal(monitoringBaselineIsExact([], [{
    ...scoped,
    labels: {
      ...scoped.labels,
      monitoring_scope: 'unrelated',
    },
  }]), true);
});

test('target health requires the exact 35-target server inventory', () => {
  const activeTargets = Object.entries(EXPECTED_TARGETS_BY_JOB)
    .flatMap(([job, count]) => Array.from(
      { length: count },
      (_, index) => ({
        health: 'up',
        labels: {
          environment: 'staging',
          instance: `${job}-${index}`,
          job,
          monitoring_scope: 'server-staging',
        },
      }),
    ));
  const healthy = {
    data: { activeTargets },
    status: 'success',
  };

  assert.equal(EXPECTED_ACTIVE_TARGET_COUNT, 35);
  assert.equal(activeTargetsAreHealthy(healthy), true);
  assert.equal(activeTargetsAreHealthy({
    ...healthy,
    data: { activeTargets: activeTargets.slice(1) },
  }), false);
  assert.equal(activeTargetsAreHealthy({
    ...healthy,
    data: {
      activeTargets: activeTargets.map((target, index) => (
        index === 2 ? { ...target, health: 'down' } : target
      )),
    },
  }), false);
  assert.equal(activeTargetsAreHealthy({
    ...healthy,
    data: {
      activeTargets: activeTargets.map((target, index) => (
        index === 3
          ? {
            ...target,
            labels: {
              ...target.labels,
              monitoring_scope: 'wrong',
            },
          }
          : target
      )),
    },
  }), false);
});

test('server control identity is validation-only and confirmation-gated', () => {
  assert.deepEqual(resolveControlIdentity({
    COMPOSE_PROJECT_NAME: 'menorah-local-staging',
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: 'menorah-local-staging-v1',
  }), {
    environmentId: 'menorah-local-staging-v1',
    project: 'menorah-local-staging',
  });

  const exactServer = {
    COMPOSE_PROJECT_NAME: SERVER_STAGING_VALIDATION_PROJECT,
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: '',
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID: 'menorah-server-staging-v1',
    [SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY]:
      SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION,
  };
  assert.deepEqual(resolveControlIdentity(exactServer), {
    environmentId: 'menorah-server-staging-v1',
    project: SERVER_STAGING_VALIDATION_PROJECT,
  });
  assert.equal(resolveControlIdentity({
    ...exactServer,
    COMPOSE_PROJECT_NAME: 'menorah-staging',
  }), null);
  assert.equal(resolveControlIdentity({
    ...exactServer,
    [SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY]: '',
  }), null);
  assert.equal(resolveControlIdentity({
    ...exactServer,
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: 'menorah-local-staging-v1',
  }), null);
});

test('server fixture control sends only exact identity headers', async () => {
  const calls = [];
  await executeControlAction('trigger', {
    environment: {
      COMPOSE_PROJECT_NAME: SERVER_STAGING_VALIDATION_PROJECT,
      MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: '',
      MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
        'menorah-server-staging-v1',
      [SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY]:
        SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION,
    },
    fetchImplementation: async (...args) => {
      calls.push(args);
      return { status: 204 };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'http://127.0.0.1:9101/control/trigger');
  assert.deepEqual(calls[0][1], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Menorah-Compose-Project':
        'menorah-server-staging-validation',
      'X-Menorah-Environment-Id': 'menorah-server-staging-v1',
    },
    body: '',
  });
});

test('server Compose clears the image local identity and exposes no fixture port', () => {
  const fixture = composeSource.match(
    /\n  staging-alert-fixture:[\s\S]*?(?=\n  staging-alertmanager:)/,
  )?.[0] || '';
  assert.match(
    fixture,
    /MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: ""/,
  );
  assert.match(
    fixture,
    /MENORAH_SERVER_STAGING_ENVIRONMENT_ID:/,
  );
  assert.match(
    fixture,
    /COMPOSE_PROJECT_NAME: "\$\{MENORAH_SERVER_STAGING_PROJECT_NAME/,
  );
  assert.doesNotMatch(fixture, /\n\s+ports:/);
});

test('runner is pinned to validation project, loopback APIs, and frontends', () => {
  assert.equal(PROMETHEUS_URL, 'http://127.0.0.1:39090');
  assert.equal(ALERTMANAGER_URL, 'http://127.0.0.1:39093');
  assert.deepEqual(FRONTEND_SERVICES, [
    'staging-user-web-app',
    'staging-admin-panel',
    'staging-web-app',
  ]);

  const args = composeArguments('ps');
  assert.deepEqual(args.slice(0, 4), [
    'compose',
    '-p',
    'menorah-server-staging-validation',
    '--env-file',
  ]);
  assert.equal(args.at(-1), 'ps');
  assert.equal(
    args.includes('menorah-local-staging'),
    false,
  );
  assert.match(
    exerciseSource,
    /process\.env\.COMPOSE_PROJECT_NAME\s*\n\s*!== SERVER_STAGING_VALIDATION_PROJECT/,
  );
  assert.doesNotMatch(
    exerciseSource,
    /environment\.COMPOSE_PROJECT_NAME/,
  );
  assert.match(
    exerciseSource,
    /runCompose\('stop', '--timeout', '30', \.\.\.FRONTEND_SERVICES\)/,
  );
  assert.match(
    exerciseSource,
    /runCompose\('start', \.\.\.FRONTEND_SERVICES\)/,
  );
  assert.match(exerciseSource, /finally \{/);
  assert.match(exerciseSource, /await cleanupExercise\(\)/);
  assert.doesNotMatch(
    exerciseSource,
    /docker\s+(?:kill|rm|system\s+prune)|docker\.sock|\/opt\/menorah\b|\/srv\/menorah\b/i,
  );
});

test('evidence is bounded to non-secret status and timestamps', () => {
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
    assert.equal(
      record.status.evidenceKind,
      'server_staging_validation_synthetic_fixture',
    );
    assert.equal(
      record.status.project,
      'menorah-server-staging-validation',
    );
    assert.doesNotMatch(
      JSON.stringify(record),
      /password|token|credential|authorization|payload|description|summary/i,
    );
  }
});
