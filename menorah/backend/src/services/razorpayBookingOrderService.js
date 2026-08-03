const mongoose = require('mongoose');
const PaymentAttempt = require('../models/PaymentAttempt');
const Booking = require('../models/Booking');
const {
  NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES,
  buildBookingPaymentReceipt,
} = require('./paymentReconciliationPolicy');
const {
  findRazorpayOrdersByReceipt,
  validateOrderAgainstExpected,
  withPaymentProviderTimeout,
} = require('./razorpayPaymentSecurity');
const {
  recordPaymentOperation,
} = require('../utils/reliabilityMetrics');

const DEFAULT_PROVIDER_TIMEOUT_MS = 5000;
const DEFAULT_RECOVERY_DELAY_MS = 30_000;
const PAYMENT_ORDER_TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
});

class BookingPaymentOrderError extends Error {
  constructor(code, message, { status = 409, retryable = false } = {}) {
    super(message);
    this.name = 'BookingPaymentOrderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const comparableId = (value) => String(value?._id || value || '');

const isFutureDate = (value, now) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) && date > now;
};

const evaluatePayableBooking = ({ booking, userId, now = new Date() }) => {
  const failures = [];
  const add = (code) => {
    if (!failures.includes(code)) failures.push(code);
  };

  if (!booking) add('BOOKING_NOT_FOUND');
  if (booking && comparableId(booking.user) !== comparableId(userId)) add('BOOKING_OWNER_MISMATCH');
  if (booking?.status !== 'pending') add('BOOKING_NOT_PENDING');
  if (!['pending', 'failed'].includes(booking?.paymentStatus)) add('BOOKING_NOT_PAYABLE');
  if (booking?.paymentMethod !== 'razorpay') add('PAYMENT_METHOD_MISMATCH');
  if (
    booking?.bookingAuthorization?.kind !== 'payment'
    || booking?.bookingAuthorization?.status !== 'pending'
  ) {
    add('BOOKING_AUTHORIZATION_MISMATCH');
  }
  if (!Number.isSafeInteger(booking?.amountMinor) || booking.amountMinor <= 0) {
    add('BOOKING_AMOUNT_INVALID');
  }
  if (booking?.amountMinor !== booking?.pricing?.listAmountMinor) {
    add('BOOKING_PRICING_MISMATCH');
  }
  if (booking?.currency !== 'INR' || booking?.pricing?.currency !== 'INR') {
    add('BOOKING_CURRENCY_INVALID');
  }
  if (!isFutureDate(booking?.holdExpiresAt, now)) add('BOOKING_HOLD_EXPIRED');
  if (!isFutureDate(booking?.scheduledAt, now)) add('BOOKING_SCHEDULE_PASSED');

  return { payable: failures.length === 0, failureCodes: failures };
};

const getExpectedSnapshot = ({ attemptId, booking, userId }) => ({
  amountMinor: booking.amountMinor,
  currency: booking.currency,
  receipt: buildBookingPaymentReceipt(attemptId),
  notes: {
    bookingId: comparableId(booking._id),
    userId: comparableId(userId),
  },
});

const getAttemptSnapshotMismatchCodes = ({ attempt, booking, userId }) => {
  const mismatchCodes = [];
  const add = (code) => {
    if (!mismatchCodes.includes(code)) mismatchCodes.push(code);
  };

  if (comparableId(attempt?.booking) !== comparableId(booking?._id)) {
    add('ATTEMPT_BOOKING_ID_MISMATCH');
  }
  if (
    comparableId(attempt?.user) !== comparableId(userId)
    || comparableId(booking?.user) !== comparableId(userId)
  ) {
    add('ATTEMPT_USER_ID_MISMATCH');
  }
  if (attempt?.expected?.amountMinor !== booking?.amountMinor) {
    add('BOOKING_AMOUNT_MISMATCH');
  }
  if (attempt?.expected?.currency !== booking?.currency) {
    add('BOOKING_CURRENCY_MISMATCH');
  }
  if (String(attempt?.expected?.notes?.bookingId || '') !== comparableId(booking?._id)) {
    add('EXPECTED_BOOKING_NOTE_INVALID');
  }
  if (String(attempt?.expected?.notes?.userId || '') !== comparableId(userId)) {
    add('EXPECTED_USER_NOTE_INVALID');
  }

  return mismatchCodes;
};

const findActiveAttempt = (bookingId) => PaymentAttempt.findOne({
  booking: bookingId,
  status: { $in: NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES },
}).sort({ createdAt: -1 });

