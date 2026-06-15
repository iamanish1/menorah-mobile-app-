#!/usr/bin/env bash
set -euo pipefail

MENORAH_USER="${MENORAH_USER:-menorah}"
MENORAH_ROOT="${MENORAH_ROOT:-/opt/menorah}"
DATA_ROOT="${MENORAH_DATA_ROOT:-${MENORAH_ROOT}/data}"
BACKUP_ROOT="${MENORAH_BACKUP_ROOT:-${MENORAH_ROOT}/backups}"
SECRETS_ROOT="${MENORAH_SECRETS_ROOT:-${MENORAH_ROOT}/secrets}"
LOG_ROOT="${MENORAH_LOG_ROOT:-${MENORAH_ROOT}/logs}"
DEPLOY_STATE_ROOT="${MENORAH_DEPLOY_STATE_ROOT:-${MENORAH_ROOT}/deploy-state}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script with sudo on Ubuntu." >&2
    exit 1
  fi
}

install_docker() {
  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release git openssl

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker Engine and Compose plugin already installed."
    return
  fi

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
    . /etc/os-release
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
  fi

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

create_user_and_dirs() {
  if ! id "${MENORAH_USER}" >/dev/null 2>&1; then
    useradd --system --create-home --shell /usr/sbin/nologin "${MENORAH_USER}"
  fi

  usermod -aG docker "${MENORAH_USER}" || true

  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${MENORAH_ROOT}"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${DATA_ROOT}"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${DATA_ROOT}/mongo/primary"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${DATA_ROOT}/redis"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${DATA_ROOT}/uploads"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${BACKUP_ROOT}"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${BACKUP_ROOT}/six-hourly"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${BACKUP_ROOT}/daily"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${BACKUP_ROOT}/weekly"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${BACKUP_ROOT}/monthly"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${BACKUP_ROOT}/restore-tests"
  install -d -m 0700 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${SECRETS_ROOT}"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${LOG_ROOT}"
  install -d -m 0750 -o "${MENORAH_USER}" -g "${MENORAH_USER}" "${DEPLOY_STATE_ROOT}"
}

require_root
install_docker
create_user_and_dirs

cat <<EOF
Ubuntu host is prepared.

Next commands:
  cd /opt/menorah
  git clone https://github.com/menorahsoftware-cmyk/menorah-mobile-app-.git
  cd menorah-mobile-app-
  git checkout architecture/self-host-cloudrun-failover
  cp menorah/deploy/env/production.env.example menorah/deploy/env/production.env
  cp menorah/deploy/env/cloudflare.env.example menorah/deploy/env/cloudflare.env
  nano menorah/deploy/env/production.env
  nano menorah/deploy/env/cloudflare.env
  bash menorah/deploy/ubuntu/first-run.sh
EOF
