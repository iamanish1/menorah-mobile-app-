const express = require('express');
const request = require('supertest');

const USER_ID = '64f000000000000000000141';
const COUNSELLOR_ID = '64f000000000000000000142';
const mockCounsellorFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockPayoutExists = jest.fn();
const mockEncryptBankAccountNumber = jest.fn();

jest.mock('../../middleware/auth', () => ({
  counsellorAuth: (req, _res, next) => {
    req.user = { _id: USER_ID, role: 'counsellor' };
    next();
  },
}));

jest.mock('../../models/Booking', () => ({}));
jest.mock('../../models/Counsellor', () => ({
  findOne: (...args) => mockCounsellorFindOne(...args),
}));
jest.mock('../../models/User', () => ({
  findById: (...args) => mockUserFindById(...args),
}));
jest.mock('../../models/Payout', () => ({
  exists: (...args) => mockPayoutExists(...args),
}));
jest.mock('../../services/mediaStorage', () => ({
  storeMediaBuffer: jest.fn(),
}));
jest.mock('../../utils/bankAccountEncryption', () => ({
  encryptBankAccountNumber: (...args) => mockEncryptBankAccountNumber(...args),
}));

const counsellorBookingsRouter = require('../counsellor-bookings');

const validBody = {
  currentPassword: 'CurrentPassword1',
  accountNumber: '123456789012',
  ifscCode: 'hdfc0001234',
  accountHolderName: 'Counsellor Example',
  bankName: 'Example Bank',
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/counsellors', counsellorBookingsRouter);
  return app;
};

const makeCounsellor = () => ({
  _id: COUNSELLOR_ID,
  user: USER_ID,
  bankDetails: null,
  razorpayFundAccountId: 'fund_account_previous',
  save: jest.fn(async () => undefined),
});

const makeAccountQuery = (account) => ({
  select: jest.fn().mockResolvedValue(account),
});

describe('counsellor bank-detail authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncryptBankAccountNumber.mockReturnValue('encrypted-account-envelope');
    mockPayoutExists.mockResolvedValue(null);
  });

  test('requires current-password reauthentication', async () => {
    const response = await request(buildApp())
      .put('/api/counsellors/me/bank-details')
      .send({ ...validBody, currentPassword: undefined })
      .expect(400);

    expect(response.body.message).toBe('Validation failed');
    expect(mockCounsellorFindOne).not.toHaveBeenCalled();
    expect(mockEncryptBankAccountNumber).not.toHaveBeenCalled();
  });

  test('rejects an incorrect password before checking or changing payout data', async () => {
    const counsellor = makeCounsellor();
    const account = {
      comparePassword: jest.fn().mockResolvedValue(false),
    };
    mockCounsellorFindOne.mockResolvedValue(counsellor);
    mockUserFindById.mockReturnValue(makeAccountQuery(account));

    await request(buildApp())
      .put('/api/counsellors/me/bank-details')
      .send(validBody)
      .expect(403);

    expect(account.comparePassword).toHaveBeenCalledWith(validBody.currentPassword);
    expect(mockPayoutExists).not.toHaveBeenCalled();
    expect(counsellor.save).not.toHaveBeenCalled();
  });

  test('blocks changes while a payout request is in flight', async () => {
    const counsellor = makeCounsellor();
    mockCounsellorFindOne.mockResolvedValue(counsellor);
    mockUserFindById.mockReturnValue(makeAccountQuery({
      comparePassword: jest.fn().mockResolvedValue(true),
    }));
    mockPayoutExists.mockResolvedValue({ _id: '64f000000000000000000143' });

    const response = await request(buildApp())
      .put('/api/counsellors/me/bank-details')
      .send(validBody)
      .expect(409);

    expect(response.body.message).toMatch(/cannot be changed while a payout request/i);
    expect(mockPayoutExists).toHaveBeenCalledWith({
      counsellor: COUNSELLOR_ID,
      status: { $in: expect.any(Array) },
    });
    expect(mockEncryptBankAccountNumber).not.toHaveBeenCalled();
    expect(counsellor.save).not.toHaveBeenCalled();
  });

  test('stores only encrypted account data and returns only a masked account number', async () => {
    const counsellor = makeCounsellor();
    mockCounsellorFindOne.mockResolvedValue(counsellor);
    mockUserFindById.mockReturnValue(makeAccountQuery({
      comparePassword: jest.fn().mockResolvedValue(true),
    }));

    const response = await request(buildApp())
      .put('/api/counsellors/me/bank-details')
      .send(validBody)
      .expect(200);

    expect(mockEncryptBankAccountNumber).toHaveBeenCalledWith(validBody.accountNumber);
    expect(counsellor.bankDetails).toEqual({
      accountNumberEncrypted: 'encrypted-account-envelope',
      accountNumberLast4: '9012',
      ifscCode: 'HDFC0001234',
      accountHolderName: 'Counsellor Example',
      bankName: 'Example Bank',
    });
    expect(counsellor.razorpayFundAccountId).toBeNull();
    expect(counsellor.save).toHaveBeenCalledTimes(1);
    expect(response.body.data.bankDetails.accountNumberMasked).toMatch(/9012$/);
    expect(JSON.stringify(response.body)).not.toContain(validBody.accountNumber);
    expect(JSON.stringify(response.body)).not.toContain('encrypted-account-envelope');
  });
});
