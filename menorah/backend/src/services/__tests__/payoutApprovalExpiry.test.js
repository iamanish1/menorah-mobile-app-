const {
  MAX_PAYOUT_APPROVAL_EXPIRY_BATCH,
  expireStaleAwaitingApprovalPayouts,
} = require('../payoutApprovalExpiry');

const buildFindQuery = (due) => {
  const query = {};
  query.select = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.lean = jest.fn().mockResolvedValue(due);
  return query;
};

describe('payout approval expiry', () => {
  const now = new Date('2026-07-23T12:00:00.000Z');

  test('expires a bounded oldest-first batch with a guarded update', async () => {
    const query = buildFindQuery([{ _id: 'payout-1' }, { _id: 'payout-2' }]);
    const PayoutModel = {
      find: jest.fn().mockReturnValue(query),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    };

    const result = await expireStaleAwaitingApprovalPayouts({
      PayoutModel,
      now,
      counsellorId: 'counsellor-1',
      limit: 2,
    });

    expect(PayoutModel.find).toHaveBeenCalledWith({
      status: 'awaiting_approval',
      approvalExpiresAt: { $lte: now },
      counsellor: 'counsellor-1',
    });
    expect(query.select).toHaveBeenCalledWith('_id');
    expect(query.sort).toHaveBeenCalledWith({ approvalExpiresAt: 1, _id: 1 });
    expect(query.limit).toHaveBeenCalledWith(2);
    expect(PayoutModel.updateMany).toHaveBeenCalledWith({
      _id: { $in: ['payout-1', 'payout-2'] },
      status: 'awaiting_approval',
      approvalExpiresAt: { $lte: now },
    }, {
      $set: {
        status: 'expired',
        failureReason: 'Approval window expired.',
      },
    }, {
      runValidators: true,
    });
    expect(result).toEqual({ scanned: 2, expired: 2 });
  });

  test('does not issue a write when no stale approvals are due', async () => {
    const PayoutModel = {
      find: jest.fn().mockReturnValue(buildFindQuery([])),
      updateMany: jest.fn(),
    };

    await expect(expireStaleAwaitingApprovalPayouts({
      PayoutModel,
      now,
      payoutId: 'payout-1',
      limit: 1,
    })).resolves.toEqual({ scanned: 0, expired: 0 });
    expect(PayoutModel.updateMany).not.toHaveBeenCalled();
  });

  test.each([0, MAX_PAYOUT_APPROVAL_EXPIRY_BATCH + 1, 1.5])(
    'rejects an unsafe batch limit (%p)',
    async (limit) => {
      await expect(expireStaleAwaitingApprovalPayouts({
        PayoutModel: {},
        now,
        limit,
      })).rejects.toThrow(/limit must be between/);
    }
  );
});
