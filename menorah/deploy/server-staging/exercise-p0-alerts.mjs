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
  ALERT_SPECS as SHARED_ALERT_SPECS,
} from '../local-staging/exercise-p0-alerts.mjs';
import {
  SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION,
  SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY,
  SERVER_STAGING_VALIDATION_PROJECT,
} from '../local-staging/alert-fixture/control.mjs';
import {
  ENVIRONMENT_ID,
  assertValidEnvironment,
  parseEnvironmentFile,
} from './validate-environment.mjs';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = path.join(MODULE_DIRECTORY, 'compose.yml');
const ENVIRONMENT_FILE = path.join(
  MODULE_DIRECTORY,
  'generated',
  'server-staging-validation.env',
);
const PRODUCTION_METADATA_FILE = path.join(
  MODULE_DIRECTORY,
  'production-metadata.fixture.json',
);
const GENERATED_DIRECTORY = path.join(MODULE_DIRECTORY, 'generated');
const EVIDENCE_FILE = path.join(
  GENERATED_DIRECTORY,
  'server-staging-p0-alert-exercise-evidence.json',
);

export const PROMETHEUS_URL = 'http://127.0.0.1:39090';
export const ALERTMANAGER_URL = 'http://127.0.0.1:39093';
export const ALERT_SPECS = SHARED_ALERT_SPECS;

export const FRONTEND_SERVICES = Object.freeze([
  'staging-user-web-app',
  'staging-admin-panel',
  'staging-web-app',
]);

const REQUIRED_HEALTHY_SERVICES = Object.freeze([
  'staging-alert-fixture',
  'staging-alert-sink',
  'staging-alertmanager',
  'staging-blackbox-exporter',
  'staging-prometheus',
  ...FRONTEND_SERVICES,
]);

export const EXPECTED_TARGETS_BY_JOB = Object.freeze({
  'blackbox-http-internal': 9,
  'blackbox-tcp-internal': 3,
  'blackbox-https-public': 9,
  'blackbox-https-calls': 1,
  'security-events': 5,
  'staging-alert-fixture': 1,
  'blackbox-exporter': 1,
  'mongodb-exporter': 1,
  'redis-exporter': 1,
  alloy: 1,
  loki: 1,
  alertmanager: 1,
  prometheus: 1,
});

export const EXPECTED_ACTIVE_TARGET_COUNT = Object.values(
  EXPECTED_TARGETS_BY_JOB,
).reduce((total, count) => total + count, 0);

const sleep = (milliseconds) => new Promise(
  (resolve) => setTimeout(resolve, milliseconds),
);

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
  let outputBytes = 0;
  let settled = false;

  const timer = setTimeout(() => {
    child.kill();
    if (!settled) {
      settled = true;
      reject(new Error(`${command} timed out`));
    }
  }, timeoutMilliseconds);

  const append = (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > 1024 * 1024) {
      child.kill();
      return;
    }
    stdout.push(chunk);
  };

  child.stdout.on('data', append);
  child.stderr.on('data', (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > 1024 * 1024) child.kill();
  });
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

export const composeArguments = (...args) => [
  'compose',
  '-p',
  SERVER_STAGING_VALIDATION_PROJECT,
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
    throw new Error(`Server-staging monitoring API returned HTTP ${response.status}`);
  }
  const source = await response.text();
  if (Buffer.byteLength(source) > 8 * 1024 * 1024) {
    throw new Error(
      'Server-staging monitoring API response exceeded the size limit',
    );
  }
  return JSON.parse(source);
};

const labelsMatch = (actual, expected) => (
  Object.entries(expected).every(([key, value]) => actual?.[key] === value)
);

const isExpectedAlert = (
  alert,
  spec,
  {
    requireServerScope = false,
    state,
  } = {},
) => (
  alert?.labels?.alertname === spec.alertName
  && labelsMatch(alert.labels, spec.labels)
  && (!state || alert.state === state)
  && (
    !requireServerScope
    || (
        alert.labels.environment === 'staging'
        && alert.labels.compose_project
          === SERVER_STAGING_VALIDATION_PROJECT
        && alert.labels.monitoring_scope === 'server-staging'
        && alert.labels.stack === 'menorah-staging'
    )
  )
);

