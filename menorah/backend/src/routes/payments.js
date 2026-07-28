const express = require('express');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const PaymentReceipt = require('../models/PaymentReceipt');
const User = require('../models/User');
const { verifiedPatientAuth } = require('../middleware/auth');
const { sendBookingConfirmationEmail } = require('../utils/email');
const { sendBookingConfirmationSMS } = require('../utils/sms');
const {
  expireStalePendingBookings,
  isBlockingBooking,
} = require('../utils/bookingAvailability');

const router = express.Router();
const SLOT_EXPIRED_MESSAGE = 'This slot expired while waiting for payment. Please choose another available time.';
const SUBSCRIPTION_PRICES = Object.freeze({ weekly: 500, monthly: 1500, yearly: 12000 });
const SUBSCRIPTION_DURATION_DAYS = Object.freeze({ weekly: 7, monthly: 30, yearly: 365 });

// Lazy initialization of Razorpay client
let razorpayClient = null;
const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  if (!razorpayClient) {
    try {
      razorpayClient = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
    } catch (error) {
      console.error('Error initializing Razorpay client:', error);
      return null;
    }
  }
  return razorpayClient;
};

const createPaymentReceipt = async ({ paymentId, orderId, purpose, user, booking = null, amount, currency }) => {
  try {
    return {
      created: true,
      receipt: await PaymentReceipt.create({
        paymentId,
        orderId,
        purpose,
        user,
        booking,
        amount,
        currency,
      }),
    };
  } catch (error) {
    if (error.code === 11000) {
      return {
        created: false,
        receipt: await PaymentReceipt.findOne({ paymentId }),
      };
    }
    throw error;
  }
};

const asIdString = (value) => {
  if (value === null || value === undefined) return '';
  if (value._id !== undefined) return asIdString(value._id);
  return typeof value.toString === 'function' ? value.toString() : String(value);
};

const isSubscriptionType = (value) => Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PRICES, value);

const hasSubscriptionNotes = (notes) => notes?.type === 'subscription';

const hasMatchingSubscriptionReceipt = (receipt, { paymentId, orderId, userId }) => (
  receipt
  && receipt.purpose === 'subscription'
  && String(receipt.paymentId || '') === String(paymentId)
  && String(receipt.orderId || '') === String(orderId)
  && asIdString(receipt.user) === String(userId)
);

const hasMatchingBookingReceipt = (receipt, { paymentId, orderId, userId, bookingId }) => (
  receipt
  && receipt.purpose === 'booking'
  && String(receipt.paymentId || '') === String(paymentId)
  && String(receipt.orderId || '') === String(orderId)
  && asIdString(receipt.user) === String(userId)
  && asIdString(receipt.booking) === String(bookingId)
);

