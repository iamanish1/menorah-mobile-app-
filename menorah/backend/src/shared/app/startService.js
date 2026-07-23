const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
require('dotenv').config();

const connectDB = require('../../config/database');
const { connectRedis, getRedisClient } = require('../../config/redis');
const errorHandler = require('../../middleware/errorHandler');
const notFound = require('../../middleware/notFound');
const chatRoutes = require('../../routes/chat');
const { validateStartupEnv } = require('./startupValidation');
const { createExpressApp } = require('./createExpressApp');
const { getValidatedClientIp } = require('./requestProvenance');
const { createHttpServer } = require('./createHttpServer');
const {
  createSocketServer,
  attachSocketAdapter,
  parseBooleanEnv
} = require('./createSocketServer');
const { mountRouteProfile } = require('./routeProfiles');
const { registerGracefulShutdown } = require('./gracefulShutdown');

const isLocalhost = () => false;

const createServiceState = ({ serviceName, routeProfile }) => ({
  serviceName,
  routeProfile,
  serviceRuntime: process.env.SERVICE_RUNTIME || 'home',
  booted: false,
  mongoReady: false,
  redisReady: false,
  redisRequired: parseBooleanEnv(process.env.REQUIRE_REDIS, process.env.NODE_ENV === 'production'),
  socketEnabled: false,
  socketAdapterEnabled: false
});

const makeRateLimitStore = (redisReady) =>
  redisReady
    ? { store: new RedisStore({ sendCommand: (...args) => getRedisClient().sendCommand(args) }) }
    : {};

const getRateLimitClientIp = (req) =>
  req.validatedClientIp || getValidatedClientIp(req);

const rateLimitKeyGenerator = (req) => rateLimit.ipKeyGenerator(getRateLimitClientIp(req));

const mountRateLimiters = (app, { redisReady }) => {
  const authLimiter = rateLimit({
    ...makeRateLimitStore(redisReady),
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 30,
    keyGenerator: rateLimitKeyGenerator,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost
  });

  const apiLimiter = rateLimit({
    ...makeRateLimitStore(redisReady),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
    keyGenerator: rateLimitKeyGenerator,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/admin/login', authLimiter);
  app.use('/api/auth/admin/login/mfa', authLimiter);
  app.use('/api/auth/google', authLimiter);
  app.use('/api/auth/apple', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth/verify-email-otp', authLimiter);
  app.use('/api/auth/resend-email-otp', authLimiter);
  app.use('/api/auth/verify-email', authLimiter);
  app.use('/api/auth/verify-phone', authLimiter);
  app.use('/api/auth/resend-email-verification', authLimiter);
  app.use('/api/', apiLimiter);
};

const connectRedisForService = async ({ state, socketAdapterEnabled }) => {
  try {
    await connectRedis({ withPubSub: socketAdapterEnabled });
    state.redisReady = true;
  } catch (err) {
    if (state.redisRequired) {
      console.error('FATAL: Redis connection failed:', err.message);
      process.exit(1);
    }
    console.warn('Redis unavailable - continuing with degraded local behavior:', err.message);
  }
};

const startService = async ({
  serviceName,
  routeProfile,
  defaultPort,
  enableSocketsDefault = false,
  requirePaymentEnv = true,
  afterDatabaseConnect = null
}) => {
  validateStartupEnv({ serviceName, requirePaymentEnv });

  const state = createServiceState({ serviceName, routeProfile });
  const { app, corsOrigin, allowedOrigins } = createExpressApp({
    serviceName,
    getHealthState: () => state
  });
  const server = createHttpServer(app);

  await connectDB();
  state.mongoReady = true;
  if (afterDatabaseConnect) {
    await afterDatabaseConnect({ serviceName });
  }

  const socketRuntime = createSocketServer({
    server,
    corsOrigin,
    serviceName,
    enableSocketsDefault
  });
  state.serviceRuntime = socketRuntime.serviceRuntime;
  state.socketEnabled = socketRuntime.socketEnabled;
  state.socketAdapterEnabled = socketRuntime.socketAdapterEnabled;

  await connectRedisForService({
    state,
    socketAdapterEnabled: socketRuntime.socketAdapterEnabled
  });

  const adapterAttached = attachSocketAdapter({
    io: socketRuntime.io,
    redisReady: state.redisReady,
    socketAdapterEnabled: socketRuntime.socketAdapterEnabled
  });

  mountRateLimiters(app, { redisReady: state.redisReady });
  mountRouteProfile(app, routeProfile);

  app.use(notFound);
  app.use(errorHandler);

  chatRoutes.setSocketIO(socketRuntime.io);
  app.set('io', socketRuntime.io);
  state.booted = true;

  const port = process.env.PORT || defaultPort;

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`FATAL: Port ${port} is already in use.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log(`Menorah ${serviceName} listening on port ${port}`);
    console.log(`Runtime: ${state.serviceRuntime}`);
    console.log(`Route profile: ${routeProfile}`);
    console.log(`Socket.IO: ${state.socketEnabled ? 'enabled' : 'disabled'}`);
    console.log(`Socket adapter: ${adapterAttached ? 'enabled' : 'disabled'}`);
    console.log(`Redis: ${state.redisReady ? 'connected' : 'not connected'}`);
    console.log(`CORS origins: ${allowedOrigins.length} configured`);
  });

  registerGracefulShutdown({ server, serviceName });

  return {
    app,
    server,
    io: socketRuntime.io,
    state
  };
};

module.exports = {
  startService,
  createServiceState,
  getRateLimitClientIp,
  mountRateLimiters
};
