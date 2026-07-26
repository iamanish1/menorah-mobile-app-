const crypto = require('crypto');
const PayoutWebhookEvent = require('../models/PayoutWebhookEvent');

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const SUPPORTED_PAYOUT_EVENT_STATUSES = Object.freeze({
  'payout.pending': 'pending',
  'payout.rejected': 'rejected',
  'payout.queued': 'queued',
  'payout.initiated': 'processing',
  'payout.processed': 'processed',
  'payout.updated': null,
  'payout.reversed': 'reversed',
  'payout.failed': 'failed',
});
const SUPPORTED_PAYOUT_STATUSES = new Set([
  'processing',
  'queued',
  'pending',
  'on_hold',
  'processed',
  'reversed',
  'cancelled',
  'failed',
  'rejected',
]);
const FINAL_WEBHOOK_STATES = new Set(['processed', 'ignored', 'needs_review']);

const normalizeProviderEventId = (value) => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return PROVIDER_ID_PATTERN.test(candidate) ? candidate : null;
};

const createPayoutWebhookIdentity = ({ rawBody, providerEventId }) => {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new TypeError('rawBody must be a non-empty Buffer');
  }

  const payloadDigest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const normalizedProviderEventId = normalizeProviderEventId(providerEventId);
  return {
    payloadDigest,
    providerEventId: normalizedProviderEventId,
    eventKey: `razorpay-x:${normalizedProviderEventId || payloadDigest}`,
  };
};

const asPlainObject = (document) => (
  typeof document?.toObject === 'function' ? document.toObject() : document
);

const findExistingIdentity = async ({
  PayoutWebhookEventModel,
  identity,
}) => {
  const identityClauses = [
    { eventKey: identity.eventKey },
    { payloadDigest: identity.payloadDigest },
  ];
  if (identity.providerEventId) {
    identityClauses.push({ providerEventId: identity.providerEventId });
  }
  return PayoutWebhookEventModel.findOne({ $or: identityClauses }).lean();
};

