const RECONCILIATION_DECISIONS = Object.freeze({
  AUTHORIZE: 'authorize',
  ALREADY_APPLIED: 'already_applied',
  REJECT: 'reject',
  NEEDS_REVIEW: 'needs_review',
});

const RECONCILABLE_ATTEMPT_STATUSES = new Set([
  'order_created',
  'payment_pending',
  'payment_failed',
]);

const RECONCILABLE_BOOKING_PAYMENT_STATUSES = new Set([
  'pending',
  'failed',
]);

const NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES = Object.freeze([
  'creating',
  'order_created',
  'payment_pending',
  'payment_failed',
  'captured',
  'needs_review',
]);

const PAYMENT_RECONCILIATION_MISMATCH_CODES = Object.freeze({
  ATTEMPT_MISSING: 'ATTEMPT_MISSING',
  BOOKING_MISSING: 'BOOKING_MISSING',
  ORDER_EVIDENCE_MISSING: 'ORDER_EVIDENCE_MISSING',
  PAYMENT_EVIDENCE_MISSING: 'PAYMENT_EVIDENCE_MISSING',
  ATTEMPT_PROVIDER_INVALID: 'ATTEMPT_PROVIDER_INVALID',
  ATTEMPT_PURPOSE_INVALID: 'ATTEMPT_PURPOSE_INVALID',
  ATTEMPT_ORDER_ID_MISSING: 'ATTEMPT_ORDER_ID_MISSING',
  ATTEMPT_BOOKING_ID_MISSING: 'ATTEMPT_BOOKING_ID_MISSING',
  ATTEMPT_USER_ID_MISSING: 'ATTEMPT_USER_ID_MISSING',
  ATTEMPT_STATUS_INVALID: 'ATTEMPT_STATUS_INVALID',
  ATTEMPT_NOT_RECONCILABLE: 'ATTEMPT_NOT_RECONCILABLE',
  ATTEMPT_STATE_CONFLICT: 'ATTEMPT_STATE_CONFLICT',
  ATTEMPT_PAYMENT_ID_MISMATCH: 'ATTEMPT_PAYMENT_ID_MISMATCH',
  EXPECTED_AMOUNT_INVALID: 'EXPECTED_AMOUNT_INVALID',
  EXPECTED_CURRENCY_INVALID: 'EXPECTED_CURRENCY_INVALID',
  EXPECTED_RECEIPT_INVALID: 'EXPECTED_RECEIPT_INVALID',
  EXPECTED_BOOKING_NOTE_INVALID: 'EXPECTED_BOOKING_NOTE_INVALID',
  EXPECTED_USER_NOTE_INVALID: 'EXPECTED_USER_NOTE_INVALID',
  ATTEMPT_BOOKING_ID_MISMATCH: 'ATTEMPT_BOOKING_ID_MISMATCH',
  ATTEMPT_USER_ID_MISMATCH: 'ATTEMPT_USER_ID_MISMATCH',
  BOOKING_ORDER_ID_MISMATCH: 'BOOKING_ORDER_ID_MISMATCH',
  BOOKING_PAYMENT_METHOD_MISMATCH: 'BOOKING_PAYMENT_METHOD_MISMATCH',
  BOOKING_AMOUNT_MISMATCH: 'BOOKING_AMOUNT_MISMATCH',
  BOOKING_PRICE_SNAPSHOT_MISMATCH: 'BOOKING_PRICE_SNAPSHOT_MISMATCH',
  BOOKING_CURRENCY_MISMATCH: 'BOOKING_CURRENCY_MISMATCH',
  BOOKING_PRICE_CURRENCY_MISMATCH: 'BOOKING_PRICE_CURRENCY_MISMATCH',
  BOOKING_NOT_PAYABLE: 'BOOKING_NOT_PAYABLE',
  BOOKING_HOLD_INVALID: 'BOOKING_HOLD_INVALID',
  BOOKING_HOLD_EXPIRED: 'BOOKING_HOLD_EXPIRED',
  BOOKING_SCHEDULE_INVALID: 'BOOKING_SCHEDULE_INVALID',
  BOOKING_SCHEDULE_PASSED: 'BOOKING_SCHEDULE_PASSED',
  BOOKING_PAYMENT_STATUS_INVALID: 'BOOKING_PAYMENT_STATUS_INVALID',
  BOOKING_PAYMENT_ID_MISMATCH: 'BOOKING_PAYMENT_ID_MISMATCH',
  BOOKING_TRANSACTION_ID_MISMATCH: 'BOOKING_TRANSACTION_ID_MISMATCH',
  BOOKING_AUTHORIZATION_CONFLICT: 'BOOKING_AUTHORIZATION_CONFLICT',
  ORDER_ID_MISMATCH: 'ORDER_ID_MISMATCH',
  ORDER_AMOUNT_MISMATCH: 'ORDER_AMOUNT_MISMATCH',
  ORDER_CURRENCY_MISMATCH: 'ORDER_CURRENCY_MISMATCH',
  ORDER_RECEIPT_MISMATCH: 'ORDER_RECEIPT_MISMATCH',
  ORDER_BOOKING_NOTE_MISMATCH: 'ORDER_BOOKING_NOTE_MISMATCH',
  ORDER_USER_NOTE_MISMATCH: 'ORDER_USER_NOTE_MISMATCH',
  ORDER_STATUS_NOT_PAID: 'ORDER_STATUS_NOT_PAID',
  PAYMENT_ID_MISSING: 'PAYMENT_ID_MISSING',
  PAYMENT_ORDER_ID_MISMATCH: 'PAYMENT_ORDER_ID_MISMATCH',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_CURRENCY_MISMATCH: 'PAYMENT_CURRENCY_MISMATCH',
  PAYMENT_BOOKING_NOTE_MISMATCH: 'PAYMENT_BOOKING_NOTE_MISMATCH',
  PAYMENT_USER_NOTE_MISMATCH: 'PAYMENT_USER_NOTE_MISMATCH',
  PAYMENT_STATUS_NOT_CAPTURED: 'PAYMENT_STATUS_NOT_CAPTURED',
  PAYMENT_CAPTURE_FLAG_NOT_TRUE: 'PAYMENT_CAPTURE_FLAG_NOT_TRUE',
  EVALUATION_TIME_INVALID: 'EVALUATION_TIME_INVALID',
});

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

