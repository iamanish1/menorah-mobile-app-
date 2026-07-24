#!/usr/bin/env bash
set -euo pipefail

umask 077
export LC_ALL=C

readonly EXPECTED_PROJECT='menorah-staging'
readonly ENV_FILE='/opt/menorah-staging/env/server-staging.env'
readonly COMPOSE_FILE='/opt/menorah-staging/app/menorah/deploy/server-staging/compose.yml'
readonly SCRIPT_DIR='/opt/menorah-staging/app/menorah/deploy/server-staging'
readonly LIFECYCLE_HELPER="${SCRIPT_DIR}/service-lifecycle.mjs"
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'

fail() {
  printf '%s\n' "Server-staging runtime verification refused: $*" >&2
  exit 1
}

[[ "$#" -eq 1 ]] || fail 'usage: verify-runtime-services.sh MANIFEST'
readonly MANIFEST="$1"

for required_command in docker mktemp node realpath; do
  command -v "${required_command}" >/dev/null 2>&1 \
    || fail "required command is unavailable: ${required_command}"
done
[[ "${COMPOSE_PROJECT_NAME+x}" == x \
  && "${COMPOSE_PROJECT_NAME}" == "${EXPECTED_PROJECT}" ]] \
  || fail 'unexpected Compose project'
[[ -f "${MANIFEST}" && ! -L "${MANIFEST}" ]] \
  || fail 'release manifest must be a regular non-symlink file'
manifest_path="$(realpath -e -- "${MANIFEST}")"
[[ "${manifest_path}" =~ ^${RELEASE_STATE}/[0-9a-f]{40}\.images$ ]] \
  || fail 'release manifest is outside the exact release-state root'
[[ "${manifest_path}" == "${MANIFEST}" ]] \
  || fail 'release manifest path is not canonical'
readonly manifest_path
[[ -f "${LIFECYCLE_HELPER}" && ! -L "${LIFECYCLE_HELPER}" ]] \
  || fail 'service lifecycle helper is unavailable'

config_temp="$(mktemp "${RELEASE_STATE}/.runtime-config.XXXXXX")"
plan_temp="$(mktemp "${RELEASE_STATE}/.runtime-plan.XXXXXX")"
cleanup() {
  rm -f -- "${config_temp}" "${plan_temp}"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

docker compose \
  --project-name "${EXPECTED_PROJECT}" \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  --profile migration \
  config --format json > "${config_temp}"
node "${LIFECYCLE_HELPER}" \
  plan "${config_temp}" "${MANIFEST}" > "${plan_temp}"

runtime_count=0
while IFS='|' read -r kind health service reference manifest_image_id extra
do
  [[ -n "${kind}" \
    && -n "${health}" \
    && -n "${service}" \
    && -n "${reference}" \
    && -z "${extra:-}" ]] \
    || fail 'service lifecycle plan contains an invalid record'
  [[ "${kind}" == 'runtime' ]] || continue
  runtime_count=$((runtime_count + 1))

  mapfile -t container_ids < <(
    docker compose \
      --project-name "${EXPECTED_PROJECT}" \
      -f "${COMPOSE_FILE}" \
      --env-file "${ENV_FILE}" \
      ps -a -q "${service}"
  )
  [[ "${#container_ids[@]}" -eq 1 \
    && -n "${container_ids[0]}" ]] \
    || fail "required runtime service is missing or ambiguous: ${service}"

  expected_image_id="$(
    docker image inspect --format '{{.Id}}' "${reference}"
  )" || fail "required runtime image is unavailable: ${service}"
  [[ "${expected_image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "required runtime image identity is invalid: ${service}"
  if [[ -n "${manifest_image_id}" ]]; then
    [[ "${expected_image_id}" == "${manifest_image_id}" ]] \
      || fail "runtime image differs from its manifest: ${service}"
  fi

  runtime_identity="$(
    docker inspect \
      --format '{{.State.Status}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.Image}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}' \
      "${container_ids[0]}"
  )"
  IFS='|' read -r \
    status running health_status actual_image_id project_label service_label \
    oneoff_label extra_identity <<< "${runtime_identity}"
  [[ "${status}" == 'running' && "${running}" == 'true' ]] \
    || fail "required runtime service is not running: ${service}"
  [[ "${actual_image_id}" == "${expected_image_id}" \
    && "${project_label}" == "${EXPECTED_PROJECT}" \
    && "${service_label}" == "${service}" \
    && "${oneoff_label}" == 'False' \
    && -z "${extra_identity:-}" ]] \
    || fail "required runtime service identity is invalid: ${service}"
  if [[ "${health}" == 'healthy' ]]; then
    [[ "${health_status}" == 'healthy' ]] \
      || fail "required runtime service is not healthy: ${service}"
  else
    [[ "${health}" == 'running' ]] \
      || fail "unknown runtime health requirement: ${service}"
  fi
done < "${plan_temp}"

[[ "${runtime_count}" -gt 0 ]] \
  || fail 'service lifecycle plan contains no required runtime services'

trap - EXIT HUP INT TERM
rm -f -- "${config_temp}" "${plan_temp}"
