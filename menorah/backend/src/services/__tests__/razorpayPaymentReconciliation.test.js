const {
  DEFAULT_WEBHOOK_LEASE_MS,
  DEFAULT_WEBHOOK_RETRY_DELAY_MS,
  createRazorpayPaymentReconciliationService,
} = require('../razorpayPaymentReconciliation');

const BOOKING_ID = '64f000000000000000000001';
const USER_ID = '64f000000000000000000002';
const ATTEMPT_ID = '64f000000000000000000003';
const OTHER_ATTEMPT_ID = '64f000000000000000000004';
const OTHER_BOOKING_ID = '64f000000000000000000005';
const EVENT_ID = '64f000000000000000000006';
const ORDER_ID = 'order_booking_123';
const PAYMENT_ID = 'pay_booking_123';
const AMOUNT_MINOR = 125000;
const EVENT_KEY = 'event:evt_booking_123';
const PAYLOAD_DIGEST = 'a'.repeat(64);
const NOW = new Date('2026-07-23T01:02:03.000Z');

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
  for (const [path, value] of Object.entries(update.$inc || {})) {
    const current = path.split('.').reduce(
      (cursor, part) => cursor?.[part],
      document
    );
    setAtPath(document, path, (current || 0) + value);
  }
  for (const [path, value] of Object.entries(update.$push || {})) {
    const parts = path.split('.');
    let cursor = document;
    for (const part of parts.slice(0, -1)) {
      if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
      cursor = cursor[part];
    }
    const key = parts[parts.length - 1];
    if (!Array.isArray(cursor[key])) cursor[key] = [];
    cursor[key].push(clone(value));
  }
};

const comparable = (value) => String(value?._id || value || '');

const basicFilterMatches = (document, filter = {}) => {
  if (!document) return false;
  for (const [key, expected] of Object.entries(filter)) {
    if (key.startsWith('$')) continue;
    const actual = key.split('.').reduce(
      (cursor, part) => cursor?.[part],
      document
    );
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected && comparable(actual) === comparable(expected.$ne)) {
        return false;
      }
      if ('$in' in expected && !expected.$in.includes(actual)) return false;
      continue;
    }
    if (comparable(actual) !== comparable(expected)) return false;
  }
  return true;
};

