#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_ROOT="$(mktemp -d)"
TEST_HMAC_KEY="backup-lifecycle-test-hmac-key-0000000000000001"

cleanup() {
  rm -rf -- "${TMP_ROOT}"
}
trap cleanup EXIT

fail() {
  echo "backup lifecycle test failed: $*" >&2
  exit 1
}

make_fixture() {
  local fixture_root="$1"
  local age_hours="${2:-0}"
  local include_old="${3:-false}"
  local restore_age_hours="${4:-${age_hours}}"
  mkdir -p -- "${fixture_root}"

  FIXTURE_ROOT="${fixture_root}" \
  FIXTURE_HMAC_KEY="${TEST_HMAC_KEY}" \
  FIXTURE_AGE_HOURS="${age_hours}" \
  FIXTURE_RESTORE_AGE_HOURS="${restore_age_hours}" \
  FIXTURE_INCLUDE_OLD="${include_old}" \
    node - <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = fs.realpathSync(process.env.FIXTURE_ROOT);
const key = process.env.FIXTURE_HMAC_KEY;
const ageHours = Number(process.env.FIXTURE_AGE_HOURS);
const restoreAgeHours = Number(process.env.FIXTURE_RESTORE_AGE_HOURS);
const includeOld = process.env.FIXTURE_INCLUDE_OLD === 'true';
const releaseSha = 'a'.repeat(40);

function compact(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function iso(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sign(file) {
  const digest = crypto
    .createHmac('sha256', key)
    .update(fs.readFileSync(file))
    .digest('hex');
  fs.writeFileSync(`${file}.hmac-sha256`, `${digest}\n`, { mode: 0o600 });
}

function writeChecksum(file, digest) {
  fs.writeFileSync(`${file}.sha256`, `${digest}  ${path.basename(file)}\n`, {
    mode: 0o600,
  });
}

function createSource(date, label) {
  const timestamp = compact(date);
  const setDir = path.join(root, 'daily', timestamp);
  const archive = path.join(
    setDir,
    'mongo',
    `menorah-mongo-${timestamp}.archive.gz.enc`,
  );
  const uploadsArchive = path.join(
    setDir,
    'uploads',
    `uploads-${timestamp}.tar.gz.enc`,
  );
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.mkdirSync(path.dirname(uploadsArchive), { recursive: true });
  fs.mkdirSync(path.join(setDir, 'metadata'), { recursive: true });
  fs.writeFileSync(
    archive,
    Buffer.from(`test-encrypted-full-instance-${label}-`.repeat(100)),
    { mode: 0o600 },
  );
  const archiveSha = sha256(archive);
  writeChecksum(archive, archiveSha);
  fs.writeFileSync(
    uploadsArchive,
    Buffer.from(`test-encrypted-uploads-${label}-`.repeat(100)),
    { mode: 0o600 },
  );
  const uploadsArchiveSha = sha256(uploadsArchive);
  writeChecksum(uploadsArchive, uploadsArchiveSha);
  const uploadsManifest = path.join(setDir, 'metadata', 'uploads-manifest.json');
  const entries = [];
  const entriesSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify(entries))
    .digest('hex');
  writeJson(uploadsManifest, {
    schemaVersion: 1,
    artifactType: 'menorah-immutable-media-manifest',
    rootName: 'uploads',
    createdAt: iso(date),
    fileCount: 0,
    totalBytes: 0,
    entriesSha256,
    entries,
  });
  const uploadsManifestSha = sha256(uploadsManifest);
  writeChecksum(uploadsManifest, uploadsManifestSha);
  sign(uploadsManifest);
  const mediaReferenceVerification = path.join(
    setDir,
    'metadata',
    'media-reference-verification.json',
  );
  writeJson(mediaReferenceVerification, {
    schemaVersion: 1,
    verificationType: 'menorah-media-database-references',
    valid: true,
    referenceCount: 0,
    localReferenceCount: 0,
    cloudinaryReferenceCount: 0,
    externalReferenceCount: 0,
    externalOrigins: [],
    referenceDigest: crypto.createHash('sha256').update('[]').digest('hex'),
    manifestEntriesSha256: entriesSha256,
    manifestFileCount: 0,
    manifestTotalBytes: 0,
    violations: [],
  });
  const mediaReferenceVerificationSha = sha256(mediaReferenceVerification);
  writeChecksum(mediaReferenceVerification, mediaReferenceVerificationSha);
  sign(mediaReferenceVerification);
  const metadataFile = path.join(setDir, 'metadata', 'metadata.json');
  writeJson(metadataFile, {
    schemaVersion: 3,
    artifactType: 'mongodb-full-instance-oplog',
    scope: 'full-instance',
    timestamp,
    backupType: 'daily',
    checkoutGitSha: releaseSha,
    deployedReleaseSha: releaseSha,
    migrationAppliedSha: releaseSha,
    mongoArchive: archive,
    mongoArchiveSha256: archiveSha,
    uploadsArchive,
    uploadsArchiveSha256: uploadsArchiveSha,
    uploadsManifest,
    uploadsManifestSha256: uploadsManifestSha,
    mediaReferenceVerification,
    mediaReferenceVerificationSha256: mediaReferenceVerificationSha,
    mediaStorageBackend: 'local',
    mediaConsistencyContract: 'immutable-write-before-reference',
    uploadsRequired: true,
    backupRoot: root,
    encrypted: true,
    oplog: true,
    containsSystemIdentityData: true,
    directProductionRestoreAllowed: false,
    requiredSanitizationNamespace: 'menorah.*',
    databaseToolsVersion: '100.17.0',
    mongoServerVersion: '7.0.28',
    mongoFeatureCompatibilityVersion: '7.0',
  });
  sign(metadataFile);
  fs.utimesSync(setDir, date, date);
  return {
    date,
    timestamp,
    setDir,
    archive,
    archiveSha,
    uploadsArchive,
    uploadsArchiveSha,
    uploadsManifest,
    uploadsManifestSha,
    mediaReferenceVerification,
    mediaReferenceVerificationSha,
    metadataFile,
  };
}

function createSanitized(source, date, label) {
  const sanitizedDir = path.join(root, 'restore-tests', 'sanitized');
  fs.mkdirSync(sanitizedDir, { recursive: true });
  const archive = path.join(
    sanitizedDir,
    `${source.archiveSha}.menorah.archive.gz.enc`,
  );
  fs.writeFileSync(
    archive,
    Buffer.from(`test-encrypted-sanitized-${label}-`.repeat(100)),
    { mode: 0o600 },
  );
  const archiveSha = sha256(archive);
  writeChecksum(archive, archiveSha);
  const metadataFile = `${archive}.metadata.json`;
  writeJson(metadataFile, {
    schemaVersion: 1,
    artifactType: 'menorah-sanitized-restore',
    createdAt: iso(date),
    namespaceAllowlist: ['menorah.*'],
    sourceArtifactType: 'mongodb-full-instance-oplog',
    sourceArchive: source.archive,
    sourceArchiveSha256: source.archiveSha,
    sourceBackupGitSha: releaseSha,
    derivedArchive: archive,
    derivedArchiveSha256: archiveSha,
    encrypted: true,
    oplogReplayVerified: true,
    productionOplogReplayAllowed: false,
    databaseToolsVersion: '100.17.0',
    mongoServerVersion: '7.0.28',
    mongoFeatureCompatibilityVersion: '7.0',
  });
  sign(metadataFile);
  for (const file of [
    archive,
    `${archive}.sha256`,
    metadataFile,
    `${metadataFile}.hmac-sha256`,
  ]) {
    fs.utimesSync(file, date, date);
  }
  return { archive, archiveSha };
}

const now = new Date();
now.setUTCMilliseconds(0);
const currentDate = new Date(now.getTime() - ageHours * 60 * 60 * 1000);
const current = createSource(currentDate, 'current');
const restoreDate = new Date(
  now.getTime() - restoreAgeHours * 60 * 60 * 1000,
);
const restoreSource = restoreAgeHours === ageHours
  ? current
  : createSource(restoreDate, 'restore-source');
const sanitized = createSanitized(
  restoreSource,
  restoreDate,
  'restore-source',
);

const latestMarker = path.join(root, 'metadata', 'latest-success-daily.json');
writeJson(latestMarker, {
  schemaVersion: 3,
  artifactType: 'mongodb-full-instance-oplog',
  timestamp: current.timestamp,
  backupType: 'daily',
  path: current.setDir,
  mongoArchive: current.archive,
  mongoArchiveSha256: current.archiveSha,
  uploadsArchive: current.uploadsArchive,
  uploadsManifest: current.uploadsManifest,
  mediaReferenceVerification: current.mediaReferenceVerification,
  metadataFile: current.metadataFile,
  encrypted: true,
  oplog: true,
  directProductionRestoreAllowed: false,
});
sign(latestMarker);

const restoreMarker = path.join(root, 'restore-tests', 'latest-success.json');
writeJson(restoreMarker, {
  schemaVersion: 2,
  timestamp: iso(restoreDate),
  archive: restoreSource.archive,
  archiveSha256: restoreSource.archiveSha,
  sanitizedArchive: sanitized.archive,
  sanitizedArchiveSha256: sanitized.archiveSha,
  sanitizedNamespace: 'menorah.*',
  uploadsArchive: restoreSource.uploadsArchive,
  uploadsArchiveSha256: restoreSource.uploadsArchiveSha,
  mediaManifest: restoreSource.uploadsManifest,
  mediaManifestSha256: restoreSource.uploadsManifestSha,
  mediaReferencesVerified: true,
  mode: 'restore-test',
});
sign(restoreMarker);

if (includeOld) {
  const oldDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
  const old = createSource(oldDate, 'expired');
  createSanitized(old, oldDate, 'expired');
  // Creating the derived evidence updates parent mtimes; restore the set mtime
  // used by the source retention policy after all linked files are published.
  fs.utimesSync(old.setDir, oldDate, oldDate);
}
NODE

  cat > "${fixture_root}/production.env" <<EOF
NODE_ENV=production
MENORAH_BACKUP_ROOT=${fixture_root}
MENORAH_DEPLOY_STATE_ROOT=${fixture_root}/deploy-state
BACKUP_REQUIRE_MOUNT=false
BACKUP_REQUIRE_ENCRYPTION=true
BACKUP_INTEGRITY_HMAC_KEY=${TEST_HMAC_KEY}
BACKUP_TYPE=daily
BACKUP_MAX_AGE_HOURS=24
BACKUP_MIN_SIZE_BYTES=1
BACKUP_DISK_USAGE_MAX_PERCENT=100
BACKUP_EXPECT_RAID=false
CHECK_RESTORE_TEST=true
BACKUP_RESTORE_TEST_MAX_AGE_HOURS=24
EOF
}

run_health() {
  local fixture_root="$1"
  PRODUCTION_ENV="${fixture_root}/production.env" \
    "${REPO_ROOT}/deploy/ubuntu/check-backup-health.sh"
}

test_valid_signed_chain_passes() {
  local fixture_root="${TMP_ROOT}/valid"
  local output
  make_fixture "${fixture_root}"
  output="$(run_health "${fixture_root}")" \
    || fail "valid signed source-to-sanitized chain was rejected"
  grep -F "Backup health OK: signed backup chain OK" <<< "${output}" >/dev/null \
    || fail "valid chain did not produce the expected health result"
}

test_tampered_derived_bytes_fail() {
  local fixture_root="${TMP_ROOT}/tampered-bytes"
  local sanitized output
  make_fixture "${fixture_root}"
  sanitized="$(find "${fixture_root}/restore-tests/sanitized" \
    -maxdepth 1 -type f -name '*.menorah.archive.gz.enc' -print -quit)"
  printf 'tampered' >> "${sanitized}"
  if output="$(run_health "${fixture_root}" 2>&1)"; then
    fail "health accepted tampered sanitized bytes"
  fi
  grep -F "digest verification failed" <<< "${output}" >/dev/null \
    || fail "tampered derived bytes did not report a digest failure"
}

test_tampered_upload_bytes_fail() {
  local fixture_root="${TMP_ROOT}/tampered-uploads"
  local uploads output
  make_fixture "${fixture_root}"
  uploads="$(find "${fixture_root}/daily" \
    -type f -name 'uploads-*.tar.gz.enc' -print -quit)"
  printf 'tampered' >> "${uploads}"
  if output="$(run_health "${fixture_root}" 2>&1)"; then
    fail "health accepted tampered uploads bytes"
  fi
  grep -F "uploads archive digest verification failed" <<< "${output}" >/dev/null \
    || fail "tampered uploads bytes did not report a digest failure"
}

test_tampered_marker_hmac_fails() {
  local fixture_root="${TMP_ROOT}/tampered-marker"
  local output
  make_fixture "${fixture_root}"
  printf ' ' >> "${fixture_root}/restore-tests/latest-success.json"
  if output="$(run_health "${fixture_root}" 2>&1)"; then
    fail "health accepted a restore marker with an invalid HMAC"
  fi
  grep -F "restore-test marker HMAC verification failed" <<< "${output}" >/dev/null \
    || fail "tampered restore marker did not report an HMAC failure"
}

test_restore_chain_is_limited_to_24_hours() {
  local fixture_root="${TMP_ROOT}/stale"
  local output
  make_fixture "${fixture_root}" 0 false 25
  if output="$(run_health "${fixture_root}" 2>&1)"; then
    fail "health accepted restore evidence older than 24 hours"
  fi
  grep -F "restore-test evidence is stale" <<< "${output}" >/dev/null \
    || fail "stale restore evidence did not report the 24-hour freshness failure"

  sed -i 's/BACKUP_RESTORE_TEST_MAX_AGE_HOURS=24/BACKUP_RESTORE_TEST_MAX_AGE_HOURS=25/' \
    "${fixture_root}/production.env"
  if output="$(run_health "${fixture_root}" 2>&1)"; then
    fail "health accepted a restore-test freshness configuration over 24 hours"
  fi
  grep -F "must be 24 or less" <<< "${output}" >/dev/null \
    || fail "overlong restore-test freshness configuration was not rejected"
}

test_inherited_lock_contract() {
  local fixture_root="${TMP_ROOT}/inherited-locks"
  make_fixture "${fixture_root}"
  mkdir -p -- "${fixture_root}/deploy-state"
  (
    exec 9>"${fixture_root}/deploy-state/.deploy.lock"
    flock -n 9 || exit 1
    exec 8>"${fixture_root}/metadata/.backup.lock"
    flock -n 8 || exit 1
    run_health "${fixture_root}" >/dev/null
  ) || fail "health did not accept the exact inherited fd 9/fd 8 locks"
}

test_competing_locks_fail_closed() {
  local fixture_root="${TMP_ROOT}/competing-locks"
  local output
  make_fixture "${fixture_root}"
  mkdir -p -- "${fixture_root}/deploy-state"

  (
    exec 7>"${fixture_root}/deploy-state/.deploy.lock"
    flock -n 7 || exit 1
    if output="$(run_health "${fixture_root}" 2>&1)"; then
      fail "health raced a separately held deployment lock"
    fi
    grep -F "deployment, rollback, bootstrap, or restore" <<< "${output}" >/dev/null \
      || fail "health did not explain deployment-lock contention"
  )

  (
    exec 7>"${fixture_root}/metadata/.backup.lock"
    flock -n 7 || exit 1
    if output="$(
      PRODUCTION_ENV="${fixture_root}/production.env" \
        "${REPO_ROOT}/deploy/ubuntu/prune-backups.sh" 2>&1
    )"; then
      fail "prune raced a separately held backup lock"
    fi
    grep -F "backup, restore, prune, or health check" <<< "${output}" >/dev/null \
      || fail "prune did not explain backup-lock contention"
  )
}

