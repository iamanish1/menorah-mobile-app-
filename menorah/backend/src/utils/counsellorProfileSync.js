const { getRedisClient } = require('../config/redis');

/**
 * Clear every cached version of the public counsellor directory.
 *
 * Counsellor identity lives on the linked User record while professional
 * fields live on Counsellor. Both feed the same public cards, so any profile
 * save must invalidate this shared read model.
 */
const invalidateCounsellorDiscoveryCache = async () => {
  try {
    const redis = getRedisClient();
    const keys = [];
    let cursor = '0';

    do {
      const result = await redis.scan(cursor, { MATCH: 'counsellors:*', COUNT: 100 });
      const nextCursor = Array.isArray(result) ? result[0] : result.cursor;
      const foundKeys = Array.isArray(result) ? result[1] : result.keys;
      cursor = String(nextCursor);
      keys.push(...(foundKeys || []));
    } while (cursor !== '0');

    if (keys.length > 0) await redis.del(keys);
  } catch (error) {
    // A cache outage must never make a counsellor unable to save their
    // profile. The next directory request will read from MongoDB instead.
    console.warn('Counsellor discovery cache invalidation failed:', error.message);
  }
};

/**
 * Tell connected user clients to refetch read models that include counsellor
 * identity or professional details. The payload deliberately contains no
 * personal data; clients reload the authorised/public API response.
 */
const notifyCounsellorProfileUpdated = (io) => {
  if (io && typeof io.emit === 'function') {
    io.emit('counsellor_profile_updated');
  }
};

module.exports = {
  invalidateCounsellorDiscoveryCache,
  notifyCounsellorProfileUpdated,
};
