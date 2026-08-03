#!/usr/bin/env bash
set -euo pipefail
umask 077

# Epochs deliberately make historical backup evidence immutable.  Retention is
# therefore fail-closed while an operator-approved epoch-aware retention plan
# is absent: this script validates the active authority and removes nothing.

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
BACKUP_REQUIRE_MOUNT="${BACKUP_REQUIRE_MOUNT:-}"

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
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

if [[ -z "${BACKUP_REQUIRE_MOUNT}" && "${MENORAH_BACKUP_ROOT}" == /mnt/menorah-backups* ]]; then
  BACKUP_REQUIRE_MOUNT=true
fi
if is_true "${BACKUP_REQUIRE_MOUNT}" && ! findmnt --mountpoint "${MENORAH_BACKUP_ROOT}" >/dev/null 2>&1; then
  echo "Backup root is not mounted: ${MENORAH_BACKUP_ROOT}" >&2
  echo "Refusing to prune an OS-disk fallback path." >&2
  exit 1
fi
if [[ ! -d "${MENORAH_BACKUP_ROOT}/metadata" ]]; then
  echo "Backup metadata directory does not exist: ${MENORAH_BACKUP_ROOT}/metadata" >&2
  exit 1
fi

mkdir -p -- "${MENORAH_DEPLOY_STATE_ROOT}"
acquire_or_confirm_lock 9 "${MENORAH_DEPLOY_STATE_ROOT}/.deploy.lock" "deployment, rollback, bootstrap, or restore"
acquire_or_confirm_lock 8 "${MENORAH_BACKUP_ROOT}/metadata/.backup.lock" "backup, restore, prune, or health check"

if ! node "${SCRIPT_DIR}/backup-integrity-epoch.js" validate; then
  echo "A complete, configured backup-integrity epoch is required before pruning." >&2
  exit 1
fi

echo "Backup pruning deferred: immutable integrity epoch records and historical evidence were preserved."
