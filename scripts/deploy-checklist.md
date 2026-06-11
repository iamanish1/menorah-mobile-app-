# Menorah Health — Production Deployment Checklist

Run these steps in order. Each step is designed to be done once
unless you're reprovisioning a server.

---

## Phase 1 — DNS Setup (do this first, takes 10–60 min to propagate)

Log into your domain registrar and add these A records:

| Subdomain | Points to | TTL |
|---|---|---|
| `api.menorahhealth.app` | VPS-1 public IP | 300 |
| `livekit.menorahhealth.app` | VPS-3 public IP | 300 |

Verify propagation before continuing:
```bash
dig api.menorahhealth.app +short       # should return VPS-1 IP
dig livekit.menorahhealth.app +short   # should return VPS-3 IP
```

---

## Phase 2 — VPS-1 and VPS-2 Setup (App Servers)

### 2a. Run the bootstrap script on each app VPS

```bash
ssh root@<vps-1-ip>
curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/vps-setup.sh | bash
```

The script will print a next-steps list at the end. Follow it.

### 2b. Fill in secrets on VPS-1

```bash
nano /opt/menorah/.env
```

Replace every `REPLACE_WITH_...` value. The required fields are:

```
MONGODB_URI       = mongodb+srv://...   (Atlas connection string)
JWT_SECRET        = <64+ char random>   (node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_REFRESH_SECRET = <64+ char random>
ALLOWED_ORIGINS   = https://menorahhealth.app,https://counsellor.menorahhealth.app
MSG91_AUTH_KEY    = <from msg91.com>
MSG91_OTP_TEMPLATE_ID
MSG91_SMS_TEMPLATE_ID
RAZORPAY_KEY_ID   = rzp_live_...
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
LUXAND_API_TOKEN   = <from Luxand Cloud dashboard>
LUXAND_DETECT_URL  = https://api.luxand.cloud/photo/detect
LUXAND_FACE_CONFIDENCE_THRESHOLD = 90
EKYC_MAX_FILE_SIZE = 15728640
LIVEKIT_API_KEY   = <generate below>
LIVEKIT_API_SECRET = <generate below>
REDIS_URL         = redis://127.0.0.1:6379
```

Generate LiveKit credentials:
```bash
LIVEKIT_API_KEY=$(openssl rand -hex 16)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
echo "LIVEKIT_API_KEY=$LIVEKIT_API_KEY"
echo "LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET"
# Paste both into /opt/menorah/.env AND into livekit/livekit.yaml
```

### 2c. Add GitHub Actions SSH public key

```bash
# Generate on your local machine if you don't have a deploy key:
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/menorah_deploy

# Add the public key to VPS-1
echo "$(cat ~/.ssh/menorah_deploy.pub)" >> /home/deploy/.ssh/authorized_keys

# Add the PRIVATE key content to GitHub Secrets as VPS_SSH_KEY
cat ~/.ssh/menorah_deploy
```

### 2d. Issue SSL certificate (after DNS propagates)

```bash
# On VPS-1
certbot --nginx -d api.menorahhealth.app \
  --non-interactive --agree-tos -m admin@menorahhealth.app
```

### 2e. Add GitHub Secrets for VPS deployment

Go to GitHub → repo → Settings → Secrets → Actions → New repository secret:

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS-1 public IP |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Contents of `~/.ssh/menorah_deploy` (private key) |
| `VPS_PORT` | `22` |

---

## Phase 3 — GCP Cloud Run Setup

### 3a. Run the GCP setup script

```bash
# On your local machine (not the VPS), with gcloud installed and authenticated
GCP_PROJECT_ID=your-project-id GCP_REGION=asia-south1 bash scripts/gcp-setup.sh
```

This script:
- Enables required GCP APIs
- Creates Artifact Registry repo
- Creates service accounts with minimum IAM permissions
- Creates all Secret Manager secrets
- Prints the `GCP_SA_KEY` base64 value you need for GitHub Secrets

### 3b. Create Upstash Redis (for Cloud Run)

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create Database → Region: Mumbai (ap-south-1)
3. Copy the **REST API URL** (starts with `rediss://`) — this is your Upstash URL

### 3c. Sync secrets to GCP Secret Manager

```bash
GCP_PROJECT_ID=your-project-id bash gcp/secrets-sync.sh menorah/backend/.env
# When prompted for REDIS_URL, paste the Upstash rediss:// URL
```

### 3d. Add GitHub Secrets for GCP deployment

| Secret | Value |
|---|---|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_REGION` | `asia-south1` |
| `GCP_AR_REGION` | `asia-south1` |
| `GCP_SA_KEY` | Base64 key printed by `gcp-setup.sh` |

---

## Phase 4 — LiveKit on VPS-3

### 4a. Run VPS setup on VPS-3

```bash
ssh root@<vps-3-ip>
curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/vps-setup.sh | bash
```

### 4b. Configure livekit.yaml

```bash
# Clone repo or scp the livekit/ directory to VPS-3
git clone <repo> /opt/livekit && cd /opt/livekit

