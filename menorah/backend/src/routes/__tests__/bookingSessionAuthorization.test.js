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

const objectId = (value) => ({ toString: () => value });
const bookingId = '64f000000000000000000010';
const userId = '64f000000000000000000001';
const counsellorUserId = '64f000000000000000000002';
const adminUserId = '64f000000000000000000003';

const findByIdChain = (booking) => {
  const chain = {
    populate: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(booking).then(resolve, reject),
    catch: (reject) => Promise.resolve(booking).catch(reject),
  };
  return chain;
};

const makeBooking = (overrides = {}) => {
  const booking = {
    _id: objectId(bookingId),
    user: { _id: objectId(userId), firstName: 'Asha', lastName: 'User' },
    counsellor: {
      _id: objectId('64f000000000000000000099'),
      user: { _id: objectId(counsellorUserId), firstName: 'Dr', lastName: 'Rao' },
    },
    status: 'confirmed',
    sessionType: 'video',
    sessionDuration: 50,
    scheduledAt: new Date(),
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
  beforeEach(() => {
    mockAuthUser = { _id: objectId(userId), role: 'user' };
    mockBookingFindById.mockReset();
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

  test('administrators can start an assigned session', async () => {
    mockAuthUser = { _id: objectId(adminUserId), role: 'admin' };
    const booking = makeBooking();
    mockBookingFindById.mockReturnValue(findByIdChain(booking));

    await request(buildApp())
      .put(`/api/bookings/${bookingId}/start`)
      .expect(200);

    expect(booking.startSession).toHaveBeenCalled();
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
});
