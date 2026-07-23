#!/usr/bin/env bash
set -euo pipefail

# Runs the authenticated chat + WebRTC smoke without exposing any production
# credentials. Both test accounts, their chat messages, booking, and LiveKit
# room are removed even when a test assertion fails.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${MENORAH_COMPOSE_FILE:-$repo_root/deploy/docker-compose.production.yml}"
env_file="${MENORAH_ENV_FILE:-$repo_root/deploy/env/production.env}"
fixture_script="$repo_root/backend/scripts/qa-chat-call-fixture.js"

if [[ ! -f "$env_file" || ! -f "$compose_file" ]]; then
  echo "Required production compose or env file was not found." >&2
  exit 1
fi

api_container="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q api-web)"
if [[ -z "$api_container" ]]; then
  echo "The api-web container is not running." >&2
  exit 1
fi

run_id="qa-chat-call-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
password="Qa!$(openssl rand -hex 18)a1"
fixture_json=""

cleanup() {
  local status=$?
  if [[ -n "$fixture_json" ]]; then
    QA_FIXTURE_ACTION=cleanup \
    QA_FIXTURE_JSON="$fixture_json" \
    docker exec \
      -e QA_FIXTURE_ACTION \
      -e QA_FIXTURE_JSON \
      "$api_container" node /tmp/menorah-qa-chat-call-fixture.js >/dev/null || \
      echo "WARNING: QA fixture cleanup needs attention. Run ID: $run_id" >&2
  fi
  docker exec "$api_container" rm -f /tmp/menorah-qa-chat-call-fixture.js >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker cp "$fixture_script" "$api_container:/tmp/menorah-qa-chat-call-fixture.js"
fixture_json="$(
  QA_FIXTURE_ACTION=create \
  QA_RUN_ID="$run_id" \
  QA_PASSWORD="$password" \
    docker exec \
      -e QA_FIXTURE_ACTION \
      -e QA_RUN_ID \
      -e QA_PASSWORD \
      "$api_container" node /tmp/menorah-qa-chat-call-fixture.js
)"

if ! QA_FIXTURE_JSON_TO_VALIDATE="$fixture_json" \
  node -e 'JSON.parse(process.env.QA_FIXTURE_JSON_TO_VALIDATE)' >/dev/null 2>&1; then
  echo "The QA fixture returned an invalid reference." >&2
  exit 1
fi

echo "Running authenticated chat and WebRTC smoke with short-lived QA records."
QA_FIXTURE_JSON="$fixture_json" \
QA_PASSWORD="$password" \
QA_API_WEB_URL="${QA_API_WEB_URL:-https://api-web.menorah.me}" \
QA_CALL_API_URL="${QA_CALL_API_URL:-http://127.0.0.1:18082}" \
QA_APP_URL="${QA_APP_URL:-https://app.menorah.me}" \
docker run --rm \
  --network host \
  --shm-size=1gb \
  --user 0 \
  -v "$repo_root:/workspace:ro" \
  -w /workspace/scripts/qa \
  -e QA_FIXTURE_JSON \
  -e QA_PASSWORD \
  -e QA_API_WEB_URL \
  -e QA_CALL_API_URL \
  -e QA_APP_URL \
  mcr.microsoft.com/playwright:v1.61.0-noble \
  node /workspace/scripts/qa/production-chat-call-smoke.js
