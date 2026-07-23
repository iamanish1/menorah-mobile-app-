#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${MENORAH_RELEASE_REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(readlink -f -- "${MENORAH_RELEASE_REPO_ROOT}")"
  SCRIPT_DIR="${REPO_ROOT}/menorah/deploy/ubuntu"
  DEPLOY_DIR="${REPO_ROOT}/menorah/deploy"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
fi
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
BRANCH="${DEPLOY_BRANCH:?DEPLOY_BRANCH is required and must name the reviewed release branch}"
REVIEWED_SHA="${DEPLOY_RELEASE_SHA:?DEPLOY_RELEASE_SHA is required and must be the reviewed 40-character commit SHA}"
MIGRATION_APPROVED_SHA="${DEPLOY_MIGRATION_APPROVED_SHA:?DEPLOY_MIGRATION_APPROVED_SHA is required and must approve migrations for the reviewed SHA}"
CHANGE_REFERENCE="${DEPLOY_CHANGE_REFERENCE:?DEPLOY_CHANGE_REFERENCE is required for recovery metadata}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
LOG_FILE="${STATE_DIR}/deploy.log"
LOCK_FILE="${STATE_DIR}/.deploy.lock"
MIGRATION_MARKER="${STATE_DIR}/migration-applied-sha"
MIGRATION_IN_PROGRESS_MARKER="${STATE_DIR}/migration-in-progress-sha"
MONGO_IDENTITY_RECONCILIATION_MARKER="${STATE_DIR}/mongo-identity-reconciliation-in-progress-sha"
BOOTSTRAP_COMPLETE_MARKER="${STATE_DIR}/bootstrap-complete-sha"
POST_MIGRATION_RECOVERY_MARKER="${STATE_DIR}/post-migration-recovery-sha"
ROLLBACK_IN_PROGRESS_MARKER="${STATE_DIR}/rollback-in-progress-sha"
CURRENT_SHA_FILE="${STATE_DIR}/current-sha"
LAST_GOOD_SHA_FILE="${STATE_DIR}/last-good-sha"
RELEASE_STATE_DIR="${STATE_DIR}/releases"
RELEASE_METADATA=""
IMAGE_MANIFEST=""
IMAGE_MANIFEST_SHA256=""
FRESH_BACKUP_METADATA=""
FRESH_ARCHIVE=""
FRESH_ARCHIVE_SHA256=""
MEDIA_MIGRATION_MANIFEST=""
MEDIA_MIGRATION_MANIFEST_SHA256=""
NEW_SHA=""
REMOTE_SHA=""
PREVIOUS_SHA=""
RELEASE_TREE_SHA=""
DEPLOY_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOY_PHASE="initializing"
MIGRATION_STATUS="pending"
HEALTH_STATUS="pending"
BOOTSTRAP_ONLY_RELEASE=false
DEPLOY_SUCCEEDED=false
SOURCE_CHECKOUT_CHANGED=false
MAINTENANCE_STARTED=false
BUILD_SERVICES=(
  landing-page
  user-web-app
  web-app
  admin-panel
  api-ios
  api-android
  api-web
  api-admin
  worker
)
PINNED_RELEASE_SERVICES=(
  reverse-proxy
  livekit
  cloudflared
  prometheus
  alertmanager
  blackbox-exporter
  mongodb-exporter
  redis-exporter
  node-exporter
  backup-metrics
  grafana
  uptime-kuma
  docker-metrics-gateway
  docker-stats-exporter
  log-collector
  loki
)
RELEASE_SERVICES=("${BUILD_SERVICES[@]}" "${PINNED_RELEASE_SERVICES[@]}")
WRITER_SERVICES=(api-ios api-android api-web api-admin worker)
PREDECESSOR_BASELINE_SERVICES=(
  landing-page
  user-web-app
  web-app
  admin-panel
  api-ios
  api-android
  api-web
  api-admin
  worker
  reverse-proxy
  livekit
  cloudflared
  prometheus
  grafana
  uptime-kuma
  loki
)
MONGO_MANAGED_ENV_KEYS=(
  MONGO_ROOT_USER
  MONGO_ROOT_PASSWORD
  MONGO_APP_USER
  MONGO_APP_PASSWORD
  MONGO_BACKUP_USER
  MONGO_BACKUP_PASSWORD
  MONGO_RESTORE_USER
  MONGO_RESTORE_PASSWORD
  MONGO_MONITOR_USER
  MONGO_MONITOR_PASSWORD
)
LOOPBACK_PORT_KEYS=(
  CADDY_HTTP_PORT
  LANDING_LOCAL_PORT
  USER_WEB_APP_LOCAL_PORT
  WEB_APP_LOCAL_PORT
  ADMIN_PANEL_LOCAL_PORT
  API_IOS_LOCAL_PORT
  API_ANDROID_LOCAL_PORT
  API_WEB_LOCAL_PORT
  API_ADMIN_LOCAL_PORT
  WORKER_LOCAL_PORT
  GRAFANA_LOCAL_PORT
  UPTIME_KUMA_LOCAL_PORT
  ALERTMANAGER_LOCAL_PORT
)
RETIRED_COMPOSE_SERVICES=(cadvisor promtail)

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

run_backend_migrations() {
  # The helper verifies the checksum-protected manifest, refuses mutable-tag
  # drift, and overrides api-web with the recorded content ID. Database
  # hostnames remain private to the Compose app network.
  PRODUCTION_ENV="${ENV_FILE}" \
  CLOUDFLARE_ENV="${CLOUDFLARE_ENV}" \
  MENORAH_RELEASE_IMAGE_MANIFEST="${IMAGE_MANIFEST}" \
    bash "${SCRIPT_DIR}/run-recorded-migration.sh"
}

ensure_reviewed_updater_execution() {
  local updater_path="menorah/deploy/ubuntu/update-from-git.sh"
  local expected_blob actual_blob staged_dir staged_script staged_temporary

  expected_blob="$(git -C "${REPO_ROOT}" rev-parse "${REVIEWED_SHA}:${updater_path}")"
  actual_blob="$(git -C "${REPO_ROOT}" hash-object "${BASH_SOURCE[0]}")"
  if [[ -n "${MENORAH_REVIEWED_UPDATER_SHA:-}" \
    && "${MENORAH_REVIEWED_UPDATER_SHA}" != "${REVIEWED_SHA}" ]]; then
    echo "Reviewed-updater handoff SHA does not match DEPLOY_RELEASE_SHA." >&2
    exit 1
  fi
  if [[ -n "${MENORAH_REVIEWED_UPDATER_BLOB_ID:-}" \
    && "${MENORAH_REVIEWED_UPDATER_BLOB_ID}" != "${expected_blob}" ]]; then
    echo "Reviewed-updater handoff blob identity is inconsistent." >&2
    exit 1
  fi
  if [[ "${actual_blob}" == "${expected_blob}" ]]; then
    export MENORAH_REVIEWED_UPDATER_SHA="${REVIEWED_SHA}"
    export MENORAH_REVIEWED_UPDATER_BLOB_ID="${expected_blob}"
    return 0
  fi

  staged_dir="${STATE_DIR}/reviewed-updaters"
  staged_script="${staged_dir}/${REVIEWED_SHA}.sh"
  mkdir -p "${staged_dir}"
  chmod 0700 "${staged_dir}"
  staged_temporary="$(mktemp "${staged_dir}/.${REVIEWED_SHA}.XXXXXX")"
  git -C "${REPO_ROOT}" cat-file blob "${REVIEWED_SHA}:${updater_path}" > "${staged_temporary}"
  if [[ "$(git -C "${REPO_ROOT}" hash-object "${staged_temporary}")" != "${expected_blob}" ]]; then
    echo "The staged reviewed updater does not match its candidate Git blob." >&2
    rm -f -- "${staged_temporary}"
    exit 1
  fi
  chmod 0500 "${staged_temporary}"
  mv -f -- "${staged_temporary}" "${staged_script}"
  echo "Transferring release control to the exact reviewed candidate updater blob."
  MENORAH_REVIEWED_UPDATER_SHA="${REVIEWED_SHA}" \
  MENORAH_REVIEWED_UPDATER_BLOB_ID="${expected_blob}" \
  MENORAH_REVIEWED_UPDATER_LOCK_FD=9 \
  MENORAH_RELEASE_REPO_ROOT="${REPO_ROOT}" \
    exec /bin/bash "${staged_script}"
}

run_candidate_mongo_program() {
  local program_path="$1"
  local mode_variable="$2"
  local mode_value="$3"
  local extra_variable="${4:-}"
  local extra_value="${5:-}"
  local key
  local -a env_args=()

  for key in "${MONGO_MANAGED_ENV_KEYS[@]}"; do
    env_args+=(-e "${key}")
  done
  env_args+=(-e "${mode_variable}=${mode_value}")
  if [[ -n "${extra_variable}" ]]; then
    env_args+=(-e "${extra_variable}=${extra_value}")
  fi

  # Authenticate from environment variables inside mongosh. The candidate is
  # staged mode-0600 inside the database container and executed in --file mode
  # so script exceptions propagate nonzero without exposing credentials in argv.
  {
    printf '%s\n' \
      'db = connect("mongodb://mongo-primary:27017/admin?authSource=admin", process.env.MONGO_ROOT_USER, process.env.MONGO_ROOT_PASSWORD);'
    cat -- "${program_path}"
  } | compose_cmd exec -T "${env_args[@]}" mongo-primary sh -ceu '
    umask 077
    script_file="$(mktemp /tmp/menorah-managed-mongo.XXXXXXXX.js)"
    cleanup() { rm -f -- "${script_file}"; }
    trap cleanup EXIT
    chmod 0600 "${script_file}"
    cat > "${script_file}"
    mongosh --nodb --quiet --file "${script_file}"
  '
}

