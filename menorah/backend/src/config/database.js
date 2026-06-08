const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize:               20,   // tune based on Atlas tier (M10 = 500 connections max)
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:          45000,
    });

    // Omit hostname from log — avoid leaking Atlas cluster address to log aggregators
    console.log('📦 MongoDB connected');

    mongoose.connection.on('error',        (err) => console.error('MongoDB error:', err));
    mongoose.connection.on('disconnected', ()    => console.log('MongoDB disconnected'));

  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// SIGINT handler is registered once in server.js alongside the SIGTERM handler.
// Defining it here caused duplicate listeners whenever connectDB() was called more
// than once (e.g. in tests), triggering MaxListenersExceededWarning.

module.exports = connectDB;
