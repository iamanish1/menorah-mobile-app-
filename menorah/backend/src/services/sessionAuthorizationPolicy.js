const {
  isBookingAuthorizationValid,
  isCounsellorAssignedAccessEligible,
} = require('./bookingMarketplacePolicy');

const CALL_BOOKING_STATUSES = Object.freeze(['confirmed', 'in-progress']);
const CHAT_BOOKING_STATUSES = Object.freeze(['confirmed', 'in-progress']);
const DEFAULT_CALL_JOIN_EARLY_MINUTES = 15;
const DEFAULT_CALL_JOIN_LATE_GRACE_MINUTES = 15;
const MAX_CALL_WINDOW_MINUTES = 120;

const isValidDate = (value) =>
  value instanceof Date && Number.isFinite(value.getTime());

const toValidDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return isValidDate(parsed) ? parsed : null;
};

const identifierString = (value) => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  if (value?._id && value._id !== value) return identifierString(value._id);
  if (value && typeof value.toString === 'function') {
    const result = value.toString();
    return result === '[object Object]' ? '' : String(result).trim();
  }
  return '';
};

const sameIdentifier = (left, right) => {
  const leftId = identifierString(left);
  const rightId = identifierString(right);
  return Boolean(leftId && rightId && leftId === rightId);
};

const readBoundedMinutes = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), MAX_CALL_WINDOW_MINUTES);
};

const readCallAccessWindow = (env = process.env) => Object.freeze({
  earlyMinutes: readBoundedMinutes(
    env.CALL_JOIN_EARLY_MINUTES,
    DEFAULT_CALL_JOIN_EARLY_MINUTES
  ),
  lateGraceMinutes: readBoundedMinutes(
    env.CALL_JOIN_LATE_GRACE_MINUTES,
    DEFAULT_CALL_JOIN_LATE_GRACE_MINUTES
  ),
});

const denied = (reason, extra = {}) => Object.freeze({
  allowed: false,
  reason,
  ...extra,
});

const allowed = (extra = {}) => Object.freeze({
  allowed: true,
  reason: null,
  ...extra,
});

const activeUserAccount = (account, expectedRole) => Boolean(
  account
  && typeof account === 'object'
  && account.isActive === true
  && account.role === expectedRole
  && identifierString(account._id)
);

const isCurrentBookingAuthorizationValid = (booking, now) => {
  if (!isBookingAuthorizationValid(booking, { now })) return false;

  if (booking.bookingAuthorization?.kind === 'subscription_entitlement') {
    const validUntil = toValidDate(booking.bookingAuthorization.validUntil);
    return Boolean(validUntil && validUntil > now);
  }

  return true;
};

const resolveBookingParticipants = (booking, now) => {
  const userAccount = booking?.user;
  const counsellor = booking?.counsellor;
  const counsellorAccount = counsellor?.user;

  if (!activeUserAccount(userAccount, 'user')) {
    return denied('BOOKING_USER_INACTIVE');
  }
  if (!activeUserAccount(counsellorAccount, 'counsellor')) {
    return denied('BOOKING_COUNSELLOR_ACCOUNT_INACTIVE');
  }
  if (!isCounsellorAssignedAccessEligible(counsellor, {
    account: counsellorAccount,
    now,
  })) {
    return denied('BOOKING_COUNSELLOR_NOT_APPROVED');
  }

  return allowed({
    userAccount,
    counsellor,
    counsellorAccount,
  });
};

const resolveParticipantRole = ({
  requesterUserId,
  userAccount,
  counsellorAccount,
}) => {
  if (sameIdentifier(requesterUserId, userAccount?._id)) return 'user';
  if (sameIdentifier(requesterUserId, counsellorAccount?._id)) return 'counsellor';
  return null;
};

const evaluateBookingAccessFoundation = ({
  booking,
  requesterUserId,
  now,
  allowedStatuses,
}) => {
  if (!isValidDate(now)) return denied('AUTHORIZATION_TIME_INVALID');
  if (!booking || typeof booking !== 'object') return denied('BOOKING_NOT_FOUND');

  const participants = resolveBookingParticipants(booking, now);
  if (!participants.allowed) return participants;

  const participantRole = resolveParticipantRole({
    requesterUserId,
    userAccount: participants.userAccount,
    counsellorAccount: participants.counsellorAccount,
  });
  if (!participantRole) return denied('BOOKING_PARTICIPANT_MISMATCH');

  if (!allowedStatuses.includes(booking.status)) {
    return denied('BOOKING_STATE_NOT_ACTIVE', { participantRole });
  }
  if (!isCurrentBookingAuthorizationValid(booking, now)) {
    return denied('BOOKING_AUTHORIZATION_NOT_CURRENT', { participantRole });
  }

  return allowed({
    participantRole,
    userAccount: participants.userAccount,
    counsellor: participants.counsellor,
    counsellorAccount: participants.counsellorAccount,
  });
};

