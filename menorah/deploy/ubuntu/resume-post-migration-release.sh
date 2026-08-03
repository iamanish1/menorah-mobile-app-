#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
RELEASE_STATE_DIR="${STATE_DIR}/releases"
LOCK_FILE="${STATE_DIR}/.deploy.lock"
RECOVERY_MARKER="${STATE_DIR}/post-migration-recovery-sha"
MIGRATION_MARKER="${STATE_DIR}/migration-applied-sha"
MIGRATION_IN_PROGRESS_MARKER="${STATE_DIR}/migration-in-progress-sha"
IDENTITY_MARKER="${STATE_DIR}/mongo-identity-reconciliation-in-progress-sha"
CURRENT_SHA_FILE="${STATE_DIR}/current-sha"
LAST_GOOD_SHA_FILE="${STATE_DIR}/last-good-sha"
BOOTSTRAP_COMPLETE_MARKER="${STATE_DIR}/bootstrap-complete-sha"
ROLLBACK_IN_PROGRESS_MARKER="${STATE_DIR}/rollback-in-progress-sha"
RESTORE_IN_PROGRESS_MARKER="${STATE_DIR}/production-restore-in-progress.json"
RESTORE_REVIEW_MARKER="${STATE_DIR}/production-restore-requires-review.json"
WRITER_SERVICES=(api-ios api-android api-web api-admin worker)
EXPECTED_RELEASE_SERVICES=(
  app-link-associations landing-page user-web-app web-app admin-panel api-ios api-android api-web api-admin worker
  reverse-proxy livekit cloudflared prometheus alertmanager blackbox-exporter
  mongodb-exporter redis-exporter node-exporter backup-metrics grafana uptime-kuma
  docker-metrics-gateway docker-stats-exporter log-collector loki
)
RETIRED_COMPOSE_SERVICES=(cadvisor promtail)
LOOPBACK_PORT_KEYS=(
  CADDY_HTTP_PORT LANDING_LOCAL_PORT USER_WEB_APP_LOCAL_PORT WEB_APP_LOCAL_PORT
  ADMIN_PANEL_LOCAL_PORT API_IOS_LOCAL_PORT API_ANDROID_LOCAL_PORT
  API_WEB_LOCAL_PORT API_ADMIN_LOCAL_PORT WORKER_LOCAL_PORT
  GRAFANA_LOCAL_PORT UPTIME_KUMA_LOCAL_PORT ALERTMANAGER_LOCAL_PORT
)

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

write_marker() {
  local target="$1" value="$2" temporary
  temporary="$(mktemp "${STATE_DIR}/.recovery-marker.XXXXXX")"
  printf '%s\n' "${value}" > "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${target}"
}

read_valid_sha_marker() {
  local marker="$1" label="$2" value
  if [[ ! -f "${marker}" || -L "${marker}" || ! -s "${marker}" ]]; then
    echo "${label} marker is missing, empty, non-regular, or symlinked: ${marker}" >&2
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

stop_writers() {
  compose_cmd stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${WRITER_SERVICES[@]}"
}

retire_legacy_compose_services() {
  local project_name service container_ids container_id labels
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
      [[ "${container_id}" =~ ^[0-9a-f]{12,64}$ ]] || return 1
      labels="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}' "${container_id}")"
      [[ "${labels}" == "${project_name}|${service}|False" ]] || return 1
      docker stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${container_id}" >/dev/null
      docker rm "${container_id}" >/dev/null
    done <<< "${container_ids}"
    [[ -z "$(docker ps -a \
      --filter "label=com.docker.compose.project=${project_name}" \
      --filter "label=com.docker.compose.service=${service}" \
      --filter "label=com.docker.compose.oneoff=False" \
      --format '{{.ID}}')" ]] || return 1
  done
}

recovery_succeeded=false
on_exit() {
  local status="$1"
  if [[ "${status}" -ne 0 && "${recovery_succeeded}" != "true" ]]; then
    echo "Post-migration resume failed; stopping writers and retaining ${RECOVERY_MARKER}." >&2
    stop_writers || echo "WARNING: writer stop failed; isolate traffic immediately." >&2
  fi
}

[[ "${MENORAH_POST_MIGRATION_RECOVERY_CONFIRM:-}" == "RESUME_RECORDED_RELEASE" ]] || {
  echo "Set MENORAH_POST_MIGRATION_RECOVERY_CONFIRM=RESUME_RECORDED_RELEASE only after the recovery review." >&2
  exit 1
}
for required_command in awk docker flock git node sha256sum; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "Required recovery command is unavailable: ${required_command}" >&2
    exit 1
  }