const reserveAttempt = async ({ booking, userId, now }) => {
  const existing = await findActiveAttempt(booking._id);
  if (existing) return { attempt: existing, created: false };

  const attemptId = new mongoose.Types.ObjectId();
  const attempt = new PaymentAttempt({
    _id: attemptId,
    provider: 'razorpay',
    purpose: 'booking',
    booking: booking._id,
    user: userId,
    expected: getExpectedSnapshot({ attemptId, booking, userId }),
    status: 'creating',
    expiresAt: booking.holdExpiresAt,
  });

  try {
    await attempt.save({
      writeConcern: PAYMENT_ORDER_TRANSACTION_OPTIONS.writeConcern,
    });
    return { attempt, created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const winner = await findActiveAttempt(booking._id);
    if (!winner) throw error;
    return { attempt: winner, created: false };
  }
};

const markNeedsReview = async ({ attempt, booking, mismatchCodes, now }) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const attemptResult = await PaymentAttempt.updateOne({
        _id: attempt._id,
        status: { $in: ['creating', 'order_created', 'payment_pending', 'payment_failed'] },
      }, {
        $set: {
          status: 'needs_review',
          'reconciliation.lastDecision': 'needs_review',
          'reconciliation.mismatchCodes': mismatchCodes,
          'reconciliation.evaluatedAt': now,
        },
      }, { session, runValidators: true });

      const bookingResult = await Booking.updateOne({
        _id: booking._id,
        user: attempt.user,
        status: 'pending',
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'pending',
      }, {
        $set: { 'bookingAuthorization.status': 'needs_review' },
      }, { session, runValidators: true });

      if (attemptResult.modifiedCount !== 1 || bookingResult.modifiedCount !== 1) {
        throw new BookingPaymentOrderError(
          'PAYMENT_REVIEW_STATE_CONFLICT',
          'The payment review state changed concurrently.'
        );
      }
    }, PAYMENT_ORDER_TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }
};

const bindProviderOrder = async ({ attempt, order, now }) => {
  const orderCheck = validateOrderAgainstExpected({ order, expected: attempt.expected });
  if (!orderCheck.valid) {
    const booking = await Booking.findById(attempt.booking);
    if (booking) {
      await markNeedsReview({
        attempt,
        booking,
        mismatchCodes: orderCheck.mismatchCodes,
        now,
      });
    }
    throw new BookingPaymentOrderError(
      'PAYMENT_ORDER_REVIEW_REQUIRED',
      'The payment order could not be verified.',
      { status: 409 }
    );
  }

  const providerCreatedAt = Number.isSafeInteger(order.created_at) && order.created_at > 0
    ? new Date(order.created_at * 1000)
    : now;
  const nextStatus = order.status === 'created' ? 'order_created' : 'payment_pending';
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // MongoDB transactions require sequential operations on a session.
      const freshAttempt = await PaymentAttempt.findById(attempt._id).session(session);
      const freshBooking = await Booking.findById(attempt.booking).session(session);
      const competingAttempt = await PaymentAttempt.findOne({
        _id: { $ne: attempt._id },
        booking: attempt.booking,
        status: { $in: NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES },
      }).session(session);

      if (competingAttempt) {
        throw new BookingPaymentOrderError(
          'PAYMENT_ATTEMPT_CONFLICT',
          'Another payment attempt is already active.'
        );
      }
      if (!freshAttempt || freshAttempt.status !== 'creating' || freshAttempt.orderId) {
        if (freshAttempt?.orderId === order.id) return;
        throw new BookingPaymentOrderError(
          'PAYMENT_ATTEMPT_CONFLICT',
          'The payment attempt changed while the order was being created.'
        );
      }

      const payable = evaluatePayableBooking({
        booking: freshBooking,
        userId: freshAttempt.user,
        now,
      });
      if (!payable.payable) {
        throw new BookingPaymentOrderError(
          payable.failureCodes[0] || 'BOOKING_NOT_PAYABLE',
          'This booking is no longer payable.'
        );
      }
      if (
        freshBooking.amountMinor !== freshAttempt.expected.amountMinor
        || freshBooking.currency !== freshAttempt.expected.currency
        || comparableId(freshBooking._id) !== freshAttempt.expected.notes.bookingId
        || comparableId(freshBooking.user) !== freshAttempt.expected.notes.userId
      ) {
        throw new BookingPaymentOrderError(
          'PAYMENT_SNAPSHOT_CONFLICT',
          'The booking payment snapshot changed.'
        );
      }

      const attemptResult = await PaymentAttempt.updateOne({
        _id: freshAttempt._id,
        status: 'creating',
        $or: [{ orderId: { $exists: false } }, { orderId: null }],
      }, {
        $set: {
          orderId: order.id,
          status: nextStatus,
          providerCreatedAt,
          expiresAt: freshBooking.holdExpiresAt,
          'reconciliation.providerOrderStatus': order.status,
          'reconciliation.evaluatedAt': now,
        },
      }, { session, runValidators: true });

      const bookingResult = await Booking.updateOne({
        _id: freshBooking._id,
        user: freshAttempt.user,
        status: 'pending',
        paymentStatus: { $in: ['pending', 'failed'] },
        paymentMethod: 'razorpay',
        amountMinor: freshAttempt.expected.amountMinor,
        currency: freshAttempt.expected.currency,
        'pricing.listAmountMinor': freshAttempt.expected.amountMinor,
        'pricing.currency': freshAttempt.expected.currency,
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'pending',
        holdExpiresAt: { $gt: now },
        scheduledAt: { $gt: now },
      }, {
        $set: {
          razorpayOrderId: order.id,
          orderStatus: order.status === 'created' ? 'created' : 'attempted',
          orderCreatedAt: providerCreatedAt,
          paymentStatus: 'pending',
        },
      }, { session, runValidators: true });

      if (attemptResult.modifiedCount !== 1 || bookingResult.modifiedCount !== 1) {
        throw new BookingPaymentOrderError(
          'PAYMENT_ORDER_BIND_CONFLICT',
          'The booking changed while the payment order was being bound.'
        );
      }
    }, PAYMENT_ORDER_TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }

  return PaymentAttempt.findById(attempt._id);
};

