#!/usr/bin/env node

/*
 * Creates or removes the short-lived, production-safe fixture used by the
 * chat and LiveKit smoke test. It is executed inside the API container so
 * MongoDB and LiveKit credentials never leave the server runtime.
 */

const mongoose = require('/app/node_modules/mongoose');
const { RoomServiceClient } = require('/app/node_modules/livekit-server-sdk');
const User = require('/app/src/models/User');
const Counsellor = require('/app/src/models/Counsellor');
const Booking = require('/app/src/models/Booking');
const ChatRoom = require('/app/src/models/ChatRoom');
const Message = require('/app/src/models/Message');

const action = process.env.QA_FIXTURE_ACTION;

const fail = (message) => {
  throw new Error(message);
};

const parseFixture = () => {
  try {
    const fixture = JSON.parse(process.env.QA_FIXTURE_JSON || '');
    if (!fixture?.runId?.startsWith('qa-chat-call-') || !fixture.userId || !fixture.counsellorId) {
      fail('Invalid QA fixture reference');
    }
    return fixture;
  } catch (error) {
    fail(error.message === 'Invalid QA fixture reference' ? error.message : 'Invalid QA fixture reference');
  }
};

const createFixture = async () => {
  const runId = String(process.env.QA_RUN_ID || '');
  const password = String(process.env.QA_PASSWORD || '');

  if (!runId.startsWith('qa-chat-call-')) fail('QA_RUN_ID must use the qa-chat-call prefix');
  if (password.length < 12) fail('QA_PASSWORD must be at least 12 characters');

  const emailSuffix = runId.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const userEmail = `qa-user-${emailSuffix}@menorahqa.test`;
  const counsellorEmail = `qa-counsellor-${emailSuffix}@menorahqa.test`;

  const [user, counsellorUser] = await User.create([
    {
      email: userEmail,
      phone: `+9198${Date.now().toString().slice(-8)}`,
      password,
      firstName: 'QA',
      lastName: 'Call User',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      gender: 'prefer-not-to-say',
      address: { country: 'India' },
      isEmailVerified: true,
      isPhoneVerified: true,
      isActive: true,
      role: 'user',
    },
    {
      email: counsellorEmail,
      phone: `+9197${Date.now().toString().slice(-8)}`,
      password,
      firstName: 'QA',
      lastName: 'Call Counsellor',
      dateOfBirth: new Date('1985-01-01T00:00:00.000Z'),
      gender: 'prefer-not-to-say',
      address: { country: 'India' },
      isEmailVerified: true,
      isPhoneVerified: true,
      isActive: true,
      role: 'counsellor',
    },
  ]);

  const counsellor = await Counsellor.create({
    user: counsellorUser._id,
    licenseNumber: `QA-WEBRTC-${Date.now()}`,
    specialization: 'QA call testing',
    specializations: ['QA call testing'],
    experience: 1,
    bio: 'Temporary production QA counsellor for automated chat and call verification.',
    languages: ['English'],
    hourlyRate: 0,
    currency: 'INR',
    isVerified: true,
    isActive: true,
    isAvailable: true,
    status: 'approved',
    approvedAt: new Date(),
  });

  const now = new Date();
  const booking = await Booking.create({
    user: user._id,
    counsellor: counsellor._id,
    assignedAt: now,
    sessionType: 'video',
    sessionDuration: 30,
    scheduledAt: now,
    timezone: 'Asia/Kolkata',
    status: 'confirmed',
    statusHistory: [{ status: 'confirmed', timestamp: now, reason: 'Temporary automated QA call' }],
    amount: 0,
    currency: 'INR',
    paymentStatus: 'paid',
    paymentMethod: 'promo',
    promo: { code: 'QA-AUTOMATED', appliedAt: now, discountAmount: 0 },
    videoCall: { provider: 'livekit', joinMode: 'in_app', region: 'IN', status: 'scheduled' },
  });

  return {
    runId,
    userId: user._id.toString(),
    counsellorUserId: counsellorUser._id.toString(),
    counsellorId: counsellor._id.toString(),
    bookingId: booking._id.toString(),
    userEmail,
    counsellorEmail,
  };
};

const deleteLiveKitRoom = async (roomName) => {
  if (!roomName || !process.env.LIVEKIT_API_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return;
  try {
    const livekit = new RoomServiceClient(
      process.env.LIVEKIT_API_URL,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    await livekit.deleteRoom(roomName);
  } catch (error) {
    // The room may already have expired; fixture cleanup must still remove Mongo records.
    console.error(`QA fixture LiveKit cleanup warning: ${error.message}`);
  }
};

const cleanupFixture = async () => {
  const fixture = parseFixture();
  const booking = await Booking.findById(fixture.bookingId).select('videoCall.roomId').lean();
  await deleteLiveKitRoom(booking?.videoCall?.roomId);

  const roomIds = await ChatRoom.find({
    $or: [{ user: fixture.userId }, { counsellor: fixture.counsellorId }],
  }).distinct('_id');
  if (roomIds.length) await Message.deleteMany({ room: { $in: roomIds } });
  await ChatRoom.deleteMany({ _id: { $in: roomIds } });
  await Booking.deleteOne({ _id: fixture.bookingId, user: fixture.userId, counsellor: fixture.counsellorId });
  await Counsellor.deleteOne({ _id: fixture.counsellorId, user: fixture.counsellorUserId });
  await User.deleteMany({
    _id: { $in: [fixture.userId, fixture.counsellorUserId] },
    email: { $regex: /@menorahqa\.test$/ },
  });
};

const main = async () => {
  if (!['create', 'cleanup'].includes(action)) fail('QA_FIXTURE_ACTION must be create or cleanup');
  if (!process.env.MONGODB_URI) fail('MONGODB_URI is not configured');

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    if (action === 'create') {
      const fixture = await createFixture();
      process.stdout.write(JSON.stringify(fixture));
    } else {
      await cleanupFixture();
      process.stdout.write('QA fixture cleanup complete');
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(`QA fixture error: ${error.message}`);
  process.exit(1);
});
