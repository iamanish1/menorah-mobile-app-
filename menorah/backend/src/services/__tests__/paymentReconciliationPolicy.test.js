const {
  PAYMENT_RECONCILIATION_MISMATCH_CODES: CODES,
  NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES,
  RECONCILIATION_DECISIONS: DECISIONS,
  buildBookingPaymentReceipt,
  evaluateBookingPaymentReconciliation,
} = require('../paymentReconciliationPolicy');
const mongoose = require('mongoose');

const BOOKING_ID = '64f000000000000000000001';
const USER_ID = '64f000000000000000000002';
const OTHER_BOOKING_ID = '64f000000000000000000003';
const OTHER_USER_ID = '64f000000000000000000004';
const ORDER_ID = 'order_booking_123';
const PAYMENT_ID = 'pay_booking_123';
const AMOUNT_MINOR = 125000;
const RECEIPT = `booking_${BOOKING_ID}`;
const NOW = new Date('2026-07-23T01:02:03.000Z');

const makeFixture = () => ({
  attempt: {
    _id: '64f000000000000000000005',
    provider: 'razorpay',
    purpose: 'booking',
    booking: BOOKING_ID,
    user: USER_ID,
    orderId: ORDER_ID,
    expected: {
      amountMinor: AMOUNT_MINOR,
      currency: 'INR',
      receipt: RECEIPT,
      notes: {
        bookingId: BOOKING_ID,
        userId: USER_ID,
      },
    },
    status: 'payment_pending',
  },
  booking: {
    _id: BOOKING_ID,
    user: USER_ID,
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: 'razorpay',
    amountMinor: AMOUNT_MINOR,
    currency: 'INR',
    pricing: {
      listAmountMinor: AMOUNT_MINOR,
      currency: 'INR',
    },
    razorpayOrderId: ORDER_ID,
    orderStatus: 'created',
    holdExpiresAt: new Date('2026-07-23T01:12:03.000Z'),
    scheduledAt: new Date('2026-07-24T01:02:03.000Z'),
    bookingAuthorization: {
      kind: 'payment',
      status: 'pending',
    },
  },
  order: {
    id: ORDER_ID,
    amount: AMOUNT_MINOR,
    currency: 'INR',
    receipt: RECEIPT,
    status: 'paid',
    notes: {
      bookingId: BOOKING_ID,
      userId: USER_ID,
    },
  },
  payment: {
    id: PAYMENT_ID,
    order_id: ORDER_ID,
    amount: AMOUNT_MINOR,
    currency: 'INR',
    status: 'captured',
    captured: true,
    notes: {
      bookingId: BOOKING_ID,
      userId: USER_ID,
    },
  },
});

const evaluate = (fixture) =>
  evaluateBookingPaymentReconciliation({ ...fixture, now: NOW });

const expectFailClosedWith = (result, code, decision = DECISIONS.NEEDS_REVIEW) => {
  expect(result).toEqual(expect.objectContaining({
    decision,
    shouldAuthorize: false,
    failClosed: true,
    transition: null,
  }));
  expect(result.mismatchCodes).toContain(code);
};