test_prune_removes_linked_expired_units_only() {
  local fixture_root="${TMP_ROOT}/prune-linked"
  local current_source current_sanitized
  make_fixture "${fixture_root}" 0 true
  mkdir -p -- "${fixture_root}/deploy-state"
  current_source="$(
    node -e '
      const fs = require("fs");
      const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(marker.archive);
    ' "${fixture_root}/restore-tests/latest-success.json"
  )"
  current_sanitized="$(
    node -e '
      const fs = require("fs");
      const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(marker.sanitizedArchive);
    ' "${fixture_root}/restore-tests/latest-success.json"
  )"
  touch -d '40 days ago' "$(dirname "$(dirname "${current_source}")")"

  (
    exec 9>"${fixture_root}/deploy-state/.deploy.lock"
    flock -n 9 || exit 1
    exec 8>"${fixture_root}/metadata/.backup.lock"
    flock -n 8 || exit 1
    PRODUCTION_ENV="${fixture_root}/production.env" \
    MANUAL_RETENTION_DAYS=1 \
    SIX_HOURLY_RETENTION_DAYS=1 \
    DAILY_RETENTION_DAYS=1 \
    WEEKLY_RETENTION_DAYS=1 \
    MONTHLY_RETENTION_DAYS=1 \
    SANITIZED_RETENTION_DAYS=1 \
      "${REPO_ROOT}/deploy/ubuntu/prune-backups.sh" >/dev/null
  ) || fail "linked prune failed"

  [[ -f "${current_source}" && -f "${current_sanitized}" ]] \
    || fail "prune removed the marker-protected recovery set"
  [[ "$(find "${fixture_root}/daily" -mindepth 1 -maxdepth 1 -type d | wc -l)" -eq 1 ]] \
    || fail "prune did not remove exactly the expired source set"
  [[ "$(find "${fixture_root}/restore-tests/sanitized" \
    -maxdepth 1 -type f -name '*.menorah.archive.gz.enc' | wc -l)" -eq 1 ]] \
    || fail "prune did not remove the expired linked sanitized artifact"
  [[ -f "${current_sanitized}.sha256" \
    && -f "${current_sanitized}.metadata.json" \
    && -f "${current_sanitized}.metadata.json.hmac-sha256" ]] \
    || fail "prune removed sidecars from the protected sanitized artifact"
}

