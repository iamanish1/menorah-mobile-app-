const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../config/database');
const User = require('../models/User');

dotenv.config();

const localEnvPath = path.resolve(process.cwd(), '../deploy/env/home.env');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: false });
}

const QA_PASSWORD = 'TestPass123!';

const requiredUsers = [
  {
    email: 'qa.user+local@menorah.test',
    phone: '+15550001001',
    role: 'user',
    firstName: 'QA',
    lastName: 'User',
    gender: 'prefer-not-to-say',
  },
  {
    email: 'qa.counsellor+local@menorah.test',
    phone: '+15550001002',
    role: 'counsellor',
    firstName: 'QA',
    lastName: 'Counsellor',
    gender: 'prefer-not-to-say',
  },
  {
    email: 'qa.admin+local@menorah.test',
    phone: '+15550001003',
    role: 'admin',
    firstName: 'QA',
    lastName: 'Admin',
    gender: 'prefer-not-to-say',
  },
];

const assertSeedAllowed = () => {
  const qaSeedEnabled = process.env.QA_SEED_ENABLED === 'true';
  const nodeEnv = process.env.NODE_ENV;
  const allowLocal = process.env.ALLOW_LOCAL_QA_SEED === 'true';
  const safeEnvironment = ['development', 'test'].includes(nodeEnv) || allowLocal;

  if (!qaSeedEnabled) {
    throw new Error('Refusing to seed QA users: QA_SEED_ENABLED must be true.');
  }

  if (!safeEnvironment) {
    throw new Error('Refusing to seed QA users: NODE_ENV must be development/test or ALLOW_LOCAL_QA_SEED must be true.');
  }

  if (nodeEnv === 'production' && !allowLocal) {
    throw new Error('Refusing to seed QA users in production without ALLOW_LOCAL_QA_SEED=true.');
  }
};

const upsertQaUser = async (spec) => {
  const existing = await User.findOne({ email: spec.email });
  const base = {
    ...spec,
    password: QA_PASSWORD,
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    isEmailVerified: true,
    isPhoneVerified: true,
    isActive: true,
    kyc: { status: 'verified', provider: 'local-qa' },
  };

  if (existing) {
    existing.set(base);
    await existing.save();
    console.log(`Updated local QA ${spec.role}: ${spec.email}`);
    return;
  }

  await User.create(base);
  console.log(`Created local QA ${spec.role}: ${spec.email}`);
};

const run = async () => {
  assertSeedAllowed();
  await connectDB();

  for (const user of requiredUsers) {
    await upsertQaUser(user);
  }

  await mongoose.disconnect();
  console.log('Local QA user seed complete.');
};

if (require.main === module) {
  run().catch(async (error) => {
    console.error(error.message);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}

module.exports = { run, assertSeedAllowed };
