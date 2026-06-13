const mongoose = require('mongoose');
const { getRedisClient, getPubClient, getSubClient } = require('../../config/redis');

let registered = false;

const closeRedis = async () => {
  const clients = [];

  try {
    clients.push(getRedisClient());
  } catch {
    // Redis was not initialised.
  }

  try {
    clients.push(getPubClient());
  } catch {
    // Pub client is optional.
  }

  try {
    clients.push(getSubClient());
  } catch {
    // Sub client is optional.
  }

  await Promise.allSettled(clients.filter(Boolean).map((client) => client.quit()));
};

const registerGracefulShutdown = ({ server, serviceName }) => {
  if (registered) return;
  registered = true;

  const shutdown = async (signal) => {
    console.log(`${signal} received - shutting down ${serviceName} gracefully`);

    const forceExit = setTimeout(() => {
      console.error('Forced exit after shutdown timeout');
      process.exit(1);
    }, 10_000);

    server.close(async () => {
      try {
        await mongoose.connection.close();
      } catch {
        // Ignore close errors during shutdown.
      }

      await closeRedis();
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

module.exports = {
  registerGracefulShutdown,
  closeRedis
};
