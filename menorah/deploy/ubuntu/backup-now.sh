#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
BACKUP_TYPE="${1:-manual}"

case "${BACKUP_TYPE}" in
  manual|six-hourly|daily|weekly|monthly) ;;
  *)
    echo "Usage: backup-now.sh [manual|six-hourly|daily|weekly|monthly]" >&2
    exit 2
    ;;
esac

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
MENORAH_DATA_ROOT="${MENORAH_DATA_ROOT:-/opt/menorah/data}"
BACKUP_REQUIRE_MOUNT="${BACKUP_REQUIRE_MOUNT:-}"
BACKUP_REQUIRE_ENCRYPTION="${BACKUP_REQUIRE_ENCRYPTION:-}"
BACKUP_RUN_AS="${BACKUP_RUN_AS:-$(id -u):$(id -g)}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${MENORAH_BACKUP_ROOT}/${BACKUP_TYPE}/${STAMP}"
MONGO_ARCHIVE="${OUT_DIR}/mongo/menorah-mongo-${STAMP}.archive.gz"
UPLOAD_ARCHIVE="${OUT_DIR}/uploads/uploads-${STAMP}.tar.gz"
UPLOADS_MANIFEST="${OUT_DIR}/metadata/uploads-manifest.json"
MEDIA_REFERENCE_REPORT="${OUT_DIR}/metadata/media-reference-verification.json"
MEDIA_SNAPSHOT_ROOT=""

