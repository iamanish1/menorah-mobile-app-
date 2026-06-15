#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
MODE="${1:-restore-test}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
LATEST_ARCHIVE="$(find "${MENORAH_BACKUP_ROOT}" -type f \( -name '*.archive.gz' -o -name '*.archive.gz.enc' \) | sort | tail -n 1 || true)"

if [[ -z "${LATEST_ARCHIVE}" ]]; then
  echo "No MongoDB backup archive found under ${MENORAH_BACKUP_ROOT}" >&2
  exit 1
fi

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
  echo "Decrypting ${LATEST_ARCHIVE} to temporary restore archive."
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${LATEST_ARCHIVE}" \
    -out "${ARCHIVE_FOR_RESTORE}" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD
fi

REL_ARCHIVE="${ARCHIVE_FOR_RESTORE#${MENORAH_BACKUP_ROOT}/}"

case "${MODE}" in
  restore-test)
    echo "Starting restore-test MongoDB container..."
    compose_cmd --profile restore-test up -d mongo-restore-test
    RESTORE_URI="${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"
    ;;
  production)
    if [[ "${RESTORE_CONFIRM_PRODUCTION:-false}" != "true" ]]; then
      echo "Refusing production restore. Set RESTORE_CONFIRM_PRODUCTION=true to continue." >&2
      exit 1
    fi
    RESTORE_URI="${MONGODB_URI:?MONGODB_URI is required}"
    ;;
  *)
    echo "Usage: restore-latest-backup.sh [restore-test|production]" >&2
    exit 2
    ;;
esac

echo "Restoring ${ARCHIVE_FOR_RESTORE} into ${MODE} target."
echo "mongorestore --uri=<redacted> --archive=/backups/${REL_ARCHIVE} --gzip --drop"
compose_cmd run --rm --no-deps backup-runner bash -lc \
  "mongorestore --uri=\"${RESTORE_URI}\" --archive=\"/backups/${REL_ARCHIVE}\" --gzip --drop"

if [[ "${MODE}" == "production" && "${RESTORE_UPLOADS:-false}" == "true" ]]; then
  LATEST_UPLOADS="$(find "${MENORAH_BACKUP_ROOT}" -type f \( -name 'uploads-*.tar.gz' -o -name 'uploads-*.tar.gz.enc' \) | sort | tail -n 1 || true)"
  if [[ -n "${LATEST_UPLOADS}" ]]; then
    echo "Restore uploads manually after reviewing the archive path: ${LATEST_UPLOADS}"
  fi
fi

echo "Restore complete for mode: ${MODE}"
