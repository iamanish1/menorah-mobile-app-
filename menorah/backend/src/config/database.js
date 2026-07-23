const mongoose = require('mongoose');

const parseBooleanEnv = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const parseIntegerEnv = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasQueryParam = (uri, key) => {
  try {
    const parsed = new URL(uri);
    return parsed.searchParams.has(key);
  } catch {
    return new RegExp(`[?&]${key}=`).test(uri);
  }
};

const buildMongooseOptions = (uri = process.env.MONGODB_URI) => {
  const options = {
    // Production indexes are created and verified only by named migrations.
    // Model initialization must never mutate the production schema implicitly.
    autoIndex: process.env.NODE_ENV !== 'production',
    autoCreate: process.env.NODE_ENV !== 'production',
    maxPoolSize: parseIntegerEnv(process.env.MONGODB_MAX_POOL_SIZE, 20),
    serverSelectionTimeoutMS: parseIntegerEnv(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 5000),
    socketTimeoutMS: parseIntegerEnv(process.env.MONGODB_SOCKET_TIMEOUT_MS, 45000),
    retryWrites: parseBooleanEnv(process.env.MONGODB_RETRY_WRITES, true)
  };

  if (process.env.MONGODB_REPLICA_SET_NAME && uri && !hasQueryParam(uri, 'replicaSet')) {
    options.replicaSet = process.env.MONGODB_REPLICA_SET_NAME;
  }

  if (process.env.MONGODB_READ_PREFERENCE && uri && !hasQueryParam(uri, 'readPreference')) {
    options.readPreference = process.env.MONGODB_READ_PREFERENCE;
  }

  return options;
};

const connectDB = async ({ exitOnFailure = true } = {}) => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI, buildMongooseOptions());

    console.log('MongoDB connected');

    mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
    mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    if (exitOnFailure) {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
module.exports.buildMongooseOptions = buildMongooseOptions;
module.exports.parseBooleanEnv = parseBooleanEnv;
