const {
  evaluateCallAccess,
  evaluateChatRoomAccess,
  readCallAccessWindow,
} = require('../sessionAuthorizationPolicy');

const USER_ID = '64f000000000000000000001';
const COUNSELLOR_ID = '64f000000000000000000002';
const COUNSELLOR_USER_ID = '64f000000000000000000003';
const APPLICATION_ID = '64f000000000000000000004';
const ADMIN_ID = '64f000000000000000000005';
const BOOKING_ID = '64f000000000000000000006';
const ROOM_ID = '64f000000000000000000007';
const PAYMENT_ID = 'pay_current';
const ORDER_ID = 'order_current';
const NOW = new Date('2026-07-23T10:00:00.000Z');

const currentConfig = {
  configured: true,
  verificationConfigured: true,
  onboardingConsentVersion: 'consent-v1',
  credentialPolicyVersion: 'credential-v1',
};

const approvedCounsellor = () => ({
  _id: COUNSELLOR_ID,
  user: {
    _id: COUNSELLOR_USER_ID,
    role: 'counsellor',
    isActive: true,
  },
  status: 'approved',
  isActive: true,
  professionalVerification: {
    schemaVersion: 1,
    legacyReviewRequired: false,
    application: APPLICATION_ID,
    onboardingConsent: {
      accepted: true,
      version: currentConfig.onboardingConsentVersion,
      acceptedAt: new Date('2026-07-01T00:00:00.000Z'),
      source: 'counsellor_web_registration',
    },
    credentialReview: {
      decision: 'approved',
      policyVersion: currentConfig.credentialPolicyVersion,
      evidenceIds: ['64f000000000000000000008'],
      reviewedBy: ADMIN_ID,
      reviewedAt: new Date('2026-07-01T00:00:00.000Z'),
    },
    approvedBy: ADMIN_ID,
    approvedAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: new Date('2027-07-01T00:00:00.000Z'),
  },
});

const authorizedBooking = (overrides = {}) => ({
  _id: BOOKING_ID,
  user: {
    _id: USER_ID,
    role: 'user',
    isActive: true,
  },
  counsellor: approvedCounsellor(),
  status: 'confirmed',
  sessionType: 'video',
  scheduledAt: NOW,
  sessionDuration: 50,
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  isSubscriptionBooking: false,
  paymentId: PAYMENT_ID,
  razorpayOrderId: ORDER_ID,
  transactionId: ORDER_ID,
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
    reference: PAYMENT_ID,
    authorizedAt: new Date('2026-07-22T00:00:00.000Z'),
  },
  ...overrides,
});

const authorizedRoom = (overrides = {}) => {
  const booking = authorizedBooking();
  return {
    _id: ROOM_ID,
    user: booking.user,
    counsellor: booking.counsellor,
    booking: {
      ...booking,
      user: USER_ID,
      counsellor: COUNSELLOR_ID,
    },
    isActive: true,
    ...overrides,
  };
};

const entitledBooking = (validUntil) => authorizedBooking({
  paymentMethod: 'subscription',
  isSubscriptionBooking: true,
  paymentId: undefined,
  razorpayOrderId: undefined,
  transactionId: undefined,
  orderStatus: undefined,
  amountMinor: 0,
  bookingAuthorization: {
    kind: 'subscription_entitlement',
    status: 'authorized',
    reference: 'subscription-current',
    authorizedAt: new Date('2026-07-22T00:00:00.000Z'),
    validUntil,
  },
});

const callAccess = (booking, requesterUserId = USER_ID, now = NOW) =>
  evaluateCallAccess({
    booking,
    requesterUserId,
    now,
    env: {
      CALL_JOIN_EARLY_MINUTES: '15',
      CALL_JOIN_LATE_GRACE_MINUTES: '15',
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: currentConfig.onboardingConsentVersion,
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: currentConfig.credentialPolicyVersion,
    },
  });

