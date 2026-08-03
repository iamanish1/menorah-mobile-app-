require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/menorah';
const MIGRATION_CONNECTION_OPTIONS = Object.freeze({
  // Migration modules own every schema change and index preflight explicitly.
  autoIndex: false,
  autoCreate: false,
});

const migrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
});

const Migration = mongoose.model('Migration', migrationSchema);

const MIGRATION_FILE_PATTERN = /^\d{8}-[a-z0-9-]+\.js$/;

const parseExpectedPendingMigrations = (rawValue) => {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') return null;

  const names = rawValue.split(',').map((value) => value.trim());
  if (
    names.length === 0
    || names.some((name) => !MIGRATION_FILE_PATTERN.test(name))
    || new Set(names).size !== names.length
  ) {
    throw new Error('MENORAH_EXPECTED_PENDING_MIGRATIONS must be a unique comma-separated migration filename list');
  }

  return [...names].sort();
};

const requireExpectedPendingMigrations = (rawValue) => {
  const expected = parseExpectedPendingMigrations(rawValue);
  if (expected === null) {
    throw new Error(
      'MENORAH_EXPECTED_PENDING_MIGRATIONS is required for production migration execution'
    );
  }
  return expected;
};

const resolvePendingMigrationPlan = (env = process.env) => {
  const rawExpected = env.MENORAH_EXPECTED_PENDING_MIGRATIONS;
  const productionPlanRequired = env.DEPLOYMENT_ENVIRONMENT === 'production';

  return {
    rawExpected,
    productionPlanRequired,
    expected: productionPlanRequired
      ? requireExpectedPendingMigrations(rawExpected)
      : parseExpectedPendingMigrations(rawExpected),
  };
};

const assertMigrationsDirectoryAvailable = ({ exists, expected }) => {
  if (exists) return;
  if (expected !== null) {
    throw new Error(
      'The migrations directory is missing while an exact pending migration plan is required'
    );
  }
};

const assertExpectedPendingMigrations = (pendingFiles, rawExpected, { required = false } = {}) => {
  const expected = parseExpectedPendingMigrations(rawExpected);
  if (expected === null) {
    if (required) requireExpectedPendingMigrations(rawExpected);
    return;
  }

  const actual = [...pendingFiles].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Pending migration plan mismatch. Expected [${expected.join(', ')}], found [${actual.join(', ')}]. No migration was run.`
    );
  }
};

const run = async () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  const {
    rawExpected,
    productionPlanRequired,
    expected,
  } = resolvePendingMigrationPlan();
  const migrationsDirectoryExists = fs.existsSync(migrationsDir);
  assertMigrationsDirectoryAvailable({
    exists: migrationsDirectoryExists,
    expected,
  });
  if (!migrationsDirectoryExists) {
    console.log('No migrations directory found.');
    return;
  }

  await mongoose.connect(MONGO_URI, MIGRATION_CONNECTION_OPTIONS);

  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.js'))
    .sort();

  const appliedMigrations = await Migration.find({}, { name: 1, _id: 0 }).lean();
  const appliedNames = new Set(appliedMigrations.map(({ name }) => name));
  const pendingFiles = files.filter((file) => !appliedNames.has(file));

  // The production updater supplies an exact release-specific plan. Compare
  // the full ledger before the first schema write so an unexpected historical
  // or newly added migration fails closed rather than broadening the change.
  assertExpectedPendingMigrations(
    pendingFiles,
    rawExpected,
    { required: productionPlanRequired }
  );

  if (process.env.MENORAH_MIGRATION_PLAN_ONLY === 'true') {
    console.log(`Migration plan verified (${pendingFiles.length} pending). No migration was run.`);
    await mongoose.disconnect();
    return;
  }

  // The migration ledger is the sole runner-owned index. Create/verify it only
  // after the complete release-specific pending plan has passed read-only
  // validation. Application indexes remain owned by named migrations.
  await mongoose.connection.collection('migrations').createIndex(
    { name: 1 },
    { unique: true, name: 'migration_name_unique' }
  );

  for (const file of pendingFiles) {
    console.log(`Applying ${file}`);
    const migration = require(path.join(migrationsDir, file));
    await migration.up({ mongoose });
    await Migration.create({ name: file });
  }

  await mongoose.disconnect();
};

if (require.main === module) {
  run().catch((error) => {
    console.error('Migration failed:', error);
    mongoose.disconnect().finally(() => process.exit(1));
  });
}

module.exports = {
  MIGRATION_CONNECTION_OPTIONS,
  assertMigrationsDirectoryAvailable,
  assertExpectedPendingMigrations,
  parseExpectedPendingMigrations,
  requireExpectedPendingMigrations,
  resolvePendingMigrationPlan,
  run,
};
