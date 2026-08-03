#!/usr/bin/env node

import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const EXPECTED_PROJECT = 'menorah-local-staging';
export const EXPECTED_ENVIRONMENT_ID = 'menorah-local-staging-v1';
export const SERVER_STAGING_ENVIRONMENT_ID = 'menorah-server-staging-v1';
export const SERVER_STAGING_PROJECTS = Object.freeze([
  'menorah-staging',
  'menorah-server-staging-validation',
]);
export const DEFAULT_PORT = 9101;

const MAX_CONTROL_BYTES = 1024;
const SUPPORTED_IDENTITIES = Object.freeze([
  Object.freeze({
    project: EXPECTED_PROJECT,
    environmentId: EXPECTED_ENVIRONMENT_ID,
  }),
  ...SERVER_STAGING_PROJECTS.map((project) => Object.freeze({
    project,
    environmentId: SERVER_STAGING_ENVIRONMENT_ID,
  })),
]);

const COUNTER_DELTAS = Object.freeze({
  authUser: 25,
  authCounsellor: 15,
  authAdmin: 10,
  http401: 30,
  http403: 15,
  http429: 30,
  http500: 10,
  privilegedRole: 1,
  adminRole: 1,
  paymentProvider: 2,
  paymentWebhook: 2,
  emailDispatch: 5,
  emailDelivery: 2,
  callProvider: 3,
  callMedia: 3,
});

const COUNTER_METRICS = Object.freeze([
  Object.freeze({
    key: 'authUser',
    name: 'menorah_auth_attempts_total',
    labels: {
      service: 'local-alert-fixture',
      subject: 'user',
      method: 'password',
      outcome: 'failure',
    },
  }),
  Object.freeze({
    key: 'authCounsellor',
    name: 'menorah_auth_attempts_total',
    labels: {
      service: 'local-alert-fixture',
      subject: 'counsellor',
      method: 'password',
      outcome: 'failure',
    },
  }),
  Object.freeze({
    key: 'authAdmin',
    name: 'menorah_auth_attempts_total',
    labels: {
      service: 'local-alert-fixture',
      subject: 'admin',
      method: 'mfa',
      outcome: 'failure',
    },
  }),
  Object.freeze({
    key: 'http401',
    name: 'menorah_http_responses_total',
    labels: {
      service: 'local-alert-fixture',
      status: '401',
    },
  }),
  Object.freeze({
    key: 'http403',
    name: 'menorah_http_responses_total',
    labels: {
      service: 'local-alert-fixture',
      status: '403',
    },
  }),
  Object.freeze({
    key: 'http429',
    name: 'menorah_http_responses_total',
    labels: {
      service: 'local-alert-fixture',
      status: '429',
    },
  }),
  Object.freeze({
    key: 'http500',
    name: 'menorah_http_responses_total',
    labels: {
      service: 'local-alert-fixture',
      status: '500',
    },
  }),
  Object.freeze({
    key: 'privilegedRole',
    name: 'menorah_privilege_changes_total',
    labels: {
      service: 'local-alert-fixture',
      category: 'privileged_role',
      outcome: 'success',
    },
  }),
  Object.freeze({
    key: 'adminRole',
    name: 'menorah_privilege_changes_total',
    labels: {
      service: 'local-alert-fixture',
      category: 'admin_role',
      outcome: 'success',
    },
  }),
  Object.freeze({
    key: 'paymentProvider',
    name: 'menorah_payment_operations_total',
    labels: {
      service: 'local-alert-fixture',
      provider: 'synthetic',
      operation: 'payout',
      outcome: 'failure',
    },
  }),
  Object.freeze({
    key: 'paymentWebhook',
    name: 'menorah_payment_webhook_events_total',
    labels: {
      service: 'local-alert-fixture',
      provider: 'synthetic',
      event: 'relationship',
      outcome: 'failure',
    },
  }),
  Object.freeze({
    key: 'emailDispatch',
    name: 'menorah_email_dispatch_total',
    labels: {
      service: 'local-alert-fixture',
      provider: 'synthetic',
      outcome: 'failure',
    },
  }),
  Object.freeze({
    key: 'emailDelivery',
    name: 'menorah_email_delivery_outcomes_total',
    labels: {
      service: 'local-alert-fixture',
      provider: 'synthetic',
      outcome: 'bounced',
    },
  }),
  Object.freeze({
    key: 'callProvider',
    name: 'menorah_call_provider_operations_total',
    labels: {
      service: 'local-alert-fixture',
      provider: 'synthetic',
      operation: 'connect',
      outcome: 'failure',
    },
  }),
  Object.freeze({
    key: 'callMedia',
    name: 'menorah_call_media_outcomes_total',
    labels: {
      service: 'local-alert-fixture',
      provider: 'synthetic',
      media: 'video',
      outcome: 'failure',
    },
  }),
]);

