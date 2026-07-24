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
readonly ALERTMANAGER_RELEASE_PREFLIGHT="${SCRIPT_DIR}/assert-alertmanager-release-preflight.sh"
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly DEPLOY_LOCK='/opt/menorah-staging/deploy-state/.deploy.lock'
readonly CURRENT_SHA_FILE='/opt/menorah-staging/deploy-state/current-sha'
readonly LAST_GOOD_SHA_FILE='/opt/menorah-staging/deploy-state/last-good-sha'
readonly MIGRATION_APPLIED='/opt/menorah-staging/deploy-state/migration-applied-sha'
readonly MIGRATION_IN_PROGRESS='/opt/menorah-staging/deploy-state/migration-in-progress-sha'
readonly IDENTITY_MARKER='/opt/menorah-staging/deploy-state/identity-reconciliation-in-progress-sha'
readonly ROLLBACK_MARKER='/opt/menorah-staging/deploy-state/rollback-in-progress-sha'
readonly RECOVERY_MARKER='/opt/menorah-staging/deploy-state/post-migration-recovery-sha'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'

fail() {
  printf '%s\n' "Server-staging deployment refused: $*" >&2
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

assert_successful_seed() {
  local service='staging-seed' container_id identity
  local -a container_ids=()
  mapfile -t container_ids < <(compose ps -a -q "${service}")
  [[ "${#container_ids[@]}" -eq 1 && -n "${container_ids[0]}" ]] \
    || fail 'synthetic roster seed is missing or ambiguous'
  container_id="${container_ids[0]}"
  identity="$(
    docker inspect \
      --format '{{.State.Status}}|{{.State.Running}}|{{.State.ExitCode}}|{{.State.OOMKilled}}|{{.RestartCount}}|{{.HostConfig.RestartPolicy.Name}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}' \
      "${container_id}"
  )"
  [[ "${identity}" == \
    "exited|false|0|false|0|no|${EXPECTED_PROJECT}|${service}|False" ]] \
    || fail 'synthetic roster seed did not complete exactly once'
}

[[ "$#" -eq 1 ]] || fail 'usage: deploy-exact-sha.sh FULL_GIT_SHA'
readonly RELEASE_SHA="$1"
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] \
  || fail 'deployment target must be one full lowercase Git SHA'

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
[[ "${MENORAH_STAGING_DEPLOY_ACK+x}" == x \
  && "${MENORAH_STAGING_DEPLOY_ACK}" == 'DEPLOY_EXACT_MENORAH_STAGING_SHA' ]] \
  || fail 'explicit staging deployment acknowledgment is required'

node "${SCRIPT_DIR}/assert-context.mjs" deploy >/dev/null
git -C "${APP_ROOT}" cat-file -e "${RELEASE_SHA}^{commit}" 2>/dev/null \
  || fail 'requested SHA is not a local commit'
[[ "$(git -C "${APP_ROOT}" rev-parse HEAD)" == "${RELEASE_SHA}" ]] \
  || fail 'checkout must already be detached or checked out at the exact SHA'
[[ -z "$(git -C "${APP_ROOT}" status --porcelain --untracked-files=all)" ]] \
  || fail 'exact-SHA deployment requires a clean checkout'
expected_script_blob="$(
  git -C "${APP_ROOT}" rev-parse \
    "${RELEASE_SHA}:menorah/deploy/server-staging/deploy-exact-sha.sh"
)"
actual_script_blob="$(
  git -C "${APP_ROOT}" hash-object \
    "${SCRIPT_DIR}/deploy-exact-sha.sh"
)"
[[ "${actual_script_blob}" == "${expected_script_blob}" ]] \
  || fail 'deployment script is not from the exact requested commit'

for blocking_marker in \
  "${MIGRATION_IN_PROGRESS}" \
  "${IDENTITY_MARKER}" \
  "${ROLLBACK_MARKER}" \
  "${RECOVERY_MARKER}" \
  "${RESTORE_MARKER}" \
  "${RESTORE_REVIEW}"
do
  [[ ! -e "${blocking_marker}" && ! -L "${blocking_marker}" ]] \
    || fail "staging recovery state blocks deployment: ${blocking_marker}"
done
bash "${ALERTMANAGER_RELEASE_PREFLIGHT}" \
  || fail 'Alertmanager release preflight failed'

[[ ! -L "${DEPLOY_LOCK}" ]] \
  || fail 'deployment lock must not be a symlink'
exec 9>>"${DEPLOY_LOCK}"
flock -n 9 || fail 'another staging deployment or rollback is running'

