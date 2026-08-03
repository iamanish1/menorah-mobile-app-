const mongoose = require('mongoose');

const pushDeviceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  expoPushToken: {
    type: String,
    required: true,
    trim: true,
    maxlength: 256,
    select: false,
  },
  tokenHash: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
  },
  platform: {
    type: String,
    enum: ['android'],
    required: true,
    default: 'android',
  },
  projectId: {
    type: String,
    trim: true,
    maxlength: 128,
    default: null,
  },
  active: {
    type: Boolean,
    default: true,
  },
  lastRegisteredAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  disabledAt: {
    type: Date,
    default: null,
  },
  disabledReason: {
    type: String,
    enum: ['user_disabled', 'signed_out', 'device_not_registered', 'token_reassigned', null],
    default: null,
    select: false,
  },
}, {
  timestamps: true,
  versionKey: false,
});

pushDeviceSchema.index(
  { tokenHash: 1 },
  { unique: true, name: 'push_device_token_hash_unique_v1' }
);
pushDeviceSchema.index(
  { user: 1, active: 1, updatedAt: -1 },
  { name: 'push_device_user_active_v1' }
);

module.exports = mongoose.model('PushDevice', pushDeviceSchema);
