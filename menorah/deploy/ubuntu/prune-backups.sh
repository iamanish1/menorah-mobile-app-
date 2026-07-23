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
BACKUP_REQUIRE_MOUNT="${BACKUP_REQUIRE_MOUNT:-}"
SIX_HOURLY_RETENTION_DAYS="${SIX_HOURLY_RETENTION_DAYS:-7}"
MANUAL_RETENTION_DAYS="${MANUAL_RETENTION_DAYS:-30}"
DAILY_RETENTION_DAYS="${DAILY_RETENTION_DAYS:-30}"
WEEKLY_RETENTION_DAYS="${WEEKLY_RETENTION_DAYS:-84}"
MONTHLY_RETENTION_DAYS="${MONTHLY_RETENTION_DAYS:-366}"
SANITIZED_RETENTION_DAYS="${SANITIZED_RETENTION_DAYS:-${MONTHLY_RETENTION_DAYS}}"
SANITIZED_ORPHAN_GRACE_HOURS="${SANITIZED_ORPHAN_GRACE_HOURS:-24}"

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
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
    echo "${name} must be a positive integer." >&2
    exit 1
  fi
}

require_positive_integer "MANUAL_RETENTION_DAYS" "${MANUAL_RETENTION_DAYS}"
require_positive_integer "SIX_HOURLY_RETENTION_DAYS" "${SIX_HOURLY_RETENTION_DAYS}"
require_positive_integer "DAILY_RETENTION_DAYS" "${DAILY_RETENTION_DAYS}"
require_positive_integer "WEEKLY_RETENTION_DAYS" "${WEEKLY_RETENTION_DAYS}"
require_positive_integer "MONTHLY_RETENTION_DAYS" "${MONTHLY_RETENTION_DAYS}"
require_positive_integer "SANITIZED_RETENTION_DAYS" "${SANITIZED_RETENTION_DAYS}"
require_positive_integer "SANITIZED_ORPHAN_GRACE_HOURS" "${SANITIZED_ORPHAN_GRACE_HOURS}"

