const PaymentWebhookEvent = require('../PaymentWebhookEvent');

const DIGEST = 'a'.repeat(64);

const makeEvent = (overrides = {}) => new PaymentWebhookEvent({
  eventKey: `sha256:${DIGEST}`,
  payloadDigest: DIGEST,
  eventType: 'payment.captured',
  ...overrides,
});

describe('PaymentWebhookEvent model', () => {
  test('accepts safe deduplication and processing metadata', () => {
    const event = makeEvent({
      providerEventId: 'evt_payment_123',
      subject: {
        orderId: 'order_booking_123',
        paymentId: 'pay_booking_123',
        booking: '64f000000000000000000001',
      },
      reconciliationDecision: 'authorize',
      mismatchCodes: [],
    });

    expect(event.validateSync()).toBeUndefined();
    expect(event.provider).toBe('razorpay');
    expect(event.processingState).toBe('received');
    expect(event.identityConflictCount).toBe(0);
    expect(event.receivedAt).toBeInstanceOf(Date);
  });

  test('uniquely indexes the stable event key, signed-body digest, and provider event ID', () => {
    const indexes = PaymentWebhookEvent.schema.indexes();
    const eventKeyIndex = indexes.find(([fields]) => fields.eventKey === 1);
    const digestIndex = indexes.find(([fields]) => fields.payloadDigest === 1);
    const providerEventIndex = indexes.find(([fields]) => fields.providerEventId === 1);

    expect(eventKeyIndex?.[1]).toEqual(expect.objectContaining({ unique: true }));
    expect(digestIndex?.[1]).toEqual(expect.objectContaining({ unique: true }));
    expect(providerEventIndex?.[1]).toEqual(expect.objectContaining({
      unique: true,
      sparse: true,
    }));
  });

  test('uses explicit processing lifecycle states and timestamps', () => {
    expect(PaymentWebhookEvent.schema.path('processingState').options.enum).toEqual([
      'received',
      'processing',
      'processed',
      'ignored',
      'needs_review',
      'retryable_failure',
    ]);
    expect(makeEvent({ processingState: 'silently_dropped' }).validateSync()?.errors.processingState)
      .toBeTruthy();
  });

  test.each([
    ['invalid digest', { payloadDigest: 'raw-payload' }, 'payloadDigest'],
    ['unsafe mismatch text', { mismatchCodes: ['amount mismatch: 4111111111111111'] }, 'mismatchCodes.0'],
    ['unsafe failure text', { failureCode: 'secret=webhook-secret' }, 'failureCode'],
    ['fractional delivery count', { deliveryCount: 1.5 }, 'deliveryCount'],
    ['fractional conflict count', { identityConflictCount: 1.5 }, 'identityConflictCount'],
  ])('rejects %s', (_label, overrides, errorPath) => {
    const error = makeEvent(overrides).validateSync();

    expect(error?.errors[errorPath]).toBeTruthy();
  });

  test('strictly refuses raw webhook payload or secret fields', () => {
    expect(() => makeEvent({ rawPayload: { payment: 'sensitive' } })).toThrow();
    expect(() => makeEvent({ signature: 'webhook-secret' })).toThrow();
  });

  test('does not define any schema path for raw request material', () => {
    const paths = Object.keys(PaymentWebhookEvent.schema.paths).join(' ').toLowerCase();

    expect(paths).not.toMatch(/payload(?!digest)|raw|signature|secret|headers|error(message)?/);
  });

  test('bounds the safe mismatch-code list', () => {
    const error = makeEvent({
      mismatchCodes: Array(65).fill('ORDER_AMOUNT_MISMATCH'),
    }).validateSync();

    expect(error?.errors.mismatchCodes).toBeTruthy();
  });
});
