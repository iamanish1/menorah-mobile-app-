#!/usr/bin/env bash
set -euo pipefail

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
BACKUP_TYPE="${BACKUP_TYPE:-daily}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
BACKUP_MIN_SIZE_BYTES="${BACKUP_MIN_SIZE_BYTES:-1024}"
BACKUP_DISK_USAGE_MAX_PERCENT="${BACKUP_DISK_USAGE_MAX_PERCENT:-80}"
BACKUP_RAID_DEVICE="${BACKUP_RAID_DEVICE:-/dev/md/menorah-backups}"
BACKUP_EXPECT_RAID="${BACKUP_EXPECT_RAID:-false}"
BACKUP_REQUIRE_MOUNT="${BACKUP_REQUIRE_MOUNT:-}"
CHECK_RESTORE_TEST="${CHECK_RESTORE_TEST:-true}"
BACKUP_RESTORE_TEST_MAX_AGE_HOURS="${BACKUP_RESTORE_TEST_MAX_AGE_HOURS:-192}"
BACKUP_HEALTH_PUSH_URL="${BACKUP_HEALTH_PUSH_URL:-}"

failures=()

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

  curl -fsS -G \
    --data-urlencode "status=${status}" \
    --data-urlencode "msg=${message}" \
    "${BACKUP_HEALTH_PUSH_URL}" \
    >/dev/null || true
}

if [[ -z "${BACKUP_REQUIRE_MOUNT}" && "${MENORAH_BACKUP_ROOT}" == /mnt/menorah-backups* ]]; then
  BACKUP_REQUIRE_MOUNT=true
fi

if is_true "${BACKUP_REQUIRE_MOUNT}" && ! findmnt --mountpoint "${MENORAH_BACKUP_ROOT}" >/dev/null 2>&1; then
  record_failure "Backup root is not mounted: ${MENORAH_BACKUP_ROOT}"
fi

if [[ ! -d "${MENORAH_BACKUP_ROOT}" ]]; then
  record_failure "Backup root does not exist: ${MENORAH_BACKUP_ROOT}"
else
  disk_usage_percent="$(df -P "${MENORAH_BACKUP_ROOT}" | awk 'NR==2 { gsub("%", "", $5); print $5 }')"
  if [[ -n "${disk_usage_percent}" && "${disk_usage_percent}" -ge "${BACKUP_DISK_USAGE_MAX_PERCENT}" ]]; then
    record_failure "Backup disk usage is ${disk_usage_percent}% >= ${BACKUP_DISK_USAGE_MAX_PERCENT}%"
  fi
fi

latest_archive=""
if [[ -d "${MENORAH_BACKUP_ROOT}/${BACKUP_TYPE}" ]]; then
  latest_archive="$(find "${MENORAH_BACKUP_ROOT}/${BACKUP_TYPE}" \
    -type f \( -name '*.archive.gz' -o -name '*.archive.gz.enc' \) \
    -print 2>/dev/null | sort | tail -n 1 || true)"
fi

if [[ -z "${latest_archive}" ]]; then
  record_failure "No ${BACKUP_TYPE} MongoDB backup archive found under ${MENORAH_BACKUP_ROOT}/${BACKUP_TYPE}"
else
  size_bytes="$(stat -c %s "${latest_archive}")"
  modified_epoch="$(stat -c %Y "${latest_archive}")"
  now_epoch="$(date +%s)"
  age_hours="$(( (now_epoch - modified_epoch) / 3600 ))"

  if [[ "${size_bytes}" -lt "${BACKUP_MIN_SIZE_BYTES}" ]]; then
    record_failure "Latest backup is too small: ${size_bytes} bytes < ${BACKUP_MIN_SIZE_BYTES}"
  fi

  if [[ "${age_hours}" -gt "${BACKUP_MAX_AGE_HOURS}" ]]; then
    record_failure "Latest ${BACKUP_TYPE} backup is stale: ${age_hours}h > ${BACKUP_MAX_AGE_HOURS}h"
  fi

  if [[ ! -f "${latest_archive}.sha256" ]]; then
    record_failure "Missing checksum for latest backup: ${latest_archive}.sha256"
  elif ! (cd "$(dirname "${latest_archive}")" && sha256sum -c "$(basename "${latest_archive}.sha256")" >/dev/null); then
    record_failure "Checksum validation failed for latest backup: ${latest_archive}"
  fi
fi

if [[ -e "${BACKUP_RAID_DEVICE}" ]]; then
  raid_detail=""
  if command -v mdadm >/dev/null 2>&1; then
    raid_detail="$(mdadm --detail "${BACKUP_RAID_DEVICE}" 2>&1 || true)"
  fi

  if [[ -n "${raid_detail}" && ! "${raid_detail}" =~ must\ be\ super-user ]]; then
    if grep -Eiq 'State :.*(degraded|inactive)|Failed Devices : [1-9]|Active Devices : [01]' <<< "${raid_detail}"; then
      record_failure "RAID health is not clean for ${BACKUP_RAID_DEVICE}"
    fi
  elif [[ -r /proc/mdstat ]]; then
    mdstat="$(cat /proc/mdstat)"
    if grep -Eq '\[[U_]*_[U_]*\]' <<< "${mdstat}"; then
      record_failure "RAID health is degraded according to /proc/mdstat"
    elif ! grep -Eq '\[[U]+\]' <<< "${mdstat}"; then
      record_failure "RAID health could not be confirmed from /proc/mdstat"
    fi
  else
    record_failure "Cannot inspect RAID health for ${BACKUP_RAID_DEVICE}"
  fi
elif is_true "${BACKUP_EXPECT_RAID}"; then
  record_failure "Expected RAID device is missing: ${BACKUP_RAID_DEVICE}"
fi

if is_true "${CHECK_RESTORE_TEST}"; then
  restore_marker="${MENORAH_BACKUP_ROOT}/restore-tests/latest-success.json"
  if [[ ! -f "${restore_marker}" ]]; then
    record_failure "Restore-test success marker is missing: ${restore_marker}"
  else
    restore_age_hours="$(( ($(date +%s) - $(stat -c %Y "${restore_marker}")) / 3600 ))"
    if [[ "${restore_age_hours}" -gt "${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}" ]]; then
      record_failure "Restore-test marker is stale: ${restore_age_hours}h > ${BACKUP_RESTORE_TEST_MAX_AGE_HOURS}h"
    fi
  fi
fi

if [[ "${#failures[@]}" -gt 0 ]]; then
  printf 'Backup health check failed:\n' >&2
  printf -- '- %s\n' "${failures[@]}" >&2
  push_status "down" "Backup health failed: ${failures[*]}"
  exit 1
fi

echo "Backup health OK: latest ${BACKUP_TYPE} archive ${latest_archive:-none}"
push_status "up" "Backup health OK"