const isPositiveSafeInteger = (value) =>
  Number.isSafeInteger(value) && value > 0;

const hasProviderNotes = (notes) =>
  notes !== null
  && typeof notes === 'object'
  && Object.keys(notes).length > 0;

const asValidDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getExpectedSnapshot = (attempt) => {
  const expected = attempt?.expected;
  return {
    amountMinor: expected?.amountMinor,
    currency: asTrimmedString(expected?.currency),
    receipt: asTrimmedString(expected?.receipt),
    bookingNote: asComparableId(expected?.notes?.bookingId),
    userNote: asComparableId(expected?.notes?.userId),
  };
};

const buildBookingPaymentReceipt = (attemptId) => {
  const normalizedAttemptId = asComparableId(attemptId);
  if (!/^[a-fA-F0-9]{24}$/.test(normalizedAttemptId)) {
    throw new Error('Payment attempt ID must be a MongoDB ObjectId');
  }
  return `booking_${normalizedAttemptId}`;
};

const getExactBookingAuthorization = ({ booking, paymentId }) => {
  const authorization = booking?.bookingAuthorization;
  return authorization?.kind === 'payment'
    && authorization?.status === 'authorized'
    && asTrimmedString(authorization?.reference) === paymentId;
};

const isAlreadyApplied = ({
  attempt,
  booking,
  orderId,
  paymentId,
}) =>
  attempt?.status === 'captured'
  && asTrimmedString(attempt?.paymentId) === paymentId
  && booking?.paymentStatus === 'paid'
  && asTrimmedString(booking?.paymentId) === paymentId
  && asTrimmedString(booking?.transactionId) === orderId
  && booking?.orderStatus === 'paid'
  && getExactBookingAuthorization({ booking, paymentId });

