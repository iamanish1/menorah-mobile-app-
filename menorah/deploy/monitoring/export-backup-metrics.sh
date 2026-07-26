#!/bin/sh
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
BACKUP_ATTEMPT_ROOT="${BACKUP_ATTEMPT_ROOT:-/backup-attempts}"
BACKUP_INTEGRITY_EPOCH_ID="${BACKUP_INTEGRITY_EPOCH_ID:-}"
TEXTFILE_DIR="${TEXTFILE_DIR:-/textfile}"
OUTPUT_FILE="${TEXTFILE_DIR}/menorah-backup.prom"
TEMP_FILE="${OUTPUT_FILE}.tmp.$$"

mkdir -p "${TEXTFILE_DIR}"
trap 'rm -f "${TEMP_FILE}"' EXIT HUP INT TERM

marker_metric() {
  backup_type="$1"
  marker="${BACKUP_ROOT}/metadata/integrity-epochs/${BACKUP_INTEGRITY_EPOCH_ID}/pointers/latest-success-${backup_type}.json"

  if [ -n "${BACKUP_INTEGRITY_EPOCH_ID}" ] && [ -s "${marker}" ]; then
    modified_epoch="$(stat -c %Y "${marker}")"
    printf 'menorah_backup_metadata_present{backup_type="%s"} 1\n' "${backup_type}"
    printf 'menorah_backup_last_success_timestamp_seconds{backup_type="%s"} %s\n' \
      "${backup_type}" "${modified_epoch}"
  else
    printf 'menorah_backup_metadata_present{backup_type="%s"} 0\n' "${backup_type}"
    printf 'menorah_backup_last_success_timestamp_seconds{backup_type="%s"} 0\n' "${backup_type}"
  fi
}

attempt_metric() {
  backup_type="$1"
  state_file="${BACKUP_ATTEMPT_ROOT}/latest-attempt-${backup_type}.status"
  metadata_present=0
  result=0
  timestamp_seconds=0

  if [ -s "${state_file}" ]; then
    schema_version="$(sed -n 's/^schema_version=//p' "${state_file}")"
    recorded_type="$(sed -n 's/^backup_type=//p' "${state_file}")"
    recorded_result="$(sed -n 's/^result=//p' "${state_file}")"
    recorded_timestamp="$(sed -n 's/^timestamp_seconds=//p' "${state_file}")"
    if [ "${schema_version}" = "1" ] \
      && [ "${recorded_type}" = "${backup_type}" ] \
      && { [ "${recorded_result}" = "0" ] || [ "${recorded_result}" = "1" ]; } \
      && printf '%s\n' "${recorded_timestamp}" | grep -Eq '^[0-9]{10,}$'; then
      metadata_present=1
      result="${recorded_result}"
      timestamp_seconds="${recorded_timestamp}"
    fi
  fi

  printf 'menorah_backup_attempt_metadata_present{backup_type="%s"} %s\n' \
    "${backup_type}" "${metadata_present}"
  printf 'menorah_backup_last_attempt_result{backup_type="%s"} %s\n' \
    "${backup_type}" "${result}"
  printf 'menorah_backup_last_attempt_timestamp_seconds{backup_type="%s"} %s\n' \
    "${backup_type}" "${timestamp_seconds}"
}

{
  echo '# HELP menorah_backup_metrics_last_run_timestamp_seconds Unix timestamp of the backup metadata exporter run.'
  echo '# TYPE menorah_backup_metrics_last_run_timestamp_seconds gauge'
  printf 'menorah_backup_metrics_last_run_timestamp_seconds %s\n' "$(date +%s)"
  echo '# HELP menorah_backup_metadata_present Whether a latest-success metadata marker exists for a backup type.'
  echo '# TYPE menorah_backup_metadata_present gauge'
  echo '# HELP menorah_backup_last_success_timestamp_seconds Filesystem timestamp of a latest-success backup marker.'
  echo '# TYPE menorah_backup_last_success_timestamp_seconds gauge'
  echo '# HELP menorah_backup_attempt_metadata_present Whether a validated latest-attempt state file exists for a backup type.'
  echo '# TYPE menorah_backup_attempt_metadata_present gauge'
  echo '# HELP menorah_backup_last_attempt_result Whether the latest backup attempt succeeded (1) or failed (0).'
  echo '# TYPE menorah_backup_last_attempt_result gauge'
  echo '# HELP menorah_backup_last_attempt_timestamp_seconds Unix timestamp of the latest backup attempt.'
  echo '# TYPE menorah_backup_last_attempt_timestamp_seconds gauge'

  for backup_type in manual six-hourly daily weekly monthly; do
    marker_metric "${backup_type}"
    attempt_metric "${backup_type}"
  done

  restore_marker="${BACKUP_ROOT}/metadata/integrity-epochs/${BACKUP_INTEGRITY_EPOCH_ID}/pointers/latest-restore-test.json"
  echo '# HELP menorah_restore_test_metadata_present Whether the isolated restore-test success marker exists.'
  echo '# TYPE menorah_restore_test_metadata_present gauge'
  echo '# HELP menorah_restore_test_last_success_timestamp_seconds Filesystem timestamp of the latest restore-test success marker.'
  echo '# TYPE menorah_restore_test_last_success_timestamp_seconds gauge'
  if [ -n "${BACKUP_INTEGRITY_EPOCH_ID}" ] && [ -s "${restore_marker}" ]; then
    printf 'menorah_restore_test_metadata_present 1\n'
    printf 'menorah_restore_test_last_success_timestamp_seconds %s\n' "$(stat -c %Y "${restore_marker}")"
  else
    printf 'menorah_restore_test_metadata_present 0\n'
    printf 'menorah_restore_test_last_success_timestamp_seconds 0\n'
  fi
} > "${TEMP_FILE}"

chmod 0644 "${TEMP_FILE}"
mv -f "${TEMP_FILE}" "${OUTPUT_FILE}"
trap - EXIT HUP INT TERM
