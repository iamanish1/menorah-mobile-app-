const {
  signUserToken,
  signAdminToken,
  verifyUserToken,
  verifyAdminToken,
} = require('../authTokens');

describe('authTokens', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_ISSUER = 'menorah-api-test';
  });

  test('signs and verifies user access tokens with session version', () => {
    const token = signUserToken({ _id: 'user-1', role: 'user', sessionVersion: 3 });
    const decoded = verifyUserToken(token);

    expect(decoded.userId).toBe('user-1');
    expect(decoded.role).toBe('user');
    expect(decoded.purpose).toBe('access');
    expect(decoded.sessionVersion).toBe(3);
    expect(decoded.aud).toBe('menorah-users');
    expect(decoded.iss).toBe('menorah-api-test');
  });

  test('rejects admin tokens on user verifier', () => {
    const token = signAdminToken({ _id: 'admin-1', role: 'admin', sessionVersion: 0 });

    expect(() => verifyUserToken(token)).toThrow();
    expect(verifyAdminToken(token).purpose).toBe('admin');
  });
});
