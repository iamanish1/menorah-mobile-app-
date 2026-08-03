import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_ENVIRONMENT_ID,
  EXPECTED_PROJECT,
  SERVER_STAGING_ENVIRONMENT_ID,
  SERVER_STAGING_PROJECTS,
  applyFixtureAction,
  createAlertFixtureServer,
  createFixtureState,
  renderMetrics,
} from './server.mjs';

const listen = async (server) => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
};

const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

test('trigger crosses every metric-backed P0 threshold without real data', () => {
  const state = createFixtureState(1_700_000_000);
  applyFixtureAction(state, 'trigger', 1_700_000_001);
  const metrics = renderMetrics(state, 1_700_000_000);

  for (const expected of [
    'menorah_queue_pending_jobs{service="local-alert-fixture",queue="synthetic-p0"} 30',
    'menorah_backup_last_attempt_result{backup_type="local-synthetic"} 0',
    'menorah_backup_metrics_last_run_timestamp_seconds{backup_type="local-synthetic"} 1700000001',
    'menorah_auth_attempts_total{service="local-alert-fixture",subject="user",method="password",outcome="failure"} 25',
    'menorah_auth_attempts_total{service="local-alert-fixture",subject="counsellor",method="password",outcome="failure"} 15',
    'menorah_auth_attempts_total{service="local-alert-fixture",subject="admin",method="mfa",outcome="failure"} 10',
    'menorah_http_responses_total{service="local-alert-fixture",status="401"} 30',
    'menorah_http_responses_total{service="local-alert-fixture",status="403"} 15',
    'menorah_http_responses_total{service="local-alert-fixture",status="429"} 30',
    'menorah_http_responses_total{service="local-alert-fixture",status="500"} 10',
    'menorah_privilege_changes_total{service="local-alert-fixture",category="privileged_role",outcome="success"} 1',
    'menorah_privilege_changes_total{service="local-alert-fixture",category="admin_role",outcome="success"} 1',
    'menorah_payment_operations_total{service="local-alert-fixture",provider="synthetic",operation="payout",outcome="failure"} 2',
    'menorah_payment_webhook_events_total{service="local-alert-fixture",provider="synthetic",event="relationship",outcome="failure"} 2',
    'menorah_email_dispatch_total{service="local-alert-fixture",provider="synthetic",outcome="failure"} 5',
    'menorah_email_delivery_outcomes_total{service="local-alert-fixture",provider="synthetic",outcome="bounced"} 2',
    'menorah_call_provider_operations_total{service="local-alert-fixture",provider="synthetic",operation="connect",outcome="failure"} 3',
    'menorah_call_media_outcomes_total{service="local-alert-fixture",provider="synthetic",media="video",outcome="failure"} 3',
  ]) {
    assert.match(metrics, new RegExp(
      expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ));
  }
  assert.doesNotMatch(metrics, /menorah\.me|mentle\.org|@/i);
});

test('reset clears gauges without resetting monotonic counters', () => {
  const state = createFixtureState(1_700_000_000);
  applyFixtureAction(state, 'trigger', 1_700_000_001);
  applyFixtureAction(state, 'reset', 1_700_000_002);

  assert.equal(state.queuePending, 0);
  assert.equal(state.backupLastAttemptResult, 1);
  assert.equal(state.backupLastRunTimestampSeconds, 1_700_000_002);
  assert.equal(state.counters.http500, 10);
  assert.equal(state.counters.authUser, 25);
});

test('active scrapes sustain range-vector signals until reset', () => {
  const state = createFixtureState();
  applyFixtureAction(state, 'trigger');
  const first = renderMetrics(state);
  const second = renderMetrics(state);
  assert.match(
    first,
    /menorah_http_responses_total\{service="local-alert-fixture",status="429"\} 30/,
  );
  assert.match(
    second,
    /menorah_http_responses_total\{service="local-alert-fixture",status="429"\} 60/,
  );

  applyFixtureAction(state, 'reset');
  const counterAtReset = state.counters.http429;
  renderMetrics(state);
  renderMetrics(state);
  assert.equal(state.counters.http429, counterAtReset);
});

