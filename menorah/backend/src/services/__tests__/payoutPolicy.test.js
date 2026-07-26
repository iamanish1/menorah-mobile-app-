const {
  PAYOUT_APPROVAL_TTL_MS,
  RECENT_ADMIN_MFA_MAX_AGE_MS,
  MAX_SINGLE_PAYOUT_PAISE,
  buildAuthorizedPayoutRevenuePipeline,
  calculateEarnedPaise,
  calculatePayoutAvailability,
  getProviderPayoutIdempotencyKey,
  getPermittedPriorPayoutStatuses,
  getMaximumPayoutPaise,
  isDefinitiveProviderFailure,
  isValidPayoutIdempotencyKey,
  isRecentAdminMfa,
} = require('../payoutPolicy');

describe('payout policy', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  test('only makes completed paid revenue available after commission', () => {
    expect(calculateEarnedPaise({ paidRevenueRupees: 1_000, commissionRate: 20 })).toBe(80_000);
  });

  test('reserves pending and processed payouts before calculating availability', () => {
    expect(calculatePayoutAvailability({
      paidRevenueRupees: 1_000,
      commissionRate: 20,
      reservedPaise: 30_000,
    })).toEqual({ earnedPaise: 80_000, reservedPaise: 30_000, availablePaise: 50_000 });
  });

  test('funds payouts only from strictly authorized completed booking amounts', () => {
    const counsellorId = '64f000000000000000000001';
    const now = new Date('2026-07-23T12:00:00.000Z');
    const pipeline = buildAuthorizedPayoutRevenuePipeline({ counsellorId, now });

    expect(pipeline).toEqual([
      {
        $match: expect.objectContaining({
          counsellor: counsellorId,
          status: 'completed',
          $or: expect.any(Array),
        }),
      },
      {
        $group: {
          _id: null,
          revenuePaise: { $sum: '$amountMinor' },
        },
      },
    ]);
  });

  test('excludes missing or mismatched payment and provider-order bindings from revenue', () => {
    const pipeline = buildAuthorizedPayoutRevenuePipeline({
      counsellorId: '64f000000000000000000001',
      now: new Date('2026-07-23T12:00:00.000Z'),
    });

    const paymentBranch = pipeline[0].$match.$or.find(
      (branch) => branch.paymentMethod === 'razorpay',
    );
    expect(paymentBranch).toEqual(expect.objectContaining({
      paymentStatus: 'paid',
      paymentId: { $type: 'string', $regex: /\S/ },
      razorpayOrderId: { $type: 'string', $regex: /\S/ },
      transactionId: { $type: 'string', $regex: /\S/ },
      orderStatus: 'paid',
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'authorized',
      'bookingAuthorization.reference': { $type: 'string', $regex: /\S/ },
    }));
    expect(paymentBranch.$expr.$and).toEqual(expect.arrayContaining([
      { $eq: ['$bookingAuthorization.reference', '$paymentId'] },
      { $eq: ['$transactionId', '$razorpayOrderId'] },
      { $eq: ['$amountMinor', '$pricing.listAmountMinor'] },
    ]));
  });

  test('keeps authorized subscription bookings zero-valued in payout revenue', () => {
    const pipeline = buildAuthorizedPayoutRevenuePipeline({
      counsellorId: '64f000000000000000000001',
      now: new Date('2026-07-23T12:00:00.000Z'),
    });
    const subscriptionBranch = pipeline[0].$match.$or.find(
      (branch) => branch.paymentMethod === 'subscription',
    );

    expect(subscriptionBranch).toEqual(expect.objectContaining({
      paymentStatus: 'paid',
      paymentMethod: 'subscription',
      isSubscriptionBooking: true,
      amountMinor: 0,
      'bookingAuthorization.kind': 'subscription_entitlement',
      'bookingAuthorization.status': 'authorized',
    }));
    expect(pipeline[1]).toEqual({
      $group: {
        _id: null,
        revenuePaise: { $sum: '$amountMinor' },
      },
    });
  });

  test('requires the approved INR 50,000 per-payout cap', () => {
    delete process.env.MAX_PAYOUT_AMOUNT_PAISE;
    expect(() => getMaximumPayoutPaise()).toThrow(`must equal ${MAX_SINGLE_PAYOUT_PAISE}`);

    process.env.MAX_PAYOUT_AMOUNT_PAISE = '5000001';
    expect(() => getMaximumPayoutPaise()).toThrow(`must equal ${MAX_SINGLE_PAYOUT_PAISE}`);

    process.env.MAX_PAYOUT_AMOUNT_PAISE = String(MAX_SINGLE_PAYOUT_PAISE);
    expect(getMaximumPayoutPaise()).toBe(5_000_000);
  });

  test('requires MFA verified within the approval window', () => {
    const now = 1_000_000;
    expect(isRecentAdminMfa({ mfaAuthenticatedAt: now - RECENT_ADMIN_MFA_MAX_AGE_MS }, now)).toBe(true);
    expect(isRecentAdminMfa({ mfaAuthenticatedAt: now - RECENT_ADMIN_MFA_MAX_AGE_MS - 1 }, now)).toBe(false);
    expect(isRecentAdminMfa({}, now)).toBe(false);
    expect(PAYOUT_APPROVAL_TTL_MS).toBeGreaterThan(0);
  });

  test('accepts bounded application idempotency keys and derives a provider-safe key', () => {
    expect(isValidPayoutIdempotencyKey('request_12345678')).toBe(true);
    expect(isValidPayoutIdempotencyKey('contains spaces')).toBe(false);
    expect(getProviderPayoutIdempotencyKey({ _id: '64f000000000000000000001' }))
      .toBe('64f000000000000000000001');
  });

  test('keeps ambiguous provider outcomes active for safe idempotent retry', () => {
    expect(isDefinitiveProviderFailure({ response: { status: 400 } })).toBe(true);
    expect(isDefinitiveProviderFailure({ response: { status: 500 } })).toBe(false);
    expect(isDefinitiveProviderFailure({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isDefinitiveProviderFailure({ statusCode: 503 })).toBe(true);
  });

  test('never permits a delayed webhook to regress a terminal payout', () => {
    expect(getPermittedPriorPayoutStatuses('processing')).not.toContain('processed');
    expect(getPermittedPriorPayoutStatuses('processed')).toContain('processing');
    expect(getPermittedPriorPayoutStatuses('reversed')).toContain('processed');
    expect(getPermittedPriorPayoutStatuses('unexpected')).toBeNull();
  });
});