const evaluateScheduledSessionAccess = ({
  booking,
  requesterUserId,
  now = new Date(),
  env = process.env,
  allowedSessionTypes = ['video', 'audio', 'chat'],
  allowedStatuses = CALL_BOOKING_STATUSES,
} = {}) => {
  const foundation = evaluateBookingAccessFoundation({
    booking,
    requesterUserId,
    now,
    allowedStatuses,
  });
  if (!foundation.allowed) return foundation;

  if (!allowedSessionTypes.includes(booking.sessionType)) {
    return denied('SESSION_TYPE_INVALID', {
      participantRole: foundation.participantRole,
    });
  }

  const scheduledAt = toValidDate(booking.scheduledAt);
  const durationMinutes = Number(booking.sessionDuration);
  if (
    !scheduledAt
    || !Number.isSafeInteger(durationMinutes)
    || durationMinutes < 15
    || durationMinutes > 180
  ) {
    return denied('CALL_SCHEDULE_INVALID', {
      participantRole: foundation.participantRole,
    });
  }

  const { earlyMinutes, lateGraceMinutes } = readCallAccessWindow(env);
  const opensAt = new Date(scheduledAt.getTime() - earlyMinutes * 60 * 1000);
  const closesAt = new Date(
    scheduledAt.getTime() + (durationMinutes + lateGraceMinutes) * 60 * 1000
  );

  if (now < opensAt) {
    return denied('CALL_TOO_EARLY', {
      participantRole: foundation.participantRole,
      opensAt,
      closesAt,
    });
  }
  if (now > closesAt) {
    return denied('CALL_TOO_LATE', {
      participantRole: foundation.participantRole,
      opensAt,
      closesAt,
    });
  }

  return allowed({
    ...foundation,
    opensAt,
    closesAt,
  });
};

const evaluateCallAccess = (input = {}) => {
  const access = evaluateScheduledSessionAccess({
    ...input,
    allowedSessionTypes: ['video', 'audio'],
  });
  if (access.reason === 'SESSION_TYPE_INVALID') {
    return denied('CALL_SESSION_TYPE_INVALID', {
      participantRole: access.participantRole,
    });
  }
  return access;
};

const evaluateChatRoomAccess = ({
  room,
  requesterUserId,
  now = new Date(),
} = {}) => {
  if (!isValidDate(now)) return denied('AUTHORIZATION_TIME_INVALID');
  if (!room || typeof room !== 'object') return denied('CHAT_ROOM_NOT_FOUND');
  if (room.isActive !== true) return denied('CHAT_ROOM_INACTIVE');

  const userAccount = room.user;
  const counsellor = room.counsellor;
  const counsellorAccount = counsellor?.user;
  if (!activeUserAccount(userAccount, 'user')) {
    return denied('CHAT_USER_INACTIVE');
  }
  if (!activeUserAccount(counsellorAccount, 'counsellor')) {
    return denied('CHAT_COUNSELLOR_ACCOUNT_INACTIVE');
  }
  if (!isCounsellorAssignedAccessEligible(counsellor, {
    account: counsellorAccount,
    now,
  })) {
    return denied('CHAT_COUNSELLOR_NOT_APPROVED');
  }

  const participantRole = resolveParticipantRole({
    requesterUserId,
    userAccount,
    counsellorAccount,
  });
  if (!participantRole) return denied('CHAT_PARTICIPANT_MISMATCH');

  if (room.booking !== undefined && room.booking !== null) {
    const booking = room.booking;
    if (!booking || typeof booking !== 'object' || !identifierString(booking._id)) {
      return denied('CHAT_BOOKING_UNAVAILABLE', { participantRole });
    }
    if (
      !sameIdentifier(booking.user, userAccount._id)
      || !sameIdentifier(booking.counsellor, counsellor._id)
    ) {
      return denied('CHAT_BOOKING_ASSIGNMENT_CHANGED', { participantRole });
    }
    if (!CHAT_BOOKING_STATUSES.includes(booking.status)) {
      return denied('CHAT_BOOKING_NOT_ACTIVE', { participantRole });
    }
    if (!isCurrentBookingAuthorizationValid(booking, now)) {
      return denied('CHAT_BOOKING_AUTHORIZATION_NOT_CURRENT', { participantRole });
    }
  }

  return allowed({
    participantRole,
    userAccount,
    counsellor,
    counsellorAccount,
  });
};

module.exports = {
  CALL_BOOKING_STATUSES,
  CHAT_BOOKING_STATUSES,
  DEFAULT_CALL_JOIN_EARLY_MINUTES,
  DEFAULT_CALL_JOIN_LATE_GRACE_MINUTES,
  evaluateCallAccess,
  evaluateChatRoomAccess,
  evaluateScheduledSessionAccess,
  identifierString,
  isCurrentBookingAuthorizationValid,
  readCallAccessWindow,
  sameIdentifier,
};