export const findExpectedAlerts = (
  alerts,
  options = {},
) => new Map(ALERT_SPECS.flatMap((spec) => {
  const matching = alerts.filter((alert) => (
    isExpectedAlert(alert, spec, options)
  ));
  return matching.length === 1
    ? [[spec.alertName, matching[0]]]
    : [];
}));

export const activeTargetsAreHealthy = (payload) => {
  const targets = payload?.data?.activeTargets;
  if (
    payload?.status !== 'success'
    || !Array.isArray(targets)
    || targets.length !== EXPECTED_ACTIVE_TARGET_COUNT
  ) {
    return false;
  }

  const counts = new Map();
  for (const target of targets) {
    if (
      target?.health !== 'up'
      || target?.labels?.environment !== 'staging'
      || target?.labels?.monitoring_scope !== 'server-staging'
      || typeof target?.labels?.job !== 'string'
      || typeof target?.labels?.instance !== 'string'
      || target.labels.instance.length === 0
    ) {
      return false;
    }
    counts.set(
      target.labels.job,
      (counts.get(target.labels.job) || 0) + 1,
    );
  }

  return (
    counts.size === Object.keys(EXPECTED_TARGETS_BY_JOB).length
    && Object.entries(EXPECTED_TARGETS_BY_JOB).every(
      ([job, count]) => counts.get(job) === count,
    )
  );
};

export const monitoringBaselineIsExact = (
  prometheusAlerts,
  alertmanagerAlerts,
) => (
  Array.isArray(prometheusAlerts)
  && Array.isArray(alertmanagerAlerts)
  && !ALERT_SPECS.some((spec) => (
    prometheusAlerts.some((alert) => isExpectedAlert(alert, spec))
  ))
  && !ALERT_SPECS.some((spec) => (
    alertmanagerAlerts.some((alert) => isExpectedAlert(
      alert,
      spec,
      { requireServerScope: true },
    ))
  ))
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
    intervalMilliseconds = 5_000,
    timeoutMilliseconds,
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

const loadValidationEnvironment = () => {
  const generatedMetadata = lstatSync(GENERATED_DIRECTORY);
  const environmentMetadata = lstatSync(ENVIRONMENT_FILE);
  if (
    generatedMetadata.isSymbolicLink()
    || !generatedMetadata.isDirectory()
    || environmentMetadata.isSymbolicLink()
    || !environmentMetadata.isFile()
  ) {
    throw new Error('Server-staging generated environment path is unsafe');
  }

  const environment = parseEnvironmentFile(ENVIRONMENT_FILE);
  const productionMetadata = JSON.parse(
    readFileSync(PRODUCTION_METADATA_FILE, 'utf8'),
  );
  assertValidEnvironment(environment, { productionMetadata });

  if (
    process.env[SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY]
      !== SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION
    || process.env.COMPOSE_PROJECT_NAME
      !== SERVER_STAGING_VALIDATION_PROJECT
    || environment.MENORAH_SERVER_STAGING_PROJECT_NAME
      !== SERVER_STAGING_VALIDATION_PROJECT
    || environment.MENORAH_SERVER_STAGING_ENVIRONMENT_ID
      !== ENVIRONMENT_ID
    || environment.PROMETHEUS_LOCAL_PORT !== '127.0.0.1:39090'
    || environment.ALERTMANAGER_LOCAL_PORT !== '127.0.0.1:39093'
    || !/^[a-f0-9]{40}$/.test(
      environment.MENORAH_RUNTIME_CANDIDATE_SHA || '',
    )
    || environment.MENORAH_RUNTIME_CANDIDATE_SHA
      !== environment.MENORAH_SERVER_STAGING_RUNTIME_SHA
  ) {
    throw new Error(
      'Exact server-staging validation identity/confirmation is required',
    );
  }

  return environment;
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
    project !== SERVER_STAGING_VALIDATION_PROJECT
    || actualService !== service
    || oneoff !== 'False'
    || health !== 'healthy'
  ) {
    throw new Error(
      `${service} failed server-staging validation identity/health verification`,
    );
  }
};

const controlFixture = (action) => runCompose(
  'exec',
  '-T',
  '-e',
  `${SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY}=`
    + SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION,
  'staging-alert-fixture',
  'node',
  '/app/control.mjs',
  action,
);

