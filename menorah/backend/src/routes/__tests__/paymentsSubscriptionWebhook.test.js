const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockBookingFindById = jest.fn();
const mockBookingFindOne = jest.fn();
const mockBookingFindOneAndUpdate = jest.fn();
const mockBookingUpdateMany = jest.fn();
const mockPaymentReceiptCreate = jest.fn();
const mockPaymentReceiptFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockRazorpayOrdersFetch = jest.fn();
const mockRazorpayPaymentsFetch = jest.fn();
let mockAuthUser;

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
  findById: (...args) => mockUserFindById(...args),
}));

jest.mock('../../utils/email', () => ({
  sendBookingConfirmationEmail: jest.fn(),
}));

jest.mock('../../utils/sms', () => ({
  sendBookingConfirmationSMS: jest.fn(),
}));

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: {
    fetch: (...args) => mockRazorpayOrdersFetch(...args),
  },
  payments: {
    fetch: (...args) => mockRazorpayPaymentsFetch(...args),
  },
})));

const paymentsRouter = require('../payments');

const userId = '64f000000000000000000102';
const anotherUserId = '64f000000000000000000103';
const orderId = 'order_subscription_monthly';
const paymentId = 'pay_subscription_monthly';
const paymentCreatedAt = 1780000000;

const objectId = (value) => ({ toString: () => value });

