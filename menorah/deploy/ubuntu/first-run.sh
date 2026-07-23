#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_DIR="${DEPLOY_DIR}/env"
PRODUCTION_ENV="${PRODUCTION_ENV:-${ENV_DIR}/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${ENV_DIR}/cloudflare.env}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
LOCK_FILE="${STATE_DIR}/.deploy.lock"
BRANCH="${DEPLOY_BRANCH:?DEPLOY_BRANCH is required for reviewed bootstrap identity}"
REVIEWED_SHA="${DEPLOY_RELEASE_SHA:?DEPLOY_RELEASE_SHA is required for reviewed bootstrap identity}"
RUNTIME_PREPARER_IMAGE="busybox:1.37.0-glibc@sha256:4279d9b47df4c1b02d80efd8d02cd59b3a8182c1e785a4ff3f6983bee19dc8b0"

if [[ "${MENORAH_FIRST_RUN_CONFIRM:-}" != "BOOTSTRAP_EMPTY_HOST" ]]; then
  echo "first-run.sh is bootstrap-only and requires MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST." >&2
  echo "Use update-from-git.sh for every release after bootstrap." >&2
  exit 1
fi
if [[ ! "${REVIEWED_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "DEPLOY_RELEASE_SHA must be a full 40-character commit SHA." >&2
  exit 1
fi
REVIEWED_SHA="${REVIEWED_SHA,,}"
if ! git check-ref-format "refs/heads/${BRANCH}" >/dev/null 2>&1; then
  echo "DEPLOY_BRANCH is not a valid branch name: ${BRANCH}" >&2
  exit 1
fi

mkdir -p "${STATE_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another bootstrap, deployment, or rollback is already running." >&2
  exit 1
fi
if [[ -e "${STATE_DIR}/current-sha" || -L "${STATE_DIR}/current-sha" \
  || -e "${STATE_DIR}/bootstrap-in-progress-sha" || -L "${STATE_DIR}/bootstrap-in-progress-sha" \
  || -e "${STATE_DIR}/bootstrap-complete-sha" || -L "${STATE_DIR}/bootstrap-complete-sha" \
  || -e "${STATE_DIR}/migration-in-progress-sha" || -L "${STATE_DIR}/migration-in-progress-sha" \
  || -e "${STATE_DIR}/migration-applied-sha" || -L "${STATE_DIR}/migration-applied-sha" \
  || -e "${STATE_DIR}/mongo-identity-reconciliation-in-progress-sha" || -L "${STATE_DIR}/mongo-identity-reconciliation-in-progress-sha" \
  || -e "${STATE_DIR}/post-migration-recovery-sha" || -L "${STATE_DIR}/post-migration-recovery-sha" \
  || -e "${STATE_DIR}/rollback-in-progress-sha" || -L "${STATE_DIR}/rollback-in-progress-sha" \
  || -e "${STATE_DIR}/last-good-sha" || -L "${STATE_DIR}/last-good-sha" \
  || -e "${STATE_DIR}/production-restore-in-progress.json" || -L "${STATE_DIR}/production-restore-in-progress.json" \
  || -e "${STATE_DIR}/production-restore-requires-review.json" || -L "${STATE_DIR}/production-restore-requires-review.json" ]]; then
  echo "Deployment state already exists. first-run.sh cannot be used again." >&2
  echo "Use update-from-git.sh for the reviewed release." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "Bootstrap requires a clean tracked working tree." >&2
  exit 1
fi
CURRENT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
git -C "${REPO_ROOT}" fetch --prune origin \
  "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"
REMOTE_SHA="$(git -C "${REPO_ROOT}" rev-parse "refs/remotes/origin/${BRANCH}")"
if [[ "${CURRENT_SHA}" != "${REVIEWED_SHA}" || "${REMOTE_SHA}" != "${REVIEWED_SHA}" ]]; then
  echo "Bootstrap checkout, reviewed SHA, and remote branch tip must match exactly." >&2
  exit 1
fi

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

if [[ -n "$(compose_cmd ps -a -q 2>/dev/null || true)" ]]; then
  echo "Compose containers already exist. first-run.sh refuses a non-empty host." >&2
  echo "Use update-from-git.sh for the reviewed release." >&2
  exit 1
fi

required=(
  MONGO_ROOT_USER
  MONGO_ROOT_PASSWORD
  MONGO_APP_USER
  MONGO_APP_PASSWORD
  MONGO_BACKUP_USER
  MONGO_BACKUP_PASSWORD
  MONGO_RESTORE_USER
  MONGO_RESTORE_PASSWORD
  MONGO_MONITOR_USER
  MONGO_MONITOR_PASSWORD
  MONGODB_URI
  MONGODB_BACKUP_URI
  MONGODB_PRODUCTION_RESTORE_URI
  MONGODB_MONITORING_URI
  MONGODB_RESTORE_TEST_URI
  JWT_SECRET
  ALLOWED_ORIGINS
  REDIS_URL
  RESEND_API_KEY
  EMAIL_FROM
  PASSWORD_RESET_BASE_URL
  MEDIA_STORAGE_BACKEND
  MEDIA_PUBLIC_BASE_URL
  UPLOAD_PATH
  BOOKING_SERVICE_CATALOG_JSON
  BACKUP_ENCRYPTION_PASSWORD
  BACKUP_INTEGRITY_HMAC_KEY
  APPLE_SIGN_IN_ENABLED
  APPLE_IOS_BUNDLE_ID
  APPLE_TEAM_ID
  APPLE_KEY_ID
  APPLE_PRIVATE_KEY
  API_WEB_DOMAIN
  TUNNEL_INGRESS_SUBNET
  CADDY_TUNNEL_IP
  CLOUDFLARED_TUNNEL_IP
  APP_NETWORK_SUBNET
  CADDY_APP_IP
  MENORAH_MEDIA_GROUP_ID
)

for key in "${required[@]}"; do
  require_env "${key}"
done

require_env RAZORPAY_KEY_ID
require_env RAZORPAY_KEY_SECRET
require_env RAZORPAY_WEBHOOK_SECRET
require_env RAZORPAY_X_WEBHOOK_SECRET

case "${BOOKING_PAYMENTS_ENABLED:-false}" in
  true)
    require_env PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS
    ;;
  false) ;;
  *)
    echo "BOOKING_PAYMENTS_ENABLED must be exactly true or false." >&2
    exit 1
    ;;
