#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

docker compose \
  -f "${DEPLOY_DIR}/docker-compose.production.yml" \
  -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
  --env-file "${DEPLOY_DIR}/env/production.env.example" \
  --env-file "${DEPLOY_DIR}/env/cloudflare.env.example" \
  config >/dev/null

echo "Production Compose syntax validates with example env files."
