const { getRedisClient } = require('../config/redis');

const COUNSELLOR_DISCOVERY_CACHE_PATTERNS = Object.freeze([
  'counsellors:v5:*',
  'counsellors:list:*',
]);

const scanKeys = async (redis, pattern) => {
  const keys = [];
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = String(Array.isArray(result) ? result[0] : result.cursor);
    keys.push(...((Array.isArray(result) ? result[1] : result.keys) || []));
  } while (cursor !== '0');
  return keys;
};

const invalidateCounsellorDiscoveryCache = async () => {
  try {
    const redis = getRedisClient();
    const scanned = await Promise.all(
      COUNSELLOR_DISCOVERY_CACHE_PATTERNS.map((pattern) => scanKeys(redis, pattern))
    );
    const keys = [...new Set([
      'counsellors:specializations',
      'counsellors:languages',
      ...scanned.flat(),
    ])];
    if (keys.length > 0) await redis.del(keys);
    return true;
  } catch (error) {
    console.warn('Counsellor discovery cache invalidation failed:', error.message);
    return false;
  }
};

module.exports = {
  COUNSELLOR_DISCOVERY_CACHE_PATTERNS,
  invalidateCounsellorDiscoveryCache,
  _private: { scanKeys },
};
