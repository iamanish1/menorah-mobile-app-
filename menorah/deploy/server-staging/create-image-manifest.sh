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
readonly LIFECYCLE_HELPER="${SCRIPT_DIR}/service-lifecycle.mjs"
readonly ALERTMANAGER_RELEASE_PREFLIGHT="${SCRIPT_DIR}/assert-alertmanager-release-preflight.sh"
readonly RELEASE_STATE='/opt/menorah-staging/deploy-state/releases'
readonly MANIFEST_LOCK='/opt/menorah-staging/deploy-state/.manifest.lock'

fail() {
  printf '%s\n' "Server-staging manifest refused: $*" >&2
  exit 1
}

[[ "$#" -eq 1 ]] || fail 'usage: create-image-manifest.sh FULL_GIT_SHA'
readonly RELEASE_SHA="$1"
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] \
  || fail 'release must be one full lowercase Git SHA'

for required_command in docker flock git mktemp node realpath sha256sum; do
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
[[ -f "${LIFECYCLE_HELPER}" && ! -L "${LIFECYCLE_HELPER}" ]] \
  || fail 'service lifecycle helper is unavailable'
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
[[ "${MENORAH_STAGING_MANIFEST_ACK+x}" == x \
  && "${MENORAH_STAGING_MANIFEST_ACK}" == 'RECORD_MENORAH_STAGING_IMMUTABLE_IMAGES' ]] \
  || fail 'explicit staging image-manifest acknowledgment is required'

node "${SCRIPT_DIR}/assert-context.mjs" manifest >/dev/null
[[ "$(realpath -e -- "${APP_ROOT}")" == "${APP_ROOT}" ]] \
  || fail 'application checkout is not canonical'
[[ "$(git -C "${APP_ROOT}" rev-parse HEAD)" == "${RELEASE_SHA}" ]] \
  || fail 'application checkout is not the exact requested SHA'
git -C "${APP_ROOT}" cat-file -e "${RELEASE_SHA}^{commit}" 2>/dev/null \
  || fail 'requested SHA is not a local commit'
[[ -z "$(git -C "${APP_ROOT}" status --porcelain --untracked-files=all)" ]] \
  || fail 'exact-SHA manifest capture requires a clean checkout'
EXPECTED_SCRIPT_BLOB="$(
  git -C "${APP_ROOT}" rev-parse \
    "${RELEASE_SHA}:menorah/deploy/server-staging/create-image-manifest.sh"
)"
readonly EXPECTED_SCRIPT_BLOB
ACTUAL_SCRIPT_BLOB="$(
  git -C "${APP_ROOT}" hash-object \
    "${SCRIPT_DIR}/create-image-manifest.sh"
)"
readonly ACTUAL_SCRIPT_BLOB
[[ "${ACTUAL_SCRIPT_BLOB}" == "${EXPECTED_SCRIPT_BLOB}" ]] \
  || fail 'manifest script is not from the exact requested commit'

bash "${ALERTMANAGER_RELEASE_PREFLIGHT}" \
  || fail 'Alertmanager release preflight failed'

[[ ! -L "${MANIFEST_LOCK}" ]] \
  || fail 'manifest lock must not be a symlink'
exec 9>>"${MANIFEST_LOCK}"
flock -n 9 || fail 'another staging manifest capture is running'

readonly MANIFEST="${RELEASE_STATE}/${RELEASE_SHA}.images"
readonly CHECKSUM="${MANIFEST}.sha256"
readonly METADATA="${RELEASE_STATE}/${RELEASE_SHA}.json"
for target in "${MANIFEST}" "${CHECKSUM}" "${METADATA}"; do
  [[ ! -e "${target}" && ! -L "${target}" ]] \
    || fail "immutable release evidence already exists: ${target}"
done

