/**
 * Create (or reset) the Menorah Health admin user.
 *
 * Run from the backend folder:
 *   node scripts/create-admin.js
 *
 * The script is idempotent — safe to run multiple times.
 * If the email already exists it upgrades the account to admin and resets the password.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/menorah';

const ADMIN_EMAIL    = 'adminmenorah@gmail.com';
const ADMIN_PASSWORD = 'admin123menorah';

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    // Update existing account — reset role, password and activate
    existing.role            = 'admin';
    existing.password        = ADMIN_PASSWORD;   // pre-save hook re-hashes it
    existing.isActive        = true;
    existing.isEmailVerified = true;
    existing.isPhoneVerified = true;
    await existing.save();

    console.log('✅  Existing account upgraded to admin.');
    console.log(`    ID    : ${existing._id}`);
    console.log(`    Email : ${existing.email}`);
    console.log(`    Role  : ${existing.role}`);
  } else {
    // Create a brand-new admin user
    const admin = new User({
      firstName        : 'Menorah',
      lastName         : 'Admin',
      email            : ADMIN_EMAIL,
      phone            : '+910000000000',   // placeholder — change if needed
      password         : ADMIN_PASSWORD,    // pre-save hook hashes it
      dateOfBirth      : new Date('1990-01-01'),
      gender           : 'prefer-not-to-say',
      role             : 'admin',
      isActive         : true,
      isEmailVerified  : true,
      isPhoneVerified  : true,
    });

    await admin.save();

    console.log('✅  Admin user created successfully.');
    console.log(`    ID    : ${admin._id}`);
    console.log(`    Email : ${admin.email}`);
    console.log(`    Role  : ${admin.role}`);
  }

  console.log('\n--- Login credentials for admin panel ---');
  console.log(`    Email    : ${ADMIN_EMAIL}`);
  console.log(`    Password : ${ADMIN_PASSWORD}`);
  console.log('-----------------------------------------\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌  Script failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
