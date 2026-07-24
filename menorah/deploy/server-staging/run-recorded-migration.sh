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
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly MIGRATION_LOCK='/opt/menorah-staging/deploy-state/.migration.lock'
readonly APPLIED_MARKER='/opt/menorah-staging/deploy-state/migration-applied-sha'
readonly IN_PROGRESS_MARKER='/opt/menorah-staging/deploy-state/migration-in-progress-sha'
readonly IDENTITY_MARKER='/opt/menorah-staging/deploy-state/identity-reconciliation-in-progress-sha'
readonly ROLLBACK_MARKER='/opt/menorah-staging/deploy-state/rollback-in-progress-sha'
readonly RECOVERY_MARKER='/opt/menorah-staging/deploy-state/post-migration-recovery-sha'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'

fail() {
  printf '%s\n' "Server-staging migration refused: $*" >&2
  exit 1
}

read_sha_marker() {
  marker="$1"
  label="$2"
  [[ -f "${marker}" && ! -L "${marker}" ]] \
    || fail "${label} marker must be a regular non-symlink file"
  value="$(tr -d '\r\n' < "${marker}")"
  [[ "${value}" =~ ^[0-9a-f]{40}$ ]] \
    || fail "${label} marker does not contain one full SHA"
  printf '%s' "${value}"
}

write_sha_marker() {
  target="$1"
  value="$2"
  label="$3"
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

[[ "$#" -eq 1 ]] || fail 'usage: run-recorded-migration.sh FULL_GIT_SHA'
readonly RELEASE_SHA="$1"
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] \
  || fail 'migration target must be one full lowercase Git SHA'

for required_command in awk docker flock git mktemp node realpath; do
  command -v "${required_command}" >/dev/null 2>&1 \
    || fail "required command is unavailable: ${required_command}"
done
[[ -f "${ENV_FILE}" && ! -L "${ENV_FILE}" ]] \
  || fail 'the exact staging environment file is unavailable'
[[ "$(realpath -e -- "${ENV_FILE}")" == "${ENV_FILE}" ]] \
  || fail 'the staging environment file is not canonical'
[[ -f "${ENV_LOADER}" && ! -L "${ENV_LOADER}" ]] \
  || fail 'the safe staging environment loader is unavailable'

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
[[ "${MENORAH_STAGING_MIGRATION_ACK+x}" == x \
  && "${MENORAH_STAGING_MIGRATION_ACK}" == 'MIGRATE_MENORAH_STAGING_RECORDED_SHA' ]] \
  || fail 'explicit staging migration acknowledgment is required'

node "${SCRIPT_DIR}/assert-context.mjs" migration >/dev/null
node "${SCRIPT_DIR}/assert-context.mjs" release "${RELEASE_SHA}" >/dev/null
[[ "$(git -C "${APP_ROOT}" rev-parse HEAD)" == "${RELEASE_SHA}" ]] \
  || fail 'migration checkout is not the exact recorded SHA'
[[ -z "$(git -C "${APP_ROOT}" status --porcelain --untracked-files=all)" ]] \
  || fail 'recorded migration requires a clean checkout'
expected_script_blob="$(
  git -C "${APP_ROOT}" rev-parse \
    "${RELEASE_SHA}:menorah/deploy/server-staging/run-recorded-migration.sh"
)"
actual_script_blob="$(
  git -C "${APP_ROOT}" hash-object \
    "${SCRIPT_DIR}/run-recorded-migration.sh"
)"
[[ "${actual_script_blob}" == "${expected_script_blob}" ]] \
  || fail 'migration script is not from the exact recorded commit'

for blocking_marker in \
  "${IDENTITY_MARKER}" \
  "${ROLLBACK_MARKER}" \
  "${RECOVERY_MARKER}" \
  "${RESTORE_MARKER}" \
  "${RESTORE_REVIEW}"