const escapeLabel = (value) => String(value)
  .replaceAll('\\', '\\\\')
  .replaceAll('\n', '\\n')
  .replaceAll('"', '\\"');

const renderLabels = (labels) => (
  Object.entries(labels)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',')
);

const metricLine = (name, labels, value) => (
  `${name}{${renderLabels(labels)}} ${Number(value)}`
);

export const createFixtureState = (
  nowSeconds = Date.now() / 1000,
) => ({
  counters: Object.fromEntries(
    Object.keys(COUNTER_DELTAS).map((key) => [key, 0]),
  ),
  queuePending: 0,
  backupMetadataPresent: 1,
  backupLastAttemptResult: 1,
  backupLastRunTimestampSeconds: Math.floor(nowSeconds),
  exerciseActive: false,
});

export const applyFixtureAction = (
  state,
  action,
  nowSeconds = Date.now() / 1000,
) => {
  if (!state || typeof state !== 'object') {
    throw new TypeError('fixture state is required');
  }
  const observedAt = Math.floor(nowSeconds);
  if (!Number.isFinite(observedAt) || observedAt <= 0) {
    throw new TypeError('fixture timestamp must be a positive finite number');
  }

  switch (action) {
    case 'baseline':
    case 'reset':
      state.queuePending = 0;
      state.backupMetadataPresent = 1;
      state.backupLastAttemptResult = 1;
      state.backupLastRunTimestampSeconds = observedAt;
      state.exerciseActive = false;
      break;
    case 'trigger':
      for (const [key, delta] of Object.entries(COUNTER_DELTAS)) {
        state.counters[key] += delta;
      }
      state.queuePending = 30;
      state.backupMetadataPresent = 1;
      state.backupLastAttemptResult = 0;
      state.backupLastRunTimestampSeconds = observedAt;
      state.exerciseActive = true;
      break;
    case 'backup-failure':
      state.backupMetadataPresent = 1;
      state.backupLastAttemptResult = 0;
      state.backupLastRunTimestampSeconds = observedAt;
      break;
    case 'backup-success':
      state.backupMetadataPresent = 1;
      state.backupLastAttemptResult = 1;
      state.backupLastRunTimestampSeconds = observedAt;
      break;
    default:
      throw new RangeError('unsupported fixture action');
  }
  return state;
};

export const renderMetrics = (state, nowSeconds = Date.now() / 1000) => {
  const lines = [
    '# This endpoint contains synthetic local-staging alert exercise metrics only.',
  ];

  for (const metric of COUNTER_METRICS) {
    lines.push(metricLine(
      metric.name,
      metric.labels,
      state.counters[metric.key],
    ));
  }

  lines.push(
    metricLine(
      'menorah_queue_pending_jobs',
      {
        service: 'local-alert-fixture',
        queue: 'synthetic-p0',
      },
      state.queuePending,
    ),
    metricLine(
      'menorah_queue_oldest_pending_age_seconds',
      {
        service: 'local-alert-fixture',
        queue: 'synthetic-p0',
      },
      0,
    ),
    metricLine(
      'menorah_queue_retry_backlog',
      {
        service: 'local-alert-fixture',
        queue: 'synthetic-p0',
      },
      0,
    ),
    metricLine(
      'menorah_queue_dead_letter_jobs',
      {
        service: 'local-alert-fixture',
        queue: 'synthetic-p0',
      },
      0,
    ),
    metricLine(
      'menorah_worker_heartbeat_timestamp_seconds',
      {
        service: 'local-alert-fixture',
        queue: 'synthetic-p0',
      },
      Math.floor(nowSeconds),
    ),
    metricLine(
      'menorah_backup_attempt_metadata_present',
      {
        backup_type: 'local-synthetic',
      },
      state.backupMetadataPresent,
    ),
    metricLine(
      'menorah_backup_last_attempt_result',
      {
        backup_type: 'local-synthetic',
      },
      state.backupLastAttemptResult,
    ),
    metricLine(
      'menorah_backup_metrics_last_run_timestamp_seconds',
      {
        backup_type: 'local-synthetic',
      },
      state.backupLastRunTimestampSeconds,
    ),
  );

  const rendered = `${lines.join('\n')}\n`;
  if (state.exerciseActive) {
    // Keep event-based range vectors above threshold for the unchanged
    // five-minute `for` rules. The counters remain monotonic; reset merely
    // stops adding synthetic events and lets the original windows expire.
    for (const [key, delta] of Object.entries(COUNTER_DELTAS)) {
      state.counters[key] += delta;
    }
  }
  return rendered;
};

