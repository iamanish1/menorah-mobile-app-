#!/bin/sh
# shellcheck shell=bash
if [ "${1-}" != '__menorah_server_staging_clean_bash_v1__' ] \
  || [ -z "${BASH_VERSION-}" ]
then
  case "${MENORAH_STAGING_RECOVERY_ACK-}" in
    RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION)
      exec /usr/bin/env -i \
        PATH=/usr/sbin:/usr/bin:/sbin:/bin \
        HOME=/root TMPDIR=/tmp LC_ALL=C \
        COMPOSE_PROJECT_NAME=menorah-staging \
        MENORAH_STAGING_RECOVERY_ACK=RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION \
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
readonly RUNTIME_VERIFIER="${SCRIPT_DIR}/verify-runtime-services.sh"
readonly ALERTMANAGER_RELEASE_PREFLIGHT="${SCRIPT_DIR}/assert-alertmanager-release-preflight.sh"
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly DEPLOY_LOCK='/opt/menorah-staging/deploy-state/.deploy.lock'
readonly BACKUP_LOCK='/opt/menorah-staging/deploy-state/.backup.lock'
readonly RESTORE_LOCK='/opt/menorah-staging/deploy-state/.restore.lock'
readonly CURRENT_SHA_FILE='/opt/menorah-staging/deploy-state/current-sha'
readonly LAST_GOOD_SHA_FILE='/opt/menorah-staging/deploy-state/last-good-sha'
readonly MIGRATION_APPLIED='/opt/menorah-staging/deploy-state/migration-applied-sha'
readonly MIGRATION_IN_PROGRESS='/opt/menorah-staging/deploy-state/migration-in-progress-sha'
readonly IDENTITY_MARKER='/opt/menorah-staging/deploy-state/identity-reconciliation-in-progress-sha'
readonly ROLLBACK_MARKER='/opt/menorah-staging/deploy-state/rollback-in-progress-sha'
readonly RECOVERY_MARKER='/opt/menorah-staging/deploy-state/post-migration-recovery-sha'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'
readonly BACKUP_SESSION='/opt/menorah-staging/deploy-state/recovery/backup-session'
readonly RESTORE_SESSION='/opt/menorah-staging/deploy-state/recovery/restore-session'

fail() {
  printf '%s\n' "Server-staging post-migration resume refused: $*" >&2
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

compose() {
  docker compose \
    --project-name "${EXPECTED_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    "$@"
}

stop_application_writers() {
  compose stop --timeout 30 \
    staging-api-ios \
    staging-api-android \
    staging-api-web \
    staging-api-admin \
    staging-worker \
    staging-user-web-app \
    >/dev/null 2>&1 || true
}

load_seed_image_identity() {
  local manifest="$1"
  local service reference image_id extra
  local migration_reference='' migration_image_id='' match_count=0
  local rendered_seed_reference

  while IFS='|' read -r service reference image_id extra; do
    [[ "${service}" == 'staging-migrate' ]] || continue
    match_count=$((match_count + 1))
    migration_reference="${reference}"
    migration_image_id="${image_id}"
    [[ -z "${extra:-}" ]] \
      || fail 'migration image evidence has unexpected fields'
  done < "${manifest}"
  [[ "${match_count}" -eq 1 \
    && "${migration_reference}" =~ @sha256:[0-9a-f]{64}$ \
    && "${migration_image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail 'exact migration image evidence is unavailable for seed recovery'

  rendered_seed_reference="$(
    compose --profile seed config --format json \
      | node -e '
const fs = require("node:fs");
const model = JSON.parse(fs.readFileSync(0, "utf8"));
const seed = model?.services?.["staging-seed"];
if (
  !seed
  || seed.restart !== "no"
  || !Array.isArray(seed.profiles)
  || !seed.profiles.includes("seed")
  || typeof seed.image !== "string"
  || !seed.image.includes("/menorah-staging/")
  || !/@sha256:[0-9a-f]{64}$/.test(seed.image)
) {
  throw new Error("rendered staging-seed image identity is invalid");
}
process.stdout.write(seed.image);
'
  )" || fail 'exact rendered seed image identity is unavailable'
  [[ "${rendered_seed_reference}" == "${migration_reference}" ]] \
    || fail 'seed image differs from the immutable candidate image'
  printf '%s|%s\n' "${migration_reference}" "${migration_image_id}"
}

assert_successful_seed() {
  local service='staging-seed' container_id identity
  local -a container_ids=()
  mapfile -t container_ids < <(compose ps -a -q "${service}")
  [[ "${#container_ids[@]}" -eq 1 && -n "${container_ids[0]}" ]] \
    || fail 'synthetic roster seed is missing or ambiguous'
  container_id="${container_ids[0]}"
  identity="$(
    docker inspect \
      --format '{{.State.Status}}|{{.State.Running}}|{{.State.ExitCode}}|{{.State.OOMKilled}}|{{.RestartCount}}|{{.HostConfig.RestartPolicy.Name}}|{{.Config.Image}}|{{.Image}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}' \
      "${container_id}"
  )"
  [[ "${identity}" == \
    "exited|false|0|false|0|no|${EXPECTED_SEED_IMAGE_REFERENCE}|${EXPECTED_SEED_IMAGE_ID}|${EXPECTED_PROJECT}|${service}|False" ]] \
    || fail 'synthetic roster seed did not complete exactly once'
}

prior_successful_seed_exists() {
  local service='staging-seed' container_output
  local -a container_ids=()
  container_output="$(compose ps -a -q "${service}")" \
    || fail 'prior synthetic roster seed state is unreadable'
  [[ -n "${container_output}" ]] || return 1
  mapfile -t container_ids <<< "${container_output}"
  [[ "${#container_ids[@]}" -eq 1 && -n "${container_ids[0]}" ]] \
    || fail 'prior synthetic roster seed is ambiguous'
  assert_successful_seed
}

[[ "$#" -eq 1 ]] \
  || fail 'usage: resume-post-migration.sh FULL_GIT_SHA'
readonly RELEASE_SHA="$1"
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] \
  || fail 'resume target must be one full lowercase Git SHA'

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
[[ "${MENORAH_STAGING_RECOVERY_ACK+x}" == x \
  && "${MENORAH_STAGING_RECOVERY_ACK}" == \
    'RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION' ]] \
  || fail 'explicit post-migration resume acknowledgment is required'

