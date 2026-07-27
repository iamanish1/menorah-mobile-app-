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
AUTH_WRITE_SERVICES=(api-ios api-android api-web api-admin worker)
AUTH_WRITES_QUIESCED=0
MIGRATIONS_COMPLETED=0

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

quiesce_account_writers() {
  # Database hostnames are private to the Compose app network, so migrations
  # must run in a backend container rather than on the Ubuntu host. Quiesce
  # every process that can create or mutate accounts first: the social-phone
  # migration rebuilds a unique index and must never run alongside the old
  # API code, which still writes synthetic phone values.
  echo "Quiescing account-writing services for database migration..."
  compose_cmd stop "${AUTH_WRITE_SERVICES[@]}"
  AUTH_WRITES_QUIESCED=1
}

resume_pre_migration_writers() {
  # This is safe only before the migration command has started. It is used
  # when the backup preflight fails, leaving the old schema untouched.
  compose_cmd start "${AUTH_WRITE_SERVICES[@]}" || compose_cmd up -d "${AUTH_WRITE_SERVICES[@]}"
  AUTH_WRITES_QUIESCED=0
}

run_backend_migrations() {
  if (( AUTH_WRITES_QUIESCED != 1 )); then
    echo "Refusing to migrate while account writers are not quiesced." >&2
    return 1
  fi

  # The backend image has no ENTRYPOINT; pass the Node executable explicitly
  # rather than relying on Docker to execute a JavaScript source path.
  if ! compose_cmd run --rm --no-deps api-web node src/database/migrate.js; then
    # Do not restart the old API image here. A migration can have completed
    # only partially, and the old image is not compatible with the new schema.
    # Leave account writers stopped until an operator completes forward
    # recovery from the verified pre-migration backup.
    echo "Migration failed after account writers were quiesced. Account-writing services remain stopped; manual forward recovery is required." >&2
    echo "migration=FAIL writers=QUIESCED manual_recovery=REQUIRED" >> "${LOG_FILE}"
    return 1
  fi

  MIGRATIONS_COMPLETED=1
  echo "migration=PASS" >> "${LOG_FILE}"
}

run_pre_migration_backup() {
  # The backup script verifies the encrypted archive checksum before it
  # returns. It runs while account writers are stopped, giving this release a
  # coherent recovery checkpoint without relying on a best-effort live dump.
  echo "Creating a verified pre-migration backup..."
  "${SCRIPT_DIR}/backup-now.sh" manual
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

printf '%s\n' "${NEW_SHA}" > "${STATE_DIR}/current-sha"

{
  echo "deployTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "previous=${PREVIOUS_SHA}"
  echo "new=${NEW_SHA}"
} >> "${LOG_FILE}"

echo "Building release images before migration..."
compose_cmd build

# The proxy configuration is bind-mounted and is not compiled into an image.
# Validate the checked-out Caddyfile before any irreversible schema work or
# writer downtime.
echo "Validating reverse-proxy configuration..."
compose_cmd run --rm --no-deps reverse-proxy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

quiesce_account_writers

if ! run_pre_migration_backup; then
  echo "Pre-migration backup failed before schema changes; restoring the existing account-writing services." >&2
  resume_pre_migration_writers
  exit 1
fi

echo "Running backend migrations..."
run_backend_migrations

echo "Building and restarting services..."
compose_cmd up -d
# Caddy reads its bind-mounted Caddyfile only at process start. Compose does
# not recreate a container merely because the contents of that bind mount
# changed, so force a narrow proxy recreation to activate edge-route changes
# such as the HTTPS App/Universal Link association endpoints.
compose_cmd up -d --no-deps --force-recreate reverse-proxy
AUTH_WRITES_QUIESCED=0

if wait_for_health; then
  echo "Health result: PASS"
  echo "health=PASS" >> "${LOG_FILE}"
  printf '%s\n' "${NEW_SHA}" > "${STATE_DIR}/last-good-sha"
else
  # Do not automatically roll code back after an irreversible schema
  # migration. Preserve the new services and require an operator to make a
  # forward-recovery decision with the verified checkpoint above.
  echo "Health result: FAIL. New release remains deployed; manual forward recovery is required." >&2
  echo "health=FAIL" >> "${LOG_FILE}"
  if (( MIGRATIONS_COMPLETED == 1 )); then
    echo "post_migration_health=FAIL manual_recovery=REQUIRED" >> "${LOG_FILE}"
  fi
  exit 1
fi

echo "Update complete: ${NEW_SHA}"