cleanup_media_snapshot() {
  local status="$?"
  if [[ -n "${MEDIA_SNAPSHOT_ROOT}" && -d "${MEDIA_SNAPSHOT_ROOT}" ]]; then
    local snapshot_real snapshot_parent_real
    snapshot_real="$(realpath -e -- "${MEDIA_SNAPSHOT_ROOT}" 2>/dev/null || true)"
    snapshot_parent_real="$(realpath -e -- "${MENORAH_DATA_ROOT}/.media-backup-snapshots" 2>/dev/null || true)"
    if [[ -z "${snapshot_real}" || -z "${snapshot_parent_real}" \
      || "${snapshot_real}" != "${snapshot_parent_real}"/* ]]; then
      echo "Refusing unsafe media snapshot cleanup path: ${MEDIA_SNAPSHOT_ROOT}" >&2
      exit 1
    fi
    rm -rf -- "${snapshot_real}"
  fi
  trap - EXIT
  exit "${status}"
}
trap cleanup_media_snapshot EXIT

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -z "${BACKUP_REQUIRE_MOUNT}" && "${MENORAH_BACKUP_ROOT}" == /mnt/menorah-backups* ]]; then
  BACKUP_REQUIRE_MOUNT=true
fi

if is_true "${BACKUP_REQUIRE_MOUNT}"; then
  if ! findmnt --mountpoint "${MENORAH_BACKUP_ROOT}" >/dev/null 2>&1; then
    echo "Backup root is not mounted: ${MENORAH_BACKUP_ROOT}" >&2
    echo "Refusing to write backups to the OS disk fallback path." >&2
    exit 1
  fi
else
  mkdir -p "${MENORAH_BACKUP_ROOT}"
fi

if [[ "${NODE_ENV:-}" == "production" ]] || is_true "${BACKUP_REQUIRE_ENCRYPTION}"; then
  : "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required for production backups}"
  : "${BACKUP_INTEGRITY_HMAC_KEY:?BACKUP_INTEGRITY_HMAC_KEY is required for production backup provenance}"
  if (( ${#BACKUP_INTEGRITY_HMAC_KEY} < 32 )); then
    echo "BACKUP_INTEGRITY_HMAC_KEY must contain at least 32 characters." >&2
    exit 1
  fi
fi

if [[ "${NODE_ENV:-}" == "production" && "${MEDIA_STORAGE_BACKEND:-}" != "local" ]]; then
  echo "Production backup requires MEDIA_STORAGE_BACKEND=local." >&2
  exit 1
fi
if [[ "${NODE_ENV:-}" == "production" && "${UPLOAD_PATH:-}" != "/app/uploads" ]]; then
  echo "Production backup requires the shared container UPLOAD_PATH=/app/uploads." >&2
  exit 1
fi

if [[ ! "${BACKUP_RUN_AS}" =~ ^[0-9]+:[0-9]+$ ]]; then
  echo "BACKUP_RUN_AS must be a numeric uid:gid pair." >&2
  exit 1
fi

: "${MONGODB_BACKUP_URI:?MONGODB_BACKUP_URI is required}"
BACKUP_URI_TO_VALIDATE="${MONGODB_BACKUP_URI}" \
BACKUP_EXPECTED_REPLICA_SET="${MONGODB_REPLICA_SET_NAME:-menorah-rs}" \
  node - <<'NODE'
const value = process.env.BACKUP_URI_TO_VALIDATE;
let parsed;
try {
  parsed = new URL(value);
} catch {
  console.error('MONGODB_BACKUP_URI is not a valid MongoDB URI.');
  process.exit(1);
}
if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
  console.error('MONGODB_BACKUP_URI must use the mongodb or mongodb+srv scheme.');
  process.exit(1);
}
if (parsed.pathname && parsed.pathname !== '/') {
  console.error('MONGODB_BACKUP_URI must not select a database; full-instance --oplog capture requires an empty database path.');
  process.exit(1);
}
if (parsed.searchParams.get('authSource') !== 'admin') {
  console.error('MONGODB_BACKUP_URI must authenticate against admin.');
  process.exit(1);
}
if (parsed.searchParams.get('replicaSet') !== process.env.BACKUP_EXPECTED_REPLICA_SET) {
  console.error('MONGODB_BACKUP_URI must select the configured replica set.');
  process.exit(1);
}
NODE

DEPLOY_STATE_ROOT="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
mkdir -p "${DEPLOY_STATE_ROOT}"
DEPLOY_LOCK_FILE="${DEPLOY_STATE_ROOT}/.deploy.lock"
EXPECTED_DEPLOY_LOCK="$(realpath -m -- "${DEPLOY_LOCK_FILE}")"
INHERITED_DEPLOY_LOCK="$(readlink -f -- "/proc/$$/fd/9" 2>/dev/null || true)"
if [[ "${INHERITED_DEPLOY_LOCK}" != "${EXPECTED_DEPLOY_LOCK}" ]]; then
  exec 9>"${DEPLOY_LOCK_FILE}"
fi
if ! flock -n 9; then
  echo "A deployment, rollback, bootstrap, or restore is in progress: ${DEPLOY_LOCK_FILE}" >&2
  exit 1
fi

LOCK_DIR="${MENORAH_BACKUP_ROOT}/metadata"
mkdir -p "${LOCK_DIR}"
LOCK_FILE="${LOCK_DIR}/.backup.lock"
EXPECTED_BACKUP_LOCK="$(realpath -m -- "${LOCK_FILE}")"
INHERITED_BACKUP_LOCK="$(readlink -f -- "/proc/$$/fd/8" 2>/dev/null || true)"
if [[ "${INHERITED_BACKUP_LOCK}" != "${EXPECTED_BACKUP_LOCK}" ]]; then
  exec 8>"${LOCK_FILE}"
fi
if ! flock -n 8; then
  echo "Another backup job is already running: ${LOCK_FILE}" >&2
  exit 1
fi

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    --env-file "${ENV_FILE}" \
    "$@"
}

mkdir -p "${OUT_DIR}/mongo" "${OUT_DIR}/uploads" "${OUT_DIR}/metadata"

echo "Creating MongoDB backup: ${MONGO_ARCHIVE}"
if [[ -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
  FINAL_MONGO="${MONGO_ARCHIVE}.enc"
  MONGO_ENCRYPTED_TMP="$(mktemp "${OUT_DIR}/mongo/.mongo-archive.XXXXXXXX.enc.tmp")"
  compose_cmd run --rm --no-deps -T --user "${BACKUP_RUN_AS}" backup-runner \
    /scripts/run-mongo-tool-secure.sh MONGODB_BACKUP_URI mongodump \
      --archive --gzip --oplog \
    | openssl enc -aes-256-cbc -pbkdf2 -salt \
        -out "${MONGO_ENCRYPTED_TMP}" \
        -pass env:BACKUP_ENCRYPTION_PASSWORD
  chmod 0600 "${MONGO_ENCRYPTED_TMP}"
  mv -f -- "${MONGO_ENCRYPTED_TMP}" "${FINAL_MONGO}"
else
  FINAL_MONGO="${MONGO_ARCHIVE}"
  compose_cmd run --rm --no-deps --user "${BACKUP_RUN_AS}" backup-runner \
    /scripts/run-mongo-tool-secure.sh MONGODB_BACKUP_URI mongodump \
      --archive="/backups/${BACKUP_TYPE}/${STAMP}/mongo/$(basename "${MONGO_ARCHIVE}")" \
      --gzip --oplog
fi

if [[ ! -s "${FINAL_MONGO}" || ! -r "${FINAL_MONGO}" ]]; then
  echo "MongoDB backup archive was not created as a host-readable file: ${MONGO_ARCHIVE}" >&2
  exit 1
fi

UPLOAD_SOURCE="${MENORAH_DATA_ROOT}/uploads"
if [[ ! -d "${UPLOAD_SOURCE}" || -L "${UPLOAD_SOURCE}" ]]; then
  echo "The configured production uploads directory is missing or symlinked: ${UPLOAD_SOURCE}" >&2
  exit 1
fi
UPLOAD_SOURCE_REAL="$(realpath -e -- "${UPLOAD_SOURCE}")"
if [[ "${UPLOAD_SOURCE_REAL}" != "$(realpath -e -- "${MENORAH_DATA_ROOT}")/uploads" ]]; then
  echo "The uploads directory escaped MENORAH_DATA_ROOT." >&2
  exit 1
fi

MEDIA_SNAPSHOT_PARENT="${MENORAH_DATA_ROOT}/.media-backup-snapshots"
mkdir -p -- "${MEDIA_SNAPSHOT_PARENT}"
chmod 0700 "${MEDIA_SNAPSHOT_PARENT}"
MEDIA_SNAPSHOT_ROOT="$(mktemp -d "${MEDIA_SNAPSHOT_PARENT}/snapshot-${STAMP}.XXXXXXXX")"
chmod 0700 "${MEDIA_SNAPSHOT_ROOT}"

# Managed media objects are immutable and written before their database
# references. A snapshot copy taken after the oplog dump is therefore a safe
# superset of the database point-in-time without pausing normal traffic.
# Reflinks avoid duplicate I/O on supporting filesystems and fall back to
# ordinary copies. Do not use hard links here: Linux protected_hardlinks
# correctly prevents the host operator from linking uid-100, mode-0640 files.
mkdir -p -- "${MEDIA_SNAPSHOT_ROOT}/uploads"
cp -R --reflink=auto -- \
  "${UPLOAD_SOURCE_REAL}/." \
  "${MEDIA_SNAPSHOT_ROOT}/uploads/"
node "${REPO_ROOT}/menorah/backend/src/scripts/media-manifest.js" create \
  --root "${MEDIA_SNAPSHOT_ROOT}/uploads" \
  --manifest "${UPLOADS_MANIFEST}"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  # Value-free -e inherits the URI without exposing it in Docker/Compose argv.
  MEDIA_VERIFY_MONGODB_URI="${MONGODB_BACKUP_URI}" \
  compose_cmd --profile backup-job run --rm --no-deps -T \
    --user "${BACKUP_RUN_AS}" \
    -e MEDIA_VERIFY_MONGODB_URI \
    -v "${MEDIA_SNAPSHOT_ROOT}/uploads:/media-snapshot/uploads:ro" \
    -v "${OUT_DIR}/metadata:/media-output" \
    media-verifier \
    node src/scripts/verify-media-references.js \
      --root /media-snapshot/uploads \
      --manifest /media-output/uploads-manifest.json \
      --output /media-output/media-reference-verification.json \
      --require-local-managed
else
  MEDIA_REPORT_MANIFEST_SHA="$(
    node -e '
      const fs = require("fs");
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(value.entriesSha256);
    ' "${UPLOADS_MANIFEST}"
  )" \
    node - <<'NODE' > "${MEDIA_REFERENCE_REPORT}"
const report = {
  schemaVersion: 1,
  verificationType: 'menorah-media-database-references',
  valid: null,
  skippedReason: 'non-production-backup',
  manifestEntriesSha256: process.env.MEDIA_REPORT_MANIFEST_SHA,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
NODE
fi

echo "Creating uploads backup: ${UPLOAD_ARCHIVE}"
if [[ -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
  FINAL_UPLOADS="${UPLOAD_ARCHIVE}.enc"
  UPLOADS_ENCRYPTED_TMP="$(mktemp "${OUT_DIR}/uploads/.uploads-archive.XXXXXXXX.enc.tmp")"
  tar -C "${MEDIA_SNAPSHOT_ROOT}" -czf - uploads \
    | openssl enc -aes-256-cbc -pbkdf2 -salt \
        -out "${UPLOADS_ENCRYPTED_TMP}" \
        -pass env:BACKUP_ENCRYPTION_PASSWORD
  chmod 0600 "${UPLOADS_ENCRYPTED_TMP}"
  mv -f -- "${UPLOADS_ENCRYPTED_TMP}" "${FINAL_UPLOADS}"
else
  FINAL_UPLOADS="${UPLOAD_ARCHIVE}"
  tar -C "${MEDIA_SNAPSHOT_ROOT}" -czf "${FINAL_UPLOADS}" uploads
fi

verify_checksum() {
  local checksum_file="$1"
  if [[ ! -f "${checksum_file}" ]]; then
    echo "Missing checksum file: ${checksum_file}" >&2
    return 1
  fi
  (
    cd "$(dirname "${checksum_file}")"
    sha256sum -c "$(basename "${checksum_file}")"
  )
}

DATABASE_TOOLS_VERSION="test-unverified"
MONGO_SERVER_VERSION="test-unverified"
MONGO_SERVER_FCV="test-unverified"
if [[ "${NODE_ENV:-}" == "production" ]]; then
  DATABASE_TOOLS_VERSION="$(compose_cmd run --rm --no-deps backup-runner mongodump --version \
    | sed -n 's/^mongodump version: //p' | head -n 1)"
  mapfile -t mongo_versions < <(
    compose_cmd run --rm --no-deps backup-runner mongosh --nodb --quiet --eval '
        db = connect(process.env.MONGODB_BACKUP_URI);
        const result = db.getSiblingDB("admin").runCommand({ getParameter: 1, featureCompatibilityVersion: 1 });
        assert.commandWorked(result);
        print(db.version());
        print(result.featureCompatibilityVersion.version);
      '
  )
  MONGO_SERVER_VERSION="${mongo_versions[0]:-}"
  MONGO_SERVER_FCV="${mongo_versions[1]:-}"
  if [[ ! "${DATABASE_TOOLS_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ \
    || ! "${MONGO_SERVER_VERSION}" =~ ^7\.[0-9]+\.[0-9]+$ \
    || "${MONGO_SERVER_FCV}" != "7.0" ]]; then
    echo "Could not prove the pinned MongoDB tools/server/FCV backup compatibility contract." >&2
    exit 1
  fi
fi

sign_file() {
  local input_file="$1"
  local temporary
  [[ -n "${BACKUP_INTEGRITY_HMAC_KEY:-}" ]] || return 0
  temporary="$(mktemp "$(dirname "${input_file}")/.hmac.XXXXXX")"
  HMAC_INPUT_FILE="${input_file}" node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || "";
    if (Buffer.byteLength(key, "utf8") < 32) process.exit(1);
    process.stdout.write(`${crypto.createHmac("sha256", key).update(fs.readFileSync(process.env.HMAC_INPUT_FILE)).digest("hex")}\n`);
  ' > "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${input_file}.hmac-sha256"
}

sha256sum "${FINAL_MONGO}" > "${FINAL_MONGO}.sha256"
sha256sum "${FINAL_UPLOADS}" > "${FINAL_UPLOADS}.sha256"
sha256sum "${UPLOADS_MANIFEST}" > "${UPLOADS_MANIFEST}.sha256"
sha256sum "${MEDIA_REFERENCE_REPORT}" > "${MEDIA_REFERENCE_REPORT}.sha256"
verify_checksum "${FINAL_MONGO}.sha256"
verify_checksum "${FINAL_UPLOADS}.sha256"
verify_checksum "${UPLOADS_MANIFEST}.sha256"
verify_checksum "${MEDIA_REFERENCE_REPORT}.sha256"

MONGO_ARCHIVE_SHA256="$(awk '{print $1}' "${FINAL_MONGO}.sha256")"
UPLOAD_ARCHIVE_SHA256="$(awk '{print $1}' "${FINAL_UPLOADS}.sha256")"
UPLOADS_MANIFEST_SHA256="$(awk '{print $1}' "${UPLOADS_MANIFEST}.sha256")"
MEDIA_REFERENCE_REPORT_SHA256="$(awk '{print $1}' "${MEDIA_REFERENCE_REPORT}.sha256")"
CHECKOUT_GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || true)"
CURRENT_RELEASE_MARKER=""
if [[ -r "${DEPLOY_STATE_ROOT}/current-sha" ]]; then
  CURRENT_RELEASE_MARKER="$(tr -d '\r\n' < "${DEPLOY_STATE_ROOT}/current-sha")"
fi
DEPLOYED_RELEASE_SHA="${BACKUP_DEPLOYED_RELEASE_SHA:-${CURRENT_RELEASE_MARKER}}"
MIGRATION_APPLIED_SHA=""
if [[ -r "${DEPLOY_STATE_ROOT}/migration-applied-sha" ]]; then
  MIGRATION_APPLIED_SHA="$(tr -d '\r\n' < "${DEPLOY_STATE_ROOT}/migration-applied-sha")"
fi
if [[ "${NODE_ENV:-}" == "production" && ! "${CHECKOUT_GIT_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Production backups require an exact checkout commit SHA." >&2
  exit 1
fi
if [[ "${NODE_ENV:-}" == "production" && ! "${DEPLOYED_RELEASE_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Production backups require the exact running release SHA via current-sha or BACKUP_DEPLOYED_RELEASE_SHA." >&2
  exit 1
fi
printf '%s\n' "${DEPLOYED_RELEASE_SHA}" > "${OUT_DIR}/metadata/git-sha.txt"
printf '%s\n' "${CHECKOUT_GIT_SHA}" > "${OUT_DIR}/metadata/checkout-sha.txt"
printf '%s\n' "${DEPLOYED_RELEASE_SHA}" > "${OUT_DIR}/metadata/deployed-release-sha.txt"
printf '%s\n' "${MIGRATION_APPLIED_SHA}" > "${OUT_DIR}/metadata/migration-applied-sha.txt"
compose_cmd ps > "${OUT_DIR}/metadata/docker-compose-ps.txt" || true
compose_cmd images > "${OUT_DIR}/metadata/docker-compose-images.txt" || true

BACKUP_METADATA_FILE="${OUT_DIR}/metadata/metadata.json"
BACKUP_METADATA_TIMESTAMP="${STAMP}" \
BACKUP_METADATA_TYPE="${BACKUP_TYPE}" \
BACKUP_METADATA_MONGO_ARCHIVE="${FINAL_MONGO}" \
BACKUP_METADATA_MONGO_SHA="${MONGO_ARCHIVE_SHA256}" \
BACKUP_METADATA_UPLOADS_ARCHIVE="${FINAL_UPLOADS}" \
BACKUP_METADATA_UPLOADS_SHA="${UPLOAD_ARCHIVE_SHA256}" \
BACKUP_METADATA_UPLOADS_MANIFEST="${UPLOADS_MANIFEST}" \
BACKUP_METADATA_UPLOADS_MANIFEST_SHA="${UPLOADS_MANIFEST_SHA256}" \
BACKUP_METADATA_MEDIA_REFERENCE_REPORT="${MEDIA_REFERENCE_REPORT}" \
BACKUP_METADATA_MEDIA_REFERENCE_REPORT_SHA="${MEDIA_REFERENCE_REPORT_SHA256}" \
BACKUP_METADATA_ROOT="${MENORAH_BACKUP_ROOT}" \
BACKUP_METADATA_CHECKOUT_SHA="${CHECKOUT_GIT_SHA}" \
BACKUP_METADATA_DEPLOYED_SHA="${DEPLOYED_RELEASE_SHA}" \
BACKUP_METADATA_MIGRATION_SHA="${MIGRATION_APPLIED_SHA}" \
BACKUP_METADATA_TOOLS_VERSION="${DATABASE_TOOLS_VERSION}" \
BACKUP_METADATA_SERVER_VERSION="${MONGO_SERVER_VERSION}" \
BACKUP_METADATA_SERVER_FCV="${MONGO_SERVER_FCV}" \
BACKUP_METADATA_ENCRYPTED="$(if [[ -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then echo true; else echo false; fi)" \
  node - <<'NODE' > "${BACKUP_METADATA_FILE}"
const metadata = {
  schemaVersion: 3,
  artifactType: 'mongodb-full-instance-oplog',
  scope: 'full-instance',
  timestamp: process.env.BACKUP_METADATA_TIMESTAMP,
  backupType: process.env.BACKUP_METADATA_TYPE,
  checkoutGitSha: process.env.BACKUP_METADATA_CHECKOUT_SHA || null,
  deployedReleaseSha: process.env.BACKUP_METADATA_DEPLOYED_SHA || null,
  migrationAppliedSha: process.env.BACKUP_METADATA_MIGRATION_SHA || null,
  mongoArchive: process.env.BACKUP_METADATA_MONGO_ARCHIVE,
  mongoArchiveSha256: process.env.BACKUP_METADATA_MONGO_SHA,
  uploadsArchive: process.env.BACKUP_METADATA_UPLOADS_ARCHIVE,
  uploadsArchiveSha256: process.env.BACKUP_METADATA_UPLOADS_SHA,
  uploadsManifest: process.env.BACKUP_METADATA_UPLOADS_MANIFEST,
  uploadsManifestSha256: process.env.BACKUP_METADATA_UPLOADS_MANIFEST_SHA,
  mediaReferenceVerification: process.env.BACKUP_METADATA_MEDIA_REFERENCE_REPORT,
  mediaReferenceVerificationSha256: process.env.BACKUP_METADATA_MEDIA_REFERENCE_REPORT_SHA,
  mediaStorageBackend: 'local',
  mediaConsistencyContract: 'immutable-write-before-reference',
  uploadsRequired: true,
  backupRoot: process.env.BACKUP_METADATA_ROOT,
  encrypted: process.env.BACKUP_METADATA_ENCRYPTED === 'true',
  oplog: true,
  containsSystemIdentityData: true,
  directProductionRestoreAllowed: false,
  requiredSanitizationNamespace: 'menorah.*',
  databaseToolsVersion: process.env.BACKUP_METADATA_TOOLS_VERSION,
  mongoServerVersion: process.env.BACKUP_METADATA_SERVER_VERSION,
  mongoFeatureCompatibilityVersion: process.env.BACKUP_METADATA_SERVER_FCV,
};
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
NODE
chmod 0600 "${BACKUP_METADATA_FILE}"
sign_file "${UPLOADS_MANIFEST}"
sign_file "${MEDIA_REFERENCE_REPORT}"
sign_file "${BACKUP_METADATA_FILE}"

if [[ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
  cat > "${OUT_DIR}/ENCRYPTION-BLOCKER.txt" <<'EOF'
This backup is not encrypted.
Do not upload it off-host until BACKUP_ENCRYPTION_PASSWORD, age, gpg, or another approved encryption flow is enabled.
EOF
fi

LATEST_DIR="${MENORAH_BACKUP_ROOT}/metadata"
mkdir -p "${LATEST_DIR}"
LATEST_MARKER="${LATEST_DIR}/latest-success-${BACKUP_TYPE}.json"
LATEST_MARKER_TMP="$(mktemp "${LATEST_DIR}/.latest-success-${BACKUP_TYPE}.XXXXXX")"
BACKUP_METADATA_TIMESTAMP="${STAMP}" \
BACKUP_METADATA_TYPE="${BACKUP_TYPE}" \
BACKUP_METADATA_PATH="${OUT_DIR}" \
BACKUP_METADATA_MONGO_ARCHIVE="${FINAL_MONGO}" \
BACKUP_METADATA_MONGO_SHA="${MONGO_ARCHIVE_SHA256}" \
BACKUP_METADATA_UPLOADS_ARCHIVE="${FINAL_UPLOADS}" \
BACKUP_METADATA_UPLOADS_MANIFEST="${UPLOADS_MANIFEST}" \
BACKUP_METADATA_MEDIA_REFERENCE_REPORT="${MEDIA_REFERENCE_REPORT}" \
BACKUP_METADATA_FILE="${BACKUP_METADATA_FILE}" \
BACKUP_METADATA_ENCRYPTED="$(if [[ -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then echo true; else echo false; fi)" \
  node - <<'NODE' > "${LATEST_MARKER_TMP}"
const marker = {
  schemaVersion: 3,
  artifactType: 'mongodb-full-instance-oplog',
  timestamp: process.env.BACKUP_METADATA_TIMESTAMP,
  backupType: process.env.BACKUP_METADATA_TYPE,
  path: process.env.BACKUP_METADATA_PATH,
  mongoArchive: process.env.BACKUP_METADATA_MONGO_ARCHIVE,
  mongoArchiveSha256: process.env.BACKUP_METADATA_MONGO_SHA,
  uploadsArchive: process.env.BACKUP_METADATA_UPLOADS_ARCHIVE,
  uploadsManifest: process.env.BACKUP_METADATA_UPLOADS_MANIFEST,
  mediaReferenceVerification: process.env.BACKUP_METADATA_MEDIA_REFERENCE_REPORT,
  metadataFile: process.env.BACKUP_METADATA_FILE,
  encrypted: process.env.BACKUP_METADATA_ENCRYPTED === 'true',
  oplog: true,
  directProductionRestoreAllowed: false,
};
process.stdout.write(`${JSON.stringify(marker, null, 2)}\n`);
NODE
chmod 0600 "${LATEST_MARKER_TMP}"
mv -f -- "${LATEST_MARKER_TMP}" "${LATEST_MARKER}"
sign_file "${LATEST_MARKER}"

if [[ "${BACKUP_PRUNE_AFTER_SUCCESS:-true}" == "true" && -x "${SCRIPT_DIR}/prune-backups.sh" ]]; then
  "${SCRIPT_DIR}/prune-backups.sh"
fi

echo "Backup complete: ${OUT_DIR}"