CONFIG_TEMP="$(mktemp "${RELEASE_STATE}/.compose-${RELEASE_SHA}.XXXXXX")"
RECORDS_TEMP="$(mktemp "${RELEASE_STATE}/.records-${RELEASE_SHA}.XXXXXX")"
MANIFEST_TEMP="$(mktemp "${RELEASE_STATE}/.images-${RELEASE_SHA}.XXXXXX")"
CHECKSUM_TEMP="$(mktemp "${RELEASE_STATE}/.checksum-${RELEASE_SHA}.XXXXXX")"
METADATA_TEMP="$(mktemp "${RELEASE_STATE}/.metadata-${RELEASE_SHA}.XXXXXX")"
cleanup() {
  rm -f -- \
    "${CONFIG_TEMP}" \
    "${RECORDS_TEMP}" \
    "${MANIFEST_TEMP}" \
    "${CHECKSUM_TEMP}" \
    "${METADATA_TEMP}"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

docker compose \
  --project-name "${EXPECTED_PROJECT}" \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  --profile migration \
  config --format json > "${CONFIG_TEMP}"

node "${LIFECYCLE_HELPER}" \
  manifest "${CONFIG_TEMP}" > "${RECORDS_TEMP}"

while IFS='|' read -r service reference extra; do
  [[ -n "${service}" && -n "${reference}" && -z "${extra:-}" ]] \
    || fail 'rendered staging image record is invalid'
  image_id="$(docker image inspect --format '{{.Id}}' "${reference}")" \
    || fail "digest-qualified image is unavailable locally: ${service}"
  [[ "${image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "image content identity is invalid: ${service}"
  printf '%s|%s|%s\n' "${service}" "${reference}" "${image_id}" \
    >> "${MANIFEST_TEMP}"
done < "${RECORDS_TEMP}"

[[ -s "${MANIFEST_TEMP}" ]] || fail 'image manifest contains no records'
manifest_sha256="$(sha256sum "${MANIFEST_TEMP}" | awk '{print $1}')"
[[ "${manifest_sha256}" =~ ^[0-9a-f]{64}$ ]] \
  || fail 'image manifest checksum is invalid'
printf '%s  %s.images\n' "${manifest_sha256}" "${RELEASE_SHA}" \
  > "${CHECKSUM_TEMP}"
source_tree_sha="$(git -C "${APP_ROOT}" rev-parse 'HEAD^{tree}')"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

RELEASE_SHA_VALUE="${RELEASE_SHA}" \
SOURCE_TREE_SHA_VALUE="${source_tree_sha}" \
MANIFEST_PATH_VALUE="${MANIFEST}" \
MANIFEST_SHA256_VALUE="${manifest_sha256}" \
CREATED_AT_VALUE="${created_at}" \
  node <<'NODE' > "${METADATA_TEMP}"
const metadata = {
  schemaVersion: 1,
  composeProject: 'menorah-staging',
  environmentId: 'menorah-server-staging-v1',
  filesystemRoot: '/opt/menorah-staging',
  appRoot: '/opt/menorah-staging/app',
  dataRoot: '/opt/menorah-staging/data',
  backupRoot: '/opt/menorah-staging/backups',
  deployStateRoot: '/opt/menorah-staging/deploy-state',
  logsRoot: '/opt/menorah-staging/logs',
  environmentRoot: '/opt/menorah-staging/env',
  database: 'menorah_staging',
  replicaSet: 'menorah-staging-rs',
  releaseSha: process.env.RELEASE_SHA_VALUE,
  sourceTreeSha: process.env.SOURCE_TREE_SHA_VALUE,
  manifestPath: process.env.MANIFEST_PATH_VALUE,
  manifestSha256: process.env.MANIFEST_SHA256_VALUE,
  createdAt: process.env.CREATED_AT_VALUE,
  status: 'manifested',
};
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
NODE

chmod 0400 \
  "${MANIFEST_TEMP}" \
  "${CHECKSUM_TEMP}" \
  "${METADATA_TEMP}"
mv -- "${MANIFEST_TEMP}" "${MANIFEST}"
mv -- "${CHECKSUM_TEMP}" "${CHECKSUM}"
mv -- "${METADATA_TEMP}" "${METADATA}"
node "${SCRIPT_DIR}/assert-context.mjs" release "${RELEASE_SHA}" >/dev/null

trap - EXIT HUP INT TERM
rm -f -- "${CONFIG_TEMP}" "${RECORDS_TEMP}"
printf '%s\n' \
  "Immutable server-staging image manifest recorded: ${RELEASE_SHA}"