node "${SCRIPT_DIR}/assert-context.mjs" release "${RELEASE_SHA}" >/dev/null
git -C "${APP_ROOT}" cat-file -e "${RELEASE_SHA}^{commit}" 2>/dev/null \
  || fail 'resume target is not a local commit'
[[ "$(git -C "${APP_ROOT}" rev-parse HEAD)" == "${RELEASE_SHA}" ]] \
  || fail 'checkout must already be at the exact recovery SHA'
[[ -z "$(git -C "${APP_ROOT}" status --porcelain --untracked-files=all)" ]] \
  || fail 'post-migration resume requires a clean checkout'
expected_script_blob="$(
  git -C "${APP_ROOT}" rev-parse \
    "${RELEASE_SHA}:menorah/deploy/server-staging/resume-post-migration.sh"
)"
actual_script_blob="$(
  git -C "${APP_ROOT}" hash-object \
    "${SCRIPT_DIR}/resume-post-migration.sh"
)"
[[ "${actual_script_blob}" == "${expected_script_blob}" ]] \
  || fail 'resume script is not from the exact recovery commit'

bash "${ALERTMANAGER_RELEASE_PREFLIGHT}" \
  || fail 'Alertmanager release preflight failed'

[[ ! -L "${DEPLOY_LOCK}" ]] \
  || fail 'deployment lock must not be a symlink'
exec 9>>"${DEPLOY_LOCK}"
flock -n 9 || fail 'another staging deployment or rollback is running'

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
    || fail "staging recovery state blocks post-migration resume: ${blocking_marker}"
done

recovery_sha="$(read_sha_marker "${RECOVERY_MARKER}" 'post-migration-recovery')"
[[ "${recovery_sha}" == "${RELEASE_SHA}" ]] \
  || fail 'post-migration recovery marker names a different release'

resume_succeeded=false
on_exit() {
  local status="$1"
  if [[ "${status}" -ne 0 && "${resume_succeeded}" != true ]]; then
    stop_application_writers
    printf '%s\n' \
      "Post-migration resume failed; application writers were stopped and ${RECOVERY_MARKER} remains for review." \
      >&2
  fi
}
trap 'status=$?; trap - EXIT; on_exit "${status}"; exit "${status}"' EXIT

applied_sha="$(read_sha_marker "${MIGRATION_APPLIED}" 'migration-applied')"
[[ "${applied_sha}" == "${RELEASE_SHA}" ]] \
  || fail 'recorded migration was not applied for the recovery release'
readonly recovery_sha applied_sha

in_progress_sha=''
if [[ -e "${MIGRATION_IN_PROGRESS}" || -L "${MIGRATION_IN_PROGRESS}" ]]; then
  in_progress_sha="$(
    read_sha_marker "${MIGRATION_IN_PROGRESS}" 'migration-in-progress'
  )"
  [[ "${in_progress_sha}" == "${RELEASE_SHA}" ]] \
    || fail 'migration-in-progress marker names a different release'