describe('payment reconciliation happy path and persistence contract', () => {
  test('authorizes only exact server-fetched captured evidence', () => {
    const fixture = makeFixture();
    const before = JSON.stringify(fixture);
    const result = evaluate(fixture);

    expect(result).toEqual(expect.objectContaining({
      decision: DECISIONS.AUTHORIZE,
      shouldAuthorize: true,
      idempotent: false,
      failClosed: false,
      mismatchCodes: [],
      isDelayedRecovery: false,
      recommendedAttemptStatus: null,
      safeEvidence: {
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amountMinor: AMOUNT_MINOR,
        currency: 'INR',
        providerOrderStatus: 'paid',
        providerPaymentStatus: 'captured',
      },
    }));
    expect(result.transition).toEqual(expect.objectContaining({
      attemptSet: expect.objectContaining({
        status: 'captured',
        paymentId: PAYMENT_ID,
        capturedAt: NOW,
        'reconciliation.lastDecision': DECISIONS.AUTHORIZE,
        'reconciliation.mismatchCodes': [],
      }),
      bookingSet: expect.objectContaining({
        paymentStatus: 'paid',
        paymentId: PAYMENT_ID,
        transactionId: ORDER_ID,
        status: 'confirmed',
        bookingAuthorization: {
          kind: 'payment',
          status: 'authorized',
          reference: PAYMENT_ID,
          authorizedAt: NOW,
        },
      }),
      requiredCallerSet: [
        'reconciliation.lastSource',
        'reconciliation.lastEventKey',
      ],
      persistenceGuards: {
        attempt: expect.objectContaining({
          orderId: ORDER_ID,
          allowedStatuses: ['order_created', 'payment_pending', 'payment_failed'],
          paymentIdMustBeUnset: true,
          noOtherAttemptWithStatus: [
            'creating',
            'order_created',
            'payment_pending',
            'payment_failed',
            'captured',
            'needs_review',
          ],
        }),
        booking: expect.objectContaining({
          id: BOOKING_ID,
          userId: USER_ID,
          allowedPaymentStatuses: ['pending', 'failed'],
          requiredStatus: 'pending',
          amountMinor: AMOUNT_MINOR,
          currency: 'INR',
          holdExpiresAfter: NOW,
          scheduledAfter: NOW,
        }),
        applyWithEventLedgerAtomically: true,
      },
    }));
    expect(JSON.stringify(fixture)).toBe(before);
  });

  test('does not require optional payment notes when the fetched order notes are exact', () => {
    const fixture = makeFixture();
    delete fixture.payment.notes;

    expect(evaluate(fixture).decision).toBe(DECISIONS.AUTHORIZE);
  });

  test('compares actual Mongoose ObjectIds without recursive identity getters', () => {
    const fixture = makeFixture();
    fixture.attempt.booking = new mongoose.Types.ObjectId(BOOKING_ID);
    fixture.attempt.user = new mongoose.Types.ObjectId(USER_ID);
    fixture.booking._id = new mongoose.Types.ObjectId(BOOKING_ID);
    fixture.booking.user = new mongoose.Types.ObjectId(USER_ID);

    expect(evaluate(fixture).decision).toBe(DECISIONS.AUTHORIZE);
  });

  test('derives a stable provider-unique receipt from each reserved attempt', () => {
    const firstId = new mongoose.Types.ObjectId('64f000000000000000000005');
    const secondId = new mongoose.Types.ObjectId('64f000000000000000000006');

    expect(buildBookingPaymentReceipt(firstId))
      .toBe('booking_64f000000000000000000005');
    expect(buildBookingPaymentReceipt(secondId))
      .toBe('booking_64f000000000000000000006');
    expect(buildBookingPaymentReceipt(firstId)).toHaveLength(32);
    expect(() => buildBookingPaymentReceipt('booking-id')).toThrow(
      'Payment attempt ID must be a MongoDB ObjectId'
    );
    expect(NON_REPLACEABLE_PAYMENT_ATTEMPT_STATUSES)
      .toEqual([
        'creating',
        'order_created',
        'payment_pending',
        'payment_failed',
        'captured',
        'needs_review',
      ]);
  });
});

describe('duplicate and delayed delivery matrix', () => {
  test('returns an idempotent no-op for the exact already-applied payment', () => {
    const fixture = makeFixture();
    fixture.attempt.status = 'captured';
    fixture.attempt.paymentId = PAYMENT_ID;
    Object.assign(fixture.booking, {
      status: 'in-progress',
      paymentStatus: 'paid',
      paymentId: PAYMENT_ID,
      transactionId: ORDER_ID,
      orderStatus: 'paid',
      bookingAuthorization: {
        kind: 'payment',
        status: 'authorized',
        reference: PAYMENT_ID,
        authorizedAt: new Date('2026-07-22T00:00:00.000Z'),
      },
    });

    expect(evaluate(fixture)).toEqual(expect.objectContaining({
      decision: DECISIONS.ALREADY_APPLIED,
      shouldAuthorize: false,
      idempotent: true,
      failClosed: false,
      mismatchCodes: [],
      transition: null,
    }));
  });

  test('recovers an exact delayed capture after a non-terminal failure observation', () => {
    const fixture = makeFixture();
    fixture.attempt.status = 'payment_failed';
    fixture.booking.paymentStatus = 'failed';

    expect(evaluate(fixture)).toEqual(expect.objectContaining({
      decision: DECISIONS.AUTHORIZE,
      shouldAuthorize: true,
      isDelayedRecovery: true,
      mismatchCodes: [],
    }));
  });

  test.each([
    ['expired attempt', (fixture) => { fixture.attempt.status = 'expired'; }, CODES.ATTEMPT_NOT_RECONCILABLE],
    ['review attempt', (fixture) => { fixture.attempt.status = 'needs_review'; }, CODES.ATTEMPT_NOT_RECONCILABLE],
    ['creating attempt', (fixture) => {
      fixture.attempt.status = 'creating';
    }, CODES.ATTEMPT_NOT_RECONCILABLE],
    ['cancelled booking', (fixture) => { fixture.booking.status = 'cancelled'; }, CODES.BOOKING_NOT_PAYABLE],
    ['expired booking', (fixture) => { fixture.booking.status = 'expired'; }, CODES.BOOKING_NOT_PAYABLE],
    ['refunded booking', (fixture) => {
      fixture.booking.paymentStatus = 'refunded';
    }, CODES.BOOKING_PAYMENT_STATUS_INVALID],
    ['expired booking hold', (fixture) => {
      fixture.booking.holdExpiresAt = new Date(NOW.getTime() - 1);
    }, CODES.BOOKING_HOLD_EXPIRED],
    ['past session', (fixture) => {
      fixture.booking.scheduledAt = new Date(NOW.getTime() - 1);
    }, CODES.BOOKING_SCHEDULE_PASSED],
    ['missing booking hold', (fixture) => {
      fixture.booking.holdExpiresAt = null;
    }, CODES.BOOKING_HOLD_INVALID],
    ['invalid schedule', (fixture) => {
      fixture.booking.scheduledAt = 'not-a-date';
    }, CODES.BOOKING_SCHEDULE_INVALID],
  ])('sends delayed captured funds on a %s to review', (_label, mutate, code) => {
    const fixture = makeFixture();
    mutate(fixture);

    expectFailClosedWith(evaluate(fixture), code);
  });

  test('rejects a conflicting second captured payment on an already captured attempt', () => {
    const fixture = makeFixture();
    fixture.attempt.status = 'captured';
    fixture.attempt.paymentId = 'pay_original_123';

    const result = evaluate(fixture);
    expectFailClosedWith(result, CODES.ATTEMPT_PAYMENT_ID_MISMATCH);
    expect(result.mismatchCodes).toContain(CODES.ATTEMPT_STATE_CONFLICT);
    expect(result.recommendedAttemptStatus).toBeNull();
  });
});

