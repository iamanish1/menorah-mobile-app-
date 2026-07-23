const moment = require('moment-timezone');

const PENDING_HOLD_MINUTES = 15;
const MAX_BOOKING_SESSION_MINUTES = 180;
const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'in-progress'];
const BLOCKING_CONFIRMED_STATUSES = ['confirmed', 'in-progress'];

const getPendingHoldExpiresAt = (from = new Date()) =>
  new Date(from.getTime() + PENDING_HOLD_MINUTES * 60 * 1000);

const isUnpaidPaymentHold = (booking) => Boolean(
  booking?.status === 'pending'
  && ['pending', 'failed'].includes(booking?.paymentStatus)
  && booking?.paymentMethod === 'razorpay'
  && booking?.bookingAuthorization?.kind === 'payment'
  && booking?.bookingAuthorization?.status === 'pending'
);

const isDirectlyCancellableUnpaidHold = (booking, now = new Date()) => Boolean(
  isUnpaidPaymentHold(booking)
  && booking?.holdExpiresAt
  && new Date(booking.holdExpiresAt) > now
  && !booking?.razorpayOrderId
);

const isBlockingBooking = (booking, now = new Date()) => {
  if (!booking) return false;
  if (
    booking.paymentMethod === 'razorpay'
    && booking.paymentStatus !== 'refunded'
    && booking.bookingAuthorization?.kind === 'payment'
    && booking.bookingAuthorization?.status === 'needs_review'
  ) {
    return true;
  }
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) return false;
  if (booking.paymentStatus === 'paid' || BLOCKING_CONFIRMED_STATUSES.includes(booking.status)) return true;
  if (
    isUnpaidPaymentHold(booking)
  ) {
    return Boolean(booking.holdExpiresAt && new Date(booking.holdExpiresAt) > now);
  }
  return false;
};

const expireStalePendingBookings = async (Booking, extraQuery = {}, now = new Date()) => {
  const baseQuery = {
    ...extraQuery,
    status: 'pending',
    paymentStatus: { $in: ['pending', 'failed'] },
    paymentMethod: 'razorpay',
  };
  const staleHoldQuery = {
    $or: [
      { holdExpiresAt: { $lte: now } },
      { holdExpiresAt: { $exists: false } },
      { holdExpiresAt: null },
    ],
  };
  const unboundOrderQuery = {
    $or: [
      { razorpayOrderId: { $exists: false } },
      { razorpayOrderId: null },
      { razorpayOrderId: '' },
    ],
  };
  const legacyCompatibleAuthorizationQuery = {
    $and: [
      {
        $or: [
          { 'bookingAuthorization.kind': 'payment' },
          { 'bookingAuthorization.kind': { $exists: false } },
          { 'bookingAuthorization.kind': null },
        ],
      },
      {
        $or: [
          { 'bookingAuthorization.status': 'pending' },
          { 'bookingAuthorization.status': { $exists: false } },
          { 'bookingAuthorization.status': null },
        ],
      },
    ],
  };
  const noProviderPaymentEvidenceQueries = [
    {
      $or: [
        { paymentId: { $exists: false } },
        { paymentId: null },
        { paymentId: '' },
      ],
    },
    {
      $or: [
        { transactionId: { $exists: false } },
        { transactionId: null },
        { transactionId: '' },
      ],
    },
    {
      $or: [
        { orderStatus: { $exists: false } },
        { orderStatus: null },
        { orderStatus: '' },
      ],
    },
  ];

  // Release unbound holds first. If an order-binding transaction races this
  // write, one of the two document writes conflicts and the order service must
  // re-read the now-expired booking before it can retry.
  const expired = await Booking.updateMany({
    ...baseQuery,
    $and: [
      staleHoldQuery,
      unboundOrderQuery,
      legacyCompatibleAuthorizationQuery,
      ...noProviderPaymentEvidenceQueries,
    ],
  }, {
    $set: {
      status: 'expired',
      orderStatus: 'expired',
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'revoked',
      cancellationReason: 'Payment hold expired',
    },
  }, {
    writeConcern: { w: 'majority' },
  });

  const reviewedUnbound = await Booking.updateMany({
    ...baseQuery,
    $and: [
      unboundOrderQuery,
      {
        $or: [
          { paymentId: { $type: 'string', $ne: '' } },
          { transactionId: { $type: 'string', $ne: '' } },
          { orderStatus: { $exists: true, $nin: [null, ''] } },
          {
            'bookingAuthorization.kind': {
              $exists: true,
              $nin: ['payment', null],
            },
          },
          {
            'bookingAuthorization.status': {
              $exists: true,
              $nin: ['pending', null],
            },
          },
        ],
      },
    ],
  }, {
    $set: {
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'needs_review',
    },
  }, {
    writeConcern: { w: 'majority' },
  });

  const backfilledUnbound = await Booking.updateMany({
    ...baseQuery,
    holdExpiresAt: { $gt: now },
    $and: [
      unboundOrderQuery,
      legacyCompatibleAuthorizationQuery,
      {
        $or: [
          { 'bookingAuthorization.kind': { $exists: false } },
          { 'bookingAuthorization.kind': null },
          { 'bookingAuthorization.status': { $exists: false } },
          { 'bookingAuthorization.status': null },
        ],
      },
      ...noProviderPaymentEvidenceQueries,
    ],
  }, {
    $set: {
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'pending',
    },
  }, {
    writeConcern: { w: 'majority' },
  });

  // A provider-bound order remains payable, so its stale or contradictory local
  // state is never released. Quarantine after the unbound sweep so a bind that
  // won the race is caught here before this helper returns.
  const quarantined = await Booking.updateMany({
    ...extraQuery,
    paymentStatus: { $in: ['pending', 'failed'] },
    paymentMethod: 'razorpay',
    razorpayOrderId: { $type: 'string', $ne: '' },
    $nor: [{
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'needs_review',
    }],
    $or: [
      ...staleHoldQuery.$or,
      { status: { $ne: 'pending' } },
      { 'bookingAuthorization.kind': { $ne: 'payment' } },
      { 'bookingAuthorization.status': { $ne: 'pending' } },
    ],
  }, {
    $set: {
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'needs_review',
    },
  }, {
    writeConcern: { w: 'majority' },
  });

  return { quarantined, expired, reviewedUnbound, backfilledUnbound };
};

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

