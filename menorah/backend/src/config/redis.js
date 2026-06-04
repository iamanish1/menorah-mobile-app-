const { createClient } = require('redis');

let redisClient = null;
let pubClient = null;
let subClient = null;

/**
 * Connect Redis clients.
 * @param {object} opts
 * @param {boolean} [opts.withPubSub=true]
 *   Pass false on Cloud Run (ENABLE_SOCKET_ADAPTER=false) to skip creating
 *   the pub/sub pair — saves 2 idle connections against Upstash quota.
 */
const connectRedis = async ({ withPubSub = true } = {}) => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  const makeClient = () =>
    createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 20) {
            console.error('Redis: too many reconnect attempts, giving up');
            return new Error('Redis max retries reached');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

  redisClient = makeClient();
  redisClient.on('error',        (err) => console.error('Redis client error:', err.message));
  redisClient.on('connect',      ()    => console.log('✅ Redis connected'));
  redisClient.on('reconnecting', ()    => console.log('🔄 Redis reconnecting...'));

  const connectPromises = [redisClient.connect()];

  if (withPubSub) {
    pubClient = makeClient();
    subClient = makeClient();
    pubClient.on('error', (err) => console.error('Redis pub error:', err.message));
    subClient.on('error', (err) => console.error('Redis sub error:', err.message));
    connectPromises.push(pubClient.connect(), subClient.connect());
  }

  await Promise.all(connectPromises);
  return { redisClient, pubClient, subClient };
};

const getRedisClient = () => {
  if (!redisClient) throw new Error('Redis not initialised — call connectRedis() first');
  return redisClient;
};

const getPubClient = () => {
  if (!pubClient) throw new Error('Redis pub client not initialised');
  return pubClient;
};

const getSubClient = () => {
  if (!subClient) throw new Error('Redis sub client not initialised');
  return subClient;
};

module.exports = { connectRedis, getRedisClient, getPubClient, getSubClient };
