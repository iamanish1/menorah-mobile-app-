const cron = require('node-cron');
const {
  DEFAULT_RETENTION_BATCH_SIZE,
  privacyRetentionService,
} = require('./privacyRetention');

let scheduledTask = null;
let retentionRunning = false;

const readBatchSize = () => {
  const configured = Number(process.env.PRIVACY_RETENTION_BATCH_SIZE);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_RETENTION_BATCH_SIZE;
};

const processDuePrivacyRetention = async () => {
  if (retentionRunning) {
    return { skipped: true, reason: 'privacy_retention_already_running' };
  }
  retentionRunning = true;
  try {
    const summary = await privacyRetentionService.processBatch({
      limit: readBatchSize(),
    });
    if (summary.failed > 0) {
      console.error('Privacy retention completed with bounded failures:', summary);
    }
    return summary;
  } finally {
    retentionRunning = false;
  }
};

const startPrivacyRetentionScheduler = () => {
  if (scheduledTask) return scheduledTask;

  processDuePrivacyRetention().catch((error) => {
    console.error(
      'Initial privacy retention run failed:',
      error?.code || 'PRIVACY_RETENTION_FAILED'
    );
  });
  scheduledTask = cron.schedule(
    '17 * * * *',
    async () => {
      try {
        await processDuePrivacyRetention();
      } catch (error) {
        console.error(
          'Scheduled privacy retention run failed:',
          error?.code || 'PRIVACY_RETENTION_FAILED'
        );
      }
    },
    { timezone: 'UTC', noOverlap: true }
  );
  console.log('Privacy retention worker enabled (hourly at minute 17, UTC)');
  return scheduledTask;
};

module.exports = {
  processDuePrivacyRetention,
  startPrivacyRetentionScheduler,
  _private: { readBatchSize },
};
