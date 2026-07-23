const express = require('express');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const PaymentReceipt = require('../models/PaymentReceipt');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const {
  expireStalePendingBookings,
  isBlockingBooking,
} = require('../utils/bookingAvailability');
const {
  notifyEligibleCounsellorsOfBooking,
} = require('../services/bookingMarketplaceNotifications');

const router = express.Router();
const SLOT_EXPIRED_MESSAGE = 'This slot expired while waiting for payment. Please choose another available time.';

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

// @route   POST /api/payments/create-checkout-session
// @desc    Create a Razorpay order for a booking
// @access  Private
router.post('/create-checkout-session', [
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
], auth, async (req, res) => {
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

    if (booking.status === 'pending' && booking.paymentStatus === 'pending') {
      await expireStalePendingBookings(Booking, { _id: booking._id });
      const freshBooking = await Booking.findById(booking._id);
      if (!freshBooking || freshBooking.status === 'expired' || !isBlockingBooking(freshBooking)) {
        return res.status(409).json({
          success: false,
          code: 'SLOT_EXPIRED',
          message: SLOT_EXPIRED_MESSAGE
        });
      }
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

    const returnUrl = process.env.CHECKOUT_RETURN_URL || 'https://app.menorah.me/checkout/return';
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
        await handleRazorpayPaymentSuccess(event.payload.payment.entity, io);
        break;
      case 'payment.failed':
        await handleRazorpayPaymentFailure(event.payload.payment.entity);
        break;
      case 'order.paid':
        await handleRazorpayOrderPaid(event.payload.order.entity);
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
], auth, async (req, res) => {
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

    // Idempotency — already paid, nothing to do
    if (booking.paymentStatus === 'paid') {
      return res.json({ success: true, message: 'Payment already verified' });
    }

    // Order ID validation — prevent payment-replay across different bookings
    if (!booking.razorpayOrderId || booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Order ID does not match booking' });
    }

    if (booking.status === 'pending' && booking.paymentStatus === 'pending') {
      await expireStalePendingBookings(Booking, { _id: booking._id });
      const freshBooking = await Booking.findById(booking._id);
      if (!freshBooking || freshBooking.status === 'expired' || !isBlockingBooking(freshBooking)) {
        return res.status(409).json({
          success: false,
          code: 'SLOT_EXPIRED',
          message: SLOT_EXPIRED_MESSAGE
        });
      }
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

      if (payment.status !== 'captured' && payment.status !== 'authorized') {
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

    if (!paymentReceipt.created) {
      if (booking.paymentStatus === 'paid' && booking.paymentId === razorpay_payment_id) {
        return res.json({ success: true, message: 'Payment already verified' });
      }
      return res.status(409).json({ success: false, message: 'Payment has already been used' });
    }

    booking.paymentStatus = 'paid';
    booking.paymentId = razorpay_payment_id;
    booking.transactionId = razorpay_order_id;
    booking.orderStatus = 'paid';
    booking.status = 'confirmed';
    await booking.save();

    // Now that payment is confirmed, notify available counsellors about unassigned bookings
    if (!booking.counsellor && req.app.get('io')) {
      await notifyEligibleCounsellorsOfBooking({
        booking,
        io: req.app.get('io'),
      });
    }

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
], auth, async (req, res) => {
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
], auth, async (req, res) => {
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

// Subscription pricing (INR)
const SUBSCRIPTION_PRICES = { weekly: 500, monthly: 1500, yearly: 12000 };

// @route   POST /api/payments/create-subscription-checkout
// @desc    Create a Razorpay order for a subscription
// @access  Private
router.post('/create-subscription-checkout', [
  body('subscriptionType').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid subscription type'),
], auth, async (req, res) => {
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

    const returnUrl = process.env.CHECKOUT_RETURN_URL || 'https://app.menorah.me/checkout/return';
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
], auth, async (req, res) => {
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

    const paymentReceipt = await createPaymentReceipt({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      purpose: 'subscription',
      user: user._id,
      amount: payment.amount,
      currency: payment.currency,
    });

    if (!paymentReceipt.created) {
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

    const now = new Date();
    const durations = { weekly: 7, monthly: 30, yearly: 365 };
    const expiryDate = new Date(now.getTime() + durations[subscriptionType] * 24 * 60 * 60 * 1000);

    user.subscription = {
      plan: 'premium',
      subscriptionType,
      startDate: now,
      endDate: expiryDate,
      isActive: true,
    };
    await user.save();

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      data: { subscriptionType, startDate: now, endDate: expiryDate, isActive: true },
    });

  } catch (error) {
    console.error('Verify subscription payment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/payments/subscription/status
// @desc    Get subscription status for current user
// @access  Private
router.get('/subscription/status', auth, async (req, res) => {
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
const handleRazorpayPaymentSuccess = async (payment, io) => {
  const bookingId = payment.notes?.bookingId;
  if (!bookingId) return;
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.paymentStatus === 'paid') return; // idempotency guard
  await expireStalePendingBookings(Booking, { _id: booking._id });
  const freshBooking = await Booking.findById(booking._id);
  if (!freshBooking || freshBooking.status === 'expired' || !isBlockingBooking(freshBooking)) return;

  freshBooking.paymentStatus  = 'paid';
  freshBooking.paymentId      = payment.id;
  freshBooking.transactionId  = payment.order_id;
  freshBooking.orderStatus    = 'paid';
  freshBooking.status         = 'confirmed';
  await freshBooking.save();

  if (!freshBooking.counsellor && io) {
    await notifyEligibleCounsellorsOfBooking({ booking: freshBooking, io });
  }
};

const handleRazorpayPaymentFailure = async (payment) => {
  const bookingId = payment.notes?.bookingId;
  if (!bookingId) return;
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.paymentStatus === 'paid') return; // don't overwrite a successful payment
  booking.paymentStatus      = 'failed';
  booking.orderStatus        = 'failed';
  booking.status             = 'expired';
  booking.paymentAttemptedAt = new Date();
  await booking.save();
};

const handleRazorpayOrderPaid = async (order) => {
  const booking = await Booking.findOne({ razorpayOrderId: order.id });
  if (!booking) return;
  if (booking.paymentStatus === 'paid') return; // idempotency guard
  await expireStalePendingBookings(Booking, { _id: booking._id });
  const freshBooking = await Booking.findById(booking._id);
  if (!freshBooking || freshBooking.status === 'expired' || !isBlockingBooking(freshBooking)) return;
  freshBooking.paymentStatus = 'paid';
  freshBooking.orderStatus   = 'paid';
  freshBooking.status        = 'confirmed';
  // Record payment ID from the order.paid event if available
  if (order.payment_id) freshBooking.paymentId = order.payment_id;
  await freshBooking.save();
};

module.exports = router;
