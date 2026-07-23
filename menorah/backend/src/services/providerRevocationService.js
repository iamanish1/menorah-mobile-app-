const crypto = require('crypto');
const ProviderRevocationTask = require('../models/ProviderRevocationTask');
const { revokeAppleToken } = require('./appleSignInService');
const { decryptAppleRefreshToken } = require('../utils/appleRefreshTokenEncryption');

const MAX_ATTEMPTS = 10;
const LOCK_MILLISECONDS = 2 * 60 * 1000;
const SCHEDULER_INTERVAL_MILLISECONDS = 60 * 1000;

const boundedErrorCode = (error) => {
  const appleCode = String(error?.response?.data?.error || '').toUpperCase();
  if (/^[A-Z0-9_]{1,48}$/.test(appleCode)) return `APPLE_${appleCode}`;
  if (error?.code === 'ECONNABORTED') return 'APPLE_TIMEOUT';
  return 'APPLE_REVOCATION_FAILED';
};

const retryDelayMilliseconds = (attempts) => (
  Math.min(6 * 60 * 60 * 1000, (2 ** Math.min(attempts, 8)) * 60 * 1000)
);

const createProviderRevocationProcessor = ({
  TaskModel = ProviderRevocationTask,
  revokeToken = revokeAppleToken,
  decryptToken = decryptAppleRefreshToken,
} = {}) => {
  const processNext = async ({ now = new Date() } = {}) => {
    const lockToken = crypto.randomBytes(32).toString('hex');
    const lockTokenHash = crypto.createHash('sha256').update(lockToken).digest('hex');
    const lockedUntil = new Date(now.getTime() + LOCK_MILLISECONDS);
    const task = await TaskModel.findOneAndUpdate(
      {
        $or: [
          {
            status: { $in: ['pending', 'retry'] },
            nextAttemptAt: { $lte: now },
          },
          {
            status: 'processing',
            lockedUntil: { $lte: now },
          },
        ],
      },
      {
        $set: { status: 'processing', lockedUntil, lockTokenHash },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
    ).select('+clientId +refreshTokenEncrypted +lockTokenHash');

    if (!task) return null;

    try {
      if (task.provider !== 'apple') throw new Error('Unsupported provider revocation task');
      const refreshToken = decryptToken(task.refreshTokenEncrypted, {
        userId: task.user,
        clientId: task.clientId,
      });
      await revokeToken({ token: refreshToken, clientId: task.clientId });

      const completed = await TaskModel.updateOne(
        { _id: task._id, status: 'processing', lockTokenHash },
        {
          $set: {
            status: 'completed',
            completedAt: now,
            lockedUntil: null,
            nextAttemptAt: null,
            lastErrorCode: null,
          },
          $unset: {
            refreshTokenEncrypted: '',
            clientId: '',
            lockTokenHash: '',
          },
        }
      );
      if (completed.modifiedCount !== 1) {
        throw new Error('Provider revocation completion lock was lost');
      }
      return { taskId: task._id, status: 'completed' };
    } catch (error) {
      const terminal = task.attempts >= MAX_ATTEMPTS;
      const status = terminal ? 'manual_review' : 'retry';
      const nextAttemptAt = terminal
        ? null
        : new Date(now.getTime() + retryDelayMilliseconds(task.attempts));
      await TaskModel.updateOne(
        { _id: task._id, status: 'processing', lockTokenHash },
        {
          $set: {
            status,
            nextAttemptAt,
            lockedUntil: null,
            lastErrorCode: boundedErrorCode(error),
          },
          $unset: { lockTokenHash: '' },
        }
      );
      return {
        taskId: task._id,
        status,
        errorCode: boundedErrorCode(error),
      };
    }
  };

  return { processNext };
};

const processor = createProviderRevocationProcessor();

const startProviderRevocationScheduler = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      for (let processed = 0; processed < 10; processed += 1) {
        const result = await processor.processNext();
        if (!result) break;
        if (result.status !== 'completed') {
          console.error('Provider revocation task result:', result.errorCode || result.status);
        }
      }
    } catch (error) {
      console.error('Provider revocation scheduler error code:', error?.code || 'UNEXPECTED_ERROR');
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, SCHEDULER_INTERVAL_MILLISECONDS);
  timer.unref?.();
  return () => clearInterval(timer);
};

module.exports = {
  MAX_ATTEMPTS,
  createProviderRevocationProcessor,
  startProviderRevocationScheduler,
};