fi
readonly in_progress_sha

readonly MANIFEST="${RELEASE_STATE}/${RELEASE_SHA}.images"
readonly DEPLOYMENT_RECORD="${RELEASE_STATE}/${RELEASE_SHA}.deployment.json"
seed_image_identity="$(load_seed_image_identity "${MANIFEST}")"
IFS='|' read -r \
  EXPECTED_SEED_IMAGE_REFERENCE \
  EXPECTED_SEED_IMAGE_ID \
  seed_image_extra \
  <<< "${seed_image_identity}"
[[ -n "${EXPECTED_SEED_IMAGE_REFERENCE}" \
  && -n "${EXPECTED_SEED_IMAGE_ID}" \
  && -z "${seed_image_extra:-}" ]] \
  || fail 'exact seed image evidence could not be parsed'
readonly EXPECTED_SEED_IMAGE_REFERENCE EXPECTED_SEED_IMAGE_ID
unset seed_image_identity seed_image_extra

deployment_record_exists=false
previous_sha=''
if [[ -e "${DEPLOYMENT_RECORD}" || -L "${DEPLOYMENT_RECORD}" ]]; then
  [[ -f "${DEPLOYMENT_RECORD}" && ! -L "${DEPLOYMENT_RECORD}" ]] \
    || fail 'deployment record must be a regular non-symlink file'
  previous_sha="$(
    RELEASE_SHA_VALUE="${RELEASE_SHA}" \
    ALERTMANAGER_CONFIG_SHA256_VALUE="${ALERTMANAGER_CONFIG_SHA256}" \
    ALERTMANAGER_RECEIVER_VALUE="${ALERTMANAGER_RECEIVER}" \
    ALERTMANAGER_ENDPOINT_HOST_VALUE="${ALERTMANAGER_DELIVERY_ENDPOINT_HOST}" \
    ALERTMANAGER_CONFIG_REVIEWED_AT_VALUE="${ALERTMANAGER_CONFIG_REVIEWED_AT}" \
    ALERTMANAGER_CONFIG_REVIEW_REFERENCE_VALUE="${ALERTMANAGER_CONFIG_REVIEW_REFERENCE}" \
      node - "${DEPLOYMENT_RECORD}" <<'NODE'
const fs = require('node:fs');
const path = process.argv[2];
const record = JSON.parse(fs.readFileSync(path, 'utf8'));
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
  if (record[key] !== value) {
    throw new Error(`deployment record ${key} is invalid`);
  }
}
if (![
  'applied-or-already-applied',
  'already-applied-before-resume',
].includes(record.migrationStatus)) {
  throw new Error('deployment record migrationStatus is invalid');
}
if (
  record.recoveryMode !== undefined
  && record.recoveryMode !== 'post-migration-code-resume'
) {
  throw new Error('deployment record recoveryMode is invalid');
}
if (
  record.previousSha !== null
  && !/^[0-9a-f]{40}$/.test(record.previousSha)
) {
  throw new Error('deployment record previousSha is invalid');
}
const createdSeedDisposition = 'created-bounded-synthetic-roster';
const preservedSeedDisposition =
  'preserved-existing-bounded-synthetic-roster';
if (
  record.previousSha === null
  && record.seedDisposition !== createdSeedDisposition
) {
  throw new Error(
    'first-deployment record seedDisposition is invalid',
  );
}
if (
  record.previousSha !== null
  && record.seedDisposition !== preservedSeedDisposition
) {
  throw new Error(
    'update deployment record seedDisposition is invalid',
  );
}
if (
  typeof record.completedAt !== 'string'
  || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.completedAt)
) {
  throw new Error('deployment record completedAt is invalid');
}
process.stdout.write(record.previousSha || '');
NODE
  )" || fail 'existing successful deployment record is invalid'
  deployment_record_exists=true
fi

current_sha=''
if [[ -e "${CURRENT_SHA_FILE}" || -L "${CURRENT_SHA_FILE}" ]]; then
  current_sha="$(read_sha_marker "${CURRENT_SHA_FILE}" 'current release')"
fi
if [[ "${deployment_record_exists}" == true ]]; then
  if [[ -n "${previous_sha}" ]]; then
    [[ "${current_sha}" == "${previous_sha}" \
      || "${current_sha}" == "${RELEASE_SHA}" ]] \
      || fail 'current release disagrees with the existing deployment record'
  else
    [[ -z "${current_sha}" || "${current_sha}" == "${RELEASE_SHA}" ]] \
      || fail 'current release disagrees with first-deployment evidence'
  fi
