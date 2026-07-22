const {
  PAYOUT_APPROVAL_TTL_MS,
  RECENT_ADMIN_MFA_MAX_AGE_MS,
  MAX_SINGLE_PAYOUT_PAISE,
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
