const {
  MAX_PASSWORD_BYTES,
  PASSWORD_POLICY_MESSAGE,
  isStrongPassword,
  passwordValidator,
} = require('../passwordPolicy');

describe('password policy byte limit', () => {
  test('accepts a strong password at exactly 72 UTF-8 bytes', () => {
    const password = `Aa1${'x'.repeat(69)}`;

    expect(Buffer.byteLength(password, 'utf8')).toBe(MAX_PASSWORD_BYTES);
    expect(isStrongPassword(password)).toBe(true);
    expect(passwordValidator(password)).toBe(true);
  });

  test('rejects an ASCII password over 72 bytes', () => {
    const password = `Aa1${'x'.repeat(70)}`;

    expect(Buffer.byteLength(password, 'utf8')).toBe(73);
    expect(isStrongPassword(password)).toBe(false);
    expect(() => passwordValidator(password)).toThrow(PASSWORD_POLICY_MESSAGE);
  });

  test('measures UTF-8 bytes rather than JavaScript character count', () => {
    const password = `Aa1${'é'.repeat(35)}`;

    expect(password.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(Buffer.byteLength(password, 'utf8')).toBe(73);
    expect(isStrongPassword(password)).toBe(false);
  });
});
