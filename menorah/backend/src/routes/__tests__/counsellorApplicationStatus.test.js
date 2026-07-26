const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockPendingFindOne = jest.fn();
const mockCounsellorFindOne = jest.fn();
const mockCounsellorFindById = jest.fn();
const mockReconcileCounsellorVerificationExpiry = jest.fn();

const queryResult = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn(async () => value),
  })),
});

jest.mock('../../models/PendingApplication', () => ({
  findOne: (...args) => mockPendingFindOne(...args),
}));
jest.mock('../../models/Counsellor', () => ({
  findOne: (...args) => mockCounsellorFindOne(...args),
  findById: (...args) => mockCounsellorFindById(...args),
}));
jest.mock('../../models/User', () => ({}));
jest.mock('../../models/Booking', () => ({}));
jest.mock('../../services/counsellorVerificationExpiry', () => ({
  reconcileOne: (...args) => mockReconcileCounsellorVerificationExpiry(...args),
}));

const counsellorRouter = require('../counsellors');

const buildApp = () => {
  const app = express();
  app.use('/api/counsellors', counsellorRouter);
  return app;
};

describe('counsellor application status ticket', () => {
  beforeEach(() => {
    mockPendingFindOne.mockReset();
    mockCounsellorFindOne.mockReset();
    mockCounsellorFindById.mockReset();
    mockReconcileCounsellorVerificationExpiry.mockReset().mockResolvedValue({
      outcome: 'not_due',
    });
  });

  test('does not accept an email address as an application identifier', async () => {
    await request(buildApp())
      .get('/api/counsellors/application-status')
      .query({ email: 'applicant@example.com' })
      .expect(400);

    expect(mockPendingFindOne).not.toHaveBeenCalled();
  });

  test('looks up pending applications only by a status-ticket hash', async () => {
    const ticket = 'a'.repeat(64);
    const expectedHash = crypto.createHash('sha256').update(ticket).digest('hex');
    mockPendingFindOne.mockReturnValue(queryResult({ status: 'pending', rejectionReason: null }));

    const response = await request(buildApp())
      .get('/api/counsellors/application-status')
      .query({ ticket })
      .expect(200);

    expect(mockPendingFindOne).toHaveBeenCalledWith({ statusLookupTokenHash: expectedHash });
    expect(response.body.data).toEqual({
      status: 'pending',
      rejectionReason: null,
      isActive: false,
      requiresFreshApplication: false,
    });
  });

  test('reports a linked suspended profile as requiring a fresh application', async () => {
    mockPendingFindOne.mockReturnValue(queryResult({
      status: 'submitted',
      rejectionReason: null,
      linkedCounsellor: '64f000000000000000000081',
      legacyReviewRequired: false,
    }));
    mockCounsellorFindById.mockReturnValue(queryResult({
      status: 'suspended',
      isActive: false,
      rejectionReason: 'Credential renewal required',
      professionalVerification: { legacyReviewRequired: false },
    }));

    const response = await request(buildApp())
      .get('/api/counsellors/application-status')
      .query({ ticket: 'c'.repeat(64) })
      .expect(200);

    expect(response.body.data).toEqual({
      status: 'suspended',
      rejectionReason: 'Credential renewal required',
      isActive: false,
      requiresFreshApplication: true,
    });
  });

  test('reconciles an elapsed linked approval before returning applicant status', async () => {
    const counsellorId = '64f000000000000000000081';
    const expiredAt = new Date(Date.now() - 1000);
    mockPendingFindOne.mockReturnValue(queryResult({
      status: 'approved',
      rejectionReason: null,
      linkedCounsellor: counsellorId,
      legacyReviewRequired: false,
    }));
    mockCounsellorFindById
      .mockReturnValueOnce(queryResult({
        _id: counsellorId,
        status: 'approved',
        isActive: true,
        professionalVerification: {
          expiresAt: expiredAt,
          legacyReviewRequired: false,
        },
      }))
      .mockReturnValueOnce(queryResult({
        _id: counsellorId,
        status: 'expired',
        isActive: false,
        professionalVerification: {
          expiresAt: expiredAt,
          legacyReviewRequired: false,
        },
      }));
    mockReconcileCounsellorVerificationExpiry.mockResolvedValue({
      counsellorId,
      outcome: 'expired',
    });

    const response = await request(buildApp())
      .get('/api/counsellors/application-status')
      .query({ ticket: 'd'.repeat(64) })
      .expect(200);

    expect(mockReconcileCounsellorVerificationExpiry).toHaveBeenCalledWith({
      counsellorId,
    });
    expect(response.body.data).toEqual({
      status: 'expired',
      rejectionReason: null,
      isActive: false,
      requiresFreshApplication: true,
    });
  });

  test('returns a generic not-found response for an unknown ticket', async () => {
    mockPendingFindOne.mockReturnValue(queryResult(null));
    mockCounsellorFindOne.mockReturnValue(queryResult(null));

    const response = await request(buildApp())
      .get('/api/counsellors/application-status')
      .query({ ticket: 'b'.repeat(64) })
      .expect(404);

    expect(response.body.message).toBe('Application status not found');
    expect(response.body.message).not.toMatch(/email/i);
  });
});
