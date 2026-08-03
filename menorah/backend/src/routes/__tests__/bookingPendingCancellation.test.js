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
  isUnpaidPaymentHold: (booking) => Boolean(
    booking?.status === 'pending'
    && ['pending', 'failed'].includes(booking?.paymentStatus)
    && booking?.paymentMethod === 'razorpay'
    && booking?.bookingAuthorization?.kind === 'payment'
    && booking?.bookingAuthorization?.status === 'pending'
  ),
  isDirectlyCancellableUnpaidHold: jest.fn(),
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
    select: jest.fn(),
    then: (resolve, reject) => Promise.resolve(booking).then(resolve, reject),
  };
  query.populate.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
};

const makePendingBooking = (overrides = {}) => ({
  _id: objectId(bookingId),
  user: objectId(userId),
  counsellor: {
    user: { firstName: 'Dr', lastName: 'Rao' },
  },
  status: 'pending',
  paymentStatus: 'pending',
  paymentMethod: 'razorpay',
  razorpayOrderId: null,
  bookingAuthorization: { kind: 'payment', status: 'pending' },
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
      user: { _id: objectId(userId), phone: '+919999999999' },
      status: 'cancelled',
      orderStatus: 'expired',
      holdExpiresAt: undefined,
      populate: jest.fn(async () => undefined),
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
        paymentStatus: { $in: ['pending', 'failed'] },
        paymentMethod: 'razorpay',
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'pending',
        holdExpiresAt: { $gt: expect.any(Date) },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'cancelled',
          orderStatus: 'expired',
          cancellationReason: 'I no longer need this time',
          cancelledBy: mockAuthUser._id,
          cancelledAt: expect.any(Date),
          'bookingAuthorization.status': 'revoked',
        }),
        $push: expect.objectContaining({
          statusHistory: expect.objectContaining({
            status: 'cancelled',
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
      user: objectId(otherUserId),
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
    const paidBooking = makePendingBooking({
      status: 'confirmed',
      paymentStatus: 'paid',
    });
    mockBookingFindById
      .mockReturnValueOnce(makeFindByIdQuery(pendingBooking))
      .mockReturnValueOnce(makeFindByIdQuery(paidBooking));
    mockBookingFindOneAndUpdate.mockResolvedValue(null);

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/cancel`)
      .send({})
      .expect(409);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      code: 'PAID_CANCELLATION_REVIEW_REQUIRED',
    }));
    expect(mockSendCancellationSMS).not.toHaveBeenCalled();
  });

  test('requires provider reconciliation after a Razorpay order has been bound', async () => {
    const orderBoundBooking = makePendingBooking({ razorpayOrderId: 'order_active' });
    mockBookingFindById.mockReturnValueOnce(makeFindByIdQuery(orderBoundBooking));

    const response = await request(buildApp())
      .put(`/api/bookings/${bookingId}/cancel`)
      .send({})
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      code: 'PAYMENT_RECONCILIATION_PENDING',
    });
    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