previous_sha=''
if [[ -e "${CURRENT_SHA_FILE}" || -L "${CURRENT_SHA_FILE}" ]]; then
  previous_sha="$(read_sha_marker "${CURRENT_SHA_FILE}" 'current release')"
fi
readonly previous_sha

compose config --quiet

# Server deployment may fetch only the digest-qualified images already reviewed
# in the rendered staging configuration. Historical rollback never reaches this
# path and is intentionally pull-free.
compose \
  --profile migration \
  pull --policy always

readonly MANIFEST="${RELEASE_STATE}/${RELEASE_SHA}.images"
readonly DEPLOYMENT_RECORD="${RELEASE_STATE}/${RELEASE_SHA}.deployment.json"
if [[ -e "${MANIFEST}" || -L "${MANIFEST}" ]]; then
  node "${SCRIPT_DIR}/assert-context.mjs" release "${RELEASE_SHA}" >/dev/null
else
  MENORAH_STAGING_MANIFEST_ACK='RECORD_MENORAH_STAGING_IMMUTABLE_IMAGES' \
    "${SCRIPT_DIR}/create-image-manifest.sh" "${RELEASE_SHA}"
fi
[[ ! -e "${DEPLOYMENT_RECORD}" && ! -L "${DEPLOYMENT_RECORD}" ]] \
  || fail 'immutable successful deployment record already exists'

# A first deployment has no existing Compose dependencies for the migration
# job. Reconcile the isolated datastores, wait for them to become healthy, and
# run the idempotent replica/user initializer before invoking the no-deps job.
compose \
  up -d --no-build --pull never --wait --wait-timeout 300 \
  staging-mongo-primary \
  staging-redis
assert_running_healthy_prerequisite 'staging-mongo-primary'
assert_running_healthy_prerequisite 'staging-redis'
compose \
  up --no-deps --force-recreate --no-build --pull never \
  --abort-on-container-exit \
  --exit-code-from staging-mongo-replica-init \
  staging-mongo-replica-init
assert_successful_initializer 'staging-mongo-replica-init'

MENORAH_STAGING_MIGRATION_ACK='MIGRATE_MENORAH_STAGING_RECORDED_SHA' \
  "${SCRIPT_DIR}/run-recorded-migration.sh" "${RELEASE_SHA}"
recovery_sha="$(read_sha_marker \
  "${RECOVERY_MARKER}" \
  'post-migration-recovery')"
applied_sha="$(read_sha_marker \
  "${MIGRATION_APPLIED}" \
  'migration-applied')"
[[ "${recovery_sha}" == "${RELEASE_SHA}" \
  && "${applied_sha}" == "${RELEASE_SHA}" ]] \
  || fail 'migration did not establish exact post-migration recovery state'
readonly recovery_sha applied_sha

deployment_succeeded=false
on_exit() {
  local status="$1"
  if [[ "${status}" -ne 0 && "${deployment_succeeded}" != true ]]; then
    stop_application_writers
    printf '%s\n' \
      "Deployment stopped after migration; application writers were stopped and ${RECOVERY_MARKER} remains for recovery." \
      >&2
  fi
}
trap 'status=$?; trap - EXIT; on_exit "${status}"; exit "${status}"' EXIT

compose up -d --no-build --pull never --wait --wait-timeout 300
bash "${RUNTIME_VERIFIER}" "${MANIFEST}"

seed_disposition='preserved-existing-bounded-synthetic-roster'
if [[ -z "${previous_sha}" ]]; then
  compose \
    --profile seed \
    up --no-deps --force-recreate --no-build --pull never \
    --abort-on-container-exit \
    --exit-code-from staging-seed \
    staging-seed
  assert_successful_seed
  seed_disposition='created-bounded-synthetic-roster'
fi
readonly seed_disposition

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
  migrationStatus: 'applied-or-already-applied',
  healthStatus: 'passed',
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

if [[ -n "${previous_sha}" && "${previous_sha}" != "${RELEASE_SHA}" ]]; then
  write_sha_marker \
    "${LAST_GOOD_SHA_FILE}" \
    "${previous_sha}" \
    'last-good'
fi
write_sha_marker "${CURRENT_SHA_FILE}" "${RELEASE_SHA}" 'current'
rm -f -- "${RECOVERY_MARKER}"
deployment_succeeded=true
trap - EXIT
printf '%s\n' \
  "Server-staging exact-SHA deployment passed: ${RELEASE_SHA}"