const expectedAlertsAreQuiet = async () => {
  const [prometheus, alertmanager] = await Promise.all([
    getPrometheusAlerts(),
    getAlertmanagerAlerts(),
  ]);
  return monitoringBaselineIsExact(prometheus, alertmanager);
};

const waitForAllPrometheusTargets = (
  timeoutMilliseconds = 120_000,
) => waitFor(
  `all ${EXPECTED_ACTIVE_TARGET_COUNT} server-staging Prometheus targets healthy`,
  async () => activeTargetsAreHealthy(
    await fetchJson(`${PROMETHEUS_URL}/api/v1/targets?state=active`),
  ),
  { timeoutMilliseconds },
);

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
  { timeoutMilliseconds: 120_000 },
);

const waitForFixtureScrape = () => waitForPrometheusTarget(
  'Prometheus server-staging fixture scrape',
  'up{job="staging-alert-fixture",environment="staging",'
    + 'monitoring_scope="server-staging"} == 1',
);

const waitForAlertmanagerScrape = () => waitForPrometheusTarget(
  'Prometheus server-staging Alertmanager scrape',
  'up{job="alertmanager",environment="staging",'
    + 'monitoring_scope="server-staging"} == 1',
);

const validateRunbooks = (alertsByName) => {
  for (const spec of ALERT_SPECS) {
    if (
      alertsByName.get(spec.alertName)?.annotations?.runbook_url
      !== spec.runbook
    ) {
      throw new Error(`${spec.alertName} runbook annotation is not exact`);
    }
  }
};

