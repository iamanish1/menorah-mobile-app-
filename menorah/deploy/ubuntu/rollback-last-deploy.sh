#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
TARGET_SHA_FILE="${STATE_DIR}/last-good-sha"

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

if [[ ! -f "${TARGET_SHA_FILE}" ]]; then
  echo "No previous deploy SHA found at ${TARGET_SHA_FILE}" >&2
  exit 1
fi

TARGET_SHA="$(cat "${TARGET_SHA_FILE}")"
CURRENT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"

echo "Rolling back from ${CURRENT_SHA} to ${TARGET_SHA}"
git -C "${REPO_ROOT}" checkout "${TARGET_SHA}"
compose_cmd up -d --build

if "${SCRIPT_DIR}/health-check.sh"; then
  printf '%s\n' "${TARGET_SHA}" > "${STATE_DIR}/current-sha"
  echo "Rollback complete: ${TARGET_SHA}"
else
  echo "Rollback health check failed. Inspect services before changing traffic." >&2
  exit 1
fi
