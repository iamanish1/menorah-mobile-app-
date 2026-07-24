#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';

import {
  EXPECTED_ENVIRONMENT_ID,
  EXPECTED_PROJECT,
  parseEnvironmentFile,
  runIsolationValidation,
} from './validate-isolation.mjs';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = path.join(MODULE_DIRECTORY, 'compose.yml');
const ENVIRONMENT_FILE = path.join(
  MODULE_DIRECTORY,
  'generated',
  'local-staging.env',
);
const GENERATED_DIRECTORY = path.join(MODULE_DIRECTORY, 'generated');
const DEFAULT_EVIDENCE_FILE = path.join(
  GENERATED_DIRECTORY,
  'p0-alert-exercise-evidence.json',
);
const PROMETHEUS_URL = 'http://127.0.0.1:29090';
const ALERTMANAGER_URL = 'http://127.0.0.1:29093';
const RUNBOOK_BASE =
  'https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/blob/'
  + 'release/final-production-readiness/menorah/docs/'
  + 'monitoring-alert-runbook.md#';

const FRONTEND_SERVICES = Object.freeze([
  'user-web-app',
  'admin-panel',
  'web-app',
]);
const REQUIRED_HEALTHY_SERVICES = Object.freeze([
  'alert-fixture',
  'alertmanager',
  'blackbox-exporter',
  'prometheus',
  ...FRONTEND_SERVICES,
]);

export const ALERT_SPECS = Object.freeze([
  ['WorkerQueueBacklogHigh', {
    service: 'local-alert-fixture',
    queue: 'synthetic-p0',
  }],
  ['BackupJobFailed', {
    backup_type: 'local-synthetic',
  }],
  ['PaymentProviderFailure', {
    service: 'local-alert-fixture',
  }],
  ['PaymentWebhookFailure', {
    service: 'local-alert-fixture',
  }],
  ['EmailDispatchFailed', {
    service: 'local-alert-fixture',
  }],
  ['EmailDeliveryOutcomeFailed', {
    service: 'local-alert-fixture',
  }],
  ['CallProviderFailure', {
    service: 'local-alert-fixture',
  }],
  ['CallMediaFailure', {
    service: 'local-alert-fixture',
  }],
  ['PrivilegedRoleChanged', {
    service: 'local-alert-fixture',
  }],
  ['AdminRoleChanged', {
    service: 'local-alert-fixture',
  }],
  ['UserAuthenticationFailureSpike', {
    service: 'local-alert-fixture',
    subject: 'user',
  }],
  ['CounsellorAuthenticationFailureSpike', {
    service: 'local-alert-fixture',
    subject: 'counsellor',
  }],
  ['AdminAuthenticationMfaFailureSpike', {
    service: 'local-alert-fixture',
    subject: 'admin',
  }],
  ['ElevatedHttp401Rate', {
    service: 'local-alert-fixture',
  }],
  ['ElevatedHttp403Rate', {
    service: 'local-alert-fixture',
  }],
  ['ElevatedHttp429Rate', {
    service: 'local-alert-fixture',
  }],
  ['ElevatedHttp500Rate', {
    service: 'local-alert-fixture',
  }],
  ['UserFrontendProbeFailed', {
    service: 'user-web-app',
  }],
  ['AdminFrontendProbeFailed', {
    service: 'admin-panel',
  }],
  ['CounsellorFrontendProbeFailed', {
    service: 'counsellor-web',
  }],
].map(([alertName, labels]) => Object.freeze({
  alertName,
  labels: Object.freeze(labels),
  runbook: `${RUNBOOK_BASE}${alertName.toLowerCase()}`,
})));

const sleep = (milliseconds) => new Promise(
  (resolve) => setTimeout(resolve, milliseconds),
);

const isWithin = (candidate, parent) => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
};

const parseArguments = (argv) => {
  if (argv.length === 0) {
    return Object.freeze({ evidenceFile: DEFAULT_EVIDENCE_FILE });
  }
  if (argv.length !== 2 || argv[0] !== '--evidence') {
    throw new Error(
      'Usage: node exercise-p0-alerts.mjs [--evidence generated/<file>.json]',
    );
  }
  const evidenceFile = path.resolve(MODULE_DIRECTORY, argv[1]);
  if (
    !isWithin(evidenceFile, GENERATED_DIRECTORY)
    || path.extname(evidenceFile).toLowerCase() !== '.json'
  ) {
    throw new Error('Evidence must be a JSON file inside generated/');
  }
  return Object.freeze({ evidenceFile });
};