describe('session authorization policy', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: currentConfig.onboardingConsentVersion,
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: currentConfig.credentialPolicyVersion,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('allows only the exact assigned user or exact approved counsellor', () => {
    expect(callAccess(authorizedBooking(), USER_ID)).toMatchObject({
      allowed: true,
      participantRole: 'user',
    });
    expect(callAccess(authorizedBooking(), COUNSELLOR_USER_ID)).toMatchObject({
      allowed: true,
      participantRole: 'counsellor',
    });
    expect(callAccess(
      authorizedBooking(),
      '64f000000000000000000099'
    )).toMatchObject({
      allowed: false,
      reason: 'BOOKING_PARTICIPANT_MISMATCH',
    });
  });

  test.each([
    ['cancelled', { status: 'cancelled' }, 'BOOKING_STATE_NOT_ACTIVE'],
    ['completed', { status: 'completed' }, 'BOOKING_STATE_NOT_ACTIVE'],
    ['no-show', { status: 'no-show' }, 'BOOKING_STATE_NOT_ACTIVE'],
    ['expired', { status: 'expired' }, 'BOOKING_STATE_NOT_ACTIVE'],
    ['refunded', { paymentStatus: 'refunded' }, 'BOOKING_AUTHORIZATION_NOT_CURRENT'],
    [
      'revoked',
      { bookingAuthorization: { kind: 'payment', status: 'revoked' } },
      'BOOKING_AUTHORIZATION_NOT_CURRENT',
    ],
  ])('denies %s call bookings', (_label, override, reason) => {
    expect(callAccess(authorizedBooking(override))).toMatchObject({
      allowed: false,
      reason,
    });
  });

  test('enforces separate early and late call boundaries', () => {
    const booking = authorizedBooking();
    expect(callAccess(
      booking,
      USER_ID,
      new Date('2026-07-23T09:44:59.999Z')
    )).toMatchObject({ allowed: false, reason: 'CALL_TOO_EARLY' });
    expect(callAccess(
      booking,
      USER_ID,
      new Date('2026-07-23T11:05:00.001Z')
    )).toMatchObject({ allowed: false, reason: 'CALL_TOO_LATE' });
  });

  test('does not issue call access for chat-only bookings', () => {
    expect(callAccess(authorizedBooking({ sessionType: 'chat' }))).toMatchObject({
      allowed: false,
      reason: 'CALL_SESSION_TYPE_INVALID',
    });
  });

  test('requires a subscription entitlement to remain current at access time', () => {
    expect(callAccess(entitledBooking(
      new Date('2026-07-24T00:00:00.000Z')
    ))).toMatchObject({ allowed: true });
    expect(callAccess(entitledBooking(
      new Date('2026-07-23T09:59:59.999Z')
    ))).toMatchObject({
      allowed: false,
      reason: 'BOOKING_AUTHORIZATION_NOT_CURRENT',
    });
  });

  test('clamps explicit call window configuration', () => {
    expect(readCallAccessWindow({
      CALL_JOIN_EARLY_MINUTES: '-4',
      CALL_JOIN_LATE_GRACE_MINUTES: '999',
    })).toEqual({
      earlyMinutes: 0,
      lateGraceMinutes: 120,
    });
  });

  test.each([
    [
      'suspended counsellor',
      () => {
        const room = authorizedRoom();
        room.counsellor.status = 'suspended';
        return room;
      },
      'CHAT_COUNSELLOR_NOT_APPROVED',
    ],
    [
      'deactivated counsellor account',
      () => {
        const room = authorizedRoom();
        room.counsellor.user.isActive = false;
        return room;
      },
      'CHAT_COUNSELLOR_ACCOUNT_INACTIVE',
    ],
    [
      'deleted user account',
      () => ({ ...authorizedRoom(), user: null }),
      'CHAT_USER_INACTIVE',
    ],
    [
      'cancelled booking',
      () => {
        const room = authorizedRoom();
        room.booking.status = 'cancelled';
        return room;
      },
      'CHAT_BOOKING_NOT_ACTIVE',
    ],
    [
      'refunded booking',
      () => {
        const room = authorizedRoom();
        room.booking.paymentStatus = 'refunded';
        return room;
      },
      'CHAT_BOOKING_AUTHORIZATION_NOT_CURRENT',
    ],
    [
      'reassigned booking',
      () => {
        const room = authorizedRoom();
        room.booking.counsellor = '64f000000000000000000099';
        return room;
      },
      'CHAT_BOOKING_ASSIGNMENT_CHANGED',
    ],
  ])('denies a room after %s', (_label, makeRoom, reason) => {
    expect(evaluateChatRoomAccess({
      room: makeRoom(),
      requesterUserId: USER_ID,
      now: NOW,
    })).toMatchObject({
      allowed: false,
      reason,
    });
  });

  test('allows an active non-booking room only for its current participants', () => {
    const room = authorizedRoom({ booking: null });
    expect(evaluateChatRoomAccess({
      room,
      requesterUserId: COUNSELLOR_USER_ID,
      now: NOW,
    })).toMatchObject({
      allowed: true,
      participantRole: 'counsellor',
    });
    expect(evaluateChatRoomAccess({
      room,
      requesterUserId: '64f000000000000000000099',
      now: NOW,
    })).toMatchObject({
      allowed: false,
      reason: 'CHAT_PARTICIPANT_MISMATCH',
    });
  });
});
