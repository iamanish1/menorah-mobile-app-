#!/bin/sh
# shellcheck shell=bash
if [ "${1-}" != '__menorah_server_staging_clean_bash_v1__' ] \
  || [ -z "${BASH_VERSION-}" ]
then
  exec /usr/bin/env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    HOME=/root TMPDIR=/tmp LC_ALL=C \
    COMPOSE_PROJECT_NAME=menorah-staging \
    /bin/bash --noprofile --norc "$0" \
    '__menorah_server_staging_clean_bash_v1__' "$@"
fi
shift
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
readonly RESTORE_SERVICE='staging-mongo-restore'
readonly INITIALIZER_SERVICE='staging-mongo-restore-replica-init'
readonly RESTORE_JOB='staging-restore-job'
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly RECOVERY_ROOT='/opt/menorah-staging/deploy-state/recovery'
readonly DEPLOY_LOCK='/opt/menorah-staging/deploy-state/.deploy.lock'
readonly BACKUP_LOCK='/opt/menorah-staging/deploy-state/.backup.lock'
readonly RESTORE_LOCK='/opt/menorah-staging/deploy-state/.restore.lock'
readonly BACKUP_SESSION='/opt/menorah-staging/deploy-state/recovery/backup-session'
readonly RESTORE_SESSION='/opt/menorah-staging/deploy-state/recovery/restore-session'
readonly CURRENT_SHA_FILE='/opt/menorah-staging/deploy-state/current-sha'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'
current_release_sha=''

fail() {
  printf '%s\n' "Disposable server-staging restore refused: $*" >&2
  exit 1
}

assert_state_absent() {
  local state_path="$1"
  [[ ! -e "${state_path}" && ! -L "${state_path}" ]] && return
  case "${state_path}" in
    "${RESTORE_LOCK}")
      fail 'a staging restore is already running or requires lock review' ;;
    "${RESTORE_SESSION}")
      fail 'a staging restore session is already active or requires review' ;;
    "${RESTORE_MARKER}")
      fail 'a restore is already in progress' ;;
    "${RESTORE_REVIEW}")
      fail 'a prior restore requires review' ;;
    *) fail "staging recovery state blocks restore: ${state_path}" ;;
  esac
}

publish_restore_session() {
  local temporary="${RECOVERY_ROOT}/.restore-session.$$.tmp"
  readonly restore_session_id="${current_release_sha}-$$"
  readonly restore_session_record="restore-session-v1|${EXPECTED_PROJECT}|${EXPECTED_ENVIRONMENT_ID}|${current_release_sha}|${restore_session_id}|target=${RESTORE_SERVICE}"

  assert_state_absent "${RESTORE_SESSION}"
  [[ ! -e "${temporary}" && ! -L "${temporary}" ]] \
    || fail 'restore session staging path already exists'
  if ! (set -C; printf '%s\n' "${restore_session_record}" > "${temporary}"); then
    fail 'restore session staging path could not be reserved'
  fi
  chmod 0600 "${temporary}"
  ln -- "${temporary}" "${RESTORE_SESSION}" \
    || fail 'restore session marker could not be reserved atomically'
  rm -- "${temporary}" \
    || fail 'restore session staging link could not be removed'
  [[ ! -e "${temporary}" && ! -L "${temporary}" ]] \
    || fail 'restore session staging link remains'
  [[ -f "${RESTORE_SESSION}" && ! -L "${RESTORE_SESSION}" ]] \
    || fail 'restore session marker was not published safely'
  [[ "$(realpath -e -- "${RESTORE_SESSION}")" == "${RESTORE_SESSION}" ]] \
    || fail 'restore session marker is not canonical'
}

clear_owned_restore_session() {
  local -a records=()
  [[ -f "${RESTORE_SESSION}" && ! -L "${RESTORE_SESSION}" ]] || return 1
  [[ "$(realpath -e -- "${RESTORE_SESSION}")" == "${RESTORE_SESSION}" ]] \
    || return 1
  mapfile -t records < "${RESTORE_SESSION}"
  [[ "${#records[@]}" -eq 1 \
    && "${records[0]}" == "${restore_session_record}" ]] \
    || return 1
  rm -f -- "${RESTORE_SESSION}"
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
    || fail 'restore requires a clean exact-release checkout'
  expected_script_blob="$(
    git -C "${APP_ROOT}" rev-parse \
      "${current_release_sha}:menorah/deploy/server-staging/run-disposable-restore.sh"
  )"
  actual_script_blob="$(
    git -C "${APP_ROOT}" hash-object \
      "${SCRIPT_DIR}/run-disposable-restore.sh"
  )"
  [[ "${actual_script_blob}" == "${expected_script_blob}" ]] \
    || fail 'restore wrapper is not from the recorded current release'
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

