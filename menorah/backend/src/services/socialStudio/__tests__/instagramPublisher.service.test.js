const mockAxiosPost = jest.fn();
const mockAxiosGet = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockFindById = jest.fn();
const mockInstagramFindOne = jest.fn();

jest.mock('axios', () => ({
  post: (...args) => mockAxiosPost(...args),
  get: (...args) => mockAxiosGet(...args)
}));

jest.mock('../../../models/SocialPost', () => ({
  findOneAndUpdate: (...args) => mockFindOneAndUpdate(...args),
  findById: (...args) => mockFindById(...args)
}));

jest.mock('../../../models/InstagramAccount', () => ({
  findOne: (...args) => mockInstagramFindOne(...args)
}));

const {
  createMediaContainer,
  decryptToken,
  encryptToken,
  publishApprovedPost,
  waitForReelContainer
} = require('../instagramPublisher.service');

describe('Instagram token encryption', () => {
  const previousKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'test-only-social-token-encryption-key';
  });

  beforeEach(() => {
    mockAxiosPost.mockReset();
    mockAxiosGet.mockReset();
    mockFindOneAndUpdate.mockReset();
    mockFindById.mockReset();
    mockInstagramFindOne.mockReset();
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

  test('creates an official Meta Reel media container with a public video URL', async () => {
    mockAxiosPost.mockResolvedValue({ data: { id: 'reel-container-1' } });

    const result = await createMediaContainer({
      igUserId: 'ig-user-1',
      accessToken: 'never-log-this-token',
      videoUrl: 'https://res.cloudinary.com/menorah/video/upload/reel.mp4',
      caption: 'A practical reminder',
      postType: 'reel'
    });

    expect(result).toBe('reel-container-1');
    const [, params] = mockAxiosPost.mock.calls[0];
    expect(params).toBeInstanceOf(URLSearchParams);
    expect(params.get('media_type')).toBe('REELS');
    expect(params.get('video_url')).toBe('https://res.cloudinary.com/menorah/video/upload/reel.mp4');
    expect(params.get('share_to_feed')).toBe('true');
    expect(params.get('image_url')).toBeNull();
  });

  test('waits for Meta to finish processing a Reel before publishing', async () => {
    mockAxiosGet
      .mockResolvedValueOnce({ data: { status_code: 'IN_PROGRESS' } })
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });

    await expect(waitForReelContainer({
      creationId: 'reel-container-1',
      accessToken: 'never-log-this-token',
      attempts: 2,
      intervalMs: 0
    })).resolves.toEqual({ status_code: 'FINISHED' });

    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    expect(mockAxiosGet.mock.calls[0][1].params.fields).toBe('status_code,status');
  });

  test('stops before publish when Meta reports a Reel processing error', async () => {
    mockAxiosGet.mockResolvedValue({ data: { status_code: 'ERROR', error_message: 'Unsupported video codec' } });

    await expect(waitForReelContainer({
      creationId: 'reel-container-1',
      accessToken: 'never-log-this-token',
      attempts: 1,
      intervalMs: 0
    })).rejects.toThrow('Unsupported video codec');
  });

  test('does not issue a Graph request when another worker has already claimed publishing', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);
    mockFindById.mockResolvedValue({ status: 'publishing' });

    await expect(publishApprovedPost('64f000000000000000000099'))
      .rejects.toThrow('Social post is already being published');

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $in: ['approved', 'scheduled'] } }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'publishing' }),
        $inc: { publishAttemptCount: 1 }
      }),
      { new: true }
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });
});
