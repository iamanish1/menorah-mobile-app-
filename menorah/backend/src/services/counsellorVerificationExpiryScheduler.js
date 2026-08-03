const cron = require('node-cron');
const {
  DEFAULT_EXPIRY_RECONCILIATION_BATCH_SIZE,
  reconcileBatch,
} = require('./counsellorVerificationExpiry');

let scheduledTask = null;
let reconciliationRunning = false;

const readBatchSize = () => {
  const configured = Number(
    process.env.COUNSELLOR_VERIFICATION_EXPIRY_BATCH_SIZE
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_EXPIRY_RECONCILIATION_BATCH_SIZE;
};

const processDueCounsellorVerificationExpiries = async () => {
  if (reconciliationRunning) {
    return {
      skipped: true,
      reason: 'reconciliation_already_running',
    };
  }

  reconciliationRunning = true;
  try {
    const summary = await reconcileBatch({ limit: readBatchSize() });
    if (summary.failed > 0) {
      console.error(
        'Counsellor verification expiry reconciliation completed with failures:',
        summary
      );
    }
    return summary;
  } finally {
    reconciliationRunning = false;
  }
};

const startCounsellorVerificationExpiryScheduler = () => {
  if (scheduledTask) return scheduledTask;

  // Run once at worker startup so a restart closes any gap immediately. The
  // promise is intentionally observed even though startup does not wait for a
  // whole batch of independent transactions.
  processDueCounsellorVerificationExpiries().catch((error) => {
    console.error(
      'Initial counsellor verification expiry reconciliation failed:',
      error
    );
  });

  scheduledTask = cron.schedule(
    '* * * * *',
    async () => {
      try {
        await processDueCounsellorVerificationExpiries();
      } catch (error) {
        console.error(
          'Scheduled counsellor verification expiry reconciliation failed:',
          error
        );
      }
    },
    {
      timezone: 'UTC',
      noOverlap: true,
    }
  );

  console.log(
    'Counsellor verification expiry reconciliation enabled (every minute, UTC)'
  );
  return scheduledTask;
};

module.exports = {
  processDueCounsellorVerificationExpiries,
  startCounsellorVerificationExpiryScheduler,
  _private: {
    readBatchSize,
  },
};
