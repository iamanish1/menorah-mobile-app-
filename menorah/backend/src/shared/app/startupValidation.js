const MIN_JWT_SECRET_LENGTH = 64;
const MAX_ADMIN_JWT_SECONDS = 30 * 60;
const CANONICAL_PASSWORD_RESET_BASE_URL = 'https://app.menorah.me';
const CANONICAL_CHECKOUT_RETURN_URL =
  'https://app.menorah.me/checkout/callback';
const {
  DEPLOYMENT_ENVIRONMENTS,
  LOCAL_STAGING_HTTPS_PORT_ENV,
  SERVER_STAGING_ENVIRONMENT_ID_ENV,
  SERVER_STAGING_VALIDATION_HTTPS_PORT,
  getDeploymentEnvironment,
  isExactServerStagingValidationSelector,
  isExactServerStagingSyntheticRuntime,
  validateStagingEnvironmentIsolation,
} = require('../../config/deploymentEnvironment');
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
const {
  PRIVACY_RETENTION_EXECUTION_ENV,
  readPrivacyConfiguration,
} = require('../../config/privacy');
const {
  readPrivacyAdminPermissionConfiguration,
} = require('../../config/privacyAdminPermissions');
const {
  readAdminRoleConfiguration,
} = require('../../config/adminPermissions');
const {
  validateResendDeliveryConfiguration,
} = require('../../config/emailDelivery');
const {
  validateMediaStorageConfig,
} = require('../../services/mediaStorage');
const {
  resolveNotificationJobsEnabled,
} = require('../../config/workerRuntime');

const SERVER_STAGING_BOOKING_PAYMENT_SERVICE = 'api-ios';
const SERVER_STAGING_PAYOUT_SERVICE = 'api-admin';
const REAL_SERVER_STAGING_PROJECT = 'menorah-staging';
const VALIDATION_SERVER_STAGING_PROJECT =
  'menorah-server-staging-validation';
const SERVER_STAGING_PROVIDER_API_SERVICES = new Set([
  'api-ios',
  'api-android',
  'api-web',
  'api-admin',
]);
const BOOKING_PAYMENT_PROVIDER_ENV_KEYS = Object.freeze([
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_WEBHOOK_SECRET_PREVIOUS',
]);
const PAYOUT_PROVIDER_ENV_KEYS = Object.freeze([
  'RAZORPAY_X_KEY_ID',
  'RAZORPAY_X_KEY_SECRET',
  'RAZORPAY_X_WEBHOOK_SECRET',
  'RAZORPAY_PAYOUT_ACCOUNT_NUMBER',
]);
const API_PROVIDER_ENV_KEYS = Object.freeze([
  'RESEND_PROVIDER_ENABLED',
  'RESEND_MODE',
  'RESEND_API_URL',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'EMAIL_FROM',
  'CONTACT_TO_EMAIL',
  'MEDIA_PUBLIC_BASE_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_UPLOAD_PREFIX',
]);
const DISABLED_REAL_RESEND_ENV_KEYS = Object.freeze([
  'RESEND_API_URL',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'EMAIL_FROM',
  'CONTACT_TO_EMAIL',
]);

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

const validateNotificationPushSecurity = ({ serviceName, errors }) => {
  if (serviceName !== 'worker') return;
  if (!resolveNotificationJobsEnabled(process.env)) return;

  const token = String(process.env.EXPO_PUSH_ACCESS_TOKEN || '').trim();
  const placeholder = /(?:replace|placeholder|example|change(?:me)?|todo|your[-_ ]?token)/i;
  if (token.length < 20 || placeholder.test(token)) {
    errors.push(
      'EXPO_PUSH_ACCESS_TOKEN must contain a non-placeholder protected token when the active worker enables notification jobs'
    );
  }
};

