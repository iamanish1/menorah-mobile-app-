const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const {
  installCounsellorVerificationTestConfig,
  withCurrentProfessionalApproval,
} = require('../../testUtils/counsellorVerification');

installCounsellorVerificationTestConfig();

const mockSave = jest.fn();
const mockWithTransaction = jest.fn();
const mockEndSession = jest.fn();
const mockSession = {
  withTransaction: mockWithTransaction,
  endSession: mockEndSession,
};
const startSessionSpy = jest.spyOn(mongoose, 'startSession');

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
  BookingModel.findOneAndUpdate = jest.fn();
  BookingModel.updateMany = jest.fn();
  BookingModel.exists = jest.fn();
  BookingModel.countDocuments = jest.fn();
  return BookingModel;
});

jest.mock('../../models/Counsellor', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
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
const Counsellor = require('../../models/Counsellor');
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
const directCounsellor = (overrides = {}) => withCurrentProfessionalApproval({
  _id: '64f000000000000000000020',
  timezone: 'UTC',
  hourlyRate: 1200,
  currency: 'INR',
  availability: {
    thursday: { isAvailable: true, start: '00:00', end: '23:59' },
  },
  user: {
    _id: '64f000000000000000000021',
    firstName: 'Test',
    lastName: 'Counsellor',
  },
  ...overrides,
}, { populateUser: true });
const validDirectRequest = () => ({
  counsellorId: '64f000000000000000000020',
  sessionType: 'video',
  sessionDuration: 45,
  scheduledAt: '2099-01-15T10:00:00.000Z',
});
const paidRazorpayBooking = (overrides = {}) => ({
  _id: '64f000000000000000000010',
  user: '64f000000000000000000001',
  status: 'confirmed',
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  isSubscriptionBooking: false,
  paymentId: 'pay_test_123',
  razorpayOrderId: 'order_test_123',
  transactionId: 'order_test_123',
  orderStatus: 'paid',
  amount: 1234.56,
  amountMinor: 123456,
  currency: 'INR',
  pricing: {
    listAmountMinor: 123456,
    currency: 'INR',
  },
  bookingAuthorization: {
    kind: 'payment',
    status: 'authorized',
    reference: 'pay_test_123',
    authorizedAt: new Date(Date.now() - 60_000),
  },
  ...overrides,
});

describe('booking route server-controlled pricing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BOOKING_PAYMENTS_ENABLED: 'true',
      PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS: '5',
      BOOKING_SERVICE_CATALOG_JSON: JSON.stringify({
        basic: {
          durationMinutes: 45,
          amountMinor: 123456,
          currency: 'INR',
        },
      }),
    };
    Booking.mockClear();
    Booking.findById.mockReset();
    Booking.find.mockReset();
    Booking.findOneAndUpdate.mockReset();
    Booking.updateMany.mockReset().mockResolvedValue({ modifiedCount: 0 });
    Booking.countDocuments.mockReset();
    Counsellor.findById.mockReset();
    Counsellor.findOneAndUpdate.mockReset();
    mockSave.mockReset().mockResolvedValue(undefined);
    User.findById.mockReset().mockResolvedValue({ subscription: null });
    User.findOneAndUpdate.mockReset();
    mockWithTransaction.mockReset().mockImplementation(async (operation) => operation());
    mockEndSession.mockReset().mockResolvedValue(undefined);
    startSessionSpy.mockReset().mockResolvedValue(mockSession);
  });

  afterAll(() => {
    process.env = originalEnv;
    startSessionSpy.mockRestore();
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

  test('does not create a payable booking while payment initiation is disabled', async () => {
    process.env.BOOKING_PAYMENTS_ENABLED = 'false';

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validRequest())
      .expect(503);

    expect(response.body.code).toBe('BOOKING_PAYMENTS_DISABLED');
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

  test('fences direct booking eligibility, account state, pricing, and conflicts in one transaction', async () => {
    const counsellor = directCounsellor();
    Counsellor.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(counsellor),
    });
    Counsellor.findOneAndUpdate.mockResolvedValue(counsellor);
    User.findOneAndUpdate.mockResolvedValue({
      _id: counsellor.user._id,
      role: 'counsellor',
      isActive: true,
    });

    const initialConflictQuery = {
      lean: jest.fn().mockResolvedValue([]),
    };
    const transactionConflictQuery = {
      session: jest.fn(),
      lean: jest.fn().mockResolvedValue([]),
    };
    transactionConflictQuery.session.mockReturnValue(transactionConflictQuery);
    Booking.find
      .mockReturnValueOnce(initialConflictQuery)
      .mockReturnValueOnce(transactionConflictQuery);

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validDirectRequest())
      .expect(201);

    expect(response.body.data.booking).toMatchObject({
      amount: 900,
      currency: 'INR',
      pricingSource: 'counsellor_rate',
    });
    expect(startSessionSpy).toHaveBeenCalledTimes(1);
    expect(mockWithTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      }
    );
    expect(Counsellor.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: counsellor._id,
        user: counsellor.user._id,
        hourlyRate: 1200,
        currency: 'INR',
        status: 'approved',
        isActive: true,
        isAvailable: true,
        'professionalVerification.legacyReviewRequired': false,
        'professionalVerification.expiresAt': {
          $type: 'date',
          $gt: expect.any(Date),
        },
      }),
      {
        $inc: { 'professionalVerification.marketplaceAssignmentFence': 1 },
      },
      {
        new: true,
        runValidators: true,
        session: mockSession,
      }
    );
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: counsellor.user._id,
        role: 'counsellor',
        isActive: true,
      },
      {
        $inc: { marketplaceAssignmentFence: 1 },
      },
      {
        new: true,
        runValidators: true,
        session: mockSession,
      }
    );
    expect(transactionConflictQuery.session).toHaveBeenCalledWith(mockSession);
    expect(mockSave).toHaveBeenCalledWith({ session: mockSession });
    expect(mockEndSession).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      name: 'professional eligibility changes',
      fencedCounsellor: null,
      fencedAccount: null,
      expectedMessage: /eligibility or pricing changed/i,
    },
    {
      name: 'linked account role or active state changes',
      fencedCounsellor: directCounsellor(),
      fencedAccount: null,
      expectedMessage: /account changed/i,
    },
  ])('aborts cleanly when $name during direct booking', async ({
    fencedCounsellor,
    fencedAccount,
    expectedMessage,
  }) => {
    const counsellor = directCounsellor();
    Counsellor.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(counsellor),
    });
    Counsellor.findOneAndUpdate.mockResolvedValue(fencedCounsellor);
    User.findOneAndUpdate.mockResolvedValue(fencedAccount);
    Booking.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validDirectRequest())
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      code: 'COUNSELLOR_NOT_ELIGIBLE',
    });
    expect(response.body.message).toMatch(expectedMessage);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockEndSession).toHaveBeenCalledTimes(1);
  });

  test('aborts when pricing changes inside the direct-booking transaction', async () => {
    const counsellor = directCounsellor();
    Counsellor.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(counsellor),
    });
    Counsellor.findOneAndUpdate.mockResolvedValue(directCounsellor({
      hourlyRate: 1600,
    }));
    User.findOneAndUpdate.mockResolvedValue({
      _id: counsellor.user._id,
      role: 'counsellor',
      isActive: true,
    });
    Booking.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validDirectRequest())
      .expect(409);

    expect(response.body.code).toBe('COUNSELLOR_PRICING_CHANGED');
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('aborts when counsellor working hours change inside the transaction', async () => {
    const counsellor = directCounsellor();
    Counsellor.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(counsellor),
    });
    Counsellor.findOneAndUpdate.mockResolvedValue(directCounsellor({
      availability: {
        thursday: { isAvailable: false, start: '00:00', end: '23:59' },
      },
    }));
    User.findOneAndUpdate.mockResolvedValue({
      _id: counsellor.user._id,
      role: 'counsellor',
      isActive: true,
    });
    Booking.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validDirectRequest())
      .expect(409);

    expect(response.body.code).toBe('COUNSELLOR_SCHEDULE_CHANGED');
    expect(Booking.find).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('aborts when an overlapping booking appears inside the transaction', async () => {
    const counsellor = directCounsellor();
    Counsellor.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(counsellor),
    });
    Counsellor.findOneAndUpdate.mockResolvedValue(counsellor);
    User.findOneAndUpdate.mockResolvedValue({
      _id: counsellor.user._id,
      role: 'counsellor',
      isActive: true,
    });

    const initialConflictQuery = {
      lean: jest.fn().mockResolvedValue([]),
    };
    const transactionConflictQuery = {
      session: jest.fn(),
      lean: jest.fn().mockResolvedValue([{
        scheduledAt: new Date('2099-01-15T09:30:00.000Z'),
        sessionDuration: 60,
        status: 'confirmed',
        paymentStatus: 'paid',
      }]),
    };
    transactionConflictQuery.session.mockReturnValue(transactionConflictQuery);
    Booking.find
      .mockReturnValueOnce(initialConflictQuery)
      .mockReturnValueOnce(transactionConflictQuery);

    const response = await request(buildApp())
      .post('/api/bookings')
      .send(validDirectRequest())
      .expect(409);

    expect(response.body.code).toBe('SLOT_BOOKED');
    expect(transactionConflictQuery.session).toHaveBeenCalledWith(mockSession);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('keeps unassigned booking creation outside the direct-booking transaction', async () => {
    await request(buildApp())
      .post('/api/bookings')
      .send(validRequest())
      .expect(201);

    expect(startSessionSpy).not.toHaveBeenCalled();
    expect(Counsellor.findOneAndUpdate).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith();
  });

  test('rejects a direct session whose end falls outside counsellor working hours', async () => {
    Counsellor.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(withCurrentProfessionalApproval({
        _id: '64f000000000000000000020',
        isActive: true,
        isVerified: true,
        timezone: 'UTC',
        hourlyRate: 1200,
        currency: 'INR',
        availability: {
          thursday: { isAvailable: true, start: '09:00', end: '12:00' },
        },
        user: {
          _id: '64f000000000000000000020',
          firstName: 'Test',
          lastName: 'Counsellor',
        },
      }, { populateUser: true })),
    });

    const response = await request(buildApp())
      .post('/api/bookings')
      .send({
        counsellorId: '64f000000000000000000020',
        sessionType: 'video',
        sessionDuration: 60,
        scheduledAt: '2099-01-15T11:30:00.000Z',
      })
      .expect(400);

    expect(response.body.message).toMatch(/outside counsellor's working hours/);
    expect(Booking.find).not.toHaveBeenCalled();
    expect(Booking).not.toHaveBeenCalled();
  });

  test('detects a longer earlier booking and includes expired payment reviews in conflict candidates', async () => {
    Counsellor.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(withCurrentProfessionalApproval({
        _id: '64f000000000000000000020',
        isActive: true,
        isVerified: true,
        timezone: 'UTC',
        hourlyRate: 1200,
        currency: 'INR',
        availability: {
          thursday: { isAvailable: true, start: '00:00', end: '23:59' },
        },
        user: {
          _id: '64f000000000000000000020',
          firstName: 'Test',
          lastName: 'Counsellor',
        },
      }, { populateUser: true })),
    });
    Booking.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{
        _id: '64f000000000000000000099',
        counsellor: '64f000000000000000000020',
        scheduledAt: new Date('2099-01-15T08:30:00.000Z'),
        sessionDuration: 120,
        status: 'expired',
        paymentStatus: 'pending',
        paymentMethod: 'razorpay',
        bookingAuthorization: { kind: 'payment', status: 'needs_review' },
      }]),
    });

    const response = await request(buildApp())
      .post('/api/bookings')
      .send({
        counsellorId: '64f000000000000000000020',
        sessionType: 'video',
        sessionDuration: 45,
        scheduledAt: '2099-01-15T10:00:00.000Z',
      })
      .expect(400);

    expect(response.body.code).toBe('SLOT_BOOKED');
    expect(Booking.find).toHaveBeenCalledWith(expect.objectContaining({
      scheduledAt: {
        $gte: new Date('2099-01-15T07:00:00.000Z'),
        $lt: new Date('2099-01-15T10:45:00.000Z'),
      },
      $or: expect.arrayContaining([
        expect.objectContaining({
          'bookingAuthorization.status': 'needs_review',
        }),
      ]),
    }));
    expect(Booking).not.toHaveBeenCalled();
  });

  test('includes payment holds and expired review quarantines in the user booking list', async () => {
    const reviewBooking = {
      _id: '64f000000000000000000010',
      counsellor: null,
      sessionType: 'video',
      sessionDuration: 45,
      scheduledAt: new Date('2099-01-15T10:00:00.000Z'),
      status: 'expired',
      amount: 1200,
      currency: 'INR',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'needs_review' },
      holdExpiresAt: new Date('2099-01-15T09:00:00.000Z'),
      isSubscriptionBooking: false,
      createdAt: new Date('2099-01-14T10:00:00.000Z'),
    };
    const findQuery = {};
    findQuery.populate = jest.fn(() => findQuery);
    findQuery.sort = jest.fn(() => findQuery);
    findQuery.skip = jest.fn(() => findQuery);
    findQuery.limit = jest.fn(() => findQuery);
    findQuery.lean = jest.fn().mockResolvedValue([reviewBooking]);
    Booking.find.mockReturnValue(findQuery);
    Booking.countDocuments.mockResolvedValue(1);

    const response = await request(buildApp())
      .get('/api/bookings?status=pending,confirmed')
      .expect(200);

    const query = Booking.find.mock.calls[0][0];
    expect(query).not.toHaveProperty('$nor');
    expect(query.$or).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: { $in: ['pending', 'confirmed'] } }),
      expect.objectContaining({
        paymentMethod: 'razorpay',
        'bookingAuthorization.status': 'needs_review',
      }),
    ]));
    expect(response.body.data.bookings[0]).toMatchObject({
      id: reviewBooking._id,
      status: 'expired',
      paymentReviewRequired: true,
      paymentAction: 'contact_support',
      canBeCancelled: false,
      canBeRescheduled: false,
      videoCall: {
        provider: 'disabled',
        joinMode: 'disabled',
        status: 'disabled',
      },
    });
  });

  test('presents a paid booking with missing strict authorization as support-only in the list', async () => {
    const booking = paidRazorpayBooking({
      bookingAuthorization: undefined,
      counsellor: null,
      sessionType: 'video',
      sessionDuration: 45,
      scheduledAt: new Date('2099-01-15T10:00:00.000Z'),
      videoCall: {
        provider: 'livekit',
        joinMode: 'in_app',
        status: 'ready',
        roomUrl: 'https://sessions.example.test/room',
      },
      canBeCancelled: true,
      canBeRescheduled: true,
    });
    const findQuery = {};
    findQuery.populate = jest.fn(() => findQuery);
    findQuery.sort = jest.fn(() => findQuery);
    findQuery.skip = jest.fn(() => findQuery);
    findQuery.limit = jest.fn(() => findQuery);
    findQuery.lean = jest.fn().mockResolvedValue([booking]);
    Booking.find.mockReturnValue(findQuery);
    Booking.countDocuments.mockResolvedValue(1);

    const response = await request(buildApp())
      .get('/api/bookings?status=pending,confirmed')
      .expect(200);

    expect(response.body.data.bookings[0]).toMatchObject({
      paymentStatus: 'paid',
      paymentReviewRequired: true,
      paymentAction: 'contact_support',
      canBeCancelled: false,
      canBeRescheduled: false,
      videoCall: {
        provider: 'disabled',
        joinMode: 'disabled',
        status: 'disabled',
      },
    });
    expect(response.body.data.bookings[0].videoCall).not.toHaveProperty('roomUrl');
  });

  test('presents a paid booking with mismatched strict authorization as support-only in detail', async () => {
    const booking = paidRazorpayBooking({
      bookingAuthorization: {
        kind: 'payment',
        status: 'authorized',
        reference: 'pay_different',
        authorizedAt: new Date(Date.now() - 60_000),
      },
      user: {
        _id: '64f000000000000000000001',
        firstName: 'Test',
        lastName: 'User',
      },
      counsellor: {
        specialization: 'Therapy',
        user: {
          _id: '64f000000000000000000020',
          firstName: 'Test',
          lastName: 'Counsellor',
        },
      },
      sessionType: 'video',
      sessionDuration: 45,
      scheduledAt: new Date('2099-01-15T10:00:00.000Z'),
      videoCall: {
        provider: 'livekit',
        joinMode: 'in_app',
        status: 'ready',
        roomUrl: 'https://sessions.example.test/room',
      },
      canBeCancelled: true,
      canBeRescheduled: true,
    });
    const findByIdQuery = {};
    findByIdQuery.populate = jest.fn(() => findByIdQuery);
    findByIdQuery.lean = jest.fn().mockResolvedValue(booking);
    Booking.findById.mockReturnValue(findByIdQuery);

    const response = await request(buildApp())
      .get('/api/bookings/64f000000000000000000010')
      .expect(200);

    expect(response.body.data.booking).toMatchObject({
      paymentStatus: 'paid',
      paymentReviewRequired: true,
      paymentAction: 'contact_support',
      canBeCancelled: false,
      canBeRescheduled: false,
      videoCall: {
        provider: 'disabled',
        joinMode: 'disabled',
        status: 'disabled',
      },
    });
    expect(response.body.data.booking.videoCall).not.toHaveProperty('roomUrl');
  });

  test('keeps paid booking access but does not advertise automatic cancellation', async () => {
    const booking = paidRazorpayBooking({
      user: {
        _id: '64f000000000000000000001',
        firstName: 'Test',
        lastName: 'User',
      },
      counsellor: {
        specialization: 'Therapy',
        user: {
          _id: '64f000000000000000000020',
          firstName: 'Test',
          lastName: 'Counsellor',
        },
      },
      sessionType: 'video',
      sessionDuration: 45,
      scheduledAt: new Date('2099-01-15T10:00:00.000Z'),
      videoCall: {
        provider: 'livekit',
        joinMode: 'in_app',
        status: 'ready',
        roomUrl: 'https://sessions.example.test/room',
      },
      canBeCancelled: true,
      canBeRescheduled: true,
    });
    const findByIdQuery = {};
    findByIdQuery.populate = jest.fn(() => findByIdQuery);
    findByIdQuery.lean = jest.fn().mockResolvedValue(booking);
    Booking.findById.mockReturnValue(findByIdQuery);

    const response = await request(buildApp())
      .get('/api/bookings/64f000000000000000000010')
      .expect(200);

    expect(response.body.data.booking).toMatchObject({
      paymentReviewRequired: false,
      paymentAction: null,
      canBeCancelled: false,
      canBeRescheduled: true,
      videoCall: {
        provider: 'livekit',
        joinMode: 'in_app',
        status: 'ready',
        roomUrl: 'https://sessions.example.test/room',
      },
    });
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

  test('cancels an unpaid hold with an exact payment-state compare-and-set', async () => {
    const paymentSnapshot = {
      _id: '64f000000000000000000010',
      user: '64f000000000000000000001',
      status: 'pending',
      paymentStatus: 'failed',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'pending' },
      holdExpiresAt: new Date(Date.now() + 60_000),
      scheduledAt: new Date(Date.now() + 3_600_000),
    };
    const cancelled = {
      ...paymentSnapshot,
      status: 'cancelled',
      populate: jest.fn().mockResolvedValue(undefined),
    };
    Booking.findById.mockResolvedValue(paymentSnapshot);
    Booking.findOneAndUpdate.mockResolvedValue(cancelled);

    await request(buildApp())
      .put('/api/bookings/64f000000000000000000010/cancel')
      .send({ reason: 'Changed plans' })
      .expect(200);

    expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({
      _id: paymentSnapshot._id,
      user: '64f000000000000000000001',
      status: 'pending',
      paymentStatus: { $in: ['pending', 'failed'] },
      'bookingAuthorization.status': 'pending',
      $or: [
        { razorpayOrderId: { $exists: false } },
        { razorpayOrderId: null },
      ],
    }), expect.objectContaining({
      $set: expect.objectContaining({
        status: 'cancelled',
        orderStatus: 'expired',
        'bookingAuthorization.status': 'revoked',
      }),
    }), { new: true, runValidators: true });
  });

  test('does not directly cancel after a provider order has been exposed', async () => {
    Booking.findById.mockResolvedValue({
      _id: '64f000000000000000000010',
      user: '64f000000000000000000001',
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      razorpayOrderId: 'order_test_123',
      bookingAuthorization: { kind: 'payment', status: 'pending' },
      holdExpiresAt: new Date(Date.now() + 60_000),
    });

    const response = await request(buildApp())
      .put('/api/bookings/64f000000000000000000010/cancel')
      .send({ reason: 'Checkout returned an error' })
      .expect(409);

    expect(response.body.code).toBe('PAYMENT_RECONCILIATION_PENDING');
    expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('does not overwrite a captured payment when capture wins the pre-order cancellation race', async () => {
    const paidState = { status: 'confirmed', paymentStatus: 'paid' };
    const paymentSnapshot = {
      _id: '64f000000000000000000010',
      user: '64f000000000000000000001',
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'pending' },
      holdExpiresAt: new Date(Date.now() + 60_000),
      select: jest.fn().mockResolvedValue(paidState),
    };
    Booking.findById.mockReturnValue(paymentSnapshot);
    Booking.findOneAndUpdate.mockResolvedValue(null);

    const response = await request(buildApp())
      .put('/api/bookings/64f000000000000000000010/cancel')
      .send({ reason: 'Changed plans' })
      .expect(409);

    expect(response.body.code).toBe('PAID_CANCELLATION_REVIEW_REQUIRED');
    expect(Booking.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('does not imply a refund by directly cancelling an already-paid booking', async () => {
    Booking.findById.mockResolvedValue(paidRazorpayBooking());

    const response = await request(buildApp())
      .put('/api/bookings/64f000000000000000000010/cancel')
      .send({ reason: 'Changed plans' })
      .expect(409);

    expect(response.body.code).toBe('PAID_CANCELLATION_REVIEW_REQUIRED');
    expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([
    [
      'missing authorization',
      paidRazorpayBooking({ bookingAuthorization: undefined }),
    ],
    [
      'invalid subscription authorization',
      {
        _id: '64f000000000000000000010',
        user: '64f000000000000000000001',
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'subscription',
        isSubscriptionBooking: true,
        amountMinor: 0,
        currency: 'INR',
        pricing: { listAmountMinor: 123456, currency: 'INR' },
        bookingAuthorization: {
          kind: 'subscription_entitlement',
          status: 'authorized',
        },
      },
    ],
  ])('routes a paid booking with %s to the same support review path', async (_case, booking) => {
    Booking.findById.mockResolvedValue(booking);

    const response = await request(buildApp())
      .put('/api/bookings/64f000000000000000000010/cancel')
      .send({ reason: 'Changed plans' })
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      code: 'PAID_CANCELLATION_REVIEW_REQUIRED',
      message:
        'Paid or entitled booking cancellation requires manual review. Cancellation and refund eligibility are not determined by this request.',
    });
    expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('does not automatically cancel an entitled booking even beyond 24 hours', async () => {
    const subscriptionBooking = {
      _id: '64f000000000000000000010',
      user: '64f000000000000000000001',
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'subscription',
      isSubscriptionBooking: true,
      amountMinor: 0,
      currency: 'INR',
      pricing: {
        listAmountMinor: 123456,
        currency: 'INR',
      },
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      canBeCancelled: true,
      bookingAuthorization: {
        kind: 'subscription_entitlement',
        status: 'authorized',
        reference: 'monthly:2026-07-01T00:00:00.000Z',
        authorizedAt: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    };
    Booking.findById.mockResolvedValue(subscriptionBooking);

    const response = await request(buildApp())
      .put('/api/bookings/64f000000000000000000010/cancel')
      .send({ reason: 'Changed plans' })
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      code: 'PAID_CANCELLATION_REVIEW_REQUIRED',
    });
    expect(response.body.message).toContain('eligibility');
    expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