const makeFixture = ({ withEvent = true } = {}) => ({
  attempt: {
    _id: ATTEMPT_ID,
    provider: 'razorpay',
    purpose: 'booking',
    booking: BOOKING_ID,
    user: USER_ID,
    orderId: ORDER_ID,
    expected: {
      amountMinor: AMOUNT_MINOR,
      currency: 'INR',
      receipt: `booking_${ATTEMPT_ID}`,
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
    statusHistory: [],
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
  receipt: null,
  competingAttempt: null,
  event: withEvent
    ? {
      _id: EVENT_ID,
      provider: 'razorpay',
      eventKey: EVENT_KEY,
      providerEventId: 'evt_booking_123',
      payloadDigest: PAYLOAD_DIGEST,
      eventType: 'payment.captured',
      processingState: 'processing',
      subject: {
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
      },
      deliveryCount: 1,
      processingAttempts: 1,
    }
    : null,
});

const providerOrder = () => ({
  id: ORDER_ID,
  amount: AMOUNT_MINOR,
  currency: 'INR',
  receipt: `booking_${ATTEMPT_ID}`,
  status: 'paid',
  notes: {
    bookingId: BOOKING_ID,
    userId: USER_ID,
  },
});

const providerPayment = () => ({
  id: PAYMENT_ID,
  order_id: ORDER_ID,
  amount: AMOUNT_MINOR,
  currency: 'INR',
  status: 'captured',
  captured: true,
});

const makeStatefulService = ({
  state = makeFixture(),
  receiptDuplicateOnce = false,
} = {}) => {
  const operationLog = [];
  let activeOperation = null;
  let duplicateReceiptRemaining = receiptDuplicateOnce;
  let externalReceiptAfterRollback = null;
  let transactionCount = 0;

  const runOperation = (label, work) => new Promise((resolve, reject) => {
    if (activeOperation) {
      reject(new Error(`parallel operation: ${activeOperation} and ${label}`));
      return;
    }
    activeOperation = label;
    operationLog.push(label);
    setImmediate(() => {
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      } finally {
        activeOperation = null;
      }
    });
  });

  const query = (label, work) => {
    const chain = {
      session: jest.fn(() => chain),
      lean: jest.fn(() => runOperation(label, work)),
    };
    return chain;
  };

  const mongooseInstance = {
    startSession: jest.fn(async () => ({
      withTransaction: jest.fn(async (callback) => {
        transactionCount += 1;
        const snapshot = clone({
          attempt: state.attempt,
          booking: state.booking,
          receipt: state.receipt,
          competingAttempt: state.competingAttempt,
          event: state.event,
        });
        try {
          await callback();
        } catch (error) {
          Object.assign(state, snapshot);
          if (externalReceiptAfterRollback) {
            state.receipt = clone(externalReceiptAfterRollback);
            externalReceiptAfterRollback = null;
          }
          throw error;
        }
      }),
      endSession: jest.fn(async () => {}),
    })),
  };

  const PaymentAttemptModel = {
    findOne: jest.fn((filter) => {
      if (filter?._id?.$ne) {
        return query('attempt.find-competing', () => state.competingAttempt);
      }
      return query('attempt.find', () => {
        if (!state.attempt) return null;
        return basicFilterMatches(state.attempt, filter)
          ? state.attempt
          : null;
      });
    }),
    updateOne: jest.fn((filter, update) =>
      runOperation('attempt.update', () => {
        if (!basicFilterMatches(state.attempt, filter)) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        applyUpdate(state.attempt, update);
        return { matchedCount: 1, modifiedCount: 1 };
      })),
  };

  const BookingModel = {
    findById: jest.fn((id) =>
      query('booking.find', () =>
        comparable(state.booking?._id) === comparable(id)
          ? state.booking
          : null)),
    updateOne: jest.fn((filter, update) =>
      runOperation('booking.update', () => {
        if (!basicFilterMatches(state.booking, filter)) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        applyUpdate(state.booking, update);
        return { matchedCount: 1, modifiedCount: 1 };
      })),
  };

  const PaymentReceiptModel = {
    findOne: jest.fn((filter) =>
      query('receipt.find', () =>
        basicFilterMatches(state.receipt, filter)
          ? state.receipt
          : null)),
    create: jest.fn((documents) =>
      runOperation('receipt.create', () => {
        const document = Array.isArray(documents) ? documents[0] : documents;
        if (duplicateReceiptRemaining) {
          duplicateReceiptRemaining = false;
          externalReceiptAfterRollback = {
            _id: '64f000000000000000000009',
            ...clone(document),
          };
          const error = new Error('duplicate payment receipt');
          error.code = 11000;
          throw error;
        }
        if (state.receipt) {
          const error = new Error('duplicate payment receipt');
          error.code = 11000;
          throw error;
        }
        state.receipt = {
          _id: '64f000000000000000000009',
          ...clone(document),
        };
        return [state.receipt];
      })),
  };

  const PaymentWebhookEventModel = {
    findOne: jest.fn((filter) =>
      query('event.find', () =>
        basicFilterMatches(state.event, filter)
          ? state.event
          : null)),
    updateOne: jest.fn((filter, update) =>
      runOperation('event.update', () => {
        if (!basicFilterMatches(state.event, filter)) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        applyUpdate(state.event, update);
        return { matchedCount: 1, modifiedCount: 1 };
      })),
  };

  const service = createRazorpayPaymentReconciliationService({
    mongooseInstance,
    BookingModel,
    PaymentAttemptModel,
    PaymentReceiptModel,
    PaymentWebhookEventModel,
  });

  return {
    service,
    state,
    operationLog,
    getTransactionCount: () => transactionCount,
    models: {
      BookingModel,
      PaymentAttemptModel,
      PaymentReceiptModel,
      PaymentWebhookEventModel,
    },
  };
};

const capturedInput = (source = 'webhook') => ({
  paymentAttemptId: ATTEMPT_ID,
  order: providerOrder(),
  payment: providerPayment(),
  source,
  eventKey: source === 'webhook'
    ? EVENT_KEY
    : `redirect:${ORDER_ID}:${PAYMENT_ID}`,
  claimToken: source === 'webhook' ? 1 : undefined,
  now: NOW,
});

describe('captured booking payment reconciliation', () => {
  test('commits attempt, booking, receipt, and webhook sequentially and notifies once', async () => {
    const harness = makeStatefulService();
    const result = await harness.service.reconcileCapturedBookingPayment(
      capturedInput()
    );

    expect(result).toEqual({
      decision: 'authorize',
      idempotent: false,
      shouldNotify: true,
      bookingId: BOOKING_ID,
      paymentAttemptId: ATTEMPT_ID,
      mismatchCodes: [],
      isDelayedRecovery: false,
    });
    expect(harness.state.attempt).toMatchObject({
      status: 'captured',
      paymentId: PAYMENT_ID,
      reconciliation: {
        lastDecision: 'authorize',
        lastSource: 'webhook',
        lastEventKey: EVENT_KEY,
      },
    });
    expect(harness.state.booking).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentId: PAYMENT_ID,
      transactionId: ORDER_ID,
      bookingAuthorization: {
        kind: 'payment',
        status: 'authorized',
        reference: PAYMENT_ID,
        authorizedAt: NOW,
      },
    });
    expect(harness.state.booking.statusHistory).toEqual([
      { status: 'confirmed', timestamp: NOW },
    ]);
    expect(harness.state.receipt).toMatchObject({
      paymentId: PAYMENT_ID,
      orderId: ORDER_ID,
      purpose: 'booking',
      user: USER_ID,
      booking: BOOKING_ID,
      amount: AMOUNT_MINOR,
      currency: 'INR',
    });
    expect(harness.state.event).toMatchObject({
      processingState: 'processed',
      reconciliationDecision: 'authorize',
      mismatchCodes: [],
      subject: {
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        booking: BOOKING_ID,
        paymentAttempt: ATTEMPT_ID,
      },
    });
    expect(harness.operationLog).toEqual([
      'event.find',
      'attempt.find',
      'booking.find',
      'attempt.find-competing',
      'receipt.find',
      'attempt.update',
      'booking.update',
      'receipt.create',
      'event.find',
      'event.update',
    ]);
  });

  test('returns idempotent success without a second notification or receipt', async () => {
    const harness = makeStatefulService();
    const first = await harness.service.reconcileCapturedBookingPayment(
      capturedInput()
    );
    const second = await harness.service.reconcileCapturedBookingPayment(
      capturedInput('redirect_verification')
    );

    expect(first.shouldNotify).toBe(true);
    expect(second).toMatchObject({
      decision: 'already_applied',
      idempotent: true,
      shouldNotify: false,
      mismatchCodes: [],
    });
    expect(harness.models.PaymentReceiptModel.create).toHaveBeenCalledTimes(1);
    expect(harness.state.booking.statusHistory).toHaveLength(1);
  });

  test('recovers safely from a payment receipt duplicate-key race', async () => {
    const harness = makeStatefulService({ receiptDuplicateOnce: true });
    const result = await harness.service.reconcileCapturedBookingPayment(
      capturedInput('redirect_verification')
    );

    expect(result).toMatchObject({
      decision: 'authorize',
      shouldNotify: true,
    });
    expect(harness.getTransactionCount()).toBe(2);
    expect(harness.state.booking.paymentStatus).toBe('paid');
    expect(harness.state.receipt.paymentId).toBe(PAYMENT_ID);
  });

  test('sends a conflicting existing receipt to review without authorizing', async () => {
    const state = makeFixture();
    state.receipt = {
      _id: '64f000000000000000000009',
      paymentId: PAYMENT_ID,
      orderId: ORDER_ID,
      purpose: 'booking',
      user: USER_ID,
      booking: OTHER_BOOKING_ID,
      amount: AMOUNT_MINOR,
      currency: 'INR',
    };
    const harness = makeStatefulService({ state });

    const result = await harness.service.reconcileCapturedBookingPayment(
      capturedInput()
    );

    expect(result).toMatchObject({
      decision: 'needs_review',
      shouldNotify: false,
      mismatchCodes: ['PAYMENT_RECEIPT_CONFLICT'],
    });
    expect(state.attempt.status).toBe('needs_review');
    expect(state.booking.paymentStatus).toBe('pending');
    expect(state.booking.bookingAuthorization.status).toBe('needs_review');
    expect(state.event.processingState).toBe('needs_review');
    expect(harness.models.PaymentReceiptModel.create).not.toHaveBeenCalled();
  });

  test('keeps a capture webhook retryable while provider reads are transiently stale', async () => {
    const state = makeFixture();
    const harness = makeStatefulService({ state });

    await expect(harness.service.reconcileCapturedBookingPayment({
      ...capturedInput(),
      order: { ...providerOrder(), status: 'attempted' },
      payment: {
        ...providerPayment(),
        status: 'authorized',
        captured: false,
      },
    })).rejects.toMatchObject({
      code: 'PROVIDER_CAPTURE_EVIDENCE_NOT_FINAL',
      retryable: true,
    });

    expect(state.attempt.status).toBe('payment_pending');
    expect(state.booking.paymentStatus).toBe('pending');
    expect(state.event.processingState).toBe('processing');
    expect(state.receipt).toBeNull();
    expect(harness.models.PaymentAttemptModel.updateOne).not.toHaveBeenCalled();
    expect(harness.models.BookingModel.updateOne).not.toHaveBeenCalled();
  });

  test('keeps transient provider capture evidence retryable after the local hold expires', async () => {
    const state = makeFixture();
    state.booking.holdExpiresAt = new Date(NOW.getTime() - 1);
    const harness = makeStatefulService({ state });

    await expect(harness.service.reconcileCapturedBookingPayment({
      ...capturedInput(),
      order: { ...providerOrder(), status: 'attempted' },
      payment: {
        ...providerPayment(),
        status: 'authorized',
        captured: false,
      },
    })).rejects.toMatchObject({
      code: 'PROVIDER_CAPTURE_EVIDENCE_NOT_FINAL',
      retryable: true,
    });

    expect(state.attempt.status).toBe('payment_pending');
    expect(state.booking.bookingAuthorization.status).toBe('pending');
    expect(state.event.processingState).toBe('processing');
    expect(harness.models.PaymentAttemptModel.updateOne).not.toHaveBeenCalled();
    expect(harness.models.BookingModel.updateOne).not.toHaveBeenCalled();
  });

  test.each([
    ['failed', false],
    ['refunded', true],
  ])('quarantines a captured webhook whose provider payment is terminally %s', async (
    providerPaymentStatus,
    captured
  ) => {
    const state = makeFixture();
    const harness = makeStatefulService({ state });

    const result = await harness.service.reconcileCapturedBookingPayment({
      ...capturedInput(),
      payment: {
        ...providerPayment(),
        status: providerPaymentStatus,
        captured,
      },
    });

    expect(result).toMatchObject({
      decision: 'needs_review',
      shouldNotify: false,
    });
    expect(result.mismatchCodes)
      .toContain('PROVIDER_CAPTURE_EVIDENCE_CONTRADICTION');
    expect(state.attempt.status).toBe('needs_review');
    expect(state.booking.paymentStatus).toBe('pending');
    expect(state.booking.bookingAuthorization.status).toBe('needs_review');
    expect(state.event.processingState).toBe('needs_review');
    expect(state.receipt).toBeNull();
  });

  test('does not confirm captured funds after the hold expires', async () => {
    const state = makeFixture();
    state.booking.holdExpiresAt = new Date(NOW.getTime() - 1);
    const harness = makeStatefulService({ state });

    const result = await harness.service.reconcileCapturedBookingPayment(
      capturedInput()
    );

    expect(result).toMatchObject({
      decision: 'needs_review',
      shouldNotify: false,
    });
    expect(result.mismatchCodes).toContain('BOOKING_HOLD_EXPIRED');
    expect(state.booking.status).toBe('pending');
    expect(state.booking.paymentStatus).toBe('pending');
    expect(state.booking.bookingAuthorization.status).toBe('needs_review');
    expect(state.attempt.status).toBe('needs_review');
    expect(state.receipt).toBeNull();
  });

  test('quarantines an already expired and revoked booking after a late capture', async () => {
    const state = makeFixture();
    Object.assign(state.booking, {
      status: 'expired',
      orderStatus: 'expired',
      holdExpiresAt: new Date(NOW.getTime() - 1),
      bookingAuthorization: {
        kind: 'payment',
        status: 'revoked',
      },
    });
    const harness = makeStatefulService({ state });

    const result = await harness.service.reconcileCapturedBookingPayment(
      capturedInput()
    );

    expect(result).toMatchObject({
      decision: 'needs_review',
      shouldNotify: false,
    });
    expect(result.mismatchCodes).toEqual(expect.arrayContaining([
      'BOOKING_NOT_PAYABLE',
      'BOOKING_AUTHORIZATION_CONFLICT',
      'BOOKING_HOLD_EXPIRED',
    ]));
    expect(state.attempt.status).toBe('needs_review');
    expect(state.booking).toMatchObject({
      status: 'expired',
      paymentStatus: 'pending',
      bookingAuthorization: {
        kind: 'payment',
        status: 'needs_review',
      },
    });
    expect(state.event.processingState).toBe('needs_review');
    expect(state.receipt).toBeNull();
  });

  test('quarantines a legacy expired booking with missing authorization metadata', async () => {
    const state = makeFixture();
    Object.assign(state.booking, {
      status: 'expired',
      orderStatus: 'expired',
      holdExpiresAt: new Date(NOW.getTime() - 1),
    });
    delete state.booking.bookingAuthorization;
    const harness = makeStatefulService({ state });

    const result = await harness.service.reconcileCapturedBookingPayment(
      capturedInput()
    );

    expect(result.decision).toBe('needs_review');
    expect(state.booking).toMatchObject({
      status: 'expired',
      paymentStatus: 'pending',
      bookingAuthorization: {
        kind: 'payment',
        status: 'needs_review',
      },
    });
    expect(state.event.processingState).toBe('needs_review');
  });

  test('leaves an old failed attempt untouched when a replacement attempt exists', async () => {
    const state = makeFixture();
    state.attempt.status = 'payment_failed';
    state.booking.paymentStatus = 'failed';
    state.competingAttempt = {
      _id: OTHER_ATTEMPT_ID,
      booking: BOOKING_ID,
      status: 'order_created',
    };
    const harness = makeStatefulService({ state });

    const result = await harness.service.reconcileCapturedBookingPayment(
      capturedInput()
    );

    expect(result).toMatchObject({
      decision: 'needs_review',
      shouldNotify: false,
    });
    expect(result.mismatchCodes).toContain('ATTEMPT_STATE_CONFLICT');
    expect(state.attempt.status).toBe('payment_failed');
    expect(state.attempt.reconciliation).toBeUndefined();
    expect(state.booking.paymentStatus).toBe('failed');
    expect(state.booking.bookingAuthorization.status).toBe('pending');
    expect(state.event).toMatchObject({
      processingState: 'needs_review',
      subject: {
        booking: BOOKING_ID,
        paymentAttempt: ATTEMPT_ID,
      },
    });
    expect(harness.models.PaymentAttemptModel.updateOne).not.toHaveBeenCalled();
    expect(harness.models.BookingModel.updateOne).not.toHaveBeenCalled();
  });

  test('rejects a stale webhook worker before any payment state mutation', async () => {
    const state = makeFixture();
    state.event.processingAttempts = 2;
    state.event.processingStartedAt = new Date(
      NOW.getTime() + DEFAULT_WEBHOOK_LEASE_MS + 1
    );
    const harness = makeStatefulService({ state });

    await expect(
      harness.service.reconcileCapturedBookingPayment({
        ...capturedInput(),
        claimToken: 1,
      })
    ).rejects.toMatchObject({ code: 'WEBHOOK_CLAIM_STALE' });

    expect(state.attempt.status).toBe('payment_pending');
    expect(state.booking.paymentStatus).toBe('pending');
    expect(state.receipt).toBeNull();
    expect(harness.models.PaymentAttemptModel.updateOne).not.toHaveBeenCalled();
    expect(harness.models.BookingModel.updateOne).not.toHaveBeenCalled();
    expect(harness.operationLog).toEqual(['event.find']);
  });
});

