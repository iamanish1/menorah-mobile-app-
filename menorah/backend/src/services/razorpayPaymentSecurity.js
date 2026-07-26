const crypto = require('crypto');
const {
  recordPaymentOperation,
} = require('../utils/reliabilityMetrics');

const RAZORPAY_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const RAZORPAY_SIGNATURE_PATTERN = /^[a-fA-F0-9]{64}$/;
const RAZORPAY_EVENT_TYPE_PATTERN = /^[a-z][a-z0-9._-]{2,127}$/;
const ALLOWED_ORDER_STATUSES = new Set(['created', 'attempted', 'paid']);

class PaymentProviderTimeoutError extends Error {
  constructor() {
    super('Payment provider request timed out');
    this.name = 'PaymentProviderTimeoutError';
    this.code = 'PAYMENT_PROVIDER_TIMEOUT';
  }
}

const isRazorpayId = (value) => (
  typeof value === 'string'
  && RAZORPAY_ID_PATTERN.test(value)
);

const normalizeSingleHeader = (value) => {
  if (Array.isArray(value)) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const timingSafeHexEqual = (actual, expected) => {
  if (
    typeof actual !== 'string'
    || typeof expected !== 'string'
    || !RAZORPAY_SIGNATURE_PATTERN.test(actual)
    || !RAZORPAY_SIGNATURE_PATTERN.test(expected)
  ) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(actual, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch (_error) {
    return false;
  }
};

const verifyRazorpayWebhookSignature = ({
  rawBody,
  signature,
  secret,
  previousSecret,
}) => {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  const normalizedSignature = normalizeSingleHeader(signature);
  if (!normalizedSignature) return false;

  const currentSecretPresent = typeof secret === 'string' && secret.length > 0;
  const previousSecretPresent = typeof previousSecret === 'string'
    && previousSecret.length > 0;

  // Always perform both HMACs and timing-safe comparisons. Responses and logs
  // deliberately do not reveal which rotation candidate matched.
  const currentExpected = crypto
    .createHmac('sha256', currentSecretPresent ? secret : '')
    .update(rawBody)
    .digest('hex');
  const previousExpected = crypto
    .createHmac('sha256', previousSecretPresent ? previousSecret : '')
    .update(rawBody)
    .digest('hex');
  const currentMatches = timingSafeHexEqual(
    normalizedSignature,
    currentExpected
  );
  const previousMatches = timingSafeHexEqual(
    normalizedSignature,
    previousExpected
  );

  return currentSecretPresent
    && (currentMatches || (previousSecretPresent && previousMatches));
};

const verifyRazorpayCheckoutSignature = ({ orderId, paymentId, signature, secret }) => {
  if (
    !isRazorpayId(orderId)
    || !isRazorpayId(paymentId)
    || typeof secret !== 'string'
    || !secret
  ) {
    return false;
  }

  const normalizedSignature = normalizeSingleHeader(signature);
  if (!normalizedSignature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return timingSafeHexEqual(normalizedSignature, expected);
};

const parseVerifiedWebhookEnvelope = (rawBody) => {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new Error('A non-empty raw request body is required');
  }

  const parsed = JSON.parse(rawBody.toString('utf8'));
  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || !RAZORPAY_EVENT_TYPE_PATTERN.test(parsed.event || '')
  ) {
    throw new Error('Invalid Razorpay webhook envelope');
  }

  return parsed;
};

const buildWebhookIdentity = ({ rawBody, providerEventId }) => {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new Error('A non-empty raw request body is required');
  }

  const payloadDigest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const normalizedEventId = providerEventId === undefined
    ? null
    : normalizeSingleHeader(providerEventId);

  if (providerEventId !== undefined && !isRazorpayId(normalizedEventId)) {
    throw new Error('Invalid Razorpay event ID');
  }

  return {
    providerEventId: normalizedEventId,
    payloadDigest,
    eventKey: normalizedEventId
      ? `event:${normalizedEventId}`
      : `digest:${payloadDigest}`,
  };
};

