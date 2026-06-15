#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_DIR="${DEPLOY_DIR}/env"
PRODUCTION_ENV="${PRODUCTION_ENV:-${ENV_DIR}/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${ENV_DIR}/cloudflare.env}"

load_env_file() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    echo "Missing env file: ${file}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "${file}"
  set +a
}

is_blank_or_placeholder() {
  local value="${1:-}"
  [[ -z "${value}" || "${value}" == replace_with_* || "${value}" == *"replace_with"* ]]
}

require_env() {
  local key="$1"
  local value="${!key:-}"
  if is_blank_or_placeholder "${value}"; then
    echo "Required env ${key} is missing or still a placeholder." >&2
    exit 1
  fi
}

warn_optional_env() {
  local key="$1"
  local value="${!key:-}"
  if is_blank_or_placeholder "${value}"; then
    echo "Warning: optional provider env ${key} is empty or placeholder."
  fi
}

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${PRODUCTION_ENV}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

load_env_file "${PRODUCTION_ENV}"
load_env_file "${CLOUDFLARE_ENV}"

required=(
  MONGO_ROOT_USER
  MONGO_ROOT_PASSWORD
  MONGO_APP_USER
  MONGO_APP_PASSWORD
  MONGO_BACKUP_USER
  MONGO_BACKUP_PASSWORD
  MONGO_RESTORE_TEST_USER
  MONGO_RESTORE_TEST_PASSWORD
  MONGODB_URI
  MONGODB_BACKUP_URI
  MONGODB_RESTORE_TEST_URI
  JWT_SECRET
  JWT_REFRESH_SECRET
  ALLOWED_ORIGINS
  REDIS_URL
  TUNNEL_TOKEN
)

for key in "${required[@]}"; do
  require_env "${key}"
done

if [[ "${PAYMENTS_ENABLED:-true}" == "true" ]]; then
  require_env RAZORPAY_KEY_ID
  require_env RAZORPAY_KEY_SECRET
  require_env RAZORPAY_WEBHOOK_SECRET
fi

warn_optional_env MSG91_AUTH_KEY
warn_optional_env LUXAND_API_TOKEN
warn_optional_env OPENAI_API_KEY
warn_optional_env CLOUDINARY_CLOUD_NAME
warn_optional_env CLOUDINARY_API_KEY
warn_optional_env CLOUDINARY_API_SECRET

MENORAH_DATA_ROOT="${MENORAH_DATA_ROOT:-/opt/menorah/data}"
MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
MENORAH_SECRETS_ROOT="${MENORAH_SECRETS_ROOT:-/opt/menorah/secrets}"
MONGO_KEYFILE_PATH="${MONGO_KEYFILE_PATH:-${MENORAH_SECRETS_ROOT}/mongo-keyfile}"

mkdir -p \
  "${MENORAH_DATA_ROOT}/mongo/primary" \
  "${MENORAH_DATA_ROOT}/redis" \
  "${MENORAH_DATA_ROOT}/uploads" \
  "${MENORAH_BACKUP_ROOT}/six-hourly" \
  "${MENORAH_BACKUP_ROOT}/daily" \
  "${MENORAH_BACKUP_ROOT}/weekly" \
  "${MENORAH_BACKUP_ROOT}/monthly" \
  "${MENORAH_BACKUP_ROOT}/restore-tests" \
  "${MENORAH_SECRETS_ROOT}"

if [[ ! -f "${MONGO_KEYFILE_PATH}" ]]; then
  umask 077
  openssl rand -base64 756 > "${MONGO_KEYFILE_PATH}"
  chmod 0400 "${MONGO_KEYFILE_PATH}"
  echo "Created MongoDB replica-set keyfile at ${MONGO_KEYFILE_PATH}"
else
  chmod 0400 "${MONGO_KEYFILE_PATH}"
  echo "MongoDB keyfile already exists at ${MONGO_KEYFILE_PATH}"
fi

echo "Validating Docker Compose configuration..."
compose_cmd config >/dev/null

echo "Starting production stack and Cloudflare tunnel..."
compose_cmd up -d --build

echo "Running local health and safety checks..."
"${SCRIPT_DIR}/health-check.sh"

cat <<EOF
First run complete.

Public checks are intentionally not mandatory until Cloudflare public hostnames are mapped.
After tunnel hostnames are created, run:
  CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh
EOF
