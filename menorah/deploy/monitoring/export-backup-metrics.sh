#!/bin/sh
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
TEXTFILE_DIR="${TEXTFILE_DIR:-/textfile}"
OUTPUT_FILE="${TEXTFILE_DIR}/menorah-backup.prom"
TEMP_FILE="${OUTPUT_FILE}.tmp.$$"

mkdir -p "${TEXTFILE_DIR}"
trap 'rm -f "${TEMP_FILE}"' EXIT HUP INT TERM

marker_metric() {
  backup_type="$1"
  marker="${BACKUP_ROOT}/metadata/latest-success-${backup_type}.json"
  signature="${marker}.hmac-sha256"

  if [ -s "${marker}" ] && [ -s "${signature}" ]; then
    modified_epoch="$(stat -c %Y "${marker}")"
    printf 'menorah_backup_metadata_present{backup_type="%s"} 1\n' "${backup_type}"
    printf 'menorah_backup_last_success_timestamp_seconds{backup_type="%s"} %s\n' \
      "${backup_type}" "${modified_epoch}"
  else
    printf 'menorah_backup_metadata_present{backup_type="%s"} 0\n' "${backup_type}"
    printf 'menorah_backup_last_success_timestamp_seconds{backup_type="%s"} 0\n' "${backup_type}"
  fi
}

{
  echo '# HELP menorah_backup_metrics_last_run_timestamp_seconds Unix timestamp of the backup metadata exporter run.'
  echo '# TYPE menorah_backup_metrics_last_run_timestamp_seconds gauge'
  printf 'menorah_backup_metrics_last_run_timestamp_seconds %s\n' "$(date +%s)"
  echo '# HELP menorah_backup_metadata_present Whether a latest-success metadata marker exists for a backup type.'
  echo '# TYPE menorah_backup_metadata_present gauge'
  echo '# HELP menorah_backup_last_success_timestamp_seconds Filesystem timestamp of a latest-success backup marker.'
  echo '# TYPE menorah_backup_last_success_timestamp_seconds gauge'

  for backup_type in manual six-hourly daily weekly monthly; do
    marker_metric "${backup_type}"
  done

  restore_marker="${BACKUP_ROOT}/restore-tests/latest-success.json"
  echo '# HELP menorah_restore_test_metadata_present Whether the isolated restore-test success marker exists.'
  echo '# TYPE menorah_restore_test_metadata_present gauge'
  echo '# HELP menorah_restore_test_last_success_timestamp_seconds Filesystem timestamp of the latest restore-test success marker.'
  echo '# TYPE menorah_restore_test_last_success_timestamp_seconds gauge'
  if [ -s "${restore_marker}" ] && [ -s "${restore_marker}.hmac-sha256" ]; then
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
