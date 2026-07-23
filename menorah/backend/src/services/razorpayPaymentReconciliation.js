const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const PaymentAttempt = require('../models/PaymentAttempt');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentWebhookEvent = require('../models/PaymentWebhookEvent');
const {
  NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_RECONCILIATION_MISMATCH_CODES,
  RECONCILIATION_DECISIONS,
  evaluateBookingPaymentReconciliation,
} = require('./paymentReconciliationPolicy');

const DEFAULT_WEBHOOK_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_WEBHOOK_RETRY_DELAY_MS = 30 * 1000;
const MAX_TRANSACTION_ATTEMPTS = 3;
const TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
});
const MAJORITY_WRITE_OPTIONS = Object.freeze({
  writeConcern: { w: 'majority' },
});

const RECONCILIATION_SOURCES = new Set([
  'webhook',
  'redirect_verification',
  'reconciliation_job',
]);
const TERMINAL_WEBHOOK_STATES = new Set([
  'processed',
  'ignored',
  'needs_review',
]);
const WEBHOOK_FINAL_STATES = new Set([
  'ignored',
  'needs_review',
]);
const RECONCILIATION_DECISION_VALUES = new Set(
  Object.values(RECONCILIATION_DECISIONS)
);
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const EVENT_KEY_PATTERN = /^[A-Za-z0-9:_-]{3,256}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXACT_FAILURE_MISMATCH_CODES = new Set([
  PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_STATUS_NOT_PAID,
  PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_STATUS_NOT_CAPTURED,
  PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_CAPTURE_FLAG_NOT_TRUE,
]);
const FINAL_CAPTURE_PROVIDER_ORDER_STATUS = 'paid';
const FINAL_CAPTURE_PROVIDER_PAYMENT_STATUS = 'captured';
const TRANSIENT_CAPTURE_PROVIDER_PAYMENT_STATUSES = new Set([
  'created',
  'authorized',
]);
const TRANSIENT_CAPTURE_PROVIDER_ORDER_STATUSES = new Set([
  'created',
  'attempted',
]);

class PaymentReconciliationStateError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.name = 'PaymentReconciliationStateError';
    this.code = code;
    this.retryable = retryable;
  }
}

const asTrimmedString = (value) =>
  typeof value === 'string' ? value.trim() : '';

const asComparableId = (value) => {
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'object'
    && value._id !== undefined
    && value._id !== value
  ) {
    return asComparableId(value._id);
  }
  return asTrimmedString(String(value));
};

const asValidDate = (value, fieldName) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      `${fieldName} must be a valid date`
    );
  }
  return date;
};

const normalizeSafeCodes = (codes = []) => {
  if (!Array.isArray(codes)) {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'Mismatch codes must be an array'
    );
  }
  const normalized = [];
  for (const code of codes) {
    const value = asTrimmedString(code);
    if (!SAFE_CODE_PATTERN.test(value)) {
      throw new PaymentReconciliationStateError(
        'INVALID_RECONCILIATION_INPUT',
        'Mismatch codes must use the safe code format'
      );
    }
    if (!normalized.includes(value)) normalized.push(value);
  }
  if (normalized.length > 64) {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'Mismatch code list is too large'
    );
  }
  return normalized;
};

const requirePattern = (value, pattern, fieldName) => {
  const normalized = asTrimmedString(value);
  if (!pattern.test(normalized)) {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      `${fieldName} is invalid`
    );
  }
  return normalized;
};

const optionalProviderId = (value, fieldName) => {
  if (value === null || value === undefined || value === '') return undefined;
  return requirePattern(value, PROVIDER_ID_PATTERN, fieldName);
};

const normalizeClaimToken = (value, { required = false } = {}) => {
  if (value === null || value === undefined || value === '') {
    if (!required) return undefined;
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'Webhook claim token is required'
    );
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'Webhook claim token is invalid'
    );
  }
  return value;
};

const getMatchedCount = (result) =>
  result?.matchedCount ?? result?.n ?? 0;

const isDuplicateKeyError = (error) =>
  error?.code === 11000 || error?.code === 11001;

const isRetryableServiceError = (error) =>
  isDuplicateKeyError(error)
  || (
    error instanceof PaymentReconciliationStateError
    && error.retryable
  );

const executeQuery = async (query, { session, lean = true } = {}) => {
  let pending = query;
  if (session && typeof pending?.session === 'function') {
    pending = pending.session(session);
  }
  if (lean && typeof pending?.lean === 'function') {
    pending = pending.lean();
  }
  return pending;
};

const buildEventSubjectSet = ({
  orderId,
  paymentId,
  bookingId,
  paymentAttemptId,
}) => {
  const set = {};
  const normalizedOrderId = optionalProviderId(orderId, 'orderId');
  const normalizedPaymentId = optionalProviderId(paymentId, 'paymentId');
  const normalizedBookingId = asComparableId(bookingId);
  const normalizedAttemptId = asComparableId(paymentAttemptId);

  if (normalizedOrderId) set['subject.orderId'] = normalizedOrderId;
  if (normalizedPaymentId) set['subject.paymentId'] = normalizedPaymentId;
  if (normalizedBookingId) set['subject.booking'] = normalizedBookingId;
  if (normalizedAttemptId) {
    set['subject.paymentAttempt'] = normalizedAttemptId;
  }
  return set;
};

const getEventSubjectDocument = ({ orderId, paymentId }) => {
  const subject = {};
  const normalizedOrderId = optionalProviderId(orderId, 'orderId');
  const normalizedPaymentId = optionalProviderId(paymentId, 'paymentId');
  if (normalizedOrderId) subject.orderId = normalizedOrderId;
  if (normalizedPaymentId) subject.paymentId = normalizedPaymentId;
  return Object.keys(subject).length > 0 ? subject : undefined;
};

const forceNeedsReview = (
  evaluation,
  extraCodes = [],
  { recommendedAttemptStatus = 'needs_review' } = {}
) => {
  const mismatchCodes = [
    ...(evaluation?.mismatchCodes || []),
    ...extraCodes,
  ].filter((code, index, values) => values.indexOf(code) === index);

  return {
    ...evaluation,
    decision: RECONCILIATION_DECISIONS.NEEDS_REVIEW,
    shouldAuthorize: false,
    idempotent: false,
    failClosed: true,
    mismatchCodes,
    primaryMismatchCode: mismatchCodes[0] || null,
    recommendedAttemptStatus,
    transition: null,
  };
};

