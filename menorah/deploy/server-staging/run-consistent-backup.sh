#!/usr/bin/env bash
set -euo pipefail

umask 077
export LC_ALL=C

readonly EXPECTED_PROJECT='menorah-staging'
readonly EXPECTED_ENVIRONMENT_ID='menorah-server-staging-v1'
readonly APP_ROOT='/opt/menorah-staging/app'
readonly ENV_FILE='/opt/menorah-staging/env/server-staging.env'
readonly REVIEWED_COMPOSE_FILE='/opt/menorah-staging/app/menorah/deploy/server-staging/compose.yml'
readonly SCRIPT_DIR='/opt/menorah-staging/app/menorah/deploy/server-staging'
readonly ENV_LOADER="${SCRIPT_DIR}/load-environment.mjs"
readonly ENV_VALIDATOR="${SCRIPT_DIR}/validate-environment.mjs"
readonly PROCESS_AUTHORITY="${SCRIPT_DIR}/assert-process-authority.sh"
readonly CONTEXT_ASSERTION="${SCRIPT_DIR}/assert-context.mjs"
readonly RUNTIME_VERIFIER="${SCRIPT_DIR}/verify-runtime-services.sh"
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly DEPLOY_LOCK='/opt/menorah-staging/deploy-state/.deploy.lock'
readonly BACKUP_LOCK='/opt/menorah-staging/deploy-state/.backup.lock'
readonly CURRENT_SHA_FILE='/opt/menorah-staging/deploy-state/current-sha'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'
current_release_sha=''
readonly -a WRITER_SERVICES=(
  staging-api-ios
  staging-api-android
  staging-api-web
  staging-api-admin
  staging-worker
  staging-user-web-app
)

fail() {
  printf '%s\n' "Consistent server-staging backup refused: $*" >&2
  exit 1
}

compose() {
  docker compose \
    --project-name "${EXPECTED_PROJECT}" \
    -f "${REVIEWED_COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    "$@"
}

find_exact_service_container() {
  local service="$1" identity
  local -a ids=()
  mapfile -t ids < <(
    docker ps -aq \
      --filter "label=com.docker.compose.project=${EXPECTED_PROJECT}" \
      --filter "label=com.docker.compose.service=${service}"
  )
  [[ "${#ids[@]}" -eq 1 && -n "${ids[0]}" ]] \
    || fail "expected exactly one container for writer service ${service}"
  identity="$(
    docker inspect \
      --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' \
      "${ids[0]}"
  )"
  [[ "${identity}" == "${EXPECTED_PROJECT}|${service}" ]] \
    || fail "container identity mismatch for writer service ${service}"
  printf '%s' "${ids[0]}"
}

inspect_writer_state() {
  docker inspect \
    --format '{{.State.Status}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' \
    "$1"
}

read_sha_marker() {
  local marker="$1" label="$2" value
  local -a marker_lines=()
  [[ -f "${marker}" && ! -L "${marker}" ]] \
    || fail "${label} marker must be a regular non-symlink file"
  [[ "$(realpath -e -- "${marker}")" == "${marker}" ]] \
    || fail "${label} marker is not canonical"
  mapfile -t marker_lines < "${marker}"
  [[ "${#marker_lines[@]}" -eq 1 ]] \
    || fail "${label} marker must contain exactly one SHA record"
  value="${marker_lines[0]}"
  [[ "${value}" =~ ^[0-9a-f]{40}$ ]] \
    || fail "${label} marker does not contain one full SHA"
  git -C "${APP_ROOT}" cat-file -e "${value}^{commit}" 2>/dev/null \
    || fail "${label} marker does not name a local commit"
  printf '%s' "${value}"
}

assert_checkout_provenance() {
  local expected_script_blob actual_script_blob
  current_release_sha="$(
    read_sha_marker "${CURRENT_SHA_FILE}" 'current release'
  )"
  [[ "$(realpath -e -- "${APP_ROOT}")" == "${APP_ROOT}" ]] \
    || fail 'application checkout is not canonical'
  [[ "$(git -C "${APP_ROOT}" rev-parse HEAD)" == "${current_release_sha}" ]] \
    || fail 'application checkout is not at the recorded current release'
  [[ -z "$(git -C "${APP_ROOT}" status --porcelain --untracked-files=all)" ]] \
    || fail 'backup requires a clean exact-release checkout'
  expected_script_blob="$(
    git -C "${APP_ROOT}" rev-parse \
      "${current_release_sha}:menorah/deploy/server-staging/run-consistent-backup.sh"
  )"
  actual_script_blob="$(
    git -C "${APP_ROOT}" hash-object \
      "${SCRIPT_DIR}/run-consistent-backup.sh"
  )"
  [[ "${actual_script_blob}" == "${expected_script_blob}" ]] \
    || fail 'backup wrapper is not from the recorded current release'
}

