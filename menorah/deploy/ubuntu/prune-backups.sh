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
SIX_HOURLY_RETENTION_DAYS="${SIX_HOURLY_RETENTION_DAYS:-7}"
DAILY_RETENTION_DAYS="${DAILY_RETENTION_DAYS:-30}"
WEEKLY_RETENTION_DAYS="${WEEKLY_RETENTION_DAYS:-84}"
MONTHLY_RETENTION_DAYS="${MONTHLY_RETENTION_DAYS:-366}"

prune_type() {
  local backup_type="$1"
  local retention_days="$2"
  local type_dir="${MENORAH_BACKUP_ROOT}/${backup_type}"

  [[ -d "${type_dir}" ]] || return 0

  local newest
  newest="$(find "${type_dir}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tail -n 1 || true)"
  [[ -n "${newest}" ]] || return 0

  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] || continue
    if [[ "$(basename "${candidate}")" == "${newest}" ]]; then
      continue
    fi
    echo "Pruning old ${backup_type} backup: ${candidate}"
    rm -rf -- "${candidate}"
  done < <(find "${type_dir}" -mindepth 1 -maxdepth 1 -type d -mtime "+${retention_days}" -print | sort)
}

prune_type "six-hourly" "${SIX_HOURLY_RETENTION_DAYS}"
prune_type "daily" "${DAILY_RETENTION_DAYS}"
prune_type "weekly" "${WEEKLY_RETENTION_DAYS}"
prune_type "monthly" "${MONTHLY_RETENTION_DAYS}"

echo "Backup pruning complete under ${MENORAH_BACKUP_ROOT}"
