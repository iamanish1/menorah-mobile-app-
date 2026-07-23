const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockRazorpayClient = {
  orders: {
    create: jest.fn(),
    fetch: jest.fn(),
    all: jest.fn(),
  },
  payments: { fetch: jest.fn() },
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
  auth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000002', role: 'user' };
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

const WEBHOOK_SECRET = 'Webhook-A1b2C3d4E5f6G7h8';
const PREVIOUS_WEBHOOK_SECRET = 'Webhook-Previous-Z9y8X7w6V5u4';
const KEY_SECRET = 'KeySecret-A1b2C3d4E5f6G7h8';
const ORDER_ID = 'order_test_123';
const PAYMENT_ID = 'pay_test_456';
const BOOKING_ID = '64f000000000000000000001';
const USER_ID = '64f000000000000000000002';
const ATTEMPT_ID = '64f000000000000000000003';

const expected = {
  amountMinor: 12345,
  currency: 'INR',
  receipt: `booking_${ATTEMPT_ID}`,
  notes: { bookingId: BOOKING_ID, userId: USER_ID },
};
const booking = {
  _id: BOOKING_ID,
  user: USER_ID,
  counsellor: null,
  status: 'pending',
  paymentStatus: 'pending',
  paymentMethod: 'razorpay',
  amount: 123.45,
  amountMinor: 12345,
  currency: 'INR',
  pricing: { listAmountMinor: 12345, currency: 'INR' },
  bookingAuthorization: { kind: 'payment', status: 'pending' },
  holdExpiresAt: new Date(Date.now() + 60_000),
  scheduledAt: new Date(Date.now() + 3_600_000),
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
  amount: 12345,
  currency: 'INR',
  receipt: expected.receipt,
  notes: expected.notes,
  status: 'paid',
};
const providerPayment = {
  id: PAYMENT_ID,
  order_id: ORDER_ID,
  amount: 12345,
  currency: 'INR',
  status: 'captured',
  captured: true,
};

const buildApp = ({ rawWebhook = true } = {}) => {
  const app = express();
  if (rawWebhook) {
    app.use('/api/payments/razorpay-webhook', express.raw({ type: 'application/json' }));
  }
  app.use(express.json());
  app.set('io', { emit: jest.fn() });
  app.use('/api/payments', paymentsRouter);
  return app;
};

const sendSignedWebhook = ({
  app = buildApp(),
  event,
  eventId = 'evt_test_123',
  signingSecret = WEBHOOK_SECRET,
}) => {
  const rawBody = JSON.stringify(event);
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(rawBody)
    .digest('hex');

  let pending = request(app)
    .post('/api/payments/razorpay-webhook')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signature);
  if (eventId) pending = pending.set('x-razorpay-event-id', eventId);
  return pending.send(rawBody);
};

