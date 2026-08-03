const mongoose = require('mongoose');

const notificationDataSchema = new mongoose.Schema({
  articleSlug: { type: String, trim: true, maxlength: 240, default: null },
  bookingId: { type: String, trim: true, match: /^[a-f0-9]{24}$/i, default: null },
  roomId: { type: String, trim: true, match: /^[a-f0-9]{24}$/i, default: null },
  sessionType: {
    type: String,
    enum: ['video', 'audio', 'chat', null],
    default: null,
  },
}, { _id: false });

const pushNotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  eventKey: {
    type: String,
    required: true,
    trim: true,
    maxlength: 240,
  },
  type: {
    type: String,
    enum: ['article', 'session', 'message'],
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: 240,
  },
  channelId: {
    type: String,
    enum: ['articles', 'sessions', 'messages'],
    required: true,
  },
  data: {
    type: notificationDataSchema,
    default: () => ({}),
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'sent', 'skipped', 'failed'],
    default: 'queued',
    required: true,
  },
  scheduledFor: {
    type: Date,
    required: true,
    default: Date.now,
  },
  nextAttemptAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  leaseUntil: {
    type: Date,
    default: null,
  },
  attempts: {
    type: Number,
    min: 0,
    max: 10,
    default: 0,
  },
  processedAt: {
    type: Date,
    default: null,
  },
  lastErrorCode: {
    type: String,
    trim: true,
    maxlength: 80,
    default: null,
    select: false,
  },
}, {
  timestamps: true,
  versionKey: false,
});

pushNotificationSchema.index(
  { user: 1, eventKey: 1 },
  { unique: true, name: 'push_notification_user_event_unique_v1' }
);
pushNotificationSchema.index(
  { status: 1, scheduledFor: 1, nextAttemptAt: 1 },
  { name: 'push_notification_queue_v1' }
);
pushNotificationSchema.index(
  { status: 1, leaseUntil: 1 },
  { name: 'push_notification_lease_v1' }
);

module.exports = mongoose.model('PushNotification', pushNotificationSchema);
