const mockGetRedisClient = jest.fn();

jest.mock('../../config/redis', () => ({
  getRedisClient: (...args) => mockGetRedisClient(...args),
}));

const {
  COUNSELLOR_DISCOVERY_CACHE_PATTERNS,
  invalidateCounsellorDiscoveryCache,
} = require('../counsellorDiscoveryCache');

describe('counsellor discovery cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('scans current and legacy namespaces and deletes every distinct key', async () => {
    const redis = {
      scan: jest.fn()
        .mockResolvedValueOnce({
          cursor: 4,
          keys: ['counsellors:v5:specializations', 'counsellors:v5:languages'],
        })
        .mockResolvedValueOnce({
          cursor: 0,
          keys: ['counsellors:v5:specializations'],
        })
        .mockResolvedValueOnce({
          cursor: 0,
          keys: ['counsellors:list:legacy'],
        }),
      del: jest.fn().mockResolvedValue(5),
    };
    mockGetRedisClient.mockReturnValue(redis);

    await expect(invalidateCounsellorDiscoveryCache()).resolves.toBe(true);

    expect(COUNSELLOR_DISCOVERY_CACHE_PATTERNS).toEqual([
      'counsellors:v5:*',
      'counsellors:list:*',
    ]);
    expect(redis.scan).toHaveBeenNthCalledWith(1, '0', {
      MATCH: 'counsellors:v5:*',
      COUNT: 100,
    });
    expect(redis.scan).toHaveBeenNthCalledWith(2, '0', {
      MATCH: 'counsellors:list:*',
      COUNT: 100,
    });
    expect(redis.scan).toHaveBeenNthCalledWith(3, '4', {
      MATCH: 'counsellors:v5:*',
      COUNT: 100,
    });
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del.mock.calls[0][0].sort()).toEqual([
      'counsellors:languages',
      'counsellors:list:legacy',
      'counsellors:specializations',
      'counsellors:v5:languages',
      'counsellors:v5:specializations',
    ]);
  });

  test('fails safely when Redis is unavailable', async () => {
    mockGetRedisClient.mockImplementation(() => {
      throw new Error('redis unavailable');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(invalidateCounsellorDiscoveryCache()).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      'Counsellor discovery cache invalidation failed:',
      'redis unavailable'
    );

    console.warn.mockRestore();
  });
});
