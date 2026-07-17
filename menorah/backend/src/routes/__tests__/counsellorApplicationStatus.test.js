const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockPendingFindOne = jest.fn();
const mockCounsellorFindOne = jest.fn();

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
}));
jest.mock('../../models/User', () => ({}));
jest.mock('../../models/Booking', () => ({}));

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
    expect(response.body.data).toEqual({ status: 'pending', rejectionReason: null, isActive: false });
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
