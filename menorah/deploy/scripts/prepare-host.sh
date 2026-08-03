#!/usr/bin/env bash
set -euo pipefail

MENORAH_ROOT="${MENORAH_ROOT:-/opt/menorah}"
MENORAH_DATA_ROOT="${MENORAH_DATA_ROOT:-/srv/menorah}"

mkdir -p \
  "${MENORAH_ROOT}/releases" \
  "${MENORAH_DATA_ROOT}/caddy/data" \
  "${MENORAH_DATA_ROOT}/caddy/config" \
  "${MENORAH_DATA_ROOT}/logs/caddy" \
  "${MENORAH_DATA_ROOT}/logs/app" \
  "${MENORAH_DATA_ROOT}/mongo/primary" \
  "${MENORAH_DATA_ROOT}/mongo/keyfile" \
  "${MENORAH_DATA_ROOT}/redis" \
  "${MENORAH_DATA_ROOT}/prometheus" \
  "${MENORAH_DATA_ROOT}/grafana" \
  "${MENORAH_DATA_ROOT}/uptime-kuma" \
  "${MENORAH_DATA_ROOT}/loki" \
  "${MENORAH_DATA_ROOT}/backups"

if [[ ! -f "${MENORAH_DATA_ROOT}/mongo/keyfile/mongo-keyfile" ]]; then
  openssl rand -base64 756 > "${MENORAH_DATA_ROOT}/mongo/keyfile/mongo-keyfile"
  chmod 400 "${MENORAH_DATA_ROOT}/mongo/keyfile/mongo-keyfile"
fi

echo "Host directories prepared."
echo "Next: unzip a release into ${MENORAH_ROOT}/releases/<sha>, copy deploy/env/*.example to real env files, then run docker compose."
