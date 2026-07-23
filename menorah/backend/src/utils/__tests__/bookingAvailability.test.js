const {
  buildBookingConflictQuery,
  expireStalePendingBookings,
  generateAvailabilityForDate,
  isSessionWithinWorkingHours,
  isBlockingBooking,
  isDirectlyCancellableUnpaidHold,
  isUnpaidPaymentHold,
} = require('../bookingAvailability');

const counsellor = {
  timezone: 'Asia/Kolkata',
  sessionDuration: 60,
  availability: {
    monday: { start: '09:00', end: '12:00', isAvailable: true },
    tuesday: { start: '09:00', end: '12:00', isAvailable: true },
    wednesday: { start: '09:00', end: '12:00', isAvailable: true },
    thursday: { start: '09:00', end: '12:00', isAvailable: true },
    friday: { start: '09:00', end: '12:00', isAvailable: true },
    saturday: { start: '09:00', end: '12:00', isAvailable: false },
    sunday: { start: '09:00', end: '12:00', isAvailable: false },
  },
};

const now = new Date('2026-06-23T00:00:00.000Z');

const bookingAt = (localDateTime, overrides = {}) => ({
  scheduledAt: new Date(`${localDateTime}+05:30`),
  sessionDuration: 60,
  status: 'confirmed',
  paymentStatus: 'paid',
  ...overrides,
});

