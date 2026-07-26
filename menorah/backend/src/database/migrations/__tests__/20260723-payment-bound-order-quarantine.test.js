const migration = require('../20260723-payment-bound-order-quarantine');

const NOW = new Date('2026-07-23T00:00:00.000Z');
const FUTURE = new Date('2026-07-23T01:00:00.000Z');
const STALE = new Date('2026-07-22T23:00:00.000Z');

const valueAt = (document, path) => path.split('.').reduce(
  (value, part) => value?.[part],
  document
);

const matchesCondition = (actual, condition) => {
  if (!condition || typeof condition !== 'object' || condition instanceof Date) {
    return actual === condition;
  }
  if ('$exists' in condition) {
    const exists = actual !== undefined;
    if (condition.$exists !== exists) return false;
  }
  if ('$type' in condition && condition.$type === 'string') {
    if (typeof actual !== 'string') return false;
  }
  if ('$ne' in condition && actual === condition.$ne) return false;
  if ('$in' in condition && !condition.$in.includes(actual)) return false;
  if ('$nin' in condition && condition.$nin.includes(actual)) return false;
  if ('$gt' in condition && !(actual > condition.$gt)) return false;
  if ('$lte' in condition && !(actual <= condition.$lte)) return false;
  return true;
};

const matchesFilter = (document, filter) => Object.entries(filter).every(([
  key,
  condition,
]) => {
  if (key === '$and') return condition.every((branch) => matchesFilter(document, branch));
  if (key === '$or') return condition.some((branch) => matchesFilter(document, branch));
  if (key === '$nor') return condition.every((branch) => !matchesFilter(document, branch));
  return matchesCondition(valueAt(document, key), condition);
});

const boundBooking = (overrides = {}) => ({
  status: 'pending',
  paymentMethod: 'razorpay',
  paymentStatus: 'pending',
  razorpayOrderId: 'order_legacy_123',
  holdExpiresAt: FUTURE,
  bookingAuthorization: { kind: 'payment', status: 'pending' },
  ...overrides,
});

describe('20260723 payment booking quarantine migration', () => {
  test('runs stale unbound expiry, active legacy backfill, then bound quarantine', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const collection = jest.fn(() => ({ updateMany }));

    await migration.up({
      mongoose: { connection: { db: { collection } } },
    });

    expect(collection).toHaveBeenCalledWith('bookings');
    expect(updateMany).toHaveBeenCalledTimes(4);
    expect(updateMany.mock.calls[0][1]).toEqual({
      $set: expect.objectContaining({
        status: 'expired',
        orderStatus: 'expired',
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'revoked',
      }),
    });
    expect(updateMany.mock.calls[1][1]).toEqual({
      $set: {
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'needs_review',
      },
    });
    expect(updateMany.mock.calls[2][1]).toEqual({
      $set: {
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'pending',
      },
    });
    expect(updateMany.mock.calls[3][1]).toEqual({
      $set: {
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'needs_review',
      },
    });
    for (const call of updateMany.mock.calls) {
      expect(call[2]).toEqual({ writeConcern: { w: 'majority' } });
    }
  });

  test.each([
    ['legacy missing authorization', boundBooking({ bookingAuthorization: undefined }), true],
    ['explicit null authorization', boundBooking({ bookingAuthorization: null }), true],
    ['future revoked authorization', boundBooking({
      bookingAuthorization: { kind: 'payment', status: 'revoked' },
    }), true],
    ['stale contradictory authorization', boundBooking({
      holdExpiresAt: STALE,
      bookingAuthorization: { kind: 'payment', status: 'authorized' },
    }), true],
    ['modern stale hold', boundBooking({ holdExpiresAt: STALE }), true],
    ['modern future hold', boundBooking(), false],
    ['already quarantined', boundBooking({
      bookingAuthorization: { kind: 'payment', status: 'needs_review' },
    }), false],
    ['paid booking', boundBooking({ paymentStatus: 'paid' }), false],
    ['unbound booking', boundBooking({ razorpayOrderId: undefined }), false],
  ])('bound filter: %s => %s', (_label, booking, expected) => {
    expect(matchesFilter(
      booking,
      migration.buildBoundOrderQuarantineFilter(NOW)
    )).toBe(expected);
  });

  test('expires stale legacy unbound rows and backfills only future ones', () => {
    const staleLegacy = boundBooking({
      razorpayOrderId: undefined,
      holdExpiresAt: STALE,
      bookingAuthorization: undefined,
    });
    const futureLegacy = {
      ...staleLegacy,
      holdExpiresAt: FUTURE,
    };
    const modernFuture = {
      ...futureLegacy,
      bookingAuthorization: { kind: 'payment', status: 'pending' },
    };

    expect(matchesFilter(
      staleLegacy,
      migration.buildLegacyUnboundExpiryFilter(NOW)
    )).toBe(true);
    expect(matchesFilter(
      staleLegacy,
      migration.buildLegacyUnboundActiveFilter(NOW)
    )).toBe(false);
    expect(matchesFilter(
      futureLegacy,
      migration.buildLegacyUnboundExpiryFilter(NOW)
    )).toBe(false);
    expect(matchesFilter(
      futureLegacy,
      migration.buildLegacyUnboundActiveFilter(NOW)
    )).toBe(true);
    expect(matchesFilter(
      modernFuture,
      migration.buildLegacyUnboundActiveFilter(NOW)
    )).toBe(false);
  });

  test('quarantines contradictory unbound evidence without touching clean or bound rows', () => {
    const cleanLegacy = boundBooking({
      razorpayOrderId: undefined,
      bookingAuthorization: undefined,
      orderStatus: undefined,
    });
    const withPaymentEvidence = {
      ...cleanLegacy,
      paymentId: 'pay_unexpected_123',
    };
    const contradictoryAuthorization = {
      ...cleanLegacy,
      holdExpiresAt: STALE,
      bookingAuthorization: { kind: 'payment', status: 'authorized' },
    };

    expect(matchesFilter(
      cleanLegacy,
      migration.buildLegacyUnboundContradictionFilter()
    )).toBe(false);
    expect(matchesFilter(
      withPaymentEvidence,
      migration.buildLegacyUnboundContradictionFilter()
    )).toBe(true);
    expect(matchesFilter(
      withPaymentEvidence,
      migration.buildLegacyUnboundActiveFilter(NOW)
    )).toBe(false);
    expect(matchesFilter(
      contradictoryAuthorization,
      migration.buildLegacyUnboundContradictionFilter()
    )).toBe(true);
    expect(matchesFilter(
      contradictoryAuthorization,
      migration.buildLegacyUnboundExpiryFilter(NOW)
    )).toBe(false);
    expect(matchesFilter(
      boundBooking({ orderStatus: 'created' }),
      migration.buildLegacyUnboundContradictionFilter()
    )).toBe(false);
  });

  test('all filters exclude their own completed state on a second run', () => {
    expect(matchesFilter(boundBooking({
      bookingAuthorization: { kind: 'payment', status: 'needs_review' },
    }), migration.buildBoundOrderQuarantineFilter(NOW))).toBe(false);
    expect(matchesFilter(boundBooking({
      razorpayOrderId: undefined,
      holdExpiresAt: STALE,
      status: 'expired',
      bookingAuthorization: { kind: 'payment', status: 'revoked' },
    }), migration.buildLegacyUnboundExpiryFilter(NOW))).toBe(false);
    expect(matchesFilter(boundBooking({
      razorpayOrderId: undefined,
      bookingAuthorization: { kind: 'payment', status: 'pending' },
    }), migration.buildLegacyUnboundActiveFilter(NOW))).toBe(false);
  });
});
