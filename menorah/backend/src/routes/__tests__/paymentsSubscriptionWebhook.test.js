const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockRazorpayClient = {
  orders: {
    create: jest.fn(),
    fetch: jest.fn(),
  },
  payments: {
    fetch: jest.fn(),
  },
};
const mockClaimWebhookEvent = jest.fn();
const mockFinalizeWebhookEvent = jest.fn();
const mockFinalizeWebhookEventFailure = jest.fn();
const mockReconcileCapturedBookingPayment = jest.fn();
const mockRecordBookingPaymentFailure = jest.fn();

jest.mock('razorpay', () => jest.fn(() => mockRazorpayClient));
jest.mock('../../middleware/auth', () => ({
  verifiedPatientAuth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
}));
jest.mock('../../models/Booking', () => ({
  findById: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../../models/PaymentAttempt', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../models/User', () => ({
  findById: jest.fn(),
}));
jest.mock('../../services/razorpayBookingOrderService', () => ({
  BookingPaymentOrderError: class BookingPaymentOrderError extends Error {},
  createOrReuseBookingOrder: jest.fn(),
}));
jest.mock('../../services/razorpayPaymentReconciliation', () => ({
  claimWebhookEvent: (...args) => mockClaimWebhookEvent(...args),
  finalizeWebhookEvent: (...args) => mockFinalizeWebhookEvent(...args),
  finalizeWebhookEventFailure: (...args) => mockFinalizeWebhookEventFailure(...args),
  reconcileCapturedBookingPayment: (...args) => mockReconcileCapturedBookingPayment(...args),
  recordBookingPaymentFailure: (...args) => mockRecordBookingPaymentFailure(...args),
}));
jest.mock('../../services/bookingMarketplaceNotifications', () => ({
  notifyEligibleCounsellorsOfBooking: jest.fn(),
}));

const PaymentAttempt = require('../../models/PaymentAttempt');
const User = require('../../models/User');
const paymentsRouter = require('../payments');

const WEBHOOK_SECRET = ['Webhook', '-Sub-A1', 'b2C3d4E5f6'].join('');
const USER_ID = '64f000000000000000000102';
const ORDER_ID = 'order_subscription_monthly';
const PAYMENT_ID = 'pay_subscription_monthly';

const buildApp = () => {
  const app = express();
  app.use('/api/payments/razorpay-webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.set('io', { emit: jest.fn() });
  app.use('/api/payments', paymentsRouter);
  return app;
};

const sendSignedWebhook = (event) => {
  const rawBody = JSON.stringify(event);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return request(buildApp())
    .post('/api/payments/razorpay-webhook')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signature)
    .set('x-razorpay-event-id', 'evt_subscription_123')
    .send(rawBody);
};

describe('subscription payment routes remain fail-closed', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
      RAZORPAY_KEY_SECRET: ['KeySec', 'ret-A1', 'b2C3d4E5f6G7h8'].join(''),
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RAZORPAY_WEBHOOK_SECRET_PREVIOUS: '',
      PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS: '5',
      BOOKING_PAYMENTS_ENABLED: 'true',
      SUBSCRIPTION_PAYMENTS_ENABLED: 'true',
      CHECKOUT_RETURN_URL: 'https://app.menorah.me/checkout/callback',
    };
    jest.clearAllMocks();
    mockAuthUser = { _id: USER_ID, role: 'user' };
    PaymentAttempt.findOne.mockResolvedValue(null);
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: true,
      eventKey: 'event:evt_subscription_123',
      claimToken: 1,
    });
    mockFinalizeWebhookEvent.mockResolvedValue({ finalized: true });
    mockFinalizeWebhookEventFailure.mockResolvedValue({ finalized: true });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('does not enable subscription checkout from an environment flag alone', async () => {
    const response = await request(buildApp())
      .post('/api/payments/create-subscription-checkout')
      .send({ subscriptionType: 'monthly' })
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      code: 'SUBSCRIPTION_PAYMENTS_DISABLED',
      message: 'Subscription payments are not available.',
    });
    expect(mockRazorpayClient.orders.create).not.toHaveBeenCalled();
  });

  test('does not enable subscription verification from an environment flag alone', async () => {
    const response = await request(buildApp())
      .post('/api/payments/verify-subscription-payment')
      .send({
        subscriptionType: 'monthly',
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'a'.repeat(64),
      })
      .expect(503);

    expect(response.body.code).toBe('SUBSCRIPTION_PAYMENTS_DISABLED');
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockRazorpayClient.payments.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('still validates the authenticated request before returning the disabled contract', async () => {
    const response = await request(buildApp())
      .post('/api/payments/create-subscription-checkout')
      .send({ subscriptionType: 'lifetime' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  test('quarantines a subscription-shaped captured webhook instead of granting entitlement', async () => {
    const payment = {
      id: PAYMENT_ID,
      order_id: ORDER_ID,
      amount: 150000,
      currency: 'INR',
      status: 'captured',
      captured: true,
      notes: {
        type: 'subscription',
        userId: USER_ID,
        subscriptionType: 'monthly',
      },
    };

    const response = await sendSignedWebhook({
      event: 'payment.captured',
      payload: { payment: { entity: payment } },
    }).expect(200);

    expect(PaymentAttempt.findOne).toHaveBeenCalledWith({ orderId: ORDER_ID });
    expect(mockFinalizeWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'event:evt_subscription_123',
      claimToken: 1,
      processingState: 'needs_review',
      decision: 'needs_review',
      mismatchCodes: ['ATTEMPT_MISSING'],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    }));
    expect(response.body).toEqual({ received: true, reviewRequired: true });
    expect(User.findById).not.toHaveBeenCalled();
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('ignores order.paid instead of using it as a subscription entitlement signal', async () => {
    const response = await sendSignedWebhook({
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: ORDER_ID,
            payment_id: PAYMENT_ID,
            amount: 150000,
            currency: 'INR',
            notes: {
              type: 'subscription',
              userId: USER_ID,
              subscriptionType: 'monthly',
            },
          },
        },
      },
    }).expect(200);

    expect(response.body).toEqual({ received: true, ignored: true });
    expect(mockFinalizeWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      processingState: 'ignored',
      mismatchCodes: [],
    }));
    expect(PaymentAttempt.findOne).not.toHaveBeenCalled();
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('reports an active pre-existing subscription without modifying it', async () => {
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const user = {
      _id: USER_ID,
      subscription: {
        plan: 'premium',
        subscriptionType: 'monthly',
        isActive: true,
        startDate,
        endDate,
      },
      save: jest.fn(),
    };
    User.findById.mockResolvedValue(user);

    const response = await request(buildApp())
      .get('/api/payments/subscription/status')
      .expect(200);

    expect(User.findById).toHaveBeenCalledWith(USER_ID);
    expect(response.body.data).toEqual({
      plan: 'premium',
      subscriptionType: 'monthly',
      isActive: true,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    expect(user.save).not.toHaveBeenCalled();
  });

  test('reports an expired pre-existing subscription as free without renewing it', async () => {
    const user = {
      _id: USER_ID,
      subscription: {
        plan: 'premium',
        subscriptionType: 'monthly',
        isActive: true,
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      save: jest.fn(),
    };
    User.findById.mockResolvedValue(user);

    const response = await request(buildApp())
      .get('/api/payments/subscription/status')
      .expect(200);

    expect(response.body.data).toEqual({
      plan: 'free',
      subscriptionType: null,
      isActive: false,
      startDate: null,
      endDate: null,
    });
    expect(user.save).not.toHaveBeenCalled();
  });
});
