#!/usr/bin/env bash
# =============================================================================
# Menorah Health — Sync .env → GCP Secret Manager
# =============================================================================
# Run this whenever your secrets change to push new values to Secret Manager.
# Cloud Run reads the latest version of each secret on every new deployment.
#
# Prerequisites:
#   - gcloud CLI authenticated:  gcloud auth login
#
# Usage:
#   GCP_PROJECT_ID=your-project-id bash gcp/secrets-sync.sh menorah/backend/.env
#
# What it does:
#   Reads each KEY=VALUE line from the .env file.
#   Creates missing Secret Manager secrets or adds a new version to existing ones.
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
    ["MONGODB_URI"]="MONGODB_URI"
    ["JWT_SECRET"]="JWT_SECRET"
    ["JWT_REFRESH_SECRET"]="JWT_REFRESH_SECRET"
    ["ALLOWED_ORIGINS"]="ALLOWED_ORIGINS"
    ["MSG91_AUTH_KEY"]="MSG91_AUTH_KEY"
    ["MSG91_OTP_TEMPLATE_ID"]="MSG91_OTP_TEMPLATE_ID"
    ["MSG91_SMS_TEMPLATE_ID"]="MSG91_SMS_TEMPLATE_ID"
    ["MSG91_EMAIL_DOMAIN"]="MSG91_EMAIL_DOMAIN"
    ["MSG91_EMAIL_TEMPLATE_ID"]="MSG91_EMAIL_TEMPLATE_ID"
    ["MSG91_EMAIL_OTP_TEMPLATE_ID"]="MSG91_EMAIL_OTP_TEMPLATE_ID"
    ["EMAIL_FROM"]="EMAIL_FROM"
    ["RAZORPAY_KEY_ID"]="RAZORPAY_KEY_ID"
    ["RAZORPAY_KEY_SECRET"]="RAZORPAY_KEY_SECRET"
    ["RAZORPAY_WEBHOOK_SECRET"]="RAZORPAY_WEBHOOK_SECRET"
    ["RAZORPAY_X_KEY_ID"]="RAZORPAY_X_KEY_ID"
    ["RAZORPAY_X_KEY_SECRET"]="RAZORPAY_X_KEY_SECRET"
    ["RAZORPAY_PAYOUT_ACCOUNT_NUMBER"]="RAZORPAY_PAYOUT_ACCOUNT_NUMBER"
    ["RAZORPAY_X_WEBHOOK_SECRET"]="RAZORPAY_X_WEBHOOK_SECRET"
    ["CHECKOUT_RETURN_URL"]="CHECKOUT_RETURN_URL"
    ["CLOUDINARY_CLOUD_NAME"]="CLOUDINARY_CLOUD_NAME"
    ["CLOUDINARY_API_KEY"]="CLOUDINARY_API_KEY"
    ["CLOUDINARY_API_SECRET"]="CLOUDINARY_API_SECRET"
    ["CLOUDINARY_ARTICLE_FOLDER"]="CLOUDINARY_ARTICLE_FOLDER"
    ["SENDGRID_API_KEY"]="SENDGRID_API_KEY"
    ["WEB_APP_URL"]="WEB_APP_URL"
    ["LIVEKIT_URL"]="LIVEKIT_URL"
    ["LIVEKIT_API_URL"]="LIVEKIT_API_URL"
    ["LIVEKIT_API_KEY"]="LIVEKIT_API_KEY"
    ["LIVEKIT_API_SECRET"]="LIVEKIT_API_SECRET"
    ["OPENAI_API_KEY"]="OPENAI_API_KEY"
    ["SOCIAL_STUDIO_OPENAI_API_KEY"]="SOCIAL_STUDIO_OPENAI_API_KEY"
    ["SOCIAL_TOKEN_ENCRYPTION_KEY"]="SOCIAL_TOKEN_ENCRYPTION_KEY"
    ["LUXAND_API_TOKEN"]="LUXAND_API_TOKEN"
    ["SMTP_HOST"]="SMTP_HOST"
    ["SMTP_USER"]="SMTP_USER"
    ["SMTP_PASS"]="SMTP_PASS"
    ["SMTP_FROM_EMAIL"]="SMTP_FROM_EMAIL"
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

    if gcloud secrets describe "${secret_name}" --project="${PROJECT_ID}" --quiet >/dev/null 2>&1; then
        # Add new version (Secret Manager keeps version history automatically)
        printf '%s' "$value" | gcloud secrets versions add "${secret_name}" \
            --data-file=- \
            --project="${PROJECT_ID}" \
            --quiet
        success "Updated secret: ${secret_name}"
    else
        printf '%s' "$value" | gcloud secrets create "${secret_name}" \
            --data-file=- \
            --replication-policy=automatic \
            --project="${PROJECT_ID}" \
            --quiet
        success "Created secret: ${secret_name}"
    fi
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
    push_secret "REDIS_URL" "$UPSTASH_URL"
else
    warn "Invalid or empty Upstash URL — skipping REDIS_URL secret."
    warn "Set it manually: echo -n 'rediss://...' | gcloud secrets versions add REDIS_URL --data-file=-"
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
