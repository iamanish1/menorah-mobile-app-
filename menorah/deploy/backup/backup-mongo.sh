#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_BACKUP_URI:?MONGODB_BACKUP_URI is required}"

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_ROOT}/mongo/${STAMP}"
ARCHIVE="${OUT_DIR}/menorah-mongo-${STAMP}.archive.gz"

mkdir -p "${OUT_DIR}"

mongodump \
  --uri="${MONGODB_BACKUP_URI}" \
  --archive="${ARCHIVE}" \
  --gzip

if [[ -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "${ARCHIVE}" \
    -out "${ARCHIVE}.enc" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD
  rm -f "${ARCHIVE}"
  ARCHIVE="${ARCHIVE}.enc"
fi

sha256sum "${ARCHIVE}" > "${ARCHIVE}.sha256"

cat > "${OUT_DIR}/metadata.json" <<JSON
{
  "createdAt": "${STAMP}",
  "archive": "$(basename "${ARCHIVE}")",
  "encrypted": $(if [[ "${ARCHIVE}" == *.enc ]]; then echo true; else echo false; fi)
}
JSON

echo "MongoDB backup written to ${ARCHIVE}"
