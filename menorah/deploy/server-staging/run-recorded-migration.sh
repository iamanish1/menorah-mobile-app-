#!/bin/sh
# shellcheck shell=bash
if [ "${1-}" != '__menorah_server_staging_clean_bash_v1__' ] \
  || [ -z "${BASH_VERSION-}" ]
then
  case "${MENORAH_STAGING_MIGRATION_ACK-}" in
    MIGRATE_MENORAH_STAGING_RECORDED_SHA)
      exec /usr/bin/env -i \
        PATH=/usr/sbin:/usr/bin:/sbin:/bin \
        HOME=/root TMPDIR=/tmp LC_ALL=C \
        COMPOSE_PROJECT_NAME=menorah-staging \
        MENORAH_STAGING_MIGRATION_ACK=MIGRATE_MENORAH_STAGING_RECORDED_SHA \
        /bin/bash --noprofile --norc "$0" \
        '__menorah_server_staging_clean_bash_v1__' "$@"
      ;;
    *)
      exec /usr/bin/env -i \
        PATH=/usr/sbin:/usr/bin:/sbin:/bin \
        HOME=/root TMPDIR=/tmp LC_ALL=C \
        COMPOSE_PROJECT_NAME=menorah-staging \
        /bin/bash --noprofile --norc "$0" \
        '__menorah_server_staging_clean_bash_v1__' "$@"
      ;;
  esac
fi
shift
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
readonly ALERTMANAGER_RELEASE_PREFLIGHT="${SCRIPT_DIR}/assert-alertmanager-release-preflight.sh"
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly CURRENT_SHA_FILE='/opt/menorah-staging/deploy-state/current-sha'
readonly DEPLOY_LOCK='/opt/menorah-staging/deploy-state/.deploy.lock'
readonly MIGRATION_LOCK='/opt/menorah-staging/deploy-state/.migration.lock'
readonly BACKUP_LOCK='/opt/menorah-staging/deploy-state/.backup.lock'
readonly RESTORE_LOCK='/opt/menorah-staging/deploy-state/.restore.lock'
readonly APPLIED_MARKER='/opt/menorah-staging/deploy-state/migration-applied-sha'
readonly IN_PROGRESS_MARKER='/opt/menorah-staging/deploy-state/migration-in-progress-sha'
readonly IDENTITY_MARKER='/opt/menorah-staging/deploy-state/identity-reconciliation-in-progress-sha'
readonly ROLLBACK_MARKER='/opt/menorah-staging/deploy-state/rollback-in-progress-sha'
readonly RECOVERY_MARKER='/opt/menorah-staging/deploy-state/post-migration-recovery-sha'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'
readonly BACKUP_SESSION='/opt/menorah-staging/deploy-state/recovery/backup-session'
readonly RESTORE_SESSION='/opt/menorah-staging/deploy-state/recovery/restore-session'

fail() {
  printf '%s\n' "Server-staging migration refused: $*" >&2
  exit 1
}

acquire_shared_deploy_lock() {
  local lock_fd_target

  [[ ! -L "${DEPLOY_LOCK}" ]] \
    || fail 'deployment lock must not be a symlink'

  if [[ -e '/proc/self/fd/9' ]]; then
    lock_fd_target="$(realpath -e -- '/proc/self/fd/9')" \
      || fail 'unable to resolve inherited deployment-lock descriptor'
    [[ "${lock_fd_target}" == "${DEPLOY_LOCK}" ]] \
      || fail 'inherited descriptor 9 is not the staging deployment lock'
  else
    exec 9>>"${DEPLOY_LOCK}"
  fi

  [[ -f "${DEPLOY_LOCK}" && ! -L "${DEPLOY_LOCK}" ]] \
    || fail 'deployment lock must be a regular non-symlink file'
  lock_fd_target="$(realpath -e -- '/proc/self/fd/9')" \
    || fail 'unable to resolve deployment-lock descriptor'
  [[ "${lock_fd_target}" == "${DEPLOY_LOCK}" ]] \
    || fail 'deployment-lock descriptor escaped the staging state root'
  flock -n 9 \
    || fail 'another staging deployment, migration, backup, restore, or rollback is running'
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

compose() {
  docker compose \
    --project-name "${EXPECTED_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    "$@"
}

assert_running_healthy_prerequisite() {
  local service="$1" container_id identity
  local -a container_ids=()
  mapfile -t container_ids < <(compose ps -a -q "${service}")
  [[ "${#container_ids[@]}" -eq 1 && -n "${container_ids[0]}" ]] \
    || fail "migration prerequisite is missing or ambiguous: ${service}"
  container_id="${container_ids[0]}"
  identity="$(
    docker inspect \
      --format '{{.State.Status}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}' \
      "${container_id}"
  )"
  [[ "${identity}" == \
    "running|true|healthy|${EXPECTED_PROJECT}|${service}|False" ]] \
    || fail "migration prerequisite is not healthy: ${service}"
}

