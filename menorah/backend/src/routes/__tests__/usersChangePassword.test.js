const express = require('express');
const request = require('supertest');

const userId = '64f000000000000000000031';
const mockFindById = jest.fn();
const mockRevokeAllSessions = jest.fn();
const mockDisconnectUserSockets = jest.fn();
const mockClearMappedSessionCookie = jest.fn();
let mockParticipantRole = 'user';

jest.mock('../../models/User', () => ({
  findById: (...args) => mockFindById(...args),
}));

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { _id: userId, role: mockParticipantRole };
    next();
  },
  patientAuth: (req, _res, next) => {
    req.user = { _id: userId, role: 'user' };
    next();
  },
  sharedParticipantAuth: (req, res, next) => {
    if (!['user', 'counsellor'].includes(mockParticipantRole)) {
      return res.status(403).json({
        success: false,
        code: 'PARTICIPANT_ROLE_REQUIRED',
        message: 'Access denied. A patient or counsellor account is required.',
      });
    }
    req.user = { _id: userId, role: mockParticipantRole };
    return next();
  },
}));

jest.mock('../../config/webSessions', () => ({
  clearMappedSessionCookie: (...args) => mockClearMappedSessionCookie(...args),
}));

jest.mock('../../utils/sessionLifecycle', () => ({
  revokeAllSessions: (...args) => mockRevokeAllSessions(...args),
  disconnectUserSockets: (...args) => mockDisconnectUserSockets(...args),
}));

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
}));

jest.mock('../../utils/counsellorProfileSync', () => ({
  invalidateCounsellorDiscoveryCache: jest.fn(),
  notifyCounsellorProfileUpdated: jest.fn(),
}));

const usersRouter = require('../users');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

const buildUser = ({ currentPasswordValid = true } = {}) => ({
  _id: userId,
  password: '$2b$existing-password',
  passwordResetToken: 'outstanding-reset-token-hash',
  passwordResetExpires: new Date(Date.now() + 5 * 60 * 1000),
  loginAttempts: 3,
  lockUntil: new Date(Date.now() + 60 * 60 * 1000),
  sessionVersion: 4,
  comparePassword: jest.fn(async (candidate) => (
    currentPasswordValid && candidate === 'CurrentPass1'
  )),
  save: jest.fn(async () => undefined),
});

describe('participant change-password', () => {
  beforeEach(() => {
    mockFindById.mockReset();
    mockRevokeAllSessions.mockReset();
    mockDisconnectUserSockets.mockReset();
    mockClearMappedSessionCookie.mockReset();
    mockParticipantRole = 'user';
  });

  test.each(['user', 'counsellor'])(
    'changes a %s password, invalidates recovery, and clears lock state',
    async (role) => {
      mockParticipantRole = role;
      const user = buildUser();
      const select = jest.fn(async () => user);
      mockFindById.mockReturnValue({ select });

      const response = await request(buildApp())
        .put('/api/users/change-password')
        .send({
          currentPassword: 'CurrentPass1',
          newPassword: 'NewStrongPass2',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Password changed successfully',
      });
      expect(mockFindById).toHaveBeenCalledWith(userId);
      expect(select).toHaveBeenCalledWith(
        '+password +passwordResetToken +passwordResetExpires +lockUntil',
      );
      expect(user.comparePassword).toHaveBeenCalledWith('CurrentPass1');
      expect(user.comparePassword).toHaveBeenCalledWith('NewStrongPass2');
      expect(user.password).toBe('NewStrongPass2');
      expect(user.passwordResetToken).toBeUndefined();
      expect(user.passwordResetExpires).toBeUndefined();
      expect(user.loginAttempts).toBe(0);
      expect(user.lockUntil).toBeNull();
      expect(mockRevokeAllSessions).toHaveBeenCalledWith(user, { passwordChanged: true });
      expect(user.save).toHaveBeenCalledTimes(1);
      expect(mockClearMappedSessionCookie).toHaveBeenCalledTimes(1);
      expect(mockDisconnectUserSockets).toHaveBeenCalledWith(undefined, user, 'password_changed');
    },
  );

  test('does not mutate credentials when the current password is wrong', async () => {
    const user = buildUser({ currentPasswordValid: false });
    const originalPassword = user.password;
    mockFindById.mockReturnValue({ select: jest.fn(async () => user) });

    const response = await request(buildApp())
      .put('/api/users/change-password')
      .send({
        currentPassword: 'WrongPass1',
        newPassword: 'NewStrongPass2',
      })
      .expect(400);

    expect(response.body.message).toBe('Current password is incorrect');
    expect(user.password).toBe(originalPassword);
    expect(user.passwordResetToken).toBe('outstanding-reset-token-hash');
    expect(user.save).not.toHaveBeenCalled();
    expect(mockRevokeAllSessions).not.toHaveBeenCalled();
  });

  test('rejects reusing the current password before invalidating recovery or lock state', async () => {
    const user = buildUser();
    const originalResetToken = user.passwordResetToken;
    const originalResetExpiry = user.passwordResetExpires;
    const originalLoginAttempts = user.loginAttempts;
    const originalLockUntil = user.lockUntil;
    mockFindById.mockReturnValue({ select: jest.fn(async () => user) });

    const response = await request(buildApp())
      .put('/api/users/change-password')
      .send({
        currentPassword: 'CurrentPass1',
        newPassword: 'CurrentPass1',
      })
      .expect(400);

    expect(response.body.message).toBe('New password must be different from current password');
    expect(user.passwordResetToken).toBe(originalResetToken);
    expect(user.passwordResetExpires).toBe(originalResetExpiry);
    expect(user.loginAttempts).toBe(originalLoginAttempts);
    expect(user.lockUntil).toBe(originalLockUntil);
    expect(user.save).not.toHaveBeenCalled();
    expect(mockRevokeAllSessions).not.toHaveBeenCalled();
  });

  test('rejects non-participant roles', async () => {
    mockParticipantRole = 'admin';

    const response = await request(buildApp())
      .put('/api/users/change-password')
      .send({
        currentPassword: 'CurrentPass1',
        newPassword: 'NewStrongPass2',
      })
      .expect(403);

    expect(response.body.code).toBe('PARTICIPANT_ROLE_REQUIRED');
    expect(mockFindById).not.toHaveBeenCalled();
  });
});