const runProcess = (
  command,
  args,
  {
    cwd = MODULE_DIRECTORY,
    timeoutMilliseconds = 120_000,
  } = {},
) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  let settled = false;
  const timer = setTimeout(() => {
    child.kill();
    if (!settled) {
      settled = true;
      reject(new Error(`${command} timed out`));
    }
  }, timeoutMilliseconds);

  const append = (target, chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > 1024 * 1024) {
      child.kill();
      return;
    }
    target.push(chunk);
  };
  child.stdout.on('data', (chunk) => append(stdout, chunk));
  child.stderr.on('data', (chunk) => append(stderr, chunk));
  child.once('error', (error) => {
    clearTimeout(timer);
    if (!settled) {
      settled = true;
      reject(new Error(`${command} could not start: ${error.message}`));
    }
  });
  child.once('close', (code) => {
    clearTimeout(timer);
    if (settled) return;
    settled = true;
    if (outputBytes > 1024 * 1024) {
      reject(new Error(`${command} exceeded the bounded output limit`));
      return;
    }
    if (code !== 0) {
      reject(new Error(`${command} exited with status ${code}`));
      return;
    }
    resolve(Buffer.concat(stdout).toString('utf8').trim());
  });
});

const composeArguments = (...args) => [
  'compose',
  '-p',
  EXPECTED_PROJECT,
  '--env-file',
  ENVIRONMENT_FILE,
  '--project-directory',
  MODULE_DIRECTORY,
  '-f',
  COMPOSE_FILE,
  ...args,
];

