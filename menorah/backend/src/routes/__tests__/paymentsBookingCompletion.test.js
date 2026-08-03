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
const mockCreateOrReuseBookingOrder = jest.fn();
const mockClaimWebhookEvent = jest.fn();
const mockFinalizeWebhookEvent = jest.fn();
const mockFinalizeWebhookEventFailure = jest.fn();
const mockReconcileCapturedBookingPayment = jest.fn();
const mockRecordBookingPaymentFailure = jest.fn();
const mockNotifyEligibleCounsellors = jest.fn();

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
  BookingPaymentOrderError: class BookingPaymentOrderError extends Error {
    constructor(message, { code = 'PAYMENT_ORDER_FAILED', status = 409, retryable = false } = {}) {
      super(message);
      this.code = code;
      this.status = status;
      this.retryable = retryable;
    }
  },
  createOrReuseBookingOrder: (...args) => mockCreateOrReuseBookingOrder(...args),
}));
jest.mock('../../services/razorpayPaymentReconciliation', () => ({
  claimWebhookEvent: (...args) => mockClaimWebhookEvent(...args),
  finalizeWebhookEvent: (...args) => mockFinalizeWebhookEvent(...args),
  finalizeWebhookEventFailure: (...args) => mockFinalizeWebhookEventFailure(...args),
  reconcileCapturedBookingPayment: (...args) => mockReconcileCapturedBookingPayment(...args),
  recordBookingPaymentFailure: (...args) => mockRecordBookingPaymentFailure(...args),
}));
jest.mock('../../services/bookingMarketplaceNotifications', () => ({
  notifyEligibleCounsellorsOfBooking: (...args) => mockNotifyEligibleCounsellors(...args),
}));

const Booking = require('../../models/Booking');
const PaymentAttempt = require('../../models/PaymentAttempt');
const paymentsRouter = require('../payments');

const WEBHOOK_SECRET = ['Webhook', '-A1b2C3', 'd4E5f6G7h8'].join('');
const KEY_SECRET = ['KeySec', 'ret-A1', 'b2C3d4', 'E5f6G7h8'].join('');
const BOOKING_ID = '64f000000000000000000101';
const USER_ID = '64f000000000000000000102';
const ATTEMPT_ID = '64f000000000000000000103';
const ORDER_ID = 'order_booking_123';
const PAYMENT_ID = 'pay_booking_456';

const booking = {
  _id: BOOKING_ID,
  user: USER_ID,
  counsellor: null,
  status: 'pending',
  paymentStatus: 'pending',
  paymentMethod: 'razorpay',
  amount: 1000,
  amountMinor: 100000,
  currency: 'INR',
  pricing: { listAmountMinor: 100000, currency: 'INR' },
  bookingAuthorization: { kind: 'payment', status: 'pending' },
  holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
};
const expected = {
  amountMinor: 100000,
  currency: 'INR',
  receipt: `booking_${ATTEMPT_ID}`,
  notes: { bookingId: BOOKING_ID, userId: USER_ID },
};
const attempt = {
  _id: ATTEMPT_ID,
  booking: BOOKING_ID,
  user: USER_ID,
  orderId: ORDER_ID,
  expected,
  status: 'order_created',
};
const providerOrder = {
  id: ORDER_ID,
  amount: 100000,
  currency: 'INR',
  receipt: expected.receipt,
  notes: expected.notes,
  status: 'paid',
};
const providerPayment = {
  id: PAYMENT_ID,
  order_id: ORDER_ID,
  amount: 100000,
  currency: 'INR',
  status: 'captured',
  captured: true,
};

const buildApp = () => {
  const app = express();
  app.use('/api/payments/razorpay-webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.set('io', { emit: jest.fn() });
  app.use('/api/payments', paymentsRouter);
  return app;
};

const sendSignedWebhook = ({
  event,
  eventId = 'evt_booking_123',
}) => {
  const rawBody = JSON.stringify(event);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return request(buildApp())
    .post('/api/payments/razorpay-webhook')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signature)
    .set('x-razorpay-event-id', eventId)
    .send(rawBody);
};

