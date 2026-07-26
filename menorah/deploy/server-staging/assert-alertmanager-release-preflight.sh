#!/usr/bin/env bash
set -euo pipefail

umask 077
export LC_ALL=C

readonly ENV_FILE='/opt/menorah-staging/env/server-staging.env'
readonly SCRIPT_DIR='/opt/menorah-staging/app/menorah/deploy/server-staging'
readonly ENVIRONMENT_VALIDATOR="${SCRIPT_DIR}/validate-environment.mjs"
readonly ALERTMANAGER_CONFIG_TARGET='/etc/alertmanager/alertmanager.yml'
readonly ALERTMANAGER_IMAGE='prom/alertmanager:v0.32.1@sha256:51a825c2a40acc3e338fdd00d622e01ec090f72be2b3ea46be0839cd47a4d286'

refuse() {
  printf '%s\n' \
    'Server-staging Alertmanager release preflight refused: validation failed.' \
    >&2
  exit 1
}

[[ "$#" -eq 0 ]] || refuse
for required_command in docker node realpath; do
  command -v "${required_command}" >/dev/null 2>&1 || refuse
done
[[ -f "${ENV_FILE}" && ! -L "${ENV_FILE}" ]] || refuse
[[ "$(realpath -e -- "${ENV_FILE}" 2>/dev/null)" == "${ENV_FILE}" ]] \
  || refuse
[[ -f "${ENVIRONMENT_VALIDATOR}" \
  && ! -L "${ENVIRONMENT_VALIDATOR}" ]] || refuse

alertmanager_config_source="$(
  node "${ENVIRONMENT_VALIDATOR}" \
    --env "${ENV_FILE}" \
    --print-alertmanager-source \
    2>/dev/null
)" || refuse
[[ -n "${alertmanager_config_source}" \
  && -f "${alertmanager_config_source}" \
  && ! -L "${alertmanager_config_source}" ]] || refuse
[[ "$(
  realpath -e -- "${alertmanager_config_source}" 2>/dev/null
)" == "${alertmanager_config_source}" ]] || refuse

docker image inspect "${ALERTMANAGER_IMAGE}" >/dev/null 2>&1 || refuse
docker run \
  --rm \
  --pull never \
  --network none \
  --user '65534:65534' \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 32 \
  --memory 64m \
  --cpus 0.25 \
  --tmpfs /alertmanager:rw,noexec,nosuid,nodev,size=1m,mode=1777 \
  --mount \
    "type=bind,source=${alertmanager_config_source},target=${ALERTMANAGER_CONFIG_TARGET},readonly" \
  --entrypoint /bin/sh \
  "${ALERTMANAGER_IMAGE}" \
  -euc \
  'test -r "$1"; exec /bin/amtool check-config "$1" >/dev/null 2>&1' \
  sh \
  "${ALERTMANAGER_CONFIG_TARGET}" \
  >/dev/null 2>&1 \
  || refuse
