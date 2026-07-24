#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
MENORAH_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"
STAGING_DIR="${MENORAH_ROOT}/deploy/server-staging"

environment_file="${STAGING_DIR}/generated/server-staging-validation.env"
compose_file="${STAGING_DIR}/compose.yml"
production_metadata="${STAGING_DIR}/production-metadata.fixture.json"

usage() {
  cat <<'USAGE'
Usage:
  validate-server-staging-isolation.sh [options]

Options:
  --env FILE                  Synthetic or real server-staging env file.
  --compose FILE              Server-staging Compose source.
  --production-metadata FILE  Value-free production metadata JSON.
  --rendered-compose FILE     Validate an existing Compose JSON render.
  --help                      Show this help.

The script never reads a production env file. When --rendered-compose is not
provided, Docker Compose renders the staging model with every one-shot profile.
USAGE
}

rendered_compose=""
while (($# > 0)); do
  case "$1" in
    --env)
      environment_file="${2:?--env requires a file}"
      shift 2
      ;;
    --compose)
      compose_file="${2:?--compose requires a file}"
      shift 2
      ;;
    --production-metadata)
      production_metadata="${2:?--production-metadata requires a file}"
      shift 2
      ;;
    --rendered-compose)
      rendered_compose="${2:?--rendered-compose requires a file}"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

for required_file in \
  "${environment_file}" \
  "${compose_file}" \
  "${production_metadata}" \
  "${STAGING_DIR}/ingress-manifest.json" \
  "${STAGING_DIR}/Caddyfile" \
  "${STAGING_DIR}/tunnel-config.yml.example" \
  "${STAGING_DIR}/prometheus.yml" \
  "${STAGING_DIR}/alertmanager.yml" \
  "${STAGING_DIR}/blackbox.yml" \
  "${STAGING_DIR}/config.alloy" \
  "${STAGING_DIR}/loki.yml" \
  "${MENORAH_ROOT}/deploy/monitoring/alert-rules.yml"; do
  if [[ ! -f "${required_file}" || -L "${required_file}" ]]; then
    printf 'Required regular non-symlink file is missing: %s\n' \
      "${required_file}" >&2
    exit 1
  fi
done

node "${STAGING_DIR}/validate-environment.mjs" \
  --env "${environment_file}" \
  --production-metadata "${production_metadata}" >/dev/null

temporary_render=""
cleanup() {
  if [[ -n "${temporary_render}" && -f "${temporary_render}" ]]; then
    rm -f -- "${temporary_render}"
  fi
}
trap cleanup EXIT HUP INT TERM

if [[ -z "${rendered_compose}" ]]; then
  command -v docker >/dev/null 2>&1 || {
    printf 'Docker CLI is required to render server staging.\n' >&2
    exit 1
  }
  temporary_render="$(mktemp "${TMPDIR:-/tmp}/menorah-server-staging-render.XXXXXX.json")"
  docker compose \
    --env-file "${environment_file}" \
    --file "${compose_file}" \
    --profile migration \
    --profile seed \
    --profile backup \
    --profile recovery \
    config --format json >"${temporary_render}"
  rendered_compose="${temporary_render}"
elif [[ ! -f "${rendered_compose}" || -L "${rendered_compose}" ]]; then
  printf 'Rendered Compose JSON must be a regular non-symlink file.\n' >&2
  exit 1
fi

node "${STAGING_DIR}/validate-isolation.mjs" \
  --compose "${rendered_compose}" \
  --env "${environment_file}" \
  --production-metadata "${production_metadata}" \
  --manifest "${STAGING_DIR}/ingress-manifest.json" \
  --caddy "${STAGING_DIR}/Caddyfile" \
  --tunnel "${STAGING_DIR}/tunnel-config.yml.example" \
  --prometheus "${STAGING_DIR}/prometheus.yml" \
  --alertmanager "${STAGING_DIR}/alertmanager.yml" \
  --blackbox "${STAGING_DIR}/blackbox.yml" \
  --alloy "${STAGING_DIR}/config.alloy" \
  --loki "${STAGING_DIR}/loki.yml" \
  --alert-rules "${MENORAH_ROOT}/deploy/monitoring/alert-rules.yml"
