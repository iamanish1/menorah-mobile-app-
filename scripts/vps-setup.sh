#!/usr/bin/env bash
# =============================================================================
# Menorah Health — VPS Bootstrap Script
# =============================================================================
# Target OS : Ubuntu 22.04 LTS
# Run as    : root  (sudo -i  OR  ssh root@<vps-ip>)
# Usage     : curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/vps-setup.sh | bash
#             OR: scp scripts/vps-setup.sh root@<ip>:~ && ssh root@<ip> bash vps-setup.sh
#
# What this script does (idempotent — safe to run multiple times):
#   1.  System update + essential tools
#   2.  Docker CE install
#   3.  Redis install + harden (bind 127.0.0.1, memory limit, persistence)
#   4.  nginx install
#   5.  Certbot (Let's Encrypt SSL)
#   6.  Create deploy user with Docker permissions
#   7.  Create /opt/menorah directory structure + .env template
#   8.  Configure log rotation for Docker containers
#   9.  UFW firewall (allow SSH, HTTP, HTTPS only)
#  10.  Copy nginx config and enable site
#  11.  Print next-steps checklist
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && error "Run this script as root (sudo -i)"

# ── Config ─────────────────────────────────────────────────────────────────
DEPLOY_USER="deploy"
APP_DIR="/opt/menorah"
DOMAIN="${DOMAIN:-api.menorahhealth.app}"    # override: DOMAIN=yourdomain.com bash vps-setup.sh
REDIS_MAXMEM="512mb"

info "============================================================"
info " Menorah Health — VPS Bootstrap"
info " Domain : ${DOMAIN}"
info " App dir: ${APP_DIR}"
info "============================================================"

# ── 1. System update ───────────────────────────────────────────────────────
info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl wget git unzip jq \
    ca-certificates gnupg lsb-release \
    htop iotop net-tools \
    fail2ban \
    logrotate
success "System updated"

# ── 2. Docker CE ───────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
    info "Docker already installed: $(docker --version)"
else
    info "Installing Docker CE..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin
    systemctl enable --now docker
    success "Docker installed: $(docker --version)"
fi

# Docker log rotation — prevent containers filling the disk
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
EOF
systemctl reload docker 2>/dev/null || true

# ── 3. Redis ───────────────────────────────────────────────────────────────
if command -v redis-server &>/dev/null; then
    info "Redis already installed: $(redis-server --version | head -1)"
else
    info "Installing Redis..."
    apt-get install -y -qq redis-server
    success "Redis installed"
fi

# Harden Redis config
REDIS_CONF="/etc/redis/redis.conf"
info "Hardening Redis config..."

# Bind to localhost only — no external access
sed -i 's/^bind .*/bind 127.0.0.1 -::1/' "$REDIS_CONF"

# Enable persistence (AOF)
sed -i 's/^appendonly no/appendonly yes/' "$REDIS_CONF"

# Memory limit with LRU eviction (prevents OOM)
grep -q "^maxmemory " "$REDIS_CONF" \
    && sed -i "s/^maxmemory .*/maxmemory ${REDIS_MAXMEM}/" "$REDIS_CONF" \
    || echo "maxmemory ${REDIS_MAXMEM}" >> "$REDIS_CONF"

grep -q "^maxmemory-policy" "$REDIS_CONF" \
    && sed -i "s/^maxmemory-policy .*/maxmemory-policy allkeys-lru/" "$REDIS_CONF" \
    || echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"

systemctl enable --now redis-server
systemctl restart redis-server
redis-cli ping | grep -q PONG && success "Redis running and responding"

# ── 4. nginx ───────────────────────────────────────────────────────────────
if command -v nginx &>/dev/null; then
    info "nginx already installed: $(nginx -v 2>&1)"
else
    info "Installing nginx..."
    apt-get install -y -qq nginx
    systemctl enable nginx
    success "nginx installed"
fi

# ── 5. Certbot ─────────────────────────────────────────────────────────────
if command -v certbot &>/dev/null; then
    info "Certbot already installed"
else
    info "Installing Certbot..."
    apt-get install -y -qq certbot python3-certbot-nginx
    success "Certbot installed"
fi

# ── 6. Deploy user ─────────────────────────────────────────────────────────
if id "$DEPLOY_USER" &>/dev/null; then
    info "User '${DEPLOY_USER}' already exists"
else
    info "Creating deploy user '${DEPLOY_USER}'..."
    useradd -m -s /bin/bash "$DEPLOY_USER"
    success "User '${DEPLOY_USER}' created"
