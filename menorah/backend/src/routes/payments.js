const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const PaymentAttempt = require('../models/PaymentAttempt');
const User = require('../models/User');
const { verifiedPatientAuth } = require('../middleware/auth');
const {
  getRazorpayConfigurationState,
  getPaymentWebhookMaxProcessingAttempts,
  isBookingPaymentInitiationEnabled,
  isSubscriptionPaymentFlowEnabled,
} = require('../config/paymentFeatures');
const {
  BookingPaymentOrderError,
  createOrReuseBookingOrder,
} = require('../services/razorpayBookingOrderService');
const {
  buildWebhookIdentity,
  fetchRazorpayEvidence,
  getWebhookPaymentReference,
  parseVerifiedWebhookEnvelope,
  validateOrderAgainstExpected,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
  withPaymentProviderTimeout,
} = require('../services/razorpayPaymentSecurity');
const {
  claimWebhookEvent,
  finalizeWebhookEvent,
  finalizeWebhookEventFailure,
  reconcileCapturedBookingPayment,
  recordBookingPaymentFailure,
} = require('../services/razorpayPaymentReconciliation');
const {
  notifyEligibleCounsellorsOfBooking,
} = require('../services/bookingMarketplaceNotifications');
const { expireStalePendingBookings } = require('../utils/bookingAvailability');
const { recordSecurityEvent } = require('../utils/securityAudit');
const {
  recordPaymentOperation,
  recordPaymentWebhook,
} = require('../utils/reliabilityMetrics');

const router = express.Router();
const SLOT_EXPIRED_MESSAGE = 'This slot expired while waiting for payment. Please choose another available time.';
const PAYMENT_DISABLED_MESSAGE = 'New booking payments are temporarily unavailable.';
const SUBSCRIPTION_DISABLED_MESSAGE = 'Subscription payments are not available.';
const PROVIDER_TIMEOUT_MS = 5000;
const WEBHOOK_PROVIDER_TIMEOUT_MS = 2500;
const PROVIDER_ID_VALIDATOR = /^[A-Za-z0-9_-]{3,128}$/;

let razorpayClient = null;
let razorpayClientKeyId = null;

const getRazorpayClient = () => {
  const configuration = getRazorpayConfigurationState();
  if (!configuration.checkoutConfigured) return null;

  if (!razorpayClient || razorpayClientKeyId !== process.env.RAZORPAY_KEY_ID) {
    try {
      razorpayClient = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
      razorpayClientKeyId = process.env.RAZORPAY_KEY_ID;
    } catch (_error) {
      razorpayClient = null;
      razorpayClientKeyId = null;
      return null;
    }
  }

  return razorpayClient;
};

const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({
    success: false,
    code: 'VALIDATION_FAILED',
    message: 'Validation failed',
    errors: errors.array(),
  });
  return true;
};

const sendPaymentUnavailable = (res) => res.status(503).json({
  success: false,
  code: 'BOOKING_PAYMENTS_DISABLED',
  message: PAYMENT_DISABLED_MESSAGE,
});

const sendSubscriptionUnavailable = (res) => res.status(503).json({
  success: false,
  code: 'SUBSCRIPTION_PAYMENTS_DISABLED',
  message: SUBSCRIPTION_DISABLED_MESSAGE,
});

const getCheckoutReturnUrl = () => {
  const configuredReturnUrl = String(process.env.CHECKOUT_RETURN_URL || '').trim();
  if (process.env.NODE_ENV === 'production' && !configuredReturnUrl) {
    throw new Error('CHECKOUT_RETURN_URL is required in production');
  }
  return configuredReturnUrl || 'https://app.menorah.me/checkout/return';
};

const buildCheckoutResponse = ({
  booking,
  order,
  returnUrl = getCheckoutReturnUrl(),
  reused = false,
}) => {
  const isLocalDev = process.env.NODE_ENV === 'development';
  const successUrl = isLocalDev
    ? `menorah://payments/return?status=success&bookingId=${booking._id}&order_id=${order.id}`
    : `${returnUrl}?status=success&bookingId=${booking._id}&order_id=${order.id}`;
  const baseCheckoutUrl = `https://checkout.razorpay.com/v1/checkout.html?key=${encodeURIComponent(process.env.RAZORPAY_KEY_ID)}&order_id=${encodeURIComponent(order.id)}`;
  const checkoutUrl = isLocalDev
    ? baseCheckoutUrl
    : `${baseCheckoutUrl}&redirect_url=${encodeURIComponent(successUrl)}`;

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    checkoutUrl,
    sessionUrl: checkoutUrl,
    url: checkoutUrl,
    paymentMethod: 'razorpay',
    reused,
  };
};