esac

case "${PAYOUTS_ENABLED:-false}" in
  true)
    require_env RAZORPAY_X_KEY_ID
    require_env RAZORPAY_X_KEY_SECRET
    require_env RAZORPAY_PAYOUT_ACCOUNT_NUMBER
    ;;
  false) ;;
  *)
    echo "PAYOUTS_ENABLED must be exactly true or false." >&2
    exit 1
    ;;
esac

warn_optional_env GOOGLE_WEB_CLIENT_ID
warn_optional_env GOOGLE_IOS_CLIENT_ID
warn_optional_env GOOGLE_ANDROID_CLIENT_ID
if [[ "${APPLE_SIGN_IN_ENABLED}" != "true" \
  || "${APPLE_IOS_BUNDLE_ID}" != "com.menorah.health.app" \
  || ! "${APPLE_TEAM_ID}" =~ ^[A-Z0-9]{10}$ \
  || ! "${APPLE_KEY_ID}" =~ ^[A-Z0-9]{10}$ \
  || "${APPLE_PRIVATE_KEY}" != *"BEGIN PRIVATE KEY"* ]]; then
  echo "Sign in with Apple server credentials are incomplete or invalid." >&2
  exit 1
fi
warn_optional_env LUXAND_API_TOKEN
warn_optional_env OPENAI_API_KEY
warn_optional_env CLOUDINARY_CLOUD_NAME
warn_optional_env CLOUDINARY_API_KEY
warn_optional_env CLOUDINARY_API_SECRET

