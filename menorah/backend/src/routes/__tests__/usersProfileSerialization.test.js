const express = require('express');
const request = require('supertest');

const mockUserId = '64f000000000000000000001';
const mockFindById = jest.fn();
const mockRedisScan = jest.fn();
const mockRedisDel = jest.fn();
const mockSocketEmit = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { _id: { toString: () => mockUserId } };
    next();
  },
  sharedParticipantAuth: (req, _res, next) => {
    req.user = {
      _id: { toString: () => mockUserId },
      role: 'user',
      isEmailVerified: true,
    };
    next();
  },
  patientAuth: (req, _res, next) => {
    req.user = {
      _id: { toString: () => mockUserId },
      role: 'user',
      isEmailVerified: true,
    };
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
  getRedisClient: () => ({ scan: mockRedisScan, del: mockRedisDel }),
}));

const usersRouter = require('../users');

const buildApp = () => {
  const app = express();
  app.set('io', { emit: mockSocketEmit });
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

const makeUserDocument = (overrides = {}) => ({
  _id: { toString: () => mockUserId },
  firstName: 'Asha',
  lastName: 'User',
  email: 'asha@example.com',
  phone: '+15551234567',
  password: 'hashed-password',
  emailVerificationToken: 'verify-token',
  passwordResetToken: 'reset-token',
  passwordResetExpires: new Date(),
  loginAttempts: 4,
  lockUntil: new Date(Date.now() + 60000),
  sessionVersion: 7,
  socialAuth: { googleSub: 'google-sub' },
  isEmailVerified: true,
  isPhoneVerified: false,
  profileImage: null,
  dateOfBirth: new Date('1990-01-01'),
  gender: 'female',
  notificationPreferences: { email: true, sms: true, push: true },
  role: 'user',
  save: jest.fn().mockResolvedValue(undefined),
  toObject() {
    return { ...this };
  },
  ...overrides,
});

const flattenKeys = (value, keys = []) => {
  if (!value || typeof value !== 'object') return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    flattenKeys(child, keys);
  }
  return keys;
};

describe('user profile serialization', () => {
  beforeEach(() => {
    mockFindById.mockReset();
    mockRedisScan.mockReset().mockResolvedValue({ cursor: '0', keys: ['counsellors:v4:list:page-1'] });
    mockRedisDel.mockReset().mockResolvedValue(1);
    mockSocketEmit.mockReset();
  });

  test('PUT /api/users/profile never exposes password, token, reset, or lock fields', async () => {
    const user = makeUserDocument();
    mockFindById.mockResolvedValue(user);

    const res = await request(buildApp())
      .put('/api/users/profile')
      .send({ firstName: 'Mira' })
      .expect(200);

    expect(user.save).toHaveBeenCalled();
    const keys = flattenKeys(res.body.data.user);
    expect(keys).not.toEqual(expect.arrayContaining([
      'password',
      'emailVerificationToken',
      'passwordResetToken',
      'passwordResetExpires',
      'loginAttempts',
      'lockUntil',
      'sessionVersion',
      'socialAuth',
    ]));
    expect(res.body.data.user).toMatchObject({
      id: mockUserId,
      firstName: 'Mira',
      email: 'asha@example.com',
    });
    expect(mockRedisScan).not.toHaveBeenCalled();
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  test('counsellor personal edits clear public directory cache and refresh connected user read models', async () => {
    const user = makeUserDocument({ role: 'counsellor' });
    mockFindById.mockResolvedValue(user);

    const res = await request(buildApp())
      .put('/api/users/profile')
      .send({
        firstName: 'Mira',
        lastName: 'Counsellor',
        gender: 'other',
        dateOfBirth: '1992-04-25',
      })
      .expect(200);

    expect(user).toMatchObject({
      firstName: 'Mira',
      lastName: 'Counsellor',
      gender: 'other',
      dateOfBirth: '1992-04-25',
    });
    expect(mockRedisScan).toHaveBeenCalledWith('0', { MATCH: 'counsellors:*', COUNT: 100 });
    expect(mockRedisDel).toHaveBeenCalledWith(['counsellors:v4:list:page-1']);
    expect(mockSocketEmit).toHaveBeenCalledWith('counsellor_profile_updated');
    expect(res.body.data.user).toMatchObject({
      firstName: 'Mira',
      lastName: 'Counsellor',
      gender: 'other',
    });
  });
});