const notifyAfterCommittedAuthorization = async ({ result, io }) => {
  if (!result?.shouldNotify || !result.bookingId || !io) return;
  try {
    const booking = await Booking.findById(result.bookingId);
    if (booking && !booking.counsellor) {
      await notifyEligibleCounsellorsOfBooking({ booking, io });
    }
  } catch (_error) {
    // Payment authorization is already committed. Notification delivery is
    // best-effort and deliberately cannot roll back or duplicate money state.
    console.error('Payment confirmation notification failed');
  }
};

const dispatchWebhookNotification = ({ result, io }) => {
  if (!result?.shouldNotify || !result.bookingId || !io) return;
  setImmediate(() => {
    notifyAfterCommittedAuthorization({ result, io });
  });
};

const getOwnedAttempt = async ({ orderId, bookingId, userId }) => {
  const query = {
    orderId,
    user: userId,
  };
  if (bookingId) query.booking = bookingId;
  return PaymentAttempt.findOne(query);
};

const sendReconciliationResult = (res, result) => {
  if (result?.decision === 'authorize') {
    return res.json({ success: true, message: 'Payment verified successfully' });
  }
  if (result?.decision === 'already_applied') {
    return res.json({
      success: true,
      message: 'Payment already verified',
      alreadyProcessed: true,
    });
  }
  if (result?.decision === 'needs_review') {
    return res.status(409).json({
      success: false,
      code: 'PAYMENT_REVIEW_REQUIRED',
      message: 'The captured payment requires manual reconciliation.',
    });
  }
  return res.status(400).json({
    success: false,
    code: 'PAYMENT_NOT_CAPTURED',
    message: 'Payment could not be verified as captured.',
  });
};

router.post('/create-checkout-session', [
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
], verifiedPatientAuth, async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;
    if (!isBookingPaymentInitiationEnabled()) return sendPaymentUnavailable(res);
    const returnUrl = getCheckoutReturnUrl();

    let booking = await Booking.findById(req.body.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (booking.status === 'cancelled') {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_CANCELLED',
        message: 'This booking has been cancelled and can no longer be paid for.',
      });
    }
    await expireStalePendingBookings(Booking, { _id: booking._id });
    booking = await Booking.findById(booking._id);
    if (!booking || booking.status === 'expired') {
      return res.status(409).json({
        success: false,
        code: 'SLOT_EXPIRED',
        message: SLOT_EXPIRED_MESSAGE,
      });
    }
    if (
      booking.paymentStatus === 'paid'
      && booking.bookingAuthorization?.kind === 'payment'
      && booking.bookingAuthorization?.status === 'authorized'
      && booking.bookingAuthorization?.reference === booking.paymentId
    ) {
      return res.json({
        success: true,
        message: 'Payment already completed',
        data: {
          bookingId: booking._id,
          amount: booking.amountMinor,
          currency: booking.currency,
          paymentMethod: booking.paymentMethod,
          alreadyPaid: true,
        },
      });
    }
    if (
      booking.status !== 'pending'
      || !['pending', 'failed'].includes(booking.paymentStatus)
    ) {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_NOT_PAYABLE',
        message: 'This booking is no longer available for payment.',
      });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      recordPaymentOperation({
        provider: 'razorpay',
        operation: 'order_create',
        outcome: 'disabled',
      });
      return res.status(503).json({
        success: false,
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        message: 'The payment provider is unavailable.',
      });
    }

    const { order, reused } = await createOrReuseBookingOrder({
      booking,
      userId: req.user._id,
      client: razorpay,
      providerTimeoutMs: PROVIDER_TIMEOUT_MS,
    });

    return res.json({
      success: true,
      data: buildCheckoutResponse({
        booking,
        order,
        returnUrl,
        reused,
      }),
    });
  } catch (error) {
    if (error instanceof BookingPaymentOrderError) {
      const isExpired = [
        'BOOKING_HOLD_EXPIRED',
        'BOOKING_SCHEDULE_PASSED',
      ].includes(error.code);
      return res.status(error.status).json({
        success: false,
        code: isExpired ? 'SLOT_EXPIRED' : error.code,
        message: isExpired ? SLOT_EXPIRED_MESSAGE : error.message,
        retryable: error.retryable || undefined,
      });
    }
    console.error('Create booking payment order failed');
    return res.status(503).json({
      success: false,
      code: 'PAYMENT_ORDER_UNAVAILABLE',
      message: 'Unable to create a payment order. Please try again.',
    });
  }
});

