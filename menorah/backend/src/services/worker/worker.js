const { parseBooleanEnv } = require('../../shared/app/createSocketServer');
const connectDB = require('../../config/database');
const { connectRedis } = require('../../config/redis');
const { createExpressApp } = require('../../shared/app/createExpressApp');
const { createHttpServer } = require('../../shared/app/createHttpServer');
const { registerGracefulShutdown } = require('../../shared/app/gracefulShutdown');
const { validateStartupEnv } = require('../../shared/app/startupValidation');
const { startArticleScheduler } = require('../articleScheduler');
const {
  startCounsellorVerificationExpiryScheduler,
} = require('../counsellorVerificationExpiryScheduler');
const {
  startPrivacyRetentionScheduler,
} = require('../privacyRetentionScheduler');
const { startSocialScheduler } = require('../socialStudio/socialScheduler.service');
const { startProviderRevocationScheduler } = require('../providerRevocationService');
require('dotenv').config();

const getWorkerMode = () => {
  if (process.env.WORKER_MODE) return process.env.WORKER_MODE;
  return process.env.SERVICE_RUNTIME === 'cloudrun' ? 'standby' : 'active';
};

const schedulerEnabled = (key, fallback = false) => parseBooleanEnv(process.env[key], fallback);

const resolveWorkerJobs = () => {
  const mode = getWorkerMode();
  const active = mode === 'active';

  return {
    mode,
    active,
    articleScheduler: active && schedulerEnabled('ENABLE_ARTICLE_SCHEDULER', process.env.ARTICLE_SCHEDULER_ENABLED === 'true'),
    counsellorVerificationExpiry:
      active && schedulerEnabled('ENABLE_COUNSELLOR_VERIFICATION_EXPIRY_JOB', true),
    privacyRetention:
      active && process.env.PRIVACY_RETENTION_EXECUTION_ENABLED === 'true',
    providerRevocation: active,
    socialScheduler: active && schedulerEnabled('ENABLE_SOCIAL_SCHEDULER', false),
    backupJobs: active && schedulerEnabled('ENABLE_BACKUP_JOBS', false),
    cleanupJobs: active && schedulerEnabled('ENABLE_CLEANUP_JOBS', false),
    emailJobs: active && schedulerEnabled('ENABLE_EMAIL_JOBS', false),
    notificationJobs: active && schedulerEnabled('ENABLE_NOTIFICATION_JOBS', false)
  };
};

const startWorkerJobs = (jobs) => {
  if (!jobs.active) {
    console.log('Worker is in standby mode - scheduled jobs disabled');
    return;
  }

  if (jobs.articleScheduler) {
    process.env.ARTICLE_SCHEDULER_ENABLED = 'true';
    startArticleScheduler();
  }

  if (jobs.counsellorVerificationExpiry) {
    startCounsellorVerificationExpiryScheduler();
  }

  if (jobs.privacyRetention) {
    startPrivacyRetentionScheduler();
  }

  if (jobs.providerRevocation) {
    startProviderRevocationScheduler();
  }

  if (jobs.socialScheduler) {
    startSocialScheduler();
  }

  ['backupJobs', 'cleanupJobs', 'emailJobs', 'notificationJobs'].forEach((jobKey) => {
    if (jobs[jobKey]) {
      console.log(`${jobKey} enabled but no job implementation is registered yet`);
    }
  });
};

const startWorker = async () => {
  const serviceName = 'worker';
  validateStartupEnv({ serviceName, requirePaymentEnv: false });

  const state = {
    serviceName,
    routeProfile: 'worker',
    serviceRuntime: process.env.SERVICE_RUNTIME || 'home',
    booted: false,
    mongoReady: false,
    redisReady: false,
    redisRequired: parseBooleanEnv(process.env.REQUIRE_REDIS, process.env.NODE_ENV === 'production'),
    socketEnabled: false,
    socketAdapterEnabled: false
  };

  const { app } = createExpressApp({
    serviceName,
    getHealthState: () => state
  });
  const server = createHttpServer(app);

  await connectDB();
  state.mongoReady = true;

  try {
    await connectRedis({ withPubSub: false });
    state.redisReady = true;
  } catch (err) {
    if (state.redisRequired) {
      console.error('FATAL: Redis connection failed:', err.message);
      process.exit(1);
    }
    console.warn('Redis unavailable - worker continuing in degraded mode:', err.message);
  }

  const jobs = resolveWorkerJobs();
  startWorkerJobs(jobs);
  state.booted = true;

  const port = process.env.PORT || 4010;
  server.listen(port, () => {
    console.log(`Menorah worker health server listening on port ${port}`);
    console.log(`Worker mode: ${jobs.mode}`);
    console.log(`Article scheduler: ${jobs.articleScheduler ? 'enabled' : 'disabled'}`);
    console.log(
      'Counsellor verification expiry reconciliation: '
      + `${jobs.counsellorVerificationExpiry ? 'enabled' : 'disabled'}`
    );
    console.log(`Privacy retention: ${jobs.privacyRetention ? 'enabled' : 'disabled'}`);
    console.log(`Provider revocation: ${jobs.providerRevocation ? 'enabled' : 'disabled'}`);
    console.log(`Social scheduler: ${jobs.socialScheduler ? 'enabled' : 'disabled'}`);
  });

  registerGracefulShutdown({ server, serviceName });

  return {
    app,
    server,
    state,
    jobs
  };
};

if (require.main === module) {
  startWorker().catch((err) => {
    console.error('FATAL: Failed to start worker:', err);
    process.exit(1);
  });
}

module.exports = {
  startWorker,
  resolveWorkerJobs,
  startWorkerJobs
};
