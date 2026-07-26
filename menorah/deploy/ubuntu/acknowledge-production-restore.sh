#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/../.." && pwd)"
STATE_DIR="${MENORAH_DEPLOY_STATE_ROOT:-/opt/menorah/deploy-state}"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
LOCK_FILE="${STATE_DIR}/.deploy.lock"
REVIEW_MARKER="${STATE_DIR}/production-restore-requires-review.json"
IN_PROGRESS_MARKER="${STATE_DIR}/production-restore-in-progress.json"
HISTORY_DIR="${STATE_DIR}/restore-history"
WRITER_SERVICES=(api-ios api-android api-web api-admin worker)

if [[ "${RESTORE_RECOVERY_CONFIRM:-}" != "ACKNOWLEDGE_SCHEMA_AND_MIGRATION_REVIEW" ]]; then
  echo "Set RESTORE_RECOVERY_CONFIRM=ACKNOWLEDGE_SCHEMA_AND_MIGRATION_REVIEW only after the recorded review." >&2
  exit 1
fi
if [[ ! "${RESTORE_RECOVERY_APPROVED_RELEASE_SHA:-}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "RESTORE_RECOVERY_APPROVED_RELEASE_SHA must be a full reviewed commit SHA." >&2
  exit 1
fi
RECOVERY_REVIEW_REFERENCE="${RESTORE_RECOVERY_REVIEW_REFERENCE:-}"
if (( ${#RECOVERY_REVIEW_REFERENCE} < 8 || ${#RECOVERY_REVIEW_REFERENCE} > 200 )) \
  || [[ "${RECOVERY_REVIEW_REFERENCE}" == *$'\n'* \
    || "${RECOVERY_REVIEW_REFERENCE}" == *$'\r'* ]]; then
  echo "RESTORE_RECOVERY_REVIEW_REFERENCE must identify the approved schema/migration review." >&2
  exit 1
fi

mkdir -p "${STATE_DIR}" "${HISTORY_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another deployment, rollback, bootstrap, or restore is running." >&2
  exit 1
fi
if [[ -e "${IN_PROGRESS_MARKER}" || ! -r "${REVIEW_MARKER}" ]]; then
  echo "A completed production restore review marker is required, with no in-progress restore." >&2
  exit 1
fi

CURRENT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
if [[ "${CURRENT_SHA,,}" != "${RESTORE_RECOVERY_APPROVED_RELEASE_SHA,,}" ]]; then
  echo "The approved recovery release SHA does not match the checkout." >&2
  exit 1
fi
if ! REVIEW_FILE="${REVIEW_MARKER}" \
  EXPECTED_SHA="${CURRENT_SHA}" \
  EXPECTED_ARCHIVE_SHA="${RESTORE_RECOVERY_ARCHIVE_SHA256:-}" \
  EXPECTED_SANITIZED_SHA="${RESTORE_RECOVERY_SANITIZED_SHA256:-}" \
  node -e '
    const fs = require("fs");
    const state = JSON.parse(fs.readFileSync(process.env.REVIEW_FILE, "utf8"));
    if (state.status !== "production-restore-requires-schema-review"
      || state.currentReleaseSha !== process.env.EXPECTED_SHA
      || !/^[0-9a-f]{64}$/.test(process.env.EXPECTED_ARCHIVE_SHA || "")
      || state.archiveSha256 !== process.env.EXPECTED_ARCHIVE_SHA
      || !/^[0-9a-f]{64}$/.test(process.env.EXPECTED_SANITIZED_SHA || "")
      || state.sanitizedArchiveSha256 !== process.env.EXPECTED_SANITIZED_SHA
      || state.sanitizedArtifactType !== "menorah-sanitized-restore"
      || JSON.stringify(state.namespaceAllowlist) !== JSON.stringify(["menorah.*"])
      || !/^[0-9a-f]{64}$/.test(state.nonMenorahControlFingerprintBefore || "")
      || state.nonMenorahControlFingerprintBefore !== state.nonMenorahControlFingerprintAfter) process.exit(1);
  '; then
  echo "Recovery approval does not match the recorded source, sanitized artifact, namespace, and control fingerprints." >&2
  exit 1
fi

compose_cmd() {
  docker compose -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    --env-file "${ENV_FILE}" "$@"
}
for service in "${WRITER_SERVICES[@]}"; do
  container="$(compose_cmd ps -a -q "${service}" 2>/dev/null || true)"
  if [[ -n "${container}" && "$(docker inspect --format '{{.State.Running}}' "${container}")" != "false" ]]; then
    echo "Writer service must remain stopped until the guarded update completes: ${service}" >&2
    exit 1
  fi
done

HISTORY_FILE="${HISTORY_DIR}/$(date -u +%Y%m%dT%H%M%SZ)-reviewed.json"
RESTORE_REVIEWED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
RESTORE_REVIEW_REFERENCE="${RECOVERY_REVIEW_REFERENCE}" \
  node -e '
    const fs = require("fs");
    const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    state.status = "production-restore-schema-review-acknowledged";
    state.reviewedAt = process.env.RESTORE_REVIEWED_AT;
    state.reviewReference = process.env.RESTORE_REVIEW_REFERENCE;
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  ' "${REVIEW_MARKER}" > "${HISTORY_FILE}"
chmod 0600 "${HISTORY_FILE}"
rm -f -- "${REVIEW_MARKER}"

echo "Recovery review acknowledged. Writers remain stopped and no migration marker was created."
echo "Run update-from-git.sh for the exact approved SHA so migrations execute once before writers restart."