do
  [[ ! -e "${blocking_marker}" && ! -L "${blocking_marker}" ]] \
    || fail "staging recovery state blocks migration: ${blocking_marker}"
done

[[ ! -L "${MIGRATION_LOCK}" ]] \
  || fail 'migration lock must not be a symlink'
exec 8>>"${MIGRATION_LOCK}"
flock -n 8 || fail 'another staging migration is running'

if [[ -e "${APPLIED_MARKER}" || -L "${APPLIED_MARKER}" ]]; then
  applied_sha="$(read_sha_marker "${APPLIED_MARKER}" 'migration-applied')"
  if [[ "${applied_sha}" == "${RELEASE_SHA}" ]]; then
    if [[ -e "${IN_PROGRESS_MARKER}" || -L "${IN_PROGRESS_MARKER}" ]]; then
      in_progress_sha="$(
        read_sha_marker "${IN_PROGRESS_MARKER}" 'migration-in-progress'
      )"
      [[ "${in_progress_sha}" == "${RELEASE_SHA}" ]] \
        || fail 'applied and in-progress migration state disagree'
      rm -f -- "${IN_PROGRESS_MARKER}"
    fi
    printf '%s\n' \
      "Server-staging migration already applied safely: ${RELEASE_SHA}"
    exit 0
  fi
fi
if [[ -e "${IN_PROGRESS_MARKER}" || -L "${IN_PROGRESS_MARKER}" ]]; then
  in_progress_sha="$(
    read_sha_marker "${IN_PROGRESS_MARKER}" 'migration-in-progress'
  )"
  fail "migration interruption requires review before retry: ${in_progress_sha}"
fi

readonly MANIFEST="${RELEASE_STATE}/${RELEASE_SHA}.images"
migration_record="$(
  awk -F'|' '
    $1 == "staging-migrate" {
      count += 1
      record = $0
    }
    END {
      if (count != 1) exit 1
      print record
    }
  ' "${MANIFEST}"
)" || fail 'manifest must contain exactly one staging-migrate artifact'
IFS='|' read -r service image_reference image_id extra <<< "${migration_record}"
[[ "${service}" == 'staging-migrate' \
  && "${image_reference}" == */menorah-staging/* \
  && "${image_reference}" =~ @sha256:[0-9a-f]{64}$ \
  && "${image_id}" =~ ^sha256:[0-9a-f]{64}$ \
  && -z "${extra:-}" ]] \
  || fail 'recorded staging migration artifact is invalid'
[[ "$(docker image inspect --format '{{.Id}}' "${image_reference}")" == "${image_id}" ]] \
  || fail 'recorded staging migration digest no longer resolves to its content'
docker image inspect "${image_id}" >/dev/null \
  || fail 'recorded staging migration image content is unavailable'

rendered_migration_reference="$(
  docker compose \
    --project-name "${EXPECTED_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    config --format json \
    | node -e '
      let source = "";
      process.stdin.on("data", (chunk) => { source += chunk; });
      process.stdin.on("end", () => {
        const model = JSON.parse(source);
        const value = model.services?.["staging-migrate"]?.image;
        if (typeof value !== "string") process.exit(1);
        process.stdout.write(value);
      });
    '
)" || fail 'unable to resolve the staging migration service'
[[ "${rendered_migration_reference}" == "${image_reference}" ]] \
  || fail 'rendered migration artifact differs from the recorded manifest'

write_sha_marker \
  "${IN_PROGRESS_MARKER}" \
  "${RELEASE_SHA}" \
  'migration-in-progress'
MENORAH_STAGING_MIGRATION_IMAGE_ID="${image_id}" \
  docker compose \
    --project-name "${EXPECTED_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    run --rm --no-deps --pull never staging-migrate
write_sha_marker \
  "${APPLIED_MARKER}" \
  "${RELEASE_SHA}" \
  'migration-applied'
rm -f -- "${IN_PROGRESS_MARKER}"
printf '%s\n' "Server-staging migration applied: ${RELEASE_SHA}"