describe('booking availability rules', () => {
  test('requires the whole requested session to fit inside working hours', () => {
    const schedule = { start: '09:00', end: '12:00', isAvailable: true };

    expect(isSessionWithinWorkingHours({
      scheduledAt: new Date('2026-06-23T05:30:00.000Z'),
      sessionDuration: 60,
      schedule,
      timezone: 'Asia/Kolkata',
    })).toBe(true);
    expect(isSessionWithinWorkingHours({
      scheduledAt: new Date('2026-06-23T06:00:00.000Z'),
      sessionDuration: 60,
      schedule,
      timezone: 'Asia/Kolkata',
    })).toBe(false);
  });

  test('evaluates the real local end time across a daylight-saving jump', () => {
    expect(isSessionWithinWorkingHours({
      scheduledAt: new Date('2026-03-08T06:30:00.000Z'),
      sessionDuration: 60,
      schedule: { start: '01:00', end: '03:00', isAvailable: true },
      timezone: 'America/New_York',
    })).toBe(false);
  });

  test('searches far enough backward for the longest allowed overlapping booking', () => {
    const requestedStart = new Date('2026-06-23T10:00:00.000Z');
    const query = buildBookingConflictQuery({
      counsellorId: 'counsellor-id',
      scheduledAt: requestedStart,
      sessionDuration: 45,
    });

    expect(query).toMatchObject({
      counsellor: 'counsellor-id',
      scheduledAt: {
        $gte: new Date('2026-06-23T07:00:00.000Z'),
        $lt: new Date('2026-06-23T10:45:00.000Z'),
      },
      $or: expect.arrayContaining([
        { status: { $in: ['pending', 'confirmed', 'in-progress'] } },
        expect.objectContaining({
          paymentMethod: 'razorpay',
          'bookingAuthorization.status': 'needs_review',
        }),
      ]),
    });
  });

  test('confirmed and paid bookings block their slot', () => {
    const day = generateAvailabilityForDate({
      counsellor,
      date: new Date('2026-06-23T00:00:00.000Z'),
      now,
      bookings: [bookingAt('2026-06-23T09:00')],
    });

    expect(day.slots.find((slot) => slot.startTime === '09:00')).toMatchObject({
      status: 'booked',
      isSelectable: false,
    });
    expect(day.slots.find((slot) => slot.startTime === '10:00')).toMatchObject({
      status: 'available',
      isSelectable: true,
    });
  });

  test('active pending payment bookings show as temporarily held', () => {
    const day = generateAvailabilityForDate({
      counsellor,
      date: new Date('2026-06-23T00:00:00.000Z'),
      now,
      bookings: [bookingAt('2026-06-23T10:00', {
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: 'razorpay',
        bookingAuthorization: { kind: 'payment', status: 'pending' },
        holdExpiresAt: new Date('2026-06-23T00:10:00.000Z'),
      })],
    });

    expect(day.slots.find((slot) => slot.startTime === '10:00')).toMatchObject({
      status: 'pending',
      statusLabel: 'Temporarily held',
      isSelectable: false,
    });
  });

  test('a failed attempt keeps the slot held for delayed capture until the hold expires', () => {
    const booking = bookingAt('2026-06-23T10:00', {
      status: 'pending',
      paymentStatus: 'failed',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'pending' },
      holdExpiresAt: new Date('2026-06-23T00:10:00.000Z'),
    });

    expect(isBlockingBooking(booking, now)).toBe(true);

    const day = generateAvailabilityForDate({
      counsellor,
      date: new Date('2026-06-23T00:00:00.000Z'),
      now,
      bookings: [booking],
    });
    expect(day.slots.find((slot) => slot.startTime === '10:00')).toMatchObject({
      status: 'pending',
      isSelectable: false,
    });
  });

  test('quarantines bound orders and expires only unbound payment holds', async () => {
    const Booking = { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };

    await expireStalePendingBookings(Booking, { counsellor: 'counsellor-id' }, now);

    expect(Booking.updateMany).toHaveBeenCalledTimes(4);
    expect(Booking.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      counsellor: 'counsellor-id',
      $and: expect.arrayContaining([
        expect.objectContaining({
          $or: expect.arrayContaining([
            { holdExpiresAt: { $lte: now } },
          ]),
        }),
        expect.objectContaining({
          $or: expect.arrayContaining([
            { razorpayOrderId: { $exists: false } },
            { razorpayOrderId: null },
            { razorpayOrderId: '' },
          ]),
        }),
      ]),
    }), expect.objectContaining({
      $set: expect.objectContaining({
        status: 'expired',
        orderStatus: 'expired',
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'revoked',
      }),
    }), {
      writeConcern: { w: 'majority' },
    });
    expect(Booking.updateMany).toHaveBeenNthCalledWith(4, expect.objectContaining({
      counsellor: 'counsellor-id',
      paymentStatus: { $in: ['pending', 'failed'] },
      paymentMethod: 'razorpay',
      razorpayOrderId: { $type: 'string', $ne: '' },
      $nor: [{
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'needs_review',
      }],
      $or: expect.arrayContaining([
        { status: { $ne: 'pending' } },
        { 'bookingAuthorization.kind': { $ne: 'payment' } },
        { 'bookingAuthorization.status': { $ne: 'pending' } },
      ]),
    }), expect.objectContaining({
      $set: {
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'needs_review',
      },
    }), {
      writeConcern: { w: 'majority' },
    });
  });

  test('quarantine and expiry sweeps include legacy rows without authorization metadata', async () => {
    const Booking = { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }) };

    await expireStalePendingBookings(Booking, {}, now);

    const [expireFilter, expireUpdate] = Booking.updateMany.mock.calls[0];
    const [reviewedUnboundFilter, reviewedUnboundUpdate] =
      Booking.updateMany.mock.calls[1];
    const [backfillFilter, backfillUpdate] = Booking.updateMany.mock.calls[2];
    const [quarantineFilter, quarantineUpdate] = Booking.updateMany.mock.calls[3];
    const legacyAuthorizationFilter = expireFilter.$and.find(
      (clause) => Array.isArray(clause.$and)
        && clause.$and.some((branch) => branch.$or?.some(
          (candidate) => Object.hasOwn(candidate, 'bookingAuthorization.kind'),
        )),
    );
    expect(legacyAuthorizationFilter.$and).toEqual(expect.arrayContaining([
      expect.objectContaining({
        $or: expect.arrayContaining([
          { 'bookingAuthorization.kind': { $exists: false } },
        ]),
      }),
      expect.objectContaining({
        $or: expect.arrayContaining([
          { 'bookingAuthorization.status': { $exists: false } },
        ]),
      }),
    ]));
    expect(expireUpdate.$set).toMatchObject({
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'revoked',
    });
    expect(reviewedUnboundFilter.$and).toEqual(expect.arrayContaining([
      expect.objectContaining({
        $or: expect.arrayContaining([
          { razorpayOrderId: { $exists: false } },
        ]),
      }),
      expect.objectContaining({
        $or: expect.arrayContaining([
          { paymentId: { $type: 'string', $ne: '' } },
          expect.objectContaining({
            'bookingAuthorization.status': {
              $exists: true,
              $nin: ['pending', null],
            },
          }),
        ]),
      }),
    ]));
    expect(reviewedUnboundUpdate.$set).toEqual({
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'needs_review',
    });
    expect(backfillFilter).toMatchObject({
      holdExpiresAt: { $gt: now },
      $and: expect.arrayContaining([
        expect.objectContaining({
          $or: expect.arrayContaining([
            { paymentId: { $exists: false } },
            { paymentId: null },
            { paymentId: '' },
          ]),
        }),
      ]),
    });
    expect(backfillUpdate.$set).toEqual({
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'pending',
    });
    expect(quarantineFilter.$or).toEqual(expect.arrayContaining([
      { 'bookingAuthorization.kind': { $ne: 'payment' } },
      { 'bookingAuthorization.status': { $ne: 'pending' } },
    ]));
    expect(quarantineUpdate.$set).toEqual({
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'needs_review',
    });
  });

  test.each(['pending', 'failed'])(
    'allows users to cancel an unpaid %s payment hold',
    (paymentStatus) => {
      expect(isUnpaidPaymentHold({
        status: 'pending',
        paymentStatus,
        paymentMethod: 'razorpay',
        bookingAuthorization: { kind: 'payment', status: 'pending' },
      })).toBe(true);
    }
  );

  test.each([
    {
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'authorized' },
    },
    {
      status: 'pending',
      paymentStatus: 'refunded',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'revoked' },
    },
    {
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'subscription',
      bookingAuthorization: { kind: 'subscription_entitlement', status: 'authorized' },
    },
  ])('does not classify paid, refunded, or entitled bookings as unpaid holds', (candidate) => {
    expect(isUnpaidPaymentHold(candidate)).toBe(false);
  });

  test('direct cancellation requires a live, unbound unpaid payment hold', () => {
    const candidate = {
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'pending' },
      holdExpiresAt: new Date('2026-06-23T00:10:00.000Z'),
    };

    expect(isDirectlyCancellableUnpaidHold(candidate, now)).toBe(true);
    expect(isDirectlyCancellableUnpaidHold({
      ...candidate,
      razorpayOrderId: 'order_test_123',
    }, now)).toBe(false);
    expect(isDirectlyCancellableUnpaidHold({
      ...candidate,
      holdExpiresAt: new Date('2026-06-22T23:59:00.000Z'),
    }, now)).toBe(false);
    expect(isDirectlyCancellableUnpaidHold({
      ...candidate,
      paymentStatus: 'paid',
      status: 'confirmed',
      bookingAuthorization: { kind: 'payment', status: 'authorized' },
    }, now)).toBe(false);
  });

  test('keeps a payment reconciliation review blocking after its hold expires', () => {
    const booking = bookingAt('2026-06-23T10:00', {
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'needs_review' },
      holdExpiresAt: new Date('2026-06-22T23:59:00.000Z'),
    });

    expect(isUnpaidPaymentHold(booking)).toBe(false);
    expect(isBlockingBooking(booking, now)).toBe(true);

    const day = generateAvailabilityForDate({
      counsellor,
      date: new Date('2026-06-23T00:00:00.000Z'),
      now,
      bookings: [booking],
    });
    expect(day.slots.find((slot) => slot.startTime === '10:00')).toMatchObject({
      status: 'booked',
      isSelectable: false,
    });
  });

  test('keeps an already expired booking blocking after capture sends it to review', () => {
    const booking = bookingAt('2026-06-23T10:00', {
      status: 'expired',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      bookingAuthorization: { kind: 'payment', status: 'needs_review' },
      razorpayOrderId: 'order_late_capture',
      holdExpiresAt: new Date('2026-06-22T23:59:00.000Z'),
    });

    expect(isBlockingBooking(booking, now)).toBe(true);

    const day = generateAvailabilityForDate({
      counsellor,
      date: new Date('2026-06-23T00:00:00.000Z'),
      now,
      bookings: [booking],
    });
    expect(day.slots.find((slot) => slot.startTime === '10:00')).toMatchObject({
      status: 'booked',
      isSelectable: false,
    });
  });

  test('cancelled, failed, and expired bookings do not block slots', () => {
    expect(isBlockingBooking(bookingAt('2026-06-23T09:00', { status: 'cancelled' }), now)).toBe(false);
    expect(isBlockingBooking(bookingAt('2026-06-23T09:00', { status: 'pending', paymentStatus: 'failed' }), now)).toBe(false);
    expect(isBlockingBooking(bookingAt('2026-06-23T09:00', { status: 'expired', paymentStatus: 'pending' }), now)).toBe(false);

    const day = generateAvailabilityForDate({
      counsellor,
      date: new Date('2026-06-23T00:00:00.000Z'),
      now,
      bookings: [
        bookingAt('2026-06-23T09:00', { status: 'cancelled' }),
        bookingAt('2026-06-23T10:00', { status: 'pending', paymentStatus: 'failed' }),
        bookingAt('2026-06-23T11:00', { status: 'expired', paymentStatus: 'pending' }),
      ],
    });

    expect(day.slots.every((slot) => slot.status === 'available')).toBe(true);
  });
});