export const buildEvidence = ({
  alertmanagerFiringObservedAt,
  alertmanagerResolvedObservedAt,
  prometheusFiringObservedAt,
  prometheusResolvedObservedAt,
  resetAt,
  triggeredAt,
}) => ALERT_SPECS.map((spec) => Object.freeze({
  alertName: spec.alertName,
  status: Object.freeze({
    alertmanager: 'firing_then_resolved',
    evidenceKind: 'server_staging_validation_synthetic_fixture',
    project: SERVER_STAGING_VALIDATION_PROJECT,
    prometheus: 'firing_then_resolved',
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

const writeEvidence = (evidence) => {
  const generatedMetadata = lstatSync(GENERATED_DIRECTORY);
  if (
    generatedMetadata.isSymbolicLink()
    || !generatedMetadata.isDirectory()
  ) {
    throw new Error('Generated evidence directory is unsafe');
  }

  const temporaryFile = `${EVIDENCE_FILE}.tmp`;
  rmSync(temporaryFile, { force: true });
  writeFileSync(
    temporaryFile,
    `${JSON.stringify(evidence, null, 2)}\n`,
    {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    },
  );
  if (existsSync(EVIDENCE_FILE)) {
    const existing = lstatSync(EVIDENCE_FILE);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      rmSync(temporaryFile, { force: true });
      throw new Error('Existing evidence target is not a regular file');
    }
    rmSync(EVIDENCE_FILE);
  }
  renameSync(temporaryFile, EVIDENCE_FILE);
};

const waitForFrontendHealth = () => Promise.all(
  FRONTEND_SERVICES.map((service) => waitFor(
    `${service} healthy`,
    async () => {
      try {
        await assertContainerIdentityAndHealth(service);
        return true;
      } catch {
        return false;
      }
    },
    { timeoutMilliseconds: 3 * 60 * 1000 },
  )),
);

const cleanupExercise = async () => {
  const actions = await Promise.allSettled([
    controlFixture('reset'),
    runCompose('start', ...FRONTEND_SERVICES),
  ]);
  if (actions.some(({ status }) => status === 'rejected')) {
    throw new Error('Validation-only alert exercise cleanup command failed');
  }
  await Promise.all([
    waitForFrontendHealth(),
    waitForAllPrometheusTargets(3 * 60 * 1000),
  ]);
};

export const runAlertExercise = async () => {
  const environment = loadValidationEnvironment();
  for (const service of REQUIRED_HEALTHY_SERVICES) {
    await assertContainerIdentityAndHealth(service);
  }
  await Promise.all([
    waitForFixtureScrape(),
    waitForAlertmanagerScrape(),
    waitForAllPrometheusTargets(),
  ]);

  let cleanupRequired = false;
  let primaryError;
  let cleanupError;
  let evidence;

  try {
    cleanupRequired = true;
    await controlFixture('baseline');
    await waitFor(
      'server-staging pre-exercise alert quiet state',
      expectedAlertsAreQuiet,
      { timeoutMilliseconds: 14 * 60 * 1000 },
    );

    // Two full scrape/evaluation intervals establish the counter baseline.
    await sleep(35_000);

    const triggeredAt = new Date().toISOString();
    await Promise.all([
      runCompose('stop', '--timeout', '30', ...FRONTEND_SERVICES),
      controlFixture('trigger'),
    ]);

    const prometheusFiring = await waitFor(
      'all exact 20 server-staging Prometheus alerts firing',
      async () => {
        const matching = findExpectedAlerts(
          await getPrometheusAlerts(),
          { state: 'firing' },
        );
        return matching.size === ALERT_SPECS.length ? matching : null;
      },
      { timeoutMilliseconds: 8 * 60 * 1000 },
    );
    const prometheusFiringObservedAt = new Date().toISOString();
    validateRunbooks(prometheusFiring);

    const alertmanagerFiring = await waitFor(
      'all exact 20 server-staging Alertmanager alerts active',
      async () => {
        const matching = findExpectedAlerts(
          await getAlertmanagerAlerts(),
          { requireServerScope: true },
        );
        return matching.size === ALERT_SPECS.length ? matching : null;
      },
      { timeoutMilliseconds: 3 * 60 * 1000 },
    );
    const alertmanagerFiringObservedAt = new Date().toISOString();
    validateRunbooks(alertmanagerFiring);

    await Promise.all([
      controlFixture('reset'),
      runCompose('start', ...FRONTEND_SERVICES),
    ]);
    const resetAt = new Date().toISOString();
    await waitForFrontendHealth();

    let prometheusResolvedObservedAt;
    await waitFor(
      'all exact 20 server-staging Prometheus alerts resolved',
      async () => {
        const resolved = (
          findExpectedAlerts(await getPrometheusAlerts()).size === 0
        );
        if (resolved && !prometheusResolvedObservedAt) {
          prometheusResolvedObservedAt = new Date().toISOString();
        }
        return resolved;
      },
      { timeoutMilliseconds: 14 * 60 * 1000 },
    );

    let alertmanagerResolvedObservedAt;
    await waitFor(
      'all exact 20 server-staging Alertmanager alerts resolved',
      async () => {
        const resolved = findExpectedAlerts(
          await getAlertmanagerAlerts(),
          { requireServerScope: true },
        ).size === 0;
        if (resolved && !alertmanagerResolvedObservedAt) {
          alertmanagerResolvedObservedAt = new Date().toISOString();
        }
        return resolved;
      },
      { timeoutMilliseconds: 3 * 60 * 1000 },
    );

    evidence = buildEvidence({
      triggeredAt,
      prometheusFiringObservedAt,
      alertmanagerFiringObservedAt,
      resetAt,
      prometheusResolvedObservedAt,
      alertmanagerResolvedObservedAt,
    });
  } catch (error) {
    primaryError = error;
  } finally {
    if (cleanupRequired) {
      try {
        await cleanupExercise();
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (primaryError && cleanupError) {
    throw new Error(
      `${primaryError.message}; cleanup also failed: ${cleanupError.message}`,
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;

  writeEvidence(evidence);
  return Object.freeze({
    alertCount: evidence.length,
    alertmanager: 'firing_then_resolved',
    evidenceFile: path.relative(MODULE_DIRECTORY, EVIDENCE_FILE)
      .replaceAll('\\', '/'),
    ok: true,
    project: SERVER_STAGING_VALIDATION_PROJECT,
    prometheus: 'firing_then_resolved',
    runtimeCandidateSha: environment.MENORAH_RUNTIME_CANDIDATE_SHA,
    targetsHealthy: EXPECTED_ACTIVE_TARGET_COUNT,
  });
};

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  if (process.argv.length !== 2) {
    process.stderr.write(
      'Usage: node exercise-p0-alerts.mjs\n',
    );
    process.exitCode = 1;
  } else {
    try {
      const result = await runAlertExercise();
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(
        `Server-staging P0 alert exercise failed: ${error.message}\n`,
      );
      process.exitCode = 1;
    }
  }
}
