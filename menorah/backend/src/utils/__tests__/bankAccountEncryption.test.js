const {
  decryptBankAccountNumber,
  encryptBankAccountNumber,
  getMaskedBankAccountNumber,
} = require('../bankAccountEncryption');

describe('bank account encryption', () => {
  const originalKey = process.env.DATA_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.DATA_ENCRYPTION_KEY = 'test-only-bank-account-encryption-key';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = originalKey;
  });

  test('encrypts and decrypts a bank account number with an authenticated envelope', () => {
    const encrypted = encryptBankAccountNumber('123456789012');

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('123456789012');
    expect(decryptBankAccountNumber(encrypted)).toBe('123456789012');
  });

  test('rejects invalid stored ciphertext', () => {
    expect(() => decryptBankAccountNumber('not-a-valid-envelope'))
      .toThrow('Stored bank account number is invalid');
  });

  test('rejects ciphertext that fails GCM authentication', () => {
    const encrypted = encryptBankAccountNumber('123456789012');
    const parts = encrypted.split(':');
    const ciphertext = Buffer.from(parts[3], 'base64');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64');

    expect(() => decryptBankAccountNumber(parts.join(':'))).toThrow();
  });

  test('masks the stored last four digits without decrypting', () => {
    expect(getMaskedBankAccountNumber({ accountNumberLast4: '9012' })).toBe('****9012');
  });
});
