const { revokeAllSessions } = require('../sessionLifecycle');

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
});
