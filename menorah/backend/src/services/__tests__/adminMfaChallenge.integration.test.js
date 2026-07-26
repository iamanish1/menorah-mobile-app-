const crypto = require('crypto');
const { createClient } = require('redis');
const {
  ADMIN_MFA_TTL_SECONDS,
  adminMfaKey,
  createAdminMfaChallengeRecord,
  consumeAdminMfaChallenge,
} = require('../adminMfaChallenge');

const redisTestUrl = process.env.ADMIN_MFA_REDIS_TEST_URL;
const describeWithRedis = redisTestUrl ? describe : describe.skip;

describeWithRedis('admin MFA challenge Redis atomicity', () => {
  let redis;
  const challengeIds = new Set();

  const createChallenge = async ({ otp = '482913' } = {}) => {
    const challengeId = crypto.randomUUID();
    challengeIds.add(challengeId);
    await createAdminMfaChallengeRecord({
      redis,
      challengeId,
      userId: '64f000000000000000000031',
      otp,
    });
    return { challengeId, otp };
  };

  beforeAll(async () => {
    redis = createClient({ url: redisTestUrl });
    redis.on('error', () => {});
    await redis.connect();
  });

  afterEach(async () => {
    if (!challengeIds.size) return;
    await redis.del([...challengeIds].map(adminMfaKey));
    challengeIds.clear();
  });

  afterAll(async () => {
    if (redis?.isOpen) await redis.quit();
  });

  test('parallel wrong attempts are each counted and retain a bounded TTL before exhaustion', async () => {
    const { challengeId } = await createChallenge();

    const firstWave = await Promise.all(
      Array.from({ length: 4 }, () =>
        consumeAdminMfaChallenge({
          redis,
          challengeId,
          otp: '000000',
        })
      )
    );

    expect(firstWave).toEqual([null, null, null, null]);

    const stored = JSON.parse(await redis.get(adminMfaKey(challengeId)));
    const remainingTtl = await redis.ttl(adminMfaKey(challengeId));
    expect(stored.attempts).toBe(4);
    expect(remainingTtl).toBeGreaterThan(0);
    expect(remainingTtl).toBeLessThanOrEqual(ADMIN_MFA_TTL_SECONDS);

    const flood = await Promise.all(
      Array.from({ length: 30 }, () =>
        consumeAdminMfaChallenge({
          redis,
          challengeId,
          otp: '000000',
        })
      )
    );

    expect(flood.every((result) => result === null)).toBe(true);
    expect(await redis.exists(adminMfaKey(challengeId))).toBe(0);
  });

  test('simultaneous correct attempts consume the challenge exactly once', async () => {
    const { challengeId, otp } = await createChallenge();

    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        consumeAdminMfaChallenge({
          redis,
          challengeId,
          otp,
        })
      )
    );

    expect(results.filter(Boolean)).toEqual([
      { userId: '64f000000000000000000031' },
    ]);
    expect(await redis.exists(adminMfaKey(challengeId))).toBe(0);
  });
});
