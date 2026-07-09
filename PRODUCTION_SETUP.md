# Menorah Health Production Setup

This is the current production model after the migration away from a
VPS-primary backend.

The normal production path is:

- Primary compute: one self-managed on-prem Ubuntu server.
- WebRTC/media: one VPS dedicated to LiveKit/WebRTC only.
- Overflow/failover compute: Google Cloud Run, used only when the on-prem
  server and WebRTC VPS capacity are no longer enough.

Cloud Run is not the default production target. It is a burst/overflow layer.
Do not route normal traffic to Cloud Run until the capacity trigger and shared
data requirements in this document are satisfied.

## Architecture

```text
Users / Mobile Apps / Web Apps
        |
        v
Cloudflare DNS + Cloudflare Tunnel
        |
        v
On-prem Ubuntu production server
  - Caddy reverse proxy
  - landing-page
  - user-web-app
  - counsellor web-app
  - admin-panel
  - api-ios
  - api-android
  - api-web
  - api-admin
  - worker
  - MongoDB replica-set primary
  - Redis
  - backups
  - monitoring/logging
        |
        +--> calls.menorah.me / LiveKit signaling
                 |
                 v
          WebRTC VPS
          - LiveKit only
          - RTC TCP/UDP media ports
          - optional LiveKit-local Redis only

Cloud Run
  - no default traffic
  - REST/API overflow only
  - no WebRTC media
  - no primary worker/scheduler
  - no Socket.IO
```

## Routing Policy

| Traffic | Normal Route | Overflow Route | Notes |
|---|---|---|---|
| `www.menorah.me` | On-prem | Cloud Run only after capacity trigger | Public landing site. |
| `app.menorah.me` | On-prem | Cloud Run only after capacity trigger | User web app. |
| `counsellor.menorah.me` | On-prem | Cloud Run only after capacity trigger | Counsellor web app. |
| `admin.menorah.me` | On-prem | Prefer on-prem only | Admin should stay tightly controlled. |
| `api-ios.menorah.me` | On-prem `api-ios` | Cloud Run REST overflow only | iOS API profile. |
| `api-android.menorah.me` | On-prem `api-android` | Cloud Run REST overflow only | Android API profile. |
| `api-web.menorah.me` | On-prem `api-web` | Cloud Run REST overflow only | Web/user/counsellor API. |
| `api-admin.menorah.me` | On-prem `api-admin` | Prefer on-prem only | Admin API is not a burst-first surface. |
| `calls.menorah.me` | WebRTC VPS | Scale/upgrade VPS first | LiveKit signaling and media. |
| `/socket.io/*` | On-prem only | None | Do not send sockets to Cloud Run. |
| LiveKit media ports | WebRTC VPS only | Scale/upgrade VPS first | UDP/TCP media does not run through normal HTTP proxying. |
| Worker/schedulers | On-prem only | Standby only | Only one active worker. |

## Public Hostnames

Use Cloudflare as public ingress for the on-prem server. The intended hostname
map is:

```text
www.menorah.me          -> on-prem reverse-proxy
app.menorah.me          -> on-prem reverse-proxy
counsellor.menorah.me   -> on-prem reverse-proxy
admin.menorah.me        -> on-prem reverse-proxy
api-ios.menorah.me      -> on-prem reverse-proxy
api-android.menorah.me  -> on-prem reverse-proxy
api-web.menorah.me      -> on-prem reverse-proxy
api-admin.menorah.me    -> on-prem reverse-proxy
calls.menorah.me        -> WebRTC VPS LiveKit endpoint
```

The repo also supports routing `calls.menorah.me` through Caddy with
`LIVEKIT_UPSTREAM`. That is acceptable for HTTPS/WSS signaling, but LiveKit
media still needs the VPS RTC ports to be reachable directly.

Never expose these publicly:

```text
mongo-primary
mongo-restore-test
redis
prometheus
grafana
uptime-kuma
loki
```

Grafana and Uptime Kuma must stay bound to localhost or private admin access.

## On-Prem Server Responsibilities

