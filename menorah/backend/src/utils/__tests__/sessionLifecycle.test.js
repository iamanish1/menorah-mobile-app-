const { revokeAllSessions, disconnectUserSockets } = require('../sessionLifecycle');

describe('session lifecycle', () => {
  test('increments the session version and records revocation time', () => {
    const user = { sessionVersion: 4 };
    const revokedAt = revokeAllSessions(user);

    expect(user.sessionVersion).toBe(5);
    expect(user.lastSessionRevokedAt).toEqual(revokedAt);
    expect(user.lastPasswordChangeAt).toBeUndefined();
  });

  test('records password changes while revoking every session', () => {
    const user = { sessionVersion: 0 };
    const revokedAt = revokeAllSessions(user, { passwordChanged: true });

    expect(user.sessionVersion).toBe(1);
    expect(user.lastSessionRevokedAt).toEqual(revokedAt);
    expect(user.lastPasswordChangeAt).toEqual(revokedAt);
  });

  test('immediately disconnects every socket in the revoked user room', () => {
    const disconnectSockets = jest.fn();
    const emit = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit })),
      in: jest.fn(() => ({ disconnectSockets })),
    };

    expect(disconnectUserSockets(io, { _id: { toString: () => 'user-42' } }, 'password_reset')).toBe(true);
    expect(io.to).toHaveBeenCalledWith('user_user-42');
    expect(emit).toHaveBeenCalledWith('session_revoked', { reason: 'password_reset' });
    expect(io.in).toHaveBeenCalledWith('user_user-42');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