router.post('/razorpay-webhook', async (req, res) => {
  const configuration = getRazorpayConfigurationState();
  if (!configuration.webhookConfigured) {
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'processing',
      outcome: 'failure',
    });
    return res.status(503).json({ error: 'Webhook unavailable' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'processing',
      outcome: 'failure',
    });
    return res.status(400).json({ error: 'Raw request body required' });
  }

  const signature = req.headers['x-razorpay-signature'];
  if (!verifyRazorpayWebhookSignature({
    rawBody: req.body,
    signature,
    secret: process.env.RAZORPAY_WEBHOOK_SECRET,
    previousSecret: process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS,
  })) {
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'signature',
      outcome: 'failure',
    });
    return res.status(400).json({ error: 'Invalid signature' });
  }
  recordPaymentWebhook({
    provider: 'razorpay',
    event: 'signature',
    outcome: 'success',
  });

  let event;
  let identity;
  try {
    event = parseVerifiedWebhookEnvelope(req.body);
    identity = buildWebhookIdentity({
      rawBody: req.body,
      providerEventId: req.headers['x-razorpay-event-id'],
    });
  } catch (_error) {
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'processing',
      outcome: 'failure',
    });
    return res.status(400).json({ error: 'Invalid webhook envelope' });
  }

  const reference = getWebhookPaymentReference(event);
  let claim;
  try {
    claim = await claimWebhookEvent({
      ...identity,
      eventType: event.event,
      orderId: reference.orderId,
      paymentId: reference.paymentId,
    });
  } catch (_error) {
    console.error('Payment webhook ledger claim failed');
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'processing',
      outcome: 'failure',
    });
    return res.status(503).json({ error: 'Webhook temporarily unavailable' });
  }

  if (!claim?.claimed) {
    if (claim?.inFlight || claim?.retryable) {
      recordPaymentWebhook({
        provider: 'razorpay',
        event: 'processing',
        outcome: 'replay',
      });
      return res.status(503).json({ error: 'Webhook processing in progress' });
    }
    if (claim?.conflict) {
      recordPaymentWebhook({
        provider: 'razorpay',
        event: 'relationship',
        outcome: 'failure',
      });
      recordSecurityEvent('payment_webhook_identity_conflict', {
        req,
        outcome: 'failure',
        statusCode: claim.ackSafe ? 200 : 503,
        details: {
          provider: 'razorpay',
          reason: 'identity_conflict',
          resource: 'payment_webhook',
        },
      });
      if (!claim?.ackSafe) {
        return res.status(503).json({ error: 'Webhook temporarily unavailable' });
      }
      return res.json({
        received: true,
        duplicate: true,
        reviewRequired: claim.processingState === 'needs_review' || undefined,
      });
    }
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'processing',
      outcome: 'replay',
    });
    return res.json({ received: true, duplicate: true });
  }

  const ledgerEventKey = claim.eventKey;
  const claimToken = claim.claimToken;

  try {
    const maxProcessingAttempts = getPaymentWebhookMaxProcessingAttempts();
    if (
      claim.reclaimed === true
      && maxProcessingAttempts !== null
      && claimToken > maxProcessingAttempts
    ) {
      await finalizeWebhookEvent({
        eventKey: ledgerEventKey,
        claimToken,
        processingState: 'needs_review',
        decision: 'needs_review',
        mismatchCodes: ['WEBHOOK_RETRY_LIMIT_REACHED'],
        orderId: reference.orderId,
        paymentId: reference.paymentId,
      });
      recordSecurityEvent('payment_webhook_retry_limit_reached', {
        req,
        outcome: 'failure',
        statusCode: 200,
        details: {
          provider: 'razorpay',
          reason: 'retry_limit_reached',
          resource: 'payment_webhook',
        },
      });
      recordPaymentWebhook({
        provider: 'razorpay',
        event: 'processing',
        outcome: 'failure',
      });
      return res.json({ received: true, reviewRequired: true });
    }

    if (!['payment.captured', 'payment.failed'].includes(event.event)) {
      await finalizeWebhookEvent({
        eventKey: ledgerEventKey,
        claimToken,
        processingState: 'ignored',
        mismatchCodes: [],
        orderId: reference.orderId,
        paymentId: reference.paymentId,
      });
      return res.json({ received: true, ignored: true });
    }

    if (!reference.orderId || !reference.paymentId) {
      recordPaymentWebhook({
        provider: 'razorpay',
        event: 'relationship',
        outcome: 'failure',
      });
      await finalizeWebhookEvent({
        eventKey: ledgerEventKey,
        claimToken,
        processingState: 'needs_review',
        decision: 'needs_review',
        mismatchCodes: ['WEBHOOK_REFERENCE_MISSING'],
        orderId: reference.orderId,
        paymentId: reference.paymentId,
      });
      return res.json({ received: true, reviewRequired: true });
    }

    const localAttempt = await PaymentAttempt.findOne({ orderId: reference.orderId });
    if (!localAttempt) {
      recordPaymentWebhook({
        provider: 'razorpay',
        event: 'relationship',
        outcome: 'failure',
      });
      await finalizeWebhookEvent({
        eventKey: ledgerEventKey,
        claimToken,
        processingState: 'needs_review',
        decision: 'needs_review',
        mismatchCodes: ['ATTEMPT_MISSING'],
        orderId: reference.orderId,
        paymentId: reference.paymentId,
      });
      return res.json({ received: true, reviewRequired: true });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
    const { order, payment } = await fetchRazorpayEvidence({
      client: razorpay,
      orderId: reference.orderId,
      paymentId: reference.paymentId,
      timeoutMs: WEBHOOK_PROVIDER_TIMEOUT_MS,
    });

    if (event.event === 'payment.failed') {
      const result = await recordBookingPaymentFailure({
        paymentAttemptId: localAttempt._id,
        order,
        payment,
        source: 'webhook',
        eventKey: ledgerEventKey,
        claimToken,
      });
      recordPaymentWebhook({
        provider: 'razorpay',
        event: 'reconciliation',
        outcome: result?.decision === 'needs_review' ? 'failure' : 'success',
      });
      return res.json({
        received: true,
        failedPaymentRecorded: result?.recorded === true,
        reviewRequired: result?.decision === 'needs_review',
      });
    }

    const result = await reconcileCapturedBookingPayment({
      paymentAttemptId: localAttempt._id,
      order,
      payment,
      source: 'webhook',
      eventKey: ledgerEventKey,
      claimToken,
    });
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'reconciliation',
      outcome: result?.decision === 'needs_review' ? 'failure' : 'success',
    });
    dispatchWebhookNotification({ result, io: req.app.get('io') });

    return res.json({
      received: true,
      alreadyProcessed: result?.idempotent || undefined,
      reviewRequired: result?.decision === 'needs_review' || undefined,
    });
  } catch (_error) {
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'processing',
      outcome: 'failure',
    });
    try {
      await finalizeWebhookEventFailure({
        eventKey: ledgerEventKey,
        claimToken,
        failureCode: 'WEBHOOK_PROCESSING_FAILED',
      });
    } catch (_ledgerError) {
      console.error('Payment webhook failure ledger update failed');
    }
    return res.status(503).json({ error: 'Webhook temporarily unavailable' });
  }
});