test('backup result control is independent and deterministic', () => {
  const state = createFixtureState(1_700_000_000);
  applyFixtureAction(state, 'backup-failure', 1_700_000_010);
  assert.equal(state.backupLastAttemptResult, 0);
  assert.equal(state.backupLastRunTimestampSeconds, 1_700_000_010);
  applyFixtureAction(state, 'backup-success', 1_700_000_020);
  assert.equal(state.backupLastAttemptResult, 1);
  assert.equal(state.backupLastRunTimestampSeconds, 1_700_000_020);
  assert.throws(
    () => applyFixtureAction(state, 'production'),
    /unsupported fixture action/,
  );
});

test('control endpoints require exact local identity and log no bodies', async () => {
  const server = createAlertFixtureServer();
  const baseUrl = await listen(server);
  try {
    const rejected = await fetch(`${baseUrl}/control/trigger`, {
      method: 'POST',
    });
    assert.equal(rejected.status, 403);

    const accepted = await fetch(`${baseUrl}/control/trigger`, {
      method: 'POST',
      headers: {
        'X-Menorah-Compose-Project': EXPECTED_PROJECT,
        'X-Menorah-Environment-Id': EXPECTED_ENVIRONMENT_ID,
      },
    });
    assert.equal(accepted.status, 204);

    const metrics = await (await fetch(`${baseUrl}/metrics`)).text();
    assert.match(metrics, /local-alert-fixture/);
  } finally {
    await close(server);
  }
});

test('server-staging controls accept only exact default or validation identities', async () => {
  for (const project of SERVER_STAGING_PROJECTS) {
    const server = createAlertFixtureServer({
      project,
      environmentId: SERVER_STAGING_ENVIRONMENT_ID,
    });
    const baseUrl = await listen(server);
    try {
      const accepted = await fetch(`${baseUrl}/control/trigger`, {
        method: 'POST',
        headers: {
          'X-Menorah-Compose-Project': project,
          'X-Menorah-Environment-Id': SERVER_STAGING_ENVIRONMENT_ID,
        },
      });
      assert.equal(accepted.status, 204);

      const crossedPair = await fetch(`${baseUrl}/control/reset`, {
        method: 'POST',
        headers: {
          'X-Menorah-Compose-Project': EXPECTED_PROJECT,
          'X-Menorah-Environment-Id': EXPECTED_ENVIRONMENT_ID,
        },
      });
      assert.equal(crossedPair.status, 403);
    } finally {
      await close(server);
    }
  }

  for (const options of [
    {
      project: 'menorah-arbitrary-staging',
      environmentId: SERVER_STAGING_ENVIRONMENT_ID,
    },
    {
      project: SERVER_STAGING_PROJECTS[0],
      environmentId: EXPECTED_ENVIRONMENT_ID,
    },
    {
      project: EXPECTED_PROJECT,
      environmentId: SERVER_STAGING_ENVIRONMENT_ID,
    },
  ]) {
    assert.throws(
      () => createAlertFixtureServer(options),
      /refused invalid isolated identity/,
    );
  }
});

test('backup endpoint accepts only the bounded result schema', async () => {
  const server = createAlertFixtureServer();
  const baseUrl = await listen(server);
  const headers = {
    'Content-Type': 'application/json',
    'X-Menorah-Compose-Project': EXPECTED_PROJECT,
    'X-Menorah-Environment-Id': EXPECTED_ENVIRONMENT_ID,
  };
  try {
    const accepted = await fetch(`${baseUrl}/control/backup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: 'failure' }),
    });
    assert.equal(accepted.status, 204);
    assert.match(
      await (await fetch(`${baseUrl}/metrics`)).text(),
      /menorah_backup_last_attempt_result\{backup_type="local-synthetic"\} 0/,
    );

    const rejected = await fetch(`${baseUrl}/control/backup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: 'failure', detail: 'not accepted' }),
    });
    assert.equal(rejected.status, 400);
  } finally {
    await close(server);
  }
});
