#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
LAST_GOOD_SHA_FILE="${STATE_DIR}/last-good-sha"
CURRENT_STATE_SHA_FILE="${STATE_DIR}/current-sha"
MIGRATION_MARKER="${STATE_DIR}/migration-applied-sha"
MIGRATION_IN_PROGRESS_MARKER="${STATE_DIR}/migration-in-progress-sha"
MONGO_IDENTITY_RECONCILIATION_MARKER="${STATE_DIR}/mongo-identity-reconciliation-in-progress-sha"
POST_MIGRATION_RECOVERY_MARKER="${STATE_DIR}/post-migration-recovery-sha"
ROLLBACK_IN_PROGRESS_MARKER="${STATE_DIR}/rollback-in-progress-sha"
RESTORE_IN_PROGRESS_MARKER="${STATE_DIR}/production-restore-in-progress.json"
RESTORE_REVIEW_MARKER="${STATE_DIR}/production-restore-requires-review.json"
RELEASE_STATE_DIR="${STATE_DIR}/releases"
LOCK_FILE="${STATE_DIR}/.deploy.lock"
WRITER_SERVICES=(api-ios api-android api-web api-admin worker)
ROLLBACK_RUNTIME_MUTATION_STARTED=false
ROLLBACK_SUCCEEDED=false

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

