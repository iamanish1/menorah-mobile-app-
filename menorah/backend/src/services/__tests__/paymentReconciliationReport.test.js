const {
  buildPaidAuthorizationGapFilter,
  buildPaymentReconciliationReport,
  pageRows,
} = require('../paymentReconciliationReport');

const NOW = new Date('2026-07-23T12:00:00.000Z');

const queryReturning = (rows) => {
  const query = {};
  query.select = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.lean = jest.fn(async () => rows);
  return query;
};

describe('payment reconciliation read-only report', () => {
  test('returns only safe operational fields and accurate state counts', async () => {
    const eventQuery = queryReturning([{
      _id: '64f000000000000000000001',
      eventType: 'payment.captured',
      processingState: 'needs_review',
      reconciliationDecision: 'needs_review',
      mismatchCodes: ['BOOKING_HOLD_EXPIRED'],
      processingAttempts: 2,
      deliveryCount: 3,
      receivedAt: new Date('2026-07-23T11:00:00.000Z'),
      subject: {
        orderId: 'order_safe_123',
        paymentId: 'pay_safe_123',
        booking: '64f000000000000000000002',
        paymentAttempt: '64f000000000000000000003',
      },
      payloadDigest: 'must-not-be-reported',
    }]);
    const attemptQuery = queryReturning([{
      _id: '64f000000000000000000003',
      booking: '64f000000000000000000002',
      user: 'must-not-be-reported',
      status: 'needs_review',
      orderId: 'order_safe_123',
      createdAt: new Date('2026-07-23T10:00:00.000Z'),
      reconciliation: {
        lastDecision: 'needs_review',
        mismatchCodes: ['BOOKING_HOLD_EXPIRED'],
        lastSource: 'webhook',
      },
      expected: { amountMinor: 100000, notes: { userId: 'private' } },
    }]);
    const PaymentWebhookEventModel = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'needs_review', count: 4 },
        { _id: 'retryable_failure', count: 2 },
      ]),
      find: jest.fn(() => eventQuery),
    };
    const PaymentAttemptModel = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'needs_review', count: 5 },
      ]),
      find: jest.fn(() => attemptQuery),
    };
    const bookingQuery = queryReturning([{
      _id: '64f000000000000000000002',
      counsellor: '64f000000000000000000004',
      user: 'must-not-be-reported',
      status: 'expired',
      paymentStatus: 'pending',
      razorpayOrderId: 'order_safe_123',
      scheduledAt: new Date('2026-07-24T10:00:00.000Z'),
      sessionDuration: 60,
      createdAt: new Date('2026-07-23T09:00:00.000Z'),
      preferences: { private: true },
    }]);
    const paidGapQuery = queryReturning([{
      _id: '64f000000000000000000005',
      counsellor: '64f000000000000000000004',
      user: 'must-not-be-reported',
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'razorpay',
      isSubscriptionBooking: false,
      razorpayOrderId: 'order_legacy_paid',
      paymentId: 'pay_legacy_paid',
      bookingAuthorization: { status: 'pending' },
      scheduledAt: new Date('2026-07-24T12:00:00.000Z'),
      sessionDuration: 45,
      createdAt: new Date('2026-07-23T08:00:00.000Z'),
      concerns: 'must-not-be-reported',
    }]);
    const BookingModel = {
      countDocuments: jest.fn()
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(2),
      find: jest.fn()
        .mockReturnValueOnce(bookingQuery)
        .mockReturnValueOnce(paidGapQuery),
    };

    const report = await buildPaymentReconciliationReport({
      PaymentAttemptModel,
      PaymentWebhookEventModel,
      BookingModel,
      now: NOW,
      limit: 25,
      cursors: {
        paidAuthorizationGaps: '64f000000000000000000004',
      },
    });

    expect(report).toMatchObject({
      generatedAt: NOW.toISOString(),
      readOnly: true,
      truncatedAt: 25,
      pagination: {
        webhookEvents: {
          afterId: null,
          hasMore: false,
          nextAfterId: null,
        },
        paidAuthorizationGaps: {
          afterId: '64f000000000000000000004',
          hasMore: false,
          nextAfterId: null,
        },
      },
      summary: {
        webhookEvents: { needs_review: 4, retryable_failure: 2 },
        paymentAttempts: { needs_review: 5 },
        quarantinedBookings: 6,
        paidAuthorizationGaps: 2,
      },
      webhookEvents: [{
        id: '64f000000000000000000001',
        state: 'needs_review',
        ageSeconds: 3600,
        providerOrderId: 'order_safe_123',
        providerPaymentId: 'pay_safe_123',
      }],
      paymentAttempts: [{
        id: '64f000000000000000000003',
        state: 'needs_review',
        ageSeconds: 7200,
        providerOrderId: 'order_safe_123',
      }],
      quarantinedBookings: [{
        id: '64f000000000000000000002',
        counsellorId: '64f000000000000000000004',
        state: 'expired',
        paymentState: 'pending',
        providerOrderId: 'order_safe_123',
        ageSeconds: 10800,
      }],
      paidAuthorizationGaps: [{
        id: '64f000000000000000000005',
        state: 'confirmed',
        paymentState: 'paid',
        paymentMethod: 'razorpay',
        authorizationState: 'pending',
        providerOrderId: 'order_legacy_paid',
        providerPaymentId: 'pay_legacy_paid',
        ageSeconds: 14400,
      }],
    });
    expect(JSON.stringify(report)).not.toMatch(/must-not-be-reported|amountMinor|userId/);
    expect(eventQuery.select).toHaveBeenCalledWith(expect.not.stringMatching(
      /payloadDigest|providerEventId/
    ));
    expect(attemptQuery.select).toHaveBeenCalledWith(expect.not.stringMatching(
      /\buser\b|expected/
    ));
    expect(bookingQuery.select).toHaveBeenCalledWith(expect.not.stringMatching(
      /\buser\b|preferences|symptoms|concerns|goals/
    ));
    expect(paidGapQuery.select).toHaveBeenCalledWith(expect.not.stringMatching(
      /\buser\b|preferences|symptoms|concerns|goals|reference/
    ));
    expect(eventQuery.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(eventQuery.limit).toHaveBeenCalledWith(26);
    expect(attemptQuery.limit).toHaveBeenCalledWith(26);
    expect(bookingQuery.limit).toHaveBeenCalledWith(26);
    expect(paidGapQuery.limit).toHaveBeenCalledWith(26);
    expect(BookingModel.find.mock.calls[1][0]).toEqual(expect.objectContaining({
      _id: { $gt: '64f000000000000000000004' },
    }));
  });

  test('emits a stable continuation cursor without returning the lookahead row', () => {
    expect(pageRows([
      { _id: '64f000000000000000000001' },
      { _id: '64f000000000000000000002' },
      { _id: '64f000000000000000000003' },
    ], 2)).toEqual({
      items: [
        { _id: '64f000000000000000000001' },
        { _id: '64f000000000000000000002' },
      ],
      hasMore: true,
      nextAfterId: '64f000000000000000000002',
    });
  });

  test('defines paid gaps as the inverse of both strict authorization branches', () => {
    const filter = buildPaidAuthorizationGapFilter(NOW);

    expect(filter.paymentStatus).toBe('paid');
    expect(filter.$nor).toHaveLength(2);
    expect(filter.$nor).toEqual(expect.arrayContaining([
      expect.objectContaining({
        paymentMethod: 'razorpay',
        razorpayOrderId: { $type: 'string', $regex: /\S/ },
        transactionId: { $type: 'string', $regex: /\S/ },
        orderStatus: 'paid',
        'bookingAuthorization.kind': 'payment',
        'bookingAuthorization.status': 'authorized',
        $expr: expect.objectContaining({
          $and: expect.arrayContaining([
            { $eq: ['$transactionId', '$razorpayOrderId'] },
          ]),
        }),
      }),
      expect.objectContaining({
        paymentMethod: 'subscription',
        'bookingAuthorization.kind': 'subscription_entitlement',
        'bookingAuthorization.status': 'authorized',
      }),
    ]));
  });

  test.each([0, 1001, 1.5, NaN])('rejects unsafe row limit %p', async (limit) => {
    await expect(buildPaymentReconciliationReport({
      PaymentAttemptModel: {},
      PaymentWebhookEventModel: {},
      BookingModel: {},
      now: NOW,
      limit,
    })).rejects.toThrow(/Report limit must be an integer/);
  });
});
