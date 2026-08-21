#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_RESTORE_TEST_URI:?MONGODB_RESTORE_TEST_URI is required}"

ARCHIVE="${1:-}"
if [[ -z "${ARCHIVE}" ]]; then
  echo "Usage: restore-mongo.sh <backup.archive.gz|backup.archive.gz.enc>" >&2
  exit 2
fi

INPUT="${ARCHIVE}"
TMP_FILE=""

if [[ "${ARCHIVE}" == *.enc ]]; then
  : "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required for encrypted backups}"
  TMP_FILE="$(mktemp)"
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${ARCHIVE}" \
    -out "${TMP_FILE}" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD
  INPUT="${TMP_FILE}"
fi

mongorestore \
  --uri="${MONGODB_RESTORE_TEST_URI}" \
  --archive="${INPUT}" \
  --gzip \
  --drop

if [[ -n "${TMP_FILE}" ]]; then
  rm -f "${TMP_FILE}"
fi

echo "Restore completed into restore-test MongoDB"
