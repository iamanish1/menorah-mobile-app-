const {
  hashPushToken,
  normalizeExpoPushToken,
  registerPushDevice,
  unregisterPushDevice,
} = require('../pushDeviceService');

const VALID_TOKEN = `ExponentPushToken[${'a'.repeat(24)}]`;

describe('pushDeviceService', () => {
  test('validates and hashes Expo tokens without exposing them in lookup keys', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({ active: true });

    await registerPushDevice({
      userId: 'user-1',
      expoPushToken: VALID_TOKEN,
      platform: 'android',
      projectId: 'project-1',
    }, { PushDeviceModel: { findOneAndUpdate } });

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ tokenHash: hashPushToken(VALID_TOKEN) });
    expect(filter).not.toHaveProperty('expoPushToken');
    expect(update.$set.expoPushToken).toBe(VALID_TOKEN);
  });

  test('rejects malformed tokens and unsupported platforms', async () => {
    expect(() => normalizeExpoPushToken('not-a-token')).toThrow('valid Expo push token');
    await expect(registerPushDevice({
      userId: 'user-1',
      expoPushToken: VALID_TOKEN,
      platform: 'ios',
    })).rejects.toMatchObject({ code: 'PUSH_PLATFORM_UNSUPPORTED' });
  });

  test('unregisters only the current user token hash', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({ active: false });
    await unregisterPushDevice({
      userId: 'user-1',
      expoPushToken: VALID_TOKEN,
    }, { PushDeviceModel: { findOneAndUpdate } });

    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({
      user: 'user-1',
      tokenHash: hashPushToken(VALID_TOKEN),
      active: true,
    });
    expect(findOneAndUpdate.mock.calls[0][1].$set.active).toBe(false);
  });
});
