#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
BACKUP_TYPE="${1:-manual}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
MENORAH_DATA_ROOT="${MENORAH_DATA_ROOT:-/opt/menorah/data}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${MENORAH_BACKUP_ROOT}/${BACKUP_TYPE}/${STAMP}"
MONGO_ARCHIVE="${OUT_DIR}/mongo/menorah-mongo-${STAMP}.archive.gz"
UPLOAD_ARCHIVE="${OUT_DIR}/uploads/uploads-${STAMP}.tar.gz"

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    --env-file "${ENV_FILE}" \
    "$@"
}

mkdir -p "${OUT_DIR}/mongo" "${OUT_DIR}/uploads" "${OUT_DIR}/metadata"

echo "Creating MongoDB backup: ${MONGO_ARCHIVE}"
compose_cmd run --rm --no-deps backup-runner bash -lc \
  "mongodump --uri=\"\$MONGODB_BACKUP_URI\" --archive=\"/backups/${BACKUP_TYPE}/${STAMP}/mongo/$(basename "${MONGO_ARCHIVE}")\" --gzip"

if [[ -d "${MENORAH_DATA_ROOT}/uploads" ]]; then
  echo "Creating uploads backup: ${UPLOAD_ARCHIVE}"
  tar -C "${MENORAH_DATA_ROOT}" -czf "${UPLOAD_ARCHIVE}" uploads
else
  echo "Uploads directory not found at ${MENORAH_DATA_ROOT}/uploads; skipping uploads archive."
fi

encrypt_file() {
  local file="$1"
  if [[ -f "${file}" && -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt \
      -in "${file}" \
      -out "${file}.enc" \
      -pass env:BACKUP_ENCRYPTION_PASSWORD
    rm -f "${file}"
    printf '%s.enc' "${file}"
  else
    printf '%s' "${file}"
  fi
}

FINAL_MONGO="$(encrypt_file "${MONGO_ARCHIVE}")"
FINAL_UPLOADS=""
if [[ -f "${UPLOAD_ARCHIVE}" ]]; then
  FINAL_UPLOADS="$(encrypt_file "${UPLOAD_ARCHIVE}")"
fi

sha256sum "${FINAL_MONGO}" > "${FINAL_MONGO}.sha256"
if [[ -n "${FINAL_UPLOADS}" ]]; then
  sha256sum "${FINAL_UPLOADS}" > "${FINAL_UPLOADS}.sha256"
fi

git -C "${REPO_ROOT}" rev-parse HEAD > "${OUT_DIR}/metadata/git-sha.txt" 2>/dev/null || true
compose_cmd ps > "${OUT_DIR}/metadata/docker-compose-ps.txt" || true
compose_cmd images > "${OUT_DIR}/metadata/docker-compose-images.txt" || true

cat > "${OUT_DIR}/metadata/metadata.json" <<JSON
{
  "timestamp": "${STAMP}",
  "backupType": "${BACKUP_TYPE}",
  "databaseName": "menorah",
  "mongoArchive": "$(basename "${FINAL_MONGO}")",
  "uploadsArchive": "$(basename "${FINAL_UPLOADS:-}")",
  "encrypted": $(if [[ -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then echo true; else echo false; fi)
}
JSON

if [[ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
  cat > "${OUT_DIR}/ENCRYPTION-BLOCKER.txt" <<'EOF'
This backup is not encrypted.
Do not upload it off-host until BACKUP_ENCRYPTION_PASSWORD, age, gpg, or another approved encryption flow is enabled.
EOF
fi

echo "Backup complete: ${OUT_DIR}"
