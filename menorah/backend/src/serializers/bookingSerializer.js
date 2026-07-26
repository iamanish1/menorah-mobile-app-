const {
  isUnassignedMarketplaceBookingEligible,
} = require('../services/bookingMarketplacePolicy');

const serializeId = (source) => {
  const value = source?._id ?? source?.id;
  if (value === undefined || value === null) return undefined;
  return typeof value.toString === 'function' ? value.toString() : String(value);
};

const serializeUnassignedBookingPreview = (
  booking,
  { now = new Date() } = {}
) => {
  if (!booking) return null;

  const source = typeof booking.toObject === 'function'
    ? booking.toObject({ virtuals: false })
    : booking;

  return {
    accessScope: 'preview',
    id: serializeId(source),
    sessionType: source.sessionType,
    sessionDuration: source.sessionDuration,
    scheduledAt: source.scheduledAt,
    status: source.status,
    canAccept: isUnassignedMarketplaceBookingEligible(source, { now }),
    createdAt: source.createdAt,
  };
};

module.exports = {
  serializeUnassignedBookingPreview,
};
