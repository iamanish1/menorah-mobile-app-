const express = require('express');
const request = require('supertest');

const mockSave = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = {
      _id: '64f000000000000000000001',
      role: 'user',
      email: 'user@example.test',
      phone: '+910000000000',
    };
    next();
  },
  authAny: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000001', role: 'user' };
    next();
  },
}));

jest.mock('../../models/Booking', () => {
  const BookingModel = jest.fn((data) => ({
    _id: '64f000000000000000000010',
    ...data,
    videoCall: {},
    save: mockSave,
  }));
  BookingModel.find = jest.fn();
  BookingModel.findById = jest.fn();
  BookingModel.findOne = jest.fn();
  BookingModel.exists = jest.fn();
  BookingModel.countDocuments = jest.fn();
  return BookingModel;
});

jest.mock('../../models/Counsellor', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../../utils/email', () => ({
  sendBookingConfirmationEmail: jest.fn(),
  sendSessionReminderEmail: jest.fn(),
}));

jest.mock('../../utils/sms', () => ({
  sendBookingConfirmationSMS: jest.fn(),
  sendSessionReminderSMS: jest.fn(),
  sendCancellationSMS: jest.fn(),
}));

jest.mock('../../services/callPolicyService', () => ({
  isAllowedExternalProvider: jest.fn(() => true),
  isSafeHttpsUrl: jest.fn(() => true),
  normalizeProvider: jest.fn((provider) => provider),
  providerDisplayName: jest.fn((provider) => provider),
  resolveCallPolicy: jest.fn(() => ({
    provider: 'livekit',
    joinMode: 'in_app',
    region: 'IN',
    reason: 'allowed',
  })),
}));

const Booking = require('../../models/Booking');
const User = require('../../models/User');
const bookingsRouter = require('../bookings');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', bookingsRouter);
  return app;
};

const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const validRequest = () => ({
  serviceCode: 'basic',
  sessionType: 'video',
  sessionDuration: 45,
  scheduledAt: futureDate(),
});

describe('booking route server-controlled pricing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BOOKING_SERVICE_CATALOG_JSON: JSON.stringify({
        basic: {
          durationMinutes: 45,
          amountMinor: 123456,
          currency: 'INR',
        },
      }),
    };
    Booking.mockClear();
    mockSave.mockReset().mockResolvedValue(undefined);
    User.findById.mockReset().mockResolvedValue({ subscription: null });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('persists the exact amount from the server catalog', async () => {
    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validRequest())
      .expect(201);

    expect(response.body.data.booking).toMatchObject({
      amount: 1234.56,
      currency: 'INR',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      pricingSource: 'service_catalog',
    });
    expect(Booking).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1234.56,
      amountMinor: 123456,
      currency: 'INR',
      pricing: expect.objectContaining({
        source: 'service_catalog',
        serviceCode: 'basic',
        listAmountMinor: 123456,
      }),
      bookingAuthorization: {
        kind: 'payment',
        status: 'pending',
      },
    }));
  });

  test.each([
    ['amount', 1],
    ['amount', 0],
    ['amount', -1],
    ['price', 1],
    ['currency', 'USD'],
    ['promoCode', 'FORGED-FREE'],
    ['discountCode', 'FORGED-DISCOUNT'],
    ['paymentStatus', 'paid'],
    ['bookingAuthorization', { kind: 'payment', status: 'authorized' }],
    ['isFree', true],
  ])('rejects client-controlled %s before creating a booking', async (field, value) => {
    const response = await request(buildApp())
      .post('/api/bookings')
      .send({ ...validRequest(), [field]: value })
      .expect(400);

    expect(response.body.code).toBe('CLIENT_PRICING_FIELD_FORBIDDEN');
    expect(Booking).not.toHaveBeenCalled();
  });

  test('rejects a forged or unknown service code', async () => {
    const response = await request(buildApp())
      .post('/api/bookings')
      .send({ ...validRequest(), serviceCode: 'free-session' })
      .expect(400);

    expect(response.body.code).toBe('SERVICE_NOT_CONFIGURED');
    expect(Booking).not.toHaveBeenCalled();
  });

  test('fails safely when server pricing is missing', async () => {
    delete process.env.BOOKING_SERVICE_CATALOG_JSON;

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validRequest())
      .expect(503);

    expect(response.body.code).toBe('SERVICE_CATALOG_REQUIRED');
    expect(Booking).not.toHaveBeenCalled();
  });

  test('allows zero payment only for a complete active subscription entitlement', async () => {
    const now = Date.now();
    User.findById.mockResolvedValue({
      subscription: {
        plan: 'premium',
        subscriptionType: 'monthly',
        isActive: true,
        startDate: new Date(now - 60_000),
        endDate: new Date(now + 60_000),
      },
    });

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validRequest())
      .expect(201);

    expect(response.body.data.booking).toMatchObject({
      amount: 0,
      paymentStatus: 'paid',
      paymentMethod: 'subscription',
      isSubscriptionBooking: true,
    });
    expect(Booking).toHaveBeenCalledWith(expect.objectContaining({
      amount: 0,
      amountMinor: 0,
      status: 'confirmed',
      pricing: expect.objectContaining({ listAmountMinor: 123456 }),
      bookingAuthorization: expect.objectContaining({
        kind: 'subscription_entitlement',
        status: 'authorized',
      }),
    }));
  });

  test.each([
    { plan: 'free', subscriptionType: 'monthly', isActive: true },
    { plan: 'premium', subscriptionType: null, isActive: true },
    { plan: 'premium', subscriptionType: 'monthly', isActive: false },
  ])('does not grant a free booking for an incomplete entitlement (%p)', async (subscription) => {
    const now = Date.now();
    User.findById.mockResolvedValue({
      subscription: {
        ...subscription,
        startDate: new Date(now - 60_000),
        endDate: new Date(now + 60_000),
      },
    });

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validRequest())
      .expect(201);

    expect(response.body.data.booking).toMatchObject({
      amount: 1234.56,
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      isSubscriptionBooking: false,
    });
  });
});