[[ "$#" -eq 1 ]] \
  || fail 'usage: run-disposable-restore.sh YYYYMMDDTHHMMSSZ'
readonly STAMP="$1"
[[ "${STAMP}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] \
  || fail 'the explicit backup timestamp is invalid'

for required_command in docker flock git node realpath; do
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
  MENORAH_STAGING_RESTORE_TARGET MENORAH_STAGING_RESTORE_SESSION_ID

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
[[ -d "${RECOVERY_ROOT}" && ! -L "${RECOVERY_ROOT}" ]] \
  || fail 'the staging recovery-state root is unavailable'
[[ "$(realpath -e -- "${RECOVERY_ROOT}")" == "${RECOVERY_ROOT}" ]] \
  || fail 'the staging recovery-state root is not canonical'
for blocking_state in \
  "${BACKUP_LOCK}" \
  "${BACKUP_SESSION}" \
  "${RESTORE_LOCK}" \
  "${RESTORE_SESSION}" \
  "${RESTORE_MARKER}" \
  "${RESTORE_REVIEW}"
do
  assert_state_absent "${blocking_state}"
done
[[ ! -L "${DEPLOY_LOCK}" \
  && ! -L "${BACKUP_LOCK}" \
  && ! -L "${RESTORE_LOCK}" ]] \
  || fail 'staging operation locks must not be symlinks'
exec 9>>"${DEPLOY_LOCK}"
flock -n 9 \
  || fail 'another staging deployment, rollback, backup, or restore is running'
for blocking_state in \
  "${BACKUP_LOCK}" \
  "${BACKUP_SESSION}" \
  "${RESTORE_LOCK}" \
  "${RESTORE_SESSION}" \
  "${RESTORE_MARKER}" \
  "${RESTORE_REVIEW}"
do
  assert_state_absent "${blocking_state}"
done

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
  && "${MENORAH_STAGING_RESTORE_ACK+x}" != x \
  && "${MENORAH_STAGING_RESTORE_TARGET+x}" != x \
  && "${MENORAH_STAGING_RESTORE_SESSION_ID+x}" != x ]] \
  || fail 'operation acknowledgments must not be persisted in the environment'

MENORAH_STAGING_ROOTS_ACK='MENORAH_STAGING_ROOTS_REVIEWED' \
MENORAH_STAGING_RESTORE_ACK='RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET' \
MENORAH_STAGING_RESTORE_TARGET="${RESTORE_SERVICE}" \
  node "${CONTEXT_ASSERTION}" restore >/dev/null

assert_exact_runtime

restore_id=''
publish_restore_session
stop_disposable_target() {
  local original_status="$?" identity
  local -a cleanup_ids=()
  trap - EXIT
  trap '' HUP INT TERM
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
  if [[ "${#cleanup_ids[@]}" -eq 0 && -n "${restore_id}" ]]; then
    printf '%s\n' \
      'Acquired disposable restore target disappeared before stopped-state confirmation.' >&2
    exit 1
  fi
  if [[ "${#cleanup_ids[@]}" -eq 1 ]]; then
    if [[ -n "${restore_id}" && "${cleanup_ids[0]}" != "${restore_id}" ]]; then
      printf '%s\n' \
        'Disposable restore target identity changed during cleanup.' >&2
      exit 1
    fi
    restore_id="${cleanup_ids[0]}"
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
    identity="$(inspect_restore_state "${restore_id}")" || identity=''
    [[ "${identity}" == \
      "exited|false|"*"|${EXPECTED_PROJECT}|${RESTORE_SERVICE}" ]] \
      || {
        printf '%s\n' \
          'Disposable restore target was not confirmed stopped.' >&2
        exit 1
      }
  fi
  clear_owned_restore_session || {
    printf '%s\n' \
      "Disposable restore session could not be cleared safely; ${RESTORE_SESSION} remains blocking." >&2
    exit 1
  }
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
MENORAH_STAGING_RESTORE_SESSION_ID="${restore_session_id}" \
  compose --profile recovery run --rm --no-deps \
    -e MENORAH_STAGING_ROOTS_ACK=MENORAH_STAGING_ROOTS_REVIEWED \
    -e MENORAH_STAGING_RESTORE_ACK=RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET \
    -e MENORAH_STAGING_RESTORE_TARGET="${RESTORE_SERVICE}" \
    -e MENORAH_STAGING_RESTORE_SESSION_ID="${restore_session_id}" \
    "${RESTORE_JOB}" "${STAMP}"
