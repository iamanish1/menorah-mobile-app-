const express = require('express');
const request = require('supertest');

const counsellorId = '64f000000000000000000010';
const mockCounsellorFindOne = jest.fn();
const mockRedisScan = jest.fn();
const mockRedisDel = jest.fn();
const mockSocketEmit = jest.fn();

jest.mock('../../middleware/auth', () => ({
  counsellorAuth: (req, _res, next) => {
    req.user = { _id: { toString: () => counsellorId }, role: 'counsellor' };
    next();
  },
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: (...args) => mockCounsellorFindOne(...args),
}));
jest.mock('../../models/Booking', () => ({}));
jest.mock('../../models/User', () => ({}));
jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({ scan: mockRedisScan, del: mockRedisDel }),
}));
jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
  deleteResource: jest.fn(),
}));

const counsellorRouter = require('../counsellor-bookings');

const buildApp = () => {
  const app = express();
  app.set('io', { emit: mockSocketEmit });
  app.use(express.json());
  app.use('/api/counsellors', counsellorRouter);
  return app;
};

const createCounsellor = () => ({
  _id: counsellorId,
  hourlyRate: 1000,
  availability: {},
  save: jest.fn().mockResolvedValue(undefined),
});

describe('counsellor hourly-rate profile updates', () => {
  beforeEach(() => {
    mockCounsellorFindOne.mockReset();
    mockRedisScan.mockReset().mockResolvedValue({ cursor: '0', keys: ['counsellors:v4:list:page-1'] });
    mockRedisDel.mockReset().mockResolvedValue(1);
    mockSocketEmit.mockReset();
  });

  test('allows a counsellor to update only their hourly rate and clears public discovery cache keys', async () => {
    const counsellor = createCounsellor();
    mockCounsellorFindOne.mockResolvedValue(counsellor);

    await request(buildApp())
      .put('/api/counsellors/me/profile')
      .send({ hourlyRate: 1425 })
      .expect(200);

    expect(counsellor.hourlyRate).toBe(1425);
    expect(counsellor.save).toHaveBeenCalledTimes(1);
    expect(mockRedisScan).toHaveBeenCalledWith('0', { MATCH: 'counsellors:*', COUNT: 100 });
    expect(mockRedisDel).toHaveBeenCalledWith(['counsellors:v4:list:page-1']);
    expect(mockSocketEmit).toHaveBeenCalledWith('counsellor_profile_updated');
  });

  test('continues to protect licence-number changes from self-service updates', async () => {
    const counsellor = createCounsellor();
    mockCounsellorFindOne.mockResolvedValue(counsellor);

    const response = await request(buildApp())
      .put('/api/counsellors/me/profile')
      .send({ licenseNumber: 'NEW-LICENCE-123' })
      .expect(403);

    expect(response.body.message).toMatch(/License number is admin-controlled/i);
    expect(counsellor.save).not.toHaveBeenCalled();
  });

  test('updates public availability status without leaving cached cards stale', async () => {
    const counsellor = {
      ...createCounsellor(),
      isActive: true,
      isAvailable: true,
    };
    mockCounsellorFindOne.mockResolvedValue(counsellor);

    await request(buildApp())
      .put('/api/counsellors/me/status')
      .send({ isAvailable: false })
      .expect(200);

    expect(counsellor.isAvailable).toBe(false);
    expect(counsellor.save).toHaveBeenCalledTimes(1);
    expect(mockRedisDel).toHaveBeenCalledWith(['counsellors:v4:list:page-1']);
    expect(mockSocketEmit).toHaveBeenCalledWith('counsellor_profile_updated');
  });
});
