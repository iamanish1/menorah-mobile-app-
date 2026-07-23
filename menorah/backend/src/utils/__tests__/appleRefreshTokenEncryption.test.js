const {
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
} = require('../appleRefreshTokenEncryption');

const ENCRYPTION_KEY = 'unit-test-apple-refresh-token-key-material-2026';
const TOKEN = 'long-lived-apple-refresh-token';
const CONTEXT = {
  userId: '64f000000000000000000001',
  clientId: 'com.menorah.health',
};

const mutateBase64 = (value) => {
  const first = value[0] === 'A' ? 'B' : 'A';
  return `${first}${value.slice(1)}`;
};

describe('Apple refresh-token encryption', () => {
  let originalEncryptionKey;

  beforeEach(() => {
    originalEncryptionKey = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalEncryptionKey === undefined) {
      delete process.env.DATA_ENCRYPTION_KEY;
    } else {
      process.env.DATA_ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  test('round-trips with a versioned AES-GCM envelope without exposing plaintext', () => {
    const encrypted = encryptAppleRefreshToken(TOKEN, CONTEXT);

    expect(encrypted).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(encrypted).not.toContain(TOKEN);
    expect(decryptAppleRefreshToken(encrypted, CONTEXT)).toBe(TOKEN);
    expect(encryptAppleRefreshToken(TOKEN, CONTEXT)).not.toBe(encrypted);
  });

  test.each([
    ['user', { ...CONTEXT, userId: '64f000000000000000000002' }],
    ['client', { ...CONTEXT, clientId: 'com.menorah.health.web' }],
  ])('binds the ciphertext to the %s through authenticated additional data', (
    _label,
    wrongContext
  ) => {
    const encrypted = encryptAppleRefreshToken(TOKEN, CONTEXT);

    expect(() => decryptAppleRefreshToken(encrypted, wrongContext)).toThrow();
  });

  test.each([
    ['authentication tag', 2],
    ['ciphertext', 3],
  ])('rejects a tampered %s', (_label, envelopeIndex) => {
    const envelope = encryptAppleRefreshToken(TOKEN, CONTEXT).split(':');
    envelope[envelopeIndex] = mutateBase64(envelope[envelopeIndex]);

    expect(() => decryptAppleRefreshToken(envelope.join(':'), CONTEXT)).toThrow();
  });

  test('rejects malformed envelopes and incomplete authenticated context', () => {
    expect(() => decryptAppleRefreshToken('v1:missing:parts', CONTEXT))
      .toThrow('Apple refresh-token envelope is invalid');
    expect(() => encryptAppleRefreshToken(TOKEN, {
      userId: CONTEXT.userId,
      clientId: '',
    })).toThrow('Apple refresh-token encryption context is invalid');
    expect(() => encryptAppleRefreshToken('', CONTEXT))
      .toThrow('Apple refresh token is empty');
  });

  test('fails closed when encryption key material is missing or a placeholder', () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encryptAppleRefreshToken(TOKEN, CONTEXT))
      .toThrow('Apple refresh-token encryption is not configured');

    process.env.DATA_ENCRYPTION_KEY = 'replace-with-a-real-secret-that-is-long-enough';
    expect(() => encryptAppleRefreshToken(TOKEN, CONTEXT))
      .toThrow('Apple refresh-token encryption is not configured');
  });
});
