const BOOKING_PAYMENT_INITIATION_ENV = 'BOOKING_PAYMENTS_ENABLED';
const PAYOUT_INITIATION_ENV = 'PAYOUTS_ENABLED';
const SUBSCRIPTION_PAYMENT_FLOW_ENV = 'SUBSCRIPTION_PAYMENTS_ENABLED';
const PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS_ENV =
  'PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS';
const PAYMENT_PLACEHOLDER_PATTERN =
  /(?:^|[^a-z0-9])(?:replace|placeholder|change[_-]?me|your|example|dummy|local)(?:[^a-z0-9]|$)/i;
const RAZORPAY_KEY_ID_PATTERN = /^rzp_(?:test|live)_[A-Za-z0-9]{8,64}$/;

const isBookingPaymentInitiationEnabled = (env = process.env) =>
  env[BOOKING_PAYMENT_INITIATION_ENV] === 'true'
  && getPaymentWebhookMaxProcessingAttempts(env) !== null;

const isPayoutInitiationEnabled = (env = process.env) =>
  env[PAYOUT_INITIATION_ENV] === 'true';

// Subscription purchases do not yet have the durable attempt and reconciliation
// guarantees required for money movement. Keep both initiation and verification
// unavailable until that flow is implemented and reviewed.
const isSubscriptionPaymentFlowEnabled = () => false;

const getPaymentWebhookMaxProcessingAttempts = (env = process.env) => {
  const raw = env[PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS_ENV];
  if (typeof raw !== 'string' || !/^[1-9]\d{0,3}$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed <= 1000 ? parsed : null;
};

const isObviousPaymentPlaceholder = (value) => {
  const candidate = String(value || '');
  const razorpayDefault = /^razorpay[-_](?:key|secret|webhook)$/i.test(candidate);
  const repeatedCharacter = candidate.length > 0
    && new Set(candidate.toLowerCase()).size === 1;

  return PAYMENT_PLACEHOLDER_PATTERN.test(candidate)
    || razorpayDefault
    || repeatedCharacter;
};

const isUsableRazorpayKeyId = (value) => {
  if (typeof value !== 'string') return false;
  const raw = String(value || '');
  const candidate = raw.trim();
  const keySuffix = candidate.split('_').pop() || '';
  const repeatedSuffix = keySuffix.length > 0
    && new Set(keySuffix.toLowerCase()).size === 1;

  return raw === candidate
    && RAZORPAY_KEY_ID_PATTERN.test(candidate)
    && !isObviousPaymentPlaceholder(candidate)
    && !repeatedSuffix;
};

const isUsablePaymentSecret = (
  value,
  { minLength = 16, maxLength = 256 } = {}
) => {
  if (typeof value !== 'string') return false;
  const raw = String(value || '');
  const candidate = raw.trim();

  return raw === candidate
    && candidate.length >= minLength
    && candidate.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(candidate)
    && !isObviousPaymentPlaceholder(candidate);
};

const isUsablePayoutAccountNumber = (value) => {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();

  return value === candidate
    && /^\d{6,32}$/.test(candidate)
    && !isObviousPaymentPlaceholder(candidate)
    && new Set(candidate).size > 1;
};

const getRazorpayConfigurationState = (env = process.env) => {
  const keyIdUsable = isUsableRazorpayKeyId(env.RAZORPAY_KEY_ID);
  const keySecretUsable = isUsablePaymentSecret(env.RAZORPAY_KEY_SECRET);
  const webhookSecretUsable = isUsablePaymentSecret(env.RAZORPAY_WEBHOOK_SECRET);
  const previousWebhookSecretPresent = env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS !== undefined
    && env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS !== '';
  const previousWebhookSecretUsable = previousWebhookSecretPresent
    && isUsablePaymentSecret(env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS)
    && env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS !== env.RAZORPAY_WEBHOOK_SECRET;
  const webhookRotationConfigurationValid = !previousWebhookSecretPresent
    || previousWebhookSecretUsable;

  return {
    keyIdUsable,
    keySecretUsable,
    webhookSecretUsable,
    previousWebhookSecretPresent,
    previousWebhookSecretUsable,
    webhookRotationConfigurationValid,
    checkoutConfigured: keyIdUsable && keySecretUsable,
    webhookConfigured: webhookSecretUsable && webhookRotationConfigurationValid,
  };
};

const getRazorpayPayoutConfigurationState = (env = process.env) => {
  const keyIdUsable = isUsableRazorpayKeyId(env.RAZORPAY_X_KEY_ID);
  const keySecretUsable = isUsablePaymentSecret(env.RAZORPAY_X_KEY_SECRET);
  const accountNumberUsable = isUsablePayoutAccountNumber(
    env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER
  );
  const webhookSecretUsable = isUsablePaymentSecret(
    env.RAZORPAY_X_WEBHOOK_SECRET
  );

  return {
    keyIdUsable,
    keySecretUsable,
    accountNumberUsable,
    webhookSecretUsable,
    executionConfigured:
      keyIdUsable && keySecretUsable && accountNumberUsable,
    webhookConfigured: webhookSecretUsable,
  };
};

module.exports = {
  BOOKING_PAYMENT_INITIATION_ENV,
  PAYOUT_INITIATION_ENV,
  SUBSCRIPTION_PAYMENT_FLOW_ENV,
  PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS_ENV,
  getPaymentWebhookMaxProcessingAttempts,
  isBookingPaymentInitiationEnabled,
  isPayoutInitiationEnabled,
  isSubscriptionPaymentFlowEnabled,
  isUsableRazorpayKeyId,
  isUsablePaymentSecret,
  isUsablePayoutAccountNumber,
  getRazorpayConfigurationState,
  getRazorpayPayoutConfigurationState,
};