run_managed_mongo_bootstrap() {
  local mode="${1:-apply}"
  local scope="${2:-all}"

  case "${scope}" in
    all|backup-only) ;;
    *)
      echo "Unknown managed MongoDB bootstrap scope: ${scope}" >&2
      return 1
      ;;
  esac

  case "${mode}" in
    preflight)
      run_candidate_mongo_program \
        "${DEPLOY_DIR}/mongo/create-users.js" MONGO_BOOTSTRAP_DRY_RUN true \
        MONGO_BOOTSTRAP_SCOPE "${scope}"
      ;;
    apply)
      run_candidate_mongo_program \
        "${DEPLOY_DIR}/mongo/create-users.js" MONGO_BOOTSTRAP_DRY_RUN '' \
        MONGO_BOOTSTRAP_SCOPE "${scope}"
      ;;
    *)
      echo "Unknown managed MongoDB bootstrap mode: ${mode}" >&2
      return 1
      ;;
  esac
}

run_managed_mongo_reconciliation() {
  local mode="${1:-apply}"

  case "${mode}" in
    preflight)
      run_candidate_mongo_program \
        "${DEPLOY_DIR}/mongo/reconcile-managed-users.js" MONGO_RECONCILE_DRY_RUN true
      ;;
    apply)
      run_candidate_mongo_program \
        "${DEPLOY_DIR}/mongo/reconcile-managed-users.js" MONGO_RECONCILE_DRY_RUN ''
      ;;
    *)
      echo "Unknown managed MongoDB reconciliation mode: ${mode}" >&2
      return 1
      ;;
  esac
}

validate_loopback_port_values() {
  local key value port
  declare -A claimed_ports=()

  for key in "${LOOPBACK_PORT_KEYS[@]}"; do
    value="${!key:-}"
    [[ -n "${value}" ]] || continue
    if [[ ! "${value}" =~ ^127\.0\.0\.1:([0-9]{1,5})$ ]]; then
      echo "${key} must use the exact loopback form 127.0.0.1:PORT." >&2
      echo "Convert bare ports and legacy 0.0.0.0/host-wide bindings before release." >&2
      exit 1
    fi
    port="$((10#${BASH_REMATCH[1]}))"
    if (( port < 1 || port > 65535 )); then
      echo "${key} contains an invalid TCP port: ${value}" >&2
      exit 1
    fi
    if [[ -n "${claimed_ports[${port}]:-}" ]]; then
      echo "${key} and ${claimed_ports[${port}]} both claim loopback port ${port}." >&2
      exit 1
    fi
    claimed_ports[${port}]="${key}"
  done
  if [[ -n "${CADDY_HTTPS_PORT:-}" ]]; then
    echo "CADDY_HTTPS_PORT is retired because Cloudflare Tunnel reaches the loopback HTTP origin." >&2
    echo "Remove it from the production environment before release." >&2
    exit 1
  fi
}

validate_candidate_runtime_directories() {
  local data_root="${MENORAH_DATA_ROOT:-/opt/menorah/data}"
  local operator_gid expected_mode expected_uid path actual_mode actual_identity
  local resolved lexical
  operator_gid="$(id -g)"
  if [[ "${MENORAH_MEDIA_GROUP_ID:-}" != "${operator_gid}" ]]; then
    echo "MENORAH_MEDIA_GROUP_ID must equal the invoking release operator group ${operator_gid}." >&2
    exit 1
  fi

  while IFS='|' read -r expected_mode expected_uid path; do
    if [[ ! -d "${path}" || -L "${path}" ]]; then
      echo "Required candidate runtime directory is missing or symlinked: ${path}" >&2
      echo "Run the reviewed existing-host directory preparation action before release." >&2
      exit 1
    fi
    resolved="$(realpath -e -- "${path}")"
    lexical="$(realpath -ms -- "${path}")"
    actual_mode="$(stat -c '%a' "${path}")"
    actual_identity="$(stat -c '%u:%g' "${path}")"
    if [[ "${resolved}" != "${lexical}" \
      || "${actual_mode}" != "${expected_mode}" \
      || "${actual_identity}" != "${expected_uid}:${operator_gid}" ]]; then
      echo "Candidate runtime directory has unsafe ownership, mode, or path resolution: ${path}" >&2
      echo "Expected ${expected_uid}:${operator_gid} mode ${expected_mode}; correct it only in the documented change window." >&2
      exit 1
    fi
  done <<EOF
2770|100|${data_root}/uploads
770|65534|${data_root}/prometheus
770|65534|${data_root}/alertmanager
770|65534|${data_root}/monitoring-textfile
770|472|${data_root}/grafana
770|0|${data_root}/alloy
770|10001|${data_root}/loki
EOF
}

validate_existing_app_network() {
  local topology network_name project_name current_proxy_id existing_names

  topology="$(compose_cmd config --format json | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const config = JSON.parse(input);
      const expectedSubnet = process.argv[1];
      const expectedProxyIp = process.argv[2];
      const projectName = config.name;
      const network = config.networks?.app_net;
      const configuredIp = config.services?.["reverse-proxy"]?.networks?.app_net?.ipv4_address;
      const subnets = (network?.ipam?.config || []).map((entry) => entry.subnet).filter(Boolean);
      const parseIpv4 = (value) => {
        const parts = String(value).split(".");
        if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
        const octets = parts.map(Number);
        if (octets.some((part) => part < 0 || part > 255)) return null;
        return octets.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
      };
      const match = String(expectedSubnet).match(/^(.+)\/(\d{1,2})$/);
      if (!projectName || !network?.name || subnets.length !== 1
        || subnets[0] !== expectedSubnet || configuredIp !== expectedProxyIp || !match) process.exit(1);
      const prefix = Number(match[2]);
      const networkIp = parseIpv4(match[1]);
      const proxyIp = parseIpv4(expectedProxyIp);
      if (networkIp === null || proxyIp === null || prefix < 1 || prefix > 30) process.exit(1);
      const mask = (0xffffffff << (32 - prefix)) >>> 0;
      if ((networkIp & mask) !== networkIp || (proxyIp & mask) !== networkIp
        || proxyIp === networkIp || proxyIp === ((networkIp | (~mask >>> 0)) >>> 0)) process.exit(1);
      if (network.name !== `${projectName}_app_net` || !/^[a-z0-9][a-z0-9_.-]*$/i.test(network.name)) process.exit(1);
      process.stdout.write(`${projectName}\t${network.name}`);
    });
  ' "${APP_NETWORK_SUBNET}" "${CADDY_APP_IP}")" || {
    echo "Candidate app_net/CADDY_APP_IP topology is invalid or inconsistent." >&2
    exit 1
  }
  IFS=$'\t' read -r project_name network_name <<< "${topology}"

  existing_names="$(docker network ls --filter "name=^${network_name}$" --format '{{.Name}}')"
  if [[ -z "${existing_names}" ]]; then
    echo "No existing ${network_name}; the reviewed Compose topology will create it later."
    return 0
  fi
  if [[ "${existing_names}" != "${network_name}" ]]; then
    echo "Docker returned an ambiguous app network match for ${network_name}." >&2
    exit 1
  fi

  current_proxy_id="$(compose_cmd ps -q reverse-proxy)"
  docker network inspect "${network_name}" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const [network] = JSON.parse(input);
      const [expectedName, expectedProject, expectedSubnet, requestedIp, currentProxyId] = process.argv.slice(1);
      const labels = network?.Labels || {};
      const ipv4Subnets = (network?.IPAM?.Config || [])
        .map((entry) => entry.Subnet)
        .filter((subnet) => typeof subnet === "string" && subnet.includes("."));
      if (network?.Name !== expectedName
        || labels["com.docker.compose.project"] !== expectedProject
        || labels["com.docker.compose.network"] !== "app_net"
        || ipv4Subnets.length !== 1
        || ipv4Subnets[0] !== expectedSubnet) process.exit(1);
      for (const [containerId, endpoint] of Object.entries(network.Containers || {})) {
        const assignedIp = String(endpoint?.IPv4Address || "").split("/")[0];
        const isCurrentProxy = currentProxyId
          && (containerId.startsWith(currentProxyId) || currentProxyId.startsWith(containerId));
        if (assignedIp === requestedIp && !isCurrentProxy) process.exit(2);
      }
    });
  ' "${network_name}" "${project_name}" "${APP_NETWORK_SUBNET}" "${CADDY_APP_IP}" "${current_proxy_id}" || {
    echo "Existing Docker network ${network_name} is incompatible with APP_NETWORK_SUBNET/CADDY_APP_IP." >&2
    echo "Do not delete or recreate it automatically; follow the reviewed existing-host network transition." >&2
    exit 1
  }
}

verify_writers_stopped() {
  local service container_id running
  for service in "${WRITER_SERVICES[@]}"; do
    container_id="$(compose_cmd ps -q "${service}")"
    [[ -n "${container_id}" ]] || continue
    running="$(docker inspect --format '{{.State.Running}}' "${container_id}")"
    if [[ "${running}" == "true" ]]; then
      echo "Writer service remained running after the maintenance stop: ${service}" >&2
      return 1
    fi
  done
}

retire_legacy_compose_services() {
  local project_name service container_ids container_id inspected_labels
  project_name="$(compose_cmd config --format json | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const name = JSON.parse(input).name;
      if (!name || !/^[a-z0-9][a-z0-9_.-]*$/i.test(name)) process.exit(1);
      process.stdout.write(name);
    });
  ')"
  for service in "${RETIRED_COMPOSE_SERVICES[@]}"; do
    container_ids="$(docker ps -a \
      --filter "label=com.docker.compose.project=${project_name}" \
      --filter "label=com.docker.compose.service=${service}" \
      --filter "label=com.docker.compose.oneoff=False" \
      --format '{{.ID}}')"
    [[ -n "${container_ids}" ]] || continue
    while IFS= read -r container_id; do
      [[ "${container_id}" =~ ^[0-9a-f]{12,64}$ ]] || {
        echo "Refusing to retire an invalid legacy container identity." >&2
        return 1
      }
      inspected_labels="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}' "${container_id}")"
      [[ "${inspected_labels}" == "${project_name}|${service}|False" ]] || {
        echo "Refusing to retire a container whose Compose identity changed: ${container_id}" >&2
        return 1
      }
      docker stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${container_id}" >/dev/null
      docker rm "${container_id}" >/dev/null
      echo "Retired predecessor-only Compose service ${service} (${container_id})."
    done <<< "${container_ids}"
    if [[ -n "$(docker ps -a \
      --filter "label=com.docker.compose.project=${project_name}" \
      --filter "label=com.docker.compose.service=${service}" \
      --filter "label=com.docker.compose.oneoff=False" \
      --format '{{.ID}}')" ]]; then
      echo "A predecessor-only ${service} container remains after retirement." >&2
      return 1
    fi
  done
}

