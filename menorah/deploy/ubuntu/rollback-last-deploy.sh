#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
TARGET_SHA_FILE="${STATE_DIR}/last-good-sha"
MIGRATION_MARKER="${STATE_DIR}/migration-applied-sha"
MIGRATION_IN_PROGRESS_MARKER="${STATE_DIR}/migration-in-progress-sha"
LOCK_FILE="${STATE_DIR}/.deploy.lock"

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

mkdir -p "${STATE_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another deployment or rollback is already running: ${LOCK_FILE}" >&2
  exit 1
fi

if [[ -e "${MIGRATION_IN_PROGRESS_MARKER}" ]]; then
  echo "Code-only rollback is blocked because a database migration may be partially applied." >&2
  echo "Keep application writers stopped and follow the coordinated database and application recovery runbook." >&2
  exit 1
fi

if [[ ! -f "${TARGET_SHA_FILE}" ]]; then
  echo "No previous deploy SHA found at ${TARGET_SHA_FILE}" >&2
  exit 1
fi

TARGET_SHA="$(cat "${TARGET_SHA_FILE}")"
CURRENT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"

if ! git -C "${REPO_ROOT}" cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null; then
  echo "Rollback target is not a valid local commit: ${TARGET_SHA}" >&2
  exit 1
fi

if [[ -s "${MIGRATION_MARKER}" ]]; then
  MIGRATED_SHA="$(cat "${MIGRATION_MARKER}")"
  if [[ "${MIGRATED_SHA}" != "${TARGET_SHA}" ]]; then
    echo "Code-only rollback is blocked because database migrations were applied at ${MIGRATED_SHA}." >&2
    echo "Keep application writers stopped and follow the coordinated database and application recovery runbook." >&2
    exit 1
  fi
fi

if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "Working tree has local changes. Refusing to overwrite them during rollback." >&2
  git -C "${REPO_ROOT}" status --short
  exit 1
fi

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