const makeUser = (overrides = {}) => ({
  _id: objectId(userId),
  role: 'user',
  isActive: true,
  subscription: {
    plan: 'free',
    subscriptionType: null,
    startDate: null,
    endDate: null,
    isActive: false,
  },
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeOrder = (overrides = {}) => ({
  id: orderId,
  payment_id: paymentId,
  status: 'paid',
  amount: 150000,
  currency: 'INR',
  notes: {
    type: 'subscription',
    userId,
    subscriptionType: 'monthly',
  },
  ...overrides,
});

const makePayment = (overrides = {}) => ({
  id: paymentId,
  order_id: orderId,
  status: 'captured',
  amount: 150000,
  currency: 'INR',
  created_at: paymentCreatedAt,
  notes: {
    type: 'subscription',
    userId,
    subscriptionType: 'monthly',
  },
  ...overrides,
});

const buildWebhookApp = () => {
  const app = express();
  app.use(express.raw({ type: 'application/json' }));
  app.use('/api/payments', paymentsRouter);
  return app;
};

const buildJsonApp = () => {
  const app = express();
  app.use(express.json());
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

const postWebhook = (event) => {
  const { body, signature } = signedWebhook(event);
  return request(buildWebhookApp())
    .post('/api/payments/razorpay-webhook')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signature)
    .send(body);
};

describe('subscription payment webhook recovery', () => {
  const originalEnv = process.env;
  let warnSpy;

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
      mockUserFindById,
      mockRazorpayOrdersFetch,
      mockRazorpayPaymentsFetch,
    ].forEach((mock) => mock.mockReset());
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockBookingFindOne.mockResolvedValue(null);
    mockPaymentReceiptCreate.mockResolvedValue({ _id: objectId('64f000000000000000000104') });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('activates a subscription from a signed payment.captured event after authoritative validation', async () => {
    const user = makeUser();
    mockUserFindById.mockResolvedValue(user);
    mockRazorpayOrdersFetch.mockResolvedValue(makeOrder());
    mockRazorpayPaymentsFetch.mockResolvedValue(makePayment());

    await postWebhook({
      event: 'payment.captured',
      payload: { payment: { entity: makePayment() } },
    }).expect(200);

    expect(mockRazorpayOrdersFetch).toHaveBeenCalledWith(orderId);
    expect(mockRazorpayPaymentsFetch).toHaveBeenCalledWith(paymentId);
    expect(mockPaymentReceiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      paymentId,
      orderId,
      purpose: 'subscription',
      user: user._id,
      amount: 150000,
      currency: 'INR',
    }));
    expect(user.subscription).toEqual({
      plan: 'premium',
      subscriptionType: 'monthly',
      startDate: new Date(paymentCreatedAt * 1000),
      endDate: new Date((paymentCreatedAt + 30 * 24 * 60 * 60) * 1000),
      isActive: true,
    });
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  test('supports a signed order.paid event when the payment callback did not arrive', async () => {
    const user = makeUser();
    mockUserFindById.mockResolvedValue(user);
    mockRazorpayOrdersFetch.mockResolvedValue(makeOrder());
    mockRazorpayPaymentsFetch.mockResolvedValue(makePayment());

    await postWebhook({
      event: 'order.paid',
      payload: { order: { entity: makeOrder() } },
    }).expect(200);

    expect(mockPaymentReceiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'subscription',
      paymentId,
      orderId,
    }));
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  test('does not replace a subscription that already covers a matching receipt', async () => {
    const user = makeUser({
      subscription: {
        plan: 'premium',
        subscriptionType: 'monthly',
        startDate: new Date(paymentCreatedAt * 1000),
        endDate: new Date((paymentCreatedAt + 31 * 24 * 60 * 60) * 1000),
        isActive: true,
      },
    });
    mockUserFindById.mockResolvedValue(user);
    mockRazorpayOrdersFetch.mockResolvedValue(makeOrder());
    mockRazorpayPaymentsFetch.mockResolvedValue(makePayment());
    mockPaymentReceiptCreate.mockRejectedValue({ code: 11000 });
    mockPaymentReceiptFindOne.mockResolvedValue({
      paymentId,
      orderId,
      purpose: 'subscription',
      user: objectId(userId),
    });

    await postWebhook({
      event: 'payment.captured',
      payload: { payment: { entity: makePayment() } },
    }).expect(200);

    expect(user.save).not.toHaveBeenCalled();
  });

  test('recovers a matching receipt when the prior subscription save failed', async () => {
    const failedUser = makeUser({
      save: jest.fn().mockRejectedValue(new Error('temporary user-store failure')),
    });
    const recoveredUser = makeUser();
    mockUserFindById
      .mockResolvedValueOnce(failedUser)
      .mockResolvedValueOnce(recoveredUser);
    mockRazorpayOrdersFetch.mockResolvedValue(makeOrder());
    mockRazorpayPaymentsFetch.mockResolvedValue(makePayment());
    mockPaymentReceiptCreate
      .mockResolvedValueOnce({ _id: objectId('64f000000000000000000104') })
      .mockRejectedValueOnce({ code: 11000 });
    mockPaymentReceiptFindOne.mockResolvedValue({
      paymentId,
      orderId,
      purpose: 'subscription',
      user: objectId(userId),
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await postWebhook({
        event: 'payment.captured',
        payload: { payment: { entity: makePayment() } },
      }).expect(500);

      await postWebhook({
        event: 'payment.captured',
        payload: { payment: { entity: makePayment() } },
      }).expect(200);
    } finally {
      errorSpy.mockRestore();
    }

    expect(failedUser.save).toHaveBeenCalledTimes(1);
    expect(recoveredUser.save).toHaveBeenCalledTimes(1);
    expect(recoveredUser.subscription).toEqual({
      plan: 'premium',
      subscriptionType: 'monthly',
      startDate: new Date(paymentCreatedAt * 1000),
      endDate: new Date((paymentCreatedAt + 30 * 24 * 60 * 60) * 1000),
      isActive: true,
    });
  });

  test('recovers a matching receipt through the authenticated subscription verifier', async () => {
    const failedUser = makeUser({
      save: jest.fn().mockRejectedValue(new Error('temporary user-store failure')),
    });
    const recoveredUser = makeUser();
    mockUserFindById
      .mockResolvedValueOnce(failedUser)
      .mockResolvedValueOnce(recoveredUser);
    mockRazorpayOrdersFetch.mockResolvedValue(makeOrder());
    mockRazorpayPaymentsFetch.mockResolvedValue(makePayment());
    mockPaymentReceiptCreate
      .mockResolvedValueOnce({ _id: objectId('64f000000000000000000104') })
      .mockRejectedValueOnce({ code: 11000 });
    mockPaymentReceiptFindOne.mockResolvedValue({
      paymentId,
      orderId,
      purpose: 'subscription',
      user: objectId(userId),
    });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const payload = {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      subscriptionType: 'monthly',
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await request(buildJsonApp())
        .post('/api/payments/verify-subscription-payment')
        .send(payload)
        .expect(500);

      await request(buildJsonApp())
        .post('/api/payments/verify-subscription-payment')
        .send(payload)
        .expect(200);
    } finally {
      errorSpy.mockRestore();
    }

    expect(failedUser.save).toHaveBeenCalledTimes(1);
    expect(recoveredUser.save).toHaveBeenCalledTimes(1);
    expect(recoveredUser.subscription).toEqual({
      plan: 'premium',
      subscriptionType: 'monthly',
      startDate: new Date(paymentCreatedAt * 1000),
      endDate: new Date((paymentCreatedAt + 30 * 24 * 60 * 60) * 1000),
      isActive: true,
    });
  });

  test('rejects a signed subscription event when the amount, owner, or type does not match the fetched order', async () => {
    const user = makeUser();
    mockUserFindById.mockResolvedValue(user);
    mockRazorpayPaymentsFetch.mockResolvedValue(makePayment());

    const invalidOrders = [
      makeOrder({ amount: 149999 }),
      makeOrder({ notes: { type: 'subscription', userId: anotherUserId, subscriptionType: 'monthly' } }),
      makeOrder({ notes: { type: 'booking', userId, subscriptionType: 'monthly' } }),
    ];

    for (const invalidOrder of invalidOrders) {
      mockRazorpayOrdersFetch.mockResolvedValueOnce(invalidOrder);
      await postWebhook({
        event: 'payment.captured',
        payload: { payment: { entity: makePayment() } },
      }).expect(200);
    }

    expect(mockPaymentReceiptCreate).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });
});
