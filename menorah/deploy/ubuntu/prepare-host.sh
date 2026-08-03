#!/usr/bin/env bash
set -euo pipefail

MENORAH_USER="${MENORAH_USER:-${SUDO_USER:-}}"
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
  if [[ -z "${MENORAH_USER}" || "${MENORAH_USER}" == "root" ]]; then
    echo "Run with sudo from the non-root production operator account, or set MENORAH_USER explicitly." >&2
    exit 1
  fi
  if ! id "${MENORAH_USER}" >/dev/null 2>&1; then
    echo "Production operator account does not exist: ${MENORAH_USER}" >&2
    exit 1
  fi
}

install_docker() {
  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release git nodejs openssl

  local node_major
  node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  if [[ ! "${node_major}" =~ ^[0-9]+$ ]] || (( node_major < 18 )); then
    echo "Node.js 18 or newer is required by the guarded release tooling." >&2
    echo "Install a supported Node.js release through the approved host package source, then rerun." >&2
    exit 1
  fi

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
    # This file is supplied by the target Ubuntu host, not the release archive.
    # shellcheck disable=SC1091
    . /etc/os-release
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
  fi

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

configure_docker_log_rotation() {
  local config_dir="/etc/docker"
  local config_file="${config_dir}/daemon.json"
  local candidate
  local node_status=0

  install -d -m 0755 -o root -g root "${config_dir}"
  candidate="$(mktemp "${config_dir}/daemon.json.menorah.XXXXXX")"

  node - "${config_file}" "${candidate}" <<'NODE' || node_status=$?
const fs = require('fs');

const [configFile, candidate] = process.argv.slice(2);
const exists = fs.existsSync(configFile);
let config = {};
if (exists) {
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    console.error(`${configFile} is not valid JSON; refusing to replace it.`);
    process.exit(1);
  }
}
if (!config || Array.isArray(config) || typeof config !== 'object') {
  console.error(`${configFile} must contain one JSON object.`);
  process.exit(1);
}

const expected = {
  'log-driver': 'json-file',
  'log-opts': {
    'max-size': '25m',
    'max-file': '5',
  },
};
if (config['log-driver'] && config['log-driver'] !== expected['log-driver']) {
  console.error(
    `${configFile} has log-driver=${config['log-driver']}; an approved migration to json-file is required.`,
  );
  process.exit(1);
}
if (
  config['log-opts']
  && (Array.isArray(config['log-opts']) || typeof config['log-opts'] !== 'object')
) {
  console.error(`${configFile} log-opts must be a JSON object.`);
  process.exit(1);
}

let changed = false;
if (!config['log-driver']) {
  config['log-driver'] = expected['log-driver'];
  changed = true;
}
config['log-opts'] ||= {};
for (const [key, value] of Object.entries(expected['log-opts'])) {
  if (config['log-opts'][key] && config['log-opts'][key] !== value) {
    console.error(
      `${configFile} has log-opts.${key}=${config['log-opts'][key]}; expected ${value}.`,
    );
    process.exit(1);
  }
  if (!config['log-opts'][key]) {
    config['log-opts'][key] = value;
    changed = true;
  }
}
if (!changed) process.exit(10);
fs.writeFileSync(candidate, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
NODE

  if (( node_status == 10 )); then
    rm -f -- "${candidate}"
    echo "Docker json-file rotation is already configured."
    return
  fi
  if (( node_status != 0 )); then
    rm -f -- "${candidate}"
    exit "${node_status}"
  fi
  if [[ -n "$(docker ps -aq)" ]]; then
    rm -f -- "${candidate}"
    echo "Docker log defaults need updating, but containers already exist." >&2
    echo "Apply the reviewed daemon change and recreate containers in an approved maintenance window." >&2
    exit 1
  fi

  dockerd --validate --config-file "${candidate}"
  chown root:root "${candidate}"
  chmod 0644 "${candidate}"
  mv -f -- "${candidate}" "${config_file}"
  systemctl restart docker
  systemctl is-active --quiet docker
}

create_user_and_dirs() {
  local operator_gid
  operator_gid="$(id -g "${MENORAH_USER}")"
  usermod -aG docker "${MENORAH_USER}" || true

  create_once() {
    local mode="$1"
    local owner="$2"
    local group="$3"
    local path="$4"
    local resolved_path lexical_path
    resolved_path="$(realpath -m -- "${path}")"
    lexical_path="$(realpath -ms -- "${path}")"
    if [[ "${resolved_path}" != "${lexical_path}" || -L "${path}" ]]; then
      echo "Refusing a runtime directory with a symlinked path component: ${path}" >&2
      exit 1
    fi
    if [[ -e "${path}" && ! -d "${path}" ]]; then
      echo "Expected a directory but found another file type: ${path}" >&2
      exit 1
    fi
    if [[ ! -d "${path}" ]]; then
      install -d -m "${mode}" -o "${owner}" -g "${group}" "${path}"
    fi
  }

  require_directory_security() {
    local mode="$1"
    local owner="$2"
    local group="$3"
    local path="$4"
    local actual_identity actual_mode resolved_path lexical_path
    resolved_path="$(realpath -e -- "${path}")"
    lexical_path="$(realpath -ms -- "${path}")"
    actual_identity="$(stat -c '%u:%g' "${path}")"
    actual_mode="$(stat -c '%a' "${path}")"
    mode="${mode#0}"
    if [[ "${resolved_path}" != "${lexical_path}" || -L "${path}" ]]; then
      echo "Runtime directory has a symlinked path component: ${path}" >&2
      exit 1
    fi
    if [[ "${actual_identity}" != "${owner}:${group}" || "${actual_mode}" != "${mode}" ]]; then
      echo "Runtime directory security is ${actual_identity} mode ${actual_mode}; expected ${owner}:${group} mode ${mode}: ${path}" >&2
      echo "Correct it only in an approved maintenance window with the affected service stopped." >&2
      exit 1
    fi
  }

  for path in \
    "${MENORAH_ROOT}" \
    "${DATA_ROOT}" \
    "${DATA_ROOT}/caddy" \
    "${DATA_ROOT}/caddy/data" \
    "${DATA_ROOT}/caddy/config" \
    "${DATA_ROOT}/logs" \
    "${DATA_ROOT}/logs/caddy" \
    "${DATA_ROOT}/mongo" \
    "${DATA_ROOT}/mongo/primary" \
    "${DATA_ROOT}/redis" \
    "${DATA_ROOT}/uptime-kuma" \
    "${BACKUP_ROOT}" \
    "${BACKUP_ROOT}/six-hourly" \
    "${BACKUP_ROOT}/daily" \
    "${BACKUP_ROOT}/weekly" \
    "${BACKUP_ROOT}/monthly" \
    "${BACKUP_ROOT}/restore-tests" \
    "${LOG_ROOT}" \
    "${DEPLOY_STATE_ROOT}" \
    "${DEPLOY_STATE_ROOT}/backup-attempts"; do
    create_once 0750 "${MENORAH_USER}" "${operator_gid}" "${path}"
    require_directory_security 0750 "${MENORAH_USER}" "${operator_gid}" "${path}"
  done

  create_once 0700 "${MENORAH_USER}" "${operator_gid}" "${SECRETS_ROOT}"
  require_directory_security 0700 "${MENORAH_USER}" "${operator_gid}" "${SECRETS_ROOT}"

  # Every API and worker uses this one immutable media namespace. The
  # digest-pinned backend image runs as uid 100; the operator group retains
  # read access for signed backup and incident workflows.
  create_once 2770 100 "${operator_gid}" "${DATA_ROOT}/uploads"
  require_directory_security 2770 100 "${operator_gid}" "${DATA_ROOT}/uploads"

  # These numeric owners are the non-root users declared by the pinned images.
  create_once 0770 65534 "${operator_gid}" "${DATA_ROOT}/prometheus"
  create_once 0770 65534 "${operator_gid}" "${DATA_ROOT}/alertmanager"
  create_once 0770 65534 "${operator_gid}" "${DATA_ROOT}/monitoring-textfile"
  create_once 0770 472 "${operator_gid}" "${DATA_ROOT}/grafana"
  create_once 0770 0 "${operator_gid}" "${DATA_ROOT}/alloy"
  create_once 0770 10001 "${operator_gid}" "${DATA_ROOT}/loki"
  require_directory_security 0770 65534 "${operator_gid}" "${DATA_ROOT}/prometheus"
  require_directory_security 0770 65534 "${operator_gid}" "${DATA_ROOT}/alertmanager"
  require_directory_security 0770 65534 "${operator_gid}" "${DATA_ROOT}/monitoring-textfile"
  require_directory_security 0770 472 "${operator_gid}" "${DATA_ROOT}/grafana"
  require_directory_security 0770 0 "${operator_gid}" "${DATA_ROOT}/alloy"
  require_directory_security 0770 10001 "${operator_gid}" "${DATA_ROOT}/loki"
}

require_root
install_docker
configure_docker_log_rotation
create_user_and_dirs

cat <<EOF
Ubuntu host is prepared.

Next commands:
  cd /opt/menorah
  git clone https://github.com/menorahsoftware-cmyk/menorah-mobile-app-.git
  cd menorah-mobile-app-
  git checkout 'release/<reviewed-release-name>'
  cp menorah/deploy/env/production.env.example menorah/deploy/env/production.env
  cp menorah/deploy/env/cloudflare.env.example menorah/deploy/env/cloudflare.env
  nano menorah/deploy/env/production.env
  nano menorah/deploy/env/cloudflare.env
  # Bootstrap only, before production traffic:
  export DEPLOY_BRANCH='release/<reviewed-release-name>'
  export DEPLOY_RELEASE_SHA='<reviewed-full-40-character-sha>'
  MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST \
    bash menorah/deploy/ubuntu/first-run.sh
EOF
