#!/usr/bin/env bash
# =============================================================================
# Menorah Health — GCP Project Setup Script
# =============================================================================
# Run ONCE from your local machine (not the VPS) before first deployment.
# Prerequisites:
#   - gcloud CLI installed: https://cloud.google.com/sdk/docs/install
#   - Logged in:  gcloud auth login
#   - Billing enabled on your GCP project
#
# Usage:
#   GCP_PROJECT_ID=your-project-id GCP_REGION=asia-south1 bash scripts/gcp-setup.sh
#
# What this does:
#   1.  Set active GCP project
#   2.  Enable required APIs
#   3.  Create Artifact Registry Docker repository
#   4.  Create two service accounts (CI/CD + Cloud Run runtime)
#   5.  Grant minimum IAM permissions to each
#   6.  Create CI/CD service account key → print as base64 for GitHub Secrets
#   7.  Create Secret Manager secrets (empty — you fill values via secrets-sync.sh)
#   8.  Print the full checklist of GitHub Secrets to add
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Config (override via env vars) ────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
REGION="${GCP_REGION:-asia-south1}"          # Mumbai — lowest latency for India
AR_REPO="menorah"                            # Artifact Registry repo name
CICD_SA="menorah-cicd"                       # Service account for GitHub Actions
RUNTIME_SA="menorah-cloudrun"                # Service account for Cloud Run runtime
SERVICE_NAME="menorah-api"                   # Cloud Run service name

info "==========================================================="
info " Menorah Health — GCP Setup"
info " Project : ${PROJECT_ID}"
info " Region  : ${REGION}"
info "==========================================================="

# ── 1. Set active project ─────────────────────────────────────────────────
gcloud config set project "${PROJECT_ID}"
success "Active project set to ${PROJECT_ID}"

# ── 2. Enable required APIs ───────────────────────────────────────────────
info "Enabling GCP APIs (this takes ~60 seconds)..."
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    iam.googleapis.com \
    cloudresourcemanager.googleapis.com \
    --quiet
success "APIs enabled: Cloud Run, Artifact Registry, Secret Manager, IAM"

# ── 3. Artifact Registry Docker repository ────────────────────────────────
if gcloud artifacts repositories describe "${AR_REPO}" \
    --location="${REGION}" --quiet 2>/dev/null; then
    info "Artifact Registry repo '${AR_REPO}' already exists"
else
    info "Creating Artifact Registry repo '${AR_REPO}'..."
    gcloud artifacts repositories create "${AR_REPO}" \
        --repository-format=docker \
        --location="${REGION}" \
        --description="Menorah Health Docker images" \
        --quiet
    success "Artifact Registry repo created: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
fi

# ── 4. Service accounts ───────────────────────────────────────────────────
create_sa_if_missing() {
    local sa_name="$1" display_name="$2"
    local sa_email="${sa_name}@${PROJECT_ID}.iam.gserviceaccount.com"
    if gcloud iam service-accounts describe "${sa_email}" --quiet 2>/dev/null; then
        info "Service account ${sa_email} already exists"
    else
        info "Creating service account ${sa_name}..."
        gcloud iam service-accounts create "${sa_name}" \
            --display-name="${display_name}" \
            --quiet
        success "Created ${sa_email}"
    fi
}

create_sa_if_missing "${CICD_SA}"    "Menorah CI/CD (GitHub Actions)"
create_sa_if_missing "${RUNTIME_SA}" "Menorah Cloud Run Runtime"

CICD_EMAIL="${CICD_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

# ── 5. IAM permissions ────────────────────────────────────────────────────
info "Granting IAM permissions..."

grant_role() {
    local email="$1" role="$2"
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${email}" \
        --role="${role}" \
        --condition=None \
        --quiet > /dev/null
}

# CI/CD service account — needs to push images and deploy Cloud Run services
grant_role "${CICD_EMAIL}" "roles/artifactregistry.writer"
grant_role "${CICD_EMAIL}" "roles/run.admin"
grant_role "${CICD_EMAIL}" "roles/iam.serviceAccountUser"   # deploy as runtime SA
grant_role "${CICD_EMAIL}" "roles/secretmanager.secretVersionAdder"  # create secret versions

