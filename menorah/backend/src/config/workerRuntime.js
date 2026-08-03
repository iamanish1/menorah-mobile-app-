const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

const parseBooleanEnv = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return TRUE_ENV_VALUES.has(String(value).trim().toLowerCase());
};

const resolveWorkerMode = (environment = process.env) => {
  const configuredMode = String(environment.WORKER_MODE || '').trim();
  if (configuredMode) return configuredMode;
  return environment.SERVICE_RUNTIME === 'cloudrun' ? 'standby' : 'active';
};

// Push delivery is deliberately opt-in. Startup validation and the scheduler
// must call this same resolver so no accepted boolean spelling or fallback can
// start the job without first enforcing enhanced Expo push authentication.
const resolveNotificationJobsEnabled = (environment = process.env) => (
  resolveWorkerMode(environment) === 'active'
  && parseBooleanEnv(environment.ENABLE_NOTIFICATION_JOBS, false)
);

module.exports = {
  parseBooleanEnv,
  resolveNotificationJobsEnabled,
  resolveWorkerMode,
};
