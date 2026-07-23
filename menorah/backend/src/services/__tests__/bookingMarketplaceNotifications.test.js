const mockLean = jest.fn();
const mockPopulate = jest.fn(() => ({ lean: mockLean }));
const mockSelect = jest.fn(() => ({ populate: mockPopulate }));
const mockFind = jest.fn(() => ({ select: mockSelect }));

jest.mock('../../models/Counsellor', () => ({
  find: mockFind,
}));

const {
  notifyEligibleCounsellorsOfBooking,
} = require('../bookingMarketplaceNotifications');

const NOW = new Date('2026-07-23T08:00:00.000Z');

const eligibleBooking = (overrides = {}) => ({
  _id: '64f000000000000000000001',
  user: {
    firstName: 'Private',
    email: 'private@example.test',
  },
  counsellor: null,
  sessionType: 'video',
  sessionDuration: 45,
  scheduledAt: new Date('2026-07-24T08:00:00.000Z'),
  status: 'confirmed',
  preferences: {
    gender: 'female',
    sessionType: 'video',
    categoryId: 'basic',
  },
  amount: 1000,
  amountMinor: 100000,
  currency: 'INR',
  pricing: { listAmountMinor: 100000, currency: 'INR' },
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  paymentId: 'pay_test_123',
  razorpayOrderId: 'order_test_123',
  transactionId: 'order_test_123',
  orderStatus: 'paid',
  isSubscriptionBooking: false,
  bookingAuthorization: {
    kind: 'payment',
    status: 'authorized',
    reference: 'pay_test_123',
    authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
  },
  symptoms: ['private symptom'],
  createdAt: new Date('2026-07-23T07:30:00.000Z'),
  ...overrides,
});

describe('booking marketplace socket notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLean.mockResolvedValue([
      { _id: '64f000000000000000000010', user: { gender: 'female' } },
      { _id: '64f000000000000000000011', user: { gender: 'male' } },
    ]);
  });

  test('emits only the strict preview to eligible counsellors', async () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));

    await expect(notifyEligibleCounsellorsOfBooking({
      booking: eligibleBooking(),
      io: { to },
      now: NOW,
    })).resolves.toBe(1);

    expect(mockFind).toHaveBeenCalledWith({
      isActive: true,
      isAvailable: true,
      isVerified: true,
      status: 'approved',
      profileImage: { $type: 'string', $regex: /\S/ },
      voiceIntroUrl: { $type: 'string', $regex: /\S/ },
    });
    expect(mockSelect).toHaveBeenCalledWith('_id user');
    expect(mockPopulate).toHaveBeenCalledWith({ path: 'user', select: 'gender' });
    expect(to).toHaveBeenCalledWith('counsellor_64f000000000000000000010');
    expect(to).not.toHaveBeenCalledWith('counsellor_64f000000000000000000011');
    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0][1];
    expect(payload).toEqual({
      accessScope: 'preview',
      id: '64f000000000000000000001',
      sessionType: 'video',
      sessionDuration: 45,
      scheduledAt: new Date('2026-07-24T08:00:00.000Z'),
      status: 'confirmed',
      canAccept: true,
      createdAt: new Date('2026-07-23T07:30:00.000Z'),
    });
    expect(JSON.stringify(payload)).not.toMatch(/Private|private@example|female|symptom|amount|payment/i);
  });

  test.each([
    ['pending payment', { paymentStatus: 'pending' }],
    ['mismatched payment reference', {
      bookingAuthorization: {
        kind: 'payment',
        status: 'authorized',
        reference: 'pay_other',
        authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
      },
    }],
    ['refunded payment', { paymentStatus: 'refunded' }],
    ['cancelled booking', { status: 'cancelled' }],
  ])('does not notify for %s', async (_label, overrides) => {
    const io = { to: jest.fn() };

    await expect(notifyEligibleCounsellorsOfBooking({
      booking: eligibleBooking(overrides),
      io,
      now: NOW,
    })).resolves.toBe(0);

    expect(mockFind).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });
});