MENORAH_DATA_ROOT="${MENORAH_DATA_ROOT:-/opt/menorah/data}"
MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
MENORAH_SECRETS_ROOT="${MENORAH_SECRETS_ROOT:-/opt/menorah/secrets}"
MONGO_KEYFILE_PATH="${MONGO_KEYFILE_PATH:-${MENORAH_SECRETS_ROOT}/mongo-keyfile}"
OPERATOR_GID="$(id -g)"

if [[ "${MONGO_KEYFILE_PATH}" != /* || "${MONGO_KEYFILE_PATH}" == "${REPO_ROOT}"/* ]]; then
  echo "MONGO_KEYFILE_PATH must be an absolute host-only path outside the repository." >&2
  exit 1
fi
if [[ -L "${MONGO_KEYFILE_PATH}" ]]; then
  echo "MONGO_KEYFILE_PATH must not be a symbolic link." >&2
  exit 1
fi

if [[ "$(id -u)" == "0" ]]; then
  echo "first-run.sh must be invoked by the non-root release operator with Docker access." >&2
  exit 1
fi
if [[ ! "${MENORAH_MEDIA_GROUP_ID}" =~ ^[1-9][0-9]*$ \
  || "${MENORAH_MEDIA_GROUP_ID}" != "${OPERATOR_GID}" ]]; then
  echo "MENORAH_MEDIA_GROUP_ID must equal the invoking release operator group ${OPERATOR_GID}." >&2
  exit 1
fi
if [[ "${MENORAH_DATA_ROOT}" != /* \
  || "${MENORAH_DATA_ROOT}" == "/" \
  || "${MENORAH_DATA_ROOT}" == *','* \
  || "${MENORAH_DATA_ROOT}" == *':'* \
  || "${MENORAH_DATA_ROOT}" == *$'\n'* \
  || "${MENORAH_DATA_ROOT}" == *$'\r'* \
  || -L "${MENORAH_DATA_ROOT}" ]]; then
  echo "MENORAH_DATA_ROOT must be a safe absolute non-symlink directory path." >&2
  exit 1
fi

mkdir -p \
  "${MENORAH_DATA_ROOT}/mongo/primary" \
  "${MENORAH_DATA_ROOT}/redis" \
  "${MENORAH_BACKUP_ROOT}/six-hourly" \
  "${MENORAH_BACKUP_ROOT}/daily" \
  "${MENORAH_BACKUP_ROOT}/weekly" \
  "${MENORAH_BACKUP_ROOT}/monthly" \
  "${MENORAH_BACKUP_ROOT}/restore-tests" \
  "${MENORAH_SECRETS_ROOT}"

if [[ "$(realpath -e -- "${MENORAH_DATA_ROOT}")" != "$(realpath -ms -- "${MENORAH_DATA_ROOT}")" ]]; then
  echo "MENORAH_DATA_ROOT must not contain a symlinked path component." >&2
  exit 1
fi

echo "Preparing exact empty-host runtime directory ownership and modes in a networkless pinned helper..."
docker pull "${RUNTIME_PREPARER_IMAGE}"
docker run --rm \
  --network none \
  --read-only \
  --pids-limit 32 \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add FOWNER \
  --cap-add DAC_OVERRIDE \
  --security-opt no-new-privileges \
  --user 0:0 \
  -e MENORAH_RUNTIME_DIRECTORY_PREP_CONFIRM=PREPARE_EMPTY_HOST_RUNTIME_DIRECTORIES \
  -e MENORAH_RUNTIME_DATA_ROOT=/data \
  -e "MENORAH_MEDIA_GROUP_ID=${MENORAH_MEDIA_GROUP_ID}" \
  --mount "type=bind,src=${MENORAH_DATA_ROOT},dst=/data" \
  --mount "type=bind,src=${SCRIPT_DIR}/prepare-runtime-directories.sh,dst=/runtime/prepare-runtime-directories.sh,readonly" \
  --entrypoint /bin/sh \
  "${RUNTIME_PREPARER_IMAGE}" \
  /runtime/prepare-runtime-directories.sh

while IFS='|' read -r expected_uid expected_mode runtime_path; do
  if [[ ! -d "${runtime_path}" \
    || -L "${runtime_path}" \
    || "$(stat -c '%u:%g:%a' "${runtime_path}")" != "${expected_uid}:${MENORAH_MEDIA_GROUP_ID}:${expected_mode}" ]]; then
    echo "Empty-host runtime directory preparation did not verify: ${runtime_path}" >&2
    exit 1
  fi
done <<EOF
100|2770|${MENORAH_DATA_ROOT}/uploads
65534|770|${MENORAH_DATA_ROOT}/prometheus
65534|770|${MENORAH_DATA_ROOT}/alertmanager
65534|770|${MENORAH_DATA_ROOT}/monitoring-textfile
472|770|${MENORAH_DATA_ROOT}/grafana
0|770|${MENORAH_DATA_ROOT}/alloy
10001|770|${MENORAH_DATA_ROOT}/loki
EOF

for persistent_dir in \
  "${MENORAH_DATA_ROOT}/mongo/primary" \
  "${MENORAH_DATA_ROOT}/redis" \
  "${MENORAH_DATA_ROOT}/uploads"; do
  if find "${persistent_dir}" -mindepth 1 -print -quit | grep -q .; then
    echo "Bootstrap requires empty persistent storage: ${persistent_dir}" >&2
    exit 1
  fi
done

if [[ "${MEDIA_STORAGE_BACKEND}" != "local" \
  || "${MEDIA_PUBLIC_BASE_URL}" != "https://${API_WEB_DOMAIN}" \
  || "${UPLOAD_PATH}" != "/app/uploads" \
  || -n "${SOCIAL_STUDIO_STORAGE:-}" \
  || -n "${COUNSELLOR_MEDIA_STORAGE:-}" ]]; then
  echo "Production media must use the shared immutable local store at the canonical API web origin." >&2
  exit 1
fi

if [[ "${PASSWORD_RESET_BASE_URL}" != "https://app.menorah.me" \
  || -n "${PASSWORD_RESET_URL_TEMPLATE:-}" ]]; then
  echo "Production password reset links must use https://app.menorah.me with no legacy template." >&2
  exit 1
fi

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

write_marker() {
  local target="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp "${STATE_DIR}/.bootstrap-marker.XXXXXX")"
  printf '%s\n' "${value}" > "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${target}"
}

write_marker "${STATE_DIR}/bootstrap-in-progress-sha" "${CURRENT_SHA}"

echo "Pulling and starting only the persistent data services..."
compose_cmd pull --policy always mongo-primary mongo-replica-init redis
compose_cmd up -d --no-build --pull never mongo-primary redis
compose_cmd run --rm --no-deps mongo-replica-init

echo "Verifying the empty-host MongoDB replica set and Redis bootstrap..."
mongo_ready=false
for _attempt in $(seq 1 30); do
  if compose_cmd exec -T mongo-primary mongosh --nodb --quiet --eval '
    db = connect("mongodb://mongo-primary:27017/admin?authSource=admin", process.env.MONGO_ROOT_USER, process.env.MONGO_ROOT_PASSWORD);
    const status = rs.status();
    if (status.ok !== 1 || status.myState !== 1) quit(1);
  ' >/dev/null; then
    mongo_ready=true
    break
  fi
  sleep 2
done
if [[ "${mongo_ready}" != "true" ]]; then
  echo "MongoDB did not become PRIMARY during the bootstrap verification window." >&2
  exit 1
fi
compose_cmd exec -T redis redis-cli ping | grep -Fx PONG >/dev/null

write_marker "${STATE_DIR}/bootstrap-complete-sha" "${CURRENT_SHA}"
write_marker "${STATE_DIR}/current-sha" "${CURRENT_SHA}"
rm -f -- "${STATE_DIR}/bootstrap-in-progress-sha"

cat <<EOF
Empty-host data-service bootstrap complete.

No API, web, worker, proxy, LiveKit, monitoring, or Cloudflare Tunnel service
was started. Run update-from-git.sh for this same reviewed SHA with explicit
migration approval before any production traffic is authorized.
EOF