# Runtime service account — Cloud Run containers run as this identity
grant_role "${RUNTIME_EMAIL}" "roles/secretmanager.secretAccessor"  # read secrets at startup
grant_role "${RUNTIME_EMAIL}" "roles/cloudtrace.agent"              # optional: tracing

success "IAM permissions granted"

# ── 6. CI/CD service account key ─────────────────────────────────────────
KEY_FILE="/tmp/menorah-cicd-key.json"
info "Creating CI/CD service account key..."
gcloud iam service-accounts keys create "${KEY_FILE}" \
    --iam-account="${CICD_EMAIL}" \
    --quiet
success "Key created at ${KEY_FILE}"

# Base64 encode for GitHub Secret
KEY_B64=$(base64 -w 0 < "${KEY_FILE}")
rm -f "${KEY_FILE}"

# ── 7. Secret Manager — create empty secrets (values added by secrets-sync.sh) ──
info "Creating Secret Manager secrets (empty — run secrets-sync.sh to populate)..."

SECRET_NAMES=(
    "MONGODB_URI"
    "REDIS_URL"
    "JWT_SECRET"
    "JWT_REFRESH_SECRET"
    "ALLOWED_ORIGINS"
    "MSG91_AUTH_KEY"
    "MSG91_OTP_TEMPLATE_ID"
    "MSG91_SMS_TEMPLATE_ID"
    "RESEND_API_KEY"
    "EMAIL_FROM"
    "RAZORPAY_KEY_ID"
    "RAZORPAY_KEY_SECRET"
    "RAZORPAY_WEBHOOK_SECRET"
    "CLOUDINARY_CLOUD_NAME"
    "CLOUDINARY_API_KEY"
    "CLOUDINARY_API_SECRET"
    "WEB_APP_URL"
    "LIVEKIT_API_KEY"
    "LIVEKIT_API_SECRET"
    "OPENAI_API_KEY"
    "LUXAND_API_TOKEN"
)

for secret in "${SECRET_NAMES[@]}"; do
    if gcloud secrets describe "${secret}" --quiet 2>/dev/null; then
        info "Secret '${secret}' already exists"
    else
        # Create with a placeholder — secrets-sync.sh will add the real version
        echo -n "PLACEHOLDER" | gcloud secrets create "${secret}" \
            --data-file=- \
            --replication-policy=automatic \
            --quiet
        info "Created secret: ${secret}"
    fi
done
success "All secrets created in Secret Manager"

# ── 8. Checklist ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} GCP Setup Complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "${YELLOW}Add these secrets to GitHub → Settings → Secrets → Actions:${NC}"
echo ""
echo "  GCP_PROJECT_ID      = ${PROJECT_ID}"
echo "  GCP_REGION          = ${REGION}"
echo "  GCP_AR_REGION       = ${REGION}"
echo "  GCP_SA_KEY          = (paste the value below — it's the service account JSON key base64-encoded)"
echo ""
echo -e "${BLUE}GCP_SA_KEY value:${NC}"
echo "${KEY_B64}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "  1. Run secrets-sync.sh to push your .env values to Secret Manager:"
echo "     GCP_PROJECT_ID=${PROJECT_ID} bash gcp/secrets-sync.sh menorah/backend/.env"
echo ""
echo "  2. Update gcp/cloudrun.yaml — replace PROJECT_ID placeholders:"
echo "     sed -i 's/YOUR_PROJECT_ID/${PROJECT_ID}/g' gcp/cloudrun.yaml"
echo "     sed -i 's/YOUR_REGION/${REGION}/g'         gcp/cloudrun.yaml"
echo ""
echo "  3. Push to main — GitHub Actions will deploy to both VPS and Cloud Run."
echo ""
echo "  4. Copy the Cloud Run service URL shown after first deploy and set it"
echo "     in your Cloudflare Worker:"
echo "     npx wrangler secret put GCP_URL"
echo ""
echo -e "${YELLOW}Image registry path:${NC}"
echo "  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/menorah-api"
echo ""
