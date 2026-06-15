#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

failures=0

port_base_url() {
  local value="$1"
  local fallback="$2"
  value="${value:-${fallback}}"
  if [[ "${value}" == http://* || "${value}" == https://* ]]; then
    printf '%s' "${value}"
    return
  fi
  local port="${value##*:}"
  printf 'http://127.0.0.1:%s' "${port}"
}

API_IOS_BASE="$(port_base_url "${API_IOS_HEALTH_URL:-${API_IOS_LOCAL_PORT:-}}" "127.0.0.1:18080")"
API_ANDROID_BASE="$(port_base_url "${API_ANDROID_HEALTH_URL:-${API_ANDROID_LOCAL_PORT:-}}" "127.0.0.1:18084")"
API_WEB_BASE="$(port_base_url "${API_WEB_HEALTH_URL:-${API_WEB_LOCAL_PORT:-}}" "127.0.0.1:18082")"
API_ADMIN_BASE="$(port_base_url "${API_ADMIN_HEALTH_URL:-${API_ADMIN_LOCAL_PORT:-}}" "127.0.0.1:18083")"
WORKER_BASE="$(port_base_url "${WORKER_HEALTH_URL:-${WORKER_LOCAL_PORT:-}}" "127.0.0.1:18090")"

status_code() {
  local method="$1"
  local url="$2"
  local body_file="$3"
  curl -k -sS -X "${method}" -o "${body_file}" -w "%{http_code}" "${url}" || printf '000'
}

require_code() {
  local method="$1"
  local url="$2"
  local expected="$3"
  local body_file="${TMP_DIR}/$(echo "${method}-${url}" | tr -c 'A-Za-z0-9' '_').body"
  local code
  code="$(status_code "${method}" "${url}" "${body_file}")"
  if [[ "${code}" == "${expected}" ]]; then
    echo "PASS ${method} ${url} -> ${code}" >&2
  else
    echo "FAIL ${method} ${url} -> ${code}, expected ${expected}" >&2
    failures=$((failures + 1))
  fi
  printf '%s' "${body_file}"
}

require_code_any() {
  local method="$1"
  local url="$2"
  shift 2
  local body_file="${TMP_DIR}/$(echo "${method}-${url}" | tr -c 'A-Za-z0-9' '_').body"
  local code
  code="$(status_code "${method}" "${url}" "${body_file}")"
  for expected in "$@"; do
    if [[ "${code}" == "${expected}" ]]; then
      echo "PASS ${method} ${url} -> ${code}" >&2
      printf '%s' "${body_file}"
      return
    fi
  done
  echo "FAIL ${method} ${url} -> ${code}, expected one of: $*" >&2
  failures=$((failures + 1))
  printf '%s' "${body_file}"
}

assert_no_secret_leak() {
  local body_file="$1"
  local label="$2"
  if grep -Eiq 'mongodb(\+srv)?://|redis://|-----BEGIN|PRIVATE KEY' "${body_file}"; then
    echo "FAIL ${label} appears to expose a URI or key material" >&2
    failures=$((failures + 1))
  fi

  local key value
  for key in JWT_SECRET JWT_REFRESH_SECRET MONGODB_URI MONGODB_BACKUP_URI REDIS_URL RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET RESEND_API_KEY MSG91_AUTH_KEY LUXAND_API_TOKEN OPENAI_API_KEY CLOUDINARY_API_SECRET BACKUP_ENCRYPTION_PASSWORD; do
    value="${!key:-}"
    if [[ ${#value} -ge 12 && "${value}" != replace_with_* ]] && grep -Fq "${value}" "${body_file}"; then
      echo "FAIL ${label} exposes ${key}" >&2
      failures=$((failures + 1))
    fi
  done
}

ios_deep_body="$(require_code GET "${API_IOS_BASE}/health/deep" 200)"
assert_no_secret_leak "${ios_deep_body}" "api-ios /health/deep"

require_code GET "${API_IOS_BASE}/health/live" 200 >/dev/null
require_code GET "${API_IOS_BASE}/health/ready" 200 >/dev/null
require_code GET "${API_ANDROID_BASE}/health/ready" 200 >/dev/null
require_code GET "${API_WEB_BASE}/health/ready" 200 >/dev/null
require_code GET "${API_ADMIN_BASE}/health/ready" 200 >/dev/null
require_code GET "${WORKER_BASE}/health/ready" 200 >/dev/null

require_code POST "${API_IOS_BASE}/api/payments/create-subscription-checkout" 404 >/dev/null
require_code POST "${API_IOS_BASE}/api/payments/verify-subscription-payment" 404 >/dev/null
require_code GET "${API_IOS_BASE}/api/payments/subscription/status" 404 >/dev/null
require_code POST "${API_IOS_BASE}/api/payments/subscription/create-order" 404 >/dev/null
require_code POST "${API_IOS_BASE}/api/payments/subscription/verify" 404 >/dev/null

require_code_any GET "${API_ADMIN_BASE}/api/auth/me" 401 403 >/dev/null
require_code GET "${API_IOS_BASE}/api/admin/stats" 404 >/dev/null
require_code GET "${API_ANDROID_BASE}/api/admin/stats" 404 >/dev/null
require_code GET "${API_WEB_BASE}/api/admin/stats" 404 >/dev/null

if [[ "${CHECK_PUBLIC:-false}" == "true" ]]; then
  require_code GET "https://${API_IOS_DOMAIN:-api-ios.menorah.me}/health/ready" 200 >/dev/null
  require_code GET "https://${API_ANDROID_DOMAIN:-api-android.menorah.me}/health/ready" 200 >/dev/null
  require_code GET "https://${API_WEB_DOMAIN:-api-web.menorah.me}/health/ready" 200 >/dev/null
  require_code GET "https://${API_ADMIN_DOMAIN:-api-admin.menorah.me}/health/ready" 200 >/dev/null
  require_code GET "https://${WWW_DOMAIN:-www.menorah.me}" 200 >/dev/null
  require_code GET "https://${APP_DOMAIN:-app.menorah.me}" 200 >/dev/null
  require_code GET "https://${ADMIN_DOMAIN:-admin.menorah.me}" 200 >/dev/null
else
  echo "Skipping public HTTPS checks. Re-run with CHECK_PUBLIC=true after Cloudflare hostnames are live."
fi

if [[ "${failures}" -gt 0 ]]; then
  echo "Health check failed with ${failures} failure(s)." >&2
  exit 1
fi

echo "Health check passed."
