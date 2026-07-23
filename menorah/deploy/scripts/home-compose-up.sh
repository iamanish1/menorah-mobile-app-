#!/usr/bin/env bash
set -euo pipefail

COMPOSE_ENV="${COMPOSE_ENV:-menorah/deploy/env/home.compose.env}"
COMPOSE_FILE="${COMPOSE_FILE:-menorah/deploy/docker-compose.home.yml}"

if [[ ! -f "${COMPOSE_ENV}" ]]; then
  echo "Missing ${COMPOSE_ENV}. Copy menorah/deploy/env/home.compose.env.example first." >&2
  exit 2
fi

if [[ ! -f "menorah/deploy/env/home.env" ]]; then
  echo "Missing menorah/deploy/env/home.env. Copy menorah/deploy/env/home.env.example first." >&2
  exit 2
fi

export MENORAH_HOME_SERVICE_ENV_FILE="./env/home.env"
docker compose --env-file "${COMPOSE_ENV}" -f "${COMPOSE_FILE}" up -d --build
