const SUPPORTED_CURRENCY = 'INR';
const MIN_SESSION_DURATION_MINUTES = 15;
const MAX_SESSION_DURATION_MINUTES = 180;
const MINOR_UNITS_PER_MAJOR = 100;

const CLIENT_CONTROLLED_PRICING_FIELDS = new Set([
  'amount',
  'amountMinor',
  'amountPaise',
  'price',
  'priceMinor',
  'pricePaise',
  'currency',
  'subtotal',
  'total',
  'discount',
  'discountAmount',
  'discountCode',
  'coupon',
  'couponCode',
  'promo',
  'promoCode',
  'free',
  'isFree',
  'paymentMethod',
  'paymentStatus',
  'pricing',
  'pricingVersion',
  'priceSource',
]);

class BookingPricingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BookingPricingError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => {
  throw new BookingPricingError(code, message, details);
};

const isRecord = (value) => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const assertClientDoesNotControlPricing = (clientInput) => {
  if (!isRecord(clientInput)) {
    fail('INVALID_CLIENT_INPUT', 'Booking request must be an object.');
  }

  const seen = new WeakSet();
  const pending = [{ value: clientInput, path: 'bookingRequest' }];

  while (pending.length > 0) {
    const { value, path } = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);

    for (const [key, nestedValue] of Object.entries(value)) {
      const fieldPath = `${path}.${key}`;
      if (CLIENT_CONTROLLED_PRICING_FIELDS.has(key)) {
        fail(
          'CLIENT_PRICING_FIELD_FORBIDDEN',
          `Client-controlled pricing field '${fieldPath}' is not allowed.`,
          { field: fieldPath }
        );
      }

      if (nestedValue && typeof nestedValue === 'object') {
        pending.push({ value: nestedValue, path: fieldPath });
      }
    }
  }
};

const validateSessionDuration = (sessionDuration) => {
  if (
    !Number.isSafeInteger(sessionDuration)
    || sessionDuration < MIN_SESSION_DURATION_MINUTES
    || sessionDuration > MAX_SESSION_DURATION_MINUTES
  ) {
    fail(
      'INVALID_SESSION_DURATION',
      `Session duration must be an integer between ${MIN_SESSION_DURATION_MINUTES} and ${MAX_SESSION_DURATION_MINUTES} minutes.`
    );
  }
  return sessionDuration;
};

const validateCurrency = (currency, source) => {
  if (currency !== SUPPORTED_CURRENCY) {
    fail(
      'UNSUPPORTED_CURRENCY',
      `${source} currency must be ${SUPPORTED_CURRENCY}.`,
      { currency }
    );
  }
  return currency;
};

const majorToMinor = (amount, source) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    fail('INVALID_SERVER_PRICE', `${source} amount must be a positive finite number.`);
  }

  const amountMinor = Math.round(amount * MINOR_UNITS_PER_MAJOR);
  if (
    !Number.isSafeInteger(amountMinor)
    || amountMinor <= 0
    || Math.abs((amountMinor / MINOR_UNITS_PER_MAJOR) - amount) > Number.EPSILON * Math.max(1, amount)
  ) {
    fail('INVALID_SERVER_PRICE', `${source} amount must have no more than two decimal places.`);
  }

  return amountMinor;
};

const minorToMajor = (amountMinor) => amountMinor / MINOR_UNITS_PER_MAJOR;

const validateCatalogEntry = (serviceCode, entry) => {
  if (!isRecord(entry)) {
    fail('INVALID_SERVICE_CATALOG', `Catalog entry '${serviceCode}' must be an object.`);
  }

  const { durationMinutes, amountMinor, currency } = entry;
  if (
    !Number.isSafeInteger(durationMinutes)
    || durationMinutes < MIN_SESSION_DURATION_MINUTES
    || durationMinutes > MAX_SESSION_DURATION_MINUTES
  ) {
    fail(
      'INVALID_SERVICE_CATALOG',
      `Catalog entry '${serviceCode}' must define a durationMinutes between ${MIN_SESSION_DURATION_MINUTES} and ${MAX_SESSION_DURATION_MINUTES}.`
    );
  }

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    fail(
      'INVALID_SERVICE_CATALOG',
      `Catalog entry '${serviceCode}' must define a positive integer amountMinor.`
    );
  }

  validateCurrency(currency, `Catalog entry '${serviceCode}'`);

  return Object.freeze({
    durationMinutes,
    amountMinor,
    currency,
  });
};

