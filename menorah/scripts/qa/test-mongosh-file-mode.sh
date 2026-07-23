#!/usr/bin/env bash
set -euo pipefail

MONGO_IMAGE='mongo:7@sha256:340c1c56fb10e95cf79ff547f8664b96bc6ead9909bc355238cbf865a9695a6f'

run_mongosh_file() {
  docker run --rm -i --network none --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=4m \
    -e HOME=/tmp \
    "${MONGO_IMAGE}" sh -ceu '
      umask 077
      script_file="$(mktemp /tmp/menorah-managed-mongo.XXXXXXXX.js)"
      cleanup() { rm -f -- "${script_file}"; }
      trap cleanup EXIT
      chmod 0600 "${script_file}"
      cat > "${script_file}"
      mongosh --nodb --quiet --file "${script_file}"
    '
}

success_output="$(
  printf '%s\n' \
    'const values = [1, 2, 3];' \
    'if (values.reduce((total, value) => total + value, 0) !== 6) throw new Error("bad sum");' \
    'print("MENORAH_MONGOSH_FILE_MODE_OK");' \
    | run_mongosh_file
)"
grep -Fx 'MENORAH_MONGOSH_FILE_MODE_OK' <<< "${success_output}" >/dev/null || {
  echo 'mongosh --file did not execute the complete multiline script.' >&2
  exit 1
}

set +e
failure_output="$(
  printf '%s\n' 'throw new Error("MENORAH_MONGOSH_FILE_MODE_FAILURE");' \
    | run_mongosh_file 2>&1
)"
failure_status=$?
set -e
if [[ "${failure_status}" -eq 0 ]]; then
  echo 'mongosh --file swallowed an uncaught script exception.' >&2
  exit 1
fi
grep -F 'MENORAH_MONGOSH_FILE_MODE_FAILURE' <<< "${failure_output}" >/dev/null || {
  echo 'mongosh --file failed without preserving the expected exception evidence.' >&2
  exit 1
}

echo 'Pinned mongosh file-mode exit propagation passed.'
