#!/usr/bin/env bash
# =============================================================================
# Menorah Health — Sync .env → GCP Secret Manager
# =============================================================================
# Run this whenever your secrets change to push new values to Secret Manager.
# Cloud Run reads the latest version of each secret on every new deployment.
#
# Prerequisites:
#   - gcloud CLI authenticated:  gcloud auth login
#   - gcp-setup.sh already run (secrets exist, just need updated values)
#
# Usage:
#   GCP_PROJECT_ID=your-project-id bash gcp/secrets-sync.sh menorah/backend/.env
#
# What it does:
#   Reads each KEY=VALUE line from the .env file.
#   Creates a new secret version in Secret Manager for every secret key.
#   Skips blank lines, comments, and non-secret config (PORT, NODE_ENV, etc.)
#   Treats REDIS_URL specially — prompts you to enter the Upstash URL instead
#   of using the local redis://localhost:6379 value from .env.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
ENV_FILE="${1:?Usage: GCP_PROJECT_ID=xxx bash gcp/secrets-sync.sh path/to/.env}"

[[ -f "$ENV_FILE" ]] || error ".env file not found: ${ENV_FILE}"

info "==========================================================="
info " Syncing secrets to GCP Secret Manager"
info " Project : ${PROJECT_ID}"
info " Env file: ${ENV_FILE}"
info "==========================================================="

# ── Mapping: .env key → Secret Manager secret name ────────────────────────
# Only keys listed here are synced. Non-secret config (PORT, NODE_ENV, etc.)
# is hardcoded directly in cloudrun.yaml.
declare -A SECRET_MAP=(
    ["MONGODB_URI"]="mongodb-uri"
    ["JWT_SECRET"]="jwt-secret"
    ["JWT_REFRESH_SECRET"]="jwt-refresh-secret"
    ["ALLOWED_ORIGINS"]="allowed-origins"
    ["MSG91_AUTH_KEY"]="msg91-auth-key"
    ["MSG91_OTP_TEMPLATE_ID"]="msg91-otp-template-id"
    ["MSG91_SMS_TEMPLATE_ID"]="msg91-sms-template-id"
    ["MSG91_EMAIL_DOMAIN"]="msg91-email-domain"
    ["MSG91_EMAIL_TEMPLATE_ID"]="msg91-email-template-id"
    ["RAZORPAY_KEY_ID"]="razorpay-key-id"
    ["RAZORPAY_KEY_SECRET"]="razorpay-key-secret"
    ["RAZORPAY_WEBHOOK_SECRET"]="razorpay-webhook-secret"
    ["RAZORPAY_X_KEY_ID"]="razorpay-x-key-id"
    ["RAZORPAY_X_KEY_SECRET"]="razorpay-x-key-secret"
    ["CLOUDINARY_CLOUD_NAME"]="cloudinary-cloud-name"
    ["CLOUDINARY_API_KEY"]="cloudinary-api-key"
    ["CLOUDINARY_API_SECRET"]="cloudinary-api-secret"
    ["SENDGRID_API_KEY"]="sendgrid-api-key"
    ["LIVEKIT_API_KEY"]="livekit-api-key"
    ["LIVEKIT_API_SECRET"]="livekit-api-secret"
)

# ── Helper: push a value to Secret Manager ────────────────────────────────
push_secret() {
    local secret_name="$1"
    local value="$2"

    # Skip placeholder values — force user to fill these in
    if [[ "$value" == REPLACE_* ]] || [[ -z "$value" ]]; then
        warn "Skipping '${secret_name}' — value is empty or a placeholder"
        return
    fi

    # Add new version (Secret Manager keeps version history automatically)
    printf '%s' "$value" | gcloud secrets versions add "${secret_name}" \
        --data-file=- \
        --project="${PROJECT_ID}" \
        --quiet
    success "Updated secret: ${secret_name}"
}

# ── Parse .env file ────────────────────────────────────────────────────────
declare -A ENV_VALUES=()
while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip blank lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Parse KEY=VALUE (handle values with = signs inside them)
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
        key="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"
        # Strip surrounding quotes if present
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        ENV_VALUES["$key"]="$value"
    fi
done < "$ENV_FILE"

# ── REDIS_URL special handling ─────────────────────────────────────────────
# Cloud Run cannot use the local Redis on VPS — it needs Upstash (accessible
# from the internet over TLS). We prompt for the Upstash URL here.
echo ""
warn "REDIS_URL requires a special Upstash URL for Cloud Run (not the local VPS Redis)."
warn "Get it from: https://console.upstash.com → your database → REST API tab → copy the rediss:// URL"
echo ""
read -rp "Paste your Upstash Redis URL (rediss://...): " UPSTASH_URL

if [[ -n "$UPSTASH_URL" && "$UPSTASH_URL" == rediss://* ]]; then
    push_secret "redis-url" "$UPSTASH_URL"
else
    warn "Invalid or empty Upstash URL — skipping redis-url secret."
    warn "Set it manually: echo -n 'rediss://...' | gcloud secrets versions add redis-url --data-file=-"
fi

# ── Sync all mapped secrets ────────────────────────────────────────────────
echo ""
info "Syncing secrets from ${ENV_FILE}..."
synced=0
skipped=0

for env_key in "${!SECRET_MAP[@]}"; do
    secret_name="${SECRET_MAP[$env_key]}"
    value="${ENV_VALUES[$env_key]:-}"

    if [[ -n "$value" ]]; then
        push_secret "$secret_name" "$value"
        ((synced++)) || true
    else
        warn "No value for ${env_key} in .env — skipping ${secret_name}"
        ((skipped++)) || true
    fi
done

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} Secrets sync complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Synced : ${synced} secrets"
echo "  Skipped: ${skipped} secrets (empty or placeholder — fill manually)"
echo ""
echo -e "${YELLOW}To update a single secret manually:${NC}"
echo "  echo -n 'new-value' | gcloud secrets versions add SECRET-NAME --data-file=- --project=${PROJECT_ID}"
echo ""
echo -e "${YELLOW}To view a secret's current value:${NC}"
echo "  gcloud secrets versions access latest --secret=SECRET-NAME --project=${PROJECT_ID}"
echo ""