The on-prem server is the primary production runtime. It owns:

- All public web apps.
- All primary API services.
- MongoDB production data.
- Redis for backend state and Socket.IO adapter.
- The active worker and scheduled jobs.
- Upload storage mounted under the production data root.
- Encrypted backups and restore tests.
- Monitoring and logs.
- Cloudflare Tunnel connector.

The on-prem server should run the production compose stack from:

```text
menorah/deploy/docker-compose.production.yml
menorah/deploy/docker-compose.tunnel.yml
```

The local/home compose stack is for staging and review only:

```text
menorah/deploy/docker-compose.home.yml
```

Do not use the `180xx` local probe ports as public production ports. They are
loopback/debug ports.

## VPS Responsibilities

The VPS is now WebRTC-only.

It should run:

- LiveKit HTTP API and WebSocket signaling.
- LiveKit RTC TCP fallback.
- LiveKit UDP media port range.
- Optional Redis only if LiveKit needs local cluster/state support.
- Minimal reverse proxy/TLS if `calls.menorah.me` terminates on the VPS.

It should not run:

- Menorah app APIs.
- Menorah web apps.
- Production MongoDB.
- Production backend Redis.
- Admin panel.
- Worker/schedulers.

Required WebRTC ports on the VPS:

```bash
sudo ufw allow 443/tcp
sudo ufw allow 7880/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:50100/udp
```

Some older LiveKit examples in this repo use `50000:60000/udp`. Use the range
that matches the active VPS LiveKit config and firewall.

## Cloud Run Responsibilities

Cloud Run is overflow capacity only.

Cloud Run must not be treated as the normal production backend while the on-prem
server has capacity. It is used only when:

- on-prem CPU, memory, disk IO, or network pressure is consistently high;
- the WebRTC VPS is separately capacity-planned for calls;
- data and secrets are ready for a multi-runtime environment;
- the team has validated Cloud Run health checks and rollback.

Cloud Run must be configured as:

```env
SERVICE_RUNTIME=cloudrun
ENABLE_SOCKET_IO=false
ENABLE_SOCKET_ADAPTER=false
WORKER_MODE=standby
ENABLE_ARTICLE_SCHEDULER=false
ENABLE_SOCIAL_SCHEDULER=false
ENABLE_BACKUP_JOBS=false
ENABLE_EMAIL_JOBS=false
ENABLE_NOTIFICATION_JOBS=false
```

Before sending any traffic to Cloud Run, confirm the shared state plan:

- MongoDB is reachable from Cloud Run, either through a managed/external data
  plane or a deliberate secure private network design.
- Redis is reachable from Cloud Run if API code requires it.
- Uploads generated by Cloud Run do not depend on the on-prem filesystem.
  Prefer Cloudinary/object storage for Cloud Run-served flows.
- Secrets are synced into GCP Secret Manager.
- Cloud Run exposes only the API profiles intended for overflow.
- `/socket.io/*` traffic stays on-prem.
- WebRTC media stays on the VPS.
- Only one worker is active, normally on-prem.

If these requirements are not met, keep Cloud Run at 0 percent traffic.

## Initial On-Prem Setup

Run these on the Ubuntu production host.

```bash
sudo apt-get update
sudo apt-get install -y git

sudo mkdir -p /opt/menorah
sudo chown "$USER":"$USER" /opt/menorah

cd /opt/menorah
git clone https://github.com/menorahsoftware-cmyk/menorah-mobile-app-.git
cd menorah-mobile-app-
git checkout architecture/self-host-cloudrun-failover
git pull --ff-only
```

Prepare the host:

```bash
sudo bash menorah/deploy/ubuntu/prepare-host.sh
```

This installs Docker if needed and prepares:

```text
/opt/menorah/data
/opt/menorah/backups
/opt/menorah/secrets
/opt/menorah/logs
```

## Production Env Files

Create host-only env files:

```bash
cp menorah/deploy/env/production.env.example menorah/deploy/env/production.env
cp menorah/deploy/env/cloudflare.env.example menorah/deploy/env/cloudflare.env
```

