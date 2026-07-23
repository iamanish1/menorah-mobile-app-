#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
BRANCH="${DEPLOY_BRANCH:?DEPLOY_BRANCH is required and must name the reviewed release branch}"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
LOG_FILE="${STATE_DIR}/deploy.log"
LOCK_FILE="${STATE_DIR}/.deploy.lock"
MIGRATION_MARKER="${STATE_DIR}/migration-applied-sha"
MIGRATION_IN_PROGRESS_MARKER="${STATE_DIR}/migration-in-progress-sha"
RELEASE_SERVICES=(
  landing-page
  user-web-app
  web-app
  admin-panel
  api-ios
  api-android
  api-web
  api-admin
  worker
  reverse-proxy
)
WRITER_SERVICES=(api-ios api-android api-web api-admin worker)

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
  compose_cmd run --rm --no-deps api-web node src/database/migrate.js
}

write_marker_atomically() {
  local target="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp "${STATE_DIR}/.marker.XXXXXX")"
  printf '%s\n' "${value}" > "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${target}"
}

wait_for_health() {
  local check_public="${1:-false}"
  local attempts="${DEPLOY_HEALTH_ATTEMPTS:-18}"
  local delay_seconds="${DEPLOY_HEALTH_DELAY_SECONDS:-5}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if CHECK_PUBLIC="${check_public}" "${SCRIPT_DIR}/health-check.sh"; then
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
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another deployment is already running: ${LOCK_FILE}" >&2
  exit 1
fi

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Production environment file is missing or unreadable: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

require_min_length() {
  local name="$1"
  local minimum="$2"
  local value="${!name:-}"
  if (( ${#value} < minimum )) || [[ "${value}" =~ ^REPLACE ]]; then
    echo "${name} must be configured with at least ${minimum} non-placeholder characters before deployment." >&2
    exit 1
  fi
}

require_min_length DATA_ENCRYPTION_KEY 32
require_min_length AUDIT_LOG_SIGNING_KEY 32
BOOKING_CATALOG_LOWER="${BOOKING_SERVICE_CATALOG_JSON:-}"
BOOKING_CATALOG_LOWER="${BOOKING_CATALOG_LOWER,,}"
if [[ -z "${BOOKING_SERVICE_CATALOG_JSON:-}" || "${BOOKING_CATALOG_LOWER}" == replace* ]]; then
  echo "BOOKING_SERVICE_CATALOG_JSON must contain the owner-approved server pricing catalog." >&2
  exit 1
fi

if [[ -e "${MIGRATION_IN_PROGRESS_MARKER}" ]]; then
  echo "A previous migration may be partially applied: ${MIGRATION_IN_PROGRESS_MARKER}" >&2
  echo "Keep application writers stopped and complete the coordinated recovery review before deploying again." >&2
  exit 1
fi
if [[ "${DATA_ENCRYPTION_KEY}" == "${AUDIT_LOG_SIGNING_KEY}" ]]; then
  echo "DATA_ENCRYPTION_KEY and AUDIT_LOG_SIGNING_KEY must be distinct." >&2
  exit 1
fi
if [[ "${MAX_PAYOUT_AMOUNT_PAISE:-}" != "5000000" ]]; then
  echo "MAX_PAYOUT_AMOUNT_PAISE must equal the approved INR 50,000 per-transaction limit (5000000 paise)." >&2
  exit 1
fi
if [[ "${KYC_CONSENT_VERSION:-}" != "ordinary-face-check-v1-2026-07-22" ]]; then
  echo "KYC_CONSENT_VERSION must equal ordinary-face-check-v1-2026-07-22." >&2
  exit 1
fi
if [[ "${KYC_RETENTION_DAYS:-}" != "365" ]]; then
  echo "KYC_RETENTION_DAYS must equal the approved 365-day face-check retention period." >&2
  exit 1
fi

if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "Working tree has local changes. Commit or remove them before updating." >&2
  git -C "${REPO_ROOT}" status --short
  exit 1
fi

PREVIOUS_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
echo "Previous commit: ${PREVIOUS_SHA}"

git -C "${REPO_ROOT}" fetch origin
git -C "${REPO_ROOT}" checkout "${BRANCH}"
git -C "${REPO_ROOT}" pull --ff-only origin "${BRANCH}"
NEW_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
REMOTE_SHA="$(git -C "${REPO_ROOT}" rev-parse "origin/${BRANCH}")"
if [[ "${NEW_SHA}" != "${REMOTE_SHA}" ]]; then
  echo "Local branch does not exactly match origin/${BRANCH}." >&2
  exit 1
fi

{
  echo "deployTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "previous=${PREVIOUS_SHA}"
  echo "new=${NEW_SHA}"
} >> "${LOG_FILE}"

echo "Creating a fresh pre-migration backup..."
"${SCRIPT_DIR}/backup-now.sh" manual
FRESH_BACKUP_METADATA="${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}/metadata/latest-success-manual.json"
FRESH_ARCHIVE="$(node -e '
  const fs = require("fs");
  const metadata = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!metadata.mongoArchive || typeof metadata.mongoArchive !== "string") process.exit(1);
  process.stdout.write(metadata.mongoArchive);
' "${FRESH_BACKUP_METADATA}")"
if [[ -z "${FRESH_ARCHIVE}" || ! -f "${FRESH_ARCHIVE}" ]]; then
  echo "Fresh backup metadata does not identify a readable MongoDB archive." >&2
  exit 1
fi

echo "Restoring the fresh backup into the isolated restore-test database..."
RESTORE_ARCHIVE="${FRESH_ARCHIVE}" "${SCRIPT_DIR}/restore-latest-backup.sh" restore-test
node -e '
  const fs = require("fs");
  const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (marker.archive !== process.argv[2]) process.exit(1);
' "${MENORAH_BACKUP_ROOT:-/opt/menorah/backups}/restore-tests/latest-success.json" "${FRESH_ARCHIVE}"
BACKUP_TYPE=manual BACKUP_MAX_AGE_HOURS=1 CHECK_RESTORE_TEST=true \
  "${SCRIPT_DIR}/check-backup-health.sh"

echo "Validating Compose and Caddy configuration..."
compose_cmd config --quiet
compose_cmd run --rm --no-deps reverse-proxy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "Building release images before maintenance begins..."
compose_cmd build "${RELEASE_SERVICES[@]}"

echo "Stopping API and worker services for the migration maintenance boundary..."
compose_cmd stop -t "${DEPLOY_STOP_TIMEOUT_SECONDS:-60}" "${WRITER_SERVICES[@]}"

echo "Running the backend migration once with the new release image..."
write_marker_atomically "${MIGRATION_IN_PROGRESS_MARKER}" "${NEW_SHA}"
echo "migration=START sha=${NEW_SHA}" >> "${LOG_FILE}"
if ! run_backend_migrations; then
  echo "Migration failed. API and worker services remain stopped for operator review." >&2
  echo "migration=FAIL sha=${NEW_SHA}" >> "${LOG_FILE}"
  exit 1
fi
write_marker_atomically "${MIGRATION_MARKER}" "${NEW_SHA}"
rm -f -- "${MIGRATION_IN_PROGRESS_MARKER}"
echo "migration=PASS sha=${NEW_SHA}" >> "${LOG_FILE}"

echo "Starting the reviewed release without rebuilding..."
if ! compose_cmd up -d --no-build --no-deps "${RELEASE_SERVICES[@]}"; then
  echo "Release startup failed after migration. Automatic code-only rollback is disabled; operator review is required." >&2
  echo "startup=FAIL sha=${NEW_SHA}" >> "${LOG_FILE}"
  exit 1
fi
if ! compose_cmd exec -T reverse-proxy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
  echo "Caddy reload failed after migration. Automatic code-only rollback is disabled." >&2
  echo "caddyReload=FAIL sha=${NEW_SHA}" >> "${LOG_FILE}"
  exit 1
fi

if wait_for_health false && wait_for_health true; then
  echo "Health result: PASS"
  echo "health=PASS" >> "${LOG_FILE}"
else
  echo "Health result: FAIL after migration. Automatic code-only rollback is disabled; operator review is required." >&2
  echo "health=FAIL" >> "${LOG_FILE}"
  exit 1
fi

printf '%s\n' "${PREVIOUS_SHA}" > "${STATE_DIR}/last-good-sha"
printf '%s\n' "${NEW_SHA}" > "${STATE_DIR}/current-sha"
echo "Update complete: ${NEW_SHA}"
