const path = require('path');
const net = require('net');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { mountHealthEndpoints } = require('./health');
const { csrfProtection, getTrustedWebOrigins } = require('../../config/webSessions');
const { renderSecurityMetrics, securityAuditTrail } = require('../../utils/securityAudit');
const { attachValidatedRequestProvenance } = require('./requestProvenance');

const SAFE_INLINE_UPLOAD_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.mp3',
  '.m4a',
  '.mp4',
  '.webm',
  '.ogg',
  '.wav',
]);

const getAllowedOrigins = () => {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return Array.from(new Set([...configuredOrigins, ...getTrustedWebOrigins()]));
};

const createCorsOrigin = () => {
  const allowedOrigins = getAllowedOrigins();

  return (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  };
};

const createCorsOptions = (corsOrigin) => ({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'X-Requested-With',
    'X-Auth-Transport',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
});

const getTrustProxySetting = () => {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === null || raw === '') return false;

  const value = String(raw).trim().toLowerCase();
  if (['false', '0', 'off', 'no'].includes(value)) return false;
  if (process.env.NODE_ENV === 'production') {
    if (!net.isIP(value)) {
      throw new Error(
        'TRUST_PROXY must be the exact immediate reverse-proxy IP in production'
      );
    }
    return value;
  }

  if (['true', 'on', 'yes'].includes(value)) return true;
  const hops = Number.parseInt(value, 10);
  return Number.isFinite(hops) && hops >= 0 ? hops : raw;
};

const createExpressApp = ({ serviceName, getHealthState }) => {
  const app = express();
  const corsOrigin = createCorsOrigin();
  const corsOptions = createCorsOptions(corsOrigin);

  app.set('trust proxy', getTrustProxySetting());
  app.set('serviceName', serviceName);

  app.use(attachValidatedRequestProvenance);
  app.use(securityAuditTrail);

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          connectSrc: ["'none'"],
          fontSrc: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          frameSrc: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          mediaSrc: ["'none'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          workerSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
      }
    })
  );

  app.use('/api/video/livekit-webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use('/api/payments/razorpay-webhook', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use('/api/payouts/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use('/api/email/resend', express.raw({ type: 'application/json', limit: '256kb' }));
  app.use(csrfProtection);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression());
  if (process.env.NODE_ENV !== 'test') {
    const isHealthRequest = (req) => (
      req.path === '/health'
      || req.path === '/health/live'
      || req.path === '/health/ready'
      || req.path === '/health/deep'
    );
    morgan.token('safe-path', (req) => String(req.originalUrl || req.url || '/').split('?')[0]);
    app.use(process.env.NODE_ENV === 'development'
      ? morgan(':method :safe-path :status :response-time ms')
      : morgan(':remote-addr :method :safe-path :status :res[content-length] :response-time ms', { skip: isHealthRequest }));
  }
  app.use('/uploads', express.static(
    path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads'),
    {
      fallthrough: false,
      setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        if (!SAFE_INLINE_UPLOAD_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', 'attachment');
        }
      }
    }
  ));

  mountHealthEndpoints(app, { getState: getHealthState });
  app.get('/metrics/security', (_req, res) => {
    res.type('text/plain; version=0.0.4').send(renderSecurityMetrics());
  });
  app.get('/api/welcome', (_req, res) =>
    res.json({ success: true, message: 'Welcome to Menorah Health API', version: '1.0.0' })
  );

  return {
    app,
    corsOrigin,
    corsOptions,
    allowedOrigins: getAllowedOrigins()
  };
};

module.exports = {
  createExpressApp,
  createCorsOrigin,
  createCorsOptions,
  getAllowedOrigins,
  getTrustProxySetting
};
