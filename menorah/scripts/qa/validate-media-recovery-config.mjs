#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const menorahRoot = path.resolve(scriptDir, '../..');
const read = (relative) => fs.readFileSync(path.join(menorahRoot, relative), 'utf8');

const compose = YAML.parse(read('deploy/docker-compose.production.yml'));
const backendEnv = compose['x-backend-env'];
assert.equal(backendEnv.MEDIA_STORAGE_BACKEND, '${MEDIA_STORAGE_BACKEND:-local}');
assert.equal(backendEnv.UPLOAD_PATH, '/app/uploads');
assert.equal(
  backendEnv.MEDIA_PUBLIC_BASE_URL,
  '${MEDIA_PUBLIC_BASE_URL:?MEDIA_PUBLIC_BASE_URL is required}'
);

const writerServices = ['api-ios', 'api-android', 'api-web', 'api-admin', 'worker'];
const uploadSources = new Set();
for (const serviceName of writerServices) {
  const service = compose.services[serviceName];
  const uploadMount = service.volumes.find((entry) => (
    typeof entry === 'string' && entry.endsWith(':/app/uploads')
  ));
  assert.ok(uploadMount, `${serviceName} must mount the shared upload root`);
  uploadSources.add(uploadMount.slice(0, -':/app/uploads'.length));
}
assert.equal(uploadSources.size, 1, 'every writer must mount the same upload source');

const verifier = compose.services['media-verifier'];
const verifierSecurity = { ...(verifier['<<'] || {}), ...verifier };
assert.ok(verifier.profiles.includes('backup-job'));
assert.ok(verifier.profiles.includes('restore-test'));
assert.ok(verifier.profiles.includes('production-restore'));
assert.equal(verifierSecurity.read_only, true);
assert.deepEqual(verifierSecurity.cap_drop, ['ALL']);
assert.ok(verifier.networks.includes('db_net'));
assert.ok(verifier.networks.includes('restore_test_net'));
assert.ok(
  verifier.volumes.some((entry) => (
    typeof entry === 'string' && entry.endsWith(':/media-data:ro')
  ))
);
assert.ok(
  verifier.volumes.some((entry) => (
    typeof entry === 'string' && entry.endsWith(':/backups:ro')
  ))
);

const startupValidation = read('backend/src/shared/app/startupValidation.js');
assert.match(startupValidation, /validateMediaStorageConfig/);
assert.match(startupValidation, /COUNSELLOR_MEDIA_STORAGE must be unset/);
assert.match(startupValidation, /SOCIAL_STUDIO_STORAGE must be unset/);

const storage = read('backend/src/services/mediaStorage.js');
assert.match(storage, /crypto\.randomUUID\(\)/);
assert.match(storage, /await handle\.sync\(\)/);
assert.match(storage, /await fs\.link\(temporary, target\)/);
assert.doesNotMatch(storage, /await fs\.rename\(temporary, target\)/);
assert.match(storage, /overwrite: false/);
assert.doesNotMatch(storage, /overwrite: true/);

for (const relative of [
  'backend/src/routes/counsellor-bookings.js',
  'backend/src/routes/socialStudio.js',
  'backend/src/routes/users.js',
  'backend/src/services/socialStudio/postRenderer.service.js',
  'backend/src/services/articleImageService.js',
]) {
  const source = read(relative);
  assert.match(source, /storeMediaBuffer/);
  assert.doesNotMatch(source, /deleteResource/);
  assert.doesNotMatch(source, /http:\/\/localhost[^'"]*\/uploads/);
  assert.doesNotMatch(source, /overwrite:\s*true/);
}

const backup = read('deploy/ubuntu/backup-now.sh');
for (const required of [
  'MEDIA_STORAGE_BACKEND=local',
  'uploads-manifest.json',
  'media-reference-verification.json',
  'cp -R --reflink=auto',
  '--require-local-managed',
  'immutable-write-before-reference',
]) {
  assert.ok(backup.includes(required), `backup contract is missing ${required}`);
}
assert.doesNotMatch(backup, /skipping uploads archive/i);

const restore = read('deploy/ubuntu/restore-latest-backup.sh');
for (const required of [
  'prepare_staged_media',
  'verify_staged_media_references',
  'publish_staged_media',
  'media-restore-rollback',
  'mediaReferencesVerified',
]) {
  assert.ok(restore.includes(required), `restore contract is missing ${required}`);
}

process.stdout.write('Media storage, backup, and restore configuration validates.\n');