describe('failed booking payment observations', () => {
  test('records an exact failure without expiring or confirming the booking', async () => {
    const harness = makeStatefulService();
    harness.state.event.eventType = 'payment.failed';
    const order = { ...providerOrder(), status: 'attempted' };
    const payment = {
      ...providerPayment(),
      status: 'failed',
      captured: false,
    };

    const result = await harness.service.recordBookingPaymentFailure({
      paymentAttemptId: ATTEMPT_ID,
      order,
      payment,
      source: 'webhook',
      eventKey: EVENT_KEY,
      claimToken: 1,
      now: NOW,
    });

    expect(result).toMatchObject({
      decision: 'reject',
      recorded: true,
      idempotent: false,
      shouldNotify: false,
    });
    expect(harness.state.attempt).toMatchObject({
      status: 'payment_failed',
      failedAt: NOW,
    });
    expect(harness.state.booking).toMatchObject({
      status: 'pending',
      paymentStatus: 'failed',
      orderStatus: 'failed',
      paymentAttemptedAt: NOW,
      bookingAuthorization: {
        kind: 'payment',
        status: 'pending',
      },
    });
    expect(harness.state.booking.holdExpiresAt)
      .toEqual(new Date('2026-07-23T01:12:03.000Z'));
    expect(harness.state.event.processingState).toBe('processed');
    expect(harness.state.receipt).toBeNull();
  });

  test('treats a repeated exact failure as idempotent', async () => {
    const harness = makeStatefulService();
    harness.state.event.eventType = 'payment.failed';
    const input = {
      paymentAttemptId: ATTEMPT_ID,
      order: { ...providerOrder(), status: 'attempted' },
      payment: {
        ...providerPayment(),
        status: 'failed',
        captured: false,
      },
      source: 'webhook',
      eventKey: EVENT_KEY,
      claimToken: 1,
      now: NOW,
    };

    await harness.service.recordBookingPaymentFailure(input);
    harness.state.event = {
      ...makeFixture().event,
      _id: '64f000000000000000000007',
      eventKey: 'event:evt_booking_456',
      eventType: 'payment.failed',
    };
    input.eventKey = 'event:evt_booking_456';
    const duplicate = await harness.service.recordBookingPaymentFailure(input);

    expect(duplicate).toMatchObject({
      decision: 'reject',
      recorded: false,
      idempotent: true,
      shouldNotify: false,
    });
    expect(harness.models.PaymentAttemptModel.updateOne).toHaveBeenCalledTimes(1);
    expect(harness.models.BookingModel.updateOne).toHaveBeenCalledTimes(1);
  });

  test('ignores an out-of-order failed payment after the same order was captured', async () => {
    const state = makeFixture();
    const failedPaymentId = 'pay_failed_attempt_456';
    Object.assign(state.attempt, {
      status: 'captured',
      paymentId: PAYMENT_ID,
      capturedAt: new Date(NOW.getTime() - 1000),
    });
    Object.assign(state.booking, {
      status: 'confirmed',
      paymentStatus: 'paid',
      orderStatus: 'paid',
      paymentId: PAYMENT_ID,
      transactionId: ORDER_ID,
      bookingAuthorization: {
        kind: 'payment',
        status: 'authorized',
        reference: PAYMENT_ID,
        authorizedAt: new Date(NOW.getTime() - 1000),
      },
    });
    state.event.eventType = 'payment.failed';
    state.event.subject.paymentId = failedPaymentId;
    const harness = makeStatefulService({ state });

    const result = await harness.service.recordBookingPaymentFailure({
      paymentAttemptId: ATTEMPT_ID,
      order: providerOrder(),
      payment: {
        ...providerPayment(),
        id: failedPaymentId,
        status: 'failed',
        captured: false,
      },
      source: 'webhook',
      eventKey: EVENT_KEY,
      claimToken: 1,
      now: NOW,
    });

    expect(result).toMatchObject({
      decision: 'already_applied',
      recorded: false,
      idempotent: true,
      shouldNotify: false,
      mismatchCodes: [],
    });
    expect(state.attempt).toMatchObject({
      status: 'captured',
      paymentId: PAYMENT_ID,
    });
    expect(state.booking).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentId: PAYMENT_ID,
    });
    expect(state.event).toMatchObject({
      processingState: 'ignored',
      reconciliationDecision: 'already_applied',
    });
    expect(harness.models.PaymentAttemptModel.updateOne).not.toHaveBeenCalled();
    expect(harness.models.BookingModel.updateOne).not.toHaveBeenCalled();
  });

  test('quarantines failed evidence for the exact payment already stored as captured', async () => {
    const state = makeFixture();
    Object.assign(state.attempt, {
      status: 'captured',
      paymentId: PAYMENT_ID,
      capturedAt: new Date(NOW.getTime() - 1000),
    });
    Object.assign(state.booking, {
      status: 'confirmed',
      paymentStatus: 'paid',
      orderStatus: 'paid',
      paymentId: PAYMENT_ID,
      transactionId: ORDER_ID,
      bookingAuthorization: {
        kind: 'payment',
        status: 'authorized',
        reference: PAYMENT_ID,
        authorizedAt: new Date(NOW.getTime() - 1000),
      },
    });
    state.event.eventType = 'payment.failed';
    const harness = makeStatefulService({ state });

    const result = await harness.service.recordBookingPaymentFailure({
      paymentAttemptId: ATTEMPT_ID,
      order: providerOrder(),
      payment: {
        ...providerPayment(),
        status: 'failed',
        captured: false,
      },
      source: 'webhook',
      eventKey: EVENT_KEY,
      claimToken: 1,
      now: NOW,
    });

    expect(result).toMatchObject({
      decision: 'needs_review',
      recorded: false,
      idempotent: false,
      shouldNotify: false,
    });
    expect(result.mismatchCodes).toContain('FAILED_PAYMENT_EVIDENCE_MISMATCH');
    expect(state.attempt).toMatchObject({
      status: 'captured',
      paymentId: PAYMENT_ID,
    });
    expect(state.booking).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentId: PAYMENT_ID,
      bookingAuthorization: {
        status: 'authorized',
      },
    });
    expect(state.event).toMatchObject({
      processingState: 'needs_review',
      reconciliationDecision: 'needs_review',
    });
  });

  test.each([
    ['expired hold', (state) => {
      state.booking.holdExpiresAt = new Date(NOW.getTime() - 1);
    }],
    ['cancelled booking', (state) => {
      state.booking.status = 'cancelled';
      state.booking.bookingAuthorization.status = 'revoked';
    }],
  ])('ignores an exact no-funds failure after %s', async (_label, mutate) => {
    const state = makeFixture();
    mutate(state);
    const originalAttempt = clone(state.attempt);
    const originalBooking = clone(state.booking);
    state.event.eventType = 'payment.failed';
    const harness = makeStatefulService({ state });

    const result = await harness.service.recordBookingPaymentFailure({
      paymentAttemptId: ATTEMPT_ID,
      order: { ...providerOrder(), status: 'attempted' },
      payment: {
        ...providerPayment(),
        status: 'failed',
        captured: false,
      },
      source: 'webhook',
      eventKey: EVENT_KEY,
      claimToken: 1,
      now: NOW,
    });

    expect(result).toMatchObject({
      decision: 'reject',
      recorded: false,
      idempotent: false,
      shouldNotify: false,
    });
    expect(state.attempt).toEqual(originalAttempt);
    expect(state.booking).toEqual(originalBooking);
    expect(state.event.processingState).toBe('ignored');
    expect(harness.models.PaymentAttemptModel.updateOne).not.toHaveBeenCalled();
    expect(harness.models.BookingModel.updateOne).not.toHaveBeenCalled();
  });
});

