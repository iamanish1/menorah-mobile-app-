#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

MENORAH_BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}"
MENORAH_DEPLOY_STATE_ROOT="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
BACKUP_WEEKLY_MAX_AGE_HOURS="${BACKUP_WEEKLY_MAX_AGE_HOURS:-192}"
BACKUP_MIN_SIZE_BYTES="${BACKUP_MIN_SIZE_BYTES:-1024}"
BACKUP_DISK_USAGE_MAX_PERCENT="${BACKUP_DISK_USAGE_MAX_PERCENT:-80}"
BACKUP_RAID_DEVICE="${BACKUP_RAID_DEVICE:-/dev/md/menorah-backups}"
BACKUP_EXPECT_RAID="${BACKUP_EXPECT_RAID:-false}"
BACKUP_REQUIRE_MOUNT="${BACKUP_REQUIRE_MOUNT:-}"
CHECK_RESTORE_TEST="${CHECK_RESTORE_TEST:-true}"
BACKUP_RESTORE_TEST_MAX_AGE_HOURS="${BACKUP_RESTORE_TEST_MAX_AGE_HOURS:-24}"
BACKUP_HEALTH_PUSH_URL="${BACKUP_HEALTH_PUSH_URL:-}"
BACKUP_REQUIRE_ENCRYPTION="${BACKUP_REQUIRE_ENCRYPTION:-}"

failures=()
chain_summary=""

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

record_failure() {
  failures+=("$1")
}

push_status() {
  local status="$1"
  local message="$2"
  [[ -n "${BACKUP_HEALTH_PUSH_URL}" ]] || return 0
  curl -fsS -G --data-urlencode "status=${status}" --data-urlencode "msg=${message}" "${BACKUP_HEALTH_PUSH_URL}" >/dev/null || true
}

acquire_or_confirm_lock() {
  local fd="$1" lock_file="$2" description="$3" expected inherited
  expected="$(realpath -m -- "${lock_file}")"
  inherited="$(readlink -f -- "/proc/$$/fd/${fd}" 2>/dev/null || true)"
  if [[ "${inherited}" != "${expected}" ]]; then
    case "${fd}" in
      9) exec 9>"${lock_file}" ;;
      8) exec 8>"${lock_file}" ;;
      *) echo "Unsupported lock descriptor: ${fd}" >&2; exit 1 ;;
    esac
  fi
  if ! flock -n "${fd}"; then
    echo "Another ${description} is already running: ${lock_file}" >&2
    exit 1
  fi
}

require_positive_integer() {
  local name="$1" value="$2"
  if [[ ! "${value}" =~ ^[0-9]+$ ]] || (( value < 1 )); then
    record_failure "${name} must be a positive integer"
    return 1
  fi
}

for setting in \
  "BACKUP_MAX_AGE_HOURS:${BACKUP_MAX_AGE_HOURS}" \
  "BACKUP_WEEKLY_MAX_AGE_HOURS:${BACKUP_WEEKLY_MAX_AGE_HOURS}" \
  "BACKUP_MIN_SIZE_BYTES:${BACKUP_MIN_SIZE_BYTES}" \
  "BACKUP_DISK_USAGE_MAX_PERCENT:${BACKUP_DISK_USAGE_MAX_PERCENT}"; do
  require_positive_integer "${setting%%:*}" "${setting#*:}" || true
done
if [[ "${BACKUP_DISK_USAGE_MAX_PERCENT}" =~ ^[0-9]+$ ]] && (( BACKUP_DISK_USAGE_MAX_PERCENT > 100 )); then
  record_failure "BACKUP_DISK_USAGE_MAX_PERCENT must not exceed 100"
fi
if is_true "${CHECK_RESTORE_TEST}"; then
  require_positive_integer "BACKUP_RESTORE_TEST_MAX_AGE_HOURS" "${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}" || true
  if [[ "${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}" =~ ^[0-9]+$ ]] && (( BACKUP_RESTORE_TEST_MAX_AGE_HOURS > 24 )); then
    record_failure "BACKUP_RESTORE_TEST_MAX_AGE_HOURS must be 24 or less"
  fi
elif [[ "${NODE_ENV:-}" == "production" ]]; then
  record_failure "CHECK_RESTORE_TEST cannot be disabled in production"
fi

if [[ -z "${BACKUP_INTEGRITY_HMAC_KEY:-}" ]]; then
  record_failure "BACKUP_INTEGRITY_HMAC_KEY is required for signed backup health evidence"
