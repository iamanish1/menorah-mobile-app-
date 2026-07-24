#!/usr/bin/env bash
set -euo pipefail

umask 077
export LC_ALL=C

readonly EXPECTED_PROJECT='menorah-staging'
readonly EXPECTED_ENVIRONMENT_ID='menorah-server-staging-v1'
readonly APP_ROOT='/opt/menorah-staging/app'
readonly ENV_FILE='/opt/menorah-staging/env/server-staging.env'
readonly COMPOSE_FILE='/opt/menorah-staging/app/menorah/deploy/server-staging/compose.yml'
readonly SCRIPT_DIR='/opt/menorah-staging/app/menorah/deploy/server-staging'
readonly ENV_LOADER="${SCRIPT_DIR}/load-environment.mjs"
readonly PROCESS_AUTHORITY="${SCRIPT_DIR}/assert-process-authority.sh"
readonly RUNTIME_VERIFIER="${SCRIPT_DIR}/verify-runtime-services.sh"
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly DEPLOY_LOCK='/opt/menorah-staging/deploy-state/.deploy.lock'
readonly ROLLBACK_LOCK='/opt/menorah-staging/deploy-state/.rollback.lock'
readonly CURRENT_SHA_FILE='/opt/menorah-staging/deploy-state/current-sha'
readonly LAST_GOOD_SHA_FILE='/opt/menorah-staging/deploy-state/last-good-sha'
readonly MIGRATION_IN_PROGRESS='/opt/menorah-staging/deploy-state/migration-in-progress-sha'
readonly IDENTITY_MARKER='/opt/menorah-staging/deploy-state/identity-reconciliation-in-progress-sha'
readonly ROLLBACK_MARKER='/opt/menorah-staging/deploy-state/rollback-in-progress-sha'
readonly RECOVERY_MARKER='/opt/menorah-staging/deploy-state/post-migration-recovery-sha'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'

fail() {
  printf '%s\n' "Server-staging rollback refused: $*" >&2
  exit 1
}

read_sha_marker() {
  local marker="$1" label="$2" value
  [[ -f "${marker}" && ! -L "${marker}" ]] \
    || fail "${label} marker must be a regular non-symlink file"
  value="$(tr -d '\r\n' < "${marker}")"
  [[ "${value}" =~ ^[0-9a-f]{40}$ ]] \
    || fail "${label} marker does not contain one full SHA"
  git -C "${APP_ROOT}" cat-file -e "${value}^{commit}" 2>/dev/null \
    || fail "${label} marker does not name a local commit"
  printf '%s' "${value}"
}

