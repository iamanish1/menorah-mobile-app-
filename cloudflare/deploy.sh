#!/usr/bin/env bash
# ── Menorah Health — Cloudflare Worker deployment script ────────────────────
#
# Run this ONCE to:
#   1. Create KV namespaces (prod + preview)
#   2. Patch their IDs into wrangler.toml automatically
#   3. Prompt for VPS_URL + GCP_URL and store as Wrangler secrets
#   4. Deploy the Worker
#
# Prerequisites:
#   - Node.js installed
#   - Logged in to Wrangler: npx wrangler login
#   - jq installed: sudo apt install jq  (Ubuntu) or brew install jq (macOS)
#
# Usage:
#   chmod +x cloudflare/deploy.sh
#   cd cloudflare && bash deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOML="$SCRIPT_DIR/wrangler.toml"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Menorah Health — Cloudflare Worker Deployment"
echo "══════════════════════════════════════════════════════════"
echo ""

# ── Guard: check for jq ────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with:"
  echo "  Ubuntu/Debian: sudo apt install jq"
  echo "  macOS:         brew install jq"
  exit 1
fi

# ── Guard: check for wrangler ─────────────────────────────────────────────
if ! npx wrangler --version &>/dev/null; then
  echo "ERROR: wrangler not found. Run: npm install -g wrangler"
  exit 1
fi

# ── Guard: skip KV creation if IDs are already set ────────────────────────
PROD_ID=$(grep -E '^id\s*=' "$TOML" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')
PREVIEW_ID=$(grep -E '^preview_id\s*=' "$TOML" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')

if [[ "$PROD_ID" == "REPLACE_WITH_KV_NAMESPACE_ID" ]]; then
  echo "── Step 1/4: Creating KV namespace (production) ─────────────────────────"
  PROD_OUTPUT=$(npx wrangler kv namespace create "HEALTH_KV" --format json 2>/dev/null || \
                npx wrangler kv namespace create "HEALTH_KV" 2>&1)

  # Try JSON parse first (newer wrangler versions), fall back to text grep
  PROD_KV_ID=$(echo "$PROD_OUTPUT" | jq -r '.id' 2>/dev/null || \
               echo "$PROD_OUTPUT" | grep -oP '"id":\s*"\K[^"]+' | head -1)

  if [[ -z "$PROD_KV_ID" ]]; then
    echo "ERROR: Could not extract KV namespace ID from wrangler output."
    echo "Output was:"
    echo "$PROD_OUTPUT"
    echo ""
    echo "Create the KV namespace manually and paste the ID when prompted:"
    read -rp "Paste production KV namespace ID: " PROD_KV_ID
  fi

  echo "  Production KV ID: $PROD_KV_ID"

  echo "── Step 1/4: Creating KV namespace (preview / wrangler dev) ────────────"
  PREVIEW_OUTPUT=$(npx wrangler kv namespace create "HEALTH_KV" --preview --format json 2>/dev/null || \
                   npx wrangler kv namespace create "HEALTH_KV" --preview 2>&1)

  PREVIEW_KV_ID=$(echo "$PREVIEW_OUTPUT" | jq -r '.id' 2>/dev/null || \
                  echo "$PREVIEW_OUTPUT" | grep -oP '"id":\s*"\K[^"]+' | head -1)

  if [[ -z "$PREVIEW_KV_ID" ]]; then
    echo "ERROR: Could not extract preview KV namespace ID."
    echo "Output was:"
    echo "$PREVIEW_OUTPUT"
    read -rp "Paste preview KV namespace ID: " PREVIEW_KV_ID
  fi

  echo "  Preview KV ID: $PREVIEW_KV_ID"

  echo ""
  echo "── Step 1/4: Patching wrangler.toml with KV IDs ───────────────────────"
  # Replace placeholder IDs in wrangler.toml (in-place, compatible with both GNU + BSD sed)
  sed -i.bak \
    "s|REPLACE_WITH_KV_NAMESPACE_ID|$PROD_KV_ID|g" \
    "$TOML"
  sed -i.bak \
    "s|REPLACE_WITH_KV_PREVIEW_NAMESPACE_ID|$PREVIEW_KV_ID|g" \
    "$TOML"
  rm -f "$TOML.bak"
  echo "  wrangler.toml updated."
else
  echo "── Step 1/4: KV namespaces already configured — skipping creation ──────"
  echo "  Production KV ID: $PROD_ID"
  echo "  Preview KV ID:    $PREVIEW_ID"
fi

# ── Step 2: Set secrets ───────────────────────────────────────────────────
echo ""
echo "── Step 2/4: Setting Cloudflare Worker secrets ──────────────────────────"
echo "  These are stored encrypted in Cloudflare — never in wrangler.toml."
echo ""

# VPS_URL
read -rp "Enter VPS_URL (e.g. https://api.menorahhealth.app): " VPS_URL
if [[ -z "$VPS_URL" ]]; then
  echo "ERROR: VPS_URL cannot be empty."
  exit 1
fi
echo "$VPS_URL" | npx wrangler secret put VPS_URL
echo "  VPS_URL set."

# GCP_URL
read -rp "Enter GCP_URL (Cloud Run URL, e.g. https://menorah-api-xxxx-uc.a.run.app): " GCP_URL
if [[ -z "$GCP_URL" ]]; then
  echo "ERROR: GCP_URL cannot be empty."
  exit 1
fi
echo "$GCP_URL" | npx wrangler secret put GCP_URL
echo "  GCP_URL set."

# ── Step 3: Verify wrangler.toml ──────────────────────────────────────────
echo ""
echo "── Step 3/4: Validating wrangler.toml ──────────────────────────────────"
if grep -q "REPLACE_WITH" "$TOML"; then
  echo "WARNING: wrangler.toml still contains placeholder values:"
  grep "REPLACE_WITH" "$TOML"
  echo ""
  echo "Fix the placeholders above and re-run this script."
  exit 1
fi
echo "  wrangler.toml looks good."

# ── Step 4: Deploy ────────────────────────────────────────────────────────
echo ""
echo "── Step 4/4: Deploying Cloudflare Worker ───────────────────────────────"
cd "$SCRIPT_DIR"
npx wrangler deploy

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo ""
echo "  Next steps:"
echo "  1. In Cloudflare dashboard → your domain → DNS:"
echo "     Add an A record:  api.menorahhealth.app → your VPS IP"
echo "     Set proxy status: Proxied (orange cloud)"
echo ""
echo "  2. Verify routing (from any machine):"
echo "     curl -I https://api.menorahhealth.app/health"
echo "     # Check the X-Menorah-Route response header"
echo ""
echo "  3. Monitor Worker logs:"
echo "     npx wrangler tail"
echo "══════════════════════════════════════════════════════════"
