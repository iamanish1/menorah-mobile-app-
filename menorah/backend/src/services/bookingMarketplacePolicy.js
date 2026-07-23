const SUPPORTED_CURRENCY = 'INR';
const MAX_SAFE_MINOR_AMOUNT = Number.MAX_SAFE_INTEGER;

const TERMINAL_BOOKING_STATUSES = Object.freeze([
  'completed',
  'cancelled',
  'no-show',
  'expired',
]);

const isValidDate = (value) =>
  value instanceof Date && Number.isFinite(value.getTime());

const requireValidNow = (now) => {
  if (!isValidDate(now)) {
    throw new TypeError('now must be a valid Date');
  }

  return new Date(now.getTime());
};

const toValidDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return isValidDate(parsed) ? parsed : null;
};

const isPositiveMinorAmount = (value) =>
  Number.isSafeInteger(value) && value > 0;

const isZeroMinorAmount = (value) =>
  Number.isSafeInteger(value) && value === 0;

const hasNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

const hasPositiveServerPrice = (booking) =>
  isPositiveMinorAmount(booking?.pricing?.listAmountMinor)
  && booking?.pricing?.currency === SUPPORTED_CURRENCY
  && booking?.currency === SUPPORTED_CURRENCY;

const truncateNumericField = (field) => ({
  $trunc: {
    $convert: {
      input: field,
      to: 'double',
      onError: null,
      onNull: null,
    },
  },
});

const hasCurrentAuthorizationSnapshot = (booking, now) => {
  const authorization = booking?.bookingAuthorization;
  const authorizedAt = toValidDate(authorization?.authorizedAt);

  return authorization?.status === 'authorized'
    && hasNonEmptyString(authorization.reference)
    && authorizedAt !== null
    && authorizedAt <= now;
};

const isAuthorizedPayment = (booking, now) =>
  hasCurrentAuthorizationSnapshot(booking, now)
  && booking.bookingAuthorization.kind === 'payment'
  && booking.paymentStatus === 'paid'
  && booking.paymentMethod === 'razorpay'
  && booking.isSubscriptionBooking !== true
  && hasNonEmptyString(booking.paymentId)
  && hasNonEmptyString(booking.razorpayOrderId)
  && hasNonEmptyString(booking.transactionId)
  && booking.transactionId === booking.razorpayOrderId
  && booking.orderStatus === 'paid'
  && booking.bookingAuthorization.reference === booking.paymentId
  && isPositiveMinorAmount(booking.amountMinor)
  && booking.amountMinor === booking.pricing?.listAmountMinor
  && hasPositiveServerPrice(booking);

const isAuthorizedSubscription = (booking, now) => {
  const authorizedAt = toValidDate(booking?.bookingAuthorization?.authorizedAt);
  const validUntil = toValidDate(booking?.bookingAuthorization?.validUntil);

  return hasCurrentAuthorizationSnapshot(booking, now)
    && booking.bookingAuthorization.kind === 'subscription_entitlement'
    && booking.paymentStatus === 'paid'
    && booking.paymentMethod === 'subscription'
    && booking.isSubscriptionBooking === true
    && isZeroMinorAmount(booking.amountMinor)
    && hasPositiveServerPrice(booking)
    && validUntil !== null
    && authorizedAt !== null
    && validUntil > authorizedAt;
};

const isBookingAuthorizationValid = (booking, { now = new Date() } = {}) => {
  const effectiveNow = requireValidNow(now);

  if (!booking || typeof booking !== 'object') return false;

  return isAuthorizedPayment(booking, effectiveNow)
    || isAuthorizedSubscription(booking, effectiveNow);
};

const buildAuthorizationQuery = (now) => ({
  $or: [
    {
      paymentStatus: 'paid',
      paymentMethod: 'razorpay',
      isSubscriptionBooking: { $ne: true },
      paymentId: { $type: 'string', $regex: /\S/ },
      razorpayOrderId: { $type: 'string', $regex: /\S/ },
      transactionId: { $type: 'string', $regex: /\S/ },
      orderStatus: 'paid',
      amountMinor: { $type: 'number', $gt: 0, $lte: MAX_SAFE_MINOR_AMOUNT },
      currency: SUPPORTED_CURRENCY,
      'pricing.listAmountMinor': {
        $type: 'number',
        $gt: 0,
        $lte: MAX_SAFE_MINOR_AMOUNT,
      },
      'pricing.currency': SUPPORTED_CURRENCY,
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'authorized',
      'bookingAuthorization.reference': { $type: 'string', $regex: /\S/ },
      'bookingAuthorization.authorizedAt': { $type: 'date', $lte: now },
      $expr: {
        $and: [
          { $eq: ['$bookingAuthorization.reference', '$paymentId'] },
          { $eq: ['$transactionId', '$razorpayOrderId'] },
          { $eq: ['$amountMinor', '$pricing.listAmountMinor'] },
          { $eq: ['$amountMinor', truncateNumericField('$amountMinor')] },
          {
            $eq: [
              '$pricing.listAmountMinor',
              truncateNumericField('$pricing.listAmountMinor'),
            ],
          },
        ],
      },
    },
    {
      paymentStatus: 'paid',
      paymentMethod: 'subscription',
      isSubscriptionBooking: true,
      amountMinor: 0,
      currency: SUPPORTED_CURRENCY,
      'pricing.listAmountMinor': {
        $type: 'number',
        $gt: 0,
        $lte: MAX_SAFE_MINOR_AMOUNT,
      },
      'pricing.currency': SUPPORTED_CURRENCY,
      'bookingAuthorization.kind': 'subscription_entitlement',
      'bookingAuthorization.status': 'authorized',
      'bookingAuthorization.reference': { $type: 'string', $regex: /\S/ },
      'bookingAuthorization.authorizedAt': { $type: 'date', $lte: now },
      'bookingAuthorization.validUntil': { $type: 'date' },
      $expr: {
        $and: [
          {
            $eq: [
              '$pricing.listAmountMinor',
              truncateNumericField('$pricing.listAmountMinor'),
            ],
          },
          {
            $gt: [
              '$bookingAuthorization.validUntil',
              '$bookingAuthorization.authorizedAt',
            ],
          },
        ],
      },
    },
  ],
});

