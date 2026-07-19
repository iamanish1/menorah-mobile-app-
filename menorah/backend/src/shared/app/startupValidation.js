const MIN_JWT_SECRET_LENGTH = 64;
const MAX_ADMIN_JWT_SECONDS = 30 * 60;
const { getTrustedWebSessionOrigins } = require('../../config/webSessions');

const requireEnv = (key, errors) => {
  if (!process.env[key]) {
    errors.push(`${key} is missing`);
  }
};

const requireMinimumLength = (key, minimum, errors) => {
  const value = String(process.env[key] || '').trim();
  if (value.length < minimum || /^REPLACE/i.test(value)) {
    errors.push(`${key} must contain at least ${minimum} non-placeholder characters`);
  }
};

const requireIntegerInRange = (key, minimum, maximum, errors) => {
  const raw = String(process.env[key] || '').trim();
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    errors.push(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
};

const parseDurationSeconds = (value) => {
  const match = String(value || '').trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) return null;
  const multipliers = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
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
    requireMinimumLength('AUDIT_LOG_SIGNING_KEY', 32, errors);
    requireIntegerInRange('MAX_PAYOUT_AMOUNT_PAISE', 100, Number.MAX_SAFE_INTEGER, errors);
    requireIntegerInRange('KYC_RETENTION_DAYS', 365, 36500, errors);
    requireMinimumLength('KYC_CONSENT_VERSION', 1, errors);
    if (String(process.env.KYC_CONSENT_VERSION || '').trim().length > 64) {
      errors.push('KYC_CONSENT_VERSION must be 64 characters or fewer');
    }

    if (['api-ios', 'api-android', 'api-web', 'api-admin'].includes(serviceName)) {
      requireMinimumLength('DATA_ENCRYPTION_KEY', 32, errors);
    }
    if (process.env.DATA_ENCRYPTION_KEY
      && process.env.DATA_ENCRYPTION_KEY === process.env.AUDIT_LOG_SIGNING_KEY) {
      errors.push('DATA_ENCRYPTION_KEY and AUDIT_LOG_SIGNING_KEY must be distinct');
    }

    requireEnv('WEB_SESSION_ORIGINS', errors);

    if (process.env.ADMIN_MFA_REQUIRED !== 'true') {
      errors.push('ADMIN_MFA_REQUIRED must be true in production');
    }

    const adminSessionSeconds = parseDurationSeconds(process.env.ADMIN_JWT_EXPIRES_IN || '30m');
    if (!adminSessionSeconds || adminSessionSeconds > MAX_ADMIN_JWT_SECONDS) {
      errors.push('ADMIN_JWT_EXPIRES_IN must be a duration of 30m or less in production');
    }

    if (process.env.SESSION_COOKIE_DOMAIN) {
      errors.push('SESSION_COOKIE_DOMAIN must be unset for host-only __Host- session cookies');
    }

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
  validateStartupEnv,
  parseDurationSeconds,
};
