const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { getRedisClient } = require('../../config/redis');

const CHECK_OK = 'ok';
const CHECK_FAIL = 'fail';
const CHECK_SKIPPED = 'skipped';
const CHECK_DEGRADED = 'degraded';

const getUploadPath = () =>
  path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads');

const redactedProviderStatus = () => ({
  cloudinary: {
    configured: Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    )
  },
  razorpay: {
    configured: Boolean(
      process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET
    ),
    webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET)
  },
  msg91: {
    configured: Boolean(process.env.MSG91_AUTH_KEY)
  },
  luxand: {
    configured: Boolean(process.env.LUXAND_API_TOKEN)
  },
  livekit: {
    configured: Boolean(
      process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET
    )
  }
});

const mongoConnected = () => mongoose.connection.readyState === 1;

const getBasePayload = (state) => ({
  success: true,
  service: state.serviceName,
  runtime: state.serviceRuntime,
  timestamp: new Date().toISOString()
});

const checkMongoReady = () => ({
  status: mongoConnected() ? CHECK_OK : CHECK_FAIL,
  connected: mongoConnected()
});

const checkRedisReady = (state) => {
  if (!state.redisRequired && !process.env.REDIS_URL) {
    return { status: CHECK_SKIPPED, required: false, configured: false };
  }

  return {
    status: state.redisReady ? CHECK_OK : (state.redisRequired ? CHECK_FAIL : CHECK_DEGRADED),
    required: Boolean(state.redisRequired),
    configured: Boolean(process.env.REDIS_URL),
    connected: Boolean(state.redisReady)
  };
};

const checkMongoDeep = async () => {
  if (!mongoConnected()) {
    return { status: CHECK_FAIL, connected: false };
  }

  await mongoose.connection.db.collection('users').findOne({}, { projection: { _id: 1 } });
  return { status: CHECK_OK, connected: true, read: true };
};

const checkRedisDeep = async () => {
  if (!process.env.REDIS_URL) {
    return { status: CHECK_SKIPPED, configured: false };
  }

  const redis = getRedisClient();
  const pong = await redis.ping();
  return { status: pong === 'PONG' ? CHECK_OK : CHECK_FAIL, configured: true };
};

const checkUploadStorage = async () => {
  const uploadPath = getUploadPath();
  const filename = `.health-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  const filePath = path.join(uploadPath, filename);
  const contents = 'ok';

  await fs.mkdir(uploadPath, { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
  const readBack = await fs.readFile(filePath, 'utf8');
  await fs.unlink(filePath);

  if (readBack !== contents) {
    throw new Error('Storage read verification failed');
  }

  return { status: CHECK_OK, writable: true };
};

const safeCheck = async (fn, fallback = {}) => {
  try {
    return await fn();
  } catch (error) {
    return {
      status: CHECK_FAIL,
      message: error.message,
      ...fallback
    };
  }
};

const getLivePayload = (state) => ({
  ...getBasePayload(state),
  status: CHECK_OK,
  checks: {
    process: { status: CHECK_OK }
  }
});

const getReadyPayload = (state) => {
  const checks = {
    booted: { status: state.booted ? CHECK_OK : CHECK_FAIL },
    mongo: checkMongoReady(),
    redis: checkRedisReady(state)
  };
  const ready = Object.values(checks).every((check) => check.status !== CHECK_FAIL);

  return {
    statusCode: ready ? 200 : 503,
    body: {
      ...getBasePayload(state),
      success: ready,
      status: ready ? CHECK_OK : CHECK_FAIL,
      checks
    }
  };
};

const mountHealthEndpoints = (app, { getState }) => {
  const router = express.Router();

  router.get('/live', (_req, res) => {
    res.json(getLivePayload(getState()));
  });

  router.get('/ready', (_req, res) => {
    const payload = getReadyPayload(getState());
    res.status(payload.statusCode).json(payload.body);
  });

  router.get('/deep', async (_req, res) => {
    const state = getState();
    const checks = {
      booted: { status: state.booted ? CHECK_OK : CHECK_FAIL },
      mongo: await safeCheck(checkMongoDeep),
      redis: await safeCheck(checkRedisDeep),
      storage: await safeCheck(checkUploadStorage),
      providers: {
        status: CHECK_OK,
        config: redactedProviderStatus()
      }
    };
    const healthy = Object.values(checks).every((check) => check.status !== CHECK_FAIL);

    res.status(healthy ? 200 : 503).json({
      ...getBasePayload(state),
      success: healthy,
      status: healthy ? CHECK_OK : CHECK_FAIL,
      checks
    });
  });

  app.use('/health', router);
  app.get('/health', (_req, res) => res.json(getLivePayload(getState())));
  app.get('/api/health', (_req, res) => {
    const payload = getReadyPayload(getState());
    res.status(payload.statusCode).json(payload.body);
  });
};

module.exports = {
  mountHealthEndpoints,
  redactedProviderStatus,
  checkMongoReady,
  checkRedisReady,
  getLivePayload,
  getReadyPayload
};