router.post('/verify-razorpay', [
  body('razorpay_order_id').matches(PROVIDER_ID_VALIDATOR).withMessage('Invalid order ID'),
  body('razorpay_payment_id').matches(PROVIDER_ID_VALIDATOR).withMessage('Invalid payment ID'),
  body('razorpay_signature').matches(/^[a-fA-F0-9]{64}$/).withMessage('Invalid signature'),
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
], verifiedPatientAuth, async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      bookingId,
    } = req.body;

    const attempt = await getOwnedAttempt({
      orderId,
      bookingId,
      userId: req.user._id,
    });
    if (!attempt) {
      return res.status(404).json({
        success: false,
        code: 'PAYMENT_ATTEMPT_NOT_FOUND',
        message: 'Payment attempt not found.',
      });
    }

    const configuration = getRazorpayConfigurationState();
    if (!configuration.checkoutConfigured) {
      recordPaymentOperation({
        provider: 'razorpay',
        operation: 'payment_verify',
        outcome: 'disabled',
      });
      return res.status(503).json({
        success: false,
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        message: 'The payment provider is unavailable.',
      });
    }
    if (!verifyRazorpayCheckoutSignature({
      orderId,
      paymentId,
      signature,
      secret: process.env.RAZORPAY_KEY_SECRET,
    })) {
      recordPaymentOperation({
        provider: 'razorpay',
        operation: 'payment_verify',
        outcome: 'failure',
      });
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const razorpay = getRazorpayClient();
    const { order, payment } = await fetchRazorpayEvidence({
      client: razorpay,
      orderId,
      paymentId,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });
    const result = await reconcileCapturedBookingPayment({
      paymentAttemptId: attempt._id,
      order,
      payment,
      source: 'redirect_verification',
      eventKey: `redirect:${orderId}:${paymentId}`,
    });
    await notifyAfterCommittedAuthorization({ result, io: req.app.get('io') });
    recordPaymentOperation({
      provider: 'razorpay',
      operation: 'payment_verify',
      outcome: result?.decision === 'needs_review' ? 'failure' : 'success',
    });
    return sendReconciliationResult(res, result);
  } catch (_error) {
    console.error('Razorpay redirect reconciliation failed');
    recordPaymentOperation({
      provider: 'razorpay',
      operation: 'payment_verify',
      outcome: 'failure',
    });
    return res.status(503).json({
      success: false,
      code: 'PAYMENT_RECONCILIATION_UNAVAILABLE',
      message: 'Unable to verify payment with the provider. Please try again.',
    });
  }
});

