const {
  buildBookingAuthorizationQuery,
  buildCounsellorMarketplaceBookingQuery,
  buildCounsellorPreferenceQuery,
  buildEligibleCounsellorAssignedAccessQuery,
  buildEligibleCounsellorMarketplaceQuery,
  buildUnassignedMarketplaceQuery,
  doesBookingMatchCounsellorPreferences,
  isBookingAuthorizationValid,
  isCounsellorAssignedAccessEligible,
  isCounsellorMarketplaceEligible,
  isUnassignedMarketplaceBookingEligible,
} = require('../bookingMarketplacePolicy');
const {
  TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION,
  TEST_COUNSELLOR_NOTICE_URL,
  TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  installCounsellorVerificationTestConfig,
  withCurrentProfessionalApproval,
} = require('../../testUtils/counsellorVerification');

installCounsellorVerificationTestConfig();

const NOW = new Date('2026-07-23T08:00:00.000Z');
const VERIFICATION_CONFIG = Object.freeze({
  configured: true,
  verificationConfigured: true,
  onboardingConsentVersion: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  credentialPolicyVersion: TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION,
  onboardingNoticeUrl: TEST_COUNSELLOR_NOTICE_URL,
  invalidFields: Object.freeze([]),
});

const paymentBooking = (overrides = {}) => ({
  counsellor: null,
  status: 'confirmed',
  scheduledAt: new Date('2026-07-24T08:00:00.000Z'),
  amountMinor: 100000,
  currency: 'INR',
  pricing: {
    listAmountMinor: 100000,
    currency: 'INR',
  },
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  paymentId: 'pay_test_123',
  razorpayOrderId: 'order_test_123',
  transactionId: 'order_test_123',
  orderStatus: 'paid',
  isSubscriptionBooking: false,
  bookingAuthorization: {
    kind: 'payment',
    status: 'authorized',
    reference: 'pay_test_123',
    authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
  },
  ...overrides,
});

const subscriptionBooking = (overrides = {}) => paymentBooking({
  amountMinor: 0,
  paymentMethod: 'subscription',
  isSubscriptionBooking: true,
  bookingAuthorization: {
    kind: 'subscription_entitlement',
    status: 'authorized',
    reference: 'monthly:2026-07-01T00:00:00.000Z',
    authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
    validUntil: new Date('2026-08-01T00:00:00.000Z'),
  },
  ...overrides,
});

