#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${MENORAH_REPO_ROOT:-/opt/menorah/menorah}"
ENV_FILE="${PRODUCTION_ENV:-${REPO_ROOT}/deploy/env/production.env}"
RUN_USER="${MENORAH_BACKUP_USER:-tejasmenorah}"
LOG_DIR="${MENORAH_LOG_DIR:-/opt/menorah/logs}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [[ ! -d "${REPO_ROOT}" ]]; then
  echo "Repo root not found: ${REPO_ROOT}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Production env file not found: ${ENV_FILE}" >&2
  exit 1
fi

if ! id "${RUN_USER}" >/dev/null 2>&1; then
  echo "Backup run user does not exist: ${RUN_USER}" >&2
  exit 1
fi

install -d -m 0750 -o "${RUN_USER}" -g "${RUN_USER}" "${LOG_DIR}"
touch "${LOG_DIR}/backup.log" "${LOG_DIR}/backup-health.log" "${LOG_DIR}/restore-test.log"
chown "${RUN_USER}:${RUN_USER}" "${LOG_DIR}/backup.log" "${LOG_DIR}/backup-health.log" "${LOG_DIR}/restore-test.log"

cat > /etc/systemd/system/menorah-backup@.service <<UNIT
[Unit]
Description=Menorah %i backup
Wants=docker.service
After=docker.service

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${REPO_ROOT}
Environment=PRODUCTION_ENV=${ENV_FILE}
ExecStart=/bin/bash ${REPO_ROOT}/deploy/ubuntu/backup-now.sh %i
StandardOutput=append:${LOG_DIR}/backup.log
StandardError=append:${LOG_DIR}/backup.log
UNIT

cat > /etc/systemd/system/menorah-backup-daily.timer <<'UNIT'
[Unit]
Description=Run Menorah daily backup

[Timer]
OnCalendar=*-*-* 02:30:00 UTC
Persistent=true
RandomizedDelaySec=5m
Unit=menorah-backup@daily.service

[Install]
WantedBy=timers.target
UNIT

cat > /etc/systemd/system/menorah-backup-weekly.timer <<'UNIT'
[Unit]
Description=Run Menorah weekly backup

[Timer]
OnCalendar=Sun *-*-* 03:00:00 UTC
Persistent=true
RandomizedDelaySec=10m
Unit=menorah-backup@weekly.service

[Install]
WantedBy=timers.target
UNIT

cat > /etc/systemd/system/menorah-backup-monthly.timer <<'UNIT'
[Unit]
Description=Run Menorah monthly backup

[Timer]
OnCalendar=*-*-01 04:00:00 UTC
Persistent=true
RandomizedDelaySec=15m
Unit=menorah-backup@monthly.service

[Install]
WantedBy=timers.target
UNIT

cat > /etc/systemd/system/menorah-restore-test.service <<UNIT
[Unit]
Description=Menorah restore-test from latest backup
Wants=docker.service
After=docker.service

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${REPO_ROOT}
Environment=PRODUCTION_ENV=${ENV_FILE}
ExecStart=/bin/bash ${REPO_ROOT}/deploy/ubuntu/restore-latest-backup.sh restore-test
StandardOutput=append:${LOG_DIR}/restore-test.log
StandardError=append:${LOG_DIR}/restore-test.log
UNIT

cat > /etc/systemd/system/menorah-restore-test.timer <<'UNIT'
[Unit]
Description=Run Menorah weekly restore-test

[Timer]
OnCalendar=Sun *-*-* 05:00:00 UTC
Persistent=true
RandomizedDelaySec=15m
Unit=menorah-restore-test.service

[Install]
WantedBy=timers.target
UNIT

cat > /etc/systemd/system/menorah-backup-prune.service <<UNIT
[Unit]
Description=Prune old Menorah backups by retention policy

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${REPO_ROOT}
Environment=PRODUCTION_ENV=${ENV_FILE}
ExecStart=/bin/bash ${REPO_ROOT}/deploy/ubuntu/prune-backups.sh
StandardOutput=append:${LOG_DIR}/backup.log
StandardError=append:${LOG_DIR}/backup.log
UNIT

cat > /etc/systemd/system/menorah-backup-prune.timer <<'UNIT'
[Unit]
Description=Run Menorah backup pruning daily

[Timer]
OnCalendar=*-*-* 06:00:00 UTC
Persistent=true
RandomizedDelaySec=10m
Unit=menorah-backup-prune.service

[Install]
WantedBy=timers.target
UNIT

cat > /etc/systemd/system/menorah-backup-health.service <<UNIT
[Unit]
Description=Check Menorah backup health

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${REPO_ROOT}
Environment=PRODUCTION_ENV=${ENV_FILE}
ExecStart=/bin/bash ${REPO_ROOT}/deploy/ubuntu/check-backup-health.sh
StandardOutput=append:${LOG_DIR}/backup-health.log
StandardError=append:${LOG_DIR}/backup-health.log
UNIT

cat > /etc/systemd/system/menorah-backup-health.timer <<'UNIT'
[Unit]
Description=Run Menorah backup health check hourly

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=3m
Unit=menorah-backup-health.service

[Install]
WantedBy=timers.target
UNIT

cat > /etc/logrotate.d/menorah-backups <<LOGROTATE
${LOG_DIR}/backup.log ${LOG_DIR}/backup-health.log ${LOG_DIR}/restore-test.log {
  weekly
  rotate 12
  compress
  missingok
  notifempty
  copytruncate
}
LOGROTATE

systemctl daemon-reload
systemctl enable --now \
  menorah-backup-daily.timer \
  menorah-backup-weekly.timer \
  menorah-backup-monthly.timer \
  menorah-restore-test.timer \
  menorah-backup-prune.timer \
  menorah-backup-health.timer

systemctl list-timers 'menorah-*'
