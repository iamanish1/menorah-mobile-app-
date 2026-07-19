#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
MODE="${1:-restore-test}"
DECRYPTED_ARCHIVE_CREATED=""

cleanup() {
  if [[ -n "${DECRYPTED_ARCHIVE_CREATED}" ]]; then
    rm -f "${DECRYPTED_ARCHIVE_CREATED}"
  fi
}
trap cleanup EXIT

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
REQUESTED_ARCHIVE="${RESTORE_ARCHIVE:-}"

if [[ -n "${REQUESTED_ARCHIVE}" ]]; then
  BACKUP_ROOT_REAL="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")"
  LATEST_ARCHIVE="$(realpath -e -- "${REQUESTED_ARCHIVE}" 2>/dev/null || true)"
  case "${LATEST_ARCHIVE}" in
    "${BACKUP_ROOT_REAL}"/restore-tests/*|"")
      echo "RESTORE_ARCHIVE must identify a backup archive outside restore-tests." >&2
      exit 1
      ;;
    "${BACKUP_ROOT_REAL}"/*) ;;
    *)
      echo "RESTORE_ARCHIVE must be contained by MENORAH_BACKUP_ROOT." >&2
      exit 1
      ;;
  esac
  if [[ ! -f "${LATEST_ARCHIVE}" || ( "${LATEST_ARCHIVE}" != *.archive.gz && "${LATEST_ARCHIVE}" != *.archive.gz.enc ) ]]; then
    echo "RESTORE_ARCHIVE is not a supported MongoDB backup archive." >&2
    exit 1
  fi
else
  LATEST_ARCHIVE="$(
    find "${MENORAH_BACKUP_ROOT}" \
      \( -path "${MENORAH_BACKUP_ROOT}/restore-tests/decrypted" -o -path "${MENORAH_BACKUP_ROOT}/restore-tests/mongo-data" \) -prune \
      -o -type f \( -name '*.archive.gz' -o -name '*.archive.gz.enc' \) -printf '%T@ %p\n' 2>/dev/null \
      | sort -nr \
      | head -n 1 \
      | cut -d' ' -f2- || true
  )"
fi

if [[ -z "${LATEST_ARCHIVE}" ]]; then
  echo "No MongoDB backup archive found under ${MENORAH_BACKUP_ROOT}" >&2
  exit 1
fi

BACKUP_ROOT_REAL="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")"

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    --env-file "${ENV_FILE}" \
    "$@"
}

ARCHIVE_FOR_RESTORE="${LATEST_ARCHIVE}"
if [[ "${LATEST_ARCHIVE}" == *.enc ]]; then
  : "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required to restore encrypted backups}"
  TMP_DIR="${MENORAH_BACKUP_ROOT}/restore-tests/decrypted"
  mkdir -p "${TMP_DIR}"
  ARCHIVE_FOR_RESTORE="${TMP_DIR}/$(basename "${LATEST_ARCHIVE%.enc}")"
  DECRYPTED_ARCHIVE_CREATED="${ARCHIVE_FOR_RESTORE}"
  echo "Decrypting ${LATEST_ARCHIVE} to temporary restore archive."
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${LATEST_ARCHIVE}" \
    -out "${ARCHIVE_FOR_RESTORE}" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD
fi

ARCHIVE_FOR_RESTORE_REAL="$(realpath -e -- "${ARCHIVE_FOR_RESTORE}")"
case "${ARCHIVE_FOR_RESTORE_REAL}" in
  "${BACKUP_ROOT_REAL}"/*) ;;
  *)
    echo "Resolved restore archive is outside MENORAH_BACKUP_ROOT." >&2
    exit 1
    ;;
esac
REL_ARCHIVE="${ARCHIVE_FOR_RESTORE_REAL#${BACKUP_ROOT_REAL}/}"

case "${MODE}" in
  restore-test)
    echo "Starting restore-test MongoDB container..."
    compose_cmd --profile restore-test up -d mongo-restore-test
    RESTORE_URI="${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
    if [[ ! "${RESTORE_URI}" =~ ^mongodb(\+srv)?:// ]]; then
      echo "MONGODB_RESTORE_TEST_URI must start with mongodb:// or mongodb+srv://." >&2
      exit 1
    fi
    RESTORE_MODE="restore-test"
    ;;
  production)
    if [[ "${RESTORE_CONFIRM_PRODUCTION:-false}" != "true" ]]; then
      echo "Refusing production restore. Set RESTORE_CONFIRM_PRODUCTION=true to continue." >&2
      exit 1
    fi
    RESTORE_URI="${MONGODB_URI:?MONGODB_URI is required}"
    if [[ ! "${RESTORE_URI}" =~ ^mongodb(\+srv)?:// ]]; then
      echo "MONGODB_URI must start with mongodb:// or mongodb+srv://." >&2
      exit 1
    fi
    RESTORE_MODE="production"
    ;;
  *)
    echo "Usage: restore-latest-backup.sh [restore-test|production]" >&2
    exit 2
    ;;
esac

echo "Restoring ${ARCHIVE_FOR_RESTORE} into ${MODE} target."
echo "mongorestore --uri=<redacted> --archive=/backups/${REL_ARCHIVE} --gzip --drop"
compose_cmd run --rm --no-deps \
  -e "MENORAH_RESTORE_MODE=${RESTORE_MODE}" \
  backup-runner bash -lc '
    set -euo pipefail
    case "$MENORAH_RESTORE_MODE" in
      restore-test)
        restore_uri="${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
        namespace_args=(--nsInclude="menorah.*" --nsFrom="menorah.*" --nsTo="menorah_restore_test.*")
        ;;
      production)
        restore_uri="${MONGODB_URI:?MONGODB_URI is required}"
        namespace_args=()
        ;;
      *) exit 2 ;;
    esac
    mongorestore --uri="$restore_uri" --archive="$1" --gzip --drop "${namespace_args[@]}"
  ' -- "/backups/${REL_ARCHIVE}"

if [[ "${MODE}" == "restore-test" ]]; then
  mkdir -p "${MENORAH_BACKUP_ROOT}/restore-tests"
  cat > "${MENORAH_BACKUP_ROOT}/restore-tests/latest-success.json" <<JSON
{
  "timestamp": "$(date -u +%Y%m%dT%H%M%SZ)",
  "archive": "${LATEST_ARCHIVE}",
  "mode": "${MODE}"
}
JSON
fi

if [[ "${MODE}" == "production" && "${RESTORE_UPLOADS:-false}" == "true" ]]; then
  LATEST_UPLOADS="$(find "${MENORAH_BACKUP_ROOT}" -type f \( -name 'uploads-*.tar.gz' -o -name 'uploads-*.tar.gz.enc' \) | sort | tail -n 1 || true)"
  if [[ -n "${LATEST_UPLOADS}" ]]; then
    echo "Restore uploads manually after reviewing the archive path: ${LATEST_UPLOADS}"
  fi
fi

echo "Restore complete for mode: ${MODE}"
