const BOOKING_COLLECTION = 'bookings';

const buildBoundOrderQuarantineFilter = (now) => ({
  paymentMethod: 'razorpay',
  paymentStatus: { $in: ['pending', 'failed'] },
  razorpayOrderId: { $type: 'string', $ne: '' },
  $nor: [{
    'bookingAuthorization.kind': 'payment',
    'bookingAuthorization.status': 'needs_review',
  }],
  $or: [
    { status: { $ne: 'pending' } },
    { holdExpiresAt: { $lte: now } },
    { holdExpiresAt: { $exists: false } },
    { holdExpiresAt: null },
    { 'bookingAuthorization.kind': { $ne: 'payment' } },
    { 'bookingAuthorization.status': { $ne: 'pending' } },
  ],
});

const buildLegacyUnboundExpiryFilter = (now) => ({
  status: 'pending',
  paymentMethod: 'razorpay',
  paymentStatus: { $in: ['pending', 'failed'] },
  $and: [
    {
      $or: [
        { razorpayOrderId: { $exists: false } },
        { razorpayOrderId: null },
        { razorpayOrderId: '' },
      ],
    },
    {
      $or: [
        { 'bookingAuthorization.kind': 'payment' },
        { 'bookingAuthorization.kind': { $exists: false } },
        { 'bookingAuthorization.kind': null },
      ],
    },
    {
      $or: [
        { 'bookingAuthorization.status': 'pending' },
        { 'bookingAuthorization.status': { $exists: false } },
        { 'bookingAuthorization.status': null },
      ],
    },
    {
      $or: [
        { holdExpiresAt: { $lte: now } },
        { holdExpiresAt: { $exists: false } },
        { holdExpiresAt: null },
      ],
    },
    {
      $or: [
        { paymentId: { $exists: false } },
        { paymentId: null },
        { paymentId: '' },
      ],
    },
    {
      $or: [
        { transactionId: { $exists: false } },
        { transactionId: null },
        { transactionId: '' },
      ],
    },
    {
      $or: [
        { orderStatus: { $exists: false } },
        { orderStatus: null },
        { orderStatus: '' },
      ],
    },
  ],
});

const buildLegacyUnboundContradictionFilter = () => ({
  status: 'pending',
  paymentMethod: 'razorpay',
  paymentStatus: { $in: ['pending', 'failed'] },
  $and: [
    {
      $or: [
        { razorpayOrderId: { $exists: false } },
        { razorpayOrderId: null },
        { razorpayOrderId: '' },
      ],
    },
    {
      $or: [
        { paymentId: { $type: 'string', $ne: '' } },
        { transactionId: { $type: 'string', $ne: '' } },
        { orderStatus: { $exists: true, $nin: [null, ''] } },
        {
          'bookingAuthorization.kind': {
            $exists: true,
            $nin: ['payment', null],
          },
        },
        {
          'bookingAuthorization.status': {
            $exists: true,
            $nin: ['pending', null],
          },
        },
      ],
    },
  ],
});

const buildLegacyUnboundActiveFilter = (now) => ({
  status: 'pending',
  paymentMethod: 'razorpay',
  paymentStatus: { $in: ['pending', 'failed'] },
  holdExpiresAt: { $gt: now },
  $and: [
    {
      $or: [
        { razorpayOrderId: { $exists: false } },
        { razorpayOrderId: null },
        { razorpayOrderId: '' },
      ],
    },
    {
      $or: [
        { 'bookingAuthorization.kind': 'payment' },
        { 'bookingAuthorization.kind': { $exists: false } },
        { 'bookingAuthorization.kind': null },
      ],
    },
    {
      $or: [
        { 'bookingAuthorization.status': 'pending' },
        { 'bookingAuthorization.status': { $exists: false } },
        { 'bookingAuthorization.status': null },
      ],
    },
    {
      $or: [
        { 'bookingAuthorization.kind': { $exists: false } },
        { 'bookingAuthorization.kind': null },
        { 'bookingAuthorization.status': { $exists: false } },
        { 'bookingAuthorization.status': null },
      ],
    },
    {
      $or: [
        { paymentId: { $exists: false } },
        { paymentId: null },
        { paymentId: '' },
      ],
    },
    {
      $or: [
        { transactionId: { $exists: false } },
        { transactionId: null },
        { transactionId: '' },
      ],
    },
    {
      $or: [
        { orderStatus: { $exists: false } },
        { orderStatus: null },
        { orderStatus: '' },
      ],
    },
  ],
});

module.exports = {
  async up({ mongoose }) {
    const now = new Date();
    const bookings = mongoose.connection.db.collection(BOOKING_COLLECTION);

    await bookings.updateMany(
      buildLegacyUnboundExpiryFilter(now),
      {
        $set: {
          status: 'expired',
          orderStatus: 'expired',
          'bookingAuthorization.kind': 'payment',
          'bookingAuthorization.status': 'revoked',
          cancellationReason: 'Payment hold expired',
        },
      },
      { writeConcern: { w: 'majority' } }
    );

    await bookings.updateMany(
      buildLegacyUnboundContradictionFilter(),
      {
        $set: {
          'bookingAuthorization.kind': 'payment',
          'bookingAuthorization.status': 'needs_review',
        },
      },
      { writeConcern: { w: 'majority' } }
    );

    await bookings.updateMany(
      buildLegacyUnboundActiveFilter(now),
      {
        $set: {
          'bookingAuthorization.kind': 'payment',
          'bookingAuthorization.status': 'pending',
        },
      },
      { writeConcern: { w: 'majority' } }
    );

    await bookings.updateMany(
      buildBoundOrderQuarantineFilter(now),
      {
        $set: {
          'bookingAuthorization.kind': 'payment',
          'bookingAuthorization.status': 'needs_review',
        },
      },
      { writeConcern: { w: 'majority' } }
    );
  },
  BOOKING_COLLECTION,
  buildBoundOrderQuarantineFilter,
  buildLegacyUnboundExpiryFilter,
  buildLegacyUnboundContradictionFilter,
  buildLegacyUnboundActiveFilter,
};
