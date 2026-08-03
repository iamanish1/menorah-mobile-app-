const Counsellor = require('../models/Counsellor');
const {
  buildEligibleCounsellorMarketplaceQuery,
  doesBookingMatchCounsellorPreferences,
  isUnassignedMarketplaceBookingEligible,
} = require('./bookingMarketplacePolicy');
const {
  serializeUnassignedBookingPreview,
} = require('../serializers/bookingSerializer');

const notifyEligibleCounsellorsOfBooking = async ({ booking, io, now = new Date() }) => {
  if (!io || !isUnassignedMarketplaceBookingEligible(booking, { now })) return 0;

  const counsellors = await Counsellor.find(buildEligibleCounsellorMarketplaceQuery({ now }))
    .select('_id user')
    .populate({
      path: 'user',
      select: 'gender role isActive',
      match: { role: 'counsellor', isActive: true },
    })
    .lean();
  const preview = serializeUnassignedBookingPreview(booking, { now });
  let recipientCount = 0;

  counsellors.forEach((counsellor) => {
    if (!counsellor.user) return;
    if (!doesBookingMatchCounsellorPreferences(booking, {
      counsellorGender: counsellor.user?.gender,
    })) return;

    io.to(`counsellor_${counsellor._id}`).emit('new_booking_available', preview);
    recipientCount += 1;
  });

  return recipientCount;
};

module.exports = {
  notifyEligibleCounsellorsOfBooking,
};