const getWebhookPaymentReference = (event) => {
  const payment = event?.payload?.payment?.entity;
  return {
    orderId: isRazorpayId(payment?.order_id) ? payment.order_id : null,
    paymentId: isRazorpayId(payment?.id) ? payment.id : null,
  };
};

const validateOrderAgainstExpected = ({ order, expected }) => {
  const mismatchCodes = [];
  const add = (code) => {
    if (!mismatchCodes.includes(code)) mismatchCodes.push(code);
  };

  if (!order || typeof order !== 'object') add('ORDER_MISSING');
  if (!isRazorpayId(order?.id)) add('ORDER_ID_INVALID');
  if (order?.amount !== expected?.amountMinor) add('ORDER_AMOUNT_MISMATCH');
  if (order?.currency !== expected?.currency) add('ORDER_CURRENCY_MISMATCH');
  if (String(order?.receipt || '') !== String(expected?.receipt || '')) {
    add('ORDER_RECEIPT_MISMATCH');
  }
  if (String(order?.notes?.bookingId || '') !== String(expected?.notes?.bookingId || '')) {
    add('ORDER_BOOKING_NOTE_MISMATCH');
  }
  if (String(order?.notes?.userId || '') !== String(expected?.notes?.userId || '')) {
    add('ORDER_USER_NOTE_MISMATCH');
  }
  if (!ALLOWED_ORDER_STATUSES.has(order?.status)) add('ORDER_STATUS_INVALID');

  return {
    valid: mismatchCodes.length === 0,
    mismatchCodes,
  };
};

const withPaymentProviderTimeout = async (operation, timeoutMs = 5000) => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('Payment provider timeout must be a positive integer');
  }

  let timeoutHandle;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new PaymentProviderTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const fetchRazorpayEvidence = async ({ client, orderId, paymentId, timeoutMs }) => {
  if (!client?.orders?.fetch || !client?.payments?.fetch) {
    throw new TypeError('Razorpay client is unavailable');
  }
  if (!isRazorpayId(orderId) || !isRazorpayId(paymentId)) {
    throw new TypeError('Valid Razorpay order and payment IDs are required');
  }

  try {
    const evidence = await withPaymentProviderTimeout(
      () => Promise.all([
        client.orders.fetch(orderId),
        client.payments.fetch(paymentId),
      ]).then(([order, payment]) => ({ order, payment })),
      timeoutMs
    );
    recordPaymentOperation({
      provider: 'razorpay',
      operation: 'evidence_fetch',
      outcome: 'success',
    });
    return evidence;
  } catch (error) {
    recordPaymentOperation({
      provider: 'razorpay',
      operation: 'evidence_fetch',
      outcome: 'failure',
    });
    throw error;
  }
};

const findRazorpayOrdersByReceipt = async ({ client, receipt, timeoutMs }) => {
  if (!client?.orders?.all) throw new TypeError('Razorpay client is unavailable');
  if (typeof receipt !== 'string' || !receipt) {
    throw new TypeError('A receipt is required');
  }

  let result;
  try {
    result = await withPaymentProviderTimeout(
      () => client.orders.all({ receipt, count: 10 }),
      timeoutMs
    );
    recordPaymentOperation({
      provider: 'razorpay',
      operation: 'order_recovery',
      outcome: 'success',
    });
  } catch (error) {
    recordPaymentOperation({
      provider: 'razorpay',
      operation: 'order_recovery',
      outcome: 'failure',
    });
    throw error;
  }

  return Array.isArray(result?.items) ? result.items : [];
};

module.exports = {
  PaymentProviderTimeoutError,
  buildWebhookIdentity,
  fetchRazorpayEvidence,
  findRazorpayOrdersByReceipt,
  getWebhookPaymentReference,
  isRazorpayId,
  normalizeSingleHeader,
  parseVerifiedWebhookEnvelope,
  timingSafeHexEqual,
  validateOrderAgainstExpected,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
  withPaymentProviderTimeout,
};