write_sha_marker() {
  local target="$1" value="$2" label="$3" temporary
  case "${target}" in
    /opt/menorah-staging/deploy-state/*) ;;
    *) fail "unsafe ${label} marker path" ;;
  esac
  [[ ! -L "${target}" ]] || fail "${label} marker must not be a symlink"
  temporary="$(mktemp "${STATE_ROOT}/.${label}.XXXXXX")"
  printf '%s\n' "${value}" > "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${target}"
}

stop_application_writers() {
  docker compose \
    --project-name "${EXPECTED_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    stop --timeout 30 \
    staging-api-ios \
    staging-api-android \
    staging-api-web \
    staging-api-admin \
    staging-worker \
    staging-user-web-app \
    >/dev/null 2>&1 || true
}

[[ "$#" -eq 1 ]] || fail 'usage: rollback-recorded.sh FULL_GIT_SHA'
readonly TARGET_SHA="$1"
[[ "${TARGET_SHA}" =~ ^[0-9a-f]{40}$ ]] \
  || fail 'rollback target must be one full lowercase Git SHA'

for required_command in docker flock git mktemp node realpath; do
  command -v "${required_command}" >/dev/null 2>&1 \
    || fail "required command is unavailable: ${required_command}"
done
[[ -f "${ENV_FILE}" && ! -L "${ENV_FILE}" ]] \
  || fail 'the exact staging environment file is unavailable'
[[ "$(realpath -e -- "${ENV_FILE}")" == "${ENV_FILE}" ]] \
  || fail 'the staging environment file is not canonical'
[[ -f "${ENV_LOADER}" && ! -L "${ENV_LOADER}" ]] \
  || fail 'the safe staging environment loader is unavailable'
[[ -f "${PROCESS_AUTHORITY}" && ! -L "${PROCESS_AUTHORITY}" ]] \
  || fail 'the staging process-authority guard is unavailable'
[[ -f "${RUNTIME_VERIFIER}" && ! -L "${RUNTIME_VERIFIER}" ]] \
  || fail 'runtime service verifier is unavailable'

# shellcheck source=/dev/null
source "${PROCESS_AUTHORITY}"
server_staging_assert_process_authority "${EXPECTED_PROJECT}" \
  || fail 'caller process authority is unsafe'

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

[[ "${COMPOSE_PROJECT_NAME+x}" == x \
  && "${COMPOSE_PROJECT_NAME}" == "${EXPECTED_PROJECT}" ]] \
  || fail 'unexpected Compose project'
[[ "${MENORAH_SERVER_STAGING_ENVIRONMENT_ID+x}" == x \
  && "${MENORAH_SERVER_STAGING_ENVIRONMENT_ID}" == "${EXPECTED_ENVIRONMENT_ID}" ]] \
  || fail 'unexpected environment identity'
[[ "${MENORAH_STAGING_ROLLBACK_ACK+x}" == x \
  && "${MENORAH_STAGING_ROLLBACK_ACK}" == 'ROLLBACK_MENORAH_STAGING_RECORDED_ARTIFACTS' ]] \
  || fail 'explicit staging rollback acknowledgment is required'

node "${SCRIPT_DIR}/assert-context.mjs" rollback >/dev/null
node "${SCRIPT_DIR}/assert-context.mjs" release "${TARGET_SHA}" >/dev/null
[[ -z "$(git -C "${APP_ROOT}" status --porcelain --untracked-files=all)" ]] \
  || fail 'recorded rollback requires a clean checkout'
[[ "$(git -C "${APP_ROOT}" rev-parse HEAD)" == "${TARGET_SHA}" ]] \
  || fail 'checkout must already be at the exact recorded rollback SHA'
expected_script_blob="$(
  git -C "${APP_ROOT}" rev-parse \
    "${TARGET_SHA}:menorah/deploy/server-staging/rollback-recorded.sh"
)"
actual_script_blob="$(
  git -C "${APP_ROOT}" hash-object \
    "${SCRIPT_DIR}/rollback-recorded.sh"
)"
[[ "${actual_script_blob}" == "${expected_script_blob}" ]] \
  || fail 'rollback script is not from the exact target commit'

for blocking_marker in \
  "${MIGRATION_IN_PROGRESS}" \
  "${IDENTITY_MARKER}" \
  "${RECOVERY_MARKER}" \
  "${RESTORE_MARKER}" \
  "${RESTORE_REVIEW}"
do
  [[ ! -e "${blocking_marker}" && ! -L "${blocking_marker}" ]] \
    || fail "staging recovery state blocks code rollback: ${blocking_marker}"
done

RECORDED_LAST_GOOD="$(
  read_sha_marker "${LAST_GOOD_SHA_FILE}" 'last-good'
)"
readonly RECORDED_LAST_GOOD
[[ "${TARGET_SHA}" == "${RECORDED_LAST_GOOD}" ]] \
  || fail 'rollback target is not the independently recorded staging last-good SHA'
PREVIOUS_CURRENT="$(
  read_sha_marker "${CURRENT_SHA_FILE}" 'current release'
)"
readonly PREVIOUS_CURRENT

[[ ! -L "${DEPLOY_LOCK}" && ! -L "${ROLLBACK_LOCK}" ]] \
  || fail 'staging deployment locks must not be symlinks'
exec 9>>"${DEPLOY_LOCK}"
flock -n 9 || fail 'another staging deployment or rollback is running'
exec 8>>"${ROLLBACK_LOCK}"
flock -n 8 || fail 'another staging rollback is running'

write_sha_marker \
  "${ROLLBACK_MARKER}" \
  "${TARGET_SHA}" \
  'rollback-in-progress'
rollback_succeeded=false
on_exit() {
  local status="$1"
  if [[ "${status}" -ne 0 && "${rollback_succeeded}" != true ]]; then
    stop_application_writers
    printf '%s\n' \
      "Recorded rollback failed; application writers were stopped and ${ROLLBACK_MARKER} remains for review." \
      >&2
  fi
}
trap 'status=$?; trap - EXIT; on_exit "${status}"; exit "${status}"' EXIT

readonly MANIFEST="${RELEASE_STATE}/${TARGET_SHA}.images"
while IFS='|' read -r service image_reference image_id; do
  [[ "${image_reference}" == */menorah-staging/* \
    && "${image_reference}" =~ @sha256:[0-9a-f]{64}$ \
    && "${image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "rollback artifact is not staging-only: ${service}"
  docker image inspect "${image_id}" >/dev/null \
    || fail "recorded image content is unavailable: ${service}"
  [[ "$(docker image inspect --format '{{.Id}}' "${image_reference}")" == "${image_id}" ]] \
    || fail "recorded digest no longer resolves to its content: ${service}"
done < "${MANIFEST}"

docker compose \
  --project-name "${EXPECTED_PROJECT}" \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  config --quiet
docker compose \
  --project-name "${EXPECTED_PROJECT}" \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  up -d --force-recreate --no-build --pull never --wait --wait-timeout 300

bash "${RUNTIME_VERIFIER}" "${MANIFEST}"

readonly ROLLBACK_RECORD="${RELEASE_STATE}/${PREVIOUS_CURRENT}-to-${TARGET_SHA}.rollback.json"
[[ ! -e "${ROLLBACK_RECORD}" && ! -L "${ROLLBACK_RECORD}" ]] \
  || fail 'immutable rollback record already exists'
rollback_record_temp="$(
  mktemp "${RELEASE_STATE}/.rollback-${TARGET_SHA}.XXXXXX"
)"
completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FROM_SHA_VALUE="${PREVIOUS_CURRENT}" \
TARGET_SHA_VALUE="${TARGET_SHA}" \
COMPLETED_AT_VALUE="${completed_at}" \
  node <<'NODE' > "${rollback_record_temp}"
const record = {
  schemaVersion: 1,
  composeProject: 'menorah-staging',
  environmentId: 'menorah-server-staging-v1',
  filesystemRoot: '/opt/menorah-staging',
  deployStateRoot: '/opt/menorah-staging/deploy-state',
  database: 'menorah_staging',
  replicaSet: 'menorah-staging-rs',
  fromSha: process.env.FROM_SHA_VALUE,
  targetSha: process.env.TARGET_SHA_VALUE,
  mode: 'recorded-code-artifacts-only',
  migrationAction: 'none',
  completedAt: process.env.COMPLETED_AT_VALUE,
};
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
NODE
chmod 0400 "${rollback_record_temp}"
mv -- "${rollback_record_temp}" "${ROLLBACK_RECORD}"
write_sha_marker "${CURRENT_SHA_FILE}" "${TARGET_SHA}" 'current'
rm -f -- "${ROLLBACK_MARKER}"
rollback_succeeded=true
trap - EXIT
printf '%s\n' \
  "Server-staging recorded-artifact rollback passed: ${TARGET_SHA}"