const classifyCapturedWebhookProviderEvidence = ({ order, payment }) => {
  if (
    payment?.status === FINAL_CAPTURE_PROVIDER_PAYMENT_STATUS
    && payment?.captured === true
  ) {
    return order?.status === FINAL_CAPTURE_PROVIDER_ORDER_STATUS
      ? 'final'
      : TRANSIENT_CAPTURE_PROVIDER_ORDER_STATUSES.has(order?.status)
        ? 'transient'
        : 'contradictory';
  }

  if (
    TRANSIENT_CAPTURE_PROVIDER_PAYMENT_STATUSES.has(payment?.status)
    && payment?.captured === false
  ) {
    return 'transient';
  }

  return 'contradictory';
};

const getProviderStatusSet = ({ order, payment }) => {
  const set = {};
  if (['created', 'attempted', 'paid'].includes(order?.status)) {
    set['reconciliation.providerOrderStatus'] = order.status;
  }
  if (
    ['created', 'authorized', 'captured', 'refunded', 'failed']
      .includes(payment?.status)
  ) {
    set['reconciliation.providerPaymentStatus'] = payment.status;
  }
  return set;
};

const buildReconciliationSet = ({
  evaluation,
  source,
  eventKey,
  order,
  payment,
  now,
}) => ({
  'reconciliation.lastDecision': evaluation.decision,
  'reconciliation.mismatchCodes': normalizeSafeCodes(evaluation.mismatchCodes),
  'reconciliation.lastSource': source,
  'reconciliation.lastEventKey': eventKey,
  'reconciliation.evaluatedAt': now,
  ...getProviderStatusSet({ order, payment }),
});

const receiptMatches = ({ receipt, expected }) =>
  asTrimmedString(receipt?.paymentId) === expected.paymentId
  && asTrimmedString(receipt?.orderId) === expected.orderId
  && receipt?.purpose === 'booking'
  && asComparableId(receipt?.user) === expected.userId
  && asComparableId(receipt?.booking) === expected.bookingId
  && receipt?.amount === expected.amountMinor
  && asTrimmedString(receipt?.currency) === expected.currency;

const buildExpectedReceipt = ({ attempt, order, payment }) => ({
  paymentId: asTrimmedString(payment?.id),
  orderId: asTrimmedString(order?.id),
  purpose: 'booking',
  user: attempt?.user,
  booking: attempt?.booking,
  amount: attempt?.expected?.amountMinor,
  currency: attempt?.expected?.currency,
});

const buildReceiptComparison = (receiptDocument) => ({
  paymentId: receiptDocument.paymentId,
  orderId: receiptDocument.orderId,
  userId: asComparableId(receiptDocument.user),
  bookingId: asComparableId(receiptDocument.booking),
  amountMinor: receiptDocument.amount,
  currency: receiptDocument.currency,
});

const isExactFailedEvidence = ({ evaluation, order, payment }) => {
  if (
    payment?.status !== 'failed'
    || payment?.captured !== false
    || !['created', 'attempted'].includes(order?.status)
  ) {
    return false;
  }
  if (!evaluation?.mismatchCodes?.length) return false;
  return evaluation.mismatchCodes.every((code) =>
    EXACT_FAILURE_MISMATCH_CODES.has(code)
  );
};

const hasProviderNotes = (notes) =>
  notes !== null
  && typeof notes === 'object'
  && Object.keys(notes).length > 0;

const hasExactProviderAssociation = ({
  attempt,
  booking,
  order,
  payment,
}) => {
  if (!attempt || !booking || !order || !payment) return false;
  const attemptBookingId = asComparableId(attempt.booking);
  const attemptUserId = asComparableId(attempt.user);
  const paymentId = asTrimmedString(payment.id);
  const expected = attempt.expected;

  return attempt.provider === 'razorpay'
    && attempt.purpose === 'booking'
    && Boolean(paymentId)
    && attemptBookingId === asComparableId(booking._id)
    && attemptUserId === asComparableId(booking.user)
    && asTrimmedString(attempt.orderId) === asTrimmedString(order.id)
    && asTrimmedString(attempt.orderId) === asTrimmedString(payment.order_id)
    && asTrimmedString(booking.razorpayOrderId) === asTrimmedString(attempt.orderId)
    && booking.paymentMethod === 'razorpay'
    && Number.isSafeInteger(expected?.amountMinor)
    && expected.amountMinor > 0
    && expected.amountMinor === booking.amountMinor
    && expected.amountMinor === booking.pricing?.listAmountMinor
    && expected.amountMinor === order.amount
    && expected.amountMinor === payment.amount
    && expected.currency === 'INR'
    && booking.currency === expected.currency
    && booking.pricing?.currency === expected.currency
    && order.currency === expected.currency
    && payment.currency === expected.currency
    && asTrimmedString(order.receipt) === asTrimmedString(expected.receipt)
    && asComparableId(expected.notes?.bookingId) === attemptBookingId
    && asComparableId(expected.notes?.userId) === attemptUserId
    && asComparableId(order.notes?.bookingId) === attemptBookingId
    && asComparableId(order.notes?.userId) === attemptUserId
    && (
      !hasProviderNotes(payment.notes)
      || (
        asComparableId(payment.notes.bookingId) === attemptBookingId
        && asComparableId(payment.notes.userId) === attemptUserId
      )
    );
};

const isExactAppliedPayment = ({ attempt, booking, order, payment }) => {
  if (!hasExactProviderAssociation({ attempt, booking, order, payment })) {
    return false;
  }
  const observedPaymentId = asTrimmedString(payment.id);
  const appliedPaymentId = asTrimmedString(attempt.paymentId);
  const observedProviderOutcomeIsConsistent =
    (
      payment.status === 'captured'
      && payment.captured === true
      && observedPaymentId === appliedPaymentId
    )
    || (
      payment.status === 'failed'
      && payment.captured === false
      && observedPaymentId !== appliedPaymentId
    );

  return observedProviderOutcomeIsConsistent
    && order.status === 'paid'
    && attempt.status === 'captured'
    && Boolean(appliedPaymentId)
    && booking.paymentStatus === 'paid'
    && booking.orderStatus === 'paid'
    && asTrimmedString(booking.paymentId) === appliedPaymentId
    && asTrimmedString(booking.transactionId) === asTrimmedString(attempt.orderId)
    && booking.bookingAuthorization?.kind === 'payment'
    && booking.bookingAuthorization?.status === 'authorized'
    && asTrimmedString(booking.bookingAuthorization?.reference) === appliedPaymentId;
};

const isExactFailedProviderAssociation = ({
  attempt,
  booking,
  order,
  payment,
}) =>
  hasExactProviderAssociation({ attempt, booking, order, payment })
  && ['created', 'attempted'].includes(order.status)
  && payment.status === 'failed'
  && payment.captured === false;