fi

# Give deploy user Docker access (so CI/CD can run docker commands)
usermod -aG docker "$DEPLOY_USER"

# Set up SSH authorized_keys for the deploy user
# The CI/CD pipeline needs to SSH in using its private key
DEPLOY_SSH_DIR="/home/${DEPLOY_USER}/.ssh"
mkdir -p "$DEPLOY_SSH_DIR"
touch "${DEPLOY_SSH_DIR}/authorized_keys"
chmod 700 "$DEPLOY_SSH_DIR"
chmod 600 "${DEPLOY_SSH_DIR}/authorized_keys"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$DEPLOY_SSH_DIR"

warn "ACTION REQUIRED: Add your CI/CD public key to ${DEPLOY_SSH_DIR}/authorized_keys"
warn "  cat ~/.ssh/id_rsa.pub >> ${DEPLOY_SSH_DIR}/authorized_keys"
warn "  OR paste the key directly:  echo '<key>' >> ${DEPLOY_SSH_DIR}/authorized_keys"

# ── 7. App directory structure ─────────────────────────────────────────────
info "Creating app directory structure at ${APP_DIR}..."
mkdir -p "${APP_DIR}/logs"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR"

# Create .env template if it doesn't exist
ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    cat > "$ENV_FILE" <<'ENVTEMPLATE'
# ============================================================
# Menorah Health — Production Environment
# Fill in ALL values before starting the container.
# ============================================================

# ── Server ─────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
API_BASE_URL=https://api.menorahhealth.app

# ── Database ───────────────────────────────────────────────
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/?appName=Cluster0

# ── Redis (running on host, accessible via host network) ───
REDIS_URL=redis://127.0.0.1:6379

# ── JWT ────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=REPLACE
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=REPLACE_WITH_64_CHAR_REFRESH_SECRET
JWT_REFRESH_EXPIRES_IN=30d

# ── CORS ───────────────────────────────────────────────────
ALLOWED_ORIGINS=https://menorahhealth.app,https://counsellor.menorahhealth.app,https://www.menorahhealth.app

# ── MSG91 ──────────────────────────────────────────────────
RESEND_API_KEY=REPLACE_WITH_RESEND_API_KEY
EMAIL_FROM="Menorah Health <noreply@menorah.me>"

# MSG91 SMS only
MSG91_AUTH_KEY=REPLACE
MSG91_OTP_TEMPLATE_ID=REPLACE
MSG91_SMS_TEMPLATE_ID=REPLACE
MOBILE_APP_SCHEME=menorah-health://reset-password

# ── Razorpay ───────────────────────────────────────────────
RAZORPAY_KEY_ID=REPLACE
RAZORPAY_KEY_SECRET=REPLACE
RAZORPAY_WEBHOOK_SECRET=REPLACE
# Optional planned-rotation grace only; keep empty normally and remove on schedule.
RAZORPAY_WEBHOOK_SECRET_PREVIOUS=
BOOKING_PAYMENTS_ENABLED=false
PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS=
SUBSCRIPTION_PAYMENTS_ENABLED=false
CHECKOUT_RETURN_URL=https://menorahhealth.app/checkout/return

# ── Cloudinary ─────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=REPLACE
CLOUDINARY_API_KEY=REPLACE
CLOUDINARY_API_SECRET=REPLACE

# AI Social Studio
# Prefer a separate key from article generation. If empty, backend falls back to OPENAI_API_KEY.
SOCIAL_STUDIO_ENABLED=true
SOCIAL_STUDIO_AUTO_PUBLISH=false
SOCIAL_STUDIO_STORAGE=local
SOCIAL_STUDIO_AI_PROVIDER=openai
SOCIAL_STUDIO_OPENAI_API_KEY=REPLACE
SOCIAL_STUDIO_AI_TEXT_MODEL=gpt-4o-mini
SOCIAL_STUDIO_AI_IMAGE_MODEL=
OPENAI_API_KEY=REPLACE
AI_TEXT_MODEL=gpt-4o-mini

# Meta / Instagram publishing
META_APP_ID=REPLACE
META_APP_SECRET=REPLACE
META_GRAPH_API_VERSION=v23.0
SOCIAL_TOKEN_ENCRYPTION_KEY=REPLACE
PUBLIC_WEB_BASE_URL=https://api.menorah.me

# ── Jitsi ──────────────────────────────────────────────────
JITSI_BASE_URL=https://meet.jit.si
JITSI_APP_ID=
JITSI_APP_SECRET=

