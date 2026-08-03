#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  echo "Usage: run-mongo-tool-secure.sh <URI_ENV_NAME> <mongodump|mongorestore> [tool arguments...]" >&2
  exit 2
}

(( $# >= 2 )) || usage
uri_environment_name="$1"
tool="$2"
shift 2

case "${uri_environment_name}" in
  MONGODB_BACKUP_URI|MONGODB_RESTORE_TEST_URI|MONGODB_PRODUCTION_RESTORE_URI) ;;
  *)
    echo "Unsupported MongoDB URI environment name: ${uri_environment_name}" >&2
    exit 2
    ;;
esac
case "${tool}" in
  mongodump|mongorestore) ;;
  *)
    echo "Unsupported MongoDB Database Tool: ${tool}" >&2
    exit 2
    ;;
esac

uri="${!uri_environment_name:-}"
if [[ -z "${uri}" || "${uri}" == *$'\n'* || "${uri}" == *$'\r'* ]]; then
  echo "${uri_environment_name} must contain one non-empty MongoDB URI." >&2
  exit 1
fi

config_file="$(mktemp /tmp/menorah-mongo-tool.XXXXXXXX.yml)"
cleanup() {
  rm -f -- "${config_file}"
}
trap cleanup EXIT
chmod 0600 "${config_file}"

# MongoDB Database Tools recommend --config for credential-bearing URIs. YAML
# double-quoted scalar escaping keeps the value out of argv and command logs.
escaped_uri="${uri//\\/\\\\}"
escaped_uri="${escaped_uri//\"/\\\"}"
printf 'uri: "%s"\n' "${escaped_uri}" > "${config_file}"

"${tool}" --config="${config_file}" "$@"
