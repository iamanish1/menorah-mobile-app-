const jwt = require('jsonwebtoken');
const {
  signUserToken,
  signAdminToken,
  verifyAnyAccessToken,
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
    expect(verifyAnyAccessToken(token).role).toBe('admin');
  });

  test('refuses to mint a token for a role outside its token family', () => {
    expect(() => signUserToken({
      _id: 'admin-1',
      role: 'admin',
      sessionVersion: 0,
    })).toThrow(/role/i);
    expect(() => signAdminToken({
      _id: 'user-1',
      role: 'user',
      sessionVersion: 0,
    })).toThrow(/role/i);
  });

  test('rejects missing, malformed, or negative session-version claims', () => {
    const claims = {
      userId: 'user-1',
      role: 'user',
      purpose: 'access',
    };
    const options = {
      algorithm: 'HS256',
      issuer: 'menorah-api-test',
      audience: 'menorah-users',
      expiresIn: '5m',
    };

    const missing = jwt.sign(claims, process.env.JWT_SECRET, options);
    const malformed = jwt.sign(
      { ...claims, sessionVersion: '0' },
      process.env.JWT_SECRET,
      options
    );
    const negative = jwt.sign(
      { ...claims, sessionVersion: -1 },
      process.env.JWT_SECRET,
      options
    );

    expect(() => verifyUserToken(missing)).toThrow(/session version/i);
    expect(() => verifyUserToken(malformed)).toThrow(/session version/i);
    expect(() => verifyUserToken(negative)).toThrow(/session version/i);
  });

  test('fails closed for an unsupported refresh-token purpose', () => {
    const token = jwt.sign(
      {
        userId: 'user-1',
        role: 'user',
        purpose: 'refresh',
        sessionVersion: 0,
      },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        issuer: 'menorah-api-test',
        audience: 'menorah-users',
        expiresIn: '5m',
      }
    );

    expect(() => verifyUserToken(token)).toThrow(/purpose/i);
    expect(() => verifyAdminToken(token)).toThrow();
    expect(() => verifyAnyAccessToken(token)).toThrow();
  });
});
