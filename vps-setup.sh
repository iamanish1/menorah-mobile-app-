#!/usr/bin/env bash
# ── Menorah Health — VPS Bootstrap Script ────────────────────────────────────
#
# Run this ONCE on a fresh Ubuntu 22.04 / 24.04 VPS as root (or with sudo).
#
# Before running:
#   1. In Cloudflare DNS (menorah.me zone):
#        api.menorah.me  A → <VPS IP>  Proxy: ON  (orange cloud)
#        vps.menorah.me  A → <VPS IP>  Proxy: OFF (gray cloud)
#   2. Have your .env ready to upload after this script finishes.
#
# Usage:
#   scp vps-setup.sh user@<VPS IP>:~
#   ssh user@<VPS IP> "sudo bash ~/vps-setup.sh"

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR="/var/www/menorah-api"
APP_USER="menorah"
PUBLIC_DOMAIN="api.menorah.me"
DIRECT_DOMAIN="vps.menorah.me"     # Cloudflare proxy OFF — used by Worker
EMAIL="devops@menorah.me"          # Let's Encrypt renewal notifications
REPO_URL="https://github.com/YOUR_ORG/YOUR_REPO.git"
BACKEND_SUBDIR="menorah-mobile-app-/menorah/backend"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "\n\033[1;32m▶ $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠  $*\033[0m"; }
die()  { echo -e "\033[1;31m✗ $*\033[0m" >&2; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

# ── 1. System update ──────────────────────────────────────────────────────────
log "Updating system packages"
apt-get update -q
apt-get upgrade -y -q

# ── 2. Install Node.js 20 ─────────────────────────────────────────────────────
log "Installing Node.js 20"
if ! command -v node &>/dev/null || [[ $(node --version | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version
npm --version

# ── 3. Install PM2 ────────────────────────────────────────────────────────────
log "Installing PM2"
npm install -g pm2
pm2 --version

# ── 4. Install nginx ──────────────────────────────────────────────────────────
log "Installing nginx"
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# ── 5. Install Certbot ────────────────────────────────────────────────────────
log "Installing Certbot"
apt-get install -y certbot python3-certbot-nginx

# ── 6. Create app user ────────────────────────────────────────────────────────
log "Creating app user: $APP_USER"
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --shell /bin/bash --home "$APP_DIR" --create-home "$APP_USER"
fi

# ── 7. Clone / pull repo ──────────────────────────────────────────────────────
log "Setting up application directory"
if [[ -d "$APP_DIR/.git" ]]; then
  warn "Repo already cloned — pulling latest"
  git -C "$APP_DIR" pull
else
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

# ── 10. Remind about .env ─────────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
  warn ".env not found at $APP_DIR/.env"
  warn "Upload it:  scp .env $APP_USER@$PUBLIC_DOMAIN:$APP_DIR/.env"
fi

# ── 11. Temporary HTTP-only nginx (for ACME challenge) ────────────────────────
log "Configuring nginx (HTTP only for ACME challenge)"
cat > /etc/nginx/sites-available/menorah <<NGINX_CONF
server {
    listen 80;
    listen [::]:80;
    server_name $PUBLIC_DOMAIN $DIRECT_DOMAIN;

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
mkdir -p /var/www/certbot
nginx -t && systemctl reload nginx

# ── 12. Obtain SSL certificate — covers BOTH domains ─────────────────────────
# vps.menorah.me must have Cloudflare proxy OFF for this to work.
log "Obtaining SSL certificate (covers both $PUBLIC_DOMAIN and $DIRECT_DOMAIN)"
certbot certonly \
  --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$PUBLIC_DOMAIN" \
  -d "$DIRECT_DOMAIN"

# ── 13. Install the full nginx config ─────────────────────────────────────────
log "Installing full nginx config"
cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/menorah
nginx -t && systemctl reload nginx

# ── 14. PM2 auto-start on reboot ──────────────────────────────────────────────
log "Configuring PM2 startup"
PM2_STARTUP=$(sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" | tail -1)
eval "$PM2_STARTUP" 2>/dev/null || true

# ── 15. Start the API if .env exists ──────────────────────────────────────────
if [[ -f "$APP_DIR/.env" ]]; then
  log "Starting Menorah API"
  sudo -u "$APP_USER" bash -c "cd $APP_DIR && pm2 start ecosystem.config.js --env production"
  sudo -u "$APP_USER" pm2 save
else
  warn "Upload .env first, then run:"
  warn "  sudo -u $APP_USER bash -c 'cd $APP_DIR && pm2 start ecosystem.config.js --env production && pm2 save'"
fi

# ── 16. Verify Certbot auto-renewal ───────────────────────────────────────────
log "Verifying Certbot auto-renewal"
systemctl status certbot.timer --no-pager 2>/dev/null || certbot renew --dry-run

# ── Done ──────────────────────────────────────────────────────────────────────
cat <<DONE

══════════════════════════════════════════════════════════
  VPS setup complete!

  DNS required in Cloudflare (menorah.me zone):
    api.menorah.me  A → $(curl -s ifconfig.me)   Proxy: ON  (orange)
    vps.menorah.me  A → $(curl -s ifconfig.me)   Proxy: OFF (gray)

  Next steps:
  [ ] Upload .env:     scp .env $APP_USER@$PUBLIC_DOMAIN:$APP_DIR/.env
  [ ] Verify health:   curl https://$PUBLIC_DOMAIN/health
  [ ] Verify direct:   curl https://$DIRECT_DOMAIN/health  (Worker uses this)
  [ ] Deploy Worker:   cd cloudflare && bash deploy.sh
  [ ]   Set VPS_URL=https://$DIRECT_DOMAIN  when prompted
  [ ]   Set GCP_URL=https://<cloud-run-url>.a.run.app  when prompted
══════════════════════════════════════════════════════════
DONE
