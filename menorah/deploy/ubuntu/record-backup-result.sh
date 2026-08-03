#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP_TYPE="${1:-}"
SERVICE_RESULT="${2:-unknown}"
EXIT_CODE="${3:-unknown}"
EXIT_STATUS="${4:-unknown}"
ATTEMPT_ROOT="${BACKUP_ATTEMPT_STATE_ROOT:-${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}/backup-attempts}"

case "${BACKUP_TYPE}" in
  manual|six-hourly|daily|weekly|monthly) ;;
  *)
    echo "Usage: record-backup-result.sh <manual|six-hourly|daily|weekly|monthly> [service-result] [exit-code] [exit-status]" >&2
    exit 2
    ;;
esac

case "${SERVICE_RESULT}" in
  success|exit-code|signal|core-dump|watchdog|start-limit-hit|timeout|resources|protocol|oom-kill|condition|assert) ;;
  *) SERVICE_RESULT=unknown ;;
esac
case "${EXIT_CODE}" in
  exited|killed|dumped) ;;
  *) EXIT_CODE=unknown ;;
esac
if [[ ! "${EXIT_STATUS}" =~ ^[0-9]{1,3}$ ]] || (( EXIT_STATUS > 255 )); then
  EXIT_STATUS=unknown
fi

RESULT=0
if [[ "${SERVICE_RESULT}" == "success" && "${EXIT_CODE}" == "exited" && "${EXIT_STATUS}" == "0" ]]; then
  RESULT=1
fi

TIMESTAMP_SECONDS="${BACKUP_RESULT_TIMESTAMP_SECONDS:-$(date +%s)}"
if [[ ! "${TIMESTAMP_SECONDS}" =~ ^[0-9]{10,}$ ]]; then
  echo "BACKUP_RESULT_TIMESTAMP_SECONDS must be a Unix timestamp." >&2
  exit 2
fi

mkdir -p "${ATTEMPT_ROOT}"
chmod 0750 "${ATTEMPT_ROOT}"
TEMP_FILE="$(mktemp "${ATTEMPT_ROOT}/.latest-attempt-${BACKUP_TYPE}.XXXXXX")"
trap 'rm -f -- "${TEMP_FILE}"' EXIT HUP INT TERM
chmod 0600 "${TEMP_FILE}"
{
  printf 'schema_version=1\n'
  printf 'backup_type=%s\n' "${BACKUP_TYPE}"
  printf 'result=%s\n' "${RESULT}"
  printf 'timestamp_seconds=%s\n' "${TIMESTAMP_SECONDS}"
  printf 'service_result=%s\n' "${SERVICE_RESULT}"
  printf 'exit_code=%s\n' "${EXIT_CODE}"
  printf 'exit_status=%s\n' "${EXIT_STATUS}"
} > "${TEMP_FILE}"
mv -f -- "${TEMP_FILE}" "${ATTEMPT_ROOT}/latest-attempt-${BACKUP_TYPE}.status"
trap - EXIT HUP INT TERM
