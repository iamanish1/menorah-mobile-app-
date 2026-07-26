const mongoose = require('mongoose');
const { getRedisClient, getPubClient, getSubClient } = require('../../config/redis');
const {
  drainSecurityAuditSink,
  getSecurityAuditSinkSnapshot,
} = require('../../services/securityAuditSink');

let registered = false;
const FORCE_EXIT_TIMEOUT_MS = 10_000;
const AUDIT_DRAIN_TIMEOUT_MS = 5_000;

const closeRedis = async () => {
  const clients = [];

  try {
    clients.push(getRedisClient());
  } catch {
    // Redis was not initialised.
  }

  try {
    clients.push(getPubClient());
  } catch {
    // Pub client is optional.
  }

  try {
    clients.push(getSubClient());
  } catch {
    // Sub client is optional.
  }

  await Promise.allSettled(clients.filter(Boolean).map((client) => client.quit()));
};

const drainAuditBeforeDatabaseClose = async ({
  drainAudit = drainSecurityAuditSink,
  getAuditSnapshot = getSecurityAuditSinkSnapshot,
  timeoutMs = AUDIT_DRAIN_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) => {
  let timeout;
  const completed = await Promise.race([
    Promise.resolve()
      .then(() => drainAudit({ scheduleRetry: false }))
      .then(() => true, () => false),
    new Promise((resolve) => {
      timeout = setTimer(() => resolve(false), timeoutMs);
    }),
  ]);
  if (timeout) clearTimer(timeout);
  const snapshot = getAuditSnapshot();
  return {
    drained: completed && snapshot.pending === 0,
    pending: snapshot.pending,
  };
};

const createShutdownHandler = ({
  server,
  serviceName,
  mongooseConnection = mongoose.connection,
  closeRedisClients = closeRedis,
  drainAudit = drainSecurityAuditSink,
  getAuditSnapshot = getSecurityAuditSinkSnapshot,
  exitProcess = (code) => process.exit(code),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  forceExitTimeoutMs = FORCE_EXIT_TIMEOUT_MS,
  auditDrainTimeoutMs = AUDIT_DRAIN_TIMEOUT_MS,
} = {}) => {
  let shuttingDown = false;

  return async (signal) => {
    if (shuttingDown) return false;
    shuttingDown = true;
    console.log(`${signal} received - shutting down ${serviceName} gracefully`);

    const forceExit = setTimer(() => {
      console.error('Forced exit after shutdown timeout');
      exitProcess(1);
    }, forceExitTimeoutMs);

    return new Promise((resolve) => server.close(async () => {
      const auditResult = await drainAuditBeforeDatabaseClose({
        drainAudit,
        getAuditSnapshot,
        timeoutMs: auditDrainTimeoutMs,
        setTimer,
        clearTimer,
      });
      let exitCode = 0;
      if (!auditResult.drained) {
        exitCode = 1;
        console.error(
          '[security-audit] shutdown drain incomplete; refusing a successful process exit'
        );
      }

      try {
        await mongooseConnection.close();
      } catch {
        // Ignore close errors during shutdown.
      }

      await closeRedisClients();
      clearTimer(forceExit);
      exitProcess(exitCode);
      resolve(exitCode === 0);
    }));
  };
};

const registerGracefulShutdown = ({ server, serviceName }) => {
  if (registered) return;
  registered = true;

  const shutdown = createShutdownHandler({ server, serviceName });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

module.exports = {
  registerGracefulShutdown,
  closeRedis,
  createShutdownHandler,
  drainAuditBeforeDatabaseClose,
};