elif (( ${#BACKUP_INTEGRITY_HMAC_KEY} < 32 )); then
  record_failure "BACKUP_INTEGRITY_HMAC_KEY must contain at least 32 characters"
fi
if [[ -z "${BACKUP_INTEGRITY_EPOCH_ID:-}" ]]; then
  record_failure "BACKUP_INTEGRITY_EPOCH_ID is required for signed backup health evidence"
elif [[ ! "${BACKUP_INTEGRITY_EPOCH_ID}" =~ ^[a-z0-9][a-z0-9-]{2,63}$ ]]; then
  record_failure "BACKUP_INTEGRITY_EPOCH_ID is malformed"
fi

if [[ -z "${BACKUP_REQUIRE_MOUNT}" && "${MENORAH_BACKUP_ROOT}" == /mnt/menorah-backups* ]]; then
  BACKUP_REQUIRE_MOUNT=true
fi

mkdir -p -- "${MENORAH_DEPLOY_STATE_ROOT}"
acquire_or_confirm_lock 9 "${MENORAH_DEPLOY_STATE_ROOT}/.deploy.lock" "deployment, rollback, bootstrap, or restore"

if is_true "${BACKUP_REQUIRE_MOUNT}" && ! findmnt --mountpoint "${MENORAH_BACKUP_ROOT}" >/dev/null 2>&1; then
  record_failure "Backup root is not mounted: ${MENORAH_BACKUP_ROOT}"
fi

if [[ ! -d "${MENORAH_BACKUP_ROOT}" ]]; then
  record_failure "Backup root does not exist: ${MENORAH_BACKUP_ROOT}"
elif [[ ! -d "${MENORAH_BACKUP_ROOT}/metadata" ]]; then
  record_failure "Backup metadata directory does not exist: ${MENORAH_BACKUP_ROOT}/metadata"
else
  acquire_or_confirm_lock 8 "${MENORAH_BACKUP_ROOT}/metadata/.backup.lock" "backup, restore, prune, or health check"
  disk_usage_percent="$(df -P "${MENORAH_BACKUP_ROOT}" | awk 'NR==2 { gsub("%", "", $5); print $5 }')"
  if [[ ! "${disk_usage_percent}" =~ ^[0-9]+$ ]]; then
    record_failure "Backup disk usage could not be determined"
  elif [[ "${BACKUP_DISK_USAGE_MAX_PERCENT}" =~ ^[0-9]+$ ]] && (( disk_usage_percent >= BACKUP_DISK_USAGE_MAX_PERCENT )); then
    record_failure "Backup disk usage is ${disk_usage_percent}% >= ${BACKUP_DISK_USAGE_MAX_PERCENT}%"
  fi
  require_encryption=false
  if [[ "${NODE_ENV:-}" == "production" ]] || is_true "${BACKUP_REQUIRE_ENCRYPTION}"; then
    require_encryption=true
  fi
  if [[ "${#failures[@]}" -eq 0 ]]; then
    if ! chain_summary="$(
      BACKUP_HEALTH_ROOT="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")" \
      BACKUP_HEALTH_DAILY_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS}" \
      BACKUP_HEALTH_WEEKLY_MAX_AGE_HOURS="${BACKUP_WEEKLY_MAX_AGE_HOURS}" \
      BACKUP_HEALTH_MIN_SIZE_BYTES="${BACKUP_MIN_SIZE_BYTES}" \
      BACKUP_HEALTH_CHECK_RESTORE="$(if is_true "${CHECK_RESTORE_TEST}"; then echo true; else echo false; fi)" \
      BACKUP_HEALTH_RESTORE_MAX_AGE_HOURS="${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}" \
      BACKUP_HEALTH_REQUIRE_ENCRYPTION="${require_encryption}" \
      BACKUP_HEALTH_PRODUCTION="$(if [[ "${NODE_ENV:-}" == "production" ]]; then echo true; else echo false; fi)" \
        node "${SCRIPT_DIR}/backup-integrity-health.js" 2>&1
    )"; then
      record_failure "${chain_summary}"
      chain_summary=""
    fi
  fi
fi

if [[ -e "${BACKUP_RAID_DEVICE}" ]]; then
  raid_detail=""
  if command -v mdadm >/dev/null 2>&1; then raid_detail="$(mdadm --detail "${BACKUP_RAID_DEVICE}" 2>&1 || true)"; fi
  if [[ -n "${raid_detail}" && ! "${raid_detail}" =~ must\ be\ super-user ]]; then
    if grep -Eiq 'State :.*(degraded|inactive)|Failed Devices : [1-9]|Active Devices : [01]' <<< "${raid_detail}"; then record_failure "RAID health is not clean for ${BACKUP_RAID_DEVICE}"; fi
  elif [[ -r /proc/mdstat ]]; then
    mdstat="$(cat /proc/mdstat)"
    if grep -Eq '\[[U_]*_[U_]*\]' <<< "${mdstat}"; then record_failure "RAID health is degraded according to /proc/mdstat";
    elif ! grep -Eq '\[[U]+\]' <<< "${mdstat}"; then record_failure "RAID health could not be confirmed from /proc/mdstat"; fi
  else
    record_failure "Cannot inspect RAID health for ${BACKUP_RAID_DEVICE}"
  fi
elif is_true "${BACKUP_EXPECT_RAID}"; then
  record_failure "Expected RAID device is missing: ${BACKUP_RAID_DEVICE}"
fi

if [[ "${#failures[@]}" -gt 0 ]]; then
  printf 'Backup health check failed:\n' >&2
  printf -- '- %s\n' "${failures[@]}" >&2
  push_status down "Backup health failed: ${failures[*]}"
  exit 1
fi

echo "Backup health OK: ${chain_summary}"
push_status up "Backup health OK"
