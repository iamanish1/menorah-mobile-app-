const express = require('express');
const request = require('supertest');

const counsellorId = '64f000000000000000000081';
const mockCounsellorFindById = jest.fn();
const mockBookingAggregate = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000099', role: 'admin' };
    next();
  },
  requireRecentAdminMfa: (_req, _res, next) => next(),
}));

jest.mock('../../middleware/adminAuthorization', () => ({
  hasAdminPermission: jest.fn(() => true),
  requireAdminPermission: jest.fn(() => (_req, _res, next) => next()),
  requireAssignedAdminRole: (_req, _res, next) => next(),
}));

jest.mock('../../models/Counsellor', () => ({
  findById: (...args) => mockCounsellorFindById(...args),
}));

jest.mock('../../models/Booking', () => ({
  aggregate: (...args) => mockBookingAggregate(...args),
}));
jest.mock('../../services/counsellorVerificationExpiry', () => ({
  reconcileBatch: jest.fn(),
  reconcileOne: jest.fn(async () => ({ outcome: 'not_due' })),
}));

const adminRouter = require('../admin');

const buildApp = () => {
  const app = express();
  app.use('/api/admin', adminRouter);
  return app;
};

const counsellorQuery = (counsellor) => {
  const query = {
    populate: jest.fn(),
    lean: jest.fn().mockResolvedValue(counsellor),
  };
  query.populate.mockReturnValue(query);
  return query;
};

describe('admin counsellor profile read model', () => {
  beforeEach(() => {
    mockCounsellorFindById.mockReset();
    mockBookingAggregate.mockReset();
  });

  test('returns current User personal fields for an approved counsellor detail view', async () => {
    const counsellor = {
      _id: counsellorId,
      user: {
        firstName: 'Mira',
        lastName: 'Counsellor',
        email: 'mira@example.com',
        phone: '+15551234567',
        dateOfBirth: new Date('1992-04-25T00:00:00.000Z'),
        gender: 'other',
      },
      status: 'approved',
      isActive: true,
      specialization: 'Stress management',
      experience: 6,
      hourlyRate: 1200,
      currency: 'INR',
    };
    const query = counsellorQuery(counsellor);
    mockCounsellorFindById.mockReturnValue(query);
    mockBookingAggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .get(`/api/admin/counsellors/${counsellorId}`)
      .expect(200);

    expect(query.populate).toHaveBeenCalledWith(
      'user',
      'firstName lastName email phone profileImage role isActive createdAt dateOfBirth gender',
    );
    expect(res.body.data.counsellor).toMatchObject({
      user: {
        firstName: 'Mira',
        lastName: 'Counsellor',
      },
      gender: 'other',
    });
    expect(res.body.data.counsellor.dateOfBirth).toBe('1992-04-25T00:00:00.000Z');
  });
});
