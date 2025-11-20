const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const stripe = require('stripe');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Lazy initialization of Stripe client
let stripeClient = null;
const getStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
};

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
        key_secret: process.env.RAZORPAY_KEY_SECRET
      });
    } catch (error) {
      console.error('Error initializing Razorpay client:', error);
      return null;
    }
  }
  return razorpayClient;
};

// @route   POST /api/payments/create-checkout-session
// @desc    Create a payment checkout session
// @access  Private
router.post('/create-checkout-session', [
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
  body('paymentMethod').isIn(['stripe', 'razorpay']).withMessage('Invalid payment method')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bookingId, paymentMethod } = req.body;

    // Get booking details
    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: {
          path: 'user',
          select: 'firstName lastName'
        }
      });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns this booking
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if payment is already made
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed'
      });
    }

    const amount = Math.round(booking.amount * 100); // Convert to cents for Stripe
    
    // Razorpay requires uppercase currency codes (INR, USD, etc.)
    // Stripe requires lowercase currency codes (inr, usd, etc.)
    const currencyForRazorpay = (booking.currency || 'INR').toUpperCase();
    const currencyForStripe = (booking.currency || 'INR').toLowerCase();

    if (paymentMethod === 'stripe') {
      // Get Stripe client
      const stripeClient = getStripeClient();
      if (!stripeClient) {
        return res.status(500).json({
          success: false,
          message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.'
        });
      }

      // Create Stripe checkout session
      const counsellorName = booking.counsellor 
        ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`
        : 'Your assigned therapist';
      
      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currencyForStripe, // Use lowercase for Stripe
              product_data: {
                name: `Session with ${counsellorName}`,
                description: `${booking.sessionType} session - ${booking.sessionDuration} minutes`
              },
              unit_amount: amount
            },
            quantity: 1
          }
        ],
        mode: 'payment',
        success_url: `${process.env.CHECKOUT_RETURN_URL}?success=true&bookingId=${bookingId}`,
        cancel_url: `${process.env.CHECKOUT_RETURN_URL}?canceled=true&bookingId=${bookingId}`,
        metadata: {
          bookingId: bookingId,
          userId: req.user._id.toString()
        }
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          sessionUrl: session.url,
          paymentMethod: 'stripe'
        }
      });

    } else if (paymentMethod === 'razorpay') {
      // Get Razorpay client
      const razorpay = getRazorpayClient();
      if (!razorpay) {
        return res.status(500).json({
          success: false,
          message: 'Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.'
        });
      }

      // Prepare callback URLs
      const returnUrl = process.env.CHECKOUT_RETURN_URL || 'https://menorahhealth.com/checkout/return';
      
      // For local development on mobile, use deep link scheme
      const isLocalDev = process.env.NODE_ENV === 'development' || returnUrl.includes('localhost');
      
      // Create Razorpay order FIRST (before using order.id)
      const order = await razorpay.orders.create({
        amount: amount,
        currency: currencyForRazorpay, // Use uppercase for Razorpay (INR, USD, etc.)
        receipt: `booking_${bookingId}`,
        notes: {
          bookingId: bookingId,
          userId: req.user._id.toString()
        }
      });

      // Now we can use order.id in the URLs
      let successUrl;
      if (isLocalDev) {
        // Use deep link for mobile - this will redirect back to the app
        successUrl = `menorah://payments/return?status=success&bookingId=${bookingId}&order_id=${order.id}`;
      } else {
        successUrl = `${returnUrl}?status=success&bookingId=${bookingId}&order_id=${order.id}`;
      }
      
      const cancelUrl = isLocalDev 
        ? `menorah://payments/return?status=cancel&bookingId=${bookingId}`
        : `${returnUrl}?status=cancel&bookingId=${bookingId}`;

      // Verify order was created successfully
      console.log('Razorpay Order Created:', {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        created_at: order.created_at
      });

      // Get Razorpay key ID early
      const razorpayKeyId = process.env.RAZORPAY_KEY_ID;

      // Try to fetch the order to verify it exists
      try {
        const verifiedOrder = await razorpay.orders.fetch(order.id);
        console.log('Order verified in Razorpay:', {
          id: verifiedOrder.id,
          amount: verifiedOrder.amount,
          currency: verifiedOrder.currency,
          status: verifiedOrder.status
        });
        
        // Verify key matches
        if (!razorpayKeyId || !razorpayKeyId.startsWith('rzp_')) {
          console.error('Invalid Razorpay Key ID format');
        }
      } catch (verifyError) {
        console.error('Error verifying order in Razorpay:', verifyError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create valid Razorpay order',
          error: process.env.NODE_ENV === 'development' ? verifyError.message : undefined
        });
      }

      // Store order ID and status in booking
      booking.razorpayOrderId = order.id;
      booking.orderStatus = 'created';
      booking.orderCreatedAt = new Date();
      await booking.save();

      // Generate Razorpay checkout URL with callback URLs
      // razorpayKeyId is already declared above, so we can use it here
      
      let checkoutUrl;
      if (isLocalDev) {
        // For local dev, don't use redirect_url - Razorpay doesn't accept localhost
        // Payment will complete in Razorpay's page, then user can manually return
        checkoutUrl = `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}`;
      } else {
        // Production URL with redirect
        checkoutUrl = `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}&redirect_url=${encodeURIComponent(successUrl)}`;
      }
      
      // Log the checkout URL for debugging
      console.log('Razorpay Checkout URL:', checkoutUrl);
      console.log('Razorpay Order ID:', order.id);
      console.log('Razorpay Key ID:', razorpayKeyId ? `${razorpayKeyId.substring(0, 10)}...` : 'NOT SET');
      console.log('Return URL:', returnUrl);
      console.log('Success URL:', successUrl);
      console.log('Order Amount:', order.amount);
      console.log('Order Currency:', order.currency);
      console.log('Order Status:', order.status);

      res.json({
        success: true,
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          keyId: razorpayKeyId, // Required for React Native SDK
          checkoutUrl: checkoutUrl, // Keep for WebView fallback
          sessionUrl: checkoutUrl, // For compatibility with frontend
          url: checkoutUrl, // For compatibility with frontend
          paymentMethod: 'razorpay'
        }
      });
    }

  } catch (error) {
    console.error('Create checkout session error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      // Add this temporarily to see the actual error:
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/payments/stripe-webhook
// @desc    Handle Stripe webhook events
// @access  Public
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const stripeClient = getStripeClient();
    if (!stripeClient) {
      console.warn('⚠️ Stripe is not configured. Webhook handler disabled.');
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    event = stripeClient.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        await handleStripePaymentSuccess(session);
        break;

      case 'payment_intent.payment_failed':
        const paymentIntent = event.data.object;
        await handleStripePaymentFailure(paymentIntent);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// @route   POST /api/payments/razorpay-webhook
// @desc    Handle Razorpay webhook events
// @access  Public
router.post('/razorpay-webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // Check if webhook secret is configured
    if (!webhookSecret) {
      console.warn('⚠️ Razorpay webhook secret not configured. Webhook handler disabled.');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify webhook signature if signature is provided
    if (signature) {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Razorpay webhook signature verification failed');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body;

    switch (event.event) {
      case 'payment.captured':
        await handleRazorpayPaymentSuccess(event.payload.payment.entity);
        break;

      case 'payment.failed':
        await handleRazorpayPaymentFailure(event.payload.payment.entity);
        break;

      case 'order.paid':
        // Handle order paid event
        await handleRazorpayOrderPaid(event.payload.order.entity);
        break;

      default:
        console.log(`Unhandled Razorpay event: ${event.event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// @route   POST /api/payments/verify-razorpay
// @desc    Verify Razorpay payment
// @access  Private
router.post('/verify-razorpay', [
  body('razorpay_order_id').notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Signature is required'),
  body('bookingId').isMongoId().withMessage('Invalid booking ID')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = req.body;

    // Get booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if payment is already verified
    if (booking.paymentStatus === 'paid' && booking.paymentId === razorpay_payment_id) {
      return res.json({
        success: true,
        message: 'Payment already verified'
      });
    }

    // Verify payment signature
    const crypto = require('crypto');
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Verify order status and amount from Razorpay
    const razorpay = getRazorpayClient();
    if (razorpay) {
      try {
        const order = await razorpay.orders.fetch(razorpay_order_id);
        const payment = await razorpay.payments.fetch(razorpay_payment_id);

        // Verify amount matches
        const expectedAmount = Math.round(booking.amount * 100); // Convert to paise
        if (order.amount !== expectedAmount) {
          return res.status(400).json({
            success: false,
            message: 'Payment amount mismatch'
          });
        }

        // Verify payment status
        if (payment.status !== 'captured') {
          return res.status(400).json({
            success: false,
            message: 'Payment not captured'
          });
        }
      } catch (error) {
        console.error('Error fetching order/payment from Razorpay:', error);
        // Continue with verification even if API call fails
      }
    }

    // Update booking payment status
    booking.paymentStatus = 'paid';
    booking.paymentId = razorpay_payment_id;
    booking.transactionId = razorpay_order_id;
    booking.orderStatus = 'paid';
    booking.status = 'confirmed';
    await booking.save();

    res.json({
      success: true,
      message: 'Payment verified successfully'
    });

  } catch (error) {
    console.error('Verify Razorpay payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/payments/order/:orderId/status
// @desc    Get Razorpay order status
// @access  Private
router.get('/order/:orderId/status', [
  param('orderId').notEmpty().withMessage('Order ID is required')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const razorpay = getRazorpayClient();

    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay is not configured'
      });
    }

    try {
      // Fetch order from Razorpay
      const order = await razorpay.orders.fetch(orderId);

      // Find booking by order ID
      const booking = await Booking.findOne({ razorpayOrderId: orderId });

      // Check if user owns this booking
      if (booking && booking.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      let paymentStatus = 'pending';
      let paymentId = null;

      if (order.status === 'paid') {
        paymentStatus = 'paid';
        // Try to get payment ID from order
        if (order.payments && order.payments.length > 0) {
          paymentId = order.payments[0];
        }
        // Update booking if found
        if (booking) {
          booking.paymentStatus = 'paid';
          booking.orderStatus = 'paid';
          booking.status = 'confirmed';
          if (paymentId) {
            booking.paymentId = paymentId;
          }
          await booking.save();
        }
      } else if (order.status === 'attempted') {
        paymentStatus = 'pending';
        if (booking) {
          booking.orderStatus = 'attempted';
          booking.paymentAttemptedAt = new Date();
          await booking.save();
        }
      } else if (order.status === 'created') {
        paymentStatus = 'pending';
      }

      res.json({
        success: true,
        data: {
          orderId: order.id,
          orderStatus: order.status,
          amount: order.amount,
          currency: order.currency,
          paymentStatus: paymentStatus,
          paymentId: paymentId,
          bookingId: booking ? booking._id.toString() : null
        }
      });
    } catch (error) {
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }
      throw error;
    }

  } catch (error) {
    console.error('Get order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/payments/booking/:bookingId
// @desc    Get payment status for a booking
// @access  Private
router.get('/booking/:bookingId', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns this booking
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: {
        paymentStatus: booking.paymentStatus,
        amount: booking.amount,
        currency: booking.currency,
        paymentMethod: booking.paymentMethod,
        transactionId: booking.transactionId
      }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper functions for webhook handlers
const handleStripePaymentSuccess = async (session) => {
  try {
    const bookingId = session.metadata.bookingId;
    const booking = await Booking.findById(bookingId);

    if (booking) {
      booking.paymentStatus = 'paid';
      booking.paymentId = session.payment_intent;
      booking.transactionId = session.id;
      booking.status = 'confirmed';
      await booking.save();
    }
  } catch (error) {
    console.error('Handle Stripe payment success error:', error);
  }
};

const handleStripePaymentFailure = async (paymentIntent) => {
  try {
    const bookingId = paymentIntent.metadata.bookingId;
    const booking = await Booking.findById(bookingId);

    if (booking) {
      booking.paymentStatus = 'failed';
      await booking.save();
    }
  } catch (error) {
    console.error('Handle Stripe payment failure error:', error);
  }
};

const handleRazorpayPaymentSuccess = async (payment) => {
  try {
    const bookingId = payment.notes?.bookingId;
    if (!bookingId) {
      console.error('Booking ID not found in payment notes');
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.error(`Booking not found: ${bookingId}`);
      return;
    }

    booking.paymentStatus = 'paid';
    booking.paymentId = payment.id;
    booking.transactionId = payment.order_id;
    booking.orderStatus = 'paid';
    booking.status = 'confirmed';
    await booking.save();

    console.log(`Payment successful for booking ${bookingId}, payment ID: ${payment.id}`);
  } catch (error) {
    console.error('Handle Razorpay payment success error:', error);
  }
};

const handleRazorpayPaymentFailure = async (payment) => {
  try {
    const bookingId = payment.notes?.bookingId;
    if (!bookingId) {
      console.error('Booking ID not found in payment notes');
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.error(`Booking not found: ${bookingId}`);
      return;
    }

    booking.paymentStatus = 'failed';
    booking.orderStatus = 'failed';
    booking.paymentAttemptedAt = new Date();
    await booking.save();

    console.log(`Payment failed for booking ${bookingId}, payment ID: ${payment.id}`);
  } catch (error) {
    console.error('Handle Razorpay payment failure error:', error);
  }
};

const handleRazorpayOrderPaid = async (order) => {
  try {
    const bookingId = order.notes?.bookingId;
    if (!bookingId) {
      console.error('Booking ID not found in order notes');
      return;
    }

    const booking = await Booking.findOne({ razorpayOrderId: order.id });
    if (!booking) {
      console.error(`Booking not found for order: ${order.id}`);
      return;
    }

    booking.paymentStatus = 'paid';
    booking.orderStatus = 'paid';
    booking.status = 'confirmed';
    if (order.payments && order.payments.length > 0) {
      booking.paymentId = order.payments[0];
    }
    await booking.save();

    console.log(`Order paid for booking ${bookingId}, order ID: ${order.id}`);
  } catch (error) {
    console.error('Handle Razorpay order paid error:', error);
  }
};

// Subscription pricing
const SUBSCRIPTION_PRICES = {
  weekly: 500,
  monthly: 1500,
  yearly: 12000
};

// @route   POST /api/payments/create-subscription-checkout
// @desc    Create a payment checkout session for subscription
// @access  Private
router.post('/create-subscription-checkout', [
  body('subscriptionType').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid subscription type'),
  body('paymentMethod').isIn(['stripe', 'razorpay']).withMessage('Invalid payment method')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { subscriptionType, paymentMethod } = req.body;
    const amount = SUBSCRIPTION_PRICES[subscriptionType];
    const amountInCents = Math.round(amount * 100); // Convert to cents/paise

    // Razorpay requires uppercase currency codes (INR, USD, etc.)
    // Stripe requires lowercase currency codes (inr, usd, etc.)
    const currencyForRazorpay = 'INR';
    const currencyForStripe = 'inr';

    if (paymentMethod === 'stripe') {
      const stripeClient = getStripeClient();
      if (!stripeClient) {
        return res.status(500).json({
          success: false,
          message: 'Stripe is not configured'
        });
      }

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currencyForStripe,
              product_data: {
                name: `${subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1)} Subscription`,
                description: `Menorah Health ${subscriptionType} subscription plan`
              },
              unit_amount: amountInCents
            },
            quantity: 1
          }
        ],
        mode: 'payment',
        success_url: `${process.env.CHECKOUT_RETURN_URL || 'https://menorahhealth.com'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CHECKOUT_RETURN_URL || 'https://menorahhealth.com'}/subscription/cancel`,
        metadata: {
          userId: req.user._id.toString(),
          subscriptionType: subscriptionType
        }
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
          checkoutUrl: session.url,
          sessionUrl: session.url,
          paymentMethod: 'stripe'
        }
      });

    } else if (paymentMethod === 'razorpay') {
      // Get Razorpay client
      const razorpay = getRazorpayClient();
      if (!razorpay) {
        return res.status(500).json({
          success: false,
          message: 'Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.'
        });
      }

      // Prepare callback URLs
      const returnUrl = process.env.CHECKOUT_RETURN_URL || 'https://menorahhealth.com/checkout/return';
      const isLocalDev = process.env.NODE_ENV === 'development' || returnUrl.includes('localhost');

      // Create Razorpay order
      // Receipt must be max 40 characters, so we'll use a shorter format
      const userIdStr = req.user._id.toString();
      const receipt = `sub_${subscriptionType.substring(0, 3)}_${userIdStr.substring(userIdStr.length - 8)}`;
      
      const order = await razorpay.orders.create({
        amount: amountInCents,
        currency: currencyForRazorpay,
        receipt: receipt.length > 40 ? receipt.substring(0, 40) : receipt,
        notes: {
          userId: req.user._id.toString(),
          subscriptionType: subscriptionType,
          type: 'subscription'
        }
      });

      // Generate success and cancel URLs
      let successUrl;
      if (isLocalDev) {
        successUrl = `menorah://payments/subscription/return?status=success&subscriptionType=${subscriptionType}&order_id=${order.id}`;
      } else {
        successUrl = `${returnUrl}?status=success&type=subscription&subscriptionType=${subscriptionType}&order_id=${order.id}`;
      }

      const cancelUrl = isLocalDev
        ? `menorah://payments/subscription/return?status=cancel&subscriptionType=${subscriptionType}`
        : `${returnUrl}?status=cancel&type=subscription&subscriptionType=${subscriptionType}`;

      // Get Razorpay key ID
      const razorpayKeyId = process.env.RAZORPAY_KEY_ID;

      // Generate Razorpay checkout URL
      let checkoutUrl;
      if (isLocalDev) {
        checkoutUrl = `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}`;
      } else {
        checkoutUrl = `https://checkout.razorpay.com/v1/checkout.html?key=${razorpayKeyId}&order_id=${order.id}&redirect_url=${encodeURIComponent(successUrl)}`;
      }

      // Store order ID in user document temporarily (we'll use notes to track)
      // We can also store it in a separate collection if needed, but for now we'll use the order notes

      res.json({
        success: true,
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          keyId: razorpayKeyId,
          checkoutUrl: checkoutUrl,
          sessionUrl: checkoutUrl,
          url: checkoutUrl,
          paymentMethod: 'razorpay',
          subscriptionType: subscriptionType
        }
      });
    }

  } catch (error) {
    console.error('Create subscription checkout session error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/payments/verify-subscription-payment
// @desc    Verify subscription payment and activate subscription
// @access  Private
router.post('/verify-subscription-payment', [
  body('razorpay_order_id').optional().notEmpty().withMessage('Order ID is required for Razorpay'),
  body('razorpay_payment_id').optional().notEmpty().withMessage('Payment ID is required for Razorpay'),
  body('razorpay_signature').optional().notEmpty().withMessage('Signature is required for Razorpay'),
  body('subscriptionType').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid subscription type'),
  body('orderId').optional().notEmpty().withMessage('Order ID is required')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      subscriptionType,
      orderId
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify payment signature if Razorpay
    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const crypto = require('crypto');
      const text = `${razorpay_order_id}|${razorpay_payment_id}`;
      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(text)
        .digest('hex');

      if (signature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment signature'
        });
      }

      // Verify order status and amount from Razorpay
      const razorpay = getRazorpayClient();
      if (razorpay) {
        try {
          const order = await razorpay.orders.fetch(razorpay_order_id);
          const payment = await razorpay.payments.fetch(razorpay_payment_id);

          // Verify amount matches
          const expectedAmount = Math.round(SUBSCRIPTION_PRICES[subscriptionType] * 100);
          if (order.amount !== expectedAmount) {
            return res.status(400).json({
              success: false,
              message: 'Payment amount mismatch'
            });
          }

          // Verify payment status
          if (payment.status !== 'captured') {
            return res.status(400).json({
              success: false,
              message: 'Payment not captured'
            });
          }
        } catch (error) {
          console.error('Error fetching order/payment from Razorpay:', error);
          return res.status(400).json({
            success: false,
            message: 'Failed to verify payment with Razorpay'
          });
        }
      }
    } else if (orderId) {
      // For Stripe, verify using order status endpoint
      const razorpay = getRazorpayClient();
      if (razorpay) {
        try {
          const order = await razorpay.orders.fetch(orderId);
          if (order.status !== 'paid') {
            return res.status(400).json({
              success: false,
              message: 'Payment not completed'
            });
          }
        } catch (error) {
          console.error('Error fetching order from Razorpay:', error);
        }
      }
    }

    // Calculate expiry date
    const now = new Date();
    let expiryDate = new Date();
    switch (subscriptionType) {
      case 'weekly':
        expiryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 'yearly':
        expiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
    }

    // Activate subscription
    user.subscription = {
      plan: 'premium',
      subscriptionType: subscriptionType,
      startDate: now,
      endDate: expiryDate,
      isActive: true
    };
    await user.save();

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      data: {
        subscriptionType: subscriptionType,
        startDate: now,
        endDate: expiryDate,
        isActive: true
      }
    });

  } catch (error) {
    console.error('Verify subscription payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/payments/subscription/status
// @desc    Get subscription status for current user
// @access  Private
router.get('/subscription/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if subscription is still active
    const now = new Date();
    let isActive = false;
    if (user.subscription.isActive && user.subscription.endDate) {
      isActive = new Date(user.subscription.endDate) > now;
      
      // Update subscription status if expired
      if (!isActive && user.subscription.isActive) {
        user.subscription.isActive = false;
        user.subscription.plan = 'free';
        await user.save();
      }
    }

    res.json({
      success: true,
      data: {
        plan: user.subscription.plan,
        subscriptionType: user.subscription.subscriptionType,
        isActive: isActive,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate
      }
    });

  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