describe('order evidence mismatch matrix', () => {
  test.each([
    ['order ID', (fixture) => { fixture.order.id = 'order_other_123'; }, CODES.ORDER_ID_MISMATCH],
    ['amount', (fixture) => { fixture.order.amount += 1; }, CODES.ORDER_AMOUNT_MISMATCH],
    ['currency', (fixture) => { fixture.order.currency = 'USD'; }, CODES.ORDER_CURRENCY_MISMATCH],
    ['receipt', (fixture) => { fixture.order.receipt = 'booking_other'; }, CODES.ORDER_RECEIPT_MISMATCH],
    ['booking note', (fixture) => {
      fixture.order.notes.bookingId = OTHER_BOOKING_ID;
    }, CODES.ORDER_BOOKING_NOTE_MISMATCH],
    ['user note', (fixture) => {
      fixture.order.notes.userId = OTHER_USER_ID;
    }, CODES.ORDER_USER_NOTE_MISMATCH],
    ['paid status', (fixture) => { fixture.order.status = 'attempted'; }, CODES.ORDER_STATUS_NOT_PAID],
  ])('fails closed on mismatched %s', (_label, mutate, code) => {
    const fixture = makeFixture();
    mutate(fixture);

    expectFailClosedWith(evaluate(fixture), code);
  });
});

describe('payment evidence mismatch matrix', () => {
  test.each([
    ['missing payment ID', (fixture) => { fixture.payment.id = ''; }, CODES.PAYMENT_ID_MISSING],
    ['order association', (fixture) => {
      fixture.payment.order_id = 'order_other_123';
    }, CODES.PAYMENT_ORDER_ID_MISMATCH],
    ['amount', (fixture) => { fixture.payment.amount -= 1; }, CODES.PAYMENT_AMOUNT_MISMATCH],
    ['currency', (fixture) => { fixture.payment.currency = 'USD'; }, CODES.PAYMENT_CURRENCY_MISMATCH],
    ['booking note', (fixture) => {
      fixture.payment.notes.bookingId = OTHER_BOOKING_ID;
    }, CODES.PAYMENT_BOOKING_NOTE_MISMATCH],
    ['user note', (fixture) => {
      fixture.payment.notes.userId = OTHER_USER_ID;
    }, CODES.PAYMENT_USER_NOTE_MISMATCH],
  ])('fails closed on mismatched %s', (_label, mutate, code) => {
    const fixture = makeFixture();
    mutate(fixture);

    expectFailClosedWith(evaluate(fixture), code);
  });
});