const getUnexpectedFailedEvidenceCodes = ({
  evaluation,
  attempt,
  booking,
}) => {
  const allowedCodes = new Set(EXACT_FAILURE_MISMATCH_CODES);
  allowedCodes.add(
    PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_HOLD_EXPIRED
  );
  allowedCodes.add(
    PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_SCHEDULE_PASSED
  );
  if (booking?.status && booking.status !== 'pending') {
    allowedCodes.add(
      PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_NOT_PAYABLE
    );
    allowedCodes.add(
      PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_AUTHORIZATION_CONFLICT
    );
  }
  if (attempt?.status === 'expired') {
    allowedCodes.add(
      PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_NOT_RECONCILABLE
    );
  }
  return (evaluation?.mismatchCodes || []).filter(
    (code) => !allowedCodes.has(code)
  );
};

const getAttemptLocator = ({ paymentAttemptId, orderId, order }) => {
  const normalizedAttemptId = asComparableId(paymentAttemptId);
  if (normalizedAttemptId) return { _id: normalizedAttemptId };

  const normalizedOrderId = optionalProviderId(
    orderId || order?.id,
    'orderId'
  );
  if (!normalizedOrderId) {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'A payment attempt ID or order ID is required'
    );
  }
  return { orderId: normalizedOrderId };
};

const validateReconciliationContext = ({
  paymentAttemptId,
  orderId,
  order,
  payment,
  source,
  eventKey,
  claimToken,
  now,
}) => {
  if (!order || typeof order !== 'object') {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'Server-fetched order evidence is required'
    );
  }
  if (!payment || typeof payment !== 'object') {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'Server-fetched payment evidence is required'
    );
  }
  if (!RECONCILIATION_SOURCES.has(source)) {
    throw new PaymentReconciliationStateError(
      'INVALID_RECONCILIATION_INPUT',
      'Reconciliation source is invalid'
    );
  }

  return {
    attemptLocator: getAttemptLocator({ paymentAttemptId, orderId, order }),
    eventKey: requirePattern(eventKey, EVENT_KEY_PATTERN, 'eventKey'),
    claimToken: normalizeClaimToken(claimToken, {
      required: source === 'webhook',
    }),
    now: asValidDate(now ?? new Date(), 'now'),
  };
};