const getSubscriptionPeriod = (subscriptionType, paymentCreatedAt) => {
  const createdAtSeconds = Number(paymentCreatedAt);
  if (!Number.isFinite(createdAtSeconds) || createdAtSeconds <= 0 || !isSubscriptionType(subscriptionType)) {
    return null;
  }

  const startDate = new Date(createdAtSeconds * 1000);
  if (Number.isNaN(startDate.getTime())) return null;

  const endDate = new Date(startDate.getTime() + SUBSCRIPTION_DURATION_DAYS[subscriptionType] * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
};

const hasSubscriptionCoveringPeriod = (user, endDate) => {
  if (!user?.subscription?.isActive || !user.subscription.endDate) return false;
  const currentEndDate = new Date(user.subscription.endDate);
  return !Number.isNaN(currentEndDate.getTime()) && currentEndDate >= endDate;
};

const recordWebhookBookingReceipt = async ({ booking, orderId, paymentId, amount, currency }) => {
  if (!booking?.user || !orderId || !paymentId) return;

  const normalizedAmount = Number(amount);
  await createPaymentReceipt({
    paymentId,
    orderId,
    purpose: 'booking',
    user: booking.user,
    booking: booking._id,
    amount: Number.isFinite(normalizedAmount) ? normalizedAmount : Math.round(Number(booking.amount || 0) * 100),
    currency: currency || booking.currency || 'INR',
  });
};

const notifyAvailableCounsellors = async (booking, io) => {
  if (!io || booking.counsellor) return;

  const CounsellorModel = require('../models/Counsellor');
  const availableCounsellors = await CounsellorModel
    .find({ isActive: true, isAvailable: true })
    .select('_id')
    .lean();
  const notification = {
    bookingId: booking._id,
    sessionType: booking.sessionType,
    sessionDuration: booking.sessionDuration,
    scheduledAt: booking.scheduledAt,
    amount: booking.amount,
    preferences: booking.preferences,
    createdAt: booking.createdAt,
  };

  availableCounsellors.forEach((counsellor) => {
    io.to(`counsellor_${counsellor._id}`).emit('new_booking_available', notification);
  });
};

const loadBookingForConfirmationNotification = async (booking) => {
  const userHasContact = Boolean(booking?.user?.email);
  const counsellorHasIdentity = Boolean(booking?.counsellor?.user?.firstName);
  if (!booking?.counsellor || (userHasContact && counsellorHasIdentity)) return booking;

  return Booking.findById(booking._id)
    .populate({ path: 'user', select: 'firstName lastName email phone' })
    .populate({
      path: 'counsellor',
      select: 'user',
      populate: { path: 'user', select: 'firstName lastName' },
    });
};

// This is intentionally called only by the code path that atomically moves a
// booking from pending to paid. That makes the notification dispatch attempt
// idempotent across a client verification and the corresponding Razorpay
// webhook.
const notifyBookingPaymentConfirmed = async (booking, io) => {
  try {
    if (!booking?.counsellor) {
      await notifyAvailableCounsellors(booking, io);
      return;
    }

    const populatedBooking = await loadBookingForConfirmationNotification(booking);
    if (!populatedBooking?.user || !populatedBooking?.counsellor?.user) return;

    const bookingDetails = {
      scheduledAt: populatedBooking.scheduledAt,
      sessionDuration: populatedBooking.sessionDuration,
      sessionType: populatedBooking.sessionType,
      counsellorName: `${populatedBooking.counsellor.user.firstName || ''} ${populatedBooking.counsellor.user.lastName || ''}`.trim(),
    };
    const deliveries = [];
    if (populatedBooking.user.email) {
      deliveries.push(sendBookingConfirmationEmail(populatedBooking.user.email, bookingDetails));
    }
    if (populatedBooking.user.phone) {
      deliveries.push(sendBookingConfirmationSMS(populatedBooking.user.phone, bookingDetails));
    }
    await Promise.allSettled(deliveries);

    if (io) {
      io.to(`user_${asIdString(populatedBooking.user)}`).emit('booking_confirmed', {
        bookingId: populatedBooking._id,
        status: 'confirmed',
        paymentStatus: 'paid',
        scheduledAt: populatedBooking.scheduledAt,
      });
    }
  } catch (error) {
    // Payment completion must not be rolled back by a transient delivery
    // failure. The persisted state remains the source of truth for clients.
    console.error('Error sending payment-confirmed booking notification:', error);
  }
};

const confirmActiveBookingPayment = async ({ bookingId, orderId, paymentId, now = new Date() }) => {
  return Booking.findOneAndUpdate({
    _id: bookingId,
    status: 'pending',
    paymentStatus: 'pending',
    razorpayOrderId: orderId,
    holdExpiresAt: { $gt: now },
  }, {
    $set: {
      paymentStatus: 'paid',
      paymentId,
      transactionId: orderId,
      orderStatus: 'paid',
      status: 'confirmed',
    },
    $unset: { holdExpiresAt: '' },
    $push: {
      statusHistory: {
        status: 'confirmed',
        timestamp: now,
        reason: 'Payment verified',
      },
    },
  }, { new: true, runValidators: true });
};

// @route   POST /api/payments/create-checkout-session
// @desc    Create a Razorpay order for a booking
// @access  Private
router.post('/create-checkout-session', [
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
], verifiedPatientAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId).populate({
      path: 'counsellor',
      select: 'user',
      populate: { path: 'user', select: 'firstName lastName' },
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (booking.status === 'cancelled') {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_CANCELLED',
        message: 'This booking has been cancelled and can no longer be paid for.',
      });
    }

    if (booking.paymentStatus === 'paid') {
      return res.json({
        success: true,
        message: 'Payment already completed',
        data: {
          bookingId: booking._id,
          amount: Math.round((booking.amount || 0) * 100),
          currency: booking.currency || 'INR',
          paymentMethod: booking.paymentMethod || 'razorpay',
          alreadyPaid: true
        }
      });
    }

    if (booking.status !== 'pending' || booking.paymentStatus !== 'pending') {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_NOT_PAYABLE',
        message: 'This booking is no longer available for payment.',
      });
    }

    await expireStalePendingBookings(Booking, { _id: booking._id });
    const freshBooking = await Booking.findById(booking._id);
    if (!freshBooking || freshBooking.status === 'expired' || !isBlockingBooking(freshBooking)) {
      return res.status(409).json({
        success: false,
        code: 'SLOT_EXPIRED',
        message: SLOT_EXPIRED_MESSAGE
      });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }

    const amount = Math.round(booking.amount * 100); // paise
    const currency = (booking.currency || 'INR').toUpperCase();

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `booking_${bookingId}`,
      notes: { bookingId, userId: req.user._id.toString() },
    });

    // Verify order exists in Razorpay
    try {
      await razorpay.orders.fetch(order.id);
    } catch (verifyError) {
      console.error('Error verifying Razorpay order:', verifyError);
      return res.status(500).json({ success: false, message: 'Failed to create valid Razorpay order' });
    }

    booking.razorpayOrderId = order.id;
    booking.orderStatus = 'created';
    booking.orderCreatedAt = new Date();
    await booking.save();

    const returnUrl = process.env.CHECKOUT_RETURN_URL || 'https://app.menorah.me/checkout/callback';
    const isLocalDev = process.env.NODE_ENV === 'development';
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;

    const successUrl = isLocalDev
      ? `menorah://payments/return?status=success&bookingId=${bookingId}&order_id=${order.id}`
      : `${returnUrl}?status=success&bookingId=${bookingId}&order_id=${order.id}`;

    const checkoutUrl = isLocalDev
      ? `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}`
      : `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}&redirect_url=${encodeURIComponent(successUrl)}`;

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: razorpayKeyId,
        checkoutUrl,
        sessionUrl: checkoutUrl,
        url: checkoutUrl,
        paymentMethod: 'razorpay',
      },
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   POST /api/payments/razorpay-webhook
// @desc    Handle Razorpay webhook events
// @access  Public
router.post('/razorpay-webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (!webhookSecret) {
      console.error('Razorpay webhook secret not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Always require signature
    if (!signature) {
      console.error('Razorpay webhook: missing x-razorpay-signature header');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // req.body here is a raw Buffer — server.js registers express.raw() for this route
    // before express.json() so the signature is computed over the original bytes.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Timing-safe comparison — prevents side-channel timing oracle
    const signaturesMatch = (() => {
      try {
        return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
      } catch { return false; }
    })();

    if (!signaturesMatch) {
      console.error('Razorpay webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Parse the body now that the signature is verified
    const event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;

    const io = req.app.get('io');
    switch (event.event) {
      case 'payment.captured':
        await handleRazorpaySubscriptionWebhookPayment(
          event.payload.payment.entity,
          event.payload.order?.entity,
        );
        await handleRazorpayPaymentSuccess(event.payload.payment.entity, io);
        break;
      case 'payment.failed':
        await handleRazorpayPaymentFailure(event.payload.payment.entity);
        break;
      case 'order.paid':
        await handleRazorpaySubscriptionWebhookPayment(
          event.payload.payment?.entity,
          event.payload.order.entity,
        );
        await handleRazorpayOrderPaid(event.payload.order.entity, io);
        break;
      default:
        // No-op for unhandled events
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// @route   POST /api/payments/verify-razorpay
// @desc    Verify Razorpay payment and confirm booking
// @access  Private
router.post('/verify-razorpay', [
  body('razorpay_order_id').notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Signature is required'),
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
], verifiedPatientAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Ownership check — only the booking's user can verify payment
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (booking.status === 'cancelled') {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_CANCELLED',
        message: 'This booking has been cancelled and can no longer be paid for.',
      });
    }

    // Idempotency — already paid, nothing to do
    if (booking.paymentStatus === 'paid') {
      return res.json({ success: true, message: 'Payment already verified' });
    }

    if (booking.status !== 'pending' || booking.paymentStatus !== 'pending') {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_NOT_PAYABLE',
        message: 'This booking is no longer available for payment.',
      });
    }

    // Order ID validation — prevent payment-replay across different bookings
    if (!booking.razorpayOrderId || booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Order ID does not match booking' });
    }

    await expireStalePendingBookings(Booking, { _id: booking._id });
    const freshBooking = await Booking.findById(booking._id);
    if (!freshBooking || freshBooking.status === 'expired' || !isBlockingBooking(freshBooking)) {
      return res.status(409).json({
        success: false,
        code: 'SLOT_EXPIRED',
        message: SLOT_EXPIRED_MESSAGE
      });
    }

    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    // Timing-safe signature comparison
    const signaturesMatch = (() => {
      try {
        return crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(razorpay_signature, 'hex'));
      } catch { return false; }
    })();

    if (!signaturesMatch) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Verify amount and capture status with Razorpay API
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }

    let order;
    let payment;
    try {
      [order, payment] = await Promise.all([
        razorpay.orders.fetch(razorpay_order_id),
        razorpay.payments.fetch(razorpay_payment_id),
      ]);

      const expectedAmount = Math.round(booking.amount * 100);
      if (order.amount !== expectedAmount || payment.amount !== expectedAmount) {
        return res.status(400).json({ success: false, message: 'Payment amount mismatch' });
      }

      if (payment.order_id !== razorpay_order_id) {
        return res.status(400).json({ success: false, message: 'Payment does not belong to this order' });
      }

      if (String(order.notes?.bookingId || '') !== booking._id.toString() || String(order.notes?.userId || '') !== req.user._id.toString()) {
        return res.status(400).json({ success: false, message: 'Order does not belong to this booking' });
      }

      // An authorization can still be reversed or expire. A booking is only
      // confirmed after Razorpay reports that the funds were captured.
      if (payment.status !== 'captured') {
        return res.status(400).json({ success: false, message: 'Payment verification failed' });
      }
    } catch (err) {
      console.error('Error fetching Razorpay order/payment:', err);
      return res.status(503).json({ success: false, message: 'Unable to verify payment with Razorpay. Please try again.' });
    }

    const paymentReceipt = await createPaymentReceipt({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      purpose: 'booking',
      user: req.user._id,
      booking: booking._id,
      amount: payment.amount,
      currency: payment.currency,
    });

    if (
      !paymentReceipt.created
      && !hasMatchingBookingReceipt(paymentReceipt.receipt, {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        userId: req.user._id,
        bookingId: booking._id,
      })
    ) {
      return res.status(409).json({ success: false, message: 'Payment has already been used' });
    }

    // A matching duplicate receipt can be left behind if a prior verifier was
    // interrupted after recording the payment but before the atomic booking
    // claim. It is safe to resume this exact, already-verified claim.
    // The order can be replaced when a patient starts another checkout. Claim
    // this exact, still-live order atomically so an older Razorpay event cannot
    // confirm a newer checkout (or trigger duplicate notifications).
    const confirmedBooking = await confirmActiveBookingPayment({
      bookingId: booking._id,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });

    if (!confirmedBooking) {
      const latestBooking = await Booking.findById(booking._id);
      if (latestBooking?.paymentStatus === 'paid') {
        return res.json({ success: true, message: 'Payment already verified' });
      }
      return res.status(409).json({
        success: false,
        code: 'CHECKOUT_SUPERSEDED',
        message: 'This checkout is no longer active. Please try again from the latest checkout session.',
      });
    }

    await notifyBookingPaymentConfirmed(confirmedBooking, req.app.get('io'));

    res.json({ success: true, message: 'Payment verified successfully' });

  } catch (error) {
    console.error('Verify Razorpay payment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/payments/order/:orderId/status
// @desc    Get Razorpay order status
// @access  Private
router.get('/order/:orderId/status', [
  param('orderId').notEmpty().withMessage('Order ID is required'),
], verifiedPatientAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { orderId } = req.params;
    const razorpay = getRazorpayClient();

    if (!razorpay) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }

    let order;
    try {
      order = await razorpay.orders.fetch(orderId);
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      throw err;
    }

    const booking = await Booking.findOne({ razorpayOrderId: orderId });

    // No booking found — don't reveal order data to arbitrary callers
    if (!booking) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // GET endpoints must not mutate state — confirmation is handled by webhook/verify-razorpay

    res.json({
      success: true,
      data: {
        orderId: order.id,
        orderStatus: order.status,
        amount: order.amount,
        currency: order.currency,
        bookingId: booking ? booking._id.toString() : null,
      },
    });

  } catch (error) {
    console.error('Get order status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/payments/booking/:bookingId
// @desc    Get payment status for a booking
// @access  Private
router.get('/booking/:bookingId', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID'),
], verifiedPatientAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({
      success: true,
      data: {
        paymentStatus: booking.paymentStatus,
        amount: booking.amount,
        currency: booking.currency,
        paymentMethod: booking.paymentMethod,
        transactionId: booking.transactionId,
      },
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/payments/create-subscription-checkout
// @desc    Create a Razorpay order for a subscription
// @access  Private
router.post('/create-subscription-checkout', [
  body('subscriptionType').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid subscription type'),
], verifiedPatientAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { subscriptionType } = req.body;
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }

    const amountInPaise = Math.round(SUBSCRIPTION_PRICES[subscriptionType] * 100);
    const userIdStr = req.user._id.toString();
    const receipt = `sub_${subscriptionType.substring(0, 3)}_${userIdStr.substring(userIdStr.length - 8)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: { userId: userIdStr, subscriptionType, type: 'subscription' },
    });

    const returnUrl = process.env.CHECKOUT_RETURN_URL || 'https://app.menorah.me/checkout/callback';
    const isLocalDev = process.env.NODE_ENV === 'development';
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;

    const successUrl = isLocalDev
      ? `menorah://payments/subscription/return?status=success&subscriptionType=${subscriptionType}&order_id=${order.id}`
      : `${returnUrl}?status=success&type=subscription&subscriptionType=${subscriptionType}&order_id=${order.id}`;

    const checkoutUrl = isLocalDev
      ? `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}`
      : `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}&redirect_url=${encodeURIComponent(successUrl)}`;

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: razorpayKeyId,
        checkoutUrl,
        sessionUrl: checkoutUrl,
        url: checkoutUrl,
        paymentMethod: 'razorpay',
        subscriptionType,
      },
    });

  } catch (error) {
    console.error('Create subscription checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   POST /api/payments/verify-subscription-payment
// @desc    Verify subscription payment and activate subscription
// @access  Private
router.post('/verify-subscription-payment', [
  body('razorpay_order_id').notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Signature is required'),
  body('subscriptionType').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid subscription type'),
], verifiedPatientAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, subscriptionType } = req.body;

    // Verify signature
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    // Timing-safe comparison — prevents signature brute-force via timing side-channel
    const signaturesMatch = (() => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'hex'),
          Buffer.from(razorpay_signature, 'hex')
        );
      } catch { return false; }
    })();
    if (!signaturesMatch) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Verify amount and capture status
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }

    let order;
    let payment;
    try {
      [order, payment] = await Promise.all([
        razorpay.orders.fetch(razorpay_order_id),
        razorpay.payments.fetch(razorpay_payment_id),
      ]);

      const expectedAmount = Math.round(SUBSCRIPTION_PRICES[subscriptionType] * 100);
      if (order.amount !== expectedAmount || payment.amount !== expectedAmount) {
        return res.status(400).json({ success: false, message: 'Payment amount mismatch' });
      }

      if (
        payment.order_id !== razorpay_order_id ||
        String(order.notes?.userId || '') !== req.user._id.toString() ||
        order.notes?.type !== 'subscription' ||
        order.notes?.subscriptionType !== subscriptionType
      ) {
        return res.status(400).json({ success: false, message: 'Order does not belong to this subscription' });
      }

      if (payment.status !== 'captured') {
        return res.status(400).json({ success: false, message: 'Payment not captured' });
      }
    } catch (err) {
      console.error('Error verifying subscription payment with Razorpay:', err);
      return res.status(400).json({ success: false, message: 'Failed to verify payment with Razorpay' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Razorpay timestamps the payment, which gives retries a stable
    // subscription period. Fall back to the verification time only for an
    // unexpected legacy payment object without a creation timestamp.
    const now = new Date();
    const subscriptionPeriod = getSubscriptionPeriod(subscriptionType, payment.created_at) || {
      startDate: now,
      endDate: new Date(now.getTime() + SUBSCRIPTION_DURATION_DAYS[subscriptionType] * 24 * 60 * 60 * 1000),
    };

    const paymentReceipt = await createPaymentReceipt({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      purpose: 'subscription',
      user: user._id,
      amount: payment.amount,
      currency: payment.currency,
    });

    if (
      !paymentReceipt.created
      && !hasMatchingSubscriptionReceipt(paymentReceipt.receipt, {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        userId: req.user._id,
      })
    ) {
      return res.status(409).json({ success: false, message: 'Payment has already been used' });
    }

    // A duplicate receipt can mean a prior request wrote the receipt and then
    // failed before user.save(). Treat it as complete only when the account
    // already covers this payment's period; otherwise finish activation.
    if (hasSubscriptionCoveringPeriod(user, subscriptionPeriod.endDate)) {
      return res.json({
        success: true,
        message: 'Subscription payment already verified',
        data: {
          subscriptionType: user.subscription?.subscriptionType,
          startDate: user.subscription?.startDate,
          endDate: user.subscription?.endDate,
          isActive: user.subscription?.isActive === true,
          alreadyProcessed: true,
        },
      });
    }

    user.subscription = {
      plan: 'premium',
      subscriptionType,
      startDate: subscriptionPeriod.startDate,
      endDate: subscriptionPeriod.endDate,
      isActive: true,
    };
    await user.save();

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      data: {
        subscriptionType,
        startDate: subscriptionPeriod.startDate,
        endDate: subscriptionPeriod.endDate,
        isActive: true,
      },
    });

  } catch (error) {
    console.error('Verify subscription payment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/payments/subscription/status
// @desc    Get subscription status for current user
// @access  Private
router.get('/subscription/status', verifiedPatientAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const now = new Date();
    let isActive = !!(user.subscription.isActive && user.subscription.endDate && new Date(user.subscription.endDate) > now);

    if (!isActive && user.subscription.isActive) {
      user.subscription.isActive = false;
      user.subscription.plan = 'free';
      await user.save();
    }

    res.json({
      success: true,
      data: {
        plan: user.subscription.plan,
        subscriptionType: user.subscription.subscriptionType,
        isActive,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
      },
    });

  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ── Webhook helpers — all idempotent ──────────────────────────────────────
//
// A subscription checkout can complete successfully even when the client is
// closed before it sends verify-subscription-payment. A signed webhook is a
// suitable recovery signal, but we still fetch the authoritative order and
// payment before changing a user's subscription. This helper intentionally
// has no booking side effects.
const shouldInspectSubscriptionWebhook = (payment, order) => {
  const paymentNotes = payment?.notes;
  const orderNotes = order?.notes;

  // Booking webhooks are handled below and must not trigger an extra Razorpay
  // lookup through this subscription-only recovery path.
  if (paymentNotes?.bookingId || orderNotes?.bookingId) return false;

  // If either webhook payload explicitly declares a different product type,
  // it cannot be a subscription checkout. Empty notes are inspected because
  // Razorpay payment.captured payloads do not always include order notes.
  return [paymentNotes?.type, orderNotes?.type]
    .filter(Boolean)
    .every((type) => type === 'subscription');
};

const hasConsistentSubscriptionNotes = (notes, { userId, subscriptionType }) => {
  if (!hasSubscriptionNotes(notes)) return true;
  return String(notes.userId || '') === String(userId)
    && notes.subscriptionType === subscriptionType;
};

const handleRazorpaySubscriptionWebhookPayment = async (webhookPayment, webhookOrder) => {
  if (!shouldInspectSubscriptionWebhook(webhookPayment, webhookOrder)) return;

  const orderId = webhookPayment?.order_id || webhookOrder?.id;
  const paymentId = webhookPayment?.id || webhookOrder?.payment_id;
  if (!orderId || !paymentId) return;

  if (
    (webhookPayment?.order_id && webhookOrder?.id && webhookPayment.order_id !== webhookOrder.id)
    || (webhookPayment?.id && webhookOrder?.payment_id && webhookPayment.id !== webhookOrder.payment_id)
  ) {
    console.warn('Subscription webhook contains mismatched payment and order identifiers');
    return;
  }

  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new Error('Razorpay is not configured for subscription webhook recovery');
  }

  const [order, payment] = await Promise.all([
    razorpay.orders.fetch(orderId),
    razorpay.payments.fetch(paymentId),
  ]);

  const subscriptionType = order?.notes?.subscriptionType;
  const userId = String(order?.notes?.userId || '');
  const expectedAmount = Math.round(SUBSCRIPTION_PRICES[subscriptionType] * 100);
  const expectedCurrency = 'INR';

  if (
    order?.id !== orderId
    || payment?.id !== paymentId
    || payment?.order_id !== orderId
    || (order?.payment_id && order.payment_id !== paymentId)
    || order?.status !== 'paid'
    || payment?.status !== 'captured'
    || order?.notes?.type !== 'subscription'
    || !userId
    || !isSubscriptionType(subscriptionType)
    || order.amount !== expectedAmount
    || payment.amount !== expectedAmount
    || String(order.currency || '').toUpperCase() !== expectedCurrency
    || String(payment.currency || '').toUpperCase() !== expectedCurrency
    || !hasConsistentSubscriptionNotes(webhookPayment?.notes, { userId, subscriptionType })
    || !hasConsistentSubscriptionNotes(webhookOrder?.notes, { userId, subscriptionType })
  ) {
    console.warn(`Ignoring invalid subscription webhook payment for order ${orderId}`);
    return;
  }

  const subscriptionPeriod = getSubscriptionPeriod(subscriptionType, payment.created_at);
  if (!subscriptionPeriod) {
    console.warn(`Ignoring subscription webhook payment without a valid payment timestamp for order ${orderId}`);
    return;
  }

  const user = await User.findById(userId);
  if (!user || user.role !== 'user' || user.isActive === false) {
    console.warn(`Ignoring subscription webhook payment for an unavailable user on order ${orderId}`);
    return;
  }

  // Verify a duplicate receipt's identity so a payment receipt from another
  // purpose or user can never activate this account. The receipt proves that
  // the gateway payment was seen, not that the local subscription write
  // completed: a retry must finish a previously interrupted activation.
  const paymentReceipt = await createPaymentReceipt({
    paymentId,
    orderId,
    purpose: 'subscription',
    user: user._id,
    amount: payment.amount,
    currency: payment.currency,
  });

  if (
    !paymentReceipt.created
    && !hasMatchingSubscriptionReceipt(paymentReceipt.receipt, { paymentId, orderId, userId })
  ) {
    console.error(`Subscription receipt collision while processing webhook order ${orderId}`);
    return;
  }

  // A delayed, valid webhook must not downgrade a newer active plan. A
  // matching receipt with no covering subscription is a recoverable partial
  // failure (for example, the prior user.save() failed), so continue below.
  if (hasSubscriptionCoveringPeriod(user, subscriptionPeriod.endDate)) return;

  user.subscription = {
    plan: 'premium',
    subscriptionType,
    startDate: subscriptionPeriod.startDate,
    endDate: subscriptionPeriod.endDate,
    isActive: true,
  };
  await user.save();
};

const handleRazorpayPaymentSuccess = async (payment, io) => {
  const bookingId = payment.notes?.bookingId;
  const orderId = payment.order_id;
  if (!bookingId || !orderId) return;

  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status === 'cancelled') return;
  if (booking.razorpayOrderId !== orderId) return;
  if (booking.paymentStatus === 'paid') {
    if (!booking.paymentId || String(booking.paymentId) === String(payment.id)) {
      await recordWebhookBookingReceipt({
        booking,
        orderId,
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
      });
    }
    return;
  }

  await expireStalePendingBookings(Booking, { _id: booking._id, razorpayOrderId: orderId });
  const freshBooking = await Booking.findById(booking._id);
  if (
    !freshBooking
    || freshBooking.razorpayOrderId !== orderId
    || freshBooking.status === 'expired'
    || !isBlockingBooking(freshBooking)
  ) return;

  const confirmedBooking = await confirmActiveBookingPayment({
    bookingId: freshBooking._id,
    orderId,
    paymentId: payment.id,
  });
  if (!confirmedBooking) return;

  // This is deliberately before receipt persistence. Confirmation is atomic,
  // so this is the only handler that makes a notification attempt; if receipt
  // persistence has a transient failure, the webhook retry records the
  // receipt without suppressing that attempt.
  await notifyBookingPaymentConfirmed(confirmedBooking, io);
  await recordWebhookBookingReceipt({
    booking: confirmedBooking,
    orderId,
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
  });
};

const handleRazorpayPaymentFailure = async (payment) => {
  const bookingId = payment.notes?.bookingId;
  const orderId = payment.order_id;
  if (!bookingId || !orderId) return;

  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status === 'cancelled' || booking.paymentStatus === 'paid' || booking.razorpayOrderId !== orderId) return;

  // A failed checkout can be retried while the slot hold is live. Do not mark
  // the booking permanently failed/expired here; the hold expiry job owns that
  // transition. Matching the current order also makes a late failure from an
  // older retry harmless.
  const failedBooking = await Booking.findOneAndUpdate({
    _id: booking._id,
    status: 'pending',
    paymentStatus: 'pending',
    razorpayOrderId: orderId,
  }, {
    $set: {
      orderStatus: 'failed',
      paymentAttemptedAt: new Date(),
    },
  }, { new: true });

  if (!failedBooking) return;
  await expireStalePendingBookings(Booking, {
    _id: failedBooking._id,
    razorpayOrderId: orderId,
  });
};

