#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
LOCK_FILE="${STATE_DIR}/.deploy.lock"
IDENTITY_MARKER="${STATE_DIR}/mongo-identity-reconciliation-in-progress-sha"
CURRENT_SHA_FILE="${STATE_DIR}/current-sha"
MIGRATION_MARKER="${STATE_DIR}/migration-applied-sha"
MIGRATION_IN_PROGRESS_MARKER="${STATE_DIR}/migration-in-progress-sha"
POST_MIGRATION_RECOVERY_MARKER="${STATE_DIR}/post-migration-recovery-sha"
ROLLBACK_IN_PROGRESS_MARKER="${STATE_DIR}/rollback-in-progress-sha"
WRITER_SERVICES=(api-ios api-android api-web api-admin worker)
MONGO_MANAGED_ENV_KEYS=(
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
)

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

read_valid_sha_marker() {
  local marker="$1" label="$2" value
  if [[ ! -f "${marker}" || -L "${marker}" || ! -s "${marker}" ]]; then
    echo "${label} marker is missing, empty, non-regular, or symlinked: ${marker}" >&2
    return 1
  fi
  value="$(tr -d '\r\n' < "${marker}")"
  if [[ ! "${value}" =~ ^[0-9a-f]{40}$ ]] \
    || ! git -C "${REPO_ROOT}" cat-file -e "${value}^{commit}" 2>/dev/null; then
    echo "${label} marker is not a full local commit SHA: ${value}" >&2
    return 1
  fi
  printf '%s' "${value}"
}

stop_and_verify_writers() {
  local service container_id running

  compose_cmd stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${WRITER_SERVICES[@]}"
  for service in "${WRITER_SERVICES[@]}"; do
    container_id="$(compose_cmd ps -q "${service}")"
    [[ -n "${container_id}" ]] || continue
    running="$(docker inspect --format '{{.State.Running}}' "${container_id}")"
    if [[ "${running}" == "true" ]]; then
      echo "Writer service remained running during identity recovery: ${service}" >&2
      return 1
    fi
  done
}

run_candidate_mongo_program() {
  local repository_path="$1" mode_variable="$2" mode_value="$3" key
  local -a env_args=()

  for key in "${MONGO_MANAGED_ENV_KEYS[@]}"; do
    env_args+=(-e "${key}")
  done
  env_args+=(-e "${mode_variable}=${mode_value}")

  {
    printf '%s\n' \
      'db = connect("mongodb://mongo-primary:27017/admin?authSource=admin", process.env.MONGO_ROOT_USER, process.env.MONGO_ROOT_PASSWORD);'
    git -C "${REPO_ROOT}" cat-file blob "${RECOVERY_SHA}:${repository_path}"
  } | compose_cmd exec -T "${env_args[@]}" mongo-primary mongosh --nodb --quiet
}

run_bootstrap() {
  local mode="$1"
  case "${mode}" in
    preflight)
      run_candidate_mongo_program \
        menorah/deploy/mongo/create-users.js MONGO_BOOTSTRAP_DRY_RUN true
      ;;
    apply)
      run_candidate_mongo_program \
        menorah/deploy/mongo/create-users.js MONGO_BOOTSTRAP_DRY_RUN ''
      ;;
    *)
      echo "Unknown managed MongoDB bootstrap recovery mode: ${mode}" >&2
      return 1
      ;;
  esac
}

run_reconciliation() {
  local mode="$1"
  case "${mode}" in
    preflight)
      run_candidate_mongo_program \
        menorah/deploy/mongo/reconcile-managed-users.js MONGO_RECONCILE_DRY_RUN true
      ;;
    apply)
      run_candidate_mongo_program \
        menorah/deploy/mongo/reconcile-managed-users.js MONGO_RECONCILE_DRY_RUN ''
      ;;
    *)
      echo "Unknown managed MongoDB reconciliation recovery mode: ${mode}" >&2
      return 1
      ;;
  esac
}

recovery_succeeded=false
on_exit() {
  local status="$1"
  if [[ "${status}" -ne 0 && "${recovery_succeeded}" != "true" ]]; then
    echo "Managed-identity recovery failed; writers remain stopped and ${IDENTITY_MARKER} is retained." >&2
    stop_and_verify_writers || \
      echo "WARNING: writer shutdown verification failed; isolate traffic immediately." >&2
  fi
}

[[ "${MENORAH_MONGO_IDENTITY_RECOVERY_CONFIRM:-}" == "RECOVER_RECORDED_MONGO_IDENTITIES" ]] || {
  echo "Set MENORAH_MONGO_IDENTITY_RECOVERY_CONFIRM=RECOVER_RECORDED_MONGO_IDENTITIES only after identity-recovery approval." >&2
  exit 1
}
for required_command in cat docker flock git tr; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "Required identity-recovery command is unavailable: ${required_command}" >&2
    exit 1
  }