const createRazorpayPaymentReconciliationService = ({
  mongooseInstance = mongoose,
  BookingModel = Booking,
  PaymentAttemptModel = PaymentAttempt,
  PaymentReceiptModel = PaymentReceipt,
  PaymentWebhookEventModel = PaymentWebhookEvent,
  evaluateReconciliation = evaluateBookingPaymentReconciliation,
  webhookLeaseMs = DEFAULT_WEBHOOK_LEASE_MS,
  webhookRetryDelayMs = DEFAULT_WEBHOOK_RETRY_DELAY_MS,
} = {}) => {
  const runInTransaction = async (work) => {
    const session = await mongooseInstance.startSession();
    try {
      let value;
      await session.withTransaction(async () => {
        value = await work(session);
      }, TRANSACTION_OPTIONS);
      return value;
    } finally {
      await session.endSession();
    }
  };

  const findWebhookEventByIdentity = async ({
    eventKey,
    providerEventId,
    payloadDigest,
  }) => {
    let event = await executeQuery(
      PaymentWebhookEventModel.findOne({ eventKey })
    );
    if (!event && providerEventId) {
      event = await executeQuery(
        PaymentWebhookEventModel.findOne({ providerEventId })
      );
    }
    if (!event) {
      event = await executeQuery(
        PaymentWebhookEventModel.findOne({ payloadDigest })
      );
    }
    return event;
  };

  const signedWebhookEnvelopeMatches = ({
    event,
    payloadDigest,
    eventType,
    orderId,
    paymentId,
  }) =>
    asTrimmedString(event?.payloadDigest) === payloadDigest
    && asTrimmedString(event?.eventType) === eventType
    && asTrimmedString(event?.subject?.orderId) === (orderId || '')
    && asTrimmedString(event?.subject?.paymentId) === (paymentId || '');

  const markWebhookIdentityConflict = async ({ event, now }) => {
    const result = await PaymentWebhookEventModel.updateOne({
      _id: event._id,
      processingState: event.processingState,
      processingAttempts: event.processingAttempts,
    }, {
      $set: {
        processingState: 'needs_review',
        reconciliationDecision: RECONCILIATION_DECISIONS.NEEDS_REVIEW,
        mismatchCodes: ['WEBHOOK_IDENTITY_CONFLICT'],
        failureCode: 'WEBHOOK_IDENTITY_CONFLICT',
        processedAt: now,
        nextRetryAt: null,
        lastIdentityConflictAt: now,
      },
      $inc: {
        deliveryCount: 1,
        processingAttempts: 1,
        identityConflictCount: 1,
      },
    }, {
      runValidators: true,
      ...MAJORITY_WRITE_OPTIONS,
    });
    return getMatchedCount(result) === 1;
  };

  const claimExistingWebhookEvent = async ({
    event,
    eventKey,
    providerEventId,
    payloadDigest,
    eventType,
    orderId,
    paymentId,
    now,
  }) => {
    if (!signedWebhookEnvelopeMatches({
      event,
      payloadDigest,
      eventType,
      orderId,
      paymentId,
    })) {
      if (TERMINAL_WEBHOOK_STATES.has(event.processingState)) {
        const conflictResult = await PaymentWebhookEventModel.updateOne(
          {
            _id: event._id,
            processingState: event.processingState,
            processingAttempts: event.processingAttempts,
          },
          {
            $set: { lastIdentityConflictAt: now },
            $inc: {
              deliveryCount: 1,
              identityConflictCount: 1,
            },
          },
          {
            runValidators: true,
            ...MAJORITY_WRITE_OPTIONS,
          }
        );
        if (getMatchedCount(conflictResult) !== 1) {
          return {
            claimed: false,
            duplicate: false,
            conflict: true,
            terminal: false,
            ackSafe: false,
            processingState: event.processingState,
            eventKey: event.eventKey,
            eventId: asComparableId(event._id),
          };
        }
        return {
          claimed: false,
          duplicate: true,
          conflict: true,
          terminal: true,
          ackSafe: true,
          processingState: event.processingState,
          eventKey: event.eventKey,
          eventId: asComparableId(event._id),
        };
      }

      const conflictRecorded = await markWebhookIdentityConflict({
        event,
        now,
      });
      if (!conflictRecorded) {
        return {
          claimed: false,
          duplicate: false,
          conflict: false,
          inFlight: true,
          retryable: true,
          processingState: 'processing',
          eventKey: event.eventKey,
          eventId: asComparableId(event._id),
        };
      }
      return {
        claimed: false,
        duplicate: true,
        conflict: true,
        terminal: true,
        ackSafe: true,
        processingState: 'needs_review',
        eventKey: event.eventKey,
        eventId: asComparableId(event._id),
      };
    }

    if (TERMINAL_WEBHOOK_STATES.has(event.processingState)) {
      await PaymentWebhookEventModel.updateOne(
        { _id: event._id, processingState: event.processingState },
        { $inc: { deliveryCount: 1 } },
        {
          runValidators: true,
          ...MAJORITY_WRITE_OPTIONS,
        }
      );
      return {
        claimed: false,
        duplicate: true,
        conflict: false,
        processingState: event.processingState,
        eventKey: event.eventKey,
        eventId: asComparableId(event._id),
      };
    }

    const leaseCutoff = new Date(now.getTime() - webhookLeaseMs);
    const retryReady = event.processingState === 'retryable_failure'
      && (
        !event.nextRetryAt
        || new Date(event.nextRetryAt) <= now
      );
    const expiredLease = event.processingState === 'processing'
      && (
        !event.processingStartedAt
        || new Date(event.processingStartedAt) <= leaseCutoff
      );
    const claimable = event.processingState === 'received'
      || retryReady
      || expiredLease;

    if (!claimable) {
      await PaymentWebhookEventModel.updateOne(
        { _id: event._id, processingState: event.processingState },
        { $inc: { deliveryCount: 1 } },
        {
          runValidators: true,
          ...MAJORITY_WRITE_OPTIONS,
        }
      );
      return {
        claimed: false,
        duplicate: false,
        conflict: false,
        inFlight: true,
        retryable: true,
        processingState: event.processingState,
        retryAfterAt: event.nextRetryAt || null,
        eventKey: event.eventKey,
        eventId: asComparableId(event._id),
      };
    }

    const stateGuard = expiredLease
      ? {
        processingState: 'processing',
        $or: [
          { processingStartedAt: { $lte: leaseCutoff } },
          { processingStartedAt: null },
          { processingStartedAt: { $exists: false } },
        ],
      }
      : retryReady
        ? {
          processingState: 'retryable_failure',
          $or: [
            { nextRetryAt: { $lte: now } },
            { nextRetryAt: null },
            { nextRetryAt: { $exists: false } },
          ],
        }
        : { processingState: 'received' };

    const claimedEvent = await executeQuery(
      PaymentWebhookEventModel.findOneAndUpdate({
        _id: event._id,
        ...stateGuard,
      }, {
        $set: {
          processingState: 'processing',
          processingStartedAt: now,
          lastAttemptAt: now,
          failureCode: null,
          nextRetryAt: null,
        },
        $inc: {
          deliveryCount: 1,
          processingAttempts: 1,
        },
      }, {
        new: true,
        runValidators: true,
        ...MAJORITY_WRITE_OPTIONS,
      })
    );

    if (claimedEvent) {
      return {
        claimed: true,
        duplicate: false,
        conflict: false,
        reclaimed: true,
        processingState: 'processing',
        claimToken: claimedEvent.processingAttempts,
        eventKey: claimedEvent.eventKey,
        eventId: asComparableId(claimedEvent._id),
      };
    }

    return {
      claimed: false,
      duplicate: false,
      conflict: false,
      inFlight: true,
      retryable: true,
      processingState: 'processing',
      eventKey: event.eventKey,
      eventId: asComparableId(event._id),
    };
  };

  const claimWebhookEvent = async ({
    eventKey,
    providerEventId,
    payloadDigest,
    eventType,
    orderId,
    paymentId,
    now = new Date(),
  }) => {
    const normalized = {
      eventKey: requirePattern(eventKey, EVENT_KEY_PATTERN, 'eventKey'),
      providerEventId: optionalProviderId(providerEventId, 'providerEventId'),
      payloadDigest: requirePattern(
        payloadDigest,
        SHA256_PATTERN,
        'payloadDigest'
      ),
      eventType: requirePattern(
        eventType,
        /^[a-z][a-z0-9._-]{2,127}$/,
        'eventType'
      ),
      orderId: optionalProviderId(orderId, 'orderId'),
      paymentId: optionalProviderId(paymentId, 'paymentId'),
      now: asValidDate(now, 'now'),
    };

    const createDocument = {
      provider: 'razorpay',
      eventKey: normalized.eventKey,
      payloadDigest: normalized.payloadDigest,
      eventType: normalized.eventType,
      processingState: 'processing',
      processingStartedAt: normalized.now,
      lastAttemptAt: normalized.now,
      processingAttempts: 1,
      deliveryCount: 1,
      receivedAt: normalized.now,
    };
    if (normalized.providerEventId) {
      createDocument.providerEventId = normalized.providerEventId;
    }
    const subject = getEventSubjectDocument(normalized);
    if (subject) createDocument.subject = subject;

    try {
      const [created] = await PaymentWebhookEventModel.create(
        [createDocument],
        MAJORITY_WRITE_OPTIONS
      );
      return {
        claimed: true,
        duplicate: false,
        conflict: false,
        reclaimed: false,
        processingState: 'processing',
        claimToken: created.processingAttempts,
        eventKey: created.eventKey,
        eventId: asComparableId(created._id),
      };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    const existing = await findWebhookEventByIdentity(normalized);
    if (!existing) {
      throw new PaymentReconciliationStateError(
        'WEBHOOK_LEDGER_CONFLICT',
        'Webhook identity collision could not be resolved',
        { retryable: true }
      );
    }
    return claimExistingWebhookEvent({ event: existing, ...normalized });
  };

  const getWebhookEventInSession = async ({ eventKey, session }) =>
    executeQuery(
      PaymentWebhookEventModel.findOne({ eventKey }),
      { session }
    );

  const eventSubjectMatchesExactly = ({
    event,
    orderId,
    paymentId,
    bookingId,
    paymentAttemptId,
  }) => {
    const comparisons = [
      [event?.subject?.orderId, orderId],
      [event?.subject?.paymentId, paymentId],
      [event?.subject?.booking, bookingId],
      [event?.subject?.paymentAttempt, paymentAttemptId],
    ];
    return comparisons.every(([stored, expected]) =>
      asComparableId(stored) === asComparableId(expected));
  };

  const mismatchCodesMatchExactly = (storedCodes, expectedCodes) => {
    const stored = Array.isArray(storedCodes) ? storedCodes : [];
    const expected = normalizeSafeCodes(expectedCodes);
    return stored.length === expected.length
      && stored.every((code, index) => code === expected[index]);
  };

  const terminalDecisionMatches = ({
    storedDecision,
    requestedDecision,
    processingState,
  }) => {
    if (
      processingState === 'processed'
      && requestedDecision === RECONCILIATION_DECISIONS.ALREADY_APPLIED
    ) {
      return [
        RECONCILIATION_DECISIONS.AUTHORIZE,
        RECONCILIATION_DECISIONS.ALREADY_APPLIED,
      ].includes(storedDecision);
    }
    return (storedDecision || null) === (requestedDecision || null);
  };

  const isExactTerminalWebhookOutcome = ({
    event,
    processingState,
    decision,
    mismatchCodes,
    orderId,
    paymentId,
    bookingId,
    paymentAttemptId,
  }) =>
    event?.processingState === processingState
    && terminalDecisionMatches({
      storedDecision: event.reconciliationDecision,
      requestedDecision: decision,
      processingState,
    })
    && mismatchCodesMatchExactly(event.mismatchCodes, mismatchCodes)
    && eventSubjectMatchesExactly({
      event,
      orderId,
      paymentId,
      bookingId,
      paymentAttemptId,
    });

  const assertLinkedWebhookClaim = async ({
    session,
    source,
    eventKey,
    claimToken,
    expectedEventType,
  }) => {
    if (source !== 'webhook') return null;
    const event = await getWebhookEventInSession({ eventKey, session });
    if (
      !event
      || event.processingState !== 'processing'
      || event.processingAttempts !== claimToken
      || (
        expectedEventType
        && event.eventType !== expectedEventType
      )
    ) {
      throw new PaymentReconciliationStateError(
        event ? 'WEBHOOK_CLAIM_STALE' : 'WEBHOOK_LEDGER_MISSING',
        'The webhook processing claim is no longer current'
      );
    }
    return event;
  };

  const finalizeLinkedWebhookEvent = async ({
    session,
    source,
    eventKey,
    claimToken,
    processingState,
    decision,
    mismatchCodes,
    orderId,
    paymentId,
    bookingId,
    paymentAttemptId,
    now,
  }) => {
    if (source !== 'webhook') return { finalized: false, skipped: true };

    const event = await getWebhookEventInSession({ eventKey, session });
    if (!event) {
      throw new PaymentReconciliationStateError(
        'WEBHOOK_LEDGER_MISSING',
        'The claimed webhook ledger event is missing',
        { retryable: true }
      );
    }
    if (
      TERMINAL_WEBHOOK_STATES.has(event.processingState)
      && isExactTerminalWebhookOutcome({
        event,
        processingState,
        decision,
        mismatchCodes,
        orderId,
        paymentId,
        bookingId,
        paymentAttemptId,
      })
    ) {
      return {
        finalized: false,
        duplicate: true,
        processingState: event.processingState,
      };
    }
    if (
      event.processingState !== 'processing'
      || event.processingAttempts !== claimToken
    ) {
      throw new PaymentReconciliationStateError(
        'WEBHOOK_CLAIM_STALE',
        'The webhook ledger event is not claimed for processing',
      );
    }

    const result = await PaymentWebhookEventModel.updateOne({
      _id: event._id,
      processingState: 'processing',
      processingAttempts: claimToken,
    }, {
      $set: {
        processingState,
        reconciliationDecision: decision,
        mismatchCodes: normalizeSafeCodes(mismatchCodes),
        failureCode: null,
        processedAt: now,
        nextRetryAt: null,
        ...buildEventSubjectSet({
          orderId,
          paymentId,
          bookingId,
          paymentAttemptId,
        }),
      },
    }, {
      session,
      runValidators: true,
    });
    if (getMatchedCount(result) !== 1) {
      throw new PaymentReconciliationStateError(
        'WEBHOOK_LEDGER_STATE_CONFLICT',
        'The webhook ledger event changed during reconciliation',
        { retryable: true }
      );
    }
    return { finalized: true, processingState };
  };

  const findAttemptAndBooking = async ({ attemptLocator, session }) => {
    const attempt = await executeQuery(
      PaymentAttemptModel.findOne(attemptLocator),
      { session }
    );
    const booking = attempt
      ? await executeQuery(
        BookingModel.findById(attempt.booking),
        { session }
      )
      : null;
    return { attempt, booking };
  };

  const findCompetingAttempt = async ({ attempt, session }) => {
    if (!attempt) return null;
    return executeQuery(
      PaymentAttemptModel.findOne({
        _id: { $ne: attempt._id },
        booking: attempt.booking,
        status: { $in: NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES },
      }),
      { session }
    );
  };

  const readAndEvaluate = async ({
    attemptLocator,
    order,
    payment,
    now,
    session,
  }) => {
    const { attempt, booking } = await findAttemptAndBooking({
      attemptLocator,
      session,
    });
    let evaluation = evaluateReconciliation({
      attempt,
      booking,
      order,
      payment,
      now,
    });
    const competingAttempt = await findCompetingAttempt({ attempt, session });
    if (competingAttempt && evaluation.shouldAuthorize) {
      evaluation = forceNeedsReview(
        evaluation,
        [PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_STATE_CONFLICT],
        { recommendedAttemptStatus: null }
      );
    }
    return {
      attempt,
      booking,
      competingAttempt,
      evaluation,
    };
  };

  const persistNeedsReview = async ({
    session,
    attempt,
    booking,
    competingAttempt,
    evaluation,
    source,
    eventKey,
    order,
    payment,
    now,
  }) => {
    if (!attempt || competingAttempt) return;

    const set = buildReconciliationSet({
      evaluation,
      source,
      eventKey,
      order,
      payment,
      now,
    });
    if (
      evaluation.recommendedAttemptStatus === 'needs_review'
      && !attempt.paymentId
    ) {
      set.status = 'needs_review';
    }

    const attemptResult = await PaymentAttemptModel.updateOne({
      _id: attempt._id,
      status: attempt.status,
      orderId: attempt.orderId,
    }, {
      $set: set,
    }, {
      session,
      runValidators: true,
    });
    if (getMatchedCount(attemptResult) !== 1) {
      throw new PaymentReconciliationStateError(
        'PAYMENT_ATTEMPT_STATE_CONFLICT',
        'The payment attempt changed during review persistence',
        { retryable: true }
      );
    }

    const bookingAuthorizationKind = booking?.bookingAuthorization?.kind;
    const bookingAuthorizationStatus = booking?.bookingAuthorization?.status;
    if (
      booking
      && booking.paymentStatus !== 'paid'
      && booking.paymentMethod === 'razorpay'
      && !(
        bookingAuthorizationKind === 'payment'
        && bookingAuthorizationStatus === 'needs_review'
      )
    ) {
      const bookingFilter = {
        _id: booking._id,
        user: attempt.user,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: 'razorpay',
        'bookingAuthorization.kind': bookingAuthorizationKind === undefined
          ? { $exists: false }
          : bookingAuthorizationKind,
        'bookingAuthorization.status': bookingAuthorizationStatus === undefined
          ? { $exists: false }
          : bookingAuthorizationStatus,
      };
      const bookingResult = await BookingModel.updateOne(bookingFilter, {
        $set: {
          'bookingAuthorization.kind': 'payment',
          'bookingAuthorization.status': 'needs_review',
        },
      }, {
        session,
        runValidators: true,
      });
      if (getMatchedCount(bookingResult) !== 1) {
        throw new PaymentReconciliationStateError(
          'BOOKING_STATE_CONFLICT',
          'The booking changed during review persistence',
          { retryable: true }
        );
      }
    }
  };

  const persistRejectedObservation = async ({
    session,
    attempt,
    evaluation,
    source,
    eventKey,
    order,
    payment,
    now,
  }) => {
    if (!attempt) return;
    const set = buildReconciliationSet({
      evaluation,
      source,
      eventKey,
      order,
      payment,
      now,
    });
    if (
      evaluation.recommendedAttemptStatus
      && !attempt.paymentId
      && ['order_created', 'payment_pending'].includes(attempt.status)
    ) {
      set.status = evaluation.recommendedAttemptStatus;
    }

    const result = await PaymentAttemptModel.updateOne({
      _id: attempt._id,
      status: attempt.status,
      orderId: attempt.orderId,
    }, {
      $set: set,
    }, {
      session,
      runValidators: true,
    });
    if (getMatchedCount(result) !== 1) {
      throw new PaymentReconciliationStateError(
        'PAYMENT_ATTEMPT_STATE_CONFLICT',
        'The payment attempt changed during reconciliation',
        { retryable: true }
      );
    }
  };

  const authorizePayment = async ({
    session,
    attempt,
    booking,
    evaluation,
    source,
    eventKey,
    order,
    payment,
    now,
    existingReceipt,
  }) => {
    const attemptGuard = evaluation.transition.persistenceGuards.attempt;
    const bookingGuard = evaluation.transition.persistenceGuards.booking;
    const attemptSet = {
      ...evaluation.transition.attemptSet,
      ...buildReconciliationSet({
        evaluation,
        source,
        eventKey,
        order,
        payment,
        now,
      }),
    };

    const attemptResult = await PaymentAttemptModel.updateOne({
      _id: attemptGuard.id,
      booking: attempt.booking,
      user: attempt.user,
      orderId: attemptGuard.orderId,
      status: { $in: attemptGuard.allowedStatuses },
      $or: [
        { paymentId: { $exists: false } },
        { paymentId: null },
        { paymentId: '' },
      ],
    }, {
      $set: attemptSet,
    }, {
      session,
      runValidators: true,
    });
    if (getMatchedCount(attemptResult) !== 1) {
      throw new PaymentReconciliationStateError(
        'PAYMENT_ATTEMPT_STATE_CONFLICT',
        'The payment attempt changed before authorization',
        { retryable: true }
      );
    }

    const bookingResult = await BookingModel.updateOne({
      _id: bookingGuard.id,
      user: bookingGuard.userId,
      razorpayOrderId: bookingGuard.orderId,
      status: bookingGuard.requiredStatus,
      paymentStatus: { $in: bookingGuard.allowedPaymentStatuses },
      paymentMethod: 'razorpay',
      amountMinor: bookingGuard.amountMinor,
      currency: bookingGuard.currency,
      'pricing.listAmountMinor': bookingGuard.amountMinor,
      'pricing.currency': bookingGuard.currency,
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'pending',
      holdExpiresAt: { $gt: bookingGuard.holdExpiresAfter },
      scheduledAt: { $gt: bookingGuard.scheduledAfter },
      $and: [
        {
          $or: [
            { paymentId: { $exists: false } },
            { paymentId: null },
            { paymentId: '' },
          ],
        },
        {
          $or: [
            { transactionId: { $exists: false } },
            { transactionId: null },
            { transactionId: '' },
          ],
        },
      ],
    }, {
      $set: evaluation.transition.bookingSet,
      $push: {
        statusHistory: {
          status: 'confirmed',
          timestamp: now,
        },
      },
    }, {
      session,
      runValidators: true,
    });
    if (getMatchedCount(bookingResult) !== 1) {
      throw new PaymentReconciliationStateError(
        'BOOKING_STATE_CONFLICT',
        'The booking changed before payment authorization',
        { retryable: true }
      );
    }

    if (!existingReceipt) {
      const receiptDocument = buildExpectedReceipt({ attempt, order, payment });
      await PaymentReceiptModel.create([receiptDocument], { session });
    }
  };

  const reconcileOnce = async ({
    attemptLocator,
    order,
    payment,
    source,
    eventKey,
    claimToken,
    now,
  }) => runInTransaction(async (session) => {
    await assertLinkedWebhookClaim({
      session,
      source,
      eventKey,
      claimToken,
      expectedEventType: 'payment.captured',
    });
    let {
      attempt,
      booking,
      competingAttempt,
      evaluation,
    } = await readAndEvaluate({
      attemptLocator,
      order,
      payment,
      now,
      session,
    });

    if (source === 'webhook') {
      const providerEvidence = classifyCapturedWebhookProviderEvidence({
        order,
        payment,
      });
      if (providerEvidence === 'transient') {
        throw new PaymentReconciliationStateError(
          'PROVIDER_CAPTURE_EVIDENCE_NOT_FINAL',
          'Provider capture evidence is not final yet',
          { retryable: true }
        );
      }
      if (providerEvidence === 'contradictory') {
        evaluation = forceNeedsReview(evaluation, [
          'PROVIDER_CAPTURE_EVIDENCE_CONTRADICTION',
        ]);
      }
    }

    let existingReceipt = null;
    if (attempt && asTrimmedString(payment?.id)) {
      existingReceipt = await executeQuery(
        PaymentReceiptModel.findOne({
          paymentId: asTrimmedString(payment.id),
        }),
        { session }
      );
      if (existingReceipt) {
        const expectedReceipt = buildReceiptComparison(
          buildExpectedReceipt({ attempt, order, payment })
        );
        if (!receiptMatches({
          receipt: existingReceipt,
          expected: expectedReceipt,
        })) {
          evaluation = forceNeedsReview(evaluation, [
            'PAYMENT_RECEIPT_CONFLICT',
          ]);
        }
      }
    }

    let shouldNotify = false;
    if (evaluation.decision === RECONCILIATION_DECISIONS.AUTHORIZE) {
      await authorizePayment({
        session,
        attempt,
        booking,
        evaluation,
        source,
        eventKey,
        order,
        payment,
        now,
        existingReceipt,
      });
      shouldNotify = true;
    } else if (
      evaluation.decision === RECONCILIATION_DECISIONS.ALREADY_APPLIED
      && attempt
      && !existingReceipt
    ) {
      const receiptDocument = buildExpectedReceipt({ attempt, order, payment });
      await PaymentReceiptModel.create([receiptDocument], { session });
    } else if (evaluation.decision === RECONCILIATION_DECISIONS.NEEDS_REVIEW) {
      await persistNeedsReview({
        session,
        attempt,
        booking,
        competingAttempt,
        evaluation,
        source,
        eventKey,
        order,
        payment,
        now,
      });
    } else if (evaluation.decision === RECONCILIATION_DECISIONS.REJECT) {
      await persistRejectedObservation({
        session,
        attempt,
        evaluation,
        source,
        eventKey,
        order,
        payment,
        now,
      });
    }

    const eventState = evaluation.decision === RECONCILIATION_DECISIONS.NEEDS_REVIEW
      ? 'needs_review'
      : evaluation.decision === RECONCILIATION_DECISIONS.REJECT
        ? 'ignored'
        : 'processed';
    await finalizeLinkedWebhookEvent({
      session,
      source,
      eventKey,
      claimToken,
      processingState: eventState,
      decision: evaluation.decision,
      mismatchCodes: evaluation.mismatchCodes,
      orderId: evaluation.safeEvidence?.orderId,
      paymentId: evaluation.safeEvidence?.paymentId,
      bookingId: booking?._id,
      paymentAttemptId: attempt?._id,
      now,
    });

    return {
      decision: evaluation.decision,
      idempotent:
        evaluation.decision === RECONCILIATION_DECISIONS.ALREADY_APPLIED,
      shouldNotify,
      bookingId: asComparableId(booking?._id) || null,
      paymentAttemptId: asComparableId(attempt?._id) || null,
      mismatchCodes: [...evaluation.mismatchCodes],
      isDelayedRecovery: Boolean(evaluation.isDelayedRecovery),
    };
  });

  const reconcileCapturedBookingPayment = async (input) => {
    const normalized = validateReconciliationContext(input);
    const context = {
      ...input,
      ...normalized,
    };

    let lastError;
    for (let attemptNumber = 0; attemptNumber < MAX_TRANSACTION_ATTEMPTS; attemptNumber += 1) {
      try {
        return await reconcileOnce(context);
      } catch (error) {
        lastError = error;
        if (error?.code === 'PROVIDER_CAPTURE_EVIDENCE_NOT_FINAL') throw error;
        if (!isRetryableServiceError(error)) throw error;
      }
    }
    throw lastError;
  };

  const recordFailureOnce = async ({
    attemptLocator,
    order,
    payment,
    source,
    eventKey,
    claimToken,
    now,
  }) => runInTransaction(async (session) => {
    await assertLinkedWebhookClaim({
      session,
      source,
      eventKey,
      claimToken,
      expectedEventType: 'payment.failed',
    });
    let {
      attempt,
      booking,
      competingAttempt,
      evaluation,
    } = await readAndEvaluate({
      attemptLocator,
      order,
      payment,
      now,
      session,
    });

    const alreadyApplied = isExactAppliedPayment({
      attempt,
      booking,
      order,
      payment,
    });
    const exactFailedAssociation = isExactFailedProviderAssociation({
      attempt,
      booking,
      order,
      payment,
    });
    const alreadyRecorded = exactFailedAssociation
      && attempt?.status === 'payment_failed'
      && booking?.paymentStatus === 'failed'
      && booking?.orderStatus === 'failed';
    let failureRequiresReview = false;

    if (alreadyApplied) {
      evaluation = {
        ...evaluation,
        decision: RECONCILIATION_DECISIONS.ALREADY_APPLIED,
        idempotent: true,
        mismatchCodes: [],
        primaryMismatchCode: null,
        recommendedAttemptStatus: null,
        transition: null,
      };
    } else if (competingAttempt) {
      failureRequiresReview = true;
      evaluation = forceNeedsReview(
        evaluation,
        [PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_STATE_CONFLICT],
        { recommendedAttemptStatus: null }
      );
    } else if (!exactFailedAssociation) {
      failureRequiresReview = true;
      evaluation = forceNeedsReview(
        evaluation,
        ['FAILED_PAYMENT_EVIDENCE_MISMATCH']
      );
    } else {
      const unexpectedCodes = getUnexpectedFailedEvidenceCodes({
        evaluation,
        attempt,
        booking,
      });
      const partiallyRecordedFailure =
        attempt?.status === 'payment_failed' && !alreadyRecorded;
      if (unexpectedCodes.length > 0 || partiallyRecordedFailure) {
        failureRequiresReview = true;
        evaluation = forceNeedsReview(evaluation, [
          ...unexpectedCodes,
          ...(partiallyRecordedFailure
            ? ['FAILED_PAYMENT_STATE_INCONSISTENT']
            : []),
        ]);
      }
    }
    const activeExactFailure = !alreadyApplied
      && !competingAttempt
      && exactFailedAssociation
      && !failureRequiresReview
      && !alreadyRecorded
      && isExactFailedEvidence({
        evaluation,
        order,
        payment,
      });

    let recorded = false;
    if (activeExactFailure) {
      const attemptResult = await PaymentAttemptModel.updateOne({
        _id: attempt._id,
        booking: attempt.booking,
        user: attempt.user,
        orderId: attempt.orderId,
        status: { $in: ['order_created', 'payment_pending'] },
        $or: [
          { paymentId: { $exists: false } },
          { paymentId: null },
          { paymentId: '' },
        ],
      }, {
        $set: {
          status: 'payment_failed',
          failedAt: now,
          ...buildReconciliationSet({
            evaluation,
            source,
            eventKey,
            order,
            payment,
            now,
          }),
        },
      }, {
        session,
        runValidators: true,
      });
      if (getMatchedCount(attemptResult) !== 1) {
        throw new PaymentReconciliationStateError(
          'PAYMENT_ATTEMPT_STATE_CONFLICT',
          'The payment attempt changed before failure recording',
          { retryable: true }
        );
      }

      const bookingResult = await BookingModel.updateOne({
        _id: booking._id,
        user: attempt.user,
        razorpayOrderId: attempt.orderId,
        status: 'pending',
        paymentStatus: { $in: ['pending', 'failed'] },
        paymentMethod: 'razorpay',
        amountMinor: attempt.expected.amountMinor,
        currency: attempt.expected.currency,
        'pricing.listAmountMinor': attempt.expected.amountMinor,
        'pricing.currency': attempt.expected.currency,
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'pending',
        holdExpiresAt: { $gt: now },
        scheduledAt: { $gt: now },
      }, {
        $set: {
          paymentStatus: 'failed',
          orderStatus: 'failed',
          paymentAttemptedAt: now,
        },
      }, {
        session,
        runValidators: true,
      });
      if (getMatchedCount(bookingResult) !== 1) {
        throw new PaymentReconciliationStateError(
          'BOOKING_STATE_CONFLICT',
          'The booking changed before failure recording',
          { retryable: true }
        );
      }
      recorded = true;
    } else if (failureRequiresReview) {
      await persistNeedsReview({
        session,
        attempt,
        booking,
        competingAttempt,
        evaluation,
        source,
        eventKey,
        order,
        payment,
        now,
      });
    }

    const needsReview = !alreadyApplied
      && failureRequiresReview;
    const decision = alreadyApplied
      ? RECONCILIATION_DECISIONS.ALREADY_APPLIED
      : needsReview
        ? RECONCILIATION_DECISIONS.NEEDS_REVIEW
        : RECONCILIATION_DECISIONS.REJECT;
    const eventState = needsReview
      ? 'needs_review'
      : recorded || alreadyRecorded
        ? 'processed'
        : 'ignored';
    await finalizeLinkedWebhookEvent({
      session,
      source,
      eventKey,
      claimToken,
      processingState: eventState,
      decision,
      mismatchCodes: evaluation.mismatchCodes,
      orderId: evaluation.safeEvidence?.orderId,
      paymentId: evaluation.safeEvidence?.paymentId,
      bookingId: booking?._id,
      paymentAttemptId: attempt?._id,
      now,
    });

    return {
      decision,
      idempotent: alreadyApplied || alreadyRecorded,
      recorded,
      shouldNotify: false,
      bookingId: asComparableId(booking?._id) || null,
      paymentAttemptId: asComparableId(attempt?._id) || null,
      mismatchCodes: [...evaluation.mismatchCodes],
    };
  });

  const recordBookingPaymentFailure = async (input) => {
    const normalized = validateReconciliationContext(input);
    const context = {
      ...input,
      ...normalized,
    };

    let lastError;
    for (let attemptNumber = 0; attemptNumber < MAX_TRANSACTION_ATTEMPTS; attemptNumber += 1) {
      try {
        return await recordFailureOnce(context);
      } catch (error) {
        lastError = error;
        if (!isRetryableServiceError(error)) throw error;
      }
    }
    throw lastError;
  };

  const finalizeWebhookEvent = async ({
    eventKey,
    claimToken,
    processingState,
    decision,
    mismatchCodes = [],
    orderId,
    paymentId,
    bookingId,
    paymentAttemptId,
    now = new Date(),
  }) => {
    const normalizedEventKey = requirePattern(
      eventKey,
      EVENT_KEY_PATTERN,
      'eventKey'
    );
    const normalizedClaimToken = normalizeClaimToken(claimToken, {
      required: true,
    });
    if (!WEBHOOK_FINAL_STATES.has(processingState)) {
      throw new PaymentReconciliationStateError(
        'INVALID_RECONCILIATION_INPUT',
        'Webhook final state is invalid'
      );
    }
    if (
      decision !== undefined
      && decision !== null
      && !RECONCILIATION_DECISION_VALUES.has(decision)
    ) {
      throw new PaymentReconciliationStateError(
        'INVALID_RECONCILIATION_INPUT',
        'Webhook reconciliation decision is invalid'
      );
    }
    const safeCodes = normalizeSafeCodes(mismatchCodes);
    const evaluatedAt = asValidDate(now, 'now');
    const set = {
      processingState,
      mismatchCodes: safeCodes,
      failureCode: null,
      processedAt: evaluatedAt,
      nextRetryAt: null,
      ...buildEventSubjectSet({
        orderId,
        paymentId,
        bookingId,
        paymentAttemptId,
      }),
    };
    if (decision !== undefined && decision !== null) {
      set.reconciliationDecision = decision;
    }

    const result = await PaymentWebhookEventModel.updateOne({
      eventKey: normalizedEventKey,
      processingState: 'processing',
      processingAttempts: normalizedClaimToken,
    }, {
      $set: set,
    }, {
      runValidators: true,
      ...MAJORITY_WRITE_OPTIONS,
    });
    if (getMatchedCount(result) === 1) {
      return { finalized: true, processingState };
    }

    const existing = await executeQuery(
      PaymentWebhookEventModel.findOne({ eventKey: normalizedEventKey })
    );
    if (isExactTerminalWebhookOutcome({
      event: existing,
      processingState,
      decision,
      mismatchCodes: safeCodes,
      orderId,
      paymentId,
      bookingId,
      paymentAttemptId,
    })) {
      return {
        finalized: false,
        duplicate: true,
        processingState,
      };
    }
    throw new PaymentReconciliationStateError(
      existing ? 'WEBHOOK_CLAIM_STALE' : 'WEBHOOK_LEDGER_MISSING',
      'The webhook ledger event could not be finalized'
    );
  };

  const finalizeWebhookEventFailure = async ({
    eventKey,
    claimToken,
    failureCode,
    now = new Date(),
    retryDelayMs = webhookRetryDelayMs,
  }) => {
    const normalizedEventKey = requirePattern(
      eventKey,
      EVENT_KEY_PATTERN,
      'eventKey'
    );
    const normalizedClaimToken = normalizeClaimToken(claimToken, {
      required: true,
    });
    const normalizedFailureCode = normalizeSafeCodes([failureCode])[0];
    const evaluatedAt = asValidDate(now, 'now');
    if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
      throw new PaymentReconciliationStateError(
        'INVALID_RECONCILIATION_INPUT',
        'Webhook retry delay is invalid'
      );
    }
    const nextRetryAt = new Date(evaluatedAt.getTime() + retryDelayMs);

    const result = await PaymentWebhookEventModel.updateOne({
      eventKey: normalizedEventKey,
      processingState: 'processing',
      processingAttempts: normalizedClaimToken,
    }, {
      $set: {
        processingState: 'retryable_failure',
        failureCode: normalizedFailureCode,
        lastAttemptAt: evaluatedAt,
        nextRetryAt,
      },
    }, {
      runValidators: true,
      ...MAJORITY_WRITE_OPTIONS,
    });
    if (getMatchedCount(result) === 1) {
      return {
        finalized: true,
        processingState: 'retryable_failure',
        nextRetryAt,
      };
    }

    const existing = await executeQuery(
      PaymentWebhookEventModel.findOne({ eventKey: normalizedEventKey })
    );
    if (
      existing?.processingState === 'retryable_failure'
      && existing.processingAttempts === normalizedClaimToken
      && existing.failureCode === normalizedFailureCode
    ) {
      return {
        finalized: false,
        duplicate: true,
        processingState: 'retryable_failure',
        nextRetryAt: existing.nextRetryAt || null,
      };
    }
    throw new PaymentReconciliationStateError(
      existing ? 'WEBHOOK_CLAIM_STALE' : 'WEBHOOK_LEDGER_MISSING',
      'The webhook ledger failure could not be recorded'
    );
  };

  return {
    claimWebhookEvent,
    finalizeWebhookEvent,
    finalizeWebhookEventFailure,
    reconcileCapturedBookingPayment,
    recordBookingPaymentFailure,
  };
};

const defaultService = createRazorpayPaymentReconciliationService();

module.exports = {
  DEFAULT_WEBHOOK_LEASE_MS,
  DEFAULT_WEBHOOK_RETRY_DELAY_MS,
  PaymentReconciliationStateError,
  createRazorpayPaymentReconciliationService,
  ...defaultService,
};
