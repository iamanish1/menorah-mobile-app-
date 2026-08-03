const express = require('express');
const request = require('supertest');

const applicationId = '64f000000000000000000081';
const mockStartReview = jest.fn();
const mockPendingFindById = jest.fn();
const mockPendingUpdateOne = jest.fn();
const mockUserExists = jest.fn();

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

jest.mock('../../services/counsellorVerificationService', () => {
  class CounsellorVerificationError extends Error {
    constructor(code, message, { status = 409, details = [] } = {}) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
  return {
    CounsellorVerificationError,
    approve: jest.fn(),
    expire: jest.fn(),
    issueReverificationInvitation: jest.fn(),
    reject: jest.fn(),
    startReview: (...args) => mockStartReview(...args),
    suspend: jest.fn(),
  };
});

jest.mock('../../services/counsellorDiscoveryCache', () => ({
  invalidateCounsellorDiscoveryCache: jest.fn(async () => undefined),
}));
jest.mock('../../models/User', () => ({
  exists: (...args) => mockUserExists(...args),
}));
jest.mock('../../models/Counsellor', () => ({}));
jest.mock('../../models/Booking', () => ({}));
jest.mock('../../models/PendingApplication', () => ({
  findById: (...args) => mockPendingFindById(...args),
  updateOne: (...args) => mockPendingUpdateOne(...args),
}));
jest.mock('../../models/KycVerification', () => ({}));
jest.mock('../../models/Payout', () => ({}));

const { CounsellorVerificationError } = require('../../services/counsellorVerificationService');
const adminRouter = require('../admin');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

describe('counsellor approval identity safety', () => {
  beforeEach(() => {
    mockStartReview.mockReset();
    mockPendingFindById.mockReset();
    mockPendingUpdateOne.mockReset();
    mockUserExists.mockReset();
  });

  test('moves an existing-account application to manual review without converting the account', async () => {
    const application = {
      _id: applicationId,
      email: 'patient@example.com',
      phone: '+15551234567',
      status: 'submitted',
    };
    mockStartReview.mockRejectedValue(new CounsellorVerificationError(
      'EXISTING_ACCOUNT_REQUIRES_SEPARATE_INTAKE',
      'An existing account cannot be converted through an anonymous counsellor application.',
    ));
    mockPendingFindById.mockReturnValue({
      lean: jest.fn(() => Promise.resolve(application)),
    });
    mockUserExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockPendingUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const response = await request(buildApp())
      .put(`/api/admin/counsellors/${applicationId}/start-review`)
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      code: 'APPLICATION_IDENTITY_CONFLICT',
      data: {
        applicationId,
        status: 'manual_review',
        identityConflict: {
          hasConflict: true,
          email: true,
          phone: true,
        },
      },
    });
    expect(mockPendingUpdateOne).toHaveBeenCalledWith(
      { _id: applicationId, status: { $in: ['pending', 'submitted'] } },
      { $set: expect.objectContaining({ status: 'manual_review' }) },
    );
  });
});
