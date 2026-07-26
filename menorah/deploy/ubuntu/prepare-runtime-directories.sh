#!/bin/sh
set -eu

CONFIRMATION="${MENORAH_RUNTIME_DIRECTORY_PREP_CONFIRM:-}"
DATA_ROOT="${MENORAH_RUNTIME_DATA_ROOT:-}"
MEDIA_GROUP_ID="${MENORAH_MEDIA_GROUP_ID:-}"

fail() {
  echo "Runtime directory preparation failed: $*" >&2
  exit 1
}

[ "${CONFIRMATION}" = "PREPARE_EMPTY_HOST_RUNTIME_DIRECTORIES" ] \
  || fail "explicit empty-host preparation confirmation is required"
[ "$(id -u)" = "0" ] \
  || fail "the preparation helper must run as container root"
[ -n "${DATA_ROOT}" ] && [ "${DATA_ROOT#/}" != "${DATA_ROOT}" ] \
  || fail "MENORAH_RUNTIME_DATA_ROOT must be an absolute path"
[ "${DATA_ROOT}" != "/" ] \
  || fail "MENORAH_RUNTIME_DATA_ROOT must not be the filesystem root"
case "${DATA_ROOT}" in
  *','*|*':'*|*'
'*|*''*) fail "MENORAH_RUNTIME_DATA_ROOT contains an unsafe mount character" ;;
esac
case "${MEDIA_GROUP_ID}" in
  ''|*[!0-9]*) fail "MENORAH_MEDIA_GROUP_ID must be a positive numeric gid" ;;
esac
[ "${MEDIA_GROUP_ID}" -gt 0 ] \
  || fail "MENORAH_MEDIA_GROUP_ID must be a positive numeric gid"

mkdir -p \
  "${DATA_ROOT}/uploads" \
  "${DATA_ROOT}/prometheus" \
  "${DATA_ROOT}/alertmanager" \
  "${DATA_ROOT}/monitoring-textfile" \
  "${DATA_ROOT}/grafana" \
  "${DATA_ROOT}/alloy" \
  "${DATA_ROOT}/loki"

for relative_path in \
  uploads \
  prometheus \
  alertmanager \
  monitoring-textfile \
  grafana \
  alloy \
  loki; do
  target="${DATA_ROOT}/${relative_path}"
  [ -d "${target}" ] && [ ! -L "${target}" ] \
    || fail "runtime target is not a regular directory: ${target}"
  if ! first_entry="$(find "${target}" -mindepth 1 -print -quit)"; then
    fail "runtime target could not be traversed safely: ${target}"
  fi
  if [ -n "${first_entry}" ]; then
    fail "empty-host runtime target already contains data: ${target}"
  fi
done

while IFS='|' read -r owner mode relative_path; do
  target="${DATA_ROOT}/${relative_path}"
  [ -d "${target}" ] && [ ! -L "${target}" ] \
    || fail "runtime target is not a regular directory: ${target}"
  chown "${owner}:${MEDIA_GROUP_ID}" "${target}"
  # GNU chmod preserves setgid on directories unless the numeric mode includes
  # an explicit special-bit field. Empty-host parents are intentionally setgid,
  # so use two leading zeroes to clear inherited special bits everywhere except
  # the shared uploads directory, whose reviewed mode is 2770.
  chmod "00${mode}" "${target}"
  actual="$(stat -c '%u:%g:%a' "${target}")"
  [ "${actual}" = "${owner}:${MEDIA_GROUP_ID}:${mode}" ] \
    || fail "runtime target ownership or mode verification failed: ${target}"
done <<'EOF'
100|2770|uploads
65534|770|prometheus
65534|770|alertmanager
65534|770|monitoring-textfile
472|770|grafana
0|770|alloy
10001|770|loki
EOF

echo "Prepared empty-host runtime directories with verified container ownership and modes."
