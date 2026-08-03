#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXPECTED_BACKUP_WORKDIR="$(cd "${DEPLOY_DIR}/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV:-${DEPLOY_DIR}/env/production.env}"
CLOUDFLARE_ENV="${CLOUDFLARE_ENV:-${DEPLOY_DIR}/env/cloudflare.env}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

failures=0

compose_cmd() {
  docker compose \
    -f "${DEPLOY_DIR}/docker-compose.production.yml" \
    -f "${DEPLOY_DIR}/docker-compose.tunnel.yml" \
    --env-file "${ENV_FILE}" \
    --env-file "${CLOUDFLARE_ENV}" \
    "$@"
}

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
  curl --connect-timeout "${HEALTH_CONNECT_TIMEOUT_SECONDS:-5}" \
    --max-time "${HEALTH_REQUEST_TIMEOUT_SECONDS:-15}" \
    -sS -X "${method}" -o "${body_file}" -w "%{http_code}" "${url}" || printf '000'
}

status_and_location() {
  local method="$1"
  local url="$2"
  local body_file="$3"
  curl --connect-timeout "${HEALTH_CONNECT_TIMEOUT_SECONDS:-5}" \
    --max-time "${HEALTH_REQUEST_TIMEOUT_SECONDS:-15}" \
    -sS -X "${method}" -o "${body_file}" -w "%{http_code} %{redirect_url}" "${url}" || printf '000 '
}