const writeEmpty = (response, statusCode) => {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': '0',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end();
};

const writeText = (response, statusCode, body, contentType) => {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
};

const hasControlHeaders = (request, controlHeaders) => (
  Object.entries(controlHeaders)
    .every(([name, value]) => request.headers[name] === value)
);

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  let received = 0;
  request.on('data', (chunk) => {
    received += chunk.length;
    if (received > MAX_CONTROL_BYTES) {
      reject(new Error('request_too_large'));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (received <= MAX_CONTROL_BYTES) {
      resolve(Buffer.concat(chunks).toString('utf8'));
    }
  });
  request.on('error', reject);
});

const actionFromRequest = async (request) => {
  if (request.url === '/control/baseline') return 'baseline';
  if (request.url === '/control/trigger') return 'trigger';
  if (request.url === '/control/reset') return 'reset';
  if (request.url === '/control/backup') {
    const source = await readBody(request);
    const body = JSON.parse(source);
    if (
      !body
      || typeof body !== 'object'
      || Array.isArray(body)
      || !['failure', 'success'].includes(body.result)
      || Object.keys(body).length !== 1
    ) {
      throw new Error('invalid_backup_result');
    }
    return `backup-${body.result}`;
  }
  return null;
};

export const createAlertFixtureServer = ({
  state = createFixtureState(),
  project = EXPECTED_PROJECT,
  environmentId = EXPECTED_ENVIRONMENT_ID,
} = {}) => {
  if (!SUPPORTED_IDENTITIES.some((identity) => (
    identity.project === project
    && identity.environmentId === environmentId
  ))) {
    throw new Error('Alert fixture refused invalid isolated identity');
  }
  const controlHeaders = Object.freeze({
    'x-menorah-compose-project': project,
    'x-menorah-environment-id': environmentId,
  });

  return http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    writeText(response, 200, 'ok\n', 'text/plain; charset=utf-8');
    return;
  }
  if (request.method === 'GET' && request.url === '/metrics') {
    writeText(
      response,
      200,
      renderMetrics(state),
      'text/plain; version=0.0.4; charset=utf-8',
    );
    return;
  }
  if (
    request.method !== 'POST'
    || !request.url?.startsWith('/control/')
  ) {
    writeEmpty(response, 404);
    return;
  }
  if (!hasControlHeaders(request, controlHeaders)) {
    writeEmpty(response, 403);
    return;
  }

  try {
    const action = await actionFromRequest(request);
    if (!action) {
      writeEmpty(response, 404);
      return;
    }
    applyFixtureAction(state, action);
    writeEmpty(response, 204);
  } catch {
    writeEmpty(response, 400);
  }
  });
};

const isMain = (
  process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url
);

if (isMain) {
  const port = Number.parseInt(
    process.env.ALERT_FIXTURE_PORT || String(DEFAULT_PORT),
    10,
  );
  const localEnvironmentId =
    process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID;
  const serverEnvironmentId =
    process.env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID;
  if (
    !Number.isInteger(port)
    || port !== DEFAULT_PORT
    || Boolean(localEnvironmentId) === Boolean(serverEnvironmentId)
  ) {
    process.stderr.write('Local alert fixture refused invalid identity\n');
    process.exit(1);
  }

  try {
    createAlertFixtureServer({
      project: process.env.COMPOSE_PROJECT_NAME,
      environmentId: localEnvironmentId || serverEnvironmentId,
    }).listen(port, '0.0.0.0');
  } catch {
    process.stderr.write('Local alert fixture refused invalid identity\n');
    process.exit(1);
  }
}
