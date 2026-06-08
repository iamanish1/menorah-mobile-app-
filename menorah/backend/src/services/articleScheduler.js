const cron = require('node-cron');
const {
  createScheduledGenerationRun,
  getTimezone,
  startGenerationRun
} = require('./articleGenerationService');

let scheduledTask = null;

const startArticleScheduler = () => {
  if (process.env.ARTICLE_SCHEDULER_ENABLED !== 'true') {
    console.log('Article scheduler disabled');
    return null;
  }

  if (scheduledTask) {
    return scheduledTask;
  }

  const timezone = getTimezone();
  scheduledTask = cron.schedule('1 0 * * *', async () => {
    try {
      const run = await createScheduledGenerationRun();
      if (run?.status === 'queued' && run.completedCount === 0 && run.failedCount === 0) {
        startGenerationRun(run._id);
      }
    } catch (error) {
      console.error('Scheduled article generation failed:', error);
    }
  }, {
    timezone
  });

  console.log(`Article scheduler enabled for 12:01 AM ${timezone}`);
  return scheduledTask;
};

module.exports = {
  startArticleScheduler
};
