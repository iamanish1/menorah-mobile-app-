# Menorah Health — Production Setup Guide

## Architecture Overview

```
Mobile App / Web Apps
        │
        ▼
api.menorah.me  ←── Cloudflare (Proxy ON, orange cloud)
        │
        ▼
Cloudflare Worker  (menorah-router)
  ├─ reads KV health state (set by cron every 60s)
  ├─ /socket.io/*  ──────────────────────────────► VPS (always)
  ├─ /api/video/livekit-webhook ─────────────────► VPS (always)
  ├─ VPS healthy + fast  ────────────────────────► VPS
  ├─ VPS slow (>2s)      ──── 50/50 split ───────► VPS or GCP
  └─ VPS down            ────────────────────────► GCP (100%)
        │                                              │
        ▼                                              ▼
vps.menorah.me                          Cloud Run .run.app URL
(Proxy OFF, gray cloud)                 (Google-managed URL)
        │                                              │
        ▼                                              ▼
   nginx → PM2 cluster                     Docker container
   (port 443 → 3000)                       (port 3000)
   ENABLE_SOCKET_ADAPTER=true (default)    ENABLE_SOCKET_ADAPTER=false
        │                                              │
        └──────────────┬───────────────────────────────┘
                       │
             ┌─────────┴──────────┐
             ▼                    ▼
      MongoDB Atlas          Upstash Redis
      (accessible from       (accessible from
       anywhere via TLS)      anywhere via TLS)
```

---

## Step 1 — DNS Setup in Cloudflare

In your Cloudflare dashboard → **menorah.me** zone → DNS:

| Name  | Type | Value          | Proxy       |
|-------|------|----------------|-------------|
| `api` | A    | `<VPS IP>`     | ON (orange) |
| `vps` | A    | `<VPS IP>`     | OFF (gray)  |

- `api.menorah.me` is the **public** domain — Cloudflare proxy ON means the Worker intercepts all traffic here
- `vps.menorah.me` is the **direct** domain — proxy OFF means requests go straight to the VPS, bypassing the Worker
- The Worker uses `vps.menorah.me` as its `VPS_URL` to avoid a circular health-check loop

---

## Step 2 — Upstash Redis (required for GCP Cloud Run)

GCP Cloud Run cannot reach `redis://localhost:6379` on the VPS. Both VPS and GCP must use the same external Redis URL.