done
[[ -r "${ENV_FILE}" && -r "${CLOUDFLARE_ENV}" ]] || {
  echo "Production or Cloudflare environment file is unreadable." >&2
  exit 1
}

mkdir -p "${STATE_DIR}" "${RELEASE_STATE_DIR}"
exec 9>"${LOCK_FILE}"
flock -n 9 || {
  echo "Another deployment, rollback, restore, or recovery is running." >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
# shellcheck disable=SC1090
. "${CLOUDFLARE_ENV}"
set +a

for key in "${LOOPBACK_PORT_KEYS[@]}"; do
  value="${!key:-}"
  [[ -z "${value}" || "${value}" =~ ^127\.0\.0\.1:([0-9]{1,5})$ ]] || {
    echo "${key} must use the exact loopback form 127.0.0.1:PORT." >&2
    exit 1
  }
  if [[ -n "${value}" ]]; then
    port="$((10#${BASH_REMATCH[1]}))"
    (( port >= 1 && port <= 65535 )) || {
      echo "${key} contains an invalid TCP port." >&2
      exit 1
    }
  fi
done
[[ -z "${CADDY_HTTPS_PORT:-}" ]] || {
  echo "CADDY_HTTPS_PORT is retired and must remain unset." >&2
  exit 1
}

RECOVERY_SHA="$(read_valid_sha_marker "${RECOVERY_MARKER}" "Post-migration recovery")" \
  || exit 1
MIGRATED_SHA="$(read_valid_sha_marker "${MIGRATION_MARKER}" "Applied migration")" \
  || exit 1
RECORDED_CURRENT_SHA="$(read_valid_sha_marker "${CURRENT_SHA_FILE}" "Recorded current release")" \
  || exit 1
RECORDED_BOOTSTRAP_SHA=""
if [[ -e "${BOOTSTRAP_COMPLETE_MARKER}" || -L "${BOOTSTRAP_COMPLETE_MARKER}" ]]; then
  RECORDED_BOOTSTRAP_SHA="$(read_valid_sha_marker "${BOOTSTRAP_COMPLETE_MARKER}" "Bootstrap completion")" \
    || exit 1
fi
for blocking_marker in \
  "${IDENTITY_MARKER}" \
  "${ROLLBACK_IN_PROGRESS_MARKER}" \
  "${RESTORE_IN_PROGRESS_MARKER}" \
  "${RESTORE_REVIEW_MARKER}"; do
  if [[ -e "${blocking_marker}" || -L "${blocking_marker}" ]]; then
    echo "An identity reconciliation, rollback, or restore review marker blocks resume: ${blocking_marker}" >&2
    exit 1
  fi
done
MIGRATION_IN_PROGRESS_PRESENT=false
if [[ -e "${MIGRATION_IN_PROGRESS_MARKER}" || -L "${MIGRATION_IN_PROGRESS_MARKER}" ]]; then
  IN_PROGRESS_SHA="$(read_valid_sha_marker "${MIGRATION_IN_PROGRESS_MARKER}" "Migration in progress")" \
    || exit 1
  if [[ "${RECOVERY_SHA}" != "${MIGRATED_SHA}" \
    || "${IN_PROGRESS_SHA}" != "${RECOVERY_SHA}" ]]; then
    echo "Migration-in-progress state is not the same proven-applied recovery SHA." >&2
    exit 1
  fi
  MIGRATION_IN_PROGRESS_PRESENT=true
  echo "Resuming a proven-applied release interrupted before its in-progress marker was cleared."
fi

CURRENT_HEAD="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
[[ "${RECOVERY_SHA}" =~ ^[0-9a-f]{40}$ \
  && "${MIGRATED_SHA}" == "${RECOVERY_SHA}" \
  && "${CURRENT_HEAD}" == "${RECOVERY_SHA}" \
  && "${RECORDED_CURRENT_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Recovery, migration, checkout, and recorded-current SHA state is inconsistent." >&2
  exit 1
}
if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "Post-migration recovery requires a clean tracked working tree." >&2
  git -C "${REPO_ROOT}" status --short
  exit 1
fi
expected_script_blob="$(git -C "${REPO_ROOT}" rev-parse "${RECOVERY_SHA}:menorah/deploy/ubuntu/resume-post-migration-release.sh")"
actual_script_blob="$(git -C "${REPO_ROOT}" hash-object "${BASH_SOURCE[0]}")"
[[ "${actual_script_blob}" == "${expected_script_blob}" ]] || {
  echo "Recovery must run the script from the exact failed candidate checkout." >&2
  exit 1
}

IMAGE_MANIFEST="${RELEASE_STATE_DIR}/${RECOVERY_SHA}.images"
IMAGE_CHECKSUM="${IMAGE_MANIFEST}.sha256"
MEDIA_MANIFEST="${RELEASE_STATE_DIR}/${RECOVERY_SHA}.media-transition.manifest"
MEDIA_CHECKSUM="${MEDIA_MANIFEST}.sha256"
RELEASE_METADATA="${RELEASE_STATE_DIR}/${RECOVERY_SHA}.json"
[[ -f "${IMAGE_MANIFEST}" && ! -L "${IMAGE_MANIFEST}" \
  && -f "${IMAGE_CHECKSUM}" && ! -L "${IMAGE_CHECKSUM}" \
  && -f "${MEDIA_MANIFEST}" && ! -L "${MEDIA_MANIFEST}" \
  && -f "${MEDIA_CHECKSUM}" && ! -L "${MEDIA_CHECKSUM}" \
  && -f "${RELEASE_METADATA}" && ! -L "${RELEASE_METADATA}" \
  && -r "${IMAGE_MANIFEST}" && -r "${IMAGE_CHECKSUM}" \
  && -r "${MEDIA_MANIFEST}" && -r "${MEDIA_CHECKSUM}" \
  && -r "${RELEASE_METADATA}" ]] || {
  echo "Recorded failed-release artifact or media-transition evidence is incomplete." >&2
  exit 1
}
(
  cd "${RELEASE_STATE_DIR}"
  sha256sum -c "$(basename "${IMAGE_CHECKSUM}")"
)
MANIFEST_SHA256="$(sha256sum "${IMAGE_MANIFEST}" | awk '{print $1}')"
(
  cd "${RELEASE_STATE_DIR}"
  sha256sum -c "$(basename "${MEDIA_CHECKSUM}")"
)
MEDIA_MANIFEST_SHA256="$(sha256sum "${MEDIA_MANIFEST}" | awk '{print $1}')"
MEDIA_MANIFEST_PATH="${MEDIA_MANIFEST}" EXPECTED_RELEASE_SHA="${RECOVERY_SHA}" node -e '
  const fs = require("fs");
  const lines = fs.readFileSync(process.env.MEDIA_MANIFEST_PATH, "utf8")
    .replace(/\n$/, "")
    .split("\n");
  if (lines[0] !== "schema=1"
    || lines[1] !== `releaseSha=${process.env.EXPECTED_RELEASE_SHA}`
    || lines[2] !== "legacyCopiesRetained=true"
    || !/^uniqueObjects=\d+$/.test(lines[3] || "")
    || lines[4] !== "sha256|bytes|relativePath") process.exit(1);
  const expectedCount = Number(lines[3].split("=")[1]);
  const records = lines.slice(5);
  if (!Number.isSafeInteger(expectedCount) || expectedCount !== records.length) process.exit(1);
  const paths = new Set();
  for (const record of records) {
    const match = record.match(/^([0-9a-f]{64})\|(\d+)\|(.+)$/);
    if (!match || !Number.isSafeInteger(Number(match[2]))) process.exit(1);
    const relativePath = match[3];
    const components = relativePath.split("/");
    if (relativePath.startsWith("/") || components.some((part) => !part || part === "." || part === "..")
      || paths.has(relativePath)) process.exit(1);
    paths.add(relativePath);
  }
'
metadata_state="$(RELEASE_METADATA_PATH="${RELEASE_METADATA}" \
EXPECTED_RELEASE_SHA="${RECOVERY_SHA}" \
EXPECTED_MANIFEST="${IMAGE_MANIFEST}" \
EXPECTED_MANIFEST_SHA256="${MANIFEST_SHA256}" \
EXPECTED_MEDIA_MANIFEST="${MEDIA_MANIFEST}" \
EXPECTED_MEDIA_MANIFEST_SHA256="${MEDIA_MANIFEST_SHA256}" \
  node -e '
    const fs = require("fs");
    const metadata = JSON.parse(fs.readFileSync(process.env.RELEASE_METADATA_PATH, "utf8"));
    if (metadata.releaseSha !== process.env.EXPECTED_RELEASE_SHA
      || !/^[0-9a-f]{40}$/.test(metadata.previousSha || "")
      || !/^[0-9a-f]{40}$/.test(metadata.sourceTreeSha || "")
      || !(
        (metadata.healthStatus === "failed"
          && ["applied", "already-applied"].includes(metadata.migrationStatus)
          && /post-migration-recovery-failed$/.test(metadata.phase || ""))
        || (metadata.healthStatus === "passed"
          && ["applied", "already-applied"].includes(metadata.migrationStatus)
          && ["complete", "recovered-complete"].includes(metadata.phase))
        || (metadata.healthStatus === "pending"
          && (
            (metadata.phase === "migration-running" && metadata.migrationStatus === "running")
            || (["migration-complete", "release-started"].includes(metadata.phase)
              && ["applied", "already-applied"].includes(metadata.migrationStatus))
          ))
      )
      || metadata.artifactIdentity?.manifestPath !== process.env.EXPECTED_MANIFEST
      || metadata.artifactIdentity?.manifestSha256 !== process.env.EXPECTED_MANIFEST_SHA256
      || metadata.mediaTransition?.manifestPath !== process.env.EXPECTED_MEDIA_MANIFEST
      || metadata.mediaTransition?.manifestSha256 !== process.env.EXPECTED_MEDIA_MANIFEST_SHA256) process.exit(1);
    process.stdout.write([
      metadata.previousSha,
      metadata.sourceTreeSha,
      metadata.healthStatus,
    ].join("\t"));
  ')" || {
    echo "Recorded failed-release metadata is not eligible for post-migration resume." >&2
    exit 1
  }
IFS=$'\t' read -r PREVIOUS_HEALTHY_SHA RECORDED_TREE_SHA RECORDED_HEALTH_STATUS \
  <<< "${metadata_state}"
[[ "$(git -C "${REPO_ROOT}" rev-parse 'HEAD^{tree}')" == "${RECORDED_TREE_SHA}" ]] || {
  echo "Recovery checkout tree does not match the recorded candidate source tree." >&2
  exit 1
}
BOOTSTRAP_RECOVERY=false
if [[ "${PREVIOUS_HEALTHY_SHA}" == "${RECOVERY_SHA}" ]]; then
  if [[ "${RECORDED_CURRENT_SHA}" != "${RECOVERY_SHA}" ]] \
    || { [[ "${RECORDED_HEALTH_STATUS}" != "passed" ]] \
      && [[ "${RECORDED_BOOTSTRAP_SHA}" != "${RECOVERY_SHA}" ]]; }; then
    echo "Same-SHA recovery is allowed only for the unfinished data-only bootstrap." >&2
    exit 1
  fi
  BOOTSTRAP_RECOVERY=true
elif [[ "${RECORDED_CURRENT_SHA}" != "${PREVIOUS_HEALTHY_SHA}" \
  && "${RECORDED_CURRENT_SHA}" != "${RECOVERY_SHA}" ]]; then
  echo "Recorded current release is neither the previous healthy SHA nor the idempotent recovery SHA." >&2
  exit 1
fi

declare -a RELEASE_SERVICES=()
declare -A MANIFEST_SERVICES=()
while IFS='|' read -r service image_reference image_id extra; do
  [[ "${service}" =~ ^[a-z0-9][a-z0-9-]*$ \
    && -n "${image_reference}" \
    && ! "${image_reference}" =~ [[:space:]\|] \
    && "${image_id}" =~ ^sha256:[0-9a-f]{64}$ \
    && -z "${extra:-}" ]] || {
    echo "Recovery image manifest contains an invalid record." >&2
    exit 1
  }
  [[ -z "${MANIFEST_SERVICES["${service}"]:-}" ]] || {
    echo "Recovery image manifest contains a duplicate service." >&2
    exit 1
  }
  MANIFEST_SERVICES["${service}"]=true
  docker image inspect "${image_id}" >/dev/null
  RELEASE_SERVICES+=("${service}")
done < "${IMAGE_MANIFEST}"
(( ${#RELEASE_SERVICES[@]} > 0 )) || {
  echo "Recovery image manifest contains no services." >&2
  exit 1
}
[[ "${#RELEASE_SERVICES[@]}" -eq "${#EXPECTED_RELEASE_SERVICES[@]}" ]] || {
  echo "Recovery manifest service count does not match the reviewed release set." >&2
  exit 1
}
for service in "${EXPECTED_RELEASE_SERVICES[@]}"; do
  [[ "${MANIFEST_SERVICES["${service}"]:-}" == "true" ]] || {
    echo "Recovery manifest is missing a required release service: ${service}" >&2
    exit 1
  }
done

# All authority, state, source, and artifact checks are complete. From this
# point onward any failure must stop writers and retain the recovery marker.
trap 'status=$?; trap - EXIT; on_exit "${status}"; exit "${status}"' EXIT
while IFS='|' read -r _ image_reference image_id; do
  if [[ "${image_reference}" == *@sha256:* ]]; then
    [[ "$(docker image inspect --format '{{.Id}}' "${image_reference}")" == "${image_id}" ]] || {
      echo "A digest-pinned recovery reference no longer resolves to its recorded image." >&2
      exit 1
    }
  else
    docker image tag "${image_id}" "${image_reference}"
  fi
done < "${IMAGE_MANIFEST}"

compose_cmd config --quiet
compose_cmd --profile validation run -T --rm --no-deps caddy-config-validator \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose_cmd up -d --force-recreate --no-build --pull never --no-deps "${RELEASE_SERVICES[@]}"

while IFS='|' read -r service _ expected_image_id; do
  container_id="$(compose_cmd ps -q "${service}")"
  [[ -n "${container_id}" \
    && "$(docker inspect --format '{{.State.Running}}|{{.Image}}' "${container_id}")" == "true|${expected_image_id}" ]] || {
    echo "A resumed service is not running its recorded image: ${service}" >&2
    exit 1
  }
done < "${IMAGE_MANIFEST}"

compose_cmd exec -T reverse-proxy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
CHECK_PUBLIC=false "${SCRIPT_DIR}/health-check.sh"
CHECK_PUBLIC=true CHECK_ANDROID_APP_LINKS=true "${SCRIPT_DIR}/health-check.sh"
retire_legacy_compose_services

if [[ "${RECORDED_HEALTH_STATUS}" != "passed" ]]; then
  prior_evidence="${RELEASE_STATE_DIR}/${RECOVERY_SHA}.pre-resume-$(date -u +%Y%m%dT%H%M%SZ).json"
  cp --no-clobber -- "${RELEASE_METADATA}" "${prior_evidence}"
  metadata_temporary="$(mktemp "${RELEASE_STATE_DIR}/.recovered-release.XXXXXX")"
  RELEASE_METADATA_PATH="${RELEASE_METADATA}" RECOVERED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    node -e '
      const fs = require("fs");
      const metadata = JSON.parse(fs.readFileSync(process.env.RELEASE_METADATA_PATH, "utf8"));
      metadata.phase = "recovered-complete";
      metadata.healthStatus = "passed";
      if (metadata.migrationStatus === "running") metadata.migrationStatus = "applied";
      metadata.updatedAt = process.env.RECOVERED_AT;
      metadata.recovery = { mode: "recorded-artifact-resume", completedAt: process.env.RECOVERED_AT };
      process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
    ' > "${metadata_temporary}"
  chmod 0600 "${metadata_temporary}"
  mv -f -- "${metadata_temporary}" "${RELEASE_METADATA}"
fi
if [[ "${BOOTSTRAP_RECOVERY}" != "true" ]]; then
  write_marker "${LAST_GOOD_SHA_FILE}" "${PREVIOUS_HEALTHY_SHA}"
fi
write_marker "${CURRENT_SHA_FILE}" "${RECOVERY_SHA}"
recovery_succeeded=true
trap - EXIT
if ! rm -f -- "${BOOTSTRAP_COMPLETE_MARKER}"; then
  echo "Recovery passed and durable state was committed, but the bootstrap marker could not be cleared." >&2
  exit 1
fi
if [[ "${MIGRATION_IN_PROGRESS_PRESENT}" == "true" ]] \
  && ! rm -f -- "${MIGRATION_IN_PROGRESS_MARKER}"; then
  echo "Recovery passed and durable state was committed, but the proven-applied in-progress marker could not be cleared." >&2
  exit 1
fi
if ! rm -f -- "${RECOVERY_MARKER}"; then
  echo "Recovery passed and durable state was committed, but the recovery marker could not be cleared." >&2
  exit 1
fi
echo "Post-migration release recovered with recorded artifacts and local/public health: ${RECOVERY_SHA}"