describe('booking and attempt association matrix', () => {
  test.each([
    ['booking identity', (fixture) => {
      fixture.booking._id = OTHER_BOOKING_ID;
    }, CODES.ATTEMPT_BOOKING_ID_MISMATCH],
    ['user identity', (fixture) => {
      fixture.booking.user = OTHER_USER_ID;
    }, CODES.ATTEMPT_USER_ID_MISMATCH],
    ['booking order', (fixture) => {
      fixture.booking.razorpayOrderId = 'order_other_123';
    }, CODES.BOOKING_ORDER_ID_MISMATCH],
    ['payment method', (fixture) => {
      fixture.booking.paymentMethod = 'wallet';
    }, CODES.BOOKING_PAYMENT_METHOD_MISMATCH],
    ['booking amount', (fixture) => {
      fixture.booking.amountMinor += 1;
    }, CODES.BOOKING_AMOUNT_MISMATCH],
    ['pricing snapshot amount', (fixture) => {
      fixture.booking.pricing.listAmountMinor += 1;
    }, CODES.BOOKING_PRICE_SNAPSHOT_MISMATCH],
    ['booking currency', (fixture) => {
      fixture.booking.currency = 'USD';
    }, CODES.BOOKING_CURRENCY_MISMATCH],
    ['pricing currency', (fixture) => {
      fixture.booking.pricing.currency = 'USD';
    }, CODES.BOOKING_PRICE_CURRENCY_MISMATCH],
    ['authorization kind', (fixture) => {
      fixture.booking.bookingAuthorization.kind = 'subscription_entitlement';
    }, CODES.BOOKING_AUTHORIZATION_CONFLICT],
    ['authorization state', (fixture) => {
      fixture.booking.bookingAuthorization.status = 'needs_review';
    }, CODES.BOOKING_AUTHORIZATION_CONFLICT],
  ])('fails closed on mismatched %s', (_label, mutate, code) => {
    const fixture = makeFixture();
    mutate(fixture);

    expectFailClosedWith(evaluate(fixture), code);
  });
});

describe('failed and non-captured payment matrix', () => {
  test.each([
    ['failed', 'failed'],
    ['authorized', 'authorized'],
    ['created', 'created'],
  ])('rejects a %s payment without marking the booking paid', (_label, status) => {
    const fixture = makeFixture();
    fixture.order.status = 'attempted';
    fixture.payment.status = status;
    fixture.payment.captured = false;

    const result = evaluate(fixture);
    expectFailClosedWith(
      result,
      CODES.PAYMENT_STATUS_NOT_CAPTURED,
      DECISIONS.REJECT
    );
    expect(result.mismatchCodes).toContain(CODES.PAYMENT_CAPTURE_FLAG_NOT_TRUE);
    expect(result.recommendedAttemptStatus)
      .toBe(status === 'failed' ? 'payment_failed' : 'payment_pending');
  });

  test.each([
    ['captured status with false flag', 'captured', false, CODES.PAYMENT_CAPTURE_FLAG_NOT_TRUE],
    ['authorized status with true flag', 'authorized', true, CODES.PAYMENT_STATUS_NOT_CAPTURED],
    ['paid order with failed payment', 'failed', false, CODES.PAYMENT_STATUS_NOT_CAPTURED],
  ])('reviews contradictory provider evidence: %s', (_label, status, captured, code) => {
    const fixture = makeFixture();
    fixture.payment.status = status;
    fixture.payment.captured = captured;

    expectFailClosedWith(evaluate(fixture), code);
  });
});

describe('missing evidence and deterministic output', () => {
  test.each([
    ['attempt', 'attempt', CODES.ATTEMPT_MISSING],
    ['booking', 'booking', CODES.BOOKING_MISSING],
    ['order', 'order', CODES.ORDER_EVIDENCE_MISSING],
    ['payment', 'payment', CODES.PAYMENT_EVIDENCE_MISSING],
  ])('never authorizes without the stored %s', (_label, key, code) => {
    const fixture = makeFixture();
    fixture[key] = null;

    expectFailClosedWith(evaluate(fixture), code);
  });

  test('returns mismatch codes in a stable deterministic order', () => {
    const fixture = makeFixture();
    fixture.order.id = 'order_other_123';
    fixture.order.amount = 1;
    fixture.payment.order_id = 'order_other_123';
    fixture.payment.amount = 2;

    const first = evaluate(fixture);
    const second = evaluate(fixture);

    expect(first.mismatchCodes).toEqual([
      CODES.ORDER_ID_MISMATCH,
      CODES.ORDER_AMOUNT_MISMATCH,
      CODES.PAYMENT_ORDER_ID_MISMATCH,
      CODES.PAYMENT_AMOUNT_MISMATCH,
    ]);
    expect(second.mismatchCodes).toEqual(first.mismatchCodes);
    expect(first.primaryMismatchCode).toBe(CODES.ORDER_ID_MISMATCH);
  });

  test('fails closed when the caller supplies an invalid evaluation time', () => {
    const fixture = makeFixture();
    const result = evaluateBookingPaymentReconciliation({
      ...fixture,
      now: 'not-a-date',
    });

    expectFailClosedWith(result, CODES.EVALUATION_TIME_INVALID);
  });
});
