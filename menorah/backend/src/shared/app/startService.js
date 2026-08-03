const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const crypto = require('crypto');
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

const RATE_LIMIT_STORE_PREFIXES = Object.freeze({
  credential: 'rl:auth:credential:',
  resetIp: 'rl:auth:reset-ip:',
  otp: 'rl:auth:otp:',
  email: 'rl:auth:email:',
  api: 'rl:api:'
});

// These routes have exactly one purpose-built authentication limiter. Keep
// them out of the generic API limiter as well: consuming both counters makes
// a single login/MFA attempt appear twice and can exhaust the wrong budget.
const EXACT_AUTH_LIMIT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/admin/login',
  '/api/auth/google',
  '/api/auth/apple',
  '/api/auth/social/link',
  '/api/auth/reset-password',
  '/api/auth/login/mfa',
  '/api/auth/admin/login/mfa',
  '/api/auth/verify-email-otp',
  '/api/auth/verify-email',
  '/api/auth/verify-phone',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/resend-email-otp',
  '/api/auth/resend-email-verification',
]);

const authRateLimitResponse = Object.freeze({
  success: false,
  message: 'Too many authentication attempts. Please try again later.'
});

const apiRateLimitResponse = Object.freeze({
  success: false,
  message: 'Too many requests. Please try again later.'
});

const otpRateLimitResponse = Object.freeze({
  success: false,
  message: 'Too many verification attempts. Please try again later.'
});

const emailRateLimitResponse = Object.freeze({
  success: false,
  message: 'Too many email requests. Please try again later.'
});
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

const makeRateLimitStore = (redisReady, prefix) =>
  redisReady
    ? {
        store: new RedisStore({
          prefix,
          sendCommand: (...args) => getRedisClient().sendCommand(args)
        })
      }
    : {};

const createRateLimitStores = (redisReady) => ({
  credential: makeRateLimitStore(redisReady, RATE_LIMIT_STORE_PREFIXES.credential),
  resetIp: makeRateLimitStore(redisReady, RATE_LIMIT_STORE_PREFIXES.resetIp),
  otp: makeRateLimitStore(redisReady, RATE_LIMIT_STORE_PREFIXES.otp),
  email: makeRateLimitStore(redisReady, RATE_LIMIT_STORE_PREFIXES.email),
  api: makeRateLimitStore(redisReady, RATE_LIMIT_STORE_PREFIXES.api)
});

const getRateLimitClientIp = (req) =>
  req.validatedClientIp || getValidatedClientIp(req);

const rateLimitKeyGenerator = (req) => rateLimit.ipKeyGenerator(getRateLimitClientIp(req));

const normalizeRequestPath = (path = '') => {
  const rawPath = String(path || '').split('?')[0];
  return rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
};

const normalizedPathForRequest = (req) => normalizeRequestPath(req.originalUrl || req.path);

const getBearerOrUserCookieToken = (req) => {
  const authorization = String(req.headers?.authorization || '').trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer.trim();

  const cookie = String(req.headers?.cookie || '');
  const userCookie = cookie.match(/(?:^|;\s*)__Host-menorah-user=([^;]+)/)?.[1];
  if (!userCookie) return '';
  try {
    return decodeURIComponent(userCookie);
  } catch {
    return userCookie;
  }
};

const getRateLimitSubject = (req) => {
  // Social linking is a re-authentication operation. The email belongs to the
  // provider identity and is optional, so it must not let a caller select a
  // fresh limiter bucket for every current-password guess. Limit by the
  // authenticated session token instead (then hash before it reaches Redis).
  const isSocialLink = normalizedPathForRequest(req) === '/api/auth/social/link';
  const subject = String(
    (isSocialLink && getBearerOrUserCookieToken(req))
    || req.body?.email
    || req.body?.challengeId
    || req.body?.ticket
    || req.body?.token
    || req.body?.credential?.slice?.(0, 64)
    || req.body?.identityToken?.slice?.(0, 64)
    || 'anonymous'
  ).trim().slice(0, 128);
  const raw = isSocialLink ? subject : subject.toLowerCase();
  // Redis key names are operational data; never write reset/provider tokens
  // or email addresses into them in clear text.
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
};

const authRateLimitKeyGenerator = (req) => `${rateLimitKeyGenerator(req)}:${getRateLimitSubject(req)}`;

const mountExactLimiter = (app, routePath, limiter, method) => {
  app.use((req, res, next) => {
    const requestPath = normalizedPathForRequest(req);
    if (requestPath !== routePath) return next();
    if (method && req.method !== method) return next();
    return limiter(req, res, next);
  });
};

const mountRateLimiters = (app, { redisReady }) => {
  const stores = createRateLimitStores(redisReady);
  const credentialLimiter = rateLimit({
    ...stores.credential,
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.CREDENTIAL_RATE_LIMIT_MAX || process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
    keyGenerator: authRateLimitKeyGenerator,
    // An object makes express-rate-limit send JSON, so clients can show the
    // throttle reason instead of treating the response as a generic failure.
    message: authRateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost
  });

  // Reset tokens are part of the credential limiter subject, which is useful
  // for retries but could otherwise let an attacker select a new bucket for
  // every random token. This second ceiling is keyed only by client IP.
  const resetIpLimiter = rateLimit({
    ...stores.resetIp,
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RESET_PASSWORD_IP_RATE_LIMIT_MAX, 10) || 30,
    keyGenerator: rateLimitKeyGenerator,
    message: authRateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost,
  });

  const otpLimiter = rateLimit({
    ...stores.otp,
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.OTP_MFA_RATE_LIMIT_MAX, 10) || 10,
    keyGenerator: authRateLimitKeyGenerator,
    message: otpRateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost,
  });

  const emailLimiter = rateLimit({
    ...stores.email,
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.EMAIL_ACTION_RATE_LIMIT_MAX, 10) || 5,
    keyGenerator: authRateLimitKeyGenerator,
    message: emailRateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost,
  });

  const apiLimiter = rateLimit({
    ...stores.api,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
    keyGenerator: rateLimitKeyGenerator,
    message: apiRateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isLocalhost() || EXACT_AUTH_LIMIT_PATHS.has(normalizedPathForRequest(req))
  });

  mountExactLimiter(app, '/api/auth/reset-password', resetIpLimiter, 'POST');
  [
    '/api/auth/login',
    '/api/auth/admin/login',
    '/api/auth/google',
    '/api/auth/apple',
    '/api/auth/social/link',
    '/api/auth/reset-password',
  ].forEach((routePath) => mountExactLimiter(app, routePath, credentialLimiter));
  [
    '/api/auth/login/mfa',
    '/api/auth/admin/login/mfa',
    '/api/auth/verify-email-otp',
    '/api/auth/verify-email',
    '/api/auth/verify-phone',
  ].forEach((routePath) => mountExactLimiter(app, routePath, otpLimiter));
  [
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/resend-email-otp',
    '/api/auth/resend-email-verification',
  ].forEach((routePath) => mountExactLimiter(app, routePath, emailLimiter));
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
  createRateLimitStores,
  getRateLimitClientIp,
  mountRateLimiters,
  RATE_LIMIT_STORE_PREFIXES,
  mountExactLimiter,
  authRateLimitKeyGenerator,
  getRateLimitSubject,
  normalizeRequestPath,
  normalizedPathForRequest,
  EXACT_AUTH_LIMIT_PATHS
};