assert_successful_initializer() {
  local service="$1" container_id identity
  local -a container_ids=()
  mapfile -t container_ids < <(compose ps -a -q "${service}")
  [[ "${#container_ids[@]}" -eq 1 && -n "${container_ids[0]}" ]] \
    || fail "migration initializer is missing or ambiguous: ${service}"
  container_id="${container_ids[0]}"
  identity="$(
    docker inspect \
      --format '{{.State.Status}}|{{.State.Running}}|{{.State.ExitCode}}|{{.State.OOMKilled}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}' \
      "${container_id}"
  )"
  [[ "${identity}" == \
    "exited|false|0|false|${EXPECTED_PROJECT}|${service}|False" ]] \
    || fail "migration initializer did not complete successfully: ${service}"
}

deployment_record_is_complete() {
  local deployment_record current_sha
  deployment_record="${RELEASE_STATE}/${RELEASE_SHA}.deployment.json"
  if [[ ! -e "${deployment_record}" && ! -L "${deployment_record}" ]]; then
    return 1
  fi
  [[ -f "${deployment_record}" && ! -L "${deployment_record}" ]] \
    || fail 'successful deployment record must be a regular non-symlink file'
  current_sha="$(read_sha_marker "${CURRENT_SHA_FILE}" 'current release')"
  [[ "${current_sha}" == "${RELEASE_SHA}" ]] \
    || fail 'successful deployment record disagrees with current release'
  RELEASE_SHA_VALUE="${RELEASE_SHA}" \
  ALERTMANAGER_CONFIG_SHA256_VALUE="${ALERTMANAGER_CONFIG_SHA256}" \
  ALERTMANAGER_RECEIVER_VALUE="${ALERTMANAGER_RECEIVER}" \
  ALERTMANAGER_ENDPOINT_HOST_VALUE="${ALERTMANAGER_DELIVERY_ENDPOINT_HOST}" \
  ALERTMANAGER_CONFIG_REVIEWED_AT_VALUE="${ALERTMANAGER_CONFIG_REVIEWED_AT}" \
  ALERTMANAGER_CONFIG_REVIEW_REFERENCE_VALUE="${ALERTMANAGER_CONFIG_REVIEW_REFERENCE}" \
    node - "${deployment_record}" <<'NODE' >/dev/null \
    || fail 'successful deployment record is invalid'
const fs = require('node:fs');
const record = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = {
  schemaVersion: 1,
  composeProject: 'menorah-staging',
  environmentId: 'menorah-server-staging-v1',
  filesystemRoot: '/opt/menorah-staging',
  deployStateRoot: '/opt/menorah-staging/deploy-state',
  database: 'menorah_staging',
  replicaSet: 'menorah-staging-rs',
  releaseSha: process.env.RELEASE_SHA_VALUE,
  healthStatus: 'passed',
  alertmanagerConfigSha256:
    process.env.ALERTMANAGER_CONFIG_SHA256_VALUE,
  alertmanagerReceiver: process.env.ALERTMANAGER_RECEIVER_VALUE,
  alertmanagerEndpointHost:
    process.env.ALERTMANAGER_ENDPOINT_HOST_VALUE,
  alertmanagerConfigReviewedAt:
    process.env.ALERTMANAGER_CONFIG_REVIEWED_AT_VALUE,
  alertmanagerConfigReviewReference:
    process.env.ALERTMANAGER_CONFIG_REVIEW_REFERENCE_VALUE,
};
for (const [key, value] of Object.entries(expected)) {
  if (record[key] !== value) process.exit(1);
}
NODE
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
[[ -f "${PROCESS_AUTHORITY}" && ! -L "${PROCESS_AUTHORITY}" ]] \
  || fail 'the staging process-authority guard is unavailable'
[[ -f "${ALERTMANAGER_RELEASE_PREFLIGHT}" \
  && ! -L "${ALERTMANAGER_RELEASE_PREFLIGHT}" ]] \
  || fail 'Alertmanager release preflight is unavailable'

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

# Deploy invokes this script while holding descriptor 9. A direct migration
# invocation opens the same shared lock itself. Reusing only the exact inherited
# descriptor avoids self-deadlock without accepting an arbitrary caller-owned fd.
acquire_shared_deploy_lock

for blocking_marker in \
  "${IDENTITY_MARKER}" \
  "${ROLLBACK_MARKER}" \
  "${BACKUP_LOCK}" \
  "${BACKUP_SESSION}" \
  "${RESTORE_LOCK}" \
  "${RESTORE_SESSION}" \
  "${RESTORE_MARKER}" \
  "${RESTORE_REVIEW}"
do
  [[ ! -e "${blocking_marker}" && ! -L "${blocking_marker}" ]] \
    || fail "staging recovery state blocks migration: ${blocking_marker}"
done

bash "${ALERTMANAGER_RELEASE_PREFLIGHT}" \
  || fail 'Alertmanager release preflight failed'

[[ ! -L "${MIGRATION_LOCK}" ]] \
  || fail 'migration lock must not be a symlink'
exec 8>>"${MIGRATION_LOCK}"
flock -n 8 || fail 'another staging migration is running'

recovery_sha=''
if [[ -e "${RECOVERY_MARKER}" || -L "${RECOVERY_MARKER}" ]]; then
  recovery_sha="$(
    read_sha_marker "${RECOVERY_MARKER}" 'post-migration-recovery'
  )"
  [[ "${recovery_sha}" == "${RELEASE_SHA}" ]] \
    || fail 'post-migration recovery marker names a different release'