const runCompose = (...args) => runProcess(
  'docker',
  composeArguments(...args),
);

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Local monitoring API returned HTTP ${response.status}`);
  }
  const source = await response.text();
  if (Buffer.byteLength(source) > 8 * 1024 * 1024) {
    throw new Error('Local monitoring API response exceeded the size limit');
  }
  return JSON.parse(source);
};

const labelsMatch = (actual, expected) => (
  Object.entries(expected).every(([key, value]) => actual?.[key] === value)
);

export const findExpectedAlerts = (alerts, state) => (
  new Map(ALERT_SPECS.flatMap((spec) => {
    const matching = alerts.find((alert) => (
      alert?.labels?.alertname === spec.alertName
      && labelsMatch(alert.labels, spec.labels)
      && (!state || alert.state === state)
    ));
    return matching ? [[spec.alertName, matching]] : [];
  }))
);

const getPrometheusAlerts = async () => {
  const payload = await fetchJson(`${PROMETHEUS_URL}/api/v1/alerts`);
  if (payload?.status !== 'success' || !Array.isArray(payload?.data?.alerts)) {
    throw new Error('Prometheus alerts response has an unexpected shape');
  }
  return payload.data.alerts;
};

const getAlertmanagerAlerts = async () => {
  const payload = await fetchJson(
    `${ALERTMANAGER_URL}/api/v2/alerts`
      + '?active=true&silenced=false&inhibited=false',
  );
  if (!Array.isArray(payload)) {
    throw new Error('Alertmanager alerts response has an unexpected shape');
  }
  return payload;
};

const waitFor = async (
  description,
  check,
  {
    timeoutMilliseconds,
    intervalMilliseconds = 5_000,
  },
) => {
  const started = Date.now();
  let lastProgress = started;
  let lastError;
  while (Date.now() - started < timeoutMilliseconds) {
    try {
      const result = await check();
      if (result) return result;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() - lastProgress >= 60_000) {
      process.stdout.write(
        `${description}: still waiting inside the original rule window\n`,
      );
      lastProgress = Date.now();
    }
    await sleep(intervalMilliseconds);
  }
  throw new Error(
    `${description} timed out${lastError ? `: ${lastError.message}` : ''}`,
  );
};

const assertContainerIdentityAndHealth = async (service) => {
  const containerId = await runCompose('ps', '-q', service);
  if (!/^[0-9a-f]{12,64}$/.test(containerId)) {
    throw new Error(`${service} does not resolve to one running container`);
  }
  const identity = await runProcess('docker', [
    'inspect',
    '--format',
    '{{index .Config.Labels "com.docker.compose.project"}}|'
      + '{{index .Config.Labels "com.docker.compose.service"}}|'
      + '{{index .Config.Labels "com.docker.compose.oneoff"}}|'
      + '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
    containerId,
  ]);
  const [project, actualService, oneoff, health] = identity.split('|');
  if (
    project !== EXPECTED_PROJECT
    || actualService !== service
    || oneoff !== 'False'
    || health !== 'healthy'
  ) {
    throw new Error(`${service} failed local identity/health verification`);
  }
};

const controlFixture = (action) => runCompose(
  'exec',
  '-T',
  'alert-fixture',
  'node',
  '/app/control.mjs',
  action,
);

const expectedAlertsAreQuiet = async () => {
  const [prometheus, alertmanager] = await Promise.all([
    getPrometheusAlerts(),
    getAlertmanagerAlerts(),
  ]);
  return (
    findExpectedAlerts(prometheus).size === 0
    && findExpectedAlerts(alertmanager).size === 0
  );
};

const waitForPrometheusTarget = (description, query) => waitFor(
  description,
  async () => {
    const payload = await fetchJson(
      `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`,
    );
    return (
      payload?.status === 'success'
      && Array.isArray(payload?.data?.result)
      && payload.data.result.length === 1
    );
  },
  {
    timeoutMilliseconds: 120_000,
  },
);

const waitForFixtureScrape = () => waitForPrometheusTarget(
  'Prometheus fixture scrape',
  'up{job="local-alert-fixture"} == 1',
);

const waitForAlertmanagerScrape = () => waitForPrometheusTarget(
  'Prometheus Alertmanager scrape',
  'up{job="alertmanager"} == 1',
);

const validateRunbooks = (alertsByName) => {
  for (const spec of ALERT_SPECS) {
    const actual = alertsByName.get(spec.alertName)
      ?.annotations?.runbook_url;
    if (actual !== spec.runbook) {
      throw new Error(`${spec.alertName} runbook annotation is not exact`);
    }
  }
};

export const buildEvidence = ({
  triggeredAt,
  prometheusFiringObservedAt,
  alertmanagerFiringObservedAt,
  resetAt,
  prometheusResolvedObservedAt,
  alertmanagerResolvedObservedAt,
}) => ALERT_SPECS.map((spec) => Object.freeze({
  alertName: spec.alertName,
  status: Object.freeze({
    evidenceKind: 'local_synthetic_fixture',
    prometheus: 'firing_then_resolved',
    alertmanager: 'firing_then_resolved',
  }),
  timestamps: Object.freeze({
    triggeredAt,
    prometheusFiringObservedAt,
    alertmanagerFiringObservedAt,
    resetAt,
    prometheusResolvedObservedAt,
    alertmanagerResolvedObservedAt,
  }),
  runbook: spec.runbook,
}));

const writeEvidence = (evidenceFile, evidence) => {
  if (!isWithin(evidenceFile, GENERATED_DIRECTORY)) {
    throw new Error('Evidence target escaped generated/');
  }
  const generatedMetadata = lstatSync(GENERATED_DIRECTORY);
  if (
    generatedMetadata.isSymbolicLink()
    || !generatedMetadata.isDirectory()
  ) {
    throw new Error('Generated evidence directory is unsafe');
  }
  if (path.resolve(evidenceFile) !== path.resolve(DEFAULT_EVIDENCE_FILE)) {
    const parent = path.dirname(evidenceFile);
    if (path.resolve(parent) !== path.resolve(GENERATED_DIRECTORY)) {
      throw new Error('Evidence target must be directly inside generated/');
    }
  }
  const temporaryFile = `${evidenceFile}.tmp`;
  rmSync(temporaryFile, { force: true });
  writeFileSync(temporaryFile, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  if (existsSync(evidenceFile)) {
    const existing = lstatSync(evidenceFile);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      rmSync(temporaryFile, { force: true });
      throw new Error('Existing evidence target is not a regular file');
    }
    rmSync(evidenceFile);
  }
  renameSync(temporaryFile, evidenceFile);
};

export const runAlertExercise = async ({
  evidenceFile = DEFAULT_EVIDENCE_FILE,
} = {}) => {
  const validation = runIsolationValidation();
  if (
    !validation.ok
    || validation.project !== EXPECTED_PROJECT
    || !/^[0-9a-f]{40}$/.test(validation.runtimeCandidateSha)
  ) {
    throw new Error('Local staging isolation validation did not pass');
  }
  const environment = parseEnvironmentFile(
    readFileSync(ENVIRONMENT_FILE, 'utf8'),
  );
  if (
    environment.COMPOSE_PROJECT_NAME !== EXPECTED_PROJECT
    || environment.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID
      !== EXPECTED_ENVIRONMENT_ID
    || environment.MENORAH_RUNTIME_CANDIDATE_SHA
      !== validation.runtimeCandidateSha
  ) {
    throw new Error('Generated local staging identity is not exact');
  }

  for (const service of REQUIRED_HEALTHY_SERVICES) {
    await assertContainerIdentityAndHealth(service);
  }
  await Promise.all([
    waitForFixtureScrape(),
    waitForAlertmanagerScrape(),
  ]);

  let frontendsStopped = false;
  let fixtureTriggered = false;
  try {
    await controlFixture('baseline');
    await waitFor(
      'pre-exercise alert quiet state',
      expectedAlertsAreQuiet,
      {
        timeoutMilliseconds: 14 * 60 * 1000,
      },
    );

    // Two complete scrape/evaluation intervals establish a counter baseline.
    await sleep(35_000);

    const triggeredAt = new Date().toISOString();
    await Promise.all([
      runCompose('stop', '--timeout', '30', ...FRONTEND_SERVICES),
      controlFixture('trigger'),
    ]);
    frontendsStopped = true;
    fixtureTriggered = true;

    const prometheusFiring = await waitFor(
      'all 20 Prometheus alerts firing',
      async () => {
        const matching = findExpectedAlerts(
          await getPrometheusAlerts(),
          'firing',
        );
        return matching.size === ALERT_SPECS.length ? matching : null;
      },
      {
        // WorkerQueueBacklogHigh and ElevatedHttp429Rate retain their original
        // five-minute `for` duration; this bound only adds scrape/API margin.
        timeoutMilliseconds: 8 * 60 * 1000,
      },
    );
    const prometheusFiringObservedAt = new Date().toISOString();
    validateRunbooks(prometheusFiring);

    const alertmanagerFiring = await waitFor(
      'all 20 Alertmanager alerts active',
      async () => {
        const matching = findExpectedAlerts(await getAlertmanagerAlerts());
        return matching.size === ALERT_SPECS.length ? matching : null;
      },
      {
        timeoutMilliseconds: 3 * 60 * 1000,
      },
    );
    const alertmanagerFiringObservedAt = new Date().toISOString();
    validateRunbooks(alertmanagerFiring);

    await Promise.all([
      controlFixture('reset'),
      runCompose('start', ...FRONTEND_SERVICES),
    ]);
    fixtureTriggered = false;
    frontendsStopped = false;
    const resetAt = new Date().toISOString();

    for (const service of FRONTEND_SERVICES) {
      await waitFor(
        `${service} healthy after restart`,
        async () => {
          try {
            await assertContainerIdentityAndHealth(service);
            return true;
          } catch {
            return false;
          }
        },
        {
          timeoutMilliseconds: 3 * 60 * 1000,
        },
      );
    }

    let prometheusResolvedObservedAt;
    let alertmanagerResolvedObservedAt;
    await waitFor(
      'all 20 Prometheus alerts resolved',
      async () => {
        const resolved = (
          findExpectedAlerts(await getPrometheusAlerts()).size === 0
        );
        if (resolved && !prometheusResolvedObservedAt) {
          prometheusResolvedObservedAt = new Date().toISOString();
        }
        return resolved;
      },
      {
        // Authentication and delivery rules use unchanged ten-minute range
        // vectors. The bound includes those windows plus evaluation margin.
        timeoutMilliseconds: 14 * 60 * 1000,
      },
    );
    await waitFor(
      'all 20 Alertmanager alerts resolved',
      async () => {
        const resolved = (
          findExpectedAlerts(await getAlertmanagerAlerts()).size === 0
        );
        if (resolved && !alertmanagerResolvedObservedAt) {
          alertmanagerResolvedObservedAt = new Date().toISOString();
        }
        return resolved;
      },
      {
        timeoutMilliseconds: 3 * 60 * 1000,
      },
    );

    const evidence = buildEvidence({
      triggeredAt,
      prometheusFiringObservedAt,
      alertmanagerFiringObservedAt,
      resetAt,
      prometheusResolvedObservedAt,
      alertmanagerResolvedObservedAt,
    });
    writeEvidence(evidenceFile, evidence);
    return Object.freeze({
      ok: true,
      project: EXPECTED_PROJECT,
      alertCount: evidence.length,
      prometheus: 'firing_then_resolved',
      alertmanager: 'firing_then_resolved',
      evidenceFile: path.relative(MODULE_DIRECTORY, evidenceFile)
        .replaceAll('\\', '/'),
    });
  } finally {
    const cleanup = [];
    if (fixtureTriggered) cleanup.push(controlFixture('reset'));
    if (frontendsStopped) {
      cleanup.push(runCompose('start', ...FRONTEND_SERVICES));
    }
    if (cleanup.length > 0) {
      await Promise.allSettled(cleanup);
    }
  }
};

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await runAlertExercise(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Local P0 alert exercise failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