# ── Security ───────────────────────────────────────────────
BCRYPT_ROUNDS=12
MAX_FILE_SIZE=5242880
SERVER_TZ=Asia/Kolkata
ENVTEMPLATE
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "$ENV_FILE"
    chmod 600 "$ENV_FILE"    # only owner can read — secrets protection
    warn "Created .env template at ${ENV_FILE} — fill in all REPLACE values before deploying"
else
    info ".env already exists at ${ENV_FILE}"
fi

# ── 8. Log rotation ────────────────────────────────────────────────────────
cat > /etc/logrotate.d/menorah <<EOF
${APP_DIR}/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 ${DEPLOY_USER} ${DEPLOY_USER}
}
EOF
success "Log rotation configured"

# ── 9. UFW Firewall ────────────────────────────────────────────────────────
info "Configuring UFW firewall..."
apt-get install -y -qq ufw

# Reset to defaults first (idempotent)
ufw --force reset > /dev/null

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP (nginx + certbot challenge)'
ufw allow 443/tcp  comment 'HTTPS'

# Block direct access to the API port — only nginx should talk to it
# (port 3000 stays closed externally; traffic comes through nginx)
ufw deny 3000/tcp  comment 'API — internal only via nginx'
ufw deny 6379/tcp  comment 'Redis — internal only'

ufw --force enable
success "Firewall configured: SSH(22), HTTP(80), HTTPS(443) open; 3000+6379 blocked"

# ── 10. nginx site config ──────────────────────────────────────────────────
NGINX_AVAILABLE="/etc/nginx/sites-available/menorahhealth"
NGINX_ENABLED="/etc/nginx/sites-enabled/menorahhealth"

if [[ ! -f "$NGINX_AVAILABLE" ]]; then
    info "Writing nginx site config..."
    # Write a minimal HTTP config first — certbot will upgrade it to HTTPS
    cat > "$NGINX_AVAILABLE" <<NGINXCONF
upstream menorah_api {
    least_conn;
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ { root /var/www/certbot; }

    location /socket.io/ {
        proxy_pass         http://menorah_api;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        proxy_pass         http://menorah_api;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host             \$host;
        proxy_set_header   X-Real-IP        \$remote_addr;
        proxy_set_header   X-Forwarded-For  \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        client_max_body_size 25m;
    }
}
NGINXCONF

    ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    success "nginx site config written and enabled"
else
    info "nginx config already exists at ${NGINX_AVAILABLE}"
fi

# ── 11. SSL with Certbot ───────────────────────────────────────────────────
if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
    info "SSL certificate already exists for ${DOMAIN}"
else
    warn "SSL certificate not yet issued."
    warn "Once your DNS A record points ${DOMAIN} → this server's IP, run:"
    warn "  certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m admin@menorahhealth.app"
    warn "Certbot will automatically upgrade the nginx config to HTTPS."
fi

# ── 12. fail2ban ───────────────────────────────────────────────────────────
systemctl enable --now fail2ban > /dev/null 2>&1 || true
success "fail2ban enabled (brute-force SSH protection)"

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} VPS Bootstrap Complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS (in order):${NC}"
echo ""
echo "  1. Point DNS A record for ${DOMAIN} → $(curl -4 -s ifconfig.me) (this server's IP)"
echo "  2. Fill in ALL secrets in ${ENV_FILE}"
echo "     nano ${ENV_FILE}"
echo ""
echo "  3. Add your CI/CD SSH public key:"
echo "     echo '<your-public-key>' >> /home/${DEPLOY_USER}/.ssh/authorized_keys"
echo ""
echo "  4. Issue SSL certificate (run AFTER DNS is pointing here):"
echo "     certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m admin@menorahhealth.app"
echo ""
echo "  5. Add these GitHub Secrets:"
echo "     VPS_HOST  = $(curl -4 -s ifconfig.me)"
echo "     VPS_USER  = ${DEPLOY_USER}"
echo "     VPS_PORT  = 22"
echo "     VPS_SSH_KEY = <private key matching the public key from step 3>"
echo ""
echo "  6. Push to main branch — GitHub Actions will build and deploy automatically."
echo ""
echo "  7. Deploy Cloudflare Worker:"
echo "     cd cloudflare"
echo "     npx wrangler kv namespace create HEALTH_KV"
echo "     # paste the returned id into wrangler.toml"
echo "     npx wrangler secret put VPS_URL    # enter: https://${DOMAIN}"
echo "     npx wrangler secret put GCP_URL    # enter: your Cloud Run URL"
echo "     npx wrangler deploy"
echo ""