Edit both files on the host:

```bash
nano menorah/deploy/env/production.env
nano menorah/deploy/env/cloudflare.env
```

Never commit real env files.

Important production values:

```env
NODE_ENV=production
SERVICE_RUNTIME=home

WWW_DOMAIN=www.menorah.me
APP_DOMAIN=app.menorah.me
COUNSELLOR_DOMAIN=counsellor.menorah.me
ADMIN_DOMAIN=admin.menorah.me
API_IOS_DOMAIN=api-ios.menorah.me
API_ANDROID_DOMAIN=api-android.menorah.me
API_WEB_DOMAIN=api-web.menorah.me
API_ADMIN_DOMAIN=api-admin.menorah.me
CALLS_DOMAIN=calls.menorah.me

FRONTEND_API_WEB_URL=https://api-web.menorah.me/api
FRONTEND_API_ADMIN_URL=https://api-admin.menorah.me/api
FRONTEND_SOCKET_WEB_URL=https://api-web.menorah.me

MONGODB_URI=mongodb://<app-user>:<password>@mongo-primary:27017/menorah?replicaSet=menorah-rs&authSource=admin&retryWrites=true
REDIS_URL=redis://redis:6379

ENABLE_SOCKET_IO=true
ENABLE_SOCKET_ADAPTER=true

WORKER_MODE=active
ENABLE_ARTICLE_SCHEDULER=true
ENABLE_SOCIAL_SCHEDULER=false
ENABLE_BACKUP_JOBS=false
ENABLE_EMAIL_JOBS=false
ENABLE_NOTIFICATION_JOBS=false

SERVER_USAGE_LABEL=On-prem server

BACKUP_AUTOMATION_ENABLED=true
BACKUP_REQUIRE_MOUNT=true
BACKUP_REQUIRE_ENCRYPTION=true
BACKUP_EXPECT_RAID=true
```

For the WebRTC VPS:

```env
LIVEKIT_URL=wss://calls.menorah.me
LIVEKIT_API_URL=https://calls.menorah.me
LIVEKIT_API_KEY=<same key configured on VPS LiveKit>
LIVEKIT_API_SECRET=<same secret configured on VPS LiveKit>
```

If on-prem Caddy proxies LiveKit signaling to the VPS, set:

```env
LIVEKIT_UPSTREAM=https://<vps-livekit-origin>
```

If `calls.menorah.me` terminates directly on the VPS, keep on-prem
`LIVEKIT_UPSTREAM` unused for production traffic.

## MongoDB Keyfile

The MongoDB replica-set container needs a keyfile mounted from the host.

Create it on the production host if `prepare-host.sh` did not already do so:

```bash
sudo mkdir -p /opt/menorah/secrets
openssl rand -base64 756 | sudo tee /opt/menorah/secrets/mongo-keyfile >/dev/null
sudo chmod 400 /opt/menorah/secrets/mongo-keyfile
sudo chown root:root /opt/menorah/secrets/mongo-keyfile
```

Confirm `production.env` points to it:

```env
MONGO_KEYFILE_PATH=/opt/menorah/secrets/mongo-keyfile
```

## Cloudflare Tunnel

Preferred ingress is dashboard-managed Cloudflare Tunnel.

In Cloudflare Zero Trust:

1. Create a tunnel for the on-prem Ubuntu host.
2. Add public hostnames for the on-prem services.
3. Point each on-prem hostname to:

```text
http://reverse-proxy:80
```

Hostnames:

```text
www.menorah.me
app.menorah.me
counsellor.menorah.me
admin.menorah.me
api-ios.menorah.me
api-android.menorah.me
api-web.menorah.me
api-admin.menorah.me
```

Put the tunnel token in:

```text
menorah/deploy/env/cloudflare.env
```

```env
TUNNEL_TOKEN=<cloudflare tunnel token>
```

For `calls.menorah.me`, choose one mode and document it in the deployment notes:

- Direct to the WebRTC VPS, preferred when the VPS owns TLS/signaling.
- Through on-prem Caddy to `LIVEKIT_UPSTREAM`, acceptable for HTTPS/WSS
  signaling only.