write_marker_atomically() {
  local target="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp "${STATE_DIR}/.marker.XXXXXX")"
  printf '%s\n' "${value}" > "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${target}"
}

read_valid_sha_marker() {
  local marker="$1" label="$2" value
  if [[ ! -f "${marker}" || -L "${marker}" || ! -s "${marker}" ]]; then
    echo "${label} marker is empty, non-regular, or symlinked: ${marker}" >&2
    return 1
  fi
  value="$(tr -d '\r\n' < "${marker}")"
  if [[ ! "${value}" =~ ^[0-9a-f]{40}$ ]] \
    || ! git -C "${REPO_ROOT}" cat-file -e "${value}^{commit}" 2>/dev/null; then
    echo "${label} marker is not a full local commit SHA: ${value}" >&2
    return 1
  fi
  printf '%s' "${value}"
}

write_release_metadata() {
  [[ -n "${RELEASE_METADATA}" ]] || return 0

  local temporary
  temporary="$(mktemp "${RELEASE_STATE_DIR}/.release-metadata.XXXXXX")"
  RELEASE_META_SCHEMA_VERSION="1" \
  RELEASE_META_SHA="${NEW_SHA}" \
  RELEASE_META_PREVIOUS_SHA="${PREVIOUS_SHA}" \
  RELEASE_META_TREE_SHA="${RELEASE_TREE_SHA}" \
  RELEASE_META_BRANCH="${BRANCH}" \
  RELEASE_META_REMOTE_SHA="${REMOTE_SHA}" \
  RELEASE_META_CHANGE_REFERENCE="${CHANGE_REFERENCE}" \
  RELEASE_META_STARTED_AT="${DEPLOY_STARTED_AT}" \
  RELEASE_META_UPDATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  RELEASE_META_PHASE="${DEPLOY_PHASE}" \
  RELEASE_META_MIGRATION_STATUS="${MIGRATION_STATUS}" \
  RELEASE_META_HEALTH_STATUS="${HEALTH_STATUS}" \
  RELEASE_META_BACKUP_METADATA="${FRESH_BACKUP_METADATA}" \
  RELEASE_META_BACKUP_ARCHIVE="${FRESH_ARCHIVE}" \
  RELEASE_META_BACKUP_SHA256="${FRESH_ARCHIVE_SHA256}" \
  RELEASE_META_MEDIA_MANIFEST="${MEDIA_MIGRATION_MANIFEST}" \
  RELEASE_META_MEDIA_MANIFEST_SHA256="${MEDIA_MIGRATION_MANIFEST_SHA256}" \
  RELEASE_META_IMAGE_MANIFEST="${IMAGE_MANIFEST}" \
  RELEASE_META_IMAGE_MANIFEST_SHA256="${IMAGE_MANIFEST_SHA256}" \
  RELEASE_META_DEPLOY_LOG="${LOG_FILE}" \
    node - <<'NODE' > "${temporary}"
const nullable = (value) => value || null;

const metadata = {
  schemaVersion: Number(process.env.RELEASE_META_SCHEMA_VERSION),
  releaseSha: process.env.RELEASE_META_SHA,
  previousSha: process.env.RELEASE_META_PREVIOUS_SHA,
  sourceTreeSha: process.env.RELEASE_META_TREE_SHA,
  reviewedBranch: process.env.RELEASE_META_BRANCH,
  remoteBranchTip: process.env.RELEASE_META_REMOTE_SHA,
  changeReference: process.env.RELEASE_META_CHANGE_REFERENCE,
  startedAt: process.env.RELEASE_META_STARTED_AT,
  updatedAt: process.env.RELEASE_META_UPDATED_AT,
  phase: process.env.RELEASE_META_PHASE,
  migrationStatus: process.env.RELEASE_META_MIGRATION_STATUS,
  healthStatus: process.env.RELEASE_META_HEALTH_STATUS,
  backup: {
    metadataPath: nullable(process.env.RELEASE_META_BACKUP_METADATA),
    archivePath: nullable(process.env.RELEASE_META_BACKUP_ARCHIVE),
    archiveSha256: nullable(process.env.RELEASE_META_BACKUP_SHA256),
  },
  mediaTransition: {
    manifestPath: nullable(process.env.RELEASE_META_MEDIA_MANIFEST),
    manifestSha256: nullable(process.env.RELEASE_META_MEDIA_MANIFEST_SHA256),
  },
  artifactIdentity: {
    manifestPath: nullable(process.env.RELEASE_META_IMAGE_MANIFEST),
    manifestSha256: nullable(process.env.RELEASE_META_IMAGE_MANIFEST_SHA256),
  },
  deploymentLogPath: process.env.RELEASE_META_DEPLOY_LOG,
};

process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
NODE
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${RELEASE_METADATA}"
}

