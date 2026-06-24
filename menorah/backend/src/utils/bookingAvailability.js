const moment = require('moment-timezone');

const PENDING_HOLD_MINUTES = 15;
const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'in-progress'];
const BLOCKING_CONFIRMED_STATUSES = ['confirmed', 'in-progress'];

const getPendingHoldExpiresAt = (from = new Date()) =>
  new Date(from.getTime() + PENDING_HOLD_MINUTES * 60 * 1000);

const isBlockingBooking = (booking, now = new Date()) => {
  if (!booking || !ACTIVE_BOOKING_STATUSES.includes(booking.status)) return false;
  if (booking.paymentStatus === 'paid' || BLOCKING_CONFIRMED_STATUSES.includes(booking.status)) return true;
  if (booking.status === 'pending' && booking.paymentStatus === 'pending') {
    return booking.holdExpiresAt && new Date(booking.holdExpiresAt) > now;
  }
  return false;
};

const expireStalePendingBookings = (Booking, extraQuery = {}, now = new Date()) =>
  Booking.updateMany({
    ...extraQuery,
    status: 'pending',
    paymentStatus: 'pending',
    $or: [
      { holdExpiresAt: { $lte: now } },
      { holdExpiresAt: { $exists: false } },
      { holdExpiresAt: null },
    ],
  }, {
    $set: {
      status: 'expired',
      orderStatus: 'expired',
      cancellationReason: 'Payment hold expired',
    },
  });

const toMinutes = (time) => {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

const toTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;

const getLocalDaySchedule = (counsellor, date, timezone) => {
  const dayOfWeek = moment.tz(date, timezone).format('dddd').toLowerCase();
  return { dayOfWeek, schedule: counsellor.availability?.[dayOfWeek] };
};

const getSlotStatusForBooking = (booking, now = new Date()) => {
  if (!booking) return 'available';
  if (booking.status === 'pending' && booking.paymentStatus === 'pending' && booking.holdExpiresAt && new Date(booking.holdExpiresAt) > now) {
    return 'pending';
  }
  return 'booked';
};

const generateAvailabilityForDate = ({ counsellor, date, bookings = [], duration, now = new Date() }) => {
  const timezone = counsellor.timezone || 'Asia/Kolkata';
  const sessionDuration = Number(duration || counsellor.sessionDuration || 60);
  const localDate = moment.tz(date, timezone);
  const dateValue = localDate.format('YYYY-MM-DD');
  const { dayOfWeek, schedule } = getLocalDaySchedule(counsellor, localDate.toDate(), timezone);

  if (!schedule || !schedule.isAvailable) {
    return {
      date: dateValue,
      dayOfWeek,
      timezone,
      sessionDuration,
      isAvailable: false,
      slots: [],
    };
  }

  const startMinutes = toMinutes(schedule.start);
  const endMinutes = toMinutes(schedule.end);
  const slots = [];

  for (let cursor = startMinutes; cursor + sessionDuration <= endMinutes; cursor += sessionDuration) {
    const startTime = toTime(cursor);
    const endTime = toTime(cursor + sessionDuration);
    const startsAt = moment.tz(`${dateValue}T${startTime}`, timezone).toDate();
    const endsAt = moment.tz(`${dateValue}T${endTime}`, timezone).toDate();
    const matchingBooking = bookings.find((booking) => {
      if (!isBlockingBooking(booking, now)) return false;
      const bookingStart = new Date(booking.scheduledAt);
      const bookingEnd = new Date(bookingStart.getTime() + (booking.sessionDuration || sessionDuration) * 60 * 1000);
      return overlaps(startsAt, endsAt, bookingStart, bookingEnd);
    });
    const isPast = startsAt <= now;
    const status = isPast ? 'past' : getSlotStatusForBooking(matchingBooking, now);

    slots.push({
      startTime,
      endTime,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status,
      isSelectable: status === 'available',
      label: moment(startsAt).tz(timezone).format('h:mm A'),
      statusLabel: {
        available: 'Available',
        booked: 'Booked',
        pending: 'Temporarily held',
        unavailable: 'Unavailable',
        past: 'Past',
      }[status],
    });
  }

  return {
    date: dateValue,
    dayOfWeek,
    timezone,
    sessionDuration,
    isAvailable: true,
    workingHours: { start: schedule.start, end: schedule.end },
    slots,
  };
};

module.exports = {
  PENDING_HOLD_MINUTES,
  ACTIVE_BOOKING_STATUSES,
  getPendingHoldExpiresAt,
  isBlockingBooking,
  expireStalePendingBookings,
  generateAvailabilityForDate,
};