const buildAuthorizationTransition = ({
  orderId,
  paymentId,
  evaluatedAt,
}) => ({
  attemptSet: {
    status: 'captured',
    paymentId,
    capturedAt: evaluatedAt,
    'reconciliation.lastDecision': RECONCILIATION_DECISIONS.AUTHORIZE,
    'reconciliation.mismatchCodes': [],
    'reconciliation.providerOrderStatus': 'paid',
    'reconciliation.providerPaymentStatus': 'captured',
    'reconciliation.evaluatedAt': evaluatedAt,
  },
  bookingSet: {
    paymentStatus: 'paid',
    paymentMethod: 'razorpay',
    paymentId,
    transactionId: orderId,
    razorpayOrderId: orderId,
    orderStatus: 'paid',
    status: 'confirmed',
    bookingAuthorization: {
      kind: 'payment',
      status: 'authorized',
      reference: paymentId,
      authorizedAt: evaluatedAt,
    },
  },
  requiredCallerSet: [
    'reconciliation.lastSource',
    'reconciliation.lastEventKey',
  ],
});

/**
 * Evaluates already-fetched, trusted Razorpay order/payment evidence.
 *
 * This function is intentionally pure. Callers must supply complete trusted
 * entities from either a signature-verified webhook containing both entities
 * or server-side provider fetches. Never pass redirect/client claims. Apply an
 * AUTHORIZE transition together with the event ledger in one database
 * transaction. No decision from this function mutates a document.
 */
