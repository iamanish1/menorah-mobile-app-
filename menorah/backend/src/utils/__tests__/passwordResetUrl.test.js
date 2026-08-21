const crypto = require('crypto');
const {
  PASSWORD_RESET_TTL_MS,
  issuePasswordResetToken,
} = require('../passwordResetUrl');

describe('issuePasswordResetToken', () => {
  test('stores only a hash and gives callers a one-time token with a short expiry', () => {
    const user = {};
    const now = Date.UTC(2026, 6, 28, 12, 0, 0);

    const token = issuePasswordResetToken(user, now);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(user.passwordResetToken).toBe(
      crypto.createHash('sha256').update(token).digest('hex'),
    );
    expect(user.passwordResetToken).not.toBe(token);
    expect(user.passwordResetExpires).toEqual(
      new Date(now + PASSWORD_RESET_TTL_MS),
    );
    expect(PASSWORD_RESET_TTL_MS).toBe(10 * 60 * 1000);
  });
});
