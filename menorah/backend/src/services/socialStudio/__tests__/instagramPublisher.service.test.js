jest.mock('../../../models/SocialPost', () => ({}));
jest.mock('../../../models/InstagramAccount', () => ({}));

const { decryptToken, encryptToken } = require('../instagramPublisher.service');

describe('Instagram token encryption', () => {
  const previousKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'test-only-social-token-encryption-key';
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = previousKey;
  });

  test('round trips a token with a 128-bit GCM authentication tag', () => {
    const encrypted = encryptToken('instagram-access-token');
    const [, tag] = encrypted.split(':');

    expect(Buffer.from(tag, 'base64')).toHaveLength(16);
    expect(decryptToken(encrypted)).toBe('instagram-access-token');
  });

  test('rejects a shortened GCM authentication tag', () => {
    const [iv, tag, encrypted] = encryptToken('instagram-access-token').split(':');
    const shortenedTag = Buffer.from(tag, 'base64').subarray(0, 8).toString('base64');

    expect(() => decryptToken([iv, shortenedTag, encrypted].join(':')))
      .toThrow('Stored Instagram token is invalid');
  });
});
