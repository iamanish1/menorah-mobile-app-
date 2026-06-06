#!/usr/bin/env bash
# ── Menorah Health — VPS Bootstrap Script ────────────────────────────────────
#
# Run this ONCE on a fresh Ubuntu 22.04 / 24.04 VPS as root (or with sudo).
# It installs Node.js 20, PM2, nginx, Certbot, clones the repo, and starts
# the API server.
#
# Usage (on your VPS):
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/vps-setup.sh | sudo bash
#
# Or upload and run:
#   scp vps-setup.sh user@your-vps-ip:~
#   ssh user@your-vps-ip "sudo bash ~/vps-setup.sh"
#
# BEFORE running:
#   1. Point api.menorahhealth.app A record → this VPS IP in Cloudflare (DNS only, not proxied yet)
#   2. Have your .env file ready to upload after this script finishes

set -euo pipefail

# ── Config — edit these before running ───────────────────────────────────────
APP_DIR="/var/www/menorah-api"
APP_USER="menorah"
DOMAIN="api.menorahhealth.app"
EMAIL="devops@menorahhealth.app"     # Let's Encrypt renewal notifications
REPO_URL="https://github.com/YOUR_ORG/YOUR_REPO.git"  # replace with your actual repo URL
BACKEND_SUBDIR="menorah-mobile-app-/Menorah/backend"   # path inside the cloned repo

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "\n\033[1;32m▶ $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠  $*\033[0m"; }
die()  { echo -e "\033[1;31m✗ $*\033[0m" >&2; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

# ── 1. System update ──────────────────────────────────────────────────────────
log "Updating system packages"
apt-get update -q
apt-get upgrade -y -q

# ── 2. Install Node.js 20 (via NodeSource) ────────────────────────────────────
log "Installing Node.js 20"
if ! command -v node &>/dev/null || [[ $(node --version | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version
npm --version

# ── 3. Install PM2 globally ───────────────────────────────────────────────────
log "Installing PM2"
npm install -g pm2
pm2 --version

# ── 4. Install nginx ──────────────────────────────────────────────────────────
log "Installing nginx"
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# ── 5. Install Certbot ───────────────────────────────────────────────────────
log "Installing Certbot"
apt-get install -y certbot python3-certbot-nginx

# ── 6. Create app user (non-root) ─────────────────────────────────────────────
log "Creating app user: $APP_USER"
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --shell /bin/bash --home "$APP_DIR" --create-home "$APP_USER"
fi

# ── 7. Clone / pull repo ──────────────────────────────────────────────────────
log "Setting up application directory"
if [[ -d "$APP_DIR/.git" ]]; then
  warn "Repo already cloned — pulling latest changes"
  cd "$APP_DIR"
  git pull
else
  # Clone into a temp dir then move the backend subdir to APP_DIR
  TMP_CLONE=$(mktemp -d)
  git clone --depth=1 "$REPO_URL" "$TMP_CLONE"
  rsync -a "$TMP_CLONE/$BACKEND_SUBDIR/" "$APP_DIR/"
  rm -rf "$TMP_CLONE"
fi

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ── 8. Install production dependencies ───────────────────────────────────────
log "Installing Node.js dependencies"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --only=production

# ── 9. Create logs directory ──────────────────────────────────────────────────
log "Creating logs directory"
sudo -u "$APP_USER" mkdir -p "$APP_DIR/logs"

# ── 10. Copy .env (user must upload it first) ─────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
  warn ".env not found at $APP_DIR/.env"
  warn "Upload your .env file before starting the server:"
  warn "  scp .env $APP_USER@$DOMAIN:$APP_DIR/.env"
  warn "Then run:  pm2 start $APP_DIR/ecosystem.config.js --env production"
else
  log ".env found — will start server after nginx + SSL setup"
fi

# ── 11. Install nginx config ──────────────────────────────────────────────────
log "Configuring nginx"

# Write a basic HTTP-only config first so Certbot can do the ACME challenge
cat > /etc/nginx/sites-available/menorah <<NGINX_CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/menorah /etc/nginx/sites-enabled/menorah
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 12. Obtain SSL certificate ────────────────────────────────────────────────
log "Obtaining SSL certificate from Let's Encrypt"
mkdir -p /var/www/certbot
certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --domains "$DOMAIN" \
  --redirect

# ── 13. Install the full nginx config (with WebSocket + security headers) ─────
log "Installing full nginx config"
cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/menorah
nginx -t && systemctl reload nginx
echo "  nginx reloaded with full config."

# ── 14. Set up PM2 auto-start on reboot ──────────────────────────────────────
log "Configuring PM2 startup"
PM2_STARTUP=$(sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" | tail -1)
# The command printed by pm2 startup must be run as root — execute it directly
eval "$PM2_STARTUP" 2>/dev/null || true

# ── 15. Start the API if .env exists ──────────────────────────────────────────
if [[ -f "$APP_DIR/.env" ]]; then
  log "Starting Menorah API with PM2"
  sudo -u "$APP_USER" bash -c "cd $APP_DIR && pm2 start ecosystem.config.js --env production"
  sudo -u "$APP_USER" pm2 save
  log "API started. Check status with:  pm2 status"
else
  warn "Skipping PM2 start — upload .env first, then run:"
  warn "  sudo -u $APP_USER bash -c 'cd $APP_DIR && pm2 start ecosystem.config.js --env production'"
  warn "  sudo -u $APP_USER pm2 save"
fi

# ── 16. Auto-renew SSL (Certbot timer is installed by certbot, just verify) ────
log "Verifying Certbot auto-renewal"
systemctl status certbot.timer --no-pager 2>/dev/null || \
  (certbot renew --dry-run && echo "  Renewal dry-run OK")

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  VPS setup complete!"
echo ""
echo "  Checklist:"
echo "  [ ] Upload .env:         scp .env $APP_USER@$DOMAIN:$APP_DIR/.env"
echo "  [ ] Start server:        sudo -u $APP_USER bash -c 'cd $APP_DIR && pm2 start ecosystem.config.js --env production && pm2 save'"
echo "  [ ] Verify health:       curl https://$DOMAIN/health"
echo "  [ ] Now run Cloudflare Worker deploy.sh to point traffic here."
echo "══════════════════════════════════════════════════════════"
