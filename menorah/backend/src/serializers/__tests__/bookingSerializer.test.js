const { serializeUnassignedBookingPreview } = require('../bookingSerializer');

const NOW = new Date('2026-07-23T08:00:00.000Z');

const sensitiveBooking = () => ({
  _id: { toString: () => 'booking-preview-1' },
  user: {
    _id: 'user-secret',
    firstName: 'Private',
    lastName: 'Person',
    email: 'private@example.test',
    phone: '+910000000000',
    profileImage: 'https://private.example.test/image.jpg',
    gender: 'female',
    emergencyContact: { name: 'Emergency Person', phone: '+919999999999' },
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
    symptoms: ['private preference symptom'],
  },
  amount: 1000,
  amountMinor: 100000,
  currency: 'INR',
  pricing: { listAmountMinor: 100000, currency: 'INR' },
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  paymentId: 'pay_internal_secret',
  transactionId: 'order_provider_secret',
  razorpayOrderId: 'order_provider_secret',
  orderStatus: 'paid',
  isSubscriptionBooking: false,
  bookingAuthorization: {
    kind: 'payment',
    status: 'authorized',
    reference: 'pay_internal_secret',
    authorizedAt: new Date('2026-07-23T07:00:00.000Z'),
  },
  symptoms: ['sensitive symptom'],
  concerns: 'sensitive concern',
  goals: ['sensitive goal'],
  emergencyContact: { name: 'Emergency Person', phone: '+919999999999' },
  sessionNotes: {
    userNotes: 'private user note',
    counsellorNotes: 'private counsellor note',
    privateNotes: 'private clinical note',
  },
  safetyCheck: { concerns: ['sensitive safety concern'] },
  statusHistory: [{
    status: 'confirmed',
    reason: 'private reason',
    updatedBy: 'private-user-id',
  }],
  videoCall: {
    externalJoinUrl: 'https://private.example.test/join',
    externalHostUrl: 'https://private.example.test/host',
    roomId: 'private-video-room',
    roomUrl: 'https://private.example.test/room',
    recordingUrl: 'https://private.example.test/recording',
  },
  chat: { roomId: 'private-chat-room' },
  createdAt: new Date('2026-07-23T07:30:00.000Z'),
});

describe('bookingSerializer', () => {
  test('returns the exact minimal pre-assignment contract', () => {
    const preview = serializeUnassignedBookingPreview(sensitiveBooking(), { now: NOW });

    expect(preview).toEqual({
      accessScope: 'preview',
      id: 'booking-preview-1',
      sessionType: 'video',
      sessionDuration: 45,
      scheduledAt: new Date('2026-07-24T08:00:00.000Z'),
      status: 'confirmed',
      canAccept: true,
      createdAt: new Date('2026-07-23T07:30:00.000Z'),
    });
  });

  test('does not serialize identity, contact, gender, clinical, call, note, or payment data', () => {
    const serialized = JSON.stringify(
      serializeUnassignedBookingPreview(sensitiveBooking(), { now: NOW })
    );

    [
      'Private',
      'private@example.test',
      '+910000000000',
      'female',
      'basic',
      'private preference symptom',
      'sensitive symptom',
      'sensitive concern',
      'sensitive goal',
      'Emergency Person',
      'private user note',
      'private counsellor note',
      'private clinical note',
      'private reason',
      'private-video-room',
      'private-chat-room',
      'pay_internal_secret',
      'order_internal_secret',
      'order_provider_secret',
      'authorization_internal_secret',
    ].forEach((secret) => expect(serialized).not.toContain(secret));

    [
      'user',
      'gender',
      'preferences',
      'symptoms',
      'concerns',
      'goals',
      'emergencyContact',
      'sessionNotes',
      'statusHistory',
      'videoCall',
      'chat',
      'paymentStatus',
      'paymentMethod',
      'paymentId',
      'transactionId',
      'razorpayOrderId',
      'bookingAuthorization',
      'amount',
      'currency',
    ].forEach((field) => expect(serialized).not.toContain(`\"${field}\"`));
  });

  test('supports Mongoose-like documents without mutating their source', () => {
    const source = sensitiveBooking();
    const originalPreferences = { ...source.preferences };
    const document = { toObject: jest.fn(() => source) };

    expect(serializeUnassignedBookingPreview(document, { now: NOW }).canAccept).toBe(true);
    expect(document.toObject).toHaveBeenCalledWith({ virtuals: false });
    expect(source.preferences).toEqual(originalPreferences);
  });

  test('reports canAccept false when an ineligible record reaches the serializer', () => {
    const booking = sensitiveBooking();
    booking.paymentStatus = 'refunded';

    expect(serializeUnassignedBookingPreview(booking, { now: NOW }).canAccept).toBe(false);
  });

  test('returns null for an absent booking', () => {
    expect(serializeUnassignedBookingPreview(null, { now: NOW })).toBeNull();
  });
});
