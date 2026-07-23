const {
  RAZORPAY_X_PROVIDER_TIMEOUT_MS,
  RazorpayPayoutConfigurationError,
  createRazorpayPayout,
} = require('../razorpayPayoutService');

const payout = {
  _id: '64f000000000000000000010',
  amountPaise: 125000,
  referenceId: 'payout-reference-1',
};

const counsellor = {
  _id: '64f000000000000000000020',
  user: {
    firstName: 'Test',
    lastName: 'Counsellor',
    email: 'counsellor@example.test',
    phone: '+910000000000',
  },
  bankDetails: {
    accountNumberEncrypted: 'encrypted-test-account',
    accountHolderName: 'Test Counsellor',
    ifscCode: 'TEST0000123',
  },
};

const payoutEnv = {
  RAZORPAY_X_KEY_ID: 'rzp_test_X1b2C3d4E5f6G7',
  RAZORPAY_X_KEY_SECRET: 'RazorpayX-A1b2C3d4E5f6G7h8',
  RAZORPAY_PAYOUT_ACCOUNT_NUMBER: '787808008031',
};

describe('RazorpayX payout service', () => {
  test('fails closed instead of falling back to checkout credentials', async () => {
    const httpClient = { post: jest.fn() };
    const decryptAccountNumber = jest.fn();

    await expect(createRazorpayPayout({
      payout,
      counsellor,
      env: {
        RAZORPAY_KEY_ID: 'rzp_test_A1b2C3d4E5f6G7',
        RAZORPAY_KEY_SECRET: 'Checkout-A1b2C3d4E5f6G7h8',
        RAZORPAY_PAYOUT_ACCOUNT_NUMBER: '787808008031',
      },
      httpClient,
      decryptAccountNumber,
    })).rejects.toBeInstanceOf(RazorpayPayoutConfigurationError);

    expect(httpClient.post).not.toHaveBeenCalled();
    expect(decryptAccountNumber).not.toHaveBeenCalled();
  });

  test('uses dedicated credentials, strict timeouts, and provider idempotency', async () => {
    const httpClient = {
      post: jest.fn()
        .mockResolvedValueOnce({ data: { id: 'cont_test_123' } })
        .mockResolvedValueOnce({ data: { id: 'fa_test_123' } })
        .mockResolvedValueOnce({ data: { id: 'pout_test_123', status: 'queued' } }),
    };
    const CounsellorModel = {
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const decryptAccountNumber = jest.fn().mockReturnValue('123456789012');

    const result = await createRazorpayPayout({
      payout,
      counsellor,
      env: payoutEnv,
      httpClient,
      CounsellorModel,
      decryptAccountNumber,
    });

    expect(result).toEqual({
      payoutResponse: { id: 'pout_test_123', status: 'queued' },
      contactId: 'cont_test_123',
      fundAccountId: 'fa_test_123',
    });
    expect(decryptAccountNumber).toHaveBeenCalledWith('encrypted-test-account');
    expect(httpClient.post).toHaveBeenCalledTimes(3);

    for (const call of httpClient.post.mock.calls) {
      const config = call[2];
      expect(config).toMatchObject({
        timeout: RAZORPAY_X_PROVIDER_TIMEOUT_MS,
        maxRedirects: 0,
      });
      expect(config.headers.Authorization).toBe(
        `Basic ${Buffer.from(
          `${payoutEnv.RAZORPAY_X_KEY_ID}:${payoutEnv.RAZORPAY_X_KEY_SECRET}`
        ).toString('base64')}`
      );
    }

    expect(httpClient.post.mock.calls[2][2].headers).toMatchObject({
      'X-Payout-Idempotency': payout._id,
    });
    expect(httpClient.post.mock.calls[2][1]).toMatchObject({
      account_number: payoutEnv.RAZORPAY_PAYOUT_ACCOUNT_NUMBER,
      amount: payout.amountPaise,
      currency: 'INR',
      reference_id: payout.referenceId,
    });
  });
});
