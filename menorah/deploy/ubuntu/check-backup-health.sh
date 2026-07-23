#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
MENORAH_DEPLOY_STATE_ROOT="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
BACKUP_TYPE="${BACKUP_TYPE:-daily}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
BACKUP_MIN_SIZE_BYTES="${BACKUP_MIN_SIZE_BYTES:-1024}"
BACKUP_DISK_USAGE_MAX_PERCENT="${BACKUP_DISK_USAGE_MAX_PERCENT:-80}"
BACKUP_RAID_DEVICE="${BACKUP_RAID_DEVICE:-/dev/md/menorah-backups}"
BACKUP_EXPECT_RAID="${BACKUP_EXPECT_RAID:-false}"
BACKUP_REQUIRE_MOUNT="${BACKUP_REQUIRE_MOUNT:-}"
CHECK_RESTORE_TEST="${CHECK_RESTORE_TEST:-true}"
BACKUP_RESTORE_TEST_MAX_AGE_HOURS="${BACKUP_RESTORE_TEST_MAX_AGE_HOURS:-24}"
BACKUP_HEALTH_PUSH_URL="${BACKUP_HEALTH_PUSH_URL:-}"
BACKUP_REQUIRE_ENCRYPTION="${BACKUP_REQUIRE_ENCRYPTION:-}"

failures=()
chain_summary=""

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

record_failure() {
  failures+=("$1")
}

push_status() {
  local status="$1"
  local message="$2"
  [[ -n "${BACKUP_HEALTH_PUSH_URL}" ]] || return 0

  curl -fsS -G \
    --data-urlencode "status=${status}" \
    --data-urlencode "msg=${message}" \
    "${BACKUP_HEALTH_PUSH_URL}" \
    >/dev/null || true
}

acquire_or_confirm_lock() {
  local fd="$1"
  local lock_file="$2"
  local description="$3"
  local expected inherited

  expected="$(realpath -m -- "${lock_file}")"
  inherited="$(readlink -f -- "/proc/$$/fd/${fd}" 2>/dev/null || true)"
  if [[ "${inherited}" != "${expected}" ]]; then
    case "${fd}" in
      9) exec 9>"${lock_file}" ;;
      8) exec 8>"${lock_file}" ;;
      *)
        echo "Unsupported lock descriptor: ${fd}" >&2
        exit 1
        ;;
    esac
  fi
  if ! flock -n "${fd}"; then
    echo "Another ${description} is already running: ${lock_file}" >&2
    exit 1
  fi
}

require_positive_integer() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[0-9]+$ ]] || (( value < 1 )); then
    record_failure "${name} must be a positive integer"
    return 1
  fi
}

case "${BACKUP_TYPE}" in
  manual|six-hourly|daily|weekly|monthly) ;;
  *) record_failure "Unsupported BACKUP_TYPE: ${BACKUP_TYPE}" ;;
esac
require_positive_integer "BACKUP_MAX_AGE_HOURS" "${BACKUP_MAX_AGE_HOURS}" || true
require_positive_integer "BACKUP_MIN_SIZE_BYTES" "${BACKUP_MIN_SIZE_BYTES}" || true
require_positive_integer "BACKUP_DISK_USAGE_MAX_PERCENT" "${BACKUP_DISK_USAGE_MAX_PERCENT}" || true
if [[ "${BACKUP_DISK_USAGE_MAX_PERCENT}" =~ ^[0-9]+$ ]] \
  && (( BACKUP_DISK_USAGE_MAX_PERCENT > 100 )); then
  record_failure "BACKUP_DISK_USAGE_MAX_PERCENT must not exceed 100"
fi

if is_true "${CHECK_RESTORE_TEST}"; then
  require_positive_integer \
    "BACKUP_RESTORE_TEST_MAX_AGE_HOURS" \
    "${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}" || true
  if [[ "${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}" =~ ^[0-9]+$ ]] \
    && (( BACKUP_RESTORE_TEST_MAX_AGE_HOURS > 24 )); then
    record_failure "BACKUP_RESTORE_TEST_MAX_AGE_HOURS must be 24 or less"
  fi
