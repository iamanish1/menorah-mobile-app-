const MIN_JWT_SECRET_LENGTH = 64;
const { getTrustedWebSessionOrigins } = require('../../config/webSessions');

const requireEnv = (key, errors) => {
  if (!process.env[key]) {
    errors.push(`${key} is missing`);
  }
};

const validateStartupEnv = ({ serviceName, requirePaymentEnv = true } = {}) => {
  const errors = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET is missing or shorter than ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  requireEnv('MONGODB_URI', errors);

  if (process.env.NODE_ENV === 'production') {
    ['ALLOWED_ORIGINS', 'REDIS_URL', 'RESEND_API_KEY', 'EMAIL_FROM'].forEach((key) =>
      requireEnv(key, errors)
    );

    ['WEB_SESSION_ORIGINS', 'SESSION_COOKIE_DOMAIN'].forEach((key) =>
      requireEnv(key, errors)
    );

    const webSessionRoles = new Set(getTrustedWebSessionOrigins().values());
    ['user', 'counsellor', 'admin'].forEach((role) => {
      if (!webSessionRoles.has(role)) {
        errors.push(`WEB_SESSION_ORIGINS must include a trusted ${role} origin`);
      }
    });

    if (requirePaymentEnv) {
      ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'].forEach((key) =>
        requireEnv(key, errors)
      );
    }

    ['LIVEKIT_URL', 'LIVEKIT_API_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].forEach((key) =>
      requireEnv(key, errors)
    );
  }

  if (errors.length > 0) {
    throw new Error(`Startup validation failed for ${serviceName || 'service'}: ${errors.join('; ')}`);
  }
};

module.exports = {
  validateStartupEnv
};
