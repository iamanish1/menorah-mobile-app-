const {
  isBookingPaymentInitiationEnabled,
  isPayoutInitiationEnabled,
  isSubscriptionPaymentFlowEnabled,
  isUsableRazorpayKeyId,
  isUsablePaymentSecret,
  isUsablePayoutAccountNumber,
  getRazorpayConfigurationState,
  getRazorpayPayoutConfigurationState,
  getPaymentWebhookMaxProcessingAttempts,
} = require('../paymentFeatures');

describe('payment feature gates', () => {
  test('booking payment initiation is disabled by default', () => {
    expect(isBookingPaymentInitiationEnabled({})).toBe(false);
  });

  test('booking payment initiation requires the exact explicit opt-in value', () => {
    expect(isBookingPaymentInitiationEnabled({
      BOOKING_PAYMENTS_ENABLED: 'true',
      PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS: '5',
    })).toBe(true);
    expect(isBookingPaymentInitiationEnabled({
      BOOKING_PAYMENTS_ENABLED: 'true',
    })).toBe(false);

    for (const value of ['false', 'TRUE', '1', 'yes', ' true ', '', true]) {
      expect(isBookingPaymentInitiationEnabled({ BOOKING_PAYMENTS_ENABLED: value })).toBe(false);
    }
  });

  test('payout initiation is default-off and requires the exact explicit opt-in', () => {
    expect(isPayoutInitiationEnabled({})).toBe(false);
    expect(isPayoutInitiationEnabled({ PAYOUTS_ENABLED: 'true' })).toBe(true);

    for (const value of ['false', 'TRUE', '1', 'yes', ' true ', '', true]) {
      expect(isPayoutInitiationEnabled({ PAYOUTS_ENABLED: value })).toBe(false);
    }
  });

  test('subscription payment initiation and verification remain hard-disabled', () => {
    expect(isSubscriptionPaymentFlowEnabled()).toBe(false);
    expect(isSubscriptionPaymentFlowEnabled({
      SUBSCRIPTION_PAYMENTS_ENABLED: 'true',
    })).toBe(false);
  });

  test.each([
    ['1', 1],
    ['25', 25],
    ['1000', 1000],
    [undefined, null],
    ['', null],
    ['0', null],
    ['1001', null],
    ['01', null],
    [' 5 ', null],
    ['five', null],
  ])('parses the bounded webhook processing-attempt setting (%p)', (value, expected) => {
    expect(getPaymentWebhookMaxProcessingAttempts({
      PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS: value,
    })).toBe(expected);
  });

  test.each([
    'rzp_test_A1b2C3d4E5f6G7',
    'rzp_live_Z9y8X7w6V5u4T3',
  ])('accepts a structurally valid Razorpay key ID (%s)', (value) => {
    expect(isUsableRazorpayKeyId(value)).toBe(true);
  });

  test.each([
    undefined,
    '',
    'rzp_live_REPLACE',
    'rzp_test_xxxxxxxxxxxxxx',
    'rzp_live_A1b2C3d4E5f6G7 ',
    'not-a-razorpay-key',
  ])('rejects an unusable Razorpay key ID (%s)', (value) => {
    expect(isUsableRazorpayKeyId(value)).toBe(false);
  });

  test('validates payment secrets without returning or logging their values', () => {
    const secret = 'A1b2C3d4E5f6G7h8I9j0K1l2';

    expect(isUsablePaymentSecret(secret)).toBe(true);
    expect(isUsablePaymentSecret('too-short')).toBe(false);
    expect(isUsablePaymentSecret('REPLACE_WITH_RAZORPAY_SECRET')).toBe(false);
    expect(isUsablePaymentSecret('local_razorpay_secret')).toBe(false);
    expect(isUsablePaymentSecret(1234567890123456)).toBe(false);
    expect(isUsablePaymentSecret(secret, { minLength: secret.length + 1 })).toBe(false);
  });

  test.each([
    ['787808008031', true],
    ['123456', true],
    ['12345678901234567890123456789012', true],
    [undefined, false],
    ['', false],
    ['12345', false],
    ['123456789012345678901234567890123', false],
    ['111111111111', false],
    ['REPLACE_WITH_PAYOUT_ACCOUNT_NUMBER', false],
    [' 787808008031 ', false],
    ['acct_787808008031', false],
  ])('validates RazorpayX payout account number %p', (value, expected) => {
    expect(isUsablePayoutAccountNumber(value)).toBe(expected);
  });

  test('returns only boolean Razorpay configuration state', () => {
    const state = getRazorpayConfigurationState({
      RAZORPAY_KEY_ID: 'rzp_live_A1b2C3d4E5f6G7',
      RAZORPAY_KEY_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2',
      RAZORPAY_WEBHOOK_SECRET: 'Webhook-A1b2C3d4E5f6G7h8',
    });

    expect(state).toEqual({
      keyIdUsable: true,
      keySecretUsable: true,
      webhookSecretUsable: true,
      previousWebhookSecretPresent: false,
      previousWebhookSecretUsable: false,
      webhookRotationConfigurationValid: true,
      checkoutConfigured: true,
      webhookConfigured: true,
    });
    expect(Object.values(state).every((value) => typeof value === 'boolean')).toBe(true);
  });

  test.each([undefined, ''])(
    'allows an absent previous webhook secret (%p)',
    (previousSecret) => {
      const state = getRazorpayConfigurationState({
        RAZORPAY_WEBHOOK_SECRET: 'Webhook-Current-A1b2C3d4E5f6',
        RAZORPAY_WEBHOOK_SECRET_PREVIOUS: previousSecret,
      });

      expect(state).toMatchObject({
        webhookSecretUsable: true,
        previousWebhookSecretPresent: false,
        previousWebhookSecretUsable: false,
        webhookRotationConfigurationValid: true,
        webhookConfigured: true,
      });
    }
  );

  test('accepts a distinct usable previous webhook secret', () => {
    expect(getRazorpayConfigurationState({
      RAZORPAY_WEBHOOK_SECRET: 'Webhook-Current-A1b2C3d4E5f6',
      RAZORPAY_WEBHOOK_SECRET_PREVIOUS: 'Webhook-Previous-Z9y8X7w6V5u4',
    })).toMatchObject({
      previousWebhookSecretPresent: true,
      previousWebhookSecretUsable: true,
      webhookRotationConfigurationValid: true,
      webhookConfigured: true,
    });
  });

  test.each([
    'too-short',
    'replace_with_previous_secret',
    ' Webhook-Previous-Z9y8X7w6V5u4 ',
    'Webhook-Current-A1b2C3d4E5f6',
  ])('fails closed for an unsafe previous webhook secret (%p)', (previousSecret) => {
    expect(getRazorpayConfigurationState({
      RAZORPAY_WEBHOOK_SECRET: 'Webhook-Current-A1b2C3d4E5f6',
      RAZORPAY_WEBHOOK_SECRET_PREVIOUS: previousSecret,
    })).toMatchObject({
      previousWebhookSecretPresent: true,
      previousWebhookSecretUsable: false,
      webhookRotationConfigurationValid: false,
      webhookConfigured: false,
    });
  });

  test('a previous webhook secret never replaces the required current secret', () => {
    expect(getRazorpayConfigurationState({
      RAZORPAY_WEBHOOK_SECRET_PREVIOUS: 'Webhook-Previous-Z9y8X7w6V5u4',
    })).toMatchObject({
      webhookSecretUsable: false,
      previousWebhookSecretUsable: true,
      webhookConfigured: false,
    });
  });

  test('returns only dedicated RazorpayX configuration state', () => {
    const state = getRazorpayPayoutConfigurationState({
      RAZORPAY_X_KEY_ID: 'rzp_live_A1b2C3d4E5f6G7',
      RAZORPAY_X_KEY_SECRET: 'RazorpayX-A1b2C3d4E5f6G7h8',
      RAZORPAY_PAYOUT_ACCOUNT_NUMBER: '787808008031',
      RAZORPAY_X_WEBHOOK_SECRET: 'X-Webhook-A1b2C3d4E5f6G7h8',
    });

    expect(state).toEqual({
      keyIdUsable: true,
      keySecretUsable: true,
      accountNumberUsable: true,
      webhookSecretUsable: true,
      executionConfigured: true,
      webhookConfigured: true,
    });
    expect(Object.values(state).every((value) => typeof value === 'boolean')).toBe(true);
  });

  test('checkout credentials never satisfy RazorpayX configuration', () => {
    expect(getRazorpayPayoutConfigurationState({
      RAZORPAY_KEY_ID: 'rzp_live_A1b2C3d4E5f6G7',
      RAZORPAY_KEY_SECRET: 'Checkout-A1b2C3d4E5f6G7h8',
      RAZORPAY_WEBHOOK_SECRET: 'Checkout-Webhook-A1b2C3d4E5',
      RAZORPAY_PAYOUT_ACCOUNT_NUMBER: '787808008031',
    })).toEqual({
      keyIdUsable: false,
      keySecretUsable: false,
      accountNumberUsable: true,
      webhookSecretUsable: false,
      executionConfigured: false,
      webhookConfigured: false,
    });
  });
});