assert_exact_runtime() {
  local manifest
  [[ "${MENORAH_RUNTIME_CANDIDATE_SHA+x}" == x \
    && "${MENORAH_SERVER_STAGING_RUNTIME_SHA+x}" == x \
    && "${MENORAH_RUNTIME_CANDIDATE_SHA}" == "${current_release_sha}" \
    && "${MENORAH_SERVER_STAGING_RUNTIME_SHA}" == "${current_release_sha}" ]] \
    || fail 'environment runtime SHA does not match the recorded current release'
  MENORAH_STAGING_ROOTS_ACK='MENORAH_STAGING_ROOTS_REVIEWED' \
    node "${CONTEXT_ASSERTION}" release "${current_release_sha}" >/dev/null
  manifest="${RELEASE_STATE}/${current_release_sha}.images"
  COMPOSE_PROJECT_NAME="${EXPECTED_PROJECT}" \
    "${RUNTIME_VERIFIER}" "${manifest}" >/dev/null
}

[[ "$#" -eq 0 ]] || fail 'usage: run-consistent-backup.sh'
for required_command in docker flock git node realpath; do
  command -v "${required_command}" >/dev/null 2>&1 \
    || fail "required command is unavailable: ${required_command}"
done

# No caller-controlled Docker, Compose, or Git authority may influence this
# operation. The reviewed environment is loaded only from the exact file below.
for process_control_key in \
  ${!DOCKER_@} \
  ${!BUILDKIT_@} \
  ${!BUILDX_@} \
  ${!COMPOSE_@} \
  ${!GIT_@}
do
  unset "${process_control_key}"
done
unset process_control_key \
  MENORAH_STAGING_ROOTS_ACK MENORAH_STAGING_BACKUP_ACK \
  MENORAH_STAGING_WRITERS_QUIESCED

[[ -f "${ENV_FILE}" && ! -L "${ENV_FILE}" ]] \
  || fail 'the exact staging environment file is unavailable'
[[ "$(realpath -e -- "${ENV_FILE}")" == "${ENV_FILE}" ]] \
  || fail 'the staging environment file is not canonical'
[[ -f "${ENV_LOADER}" && ! -L "${ENV_LOADER}" ]] \
  || fail 'the safe staging environment loader is unavailable'
[[ -f "${ENV_VALIDATOR}" && ! -L "${ENV_VALIDATOR}" ]] \
  || fail 'the staging environment validator is unavailable'
[[ -f "${PROCESS_AUTHORITY}" && ! -L "${PROCESS_AUTHORITY}" ]] \
  || fail 'the staging process-authority guard is unavailable'
[[ -f "${CONTEXT_ASSERTION}" && ! -L "${CONTEXT_ASSERTION}" ]] \
  || fail 'the staging context assertion is unavailable'
[[ -f "${RUNTIME_VERIFIER}" && ! -L "${RUNTIME_VERIFIER}" ]] \
  || fail 'the staging runtime verifier is unavailable'

[[ -d "${STATE_ROOT}" && ! -L "${STATE_ROOT}" ]] \
  || fail 'the staging deployment-state root is unavailable'
[[ "$(realpath -e -- "${STATE_ROOT}")" == "${STATE_ROOT}" ]] \
  || fail 'the staging deployment-state root is not canonical'
for blocking_state in "${RESTORE_MARKER}" "${RESTORE_REVIEW}"; do
  [[ ! -e "${blocking_state}" && ! -L "${blocking_state}" ]] \
    || fail "staging recovery state blocks backup: ${blocking_state}"
done
[[ ! -L "${DEPLOY_LOCK}" && ! -L "${BACKUP_LOCK}" ]] \
  || fail 'staging operation locks must not be symlinks'
exec 9>>"${DEPLOY_LOCK}"
flock -n 9 \
  || fail 'another staging deployment, rollback, backup, or restore is running'
for blocking_state in "${RESTORE_MARKER}" "${RESTORE_REVIEW}"; do
  [[ ! -e "${blocking_state}" && ! -L "${blocking_state}" ]] \
    || fail "staging recovery state blocks backup: ${blocking_state}"
done
[[ ! -e "${BACKUP_LOCK}" ]] \
  || fail 'a staging backup is already running or requires lock review'

assert_checkout_provenance

node "${ENV_VALIDATOR}" --env "${ENV_FILE}" >/dev/null \
  || fail 'the full staging environment preflight failed'

environment_load_complete=''
while IFS= read -r -d '' environment_key \
  && IFS= read -r -d '' environment_value
do
  if [[ "${environment_key}" == \
    'MENORAH_SERVER_STAGING_DOTENV_LOAD_COMPLETE' ]]
  then
    environment_load_complete="${environment_value}"
    continue
  fi
  printf -v "${environment_key}" '%s' "${environment_value}"
  export "${environment_key?}"
done < <(node "${ENV_LOADER}" --emit0 "${ENV_FILE}")
[[ "${environment_load_complete}" == 'safe-dotenv-v1' ]] \
  || fail 'safe staging environment parsing did not complete'
unset environment_key environment_value environment_load_complete