const makeWebhookLedgerService = () => {
  const events = [];
  let nextId = 1;

  const query = (work) => {
    const chain = {
      session: jest.fn(() => chain),
      lean: jest.fn(async () => work()),
    };
    return chain;
  };
  const findEvent = (filter) => events.find((event) =>
    basicFilterMatches(event, filter));

  const PaymentWebhookEventModel = {
    create: jest.fn(async (documents) => {
      const document = documents[0];
      const duplicate = events.some((event) =>
        event.eventKey === document.eventKey
        || event.payloadDigest === document.payloadDigest
        || (
          document.providerEventId !== undefined
          && event.providerEventId === document.providerEventId
        ));
      if (duplicate) {
        const error = new Error('duplicate webhook identity');
        error.code = 11000;
        throw error;
      }
      const event = {
        _id: `64f0000000000000000000${nextId}`,
        ...clone(document),
      };
      nextId += 1;
      events.push(event);
      return [event];
    }),
    findOne: jest.fn((filter) => query(() => findEvent(filter) || null)),
    findOneAndUpdate: jest.fn((filter, update) => query(() => {
      const event = findEvent(filter);
      if (!event) return null;
      applyUpdate(event, update);
      return event;
    })),
    updateOne: jest.fn(async (filter, update) => {
      const event = findEvent(filter);
      if (!event) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(event, update);
      return { matchedCount: 1, modifiedCount: 1 };
    }),
  };

  const service = createRazorpayPaymentReconciliationService({
    mongooseInstance: { startSession: jest.fn() },
    BookingModel: {},
    PaymentAttemptModel: {},
    PaymentReceiptModel: {},
    PaymentWebhookEventModel,
  });

  return { service, events, PaymentWebhookEventModel };
};