describe('bookingMarketplacePolicy', () => {
  test('builds a reusable exact authorization predicate', () => {
    const query = buildBookingAuthorizationQuery({ now: NOW });

    expect(query.$or).toHaveLength(2);
    expect(query.$or[0]).toEqual(expect.objectContaining({
      paymentId: { $type: 'string', $regex: /\S/ },
      razorpayOrderId: { $type: 'string', $regex: /\S/ },
      transactionId: { $type: 'string', $regex: /\S/ },
      orderStatus: 'paid',
      amountMinor: {
        $type: 'number',
        $gt: 0,
        $lte: Number.MAX_SAFE_INTEGER,
      },
      $expr: {
        $and: [
          { $eq: ['$bookingAuthorization.reference', '$paymentId'] },
          { $eq: ['$transactionId', '$razorpayOrderId'] },
          { $eq: ['$amountMinor', '$pricing.listAmountMinor'] },
          {
            $eq: ['$amountMinor', {
              $trunc: {
                $convert: {
                  input: '$amountMinor',
                  to: 'double',
                  onError: null,
                  onNull: null,
                },
              },
            }],
          },
          {
            $eq: [
              '$pricing.listAmountMinor',
              {
                $trunc: {
                  $convert: {
                    input: '$pricing.listAmountMinor',
                    to: 'double',
                    onError: null,
                    onNull: null,
                  },
                },
              },
            ],
          },
        ],
      },
    }));
    expect(query.$or[1]).toEqual(expect.objectContaining({
      'bookingAuthorization.validUntil': { $type: 'date' },
      $expr: expect.objectContaining({ $and: expect.any(Array) }),
    }));
  });

  describe('buildUnassignedMarketplaceQuery', () => {
    test('builds the shared fail-closed marketplace and atomic-acceptance predicate', () => {
      expect(buildUnassignedMarketplaceQuery({ now: NOW })).toEqual({
        counsellor: null,
        status: 'confirmed',
        scheduledAt: { $type: 'date', $gt: NOW },
        $or: [
          expect.objectContaining({
              paymentStatus: 'paid',
              paymentMethod: 'razorpay',
              paymentId: { $type: 'string', $regex: /\S/ },
              razorpayOrderId: { $type: 'string', $regex: /\S/ },
              transactionId: { $type: 'string', $regex: /\S/ },
              orderStatus: 'paid',
              amountMinor: {
                $type: 'number',
                $gt: 0,
                $lte: Number.MAX_SAFE_INTEGER,
              },
            'bookingAuthorization.kind': 'payment',
            'bookingAuthorization.status': 'authorized',
          }),
          expect.objectContaining({
            paymentStatus: 'paid',
            paymentMethod: 'subscription',
            amountMinor: 0,
            isSubscriptionBooking: true,
            'pricing.listAmountMinor': {
              $type: 'number',
              $gt: 0,
              $lte: Number.MAX_SAFE_INTEGER,
            },
            'bookingAuthorization.kind': 'subscription_entitlement',
            'bookingAuthorization.status': 'authorized',
            'bookingAuthorization.validUntil': { $type: 'date' },
          }),
        ],
      });
    });

    test('takes a defensive copy of now and rejects invalid clocks', () => {
      const mutableNow = new Date(NOW);
      const query = buildUnassignedMarketplaceQuery({ now: mutableNow });
      mutableNow.setUTCFullYear(2030);

      expect(query.scheduledAt.$gt).toEqual(NOW);
      expect(() => buildUnassignedMarketplaceQuery({ now: new Date('invalid') }))
        .toThrow('now must be a valid Date');
    });
  });

  describe('booking authorization', () => {
    test('accepts reconciled payment and explicit current subscription snapshots', () => {
      expect(isBookingAuthorizationValid(paymentBooking(), { now: NOW })).toBe(true);
      expect(isBookingAuthorizationValid(subscriptionBooking(), { now: NOW })).toBe(true);
    });

    test('keeps a consumed subscription booking authorization durable after plan expiry', () => {
      expect(isBookingAuthorizationValid(subscriptionBooking({
        bookingAuthorization: {
          kind: 'subscription_entitlement',
          status: 'authorized',
          reference: 'monthly:consumed-booking',
          authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
          validUntil: new Date('2026-07-23T07:30:00.000Z'),
        },
      }), { now: NOW })).toBe(true);
    });

    test.each([
      ['missing authorization', { bookingAuthorization: undefined }],
      ['pending authorization', { bookingAuthorization: { kind: 'payment', status: 'pending' } }],
      ['future authorization timestamp', {
        bookingAuthorization: {
          kind: 'payment',
          status: 'authorized',
          reference: 'pay_test_123',
          authorizedAt: new Date('2026-07-23T09:00:00.000Z'),
        },
      }],
      ['unpaid', { paymentStatus: 'pending' }],
      ['failed payment', { paymentStatus: 'failed' }],
      ['refunded payment', { paymentStatus: 'refunded' }],
      ['missing payment identifier', { paymentId: undefined }],
      ['mismatched payment identifier', { paymentId: 'pay_other' }],
      ['missing provider order identifier', { razorpayOrderId: undefined }],
      ['missing bound transaction identifier', { transactionId: undefined }],
      ['mismatched bound order identifier', { transactionId: 'order_other' }],
      ['non-paid provider order', { orderStatus: 'attempted' }],
      ['mismatched paid amount', { amountMinor: 99999 }],
      ['fractional paid amount', { amountMinor: 100000.5 }],
      ['unsafe paid amount', {
        amountMinor: Number.MAX_SAFE_INTEGER + 1,
        pricing: {
          listAmountMinor: Number.MAX_SAFE_INTEGER + 1,
          currency: 'INR',
        },
      }],
      ['zero-value payment', { amountMinor: 0 }],
      ['promo record', { paymentMethod: 'promo' }],
      ['generic free record', { paymentMethod: 'razorpay', amountMinor: 0 }],
      ['unsupported currency', { currency: 'USD' }],
      ['missing server price', { pricing: undefined }],
    ])('rejects %s', (_label, overrides) => {
      expect(isBookingAuthorizationValid(paymentBooking(overrides), { now: NOW })).toBe(false);
    });

    test.each([
      ['missing entitlement flag', { isSubscriptionBooking: false }],
      ['wrong authorization kind', {
        bookingAuthorization: {
          kind: 'payment',
          status: 'authorized',
          reference: 'pay_test_123',
          authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
        },
      }],
      ['positive charged amount', { amountMinor: 1 }],
      ['entitlement that expired before authorization', {
        bookingAuthorization: {
          kind: 'subscription_entitlement',
          status: 'authorized',
          reference: 'monthly:test',
          authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
          validUntil: new Date('2026-07-23T06:59:59.999Z'),
        },
      }],
    ])('rejects subscription with %s', (_label, overrides) => {
      expect(isBookingAuthorizationValid(subscriptionBooking(overrides), { now: NOW })).toBe(false);
    });
  });

  describe('counsellor preference matching', () => {
    test('builds one shared gender-matching query around the authorization predicate', () => {
      const query = buildCounsellorMarketplaceBookingQuery({
        now: NOW,
        counsellorGender: 'female',
      });

      expect(query).toEqual(expect.objectContaining({
        counsellor: null,
        status: 'confirmed',
        scheduledAt: { $type: 'date', $gt: NOW },
        $and: [
          { $or: expect.any(Array) },
          buildCounsellorPreferenceQuery({ counsellorGender: 'female' }),
        ],
      }));
      expect(query.$and[1].$or[0]).toEqual({ 'preferences.gender': 'female' });
    });

    test.each([
      ['matching female preference', 'female', 'female', true],
      ['mismatched female preference', 'female', 'male', false],
      ['matching male preference', 'male', 'male', true],
      ['any preference', 'any', 'prefer-not-to-say', true],
      ['missing preference', undefined, undefined, true],
      ['specific preference without matchable gender', 'female', 'other', false],
    ])('%s', (_label, requestedGender, counsellorGender, expected) => {
      expect(doesBookingMatchCounsellorPreferences(
        { preferences: { gender: requestedGender } },
        { counsellorGender }
      )).toBe(expected);
    });
  });

  describe('unassigned booking eligibility', () => {
    test('accepts only unassigned, future, confirmed, explicitly authorized bookings', () => {
      expect(isUnassignedMarketplaceBookingEligible(paymentBooking(), { now: NOW })).toBe(true);
      expect(isUnassignedMarketplaceBookingEligible(subscriptionBooking(), { now: NOW })).toBe(true);
    });

    test.each([
      ['assigned', { counsellor: '64f000000000000000000001' }],
      ['pending', { status: 'pending' }],
      ['in progress', { status: 'in-progress' }],
      ['completed', { status: 'completed' }],
      ['cancelled', { status: 'cancelled' }],
      ['no-show', { status: 'no-show' }],
      ['expired', { status: 'expired' }],
      ['at the current time', { scheduledAt: NOW }],
      ['past', { scheduledAt: new Date('2026-07-23T07:59:59.999Z') }],
      ['invalid schedule', { scheduledAt: 'not-a-date' }],
      ['refunded', { paymentStatus: 'refunded' }],
    ])('rejects a %s booking', (_label, overrides) => {
      expect(isUnassignedMarketplaceBookingEligible(paymentBooking(overrides), { now: NOW }))
        .toBe(false);
    });
  });

  describe('counsellor eligibility', () => {
    const approved = withCurrentProfessionalApproval({
      user: '64f000000000000000000030',
      isActive: true,
      isAvailable: true,
      isVerified: true,
      status: 'approved',
      profileImage: 'https://cdn.example.test/profile.jpg',
      voiceIntroUrl: 'https://cdn.example.test/voice.webm',
    }, { populateUser: true });

    test('provides the socket/list query and matching pure evaluator', () => {
      expect(buildEligibleCounsellorMarketplaceQuery({
        now: NOW,
        config: VERIFICATION_CONFIG,
      })).toEqual(expect.objectContaining({
        isActive: true,
        isAvailable: true,
        status: 'approved',
        user: { $type: 'objectId' },
        'professionalVerification.application': { $type: 'objectId' },
        'professionalVerification.legacyReviewRequired': false,
        profileImage: { $type: 'string', $regex: /\S/ },
        voiceIntroUrl: { $type: 'string', $regex: /\S/ },
      }));
      expect(isCounsellorMarketplaceEligible(approved, {
        now: NOW,
        config: VERIFICATION_CONFIG,
      })).toBe(true);
    });

    test.each([
      ['inactive', { isActive: false }],
      ['unavailable', { isAvailable: false }],
      ['not approved', { status: 'pending' }],
      ['missing profile image', { profileImage: null }],
      ['missing voice intro', { voiceIntroUrl: '' }],
    ])('rejects %s counsellors', (_label, overrides) => {
      expect(isCounsellorMarketplaceEligible(
        { ...approved, ...overrides },
        { now: NOW, config: VERIFICATION_CONFIG }
      )).toBe(false);
    });

    test('does not let the retired isVerified flag grant or revoke access', () => {
      expect(isCounsellorMarketplaceEligible(
        { ...approved, isVerified: false },
        { now: NOW, config: VERIFICATION_CONFIG }
      )).toBe(true);
    });

    test('can evaluate view access without requiring current availability', () => {
      expect(isCounsellorMarketplaceEligible(
        { ...approved, isAvailable: false },
        { requireAvailability: false, now: NOW, config: VERIFICATION_CONFIG }
      )).toBe(true);
    });

    test('assigned access requires current approval but not marketplace availability or media', () => {
      expect(buildEligibleCounsellorAssignedAccessQuery({
        now: NOW,
        config: VERIFICATION_CONFIG,
      })).toEqual(expect.objectContaining({
        isActive: true,
        status: 'approved',
        user: { $type: 'objectId' },
        'professionalVerification.application': { $type: 'objectId' },
        'professionalVerification.legacyReviewRequired': false,
      }));
      expect(buildEligibleCounsellorAssignedAccessQuery({
        now: NOW,
        config: VERIFICATION_CONFIG,
      })).not.toHaveProperty('isAvailable');

      expect(isCounsellorAssignedAccessEligible({
        ...approved,
        isAvailable: false,
        profileImage: null,
        voiceIntroUrl: null,
      }, { now: NOW, config: VERIFICATION_CONFIG })).toBe(true);
      expect(isCounsellorAssignedAccessEligible({
        ...approved,
        status: 'rejected',
      }, { now: NOW, config: VERIFICATION_CONFIG })).toBe(false);
      expect(isCounsellorAssignedAccessEligible({
        ...approved,
        isActive: false,
      }, { now: NOW, config: VERIFICATION_CONFIG })).toBe(false);
    });
  });
});