describe('booking payment route lifecycle', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
      RAZORPAY_KEY_SECRET: KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RAZORPAY_WEBHOOK_SECRET_PREVIOUS: '',
      PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS: '5',
      BOOKING_PAYMENTS_ENABLED: 'true',
      SUBSCRIPTION_PAYMENTS_ENABLED: 'false',
      CHECKOUT_RETURN_URL: 'https://app.menorah.me/checkout/callback',
    };
    jest.clearAllMocks();
    mockAuthUser = { _id: USER_ID, role: 'user' };
    Booking.findById.mockResolvedValue(booking);
    Booking.updateMany.mockResolvedValue({ modifiedCount: 0 });
    PaymentAttempt.findOne.mockResolvedValue(attempt);
    mockRazorpayClient.orders.fetch.mockResolvedValue(providerOrder);
    mockRazorpayClient.payments.fetch.mockResolvedValue(providerPayment);
    mockCreateOrReuseBookingOrder.mockResolvedValue({
      order: { ...providerOrder, status: 'created' },
      reused: false,
    });
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: true,
      eventKey: 'event:evt_booking_123',
      claimToken: 1,
    });
    mockFinalizeWebhookEvent.mockResolvedValue({ finalized: true });
    mockFinalizeWebhookEventFailure.mockResolvedValue({ finalized: true });
    mockReconcileCapturedBookingPayment.mockResolvedValue({
      decision: 'authorize',
      bookingId: BOOKING_ID,
      shouldNotify: false,
      idempotent: false,
    });
    mockRecordBookingPaymentFailure.mockResolvedValue({
      decision: 'reject',
      recorded: true,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('creates or reuses an order only for the authenticated owner pending hold', async () => {
    const response = await request(buildApp())
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: BOOKING_ID })
      .expect(200);

    expect(Booking.updateMany).toHaveBeenCalledTimes(4);
    expect(mockCreateOrReuseBookingOrder).toHaveBeenCalledWith(expect.objectContaining({
      booking,
      userId: USER_ID,
      client: mockRazorpayClient,
    }));
    expect(response.body.data).toMatchObject({
      orderId: ORDER_ID,
      amount: 100000,
      currency: 'INR',
      paymentMethod: 'razorpay',
      reused: false,
    });
  });

  test('fails closed when new booking payment initiation is not enabled', async () => {
    process.env.BOOKING_PAYMENTS_ENABLED = 'false';

    const response = await request(buildApp())
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: BOOKING_ID })
      .expect(503);

    expect(response.body.code).toBe('BOOKING_PAYMENTS_DISABLED');
    expect(Booking.findById).not.toHaveBeenCalled();
    expect(mockCreateOrReuseBookingOrder).not.toHaveBeenCalled();
  });

  test('does not create an order for a cancelled booking', async () => {
    Booking.findById.mockResolvedValue({ ...booking, status: 'cancelled' });

    const response = await request(buildApp())
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: BOOKING_ID })
      .expect(409);

    expect(response.body.code).toBe('BOOKING_CANCELLED');
    expect(Booking.updateMany).not.toHaveBeenCalled();
    expect(mockCreateOrReuseBookingOrder).not.toHaveBeenCalled();
  });

  test('returns the existing entitlement instead of creating another order', async () => {
    Booking.findById.mockResolvedValue({
      ...booking,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentId: PAYMENT_ID,
      bookingAuthorization: {
        kind: 'payment',
        status: 'authorized',
        reference: PAYMENT_ID,
      },
    });

    const response = await request(buildApp())
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: BOOKING_ID })
      .expect(200);

    expect(response.body.data).toMatchObject({
      bookingId: BOOKING_ID,
      alreadyPaid: true,
      amount: 100000,
    });
    expect(mockCreateOrReuseBookingOrder).not.toHaveBeenCalled();
  });

  test('rejects a callback that is not bound to an owned PaymentAttempt', async () => {
    PaymentAttempt.findOne.mockResolvedValue(null);

    const response = await request(buildApp())
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId: BOOKING_ID,
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'a'.repeat(64),
      })
      .expect(404);

    expect(response.body.code).toBe('PAYMENT_ATTEMPT_NOT_FOUND');
    expect(PaymentAttempt.findOne).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      booking: BOOKING_ID,
      user: USER_ID,
    });
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('treats the signed callback as an entry check and reconciles provider evidence', async () => {
    const signature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${ORDER_ID}|${PAYMENT_ID}`)
      .digest('hex');
    mockReconcileCapturedBookingPayment.mockResolvedValue({
      decision: 'authorize',
      bookingId: BOOKING_ID,
      shouldNotify: true,
      idempotent: false,
    });

    const response = await request(buildApp())
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId: BOOKING_ID,
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: signature,
      })
      .expect(200);

    expect(mockRazorpayClient.orders.fetch).toHaveBeenCalledWith(ORDER_ID);
    expect(mockRazorpayClient.payments.fetch).toHaveBeenCalledWith(PAYMENT_ID);
    expect(mockReconcileCapturedBookingPayment).toHaveBeenCalledWith({
      paymentAttemptId: ATTEMPT_ID,
      order: providerOrder,
      payment: providerPayment,
      source: 'redirect_verification',
      eventKey: `redirect:${ORDER_ID}:${PAYMENT_ID}`,
    });
    expect(response.body).toMatchObject({
      success: true,
      message: 'Payment verified successfully',
    });
    expect(mockNotifyEligibleCounsellors).toHaveBeenCalledTimes(1);
    expect(mockNotifyEligibleCounsellors).toHaveBeenCalledWith({
      booking,
      io: expect.objectContaining({ emit: expect.any(Function) }),
    });
  });

  test('returns review-required when callback evidence cannot safely authorize the booking', async () => {
    const signature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${ORDER_ID}|${PAYMENT_ID}`)
      .digest('hex');
    mockReconcileCapturedBookingPayment.mockResolvedValue({
      decision: 'needs_review',
      bookingId: BOOKING_ID,
      shouldNotify: false,
    });

    const response = await request(buildApp())
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId: BOOKING_ID,
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: signature,
      })
      .expect(409);

    expect(response.body.code).toBe('PAYMENT_REVIEW_REQUIRED');
  });

  test('quarantines a captured webhook whose order has no local PaymentAttempt', async () => {
    PaymentAttempt.findOne.mockResolvedValue(null);

    const response = await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    expect(response.body).toEqual({ received: true, reviewRequired: true });
    expect(mockFinalizeWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'event:evt_booking_123',
      claimToken: 1,
      processingState: 'needs_review',
      decision: 'needs_review',
      mismatchCodes: ['ATTEMPT_MISSING'],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    }));
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('reconciles a captured webhook only after a durable ledger claim and provider fetch', async () => {
    mockReconcileCapturedBookingPayment.mockResolvedValue({
      decision: 'authorize',
      bookingId: BOOKING_ID,
      shouldNotify: true,
      idempotent: false,
    });
    const response = await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    expect(mockClaimWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'event:evt_booking_123',
      eventType: 'payment.captured',
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    }));
    expect(PaymentAttempt.findOne).toHaveBeenCalledWith({ orderId: ORDER_ID });
    expect(mockReconcileCapturedBookingPayment).toHaveBeenCalledWith({
      paymentAttemptId: ATTEMPT_ID,
      order: providerOrder,
      payment: providerPayment,
      source: 'webhook',
      eventKey: 'event:evt_booking_123',
      claimToken: 1,
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockNotifyEligibleCounsellors).toHaveBeenCalledTimes(1);
    expect(mockNotifyEligibleCounsellors).toHaveBeenCalledWith({
      booking,
      io: expect.objectContaining({ emit: expect.any(Function) }),
    });
    expect(response.body).toEqual({ received: true });
  });

  test('records payment.failed against the bound attempt without calling captured reconciliation', async () => {
    const failedPayment = {
      ...providerPayment,
      status: 'failed',
      captured: false,
    };
    mockRazorpayClient.payments.fetch.mockResolvedValue(failedPayment);

    const response = await sendSignedWebhook({
      event: {
        event: 'payment.failed',
        payload: { payment: { entity: failedPayment } },
      },
    }).expect(200);

    expect(mockRecordBookingPaymentFailure).toHaveBeenCalledWith({
      paymentAttemptId: ATTEMPT_ID,
      order: providerOrder,
      payment: failedPayment,
      source: 'webhook',
      eventKey: 'event:evt_booking_123',
      claimToken: 1,
    });
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      received: true,
      failedPaymentRecorded: true,
      reviewRequired: false,
    });
  });

  test('does not fetch or reconcile a duplicate webhook delivery', async () => {
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: false,
      duplicate: true,
    });

    const response = await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    expect(response.body).toEqual({ received: true, duplicate: true });
    expect(PaymentAttempt.findOne).not.toHaveBeenCalled();
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
    expect(mockNotifyEligibleCounsellors).not.toHaveBeenCalled();
  });
});