done
[[ -r "${ENV_FILE}" && -r "${CLOUDFLARE_ENV}" ]] || {
  echo "Production or Cloudflare environment file is unreadable." >&2
  exit 1
}

mkdir -p "${STATE_DIR}"
exec 9>"${LOCK_FILE}"
flock -n 9 || {
  echo "Another deployment, rollback, restore, or recovery is running." >&2
  exit 1
}

for blocking_marker in \
  "${MIGRATION_IN_PROGRESS_MARKER}" \
  "${POST_MIGRATION_RECOVERY_MARKER}" \
  "${ROLLBACK_IN_PROGRESS_MARKER}" \
  "${STATE_DIR}/production-restore-in-progress.json" \
  "${STATE_DIR}/production-restore-requires-review.json"; do
  if [[ -e "${blocking_marker}" || -L "${blocking_marker}" ]]; then
    echo "Migration, rollback, post-migration, or restore recovery state blocks identity reconciliation: ${blocking_marker}" >&2
    exit 1
  fi
done

RECOVERY_SHA="$(read_valid_sha_marker "${IDENTITY_MARKER}" "Managed-identity recovery")" \
  || exit 1
RECORDED_CURRENT_SHA="$(read_valid_sha_marker "${CURRENT_SHA_FILE}" "Recorded current release")" \
  || exit 1
CURRENT_HEAD="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
[[ "${CURRENT_HEAD}" == "${RECOVERY_SHA}" ]] || {
  echo "The identity, current-release, and exact candidate checkout state does not agree." >&2
  exit 1
}
git -C "${REPO_ROOT}" merge-base --is-ancestor "${RECORDED_CURRENT_SHA}" "${RECOVERY_SHA}" || {
  echo "The marked candidate is not a descendant of the recorded current release." >&2
  exit 1
}
if [[ -e "${MIGRATION_MARKER}" || -L "${MIGRATION_MARKER}" ]]; then
  RECORDED_MIGRATION_SHA="$(read_valid_sha_marker "${MIGRATION_MARKER}" "Applied migration")" \
    || exit 1
  if [[ "${RECORDED_MIGRATION_SHA}" == "${RECOVERY_SHA}" ]]; then
    echo "The marked candidate already has an applied migration; use post-migration recovery review." >&2
    exit 1
  fi
  if [[ "${RECORDED_MIGRATION_SHA}" != "${RECORDED_CURRENT_SHA}" ]]; then
    echo "Applied migration state does not match the recorded healthy predecessor." >&2
    exit 1
  fi
fi
if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "Managed-identity recovery requires a clean candidate worktree." >&2
  git -C "${REPO_ROOT}" status --short
  exit 1
fi
expected_script_blob="$(git -C "${REPO_ROOT}" rev-parse \
  "${RECOVERY_SHA}:menorah/deploy/ubuntu/recover-managed-mongo-identities.sh")"
actual_script_blob="$(git -C "${REPO_ROOT}" hash-object "${BASH_SOURCE[0]}")"
[[ "${actual_script_blob}" == "${expected_script_blob}" ]] || {
  echo "Identity recovery must use the script from the exact marked candidate." >&2
  exit 1
}
git -C "${REPO_ROOT}" cat-file -e \
  "${RECOVERY_SHA}:menorah/deploy/mongo/create-users.js"
git -C "${REPO_ROOT}" cat-file -e \
  "${RECOVERY_SHA}:menorah/deploy/mongo/reconcile-managed-users.js"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
# shellcheck disable=SC1090
. "${CLOUDFLARE_ENV}"
set +a
[[ -z "${MONGO_ROTATE_CREDENTIALS_CONFIRM:-}" \
  && -z "${MONGO_RECONCILE_DRY_RUN:-}" \
  && -z "${MONGO_BOOTSTRAP_DRY_RUN:-}" ]] || {
  echo "Routine identity recovery requires rotation and bootstrap/reconciliation dry-run overrides to be unset." >&2
  exit 1
}
for key in "${MONGO_MANAGED_ENV_KEYS[@]}"; do
  [[ -n "${!key:-}" ]] || {
    echo "Required managed MongoDB identity variable is absent: ${key}" >&2
    exit 1
  }
done

trap 'status=$?; trap - EXIT; on_exit "${status}"; exit "${status}"' EXIT
compose_cmd config --quiet
stop_and_verify_writers

echo "Provisioning any missing managed identities from the exact candidate with writers stopped..."
run_bootstrap apply
echo "Applying the exact candidate managed-identity reconciliation with writers stopped..."
run_reconciliation apply
echo "Verifying the complete exact-role identity set read-only..."
run_reconciliation preflight

printf '%s identity-recovery=PASS sha=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${RECOVERY_SHA}" \
  >> "${STATE_DIR}/deploy.log"
rm -f -- "${IDENTITY_MARKER}"
recovery_succeeded=true
trap - EXIT
echo "Managed MongoDB identity recovery complete for ${RECOVERY_SHA}; writers remain stopped."
