const PaymentAttempt = require('../PaymentAttempt');

const BOOKING_ID = '64f000000000000000000001';
const USER_ID = '64f000000000000000000002';

const makeAttempt = (overrides = {}) => new PaymentAttempt({
  booking: BOOKING_ID,
  user: USER_ID,
  orderId: 'order_booking_123',
  expected: {
    amountMinor: 125000,
    currency: 'INR',
    receipt: `booking_${BOOKING_ID}`,
    notes: {
      bookingId: BOOKING_ID,
      userId: USER_ID,
    },
  },
  providerCreatedAt: new Date('2026-07-23T00:00:00.000Z'),
  status: 'order_created',
  ...overrides,
});

describe('PaymentAttempt model', () => {
  test('accepts an immutable Razorpay booking order snapshot', () => {
    const attempt = makeAttempt();

    expect(attempt.validateSync()).toBeUndefined();
    expect(attempt.provider).toBe('razorpay');
    expect(attempt.purpose).toBe('booking');
    expect(attempt.status).toBe('order_created');
    expect(attempt.paymentId).toBeUndefined();
  });

  test('allows history while reserving one non-replaceable attempt per booking', () => {
    const indexes = PaymentAttempt.schema.indexes();
    const bookingIndex = indexes.find(([fields]) => fields.booking === 1);
    const receiptIndex = indexes.find(([fields]) => fields['expected.receipt'] === 1);
    const orderIndex = indexes.find(([fields]) => fields.orderId === 1);
    const paymentIndex = indexes.find(([fields]) => fields.paymentId === 1);

    expect(bookingIndex?.[1]).toEqual(expect.objectContaining({
      unique: true,
      name: 'one_nonreplaceable_payment_attempt_per_booking',
      partialFilterExpression: {
        status: {
          $in: [
            'creating',
            'order_created',
            'payment_pending',
            'payment_failed',
            'captured',
            'needs_review',
          ],
        },
      },
    }));
    expect(receiptIndex?.[1]).toEqual(expect.objectContaining({
      unique: true,
      name: 'unique_razorpay_booking_receipt',
    }));
    expect(orderIndex?.[1]).toEqual(expect.objectContaining({
      unique: true,
      sparse: true,
      name: 'unique_razorpay_booking_order',
    }));
    expect(paymentIndex?.[1]).toEqual(expect.objectContaining({
      unique: true,
      sparse: true,
      name: 'unique_captured_razorpay_payment',
    }));
    expect(PaymentAttempt.getNonReplaceableStatuses()).toEqual([
      'creating',
      'order_created',
      'payment_pending',
      'payment_failed',
      'captured',
      'needs_review',
    ]);
  });

  test('marks identity and expected monetary evidence immutable', () => {
    [
      'provider',
      'purpose',
      'booking',
      'user',
      'expected.amountMinor',
      'expected.currency',
      'expected.receipt',
      'expected.notes.bookingId',
      'expected.notes.userId',
    ].forEach((path) => {
      expect(PaymentAttempt.schema.path(path)?.options.immutable).toBe(true);
    });
    expect(PaymentAttempt.schema.path('orderId')?.options.immutable).not.toBe(true);
    expect(PaymentAttempt.schema.path('paymentId')?.options.immutable).not.toBe(true);
  });

  test.each([
    ['fractional expected amount', { expected: {
      amountMinor: 125000.5,
      currency: 'INR',
      receipt: `booking_${BOOKING_ID}`,
      notes: { bookingId: BOOKING_ID, userId: USER_ID },
    } }, 'expected.amountMinor'],
    ['zero expected amount', { expected: {
      amountMinor: 0,
      currency: 'INR',
      receipt: `booking_${BOOKING_ID}`,
      notes: { bookingId: BOOKING_ID, userId: USER_ID },
    } }, 'expected.amountMinor'],
    ['unsupported currency', { expected: {
      amountMinor: 125000,
      currency: 'USD',
      receipt: `booking_${BOOKING_ID}`,
      notes: { bookingId: BOOKING_ID, userId: USER_ID },
    } }, 'expected.currency'],
    ['invalid booking note', { expected: {
      amountMinor: 125000,
      currency: 'INR',
      receipt: `booking_${BOOKING_ID}`,
      notes: { bookingId: 'not-an-object-id', userId: USER_ID },
    } }, 'expected.notes.bookingId'],
  ])('rejects %s', (_label, overrides, errorPath) => {
    const error = makeAttempt(overrides).validateSync();

    expect(error?.errors[errorPath]).toBeTruthy();
  });

  test('uses explicit payment lifecycle states', () => {
    const allowed = PaymentAttempt.schema.path('status').options.enum;

    expect(allowed).toEqual([
      'creating',
      'order_created',
      'payment_pending',
      'payment_failed',
      'captured',
      'expired',
      'needs_review',
    ]);
    expect(makeAttempt({ status: 'authorized' }).validateSync()?.errors.status).toBeTruthy();
  });

  test('supports a pre-provider reservation before attaching an order', () => {
    const reservation = makeAttempt({
      status: 'creating',
      orderId: undefined,
      providerCreatedAt: undefined,
    });

    expect(reservation.validateSync()).toBeUndefined();
  });

  test('requires provider evidence after order creation and a payment ID when captured', async () => {
    const missingOrder = makeAttempt({
      status: 'payment_pending',
      orderId: undefined,
      providerCreatedAt: undefined,
    });
    const missingPayment = makeAttempt({ status: 'captured', paymentId: undefined });
    const prematurePaymentBinding = makeAttempt({
      status: 'payment_pending',
      paymentId: 'pay_booking_123',
    });

    await expect(missingOrder.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        orderId: expect.anything(),
        providerCreatedAt: expect.anything(),
      }),
    });
    await expect(missingPayment.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ paymentId: expect.anything() }),
    });
    await expect(prematurePaymentBinding.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ status: expect.anything() }),
    });
  });

  test('stores only bounded reconciliation codes instead of raw errors', () => {
    const safe = makeAttempt({
      reconciliation: {
        lastDecision: 'needs_review',
        mismatchCodes: ['ORDER_AMOUNT_MISMATCH'],
        lastSource: 'webhook',
      },
    });
    const unsafe = makeAttempt({
      reconciliation: {
        lastDecision: 'needs_review',
        mismatchCodes: ['provider said: card details leaked'],
      },
    });

    expect(safe.validateSync()).toBeUndefined();
    expect(unsafe.validateSync()?.errors['reconciliation.mismatchCodes.0']).toBeTruthy();
    expect(makeAttempt({
      reconciliation: {
        lastDecision: 'needs_review',
        mismatchCodes: Array(65).fill('ORDER_AMOUNT_MISMATCH'),
      },
    }).validateSync()?.errors['reconciliation.mismatchCodes']).toBeTruthy();
  });

  test('restricts reconciliation metadata to provider states and safe event keys', () => {
    const unsafe = makeAttempt({
      reconciliation: {
        lastDecision: 'needs_review',
        lastEventKey: 'secret=value with spaces',
        providerOrderStatus: 'provider stack trace',
        providerPaymentStatus: 'card data',
      },
    });
    const error = unsafe.validateSync();

    expect(error?.errors['reconciliation.lastEventKey']).toBeTruthy();
    expect(error?.errors['reconciliation.providerOrderStatus']).toBeTruthy();
    expect(error?.errors['reconciliation.providerPaymentStatus']).toBeTruthy();
  });
});
