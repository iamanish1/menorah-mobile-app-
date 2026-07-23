const { isCurrentSessionToken } = require('../sessionTokenBinding');

const account = {
  _id: '64f000000000000000000101',
  role: 'counsellor',
  sessionVersion: 4,
};

describe('session token account binding', () => {
  test('accepts only the current account identity, role, and session version', () => {
    expect(isCurrentSessionToken({
      userId: account._id,
      role: account.role,
      sessionVersion: account.sessionVersion,
    }, account)).toBe(true);
  });

  test.each([
    ['different identity', { userId: '64f000000000000000000102' }],
    ['stale role', { role: 'user' }],
    ['stale session', { sessionVersion: 3 }],
    ['missing session', { sessionVersion: undefined }],
    ['malformed session', { sessionVersion: '4' }],
  ])('rejects a %s', (_label, override) => {
    expect(isCurrentSessionToken({
      userId: account._id,
      role: account.role,
      sessionVersion: account.sessionVersion,
      ...override,
    }, account)).toBe(false);
  });

  test('fails closed when the stored account has no valid session version', () => {
    expect(isCurrentSessionToken({
      userId: account._id,
      role: account.role,
      sessionVersion: 0,
    }, {
      ...account,
      sessionVersion: undefined,
    })).toBe(false);
  });
});
