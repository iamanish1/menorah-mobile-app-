/**
 * Create or reset a Menorah Health admin user.
 *
 * Required environment:
 *   ADMIN_BOOTSTRAP_EMAIL
 *   ADMIN_BOOTSTRAP_PASSWORD
 *
 * In production, also set:
 *   ADMIN_BOOTSTRAP_CONFIRM=create-admin
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/menorah';

const isStrongPassword = (password) =>
  typeof password === 'string' &&
  password.length >= 14 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

const validateEnvironment = () => {
  const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || '').toLowerCase().trim();
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');
  const phone = String(process.env.ADMIN_BOOTSTRAP_PHONE || '+910000000000').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL must be set to a valid email address');
  }

  if (!isStrongPassword(password)) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 14 chars and include upper, lower, number, and symbol');
  }

  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_BOOTSTRAP_CONFIRM !== 'create-admin') {
    throw new Error('Refusing production admin bootstrap without ADMIN_BOOTSTRAP_CONFIRM=create-admin');
  }

  return { email, password, phone };
};

async function main() {
  const { email, password, phone } = validateEnvironment();

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const existing = await User.findOne({ email }).select('+password');

  if (existing) {
    existing.role = 'admin';
    existing.password = password;
    existing.isActive = true;
    existing.isEmailVerified = true;
    existing.isPhoneVerified = true;
    existing.sessionVersion = (existing.sessionVersion || 0) + 1;
    await existing.save();

    console.log('Existing account upgraded to admin.');
    console.log(`ID: ${existing._id}`);
    console.log(`Email: ${existing.email}`);
    console.log(`Role: ${existing.role}`);
  } else {
    const admin = new User({
      firstName: process.env.ADMIN_BOOTSTRAP_FIRST_NAME || 'Menorah',
      lastName: process.env.ADMIN_BOOTSTRAP_LAST_NAME || 'Admin',
      email,
      phone,
      password,
      dateOfBirth: new Date(process.env.ADMIN_BOOTSTRAP_DOB || '1990-01-01'),
      gender: 'prefer-not-to-say',
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    await admin.save();

    console.log('Admin user created successfully.');
    console.log(`ID: ${admin._id}`);
    console.log(`Email: ${admin.email}`);
    console.log(`Role: ${admin.role}`);
  }

  console.log('Admin password was not printed. Store it only in your secret manager.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  mongoose.disconnect().finally(() => process.exit(1));
});