const parseBookingServiceCatalog = (rawCatalog) => {
  if (typeof rawCatalog !== 'string' || rawCatalog.trim() === '') {
    fail(
      'SERVICE_CATALOG_REQUIRED',
      'BOOKING_SERVICE_CATALOG_JSON must contain an explicit JSON service catalog.'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(rawCatalog);
  } catch {
    fail('INVALID_SERVICE_CATALOG', 'BOOKING_SERVICE_CATALOG_JSON must be valid JSON.');
  }

  if (!isRecord(parsed)) {
    fail('INVALID_SERVICE_CATALOG', 'Booking service catalog must be a JSON object.');
  }

  const serviceCodes = Object.keys(parsed);
  if (serviceCodes.length === 0) {
    fail('INVALID_SERVICE_CATALOG', 'Booking service catalog must define at least one service.');
  }

  const catalog = Object.create(null);
  for (const serviceCode of serviceCodes) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(serviceCode)) {
      fail('INVALID_SERVICE_CATALOG', `Catalog service code '${serviceCode}' is invalid.`);
    }
    catalog[serviceCode] = validateCatalogEntry(serviceCode, parsed[serviceCode]);
  }

  return Object.freeze(catalog);
};

const resolveDirectCounsellorPrice = ({ counsellor, sessionDuration }) => {
  if (!isRecord(counsellor)) {
    fail('COUNSELLOR_PRICING_REQUIRED', 'Direct bookings require a server-loaded counsellor price.');
  }

  const currency = validateCurrency(counsellor.currency, 'Counsellor');
  const hourlyRateMinor = majorToMinor(counsellor.hourlyRate, 'Counsellor hourly rate');
  const amountMinor = Math.round((hourlyRateMinor * sessionDuration) / 60);

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    fail('INVALID_SERVER_PRICE', 'Calculated counsellor booking amount must be positive.');
  }

  return Object.freeze({
    source: 'counsellor_rate',
    serviceCode: null,
    sessionDuration,
    amount: minorToMajor(amountMinor),
    amountMinor,
    currency,
  });
};

const resolveCatalogPrice = ({ serviceCode, serviceCatalog, sessionDuration }) => {
  if (!isRecord(serviceCatalog)) {
    fail('SERVICE_CATALOG_REQUIRED', 'Unassigned bookings require a parsed server service catalog.');
  }

  if (typeof serviceCode !== 'string' || serviceCode === '' || serviceCode !== serviceCode.trim()) {
    fail('SERVICE_CODE_REQUIRED', 'Unassigned bookings require an exact service code.');
  }

  if (!Object.prototype.hasOwnProperty.call(serviceCatalog, serviceCode)) {
    fail(
      'SERVICE_NOT_CONFIGURED',
      `Service '${serviceCode}' is not configured for booking.`,
      { serviceCode }
    );
  }

  const entry = validateCatalogEntry(serviceCode, serviceCatalog[serviceCode]);
  if (entry.durationMinutes !== sessionDuration) {
    fail(
      'SERVICE_DURATION_MISMATCH',
      `Service '${serviceCode}' requires a ${entry.durationMinutes}-minute session.`,
      { serviceCode, expectedDuration: entry.durationMinutes, receivedDuration: sessionDuration }
    );
  }

  return Object.freeze({
    source: 'service_catalog',
    serviceCode,
    sessionDuration,
    amount: minorToMajor(entry.amountMinor),
    amountMinor: entry.amountMinor,
    currency: entry.currency,
  });
};

const resolveBookingPrice = ({
  clientInput,
  sessionDuration,
  serviceCode = null,
  counsellor = null,
  serviceCatalog = null,
} = {}) => {
  assertClientDoesNotControlPricing(clientInput);
  const validatedDuration = validateSessionDuration(sessionDuration);

  if (counsellor) {
    return resolveDirectCounsellorPrice({
      counsellor,
      sessionDuration: validatedDuration,
    });
  }

  return resolveCatalogPrice({
    serviceCode,
    serviceCatalog,
    sessionDuration: validatedDuration,
  });
};

module.exports = {
  BookingPricingError,
  CLIENT_CONTROLLED_PRICING_FIELDS,
  SUPPORTED_CURRENCY,
  assertClientDoesNotControlPricing,
  parseBookingServiceCatalog,
  resolveBookingPrice,
};
