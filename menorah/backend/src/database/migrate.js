require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/menorah';

const migrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
});

const Migration = mongoose.model('Migration', migrationSchema);

const run = async () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found.');
    return;
  }

  await mongoose.connect(MONGO_URI);

  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.js'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await Migration.findOne({ name: file }).lean();
    if (alreadyApplied) {
      console.log(`Skipping ${file}`);
      continue;
    }

    console.log(`Applying ${file}`);
    const migration = require(path.join(migrationsDir, file));
    await migration.up({ mongoose });
    await Migration.create({ name: file });
  }

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('Migration failed:', error);
  mongoose.disconnect().finally(() => process.exit(1));
});