const handleRazorpayOrderPaid = async (order, io) => {
  const booking = await Booking.findOne({ razorpayOrderId: order.id });
  if (!booking || booking.status === 'cancelled') return;
  if (booking.paymentStatus === 'paid') {
    if (!booking.paymentId || String(booking.paymentId) === String(order.payment_id)) {
      await recordWebhookBookingReceipt({
        booking,
        orderId: order.id,
        paymentId: order.payment_id,
        amount: order.amount,
        currency: order.currency,
      });
    }
    return;
  }

  await expireStalePendingBookings(Booking, { _id: booking._id, razorpayOrderId: order.id });
  const freshBooking = await Booking.findById(booking._id);
  if (
    !freshBooking
    || freshBooking.razorpayOrderId !== order.id
    || freshBooking.status === 'expired'
    || !isBlockingBooking(freshBooking)
  ) return;

  const confirmedBooking = await confirmActiveBookingPayment({
    bookingId: freshBooking._id,
    orderId: order.id,
    paymentId: order.payment_id,
  });
  if (!confirmedBooking) return;

  // Keep notification independent of receipt persistence for the same reason
  // as payment.captured above: a receipt-store retry must not drop the
  // one-time notification attempt.
  await notifyBookingPaymentConfirmed(confirmedBooking, io);
  await recordWebhookBookingReceipt({
    booking: confirmedBooking,
    orderId: order.id,
    paymentId: order.payment_id,
    amount: order.amount,
    currency: order.currency,
  });
};

module.exports = router;