test_prune_is_fail_closed_before_deletion() {
  local fixture_root="${TMP_ROOT}/prune-fail-closed"
  local metadata output
  make_fixture "${fixture_root}" 0 true
  metadata="$(find "${fixture_root}/restore-tests/sanitized" \
    -maxdepth 1 -type f -name '*.metadata.json' | sort | tail -n 1)"
  printf ' ' >> "${metadata}"

  if output="$(
    PRODUCTION_ENV="${fixture_root}/production.env" \
    MANUAL_RETENTION_DAYS=1 \
    SIX_HOURLY_RETENTION_DAYS=1 \
    DAILY_RETENTION_DAYS=1 \
    WEEKLY_RETENTION_DAYS=1 \
    MONTHLY_RETENTION_DAYS=1 \
    SANITIZED_RETENTION_DAYS=1 \
      "${REPO_ROOT}/deploy/ubuntu/prune-backups.sh" 2>&1
  )"; then
    fail "prune accepted tampered sanitized metadata"
  fi
  grep -F "HMAC verification failed" <<< "${output}" >/dev/null \
    || fail "prune did not report the tampered metadata signature"
  [[ "$(find "${fixture_root}/daily" -mindepth 1 -maxdepth 1 -type d | wc -l)" -eq 2 ]] \
    || fail "prune deleted a source set before completing its integrity plan"
}

test_valid_signed_chain_passes
test_tampered_derived_bytes_fail
test_tampered_upload_bytes_fail
test_tampered_marker_hmac_fails
test_restore_chain_is_limited_to_24_hours
test_inherited_lock_contract
test_competing_locks_fail_closed
test_prune_removes_linked_expired_units_only
test_prune_is_fail_closed_before_deletion
echo "Backup lifecycle integrity tests passed."