const validateAppleSignInConfig = ({ deploymentEnvironment, errors }) => {
  const enabled = String(process.env.APPLE_SIGN_IN_ENABLED || '').trim();

  if (deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.PRODUCTION) {
    requireExactValue('APPLE_SIGN_IN_ENABLED', 'true', errors);
    requireExactValue('APPLE_IOS_BUNDLE_ID', 'com.menorah.health.app', errors);
  } else if (!['true', 'false'].includes(enabled)) {
    errors.push(
      'APPLE_SIGN_IN_ENABLED must be exactly true or false in staging'
    );
  }

  if (
    deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING
    && enabled !== 'true'
  ) return;

  const bundleId = String(process.env.APPLE_IOS_BUNDLE_ID || '').trim();
  if (
    deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING
    && !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/.test(bundleId)
  ) {
    errors.push(
      'APPLE_IOS_BUNDLE_ID must contain a valid bundle identifier when Apple sign-in is enabled'
    );
  }

  if (!/^[A-Z0-9]{10}$/.test(String(process.env.APPLE_TEAM_ID || '').trim())) {
    errors.push('APPLE_TEAM_ID must be a 10-character Apple Team ID');
  }
  if (!/^[A-Z0-9]{10}$/.test(String(process.env.APPLE_KEY_ID || '').trim())) {
    errors.push('APPLE_KEY_ID must be a 10-character Apple key ID');
  }
  const applePrivateKey = String(process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!applePrivateKey.includes('-----BEGIN PRIVATE KEY-----')
    || !applePrivateKey.includes('-----END PRIVATE KEY-----')) {
    errors.push('APPLE_PRIVATE_KEY must contain an Apple PKCS#8 private key');
  }
};

const validateStagingPasswordResetBaseUrl = (errors) => {
  const configuredBase = String(process.env.PASSWORD_RESET_BASE_URL || '').trim();
  if (!configuredBase) {
    errors.push('PASSWORD_RESET_BASE_URL is missing');
    return;
  }

  let parsedBase;
  try {
    parsedBase = new URL(configuredBase);
  } catch {
    errors.push('PASSWORD_RESET_BASE_URL must be a valid HTTPS staging origin');
    return;
  }

  if (parsedBase.protocol !== 'https:') {
    errors.push('PASSWORD_RESET_BASE_URL must use HTTPS in staging');
  }
  if (parsedBase.hostname.toLowerCase().replace(/\.$/, '') === 'app.menorah.me') {
    errors.push(
      `PASSWORD_RESET_BASE_URL must not use the production origin ${CANONICAL_PASSWORD_RESET_BASE_URL} in staging`
    );
  }
  const localStagingPort = String(
    process.env[LOCAL_STAGING_HTTPS_PORT_ENV] || ''
  ).trim();
  const localPortAllowed = Boolean(
    localStagingPort
    && parsedBase.hostname.toLowerCase().endsWith('.staging.localhost')
    && parsedBase.port === localStagingPort
  );
  const serverStagingValidationPort =
    isExactServerStagingValidationSelector(process.env)
      ? SERVER_STAGING_VALIDATION_HTTPS_PORT
      : '';
  const serverStagingValidationPortAllowed = Boolean(
    serverStagingValidationPort
    && parsedBase.hostname.toLowerCase()
      === String(process.env.APP_DOMAIN || '').trim().toLowerCase()
    && parsedBase.port === serverStagingValidationPort
  );
  if (
    parsedBase.username
    || parsedBase.password
    || parsedBase.search
    || parsedBase.hash
    || (
      (localStagingPort || serverStagingValidationPort || parsedBase.port)
      && !localPortAllowed
      && !serverStagingValidationPortAllowed
    )
    || configuredBase !== parsedBase.origin
  ) {
    errors.push('PASSWORD_RESET_BASE_URL must be the exact reviewed staging origin');
  }
};