COMPOSE_PROJECT_NAME="${EXPECTED_PROJECT}"
export COMPOSE_PROJECT_NAME
# shellcheck source=/dev/null
source "${PROCESS_AUTHORITY}"
server_staging_assert_process_authority "${EXPECTED_PROJECT}" \
  || fail 'caller process authority is unsafe'
[[ "${COMPOSE_PROJECT_NAME+x}" == x \
  && "${COMPOSE_PROJECT_NAME}" == "${EXPECTED_PROJECT}" ]] \
  || fail 'unexpected Compose project'
[[ "${MENORAH_SERVER_STAGING_ENVIRONMENT_ID+x}" == x \
  && "${MENORAH_SERVER_STAGING_ENVIRONMENT_ID}" == "${EXPECTED_ENVIRONMENT_ID}" ]] \
  || fail 'unexpected environment identity'
[[ "${MENORAH_STAGING_ROOTS_ACK+x}" != x \
  && "${MENORAH_STAGING_BACKUP_ACK+x}" != x \
  && "${MENORAH_STAGING_WRITERS_QUIESCED+x}" != x ]] \
  || fail 'operation acknowledgments must not be persisted in the environment'

MENORAH_STAGING_ROOTS_ACK='MENORAH_STAGING_ROOTS_REVIEWED' \
MENORAH_STAGING_BACKUP_ACK='BACKUP_MENORAH_STAGING_SYNTHETIC_DATA' \
MENORAH_STAGING_WRITERS_QUIESCED='APPLICATION_WRITERS_STOPPED' \
  node "${CONTEXT_ASSERTION}" backup >/dev/null

assert_exact_runtime

declare -a writer_ids=()
for service in "${WRITER_SERVICES[@]}"; do
  container_id="$(find_exact_service_container "${service}")"
  [[ "$(inspect_writer_state "${container_id}")" == \
    "running|true|healthy|${EXPECTED_PROJECT}|${service}" ]] \
    || fail "writer is not running and healthy before quiescence: ${service}"
  writer_ids+=("${container_id}")
done
unset container_id service

restart_writers() {
  local original_status="$?" recovery_failed=0 identity index service
  local -a stopped_ids=()
  trap - EXIT
  trap '' HUP INT TERM

  for index in "${!writer_ids[@]}"; do
    service="${WRITER_SERVICES[${index}]}"
    identity="$(inspect_writer_state "${writer_ids[${index}]}")" \
      || recovery_failed=1
    case "${identity}" in
      "running|true|"*"|${EXPECTED_PROJECT}|${service}") ;;
      "exited|false|"*"|${EXPECTED_PROJECT}|${service}")
        stopped_ids+=("${writer_ids[${index}]}")
        ;;
      *) recovery_failed=1 ;;
    esac
  done
  if [[ "${#stopped_ids[@]}" -gt 0 ]]; then
    docker start "${stopped_ids[@]}" >/dev/null || recovery_failed=1
  fi

  for ((attempt = 0; attempt < 60; attempt += 1)); do
    all_healthy=true
    for index in "${!writer_ids[@]}"; do
      service="${WRITER_SERVICES[${index}]}"
      identity="$(inspect_writer_state "${writer_ids[${index}]}")" \
        || identity=''
      if [[ "${identity}" != \
        "running|true|healthy|${EXPECTED_PROJECT}|${service}" ]]
      then
        all_healthy=false
      fi
    done
    [[ "${all_healthy}" == true ]] && break
    sleep 2
  done
  [[ "${all_healthy}" == true ]] || recovery_failed=1

  if [[ "${recovery_failed}" -ne 0 ]]; then
    printf '%s\n' \
      'Consistent server-staging backup failed to restore every writer.' >&2
    exit 1
  fi
  exit "${original_status}"
}

trap restart_writers EXIT
trap 'exit 130' HUP INT TERM

docker stop --time 30 "${writer_ids[@]}" >/dev/null
for index in "${!writer_ids[@]}"; do
  service="${WRITER_SERVICES[${index}]}"
  identity="$(inspect_writer_state "${writer_ids[${index}]}")"
  [[ "${identity}" == \
    exited\|false\|*\|"${EXPECTED_PROJECT}"\|"${service}" ]] \
    || fail "writer did not stop cleanly: ${service}"
done

MENORAH_STAGING_ROOTS_ACK='MENORAH_STAGING_ROOTS_REVIEWED' \
MENORAH_STAGING_BACKUP_ACK='BACKUP_MENORAH_STAGING_SYNTHETIC_DATA' \
MENORAH_STAGING_WRITERS_QUIESCED='APPLICATION_WRITERS_STOPPED' \
  compose --profile backup run --rm --no-deps \
    -e MENORAH_STAGING_ROOTS_ACK=MENORAH_STAGING_ROOTS_REVIEWED \
    -e MENORAH_STAGING_BACKUP_ACK=BACKUP_MENORAH_STAGING_SYNTHETIC_DATA \
    -e MENORAH_STAGING_WRITERS_QUIESCED=APPLICATION_WRITERS_STOPPED \
    staging-backup-job
