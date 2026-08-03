jest.mock('../../models/PaymentAttempt', () => {
  const PaymentAttempt = jest.fn(function(document) {
    Object.assign(this, document);
    this.save = (...args) => PaymentAttempt.mockSave(this, ...args);
  });
  PaymentAttempt.mockSave = jest.fn();
  PaymentAttempt.findOne = jest.fn();
  PaymentAttempt.findById = jest.fn();
  PaymentAttempt.updateOne = jest.fn();
  return PaymentAttempt;
});
jest.mock('../../models/Booking', () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));

const mongoose = require('mongoose');
const PaymentAttempt = require('../../models/PaymentAttempt');
const Booking = require('../../models/Booking');
const {
  BookingPaymentOrderError,
  PAYMENT_ORDER_TRANSACTION_OPTIONS,
  _private,
  createOrReuseBookingOrder,
  evaluatePayableBooking,
} = require('../razorpayBookingOrderService');
const {
  PaymentProviderTimeoutError,
} = require('../razorpayPaymentSecurity');

const NOW = new Date('2026-07-23T10:00:00.000Z');
const buildBooking = () => ({
  _id: '64f000000000000000000001',
  user: '64f000000000000000000002',
  status: 'pending',
  paymentStatus: 'pending',
  paymentMethod: 'razorpay',
  amountMinor: 12345,
  currency: 'INR',
  pricing: { listAmountMinor: 12345, currency: 'INR' },
  bookingAuthorization: { kind: 'payment', status: 'pending' },
  holdExpiresAt: new Date('2026-07-23T10:15:00.000Z'),
  scheduledAt: new Date('2026-07-24T10:00:00.000Z'),
});

const buildAttempt = () => ({
  _id: '64f000000000000000000003',
  booking: '64f000000000000000000001',
  user: '64f000000000000000000002',
  expected: {
    amountMinor: 12345,
    currency: 'INR',
    receipt: 'booking_64f000000000000000000003',
    notes: {
      bookingId: '64f000000000000000000001',
      userId: '64f000000000000000000002',
    },
  },
  status: 'creating',
  createdAt: NOW,
});

const buildOrder = () => ({
  id: 'order_test_123',
  amount: 12345,
  currency: 'INR',
  receipt: 'booking_64f000000000000000000003',
  notes: {
    bookingId: '64f000000000000000000001',
    userId: '64f000000000000000000002',
  },
  status: 'created',
});

const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);

const setAtPath = (target, path, value) => {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = clone(value);
};

const applyUpdate = (document, update) => {
  for (const [path, value] of Object.entries(update.$set || {})) {
    setAtPath(document, path, value);
  }
};

const makeQuery = ({ label, operations, value }) => {
  const query = {
    sort: jest.fn(() => query),
    session: jest.fn(() => query),
    then: (resolve, reject) => {
      operations.push(label);
      return Promise.resolve()
        .then(() => (typeof value === 'function' ? value() : value))
        .then(resolve, reject);
    },
  };
  return query;
};