describe('payment routes use durable captured-only reconciliation', () => {
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
    };
    jest.clearAllMocks();
    Booking.findById.mockResolvedValue(booking);
    Booking.updateMany.mockResolvedValue({ modifiedCount: 0 });
    PaymentAttempt.findOne.mockResolvedValue(attempt);
    mockRazorpayClient.orders.fetch.mockResolvedValue(providerOrder);
    mockRazorpayClient.payments.fetch.mockResolvedValue(providerPayment);
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: true,
      eventKey: 'event:evt_test_123',
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
    mockCreateOrReuseBookingOrder.mockResolvedValue({
      order: { ...providerOrder, status: 'created' },
      reused: false,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('new checkout initiation is off unless explicitly enabled', async () => {
    delete process.env.BOOKING_PAYMENTS_ENABLED;

    const response = await request(buildApp())
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: BOOKING_ID })
      .expect(503);

    expect(response.body.code).toBe('BOOKING_PAYMENTS_DISABLED');
    expect(Booking.findById).not.toHaveBeenCalled();
    expect(mockCreateOrReuseBookingOrder).not.toHaveBeenCalled();
  });

  test('the emergency initiation gate does not block existing payment reconciliation', async () => {
    process.env.BOOKING_PAYMENTS_ENABLED = 'false';
    await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    const redirectSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${ORDER_ID}|${PAYMENT_ID}`)
      .digest('hex');
    await request(buildApp())
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId: BOOKING_ID,
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: redirectSignature,
      })
      .expect(200);

    expect(mockCreateOrReuseBookingOrder).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'webhook' })
    );
    expect(mockReconcileCapturedBookingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'redirect_verification' })
    );
  });

  test('creates checkout only through the server-side order service', async () => {
    const response = await request(buildApp())
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: BOOKING_ID })
      .expect(200);

    expect(mockCreateOrReuseBookingOrder).toHaveBeenCalledWith(expect.objectContaining({
      booking,
      userId: USER_ID,
      client: mockRazorpayClient,
    }));
    expect(response.body.data).toMatchObject({
      orderId: ORDER_ID,
      amount: 12345,
      currency: 'INR',
      paymentMethod: 'razorpay',
    });
  });

  test('requires an unchanged raw body before webhook verification', async () => {
    const response = await request(buildApp({ rawWebhook: false }))
      .post('/api/payments/razorpay-webhook')
      .set('x-razorpay-signature', 'a'.repeat(64))
      .send({ event: 'payment.captured' })
      .expect(400);

    expect(response.body.error).toBe('Raw request body required');
    expect(mockClaimWebhookEvent).not.toHaveBeenCalled();
  });

  test('rejects an invalid webhook signature without creating a ledger event', async () => {
    await request(buildApp())
      .post('/api/payments/razorpay-webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'a'.repeat(64))
      .send(JSON.stringify({ event: 'payment.captured', payload: {} }))
      .expect(400);

    expect(mockClaimWebhookEvent).not.toHaveBeenCalled();
  });

  test('re-fetches captured payment evidence and invokes shared reconciliation', async () => {
    const event = {
      event: 'payment.captured',
      payload: { payment: { entity: providerPayment } },
    };

    const response = await sendSignedWebhook({ event }).expect(200);

    expect(mockClaimWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'event:evt_test_123',
      eventType: 'payment.captured',
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    }));
    expect(mockRazorpayClient.orders.fetch).toHaveBeenCalledWith(ORDER_ID);
    expect(mockRazorpayClient.payments.fetch).toHaveBeenCalledWith(PAYMENT_ID);
    expect(mockReconcileCapturedBookingPayment).toHaveBeenCalledWith(expect.objectContaining({
      paymentAttemptId: ATTEMPT_ID,
      order: providerOrder,
      payment: providerPayment,
      source: 'webhook',
      eventKey: 'event:evt_test_123',
      claimToken: 1,
    }));
    expect(response.body.received).toBe(true);
  });

  test('returns idempotent success for a duplicate webhook claim', async () => {
    mockClaimWebhookEvent.mockResolvedValue({ claimed: false, duplicate: true });

    const response = await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    expect(response.body).toMatchObject({ received: true, duplicate: true });
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('acknowledges a durably recorded identity conflict without provider retries', async () => {
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: false,
      duplicate: true,
      conflict: true,
      terminal: true,
      ackSafe: true,
      processingState: 'needs_review',
    });

    const response = await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    expect(response.body).toMatchObject({
      received: true,
      duplicate: true,
      reviewRequired: true,
    });
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
  });

  test('returns a retryable response for a conflict that was not durably recorded', async () => {
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: false,
      duplicate: false,
      conflict: true,
      ackSafe: false,
    });

    await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(503);

    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
  });

  test('asks the provider to retry while another delivery still holds the processing lease', async () => {
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: false,
      duplicate: false,
      inFlight: true,
      retryable: true,
      processingState: 'processing',
    });

    const response = await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(503);

    expect(response.body.error).toBe('Webhook processing in progress');
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('escalates a claimed delivery after the owner-approved retry bound', async () => {
    process.env.PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS = '2';
    mockClaimWebhookEvent.mockResolvedValue({
      claimed: true,
      reclaimed: true,
      eventKey: 'event:evt_test_123',
      claimToken: 3,
    });

    const response = await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    expect(response.body).toEqual({ received: true, reviewRequired: true });
    expect(mockFinalizeWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'event:evt_test_123',
      claimToken: 3,
      processingState: 'needs_review',
      decision: 'needs_review',
      mismatchCodes: ['WEBHOOK_RETRY_LIMIT_REACHED'],
    }));
    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('does not authorize from an order.paid event', async () => {
    const response = await sendSignedWebhook({
      event: {
        event: 'order.paid',
        payload: { order: { entity: providerOrder } },
      },
    }).expect(200);

    expect(response.body).toMatchObject({ received: true, ignored: true });
    expect(mockFinalizeWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'event:evt_test_123',
      claimToken: 1,
      processingState: 'ignored',
    }));
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('records an exact failed payment without confirming or expiring the booking', async () => {
    const failedPayment = { ...providerPayment, status: 'failed', captured: false };
    mockRazorpayClient.payments.fetch.mockResolvedValue(failedPayment);

    await sendSignedWebhook({
      event: {
        event: 'payment.failed',
        payload: { payment: { entity: failedPayment } },
      },
    }).expect(200);

    expect(mockRecordBookingPaymentFailure).toHaveBeenCalledWith(expect.objectContaining({
      paymentAttemptId: ATTEMPT_ID,
      payment: failedPayment,
      eventKey: 'event:evt_test_123',
      claimToken: 1,
    }));
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('accepts the optional previous webhook secret during planned rotation', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = PREVIOUS_WEBHOOK_SECRET;

    const response = await sendSignedWebhook({
      signingSecret: PREVIOUS_WEBHOOK_SECRET,
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(200);

    expect(response.body.received).toBe(true);
    expect(mockReconcileCapturedBookingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: 1 })
    );
    expect(JSON.stringify(response.body)).not.toContain(PREVIOUS_WEBHOOK_SECRET);
  });

  test('a previous webhook secret cannot replace a missing current secret', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = PREVIOUS_WEBHOOK_SECRET;

    const response = await sendSignedWebhook({
      signingSecret: PREVIOUS_WEBHOOK_SECRET,
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(503);

    expect(response.body).toEqual({ error: 'Webhook unavailable' });
    expect(mockClaimWebhookEvent).not.toHaveBeenCalled();
  });

  test('records processing failure only with the current claim token', async () => {
    mockRazorpayClient.orders.fetch.mockRejectedValue(new Error('provider unavailable'));

    await sendSignedWebhook({
      event: {
        event: 'payment.captured',
        payload: { payment: { entity: providerPayment } },
      },
    }).expect(503);

    expect(mockFinalizeWebhookEventFailure).toHaveBeenCalledWith({
      eventKey: 'event:evt_test_123',
      claimToken: 1,
      failureCode: 'WEBHOOK_PROCESSING_FAILED',
    });
  });

  test('redirect signature is only an entry check and provider evidence remains authoritative', async () => {
    const signature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${ORDER_ID}|${PAYMENT_ID}`)
      .digest('hex');

    await request(buildApp())
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId: BOOKING_ID,
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: signature,
      })
      .expect(200);

    expect(PaymentAttempt.findOne).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      booking: BOOKING_ID,
      user: USER_ID,
    });
    expect(mockRazorpayClient.orders.fetch).toHaveBeenCalledWith(ORDER_ID);
    expect(mockRazorpayClient.payments.fetch).toHaveBeenCalledWith(PAYMENT_ID);
    expect(mockReconcileCapturedBookingPayment).toHaveBeenCalledWith(expect.objectContaining({
      source: 'redirect_verification',
      paymentAttemptId: ATTEMPT_ID,
    }));
  });

  test('invalid redirect signatures never call the provider or reconciler', async () => {
    await request(buildApp())
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId: BOOKING_ID,
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'a'.repeat(64),
      })
      .expect(400);

    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
    expect(mockReconcileCapturedBookingPayment).not.toHaveBeenCalled();
  });

  test('order status checks local ownership before provider access', async () => {
    PaymentAttempt.findOne.mockResolvedValue(null);

    await request(buildApp())
      .get(`/api/payments/order/${ORDER_ID}/status`)
      .expect(404);

    expect(mockRazorpayClient.orders.fetch).not.toHaveBeenCalled();
  });

  test('returns the owner payment contract in major and minor units', async () => {
    Booking.findById.mockResolvedValue({
      ...booking,
      paymentStatus: 'paid',
      orderStatus: 'paid',
      paymentId: PAYMENT_ID,
      transactionId: ORDER_ID,
    });

    const response = await request(buildApp())
      .get(`/api/payments/booking/${BOOKING_ID}`)
      .expect(200);

    expect(response.body.data).toEqual({
      paymentStatus: 'paid',
      amount: 123.45,
      amountMinor: 12345,
      currency: 'INR',
      paymentMethod: 'razorpay',
      orderStatus: 'paid',
      transactionId: ORDER_ID,
    });
  });

  test('does not expose booking payment status to another user', async () => {
    Booking.findById.mockResolvedValue({
      ...booking,
      user: '64f000000000000000000099',
    });

    const response = await request(buildApp())
      .get(`/api/payments/booking/${BOOKING_ID}`)
      .expect(403);

    expect(response.body.message).toBe('Access denied');
  });

  test('subscription initiation and verification remain hard-disabled', async () => {
    process.env.SUBSCRIPTION_PAYMENTS_ENABLED = 'true';

    const createResponse = await request(buildApp())
      .post('/api/payments/create-subscription-checkout')
      .send({ subscriptionType: 'monthly' })
      .expect(503);
    const verifyResponse = await request(buildApp())
      .post('/api/payments/verify-subscription-payment')
      .send({
        subscriptionType: 'monthly',
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'a'.repeat(64),
      })
      .expect(503);

    expect(createResponse.body.code).toBe('SUBSCRIPTION_PAYMENTS_DISABLED');
    expect(verifyResponse.body.code).toBe('SUBSCRIPTION_PAYMENTS_DISABLED');
    expect(mockRazorpayClient.orders.create).not.toHaveBeenCalled();
  });
});