const validateOptionalIntegerRange = (key, minimum, maximum, errors) => {
  const raw = String(process.env[key] || '').trim();
  if (!raw) return;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    errors.push(`${key} must be an integer from ${minimum} through ${maximum}`);
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

const rejectScopedProviderValues = ({
  keys,
  serviceName,
  ownerService,
  reason,
  errors,
}) => {
  keys.forEach((key) => {
    if (String(process.env[key] || '').trim()) {
      errors.push(
        `${key} must be unset for ${serviceName} in synthetic server `
        + `staging; ${ownerService} ${reason}`
      );
    }
  });
};

const validateServerStagingPaymentScopes = ({
  serviceName,
  errors,
}) => {
  if (!isExactServerStagingSyntheticRuntime(process.env)) return false;

  validatePaymentFeatureFlags(errors);

  const bookingPaymentsEnabled =
    process.env[BOOKING_PAYMENT_INITIATION_ENV] === 'true';
  const payoutsEnabled =
    process.env[PAYOUT_INITIATION_ENV] === 'true';
  const ownsBookingPayments =
    serviceName === SERVER_STAGING_BOOKING_PAYMENT_SERVICE;
  const ownsPayouts = serviceName === SERVER_STAGING_PAYOUT_SERVICE;

  if (!ownsBookingPayments) {
    if (bookingPaymentsEnabled) {
      errors.push(
        `${BOOKING_PAYMENT_INITIATION_ENV} must equal false outside `
        + `${SERVER_STAGING_BOOKING_PAYMENT_SERVICE} in synthetic `
        + 'server staging'
      );
    }
    rejectScopedProviderValues({
      keys: BOOKING_PAYMENT_PROVIDER_ENV_KEYS,
      serviceName,
      ownerService: SERVER_STAGING_BOOKING_PAYMENT_SERVICE,
      reason: 'exclusively owns booking payment credentials',
      errors,
    });
  } else if (bookingPaymentsEnabled) {
    requireRazorpayKeyId('RAZORPAY_KEY_ID', errors);
    requireRazorpaySecret('RAZORPAY_KEY_SECRET', errors);
    requireRazorpaySecret('RAZORPAY_WEBHOOK_SECRET', errors);
    validateOptionalPreviousWebhookSecret(errors);
  } else {
    rejectScopedProviderValues({
      keys: BOOKING_PAYMENT_PROVIDER_ENV_KEYS,
      serviceName,
      ownerService: SERVER_STAGING_BOOKING_PAYMENT_SERVICE,
      reason: 'may receive them only while booking payments are enabled',
      errors,
    });
  }

  if (!ownsPayouts) {
    if (payoutsEnabled) {
      errors.push(
        `${PAYOUT_INITIATION_ENV} must equal false outside `
        + `${SERVER_STAGING_PAYOUT_SERVICE} in synthetic server staging`
      );
    }
    rejectScopedProviderValues({
      keys: PAYOUT_PROVIDER_ENV_KEYS,
      serviceName,
      ownerService: SERVER_STAGING_PAYOUT_SERVICE,
      reason: 'exclusively owns payout credentials',
      errors,
    });
  } else if (payoutsEnabled) {
    validatePayoutConfiguration({ serviceName, errors });
  } else {
    rejectScopedProviderValues({
      keys: PAYOUT_PROVIDER_ENV_KEYS,
      serviceName,
      ownerService: SERVER_STAGING_PAYOUT_SERVICE,
      reason: 'may receive them only while payouts are enabled',
      errors,
    });
  }

  return true;
};

const validateServerStagingApiProviderScopes = ({
  serviceName,
  errors,
}) => {
  if (!isExactServerStagingSyntheticRuntime(process.env)) return false;

  const ownsApiProviders =
    SERVER_STAGING_PROVIDER_API_SERVICES.has(serviceName);
  if (ownsApiProviders) return true;

  rejectScopedProviderValues({
    keys: API_PROVIDER_ENV_KEYS,
    serviceName,
    ownerService: 'api-ios/api-android/api-web/api-admin',
    reason: 'exclusively own email and managed-media provider configuration',
    errors,
  });
  if (
    String(process.env.MEDIA_STORAGE_BACKEND || '').trim()
      .toLowerCase() === 'cloudinary'
  ) {
    errors.push(
      `MEDIA_STORAGE_BACKEND must not equal cloudinary for ${serviceName} `
      + 'in synthetic server staging'
    );
  }

  return false;
};

const validateRealServerStagingResendGate = ({ errors }) => {
  if (!isExactServerStagingSyntheticRuntime(process.env)) return;
  if (
    String(process.env.MENORAH_SERVER_STAGING_PROJECT_NAME || '').trim()
      !== REAL_SERVER_STAGING_PROJECT
  ) return;

  const enabled = String(
    process.env.RESEND_PROVIDER_ENABLED || ''
  ).trim();
  if (!['true', 'false'].includes(enabled)) {
    errors.push(
      'RESEND_PROVIDER_ENABLED must equal true or false in real server staging'
    );
    return;
  }
  if (enabled === 'true') return;

  DISABLED_REAL_RESEND_ENV_KEYS.forEach((key) => {
    if (String(process.env[key] || '').trim()) {
      errors.push(
        `${key} must be unset when RESEND_PROVIDER_ENABLED=false `
        + 'in real server staging'
      );
    }
  });
};

const validateServerStagingProviderGates = ({
  serviceName,
  errors,
}) => {
  if (!isExactServerStagingSyntheticRuntime(process.env)) return;

  requireExactValue('SOCIAL_STUDIO_ENABLED', 'false', errors);
  requireExactValue('SOCIAL_STUDIO_AUTO_PUBLISH', 'false', errors);
  requireExactValue('ENABLE_SOCIAL_SCHEDULER', 'false', errors);

  if (['api-ios', 'worker'].includes(serviceName)) {
    requireExactValue('APPLE_SIGN_IN_ENABLED', 'false', errors);
  }
  if (
    process.env[BOOKING_PAYMENT_INITIATION_ENV] === 'true'
  ) {
    requireExactValue('RAZORPAY_MODE', 'test', errors);
  }
  if (process.env[PAYOUT_INITIATION_ENV] === 'true') {
    requireExactValue('RAZORPAY_X_MODE', 'test', errors);
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
  let deploymentEnvironment = DEPLOYMENT_ENVIRONMENTS.PRODUCTION;

  try {
    deploymentEnvironment = getDeploymentEnvironment(process.env);
  } catch (error) {
    errors.push(error.message);
  }
  if (
    deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING
    && process.env.NODE_ENV !== 'production'
  ) {
    errors.push('DEPLOYMENT_ENVIRONMENT=staging requires NODE_ENV=production');
  }
  if (
    deploymentEnvironment !== DEPLOYMENT_ENVIRONMENTS.STAGING
    && String(process.env[LOCAL_STAGING_HTTPS_PORT_ENV] || '').trim()
  ) {
    errors.push(
      `${LOCAL_STAGING_HTTPS_PORT_ENV} must be unset outside staging`
    );
  }
  if (
    deploymentEnvironment !== DEPLOYMENT_ENVIRONMENTS.STAGING
    && String(process.env[SERVER_STAGING_ENVIRONMENT_ID_ENV] || '').trim()
  ) {
    errors.push(
      `${SERVER_STAGING_ENVIRONMENT_ID_ENV} must be unset outside staging`
    );
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET is missing or shorter than ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  requireEnv('MONGODB_URI', errors);

  if (process.env.NODE_ENV === 'production') {
    validateNotificationPushSecurity({ serviceName, errors });
    const isExactServerStaging =
      isExactServerStagingSyntheticRuntime(process.env);
    const requiresApiProviders = (
      !isExactServerStaging
      || SERVER_STAGING_PROVIDER_API_SERVICES.has(serviceName)
    );
    const serverStagingProject = String(
      process.env.MENORAH_SERVER_STAGING_PROJECT_NAME || ''
    ).trim();
    const isRealServerStaging = (
      isExactServerStaging
      && serverStagingProject === REAL_SERVER_STAGING_PROJECT
    );
    const isValidationServerStaging = (
      isExactServerStaging
      && serverStagingProject === VALIDATION_SERVER_STAGING_PROJECT
    );
    const isRealResendEnabled = (
      isRealServerStaging
      && String(process.env.RESEND_PROVIDER_ENABLED || '').trim()
        === 'true'
    );
    const requiresResendDelivery = (
      !isExactServerStaging
      || (
        SERVER_STAGING_PROVIDER_API_SERVICES.has(serviceName)
        && (isValidationServerStaging || isRealResendEnabled)
      )
    );
    const requiresCheckoutReturnUrl = (
      !isExactServerStaging
      || (
        serviceName === SERVER_STAGING_BOOKING_PAYMENT_SERVICE
        && process.env[BOOKING_PAYMENT_INITIATION_ENV] === 'true'
      )
    );
    if (deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING) {
      errors.push(...validateStagingEnvironmentIsolation(
        process.env,
        isExactServerStaging
          ? {
            requireCheckoutReturnUrl: requiresCheckoutReturnUrl,
            requireEmailRouting: requiresResendDelivery,
            requireMediaPublicBaseUrl: requiresApiProviders,
          }
          : undefined
      ));
    }
    validateServerStagingProviderGates({ serviceName, errors });
    const requiredEnvironmentKeys = [
      'ALLOWED_ORIGINS',
      'REDIS_URL',
    ];
    if (requiresResendDelivery) {
      requiredEnvironmentKeys.push(
        'RESEND_API_KEY',
        'EMAIL_FROM',
        'CONTACT_TO_EMAIL'
      );
    }
    if (requiresCheckoutReturnUrl) {
      requiredEnvironmentKeys.push('CHECKOUT_RETURN_URL');
    }
    requiredEnvironmentKeys.forEach((key) =>
      requireEnv(key, errors)
    );
    if (requiresResendDelivery) {
      errors.push(...validateResendDeliveryConfiguration(process.env));
    } else if (!requiresApiProviders) {
      validateServerStagingApiProviderScopes({ serviceName, errors });
    } else if (isRealServerStaging) {
      validateRealServerStagingResendGate({ errors });
    }
    if (
      isExactServerStaging
      && !requiresCheckoutReturnUrl
      && String(process.env.CHECKOUT_RETURN_URL || '').trim()
    ) {
      errors.push(
        `CHECKOUT_RETURN_URL must be unset for ${serviceName} when `
        + 'server-staging booking initiation is not owned and enabled'
      );
    }
    requireMinimumLength('AUDIT_LOG_SIGNING_KEY', 32, errors);
    if (serviceName === 'api-web' && requiresResendDelivery) {
      requireMinimumLength('RESEND_WEBHOOK_SECRET', 24, errors);
    }
    validateOptionalIntegerRange('SECURITY_AUDIT_PENDING_MAX', 128, 8192, errors);
    requireExactInteger('MAX_PAYOUT_AMOUNT_PAISE', MAX_SINGLE_PAYOUT_PAISE, errors);
    requireExactInteger('KYC_RETENTION_DAYS', FACE_CHECK_RETENTION_DAYS, errors);
    requireExactValue('KYC_CONSENT_VERSION', FACE_CHECK_CONSENT_VERSION, errors);

    const counsellorVerificationConfig = readCounsellorVerificationConfig(process.env);
    counsellorVerificationConfig.invalidFields.forEach((key) => {
      errors.push(`${key} must contain an approved non-placeholder value`);
    });

    const privacyConfig = readPrivacyConfiguration(process.env);
    privacyConfig.invalidFields.forEach((key) => {
      errors.push(`${key} must contain an explicit approved privacy configuration`);
    });
    if (!['true', 'false'].includes(process.env[PRIVACY_RETENTION_EXECUTION_ENV])) {
      errors.push(`${PRIVACY_RETENTION_EXECUTION_ENV} must be exactly true or false in production`);
    }
    const privacyAdminPermissions =
      readPrivacyAdminPermissionConfiguration(process.env);
    privacyAdminPermissions.invalidFields.forEach((key) => {
      errors.push(
        `${key} must explicitly assign every privacy function to approved admin IDs`
      );
    });
    if (serviceName === 'api-admin') {
      const adminRoles = readAdminRoleConfiguration(process.env);
      adminRoles.invalidFields.forEach((key) => {
        errors.push(
          `${key} must explicitly assign approved admin IDs to operational roles`
        );
      });
    }

    if (['api-ios', 'api-android', 'api-web', 'api-admin', 'worker'].includes(serviceName)) {
      requireMinimumLength('DATA_ENCRYPTION_KEY', 32, errors);
    }
    if (process.env.DATA_ENCRYPTION_KEY
      && process.env.DATA_ENCRYPTION_KEY === process.env.AUDIT_LOG_SIGNING_KEY) {
      errors.push('DATA_ENCRYPTION_KEY and AUDIT_LOG_SIGNING_KEY must be distinct');
    }

    if (['api-ios', 'worker'].includes(serviceName)) {
      validateAppleSignInConfig({ deploymentEnvironment, errors });
    }

    requireEnv('WEB_SESSION_ORIGINS', errors);
    if (deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING) {
      validateStagingPasswordResetBaseUrl(errors);
    } else {
      requireExactValue(
        'PASSWORD_RESET_BASE_URL',
        CANONICAL_PASSWORD_RESET_BASE_URL,
        errors
      );
      requireExactValue(
        'CHECKOUT_RETURN_URL',
        CANONICAL_CHECKOUT_RETURN_URL,
        errors
      );
    }
    if (String(process.env.PASSWORD_RESET_URL_TEMPLATE || '').trim()) {
      errors.push('PASSWORD_RESET_URL_TEMPLATE must be unset in production');
    }

    if (requiresApiProviders) {
      const mediaStorage = validateMediaStorageConfig(process.env);
      errors.push(...mediaStorage.errors);
    }
    if (String(process.env.COUNSELLOR_MEDIA_STORAGE || '').trim()) {
      errors.push(
        'COUNSELLOR_MEDIA_STORAGE must be unset; MEDIA_STORAGE_BACKEND is the single production media-storage selector'
      );
    }
    if (String(process.env.SOCIAL_STUDIO_STORAGE || '').trim()) {
      errors.push(
        'SOCIAL_STUDIO_STORAGE must be unset; MEDIA_STORAGE_BACKEND is the single production media-storage selector'
      );
    }

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

    const hasServerStagingPaymentScopes =
      validateServerStagingPaymentScopes({ serviceName, errors });
    if (requirePaymentEnv && !hasServerStagingPaymentScopes) {
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
