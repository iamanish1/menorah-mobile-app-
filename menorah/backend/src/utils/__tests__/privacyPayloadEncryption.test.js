const {
  decryptPrivacyPayload,
  encryptPrivacyPayload,
} = require('../privacyPayloadEncryption');

describe('privacy request payload encryption', () => {
  const originalKey = process.env.DATA_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = 'unit-only-privacy-payload-encryption-key';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = originalKey;
  });

  test('uses authenticated encryption bound to the request identifier', () => {
    const payload = { description: 'Please correct a sensitive account detail.' };
    const encrypted = encryptPrivacyPayload(payload, {
      context: 'privacy-request:64f000000000000000000001',
    });

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(payload.description);
    expect(decryptPrivacyPayload(encrypted, {
      context: 'privacy-request:64f000000000000000000001',
    })).toEqual(payload);
    expect(() => decryptPrivacyPayload(encrypted, {
      context: 'privacy-request:64f000000000000000000002',
    })).toThrow(/failed authentication/);
  });

  test('fails closed without a usable key', () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encryptPrivacyPayload(
      { description: 'sensitive' },
      { context: 'privacy-request:64f000000000000000000001' }
    )).toThrow(/not configured/);
  });
});