capture_release_image_ids() {
  local reference_manifest image_manifest_temporary
  local service image_reference image_id

  reference_manifest="$(mktemp "${RELEASE_STATE_DIR}/.release-references.XXXXXX")"
  image_manifest_temporary="$(mktemp "${RELEASE_STATE_DIR}/.release-images.XXXXXX")"
  compose_cmd config --format json | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      const config = JSON.parse(input);
      const projectName = config.name;
      if (!projectName || !config.services) process.exit(1);

      for (const serviceName of process.argv.slice(1)) {
        const service = config.services[serviceName];
        if (!service) process.exit(1);
        const imageReference = service.image || `${projectName}-${serviceName}:latest`;
        process.stdout.write(`${serviceName}|${imageReference}\n`);
      }
    });
  ' "${RELEASE_SERVICES[@]}" > "${reference_manifest}"

  while IFS='|' read -r service image_reference; do
    [[ -n "${service}" && -n "${image_reference}" ]] || {
      echo "Could not resolve the built image reference for ${service:-unknown service}." >&2
      rm -f -- "${reference_manifest}" "${image_manifest_temporary}"
      return 1
    }
    image_id="$(docker image inspect --format '{{.Id}}' "${image_reference}")"
    if [[ ! "${image_id}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      echo "Image ${image_reference} for ${service} has no immutable content ID." >&2
      rm -f -- "${reference_manifest}" "${image_manifest_temporary}"
      return 1
    fi
    printf '%s|%s|%s\n' "${service}" "${image_reference}" "${image_id}" \
      >> "${image_manifest_temporary}"
  done < "${reference_manifest}"

  rm -f -- "${reference_manifest}"
  chmod 0600 "${image_manifest_temporary}"
  mv -f -- "${image_manifest_temporary}" "${IMAGE_MANIFEST}"
  IMAGE_MANIFEST_SHA256="$(sha256sum "${IMAGE_MANIFEST}" | awk '{print $1}')"
  write_marker_atomically \
    "${IMAGE_MANIFEST}.sha256" \
    "${IMAGE_MANIFEST_SHA256}  $(basename "${IMAGE_MANIFEST}")"
}

verify_running_artifact_manifest() {
  local manifest="$1"
  local service image_reference expected_image_id extra container_id running_image_id
  local record_count=0

  while IFS='|' read -r service image_reference expected_image_id extra; do
    if [[ ! "${service}" =~ ^[a-z0-9][a-z0-9-]*$ \
      || -z "${image_reference}" \
      || "${image_reference}" =~ [[:space:]\|] \
      || ! "${expected_image_id}" =~ ^sha256:[0-9a-f]{64}$ \
      || -n "${extra:-}" ]]; then
      echo "Recorded running-artifact manifest contains an invalid record." >&2
      return 1
    fi
    container_id="$(compose_cmd ps -q "${service}")"
    if [[ -z "${container_id}" ]]; then
      echo "Recorded predecessor service is not running: ${service}" >&2
      return 1
    fi
    running_image_id="$(docker inspect --format '{{if .State.Running}}{{.Image}}{{end}}' "${container_id}")"
    if [[ "${running_image_id}" != "${expected_image_id}" ]]; then
      echo "Running predecessor artifact drifted from recorded evidence: ${service}" >&2
      return 1
    fi
    docker image inspect "${expected_image_id}" >/dev/null
    record_count=$((record_count + 1))
  done < "${manifest}"

  (( record_count > 0 )) || {
    echo "Recorded running-artifact manifest is empty." >&2
    return 1
  }
}

ensure_predecessor_artifact_baseline() {
  local predecessor_manifest="${RELEASE_STATE_DIR}/${PREVIOUS_SHA}.images"
  local predecessor_checksum="${predecessor_manifest}.sha256"
  local predecessor_metadata="${RELEASE_STATE_DIR}/${PREVIOUS_SHA}.json"
  local reference_manifest image_manifest_temporary metadata_temporary
  local service image_reference image_id container_id running_image_id
  local manifest_sha256

  if [[ -e "${predecessor_manifest}" || -L "${predecessor_manifest}" \
    || -e "${predecessor_checksum}" || -L "${predecessor_checksum}" \
    || -e "${predecessor_metadata}" || -L "${predecessor_metadata}" ]]; then
    if [[ ! -f "${predecessor_manifest}" || -L "${predecessor_manifest}" || ! -s "${predecessor_manifest}" \
      || ! -f "${predecessor_checksum}" || -L "${predecessor_checksum}" || ! -s "${predecessor_checksum}" \
      || ! -f "${predecessor_metadata}" || -L "${predecessor_metadata}" || ! -s "${predecessor_metadata}" \
      || ! -r "${predecessor_manifest}" || ! -r "${predecessor_checksum}" || ! -r "${predecessor_metadata}" ]]; then
      echo "Predecessor release evidence is partial; refusing to overwrite it." >&2
      return 1
    fi
    (
      cd "${RELEASE_STATE_DIR}"
      sha256sum -c "$(basename "${predecessor_checksum}")"
    )
    manifest_sha256="$(sha256sum "${predecessor_manifest}" | awk '{print $1}')"
    RELEASE_METADATA_PATH="${predecessor_metadata}" \
    EXPECTED_RELEASE_SHA="${PREVIOUS_SHA}" \
    EXPECTED_MANIFEST="${predecessor_manifest}" \
    EXPECTED_MANIFEST_SHA256="${manifest_sha256}" \
      node -e '
        const fs = require("fs");
        const metadata = JSON.parse(fs.readFileSync(process.env.RELEASE_METADATA_PATH, "utf8"));
        if (metadata.releaseSha !== process.env.EXPECTED_RELEASE_SHA
          || metadata.healthStatus !== "passed"
          || metadata.artifactIdentity?.manifestPath !== process.env.EXPECTED_MANIFEST
          || metadata.artifactIdentity?.manifestSha256 !== process.env.EXPECTED_MANIFEST_SHA256) process.exit(1);
      '
    verify_running_artifact_manifest "${predecessor_manifest}"
    if ! CHECK_PUBLIC=false "${SCRIPT_DIR}/health-check.sh" \
      || ! CHECK_PUBLIC=true "${SCRIPT_DIR}/health-check.sh"; then
      echo "The recorded predecessor artifact is not currently healthy." >&2
      return 1
    fi
    echo "Verified existing predecessor artifact evidence for ${PREVIOUS_SHA}."
    return 0
  fi

  echo "No predecessor artifact record exists; capturing the still-running healthy release before candidate builds."
  if ! CHECK_PUBLIC=false "${SCRIPT_DIR}/health-check.sh" \
    || ! CHECK_PUBLIC=true "${SCRIPT_DIR}/health-check.sh"; then
    echo "The running predecessor did not pass local and public health; no baseline was recorded." >&2
    return 1
  fi

  reference_manifest="$(mktemp "${RELEASE_STATE_DIR}/.predecessor-references.XXXXXX")"
  image_manifest_temporary="$(mktemp "${RELEASE_STATE_DIR}/.predecessor-images.XXXXXX")"
  metadata_temporary="$(mktemp "${RELEASE_STATE_DIR}/.predecessor-metadata.XXXXXX")"
  compose_cmd config --format json | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const config = JSON.parse(input);
      if (!config.name || !config.services) process.exit(1);
      for (const serviceName of process.argv.slice(1)) {
        const service = config.services[serviceName];
        if (!service) process.exit(1);
        process.stdout.write(`${serviceName}|${service.image || `${config.name}-${serviceName}:latest`}\n`);
      }
    });
  ' "${PREDECESSOR_BASELINE_SERVICES[@]}" > "${reference_manifest}"

  while IFS='|' read -r service image_reference; do
    if [[ ! "${service}" =~ ^[a-z0-9][a-z0-9-]*$ \
      || -z "${image_reference}" \
      || "${image_reference}" =~ [[:space:]\|] ]]; then
      echo "Could not resolve a safe predecessor image reference." >&2
      rm -f -- "${reference_manifest}" "${image_manifest_temporary}" "${metadata_temporary}"
      return 1
    fi
    container_id="$(compose_cmd ps -q "${service}")"
    if [[ -z "${container_id}" ]]; then
      echo "Required predecessor service is not running: ${service}" >&2
      rm -f -- "${reference_manifest}" "${image_manifest_temporary}" "${metadata_temporary}"
      return 1
    fi
    running_image_id="$(docker inspect --format '{{if .State.Running}}{{.Image}}{{end}}' "${container_id}")"
    image_id="$(docker image inspect --format '{{.Id}}' "${image_reference}")"
    if [[ ! "${image_id}" =~ ^sha256:[0-9a-f]{64}$ || "${running_image_id}" != "${image_id}" ]]; then
      echo "Running predecessor artifact does not match its image reference: ${service}" >&2
      rm -f -- "${reference_manifest}" "${image_manifest_temporary}" "${metadata_temporary}"
      return 1
    fi
    printf '%s|%s|%s\n' "${service}" "${image_reference}" "${image_id}" \
      >> "${image_manifest_temporary}"
  done < "${reference_manifest}"
  rm -f -- "${reference_manifest}"

  chmod 0600 "${image_manifest_temporary}"
  mv -f -- "${image_manifest_temporary}" "${predecessor_manifest}"
  manifest_sha256="$(sha256sum "${predecessor_manifest}" | awk '{print $1}')"
  write_marker_atomically \
    "${predecessor_checksum}" \
    "${manifest_sha256}  $(basename "${predecessor_manifest}")"
  PREDECESSOR_META_SHA="${PREVIOUS_SHA}" \
  PREDECESSOR_META_MANIFEST="${predecessor_manifest}" \
  PREDECESSOR_META_MANIFEST_SHA="${manifest_sha256}" \
  PREDECESSOR_META_CAPTURED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  PREDECESSOR_META_CHANGE_REFERENCE="${CHANGE_REFERENCE}" \
    node - <<'NODE' > "${metadata_temporary}"
const metadata = {
  schemaVersion: 1,
  releaseSha: process.env.PREDECESSOR_META_SHA,
  phase: 'adopted-running-predecessor-baseline',
  healthStatus: 'passed',
  evidenceType: 'running-container-artifact-baseline',
  capturedAt: process.env.PREDECESSOR_META_CAPTURED_AT,
  changeReference: process.env.PREDECESSOR_META_CHANGE_REFERENCE,
  artifactIdentity: {
    manifestPath: process.env.PREDECESSOR_META_MANIFEST,
    manifestSha256: process.env.PREDECESSOR_META_MANIFEST_SHA,
  },
};
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
NODE
  chmod 0600 "${metadata_temporary}"
  mv -f -- "${metadata_temporary}" "${predecessor_metadata}"
  echo "Recorded predecessor artifact baseline for guarded first-adoption recovery: ${PREVIOUS_SHA}"
}

verify_running_release_image_ids() {
  local service image_reference expected_image_id container_id container_state

  (
    cd "$(dirname "${IMAGE_MANIFEST}")"
    sha256sum -c "$(basename "${IMAGE_MANIFEST}.sha256")"
  )

  while IFS='|' read -r service image_reference expected_image_id; do
    container_id="$(compose_cmd ps -q "${service}")"
    if [[ -z "${container_id}" ]]; then
      echo "Release service ${service} has no running container." >&2
      return 1
    fi
    container_state="$(docker inspect --format '{{.State.Running}}|{{.Image}}' "${container_id}")"
    if [[ "${container_state}" != "true|${expected_image_id}" ]]; then
      echo "Release service ${service} is not running the recorded image ${expected_image_id}." >&2
      echo "Actual running state/image: ${container_state}; resolved reference: ${image_reference}" >&2
      return 1
    fi
  done < "${IMAGE_MANIFEST}"
}

record_failed_release() {
  local status="$1"
  if [[ "${status}" -ne 0 && -n "${RELEASE_METADATA}" && "${DEPLOY_SUCCEEDED}" != "true" ]]; then
    DEPLOY_PHASE="${DEPLOY_PHASE}-failed"
    write_release_metadata || true
  fi
}

handle_exit() {
  local status="$1"

  if [[ "${status}" -ne 0 \
    && "${DEPLOY_SUCCEEDED}" != "true" \
    && "${MAINTENANCE_STARTED}" == "true" \
    && -n "${NEW_SHA}" \
    && -s "${MIGRATION_MARKER}" \
    && "$(tr -d '\r\n' < "${MIGRATION_MARKER}")" == "${NEW_SHA}" ]]; then
    DEPLOY_PHASE="${DEPLOY_PHASE}-post-migration-recovery"
    HEALTH_STATUS="failed"
    write_marker_atomically "${POST_MIGRATION_RECOVERY_MARKER}" "${NEW_SHA}" || true
    echo "Post-migration failure: stopping every application writer and preserving recovery state." >&2
    if ! compose_cmd stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${WRITER_SERVICES[@]}"; then
      echo "WARNING: at least one writer could not be stopped; isolate traffic and escalate immediately." >&2
    elif ! verify_writers_stopped; then
      echo "WARNING: at least one writer still appears active; isolate traffic and escalate immediately." >&2
    fi
  fi
  record_failed_release "${status}"
  if [[ "${status}" -ne 0 \
    && "${SOURCE_CHECKOUT_CHANGED}" == "true" \
    && "${MAINTENANCE_STARTED}" != "true" \
    && -n "${PREVIOUS_SHA}" ]]; then
    if git -C "${REPO_ROOT}" checkout --detach "${PREVIOUS_SHA}" >/dev/null 2>&1; then
      echo "Pre-maintenance failure: restored checkout to ${PREVIOUS_SHA}." >&2
      echo "sourceCheckout=RESTORED sha=${PREVIOUS_SHA}" >> "${LOG_FILE}" 2>/dev/null || true
    else
      echo "WARNING: pre-maintenance failure could not restore checkout to ${PREVIOUS_SHA}." >&2
      echo "Resolve the checkout/current-sha discrepancy before retrying." >&2
    fi
  fi

}

