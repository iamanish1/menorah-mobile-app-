#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
IMAGE_MANIFEST="${MENORAH_RELEASE_IMAGE_MANIFEST:?MENORAH_RELEASE_IMAGE_MANIFEST is required}"
IMAGE_CHECKSUM="${IMAGE_MANIFEST}.sha256"

fail() {
  echo "Recorded migration launch failed: $*" >&2
  exit 1
}

for required_command in awk basename docker sha256sum; do
  command -v "${required_command}" >/dev/null 2>&1 \
    || fail "required command is unavailable: ${required_command}"
done
[[ -r "${ENV_FILE}" && -r "${CLOUDFLARE_ENV}" ]] \
  || fail "production or Cloudflare environment file is unreadable"
[[ -f "${IMAGE_MANIFEST}" && ! -L "${IMAGE_MANIFEST}" \
  && -s "${IMAGE_MANIFEST}" && -r "${IMAGE_MANIFEST}" \
  && -f "${IMAGE_CHECKSUM}" && ! -L "${IMAGE_CHECKSUM}" \
  && -s "${IMAGE_CHECKSUM}" && -r "${IMAGE_CHECKSUM}" ]] \
  || fail "release image manifest or checksum is missing, empty, non-regular, symlinked, or unreadable"

manifest_basename="$(basename "${IMAGE_MANIFEST}")"
checksum_record="$(< "${IMAGE_CHECKSUM}")"
[[ "${checksum_record}" =~ ^([0-9a-f]{64})[[:space:]][[:space:]]([^/]+)$ \
  && "${BASH_REMATCH[2]}" == "${manifest_basename}" ]] \
  || fail "release image checksum must contain exactly the manifest digest and basename"
recorded_manifest_sha256="${BASH_REMATCH[1]}"
actual_manifest_sha256="$(sha256sum "${IMAGE_MANIFEST}" | awk '{print $1}')"
[[ "${actual_manifest_sha256}" == "${recorded_manifest_sha256}" ]] \
  || fail "release image manifest checksum does not match its recorded digest"

api_web_record="$(
  awk -F'|' '
    $1 == "api-web" {
      count += 1
      record = $0
    }
    END {
      if (count != 1) exit 1
      print record
    }
  ' "${IMAGE_MANIFEST}"
)" || fail "release manifest must contain exactly one api-web artifact"

IFS='|' read -r service image_reference image_id extra <<< "${api_web_record}"
[[ "${service}" == "api-web" \
  && -n "${image_reference}" \
  && ! "${image_reference}" =~ [[:space:]\|] \
  && "${image_id}" =~ ^sha256:[0-9a-f]{64}$ \
  && -z "${extra:-}" ]] \
  || fail "release manifest contains an invalid api-web artifact record"

docker image inspect "${image_id}" >/dev/null \
  || fail "recorded api-web image content is unavailable"
resolved_reference_id="$(docker image inspect --format '{{.Id}}' "${image_reference}")"
[[ "${resolved_reference_id}" == "${image_id}" ]] \
  || fail "api-web build tag drifted after artifact capture; migration was not started"

MENORAH_MIGRATION_IMAGE_ID="${image_id}" docker compose \
  -f "${DEPLOY_DIR}/docker-compose.production.yml" \
  -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
  -f "${DEPLOY_DIR}/docker-compose.migration.yml" \
  --env-file "${ENV_FILE}" \
  --env-file "${CLOUDFLARE_ENV}" \
  run --rm --no-deps --pull never api-web node src/database/migrate.js
