const express = require('express');
const request = require('supertest');

const applicationId = '64f000000000000000000081';
const existingUserId = '64f000000000000000000001';
const mockStartSession = jest.fn();
const mockPendingFindOne = jest.fn();
const mockUserFindOne = jest.fn();
const mockCounsellorFindOne = jest.fn();

jest.mock('mongoose', () => ({
  startSession: (...args) => mockStartSession(...args),
}));

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: { toString: () => '64f000000000000000000099' }, role: 'admin' };
    next();
  },
}));

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockUserFindOne(...args),
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: (...args) => mockCounsellorFindOne(...args),
}));

jest.mock('../../models/PendingApplication', () => ({
  findOne: (...args) => mockPendingFindOne(...args),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../models/Booking', () => ({}));
jest.mock('../../models/KycVerification', () => ({}));
jest.mock('../../models/Payout', () => ({}));

const adminRouter = require('../admin');

const sessionQuery = (value) => ({
  session: jest.fn(async () => value),
});

const pendingQuery = (value) => {
  const query = {
    select: jest.fn(() => query),
    session: jest.fn(async () => value),
  };
  return query;
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

describe('counsellor approval identity safety', () => {
  beforeEach(() => {
    mockStartSession.mockReset();
    mockPendingFindOne.mockReset();
    mockUserFindOne.mockReset();
    mockCounsellorFindOne.mockReset();
  });

  test('moves a conflicting application to manual review without altering the existing user', async () => {
    const transaction = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(async () => undefined),
    };
    mockStartSession.mockResolvedValue(transaction);

    const application = {
      _id: applicationId,
      email: 'patient@example.com',
      phone: '+15551234567',
      licenseNumber: 'LIC-2026-001',
      status: 'pending',
      identityConflict: { hasConflict: false, email: false, phone: false },
      save: jest.fn(async () => undefined),
    };
    const existingPatient = {
      _id: { toString: () => existingUserId },
      email: 'patient@example.com',
      phone: '+15551234567',
      role: 'user',
      password: 'existing-password-hash',
    };

    mockPendingFindOne.mockReturnValue(pendingQuery(application));
    mockUserFindOne.mockReturnValue(sessionQuery(existingPatient));
    mockCounsellorFindOne.mockReturnValue(sessionQuery(null));

    const res = await request(buildApp())
      .put(`/api/admin/counsellors/${applicationId}/approve`)
      .expect(409);

    expect(res.body).toMatchObject({
      success: false,
      code: 'APPLICATION_IDENTITY_CONFLICT',
      data: { applicationId, status: 'manual_review' },
    });
    expect(application.status).toBe('manual_review');
    expect(application.identityConflict).toMatchObject({ hasConflict: true, email: true, phone: true });
    expect(application.save).toHaveBeenCalledWith({ session: transaction });
    expect(existingPatient.role).toBe('user');
    expect(existingPatient.password).toBe('existing-password-hash');
    expect(transaction.endSession).toHaveBeenCalled();
  });
});