elif [[ "${NODE_ENV:-}" == "production" ]]; then
  record_failure "CHECK_RESTORE_TEST cannot be disabled in production"
fi

if [[ -z "${BACKUP_INTEGRITY_HMAC_KEY:-}" ]]; then
  record_failure "BACKUP_INTEGRITY_HMAC_KEY is required for signed backup health evidence"
elif (( ${#BACKUP_INTEGRITY_HMAC_KEY} < 32 )); then
  record_failure "BACKUP_INTEGRITY_HMAC_KEY must contain at least 32 characters"
fi

if [[ -z "${BACKUP_REQUIRE_MOUNT}" && "${MENORAH_BACKUP_ROOT}" == /mnt/menorah-backups* ]]; then
  BACKUP_REQUIRE_MOUNT=true
fi

# Lock order is always deployment first, then backup. A parent backup/update may
# pass either descriptor through; the exact fd path check prevents a bypass.
mkdir -p -- "${MENORAH_DEPLOY_STATE_ROOT}"
acquire_or_confirm_lock \
  9 \
  "${MENORAH_DEPLOY_STATE_ROOT}/.deploy.lock" \
  "deployment, rollback, bootstrap, or restore"

if is_true "${BACKUP_REQUIRE_MOUNT}" \
  && ! findmnt --mountpoint "${MENORAH_BACKUP_ROOT}" >/dev/null 2>&1; then
  record_failure "Backup root is not mounted: ${MENORAH_BACKUP_ROOT}"
fi

if [[ ! -d "${MENORAH_BACKUP_ROOT}" ]]; then
  record_failure "Backup root does not exist: ${MENORAH_BACKUP_ROOT}"
elif [[ ! -d "${MENORAH_BACKUP_ROOT}/metadata" ]]; then
  record_failure "Backup metadata directory does not exist: ${MENORAH_BACKUP_ROOT}/metadata"
else
  acquire_or_confirm_lock \
    8 \
    "${MENORAH_BACKUP_ROOT}/metadata/.backup.lock" \
    "backup, restore, prune, or health check"

  disk_usage_percent="$(df -P "${MENORAH_BACKUP_ROOT}" | awk 'NR==2 { gsub("%", "", $5); print $5 }')"
  if [[ ! "${disk_usage_percent}" =~ ^[0-9]+$ ]]; then
    record_failure "Backup disk usage could not be determined"
  elif [[ "${BACKUP_DISK_USAGE_MAX_PERCENT}" =~ ^[0-9]+$ ]] \
    && (( disk_usage_percent >= BACKUP_DISK_USAGE_MAX_PERCENT )); then
    record_failure \
      "Backup disk usage is ${disk_usage_percent}% >= ${BACKUP_DISK_USAGE_MAX_PERCENT}%"
  fi

  require_encryption=false
  if [[ "${NODE_ENV:-}" == "production" ]] || is_true "${BACKUP_REQUIRE_ENCRYPTION}"; then
    require_encryption=true
  fi

  if [[ "${#failures[@]}" -eq 0 ]]; then
    if ! chain_summary="$(
      BACKUP_HEALTH_ROOT="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")" \
      BACKUP_HEALTH_TYPE="${BACKUP_TYPE}" \
      BACKUP_HEALTH_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS}" \
      BACKUP_HEALTH_MIN_SIZE_BYTES="${BACKUP_MIN_SIZE_BYTES}" \
      BACKUP_HEALTH_CHECK_RESTORE="$(if is_true "${CHECK_RESTORE_TEST}"; then echo true; else echo false; fi)" \
      BACKUP_HEALTH_RESTORE_MAX_AGE_HOURS="${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}" \
      BACKUP_HEALTH_REQUIRE_ENCRYPTION="${require_encryption}" \
      BACKUP_HEALTH_PRODUCTION="$(if [[ "${NODE_ENV:-}" == "production" ]]; then echo true; else echo false; fi)" \
        node - 2>&1 <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = fs.realpathSync(process.env.BACKUP_HEALTH_ROOT);
const backupType = process.env.BACKUP_HEALTH_TYPE;
const maxAgeMs = Number(process.env.BACKUP_HEALTH_MAX_AGE_HOURS) * 60 * 60 * 1000;
const restoreMaxAgeMs =
  Number(process.env.BACKUP_HEALTH_RESTORE_MAX_AGE_HOURS) * 60 * 60 * 1000;
const minSize = Number(process.env.BACKUP_HEALTH_MIN_SIZE_BYTES);
const checkRestore = process.env.BACKUP_HEALTH_CHECK_RESTORE === 'true';
const requireEncryption = process.env.BACKUP_HEALTH_REQUIRE_ENCRYPTION === 'true';
const production = process.env.BACKUP_HEALTH_PRODUCTION === 'true';
const hmacKey = process.env.BACKUP_INTEGRITY_HMAC_KEY || '';
const futureSkewMs = 5 * 60 * 1000;
const hashCache = new Map();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function hasControlCharacters(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function isWithin(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function checkedPath(candidate, parent, kind, label) {
  invariant(
    typeof candidate === 'string' &&
      path.isAbsolute(candidate) &&
      !hasControlCharacters(candidate),
    `${label} path is malformed`,
  );
  const resolved = fs.realpathSync(candidate);
  const stat = fs.lstatSync(candidate);
  invariant(!stat.isSymbolicLink(), `${label} must not be a symbolic link`);
  invariant(isWithin(resolved, parent), `${label} escaped the backup root`);
  if (kind === 'file') invariant(stat.isFile(), `${label} is not a regular file`);
  if (kind === 'directory') invariant(stat.isDirectory(), `${label} is not a directory`);
  invariant(path.resolve(candidate) === resolved, `${label} path is not canonical`);
  return resolved;
}

function readJson(file, label) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} is not an object`);
  return value;
}

function verifyHmac(file, label) {
  const sidecar = checkedPath(`${file}.hmac-sha256`, root, 'file', `${label} HMAC`);
  const expected = fs.readFileSync(sidecar, 'utf8').trim();
  invariant(/^[0-9a-f]{64}$/.test(expected), `${label} HMAC is malformed`);
  const actual = crypto
    .createHmac('sha256', hmacKey)
    .update(fs.readFileSync(file))
    .digest('hex');
  invariant(
    crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')),
    `${label} HMAC verification failed`,
  );
}

function signedJson(file, label) {
  const checked = checkedPath(file, root, 'file', label);
  verifyHmac(checked, label);
  return readJson(checked, label);
}

function parseCompactTimestamp(value, label) {
  const match =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || '');
  invariant(match, `${label} timestamp is malformed`);
  const parts = match.slice(1).map(Number);
  const epoch = Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3],
    parts[4],
    parts[5],
  );
  const date = new Date(epoch);
  invariant(
    date.getUTCFullYear() === parts[0] &&
      date.getUTCMonth() === parts[1] - 1 &&
      date.getUTCDate() === parts[2] &&
      date.getUTCHours() === parts[3] &&
      date.getUTCMinutes() === parts[4] &&
      date.getUTCSeconds() === parts[5],
    `${label} timestamp is invalid`,
  );
  return epoch;
}

function parseIsoTimestamp(value, label) {
  invariant(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value || ''),
    `${label} timestamp is malformed`,
  );
  const epoch = Date.parse(value);
  invariant(Number.isFinite(epoch), `${label} timestamp is invalid`);
  return epoch;
}

function requireFresh(epoch, maximumAgeMs, label) {
  const age = Date.now() - epoch;
  invariant(age >= -futureSkewMs, `${label} timestamp is in the future`);
  invariant(age <= maximumAgeMs, `${label} is stale`);
}

async function sha256(file) {
  if (hashCache.has(file)) return hashCache.get(file);
  const result = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
  hashCache.set(file, result);
  return result;
}

async function verifyArtifact(file, expectedSha, label, enforceMinimumSize = true) {
  const artifact = checkedPath(file, root, 'file', label);
  invariant(/^[0-9a-f]{64}$/.test(expectedSha || ''), `${label} digest is malformed`);
  if (enforceMinimumSize) {
    invariant(fs.statSync(artifact).size >= minSize, `${label} is smaller than the configured minimum`);
  }
  const checksumFile = checkedPath(`${artifact}.sha256`, root, 'file', `${label} checksum`);
  const checksum = fs.readFileSync(checksumFile, 'utf8').trim();
  const match = /^([0-9a-f]{64})[ \t]+(.+)$/.exec(checksum);
  invariant(match, `${label} checksum sidecar is malformed`);
  invariant(match[1] === expectedSha, `${label} checksum sidecar digest does not match metadata`);
  invariant(
    match[2] === artifact || match[2] === path.basename(artifact),
    `${label} checksum sidecar names a different artifact`,
  );
  invariant((await sha256(artifact)) === expectedSha, `${label} digest verification failed`);
  return artifact;
}

async function validateSourceMetadata(metadataFile, archive, expectedSha, label) {
  const metadataPath = checkedPath(metadataFile, root, 'file', `${label} metadata`);
  const metadata = signedJson(metadataPath, `${label} metadata`);
  const sourceArchive = await verifyArtifact(archive, expectedSha, `${label} MongoDB archive`);
  const setDir = path.dirname(path.dirname(sourceArchive));
  const setRelative = path.relative(root, setDir).split(path.sep);
  invariant(
    setRelative.length === 2 &&
      ['manual', 'six-hourly', 'daily', 'weekly', 'monthly'].includes(setRelative[0]) &&
      /^\d{8}T\d{6}Z$/.test(setRelative[1]),
    `${label} backup set path is malformed`,
  );
  invariant(
    metadataPath === path.join(setDir, 'metadata', 'metadata.json'),
    `${label} metadata is outside its backup set`,
  );
  invariant(metadata.schemaVersion === 3, `${label} metadata schema is unsupported`);
  invariant(
    metadata.artifactType === 'mongodb-full-instance-oplog' &&
      metadata.scope === 'full-instance' &&
      metadata.oplog === true &&
      metadata.containsSystemIdentityData === true &&
      metadata.directProductionRestoreAllowed === false &&
      metadata.requiredSanitizationNamespace === 'menorah.*' &&
      metadata.mediaStorageBackend === 'local' &&
      metadata.mediaConsistencyContract === 'immutable-write-before-reference' &&
      metadata.uploadsRequired === true,
    `${label} metadata safety contract is invalid`,
  );
  invariant(metadata.backupType === setRelative[0], `${label} backup type does not match its path`);
  invariant(metadata.timestamp === setRelative[1], `${label} timestamp does not match its path`);
  invariant(metadata.mongoArchive === sourceArchive, `${label} metadata names a different archive`);
  invariant(
    metadata.mongoArchiveSha256 === expectedSha,
    `${label} metadata names a different archive digest`,
  );
  invariant(
    metadata.encrypted === sourceArchive.endsWith('.enc'),
    `${label} encryption metadata does not match the archive`,
  );
  if (requireEncryption) {
    invariant(metadata.encrypted === true && sourceArchive.endsWith('.enc'), `${label} is not encrypted`);
  }
  invariant(
    fs.realpathSync(metadata.backupRoot) === root,
    `${label} metadata names a different backup root`,
  );
  if (production) {
    invariant(
      /^[0-9]+\.[0-9]+\.[0-9]+$/.test(metadata.databaseToolsVersion || '') &&
        /^7\.[0-9]+\.[0-9]+$/.test(metadata.mongoServerVersion || '') &&
        metadata.mongoFeatureCompatibilityVersion === '7.0' &&
        /^[0-9a-f]{40}$/i.test(metadata.deployedReleaseSha || ''),
      `${label} version or release provenance is invalid`,
    );
  }

  const uploads = checkedPath(metadata.uploadsArchive, setDir, 'file', `${label} uploads archive`);
  invariant(
    path.dirname(uploads) === path.join(setDir, 'uploads') &&
      /^uploads-\d{8}T\d{6}Z\.tar\.gz(?:\.enc)?$/.test(path.basename(uploads)),
    `${label} uploads archive path is malformed`,
  );
  if (requireEncryption) {
    invariant(uploads.endsWith('.enc'), `${label} uploads archive is not encrypted`);
  }
  await verifyArtifact(
    uploads,
    metadata.uploadsArchiveSha256,
    `${label} uploads archive`,
    false,
  );

  const manifestPath = checkedPath(
    metadata.uploadsManifest,
    setDir,
    'file',
    `${label} uploads manifest`,
  );
  invariant(
    manifestPath === path.join(setDir, 'metadata', 'uploads-manifest.json'),
    `${label} uploads manifest path is malformed`,
  );
  const manifest = signedJson(manifestPath, `${label} uploads manifest`);
  await verifyArtifact(
    manifestPath,
    metadata.uploadsManifestSha256,
    `${label} uploads manifest`,
    false,
  );
  invariant(
    manifest.schemaVersion === 1 &&
      manifest.artifactType === 'menorah-immutable-media-manifest' &&
      manifest.rootName === 'uploads' &&
      Number.isSafeInteger(manifest.fileCount) &&
      manifest.fileCount >= 0 &&
      Number.isSafeInteger(manifest.totalBytes) &&
      manifest.totalBytes >= 0 &&
      /^[0-9a-f]{64}$/.test(manifest.entriesSha256 || '') &&
      Array.isArray(manifest.entries) &&
      manifest.entries.length === manifest.fileCount,
    `${label} uploads manifest safety contract is invalid`,
  );

  const referenceReportPath = checkedPath(
    metadata.mediaReferenceVerification,
    setDir,
    'file',
    `${label} media reference verification`,
  );
  invariant(
    referenceReportPath === path.join(
      setDir,
      'metadata',
      'media-reference-verification.json',
    ),
    `${label} media reference verification path is malformed`,
  );
  const referenceReport = signedJson(
    referenceReportPath,
    `${label} media reference verification`,
  );
  await verifyArtifact(
    referenceReportPath,
    metadata.mediaReferenceVerificationSha256,
    `${label} media reference verification`,
    false,
  );
  invariant(
    referenceReport.schemaVersion === 1 &&
      referenceReport.verificationType === 'menorah-media-database-references' &&
      referenceReport.manifestEntriesSha256 === manifest.entriesSha256,
    `${label} media reference verification is not linked to its manifest`,
  );
  if (production) {
    invariant(
      referenceReport.valid === true &&
        referenceReport.cloudinaryReferenceCount === 0 &&
        Array.isArray(referenceReport.violations) &&
        referenceReport.violations.length === 0,
      `${label} production media database references were not verified`,
    );
  }
  return {
    metadata,
    setDir,
    sourceArchive,
    uploads,
    manifestPath,
    referenceReportPath,
  };
}

async function validateLatestMarker() {
  const markerFile = path.join(root, 'metadata', `latest-success-${backupType}.json`);
  const marker = signedJson(markerFile, `latest ${backupType} marker`);
  invariant(
    marker.schemaVersion === 3 &&
      marker.artifactType === 'mongodb-full-instance-oplog' &&
      marker.backupType === backupType &&
      marker.oplog === true &&
      marker.directProductionRestoreAllowed === false,
    `latest ${backupType} marker safety contract is invalid`,
  );
  const markerEpoch = parseCompactTimestamp(marker.timestamp, `latest ${backupType} marker`);
  requireFresh(markerEpoch, maxAgeMs, `latest ${backupType} backup`);
  const setDir = checkedPath(marker.path, root, 'directory', `latest ${backupType} set`);
  invariant(
    setDir === path.join(root, backupType, marker.timestamp),
    `latest ${backupType} set path does not match its marker`,
  );
  const archive = checkedPath(
    marker.mongoArchive,
    setDir,
    'file',
    `latest ${backupType} MongoDB archive`,
  );
  const metadataFile = checkedPath(
    marker.metadataFile,
    setDir,
    'file',
    `latest ${backupType} metadata`,
  );
  const source = await validateSourceMetadata(
    metadataFile,
    archive,
    marker.mongoArchiveSha256,
    `latest ${backupType}`,
  );
  invariant(
    marker.encrypted === source.metadata.encrypted,
    `latest ${backupType} marker encryption state is inconsistent`,
  );
  invariant(
    marker.uploadsArchive === source.metadata.uploadsArchive,
    `latest ${backupType} marker uploads path is inconsistent`,
  );
  invariant(
    marker.uploadsManifest === source.metadata.uploadsManifest &&
      marker.mediaReferenceVerification === source.metadata.mediaReferenceVerification,
    `latest ${backupType} marker media evidence is inconsistent`,
  );
  return source;
}

async function validateRestoreChain() {
  const markerFile = path.join(root, 'restore-tests', 'latest-success.json');
  const marker = signedJson(markerFile, 'restore-test marker');
  invariant(
    marker.schemaVersion === 2 &&
      marker.mode === 'restore-test' &&
      marker.sanitizedNamespace === 'menorah.*' &&
      marker.mediaReferencesVerified === true,
    'restore-test marker safety contract is invalid',
  );
  const testedAt = parseIsoTimestamp(marker.timestamp, 'restore-test marker');
  requireFresh(testedAt, restoreMaxAgeMs, 'restore-test evidence');

  const sourceArchive = checkedPath(marker.archive, root, 'file', 'restore-test source archive');
  invariant(
    !isWithin(sourceArchive, path.join(root, 'restore-tests')),
    'restore-test source archive is inside restore-tests',
  );
  const sourceMetadata = path.join(
    path.dirname(path.dirname(sourceArchive)),
    'metadata',
    'metadata.json',
  );
  const source = await validateSourceMetadata(
    sourceMetadata,
    sourceArchive,
    marker.archiveSha256,
    'restore-test source',
  );
  invariant(
    marker.uploadsArchive === source.metadata.uploadsArchive &&
      marker.uploadsArchiveSha256 === source.metadata.uploadsArchiveSha256 &&
      marker.mediaManifest === source.metadata.uploadsManifest &&
      marker.mediaManifestSha256 === source.metadata.uploadsManifestSha256,
    'restore-test media evidence does not match its source backup',
  );
  const sourceEpoch = parseCompactTimestamp(
    source.metadata.timestamp,
    'restore-test source metadata',
  );
  requireFresh(sourceEpoch, restoreMaxAgeMs, 'restore-test source backup');
  invariant(sourceEpoch <= testedAt + futureSkewMs, 'restore-test predates its source backup');

  const sanitizedRoot = path.join(root, 'restore-tests', 'sanitized');
  const sanitizedArchive = checkedPath(
    marker.sanitizedArchive,
    sanitizedRoot,
    'file',
    'sanitized restore archive',
  );
  invariant(
    path.dirname(sanitizedArchive) === sanitizedRoot &&
      path.basename(sanitizedArchive) ===
        `${marker.archiveSha256}.menorah.archive.gz.enc`,
    'sanitized restore archive path is malformed',
  );
  await verifyArtifact(
    sanitizedArchive,
    marker.sanitizedArchiveSha256,
    'sanitized restore archive',
  );
  const metadataFile = `${sanitizedArchive}.metadata.json`;
  const metadata = signedJson(metadataFile, 'sanitized restore metadata');
  invariant(
    metadata.schemaVersion === 1 &&
      metadata.artifactType === 'menorah-sanitized-restore' &&
      metadata.sourceArtifactType === 'mongodb-full-instance-oplog' &&
      JSON.stringify(metadata.namespaceAllowlist) === JSON.stringify(['menorah.*']) &&
      metadata.oplogReplayVerified === true &&
      metadata.productionOplogReplayAllowed === false &&
      metadata.encrypted === true,
    'sanitized restore metadata safety contract is invalid',
  );
  invariant(
    metadata.sourceArchive === source.sourceArchive &&
      metadata.sourceArchiveSha256 === marker.archiveSha256 &&
      metadata.sourceBackupGitSha === source.metadata.deployedReleaseSha,
    'sanitized restore metadata is not linked to its signed source',
  );
  invariant(
    metadata.derivedArchive === sanitizedArchive &&
      metadata.derivedArchiveSha256 === marker.sanitizedArchiveSha256,
    'sanitized restore metadata is not linked to its derived bytes',
  );
  invariant(
    metadata.databaseToolsVersion === source.metadata.databaseToolsVersion &&
      metadata.mongoServerVersion === source.metadata.mongoServerVersion &&
      metadata.mongoFeatureCompatibilityVersion ===
        source.metadata.mongoFeatureCompatibilityVersion,
    'sanitized restore version provenance differs from its source',
  );
  const createdAt = parseIsoTimestamp(metadata.createdAt, 'sanitized restore metadata');
  requireFresh(createdAt, restoreMaxAgeMs, 'sanitized restore artifact');
  invariant(
    createdAt >= sourceEpoch - futureSkewMs && Math.abs(testedAt - createdAt) <= 10 * 60 * 1000,
    'sanitized restore timestamps are not coherent with the source and marker',
  );
  return sanitizedArchive;
}

(async () => {
  invariant(Buffer.byteLength(hmacKey, 'utf8') >= 32, 'backup integrity HMAC key is too short');
  const latest = await validateLatestMarker();
  let sanitized = null;
  if (checkRestore) sanitized = await validateRestoreChain();
  process.stdout.write(
    `signed backup chain OK: ${latest.sourceArchive}` +
      (sanitized ? `; sanitized restore artifact ${sanitized}` : ''),
  );
})().catch((error) => {
  process.stderr.write(`signed backup chain validation failed: ${error.message}\n`);
  process.exit(1);
});
NODE
    )"; then
      record_failure "${chain_summary}"
      chain_summary=""
    fi
  fi
fi

if [[ -e "${BACKUP_RAID_DEVICE}" ]]; then
  raid_detail=""
  if command -v mdadm >/dev/null 2>&1; then
    raid_detail="$(mdadm --detail "${BACKUP_RAID_DEVICE}" 2>&1 || true)"
  fi

  if [[ -n "${raid_detail}" && ! "${raid_detail}" =~ must\ be\ super-user ]]; then
    if grep -Eiq 'State :.*(degraded|inactive)|Failed Devices : [1-9]|Active Devices : [01]' \
      <<< "${raid_detail}"; then
      record_failure "RAID health is not clean for ${BACKUP_RAID_DEVICE}"
    fi
  elif [[ -r /proc/mdstat ]]; then
    mdstat="$(cat /proc/mdstat)"
    if grep -Eq '\[[U_]*_[U_]*\]' <<< "${mdstat}"; then
      record_failure "RAID health is degraded according to /proc/mdstat"
    elif ! grep -Eq '\[[U]+\]' <<< "${mdstat}"; then
      record_failure "RAID health could not be confirmed from /proc/mdstat"
    fi
  else
    record_failure "Cannot inspect RAID health for ${BACKUP_RAID_DEVICE}"
  fi
elif is_true "${BACKUP_EXPECT_RAID}"; then
  record_failure "Expected RAID device is missing: ${BACKUP_RAID_DEVICE}"
fi

if [[ "${#failures[@]}" -gt 0 ]]; then
  printf 'Backup health check failed:\n' >&2
  printf -- '- %s\n' "${failures[@]}" >&2
  push_status "down" "Backup health failed: ${failures[*]}"
  exit 1
fi

echo "Backup health OK: ${chain_summary}"
push_status "up" "Backup health OK"
