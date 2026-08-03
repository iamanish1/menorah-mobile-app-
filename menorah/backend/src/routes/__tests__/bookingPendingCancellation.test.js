const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockBookingFindById = jest.fn();
const mockBookingFindOneAndUpdate = jest.fn();
const mockSendCancellationSMS = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
  authAny: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
  verifiedPatientAuth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
}));

jest.mock('../../models/Booking', () => ({
  findById: (...args) => mockBookingFindById(...args),
  findOneAndUpdate: (...args) => mockBookingFindOneAndUpdate(...args),
}));

jest.mock('../../models/Counsellor', () => ({}));
jest.mock('../../models/User', () => ({}));
jest.mock('../../utils/email', () => ({
  sendBookingConfirmationEmail: jest.fn(),
  sendSessionReminderEmail: jest.fn(),
}));
jest.mock('../../utils/sms', () => ({
  sendBookingConfirmationSMS: jest.fn(),
  sendSessionReminderSMS: jest.fn(),
  sendCancellationSMS: (...args) => mockSendCancellationSMS(...args),
}));
jest.mock('../../utils/bookingAvailability', () => ({
  getPendingHoldExpiresAt: jest.fn(),
  expireStalePendingBookings: jest.fn(),
  isBlockingBooking: jest.fn(),
}));
jest.mock('../../services/callPolicyService', () => ({
  isAllowedExternalProvider: jest.fn(),
  isSafeHttpsUrl: jest.fn(),
  normalizeProvider: jest.fn(),
  providerDisplayName: jest.fn(),
  resolveCallPolicy: jest.fn(),
}));

const bookingsRouter = require('../bookings');

const bookingId = '64f000000000000000000101';
const userId = '64f000000000000000000102';
const otherUserId = '64f000000000000000000103';
const objectId = (value) => ({ toString: () => value });

const makeFindByIdQuery = (booking) => {
  const query = {
    populate: jest.fn(),
    then: (resolve, reject) => Promise.resolve(booking).then(resolve, reject),
  };
  query.populate.mockReturnValue(query);
  return query;
};

const makePendingBooking = (overrides = {}) => ({
  _id: objectId(bookingId),
  user: {
    _id: objectId(userId),
    phone: '+919999999999',
  },
  counsellor: {
    user: { firstName: 'Dr', lastName: 'Rao' },
  },
  status: 'pending',
  paymentStatus: 'pending',
  razorpayOrderId: 'order_active',
  holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  scheduledAt: new Date('2026-08-01T09:00:00.000Z'),
  canBeCancelled: false,
  ...overrides,
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', bookingsRouter);
  return app;
};

describe('pending-payment booking cancellation', () => {
  beforeEach(() => {
    mockAuthUser = { _id: objectId(userId), role: 'user' };
    mockBookingFindById.mockReset();
    mockBookingFindOneAndUpdate.mockReset();
    mockSendCancellationSMS.mockReset();
    mockSendCancellationSMS.mockResolvedValue(undefined);
  });

  test('lets the owning patient atomically cancel a pending payment hold', async () => {
    const pendingBooking = makePendingBooking();
    const cancelledBooking = makePendingBooking({
      status: 'cancelled',
      orderStatus: 'cancelled',
      holdExpiresAt: undefined,
    });
    mockBookingFindById.mockReturnValueOnce(makeFindByIdQuery(pendingBooking));
    mockBookingFindOneAndUpdate.mockResolvedValue(cancelledBooking);

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/cancel`)
      .send({ reason: 'I no longer need this time' })
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      data: {
        booking: expect.objectContaining({
          status: 'cancelled',
          paymentStatus: 'pending',
        }),
      },
    }));
    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: pendingBooking._id,
        user: mockAuthUser._id,
        status: 'pending',
        paymentStatus: 'pending',
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'cancelled',
          orderStatus: 'cancelled',
          cancellationReason: 'I no longer need this time',
          cancelledBy: mockAuthUser._id,
          cancelledAt: expect.any(Date),
        }),
        $unset: { holdExpiresAt: '' },
        $push: expect.objectContaining({
          statusHistory: expect.objectContaining({
            status: 'cancelled',
            reason: 'I no longer need this time',
            updatedBy: mockAuthUser._id,
          }),
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(mockSendCancellationSMS).toHaveBeenCalledWith(
      '+919999999999',
      expect.objectContaining({ counsellorName: 'Dr Rao' }),
    );
  });

  test('does not let another patient cancel the pending hold', async () => {
    const pendingBooking = makePendingBooking({
      user: { _id: objectId(otherUserId), phone: '+918888888888' },
    });
    mockBookingFindById.mockReturnValueOnce(makeFindByIdQuery(pendingBooking));

    await request(buildApp())
      .put(`/api/bookings/${bookingId}/cancel`)
      .send({})
      .expect(403);

    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSendCancellationSMS).not.toHaveBeenCalled();
  });

  test('reports a conflict instead of overwriting a payment confirmation that won the race', async () => {
    const pendingBooking = makePendingBooking();
    mockBookingFindById.mockReturnValueOnce(makeFindByIdQuery(pendingBooking));
    mockBookingFindOneAndUpdate.mockResolvedValue(null);

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/cancel`)
      .send({})
      .expect(409);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      code: 'PAYMENT_STATE_CHANGED',
    }));
    expect(mockSendCancellationSMS).not.toHaveBeenCalled();
  });
});
