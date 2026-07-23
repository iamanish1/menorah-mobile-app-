#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
MODE="${1:-restore-test}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
DEPLOY_LOCK_FILE="${STATE_DIR}/.deploy.lock"
RESTORE_IN_PROGRESS_MARKER="${STATE_DIR}/production-restore-in-progress.json"
RESTORE_REVIEW_MARKER="${STATE_DIR}/production-restore-requires-review.json"
MIGRATION_MARKER="${STATE_DIR}/migration-applied-sha"
MIGRATION_IN_PROGRESS_MARKER="${STATE_DIR}/migration-in-progress-sha"
TEMPORARY_PLAINTEXTS=()
RESTORE_TEST_ACTIVE=false
SANITIZED_ARCHIVE=""
SANITIZED_ARCHIVE_SHA256=""
SOURCE_DATABASE_TOOLS_VERSION=""
SOURCE_MONGO_SERVER_VERSION=""
SOURCE_MONGO_SERVER_FCV=""
SOURCE_DEPLOYED_RELEASE_SHA=""
SOURCE_UPLOADS_ARCHIVE=""
SOURCE_UPLOADS_ARCHIVE_SHA256=""
SOURCE_UPLOADS_MANIFEST=""
SOURCE_UPLOADS_MANIFEST_SHA256=""
SOURCE_MEDIA_REFERENCE_REPORT=""
SOURCE_MEDIA_REFERENCE_REPORT_SHA256=""
MEDIA_STAGING_PARENT=""
MEDIA_STAGING_ROOT=""
MEDIA_ROLLBACK_PATH=""
WRITER_SERVICES=(api-ios api-android api-web api-admin worker)

