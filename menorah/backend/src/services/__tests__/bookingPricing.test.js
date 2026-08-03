const {
  BookingPricingError,
  parseBookingServiceCatalog,
  resolveBookingPrice,
} = require('../bookingPricing');

const catalogJson = JSON.stringify({
  basic: {
    durationMinutes: 45,
    amountMinor: 123456,
    currency: 'INR',
  },
  extended_session: {
    durationMinutes: 90,
    amountMinor: 456789,
    currency: 'INR',
  },
});

const expectPricingError = (action, code) => {
  expect(action).toThrow(BookingPricingError);
  expect(action).toThrow(expect.objectContaining({ code }));
};

describe('bookingPricing', () => {
  describe('parseBookingServiceCatalog', () => {
    test.each([undefined, null, '', '   '])('fails closed when the catalog is absent (%p)', (rawCatalog) => {
      expectPricingError(
        () => parseBookingServiceCatalog(rawCatalog),
        'SERVICE_CATALOG_REQUIRED'
      );
    });

    test.each(['{', '[]', 'null', '{}'])('rejects malformed or empty catalog JSON (%p)', (rawCatalog) => {
      expectPricingError(
        () => parseBookingServiceCatalog(rawCatalog),
        'INVALID_SERVICE_CATALOG'
      );
    });

    test.each([
      { durationMinutes: 45, amountMinor: 0, currency: 'INR' },
      { durationMinutes: 45, amountMinor: -1, currency: 'INR' },
      { durationMinutes: 45, amountMinor: 1000.5, currency: 'INR' },
      { durationMinutes: 45, amountMinor: 1000, currency: 'USD' },
      { durationMinutes: 0, amountMinor: 1000, currency: 'INR' },
    ])('rejects malformed server service configuration (%p)', (entry) => {
      expectPricingError(
        () => parseBookingServiceCatalog(JSON.stringify({ basic: entry })),
        entry.currency === 'USD' ? 'UNSUPPORTED_CURRENCY' : 'INVALID_SERVICE_CATALOG'
      );
    });

    test('returns an immutable normalized catalog without supplying business defaults', () => {
      const catalog = parseBookingServiceCatalog(catalogJson);

      expect(catalog.basic).toEqual({
        durationMinutes: 45,
        amountMinor: 123456,
        currency: 'INR',
      });
      expect(Object.isFrozen(catalog)).toBe(true);
      expect(Object.isFrozen(catalog.basic)).toBe(true);
    });
  });

  describe('client pricing boundary', () => {
    test.each([
      ['amount', 1],
      ['amount', 0],
      ['amount', -1],
      ['price', 1234],
      ['currency', 'INR'],
      ['paymentStatus', 'paid'],
      ['paymentMethod', 'promo'],
      ['promoCode', 'FORGED-FREE-CODE'],
      ['discountCode', 'FORGED-DISCOUNT'],
      ['isFree', true],
    ])('rejects client-controlled %s', (field, value) => {
      expectPricingError(
        () => resolveBookingPrice({
          clientInput: { sessionDuration: 45, [field]: value },
          sessionDuration: 45,
          serviceCode: 'basic',
          serviceCatalog: parseBookingServiceCatalog(catalogJson),
        }),
        'CLIENT_PRICING_FIELD_FORBIDDEN'
      );
    });

    test('rejects pricing fields hidden in nested request objects', () => {
      expectPricingError(
        () => resolveBookingPrice({
          clientInput: { preferences: { pricing: { amountMinor: 1 } } },
          sessionDuration: 45,
          serviceCode: 'basic',
          serviceCatalog: parseBookingServiceCatalog(catalogJson),
        }),
        'CLIENT_PRICING_FIELD_FORBIDDEN'
      );
    });

    test('requires the caller to supply the complete client request for inspection', () => {
      expectPricingError(
        () => resolveBookingPrice({
          sessionDuration: 45,
          serviceCode: 'basic',
          serviceCatalog: parseBookingServiceCatalog(catalogJson),
        }),
        'INVALID_CLIENT_INPUT'
      );
    });
  });

  describe('direct counsellor pricing', () => {
    test('derives the price only from the server-loaded counsellor rate', () => {
      const quote = resolveBookingPrice({
        clientInput: { sessionType: 'video', sessionDuration: 45 },
        sessionDuration: 45,
        counsellor: { hourlyRate: 1200, currency: 'INR' },
      });

      expect(quote).toEqual({
        source: 'counsellor_rate',
        serviceCode: null,
        sessionDuration: 45,
        amount: 900,
        amountMinor: 90000,
        currency: 'INR',
      });
      expect(Object.isFrozen(quote)).toBe(true);
    });

    test('rounds the duration calculation to the nearest minor currency unit', () => {
      const quote = resolveBookingPrice({
        clientInput: { sessionDuration: 50 },
        sessionDuration: 50,
        counsellor: { hourlyRate: 999, currency: 'INR' },
      });

      expect(quote.amountMinor).toBe(83250);
      expect(quote.amount).toBe(832.5);
    });

    test.each([0, -100, NaN, Infinity, '1000'])('rejects invalid stored hourly rates (%p)', (hourlyRate) => {
      expectPricingError(
        () => resolveBookingPrice({
          clientInput: { sessionDuration: 45 },
          sessionDuration: 45,
          counsellor: { hourlyRate, currency: 'INR' },
        }),
        'INVALID_SERVER_PRICE'
      );
    });

    test('rejects unsupported stored counsellor currency', () => {
      expectPricingError(
        () => resolveBookingPrice({
          clientInput: { sessionDuration: 45 },
          sessionDuration: 45,
          counsellor: { hourlyRate: 1200, currency: 'USD' },
        }),
        'UNSUPPORTED_CURRENCY'
      );
    });

    test('does not require a service code or catalog for a direct booking', () => {
      expect(() => resolveBookingPrice({
        clientInput: { sessionDuration: 60 },
        sessionDuration: 60,
        counsellor: { hourlyRate: 1500, currency: 'INR' },
      })).not.toThrow();
    });
  });

  describe('unassigned service-catalog pricing', () => {
    test('derives price from the exact configured service code and duration', () => {
      const quote = resolveBookingPrice({
        clientInput: { serviceCode: 'basic', sessionDuration: 45 },
        sessionDuration: 45,
        serviceCode: 'basic',
        serviceCatalog: parseBookingServiceCatalog(catalogJson),
      });

      expect(quote).toEqual({
        source: 'service_catalog',
        serviceCode: 'basic',
        sessionDuration: 45,
        amount: 1234.56,
        amountMinor: 123456,
        currency: 'INR',
      });
    });

    test('fails closed when parsed server configuration is absent', () => {
      expectPricingError(
        () => resolveBookingPrice({
          clientInput: { serviceCode: 'basic', sessionDuration: 45 },
          sessionDuration: 45,
          serviceCode: 'basic',
        }),
        'SERVICE_CATALOG_REQUIRED'
      );
    });

    test.each([undefined, null, '', ' basic ', 'BASIC', 'unknown'])('rejects a missing or non-exact service code (%p)', (serviceCode) => {
      const expectedCode = typeof serviceCode === 'string' && serviceCode !== '' && serviceCode === serviceCode.trim()
        ? 'SERVICE_NOT_CONFIGURED'
        : 'SERVICE_CODE_REQUIRED';

      expectPricingError(
        () => resolveBookingPrice({
          clientInput: { serviceCode, sessionDuration: 45 },
          sessionDuration: 45,
          serviceCode,
          serviceCatalog: parseBookingServiceCatalog(catalogJson),
        }),
        expectedCode
      );
    });

    test('rejects a duration that does not exactly match the configured service', () => {
      expectPricingError(
        () => resolveBookingPrice({
          clientInput: { serviceCode: 'basic', sessionDuration: 60 },
          sessionDuration: 60,
          serviceCode: 'basic',
          serviceCatalog: parseBookingServiceCatalog(catalogJson),
        }),
        'SERVICE_DURATION_MISMATCH'
      );
    });
  });
});
