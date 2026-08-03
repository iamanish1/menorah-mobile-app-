const express = require('express');
const request = require('supertest');

const mockRegisterPushDevice = jest.fn();
const mockUnregisterPushDevice = jest.fn();
let mockAuthenticated = true;

jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => {
    if (!mockAuthenticated) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    req.user = { _id: '64f000000000000000000001', role: 'user' };
    return next();
  },
}));

jest.mock('../../services/pushDeviceService', () => {
  class PushDeviceError extends Error {}
  return {
    EXPO_PUSH_TOKEN_PATTERN: /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{16,}\]$/,
    PushDeviceError,
    disablePushDevicesForUser: jest.fn(),
    registerPushDevice: (...args) => mockRegisterPushDevice(...args),
    unregisterPushDevice: (...args) => mockUnregisterPushDevice(...args),
  };
});

const usersRouter = require('../users');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

const token = `ExponentPushToken[${'a'.repeat(24)}]`;

describe('push device authorization', () => {
  beforeEach(() => {
    mockAuthenticated = true;
    mockRegisterPushDevice.mockReset().mockResolvedValue({});
    mockUnregisterPushDevice.mockReset().mockResolvedValue({});
  });

  test('requires authentication before registration', async () => {
    mockAuthenticated = false;
    await request(buildApp())
      .post('/api/users/push-devices')
      .send({ expoPushToken: token, platform: 'android', projectId: 'project-1' })
      .expect(401);

    expect(mockRegisterPushDevice).not.toHaveBeenCalled();
  });

  test('scopes registration to the authenticated user and never echoes the token', async () => {
    const response = await request(buildApp())
      .post('/api/users/push-devices')
      .send({ expoPushToken: token, platform: 'android', projectId: 'project-1' })
      .expect(201);

    expect(mockRegisterPushDevice).toHaveBeenCalledWith({
      userId: '64f000000000000000000001',
      expoPushToken: token,
      platform: 'android',
      projectId: 'project-1',
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
  });

  test('scopes unregistration to the authenticated user', async () => {
    await request(buildApp())
      .delete('/api/users/push-devices')
      .send({ expoPushToken: token })
      .expect(200);

    expect(mockUnregisterPushDevice).toHaveBeenCalledWith({
      userId: '64f000000000000000000001',
      expoPushToken: token,
    });
  });
});
