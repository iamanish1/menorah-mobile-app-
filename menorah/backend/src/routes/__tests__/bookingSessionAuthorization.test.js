const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockBookingFindById = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
  authAny: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
}));

jest.mock('../../models/Booking', () => ({
  findById: (...args) => mockBookingFindById(...args),
  find: jest.fn(),
  exists: jest.fn(),
  countDocuments: jest.fn(),
}));

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

const bookingsRouter = require('../bookings');

const objectId = (value) => ({
  toString: () => value,
  toHexString: () => value,
});
const bookingId = '64f000000000000000000010';
const userId = '64f000000000000000000001';
const counsellorUserId = '64f000000000000000000002';
const adminUserId = '64f000000000000000000003';
const counsellorId = '64f000000000000000000004';
const applicationId = '64f000000000000000000005';
const evidenceId = '64f000000000000000000006';
const outsiderId = '64f000000000000000000099';

const findByIdChain = (booking) => {
  const chain = {
    populate: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(booking).then(resolve, reject),
    catch: (reject) => Promise.resolve(booking).catch(reject),
  };
  return chain;
};

const makeBooking = (overrides = {}) => {
  const now = Date.now();
  const baseUser = {
    _id: objectId(userId),
    firstName: 'Asha',
    lastName: 'User',
    role: 'user',
    isActive: true,
  };
  const baseCounsellorUser = {
    _id: objectId(counsellorUserId),
    firstName: 'Dr',
    lastName: 'Rao',
    role: 'counsellor',
    isActive: true,
  };
  const baseCounsellor = {
    _id: objectId(counsellorId),
    user: baseCounsellorUser,
    status: 'approved',
    isActive: true,
    professionalVerification: {
      schemaVersion: 1,
      legacyReviewRequired: false,
      application: objectId(applicationId),
      onboardingConsent: {
        accepted: true,
        version: 'consent-v1',
        acceptedAt: new Date(now - 24 * 60 * 60 * 1000),
        source: 'counsellor_web_registration',
      },
      credentialReview: {
        decision: 'approved',
        policyVersion: 'credential-v1',
        evidenceIds: [objectId(evidenceId)],
        reviewedBy: objectId(adminUserId),
        reviewedAt: new Date(now - 24 * 60 * 60 * 1000),
      },
      approvedBy: objectId(adminUserId),
      approvedAt: new Date(now - 24 * 60 * 60 * 1000),
      expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000),
    },
  };
  const booking = {
    _id: objectId(bookingId),
    user: baseUser,
    counsellor: baseCounsellor,
    status: 'confirmed',
    sessionType: 'video',
    sessionDuration: 50,
    scheduledAt: new Date(now),
    paymentStatus: 'paid',
    paymentMethod: 'razorpay',
    isSubscriptionBooking: false,
    paymentId: 'pay_current',
    razorpayOrderId: 'order_current',
    transactionId: 'order_current',
    orderStatus: 'paid',
    amountMinor: 50000,
    currency: 'INR',
    pricing: {
      listAmountMinor: 50000,
      currency: 'INR',
    },
    bookingAuthorization: {
      kind: 'payment',
      status: 'authorized',
      reference: 'pay_current',
      authorizedAt: new Date(now - 60 * 1000),
    },
    videoCall: {},
    save: jest.fn().mockResolvedValue(undefined),
    startSession: jest.fn(async () => {
      booking.status = 'in-progress';
    }),
    complete: jest.fn(async () => {
      booking.status = 'completed';
    }),
    ...overrides,
  };
  booking.user = { ...baseUser, ...(overrides.user || {}) };
  booking.counsellor = {
    ...baseCounsellor,
    ...(overrides.counsellor || {}),
    user: {
      ...baseCounsellorUser,
      ...(overrides.counsellor?.user || {}),
    },
  };
  return booking;
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.set('io', { to: jest.fn(() => ({ emit: jest.fn() })) });
  app.use('/api/bookings', bookingsRouter);
  return app;
};