else
  [[ "${current_sha}" != "${RELEASE_SHA}" ]] \
    || fail 'current release names a target with no deployment record'
  previous_sha="${current_sha}"
fi
if [[ -n "${previous_sha}" ]]; then
  git -C "${APP_ROOT}" cat-file -e "${previous_sha}^{commit}" 2>/dev/null \
    || fail 'previous deployment record SHA is not a local commit'
fi
readonly previous_sha current_sha deployment_record_exists

compose config --quiet
compose up -d --no-build --pull never --wait --wait-timeout 300
bash "${RUNTIME_VERIFIER}" "${MANIFEST}"

seed_disposition='preserved-existing-bounded-synthetic-roster'
if [[ "${deployment_record_exists}" != true && -z "${current_sha}" ]]; then
  if prior_successful_seed_exists; then
    :
  else
    compose \
      --profile seed \
      up --no-deps --force-recreate --no-build --pull never \
      --abort-on-container-exit \
      --exit-code-from staging-seed \
      staging-seed
    assert_successful_seed
  fi
  seed_disposition='created-bounded-synthetic-roster'
fi
readonly seed_disposition

if [[ "${deployment_record_exists}" != true ]]; then
  deployment_record_temp="$(
    mktemp "${RELEASE_STATE}/.deployment-${RELEASE_SHA}.XXXXXX"
  )"
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  RELEASE_SHA_VALUE="${RELEASE_SHA}" \
  PREVIOUS_SHA_VALUE="${previous_sha}" \
  SEED_DISPOSITION_VALUE="${seed_disposition}" \
  ALERTMANAGER_CONFIG_SHA256_VALUE="${ALERTMANAGER_CONFIG_SHA256}" \
  ALERTMANAGER_RECEIVER_VALUE="${ALERTMANAGER_RECEIVER}" \
  ALERTMANAGER_ENDPOINT_HOST_VALUE="${ALERTMANAGER_DELIVERY_ENDPOINT_HOST}" \
  ALERTMANAGER_CONFIG_REVIEWED_AT_VALUE="${ALERTMANAGER_CONFIG_REVIEWED_AT}" \
  ALERTMANAGER_CONFIG_REVIEW_REFERENCE_VALUE="${ALERTMANAGER_CONFIG_REVIEW_REFERENCE}" \
  COMPLETED_AT_VALUE="${completed_at}" \
    node <<'NODE' > "${deployment_record_temp}"
const record = {
  schemaVersion: 1,
  composeProject: 'menorah-staging',
  environmentId: 'menorah-server-staging-v1',
  filesystemRoot: '/opt/menorah-staging',
  deployStateRoot: '/opt/menorah-staging/deploy-state',
  database: 'menorah_staging',
  replicaSet: 'menorah-staging-rs',
  releaseSha: process.env.RELEASE_SHA_VALUE,
  previousSha: process.env.PREVIOUS_SHA_VALUE || null,
  migrationStatus: 'already-applied-before-resume',
  healthStatus: 'passed',
  recoveryMode: 'post-migration-code-resume',
  seedDisposition: process.env.SEED_DISPOSITION_VALUE,
  alertmanagerConfigSha256:
    process.env.ALERTMANAGER_CONFIG_SHA256_VALUE,
  alertmanagerReceiver: process.env.ALERTMANAGER_RECEIVER_VALUE,
  alertmanagerEndpointHost:
    process.env.ALERTMANAGER_ENDPOINT_HOST_VALUE,
  alertmanagerConfigReviewedAt:
    process.env.ALERTMANAGER_CONFIG_REVIEWED_AT_VALUE,
  alertmanagerConfigReviewReference:
    process.env.ALERTMANAGER_CONFIG_REVIEW_REFERENCE_VALUE,
  completedAt: process.env.COMPLETED_AT_VALUE,
};
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
NODE
  chmod 0400 "${deployment_record_temp}"
  mv -- "${deployment_record_temp}" "${DEPLOYMENT_RECORD}"
fi

if [[ -n "${previous_sha}" && "${previous_sha}" != "${RELEASE_SHA}" ]]; then
  write_sha_marker \
    "${LAST_GOOD_SHA_FILE}" \
    "${previous_sha}" \
    'last-good'
fi
write_sha_marker "${CURRENT_SHA_FILE}" "${RELEASE_SHA}" 'current'
if [[ -n "${in_progress_sha}" ]]; then
  rm -f -- "${MIGRATION_IN_PROGRESS}"
fi
rm -f -- "${RECOVERY_MARKER}"
resume_succeeded=true
trap - EXIT
printf '%s\n' \
  "Server-staging post-migration resume passed: ${RELEASE_SHA}"
