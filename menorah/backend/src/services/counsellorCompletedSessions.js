const Booking = require('../models/Booking');

const COMPLETED_BOOKING_STATUS = 'completed';

const countCompletedSessions = async (
  counsellorId,
  { BookingModel = Booking } = {}
) => {
  if (!counsellorId) return 0;

  return BookingModel.countDocuments({
    counsellor: counsellorId,
    status: COMPLETED_BOOKING_STATUS,
  });
};

const countCompletedSessionsByCounsellor = async (
  counsellorIds,
  { BookingModel = Booking } = {}
) => {
  const uniqueIds = [];
  const seen = new Set();

  for (const counsellorId of counsellorIds || []) {
    if (!counsellorId) continue;
    const key = counsellorId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueIds.push(counsellorId);
  }

  if (uniqueIds.length === 0) return new Map();

  const counts = await BookingModel.aggregate([
    {
      $match: {
        counsellor: { $in: uniqueIds },
        status: COMPLETED_BOOKING_STATUS,
      },
    },
    {
      $group: {
        _id: '$counsellor',
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    counts.map(({ _id, count }) => [_id.toString(), Number(count) || 0])
  );
};

module.exports = {
  COMPLETED_BOOKING_STATUS,
  countCompletedSessions,
  countCompletedSessionsByCounsellor,
};
