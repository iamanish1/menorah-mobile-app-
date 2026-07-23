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

validate_release_environment() {
  local staging_bundle_id_pattern
  local staging_display_sender_pattern
  local staging_email_address_pattern
  local staging_email_domain staging_sender_address
  local staging_host_pattern
  local staging_host_key staging_host staging_value
  local staging_private_key_begin="-----BEGIN PRIVATE"" KEY-----"
  local staging_private_key_end="-----END PRIVATE"" KEY-----"
  local -a staging_host_keys staging_allowlist staging_allowed_origins staging_session_origins
  local -A staging_reviewed_hosts=()
  local -A staging_assigned_hosts=()
  local -A staging_expected_origins=()
  local -A staging_seen_origins=()
  local -A staging_expected_sessions=()
  local -A staging_seen_sessions=()

  if [[ "${NODE_ENV:-}" != "production" ]]; then
    echo "NODE_ENV must remain production for production and staging releases." >&2
    return 1
  fi

  DEPLOYMENT_ENVIRONMENT="${DEPLOYMENT_ENVIRONMENT:-production}"
  export DEPLOYMENT_ENVIRONMENT
  case "${DEPLOYMENT_ENVIRONMENT}" in
    production)
      if [[ "${APPLE_SIGN_IN_ENABLED:-}" != "true" \
        || "${APPLE_IOS_BUNDLE_ID:-}" != "com.menorah.health.app" \
        || ! "${APPLE_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ \
        || ! "${APPLE_KEY_ID:-}" =~ ^[A-Z0-9]{10}$ \
        || "${APPLE_PRIVATE_KEY:-}" != *"BEGIN PRIVATE KEY"* ]]; then
        echo "Sign in with Apple server credentials are incomplete or invalid." >&2
        return 1
      fi
      if [[ "${PASSWORD_RESET_BASE_URL:-}" != "https://app.menorah.me" \
        || "${CHECKOUT_RETURN_URL:-}" != "https://app.menorah.me/checkout/return" \
        || -n "${PASSWORD_RESET_URL_TEMPLATE:-}" ]]; then
        echo "Production reset and checkout returns must use their canonical app.menorah.me targets with no legacy reset template." >&2
        return 1
      fi
      ;;
    staging)
      staging_host_pattern='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
      staging_email_address_pattern='^[^@[:space:]<>]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
      staging_display_sender_pattern='^[^<>]+<([^<>[:space:]]+)>$'
      staging_host_keys=(
        ROOT_DOMAIN
        WWW_DOMAIN
        APP_DOMAIN
        ADMIN_DOMAIN
        COUNSELLOR_DOMAIN
        API_IOS_DOMAIN
        API_ANDROID_DOMAIN
        API_WEB_DOMAIN
        API_ADMIN_DOMAIN
        CALLS_DOMAIN
      )
      IFS=',' read -r -a staging_allowlist \
        <<< "${MENORAH_STAGING_ALLOWED_HOSTS:-}"
      if (( ${#staging_allowlist[@]} != ${#staging_host_keys[@]} )); then
        echo "MENORAH_STAGING_ALLOWED_HOSTS must contain exactly ten reviewed staging hosts." >&2
        return 1
      fi
      for staging_host in "${staging_allowlist[@]}"; do
        if [[ ! "${staging_host}" =~ ${staging_host_pattern} \
          || ".${staging_host}." != *".staging."* ]]; then
          echo "MENORAH_STAGING_ALLOWED_HOSTS must contain lowercase DNS hosts with staging as a full label." >&2
          return 1
        fi
        if [[ -n "${staging_reviewed_hosts[${staging_host}]+present}" ]]; then
          echo "MENORAH_STAGING_ALLOWED_HOSTS must not contain host aliases." >&2
          return 1
        fi
        staging_reviewed_hosts["${staging_host}"]=1
      done
      for staging_host_key in "${staging_host_keys[@]}"; do
        staging_host="${!staging_host_key:-}"
        if [[ ! "${staging_host}" =~ ${staging_host_pattern} \
          || ".${staging_host}." != *".staging."* ]]; then
          echo "${staging_host_key} must be a lowercase DNS host with staging as a full label." >&2
          return 1
        fi
        if [[ -z "${staging_reviewed_hosts[${staging_host}]+present}" ]]; then
          echo "${staging_host_key} is not in MENORAH_STAGING_ALLOWED_HOSTS." >&2
          return 1
        fi
        if [[ -n "${staging_assigned_hosts[${staging_host}]+present}" ]]; then
          echo "${staging_host_key} aliases another staging service host." >&2
          return 1
        fi
        staging_assigned_hosts["${staging_host}"]=1
      done
      if (( ${#staging_assigned_hosts[@]} != ${#staging_reviewed_hosts[@]} )); then
        echo "MENORAH_STAGING_ALLOWED_HOSTS must exactly match the ten staging service hosts." >&2
        return 1
      fi

      if [[ "${LIVEKIT_URL:-}" != "wss://${CALLS_DOMAIN}" \
        || "${LIVEKIT_API_URL:-}" != "https://${CALLS_DOMAIN}" \
        || "${PASSWORD_RESET_BASE_URL:-}" != "https://${APP_DOMAIN}" \
        || "${CHECKOUT_RETURN_URL:-}" != "https://${APP_DOMAIN}/checkout/return" \
        || "${FRONTEND_API_WEB_URL:-}" != "https://${API_WEB_DOMAIN}/api" \
        || "${FRONTEND_API_ADMIN_URL:-}" != "https://${API_ADMIN_DOMAIN}/api" \
        || "${FRONTEND_SOCKET_WEB_URL:-}" != "https://${API_WEB_DOMAIN}" \
        || "${MEDIA_PUBLIC_BASE_URL:-}" != "https://${API_WEB_DOMAIN}" \
        || -n "${PASSWORD_RESET_URL_TEMPLATE:-}" ]]; then
        echo "Staging calls, reset, checkout, frontend, socket, and media URLs must exactly map to their reviewed staging hosts." >&2
        return 1
      fi

      staging_email_domain="${MENORAH_STAGING_EMAIL_DOMAIN:-}"
      if [[ ! "${staging_email_domain}" =~ ${staging_host_pattern} \
        || ".${staging_email_domain}." != *".staging."* ]]; then
        echo "MENORAH_STAGING_EMAIL_DOMAIN must be lowercase DNS with staging as a full label." >&2
        return 1
      fi
      if [[ ! "${CONTACT_TO_EMAIL:-}" =~ ${staging_email_address_pattern} \
        || "${CONTACT_TO_EMAIL##*@}" != "${staging_email_domain}" ]]; then
        echo "CONTACT_TO_EMAIL must be a bare address on MENORAH_STAGING_EMAIL_DOMAIN." >&2
        return 1
      fi
      staging_sender_address="${EMAIL_FROM:-}"
      if [[ "${staging_sender_address}" =~ ${staging_display_sender_pattern} ]]; then
        staging_sender_address="${BASH_REMATCH[1]}"
      fi
      if [[ ! "${staging_sender_address}" =~ ${staging_email_address_pattern} \
        || "${staging_sender_address##*@}" != "${staging_email_domain}" ]]; then
        echo "EMAIL_FROM must use MENORAH_STAGING_EMAIL_DOMAIN." >&2
        return 1
      fi

      staging_expected_origins["https://${WWW_DOMAIN}"]=1
      staging_expected_origins["https://${APP_DOMAIN}"]=1
      staging_expected_origins["https://${ADMIN_DOMAIN}"]=1
      staging_expected_origins["https://${COUNSELLOR_DOMAIN}"]=1
      IFS=',' read -r -a staging_allowed_origins <<< "${ALLOWED_ORIGINS:-}"
      if (( ${#staging_allowed_origins[@]} != ${#staging_expected_origins[@]} )); then
        echo "ALLOWED_ORIGINS must contain exactly the reviewed staging web origins." >&2
        return 1
      fi
      for staging_value in "${staging_allowed_origins[@]}"; do
        if [[ -z "${staging_value}" ]]; then
          echo "ALLOWED_ORIGINS must not contain empty staging origins." >&2
          return 1
        fi
        if [[ -z "${staging_expected_origins[${staging_value}]+present}" \
          || -n "${staging_seen_origins[${staging_value}]+present}" ]]; then
          echo "ALLOWED_ORIGINS must contain only unique reviewed staging web origins." >&2
          return 1
        fi
        staging_seen_origins["${staging_value}"]=1
      done

      staging_expected_sessions["https://${WWW_DOMAIN}=user"]=1
      staging_expected_sessions["https://${APP_DOMAIN}=user"]=1
      staging_expected_sessions["https://${COUNSELLOR_DOMAIN}=counsellor"]=1
      staging_expected_sessions["https://${ADMIN_DOMAIN}=admin"]=1
      IFS=',' read -r -a staging_session_origins <<< "${WEB_SESSION_ORIGINS:-}"
      if (( ${#staging_session_origins[@]} != ${#staging_expected_sessions[@]} )); then
        echo "WEB_SESSION_ORIGINS must contain exactly the reviewed staging role mappings." >&2
        return 1
      fi
      for staging_value in "${staging_session_origins[@]}"; do
        if [[ -z "${staging_value}" ]]; then
          echo "WEB_SESSION_ORIGINS must not contain empty staging mappings." >&2
          return 1
        fi
        if [[ -z "${staging_expected_sessions[${staging_value}]+present}" \
          || -n "${staging_seen_sessions[${staging_value}]+present}" ]]; then
          echo "WEB_SESSION_ORIGINS must contain only unique reviewed staging role mappings." >&2
          return 1
        fi
        staging_seen_sessions["${staging_value}"]=1
      done

      for staging_host_key in \
        RAZORPAY_KEY_ID RAZORPAY_X_KEY_ID NEXT_PUBLIC_RAZORPAY_KEY_ID; do
        staging_value="${!staging_host_key:-}"
        if [[ -n "${staging_value}" \
          && ! "${staging_value}" =~ ^rzp_test_[A-Za-z0-9]{14,64}$ ]]; then
          echo "${staging_host_key} must use an rzp_test_ key ID in staging." >&2
          return 1
        fi
      done

      case "${APPLE_SIGN_IN_ENABLED:-}" in
        false) ;;
        true)
          staging_bundle_id_pattern='^[A-Za-z0-9]+([.-][A-Za-z0-9]+)+$'
          if [[ ! "${APPLE_IOS_BUNDLE_ID:-}" =~ ${staging_bundle_id_pattern} \
            || ! "${APPLE_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ \
            || ! "${APPLE_KEY_ID:-}" =~ ^[A-Z0-9]{10}$ \
            || "${APPLE_PRIVATE_KEY:-}" != *"${staging_private_key_begin}"* \
            || "${APPLE_PRIVATE_KEY:-}" != *"${staging_private_key_end}"* ]]; then
            echo "Enabled staging Sign in with Apple requires a complete valid server configuration." >&2
            return 1
          fi
          ;;
        *)
          echo "APPLE_SIGN_IN_ENABLED must be explicitly true or false in staging." >&2
          return 1
          ;;
      esac
      ;;
    *)
      echo "DEPLOYMENT_ENVIRONMENT must be exactly production or staging." >&2
      return 1
      ;;
  esac
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
  CONTACT_TO_EMAIL
  PASSWORD_RESET_BASE_URL
  CHECKOUT_RETURN_URL
  MEDIA_STORAGE_BACKEND
  MEDIA_PUBLIC_BASE_URL
  UPLOAD_PATH
  BOOKING_SERVICE_CATALOG_JSON
  BACKUP_ENCRYPTION_PASSWORD
  BACKUP_INTEGRITY_HMAC_KEY
  APPLE_SIGN_IN_ENABLED
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
validate_release_environment
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