fi

if [[ -e "${APPLIED_MARKER}" || -L "${APPLIED_MARKER}" ]]; then
  applied_sha="$(read_sha_marker "${APPLIED_MARKER}" 'migration-applied')"
  if [[ "${applied_sha}" == "${RELEASE_SHA}" ]]; then
    if [[ -z "${recovery_sha}" ]]; then
      if deployment_record_is_complete; then
        recovery_sha='deployment-complete'
      else
        write_sha_marker \
          "${RECOVERY_MARKER}" \
          "${RELEASE_SHA}" \
          'post-migration-recovery'
        recovery_sha="${RELEASE_SHA}"
      fi
    fi
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
[[ -z "${recovery_sha}" ]] \
  || fail 'post-migration recovery exists without a matching applied migration'
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
  compose --profile migration config --format json \
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

assert_running_healthy_prerequisite 'staging-mongo-primary'
assert_running_healthy_prerequisite 'staging-redis'
assert_successful_initializer 'staging-mongo-replica-init'

write_sha_marker \
  "${IN_PROGRESS_MARKER}" \
  "${RELEASE_SHA}" \
  'migration-in-progress'
MENORAH_STAGING_MIGRATION_IMAGE_ID="${image_id}" \
  compose run --rm --no-deps --pull never staging-migrate
write_sha_marker \
  "${RECOVERY_MARKER}" \
  "${RELEASE_SHA}" \
  'post-migration-recovery'
write_sha_marker \
  "${APPLIED_MARKER}" \
  "${RELEASE_SHA}" \
  'migration-applied'
rm -f -- "${IN_PROGRESS_MARKER}"
printf '%s\n' "Server-staging migration applied: ${RELEASE_SHA}"
