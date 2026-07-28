const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

const applicationId = '64f000000000000000000081';
const userId = '64f000000000000000000001';
const counsellorId = '64f000000000000000000002';
const mockStartSession = jest.fn();
const mockPendingFindOne = jest.fn();
const mockPendingDeleteOne = jest.fn();
const mockUserFindOne = jest.fn();
const mockCounsellorFindOne = jest.fn();
const mockSendCounsellorCredentialsEmail = jest.fn();
const mockCreatedUsers = [];
const mockCreatedCounsellors = [];

jest.mock('mongoose', () => ({
  startSession: (...args) => mockStartSession(...args),
}));

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000099', role: 'admin' };
    next();
  },
}));

jest.mock('../../models/User', () => {
  function User(data) {
    Object.assign(this, data);
    this._id = userId;
    this.save = jest.fn(async () => undefined);
    mockCreatedUsers.push(this);
  }
  User.findOne = (...args) => mockUserFindOne(...args);
  return User;
});

jest.mock('../../models/Counsellor', () => {
  function Counsellor(data) {
    Object.assign(this, data);
    this._id = counsellorId;
    this.save = jest.fn(async () => undefined);
    mockCreatedCounsellors.push(this);
  }
  Counsellor.findOne = (...args) => mockCounsellorFindOne(...args);
  return Counsellor;
});

jest.mock('../../models/PendingApplication', () => ({
  findOne: (...args) => mockPendingFindOne(...args),
  deleteOne: (...args) => mockPendingDeleteOne(...args),
}));
jest.mock('../../models/Booking', () => ({}));
jest.mock('../../models/KycVerification', () => ({}));
jest.mock('../../models/Payout', () => ({}));
jest.mock('../../utils/email', () => ({
  sendCounsellorCredentialsEmail: (...args) => mockSendCounsellorCredentialsEmail(...args),
}));
jest.mock('../../utils/sessionLifecycle', () => ({
  revokeAllSessions: jest.fn(),
  disconnectUserSockets: jest.fn(),
}));

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

describe('admin counsellor onboarding credentials', () => {
  beforeEach(() => {
    mockStartSession.mockReset();
    mockPendingFindOne.mockReset();
    mockPendingDeleteOne.mockReset();
    mockUserFindOne.mockReset();
    mockCounsellorFindOne.mockReset();
    mockSendCounsellorCredentialsEmail.mockReset();
    mockCreatedUsers.length = 0;
    mockCreatedCounsellors.length = 0;
  });

  test('emails a temporary password and reset link after approving a new counsellor', async () => {
    const transaction = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(async () => undefined),
    };
    const application = {
      _id: applicationId,
      status: 'pending',
      firstName: 'Asha',
      lastName: 'Counsellor',
      email: 'ASHA@example.com',
      phone: '+15551234567',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'female',
      licenseNumber: 'LIC-2026-001',
      specialization: 'Anxiety',
      specializations: ['Anxiety'],
      experience: 7,
      bio: 'Supportive, evidence-based counselling.',
      languages: ['English'],
      hourlyRate: 1200,
      currency: 'INR',
      education: [],
      certifications: [],
      availability: {},
      statusLookupTokenHash: 'status-hash',
    };

    mockStartSession.mockResolvedValue(transaction);
    mockPendingFindOne.mockReturnValue(pendingQuery(application));
    mockUserFindOne.mockReturnValue(sessionQuery(null));
    mockCounsellorFindOne.mockReturnValue(sessionQuery(null));
    mockPendingDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockSendCounsellorCredentialsEmail.mockResolvedValue(true);

    const response = await request(buildApp())
      .put(`/api/admin/counsellors/${applicationId}/approve`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        counsellorId,
        status: 'approved',
        username: 'asha@example.com',
        credentialEmailSent: true,
        credentialEmailRecipient: 'asha@example.com',
      },
    });
    expect(response.body.data.password).toBeUndefined();
    expect(mockCreatedUsers).toHaveLength(1);
    expect(mockCreatedCounsellors).toHaveLength(1);

    const [emailOptions] = mockSendCounsellorCredentialsEmail.mock.calls[0];
    expect(emailOptions).toMatchObject({
      email: 'asha@example.com',
      name: 'Asha Counsellor',
      kind: 'onboarding',
    });
    expect(emailOptions.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$!]).{12}$/);
    expect(emailOptions.resetToken).toMatch(/^[a-f0-9]{64}$/);

    const createdUser = mockCreatedUsers[0];
    expect(createdUser.passwordResetToken).toBe(
      crypto.createHash('sha256').update(emailOptions.resetToken).digest('hex'),
    );
    expect(createdUser.passwordResetToken).not.toBe(emailOptions.resetToken);
    expect(createdUser.passwordResetExpires).toBeInstanceOf(Date);
    expect(createdUser.save).toHaveBeenCalledWith({ session: transaction });
    expect(mockCreatedCounsellors[0].save).toHaveBeenCalledWith({ session: transaction });
    expect(mockPendingDeleteOne).toHaveBeenCalledWith(
      { _id: applicationId },
      { session: transaction },
    );
    expect(transaction.endSession).toHaveBeenCalled();
  });
});
