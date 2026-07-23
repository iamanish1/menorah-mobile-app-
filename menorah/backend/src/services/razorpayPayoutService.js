const axios = require('axios');
const Counsellor = require('../models/Counsellor');
const {
  getRazorpayPayoutConfigurationState,
} = require('../config/paymentFeatures');
const {
  getProviderPayoutIdempotencyKey,
} = require('./payoutPolicy');
const {
  decryptBankAccountNumber,
} = require('../utils/bankAccountEncryption');

const RAZORPAY_X_PROVIDER_TIMEOUT_MS = 5000;

class RazorpayPayoutConfigurationError extends Error {
  constructor() {
    super('Payout service is not configured.');
    this.name = 'RazorpayPayoutConfigurationError';
    this.statusCode = 503;
  }
}

const createRazorpayPayout = async ({
  payout,
  counsellor,
  env = process.env,
  httpClient = axios,
  CounsellorModel = Counsellor,
  decryptAccountNumber = decryptBankAccountNumber,
}) => {
  const configuration = getRazorpayPayoutConfigurationState(env);
  if (!configuration.executionConfigured) {
    throw new RazorpayPayoutConfigurationError();
  }

  const accountNumber = decryptAccountNumber(
    counsellor.bankDetails?.accountNumberEncrypted
  );
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(
      `${env.RAZORPAY_X_KEY_ID}:${env.RAZORPAY_X_KEY_SECRET}`
    ).toString('base64')}`,
  };
  const requestConfig = {
    headers,
    timeout: RAZORPAY_X_PROVIDER_TIMEOUT_MS,
    maxRedirects: 0,
  };
  let contactId = counsellor.razorpayContactId;
  let fundAccountId = counsellor.razorpayFundAccountId;

  if (!contactId) {
    const contactResponse = await httpClient.post(
      'https://api.razorpay.com/v1/contacts',
      {
        name: `${counsellor.user.firstName} ${counsellor.user.lastName}`,
        email: counsellor.user.email,
        contact: counsellor.user.phone,
        type: 'vendor',
        reference_id: counsellor._id.toString(),
      },
      requestConfig
    );
    contactId = contactResponse.data?.id;
    if (!contactId) {
      throw new Error(
        'Payment provider contact response did not include an identifier'
      );
    }
    await CounsellorModel.findByIdAndUpdate(counsellor._id, {
      razorpayContactId: contactId,
    });
  }

  if (!fundAccountId) {
    const fundAccountResponse = await httpClient.post(
      'https://api.razorpay.com/v1/fund_accounts',
      {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name:
            counsellor.bankDetails.accountHolderName
            || `${counsellor.user.firstName} ${counsellor.user.lastName}`,
          ifsc: counsellor.bankDetails.ifscCode,
          account_number: accountNumber,
        },
      },
      requestConfig
    );
    fundAccountId = fundAccountResponse.data?.id;
    if (!fundAccountId) {
      throw new Error(
        'Payment provider fund-account response did not include an identifier'
      );
    }
    await CounsellorModel.findByIdAndUpdate(counsellor._id, {
      razorpayFundAccountId: fundAccountId,
    });
  }

  const payoutResponse = await httpClient.post(
    'https://api.razorpay.com/v1/payouts',
    {
      account_number: env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER,
      fund_account_id: fundAccountId,
      amount: payout.amountPaise,
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: payout.referenceId,
      narration: 'Menorah Health counsellor payout',
      notes: { counsellorId: counsellor._id.toString() },
    },
    {
      ...requestConfig,
      headers: {
        ...requestConfig.headers,
        'X-Payout-Idempotency': getProviderPayoutIdempotencyKey(payout),
      },
    }
  );

  if (!payoutResponse.data?.id) {
    throw new Error(
      'Payment provider payout response did not include an identifier'
    );
  }

  return {
    payoutResponse: payoutResponse.data,
    contactId,
    fundAccountId,
  };
};

module.exports = {
  RAZORPAY_X_PROVIDER_TIMEOUT_MS,
  RazorpayPayoutConfigurationError,
  createRazorpayPayout,
};
