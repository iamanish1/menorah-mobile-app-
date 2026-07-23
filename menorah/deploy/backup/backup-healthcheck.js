const fs = require('fs');
const path = require('path');

const backupRoot = process.env.BACKUP_ROOT || '/backups';
const maxAgeHours = Number(process.env.BACKUP_MAX_AGE_HOURS || 24);
const minSizeBytes = Number(process.env.BACKUP_MIN_SIZE_BYTES || 1024);
const mongoRoot = path.join(backupRoot, 'mongo');

if (!fs.existsSync(mongoRoot)) {
  console.error(`Backup directory not found: ${mongoRoot}`);
  process.exit(1);
}

const candidates = fs.readdirSync(mongoRoot)
  .map((name) => path.join(mongoRoot, name))
  .filter((filePath) => fs.statSync(filePath).isDirectory())
  .sort()
  .reverse();

if (candidates.length === 0) {
  console.error('No MongoDB backup directories found');
  process.exit(1);
}

const latest = candidates[0];
const archives = fs.readdirSync(latest)
  .filter((name) => name.endsWith('.archive.gz') || name.endsWith('.archive.gz.enc'))
  .map((name) => path.join(latest, name));

if (archives.length === 0) {
  console.error(`No backup archive found in ${latest}`);
  process.exit(1);
}

const archive = archives[0];
const stat = fs.statSync(archive);
const ageHours = (Date.now() - stat.mtimeMs) / 36e5;

const result = {
  latestBackup: archive,
  sizeBytes: stat.size,
  ageHours: Number(ageHours.toFixed(2)),
  healthy: stat.size >= minSizeBytes && ageHours <= maxAgeHours
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.healthy ? 0 : 1);