In both modes, media ports remain on the VPS.

## Start Production

Use the first-run wrapper:

```bash
bash menorah/deploy/ubuntu/first-run.sh
```

Equivalent explicit command:

```bash
cd menorah/deploy
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.tunnel.yml \
  --env-file ./env/production.env \
  --env-file ./env/cloudflare.env \
  up -d --build
```

If your Docker Compose version does not support multiple `--env-file` flags,
combine the two env files into one host-only file. Do not commit it.

## Verify Production

Local host checks:

```bash
bash menorah/deploy/ubuntu/health-check.sh
```

Public checks after Cloudflare routing is live:

```bash
CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh
```

Manual checks:

```bash
curl -fsS https://www.menorah.me >/dev/null
curl -fsS https://app.menorah.me >/dev/null
curl -fsS https://counsellor.menorah.me/login >/dev/null
curl -fsS https://admin.menorah.me/login >/dev/null

curl -fsS https://api-ios.menorah.me/health/ready
curl -fsS https://api-android.menorah.me/health/ready
curl -fsS https://api-web.menorah.me/health/ready
curl -fsS https://api-admin.menorah.me/health/ready
curl -fsS https://api-web.menorah.me/health/deep
```

LiveKit checks:

```bash
curl -fsS https://calls.menorah.me/
```

Then test a real call from devices. HTTP health alone does not prove WebRTC
media works.

## WebRTC VPS Setup

The VPS should run LiveKit with config equivalent to:

```text
livekit/livekit.yaml
livekit/docker-compose.livekit.yml
```

Required steps:

1. Configure `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
2. Set the LiveKit external IP or `use_external_ip: true`.
3. Open the RTC TCP/UDP firewall ports.
4. Configure TLS for `calls.menorah.me` if the VPS terminates signaling.
5. Set the webhook URL to the production web API:

```text
https://api-web.menorah.me/api/video/livekit-webhook
```

6. Ensure backend `production.env` has the same LiveKit key/secret.

Example start command on the VPS:

```bash
docker compose -f docker-compose.livekit.yml up -d
docker compose -f docker-compose.livekit.yml logs -f
```

VPS capacity should be upgraded before Cloud Run receives traffic for API
overflow if the bottleneck is calls/media. Cloud Run does not solve WebRTC media
capacity.

## Backups

Backups are part of the on-prem production stack.

Prepare the encrypted RAID1 backup volume after both backup disks are installed:

```bash
cd /opt/menorah/menorah-mobile-app-/menorah
sudo BACKUP_DISK_CONFIRM=WIPE_THESE_DISKS \
  bash deploy/ubuntu/setup-backup-raid-luks.sh \
  /dev/disk/by-id/<first-backup-hdd> \
  /dev/disk/by-id/<second-backup-hdd>
```

Install backup, restore-test, pruning, and health-check timers:

```bash
sudo bash deploy/ubuntu/install-backup-schedule.sh
```

Manual backup:

```bash
bash deploy/ubuntu/backup-now.sh daily
```

Restore latest backup into the restore-test database:

```bash
bash deploy/ubuntu/restore-latest-backup.sh restore-test
```

Check backup health:

```bash
bash deploy/ubuntu/check-backup-health.sh
```

Production restore requires explicit confirmation:

```bash
RESTORE_CONFIRM_PRODUCTION=true bash deploy/ubuntu/restore-latest-backup.sh production
```

## Monitoring

The production compose stack includes Prometheus, Grafana, Loki, Promtail,
cAdvisor, and Uptime Kuma.

Grafana and Uptime Kuma are loopback-bound by default:

```env
GRAFANA_LOCAL_PORT=127.0.0.1:18100
UPTIME_KUMA_LOCAL_PORT=127.0.0.1:18101
```

Access them with SSH tunnels, not public DNS:

```bash
ssh -L 18100:127.0.0.1:18100 -L 18101:127.0.0.1:18101 <user>@<on-prem-host>
```

Then open:

```text
http://127.0.0.1:18100
http://127.0.0.1:18101
```

Alert on:

- API readiness failures.
- 5xx spikes.
- CPU/memory saturation.
- disk usage above threshold.
- MongoDB or Redis down.
- backup failure or stale restore test.
- LiveKit down.
- WebRTC call failure rate.

## Updates

Update from Git on the on-prem host:

```bash
bash menorah/deploy/ubuntu/update-from-git.sh
```

The update script requires a clean tracked working tree, records the previous
commit SHA, pulls the configured branch, rebuilds, restarts, runs health checks,
and rolls back automatically if checks fail.

## Rollback

Rollback on the on-prem host:

```bash
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

