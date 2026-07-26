#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
PREVIOUS_EPOCH_ID="${1:-}"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Production environment file is missing or unreadable: ${ENV_FILE}" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

exec node "${SCRIPT_DIR}/backup-integrity-epoch.js" activate "${PREVIOUS_EPOCH_ID}"