const claimInput = ({
  eventKey = EVENT_KEY,
  providerEventId = 'evt_booking_123',
  payloadDigest = PAYLOAD_DIGEST,
  now = NOW,
} = {}) => ({
  eventKey,
  providerEventId,
  payloadDigest,
  eventType: 'payment.captured',
  orderId: ORDER_ID,
  paymentId: PAYMENT_ID,
  now,
});

describe('webhook ledger claim and finalization', () => {
  test('uses majority acknowledgement for standalone ledger writes', async () => {
    const { service, PaymentWebhookEventModel } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());
    await service.finalizeWebhookEvent({
      eventKey: EVENT_KEY,
      claimToken: 1,
      processingState: 'ignored',
      mismatchCodes: [],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      now: NOW,
    });

    expect(PaymentWebhookEventModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ eventKey: EVENT_KEY })],
      { writeConcern: { w: 'majority' } }
    );
    expect(PaymentWebhookEventModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: EVENT_KEY, processingAttempts: 1 }),
      expect.any(Object),
      expect.objectContaining({ writeConcern: { w: 'majority' } })
    );
  });

  test('omits absent provider IDs so multiple headerless events can be stored', async () => {
    const { service, events } = makeWebhookLedgerService();

    await service.claimWebhookEvent(claimInput({
      eventKey: `digest:${'b'.repeat(64)}`,
      providerEventId: null,
      payloadDigest: 'b'.repeat(64),
    }));
    await service.claimWebhookEvent(claimInput({
      eventKey: `digest:${'c'.repeat(64)}`,
      providerEventId: null,
      payloadDigest: 'c'.repeat(64),
    }));

    expect(events).toHaveLength(2);
    expect(events.every((event) =>
      !Object.prototype.hasOwnProperty.call(event, 'providerEventId')))
      .toBe(true);
  });

  test('does not label an active processing claim as a completed duplicate', async () => {
    const { service } = makeWebhookLedgerService();
    const first = await service.claimWebhookEvent(claimInput());

    const duplicate = await service.claimWebhookEvent(claimInput({
      now: new Date(NOW.getTime() + 1000),
    }));

    expect(first).toMatchObject({
      claimed: true,
      claimToken: 1,
      eventKey: EVENT_KEY,
    });
    expect(duplicate).toMatchObject({
      claimed: false,
      duplicate: false,
      inFlight: true,
      retryable: true,
      processingState: 'processing',
    });
  });

  test('reclaims an expired processing lease atomically', async () => {
    const { service, events } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());

    const reclaimed = await service.claimWebhookEvent(claimInput({
      now: new Date(NOW.getTime() + DEFAULT_WEBHOOK_LEASE_MS + 1),
    }));

    expect(reclaimed).toMatchObject({
      claimed: true,
      duplicate: false,
      reclaimed: true,
      claimToken: 2,
    });
    expect(events[0].processingAttempts).toBe(2);
    expect(events[0].deliveryCount).toBe(2);
  });

  test('marks a reused event identity with a different digest for review', async () => {
    const { service, events } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());

    const conflict = await service.claimWebhookEvent(claimInput({
      payloadDigest: 'd'.repeat(64),
    }));

    expect(conflict).toMatchObject({
      claimed: false,
      duplicate: true,
      conflict: true,
      processingState: 'needs_review',
    });
    expect(events[0]).toMatchObject({
      processingState: 'needs_review',
      processingAttempts: 2,
      identityConflictCount: 1,
      lastIdentityConflictAt: NOW,
      reconciliationDecision: 'needs_review',
      mismatchCodes: ['WEBHOOK_IDENTITY_CONFLICT'],
      failureCode: 'WEBHOOK_IDENTITY_CONFLICT',
    });
    expect(conflict).toMatchObject({
      terminal: true,
      ackSafe: true,
      duplicate: true,
    });
  });

  test('does not let an altered unsigned event ID overwrite a terminal row', async () => {
    const { service, events } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());
    await service.finalizeWebhookEvent({
      eventKey: EVENT_KEY,
      claimToken: 1,
      processingState: 'ignored',
      mismatchCodes: [],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      now: NOW,
    });

    const replay = await service.claimWebhookEvent(claimInput({
      eventKey: 'event:evt_altered_header_999',
      providerEventId: 'evt_altered_header_999',
      now: new Date(NOW.getTime() + 1000),
    }));

    expect(replay).toMatchObject({
      claimed: false,
      duplicate: true,
      conflict: false,
      processingState: 'ignored',
      eventKey: EVENT_KEY,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      processingState: 'ignored',
      eventKey: EVENT_KEY,
      providerEventId: 'evt_booking_123',
    });
  });

  test('records a terminal signed-payload identity conflict without changing its outcome', async () => {
    const { service, events } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());
    await service.finalizeWebhookEvent({
      eventKey: EVENT_KEY,
      claimToken: 1,
      processingState: 'ignored',
      mismatchCodes: [],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      now: NOW,
    });

    const conflictAt = new Date(NOW.getTime() + 1000);
    const replay = await service.claimWebhookEvent(claimInput({
      payloadDigest: 'd'.repeat(64),
      now: conflictAt,
    }));

    expect(replay).toMatchObject({
      claimed: false,
      duplicate: true,
      conflict: true,
      terminal: true,
      ackSafe: true,
      processingState: 'ignored',
    });
    expect(events[0]).toMatchObject({
      processingState: 'ignored',
      identityConflictCount: 1,
      lastIdentityConflictAt: conflictAt,
    });
    expect(events[0].mismatchCodes).toEqual([]);
  });

  test('does not acknowledge a terminal conflict when its audit write loses a race', async () => {
    const { service, PaymentWebhookEventModel } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());
    await service.finalizeWebhookEvent({
      eventKey: EVENT_KEY,
      claimToken: 1,
      processingState: 'ignored',
      mismatchCodes: [],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      now: NOW,
    });
    PaymentWebhookEventModel.updateOne.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0,
    });

    const conflict = await service.claimWebhookEvent(claimInput({
      payloadDigest: 'd'.repeat(64),
      now: new Date(NOW.getTime() + 1000),
    }));

    expect(conflict).toMatchObject({
      claimed: false,
      duplicate: false,
      conflict: true,
      ackSafe: false,
    });
  });

  test('returns terminal finalizations as safe duplicates', async () => {
    const { service } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());
    await service.finalizeWebhookEvent({
      eventKey: EVENT_KEY,
      claimToken: 1,
      processingState: 'ignored',
      mismatchCodes: [],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      now: NOW,
    });

    const duplicate = await service.claimWebhookEvent(claimInput({
      now: new Date(NOW.getTime() + 1000),
    }));

    expect(duplicate).toMatchObject({
      claimed: false,
      duplicate: true,
      processingState: 'ignored',
    });
  });

  test('does not accept a different outcome as a terminal duplicate', async () => {
    const { service, events } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());
    await service.finalizeWebhookEvent({
      eventKey: EVENT_KEY,
      claimToken: 1,
      processingState: 'needs_review',
      decision: 'needs_review',
      mismatchCodes: ['ATTEMPT_MISSING'],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      now: NOW,
    });

    await expect(service.finalizeWebhookEvent({
      eventKey: EVENT_KEY,
      claimToken: 1,
      processingState: 'needs_review',
      decision: 'needs_review',
      mismatchCodes: ['BOOKING_MISSING'],
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      now: new Date(NOW.getTime() + 1000),
    })).rejects.toMatchObject({ code: 'WEBHOOK_CLAIM_STALE' });

    expect(events[0].mismatchCodes).toEqual(['ATTEMPT_MISSING']);
  });

  test('respects retry delay and then reclaims a retryable failure', async () => {
    const { service } = makeWebhookLedgerService();
    await service.claimWebhookEvent(claimInput());
    await service.finalizeWebhookEventFailure({
      eventKey: EVENT_KEY,
      claimToken: 1,
      failureCode: 'WEBHOOK_PROCESSING_FAILED',
      now: NOW,
    });

    const early = await service.claimWebhookEvent(claimInput({
      now: new Date(NOW.getTime() + 1000),
    }));
    const ready = await service.claimWebhookEvent(claimInput({
      now: new Date(
        NOW.getTime() + DEFAULT_WEBHOOK_RETRY_DELAY_MS + 1
      ),
    }));

    expect(early).toMatchObject({
      claimed: false,
      duplicate: false,
      retryable: true,
      processingState: 'retryable_failure',
    });
    expect(ready).toMatchObject({
      claimed: true,
      reclaimed: true,
      processingState: 'processing',
    });
  });
});
