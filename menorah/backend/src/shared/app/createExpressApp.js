const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { mountHealthEndpoints } = require('./health');

const getAllowedOrigins = () =>
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
});

const createExpressApp = ({ serviceName, getHealthState }) => {
  const app = express();
  const corsOrigin = createCorsOrigin();
  const corsOptions = createCorsOptions(corsOrigin);

  app.set('trust proxy', 1);
  app.set('serviceName', serviceName);

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false
    })
  );

  app.use('/api/video/livekit-webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use('/api/payments/razorpay-webhook', express.raw({ type: 'application/json', limit: '1mb' }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression());
  if (process.env.NODE_ENV !== 'test') {
    app.use(process.env.NODE_ENV === 'development' ? morgan('dev') : morgan('combined'));
  }
  app.use('/uploads', express.static(path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads')));

  mountHealthEndpoints(app, { getState: getHealthState });
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
  getAllowedOrigins
};
