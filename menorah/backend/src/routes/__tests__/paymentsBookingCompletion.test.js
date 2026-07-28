const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockBookingFindById = jest.fn();
const mockBookingFindOne = jest.fn();
const mockBookingFindOneAndUpdate = jest.fn();
const mockBookingUpdateMany = jest.fn();
const mockPaymentReceiptCreate = jest.fn();
const mockPaymentReceiptFindOne = jest.fn();
const mockRazorpayOrdersFetch = jest.fn();
const mockRazorpayPaymentsFetch = jest.fn();
const mockRazorpayOrdersCreate = jest.fn();
const mockSendBookingConfirmationEmail = jest.fn();
const mockSendBookingConfirmationSMS = jest.fn();

jest.mock('../../middleware/auth', () => ({
  verifiedPatientAuth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
}));

jest.mock('../../models/Booking', () => ({
  findById: (...args) => mockBookingFindById(...args),
  findOne: (...args) => mockBookingFindOne(...args),
  findOneAndUpdate: (...args) => mockBookingFindOneAndUpdate(...args),
  updateMany: (...args) => mockBookingUpdateMany(...args),
}));

jest.mock('../../models/PaymentReceipt', () => ({
  create: (...args) => mockPaymentReceiptCreate(...args),
  findOne: (...args) => mockPaymentReceiptFindOne(...args),
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../../models/Counsellor', () => ({
  find: jest.fn(),
}));

jest.mock('../../utils/email', () => ({
  sendBookingConfirmationEmail: (...args) => mockSendBookingConfirmationEmail(...args),
}));

jest.mock('../../utils/sms', () => ({
  sendBookingConfirmationSMS: (...args) => mockSendBookingConfirmationSMS(...args),
}));

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: {
    create: (...args) => mockRazorpayOrdersCreate(...args),
    fetch: (...args) => mockRazorpayOrdersFetch(...args),
  },
  payments: {
    fetch: (...args) => mockRazorpayPaymentsFetch(...args),
  },
})));

const paymentsRouter = require('../payments');

const bookingId = '64f000000000000000000101';
const userId = '64f000000000000000000102';
const counsellorId = '64f000000000000000000103';
const orderId = 'order_active';
const paymentId = 'pay_123';
const objectId = (value) => ({ toString: () => value });

const makePendingBooking = (overrides = {}) => ({
  _id: objectId(bookingId),
  user: objectId(userId),
  counsellor: objectId(counsellorId),
  razorpayOrderId: orderId,
  amount: 1000,
  currency: 'INR',
  status: 'pending',
  paymentStatus: 'pending',
  holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  sessionType: 'video',
  sessionDuration: 60,
  scheduledAt: new Date('2026-08-01T09:00:00.000Z'),
  ...overrides,
});

const makeConfirmedBooking = (overrides = {}) => ({
  _id: objectId(bookingId),
  user: {
    _id: objectId(userId),
    email: 'asha@example.com',
    phone: '+919999999999',
  },
  counsellor: {
    _id: objectId(counsellorId),
    user: { firstName: 'Dr', lastName: 'Rao' },
  },
  razorpayOrderId: orderId,
  amount: 1000,
  currency: 'INR',
  status: 'confirmed',
  paymentStatus: 'paid',
  paymentId,
  sessionType: 'video',
  sessionDuration: 60,
  scheduledAt: new Date('2026-08-01T09:00:00.000Z'),
  ...overrides,
});

const buildJsonApp = (io) => {
  const app = express();
  app.use(express.json());
  app.set('io', io);
  app.use('/api/payments', paymentsRouter);
  return app;
};

const buildWebhookApp = (io) => {
  const app = express();
  app.use(express.raw({ type: 'application/json' }));
  app.set('io', io);
  app.use('/api/payments', paymentsRouter);
  return app;
};

const signedWebhook = (event) => {
  const body = JSON.stringify(event);
  return {
    body,
    signature: crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex'),
  };
};