const buildBookingAuthorizationQuery = ({ now = new Date() } = {}) =>
  buildAuthorizationQuery(requireValidNow(now));

const buildUnassignedMarketplaceQuery = ({ now = new Date() } = {}) => {
  const effectiveNow = requireValidNow(now);

  return {
    counsellor: null,
    status: 'confirmed',
    scheduledAt: { $type: 'date', $gt: effectiveNow },
    ...buildBookingAuthorizationQuery({ now: effectiveNow }),
  };
};

const normalizeMatchableCounsellorGender = (value) =>
  value === 'male' || value === 'female' ? value : null;

const buildCounsellorPreferenceQuery = ({ counsellorGender } = {}) => {
  const normalizedGender = normalizeMatchableCounsellorGender(counsellorGender);
  const genderClauses = [
    { 'preferences.gender': 'any' },
    { 'preferences.gender': { $exists: false } },
    { 'preferences.gender': null },
  ];

  if (normalizedGender) {
    genderClauses.unshift({ 'preferences.gender': normalizedGender });
  }

  return { $or: genderClauses };
};

const doesBookingMatchCounsellorPreferences = (
  booking,
  { counsellorGender } = {}
) => {
  const requestedGender = booking?.preferences?.gender;
  if (requestedGender === undefined || requestedGender === null || requestedGender === 'any') {
    return true;
  }

  return requestedGender === normalizeMatchableCounsellorGender(counsellorGender);
};

const buildCounsellorMarketplaceBookingQuery = ({
  now = new Date(),
  counsellorGender,
} = {}) => {
  const marketplaceQuery = buildUnassignedMarketplaceQuery({ now });
  const authorizationClauses = marketplaceQuery.$or;
  delete marketplaceQuery.$or;

  return {
    ...marketplaceQuery,
    $and: [
      { $or: authorizationClauses },
      buildCounsellorPreferenceQuery({ counsellorGender }),
    ],
  };
};

const isUnassignedMarketplaceBookingEligible = (
  booking,
  { now = new Date() } = {}
) => {
  const effectiveNow = requireValidNow(now);

  if (!booking || typeof booking !== 'object') return false;
  if (booking.counsellor !== undefined && booking.counsellor !== null) return false;
  if (booking.status !== 'confirmed') return false;

  const scheduledAt = toValidDate(booking.scheduledAt);
  if (scheduledAt === null || scheduledAt <= effectiveNow) return false;

  return isBookingAuthorizationValid(booking, { now: effectiveNow });
};

const isCounsellorMarketplaceEligible = (
  counsellor,
  { requireAvailability = true } = {}
) => Boolean(
  counsellor
  && counsellor.isActive === true
  && counsellor.isVerified === true
  && counsellor.status === 'approved'
  && hasNonEmptyString(counsellor.profileImage)
  && hasNonEmptyString(counsellor.voiceIntroUrl)
  && (!requireAvailability || counsellor.isAvailable === true)
);

const isCounsellorAssignedAccessEligible = (counsellor) => Boolean(
  counsellor
  && counsellor.isActive === true
  && counsellor.isVerified === true
  && counsellor.status === 'approved'
);

const buildEligibleCounsellorMarketplaceQuery = () => ({
  isActive: true,
  isAvailable: true,
  isVerified: true,
  status: 'approved',
  profileImage: { $type: 'string', $regex: /\S/ },
  voiceIntroUrl: { $type: 'string', $regex: /\S/ },
});

module.exports = {
  SUPPORTED_CURRENCY,
  MAX_SAFE_MINOR_AMOUNT,
  TERMINAL_BOOKING_STATUSES,
  buildBookingAuthorizationQuery,
  buildCounsellorMarketplaceBookingQuery,
  buildCounsellorPreferenceQuery,
  buildEligibleCounsellorMarketplaceQuery,
  buildUnassignedMarketplaceQuery,
  doesBookingMatchCounsellorPreferences,
  isBookingAuthorizationValid,
  isCounsellorAssignedAccessEligible,
  isCounsellorMarketplaceEligible,
  isUnassignedMarketplaceBookingEligible,
};
