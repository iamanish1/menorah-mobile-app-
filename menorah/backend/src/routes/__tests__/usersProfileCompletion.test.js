const express = require('express');
const request = require('supertest');

const userId = '64f000000000000000000001';
const mockFindById = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { _id: userId, role: 'user' };
    next();
  },
  patientAuth: (req, _res, next) => {
    req.user = { _id: userId, role: 'user' };
    next();
  },
  sharedParticipantAuth: (req, _res, next) => {
    req.user = { _id: userId, role: 'user' };
    next();
  },
}));

jest.mock('../../models/User', () => ({
  findById: (...args) => mockFindById(...args),
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: jest.fn(),
}));

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    scan: jest.fn().mockResolvedValue({ cursor: '0', keys: [] }),
    del: jest.fn(),
  }),
}));

const usersRouter = require('../users');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

const makeUser = (overrides = {}) => ({
  _id: { toString: () => userId },
  firstName: 'Asha',
  lastName: 'User',
  email: 'asha@example.com',
  phone: null,
  isEmailVerified: true,
  isPhoneVerified: false,
  profileCompleted: false,
  role: 'user',
  socialAuth: { googleSub: 'google-subject' },
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('user social-profile completion', () => {
  beforeEach(() => {
    mockFindById.mockReset();
  });

  test('stores a valid E.164 phone and marks the profile complete', async () => {
    const user = makeUser();
    mockFindById.mockResolvedValue(user);

    const response = await request(buildApp())
      .put('/api/users/profile/complete')
      .send({ phone: '+971501234567' })
      .expect(200);

    expect(mockFindById).toHaveBeenCalledWith(userId);
    expect(user).toMatchObject({
      phone: '+971501234567',
      profileCompleted: true,
    });
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Profile completed successfully',
      data: {
        user: {
          id: userId,
          phone: '+971501234567',
          profileCompleted: true,
        },
      },
    });
  });

  test('rejects a phone that is not valid E.164 before loading the user', async () => {
    const response = await request(buildApp())
      .put('/api/users/profile/complete')
      .send({ phone: '0501234567' })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: 'Validation failed',
    });
    expect(response.body.errors[0].msg).toMatch(/valid phone number with country code/i);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('returns a conflict when the phone number already belongs to another account', async () => {
    const duplicateError = Object.assign(new Error('duplicate phone'), { code: 11000 });
    const user = makeUser({
      save: jest.fn().mockRejectedValue(duplicateError),
    });
    mockFindById.mockResolvedValue(user);

    const response = await request(buildApp())
      .put('/api/users/profile/complete')
      .send({ phone: '+971501234567' })
      .expect(409);

    expect(user.save).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({
      success: false,
      message: 'That phone number is already in use.',
    });
  });

  test('returns not found when the authenticated user no longer exists', async () => {
    mockFindById.mockResolvedValue(null);

    const response = await request(buildApp())
      .put('/api/users/profile/complete')
      .send({ phone: '+971501234567' })
      .expect(404);

    expect(mockFindById).toHaveBeenCalledWith(userId);
    expect(response.body).toEqual({
      success: false,
      message: 'User not found',
    });
  });
});
