const cron = require('node-cron');
const {
  enqueueUpcomingSessionReminders,
  processPushNotificationQueue,
  processPushReceipts,
} = require('./pushNotificationService');

let scheduledTask = null;
let cycleRunning = false;

const runPushNotificationCycle = async (options = {}) => {
  if (cycleRunning) return false;
  cycleRunning = true;
  try {
    await enqueueUpcomingSessionReminders(options);
    await processPushNotificationQueue(options);
    await processPushReceipts(options);
    return true;
  } catch (error) {
    console.error('Push notification worker cycle failed:', error?.code || 'PUSH_CYCLE_FAILED');
    return false;
  } finally {
    cycleRunning = false;
  }
};

const startPushNotificationScheduler = () => {
  if (scheduledTask) return scheduledTask;
  scheduledTask = cron.schedule('* * * * *', () => {
    void runPushNotificationCycle();
  });
  setImmediate(() => {
    void runPushNotificationCycle();
  });
  return scheduledTask;
};

const stopPushNotificationScheduler = () => {
  scheduledTask?.stop();
  scheduledTask = null;
};

module.exports = {
  runPushNotificationCycle,
  startPushNotificationScheduler,
  stopPushNotificationScheduler,
};