const isSessionWithinWorkingHours = ({
  scheduledAt,
  sessionDuration,
  schedule,
  timezone,
}) => {
  const durationMinutes = Number(sessionDuration);
  if (
    !schedule?.isAvailable
    || !Number.isInteger(durationMinutes)
    || durationMinutes < 1
    || durationMinutes > MAX_BOOKING_SESSION_MINUTES
  ) {
    return false;
  }

  const localStart = moment(scheduledAt).tz(timezone || 'Asia/Kolkata');
  if (!localStart.isValid()) return false;
  const workingStartMinutes = toMinutes(schedule.start);
  const workingEndMinutes = toMinutes(schedule.end);
  const requestedStartMinutes =
    localStart.hours() * 60
    + localStart.minutes()
    + localStart.seconds() / 60
    + localStart.milliseconds() / 60000;
  const localEnd = localStart.clone().add(durationMinutes, 'minutes');
  const requestedEndMinutes =
    localEnd.hours() * 60
    + localEnd.minutes()
    + localEnd.seconds() / 60
    + localEnd.milliseconds() / 60000;

  return workingEndMinutes > workingStartMinutes
    && localEnd.format('YYYY-MM-DD') === localStart.format('YYYY-MM-DD')
    && requestedStartMinutes >= workingStartMinutes
    && requestedEndMinutes <= workingEndMinutes;
};

const getPotentiallyBlockingBookingFilter = () => ({
  $or: [
    { status: { $in: [...ACTIVE_BOOKING_STATUSES] } },
    {
      paymentMethod: 'razorpay',
      paymentStatus: { $ne: 'refunded' },
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'needs_review',
    },
  ],
});

const buildBookingConflictQuery = ({
  counsellorId,
  scheduledAt,
  sessionDuration,
}) => {
  const requestedStart = new Date(scheduledAt);
  const requestedEnd = new Date(
    requestedStart.getTime() + Number(sessionDuration) * 60 * 1000
  );
  return {
    counsellor: counsellorId,
    scheduledAt: {
      $gte: new Date(
        requestedStart.getTime() - MAX_BOOKING_SESSION_MINUTES * 60 * 1000
      ),
      $lt: requestedEnd,
    },
    ...getPotentiallyBlockingBookingFilter(),
  };
};

const getLocalDaySchedule = (counsellor, date, timezone) => {
  const dayOfWeek = moment.tz(date, timezone).format('dddd').toLowerCase();
  return { dayOfWeek, schedule: counsellor.availability?.[dayOfWeek] };
};

const getSlotStatusForBooking = (booking, now = new Date()) => {
  if (!booking) return 'available';
  if (booking.bookingAuthorization?.status === 'needs_review') {
    return 'booked';
  }
  if (
    isUnpaidPaymentHold(booking)
    && booking.holdExpiresAt
    && new Date(booking.holdExpiresAt) > now
  ) {
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
  MAX_BOOKING_SESSION_MINUTES,
  ACTIVE_BOOKING_STATUSES,
  getPendingHoldExpiresAt,
  isUnpaidPaymentHold,
  isDirectlyCancellableUnpaidHold,
  isBlockingBooking,
  expireStalePendingBookings,
  isSessionWithinWorkingHours,
  getPotentiallyBlockingBookingFilter,
  buildBookingConflictQuery,
  generateAvailabilityForDate,
};