describe('booking session state authorization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CALL_JOIN_EARLY_MINUTES: '15',
      CALL_JOIN_LATE_GRACE_MINUTES: '15',
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'consent-v1',
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: 'credential-v1',
    };
    mockAuthUser = { _id: objectId(userId), role: 'user' };
    mockBookingFindById.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('client users cannot start an assigned session', async () => {
    const booking = makeBooking();
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    await request(buildApp())
      .put(`/api/bookings/${bookingId}/start`)
      .expect(403);

    expect(booking.startSession).not.toHaveBeenCalled();
  });

  test('assigned counsellors can start an assigned session', async () => {
    mockAuthUser = { _id: objectId(counsellorUserId), role: 'counsellor' };
    const booking = makeBooking();
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    await request(buildApp())
      .put(`/api/bookings/${bookingId}/start`)
      .expect(200);

    expect(booking.startSession).toHaveBeenCalled();
  });

  test('administrators cannot start an assigned session', async () => {
    mockAuthUser = { _id: objectId(adminUserId), role: 'admin' };
    const booking = makeBooking();
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/start`)
      .expect(403);

    expect(response.body.code).toBe('BOOKING_PARTICIPANT_MISMATCH');
    expect(booking.startSession).not.toHaveBeenCalled();
  });

  test('a different counsellor cannot start an assigned session', async () => {
    mockAuthUser = { _id: objectId(outsiderId), role: 'counsellor' };
    const booking = makeBooking();
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/start`)
      .expect(403);

    expect(response.body.code).toBe('BOOKING_PARTICIPANT_MISMATCH');
    expect(booking.startSession).not.toHaveBeenCalled();
  });

  test.each([
    [
      'before the early window',
      () => makeBooking({
        scheduledAt: new Date(Date.now() + 16 * 60 * 1000),
      }),
      409,
      'CALL_TOO_EARLY',
    ],
    [
      'after the late grace window',
      () => makeBooking({
        scheduledAt: new Date(Date.now() - 66 * 60 * 1000),
      }),
      410,
      'CALL_TOO_LATE',
    ],
    [
      'after payment is refunded',
      () => makeBooking({ paymentStatus: 'refunded' }),
      403,
      'BOOKING_AUTHORIZATION_NOT_CURRENT',
    ],
    [
      'after the assigned counsellor is suspended',
      () => makeBooking({ counsellor: { status: 'suspended' } }),
      403,
      'BOOKING_COUNSELLOR_NOT_APPROVED',
    ],
  ])('does not start a session %s', async (_label, buildBooking, status, code) => {
    mockAuthUser = { _id: objectId(counsellorUserId), role: 'counsellor' };
    const booking = buildBooking();
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/start`)
      .expect(status);

    expect(response.body.code).toBe(code);
    expect(booking.startSession).not.toHaveBeenCalled();
  });

  test('client users cannot complete an assigned session', async () => {
    const booking = makeBooking({ status: 'in-progress' });
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    await request(buildApp())
      .put(`/api/bookings/${bookingId}/complete`)
      .expect(403);

    expect(booking.complete).not.toHaveBeenCalled();
  });

  test('assigned counsellors can complete an assigned session', async () => {
    mockAuthUser = { _id: objectId(counsellorUserId), role: 'counsellor' };
    const booking = makeBooking({ status: 'in-progress' });
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    await request(buildApp())
      .put(`/api/bookings/${bookingId}/complete`)
      .expect(200);

    expect(booking.complete).toHaveBeenCalled();
  });

  test.each([
    [
      'after payment is refunded',
      () => makeBooking({ status: 'in-progress', paymentStatus: 'refunded' }),
      403,
      'BOOKING_AUTHORIZATION_NOT_CURRENT',
    ],
    [
      'after the late grace window',
      () => makeBooking({
        status: 'in-progress',
        scheduledAt: new Date(Date.now() - 66 * 60 * 1000),
      }),
      410,
      'CALL_TOO_LATE',
    ],
    [
      'when it is not in progress',
      () => makeBooking({ status: 'confirmed' }),
      403,
      'BOOKING_STATE_NOT_ACTIVE',
    ],
  ])('does not complete a session %s', async (_label, buildBooking, status, code) => {
    mockAuthUser = { _id: objectId(counsellorUserId), role: 'counsellor' };
    const booking = buildBooking();
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/complete`)
      .expect(status);

    expect(response.body.code).toBe(code);
    expect(booking.complete).not.toHaveBeenCalled();
  });
});