validate_monitoring_release_config() {
  local alertmanager_path="${ALERTMANAGER_CONFIG_FILE:-}"
  local alertmanager_config_sha="${ALERTMANAGER_CONFIG_SHA256:-}"
  local alertmanager_receiver="${ALERTMANAGER_DELIVERY_RECEIVER:-}"
  local alertmanager_test_reference="${ALERTMANAGER_DELIVERY_TEST_REFERENCE:-}"
  local monitoring_uri_lower="${MONGODB_MONITORING_URI:-}"
  local monitoring_username
  local expected_backup_metrics_identity
  monitoring_uri_lower="${monitoring_uri_lower,,}"
  expected_backup_metrics_identity="$(id -u):$(id -g)"

  if [[ "${BACKUP_METRICS_RUN_AS:-}" != "${expected_backup_metrics_identity}" ]]; then
    echo "BACKUP_METRICS_RUN_AS must equal the invoking non-root operator identity ${expected_backup_metrics_identity}." >&2
    exit 1
  fi
  if [[ "${BACKUP_METRICS_RUN_AS%%:*}" == "0" ]]; then
    echo "BACKUP_METRICS_RUN_AS must not run as root." >&2
    exit 1
  fi

  if [[ -z "${MONGODB_MONITORING_URI:-}" \
    || "${monitoring_uri_lower}" == *replace* \
    || "${monitoring_uri_lower}" == *placeholder* \
    || "${monitoring_uri_lower}" == *example* \
    || ( "${MONGODB_MONITORING_URI}" != mongodb://* \
      && "${MONGODB_MONITORING_URI}" != mongodb+srv://* ) ]]; then
    echo "MONGODB_MONITORING_URI must be a non-placeholder MongoDB URI for a dedicated monitoring identity." >&2
    exit 1
  fi
  for privileged_uri in \
    "${MONGODB_URI:-}" \
    "${MONGODB_BACKUP_URI:-}" \
    "${MONGODB_PRODUCTION_RESTORE_URI:-}" \
    "${MONGODB_RESTORE_TEST_URI:-}"; do
    if [[ -n "${privileged_uri}" && "${MONGODB_MONITORING_URI}" == "${privileged_uri}" ]]; then
      echo "MONGODB_MONITORING_URI must not reuse an application, backup, or restore-test identity." >&2
      exit 1
    fi
  done

  monitoring_username="$(MONGODB_URI_TO_PARSE="${MONGODB_MONITORING_URI}" node -e '
    try {
      const parsed = new URL(process.env.MONGODB_URI_TO_PARSE);
      const username = decodeURIComponent(parsed.username || "");
      if (!username || /replace|placeholder|example/i.test(username)) process.exit(1);
      process.stdout.write(username);
    } catch {
      process.exit(1);
    }
  ')" || {
    echo "MONGODB_MONITORING_URI must contain a valid non-placeholder username." >&2
    exit 1
  }
  if [[ "${monitoring_username}" != "${MONGO_MONITOR_USER:-}" ]]; then
    echo "MONGODB_MONITORING_URI username must exactly match MONGO_MONITOR_USER." >&2
    exit 1
  fi
  for privileged_username in \
    "${MONGO_ROOT_USER:-}" \
    "${MONGO_APP_USER:-}" \
    "${MONGO_BACKUP_USER:-}" \
    "${MONGO_RESTORE_USER:-}"; do
    if [[ -n "${privileged_username}" && "${monitoring_username}" == "${privileged_username}" ]]; then
      echo "The MongoDB monitoring username must be distinct from every privileged identity." >&2
      exit 1
    fi
  done

  if [[ -z "${alertmanager_path}" || "${alertmanager_path}" != /* ]]; then
    echo "ALERTMANAGER_CONFIG_FILE must name an absolute operator-controlled notification config." >&2
    exit 1
  fi
  if [[ ! -r "${alertmanager_path}" ]]; then
    echo "ALERTMANAGER_CONFIG_FILE is missing or unreadable." >&2
    exit 1
  fi
  case "${alertmanager_path}" in
    "${REPO_ROOT}"/*)
      echo "ALERTMANAGER_CONFIG_FILE must remain outside the repository." >&2
      exit 1
      ;;
  esac
  if grep -Fq 'unconfigured-destination' "${alertmanager_path}"; then
    echo "ALERTMANAGER_CONFIG_FILE still uses the non-delivering source-control placeholder." >&2
    exit 1
  fi

  if [[ ! "${alertmanager_config_sha}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ALERTMANAGER_CONFIG_SHA256 must be the lowercase SHA-256 of the tested delivery config." >&2
    exit 1
  fi
  if [[ "$(sha256sum "${alertmanager_path}" | awk '{print $1}')" != "${alertmanager_config_sha}" ]]; then
    echo "ALERTMANAGER_CONFIG_SHA256 does not match ALERTMANAGER_CONFIG_FILE." >&2
    exit 1
  fi
  if [[ ! "${alertmanager_receiver}" =~ ^[A-Za-z0-9_.-]{1,100}$ ]]; then
    echo "ALERTMANAGER_DELIVERY_RECEIVER must name the tested root receiver." >&2
    exit 1
  fi
  if (( ${#alertmanager_test_reference} < 8 || ${#alertmanager_test_reference} > 200 )) \
    || [[ "${alertmanager_test_reference}" == *$'\n'* \
      || "${alertmanager_test_reference}" == *$'\r'* \
      || "${alertmanager_test_reference,,}" == *replace* \
      || "${alertmanager_test_reference,,}" == *placeholder* ]]; then
    echo "ALERTMANAGER_DELIVERY_TEST_REFERENCE must identify acknowledged delivery evidence." >&2
    exit 1
  fi

  node "${DEPLOY_DIR}/monitoring/validate-alertmanager-delivery.mjs"
}

validate_mongodb_monitoring_identity() {
  compose_cmd run --rm --no-deps \
    -e MONGODB_MONITORING_URI \
    mongo-replica-init mongosh --nodb --quiet --eval '
        db = connect(process.env.MONGODB_MONITORING_URI);
        const ping = db.adminCommand({ ping: 1 });
        const replica = db.adminCommand({ replSetGetStatus: 1 });
        const local = db.getSiblingDB("local").runCommand({ listCollections: 1, nameOnly: true });
        const connection = db.adminCommand({ connectionStatus: 1, showPrivileges: false });
        const actualRoles = (connection.authInfo?.authenticatedUserRoles || [])
          .map(({ role, db: roleDb }) => role + "@" + roleDb)
          .sort();
        const approvedRoles = ["clusterMonitor@admin", "read@local"].sort();
        const exactApprovedRoles = actualRoles.length === approvedRoles.length
          && actualRoles.every((role, index) => role === approvedRoles[index]);
        if (ping.ok !== 1 || replica.ok !== 1 || local.ok !== 1 || !exactApprovedRoles) quit(1);
      ' >/dev/null
}

validate_native_monitoring_config() {
  compose_cmd run --rm --no-deps --entrypoint /bin/promtool prometheus \
    check config /etc/prometheus/prometheus.yml
  compose_cmd run --rm --no-deps --workdir /etc/prometheus \
    --entrypoint /bin/promtool prometheus \
    test rules alert-rules.test.yml
  compose_cmd run --rm --no-deps blackbox-exporter \
    --config.file=/etc/blackbox_exporter/blackbox.yml --config.check
  compose_cmd run --rm --no-deps log-collector \
    validate /etc/alloy/config.alloy
  compose_cmd run --rm --no-deps --entrypoint /usr/bin/loki loki \
    -config.file=/etc/loki/config.yml -verify-config
}

validate_backup_schedule() {
  local expected_workdir="${REPO_ROOT}/menorah"
  local expected_user
  expected_user="$(id -un)"
  if [[ "${BACKUP_AUTOMATION_ENABLED:-}" != "true" ]]; then
    echo "BACKUP_AUTOMATION_ENABLED must be exactly true for a production release." >&2
    exit 1
  fi
  for timer in \
    menorah-backup-six-hourly.timer \
    menorah-backup-daily.timer \
    menorah-backup-weekly.timer \
    menorah-backup-monthly.timer \
    menorah-restore-test.timer \
    menorah-backup-prune.timer \
    menorah-backup-health.timer; do
    if ! systemctl is-enabled --quiet "${timer}" \
      || ! systemctl is-active --quiet "${timer}"; then
      echo "Required backup timer is not enabled and active: ${timer}" >&2
      exit 1
    fi
  done

  validate_backup_unit_contract() {
    local unit="$1"
    local script_path="$2"
    local required_argument="${3:-}"
    local unit_user unit_workdir unit_environment unit_exec
    unit_user="$(systemctl show --property=User --value "${unit}")"
    unit_workdir="$(systemctl show --property=WorkingDirectory --value "${unit}")"
    unit_environment="$(systemctl show --property=Environment --value "${unit}")"
    unit_exec="$(systemctl show --property=ExecStart --value "${unit}")"
    if [[ "${unit_user}" != "${expected_user}" \
      || "${unit_workdir}" != "${expected_workdir}" \
      || "${unit_environment}" != *"PRODUCTION_ENV=${ENV_FILE}"* \
      || "${unit_exec}" != *"/bin/bash ${expected_workdir}/${script_path}"* \
      || ( -n "${required_argument}" && "${unit_exec}" != *" ${required_argument}"* ) ]]; then
      echo "Installed systemd unit is stale or does not match this reviewed checkout/operator: ${unit}" >&2
      exit 1
    fi
  }

  validate_backup_unit_contract menorah-backup@daily.service deploy/ubuntu/backup-now.sh daily
  validate_backup_unit_contract menorah-restore-test.service deploy/ubuntu/restore-latest-backup.sh restore-test
  validate_backup_unit_contract menorah-backup-prune.service deploy/ubuntu/prune-backups.sh
  validate_backup_unit_contract menorah-backup-health.service deploy/ubuntu/check-backup-health.sh
}

validate_operator_file() {
  local variable_name="$1"
  local value="${!variable_name:-}"
  local mode
  local resolved

  if [[ -z "${value}" || "${value}" != /* ]]; then
    echo "${variable_name} must name an absolute operator-controlled file." >&2
    exit 1
  fi
  if [[ ! -s "${value}" || ! -r "${value}" ]]; then
    echo "${variable_name} is missing, empty, or unreadable." >&2
    exit 1
  fi
  if [[ -L "${value}" ]]; then
    echo "${variable_name} must not be a symbolic link." >&2
    exit 1
  fi
  resolved="$(readlink -f -- "${value}")"
  case "${resolved}" in
    "${REPO_ROOT}"/*)
      echo "${variable_name} must remain outside the repository." >&2
      exit 1
      ;;
  esac
  mode="$(stat -c '%a' "${value}")"
  if [[ ! "${mode}" =~ ^[0-7]{3,4}$ ]]; then
    echo "${variable_name} permissions could not be validated." >&2
    exit 1
  fi
  if (( (8#${mode} & 8#007) != 0 )); then
    echo "${variable_name} must not grant any permissions to other users." >&2
    exit 1
  fi
}

require_operator_file_owner() {
  local variable_name="$1"
  local expected_uid="$2"
  local value="${!variable_name}"
  local actual_uid
  actual_uid="$(stat -c '%u' "${value}")"
  if [[ "${actual_uid}" != "${expected_uid}" ]]; then
    echo "${variable_name} must be owned by uid ${expected_uid}, the pinned container user." >&2
    exit 1
  fi
}

validate_backend_startup_config() {
  local service

  for service in api-ios api-android api-web api-admin; do
    compose_cmd run --rm --no-deps "${service}" node -e '
      const { validateStartupEnv } = require("./src/shared/app/startupValidation");
      validateStartupEnv({ serviceName: process.argv[1] });
    ' "${service}"
  done
  compose_cmd run --rm --no-deps worker node -e '
    const { validateStartupEnv } = require("./src/shared/app/startupValidation");
    validateStartupEnv({ serviceName: "worker", requirePaymentEnv: false });
  '
}

wait_for_health() {
  local check_public="${1:-false}"
  local attempts="${DEPLOY_HEALTH_ATTEMPTS:-18}"
  local delay_seconds="${DEPLOY_HEALTH_DELAY_SECONDS:-5}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if CHECK_PUBLIC="${check_public}" "${SCRIPT_DIR}/health-check.sh"; then
      return 0
    fi

    if (( attempt < attempts )); then
      echo "Health check attempt ${attempt}/${attempts} failed; retrying in ${delay_seconds}s." >&2
      sleep "${delay_seconds}"
    fi
  done

  return 1
}

trap 'status=$?; trap - EXIT; handle_exit "${status}"; exit "${status}"' EXIT

for required_command in awk cat docker flock git grep node readlink sha256sum stat systemctl; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "Required release command is unavailable: ${required_command}" >&2
    exit 1
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  echo "The Docker Compose plugin is required for production releases." >&2
  exit 1
fi
if [[ ! -d "${REPO_ROOT}/.git" \
  || "$(git -C "${REPO_ROOT}" rev-parse --show-toplevel 2>/dev/null)" != "${REPO_ROOT}" \
  || ! -x "${SCRIPT_DIR}/backup-now.sh" \
  || ! -x "${SCRIPT_DIR}/restore-latest-backup.sh" \
  || ! -x "${SCRIPT_DIR}/health-check.sh" \
  || ! -r "${SCRIPT_DIR}/run-recorded-migration.sh" ]]; then
  echo "MENORAH_RELEASE_REPO_ROOT does not resolve to a complete Menorah checkout." >&2
  exit 1
fi

mkdir -p "${STATE_DIR}" "${RELEASE_STATE_DIR}"
if [[ "${MENORAH_REVIEWED_UPDATER_LOCK_FD:-}" == "9" ]]; then
  if ! { : >&9; } 2>/dev/null; then
    echo "Reviewed-updater handoff did not preserve the deployment lock descriptor." >&2
    exit 1
  fi
else
  exec 9>"${LOCK_FILE}"
fi
if ! flock -n 9; then
  echo "Another deployment is already running: ${LOCK_FILE}" >&2
  exit 1
fi

if ! git check-ref-format "refs/heads/${BRANCH}" >/dev/null 2>&1; then
  echo "DEPLOY_BRANCH is not a valid branch name: ${BRANCH}" >&2
  exit 1
fi
if [[ ! "${REVIEWED_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "DEPLOY_RELEASE_SHA must be a full 40-character commit SHA." >&2
  exit 1
fi
REVIEWED_SHA="${REVIEWED_SHA,,}"
MIGRATION_APPROVED_SHA="${MIGRATION_APPROVED_SHA,,}"
if [[ "${MIGRATION_APPROVED_SHA}" != "${REVIEWED_SHA}" ]]; then
  echo "DEPLOY_MIGRATION_APPROVED_SHA must exactly match DEPLOY_RELEASE_SHA." >&2
  exit 1
fi
if (( ${#CHANGE_REFERENCE} > 200 )) \
  || [[ "${CHANGE_REFERENCE}" == *$'\n'* || "${CHANGE_REFERENCE}" == *$'\r'* ]] \
  || [[ ! "${CHANGE_REFERENCE}" =~ [[:alnum:]] ]]; then
  echo "DEPLOY_CHANGE_REFERENCE must be a single line of at most 200 characters with an alphanumeric identifier." >&2
  exit 1
fi

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Production environment file is missing or unreadable: ${ENV_FILE}" >&2
  exit 1
fi
if [[ ! -r "${CLOUDFLARE_ENV}" ]]; then
  echo "Cloudflare environment file is missing or unreadable: ${CLOUDFLARE_ENV}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
# shellcheck disable=SC1090
. "${CLOUDFLARE_ENV}"
set +a

if [[ -n "${MONGO_ROTATE_CREDENTIALS_CONFIRM:-}" ]]; then
  echo "Routine releases must leave MONGO_ROTATE_CREDENTIALS_CONFIRM unset." >&2
  echo "Use the separately approved, writer-quiesced MongoDB credential-rotation procedure." >&2
  exit 1
fi
if [[ -n "${MONGO_RECONCILE_DRY_RUN:-}" ]]; then
  echo "Routine releases must leave MONGO_RECONCILE_DRY_RUN unset." >&2
  echo "The updater controls its read-only preflight and maintenance reconciliation modes." >&2
  exit 1
fi
if [[ -n "${MONGO_BOOTSTRAP_DRY_RUN:-}" ]]; then
  echo "Routine releases must leave MONGO_BOOTSTRAP_DRY_RUN unset." >&2
  echo "The updater controls its read-only bootstrap preflight and maintenance provisioning modes." >&2
  exit 1
fi
if [[ -n "${MONGO_BOOTSTRAP_SCOPE:-}" ]]; then
  echo "Routine releases must leave MONGO_BOOTSTRAP_SCOPE unset." >&2
  echo "The updater controls the atomic backup-identity and full managed-identity scopes." >&2
  exit 1
fi
validate_loopback_port_values
validate_candidate_runtime_directories

require_min_length() {
  local name="$1"
  local minimum="$2"
  local value="${!name:-}"
  if (( ${#value} < minimum )) || [[ "${value}" =~ ^REPLACE ]]; then
    echo "${name} must be configured with at least ${minimum} non-placeholder characters before deployment." >&2
    exit 1
  fi
}

require_min_length DATA_ENCRYPTION_KEY 32
require_min_length AUDIT_LOG_SIGNING_KEY 32
require_min_length BACKUP_ENCRYPTION_PASSWORD 32
require_min_length BACKUP_INTEGRITY_HMAC_KEY 32
if [[ "${APPLE_SIGN_IN_ENABLED:-}" != "true" \
  || "${APPLE_IOS_BUNDLE_ID:-}" != "com.menorah.health.app" \
  || ! "${APPLE_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ \
  || ! "${APPLE_KEY_ID:-}" =~ ^[A-Z0-9]{10}$ \
  || "${APPLE_PRIVATE_KEY:-}" != *"BEGIN PRIVATE KEY"* ]]; then
  echo "Sign in with Apple server credentials are incomplete or invalid." >&2
  exit 1
fi
if [[ "${PASSWORD_RESET_BASE_URL:-}" != "https://app.menorah.me" \
  || -n "${PASSWORD_RESET_URL_TEMPLATE:-}" ]]; then
  echo "Production password reset links must use https://app.menorah.me with no legacy template." >&2
  exit 1
fi
if [[ "${MEDIA_STORAGE_BACKEND:-}" != "local" \
  || "${MEDIA_PUBLIC_BASE_URL:-}" != "https://${API_WEB_DOMAIN:-api-web.menorah.me}" \
  || "${UPLOAD_PATH:-}" != "/app/uploads" \
  || -n "${SOCIAL_STUDIO_STORAGE:-}" \
  || -n "${COUNSELLOR_MEDIA_STORAGE:-}" ]]; then
  echo "Production media must use the shared immutable local store at the canonical API web origin." >&2
  exit 1
fi
validate_operator_file ALERTMANAGER_CONFIG_FILE
require_operator_file_owner ALERTMANAGER_CONFIG_FILE 65534
validate_operator_file LIVEKIT_CONFIG_FILE
validate_operator_file MONGO_KEYFILE_PATH
validate_operator_file CLOUDFLARE_TUNNEL_TOKEN_FILE
require_operator_file_owner CLOUDFLARE_TUNNEL_TOKEN_FILE 65532
BOOKING_CATALOG_LOWER="${BOOKING_SERVICE_CATALOG_JSON:-}"
BOOKING_CATALOG_LOWER="${BOOKING_CATALOG_LOWER,,}"
if [[ -z "${BOOKING_SERVICE_CATALOG_JSON:-}" || "${BOOKING_CATALOG_LOWER}" == replace* ]]; then
  echo "BOOKING_SERVICE_CATALOG_JSON must contain the owner-approved server pricing catalog." >&2
  exit 1
fi

if [[ -e "${STATE_DIR}/bootstrap-in-progress-sha" || -L "${STATE_DIR}/bootstrap-in-progress-sha" ]]; then
  echo "The empty-host bootstrap did not complete cleanly." >&2
  echo "Keep public services stopped and complete the bootstrap recovery review before deploying." >&2
  exit 1
fi
if [[ -e "${MIGRATION_IN_PROGRESS_MARKER}" || -L "${MIGRATION_IN_PROGRESS_MARKER}" ]]; then
  echo "A previous migration may be partially applied: ${MIGRATION_IN_PROGRESS_MARKER}" >&2
  echo "Keep application writers stopped and complete the coordinated recovery review before deploying again." >&2
  exit 1
fi
if [[ -e "${MONGO_IDENTITY_RECONCILIATION_MARKER}" || -L "${MONGO_IDENTITY_RECONCILIATION_MARKER}" ]]; then
  echo "A previous managed MongoDB identity reconciliation may be incomplete: ${MONGO_IDENTITY_RECONCILIATION_MARKER}" >&2
  echo "Keep application writers stopped and complete the documented identity recovery review." >&2
  exit 1
fi
if [[ -e "${POST_MIGRATION_RECOVERY_MARKER}" || -L "${POST_MIGRATION_RECOVERY_MARKER}" ]]; then
  echo "A post-migration release failure requires guarded resume or coordinated database recovery: ${POST_MIGRATION_RECOVERY_MARKER}" >&2
  echo "Do not run another routine release while this marker exists." >&2
  exit 1
fi
if [[ -e "${ROLLBACK_IN_PROGRESS_MARKER}" || -L "${ROLLBACK_IN_PROGRESS_MARKER}" ]]; then
  echo "An interrupted rollback must be completed before another release: ${ROLLBACK_IN_PROGRESS_MARKER}" >&2
  exit 1
fi
for restore_marker in \
  "${STATE_DIR}/production-restore-in-progress.json" \
  "${STATE_DIR}/production-restore-requires-review.json"; do
  if [[ -e "${restore_marker}" || -L "${restore_marker}" ]]; then
    echo "Production restore recovery state blocks deployment: ${restore_marker}" >&2
    echo "Keep writers stopped and complete the documented schema/migration review." >&2
    exit 1
  fi
done
if [[ "${DATA_ENCRYPTION_KEY}" == "${AUDIT_LOG_SIGNING_KEY}" ]]; then
  echo "DATA_ENCRYPTION_KEY and AUDIT_LOG_SIGNING_KEY must be distinct." >&2
  exit 1
fi
if [[ "${MAX_PAYOUT_AMOUNT_PAISE:-}" != "5000000" ]]; then
  echo "MAX_PAYOUT_AMOUNT_PAISE must equal the approved INR 50,000 per-transaction limit (5000000 paise)." >&2
  exit 1
fi
if [[ "${KYC_CONSENT_VERSION:-}" != "ordinary-face-check-v1-2026-07-22" ]]; then
  echo "KYC_CONSENT_VERSION must equal ordinary-face-check-v1-2026-07-22." >&2
  exit 1
fi
if [[ "${KYC_RETENTION_DAYS:-}" != "365" ]]; then
  echo "KYC_RETENTION_DAYS must equal the approved 365-day face-check retention period." >&2
  exit 1
fi

if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "Working tree has local changes. Commit or remove them before updating." >&2
  git -C "${REPO_ROOT}" status --short
  exit 1
fi

PREVIOUS_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
RECORDED_CURRENT_SHA=""
if [[ -e "${CURRENT_SHA_FILE}" || -L "${CURRENT_SHA_FILE}" ]]; then
  RECORDED_CURRENT_SHA="$(read_valid_sha_marker "${CURRENT_SHA_FILE}" "Recovery metadata current-sha")" \
    || exit 1
fi
if [[ -n "${RECORDED_CURRENT_SHA}" && "${RECORDED_CURRENT_SHA}" != "${PREVIOUS_SHA}" ]]; then
  echo "Recovery metadata current-sha does not match the checked-out commit." >&2
  echo "Resolve the host state discrepancy before starting another release." >&2
  exit 1
fi
RECORDED_MIGRATION_SHA=""
if [[ -e "${MIGRATION_MARKER}" || -L "${MIGRATION_MARKER}" ]]; then
  RECORDED_MIGRATION_SHA="$(read_valid_sha_marker "${MIGRATION_MARKER}" "Applied migration")" \
    || exit 1
  if [[ "${RECORDED_MIGRATION_SHA}" != "${PREVIOUS_SHA}" ]]; then
    echo "Applied migration marker does not match the checked-out recorded release." >&2
    echo "Keep writers stopped and complete a coordinated schema-state review." >&2
    exit 1
  fi
fi
RECORDED_BOOTSTRAP_SHA=""
if [[ -e "${BOOTSTRAP_COMPLETE_MARKER}" || -L "${BOOTSTRAP_COMPLETE_MARKER}" ]]; then
  RECORDED_BOOTSTRAP_SHA="$(read_valid_sha_marker "${BOOTSTRAP_COMPLETE_MARKER}" "Bootstrap completion")" \
    || exit 1
fi
if [[ "${BACKUP_INTEGRITY_HMAC_KEY}" == "${BACKUP_ENCRYPTION_PASSWORD}" \
  || "${BACKUP_INTEGRITY_HMAC_KEY}" == "${DATA_ENCRYPTION_KEY}" \
  || "${BACKUP_INTEGRITY_HMAC_KEY}" == "${AUDIT_LOG_SIGNING_KEY}" ]]; then
  echo "BACKUP_INTEGRITY_HMAC_KEY must be distinct from encryption and audit keys." >&2
  exit 1
fi
echo "Previous commit: ${PREVIOUS_SHA}"

git -C "${REPO_ROOT}" fetch --prune origin \
  "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"
REMOTE_SHA="$(git -C "${REPO_ROOT}" rev-parse "refs/remotes/origin/${BRANCH}")"
if [[ "${REMOTE_SHA}" != "${REVIEWED_SHA}" ]]; then
  echo "Reviewed SHA ${REVIEWED_SHA} is not the current origin/${BRANCH} tip ${REMOTE_SHA}." >&2
  echo "Review the new branch tip and invoke the release again with its exact SHA." >&2
  exit 1
fi
if [[ "${REVIEWED_SHA}" == "${PREVIOUS_SHA}" ]]; then
  if [[ "${RECORDED_BOOTSTRAP_SHA}" == "${REVIEWED_SHA}" \
    && -z "${RECORDED_MIGRATION_SHA}" ]]; then
    if [[ -e "${RELEASE_STATE_DIR}/${REVIEWED_SHA}.json" ]] \
      && ! BOOTSTRAP_RETRY_METADATA="${RELEASE_STATE_DIR}/${REVIEWED_SHA}.json" \
        BOOTSTRAP_RETRY_SHA="${REVIEWED_SHA}" node -e '
          const fs = require("fs");
          const metadata = JSON.parse(fs.readFileSync(process.env.BOOTSTRAP_RETRY_METADATA, "utf8"));
          if (metadata.releaseSha !== process.env.BOOTSTRAP_RETRY_SHA
            || metadata.healthStatus === "passed"
            || metadata.phase === "complete") process.exit(1);
        '; then
      echo "Bootstrap follow-on evidence is not a verified incomplete attempt." >&2
      exit 1
    fi
    BOOTSTRAP_ONLY_RELEASE=true
    echo "Continuing or retrying the explicit data-only bootstrap as its first guarded release."
  else
    echo "The reviewed SHA is already the checked-out recorded release: ${REVIEWED_SHA}" >&2
    echo "Same-SHA release replay is refused so healthy evidence cannot be overwritten." >&2
    exit 1
  fi
elif [[ -n "${RECORDED_BOOTSTRAP_SHA}" ]]; then
  echo "The data-only bootstrap must be completed with its same reviewed SHA before a later release." >&2
  exit 1
fi
if ! git -C "${REPO_ROOT}" cat-file -e "${REVIEWED_SHA}^{commit}" 2>/dev/null; then
  echo "Reviewed SHA is not an available commit: ${REVIEWED_SHA}" >&2
  exit 1
fi
if ! git -C "${REPO_ROOT}" merge-base --is-ancestor "${PREVIOUS_SHA}" "${REVIEWED_SHA}"; then
  echo "Reviewed SHA is not a fast-forward descendant of the deployed commit ${PREVIOUS_SHA}." >&2
  echo "Use the separately guarded rollback/recovery procedure for a backward or rewritten release." >&2
  exit 1
fi

ensure_reviewed_updater_execution
if [[ "${BOOTSTRAP_ONLY_RELEASE}" != "true" ]]; then
  ensure_predecessor_artifact_baseline
  if [[ ! -e "${CURRENT_SHA_FILE}" ]]; then
    write_marker_atomically "${CURRENT_SHA_FILE}" "${PREVIOUS_SHA}"
    echo "Adopted the verified running predecessor as current-sha for guarded recovery."
  fi
fi

git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"
SOURCE_CHECKOUT_CHANGED=true
NEW_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
RELEASE_TREE_SHA="$(git -C "${REPO_ROOT}" rev-parse 'HEAD^{tree}')"
if [[ "${NEW_SHA}" != "${REVIEWED_SHA}" ]] || [[ "${NEW_SHA}" != "${REMOTE_SHA}" ]]; then
  echo "Checked-out release does not exactly match the reviewed remote commit." >&2
  exit 1
fi

# The first guarded-tooling adoption executes this reviewed script while the
# host checkout still contains the previous release. Run validators that are
# shipped with the candidate only after its exact SHA is checked out.
echo "Validating the candidate monitoring identity and delivery evidence..."
validate_monitoring_release_config
echo "Validating existing app_net compatibility before any candidate container is created..."
validate_existing_app_network
echo "Checking existing managed MongoDB identities, roles, and configured credentials without writes..."
run_managed_mongo_bootstrap preflight all
echo "Ensuring the atomic backup identity exists before the mandatory backup..."
run_managed_mongo_bootstrap apply backup-only
run_managed_mongo_bootstrap preflight backup-only

RELEASE_METADATA="${RELEASE_STATE_DIR}/${NEW_SHA}.json"
IMAGE_MANIFEST="${RELEASE_STATE_DIR}/${NEW_SHA}.images"
DEPLOY_PHASE="source-verified"
{
  echo "deployTime=${DEPLOY_STARTED_AT}"
  echo "changeReference=${CHANGE_REFERENCE}"
  echo "branch=${BRANCH}"
  echo "previous=${PREVIOUS_SHA}"
  echo "new=${NEW_SHA}"
} >> "${LOG_FILE}"
write_release_metadata

echo "Validating the host-owned backup and restore-test schedules..."
validate_backup_schedule
echo "Stopping and removing any retired continuous backup-runner container..."
compose_cmd --profile backup-job stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" backup-runner
compose_cmd --profile backup-job rm -f backup-runner
echo "Resolving the digest-pinned backup job image..."
compose_cmd pull --policy always backup-runner
echo "Creating a fresh pre-migration backup..."
BACKUP_DEPLOYED_RELEASE_SHA="${PREVIOUS_SHA}" "${SCRIPT_DIR}/backup-now.sh" manual
FRESH_BACKUP_METADATA="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}/metadata/latest-success-manual.json"
FRESH_ARCHIVE="$(node -e '
  const fs = require("fs");
  const metadata = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!metadata.mongoArchive || typeof metadata.mongoArchive !== "string") process.exit(1);
  process.stdout.write(metadata.mongoArchive);
' "${FRESH_BACKUP_METADATA}")"
if [[ -z "${FRESH_ARCHIVE}" || ! -f "${FRESH_ARCHIVE}" ]]; then
  echo "Fresh backup metadata does not identify a readable MongoDB archive." >&2
  exit 1
fi

echo "Restoring the fresh backup into the isolated restore-test database..."
RESTORE_ARCHIVE="${FRESH_ARCHIVE}" "${SCRIPT_DIR}/restore-latest-backup.sh" restore-test
node -e '
  const fs = require("fs");
  const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (marker.archive !== process.argv[2]) process.exit(1);
' "${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}/restore-tests/latest-success.json" "${FRESH_ARCHIVE}"
BACKUP_TYPE=manual BACKUP_MAX_AGE_HOURS=1 CHECK_RESTORE_TEST=true \
  "${SCRIPT_DIR}/check-backup-health.sh"
if [[ ! -r "${FRESH_ARCHIVE}.sha256" ]]; then
  echo "Fresh backup checksum is missing: ${FRESH_ARCHIVE}.sha256" >&2
  exit 1
fi
FRESH_ARCHIVE_SHA256="$(awk 'NR == 1 { print $1 }' "${FRESH_ARCHIVE}.sha256")"
if [[ ! "${FRESH_ARCHIVE_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Fresh backup checksum is not a SHA-256 digest." >&2
  exit 1
fi
DEPLOY_PHASE="backup-restore-verified"
write_release_metadata

echo "Validating Compose configuration..."
compose_cmd config --quiet

echo "Building release images before maintenance begins..."
compose_cmd build "${BUILD_SERVICES[@]}"
echo "Pulling digest-pinned release support images before maintenance begins..."
compose_cmd pull --policy always "${PINNED_RELEASE_SERVICES[@]}"
echo "Validating Caddy configuration in a networkless one-shot container..."
compose_cmd --profile validation run -T --rm --no-deps caddy-config-validator \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
echo "Running native Prometheus and blackbox semantic validation before maintenance..."
validate_native_monitoring_config
echo "Proving the non-root backup metrics writer can publish an atomic textfile..."
compose_cmd run --rm --no-deps --entrypoint /bin/sh backup-metrics -c \
  'test -r /backups/metadata/latest-success-manual.json && test -w /textfile && /bin/sh /scripts/export-backup-metrics.sh && test -s /textfile/menorah-backup.prom && grep -Fq '\''menorah_backup_metadata_present{backup_type="manual"} 1'\'' /textfile/menorah-backup.prom'
echo "Validating backend startup configuration in the reviewed release image..."
validate_backend_startup_config
echo "Validating the operator-controlled Alertmanager delivery configuration..."
compose_cmd run --rm --no-deps --entrypoint /bin/amtool alertmanager \
  check-config /etc/alertmanager/alertmanager.yml
capture_release_image_ids
DEPLOY_PHASE="artifacts-recorded"
write_release_metadata

echo "Stopping API and worker services for the migration maintenance boundary..."
MAINTENANCE_STARTED=true
compose_cmd stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${WRITER_SERVICES[@]}"
verify_writers_stopped
DEPLOY_PHASE="writers-stopped"
write_release_metadata

echo "Consolidating legacy per-service media into the shared namespace without deleting predecessor copies..."
MEDIA_MIGRATION_MANIFEST="${RELEASE_STATE_DIR}/${NEW_SHA}.media-transition.manifest"
MENORAH_MEDIA_MIGRATION_CONFIRM=CONSOLIDATE_LEGACY_MEDIA_WITH_WRITERS_STOPPED \
MENORAH_MEDIA_MIGRATION_RELEASE_SHA="${NEW_SHA}" \
MENORAH_MEDIA_MIGRATION_EVIDENCE="${MEDIA_MIGRATION_MANIFEST}" \
  bash "${SCRIPT_DIR}/consolidate-legacy-media.sh"
(
  cd "${RELEASE_STATE_DIR}"
  sha256sum -c "$(basename "${MEDIA_MIGRATION_MANIFEST}.sha256")"
)
MEDIA_MIGRATION_MANIFEST_SHA256="$(sha256sum "${MEDIA_MIGRATION_MANIFEST}" | awk '{print $1}')"
DEPLOY_PHASE="media-transition-verified"
write_release_metadata

echo "Provisioning missing managed MongoDB identities and reconciling exact least-privilege roles..."
write_marker_atomically "${MONGO_IDENTITY_RECONCILIATION_MARKER}" "${NEW_SHA}"
run_managed_mongo_bootstrap apply
run_managed_mongo_reconciliation apply
echo "Validating the dedicated MongoDB monitoring identity read-only..."
validate_mongodb_monitoring_identity
rm -f -- "${MONGO_IDENTITY_RECONCILIATION_MARKER}"

if [[ -n "${RECORDED_MIGRATION_SHA}" && "${RECORDED_MIGRATION_SHA}" == "${NEW_SHA}" ]]; then
  echo "Migration was already applied once for ${NEW_SHA}; refusing to run it again."
  write_marker_atomically "${POST_MIGRATION_RECOVERY_MARKER}" "${NEW_SHA}"
  MIGRATION_STATUS="already-applied"
  echo "migration=SKIP_ALREADY_APPLIED sha=${NEW_SHA}" >> "${LOG_FILE}"
else
  echo "Running the explicitly approved backend migration once with the new release image..."
  write_marker_atomically "${MIGRATION_IN_PROGRESS_MARKER}" "${NEW_SHA}"
  MIGRATION_STATUS="running"
  DEPLOY_PHASE="migration-running"
  write_release_metadata
  echo "migration=START sha=${NEW_SHA}" >> "${LOG_FILE}"
  if ! run_backend_migrations; then
    MIGRATION_STATUS="failed"
    DEPLOY_PHASE="migration"
    write_release_metadata
    echo "Migration failed. API and worker services remain stopped for operator review." >&2
    echo "migration=FAIL sha=${NEW_SHA}" >> "${LOG_FILE}"
    exit 1
  fi
  # Establish durable resume authority before committing the applied marker or
  # clearing the partial-migration guard. A reboot after this boundary can
  # always resume the exact recorded candidate artifacts.
  write_marker_atomically "${POST_MIGRATION_RECOVERY_MARKER}" "${NEW_SHA}"
  write_marker_atomically "${MIGRATION_MARKER}" "${NEW_SHA}"
  rm -f -- "${MIGRATION_IN_PROGRESS_MARKER}"
  MIGRATION_STATUS="applied"
  echo "migration=PASS sha=${NEW_SHA}" >> "${LOG_FILE}"
fi
DEPLOY_PHASE="migration-complete"
write_release_metadata

echo "Starting the reviewed release without rebuilding..."
if ! compose_cmd up -d --force-recreate --no-build --pull never --no-deps "${RELEASE_SERVICES[@]}"; then
  DEPLOY_PHASE="release-startup"
  echo "Release startup failed after migration. Automatic code-only rollback is disabled; operator review is required." >&2
  echo "startup=FAIL sha=${NEW_SHA}" >> "${LOG_FILE}"
  exit 1
fi
if ! verify_running_release_image_ids; then
  DEPLOY_PHASE="artifact-verification"
  echo "Running release artifact identity does not match the recorded content IDs." >&2
  echo "artifactIdentity=FAIL sha=${NEW_SHA}" >> "${LOG_FILE}"
  exit 1
fi
echo "artifactIdentity=PASS sha=${NEW_SHA} manifestSha256=${IMAGE_MANIFEST_SHA256}" >> "${LOG_FILE}"
DEPLOY_PHASE="release-started"
write_release_metadata

if ! compose_cmd exec -T reverse-proxy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
  DEPLOY_PHASE="caddy-reload"
  echo "Caddy reload failed after migration. Automatic code-only rollback is disabled." >&2
  echo "caddyReload=FAIL sha=${NEW_SHA}" >> "${LOG_FILE}"
  exit 1
fi

if wait_for_health false && wait_for_health true; then
  echo "Health result: PASS"
  echo "health=PASS" >> "${LOG_FILE}"
  HEALTH_STATUS="passed"
else
  DEPLOY_PHASE="health-check"
  HEALTH_STATUS="failed"
  echo "Health result: FAIL after migration. Automatic code-only rollback is disabled; operator review is required." >&2
  echo "health=FAIL" >> "${LOG_FILE}"
  exit 1
fi

echo "Retiring label-verified predecessor-only Promtail and cAdvisor containers..."
retire_legacy_compose_services

DEPLOY_PHASE="complete"
write_release_metadata
write_marker_atomically "${LAST_GOOD_SHA_FILE}" "${PREVIOUS_SHA}"
write_marker_atomically "${CURRENT_SHA_FILE}" "${NEW_SHA}"
DEPLOY_SUCCEEDED=true
trap - EXIT
rm -f -- "${BOOTSTRAP_COMPLETE_MARKER}"
if ! rm -f -- "${POST_MIGRATION_RECOVERY_MARKER}"; then
  echo "Release passed and durable state was committed, but the recovery marker could not be cleared." >&2
  echo "Rerun the guarded post-migration resume to finalize marker cleanup." >&2
  exit 1
fi
echo "Update complete: ${NEW_SHA}"