router.get('/order/:orderId/status', [
  param('orderId').matches(PROVIDER_ID_VALIDATOR).withMessage('Invalid order ID'),
], verifiedPatientAuth, async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;
    const attempt = await getOwnedAttempt({
      orderId: req.params.orderId,
      userId: req.user._id,
    });
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(503).json({ success: false, message: 'Payment provider unavailable' });
    }
    const order = await withPaymentProviderTimeout(
      () => razorpay.orders.fetch(attempt.orderId),
      PROVIDER_TIMEOUT_MS
    );
    const check = validateOrderAgainstExpected({ order, expected: attempt.expected });
    if (!check.valid || order.id !== attempt.orderId) {
      return res.status(409).json({
        success: false,
        code: 'PAYMENT_REVIEW_REQUIRED',
        message: 'The payment order requires reconciliation.',
      });
    }

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        orderStatus: order.status,
        amount: order.amount,
        currency: order.currency,
        bookingId: String(attempt.booking),
      },
    });
  } catch (_error) {
    return res.status(503).json({
      success: false,
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      message: 'Unable to retrieve order status.',
    });
  }
});

router.get('/booking/:bookingId', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID'),
], verifiedPatientAuth, async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.json({
      success: true,
      data: {
        paymentStatus: booking.paymentStatus,
        amount: booking.amount,
        amountMinor: booking.amountMinor,
        currency: booking.currency,
        paymentMethod: booking.paymentMethod,
        orderStatus: booking.orderStatus,
        transactionId: booking.transactionId,
      },
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/create-subscription-checkout', [
  body('subscriptionType').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid subscription type'),
], verifiedPatientAuth, (req, res) => {
  if (sendValidationErrors(req, res)) return;
  if (!isSubscriptionPaymentFlowEnabled()) return sendSubscriptionUnavailable(res);
  return sendSubscriptionUnavailable(res);
});

router.post('/verify-subscription-payment', [
  body('razorpay_order_id').matches(PROVIDER_ID_VALIDATOR).withMessage('Invalid order ID'),
  body('razorpay_payment_id').matches(PROVIDER_ID_VALIDATOR).withMessage('Invalid payment ID'),
  body('razorpay_signature').matches(/^[a-fA-F0-9]{64}$/).withMessage('Invalid signature'),
  body('subscriptionType').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid subscription type'),
], verifiedPatientAuth, (req, res) => {
  if (sendValidationErrors(req, res)) return;
  if (!isSubscriptionPaymentFlowEnabled()) return sendSubscriptionUnavailable(res);
  return sendSubscriptionUnavailable(res);
});

router.get('/subscription/status', verifiedPatientAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const now = new Date();
    const isActive = Boolean(
      user.subscription?.isActive === true
      && user.subscription?.endDate
      && new Date(user.subscription.endDate) > now
    );

    return res.json({
      success: true,
      data: {
        plan: isActive ? user.subscription.plan : 'free',
        subscriptionType: isActive ? user.subscription.subscriptionType : null,
        isActive,
        startDate: isActive ? user.subscription.startDate : null,
        endDate: isActive ? user.subscription.endDate : null,
      },
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