require_code() {
  local method="$1"
  local url="$2"
  local expected="$3"
  local body_file
  body_file="${TMP_DIR}/$(echo "${method}-${url}" | tr -c 'A-Za-z0-9' '_').body"
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
  local body_file
  body_file="${TMP_DIR}/$(echo "${method}-${url}" | tr -c 'A-Za-z0-9' '_').body"
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

require_code_or_redirect() {
  local method="$1"
  local url="$2"
  local redirect_pattern="$3"
  shift 3
  local body_file
  body_file="${TMP_DIR}/$(echo "${method}-${url}" | tr -c 'A-Za-z0-9' '_').body"
  local result code location
  result="$(status_and_location "${method}" "${url}" "${body_file}")"
  code="${result%% *}"
  location="${result#* }"

  for expected in "$@"; do
    if [[ "${code}" == "${expected}" ]]; then
      echo "PASS ${method} ${url} -> ${code}" >&2
      printf '%s' "${body_file}"
      return
    fi
  done

  if [[ "${code}" =~ ^30[178]$ && "${location}" =~ ${redirect_pattern} ]]; then
    echo "PASS ${method} ${url} -> ${code} ${location}" >&2
    printf '%s' "${body_file}"
    return
  fi

  echo "FAIL ${method} ${url} -> ${code} ${location}, expected one of: $* or redirect matching ${redirect_pattern}" >&2
  failures=$((failures + 1))
  printf '%s' "${body_file}"
}

require_json_fragment() {
  local body_file="$1"
  local fragment="$2"
  local label="$3"
  if tr -d '[[:space:]]' < "${body_file}" | grep -Fq "${fragment}"; then
    echo "PASS ${label} contains the configured signing metadata" >&2
    return
  fi
  echo "FAIL ${label} does not contain the configured signing metadata" >&2
  failures=$((failures + 1))
}

is_blank_or_placeholder() {
  local value="${1:-}"
  [[ -z "${value}" || "${value}" == replace_with_* || "${value}" == *"REPLACE_WITH"* ]]
}

require_android_app_link_signing_value() {
  local key="$1"
  local value="${!key:-}"
  if is_blank_or_placeholder "${value}"; then
    echo "FAIL Android App Links require a real ${key} before Play rollout." >&2
    failures=$((failures + 1))
    return 1
  fi
  if [[ "${key}" == "ANDROID_APP_LINK_PACKAGE_NAME" \
    && "${value}" != "com.menorah.healthmobile" ]]; then
    echo "FAIL Android App Links require package com.menorah.healthmobile." >&2
    failures=$((failures + 1))
    return 1
  fi
  if [[ "${key}" == "ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS" ]]; then
    local fingerprint compact_fingerprint
    local fingerprint_pattern='^([A-F0-9]{2}:){31}[A-F0-9]{2}$'
    local -a fingerprints=()
    IFS=',' read -r -a fingerprints <<< "${value}"
    if (( ${#fingerprints[@]} == 0 )); then
      echo "FAIL Android App Links require the Play App Signing SHA-256." >&2
      failures=$((failures + 1))
      return 1
    fi
    for fingerprint in "${fingerprints[@]}"; do
      compact_fingerprint="${fingerprint//[[:space:]]/}"
      if [[ ! "${compact_fingerprint}" =~ ${fingerprint_pattern} ]]; then
        echo "FAIL Android App Link fingerprints must be canonical uppercase colon-delimited SHA-256 values." >&2
        failures=$((failures + 1))
        return 1
      fi
    done
  fi
  echo "PASS Android App Link prerequisite ${key} is configured." >&2
}

require_direct_json_response() {
  local method="$1"
  local url="$2"
  local label="$3"
  local body_file headers_file code
  body_file="${TMP_DIR}/$(echo "${method}-${url}" | tr -c 'A-Za-z0-9' '_').body"
  headers_file="${body_file}.headers"
  # Never follow redirects: Digital Asset Links must be served directly.
  if ! code="$(curl --connect-timeout "${HEALTH_CONNECT_TIMEOUT_SECONDS:-5}" \
    --max-time "${HEALTH_REQUEST_TIMEOUT_SECONDS:-15}" \
    -sS -X "${method}" -D "${headers_file}" -o "${body_file}" -w "%{http_code}" "${url}")"; then
    code="000"
  fi

  if [[ "${code}" != "200" ]]; then
    echo "FAIL ${label} -> ${code}, expected a direct 200 JSON response." >&2
    failures=$((failures + 1))
  elif grep -Eiq '^location:' "${headers_file}"; then
    echo "FAIL ${label} returned a redirect Location header." >&2
    failures=$((failures + 1))
  elif ! grep -Eiq '^content-type:[[:space:]]*application/json([;[:space:]]|$)' "${headers_file}"; then
    echo "FAIL ${label} is missing an application/json Content-Type." >&2
    failures=$((failures + 1))
  else
    echo "PASS ${label} -> direct 200 application/json" >&2
  fi

  printf '%s' "${body_file}"
}

require_service_probe() {
  local service="$1"
  local container
  local inspect
  container="$(compose_cmd ps -q "${service}" 2>/dev/null || true)"
  if [[ -z "${container}" ]]; then
    echo "FAIL service ${service} has no running container" >&2
    failures=$((failures + 1))
    return
  fi
  if ! inspect="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "${container}" 2>/dev/null)"; then
    echo "FAIL service ${service} container is missing" >&2
    failures=$((failures + 1))
    return
  fi

  local status health
  status="${inspect%% *}"
  health="${inspect#* }"

  if [[ "${status}" == "running" && ( "${health}" == "healthy" || "${health}" == "no-healthcheck" ) ]]; then
    echo "PASS service ${service} -> ${status}/${health}" >&2
  else
    echo "FAIL service ${service} -> ${status}/${health}" >&2
    failures=$((failures + 1))
  fi
}

require_active_timer() {
  local timer="$1"
  if ! systemctl is-enabled --quiet "${timer}" \
    || ! systemctl is-active --quiet "${timer}"; then
    echo "FAIL required backup timer is not enabled and active: ${timer}" >&2
    failures=$((failures + 1))
  else
    echo "PASS backup timer enabled and active: ${timer}"
  fi
}

require_backup_unit_contract() {
  local unit="$1"
  local script_path="$2"
  local required_argument="${3:-}"
  local expected_user unit_user unit_workdir unit_environment unit_exec
  expected_user="$(id -un)"
  unit_user="$(systemctl show --property=User --value "${unit}" 2>/dev/null || true)"
  unit_workdir="$(systemctl show --property=WorkingDirectory --value "${unit}" 2>/dev/null || true)"
  unit_environment="$(systemctl show --property=Environment --value "${unit}" 2>/dev/null || true)"
  unit_exec="$(systemctl show --property=ExecStart --value "${unit}" 2>/dev/null || true)"
  if [[ "${unit_user}" != "${expected_user}" \
    || "${unit_workdir}" != "${EXPECTED_BACKUP_WORKDIR}" \
    || "${unit_environment}" != *"PRODUCTION_ENV=${ENV_FILE}"* \
    || "${unit_exec}" != *"/bin/bash ${EXPECTED_BACKUP_WORKDIR}/${script_path}"* \
    || ( -n "${required_argument}" && "${unit_exec}" != *" ${required_argument}"* ) ]]; then
    echo "FAIL systemd unit does not match this checkout/operator: ${unit}" >&2
    failures=$((failures + 1))
  else
    echo "PASS systemd unit matches this checkout/operator: ${unit}" >&2
  fi
}

require_prometheus_targets_up() {
  local targets_json
  if ! targets_json="$(compose_cmd exec -T prometheus \
    wget -qO- 'http://127.0.0.1:9090/api/v1/targets?state=active' 2>/dev/null)"; then
    echo "FAIL Prometheus active-target API is unavailable" >&2
    failures=$((failures + 1))
    return
  fi

  if TARGETS_JSON="${targets_json}" node - <<'NODE'
const payload = JSON.parse(process.env.TARGETS_JSON || '{}');
const targets = payload?.data?.activeTargets;
if (!Array.isArray(targets) || targets.length === 0) process.exit(1);
const unhealthy = targets.filter((target) => target.health !== 'up');
if (unhealthy.length > 0) {
  for (const target of unhealthy) {
    const job = target.labels?.job || 'unknown-job';
    const instance = target.labels?.instance || 'unknown-instance';
    process.stderr.write(`Prometheus target down: ${job} ${instance}\n`);
  }
  process.exit(1);
}
NODE
  then
    echo "PASS every active Prometheus target is up" >&2
  else
    echo "FAIL one or more active Prometheus targets are unavailable" >&2
    failures=$((failures + 1))
  fi
}

require_prometheus_probe_success() {
  local query_json
  if ! query_json="$(compose_cmd exec -T prometheus \
    wget -qO- 'http://127.0.0.1:9090/api/v1/query?query=probe_success' 2>/dev/null)"; then
    echo "FAIL Prometheus probe_success query is unavailable" >&2
    failures=$((failures + 1))
    return
  fi

  if QUERY_JSON="${query_json}" node - <<'NODE'
const payload = JSON.parse(process.env.QUERY_JSON || '{}');
const results = payload?.data?.result;
if (payload.status !== 'success' || !Array.isArray(results) || results.length === 0) process.exit(1);
const failed = results.filter((sample) => Number(sample?.value?.[1]) !== 1);
if (failed.length > 0) {
  for (const sample of failed) {
    const job = sample.metric?.job || 'unknown-job';
    const instance = sample.metric?.instance || 'unknown-instance';
    process.stderr.write(`Blackbox probe failed: ${job} ${instance}\n`);
  }
  process.exit(1);
}
NODE
  then
    echo "PASS every reported blackbox probe has probe_success=1" >&2
  else
    echo "FAIL one or more blackbox probes failed or no probe results were reported" >&2
    failures=$((failures + 1))
  fi
}

require_backup_metrics_fresh() {
  local query_json presence_json
  if ! query_json="$(compose_cmd exec -T prometheus \
    wget -qO- 'http://127.0.0.1:9090/api/v1/query?query=menorah_backup_metrics_last_run_timestamp_seconds' 2>/dev/null)"; then
    echo "FAIL Prometheus backup-metrics freshness query is unavailable" >&2
    failures=$((failures + 1))
    return
  fi

  if QUERY_JSON="${query_json}" node - <<'NODE'
const payload = JSON.parse(process.env.QUERY_JSON || '{}');
const results = payload?.data?.result;
if (payload.status !== 'success' || !Array.isArray(results) || results.length !== 1) process.exit(1);
const exportedAt = Number(results[0]?.value?.[1]);
const ageSeconds = Date.now() / 1000 - exportedAt;
if (!Number.isFinite(ageSeconds) || ageSeconds < -60 || ageSeconds > 600) process.exit(1);
NODE
  then
    echo "PASS backup textfile metrics were exported within 10 minutes" >&2
  else
    echo "FAIL backup textfile metrics are missing, duplicated, or stale" >&2
    failures=$((failures + 1))
  fi

  if ! presence_json="$(compose_cmd exec -T prometheus \
    wget -qO- 'http://127.0.0.1:9090/api/v1/query?query=menorah_backup_metadata_present' 2>/dev/null)"; then
    echo "FAIL Prometheus backup marker query is unavailable" >&2
    failures=$((failures + 1))
    return
  fi
  if QUERY_JSON="${presence_json}" node - <<'NODE'
const payload = JSON.parse(process.env.QUERY_JSON || '{}');
const results = payload?.data?.result;
const manual = Array.isArray(results)
  ? results.find((sample) => sample.metric?.backup_type === 'manual')
  : undefined;
if (payload.status !== 'success' || Number(manual?.value?.[1]) !== 1) process.exit(1);
NODE
  then
    echo "PASS fresh manual backup metadata is visible to monitoring" >&2
  else
    echo "FAIL fresh manual backup metadata is not visible to monitoring" >&2
    failures=$((failures + 1))
  fi
}

assert_no_secret_leak() {
  local body_file="$1"
  local label="$2"
  if grep -Eiq 'mongodb(\+srv)?://|redis://|-----BEGIN|PRIVATE KEY' "${body_file}"; then
    echo "FAIL ${label} appears to expose a URI or key material" >&2
    failures=$((failures + 1))
  fi

  local key value
  for key in \
    JWT_SECRET JWT_REFRESH_SECRET \
    MONGODB_URI MONGODB_BACKUP_URI MONGODB_MONITORING_URI MONGODB_PRODUCTION_RESTORE_URI MONGODB_RESTORE_TEST_URI REDIS_URL \
    MONGO_MONITOR_PASSWORD MONGO_RESTORE_PASSWORD \
    RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET RAZORPAY_WEBHOOK_SECRET_PREVIOUS \
    RAZORPAY_X_KEY_SECRET RAZORPAY_X_WEBHOOK_SECRET CHECKOUT_CALLBACK_SECRET \
    RESEND_API_KEY RESEND_WEBHOOK_SECRET APPLE_PRIVATE_KEY LUXAND_API_TOKEN OPENAI_API_KEY CLOUDINARY_API_SECRET \
    LIVEKIT_API_SECRET EXPO_PUSH_ACCESS_TOKEN BACKUP_ENCRYPTION_PASSWORD BACKUP_INTEGRITY_HMAC_KEY DATA_ENCRYPTION_KEY AUDIT_LOG_SIGNING_KEY; do
    value="${!key:-}"
    if [[ ${#value} -ge 12 && "${value}" != replace_with_* ]] && grep -Fq "${value}" "${body_file}"; then
      echo "FAIL ${label} exposes ${key}" >&2
      failures=$((failures + 1))
    fi
  done
}

if [[ "$(docker info --format '{{.LoggingDriver}}' 2>/dev/null || true)" != "json-file" ]]; then
  echo "FAIL Docker default logging driver must be json-file for Alloy file collection" >&2
  failures=$((failures + 1))
fi
if ! node - <<'NODE'
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('/etc/docker/daemon.json', 'utf8'));
if (
  config['log-driver'] !== 'json-file'
  || config['log-opts']?.['max-size'] !== '25m'
  || config['log-opts']?.['max-file'] !== '5'
) {
  process.exit(1);
}
NODE
then
  echo "FAIL Docker json-file rotation must be max-size=25m and max-file=5" >&2
  failures=$((failures + 1))
fi

for service in \
  landing-page user-web-app web-app admin-panel \
  api-ios api-android api-web api-admin worker \
  app-link-associations livekit mongo-primary redis reverse-proxy cloudflared \
  prometheus alertmanager blackbox-exporter mongodb-exporter redis-exporter \
  node-exporter backup-metrics grafana uptime-kuma docker-metrics-gateway docker-stats-exporter log-collector loki; do
  require_service_probe "${service}"
done

if [[ "${BACKUP_AUTOMATION_ENABLED:-false}" == "true" ]]; then
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "FAIL systemctl is required when backup automation is enabled" >&2
    failures=$((failures + 1))
  else
    for timer in \
      menorah-backup-six-hourly.timer \
      menorah-backup-daily.timer \
      menorah-backup-weekly.timer \
      menorah-backup-monthly.timer \
      menorah-restore-test.timer \
      menorah-backup-prune.timer \
      menorah-backup-health.timer; do
      require_active_timer "${timer}"
    done
    require_backup_unit_contract menorah-backup@daily.service deploy/ubuntu/backup-now.sh daily
    require_backup_unit_contract menorah-restore-test.service deploy/ubuntu/restore-latest-backup.sh restore-test
    require_backup_unit_contract menorah-backup-prune.service deploy/ubuntu/prune-backups.sh
    require_backup_unit_contract menorah-backup-health.service deploy/ubuntu/check-backup-health.sh
  fi
fi

for entry in \
  "api-ios|${API_IOS_BASE}" \
  "api-android|${API_ANDROID_BASE}" \
  "api-web|${API_WEB_BASE}" \
  "api-admin|${API_ADMIN_BASE}"; do
  api_name="${entry%%|*}"
  api_base="${entry#*|}"
  deep_body="$(require_code GET "${api_base}/health/deep" 200)"
  metrics_body="$(require_code GET "${api_base}/metrics/security" 200)"
  assert_no_secret_leak "${deep_body}" "${api_name} /health/deep"
  assert_no_secret_leak "${metrics_body}" "${api_name} /metrics/security"
  require_code GET "${api_base}/health/live" 200 >/dev/null
  require_code GET "${api_base}/health/ready" 200 >/dev/null
done
require_code GET "${WORKER_BASE}/health/ready" 200 >/dev/null
require_prometheus_targets_up
require_prometheus_probe_success
require_backup_metrics_fresh

require_code POST "${API_IOS_BASE}/api/payments/create-subscription-checkout" 404 >/dev/null
require_code POST "${API_IOS_BASE}/api/payments/verify-subscription-payment" 404 >/dev/null
require_code GET "${API_IOS_BASE}/api/payments/subscription/status" 404 >/dev/null
require_code POST "${API_IOS_BASE}/api/payments/subscription/create-order" 404 >/dev/null
require_code POST "${API_IOS_BASE}/api/payments/subscription/verify" 404 >/dev/null

require_code_any GET "${API_ADMIN_BASE}/api/auth/me" 401 403 >/dev/null
require_code GET "${API_IOS_BASE}/api/admin/stats" 404 >/dev/null
require_code GET "${API_ANDROID_BASE}/api/admin/stats" 404 >/dev/null
require_code GET "${API_WEB_BASE}/api/admin/stats" 404 >/dev/null

if [[ "${CHECK_ANDROID_APP_LINKS:-false}" == "true" && "${CHECK_PUBLIC:-false}" != "true" ]]; then
  echo "CHECK_ANDROID_APP_LINKS=true requires CHECK_PUBLIC=true." >&2
  exit 2
fi

if [[ "${CHECK_PUBLIC:-false}" == "true" ]]; then
  require_code GET "https://${API_IOS_DOMAIN:-api-ios.menorah.me}/health/ready" 200 >/dev/null
  require_code GET "https://${API_ANDROID_DOMAIN:-api-android.menorah.me}/health/ready" 200 >/dev/null
  require_code GET "https://${API_WEB_DOMAIN:-api-web.menorah.me}/health/ready" 200 >/dev/null
  require_code GET "https://${API_ADMIN_DOMAIN:-api-admin.menorah.me}/health/ready" 200 >/dev/null
  for api_domain in \
    "${API_IOS_DOMAIN:-api-ios.menorah.me}" \
    "${API_ANDROID_DOMAIN:-api-android.menorah.me}" \
    "${API_WEB_DOMAIN:-api-web.menorah.me}" \
    "${API_ADMIN_DOMAIN:-api-admin.menorah.me}"; do
    require_code GET "https://${api_domain}/health/deep" 404 >/dev/null
    require_code GET "https://${api_domain}/metrics/security" 404 >/dev/null
  done
  require_code GET "https://${CALLS_DOMAIN:-calls.menorah.me}" 200 >/dev/null
  require_code_or_redirect GET "https://${WWW_DOMAIN:-www.menorah.me}" "^https://${ROOT_DOMAIN:-menorah.me}/?$" 200 >/dev/null
  require_code GET "https://${APP_DOMAIN:-app.menorah.me}" 200 >/dev/null
  require_code GET "https://${APP_DOMAIN:-app.menorah.me}/forgot-password" 200 >/dev/null
  require_code GET "https://${APP_DOMAIN:-app.menorah.me}/reset-password" 200 >/dev/null
  require_code_or_redirect GET "https://${ADMIN_DOMAIN:-admin.menorah.me}" "^https://${ADMIN_DOMAIN:-admin.menorah.me}/(dashboard|login)|^/(dashboard|login)" 200 >/dev/null
  require_code_or_redirect GET "https://${COUNSELLOR_DOMAIN:-counsellor.menorah.me}" "^https://${COUNSELLOR_DOMAIN:-counsellor.menorah.me}/(dashboard|login)|^/(dashboard|login)" 200 >/dev/null
  require_code GET "https://${COUNSELLOR_DOMAIN:-counsellor.menorah.me}/forgot-password" 200 >/dev/null
  require_code GET "https://${COUNSELLOR_DOMAIN:-counsellor.menorah.me}/reset-password" 200 >/dev/null

  if [[ "${CHECK_ANDROID_APP_LINKS:-false}" == "true" ]]; then
    android_app_link_prerequisites_met=true
    for key in ANDROID_APP_LINK_PACKAGE_NAME ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS; do
      if ! require_android_app_link_signing_value "${key}"; then
        android_app_link_prerequisites_met=false
      fi
    done

    if [[ "${android_app_link_prerequisites_met}" == "true" ]]; then
      android_association_body="$(require_direct_json_response GET \
        "https://${APP_DOMAIN:-app.menorah.me}/.well-known/assetlinks.json" \
        "Android association at ${APP_DOMAIN:-app.menorah.me}")"
      require_json_fragment \
        "${android_association_body}" \
        '"relation":["delegate_permission/common.handle_all_urls"]' \
        "Android association at ${APP_DOMAIN:-app.menorah.me}"
      require_json_fragment \
        "${android_association_body}" \
        "\"package_name\":\"${ANDROID_APP_LINK_PACKAGE_NAME}\"" \
        "Android association at ${APP_DOMAIN:-app.menorah.me}"

      IFS=',' read -r -a android_fingerprints <<< "${ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS}"
      for fingerprint in "${android_fingerprints[@]}"; do
        fingerprint="${fingerprint//[[:space:]]/}"
        require_json_fragment \
          "${android_association_body}" \
          "\"${fingerprint^^}\"" \
          "Android association at ${APP_DOMAIN:-app.menorah.me}"
      done
    fi
  fi

  for mentle_web_domain in \
    mentle.org \
    www.mentle.org \
    mentle.mentle.org \
    app.mentle.org \
    business.mentle.org \
    admin.mentle.org \
    counsellor.mentle.org; do
    escaped_mentle_domain="${mentle_web_domain//./\\.}"
    if [[ "${mentle_web_domain}" == "mentle.org" || "${mentle_web_domain}" == "www.mentle.org" ]]; then
      mentle_redirect_pattern='^https://(www\.)?mentle\.org(/|$)|^/'
    else
      mentle_redirect_pattern="^https://${escaped_mentle_domain}(/|$)|^/"
    fi
    require_code_or_redirect GET "https://${mentle_web_domain}" "${mentle_redirect_pattern}" 200 >/dev/null
  done
  for mentle_api_domain in \
    api.mentle.org \
    api-business.mentle.org \
    api-admin.mentle.org \
    api-counsellor.mentle.org; do
    require_code GET "https://${mentle_api_domain}/health/ready" 200 >/dev/null
  done
  require_code GET "https://calls.mentle.org" 200 >/dev/null
else
  echo "Skipping public HTTPS checks. Re-run with CHECK_PUBLIC=true after Cloudflare hostnames are live."
fi

if [[ "${failures}" -gt 0 ]]; then
  echo "Health check failed with ${failures} failure(s)." >&2
  exit 1
fi

echo "Health check passed."