const evaluateBookingPaymentReconciliation = ({
  attempt,
  booking,
  order,
  payment,
  now = new Date(),
}) => {
  const parsedEvaluationTime = asValidDate(now);
  const evaluatedAt = parsedEvaluationTime || new Date(0);
  const mismatchCodes = [];
  const addMismatch = (code) => {
    if (!mismatchCodes.includes(code)) mismatchCodes.push(code);
  };

  if (!attempt) addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_MISSING);
  if (!booking) addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_MISSING);
  if (!order) addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_EVIDENCE_MISSING);
  if (!payment) addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_EVIDENCE_MISSING);
  if (!parsedEvaluationTime) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.EVALUATION_TIME_INVALID);
  }

  const attemptOrderId = asTrimmedString(attempt?.orderId);
  const attemptBookingId = asComparableId(attempt?.booking);
  const attemptUserId = asComparableId(attempt?.user);
  const bookingId = asComparableId(booking?._id);
  const bookingUserId = asComparableId(booking?.user);
  const orderId = asTrimmedString(order?.id);
  const paymentId = asTrimmedString(payment?.id);
  const paymentOrderId = asTrimmedString(payment?.order_id);
  const expected = getExpectedSnapshot(attempt);

  if (attempt && attempt.provider !== 'razorpay') {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_PROVIDER_INVALID);
  }
  if (attempt && attempt.purpose !== 'booking') {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_PURPOSE_INVALID);
  }
  if (!attemptOrderId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_ORDER_ID_MISSING);
  }
  if (!attemptBookingId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_BOOKING_ID_MISSING);
  }
  if (!attemptUserId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_USER_ID_MISSING);
  }
  if (!isPositiveSafeInteger(expected.amountMinor)) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.EXPECTED_AMOUNT_INVALID);
  }
  if (expected.currency !== 'INR') {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.EXPECTED_CURRENCY_INVALID);
  }
  if (!expected.receipt) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.EXPECTED_RECEIPT_INVALID);
  }
  if (!expected.bookingNote || expected.bookingNote !== attemptBookingId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.EXPECTED_BOOKING_NOTE_INVALID);
  }
  if (!expected.userNote || expected.userNote !== attemptUserId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.EXPECTED_USER_NOTE_INVALID);
  }

  if (booking && attemptBookingId !== bookingId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_BOOKING_ID_MISMATCH);
  }
  if (booking && attemptUserId !== bookingUserId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_USER_ID_MISMATCH);
  }
  if (booking && asTrimmedString(booking.razorpayOrderId) !== attemptOrderId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_ORDER_ID_MISMATCH);
  }
  if (booking && booking.paymentMethod !== 'razorpay') {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_PAYMENT_METHOD_MISMATCH);
  }
  if (booking && booking.amountMinor !== expected.amountMinor) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_AMOUNT_MISMATCH);
  }
  if (booking && booking.pricing?.listAmountMinor !== expected.amountMinor) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_PRICE_SNAPSHOT_MISMATCH);
  }
  if (booking && booking.currency !== expected.currency) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_CURRENCY_MISMATCH);
  }
  if (booking && booking.pricing?.currency !== expected.currency) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_PRICE_CURRENCY_MISMATCH);
  }

  if (orderId !== attemptOrderId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_ID_MISMATCH);
  }
  if (order && order.amount !== expected.amountMinor) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_AMOUNT_MISMATCH);
  }
  if (order && order.currency !== expected.currency) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_CURRENCY_MISMATCH);
  }
  if (order && asTrimmedString(order.receipt) !== expected.receipt) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_RECEIPT_MISMATCH);
  }
  if (order && asComparableId(order.notes?.bookingId) !== expected.bookingNote) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_BOOKING_NOTE_MISMATCH);
  }
  if (order && asComparableId(order.notes?.userId) !== expected.userNote) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_USER_NOTE_MISMATCH);
  }
  if (order && order.status !== 'paid') {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ORDER_STATUS_NOT_PAID);
  }

  if (!paymentId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_ID_MISSING);
  }
  if (paymentOrderId !== attemptOrderId) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_ORDER_ID_MISMATCH);
  }
  if (payment && payment.amount !== expected.amountMinor) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_AMOUNT_MISMATCH);
  }
  if (payment && payment.currency !== expected.currency) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_CURRENCY_MISMATCH);
  }
  if (
    payment
    && hasProviderNotes(payment.notes)
    && asComparableId(payment.notes.bookingId) !== expected.bookingNote
  ) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_BOOKING_NOTE_MISMATCH);
  }
  if (
    payment
    && hasProviderNotes(payment.notes)
    && asComparableId(payment.notes.userId) !== expected.userNote
  ) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_USER_NOTE_MISMATCH);
  }
  if (payment && payment.status !== 'captured') {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_STATUS_NOT_CAPTURED);
  }
  if (payment && payment.captured !== true) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.PAYMENT_CAPTURE_FLAG_NOT_TRUE);
  }

  if (
    attempt?.paymentId
    && asTrimmedString(attempt.paymentId) !== paymentId
  ) {
    addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_PAYMENT_ID_MISMATCH);
  }

  const duplicate = isAlreadyApplied({
    attempt,
    booking,
    orderId: attemptOrderId,
    paymentId,
  });

  if (attempt) {
    if (![
      'creating',
      ...RECONCILABLE_ATTEMPT_STATUSES,
      'captured',
      'expired',
      'needs_review',
    ].includes(attempt.status)) {
      addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_STATUS_INVALID);
    } else if (['creating', 'expired', 'needs_review'].includes(attempt.status)) {
      addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_NOT_RECONCILABLE);
    } else if (attempt.status === 'captured' && !duplicate) {
      addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_STATE_CONFLICT);
    } else if (attempt.paymentId && attempt.status !== 'captured') {
      addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.ATTEMPT_STATE_CONFLICT);
    }
  }

  if (booking) {
    if (booking.paymentStatus === 'paid') {
      if (asTrimmedString(booking.paymentId) !== paymentId) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_PAYMENT_ID_MISMATCH);
      }
      if (asTrimmedString(booking.transactionId) !== attemptOrderId) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_TRANSACTION_ID_MISMATCH);
      }
      if (!getExactBookingAuthorization({ booking, paymentId })) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_AUTHORIZATION_CONFLICT);
      }
      if (!duplicate) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_PAYMENT_STATUS_INVALID);
      }
    } else {
      if (!RECONCILABLE_BOOKING_PAYMENT_STATUSES.has(booking.paymentStatus)) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_PAYMENT_STATUS_INVALID);
      }
      if (booking.status !== 'pending') {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_NOT_PAYABLE);
      }
      const holdExpiresAt = asValidDate(booking.holdExpiresAt);
      if (!holdExpiresAt) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_HOLD_INVALID);
      } else if (holdExpiresAt <= evaluatedAt) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_HOLD_EXPIRED);
      }
      const scheduledAt = asValidDate(booking.scheduledAt);
      if (!scheduledAt) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_SCHEDULE_INVALID);
      } else if (scheduledAt <= evaluatedAt) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_SCHEDULE_PASSED);
      }
      if (
        booking.bookingAuthorization?.kind !== 'payment'
        || booking.bookingAuthorization?.status !== 'pending'
      ) {
        addMismatch(PAYMENT_RECONCILIATION_MISMATCH_CODES.BOOKING_AUTHORIZATION_CONFLICT);
      }
    }
  }

  const providerClaimsFunds = order?.status === 'paid'
    || payment?.status === 'captured'
    || payment?.captured === true;

  let decision;
  if (mismatchCodes.length === 0 && duplicate) {
    decision = RECONCILIATION_DECISIONS.ALREADY_APPLIED;
  } else if (mismatchCodes.length === 0) {
    decision = RECONCILIATION_DECISIONS.AUTHORIZE;
  } else if (providerClaimsFunds) {
    decision = RECONCILIATION_DECISIONS.NEEDS_REVIEW;
  } else {
    decision = RECONCILIATION_DECISIONS.REJECT;
  }

  const transition = decision === RECONCILIATION_DECISIONS.AUTHORIZE
    ? buildAuthorizationTransition({
      orderId: attemptOrderId,
      paymentId,
      evaluatedAt,
    })
    : null;

  let recommendedAttemptStatus = null;
  if (decision === RECONCILIATION_DECISIONS.NEEDS_REVIEW) {
    // A conflicting captured attempt keeps its original payment binding. The
    // event ledger records the new provider payment ID for manual review.
    recommendedAttemptStatus = attempt?.paymentId ? null : 'needs_review';
  } else if (
    decision === RECONCILIATION_DECISIONS.REJECT
    && payment?.status === 'failed'
  ) {
    recommendedAttemptStatus = 'payment_failed';
  } else if (decision === RECONCILIATION_DECISIONS.REJECT && attempt) {
    recommendedAttemptStatus = 'payment_pending';
  }

  return {
    decision,
    shouldAuthorize: decision === RECONCILIATION_DECISIONS.AUTHORIZE,
    idempotent: decision === RECONCILIATION_DECISIONS.ALREADY_APPLIED,
    failClosed: ![
      RECONCILIATION_DECISIONS.AUTHORIZE,
      RECONCILIATION_DECISIONS.ALREADY_APPLIED,
    ].includes(decision),
    mismatchCodes,
    primaryMismatchCode: mismatchCodes[0] || null,
    isDelayedRecovery:
      decision === RECONCILIATION_DECISIONS.AUTHORIZE
      && (
        attempt?.status === 'payment_failed'
        || booking?.paymentStatus === 'failed'
      ),
    recommendedAttemptStatus,
    safeEvidence: {
      orderId: orderId || null,
      paymentId: paymentId || null,
      amountMinor: isPositiveSafeInteger(payment?.amount) ? payment.amount : null,
      currency: asTrimmedString(payment?.currency) || null,
      providerOrderStatus: asTrimmedString(order?.status) || null,
      providerPaymentStatus: asTrimmedString(payment?.status) || null,
    },
    transition: transition
      ? {
        ...transition,
        persistenceGuards: {
          attempt: {
            id: asComparableId(attempt?._id) || null,
            orderId: attemptOrderId,
            allowedStatuses: [...RECONCILABLE_ATTEMPT_STATUSES],
            paymentIdMustBeUnset: true,
            noOtherAttemptWithStatus: [
              ...NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES,
            ],
          },
          booking: {
            id: bookingId || null,
            userId: attemptUserId || null,
            orderId: attemptOrderId,
            allowedPaymentStatuses: [...RECONCILABLE_BOOKING_PAYMENT_STATUSES],
            requiredStatus: 'pending',
            amountMinor: expected.amountMinor,
            currency: expected.currency,
            holdExpiresAfter: evaluatedAt,
            scheduledAfter: evaluatedAt,
          },
          applyWithEventLedgerAtomically: true,
        },
      }
      : null,
  };
};

module.exports = {
  NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_RECONCILIATION_MISMATCH_CODES,
  RECONCILIATION_DECISIONS,
  buildBookingPaymentReceipt,
  evaluateBookingPaymentReconciliation,
};
