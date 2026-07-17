#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
BRANCH="${DEPLOY_BRANCH:-architecture/self-host-cloudrun-failover}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
LOG_FILE="${STATE_DIR}/deploy.log"

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

run_backend_migrations() {
  # Database hostnames are private to the Compose app network, so migrations
  # must run in a backend container rather than on the Ubuntu host.
  compose_cmd run --rm --no-deps --build api-web src/database/migrate.js
}

wait_for_health() {
  local attempts="${DEPLOY_HEALTH_ATTEMPTS:-18}"
  local delay_seconds="${DEPLOY_HEALTH_DELAY_SECONDS:-5}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if "${SCRIPT_DIR}/health-check.sh"; then
      return 0
    fi

    if (( attempt < attempts )); then
      echo "Health check attempt ${attempt}/${attempts} failed; retrying in ${delay_seconds}s." >&2
      sleep "${delay_seconds}"
    fi
  done

  return 1
}

mkdir -p "${STATE_DIR}"

if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain --untracked-files=no)" ]]; then
  echo "Working tree has tracked local changes. Commit or stash before updating." >&2
  git -C "${REPO_ROOT}" status --short
  exit 1
fi

PREVIOUS_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
echo "Previous commit: ${PREVIOUS_SHA}"

git -C "${REPO_ROOT}" fetch origin
git -C "${REPO_ROOT}" checkout "${BRANCH}"
git -C "${REPO_ROOT}" pull --ff-only origin "${BRANCH}"
NEW_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"

printf '%s\n' "${PREVIOUS_SHA}" > "${STATE_DIR}/last-good-sha"
printf '%s\n' "${NEW_SHA}" > "${STATE_DIR}/current-sha"

{
  echo "deployTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "previous=${PREVIOUS_SHA}"
  echo "new=${NEW_SHA}"
} >> "${LOG_FILE}"

echo "Running backend migrations..."
run_backend_migrations

echo "Building and restarting services..."
compose_cmd up -d --build

if wait_for_health; then
  echo "Health result: PASS"
  echo "health=PASS" >> "${LOG_FILE}"
else
  echo "Health result: FAIL. Rolling back to ${PREVIOUS_SHA}" >&2
  echo "health=FAIL" >> "${LOG_FILE}"
  git -C "${REPO_ROOT}" checkout "${PREVIOUS_SHA}"
  compose_cmd up -d --build
  if wait_for_health; then
    echo "Rollback result: PASS"
    echo "rollback=PASS" >> "${LOG_FILE}"
    printf '%s\n' "${PREVIOUS_SHA}" > "${STATE_DIR}/current-sha"
    exit 1
  fi
  echo "Rollback result: FAIL" >&2
  echo "rollback=FAIL" >> "${LOG_FILE}"
  exit 1
fi

echo "Update complete: ${NEW_SHA}"