write_marker_atomically() {
  local target="$1" value="$2" temporary
  temporary="$(mktemp "${STATE_DIR}/.rollback-marker.XXXXXX")"
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

verify_writers_stopped() {
  local service container_id running
  for service in "${WRITER_SERVICES[@]}"; do
    container_id="$(compose_cmd ps -q "${service}")"
    [[ -n "${container_id}" ]] || continue
    running="$(docker inspect --format '{{.State.Running}}' "${container_id}")"
    if [[ "${running}" == "true" ]]; then
      echo "Rollback failure left a writer running: ${service}" >&2
      return 1
    fi
  done
}

handle_exit() {
  local status="$1"
  if [[ "${status}" -ne 0 \
    && "${ROLLBACK_SUCCEEDED}" != "true" \
    && "${ROLLBACK_RUNTIME_MUTATION_STARTED}" == "true" ]]; then
    echo "Rollback did not complete; stopping application writers and retaining ${ROLLBACK_IN_PROGRESS_MARKER}." >&2
    if ! compose_cmd stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${WRITER_SERVICES[@]}"; then
      echo "WARNING: at least one writer could not be stopped; isolate traffic immediately." >&2
    elif ! verify_writers_stopped; then
      echo "WARNING: at least one writer still appears active; isolate traffic immediately." >&2
    fi
  fi
}

mkdir -p "${STATE_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another deployment, rollback, bootstrap, or restore is already running: ${LOCK_FILE}" >&2
  exit 1
fi

if [[ -e "${MIGRATION_IN_PROGRESS_MARKER}" || -L "${MIGRATION_IN_PROGRESS_MARKER}" ]]; then
  echo "Code-only rollback is blocked because a database migration may be partially applied." >&2
  echo "Keep application writers stopped and follow the coordinated recovery runbook." >&2
  exit 1
fi
if [[ -e "${MONGO_IDENTITY_RECONCILIATION_MARKER}" || -L "${MONGO_IDENTITY_RECONCILIATION_MARKER}" ]]; then
  echo "Code-only rollback is blocked because managed MongoDB roles may be partially reconciled." >&2
  echo "Keep application writers stopped and complete the identity recovery review." >&2
  exit 1
fi
if [[ -e "${POST_MIGRATION_RECOVERY_MARKER}" || -L "${POST_MIGRATION_RECOVERY_MARKER}" ]]; then
  echo "Code-only rollback is blocked because a post-migration release is awaiting guarded recovery." >&2
  echo "Keep application writers stopped and follow the post-migration recovery runbook." >&2
  exit 1
fi
if [[ -e "${RESTORE_IN_PROGRESS_MARKER}" || -L "${RESTORE_IN_PROGRESS_MARKER}" \
  || -e "${RESTORE_REVIEW_MARKER}" || -L "${RESTORE_REVIEW_MARKER}" ]]; then
  echo "Rollback is blocked while a production restore is in progress or awaiting schema review." >&2
  exit 1
fi
CURRENT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
RECORDED_CURRENT_SHA=""
if [[ -e "${CURRENT_STATE_SHA_FILE}" || -L "${CURRENT_STATE_SHA_FILE}" ]]; then
  RECORDED_CURRENT_SHA="$(read_valid_sha_marker "${CURRENT_STATE_SHA_FILE}" "Recorded current release")" \
    || exit 1
fi
if [[ -e "${ROLLBACK_IN_PROGRESS_MARKER}" || -L "${ROLLBACK_IN_PROGRESS_MARKER}" ]]; then
  read_valid_sha_marker "${ROLLBACK_IN_PROGRESS_MARKER}" "Rollback-in-progress target" >/dev/null \
    || exit 1
  TARGET_SHA_FILE="${ROLLBACK_IN_PROGRESS_MARKER}"
  TARGET_REASON="durable target from the interrupted rollback"
else
  TARGET_SHA_FILE="${LAST_GOOD_SHA_FILE}"
  TARGET_REASON="last known healthy predecessor"
  if [[ -n "${RECORDED_CURRENT_SHA}" ]]; then
    if [[ "${CURRENT_SHA}" != "${RECORDED_CURRENT_SHA}" ]]; then
      TARGET_SHA_FILE="${CURRENT_STATE_SHA_FILE}"
      TARGET_REASON="recorded healthy release before the interrupted attempt"
    fi
  fi
fi
TARGET_SHA="$(read_valid_sha_marker "${TARGET_SHA_FILE}" "Rollback target")" || exit 1
if [[ -e "${MIGRATION_MARKER}" || -L "${MIGRATION_MARKER}" ]]; then
  MIGRATED_SHA="$(read_valid_sha_marker "${MIGRATION_MARKER}" "Applied migration")" || exit 1
  if [[ "${MIGRATED_SHA}" != "${TARGET_SHA}" ]]; then
    echo "Code-only rollback is blocked because database migrations were applied at ${MIGRATED_SHA}." >&2
    echo "Keep application writers stopped and follow the coordinated recovery runbook." >&2
    exit 1
  fi
fi
if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "Working tree has local changes. Refusing rollback." >&2
  git -C "${REPO_ROOT}" status --short
  exit 1
fi

IMAGE_MANIFEST="${RELEASE_STATE_DIR}/${TARGET_SHA}.images"
IMAGE_MANIFEST_CHECKSUM="${IMAGE_MANIFEST}.sha256"
RELEASE_METADATA="${RELEASE_STATE_DIR}/${TARGET_SHA}.json"
if [[ ! -f "${IMAGE_MANIFEST}" || -L "${IMAGE_MANIFEST}" || ! -s "${IMAGE_MANIFEST}" \
  || ! -f "${IMAGE_MANIFEST_CHECKSUM}" || -L "${IMAGE_MANIFEST_CHECKSUM}" || ! -s "${IMAGE_MANIFEST_CHECKSUM}" \
  || ! -f "${RELEASE_METADATA}" || -L "${RELEASE_METADATA}" || ! -s "${RELEASE_METADATA}" \
  || ! -r "${IMAGE_MANIFEST}" || ! -r "${IMAGE_MANIFEST_CHECKSUM}" || ! -r "${RELEASE_METADATA}" ]]; then
  echo "Rollback is unavailable: the target has no complete recorded release artifact evidence." >&2
  exit 1
fi
(
  cd "${RELEASE_STATE_DIR}"
  sha256sum -c "$(basename "${IMAGE_MANIFEST_CHECKSUM}")"
)
ACTUAL_MANIFEST_SHA256="$(sha256sum "${IMAGE_MANIFEST}" | awk '{print $1}')"
if ! RELEASE_METADATA_PATH="${RELEASE_METADATA}" \
  EXPECTED_RELEASE_SHA="${TARGET_SHA}" \
  EXPECTED_MANIFEST="${IMAGE_MANIFEST}" \
  EXPECTED_MANIFEST_SHA256="${ACTUAL_MANIFEST_SHA256}" \
  node -e '
    const fs = require("fs");
    const metadata = JSON.parse(fs.readFileSync(process.env.RELEASE_METADATA_PATH, "utf8"));
    if (metadata.releaseSha !== process.env.EXPECTED_RELEASE_SHA
      || metadata.healthStatus !== "passed"
      || metadata.artifactIdentity?.manifestPath !== process.env.EXPECTED_MANIFEST
      || metadata.artifactIdentity?.manifestSha256 !== process.env.EXPECTED_MANIFEST_SHA256) process.exit(1);
  '; then
  echo "Recorded rollback metadata is incomplete or was not healthy." >&2
  exit 1
fi

declare -a ROLLBACK_SERVICES=()
declare -A ROLLBACK_SERVICE_SET=()
while IFS='|' read -r service image_reference image_id extra; do
  if [[ ! "${service}" =~ ^[a-z0-9][a-z0-9-]*$ \
    || -z "${image_reference}" \
    || "${image_reference}" =~ [[:space:]\|] \
    || ! "${image_id}" =~ ^sha256:[0-9a-f]{64}$ \
    || -n "${extra:-}" ]]; then
    echo "Rollback image manifest contains an invalid record." >&2
    exit 1
  fi
  if [[ -n "${ROLLBACK_SERVICE_SET["${service}"]:-}" ]]; then
    echo "Rollback image manifest contains a duplicate service: ${service}" >&2
    exit 1
  fi
  ROLLBACK_SERVICE_SET["${service}"]=true
  docker image inspect "${image_id}" >/dev/null
  if [[ "${image_reference}" == *@sha256:* ]]; then
    resolved_image_id="$(docker image inspect --format '{{.Id}}' "${image_reference}")"
    if [[ "${resolved_image_id}" != "${image_id}" ]]; then
      echo "Digest-pinned rollback reference does not resolve to its recorded image: ${service}" >&2
      exit 1
    fi
  fi
  ROLLBACK_SERVICES+=("${service}")
done < "${IMAGE_MANIFEST}"
if (( ${#ROLLBACK_SERVICES[@]} == 0 )); then
  echo "Rollback image manifest contains no services." >&2
  exit 1
fi

write_marker_atomically "${ROLLBACK_IN_PROGRESS_MARKER}" "${TARGET_SHA}"
trap 'status=$?; trap - EXIT; handle_exit "${status}"; exit "${status}"' EXIT

while IFS='|' read -r _ image_reference image_id _; do
  if [[ "${image_reference}" != *@sha256:* ]]; then
    docker image tag "${image_id}" "${image_reference}"
  fi
done < "${IMAGE_MANIFEST}"

echo "Restoring ${TARGET_REASON} from ${CURRENT_SHA} to ${TARGET_SHA} without rebuilding."
git -C "${REPO_ROOT}" checkout --detach "${TARGET_SHA}"
compose_cmd config --quiet
ROLLBACK_RUNTIME_MUTATION_STARTED=true
compose_cmd up -d --force-recreate --no-build --pull never --no-deps "${ROLLBACK_SERVICES[@]}"

while IFS='|' read -r service _ expected_image_id; do
  container_id="$(compose_cmd ps -q "${service}")"
  if [[ -z "${container_id}" \
    || "$(docker inspect --format '{{.State.Running}}|{{.Image}}' "${container_id}")" != "true|${expected_image_id}" ]]; then
    echo "Rollback service is not running its recorded image: ${service}" >&2
    exit 1
  fi
done < "${IMAGE_MANIFEST}"

compose_cmd exec -T reverse-proxy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
if CHECK_PUBLIC=false "${SCRIPT_DIR}/health-check.sh" \
  && CHECK_PUBLIC=true "${SCRIPT_DIR}/health-check.sh"; then
  write_marker_atomically "${CURRENT_STATE_SHA_FILE}" "${TARGET_SHA}"
else
  echo "Rollback health failed. Do not change traffic until the incident owner completes recovery." >&2
  exit 1
fi

ROLLBACK_SUCCEEDED=true
trap - EXIT
if ! rm -f -- "${ROLLBACK_IN_PROGRESS_MARKER}"; then
  echo "Rollback passed and current-sha was committed, but the rollback target marker could not be cleared." >&2
  echo "Rerun rollback-last-deploy.sh to finalize marker cleanup." >&2
  exit 1
fi
echo "Rollback complete with recorded artifact identity and local/public health: ${TARGET_SHA}"
