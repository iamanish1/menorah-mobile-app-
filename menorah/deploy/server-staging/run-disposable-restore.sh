#!/usr/bin/env bash
set -euo pipefail

umask 077
export LC_ALL=C

readonly EXPECTED_PROJECT='menorah-staging'
readonly EXPECTED_ENVIRONMENT_ID='menorah-server-staging-v1'
readonly ENV_FILE='/opt/menorah-staging/env/server-staging.env'
readonly REVIEWED_COMPOSE_FILE='/opt/menorah-staging/app/menorah/deploy/server-staging/compose.yml'
readonly SCRIPT_DIR='/opt/menorah-staging/app/menorah/deploy/server-staging'
readonly ENV_LOADER="${SCRIPT_DIR}/load-environment.mjs"
readonly PROCESS_AUTHORITY="${SCRIPT_DIR}/assert-process-authority.sh"
readonly CONTEXT_ASSERTION="${SCRIPT_DIR}/assert-context.mjs"
readonly RESTORE_SERVICE='staging-mongo-restore'
readonly INITIALIZER_SERVICE='staging-mongo-restore-replica-init'
readonly RESTORE_JOB='staging-restore-job'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'

fail() {
  printf '%s\n' "Disposable server-staging restore refused: $*" >&2
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
    || fail "expected exactly one container for ${service}"
  identity="$(
    docker inspect \
      --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' \
      "${ids[0]}"
  )"
  [[ "${identity}" == "${EXPECTED_PROJECT}|${service}" ]] \
    || fail "container identity mismatch for ${service}"
  printf '%s' "${ids[0]}"
}

inspect_restore_state() {
  docker inspect \
    --format '{{.State.Status}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' \
    "$1"
}

[[ "$#" -eq 1 ]] \
  || fail 'usage: run-disposable-restore.sh YYYYMMDDTHHMMSSZ'
readonly STAMP="$1"
[[ "${STAMP}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] \
  || fail 'the explicit backup timestamp is invalid'

for required_command in docker node realpath; do
  command -v "${required_command}" >/dev/null 2>&1 \
    || fail "required command is unavailable: ${required_command}"
done

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
  MENORAH_STAGING_ROOTS_ACK MENORAH_STAGING_RESTORE_ACK \
  MENORAH_STAGING_RESTORE_TARGET

[[ -f "${ENV_FILE}" && ! -L "${ENV_FILE}" ]] \
  || fail 'the exact staging environment file is unavailable'
[[ "$(realpath -e -- "${ENV_FILE}")" == "${ENV_FILE}" ]] \
  || fail 'the staging environment file is not canonical'
[[ -f "${ENV_LOADER}" && ! -L "${ENV_LOADER}" ]] \
  || fail 'the safe staging environment loader is unavailable'
[[ -f "${PROCESS_AUTHORITY}" && ! -L "${PROCESS_AUTHORITY}" ]] \
  || fail 'the staging process-authority guard is unavailable'
[[ -f "${CONTEXT_ASSERTION}" && ! -L "${CONTEXT_ASSERTION}" ]] \
  || fail 'the staging context assertion is unavailable'
[[ ! -e "${RESTORE_MARKER}" && ! -L "${RESTORE_MARKER}" ]] \
  || fail 'a restore is already in progress'
[[ ! -e "${RESTORE_REVIEW}" && ! -L "${RESTORE_REVIEW}" ]] \
  || fail 'a prior restore requires review'

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
  && "${MENORAH_STAGING_RESTORE_ACK+x}" != x \
  && "${MENORAH_STAGING_RESTORE_TARGET+x}" != x ]] \
  || fail 'operation acknowledgments must not be persisted in the environment'

MENORAH_STAGING_ROOTS_ACK='MENORAH_STAGING_ROOTS_REVIEWED' \
MENORAH_STAGING_RESTORE_ACK='RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET' \
MENORAH_STAGING_RESTORE_TARGET="${RESTORE_SERVICE}" \
  node "${CONTEXT_ASSERTION}" restore >/dev/null