const makeServiceHarness = ({
  booking = buildBooking(),
  activeAttempt = null,
  activeFindSequence = [],
  competingAttempt = null,
  saveError = null,
} = {}) => {
  const state = {
    booking,
    activeAttempt,
    competingAttempt,
  };
  const operations = [];
  const activeQueue = [...activeFindSequence];
  const transactionOptions = [];

  const session = {
    withTransaction: jest.fn(async (callback, options) => {
      operations.push('transaction.begin');
      transactionOptions.push(options);
      try {
        const result = await callback();
        operations.push('transaction.commit');
        return result;
      } catch (error) {
        operations.push('transaction.abort');
        throw error;
      }
    }),
    endSession: jest.fn(async () => {
      operations.push('transaction.end');
    }),
  };
  const startSessionSpy = jest
    .spyOn(mongoose, 'startSession')
    .mockImplementation(async () => session);

  PaymentAttempt.mockSave.mockImplementation(async (attempt) => {
    operations.push('attempt.save');
    if (saveError) throw saveError;
    if (!attempt.createdAt) attempt.createdAt = NOW;
    state.activeAttempt = attempt;
    return attempt;
  });
  PaymentAttempt.findOne.mockImplementation((filter) => {
    if (filter?._id?.$ne) {
      return makeQuery({
        label: 'attempt.findCompeting',
        operations,
        value: () => state.competingAttempt,
      });
    }
    return makeQuery({
      label: 'attempt.findActive',
      operations,
      value: () => (
        activeQueue.length > 0 ? activeQueue.shift() : state.activeAttempt
      ),
    });
  });
  PaymentAttempt.findById.mockImplementation(() =>
    makeQuery({
      label: 'attempt.findById',
      operations,
      value: () => state.activeAttempt,
    }));
  PaymentAttempt.updateOne.mockImplementation(async (_filter, update, options) => {
    operations.push('attempt.update');
    expect(options).toEqual(expect.objectContaining({
      session,
      runValidators: true,
    }));
    if (!state.activeAttempt) return { modifiedCount: 0 };
    applyUpdate(state.activeAttempt, update);
    return { modifiedCount: 1 };
  });

  Booking.findById.mockImplementation(() =>
    makeQuery({
      label: 'booking.findById',
      operations,
      value: () => state.booking,
    }));
  Booking.updateOne.mockImplementation(async (_filter, update, options) => {
    operations.push('booking.update');
    expect(options).toEqual(expect.objectContaining({
      session,
      runValidators: true,
    }));
    if (!state.booking) return { modifiedCount: 0 };
    applyUpdate(state.booking, update);
    return { modifiedCount: 1 };
  });

  const client = {
    orders: {
      create: jest.fn(),
      fetch: jest.fn(),
      all: jest.fn(),
    },
  };

  return {
    client,
    operations,
    session,
    startSessionSpy,
    state,
    transactionOptions,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  PaymentAttempt.mockSave.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Razorpay booking order policy', () => {
  test('accepts only an exact server-priced pending payment snapshot', () => {
    expect(evaluatePayableBooking({
      booking: buildBooking(),
      userId: '64f000000000000000000002',
      now: NOW,
    })).toEqual({ payable: true, failureCodes: [] });
  });

  test.each([
    ['wrong owner', { user: '64f000000000000000000099' }, 'BOOKING_OWNER_MISMATCH'],
    ['cancelled booking', { status: 'cancelled' }, 'BOOKING_NOT_PENDING'],
    ['already paid', { paymentStatus: 'paid' }, 'BOOKING_NOT_PAYABLE'],
    ['refunded', { paymentStatus: 'refunded' }, 'BOOKING_NOT_PAYABLE'],
    ['subscription', { paymentMethod: 'subscription' }, 'PAYMENT_METHOD_MISMATCH'],
    ['zero amount', { amountMinor: 0 }, 'BOOKING_AMOUNT_INVALID'],
    ['fractional amount', { amountMinor: 1.5 }, 'BOOKING_AMOUNT_INVALID'],
    ['price mismatch', { amountMinor: 1 }, 'BOOKING_PRICING_MISMATCH'],
    ['wrong currency', { currency: 'USD' }, 'BOOKING_CURRENCY_INVALID'],
    ['expired hold', { holdExpiresAt: NOW }, 'BOOKING_HOLD_EXPIRED'],
    ['past schedule', { scheduledAt: NOW }, 'BOOKING_SCHEDULE_PASSED'],
  ])('fails closed for %s', (_label, changes, expectedCode) => {
    const result = evaluatePayableBooking({
      booking: { ...buildBooking(), ...changes },
      userId: '64f000000000000000000002',
      now: NOW,
    });

    expect(result.payable).toBe(false);
    expect(result.failureCodes).toContain(expectedCode);
  });

  test('permits an exact failed attempt while its hold remains active', () => {
    expect(evaluatePayableBooking({
      booking: { ...buildBooking(), paymentStatus: 'failed' },
      userId: '64f000000000000000000002',
      now: NOW,
    }).payable).toBe(true);
  });

  test('domain errors carry only bounded response metadata', () => {
    const error = new BookingPaymentOrderError(
      'PAYMENT_ORDER_IN_PROGRESS',
      'Please retry.',
      { retryable: true }
    );

    expect(error).toMatchObject({
      code: 'PAYMENT_ORDER_IN_PROGRESS',
      status: 409,
      retryable: true,
    });
  });

  test('detects local snapshot drift before any provider order is returned', () => {
    const attempt = buildAttempt();
    const booking = buildBooking();

    expect(_private.getAttemptSnapshotMismatchCodes({
      attempt,
      booking,
      userId: booking.user,
    })).toEqual([]);
    expect(_private.getAttemptSnapshotMismatchCodes({
      attempt,
      booking: { ...booking, amountMinor: 1 },
      userId: booking.user,
    })).toContain('BOOKING_AMOUNT_MISMATCH');
  });

  test('recovers only one exact provider order for the stable receipt', () => {
    const attempt = buildAttempt();
    const order = buildOrder();

    expect(_private.chooseRecoveredOrder({ orders: [], attempt })).toBeNull();
    expect(_private.chooseRecoveredOrder({ orders: [order], attempt })).toBe(order);
  });

  test.each([
    ['multiple provider orders', [buildOrder(), { ...buildOrder(), id: 'order_test_999' }]],
    ['a mismatched provider order', [{ ...buildOrder(), amount: 1 }]],
  ])('requires manual review for %s', (_label, orders) => {
    expect(() => _private.chooseRecoveredOrder({
      orders,
      attempt: buildAttempt(),
    })).toThrow('Provider order recovery returned conflicting results.');
  });

  test('never creates a second order after an ambiguous provider request', () => {
    expect(_private.getUnboundAttemptRecoveryAction({
      reservationCreated: true,
      ageMs: 0,
      recoveryDelayMs: 30_000,
    })).toBe('create_initial_order');
    expect(_private.getUnboundAttemptRecoveryAction({
      reservationCreated: false,
      ageMs: 1_000,
      recoveryDelayMs: 30_000,
    })).toBe('wait_for_creator');
    expect(_private.getUnboundAttemptRecoveryAction({
      reservationCreated: false,
      ageMs: 31_000,
      recoveryDelayMs: 30_000,
    })).toBe('lookup_by_receipt');
    expect(_private.getUnboundAttemptRecoveryAction({
      reservationCreated: false,
      ageMs: 31_000,
      recoveryDelayMs: 30_000,
      lookupComplete: true,
      recoveredOrder: null,
    })).toBe('manual_review');
    expect(_private.getUnboundAttemptRecoveryAction({
      reservationCreated: false,
      ageMs: 31_000,
      recoveryDelayMs: 30_000,
      lookupComplete: true,
      recoveredOrder: buildOrder(),
    })).toBe('bind_recovered_order');
  });

  test('never returns checkout for an order that is already paid', () => {
    let error;
    try {
      _private.assertOrderCanOpenCheckout({ status: 'paid' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
    expect(() => _private.assertOrderCanOpenCheckout({ status: 'attempted' })).not.toThrow();
  });
});

describe('Razorpay booking order service lifecycle', () => {
  const configureOrderCreation = (
    harness,
    { id = 'order_created_123', status = 'created' } = {}
  ) => {
    harness.client.orders.create.mockImplementation(async (payload) => ({
      id,
      ...clone(payload),
      status,
      created_at: Math.floor(NOW.getTime() / 1000),
    }));
  };

  test('reserves an immutable attempt and binds the first provider order', async () => {
    const harness = makeServiceHarness({ activeFindSequence: [null] });
    configureOrderCreation(harness);

    const result = await createOrReuseBookingOrder({
      booking: harness.state.booking,
      userId: harness.state.booking.user,
      client: harness.client,
      now: NOW,
      providerTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      reused: false,
      order: {
        id: 'order_created_123',
        amount: 12345,
        currency: 'INR',
        status: 'created',
      },
    });
    expect(PaymentAttempt).toHaveBeenCalledTimes(1);
    expect(PaymentAttempt.mockSave).toHaveBeenCalledTimes(1);
    expect(harness.client.orders.create).toHaveBeenCalledWith({
      amount: 12345,
      currency: 'INR',
      receipt: `booking_${harness.state.activeAttempt._id}`,
      notes: {
        bookingId: String(harness.state.booking._id),
        userId: String(harness.state.booking.user),
      },
    });
    expect(PaymentAttempt.mockSave).toHaveBeenCalledWith(
      expect.any(Object),
      { writeConcern: { w: 'majority' } }
    );
    expect(harness.state.activeAttempt).toMatchObject({
      orderId: 'order_created_123',
      status: 'order_created',
    });
    expect(harness.state.booking).toMatchObject({
      razorpayOrderId: 'order_created_123',
      orderStatus: 'created',
      paymentStatus: 'pending',
    });
  });

  test('binds Attempt and Booking sequentially in a snapshot/majority transaction', async () => {
    const harness = makeServiceHarness({ activeFindSequence: [null] });
    configureOrderCreation(harness, {
      id: 'order_attempted_123',
      status: 'attempted',
    });

    await createOrReuseBookingOrder({
      booking: harness.state.booking,
      userId: harness.state.booking.user,
      client: harness.client,
      now: NOW,
      providerTimeoutMs: 100,
    });

    expect(harness.session.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      PAYMENT_ORDER_TRANSACTION_OPTIONS
    );
    expect(harness.transactionOptions).toEqual([
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    ]);
    expect(harness.operations).toEqual([
      'attempt.findActive',
      'attempt.save',
      'transaction.begin',
      'attempt.findById',
      'booking.findById',
      'attempt.findCompeting',
      'attempt.update',
      'booking.update',
      'transaction.commit',
      'transaction.end',
      'attempt.findById',
    ]);
    expect(harness.state.activeAttempt.status).toBe('payment_pending');
    expect(harness.state.booking.orderStatus).toBe('attempted');
    expect(harness.session.endSession).toHaveBeenCalledTimes(1);
  });

  test('recovers the unique-index winner instead of creating a competing order', async () => {
    const winner = {
      ...buildAttempt(),
      status: 'order_created',
      orderId: 'order_winner_123',
    };
    const booking = {
      ...buildBooking(),
      razorpayOrderId: winner.orderId,
    };
    const duplicateError = Object.assign(
      new Error('duplicate active payment attempt'),
      { code: 11000 }
    );
    const harness = makeServiceHarness({
      booking,
      activeAttempt: winner,
      activeFindSequence: [null, winner],
      saveError: duplicateError,
    });
    harness.client.orders.fetch.mockResolvedValue({
      ...buildOrder(),
      id: winner.orderId,
    });

    const result = await createOrReuseBookingOrder({
      booking,
      userId: booking.user,
      client: harness.client,
      now: NOW,
      providerTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      attempt: winner,
      order: { id: winner.orderId },
      reused: true,
    });
    expect(PaymentAttempt.mockSave).toHaveBeenCalledTimes(1);
    expect(harness.client.orders.fetch).toHaveBeenCalledWith(winner.orderId);
    expect(harness.client.orders.create).not.toHaveBeenCalled();
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test('never creates a second order after an ambiguous provider timeout', async () => {
    const harness = makeServiceHarness({ activeFindSequence: [null] });
    harness.client.orders.create.mockRejectedValue(
      new PaymentProviderTimeoutError()
    );
    harness.client.orders.all.mockResolvedValue({ items: [] });

    await expect(createOrReuseBookingOrder({
      booking: harness.state.booking,
      userId: harness.state.booking.user,
      client: harness.client,
      now: NOW,
      providerTimeoutMs: 100,
      recoveryDelayMs: 30_000,
    })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_TIMEOUT' });

    await expect(createOrReuseBookingOrder({
      booking: harness.state.booking,
      userId: harness.state.booking.user,
      client: harness.client,
      now: new Date(NOW.getTime() + 31_000),
      providerTimeoutMs: 100,
      recoveryDelayMs: 30_000,
    })).rejects.toMatchObject({ code: 'PAYMENT_ORDER_REVIEW_REQUIRED' });

    expect(harness.client.orders.create).toHaveBeenCalledTimes(1);
    expect(harness.client.orders.all).toHaveBeenCalledWith({
      receipt: harness.state.activeAttempt.expected.receipt,
      count: 10,
    });
    expect(harness.state.activeAttempt).toMatchObject({
      status: 'needs_review',
      reconciliation: {
        lastDecision: 'needs_review',
        mismatchCodes: ['AMBIGUOUS_PROVIDER_ORDER_MISSING'],
      },
    });
    expect(harness.state.booking.bookingAuthorization.status)
      .toBe('needs_review');
  });

  test('atomically marks both attempt and booking for review on snapshot drift', async () => {
    const driftedAttempt = buildAttempt();
    driftedAttempt.expected.amountMinor = 1;
    const harness = makeServiceHarness({ activeAttempt: driftedAttempt });

    await expect(createOrReuseBookingOrder({
      booking: harness.state.booking,
      userId: harness.state.booking.user,
      client: harness.client,
      now: NOW,
      providerTimeoutMs: 100,
    })).rejects.toMatchObject({ code: 'PAYMENT_SNAPSHOT_REVIEW_REQUIRED' });

    expect(harness.state.activeAttempt).toMatchObject({
      status: 'needs_review',
      reconciliation: {
        lastDecision: 'needs_review',
        mismatchCodes: ['BOOKING_AMOUNT_MISMATCH'],
        evaluatedAt: NOW,
      },
    });
    expect(harness.state.booking.bookingAuthorization.status)
      .toBe('needs_review');
    expect(harness.operations).toEqual([
      'attempt.findActive',
      'transaction.begin',
      'attempt.update',
      'booking.update',
      'transaction.commit',
      'transaction.end',
    ]);
    expect(harness.session.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      PAYMENT_ORDER_TRANSACTION_OPTIONS
    );
    expect(harness.client.orders.create).not.toHaveBeenCalled();
  });

  test('reuses a payment_failed attempt and its original payable order', async () => {
    const failedAttempt = {
      ...buildAttempt(),
      status: 'payment_failed',
      orderId: 'order_failed_123',
    };
    const booking = {
      ...buildBooking(),
      paymentStatus: 'failed',
      razorpayOrderId: failedAttempt.orderId,
    };
    const harness = makeServiceHarness({
      booking,
      activeAttempt: failedAttempt,
    });
    harness.client.orders.fetch.mockResolvedValue({
      ...buildOrder(),
      id: failedAttempt.orderId,
      status: 'attempted',
    });

    const result = await createOrReuseBookingOrder({
      booking,
      userId: booking.user,
      client: harness.client,
      now: NOW,
      providerTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      attempt: failedAttempt,
      order: {
        id: failedAttempt.orderId,
        status: 'attempted',
      },
      reused: true,
    });
    expect(PaymentAttempt.findOne).toHaveBeenCalledWith({
      booking: booking._id,
      status: {
        $in: expect.arrayContaining(['payment_failed']),
      },
    });
    expect(harness.client.orders.fetch)
      .toHaveBeenCalledWith(failedAttempt.orderId);
    expect(harness.client.orders.create).not.toHaveBeenCalled();
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test('binds but refuses checkout for a paid order recovered by receipt', async () => {
    const staleAttempt = {
      ...buildAttempt(),
      status: 'creating',
      createdAt: new Date(NOW.getTime() - 31_000),
    };
    const paidOrder = {
      ...buildOrder(),
      id: 'order_recovered_paid_123',
      status: 'paid',
    };
    const harness = makeServiceHarness({ activeAttempt: staleAttempt });
    harness.client.orders.all.mockResolvedValue({ items: [paidOrder] });

    await expect(createOrReuseBookingOrder({
      booking: harness.state.booking,
      userId: harness.state.booking.user,
      client: harness.client,
      now: NOW,
      providerTimeoutMs: 100,
      recoveryDelayMs: 30_000,
    })).rejects.toMatchObject({
      code: 'PAYMENT_RECONCILIATION_REQUIRED',
    });

    expect(harness.client.orders.all).toHaveBeenCalledWith({
      receipt: staleAttempt.expected.receipt,
      count: 10,
    });
    expect(harness.client.orders.create).not.toHaveBeenCalled();
    expect(harness.state.activeAttempt).toMatchObject({
      orderId: paidOrder.id,
      status: 'payment_pending',
    });
    expect(harness.state.booking).toMatchObject({
      razorpayOrderId: paidOrder.id,
      orderStatus: 'attempted',
      paymentStatus: 'pending',
    });
    expect(harness.session.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      PAYMENT_ORDER_TRANSACTION_OPTIONS
    );
  });
});