# Edit livekit/livekit.yaml — replace REPLACE_LIVEKIT_API_KEY and REPLACE_LIVEKIT_API_SECRET
# with the SAME values you put in /opt/menorah/.env on VPS-1
nano livekit/livekit.yaml
```

### 4c. Open firewall ports for LiveKit

```bash
sudo ufw allow 7880/tcp   # HTTP API + WebSocket
sudo ufw allow 7881/tcp   # RTC over TCP
sudo ufw allow 50000:60000/udp  # WebRTC media (UDP)
# Port 443 is already open from vps-setup.sh
```

### 4d. Issue SSL cert for LiveKit subdomain (after DNS propagates)

```bash
certbot certonly --standalone -d livekit.menorahhealth.app \
  --non-interactive --agree-tos -m admin@menorahhealth.app

# Then configure nginx for livekit.menorahhealth.app
# (nginx.conf LiveKit block is already written in nginx/nginx.conf)
```

### 4e. Start LiveKit

```bash
cd /opt/livekit
docker compose -f livekit/docker-compose.livekit.yml up -d
docker compose -f livekit/docker-compose.livekit.yml logs -f
# Should see: "starting LiveKit server"
```

---

## Phase 5 — Cloudflare Worker

### 5a. Deploy the smart VPS↔GCP router

```bash
cd cloudflare
npm install -g wrangler   # one-time

# Create KV namespace
npx wrangler kv namespace create "HEALTH_KV"
# Paste the returned id into cloudflare/wrangler.toml under kv_namespaces[0].id
# Also set preview_id if you want local testing

# Set secrets (Cloudflare will prompt for values)
npx wrangler secret put VPS_URL    # enter: https://api.menorahhealth.app
npx wrangler secret put GCP_URL    # enter: your Cloud Run URL (printed after first deploy)

# Deploy
npx wrangler deploy
```

### 5b. Point menorahhealth.app through Cloudflare

In Cloudflare dashboard:
1. Add your domain (menorahhealth.app) to Cloudflare
2. Update nameservers at your registrar to Cloudflare's
3. Ensure proxy (orange cloud) is ON for `api.menorahhealth.app`

---

## Phase 6 — First Deployment (trigger CI/CD)

```bash
# Push to main — GitHub Actions builds and deploys to BOTH VPS and Cloud Run
git push origin main
```

Watch the Actions tab. You should see 4 jobs: build → deploy-vps + deploy-cloudrun → summary.

After Cloud Run deploys, copy the printed URL and update the Cloudflare Worker:
```bash
cd cloudflare
npx wrangler secret put GCP_URL   # paste Cloud Run URL
```

---

## Phase 7 — Web App Deployments (Vercel)

### 7a. Counsellor web app

```bash
cd menorah/web-app
npx vercel --prod

# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_API_URL    = https://api.menorahhealth.app/api
# NEXT_PUBLIC_SOCKET_URL = https://api.menorahhealth.app
```

### 7b. User web app

```bash
cd menorah/user-web-app
npx vercel --prod

# Additional env vars:
# NEXT_PUBLIC_RAZORPAY_KEY_ID = rzp_live_...
# NEXT_PUBLIC_JITSI_DOMAIN    = (no longer needed — using LiveKit)
```

---

## Phase 8 — Mobile App (Google Play)

```bash
cd menorah/mobile-app

# Update app.json: version, versionCode (increment for each release)
# Set production API URL:
# In src/lib/env.ts: API_BASE_URL = https://api.menorahhealth.app/api

# Build production APK/AAB
npx eas build --platform android --profile production

# Submit to Play Console
npx eas submit --platform android
```

---

## Post-Deployment Verification

Run these after everything is deployed:

```bash
# 1. Backend health check
curl https://api.menorahhealth.app/health

# 2. LiveKit health check
curl https://livekit.menorahhealth.app/

# 3. Cloud Run health check (direct URL, bypassing Cloudflare)
curl https://menorah-api-xxxx.run.app/health

# 4. Test the full registration → OTP → login flow on mobile
# 5. Test counsellor login → accept booking → start video call
# 6. Test Razorpay payment with test card: 4111 1111 1111 1111
```

---

## Monitoring Setup

```bash
# PM2 monitoring on VPS
pm2 monit

# View live API logs
docker logs -f menorah-api

# MongoDB Atlas: Dashboard → Metrics (queries, connections, slow operations)
# Upstash: Dashboard → Usage (commands per day, latency)
# GCP Cloud Run: Console → Cloud Run → menorah-api → Logs
```

---

## Rollback Procedure

```bash
# VPS: roll back to previous Docker image
ssh deploy@<vps-ip>
docker stop menorah-api
docker run -d --name menorah-api \
  --network host --env-file /opt/menorah/.env \
  ghcr.io/<org>/menorah-api:sha-<previous-sha>

# Cloud Run: roll back via GCP console
# Cloud Run → menorah-api → Revisions → previous revision → Send 100% traffic
```