const claimPayoutWebhookEvent = async ({
  rawBody,
  providerEventId,
  eventType,
  providerPayoutId,
  PayoutWebhookEventModel = PayoutWebhookEvent,
  now = new Date(),
}) => {
  const identity = createPayoutWebhookIdentity({ rawBody, providerEventId });
  const candidateEventType = String(eventType || '').trim();
  const normalizedEventType = /^[a-z][a-z0-9._-]{2,127}$/.test(candidateEventType)
    ? candidateEventType
    : 'payout.unknown';
  const normalizedPayoutId = normalizeProviderEventId(providerPayoutId);

  try {
    const created = await PayoutWebhookEventModel.create({
      eventKey: identity.eventKey,
      payloadDigest: identity.payloadDigest,
      ...(identity.providerEventId
        ? { providerEventId: identity.providerEventId }
        : {}),
      eventType: normalizedEventType,
      providerPayoutId: normalizedPayoutId,
      processingState: 'processing',
      receivedAt: now,
      lastDeliveryAt: now,
    });
    return {
      event: asPlainObject(created),
      identity,
      claimed: true,
      duplicate: false,
      conflict: false,
    };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const existing = await findExistingIdentity({
    PayoutWebhookEventModel,
    identity,
  });
  if (!existing) {
    throw new Error('PAYOUT_WEBHOOK_IDENTITY_LOOKUP_FAILED');
  }

  // The signed raw-body digest is authoritative. The provider event header is
  // a useful secondary identity, but a replay with the same signed bytes must
  // remain a duplicate even if an intermediary omits or changes that header.
  const identityConflict = existing.payloadDigest !== identity.payloadDigest;
  if (identityConflict) {
    return {
      event: existing,
      identity,
      claimed: false,
      duplicate: false,
      conflict: true,
    };
  }

  await PayoutWebhookEventModel.updateOne({
    _id: existing._id,
    payloadDigest: identity.payloadDigest,
  }, {
    $inc: { deliveryCount: 1 },
    $set: { lastDeliveryAt: now },
  });

  return {
    event: existing,
    identity,
    claimed: !FINAL_WEBHOOK_STATES.has(existing.processingState),
    duplicate: true,
    conflict: false,
  };
};

const recordPayoutWebhookIdentityConflict = async ({
  eventId,
  PayoutWebhookEventModel = PayoutWebhookEvent,
  now = new Date(),
}) => {
  const result = await PayoutWebhookEventModel.updateOne({ _id: eventId }, {
    $set: {
      processingState: 'needs_review',
      reconciliationDecision: 'needs_review',
      mismatchCodes: ['PAYOUT_WEBHOOK_IDENTITY_CONFLICT'],
      lastIdentityConflictAt: now,
      processedAt: now,
    },
    $inc: { identityConflictCount: 1, deliveryCount: 1 },
  });
  if ((result.matchedCount ?? result.n ?? 0) !== 1) {
    throw new Error('PAYOUT_WEBHOOK_IDENTITY_CONFLICT_RECORD_FAILED');
  }
};

const finalizePayoutWebhookEvent = async ({
  eventId,
  payloadDigest,
  processingState,
  reconciliationDecision,
  mismatchCodes = [],
  failureCode = null,
  payoutId = null,
  providerPayoutId = null,
  PayoutWebhookEventModel = PayoutWebhookEvent,
  now = new Date(),
}) => {
  const permittedStates = new Set([
    'processed',
    'ignored',
    'needs_review',
    'retryable_failure',
  ]);
  if (!permittedStates.has(processingState)) {
    throw new TypeError('Invalid payout webhook final state');
  }

  const result = await PayoutWebhookEventModel.updateOne({
    _id: eventId,
    payloadDigest,
  }, {
    $set: {
      processingState,
      reconciliationDecision,
      mismatchCodes: Array.from(new Set(mismatchCodes)),
      failureCode,
      payout: payoutId,
      providerPayoutId: normalizeProviderEventId(providerPayoutId),
      processedAt: processingState === 'retryable_failure' ? null : now,
      lastDeliveryAt: now,
    },
  });

  if ((result.matchedCount ?? result.n ?? 0) !== 1) {
    throw new Error('PAYOUT_WEBHOOK_FINALIZE_CONFLICT');
  }
};

const validatePayoutWebhookEntity = ({ event, payoutData, payoutRecord }) => {
  const mismatchCodes = [];
  const expectedStatus = SUPPORTED_PAYOUT_EVENT_STATUSES[event?.event];

  if (!Object.prototype.hasOwnProperty.call(
    SUPPORTED_PAYOUT_EVENT_STATUSES,
    event?.event
  )) {
    mismatchCodes.push('UNSUPPORTED_EVENT_TYPE');
  }
  if (event?.entity !== 'event') mismatchCodes.push('EVENT_ENTITY_MISMATCH');
  if (!Array.isArray(event?.contains) || !event.contains.includes('payout')) {
    mismatchCodes.push('EVENT_CONTAINS_MISMATCH');
  }
  if (payoutData?.entity !== 'payout') mismatchCodes.push('PAYOUT_ENTITY_MISMATCH');
  if (!SUPPORTED_PAYOUT_STATUSES.has(payoutData?.status)) {
    mismatchCodes.push('PAYOUT_STATUS_UNSUPPORTED');
  }
  if (expectedStatus && payoutData?.status !== expectedStatus) {
    mismatchCodes.push('EVENT_STATUS_MISMATCH');
  }
  if (!Number.isSafeInteger(payoutData?.amount)
    || payoutData.amount !== payoutRecord?.amountPaise) {
    mismatchCodes.push('PAYOUT_AMOUNT_MISMATCH');
  }
  if (payoutData?.currency !== 'INR') {
    mismatchCodes.push('PAYOUT_CURRENCY_MISMATCH');
  }
  if (payoutData?.reference_id !== payoutRecord?.referenceId) {
    mismatchCodes.push('PAYOUT_REFERENCE_MISMATCH');
  }
  if (payoutData?.fund_account_id !== payoutRecord?.razorpayFundAccountId) {
    mismatchCodes.push('PAYOUT_FUND_ACCOUNT_MISMATCH');
  }
  if (payoutData?.purpose !== 'payout') {
    mismatchCodes.push('PAYOUT_PURPOSE_MISMATCH');
  }
  if (String(payoutData?.notes?.counsellorId || '')
    !== String(payoutRecord?.counsellor?._id || payoutRecord?.counsellor || '')) {
    mismatchCodes.push('PAYOUT_COUNSELLOR_MISMATCH');
  }

  return {
    valid: mismatchCodes.length === 0,
    mismatchCodes,
  };
};

module.exports = {
  SUPPORTED_PAYOUT_EVENT_STATUSES,
  SUPPORTED_PAYOUT_STATUSES,
  normalizeProviderEventId,
  createPayoutWebhookIdentity,
  claimPayoutWebhookEvent,
  recordPayoutWebhookIdentityConflict,
  finalizePayoutWebhookEvent,
  validatePayoutWebhookEntity,
};
