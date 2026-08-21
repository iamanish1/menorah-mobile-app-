const {
  generateAvailabilityForDate,
  isBlockingBooking,
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
        holdExpiresAt: new Date('2026-06-23T00:10:00.000Z'),
      })],
    });

    expect(day.slots.find((slot) => slot.startTime === '10:00')).toMatchObject({
      status: 'pending',
      statusLabel: 'Temporarily held',
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
