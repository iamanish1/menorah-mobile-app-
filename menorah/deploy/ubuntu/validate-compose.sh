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

unset_endpoint_output=""
if unset_endpoint_output="$(
  DEPLOYMENT_ENVIRONMENT=staging \
  ROOT_DOMAIN= \
  WWW_DOMAIN= \
  APP_DOMAIN= \
  ADMIN_DOMAIN= \
  COUNSELLOR_DOMAIN= \
  API_IOS_DOMAIN= \
  API_ANDROID_DOMAIN= \
  API_WEB_DOMAIN= \
  API_ADMIN_DOMAIN= \
  CALLS_DOMAIN= \
  FRONTEND_API_WEB_URL= \
  FRONTEND_API_ADMIN_URL= \
  FRONTEND_SOCKET_WEB_URL= \
  LIVEKIT_URL= \
  LIVEKIT_API_URL= \
  ALLOWED_ORIGINS= \
  WEB_SESSION_ORIGINS= \
  PASSWORD_RESET_BASE_URL= \
  CHECKOUT_RETURN_URL= \
  MEDIA_PUBLIC_BASE_URL= \
  EMAIL_FROM= \
  CONTACT_TO_EMAIL= \
    docker compose \
      -f "${DEPLOY_DIR}/docker-compose.production.yml" \
      --env-file "${DEPLOY_DIR}/env/production.env.example" \
      config 2>&1
)"; then
  echo "Staging Compose unexpectedly rendered without authoritative endpoints." >&2
  exit 1
fi

required_endpoint_error=false
for variable_name in \
  ROOT_DOMAIN \
  WWW_DOMAIN \
  APP_DOMAIN \
  ADMIN_DOMAIN \
  COUNSELLOR_DOMAIN \
  API_IOS_DOMAIN \
  API_ANDROID_DOMAIN \
  API_WEB_DOMAIN \
  API_ADMIN_DOMAIN \
  CALLS_DOMAIN \
  FRONTEND_API_WEB_URL \
  FRONTEND_API_ADMIN_URL \
  FRONTEND_SOCKET_WEB_URL \
  LIVEKIT_URL \
  LIVEKIT_API_URL \
  ALLOWED_ORIGINS \
  WEB_SESSION_ORIGINS \
  PASSWORD_RESET_BASE_URL \
  CHECKOUT_RETURN_URL \
  MEDIA_PUBLIC_BASE_URL \
  EMAIL_FROM \
  CONTACT_TO_EMAIL; do
  if grep -Fq "${variable_name} is required" <<< "${unset_endpoint_output}"; then
    required_endpoint_error=true
    break
  fi
done

if [[ "${required_endpoint_error}" != "true" ]]; then
  echo "Staging Compose failed for an unexpected reason:" >&2
  echo "${unset_endpoint_output}" >&2
  exit 1
fi

for required_routing_variable in \
  EMAIL_FROM \
  CONTACT_TO_EMAIL \
  CHECKOUT_RETURN_URL; do
  missing_routing_output=""
  if missing_routing_output="$(
    env "${required_routing_variable}=" \
      docker compose \
        -f "${DEPLOY_DIR}/docker-compose.production.yml" \
        -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
        --env-file "${DEPLOY_DIR}/env/production.env.example" \
        --env-file "${DEPLOY_DIR}/env/cloudflare.env.example" \
        config 2>&1
  )"; then
    echo "Compose unexpectedly rendered without ${required_routing_variable}." >&2
    exit 1
  fi
  if ! grep -Fq "${required_routing_variable} is required" \
    <<< "${missing_routing_output}"; then
    echo "Compose failed without the expected ${required_routing_variable} guard:" >&2
    echo "${missing_routing_output}" >&2
    exit 1
  fi
done

home_config="$(
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.home.yml" \
    --env-file "${DEPLOY_DIR}/env/home.env.example" \
    --env-file "${DEPLOY_DIR}/env/home.compose.env.example" \
    config --no-env-resolution
)"
if grep -Fq 'menorahenquiries@gmail.com' <<< "${home_config}"; then
  echo "Home Compose must not inject the live contact mailbox by default." >&2
  exit 1
fi

echo "Production Compose syntax validates and staging fails closed without authoritative endpoints."