Deploy state is stored under:

```text
/opt/menorah/deploy-state
```

If LiveKit changed on the VPS, roll back the VPS LiveKit compose/config
separately.

## Cloud Run Overflow Activation

Do not activate Cloud Run because of a temporary spike. First confirm the
bottleneck:

- If the bottleneck is WebRTC media, scale the WebRTC VPS.
- If the bottleneck is database IO, scale the data layer first.
- If the bottleneck is web/API CPU or memory, Cloud Run overflow may help.
- If uploads depend on local disk, move the affected flows to shared object
  storage before routing Cloud Run traffic.

Activation checklist:

- [ ] Cloud Run image is deployed from the same commit as on-prem or a known
      compatible commit.
- [ ] Cloud Run has `ENABLE_SOCKET_IO=false`.
- [ ] Cloud Run has `ENABLE_SOCKET_ADAPTER=false`.
- [ ] Cloud Run worker/schedulers are standby/disabled.
- [ ] Cloud Run can reach required MongoDB and Redis safely.
- [ ] Cloud Run secrets are synced.
- [ ] Cloud Run `/health/ready` returns 200.
- [ ] Cloud Run `/health/deep` leaks no secret values.
- [ ] On-prem remains the source of truth for worker jobs and backups.
- [ ] WebRTC remains on the VPS.
- [ ] Rollback route is documented before traffic moves.

Only after that, route a small percentage of eligible REST traffic to Cloud Run.
Keep these pinned away from Cloud Run:

```text
/socket.io/*
/api/video/livekit-webhook
admin-only routes unless explicitly tested
worker/scheduler workloads
```

Cloud Run should return to 0 percent traffic when the on-prem/VPS capacity issue
is resolved, unless the team has intentionally changed the architecture.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Treating Cloud Run as primary | Unexpected cost, split state, weaker rollback | Keep Cloud Run at 0 percent until overflow checklist passes. |
| Sending WebRTC media through Cloud Run | Calls fail | Keep LiveKit media on the VPS. |
| Sending `/socket.io/*` to Cloud Run | Broken realtime chat/session state | Pin sockets to on-prem. |
| Running active workers in two places | Duplicate jobs, duplicate notifications, backup conflicts | Keep only on-prem worker active. |
| Exposing MongoDB or Redis publicly | Data breach risk | Keep DB networks private/internal. |
| Using local filesystem uploads from Cloud Run | Missing files across runtimes | Use Cloudinary/object storage for Cloud Run-served flows. |
| Public Grafana/Uptime Kuma | Admin surface exposed | Use SSH tunnel or private access only. |
| Forgetting LiveKit media firewall ports | Signaling works but audio/video fails | Open configured RTC TCP/UDP ports on the VPS. |

## Go-Live Gate

Before sending or changing production traffic, run:

```bash
bash menorah/deploy/ubuntu/health-check.sh
CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh
bash menorah/deploy/ubuntu/backup-now.sh daily
bash menorah/deploy/ubuntu/restore-latest-backup.sh restore-test
```

Also verify:

- user login;
- counsellor login;
- admin login;
- booking creation;
- booking payment;
- articles;
- chat;
- one full LiveKit call on a normal network;
- one full LiveKit call on a restrictive network/TCP fallback;
- UAE/external-provider call policy;
- production commit SHA and timestamp.

Use `menorah/docs/ubuntu-host-go-live-checklist.md` as the detailed checklist.
