const crypto = require('crypto');
const {
  PaymentProviderTimeoutError,
  buildWebhookIdentity,
  fetchRazorpayEvidence,
  findRazorpayOrdersByReceipt,
  getWebhookPaymentReference,
  parseVerifiedWebhookEnvelope,
  validateOrderAgainstExpected,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
  withPaymentProviderTimeout,
} = require('../razorpayPaymentSecurity');

const SECRET = 'test-webhook-secret-that-is-not-a-real-credential';
const PREVIOUS_SECRET = 'previous-webhook-secret-not-a-real-credential';
const ORDER_ID = 'order_test_123';
const PAYMENT_ID = 'pay_test_456';

describe('Razorpay payment security helpers', () => {
  test('verifies a webhook only against the unchanged raw bytes', () => {
    const rawBody = Buffer.from('{"event":"payment.captured","payload":{}}');
    const signature = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

    expect(verifyRazorpayWebhookSignature({ rawBody, signature, secret: SECRET })).toBe(true);
    expect(verifyRazorpayWebhookSignature({
      rawBody: Buffer.from('{ "event": "payment.captured", "payload": {} }'),
      signature,
      secret: SECRET,
    })).toBe(false);
  });

  test('accepts a planned-rotation previous secret without exposing the match source', () => {
    const rawBody = Buffer.from('{"event":"payment.captured","payload":{}}');
    const signature = crypto
      .createHmac('sha256', PREVIOUS_SECRET)
      .update(rawBody)
      .digest('hex');
    const createHmacSpy = jest.spyOn(crypto, 'createHmac');

    const result = verifyRazorpayWebhookSignature({
      rawBody,
      signature,
      secret: SECRET,
      previousSecret: PREVIOUS_SECRET,
    });

    expect(result).toBe(true);
    expect(typeof result).toBe('boolean');
    expect(createHmacSpy).toHaveBeenCalledTimes(2);
    createHmacSpy.mockRestore();
  });

  test('requires the current secret even when a previous signature is valid', () => {
    const rawBody = Buffer.from('{"event":"payment.failed","payload":{}}');
    const signature = crypto
      .createHmac('sha256', PREVIOUS_SECRET)
      .update(rawBody)
      .digest('hex');

    expect(verifyRazorpayWebhookSignature({
      rawBody,
      signature,
      previousSecret: PREVIOUS_SECRET,
    })).toBe(false);
    expect(verifyRazorpayWebhookSignature({
      rawBody: Buffer.from('{"event":"payment.failed","payload":{"changed":true}}'),
      signature,
      secret: SECRET,
      previousSecret: PREVIOUS_SECRET,
    })).toBe(false);
  });

  test.each([
    ['parsed JSON', { event: 'payment.captured' }],
    ['empty bytes', Buffer.alloc(0)],
    ['missing body', undefined],
  ])('rejects a %s webhook body', (_label, rawBody) => {
    expect(verifyRazorpayWebhookSignature({ rawBody, signature: 'a'.repeat(64), secret: SECRET }))
      .toBe(false);
  });

  test.each(['', 'abc', 'g'.repeat(64), ['a'.repeat(64)]])(
    'rejects a malformed or duplicate signature header (%p)',
    (signature) => {
      expect(verifyRazorpayWebhookSignature({
        rawBody: Buffer.from('{}'),
        signature,
        secret: SECRET,
      })).toBe(false);
    }
  );

  test('parses a verified envelope and extracts only provider references', () => {
    const event = parseVerifiedWebhookEnvelope(Buffer.from(JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: PAYMENT_ID,
            order_id: ORDER_ID,
            email: 'must-not-be-returned@example.test',
          },
        },
      },
    })));

    expect(getWebhookPaymentReference(event)).toEqual({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    });
  });

  test.each([
    Buffer.from('not-json'),
    Buffer.from('{}'),
    Buffer.from('{"event":"INVALID EVENT"}'),
  ])('rejects malformed verified webhook envelopes', (rawBody) => {
    expect(() => parseVerifiedWebhookEnvelope(rawBody)).toThrow();
  });

  test('uses provider event ID when valid and raw digest otherwise', () => {
    const rawBody = Buffer.from('{"event":"payment.captured"}');
    const withEventId = buildWebhookIdentity({ rawBody, providerEventId: 'evt_test_123' });
    const withoutEventId = buildWebhookIdentity({ rawBody });

    expect(withEventId).toMatchObject({
      providerEventId: 'evt_test_123',
      eventKey: 'event:evt_test_123',
    });
    expect(withEventId.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(withoutEventId.eventKey).toBe(`digest:${withoutEventId.payloadDigest}`);
  });

  test.each(['bad id', '', ['evt_test_123']])('rejects malformed event IDs (%p)', (providerEventId) => {
    expect(() => buildWebhookIdentity({
      rawBody: Buffer.from('{}'),
      providerEventId,
    })).toThrow('Invalid Razorpay event ID');
  });

  test('verifies checkout signatures without treating them as payment evidence', () => {
    const signature = crypto
      .createHmac('sha256', SECRET)
      .update(`${ORDER_ID}|${PAYMENT_ID}`)
      .digest('hex');

    expect(verifyRazorpayCheckoutSignature({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature,
      secret: SECRET,
    })).toBe(true);
    expect(verifyRazorpayCheckoutSignature({
      orderId: ORDER_ID,
      paymentId: 'pay_other_789',
      signature,
      secret: SECRET,
    })).toBe(false);
  });

  test('validates all immutable order creation fields', () => {
    const expected = {
      amountMinor: 12345,
      currency: 'INR',
      receipt: 'booking_64f000000000000000000010',
      notes: {
        bookingId: '64f000000000000000000001',
        userId: '64f000000000000000000002',
      },
    };
    const order = {
      id: ORDER_ID,
      amount: 12345,
      currency: 'INR',
      receipt: expected.receipt,
      notes: expected.notes,
      status: 'created',
    };

    expect(validateOrderAgainstExpected({ order, expected })).toEqual({
      valid: true,
      mismatchCodes: [],
    });
    expect(validateOrderAgainstExpected({
      order: { ...order, amount: 1, currency: 'USD', receipt: 'wrong' },
      expected,
    })).toEqual(expect.objectContaining({
      valid: false,
      mismatchCodes: expect.arrayContaining([
        'ORDER_AMOUNT_MISMATCH',
        'ORDER_CURRENCY_MISMATCH',
        'ORDER_RECEIPT_MISMATCH',
      ]),
    }));
  });

  test('fetches order and payment together under a timeout', async () => {
    const client = {
      orders: { fetch: jest.fn().mockResolvedValue({ id: ORDER_ID }) },
      payments: { fetch: jest.fn().mockResolvedValue({ id: PAYMENT_ID }) },
    };

    await expect(fetchRazorpayEvidence({
      client,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      timeoutMs: 100,
    })).resolves.toEqual({
      order: { id: ORDER_ID },
      payment: { id: PAYMENT_ID },
    });
  });

  test('finds provider orders by the stable receipt', async () => {
    const client = {
      orders: { all: jest.fn().mockResolvedValue({ items: [{ id: ORDER_ID }] }) },
    };

    await expect(findRazorpayOrdersByReceipt({
      client,
      receipt: 'booking_64f000000000000000000010',
      timeoutMs: 100,
    })).resolves.toEqual([{ id: ORDER_ID }]);
  });

  test('fails provider operations with a bounded timeout', async () => {
    await expect(withPaymentProviderTimeout(
      () => new Promise(() => {}),
      5
    )).rejects.toBeInstanceOf(PaymentProviderTimeoutError);
  });
});
