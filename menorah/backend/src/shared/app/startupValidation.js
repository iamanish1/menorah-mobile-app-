const MIN_JWT_SECRET_LENGTH = 64;
const MAX_ADMIN_JWT_SECONDS = 30 * 60;
const { getTrustedWebSessionOrigins } = require('../../config/webSessions');
const { MAX_SINGLE_PAYOUT_PAISE } = require('../../config/payout');
const {
  FACE_CHECK_CONSENT_VERSION,
  FACE_CHECK_RETENTION_DAYS,
} = require('../../config/kyc');
const {
  readCounsellorVerificationConfig,
} = require('../../config/counsellorVerification');
const {
  BOOKING_PAYMENT_INITIATION_ENV,
  PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS_ENV,
  PAYOUT_INITIATION_ENV,
  SUBSCRIPTION_PAYMENT_FLOW_ENV,
  getPaymentWebhookMaxProcessingAttempts,
  getRazorpayPayoutConfigurationState,
  isUsableRazorpayKeyId,
  isUsablePayoutAccountNumber,
  isUsablePaymentSecret,
} = require('../../config/paymentFeatures');
const { parseBookingServiceCatalog } = require('../../services/bookingPricing');

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

const requireExactInteger = (key, expected, errors) => {
  const raw = String(process.env[key] || '').trim();
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value !== expected) {
    errors.push(`${key} must equal ${expected}`);
  }
};

const requireExactValue = (key, expected, errors) => {
  if (String(process.env[key] || '').trim() !== expected) {
    errors.push(`${key} must equal ${expected}`);
  }
};

const requireRazorpayKeyId = (key, errors) => {
  if (!isUsableRazorpayKeyId(process.env[key])) {
    errors.push(`${key} must be a non-placeholder Razorpay key ID`);
  }
};

const requireRazorpaySecret = (key, errors) => {
  if (!isUsablePaymentSecret(process.env[key])) {
    errors.push(`${key} must contain 16-256 non-placeholder characters`);
  }
};

const requireRazorpayPayoutAccount = (key, errors) => {
  if (!isUsablePayoutAccountNumber(process.env[key])) {
    errors.push(`${key} must be a non-placeholder RazorpayX account number`);
  }
};

const validateOptionalPreviousWebhookSecret = (errors) => {
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS;
  if (previous === undefined || previous === '') return;
  if (!isUsablePaymentSecret(previous)) {
    errors.push(
      'RAZORPAY_WEBHOOK_SECRET_PREVIOUS must contain 16-256 non-placeholder characters when set'
    );
    return;
  }
  if (previous === process.env.RAZORPAY_WEBHOOK_SECRET) {
    errors.push(
      'RAZORPAY_WEBHOOK_SECRET_PREVIOUS must differ from RAZORPAY_WEBHOOK_SECRET'
    );
  }
};

const validatePaymentFeatureFlags = (errors) => {
  const bookingValue = process.env[BOOKING_PAYMENT_INITIATION_ENV];
  if (
    bookingValue !== undefined
    && bookingValue !== ''
    && bookingValue !== 'true'
    && bookingValue !== 'false'
  ) {
    errors.push(`${BOOKING_PAYMENT_INITIATION_ENV} must be exactly true or false when set`);
  }

  const subscriptionValue = process.env[SUBSCRIPTION_PAYMENT_FLOW_ENV];
  if (
    subscriptionValue !== undefined
    && subscriptionValue !== ''
    && subscriptionValue !== 'false'
  ) {
    errors.push(`${SUBSCRIPTION_PAYMENT_FLOW_ENV} must remain false`);
  }

  const retryLimitRaw = process.env[PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS_ENV];
  const retryLimit = getPaymentWebhookMaxProcessingAttempts(process.env);
  if (retryLimitRaw !== undefined && retryLimitRaw !== '' && retryLimit === null) {
    errors.push(
      `${PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS_ENV} must be an integer from 1 to 1000 when set`
    );
  }
  if (bookingValue === 'true' && retryLimit === null) {
    errors.push(
      `${PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS_ENV} is required before booking payments can be enabled`
    );
  }

  const payoutValue = process.env[PAYOUT_INITIATION_ENV];
  if (
    payoutValue !== undefined
    && payoutValue !== ''
    && payoutValue !== 'true'
    && payoutValue !== 'false'
  ) {
    errors.push(`${PAYOUT_INITIATION_ENV} must be exactly true or false when set`);
  }
};

const validatePayoutConfiguration = ({ serviceName, errors }) => {
  if (serviceName !== 'api-admin') return;

  // The canonical payout webhook remains available while initiation is off so
  // delayed provider events can still reconcile safely.
  requireRazorpaySecret('RAZORPAY_X_WEBHOOK_SECRET', errors);

  if (process.env[PAYOUT_INITIATION_ENV] !== 'true') return;

  requireRazorpayKeyId('RAZORPAY_X_KEY_ID', errors);
  requireRazorpaySecret('RAZORPAY_X_KEY_SECRET', errors);
  requireRazorpayPayoutAccount('RAZORPAY_PAYOUT_ACCOUNT_NUMBER', errors);

  const payoutConfiguration = getRazorpayPayoutConfigurationState(process.env);
  if (!payoutConfiguration.executionConfigured) {
    errors.push('RazorpayX payout execution configuration is incomplete');
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
    requireExactInteger('MAX_PAYOUT_AMOUNT_PAISE', MAX_SINGLE_PAYOUT_PAISE, errors);
    requireExactInteger('KYC_RETENTION_DAYS', FACE_CHECK_RETENTION_DAYS, errors);
    requireExactValue('KYC_CONSENT_VERSION', FACE_CHECK_CONSENT_VERSION, errors);

    const counsellorVerificationConfig = readCounsellorVerificationConfig(process.env);
    counsellorVerificationConfig.invalidFields.forEach((key) => {
      errors.push(`${key} must contain an approved non-placeholder value`);
    });

    if (['api-ios', 'api-android', 'api-web', 'api-admin'].includes(serviceName)) {
      requireMinimumLength('DATA_ENCRYPTION_KEY', 32, errors);
    }
    if (process.env.DATA_ENCRYPTION_KEY
      && process.env.DATA_ENCRYPTION_KEY === process.env.AUDIT_LOG_SIGNING_KEY) {
      errors.push('DATA_ENCRYPTION_KEY and AUDIT_LOG_SIGNING_KEY must be distinct');
    }

    requireEnv('WEB_SESSION_ORIGINS', errors);

    try {
      parseBookingServiceCatalog(process.env.BOOKING_SERVICE_CATALOG_JSON);
    } catch (error) {
      errors.push(error.message);
    }

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
      requireRazorpayKeyId('RAZORPAY_KEY_ID', errors);
      requireRazorpaySecret('RAZORPAY_KEY_SECRET', errors);
      requireRazorpaySecret('RAZORPAY_WEBHOOK_SECRET', errors);
      validateOptionalPreviousWebhookSecret(errors);
      validatePaymentFeatureFlags(errors);
      validatePayoutConfiguration({ serviceName, errors });
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
