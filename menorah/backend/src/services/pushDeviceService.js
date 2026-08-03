const crypto = require('crypto');
const PushDevice = require('../models/PushDevice');

const EXPO_PUSH_TOKEN_PATTERN = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{16,}\]$/;

class PushDeviceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PushDeviceError';
    this.code = code;
  }
}

const normalizeExpoPushToken = (value) => {
  const token = String(value || '').trim();
  if (!EXPO_PUSH_TOKEN_PATTERN.test(token)) {
    throw new PushDeviceError('PUSH_TOKEN_INVALID', 'A valid Expo push token is required.');
  }
  return token;
};

const hashPushToken = (token) => crypto
  .createHash('sha256')
  .update(normalizeExpoPushToken(token))
  .digest('hex');

const registerPushDevice = async ({
  userId,
  expoPushToken,
  platform,
  projectId,
}, { PushDeviceModel = PushDevice } = {}) => {
  if (platform !== 'android') {
    throw new PushDeviceError('PUSH_PLATFORM_UNSUPPORTED', 'Only Android push is supported.');
  }

  const token = normalizeExpoPushToken(expoPushToken);
  const tokenHash = hashPushToken(token);
  const now = new Date();

  return PushDeviceModel.findOneAndUpdate(
    { tokenHash },
    {
      $set: {
        user: userId,
        expoPushToken: token,
        platform: 'android',
        projectId: String(projectId || '').trim() || null,
        active: true,
        lastRegisteredAt: now,
        disabledAt: null,
        disabledReason: null,
      },
      $setOnInsert: { tokenHash },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );
};

const unregisterPushDevice = async ({
  userId,
  expoPushToken,
  reason = 'user_disabled',
}, { PushDeviceModel = PushDevice } = {}) => {
  const tokenHash = hashPushToken(expoPushToken);
  return PushDeviceModel.findOneAndUpdate(
    { user: userId, tokenHash, active: true },
    {
      $set: {
        active: false,
        disabledAt: new Date(),
        disabledReason: reason,
      },
    },
    { new: true }
  );
};

const disablePushDevicesForUser = async ({
  userId,
  reason = 'user_disabled',
}, { PushDeviceModel = PushDevice } = {}) => PushDeviceModel.updateMany(
  { user: userId, active: true },
  {
    $set: {
      active: false,
      disabledAt: new Date(),
      disabledReason: reason,
    },
  }
);

const disablePushDeviceById = async ({
  deviceId,
  reason = 'device_not_registered',
}, { PushDeviceModel = PushDevice } = {}) => PushDeviceModel.findByIdAndUpdate(
  deviceId,
  {
    $set: {
      active: false,
      disabledAt: new Date(),
      disabledReason: reason,
    },
  },
  { new: true }
);

const listActivePushDevices = async ({ userId }, {
  PushDeviceModel = PushDevice,
} = {}) => PushDeviceModel.find({
  user: userId,
  platform: 'android',
  active: true,
})
  .select('+expoPushToken')
  .sort({ updatedAt: -1 })
  .lean();

module.exports = {
  EXPO_PUSH_TOKEN_PATTERN,
  PushDeviceError,
  disablePushDeviceById,
  disablePushDevicesForUser,
  hashPushToken,
  listActivePushDevices,
  normalizeExpoPushToken,
  registerPushDevice,
  unregisterPushDevice,
};
