#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EPOCH_TOOL="${REPO_ROOT}/deploy/ubuntu/backup-integrity-epoch.js"
HEALTH="${REPO_ROOT}/deploy/ubuntu/check-backup-health.sh"
TMP_ROOT="$(mktemp -d)"
TEST_HMAC_KEY="backup-lifecycle-test-hmac-key-0000000000000001"
TEST_EPOCH_ID="lifecycle-initial-epoch"

cleanup() { rm -rf -- "${TMP_ROOT}"; }
trap cleanup EXIT

fail() { echo "backup lifecycle test failed: $*" >&2; exit 1; }

write_fixture_files() {
  local root="$1" age_hours="${2:-0}"
  FIXTURE_ROOT="${root}" FIXTURE_AGE_HOURS="${age_hours}" FIXTURE_EPOCH_ID="${TEST_EPOCH_ID}" node - <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = fs.realpathSync(process.env.FIXTURE_ROOT);
const epochId = process.env.FIXTURE_EPOCH_ID;
const ageHours = Number(process.env.FIXTURE_AGE_HOURS);
const releaseSha = 'a'.repeat(40);
const now = new Date(Date.now() - ageHours * 60 * 60 * 1000);
now.setUTCMilliseconds(0);
function compact(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function iso(date) { return date.toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function json(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
function checksum(file) { fs.writeFileSync(`${file}.sha256`, `${sha(file)}  ${path.basename(file)}\n`, { mode: 0o600 }); }
function source(cadence, date) {
  const timestamp = compact(date);
  const set = path.join(root, cadence, timestamp);
  const mongo = path.join(set, 'mongo', `menorah-mongo-${timestamp}.archive.gz.enc`);
  const uploads = path.join(set, 'uploads', `uploads-${timestamp}.tar.gz.enc`);
  fs.mkdirSync(path.dirname(mongo), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(uploads), { recursive: true, mode: 0o700 });
  fs.writeFileSync(mongo, Buffer.from(`${cadence}-mongo-`.repeat(300)), { mode: 0o600 }); checksum(mongo);
  fs.writeFileSync(uploads, Buffer.from(`${cadence}-uploads-`.repeat(300)), { mode: 0o600 }); checksum(uploads);
  const manifest = path.join(set, 'metadata', 'uploads-manifest.json');
  const entries = []; const entriesSha256 = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  json(manifest, { schemaVersion: 1, artifactType: 'menorah-immutable-media-manifest', rootName: 'uploads', createdAt: iso(date), fileCount: 0, totalBytes: 0, entriesSha256, entries }); checksum(manifest);
  const report = path.join(set, 'metadata', 'media-reference-verification.json');
  json(report, { schemaVersion: 1, verificationType: 'menorah-media-database-references', valid: true, referenceCount: 0, localReferenceCount: 0, cloudinaryReferenceCount: 0, externalReferenceCount: 0, externalOrigins: [], referenceDigest: crypto.createHash('sha256').update('[]').digest('hex'), manifestEntriesSha256: entriesSha256, manifestFileCount: 0, manifestTotalBytes: 0, violations: [] }); checksum(report);
  const metadata = path.join(set, 'metadata', 'metadata.json');
  json(metadata, { schemaVersion: 3, artifactType: 'mongodb-full-instance-oplog', scope: 'full-instance', timestamp, backupType: cadence, checkoutGitSha: releaseSha, deployedReleaseSha: releaseSha, migrationAppliedSha: releaseSha, mongoArchive: mongo, mongoArchiveSha256: sha(mongo), uploadsArchive: uploads, uploadsArchiveSha256: sha(uploads), uploadsManifest: manifest, uploadsManifestSha256: sha(manifest), mediaReferenceVerification: report, mediaReferenceVerificationSha256: sha(report), mediaStorageBackend: 'local', mediaConsistencyContract: 'immutable-write-before-reference', uploadsRequired: true, backupRoot: root, encrypted: true, oplog: true, containsSystemIdentityData: true, directProductionRestoreAllowed: false, requiredSanitizationNamespace: 'menorah.*', databaseToolsVersion: '100.17.0', mongoServerVersion: '7.0.28', mongoFeatureCompatibilityVersion: '7.0' });
  return { timestamp, set, mongo, uploads, manifest, report, metadata };
}
const daily = source('daily', now);
const weekly = source('weekly', now);
const sanitized = path.join(root, 'restore-tests', 'sanitized', `${sha(daily.mongo)}.menorah.archive.gz.enc`);
fs.mkdirSync(path.dirname(sanitized), { recursive: true, mode: 0o700 });
fs.writeFileSync(sanitized, Buffer.from('sanitized-'.repeat(300)), { mode: 0o600 }); checksum(sanitized);
const sanitizedMetadata = `${sanitized}.metadata.json`;
json(sanitizedMetadata, { schemaVersion: 1, artifactType: 'menorah-sanitized-restore', createdAt: iso(now), namespaceAllowlist: ['menorah.*'], sourceArtifactType: 'mongodb-full-instance-oplog', sourceArchive: daily.mongo, sourceArchiveSha256: sha(daily.mongo), sourceBackupGitSha: releaseSha, derivedArchive: sanitized, derivedArchiveSha256: sha(sanitized), encrypted: true, oplogReplayVerified: true, productionOplogReplayAllowed: false, databaseToolsVersion: '100.17.0', mongoServerVersion: '7.0.28', mongoFeatureCompatibilityVersion: '7.0' });
function backupEvidence(sourceValue) { return { schemaVersion: 1, recordType: 'menorah-backup-evidence', epochId, timestamp: sourceValue.timestamp, createdAt: iso(now), backupType: path.basename(path.dirname(sourceValue.set)), backupSet: sourceValue.set, metadataFile: sourceValue.metadata, metadataSha256: sha(sourceValue.metadata), mongoArchive: sourceValue.mongo, mongoArchiveSha256: sha(sourceValue.mongo), mongoArchiveSize: fs.statSync(sourceValue.mongo).size, uploadsArchive: sourceValue.uploads, uploadsArchiveSha256: sha(sourceValue.uploads), uploadsArchiveSize: fs.statSync(sourceValue.uploads).size, uploadsManifest: sourceValue.manifest, uploadsManifestSha256: sha(sourceValue.manifest), mediaReferenceVerification: sourceValue.report, mediaReferenceVerificationSha256: sha(sourceValue.report), encrypted: true, evidenceFormatVersion: 1 }; }
json(path.join(root, 'daily-evidence.json'), backupEvidence(daily));
json(path.join(root, 'weekly-evidence.json'), backupEvidence(weekly));
json(path.join(root, 'restore-evidence.json'), { schemaVersion: 1, recordType: 'menorah-backup-restore-evidence', epochId, timestamp: iso(now), sourceArchive: daily.mongo, sourceArchiveSha256: sha(daily.mongo), sanitizedArchive: sanitized, sanitizedArchiveSha256: sha(sanitized), sanitizedMetadataFile: sanitizedMetadata, sanitizedMetadataSha256: sha(sanitizedMetadata), sanitizedNamespace: 'menorah.*', uploadsArchive: daily.uploads, uploadsArchiveSha256: sha(daily.uploads), mediaManifest: daily.manifest, mediaManifestSha256: sha(daily.manifest), mediaReferencesVerified: true, mode: 'restore-test' });
// These simulate the deployment's immutable legacy pointers. The epoch code
// must never read, change, sidecar-sign, move, or replace them.
json(path.join(root, 'metadata', 'latest-success-daily.json'), { legacy: 'daily', opaque: true });
json(path.join(root, 'metadata', 'latest-success-weekly.json'), { legacy: 'weekly', opaque: true });
NODE
}

make_fixture() {
  local root="$1" age_hours="${2:-0}"
  mkdir -p -- "${root}"
  write_fixture_files "${root}" "${age_hours}"
  export MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="${TEST_EPOCH_ID}"
  node "${EPOCH_TOOL}" initialize initial-establishment
  node "${EPOCH_TOOL}" activate
  local daily weekly restore
  daily="$(node "${EPOCH_TOOL}" write-backup-evidence < "${root}/daily-evidence.json")"
  node "${EPOCH_TOOL}" publish-backup-pointer daily "${daily}"
  weekly="$(node "${EPOCH_TOOL}" write-backup-evidence < "${root}/weekly-evidence.json")"
  node "${EPOCH_TOOL}" publish-backup-pointer weekly "${weekly}"
  restore="$(node "${EPOCH_TOOL}" write-restore-evidence < "${root}/restore-evidence.json")"
  node "${EPOCH_TOOL}" publish-restore-pointer "${restore}"
  cat > "${root}/production.env" <<EOF
NODE_ENV=production
MENORAH_BACKUP_ROOT=${root}
MENORAH_DEPLOY_STATE_ROOT=${root}/deploy-state
BACKUP_REQUIRE_MOUNT=false
BACKUP_REQUIRE_ENCRYPTION=true
BACKUP_INTEGRITY_HMAC_KEY=${TEST_HMAC_KEY}
BACKUP_INTEGRITY_EPOCH_ID=${TEST_EPOCH_ID}
BACKUP_MAX_AGE_HOURS=24
BACKUP_WEEKLY_MAX_AGE_HOURS=192
BACKUP_MIN_SIZE_BYTES=1
BACKUP_DISK_USAGE_MAX_PERCENT=100
BACKUP_EXPECT_RAID=false
CHECK_RESTORE_TEST=true
BACKUP_RESTORE_TEST_MAX_AGE_HOURS=24
EOF
  unset MENORAH_BACKUP_ROOT BACKUP_INTEGRITY_HMAC_KEY BACKUP_INTEGRITY_EPOCH_ID
}

run_health() { PRODUCTION_ENV="$1/production.env" "${HEALTH}"; }
epoch_path() { printf '%s/metadata/integrity-epochs/%s\n' "$1" "${TEST_EPOCH_ID}"; }

test_valid_epoch_chain_and_legacy_preservation() {
  local root="${TMP_ROOT}/valid" before_daily before_weekly output
  mkdir -p "${root}"; write_fixture_files "${root}"
  before_daily="$(sha256sum "${root}/metadata/latest-success-daily.json" | awk '{print $1}')"
  before_weekly="$(sha256sum "${root}/metadata/latest-success-weekly.json" | awk '{print $1}')"
  export MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="${TEST_EPOCH_ID}"
  node "${EPOCH_TOOL}" initialize initial-establishment
  node "${EPOCH_TOOL}" activate
  local evidence
  for cadence in daily weekly; do
    evidence="$(node "${EPOCH_TOOL}" write-backup-evidence < "${root}/${cadence}-evidence.json")"
    node "${EPOCH_TOOL}" publish-backup-pointer "${cadence}" "${evidence}"
  done
  evidence="$(node "${EPOCH_TOOL}" write-restore-evidence < "${root}/restore-evidence.json")"
  node "${EPOCH_TOOL}" publish-restore-pointer "${evidence}"
  unset MENORAH_BACKUP_ROOT BACKUP_INTEGRITY_HMAC_KEY BACKUP_INTEGRITY_EPOCH_ID
  cat > "${root}/production.env" <<EOF
NODE_ENV=production
MENORAH_BACKUP_ROOT=${root}
MENORAH_DEPLOY_STATE_ROOT=${root}/deploy-state
BACKUP_REQUIRE_MOUNT=false
BACKUP_REQUIRE_ENCRYPTION=true
BACKUP_INTEGRITY_HMAC_KEY=${TEST_HMAC_KEY}
BACKUP_INTEGRITY_EPOCH_ID=${TEST_EPOCH_ID}
BACKUP_MAX_AGE_HOURS=24
BACKUP_WEEKLY_MAX_AGE_HOURS=192
BACKUP_MIN_SIZE_BYTES=1
BACKUP_DISK_USAGE_MAX_PERCENT=100
BACKUP_EXPECT_RAID=false
CHECK_RESTORE_TEST=true
BACKUP_RESTORE_TEST_MAX_AGE_HOURS=24
EOF
  output="$(run_health "${root}")" || fail "valid signed epoch chain was rejected"
  grep -F 'Backup health OK: signed epoch' <<< "${output}" >/dev/null || fail "epoch health success output missing"
  [[ "${before_daily}" == "$(sha256sum "${root}/metadata/latest-success-daily.json" | awk '{print $1}')" ]] || fail "legacy daily pointer changed"
  [[ "${before_weekly}" == "$(sha256sum "${root}/metadata/latest-success-weekly.json" | awk '{print $1}')" ]] || fail "legacy weekly pointer changed"
  [[ ! -e "${root}/metadata/latest-success-daily.json.hmac-sha256" ]] || fail "legacy pointer was sidecar-signed"
  [[ "$(stat -c '%a' "$(epoch_path "${root}")")" == 700 ]] || fail "epoch directory mode is not restrictive"
  [[ "$(stat -c '%a' "$(epoch_path "${root}")/epoch-start.json")" == 600 ]] || fail "epoch manifest mode is not restrictive"
}

test_initializer_and_authority_fail_closed() {
  local root="${TMP_ROOT}/authority" output
  make_fixture "${root}"
  export MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="${TEST_EPOCH_ID}"
  if output="$(node "${EPOCH_TOOL}" initialize initial-establishment 2>&1)"; then fail "initializer accepted an existing epoch"; fi
  grep -F 'refusing to overwrite an existing configured epoch' <<< "${output}" >/dev/null || fail "existing epoch rejection was unclear"
  BACKUP_INTEGRITY_EPOCH_ID='../escape' node "${EPOCH_TOOL}" validate-id >/dev/null 2>&1 && fail "path traversal epoch ID accepted"
  BACKUP_INTEGRITY_EPOCH_ID='UPPERCASE' node "${EPOCH_TOOL}" validate-id >/dev/null 2>&1 && fail "invalid epoch ID accepted"
  unset MENORAH_BACKUP_ROOT BACKUP_INTEGRITY_HMAC_KEY BACKUP_INTEGRITY_EPOCH_ID
  sed -i 's/^BACKUP_INTEGRITY_HMAC_KEY=.*/BACKUP_INTEGRITY_HMAC_KEY=/' "${root}/production.env"
  if run_health "${root}" >/dev/null 2>&1; then fail "health accepted missing HMAC key"; fi
  sed -i "s|^BACKUP_INTEGRITY_HMAC_KEY=.*|BACKUP_INTEGRITY_HMAC_KEY=${TEST_HMAC_KEY}|" "${root}/production.env"
  sed -i 's/^BACKUP_INTEGRITY_EPOCH_ID=.*/BACKUP_INTEGRITY_EPOCH_ID=/' "${root}/production.env"
  if run_health "${root}" >/dev/null 2>&1; then fail "health accepted missing epoch ID"; fi
  sed -i "s|^BACKUP_INTEGRITY_EPOCH_ID=.*|BACKUP_INTEGRITY_EPOCH_ID=${TEST_EPOCH_ID}|" "${root}/production.env"
  sed -i 's/^BACKUP_INTEGRITY_HMAC_KEY=.*/BACKUP_INTEGRITY_HMAC_KEY=wrong-key-that-is-more-than-thirty-two-characters/' "${root}/production.env"
  if run_health "${root}" >/dev/null 2>&1; then fail "health accepted the wrong HMAC key"; fi
}

test_interrupted_initializer_retry_and_symlink_rejection() {
  local root="${TMP_ROOT}/initializer-retry" output dangling_root
  mkdir -p "${root}/metadata/integrity-epochs/.retryable-epoch.initializing.interrupted"
  export MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="retryable-epoch"
  node "${EPOCH_TOOL}" initialize initial-establishment
  [[ -f "${root}/metadata/integrity-epochs/retryable-epoch/epoch-complete.json" ]] || fail "retryable initialization did not complete"
  [[ -d "${root}/metadata/integrity-epochs/.retryable-epoch.initializing.interrupted" ]] || fail "interrupted initializer audit directory was removed"
  node "${EPOCH_TOOL}" activate
  unset MENORAH_BACKUP_ROOT BACKUP_INTEGRITY_HMAC_KEY BACKUP_INTEGRITY_EPOCH_ID

  dangling_root="${TMP_ROOT}/dangling-initializer"
  mkdir -p "${dangling_root}/metadata/integrity-epochs"
  ln -s -- "${dangling_root}/not-present" "${dangling_root}/metadata/integrity-epochs/dangling-epoch"
  if output="$(MENORAH_BACKUP_ROOT="${dangling_root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="dangling-epoch" node "${EPOCH_TOOL}" initialize initial-establishment 2>&1)"; then
    fail "initializer replaced a dangling epoch symlink"
  fi
  grep -F 'refusing to overwrite an existing configured epoch' <<< "${output}" >/dev/null || fail "dangling initializer symlink rejection was unclear"

  make_fixture "${TMP_ROOT}/symlink"
  root="${TMP_ROOT}/symlink"
  ln -s -- "$(epoch_path "${root}")" "${root}/metadata/integrity-epochs/symlink-epoch"
  if output="$(MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="symlink-epoch" node "${EPOCH_TOOL}" validate 2>&1)"; then
    fail "epoch validation accepted a symlinked epoch directory"
  fi
  grep -F 'not a directory' <<< "${output}" >/dev/null || fail "symlink epoch rejection was unclear"
}

test_tamper_stale_and_legacy_fallback_rejected() {
  local root="${TMP_ROOT}/tampered" output evidence
  make_fixture "${root}"
  evidence="$(epoch_path "${root}")/evidence/backups/daily/$(date -u +%Y%m%dT%H%M%SZ).json"
  evidence="$(find "$(epoch_path "${root}")/evidence/backups/daily" -name '*.json' -print -quit)"
  printf ' ' >> "${evidence}"
  if output="$(run_health "${root}" 2>&1)"; then fail "health accepted modified backup evidence"; fi
  grep -F 'HMAC verification failed' <<< "${output}" >/dev/null || fail "modified evidence did not fail its HMAC"
  make_fixture "${TMP_ROOT}/legacy-only"
  root="${TMP_ROOT}/legacy-only"
  rm -f -- "$(epoch_path "${root}")/pointers/latest-success-daily.json"
  if output="$(run_health "${root}" 2>&1)"; then fail "health fell back to a legacy root pointer"; fi
  grep -F 'signed epoch backup chain validation failed' <<< "${output}" >/dev/null || fail "legacy fallback rejection was unclear"
  make_fixture "${TMP_ROOT}/stale" 25
  if output="$(run_health "${TMP_ROOT}/stale" 2>&1)"; then fail "health accepted stale daily evidence"; fi
  grep -F 'daily backup is stale' <<< "${output}" >/dev/null || fail "stale evidence rejection was unclear"
}

test_unsigned_pointer_and_manifest_tampering_rejected() {
  local root="${TMP_ROOT}/unsigned-pointer" output pointer
  make_fixture "${root}"
  pointer="$(epoch_path "${root}")/pointers/latest-success-daily.json"
  node - "${pointer}" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const pointer = JSON.parse(fs.readFileSync(file, 'utf8'));
delete pointer.signature;
fs.writeFileSync(file, `${JSON.stringify(pointer)}\n`);
NODE
  if output="$(run_health "${root}" 2>&1)"; then fail "health accepted an unsigned epoch pointer"; fi
  grep -F 'signature is malformed' <<< "${output}" >/dev/null || fail "unsigned pointer rejection was unclear"

  root="${TMP_ROOT}/manifest-tamper"
  make_fixture "${root}"
  printf ' ' >> "$(epoch_path "${root}")/epoch-start.json"
  if output="$(run_health "${root}" 2>&1)"; then fail "health accepted a modified epoch manifest"; fi
  grep -F 'epoch start manifest HMAC verification failed' <<< "${output}" >/dev/null || fail "manifest tampering did not fail its HMAC"
}

test_atomic_pointer_publication() {
  local root="${TMP_ROOT}/atomic-pointer" pointer inode_before inode_after evidence output
  make_fixture "${root}"
  pointer="$(epoch_path "${root}")/pointers/latest-success-daily.json"
  inode_before="$(stat -c '%i' "${pointer}")"
  export MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="${TEST_EPOCH_ID}"
  evidence="$(node "${EPOCH_TOOL}" get-backup-evidence daily | node -e 'let raw=""; process.stdin.on("data", (chunk) => { raw += chunk; }); process.stdin.on("end", () => { process.stdout.write(JSON.parse(raw).evidenceFile); });')"
  node "${EPOCH_TOOL}" publish-backup-pointer daily "${evidence}"
  unset MENORAH_BACKUP_ROOT BACKUP_INTEGRITY_HMAC_KEY BACKUP_INTEGRITY_EPOCH_ID
  inode_after="$(stat -c '%i' "${pointer}")"
  [[ "${inode_before}" != "${inode_after}" ]] || fail "pointer publication did not atomically replace its target"
  if ! output="$(run_health "${root}")"; then fail "health rejected the atomically republished pointer"; fi
  grep -F 'Backup health OK: signed epoch' <<< "${output}" >/dev/null || fail "atomic pointer health result missing"
}

test_restore_linked_to_weekly_is_accepted() {
  local root="${TMP_ROOT}/weekly-restore" evidence output
  make_fixture "${root}"
  node - "${root}" <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const weekly = JSON.parse(fs.readFileSync(path.join(root, 'weekly-evidence.json'), 'utf8'));
const restorePath = path.join(root, 'restore-evidence.json');
const restore = JSON.parse(fs.readFileSync(restorePath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(restore.sanitizedMetadataFile, 'utf8'));
metadata.sourceArchive = weekly.mongoArchive;
metadata.sourceArchiveSha256 = weekly.mongoArchiveSha256;
fs.writeFileSync(restore.sanitizedMetadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
restore.timestamp = new Date(Date.parse(restore.timestamp) + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
restore.sourceArchive = weekly.mongoArchive;
restore.sourceArchiveSha256 = weekly.mongoArchiveSha256;
restore.uploadsArchive = weekly.uploadsArchive;
restore.uploadsArchiveSha256 = weekly.uploadsArchiveSha256;
restore.mediaManifest = weekly.uploadsManifest;
restore.mediaManifestSha256 = weekly.uploadsManifestSha256;
restore.sanitizedMetadataSha256 = crypto.createHash('sha256').update(fs.readFileSync(restore.sanitizedMetadataFile)).digest('hex');
fs.writeFileSync(restorePath, `${JSON.stringify(restore, null, 2)}\n`);
NODE
  export MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="${TEST_HMAC_KEY}" BACKUP_INTEGRITY_EPOCH_ID="${TEST_EPOCH_ID}"
  evidence="$(node "${EPOCH_TOOL}" write-restore-evidence < "${root}/restore-evidence.json")"
  node "${EPOCH_TOOL}" publish-restore-pointer "${evidence}"
  unset MENORAH_BACKUP_ROOT BACKUP_INTEGRITY_HMAC_KEY BACKUP_INTEGRITY_EPOCH_ID
  if ! output="$(run_health "${root}")"; then fail "health rejected restore evidence linked to the current weekly backup"; fi
  grep -F 'Backup health OK: signed epoch' <<< "${output}" >/dev/null || fail "weekly restore health result missing"
}

test_atomic_pointer_rotation_and_prune_preservation() {
  local root="${TMP_ROOT}/rotation" old_epoch_sha output evidence
  make_fixture "${root}"
  old_epoch_sha="$(sha256sum "$(epoch_path "${root}")/epoch-start.json" | awk '{print $1}')"
  export MENORAH_BACKUP_ROOT="${root}" BACKUP_INTEGRITY_HMAC_KEY="rotated-test-hmac-key-0000000000000000000000000002" BACKUP_INTEGRITY_EPOCH_ID="lifecycle-rotated-epoch"
  node "${EPOCH_TOOL}" initialize key-rotation
  node "${EPOCH_TOOL}" activate "${TEST_EPOCH_ID}"
  [[ "${old_epoch_sha}" == "$(sha256sum "${root}/metadata/integrity-epochs/${TEST_EPOCH_ID}/epoch-start.json" | awk '{print $1}')" ]] || fail "rotation modified the closed epoch"
  [[ -f "${root}/metadata/integrity-epochs/lifecycle-rotated-epoch/activation.json" ]] || fail "rotation did not create immutable activation evidence"
  for kind in daily weekly; do
    evidence="$(node - "${root}/${kind}-evidence.json" lifecycle-rotated-epoch <<'NODE' | node "${EPOCH_TOOL}" write-backup-evidence
const fs = require('fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
value.epochId = process.argv[3];
process.stdout.write(JSON.stringify(value));
NODE
)"
    node "${EPOCH_TOOL}" publish-backup-pointer "${kind}" "${evidence}"
  done
  evidence="$(node - "${root}/restore-evidence.json" lifecycle-rotated-epoch <<'NODE' | node "${EPOCH_TOOL}" write-restore-evidence
const fs = require('fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
value.epochId = process.argv[3];
process.stdout.write(JSON.stringify(value));
NODE
)"
  node "${EPOCH_TOOL}" publish-restore-pointer "${evidence}"
  unset MENORAH_BACKUP_ROOT BACKUP_INTEGRITY_HMAC_KEY BACKUP_INTEGRITY_EPOCH_ID
  # Pruning is keyed to the new active authority but must preserve both the
  # newly active epoch and the immutable closed epoch.
  sed -i 's|^BACKUP_INTEGRITY_HMAC_KEY=.*|BACKUP_INTEGRITY_HMAC_KEY=rotated-test-hmac-key-0000000000000000000000000002|' "${root}/production.env"
  sed -i 's|^BACKUP_INTEGRITY_EPOCH_ID=.*|BACKUP_INTEGRITY_EPOCH_ID=lifecycle-rotated-epoch|' "${root}/production.env"
  if ! output="$(run_health "${root}")"; then fail "health rejected the fully signed rotated epoch"; fi
  grep -F 'signed epoch lifecycle-rotated-epoch backup chain OK' <<< "${output}" >/dev/null || fail "rotated epoch health result missing"
  mkdir -p "${root}/deploy-state"
  if ! output="$(PRODUCTION_ENV="${root}/production.env" "${REPO_ROOT}/deploy/ubuntu/prune-backups.sh")"; then fail "epoch-aware pruning validation failed"; fi
  grep -F 'historical evidence were preserved' <<< "${output}" >/dev/null || fail "pruner did not report preservation"
  [[ -f "$(epoch_path "${root}")/epoch-start.json" ]] || fail "pruner removed active epoch evidence"
  [[ -f "${root}/metadata/integrity-epochs/lifecycle-rotated-epoch/activation.json" ]] || fail "pruner removed closed epoch audit evidence"
}

test_valid_epoch_chain_and_legacy_preservation
test_initializer_and_authority_fail_closed
test_interrupted_initializer_retry_and_symlink_rejection
test_tamper_stale_and_legacy_fallback_rejected
test_unsigned_pointer_and_manifest_tampering_rejected
test_atomic_pointer_publication
test_restore_linked_to_weekly_is_accepted
test_atomic_pointer_rotation_and_prune_preservation
echo "Backup lifecycle integrity tests passed."
