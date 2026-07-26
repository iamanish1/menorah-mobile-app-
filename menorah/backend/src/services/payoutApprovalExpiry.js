const Payout = require('../models/Payout');

const MAX_PAYOUT_APPROVAL_EXPIRY_BATCH = 100;

const expireStaleAwaitingApprovalPayouts = async ({
  PayoutModel = Payout,
  now = new Date(),
  counsellorId,
  payoutId,
  limit = MAX_PAYOUT_APPROVAL_EXPIRY_BATCH,
} = {}) => {
  const effectiveNow = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(effectiveNow.getTime())) {
    throw new TypeError('now must be a valid date');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAYOUT_APPROVAL_EXPIRY_BATCH) {
    throw new RangeError(
      `limit must be between 1 and ${MAX_PAYOUT_APPROVAL_EXPIRY_BATCH}`
    );
  }

  const filter = {
    status: 'awaiting_approval',
    approvalExpiresAt: { $lte: effectiveNow },
    ...(counsellorId ? { counsellor: counsellorId } : {}),
    ...(payoutId ? { _id: payoutId } : {}),
  };
  const due = await PayoutModel.find(filter)
    .select('_id')
    .sort({ approvalExpiresAt: 1, _id: 1 })
    .limit(limit)
    .lean();
  const ids = due.map((payout) => payout._id);

  if (ids.length === 0) {
    return { scanned: 0, expired: 0 };
  }

  const result = await PayoutModel.updateMany({
    _id: { $in: ids },
    status: 'awaiting_approval',
    approvalExpiresAt: { $lte: effectiveNow },
  }, {
    $set: {
      status: 'expired',
      failureReason: 'Approval window expired.',
    },
  }, {
    runValidators: true,
  });

  return {
    scanned: ids.length,
    expired: result.modifiedCount || 0,
  };
};

module.exports = {
  MAX_PAYOUT_APPROVAL_EXPIRY_BATCH,
  expireStaleAwaitingApprovalPayouts,
};