1. Go to [upstash.com](https://upstash.com) → Create Database
   - Region: **Asia (Mumbai)** — closest to your VPS and GCP region (asia-south1)
   - TLS: enabled (default)
2. Copy the `REDIS_URL` in format: `rediss://default:<password>@<host>.upstash.io:6379`

Use this URL in **both places**:
- VPS `.env` → `REDIS_URL=rediss://...`
- GCP Secret Manager → update the `REDIS_URL` secret value

---

## Step 3 — VPS Setup

```bash
# Upload the setup script
scp vps-setup.sh user@<VPS IP>:~

# Run it
ssh user@<VPS IP> "sudo bash ~/vps-setup.sh"
```

The script installs: Node 20, PM2, nginx, Certbot, gets SSL certs for **both** `api.menorah.me` and `vps.menorah.me`.

### VPS `.env` file

After the script finishes, create `/var/www/menorah-api/.env`:

```env
NODE_ENV=production
PORT=3000

MONGODB_URI=mongodb+srv://...
JWT_SECRET=<64+ char random hex>
JWT_EXPIRES_IN=7d

# Must be Upstash — NOT redis://localhost:6379
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
ENABLE_SOCKET_ADAPTER=true

ALLOWED_ORIGINS=https://menorah.me,https://www.menorah.me,https://app.menorah.me
WEB_APP_URL=https://menorah.me
MOBILE_APP_SCHEME=menorah://

RESEND_API_KEY=
EMAIL_FROM="Menorah Health <noreply@menorah.me>"

# Optional SMS-only MSG91 settings
MSG91_AUTH_KEY=
MSG91_OTP_TEMPLATE_ID=
MSG91_SMS_TEMPLATE_ID=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

OPENAI_API_KEY=
SOCIAL_STUDIO_OPENAI_API_KEY=
SOCIAL_STUDIO_AI_PROVIDER=openai
SOCIAL_STUDIO_AI_TEXT_MODEL=gpt-4o-mini
SOCIAL_STUDIO_STORAGE=local

LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=
```

```bash
# Upload .env
scp .env menorah@api.menorah.me:/var/www/menorah-api/.env

# Start with PM2
ssh menorah@api.menorah.me "cd /var/www/menorah-api && pm2 start ecosystem.config.js --env production && pm2 save"

# Verify
curl https://api.menorah.me/health      # goes through Worker
curl https://vps.menorah.me/health      # direct to VPS (what Worker uses)
```

---

## Step 4 — GCP Cloud Run Setup

### One-time GCP setup

```bash
# Set your project
gcloud config set project <YOUR_PROJECT_ID>

# Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# Create Artifact Registry repo
gcloud artifacts repositories create menorah-api \
  --repository-format=docker \
  --location=asia-south1

# Create all secrets in Secret Manager
# Replace the values with your real secrets

echo -n "mongodb+srv://..." | gcloud secrets create MONGODB_URI --data-file=-
echo -n "<64-char-hex>" | gcloud secrets create JWT_SECRET --data-file=-

# REDIS_URL must be Upstash — same URL as VPS
echo -n "rediss://default:<pass>@<host>.upstash.io:6379" | gcloud secrets create REDIS_URL --data-file=-

echo -n "7d" | gcloud secrets create JWT_EXPIRES_IN --data-file=-
echo -n "https://menorah.me,https://www.menorah.me" | gcloud secrets create ALLOWED_ORIGINS --data-file=-
echo -n "https://menorah.me" | gcloud secrets create WEB_APP_URL --data-file=-
echo -n "<resend-api-key>" | gcloud secrets create RESEND_API_KEY --data-file=-
echo -n "Menorah Health <noreply@menorah.me>" | gcloud secrets create EMAIL_FROM --data-file=-
echo -n "<razorpay-key-id>" | gcloud secrets create RAZORPAY_KEY_ID --data-file=-
echo -n "<razorpay-secret>" | gcloud secrets create RAZORPAY_KEY_SECRET --data-file=-
echo -n "<razorpay-webhook-secret>" | gcloud secrets create RAZORPAY_WEBHOOK_SECRET --data-file=-
echo -n "<cloudinary-name>" | gcloud secrets create CLOUDINARY_CLOUD_NAME --data-file=-
echo -n "<cloudinary-api-key>" | gcloud secrets create CLOUDINARY_API_KEY --data-file=-
echo -n "<cloudinary-api-secret>" | gcloud secrets create CLOUDINARY_API_SECRET --data-file=-
echo -n "<livekit-api-key>" | gcloud secrets create LIVEKIT_API_KEY --data-file=-
echo -n "<livekit-api-secret>" | gcloud secrets create LIVEKIT_API_SECRET --data-file=-
echo -n "wss://..." | gcloud secrets create LIVEKIT_URL --data-file=-

# Grant Cloud Build + Cloud Run access to secrets
PROJECT_NUM=$(gcloud projects describe <YOUR_PROJECT_ID> --format='value(projectNumber)')
gcloud projects add-iam-policy-binding <YOUR_PROJECT_ID> \
  --member="serviceAccount:${PROJECT_NUM}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding <YOUR_PROJECT_ID> \
  --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Update an existing secret

```bash
echo -n "new-value" | gcloud secrets versions add REDIS_URL --data-file=-
```

### Deploy to Cloud Run

```bash
# From repo root — triggers cloudbuild.yaml
gcloud builds submit \
  --config=menorah/backend/cloudbuild.yaml \
  --substitutions=_PROJECT_ID=<YOUR_PROJECT_ID>,_REGION=asia-south1,_SERVICE_NAME=menorah-api \
  .
```

Or set up a Cloud Build trigger on `main` branch push.

### Whitelist GCP IPs in MongoDB Atlas

GCP Cloud Run uses dynamic IPs. Two options:

**Option A (recommended):** Allow `0.0.0.0/0` in Atlas → Network Access → Add IP Address → "Allow access from anywhere"
- MongoDB Atlas still requires authentication (user + password in connection string)
- Use a strong password and TLS is always on

**Option B:** Use a Cloud NAT Gateway with a fixed static IP (more complex, more secure)

---

## Step 5 — Cloudflare Worker Deploy

```bash
cd cloudflare
bash deploy.sh
```

When prompted:
- `VPS_URL` → `https://vps.menorah.me`  ← MUST be the direct domain (proxy OFF)
- `GCP_URL` → `https://menorah-api-<hash>-<region>.a.run.app`  ← the Cloud Run URL from step 4

### Find your Cloud Run URL

```bash
gcloud run services describe menorah-api --region=asia-south1 --format='value(status.url)'
```

---

## Step 6 — Verify Everything

```bash
# 1. VPS direct health (what the Worker's cron pings)
curl https://vps.menorah.me/health
# Expected: {"success":true,"status":"OK","timestamp":"..."}

# 2. Public API (goes through Worker → VPS or GCP)
curl https://api.menorah.me/health
# Expected: same JSON, header X-Menorah-Route: vps or gcp

# 3. Check which backend served the request
curl -I https://api.menorah.me/health | grep x-menorah-route
# x-menorah-route: vps   (or gcp when traffic splits)

# 4. GCP health (direct, bypassing Worker)
curl https://menorah-api-<hash>-uc.a.run.app/health

# 5. Socket.IO — always VPS
# Check app connects to wss://api.menorah.me/socket.io/
```

---

## Environment Variables Reference

| Var | VPS | GCP Secret | Notes |
|-----|-----|------------|-------|
| `NODE_ENV` | `.env` | cloudbuild inline | `production` |
| `PORT` | `.env` (3000) | cloudbuild inline | 3000 |
| `ENABLE_SOCKET_ADAPTER` | `.env` = `true` | cloudbuild inline = `false` | GCP never handles sockets |
| `MONGODB_URI` | `.env` | Secret Manager | same value |
| `JWT_SECRET` | `.env` | Secret Manager | same value |
| `REDIS_URL` | `.env` = Upstash | Secret Manager = Upstash | MUST be Upstash, not localhost |
| `ALLOWED_ORIGINS` | `.env` | Secret Manager | comma-separated |
| `WEB_APP_URL` | `.env` | Secret Manager | `https://menorah.me` |
| `MOBILE_APP_SCHEME` | `.env` | cloudbuild inline | `menorah://` |
| `OPENAI_API_KEY` | `.env` | Secret Manager | CMS article generation |
| `SOCIAL_STUDIO_OPENAI_API_KEY` | `.env` | not required in Cloud Run while Social Studio is VPS-pinned | Dedicated key for AI Social Studio; falls back to `OPENAI_API_KEY` if empty |

---

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `VPS_URL=https://api.menorah.me` | Worker health check loops into itself | Use `https://vps.menorah.me` (proxy OFF) |
| `REDIS_URL=redis://localhost:6379` on GCP | Cloud Run crashes on startup | Use Upstash URL in GCP secret |
| `vps.menorah.me` proxy ON | Worker can't reach VPS directly | Set proxy to OFF (gray cloud) |
| MongoDB Atlas IP not whitelisted | GCP sees connection timeout | Add 0.0.0.0/0 or GCP NAT IP to Atlas |
| Certbot only covers `api.menorah.me` | nginx 502 on `vps.menorah.me` requests | Run certbot with both `-d` flags |