cleanup() {
  local original_status="$?"
  local file staging_real staging_parent_real cleanup_failed=false
  for file in "${TEMPORARY_PLAINTEXTS[@]}"; do
    if [[ -n "${file}" ]] && ! rm -f -- "${file}"; then
      echo "CRITICAL: could not remove restore temporary file: ${file}" >&2
      cleanup_failed=true
    fi
  done
  if [[ "${RESTORE_TEST_ACTIVE}" == "true" ]]; then
    if ! destroy_restore_test_target; then
      echo "CRITICAL: no-auth restore cleanup failed; inspect container mongo-restore-test and volume ${RESTORE_TEST_VOLUME_NAME:-<unresolved>}." >&2
      cleanup_failed=true
    fi
  fi
  if [[ -n "${MEDIA_STAGING_ROOT}" && -d "${MEDIA_STAGING_ROOT}" ]]; then
    staging_real="$(realpath -e -- "${MEDIA_STAGING_ROOT}" 2>/dev/null || true)"
    staging_parent_real="$(realpath -e -- "${MEDIA_STAGING_PARENT}" 2>/dev/null || true)"
    if [[ -z "${staging_real}" || -z "${staging_parent_real}" \
      || "${staging_real}" != "${staging_parent_real}"/* ]]; then
      echo "CRITICAL: refusing unsafe media staging cleanup path: ${MEDIA_STAGING_ROOT}" >&2
      cleanup_failed=true
    elif ! rm -rf -- "${staging_real}"; then
      echo "CRITICAL: could not remove media restore staging: ${staging_real}" >&2
      cleanup_failed=true
    fi
  fi
  trap - EXIT
  if [[ "${cleanup_failed}" == "true" ]]; then
    exit 1
  fi
  exit "${original_status}"
}
trap cleanup EXIT

case "${MODE}" in
  restore-test|production) ;;
  *)
    echo "Usage: restore-latest-backup.sh [restore-test|production]" >&2
    exit 2
    ;;
esac

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Production environment file is missing or unreadable: ${ENV_FILE}" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
MENORAH_DATA_ROOT="${MENORAH_DATA_ROOT:-/opt/menorah/data}"
MEDIA_STAGING_PARENT="${MENORAH_DATA_ROOT}/media-restore-staging"
RESTORE_TEST_COMPOSE_PROJECT=""
RESTORE_TEST_VOLUME_NAME=""
mkdir -p "${STATE_DIR}" "${MENORAH_BACKUP_ROOT}/metadata"
BACKUP_LOCK_FILE="${MENORAH_BACKUP_ROOT}/metadata/.backup.lock"

acquire_or_confirm_lock() {
  local fd="$1"
  local lock_file="$2"
  local description="$3"
  local expected inherited
  expected="$(realpath -m -- "${lock_file}")"
  inherited="$(readlink -f -- "/proc/$$/fd/${fd}" 2>/dev/null || true)"
  if [[ "${inherited}" != "${expected}" ]]; then
    if [[ "${fd}" == "9" ]]; then
      exec 9>"${lock_file}"
    elif [[ "${fd}" == "8" ]]; then
      exec 8>"${lock_file}"
    else
      echo "Unsupported lock descriptor: ${fd}" >&2
      exit 1
    fi
  fi
  if ! flock -n "${fd}"; then
    echo "Another ${description} is already running: ${lock_file}" >&2
    exit 1
  fi
}

# Lock order is always deployment first, then backup. An update process passes
# its already-held fd 9 through the restore-test child; the exact path check
# prevents an environment variable from bypassing either lock.
acquire_or_confirm_lock 9 "${DEPLOY_LOCK_FILE}" "deployment, rollback, bootstrap, or restore"
acquire_or_confirm_lock 8 "${BACKUP_LOCK_FILE}" "backup or restore"

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    --env-file "${ENV_FILE}" \
    "$@"
}

destroy_restore_test_target() {
  compose_cmd rm -sf mongo-restore-test >/dev/null
  if [[ -n "$(compose_cmd ps -aq mongo-restore-test 2>/dev/null || true)" ]]; then
    echo "The disposable restore-test container could not be removed." >&2
    return 1
  fi
  if docker volume inspect "${RESTORE_TEST_VOLUME_NAME}" >/dev/null 2>&1; then
    local actual_project actual_volume_key
    actual_project="$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' "${RESTORE_TEST_VOLUME_NAME}")"
    actual_volume_key="$(docker volume inspect --format '{{index .Labels "com.docker.compose.volume"}}' "${RESTORE_TEST_VOLUME_NAME}")"
    if [[ "${actual_project}" != "${RESTORE_TEST_COMPOSE_PROJECT}" \
      || "${actual_volume_key}" != "restore_test_data" ]]; then
      echo "Refusing to delete a restore-test volume without the exact Compose ownership labels." >&2
      return 1
    fi
    docker volume rm "${RESTORE_TEST_VOLUME_NAME}" >/dev/null
  fi
  if docker volume inspect "${RESTORE_TEST_VOLUME_NAME}" >/dev/null 2>&1; then
    echo "The disposable restore-test volume could not be removed." >&2
    return 1
  fi
  RESTORE_TEST_ACTIVE=false
}

restore_test_cmd() {
  compose_cmd --profile restore-test run --rm --no-deps restore-test-runner "$@"
}

restore_test_stream_cmd() {
  compose_cmd --profile restore-test run --rm --no-deps -T restore-test-runner "$@"
}

run_restore_tool() {
  local restore_mode="$1"
  shift
  if [[ "${restore_mode}" == "production" ]]; then
    compose_cmd --profile production-restore run --rm --no-deps production-restore-runner "$@"
  else
    restore_test_cmd "$@"
  fi
}

run_restore_stream_tool() {
  local restore_mode="$1"
  shift
  if [[ "${restore_mode}" == "production" ]]; then
    compose_cmd --profile production-restore run --rm --no-deps -T production-restore-runner "$@"
  else
    restore_test_stream_cmd "$@"
  fi
}

resolve_restore_compose_identity() {
  local -a resolved
  if ! mapfile -t resolved < <(
    compose_cmd --profile restore-test config --format json \
      | node -e '
          let input = "";
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", (chunk) => { input += chunk; });
          process.stdin.on("end", () => {
            const config = JSON.parse(input);
            const project = config.name;
            const volume = config.volumes?.restore_test_data?.name;
            if (!/^[a-z0-9][a-z0-9_-]*$/.test(project || "")
              || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(volume || "")) process.exit(1);
            process.stdout.write(`${project}\n${volume}\n`);
          });
        '
  ) || (( ${#resolved[@]} != 2 )); then
    echo "Could not resolve the exact Compose project and restore-test volume identity." >&2
    exit 1
  fi
  RESTORE_TEST_COMPOSE_PROJECT="${resolved[0]}"
  RESTORE_TEST_VOLUME_NAME="${resolved[1]}"
}

resolve_restore_compose_identity

resolve_archive() {
  local requested="${RESTORE_ARCHIVE:-}"
  local backup_root_real archive marker
  backup_root_real="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")"

  if [[ -z "${requested}" ]]; then
    if [[ "${MODE}" == "production" ]]; then
      echo "Production restore requires an explicit RESTORE_ARCHIVE; latest-by-time selection is forbidden." >&2
      exit 1
    fi
    marker="$(find "${MENORAH_BACKUP_ROOT}/metadata" -maxdepth 1 -type f \
      -name 'latest-success-*.json' -printf '%T@ %p\n' 2>/dev/null \
      | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
    if [[ -z "${marker}" ]]; then
      echo "No completed backup success marker exists under ${MENORAH_BACKUP_ROOT}/metadata." >&2
      exit 1
    fi
    requested="$(node -e '
      const fs = require("fs");
      const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof data.mongoArchive !== "string" || !data.mongoArchive) process.exit(1);
      process.stdout.write(data.mongoArchive);
    ' "${marker}")" || {
      echo "Latest completed backup marker is malformed." >&2
      exit 1
    }
  fi

  archive="$(realpath -e -- "${requested}" 2>/dev/null || true)"
  case "${archive}" in
    "${backup_root_real}"/restore-tests/*|"")
      echo "RESTORE_ARCHIVE must identify a completed backup outside restore-tests." >&2
      exit 1
      ;;
    "${backup_root_real}"/*) ;;
    *)
      echo "RESTORE_ARCHIVE must remain inside MENORAH_BACKUP_ROOT." >&2
      exit 1
      ;;
  esac
  if [[ ! -f "${archive}" || ( "${archive}" != *.archive.gz && "${archive}" != *.archive.gz.enc ) ]]; then
    echo "RESTORE_ARCHIVE is not a supported MongoDB archive." >&2
    exit 1
  fi
  printf '%s' "${archive}"
}

LATEST_ARCHIVE="$(resolve_archive)"
CHECKSUM_FILE="${LATEST_ARCHIVE}.sha256"
if [[ ! -r "${CHECKSUM_FILE}" ]]; then
  echo "Restore archive checksum is missing: ${CHECKSUM_FILE}" >&2
  exit 1
fi
read -r RECORDED_ARCHIVE_SHA256 _ < "${CHECKSUM_FILE}"
if [[ ! "${RECORDED_ARCHIVE_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Restore archive checksum file is malformed." >&2
  exit 1
fi
ACTUAL_ARCHIVE_SHA256="$(sha256sum "${LATEST_ARCHIVE}" | awk '{print $1}')"
if [[ "${ACTUAL_ARCHIVE_SHA256}" != "${RECORDED_ARCHIVE_SHA256}" ]]; then
  echo "Restore archive checksum verification failed." >&2
  exit 1
fi

BACKUP_ROOT_REAL="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")"
: "${BACKUP_INTEGRITY_HMAC_KEY:?BACKUP_INTEGRITY_HMAC_KEY is required to verify backup provenance}"
if (( ${#BACKUP_INTEGRITY_HMAC_KEY} < 32 )); then
  echo "BACKUP_INTEGRITY_HMAC_KEY must contain at least 32 characters." >&2
  exit 1
fi
SOURCE_BACKUP_SET_DIR="$(dirname "$(dirname "${LATEST_ARCHIVE}")")"
SOURCE_METADATA_FILE="${SOURCE_BACKUP_SET_DIR}/metadata/metadata.json"
if [[ ! -r "${SOURCE_METADATA_FILE}" || ! -r "${SOURCE_METADATA_FILE}.hmac-sha256" ]]; then
  echo "The source backup has no signed provenance metadata." >&2
  exit 1
fi
HMAC_INPUT_FILE="${SOURCE_METADATA_FILE}" \
HMAC_EXPECTED_FILE="${SOURCE_METADATA_FILE}.hmac-sha256" \
  node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || "";
    const expected = fs.readFileSync(process.env.HMAC_EXPECTED_FILE, "utf8").trim();
    if (Buffer.byteLength(key, "utf8") < 32 || !/^[0-9a-f]{64}$/.test(expected)) process.exit(1);
    const actual = crypto.createHmac("sha256", key).update(fs.readFileSync(process.env.HMAC_INPUT_FILE)).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) process.exit(1);
  ' || {
    echo "Source backup provenance signature verification failed." >&2
    exit 1
  }
if ! mapfile -t source_versions < <(
  SOURCE_ARCHIVE_PATH="${LATEST_ARCHIVE}" \
  SOURCE_ARCHIVE_SHA256="${ACTUAL_ARCHIVE_SHA256}" \
  SOURCE_ARCHIVE_ENCRYPTED="$(if [[ "${LATEST_ARCHIVE}" == *.enc ]]; then echo true; else echo false; fi)" \
    node -e '
      const fs = require("fs");
      const metadata = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const valid = metadata.schemaVersion === 3
        && metadata.artifactType === "mongodb-full-instance-oplog"
        && metadata.scope === "full-instance"
        && metadata.mongoArchive === process.env.SOURCE_ARCHIVE_PATH
        && metadata.mongoArchiveSha256 === process.env.SOURCE_ARCHIVE_SHA256
        && metadata.encrypted === (process.env.SOURCE_ARCHIVE_ENCRYPTED === "true")
        && metadata.oplog === true
        && metadata.containsSystemIdentityData === true
        && metadata.directProductionRestoreAllowed === false
        && metadata.requiredSanitizationNamespace === "menorah.*"
        && metadata.mediaStorageBackend === "local"
        && metadata.mediaConsistencyContract === "immutable-write-before-reference"
        && metadata.uploadsRequired === true
        && typeof metadata.uploadsArchive === "string"
        && /^[0-9a-f]{64}$/.test(metadata.uploadsArchiveSha256 || "")
        && typeof metadata.uploadsManifest === "string"
        && /^[0-9a-f]{64}$/.test(metadata.uploadsManifestSha256 || "")
        && typeof metadata.mediaReferenceVerification === "string"
        && /^[0-9a-f]{64}$/.test(metadata.mediaReferenceVerificationSha256 || "")
        && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(metadata.databaseToolsVersion || "")
        && /^7\.[0-9]+\.[0-9]+$/.test(metadata.mongoServerVersion || "")
        && metadata.mongoFeatureCompatibilityVersion === "7.0"
        && /^[0-9a-f]{40}$/i.test(metadata.deployedReleaseSha || "");
      if (!valid) process.exit(1);
      process.stdout.write([
        metadata.databaseToolsVersion,
        metadata.mongoServerVersion,
        metadata.mongoFeatureCompatibilityVersion,
        metadata.deployedReleaseSha,
        metadata.uploadsArchive,
        metadata.uploadsArchiveSha256,
        metadata.uploadsManifest,
        metadata.uploadsManifestSha256,
        metadata.mediaReferenceVerification,
        metadata.mediaReferenceVerificationSha256,
      ].join("\n") + "\n");
    ' "${SOURCE_METADATA_FILE}"
) || (( ${#source_versions[@]} != 10 )); then
    echo "Source backup provenance metadata does not match the selected full-oplog artifact." >&2
    exit 1
fi
SOURCE_DATABASE_TOOLS_VERSION="${source_versions[0]}"
SOURCE_MONGO_SERVER_VERSION="${source_versions[1]}"
SOURCE_MONGO_SERVER_FCV="${source_versions[2]}"
SOURCE_DEPLOYED_RELEASE_SHA="${source_versions[3]}"
SOURCE_UPLOADS_ARCHIVE="${source_versions[4]}"
SOURCE_UPLOADS_ARCHIVE_SHA256="${source_versions[5]}"
SOURCE_UPLOADS_MANIFEST="${source_versions[6]}"
SOURCE_UPLOADS_MANIFEST_SHA256="${source_versions[7]}"
SOURCE_MEDIA_REFERENCE_REPORT="${source_versions[8]}"
SOURCE_MEDIA_REFERENCE_REPORT_SHA256="${source_versions[9]}"
if [[ "${LATEST_ARCHIVE}" == *.enc ]]; then
  : "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required to restore encrypted backups}"
fi

verify_linked_media_artifact() {
  local artifact="$1"
  local expected_sha="$2"
  local expected_path="$3"
  local label="$4"
  local resolved recorded_sha recorded_name actual_sha
  resolved="$(realpath -e -- "${artifact}" 2>/dev/null || true)"
  if [[ "${resolved}" != "${expected_path}" || ! -f "${resolved}" \
    || ! "${expected_sha}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "${label} path or digest metadata is invalid." >&2
    exit 1
  fi
  if [[ ! -r "${resolved}.sha256" ]]; then
    echo "${label} checksum sidecar is missing." >&2
    exit 1
  fi
  read -r recorded_sha recorded_name < "${resolved}.sha256"
  actual_sha="$(sha256sum "${resolved}" | awk '{print $1}')"
  if [[ "${recorded_sha}" != "${expected_sha}" \
    || "${actual_sha}" != "${expected_sha}" \
    || ( "${recorded_name}" != "${resolved}" \
      && "${recorded_name}" != "$(basename "${resolved}")" ) ]]; then
    echo "${label} checksum verification failed." >&2
    exit 1
  fi
}

verify_linked_media_signature() {
  local artifact="$1"
  local label="$2"
  if [[ ! -r "${artifact}.hmac-sha256" ]]; then
    echo "${label} provenance signature is missing." >&2
    exit 1
  fi
  HMAC_INPUT_FILE="${artifact}" \
  HMAC_EXPECTED_FILE="${artifact}.hmac-sha256" \
    node -e '
      const crypto = require("crypto");
      const fs = require("fs");
      const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || "";
      const expected = fs.readFileSync(process.env.HMAC_EXPECTED_FILE, "utf8").trim();
      if (Buffer.byteLength(key, "utf8") < 32 || !/^[0-9a-f]{64}$/.test(expected)) process.exit(1);
      const actual = crypto.createHmac("sha256", key).update(fs.readFileSync(process.env.HMAC_INPUT_FILE)).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) process.exit(1);
    ' || {
      echo "${label} provenance signature verification failed." >&2
      exit 1
    }
}

verify_linked_media_artifact \
  "${SOURCE_UPLOADS_ARCHIVE}" \
  "${SOURCE_UPLOADS_ARCHIVE_SHA256}" \
  "${SOURCE_BACKUP_SET_DIR}/uploads/uploads-$(basename "${SOURCE_BACKUP_SET_DIR}").tar.gz$(if [[ "${LATEST_ARCHIVE}" == *.enc ]]; then printf '.enc'; fi)" \
  "Uploads archive"
verify_linked_media_artifact \
  "${SOURCE_UPLOADS_MANIFEST}" \
  "${SOURCE_UPLOADS_MANIFEST_SHA256}" \
  "${SOURCE_BACKUP_SET_DIR}/metadata/uploads-manifest.json" \
  "Uploads manifest"
verify_linked_media_artifact \
  "${SOURCE_MEDIA_REFERENCE_REPORT}" \
  "${SOURCE_MEDIA_REFERENCE_REPORT_SHA256}" \
  "${SOURCE_BACKUP_SET_DIR}/metadata/media-reference-verification.json" \
  "Media reference verification"
verify_linked_media_signature "${SOURCE_UPLOADS_MANIFEST}" "Uploads manifest"
verify_linked_media_signature \
  "${SOURCE_MEDIA_REFERENCE_REPORT}" \
  "Media reference verification"

SOURCE_MEDIA_MANIFEST="${SOURCE_UPLOADS_MANIFEST}" \
SOURCE_MEDIA_REFERENCE_REPORT="${SOURCE_MEDIA_REFERENCE_REPORT}" \
  node - <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.env.SOURCE_MEDIA_MANIFEST, 'utf8'));
const report = JSON.parse(fs.readFileSync(process.env.SOURCE_MEDIA_REFERENCE_REPORT, 'utf8'));
const validManifest = manifest.schemaVersion === 1
  && manifest.artifactType === 'menorah-immutable-media-manifest'
  && manifest.rootName === 'uploads'
  && Array.isArray(manifest.entries)
  && manifest.entries.length === manifest.fileCount
  && Number.isSafeInteger(manifest.totalBytes)
  && /^[0-9a-f]{64}$/.test(manifest.entriesSha256 || '');
const validReport = report.schemaVersion === 1
  && report.verificationType === 'menorah-media-database-references'
  && report.valid === true
  && report.cloudinaryReferenceCount === 0
  && Array.isArray(report.violations)
  && report.violations.length === 0
  && report.manifestEntriesSha256 === manifest.entriesSha256;
if (!validManifest || !validReport) process.exit(1);
NODE

write_restore_test_marker() {
  local sanitized_archive="$1"
  local sanitized_sha256="$2"
  local marker_dir="${MENORAH_BACKUP_ROOT}/restore-tests"
  local temporary temporary_hmac
  : "${BACKUP_INTEGRITY_HMAC_KEY:?BACKUP_INTEGRITY_HMAC_KEY is required to sign restore evidence}"
  mkdir -p "${marker_dir}"
  temporary="$(mktemp "${marker_dir}/.latest-success.XXXXXX")"
  temporary_hmac="${temporary}.hmac-sha256"
  RESTORE_MARKER_ARCHIVE="${LATEST_ARCHIVE}" \
  RESTORE_MARKER_SHA256="${ACTUAL_ARCHIVE_SHA256}" \
  RESTORE_MARKER_SANITIZED_ARCHIVE="${sanitized_archive}" \
  RESTORE_MARKER_SANITIZED_SHA256="${sanitized_sha256}" \
  RESTORE_MARKER_UPLOADS_ARCHIVE="${SOURCE_UPLOADS_ARCHIVE}" \
  RESTORE_MARKER_UPLOADS_SHA256="${SOURCE_UPLOADS_ARCHIVE_SHA256}" \
  RESTORE_MARKER_MEDIA_MANIFEST="${SOURCE_UPLOADS_MANIFEST}" \
  RESTORE_MARKER_MEDIA_MANIFEST_SHA256="${SOURCE_UPLOADS_MANIFEST_SHA256}" \
  RESTORE_MARKER_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    node - <<'NODE' > "${temporary}"
const marker = {
  schemaVersion: 2,
  timestamp: process.env.RESTORE_MARKER_TIME,
  archive: process.env.RESTORE_MARKER_ARCHIVE,
  archiveSha256: process.env.RESTORE_MARKER_SHA256,
  sanitizedArchive: process.env.RESTORE_MARKER_SANITIZED_ARCHIVE,
  sanitizedArchiveSha256: process.env.RESTORE_MARKER_SANITIZED_SHA256,
  sanitizedNamespace: 'menorah.*',
  uploadsArchive: process.env.RESTORE_MARKER_UPLOADS_ARCHIVE,
  uploadsArchiveSha256: process.env.RESTORE_MARKER_UPLOADS_SHA256,
  mediaManifest: process.env.RESTORE_MARKER_MEDIA_MANIFEST,
  mediaManifestSha256: process.env.RESTORE_MARKER_MEDIA_MANIFEST_SHA256,
  mediaReferencesVerified: true,
  mode: 'restore-test',
};
process.stdout.write(`${JSON.stringify(marker, null, 2)}\n`);
NODE
  HMAC_INPUT_FILE="${temporary}" node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || "";
    if (Buffer.byteLength(key, "utf8") < 32) process.exit(1);
    process.stdout.write(`${crypto.createHmac("sha256", key).update(fs.readFileSync(process.env.HMAC_INPUT_FILE)).digest("hex")}\n`);
  ' > "${temporary_hmac}"
  chmod 0600 "${temporary}"
  chmod 0600 "${temporary_hmac}"
  mv -f -- "${temporary}" "${marker_dir}/latest-success.json"
  mv -f -- "${temporary_hmac}" "${marker_dir}/latest-success.json.hmac-sha256"
}

validate_production_restore_preconditions() {
  local current_sha backup_git_sha restore_test_marker previous_migration_sha change_reference
  local sanitized_real sanitized_recorded_sha sanitized_actual_sha artifact_metadata
  local -a restore_marker_values
  change_reference="${RESTORE_CHANGE_REFERENCE:-}"
  if [[ "${RESTORE_CONFIRM_PRODUCTION:-}" != "RESTORE_PRODUCTION_WITH_DROP" ]]; then
    echo "Set RESTORE_CONFIRM_PRODUCTION=RESTORE_PRODUCTION_WITH_DROP for a reviewed production recovery." >&2
    exit 1
  fi
  if [[ "${RESTORE_TRAFFIC_DRAIN_CONFIRM:-}" != "DRAINED_PUBLIC_TRAFFIC" ]]; then
    echo "Set RESTORE_TRAFFIC_DRAIN_CONFIRM=DRAINED_PUBLIC_TRAFFIC only after the external traffic drain is verified." >&2
    exit 1
  fi
  if [[ "${RESTORE_EXPECTED_ARCHIVE_SHA256:-}" != "${ACTUAL_ARCHIVE_SHA256}" ]]; then
    echo "RESTORE_EXPECTED_ARCHIVE_SHA256 must match the independently reviewed archive digest." >&2
    exit 1
  fi
  current_sha="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  if [[ ! "${RESTORE_EXPECTED_CURRENT_SHA:-}" =~ ^[0-9a-fA-F]{40}$ \
    || "${RESTORE_EXPECTED_CURRENT_SHA,,}" != "${current_sha,,}" ]]; then
    echo "RESTORE_EXPECTED_CURRENT_SHA must match the exact checked-out release." >&2
    exit 1
  fi
  if (( ${#change_reference} < 8 || ${#change_reference} > 200 )) \
    || [[ "${change_reference}" == *$'\n'* \
      || "${change_reference}" == *$'\r'* ]]; then
    echo "RESTORE_CHANGE_REFERENCE must identify the approved incident/change record." >&2
    exit 1
  fi
  backup_git_sha="${SOURCE_DEPLOYED_RELEASE_SHA}"
  if [[ ! "${backup_git_sha}" =~ ^[0-9a-fA-F]{40}$ \
    || "${RESTORE_EXPECTED_BACKUP_GIT_SHA:-}" != "${backup_git_sha}" ]]; then
    echo "RESTORE_EXPECTED_BACKUP_GIT_SHA must match the selected backup metadata." >&2
    exit 1
  fi
  restore_test_marker="${MENORAH_BACKUP_ROOT}/restore-tests/latest-success.json"
  if [[ ! -r "${restore_test_marker}" || ! -r "${restore_test_marker}.hmac-sha256" ]]; then
    echo "The exact archive and digest must pass restore-test before production recovery." >&2
    exit 1
  fi
  HMAC_INPUT_FILE="${restore_test_marker}" \
  HMAC_EXPECTED_FILE="${restore_test_marker}.hmac-sha256" \
    node -e '
      const crypto = require("crypto");
      const fs = require("fs");
      const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || "";
      const expected = fs.readFileSync(process.env.HMAC_EXPECTED_FILE, "utf8").trim();
      if (Buffer.byteLength(key, "utf8") < 32 || !/^[0-9a-f]{64}$/.test(expected)) process.exit(1);
      const actual = crypto.createHmac("sha256", key).update(fs.readFileSync(process.env.HMAC_INPUT_FILE)).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) process.exit(1);
    ' || {
      echo "Restore-test evidence signature verification failed." >&2
      exit 1
    }
  if ! mapfile -t restore_marker_values < <(
    RESTORE_TEST_ARCHIVE="${LATEST_ARCHIVE}" \
    RESTORE_TEST_SHA256="${ACTUAL_ARCHIVE_SHA256}" \
    RESTORE_TEST_UPLOADS_ARCHIVE="${SOURCE_UPLOADS_ARCHIVE}" \
    RESTORE_TEST_UPLOADS_SHA256="${SOURCE_UPLOADS_ARCHIVE_SHA256}" \
    RESTORE_TEST_MEDIA_MANIFEST="${SOURCE_UPLOADS_MANIFEST}" \
    RESTORE_TEST_MEDIA_MANIFEST_SHA256="${SOURCE_UPLOADS_MANIFEST_SHA256}" \
      node -e '
        const fs = require("fs");
        const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        const testedAt = Date.parse(marker.timestamp);
        const ageMs = Date.now() - testedAt;
        const valid = marker.schemaVersion === 2
          && marker.archive === process.env.RESTORE_TEST_ARCHIVE
          && marker.archiveSha256 === process.env.RESTORE_TEST_SHA256
          && marker.mode === "restore-test"
          && marker.sanitizedNamespace === "menorah.*"
          && marker.uploadsArchive === process.env.RESTORE_TEST_UPLOADS_ARCHIVE
          && marker.uploadsArchiveSha256 === process.env.RESTORE_TEST_UPLOADS_SHA256
          && marker.mediaManifest === process.env.RESTORE_TEST_MEDIA_MANIFEST
          && marker.mediaManifestSha256 === process.env.RESTORE_TEST_MEDIA_MANIFEST_SHA256
          && marker.mediaReferencesVerified === true
          && typeof marker.sanitizedArchive === "string"
          && !/[\r\n]/.test(marker.sanitizedArchive)
          && /^[0-9a-f]{64}$/.test(marker.sanitizedArchiveSha256 || "")
          && Number.isFinite(testedAt)
          && ageMs >= 0
          && ageMs <= 24 * 60 * 60 * 1000;
        if (!valid) process.exit(1);
        process.stdout.write(`${marker.sanitizedArchive}\n${marker.sanitizedArchiveSha256}\n`);
      ' "${restore_test_marker}"
  ) || (( ${#restore_marker_values[@]} != 2 )); then
    echo "The exact source archive needs a successful restore-test and sanitized Menorah artifact from the last 24 hours." >&2
    exit 1
  fi
  sanitized_real="$(realpath -e -- "${restore_marker_values[0]}" 2>/dev/null || true)"
  case "${sanitized_real}" in
    "${BACKUP_ROOT_REAL}"/restore-tests/sanitized/*.menorah.archive.gz.enc) ;;
    *)
      echo "The restore-test marker references an unsafe sanitized archive path." >&2
      exit 1
      ;;
  esac
  if [[ ! -r "${sanitized_real}.sha256" ]]; then
    echo "The sanitized archive checksum sidecar is missing." >&2
    exit 1
  fi
  read -r sanitized_recorded_sha _ < "${sanitized_real}.sha256"
  sanitized_actual_sha="$(sha256sum "${sanitized_real}" | awk '{print $1}')"
  if [[ "${sanitized_recorded_sha}" != "${restore_marker_values[1]}" \
    || "${sanitized_actual_sha}" != "${restore_marker_values[1]}" \
    || "${RESTORE_EXPECTED_SANITIZED_SHA256:-}" != "${restore_marker_values[1]}" ]]; then
    echo "RESTORE_EXPECTED_SANITIZED_SHA256 must match the checksum-verified restore-test artifact." >&2
    exit 1
  fi
  artifact_metadata="${sanitized_real}.metadata.json"
  if [[ ! -r "${artifact_metadata}" || ! -r "${artifact_metadata}.hmac-sha256" ]]; then
    echo "The signed sanitized artifact metadata is missing." >&2
    exit 1
  fi
  HMAC_INPUT_FILE="${artifact_metadata}" \
  HMAC_EXPECTED_FILE="${artifact_metadata}.hmac-sha256" \
    node -e '
      const crypto = require("crypto");
      const fs = require("fs");
      const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || "";
      const expected = fs.readFileSync(process.env.HMAC_EXPECTED_FILE, "utf8").trim();
      if (Buffer.byteLength(key, "utf8") < 32 || !/^[0-9a-f]{64}$/.test(expected)) process.exit(1);
      const actual = crypto.createHmac("sha256", key).update(fs.readFileSync(process.env.HMAC_INPUT_FILE)).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) process.exit(1);
    ' || {
      echo "Sanitized artifact metadata signature verification failed." >&2
      exit 1
    }
  ARTIFACT_SOURCE_ARCHIVE="${LATEST_ARCHIVE}" \
  ARTIFACT_SOURCE_SHA256="${ACTUAL_ARCHIVE_SHA256}" \
  ARTIFACT_DERIVED_ARCHIVE="${sanitized_real}" \
  ARTIFACT_DERIVED_SHA256="${sanitized_actual_sha}" \
  ARTIFACT_SOURCE_GIT_SHA="${backup_git_sha}" \
  ARTIFACT_TOOLS_VERSION="${SOURCE_DATABASE_TOOLS_VERSION}" \
  ARTIFACT_SERVER_VERSION="${SOURCE_MONGO_SERVER_VERSION}" \
  ARTIFACT_SERVER_FCV="${SOURCE_MONGO_SERVER_FCV}" \
    node -e '
      const fs = require("fs");
      const metadata = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const valid = metadata.schemaVersion === 1
        && metadata.artifactType === "menorah-sanitized-restore"
        && metadata.sourceArtifactType === "mongodb-full-instance-oplog"
        && metadata.sourceArchive === process.env.ARTIFACT_SOURCE_ARCHIVE
        && metadata.sourceArchiveSha256 === process.env.ARTIFACT_SOURCE_SHA256
        && metadata.sourceBackupGitSha === process.env.ARTIFACT_SOURCE_GIT_SHA
        && metadata.derivedArchive === process.env.ARTIFACT_DERIVED_ARCHIVE
        && metadata.derivedArchiveSha256 === process.env.ARTIFACT_DERIVED_SHA256
        && JSON.stringify(metadata.namespaceAllowlist) === JSON.stringify(["menorah.*"])
        && metadata.oplogReplayVerified === true
        && metadata.productionOplogReplayAllowed === false
        && metadata.encrypted === true
        && metadata.databaseToolsVersion === process.env.ARTIFACT_TOOLS_VERSION
        && metadata.mongoServerVersion === process.env.ARTIFACT_SERVER_VERSION
        && metadata.mongoFeatureCompatibilityVersion === process.env.ARTIFACT_SERVER_FCV;
      if (!valid) process.exit(1);
    ' "${artifact_metadata}" || {
      echo "Sanitized artifact metadata does not match the selected source and derived bytes." >&2
      exit 1
    }
  SANITIZED_ARCHIVE="${sanitized_real}"
  SANITIZED_ARCHIVE_SHA256="${sanitized_actual_sha}"
  if [[ -e "${RESTORE_IN_PROGRESS_MARKER}" || -e "${RESTORE_REVIEW_MARKER}" \
    || -e "${MIGRATION_IN_PROGRESS_MARKER}" ]]; then
    echo "Unresolved restore or migration state blocks another production restore." >&2
    exit 1
  fi
  previous_migration_sha="$(cat "${MIGRATION_MARKER}" 2>/dev/null || true)"
  RESTORE_STATE_CURRENT_SHA="${current_sha}" \
  RESTORE_STATE_BACKUP_SHA="${backup_git_sha}" \
  RESTORE_STATE_ARCHIVE="${LATEST_ARCHIVE}" \
  RESTORE_STATE_ARCHIVE_SHA="${ACTUAL_ARCHIVE_SHA256}" \
  RESTORE_STATE_SANITIZED_ARCHIVE="${SANITIZED_ARCHIVE}" \
  RESTORE_STATE_SANITIZED_SHA="${SANITIZED_ARCHIVE_SHA256}" \
  RESTORE_STATE_CHANGE="${change_reference}" \
  RESTORE_STATE_PREVIOUS_MIGRATION="${previous_migration_sha}" \
  RESTORE_STATE_STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    node - <<'NODE' > "${RESTORE_IN_PROGRESS_MARKER}"
const state = {
  schemaVersion: 1,
  status: 'production-restore-in-progress',
  startedAt: process.env.RESTORE_STATE_STARTED,
  currentReleaseSha: process.env.RESTORE_STATE_CURRENT_SHA,
  backupReleaseSha: process.env.RESTORE_STATE_BACKUP_SHA,
  archive: process.env.RESTORE_STATE_ARCHIVE,
  archiveSha256: process.env.RESTORE_STATE_ARCHIVE_SHA,
  sanitizedArtifactType: 'menorah-sanitized-restore',
  sanitizedArchive: process.env.RESTORE_STATE_SANITIZED_ARCHIVE,
  sanitizedArchiveSha256: process.env.RESTORE_STATE_SANITIZED_SHA,
  namespaceAllowlist: ['menorah.*'],
  changeReference: process.env.RESTORE_STATE_CHANGE,
  previousMigrationMarker: process.env.RESTORE_STATE_PREVIOUS_MIGRATION || null,
};
process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
NODE
  chmod 0600 "${RESTORE_IN_PROGRESS_MARKER}"
}

stop_and_verify_writers() {
  compose_cmd stop -t "${RESTORE_STOP_TIMEOUT_SECONDS:-60}" "${WRITER_SERVICES[@]}"
  local service container running
  for service in "${WRITER_SERVICES[@]}"; do
    container="$(compose_cmd ps -a -q "${service}" 2>/dev/null || true)"
    if [[ -n "${container}" ]]; then
      running="$(docker inspect --format '{{.State.Running}}' "${container}")"
      if [[ "${running}" != "false" ]]; then
        echo "Writer service did not stop: ${service}" >&2
        exit 1
      fi
    fi
  done
}

stream_source_uploads_archive() {
  if [[ "${SOURCE_UPLOADS_ARCHIVE}" == *.enc ]]; then
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "${SOURCE_UPLOADS_ARCHIVE}" \
      -out - \
      -pass env:BACKUP_ENCRYPTION_PASSWORD
  else
    command cat -- "${SOURCE_UPLOADS_ARCHIVE}"
  fi
}

prepare_staged_media() {
  local data_root_real staging_parent_real listing entry type permissions
  data_root_real="$(realpath -e -- "${MENORAH_DATA_ROOT}")"
  if [[ -L "${MEDIA_STAGING_PARENT}" ]]; then
    echo "Media restore staging parent must not be a symbolic link." >&2
    exit 1
  fi
  mkdir -p -- "${MEDIA_STAGING_PARENT}"
  chmod 0700 "${MEDIA_STAGING_PARENT}"
  staging_parent_real="$(realpath -e -- "${MEDIA_STAGING_PARENT}")"
  if [[ "${staging_parent_real}" != "${data_root_real}/media-restore-staging" ]]; then
    echo "Media restore staging escaped MENORAH_DATA_ROOT." >&2
    exit 1
  fi
  MEDIA_STAGING_ROOT="$(mktemp -d "${staging_parent_real}/restore-${ACTUAL_ARCHIVE_SHA256}.XXXXXXXX")"
  chmod 0700 "${MEDIA_STAGING_ROOT}"
  listing="${MEDIA_STAGING_ROOT}/archive-paths.txt"
  permissions="${MEDIA_STAGING_ROOT}/archive-types.txt"

  stream_source_uploads_archive | tar -tzf - > "${listing}"
  if [[ ! -s "${listing}" ]]; then
    echo "Uploads archive contains no root directory." >&2
    exit 1
  fi
  while IFS= read -r entry; do
    entry="${entry%/}"
    if [[ "${entry}" != "uploads" \
      && ! "${entry}" =~ ^uploads(/[A-Za-z0-9][A-Za-z0-9._-]*)+$ ]]; then
      echo "Uploads archive contains an unsafe path: ${entry}" >&2
      exit 1
    fi
  done < "${listing}"

  stream_source_uploads_archive | tar -tvzf - > "${permissions}"
  while IFS= read -r type _; do
    case "${type:0:1}" in
      -|d) ;;
      *)
        echo "Uploads archive contains a non-regular entry." >&2
        exit 1
        ;;
    esac
  done < "${permissions}"

  stream_source_uploads_archive \
    | tar -xzf - \
        -C "${MEDIA_STAGING_ROOT}" \
        --no-same-owner \
        --no-same-permissions
  if [[ ! -d "${MEDIA_STAGING_ROOT}/uploads" \
    || -L "${MEDIA_STAGING_ROOT}/uploads" ]]; then
    echo "Uploads archive did not create a safe uploads directory." >&2
    exit 1
  fi
  node "${REPO_ROOT}/menorah/backend/src/scripts/media-manifest.js" verify \
    --root "${MEDIA_STAGING_ROOT}/uploads" \
    --manifest "${SOURCE_UPLOADS_MANIFEST}"
}

verify_staged_media_references() {
  local restore_mode="$1"
  local profile uri
  if [[ "${restore_mode}" == "production" ]]; then
    profile="production-restore"
    uri="${MONGODB_PRODUCTION_RESTORE_URI:?MONGODB_PRODUCTION_RESTORE_URI is required}"
  else
    profile="restore-test"
    uri="${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
  fi

  compose_cmd --profile "${profile}" run --rm --no-deps -T \
    --user "$(id -u):$(id -g)" \
    -e "MEDIA_VERIFY_MONGODB_URI=${uri}" \
    -v "${MEDIA_STAGING_ROOT}/uploads:/media-staged/uploads:ro" \
    -v "${SOURCE_UPLOADS_MANIFEST}:/media-staged/manifest.json:ro" \
    media-verifier \
    node src/scripts/verify-media-references.js \
      --root /media-staged/uploads \
      --manifest /media-staged/manifest.json \
      --require-local-managed
}

normalize_staged_media_permissions() {
  local run_as gid
  run_as="${BACKUP_RUN_AS:-$(id -u):$(id -g)}"
  if [[ ! "${run_as}" =~ ^[0-9]+:[0-9]+$ ]]; then
    echo "BACKUP_RUN_AS must be a numeric uid:gid pair for media ownership recovery." >&2
    exit 1
  fi
  gid="${run_as#*:}"
  compose_cmd --profile production-restore run --rm --no-deps -T \
    --user 0:0 \
    --cap-add CHOWN \
    --cap-add FOWNER \
    -e "MEDIA_OPERATOR_GID=${gid}" \
    -v "${MEDIA_STAGING_ROOT}/uploads:/media-permissions" \
    media-verifier \
    sh -euc '
      chown -R "100:${MEDIA_OPERATOR_GID}" /media-permissions
      find /media-permissions -type d -exec chmod 2750 {} +
      find /media-permissions -type f -exec chmod 0640 {} +
      chmod 2770 /media-permissions
    '
}

publish_staged_media() {
  local current parent parent_real data_root_real rollback
  current="${MENORAH_DATA_ROOT}/uploads"
  parent="${MENORAH_DATA_ROOT}/media-restore-rollback"
  data_root_real="$(realpath -e -- "${MENORAH_DATA_ROOT}")"
  if [[ ! -d "${current}" || -L "${current}" \
    || "$(realpath -e -- "${current}")" != "${data_root_real}/uploads" ]]; then
    echo "Current production uploads path is missing or unsafe." >&2
    exit 1
  fi
  if [[ -L "${parent}" ]]; then
    echo "Media rollback parent must not be a symbolic link." >&2
    exit 1
  fi
  mkdir -p -- "${parent}"
  chmod 0700 "${parent}"
  parent_real="$(realpath -e -- "${parent}")"
  if [[ "${parent_real}" != "${data_root_real}/media-restore-rollback" ]]; then
    echo "Media rollback parent escaped MENORAH_DATA_ROOT." >&2
    exit 1
  fi
  rollback="${parent_real}/uploads-before-$(date -u +%Y%m%dT%H%M%SZ)-${ACTUAL_ARCHIVE_SHA256:0:12}"
  if [[ -e "${rollback}" ]]; then
    echo "Media rollback target already exists: ${rollback}" >&2
    exit 1
  fi

  normalize_staged_media_permissions
  mv -T -- "${current}" "${rollback}"
  if ! mv -T -- "${MEDIA_STAGING_ROOT}/uploads" "${current}"; then
    mv -T -- "${rollback}" "${current}" || {
      echo "CRITICAL: media publish and immediate filesystem rollback both failed." >&2
      exit 1
    }
    echo "Media publish failed; the pre-restore upload tree was restored." >&2
    exit 1
  fi
  MEDIA_ROLLBACK_PATH="${rollback}"
}

prepare_restore_test_target() {
  local ready actual_tools
  local -a actual_server
  if [[ "${MONGODB_RESTORE_TEST_URI:-}" != "mongodb://mongo-restore-test:27017/?replicaSet=menorah-restore-rs" ]]; then
    echo "MONGODB_RESTORE_TEST_URI must target the fixed no-auth disposable restore replica set." >&2
    exit 1
  fi
  destroy_restore_test_target
  RESTORE_TEST_ACTIVE=true
  compose_cmd --profile restore-test up -d mongo-restore-test

  ready=false
  for _attempt in $(seq 1 60); do
    if compose_cmd exec -T mongo-restore-test mongosh --quiet --eval \
      'quit(db.adminCommand({ ping: 1 }).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "${ready}" != "true" ]]; then
    echo "Disposable restore-test MongoDB did not become reachable." >&2
    exit 1
  fi

  compose_cmd exec -T mongo-restore-test mongosh --quiet --eval '
    try {
      rs.status();
    } catch (error) {
      if (error.codeName !== "NotYetInitialized") throw error;
      assert.commandWorked(rs.initiate({
        _id: "menorah-restore-rs",
        members: [{ _id: 0, host: "mongo-restore-test:27017" }],
      }));
    }
  ' >/dev/null
  ready=false
  for _attempt in $(seq 1 60); do
    if compose_cmd exec -T mongo-restore-test mongosh --quiet --eval \
      'quit(db.hello().isWritablePrimary === true ? 0 : 1)' >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "${ready}" != "true" ]]; then
    echo "Disposable restore-test replica set did not elect a writable primary." >&2
    exit 1
  fi
  mapfile -t actual_server < <(
    compose_cmd exec -T mongo-restore-test mongosh --quiet --eval '
      const fcv = db.getSiblingDB("admin").runCommand({ getParameter: 1, featureCompatibilityVersion: 1 });
      assert.commandWorked(fcv);
      print(db.version());
      print(fcv.featureCompatibilityVersion.version);
    '
  )
  actual_tools="$(restore_test_cmd mongorestore --version \
    | sed -n 's/^mongorestore version: //p' | head -n 1)"
  if [[ "${actual_server[0]:-}" != "${SOURCE_MONGO_SERVER_VERSION}" \
    || "${actual_server[1]:-}" != "${SOURCE_MONGO_SERVER_FCV}" \
    || "${actual_tools}" != "${SOURCE_DATABASE_TOOLS_VERSION}" ]]; then
    echo "Disposable restore tools/server/FCV do not exactly match the signed source backup metadata." >&2
    exit 1
  fi
}

validate_restore_identity() {
  RESTORE_URI_TO_VALIDATE="${MONGODB_PRODUCTION_RESTORE_URI:?MONGODB_PRODUCTION_RESTORE_URI is required}" \
  RESTORE_EXPECTED_REPLICA_SET="${MONGODB_REPLICA_SET_NAME:-menorah-rs}" \
    node - <<'NODE'
const parsed = new URL(process.env.RESTORE_URI_TO_VALIDATE);
if (parsed.protocol !== 'mongodb:'
  || (parsed.pathname && parsed.pathname !== '/')
  || parsed.searchParams.get('authSource') !== 'admin'
  || parsed.searchParams.get('replicaSet') !== process.env.RESTORE_EXPECTED_REPLICA_SET) {
  console.error('MONGODB_PRODUCTION_RESTORE_URI must use an empty database path, admin authentication, and the configured replica set.');
  process.exit(1);
}
NODE
  run_restore_tool production \
    -e "EXPECTED_DATABASE_TOOLS_VERSION=${SOURCE_DATABASE_TOOLS_VERSION}" \
    bash -lc '
      set -euo pipefail
      actual_tools="$(mongorestore --version | sed -n "s/^mongorestore version: //p" | head -n 1)"
      if [[ "$actual_tools" != "$EXPECTED_DATABASE_TOOLS_VERSION" ]]; then
        echo "Production restore runner Database Tools version does not match the signed artifact." >&2
        exit 1
      fi
      : "${MONGODB_PRODUCTION_RESTORE_URI:?MONGODB_PRODUCTION_RESTORE_URI is required}"
      mongosh --nodb --quiet --eval '\''
        db = connect(process.env.MONGODB_PRODUCTION_RESTORE_URI);
        const status = db.getSiblingDB("admin").runCommand({ connectionStatus: 1, showPrivileges: false });
        const actual = (status.authInfo?.authenticatedUserRoles || [])
          .map(({ role, db: roleDb }) => role + "@" + roleDb)
          .sort();
        const approved = ["dbAdmin@menorah", "readWrite@menorah"].sort();
        if (actual.length !== approved.length || !actual.every((role, index) => role === approved[index])) quit(1);
      '\'' >/dev/null
    '
}

verify_restored_domain_invariants() {
  local restore_mode="$1"
  run_restore_tool "${restore_mode}" \
    -e "MENORAH_RESTORE_MODE=${restore_mode}" \
    bash -lc '
      set -euo pipefail
      if [[ "$MENORAH_RESTORE_MODE" == "production" ]]; then
        : "${MONGODB_PRODUCTION_RESTORE_URI:?MONGODB_PRODUCTION_RESTORE_URI is required}"
      else
        : "${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
      fi
      mongosh --nodb --quiet --eval '\''
        const restoreUri = process.env.MENORAH_RESTORE_MODE === "production"
          ? process.env.MONGODB_PRODUCTION_RESTORE_URI
          : process.env.MONGODB_RESTORE_TEST_URI;
        db = connect(restoreUri);
        const target = db.getSiblingDB("menorah");
        const required = ["users", "bookings", "counsellors", "messages", "chatrooms", "articles"];
        const collections = new Set(target.getCollectionNames().map((name) => name.toLowerCase()));
        const missing = required.filter((name) => !collections.has(name));
        const orphanCount = (collection, localField, foreignCollection) => {
          const result = target.getCollection(collection).aggregate([
            { $match: { [localField]: { $type: "objectId" } } },
            { $lookup: { from: foreignCollection, localField, foreignField: "_id", as: "resolved" } },
            { $match: { resolved: { $size: 0 } } },
            { $count: "count" },
          ]).toArray();
          return result[0]?.count || 0;
        };
        const violations = {
          bookingUsers: orphanCount("bookings", "user", "users"),
          bookingCounsellors: orphanCount("bookings", "counsellor", "counsellors"),
          messageRooms: orphanCount("messages", "room", "chatrooms"),
          messageSenders: orphanCount("messages", "sender", "users"),
        };
        print(JSON.stringify({ missingRequiredCollections: missing, referentialViolations: violations }));
        if (missing.length > 0 || Object.values(violations).some((count) => count > 0)) quit(1);
      '\''
    '
}

restore_full_source_into_isolated_target() {
  if [[ "${LATEST_ARCHIVE}" == *.enc ]]; then
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "${LATEST_ARCHIVE}" \
      -out - \
      -pass env:BACKUP_ENCRYPTION_PASSWORD
  else
    command cat -- "${LATEST_ARCHIVE}"
  fi | restore_test_stream_cmd bash -lc '
    set -euo pipefail
    : "${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
    /scripts/run-mongo-tool-secure.sh MONGODB_RESTORE_TEST_URI mongorestore \
      --archive \
      --gzip \
      --drop \
      --oplogReplay \
      --stopOnError
  '
}

derive_and_verify_sanitized_artifact() {
  local sanitized_dir sanitized_dir_real encrypted_tmp final_archive
  local metadata_tmp metadata_hmac_tmp final_metadata source_git_sha derived_sha
  local checksum_tmp
  : "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required for sanitized restore artifacts}"
  : "${BACKUP_INTEGRITY_HMAC_KEY:?BACKUP_INTEGRITY_HMAC_KEY is required for sanitized restore artifacts}"
  if (( ${#BACKUP_INTEGRITY_HMAC_KEY} < 32 )); then
    echo "BACKUP_INTEGRITY_HMAC_KEY must contain at least 32 characters." >&2
    exit 1
  fi
  sanitized_dir="${MENORAH_BACKUP_ROOT}/restore-tests/sanitized"
  mkdir -p -- "${sanitized_dir}"
  sanitized_dir_real="$(realpath -e -- "${sanitized_dir}")"
  if [[ "${sanitized_dir_real}" != "${BACKUP_ROOT_REAL}/restore-tests/sanitized" ]]; then
    echo "The sanitized artifact directory escaped MENORAH_BACKUP_ROOT." >&2
    exit 1
  fi
  chmod 0700 "${sanitized_dir}"
  encrypted_tmp="$(mktemp "${sanitized_dir_real}/.${ACTUAL_ARCHIVE_SHA256}.XXXXXXXX.menorah.archive.gz.enc.tmp")"
  TEMPORARY_PLAINTEXTS+=("${encrypted_tmp}")

  restore_test_stream_cmd bash -lc '
    set -euo pipefail
    : "${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
    /scripts/run-mongo-tool-secure.sh MONGODB_RESTORE_TEST_URI mongodump \
      --db=menorah \
      --archive \
      --gzip
  ' | openssl enc -aes-256-cbc -pbkdf2 -salt \
    -out "${encrypted_tmp}" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD
  if [[ ! -s "${encrypted_tmp}" ]]; then
    echo "The encrypted sanitized Menorah archive was not created." >&2
    exit 1
  fi

  # The derived archive is verified in a second fresh replica-set volume, so
  # no admin users, unrelated databases, or oplog data from the full archive
  # can survive into the production restore artifact.
  destroy_restore_test_target
  prepare_restore_test_target
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${encrypted_tmp}" \
    -out - \
    -pass env:BACKUP_ENCRYPTION_PASSWORD \
    | restore_test_stream_cmd bash -lc '
    set -euo pipefail
    : "${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
    /scripts/run-mongo-tool-secure.sh MONGODB_RESTORE_TEST_URI mongorestore \
      --archive \
      --gzip \
      --drop \
      --nsInclude="menorah.*" \
      --stopOnError
  '
  verify_restored_domain_invariants restore-test
  restore_test_cmd bash -lc '
    set -euo pipefail
    : "${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
    mongosh --nodb --quiet --eval '\''
      db = connect(process.env.MONGODB_RESTORE_TEST_URI);
      const result = db.getSiblingDB("admin").runCommand({ listDatabases: 1, nameOnly: true });
      assert.commandWorked(result);
      const permitted = new Set(["admin", "config", "local", "menorah"]);
      const unexpected = result.databases.map(({ name }) => name).filter((name) => !permitted.has(name));
      const restoredUsers = db.getSiblingDB("admin").getCollection("system.users").countDocuments({});
      if (unexpected.length > 0 || restoredUsers !== 0) quit(1);
    '\''
  '

  derived_sha="$(sha256sum "${encrypted_tmp}" | awk '{print $1}')"
  final_archive="${sanitized_dir}/${ACTUAL_ARCHIVE_SHA256}.menorah.archive.gz.enc"
  final_metadata="${final_archive}.metadata.json"
  metadata_tmp="${encrypted_tmp}.metadata.json"
  metadata_hmac_tmp="${metadata_tmp}.hmac-sha256"
  source_git_sha="${SOURCE_DEPLOYED_RELEASE_SHA}"
  if [[ ! "${source_git_sha}" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "The source backup is missing a valid release commit SHA." >&2
    exit 1
  fi

  ARTIFACT_SOURCE_ARCHIVE="${LATEST_ARCHIVE}" \
  ARTIFACT_SOURCE_SHA256="${ACTUAL_ARCHIVE_SHA256}" \
  ARTIFACT_DERIVED_ARCHIVE="${final_archive}" \
  ARTIFACT_DERIVED_SHA256="${derived_sha}" \
  ARTIFACT_SOURCE_GIT_SHA="${source_git_sha}" \
  ARTIFACT_TOOLS_VERSION="${SOURCE_DATABASE_TOOLS_VERSION}" \
  ARTIFACT_SERVER_VERSION="${SOURCE_MONGO_SERVER_VERSION}" \
  ARTIFACT_SERVER_FCV="${SOURCE_MONGO_SERVER_FCV}" \
  ARTIFACT_CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    node - <<'NODE' > "${metadata_tmp}"
const metadata = {
  schemaVersion: 1,
  artifactType: 'menorah-sanitized-restore',
  createdAt: process.env.ARTIFACT_CREATED_AT,
  namespaceAllowlist: ['menorah.*'],
  sourceArtifactType: 'mongodb-full-instance-oplog',
  sourceArchive: process.env.ARTIFACT_SOURCE_ARCHIVE,
  sourceArchiveSha256: process.env.ARTIFACT_SOURCE_SHA256,
  sourceBackupGitSha: process.env.ARTIFACT_SOURCE_GIT_SHA,
  derivedArchive: process.env.ARTIFACT_DERIVED_ARCHIVE,
  derivedArchiveSha256: process.env.ARTIFACT_DERIVED_SHA256,
  encrypted: true,
  oplogReplayVerified: true,
  productionOplogReplayAllowed: false,
  databaseToolsVersion: process.env.ARTIFACT_TOOLS_VERSION,
  mongoServerVersion: process.env.ARTIFACT_SERVER_VERSION,
  mongoFeatureCompatibilityVersion: process.env.ARTIFACT_SERVER_FCV,
};
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
NODE
  HMAC_INPUT_FILE="${metadata_tmp}" node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    process.stdout.write(`${crypto.createHmac("sha256", process.env.BACKUP_INTEGRITY_HMAC_KEY).update(fs.readFileSync(process.env.HMAC_INPUT_FILE)).digest("hex")}\n`);
  ' > "${metadata_hmac_tmp}"
  chmod 0600 "${encrypted_tmp}" "${metadata_tmp}" "${metadata_hmac_tmp}"

  # Publishing is forbidden until the no-auth database and its volume are
  # proven absent. This prevents a success marker from outliving cleanup.
  destroy_restore_test_target
  mv -f -- "${encrypted_tmp}" "${final_archive}"
  mv -f -- "${metadata_tmp}" "${final_metadata}"
  mv -f -- "${metadata_hmac_tmp}" "${final_metadata}.hmac-sha256"
  checksum_tmp="$(mktemp "${sanitized_dir}/.checksum.XXXXXX")"
  printf '%s  %s\n' "${derived_sha}" "$(basename "${final_archive}")" > "${checksum_tmp}"
  chmod 0600 "${checksum_tmp}"
  mv -f -- "${checksum_tmp}" "${final_archive}.sha256"

  SANITIZED_ARCHIVE="${final_archive}"
  SANITIZED_ARCHIVE_SHA256="${derived_sha}"
  write_restore_test_marker "${SANITIZED_ARCHIVE}" "${SANITIZED_ARCHIVE_SHA256}"
}

capture_non_menorah_fingerprint() {
  compose_cmd exec -T mongo-primary bash -lc '
    set -euo pipefail
    mongosh --nodb --quiet --eval '\''
        db = connect("mongodb://mongo-primary:27017/admin?authSource=admin", process.env.MONGO_ROOT_USER, process.env.MONGO_ROOT_PASSWORD);
        const admin = db.getSiblingDB("admin");
        const users = admin.getCollection("system.users")
          .find({})
          .sort({ _id: 1 })
          .toArray();
        const roles = admin.getCollection("system.roles")
          .find({})
          .sort({ _id: 1 })
          .toArray();
        const listed = admin.runCommand({ listDatabases: 1, nameOnly: true });
        assert.commandWorked(listed);
        const excluded = new Set(["admin", "config", "local", "menorah"]);
        const unrelated = listed.databases
          .map(({ name }) => name)
          .filter((name) => !excluded.has(name))
          .sort()
          .map((name) => {
            const hash = db.getSiblingDB(name).runCommand({ dbHash: 1 });
            assert.commandWorked(hash);
            return { name, md5: hash.md5, collections: hash.collections };
          });
        print(EJSON.stringify({ users, roles, unrelated }, { relaxed: false }));
      '\''
  ' | sha256sum | awk '{print $1}'
}

case "${MODE}" in
  restore-test)
    echo "Staging and byte-verifying the signed immutable media artifact."
    prepare_staged_media
    echo "Starting a fresh isolated no-auth restore-test replica set."
    prepare_restore_test_target
    echo "Replaying the checksum-verified full-instance oplog archive only inside the disposable target."
    restore_full_source_into_isolated_target
    verify_restored_domain_invariants restore-test
    echo "Verifying every restored database media reference against the staged bytes."
    verify_staged_media_references restore-test
    echo "Deriving and independently verifying an encrypted Menorah-only restore artifact."
    derive_and_verify_sanitized_artifact
    echo "Restore-test complete; the no-auth containers and database volumes are absent."
    echo "Sanitized artifact digest: ${SANITIZED_ARCHIVE_SHA256}"
    exit 0
    ;;
  production)
    validate_production_restore_preconditions
    validate_restore_identity
    echo "Stopping and verifying every API/worker writer before the destructive boundary..."
    stop_and_verify_writers
    echo "Taking a fresh, quiesced pre-restore manual backup under the shared backup lock..."
    BACKUP_PRUNE_AFTER_SUCCESS=false "${SCRIPT_DIR}/backup-now.sh" manual
    echo "Staging and byte-verifying the selected immutable media artifact."
    prepare_staged_media
    CONTROL_PLANE_FINGERPRINT_BEFORE="$(capture_non_menorah_fingerprint)"
    if [[ ! "${CONTROL_PLANE_FINGERPRINT_BEFORE}" =~ ^[0-9a-f]{64}$ ]]; then
      echo "Could not capture the pre-restore non-Menorah control fingerprint." >&2
      exit 1
    fi
    ;;
esac

echo "Restoring only the signed, checksum-verified Menorah namespace artifact."
echo "openssl decrypt stream | mongorestore --config=<ephemeral-mode-0600-file> --archive --gzip --drop --nsInclude=menorah.* --stopOnError"
run_restore_tool production bash -lc '
    set -euo pipefail
    : "${MONGODB_PRODUCTION_RESTORE_URI:?MONGODB_PRODUCTION_RESTORE_URI is required}"
    mongosh --nodb --quiet --eval '\''
      db = connect(process.env.MONGODB_PRODUCTION_RESTORE_URI);
      assert(db.getSiblingDB("menorah").dropDatabase().ok === 1);
    '\'' >/dev/null
  '
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${SANITIZED_ARCHIVE}" \
  -out - \
  -pass env:BACKUP_ENCRYPTION_PASSWORD \
  | run_restore_stream_tool production bash -lc '
    set -euo pipefail
    uri="${MONGODB_PRODUCTION_RESTORE_URI:?MONGODB_PRODUCTION_RESTORE_URI is required}"
    [[ "$uri" != *$'\''\n'\''* && "$uri" != *$'\''\r'\''* ]] || exit 64
    config_file="$(mktemp /tmp/menorah-mongo-tool.XXXXXXXX.yml)"
    trap '\''rm -f -- "$config_file"'\'' EXIT
    chmod 0600 "$config_file"
    escaped_uri="${uri//\\/\\\\}"
    escaped_uri="${escaped_uri//\"/\\\"}"
    printf '\''uri: "%s"\n'\'' "$escaped_uri" > "$config_file"
    mongorestore \
      --config="$config_file" \
      --archive \
      --gzip \
      --drop \
      --nsInclude="menorah.*" \
      --stopOnError
  '

verify_restored_domain_invariants production
echo "Verifying every restored database media reference before publishing uploads."
verify_staged_media_references production
echo "Publishing the verified uploads tree while all writers remain stopped."
publish_staged_media
CONTROL_PLANE_FINGERPRINT_AFTER="$(capture_non_menorah_fingerprint)"
if [[ "${CONTROL_PLANE_FINGERPRINT_AFTER}" != "${CONTROL_PLANE_FINGERPRINT_BEFORE}" ]]; then
  echo "A non-Menorah database or admin identity changed during the scoped restore; writers remain stopped." >&2
  exit 1
fi

# The restored database may predate the current code's migrations. Never leave
# the old applied marker in place and never restart writers from this script.
rm -f -- "${MIGRATION_MARKER}"
RESTORE_STATE_COMPLETED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
RESTORE_STATE_CONTROL_BEFORE="${CONTROL_PLANE_FINGERPRINT_BEFORE}" \
RESTORE_STATE_CONTROL_AFTER="${CONTROL_PLANE_FINGERPRINT_AFTER}" \
RESTORE_STATE_MEDIA_MANIFEST="${SOURCE_UPLOADS_MANIFEST}" \
RESTORE_STATE_MEDIA_MANIFEST_SHA="${SOURCE_UPLOADS_MANIFEST_SHA256}" \
RESTORE_STATE_MEDIA_ROLLBACK="${MEDIA_ROLLBACK_PATH}" \
  node -e '
    const fs = require("fs");
    const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    state.status = "production-restore-requires-schema-review";
    state.completedAt = process.env.RESTORE_STATE_COMPLETED;
    state.nonMenorahControlFingerprintBefore = process.env.RESTORE_STATE_CONTROL_BEFORE;
    state.nonMenorahControlFingerprintAfter = process.env.RESTORE_STATE_CONTROL_AFTER;
    state.mediaManifest = process.env.RESTORE_STATE_MEDIA_MANIFEST;
    state.mediaManifestSha256 = process.env.RESTORE_STATE_MEDIA_MANIFEST_SHA;
    state.mediaPublished = true;
    state.preRestoreMediaRollbackPath = process.env.RESTORE_STATE_MEDIA_ROLLBACK;
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  ' "${RESTORE_IN_PROGRESS_MARKER}" > "${RESTORE_REVIEW_MARKER}.tmp"
chmod 0600 "${RESTORE_REVIEW_MARKER}.tmp"
mv -f -- "${RESTORE_REVIEW_MARKER}.tmp" "${RESTORE_REVIEW_MARKER}"
rm -f -- "${RESTORE_IN_PROGRESS_MARKER}"

echo "Production database restore completed with writers intentionally stopped."
echo "Schema/migration review is required; use acknowledge-production-restore.sh, then the exact-SHA update workflow."