const chooseRecoveredOrder = ({ orders, attempt }) => {
  if (orders.length === 0) return null;
  const exact = orders.filter((order) => (
    validateOrderAgainstExpected({ order, expected: attempt.expected }).valid
  ));
  if (orders.length !== 1 || exact.length !== 1) {
    throw new BookingPaymentOrderError(
      'PAYMENT_ORDER_REVIEW_REQUIRED',
      'Provider order recovery returned conflicting results.'
    );
  }
  return exact[0];
};

const getUnboundAttemptRecoveryAction = ({
  reservationCreated,
  ageMs,
  recoveryDelayMs,
  lookupComplete = false,
  recoveredOrder = null,
}) => {
  if (reservationCreated) return 'create_initial_order';
  if (!Number.isFinite(ageMs) || ageMs < recoveryDelayMs) return 'wait_for_creator';
  if (!lookupComplete) return 'lookup_by_receipt';
  return recoveredOrder ? 'bind_recovered_order' : 'manual_review';
};

const assertOrderCanOpenCheckout = (order) => {
  if (order?.status === 'paid') {
    throw new BookingPaymentOrderError(
      'PAYMENT_RECONCILIATION_REQUIRED',
      'This order is already paid and must be reconciled before continuing.'
    );
  }
};

const createOrReuseBookingOrder = async ({
  booking,
  userId,
  client,
  now = new Date(),
  providerTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  recoveryDelayMs = DEFAULT_RECOVERY_DELAY_MS,
}) => {
  const payable = evaluatePayableBooking({ booking, userId, now });
  if (!payable.payable) {
    throw new BookingPaymentOrderError(
      payable.failureCodes[0] || 'BOOKING_NOT_PAYABLE',
      'This booking is no longer payable.'
    );
  }
  if (!client?.orders?.create || !client?.orders?.fetch || !client?.orders?.all) {
    throw new BookingPaymentOrderError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'The payment provider is unavailable.',
      { status: 503, retryable: true }
    );
  }

  const reservation = await reserveAttempt({ booking, userId, now });
  let { attempt } = reservation;

  const snapshotMismatchCodes = getAttemptSnapshotMismatchCodes({ attempt, booking, userId });
  if (snapshotMismatchCodes.length > 0) {
    await markNeedsReview({ attempt, booking, mismatchCodes: snapshotMismatchCodes, now });
    throw new BookingPaymentOrderError(
      'PAYMENT_SNAPSHOT_REVIEW_REQUIRED',
      'The payment snapshot requires review.'
    );
  }

  if (attempt.status === 'captured') {
    throw new BookingPaymentOrderError(
      'PAYMENT_ALREADY_CAPTURED',
      'This payment has already been captured.'
    );
  }
  if (attempt.status === 'needs_review') {
    throw new BookingPaymentOrderError(
      'PAYMENT_REVIEW_REQUIRED',
      'This payment attempt requires review.'
    );
  }
  if (comparableId(attempt.user) !== comparableId(userId)) {
    throw new BookingPaymentOrderError('PAYMENT_ATTEMPT_OWNER_MISMATCH', 'Access denied.', {
      status: 403,
    });
  }

  let order;
  if (attempt.orderId) {
    if (String(booking.razorpayOrderId || '') !== attempt.orderId) {
      await markNeedsReview({
        attempt,
        booking,
        mismatchCodes: ['BOOKING_ORDER_ID_MISMATCH'],
        now,
      });
      throw new BookingPaymentOrderError(
        'PAYMENT_ORDER_REVIEW_REQUIRED',
        'The existing payment order does not match the booking.'
      );
    }
    order = await withPaymentProviderTimeout(
      () => client.orders.fetch(attempt.orderId),
      providerTimeoutMs
    );
    const orderCheck = validateOrderAgainstExpected({ order, expected: attempt.expected });
    if (!orderCheck.valid || order.id !== attempt.orderId) {
      await markNeedsReview({ attempt, booking, mismatchCodes: orderCheck.mismatchCodes, now });
      throw new BookingPaymentOrderError(
        'PAYMENT_ORDER_REVIEW_REQUIRED',
        'The existing payment order could not be verified.'
      );
    }
    assertOrderCanOpenCheckout(order);
    return { attempt, order, reused: true };
  }

  const createdAt = new Date(attempt.createdAt || 0);
  const ageMs = now.getTime() - createdAt.getTime();
  let recoveryAction = getUnboundAttemptRecoveryAction({
    reservationCreated: reservation.created,
    ageMs,
    recoveryDelayMs,
  });

  if (recoveryAction === 'wait_for_creator') {
    throw new BookingPaymentOrderError(
      'PAYMENT_ORDER_IN_PROGRESS',
      'A payment order is already being created. Please retry shortly.',
      { status: 409, retryable: true }
    );
  }

  if (recoveryAction === 'lookup_by_receipt') {
    const recoveredOrders = await findRazorpayOrdersByReceipt({
      client,
      receipt: attempt.expected.receipt,
      timeoutMs: providerTimeoutMs,
    });
    try {
      order = chooseRecoveredOrder({ orders: recoveredOrders, attempt });
    } catch (error) {
      if (error instanceof BookingPaymentOrderError) {
        await markNeedsReview({
          attempt,
          booking,
          mismatchCodes: ['PROVIDER_ORDER_RECOVERY_CONFLICT'],
          now,
        });
      }
      throw error;
    }
    recoveryAction = getUnboundAttemptRecoveryAction({
      reservationCreated: false,
      ageMs,
      recoveryDelayMs,
      lookupComplete: true,
      recoveredOrder: order,
    });
    if (recoveryAction === 'manual_review') {
      await markNeedsReview({
        attempt,
        booking,
        mismatchCodes: ['AMBIGUOUS_PROVIDER_ORDER_MISSING'],
        now,
      });
      throw new BookingPaymentOrderError(
        'PAYMENT_ORDER_REVIEW_REQUIRED',
        'The prior provider order request requires manual review.'
      );
    }
  }

  if (recoveryAction === 'create_initial_order') {
    try {
      order = await withPaymentProviderTimeout(
        () => client.orders.create({
          amount: attempt.expected.amountMinor,
          currency: attempt.expected.currency,
          receipt: attempt.expected.receipt,
          notes: { ...attempt.expected.notes },
        }),
        providerTimeoutMs
      );
      recordPaymentOperation({
        provider: 'razorpay',
        operation: 'order_create',
        outcome: 'success',
      });
    } catch (error) {
      recordPaymentOperation({
        provider: 'razorpay',
        operation: 'order_create',
        outcome: 'failure',
      });
      throw error;
    }
  }

  attempt = await bindProviderOrder({ attempt, order, now });
  assertOrderCanOpenCheckout(order);
  return { attempt, order, reused: !reservation.created };
};

module.exports = {
  BookingPaymentOrderError,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_RECOVERY_DELAY_MS,
  PAYMENT_ORDER_TRANSACTION_OPTIONS,
  createOrReuseBookingOrder,
  evaluatePayableBooking,
  _private: {
    chooseRecoveredOrder,
    assertOrderCanOpenCheckout,
    getAttemptSnapshotMismatchCodes,
    getUnboundAttemptRecoveryAction,
  },
};