restore_id=''
stop_disposable_target() {
  local original_status="$?" identity
  local -a cleanup_ids=()
  trap - EXIT
  trap '' HUP INT TERM
  if [[ -z "${restore_id}" ]]; then
    mapfile -t cleanup_ids < <(
      docker ps -aq \
        --filter "label=com.docker.compose.project=${EXPECTED_PROJECT}" \
        --filter "label=com.docker.compose.service=${RESTORE_SERVICE}"
    )
    if [[ "${#cleanup_ids[@]}" -gt 1 ]]; then
      printf '%s\n' \
        'Disposable restore target became ambiguous during cleanup.' >&2
      exit 1
    fi
    if [[ "${#cleanup_ids[@]}" -eq 1 ]]; then
      restore_id="${cleanup_ids[0]}"
    fi
  fi
  if [[ -n "${restore_id}" ]]; then
    identity="$(inspect_restore_state "${restore_id}")" || identity=''
    case "${identity}" in
      "running|true|"*"|${EXPECTED_PROJECT}|${RESTORE_SERVICE}")
        docker stop --time 30 "${restore_id}" >/dev/null || exit 1
        ;;
      "exited|false|"*"|${EXPECTED_PROJECT}|${RESTORE_SERVICE}") ;;
      *)
        printf '%s\n' \
          'Disposable restore target identity changed during cleanup.' >&2
        exit 1
        ;;
    esac
  fi
  exit "${original_status}"
}
trap stop_disposable_target EXIT
trap 'exit 130' HUP INT TERM

compose --profile recovery up -d --no-deps --wait --wait-timeout 300 \
  --force-recreate \
  "${RESTORE_SERVICE}"
restore_id="$(find_exact_service_container "${RESTORE_SERVICE}")"
[[ "$(inspect_restore_state "${restore_id}")" == \
  "running|true|healthy|${EXPECTED_PROJECT}|${RESTORE_SERVICE}" ]] \
  || fail 'the disposable restore MongoDB target is not healthy'

# This intentionally honors the initializer's Compose dependency. Detached
# startup is followed by inspection of the retained one-shot container; neither
# `up --wait` nor dependency bypass is treated as initializer success.
compose --profile recovery up -d --force-recreate "${INITIALIZER_SERVICE}"
initializer_id="$(find_exact_service_container "${INITIALIZER_SERVICE}")"
current_restore_id="$(find_exact_service_container "${RESTORE_SERVICE}")"
if [[ "${current_restore_id}" != "${restore_id}" ]]; then
  restore_id="${current_restore_id}"
  fail 'initializer startup unexpectedly replaced the restore target'
fi
[[ "$(inspect_restore_state "${restore_id}")" == \
  "running|true|healthy|${EXPECTED_PROJECT}|${RESTORE_SERVICE}" ]] \
  || fail 'the restore target changed state during initialization'
for ((attempt = 0; attempt < 60; attempt += 1)); do
  initializer_state="$(
    docker inspect \
      --format '{{.State.Status}}|{{.State.Running}}|{{.State.ExitCode}}|{{.State.OOMKilled}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' \
      "${initializer_id}"
  )"
  [[ "${initializer_state}" == exited\|false\|* ]] && break
  sleep 2
done
[[ "${initializer_state}" == \
  "exited|false|0|false|${EXPECTED_PROJECT}|${INITIALIZER_SERVICE}" ]] \
  || fail 'the disposable restore replica initializer did not exit cleanly'

MENORAH_STAGING_ROOTS_ACK='MENORAH_STAGING_ROOTS_REVIEWED' \
MENORAH_STAGING_RESTORE_ACK='RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET' \
MENORAH_STAGING_RESTORE_TARGET="${RESTORE_SERVICE}" \
  compose --profile recovery run --rm --no-deps \
    -e MENORAH_STAGING_ROOTS_ACK=MENORAH_STAGING_ROOTS_REVIEWED \
    -e MENORAH_STAGING_RESTORE_ACK=RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET \
    -e MENORAH_STAGING_RESTORE_TARGET="${RESTORE_SERVICE}" \
    "${RESTORE_JOB}" "${STAMP}"