: "${BACKUP_INTEGRITY_HMAC_KEY:?BACKUP_INTEGRITY_HMAC_KEY is required for safe linked pruning}"
if (( ${#BACKUP_INTEGRITY_HMAC_KEY} < 32 )); then
  echo "BACKUP_INTEGRITY_HMAC_KEY must contain at least 32 characters." >&2
  exit 1
fi

if [[ -z "${BACKUP_REQUIRE_MOUNT}" && "${MENORAH_BACKUP_ROOT}" == /mnt/menorah-backups* ]]; then
  BACKUP_REQUIRE_MOUNT=true
fi

# Lock order is always deployment first, then backup. backup-now invokes this
# script with both descriptors inherited; standalone/systemd runs acquire them.
mkdir -p -- "${MENORAH_DEPLOY_STATE_ROOT}"
acquire_or_confirm_lock \
  9 \
  "${MENORAH_DEPLOY_STATE_ROOT}/.deploy.lock" \
  "deployment, rollback, bootstrap, or restore"

if is_true "${BACKUP_REQUIRE_MOUNT}" \
  && ! findmnt --mountpoint "${MENORAH_BACKUP_ROOT}" >/dev/null 2>&1; then
  echo "Backup root is not mounted: ${MENORAH_BACKUP_ROOT}" >&2
  echo "Refusing to prune an OS-disk fallback path." >&2
  exit 1
fi
if [[ ! -d "${MENORAH_BACKUP_ROOT}/metadata" ]]; then
  echo "Backup metadata directory does not exist: ${MENORAH_BACKUP_ROOT}/metadata" >&2
  exit 1
fi

acquire_or_confirm_lock \
  8 \
  "${MENORAH_BACKUP_ROOT}/metadata/.backup.lock" \
  "backup, restore, prune, or health check"

BACKUP_ROOT_REAL="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")"
PRUNE_PLAN="$(mktemp "${MENORAH_DEPLOY_STATE_ROOT}/.backup-prune-plan.XXXXXX")"
cleanup() {
  rm -f -- "${PRUNE_PLAN}"
}
trap cleanup EXIT

BACKUP_PRUNE_ROOT="${BACKUP_ROOT_REAL}" \
BACKUP_PRUNE_MANUAL_DAYS="${MANUAL_RETENTION_DAYS}" \
BACKUP_PRUNE_SIX_HOURLY_DAYS="${SIX_HOURLY_RETENTION_DAYS}" \
BACKUP_PRUNE_DAILY_DAYS="${DAILY_RETENTION_DAYS}" \
BACKUP_PRUNE_WEEKLY_DAYS="${WEEKLY_RETENTION_DAYS}" \
BACKUP_PRUNE_MONTHLY_DAYS="${MONTHLY_RETENTION_DAYS}" \
BACKUP_PRUNE_SANITIZED_DAYS="${SANITIZED_RETENTION_DAYS}" \
BACKUP_PRUNE_ORPHAN_GRACE_HOURS="${SANITIZED_ORPHAN_GRACE_HOURS}" \
  node - <<'NODE' > "${PRUNE_PLAN}"
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = fs.realpathSync(process.env.BACKUP_PRUNE_ROOT);
const hmacKey = process.env.BACKUP_INTEGRITY_HMAC_KEY || '';
const retentionDays = new Map([
  ['manual', Number(process.env.BACKUP_PRUNE_MANUAL_DAYS)],
  ['six-hourly', Number(process.env.BACKUP_PRUNE_SIX_HOURLY_DAYS)],
  ['daily', Number(process.env.BACKUP_PRUNE_DAILY_DAYS)],
  ['weekly', Number(process.env.BACKUP_PRUNE_WEEKLY_DAYS)],
  ['monthly', Number(process.env.BACKUP_PRUNE_MONTHLY_DAYS)],
]);
const sanitizedRetentionMs =
  Number(process.env.BACKUP_PRUNE_SANITIZED_DAYS) * 24 * 60 * 60 * 1000;
const orphanGraceMs =
  Number(process.env.BACKUP_PRUNE_ORPHAN_GRACE_HOURS) * 60 * 60 * 1000;
const protectedSets = new Set();
const protectedSanitized = new Set();
const sourceSetCandidates = new Set();
const sanitizedCandidates = new Set();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function hasControlCharacters(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function isWithin(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function normalizedPath(candidate, parent, label) {
  invariant(
    typeof candidate === 'string' &&
      path.isAbsolute(candidate) &&
      !hasControlCharacters(candidate),
    `${label} path is malformed`,
  );
  const normalized = path.resolve(candidate);
  invariant(normalized === candidate, `${label} path is not canonical`);
  invariant(isWithin(normalized, parent), `${label} escaped the backup root`);
  return normalized;
}

function checkedPath(candidate, parent, kind, label) {
  const normalized = normalizedPath(candidate, parent, label);
  const resolved = fs.realpathSync(normalized);
  const stat = fs.lstatSync(normalized);
  invariant(!stat.isSymbolicLink(), `${label} must not be a symbolic link`);
  invariant(resolved === normalized, `${label} resolves through a symbolic link`);
  invariant(isWithin(resolved, parent), `${label} escaped the backup root`);
  if (kind === 'file') invariant(stat.isFile(), `${label} is not a regular file`);
  if (kind === 'directory') invariant(stat.isDirectory(), `${label} is not a directory`);
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

function sourceSetFromArchive(candidate, label, mustExist = true) {
  const archive = mustExist
    ? checkedPath(candidate, root, 'file', label)
    : normalizedPath(candidate, root, label);
  invariant(
    !isWithin(archive, path.join(root, 'restore-tests')),
    `${label} is inside restore-tests`,
  );
  const setDir = path.dirname(path.dirname(archive));
  const relative = path.relative(root, setDir).split(path.sep);
  invariant(
    relative.length === 2 &&
      ['manual', 'six-hourly', 'daily', 'weekly', 'monthly'].includes(relative[0]) &&
      /^\d{8}T\d{6}Z$/.test(relative[1]) &&
      path.dirname(archive) === path.join(setDir, 'mongo') &&
      path.basename(archive) ===
        `menorah-mongo-${relative[1]}.archive.gz${archive.endsWith('.enc') ? '.enc' : ''}`,
    `${label} path is not a completed backup archive`,
  );
  return { archive, setDir, backupType: relative[0], timestamp: relative[1] };
}

function validateChecksumRecord(artifact, expectedSha, label) {
  invariant(/^[0-9a-f]{64}$/.test(expectedSha || ''), `${label} digest is malformed`);
  const sidecar = checkedPath(`${artifact}.sha256`, root, 'file', `${label} checksum`);
  const match = /^([0-9a-f]{64})[ \t]+(.+)$/.exec(fs.readFileSync(sidecar, 'utf8').trim());
  invariant(match, `${label} checksum is malformed`);
  invariant(match[1] === expectedSha, `${label} checksum digest differs from metadata`);
  invariant(
    match[2] === artifact || match[2] === path.basename(artifact),
    `${label} checksum names a different artifact`,
  );
}

function validateSourceMetadata(metadataFile, archive, expectedSha, label) {
  const source = sourceSetFromArchive(archive, `${label} archive`);
  const metadataPath = checkedPath(metadataFile, source.setDir, 'file', `${label} metadata`);
  invariant(
    metadataPath === path.join(source.setDir, 'metadata', 'metadata.json'),
    `${label} metadata is outside its backup set`,
  );
  const metadata = signedJson(metadataPath, `${label} metadata`);
  invariant(
    metadata.schemaVersion === 3 &&
      metadata.artifactType === 'mongodb-full-instance-oplog' &&
      metadata.scope === 'full-instance' &&
      metadata.backupType === source.backupType &&
      metadata.timestamp === source.timestamp &&
      metadata.mongoArchive === source.archive &&
      metadata.mongoArchiveSha256 === expectedSha &&
      metadata.oplog === true &&
      metadata.containsSystemIdentityData === true &&
      metadata.directProductionRestoreAllowed === false &&
      metadata.requiredSanitizationNamespace === 'menorah.*' &&
      metadata.mediaStorageBackend === 'local' &&
      metadata.mediaConsistencyContract === 'immutable-write-before-reference' &&
      metadata.uploadsRequired === true,
    `${label} metadata safety contract is invalid`,
  );
  validateChecksumRecord(source.archive, expectedSha, `${label} archive`);
  const uploads = checkedPath(
    metadata.uploadsArchive,
    source.setDir,
    'file',
    `${label} uploads archive`,
  );
  invariant(
    path.dirname(uploads) === path.join(source.setDir, 'uploads') &&
      /^uploads-\d{8}T\d{6}Z\.tar\.gz(?:\.enc)?$/.test(path.basename(uploads)),
    `${label} uploads archive path is invalid`,
  );
  validateChecksumRecord(
    uploads,
    metadata.uploadsArchiveSha256,
    `${label} uploads archive`,
  );
  const manifestPath = checkedPath(
    metadata.uploadsManifest,
    source.setDir,
    'file',
    `${label} uploads manifest`,
  );
  invariant(
    manifestPath === path.join(source.setDir, 'metadata', 'uploads-manifest.json'),
    `${label} uploads manifest path is invalid`,
  );
  const manifest = signedJson(manifestPath, `${label} uploads manifest`);
  validateChecksumRecord(
    manifestPath,
    metadata.uploadsManifestSha256,
    `${label} uploads manifest`,
  );
  invariant(
    manifest.schemaVersion === 1 &&
      manifest.artifactType === 'menorah-immutable-media-manifest' &&
      manifest.rootName === 'uploads' &&
      Array.isArray(manifest.entries) &&
      manifest.entries.length === manifest.fileCount &&
      /^[0-9a-f]{64}$/.test(manifest.entriesSha256 || ''),
    `${label} uploads manifest safety contract is invalid`,
  );
  const reportPath = checkedPath(
    metadata.mediaReferenceVerification,
    source.setDir,
    'file',
    `${label} media reference verification`,
  );
  invariant(
    reportPath === path.join(
      source.setDir,
      'metadata',
      'media-reference-verification.json',
    ),
    `${label} media reference verification path is invalid`,
  );
  const report = signedJson(reportPath, `${label} media reference verification`);
  validateChecksumRecord(
    reportPath,
    metadata.mediaReferenceVerificationSha256,
    `${label} media reference verification`,
  );
  invariant(
    report.schemaVersion === 1 &&
      report.verificationType === 'menorah-media-database-references' &&
      report.valid === true &&
      report.cloudinaryReferenceCount === 0 &&
      report.manifestEntriesSha256 === manifest.entriesSha256 &&
      Array.isArray(report.violations) &&
      report.violations.length === 0,
    `${label} media reference verification safety contract is invalid`,
  );
  return { ...source, metadata };
}

function validateLatestMarker(backupType) {
  const marker = path.join(root, 'metadata', `latest-success-${backupType}.json`);
  const hmac = `${marker}.hmac-sha256`;
  const markerExists = fs.existsSync(marker);
  const hmacExists = fs.existsSync(hmac);
  invariant(markerExists === hmacExists, `latest ${backupType} marker is only partially published`);
  if (!markerExists) return;

  const value = signedJson(marker, `latest ${backupType} marker`);
  invariant(
    value.schemaVersion === 3 &&
      value.artifactType === 'mongodb-full-instance-oplog' &&
      value.backupType === backupType &&
      value.oplog === true &&
      value.directProductionRestoreAllowed === false &&
      /^[0-9a-f]{64}$/.test(value.mongoArchiveSha256 || ''),
    `latest ${backupType} marker safety contract is invalid`,
  );
  const setDir = checkedPath(value.path, root, 'directory', `latest ${backupType} set`);
  invariant(
    setDir === path.join(root, backupType, value.timestamp) &&
      /^\d{8}T\d{6}Z$/.test(value.timestamp || ''),
    `latest ${backupType} marker path is invalid`,
  );
  const source = validateSourceMetadata(
    value.metadataFile,
    value.mongoArchive,
    value.mongoArchiveSha256,
    `latest ${backupType}`,
  );
  invariant(source.setDir === setDir, `latest ${backupType} marker links different backup sets`);
  invariant(
    value.uploadsArchive === source.metadata.uploadsArchive &&
      value.uploadsManifest === source.metadata.uploadsManifest &&
      value.mediaReferenceVerification === source.metadata.mediaReferenceVerification,
    `latest ${backupType} marker media linkage differs`,
  );
  protectedSets.add(setDir);
}

function validateSanitizedMetadata(archive, label) {
  const sanitizedRoot = path.join(root, 'restore-tests', 'sanitized');
  const checkedArchive = checkedPath(archive, sanitizedRoot, 'file', `${label} archive`);
  invariant(
    path.dirname(checkedArchive) === sanitizedRoot &&
      /^[0-9a-f]{64}\.menorah\.archive\.gz\.enc$/.test(path.basename(checkedArchive)),
    `${label} archive path is malformed`,
  );
  const metadataFile = `${checkedArchive}.metadata.json`;
  const metadata = signedJson(metadataFile, `${label} metadata`);
  invariant(
    metadata.schemaVersion === 1 &&
      metadata.artifactType === 'menorah-sanitized-restore' &&
      metadata.sourceArtifactType === 'mongodb-full-instance-oplog' &&
      JSON.stringify(metadata.namespaceAllowlist) === JSON.stringify(['menorah.*']) &&
      metadata.derivedArchive === checkedArchive &&
      /^[0-9a-f]{64}$/.test(metadata.derivedArchiveSha256 || '') &&
      metadata.oplogReplayVerified === true &&
      metadata.productionOplogReplayAllowed === false &&
      metadata.encrypted === true,
    `${label} metadata safety contract is invalid`,
  );
  const source = sourceSetFromArchive(metadata.sourceArchive, `${label} source`, false);
  invariant(
    /^[0-9a-f]{64}$/.test(metadata.sourceArchiveSha256 || '') &&
      path.basename(checkedArchive) ===
        `${metadata.sourceArchiveSha256}.menorah.archive.gz.enc`,
    `${label} source linkage is malformed`,
  );
  validateChecksumRecord(
    checkedArchive,
    metadata.derivedArchiveSha256,
    `${label} archive`,
  );
  const createdAt = Date.parse(metadata.createdAt);
  invariant(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(metadata.createdAt || '') &&
      Number.isFinite(createdAt),
    `${label} creation timestamp is invalid`,
  );
  return { archive: checkedArchive, metadata, source, createdAt };
}

function validateRestoreMarker() {
  const marker = path.join(root, 'restore-tests', 'latest-success.json');
  const hmac = `${marker}.hmac-sha256`;
  const markerExists = fs.existsSync(marker);
  const hmacExists = fs.existsSync(hmac);
  invariant(markerExists === hmacExists, 'restore-test marker is only partially published');
  if (!markerExists) return;

  const value = signedJson(marker, 'restore-test marker');
  invariant(
    value.schemaVersion === 2 &&
      value.mode === 'restore-test' &&
      value.sanitizedNamespace === 'menorah.*' &&
      value.mediaReferencesVerified === true &&
      /^[0-9a-f]{64}$/.test(value.archiveSha256 || '') &&
      /^[0-9a-f]{64}$/.test(value.sanitizedArchiveSha256 || ''),
    'restore-test marker safety contract is invalid',
  );
  const source = sourceSetFromArchive(value.archive, 'restore-test source');
  const sourceMetadata = validateSourceMetadata(
    path.join(source.setDir, 'metadata', 'metadata.json'),
    source.archive,
    value.archiveSha256,
    'restore-test source',
  );
  invariant(
    value.uploadsArchive === sourceMetadata.metadata.uploadsArchive &&
      value.uploadsArchiveSha256 === sourceMetadata.metadata.uploadsArchiveSha256 &&
      value.mediaManifest === sourceMetadata.metadata.uploadsManifest &&
      value.mediaManifestSha256 === sourceMetadata.metadata.uploadsManifestSha256,
    'restore-test marker media linkage differs',
  );
  const sanitized = validateSanitizedMetadata(
    value.sanitizedArchive,
    'restore-test sanitized artifact',
  );
  invariant(
    sanitized.metadata.sourceArchive === source.archive &&
      sanitized.metadata.sourceArchiveSha256 === value.archiveSha256 &&
      sanitized.metadata.derivedArchiveSha256 === value.sanitizedArchiveSha256,
    'restore-test marker and sanitized metadata linkage differ',
  );
  protectedSets.add(source.setDir);
  protectedSanitized.add(sanitized.archive);
}

function inventorySourceSets() {
  for (const [backupType, days] of retentionDays) {
    const typeDir = path.join(root, backupType);
    if (!fs.existsSync(typeDir)) continue;
    checkedPath(typeDir, root, 'directory', `${backupType} backup directory`);
    const sets = fs
      .readdirSync(typeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{8}T\d{6}Z$/.test(entry.name))
      .map((entry) =>
        checkedPath(path.join(typeDir, entry.name), typeDir, 'directory', `${backupType} set`),
      )
      .sort();
    if (sets.length === 0) continue;

    // Even if a marker is absent, retain the lexically newest timestamped set.
    // Signed markers may validly protect an older set during operational repair.
    protectedSets.add(sets[sets.length - 1]);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    for (const setDir of sets) {
      if (!protectedSets.has(setDir) && fs.statSync(setDir).mtimeMs < cutoff) {
        sourceSetCandidates.add(setDir);
      }
    }
  }
}

function inventorySanitizedArtifacts() {
  const sanitizedRoot = path.join(root, 'restore-tests', 'sanitized');
  if (!fs.existsSync(sanitizedRoot)) return;
  checkedPath(sanitizedRoot, root, 'directory', 'sanitized artifact directory');
  const names = fs.readdirSync(sanitizedRoot);
  const archivePattern = /^[0-9a-f]{64}\.menorah\.archive\.gz\.enc$/;
  const knownArchiveBases = new Set();

  for (const name of names) {
    if (archivePattern.test(name)) knownArchiveBases.add(name);
    const sidecar = /^([0-9a-f]{64}\.menorah\.archive\.gz\.enc)\.(?:sha256|metadata\.json|metadata\.json\.hmac-sha256)$/.exec(
      name,
    );
    if (sidecar) knownArchiveBases.add(sidecar[1]);
  }

  for (const base of knownArchiveBases) {
    const archive = path.join(sanitizedRoot, base);
    if (!fs.existsSync(archive)) {
      const sidecars = [
        `${archive}.sha256`,
        `${archive}.metadata.json`,
        `${archive}.metadata.json.hmac-sha256`,
      ].filter((file) => fs.existsSync(file));
      invariant(
        sidecars.every((file) => {
          const checked = checkedPath(file, sanitizedRoot, 'file', 'orphan sanitized sidecar');
          return Date.now() - fs.statSync(checked).mtimeMs > orphanGraceMs;
        }),
        `partial sanitized artifact is still inside its ${process.env.BACKUP_PRUNE_ORPHAN_GRACE_HOURS}h grace period`,
      );
      sanitizedCandidates.add(archive);
      continue;
    }

    const requiredSidecars = [
      `${archive}.sha256`,
      `${archive}.metadata.json`,
      `${archive}.metadata.json.hmac-sha256`,
    ];
    if (requiredSidecars.some((file) => !fs.existsSync(file))) {
      const existingParts = [archive, ...requiredSidecars].filter((file) => fs.existsSync(file));
      invariant(
        existingParts.every((file) => {
          const checked = checkedPath(file, sanitizedRoot, 'file', 'partial sanitized artifact');
          return Date.now() - fs.statSync(checked).mtimeMs > orphanGraceMs;
        }),
        `partial sanitized artifact is still inside its ${process.env.BACKUP_PRUNE_ORPHAN_GRACE_HOURS}h grace period`,
      );
      sanitizedCandidates.add(archive);
      continue;
    }

    const artifact = validateSanitizedMetadata(archive, `sanitized artifact ${base}`);
    if (protectedSanitized.has(artifact.archive)) continue;
    const sourceExists = fs.existsSync(artifact.source.archive);
    if (sourceExists) {
      sourceSetFromArchive(artifact.source.archive, `sanitized artifact ${base} source`);
    }
    if (
      (!sourceExists && Date.now() - artifact.createdAt > orphanGraceMs) ||
      sourceSetCandidates.has(artifact.source.setDir) ||
      Date.now() - artifact.createdAt > sanitizedRetentionMs
    ) {
      sanitizedCandidates.add(artifact.archive);
    }
  }
}

invariant(Buffer.byteLength(hmacKey, 'utf8') >= 32, 'backup integrity HMAC key is too short');
for (const backupType of retentionDays.keys()) validateLatestMarker(backupType);
validateRestoreMarker();
inventorySourceSets();
inventorySanitizedArtifacts();

for (const artifact of [...sanitizedCandidates].sort()) {
  invariant(!protectedSanitized.has(artifact), 'refusing to prune the latest restore-test artifact');
  process.stdout.write(`SANITIZED\t${artifact}\n`);
}
for (const setDir of [...sourceSetCandidates].sort()) {
  invariant(!protectedSets.has(setDir), 'refusing to prune a protected backup set');
  process.stdout.write(`SET\t${setDir}\n`);
}
NODE

while IFS=$'\t' read -r action target; do
  [[ -n "${action}" && -n "${target}" ]] || continue
  case "${action}" in
    SANITIZED)
      target_resolved="$(realpath -m -- "${target}")"
      target_name="$(basename -- "${target_resolved}")"
      if [[ "$(dirname -- "${target_resolved}")" != "${BACKUP_ROOT_REAL}/restore-tests/sanitized" \
        || ! "${target_name}" =~ ^[0-9a-f]{64}\.menorah\.archive\.gz\.enc$ ]]; then
        echo "Refusing to prune an unsafe sanitized artifact path: ${target}" >&2
        exit 1
      fi
      echo "Pruning linked sanitized restore artifact: ${target_resolved}"
      rm -f -- \
        "${target_resolved}" \
        "${target_resolved}.sha256" \
        "${target_resolved}.metadata.json" \
        "${target_resolved}.metadata.json.hmac-sha256"
      ;;
    SET)
      target_resolved="$(realpath -e -- "${target}" 2>/dev/null || true)"
      target_name="$(basename -- "${target_resolved}")"
      target_parent="$(dirname -- "${target_resolved}")"
      target_type="$(basename -- "${target_parent}")"
      if [[ -z "${target_resolved}" \
        || "$(dirname -- "${target_parent}")" != "${BACKUP_ROOT_REAL}" \
        || ! "${target_type}" =~ ^(manual|six-hourly|daily|weekly|monthly)$ \
        || ! "${target_name}" =~ ^[0-9]{8}T[0-9]{6}Z$ \
        || -L "${target_resolved}" \
        || ! -d "${target_resolved}" ]]; then
        echo "Refusing to prune an unsafe backup-set path: ${target}" >&2
        exit 1
      fi
      echo "Pruning expired ${target_type} backup set: ${target_resolved}"
      rm -rf -- "${target_resolved}"
      ;;
    *)
      echo "Refusing an unknown backup prune-plan action: ${action}" >&2
      exit 1
      ;;
  esac
done < "${PRUNE_PLAN}"

echo "Backup pruning complete under ${MENORAH_BACKUP_ROOT}"
