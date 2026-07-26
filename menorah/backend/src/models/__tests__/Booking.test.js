const Booking = require('../Booking');

describe('Booking model indexes', () => {
  test('enforces one active assigned booking per counsellor slot', () => {
    const slotIndex = Booking.schema.indexes().find(([fields, options]) =>
      fields.counsellor === 1 &&
      fields.scheduledAt === 1 &&
      options?.unique === true
    );

    expect(slotIndex).toBeTruthy();
    expect(slotIndex[1].partialFilterExpression.status.$in).toEqual([
      'pending',
      'confirmed',
      'in-progress',
    ]);
  });
});

describe('Booking pricing snapshot validation', () => {
  const makeBooking = (overrides = {}) => new Booking({
    user: '64f000000000000000000001',
    sessionDuration: 45,
    scheduledAt: new Date(Date.now() + 60_000),
    amount: 1000,
    amountMinor: 100000,
    currency: 'INR',
    paymentMethod: 'razorpay',
    pricing: {
      source: 'service_catalog',
      serviceCode: 'test-service',
      listAmount: 1000,
      listAmountMinor: 100000,
      currency: 'INR',
      resolvedAt: new Date(),
    },
    ...overrides,
  });

  test('accepts integer INR minor-unit snapshots', () => {
    expect(makeBooking().validateSync()).toBeUndefined();
  });

  test('rejects fractional minor units', () => {
    const error = makeBooking({ amountMinor: 100000.5 }).validateSync();

    expect(error?.errors.amountMinor).toBeTruthy();
  });

  test('rejects unsupported booking currency', () => {
    const error = makeBooking({ currency: 'USD' }).validateSync();

    expect(error?.errors.currency).toBeTruthy();
  });
});

describe('Booking cancellation boundary', () => {
  const safeUnpaidHold = (overrides = {}) => new Booking({
    user: '64f000000000000000000001',
    sessionDuration: 45,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    status: 'pending',
    amount: 1000,
    amountMinor: 100000,
    currency: 'INR',
    paymentStatus: 'pending',
    paymentMethod: 'razorpay',
    holdExpiresAt: new Date(Date.now() + 60 * 1000),
    bookingAuthorization: {
      kind: 'payment',
      status: 'pending',
    },
    pricing: {
      source: 'service_catalog',
      serviceCode: 'test-service',
      listAmount: 1000,
      listAmountMinor: 100000,
      currency: 'INR',
      resolvedAt: new Date(),
    },
    ...overrides,
  });

  test('advertises cancellation only for a live unpaid hold without a provider order', () => {
    expect(safeUnpaidHold().canBeCancelled).toBe(true);
    expect(safeUnpaidHold({ razorpayOrderId: 'order_test_123' }).canBeCancelled).toBe(false);
  });

  test('never advertises direct cancellation for paid or entitled bookings', () => {
    expect(safeUnpaidHold({
      status: 'confirmed',
      paymentStatus: 'paid',
      bookingAuthorization: { kind: 'payment', status: 'authorized' },
    }).canBeCancelled).toBe(false);
    expect(safeUnpaidHold({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'subscription',
      bookingAuthorization: {
        kind: 'subscription_entitlement',
        status: 'authorized',
      },
    }).canBeCancelled).toBe(false);
  });

  test('does not expose the former unconstrained cancellation model method', () => {
    expect(safeUnpaidHold().cancel).toBeUndefined();
  });
});