describe('booking payment completion', () => {
  const originalEnv = process.env;
  let io;
  let emit;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'rzp_test_secret',
      RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
    };
    mockAuthUser = { _id: objectId(userId), role: 'user' };
    [
      mockBookingFindById,
      mockBookingFindOne,
      mockBookingFindOneAndUpdate,
      mockBookingUpdateMany,
      mockPaymentReceiptCreate,
      mockPaymentReceiptFindOne,
      mockRazorpayOrdersFetch,
      mockRazorpayPaymentsFetch,
      mockRazorpayOrdersCreate,
      mockSendBookingConfirmationEmail,
      mockSendBookingConfirmationSMS,
    ].forEach((mock) => mock.mockReset());
    mockBookingUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mockPaymentReceiptCreate.mockResolvedValue({ _id: objectId('64f000000000000000000104') });
    mockSendBookingConfirmationEmail.mockResolvedValue(undefined);
    mockSendBookingConfirmationSMS.mockResolvedValue(undefined);
    emit = jest.fn();
    io = { to: jest.fn(() => ({ emit })) };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('client verification confirms a live order atomically, then sends its confirmation once', async () => {
    const pendingBooking = makePendingBooking();
    const confirmedBooking = makeConfirmedBooking();
    mockBookingFindById
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(makePendingBooking());
    mockBookingFindOneAndUpdate.mockResolvedValue(confirmedBooking);
    mockRazorpayOrdersFetch.mockResolvedValue({
      id: orderId,
      amount: 100000,
      notes: { bookingId, userId },
    });
    mockRazorpayPaymentsFetch.mockResolvedValue({
      id: paymentId,
      order_id: orderId,
      amount: 100000,
      currency: 'INR',
      status: 'captured',
    });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    await request(buildJsonApp(io))
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(200);

    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: pendingBooking._id,
        status: 'pending',
        paymentStatus: 'pending',
        razorpayOrderId: orderId,
        holdExpiresAt: { $gt: expect.any(Date) },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentStatus: 'paid',
          paymentId,
          transactionId: orderId,
          status: 'confirmed',
        }),
      }),
      expect.objectContaining({ new: true }),
    );
    expect(mockSendBookingConfirmationEmail).toHaveBeenCalledWith(
      'asha@example.com',
      expect.objectContaining({ counsellorName: 'Dr Rao' }),
    );
    expect(mockSendBookingConfirmationSMS).toHaveBeenCalledWith(
      '+919999999999',
      expect.any(Object),
    );
    expect(mockBookingFindOneAndUpdate.mock.invocationCallOrder[0])
      .toBeLessThan(mockSendBookingConfirmationEmail.mock.invocationCallOrder[0]);
  });

  test('does not confirm a booking for an authorized payment', async () => {
    const pendingBooking = makePendingBooking();
    mockBookingFindById.mockResolvedValue(pendingBooking);
    mockRazorpayOrdersFetch.mockResolvedValue({
      id: orderId,
      amount: 100000,
      notes: { bookingId, userId },
    });
    mockRazorpayPaymentsFetch.mockResolvedValue({
      id: paymentId,
      order_id: orderId,
      amount: 100000,
      currency: 'INR',
      status: 'authorized',
    });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    await request(buildJsonApp(io))
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(400);

    expect(mockPaymentReceiptCreate).not.toHaveBeenCalled();
    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSendBookingConfirmationEmail).not.toHaveBeenCalled();
  });

  test('resumes a live booking claim after a prior verifier left a matching receipt', async () => {
    const pendingBooking = makePendingBooking();
    const confirmedBooking = makeConfirmedBooking();
    mockBookingFindById
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(pendingBooking);
    mockBookingFindOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(confirmedBooking);
    mockRazorpayOrdersFetch.mockResolvedValue({
      id: orderId,
      amount: 100000,
      notes: { bookingId, userId },
    });
    mockRazorpayPaymentsFetch.mockResolvedValue({
      id: paymentId,
      order_id: orderId,
      amount: 100000,
      currency: 'INR',
      status: 'captured',
    });
    mockPaymentReceiptCreate
      .mockResolvedValueOnce({ _id: objectId('64f000000000000000000104') })
      .mockRejectedValueOnce({ code: 11000 });
    mockPaymentReceiptFindOne.mockResolvedValue({
      paymentId,
      orderId,
      purpose: 'booking',
      user: objectId(userId),
      booking: objectId(bookingId),
    });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    await request(buildJsonApp(io))
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(409);

    await request(buildJsonApp(io))
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(200);

    expect(mockPaymentReceiptCreate).toHaveBeenCalledTimes(2);
    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockSendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendBookingConfirmationSMS).toHaveBeenCalledTimes(1);
  });

  test('a captured webhook for an older checkout cannot confirm the newer active order', async () => {
    mockBookingFindById.mockResolvedValue(makePendingBooking({ razorpayOrderId: 'order_newer' }));
    const { body, signature } = signedWebhook({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: 'order_older',
            notes: { bookingId },
          },
        },
      },
    });

    await request(buildWebhookApp(io))
      .post('/api/payments/razorpay-webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(body)
      .expect(200);

    expect(mockBookingUpdateMany).not.toHaveBeenCalled();
    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSendBookingConfirmationEmail).not.toHaveBeenCalled();
    expect(mockSendBookingConfirmationSMS).not.toHaveBeenCalled();
  });

  test('a failed webhook records the active attempt without expiring a live retry hold', async () => {
    const pendingBooking = makePendingBooking();
    mockBookingFindById.mockResolvedValue(pendingBooking);
    mockBookingFindOneAndUpdate.mockResolvedValue(pendingBooking);
    const { body, signature } = signedWebhook({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            notes: { bookingId },
          },
        },
      },
    });

    await request(buildWebhookApp(io))
      .post('/api/payments/razorpay-webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(body)
      .expect(200);

    const [, update] = mockBookingFindOneAndUpdate.mock.calls[0];
    expect(update.$set).toEqual(expect.objectContaining({
      orderStatus: 'failed',
      paymentAttemptedAt: expect.any(Date),
    }));
    expect(update.$set).not.toHaveProperty('paymentStatus');
    expect(update.$set).not.toHaveProperty('status');
    expect(mockBookingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: pendingBooking._id, razorpayOrderId: orderId }),
      expect.any(Object),
    );
    expect(mockSendBookingConfirmationEmail).not.toHaveBeenCalled();
  });

  test('a captured webhook confirms the current order and sends the confirmation once', async () => {
    mockBookingFindById
      .mockResolvedValueOnce(makePendingBooking())
      .mockResolvedValueOnce(makePendingBooking());
    mockBookingFindOneAndUpdate.mockResolvedValue(makeConfirmedBooking());
    const { body, signature } = signedWebhook({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            notes: { bookingId },
          },
        },
      },
    });

    await request(buildWebhookApp(io))
      .post('/api/payments/razorpay-webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(body)
      .expect(200);

    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockPaymentReceiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      paymentId,
      orderId,
      purpose: 'booking',
      amount: 100000,
      currency: 'INR',
    }));
    expect(mockSendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendBookingConfirmationSMS).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('booking_confirmed', expect.objectContaining({
      paymentStatus: 'paid',
      status: 'confirmed',
    }));
  });

  test('a receipt write failure cannot suppress the one-time booking notification dispatch', async () => {
    const pendingBooking = makePendingBooking();
    const confirmedBooking = makeConfirmedBooking();
    mockBookingFindById
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(makeConfirmedBooking({
        user: objectId(userId),
        counsellor: objectId(counsellorId),
      }));
    mockBookingFindOneAndUpdate.mockResolvedValueOnce(confirmedBooking);
    mockPaymentReceiptCreate.mockRejectedValueOnce(new Error('temporary receipt-store failure'));

    const { body, signature } = signedWebhook({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            notes: { bookingId },
          },
        },
      },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await request(buildWebhookApp(io))
        .post('/api/payments/razorpay-webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(body)
        .expect(500);

      expect(mockSendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(mockSendBookingConfirmationSMS).toHaveBeenCalledTimes(1);

      await request(buildWebhookApp(io))
        .post('/api/payments/razorpay-webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(body)
        .expect(200);
    } finally {
      errorSpy.mockRestore();
    }

    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockPaymentReceiptCreate).toHaveBeenCalledTimes(2);
    expect(mockSendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendBookingConfirmationSMS).toHaveBeenCalledTimes(1);
  });

  test('an order.paid receipt write failure cannot suppress the one-time booking notification dispatch', async () => {
    const pendingBooking = makePendingBooking();
    const confirmedBooking = makeConfirmedBooking();
    mockBookingFindOne
      .mockResolvedValueOnce(pendingBooking)
      .mockResolvedValueOnce(makeConfirmedBooking({
        user: objectId(userId),
        counsellor: objectId(counsellorId),
      }));
    mockBookingFindById.mockResolvedValueOnce(pendingBooking);
    mockBookingFindOneAndUpdate.mockResolvedValueOnce(confirmedBooking);
    mockPaymentReceiptCreate.mockRejectedValueOnce(new Error('temporary receipt-store failure'));

    const { body, signature } = signedWebhook({
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: orderId,
            payment_id: paymentId,
            amount: 100000,
            currency: 'INR',
            notes: { bookingId },
          },
        },
      },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await request(buildWebhookApp(io))
        .post('/api/payments/razorpay-webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(body)
        .expect(500);

      expect(mockSendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(mockSendBookingConfirmationSMS).toHaveBeenCalledTimes(1);

      await request(buildWebhookApp(io))
        .post('/api/payments/razorpay-webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(body)
        .expect(200);
    } finally {
      errorSpy.mockRestore();
    }

    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockPaymentReceiptCreate).toHaveBeenCalledTimes(2);
    expect(mockSendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendBookingConfirmationSMS).toHaveBeenCalledTimes(1);
  });

  test('a duplicate captured webhook records a missing booking receipt without reconfirming', async () => {
    const confirmedBooking = makeConfirmedBooking({
      user: objectId(userId),
      counsellor: objectId(counsellorId),
    });
    mockBookingFindById.mockResolvedValue(confirmedBooking);
    const { body, signature } = signedWebhook({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 100000,
            currency: 'INR',
            notes: { bookingId },
          },
        },
      },
    });

    await request(buildWebhookApp(io))
      .post('/api/payments/razorpay-webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(body)
      .expect(200);

    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockPaymentReceiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      paymentId,
      orderId,
      purpose: 'booking',
      amount: 100000,
      currency: 'INR',
    }));
    expect(mockSendBookingConfirmationEmail).not.toHaveBeenCalled();
    expect(mockSendBookingConfirmationSMS).not.toHaveBeenCalled();
  });
});
