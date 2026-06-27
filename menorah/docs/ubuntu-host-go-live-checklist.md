# Ubuntu Host Go-Live Checklist

Do not merge to `main` or send production traffic until this checklist passes on the Ubuntu host.

## Before Go-Live

- [ ] Ubuntu host is patched and reachable by SSH.
- [ ] Docker Engine is installed.
- [ ] Docker Compose plugin is installed.
- [ ] Repo is cloned under `/opt/menorah`.
- [ ] Branch is `architecture/self-host-cloudrun-failover`.
- [ ] `menorah/deploy/env/production.env` is filled on host.
- [ ] `LIVEKIT_BLOCKED_COUNTRIES` contains countries that require external-provider fallback, currently `AE`.
- [ ] `BLOCKED_COUNTRY_CALL_PROVIDER` is set to the approved fallback provider, currently `zoom`.
- [ ] `menorah/deploy/env/cloudflare.env` is filled on host.
- [ ] `menorah/deploy/livekit/livekit.yaml` exists on host, copied from `livekit.yaml.example`, with real LiveKit key/secret filled outside git.
- [ ] No real secrets are committed to git.
- [ ] MongoDB keyfile exists at `/opt/menorah/secrets/mongo-keyfile`.
- [ ] MongoDB container is healthy.
- [ ] Redis container is healthy.
- [ ] `api-ios /health/ready` returns 200.
- [ ] `api-android /health/ready` returns 200.
- [ ] `api-web /health/ready` returns 200.
- [ ] `api-admin /health/ready` returns 200.
- [ ] `worker /health/ready` returns 200.
- [ ] Worker is active only on the primary production host.
- [ ] `backup-now.sh daily` completes successfully.
- [ ] Latest backup restore-test completed successfully.
- [ ] Backup encryption is enabled before any off-host upload, or off-host upload is blocked.
- [ ] Cloudflare Tunnel container is connected.
- [ ] Public hostnames route to the tunnel.
- [ ] `calls.menorah.me` DNS points to the Hostinger VPS path used for LiveKit signaling.
- [ ] Hostinger firewall allows `443/tcp`, `7881/tcp`, and `50000-50100/udp` for LiveKit media.
- [ ] Cloudflare proxy/tunnel behavior is understood: WebRTC UDP media is not carried by normal HTTP proxying, so LiveKit media ports must be reachable directly or calls must fall back to LiveKit TCP.
- [ ] Public domains return 200.
- [ ] iOS subscription Razorpay routes return 404 on `api-ios`.
- [ ] `api-admin /api/auth/me` is auth-protected.
- [ ] Admin routes are not exposed by public/mobile APIs.
- [ ] Grafana, Loki, Prometheus, and Uptime Kuma are running.

## Go-Live

- [ ] Point Cloudflare public hostnames to the production tunnel.
- [ ] Verify `https://www.menorah.me`.
- [ ] Verify `https://app.menorah.me`.
- [ ] Verify `https://admin.menorah.me`.
- [ ] Verify `https://api-ios.menorah.me/health/ready`.
- [ ] Verify `https://api-android.menorah.me/health/ready`.
- [ ] Verify `https://api-web.menorah.me/health/ready`.
- [ ] Verify `https://api-admin.menorah.me/health/ready`.
- [ ] Verify `https://api-web.menorah.me/health/deep` reports `providers.config.livekit.configured: true` without exposing keys.
- [ ] Verify user app login.
- [ ] Verify admin login.
- [ ] Verify booking creation flow.
- [ ] Verify booking payment flow against the intended Razorpay mode.
- [ ] Verify article list and article detail load.
- [ ] Verify chat route.
- [ ] Verify video/call route through `calls.menorah.me`.
- [ ] Verify one full LiveKit call on a normal network.
- [ ] Verify one full LiveKit call on a restrictive network using TCP fallback.
- [ ] Verify an India-classified test account receives an in-app LiveKit call token.
- [ ] Verify a non-blocked-country test account receives an in-app LiveKit call token.
- [ ] Verify a UAE-classified test account receives only the configured external-provider link and no LiveKit token.
- [ ] Verify an unknown-region test account follows the configured `BLOCK_LIVEKIT_FOR_UNKNOWN_REGION` policy.
- [ ] Run a backup after go-live.
- [ ] Record go-live commit SHA and time.

## Command Gate

Run:

```bash
bash menorah/deploy/ubuntu/health-check.sh
CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh
bash menorah/deploy/ubuntu/backup-now.sh daily
bash menorah/deploy/ubuntu/restore-latest-backup.sh restore-test
docker compose -f menorah/deploy/docker-compose.production.yml --env-file menorah/deploy/env/production.env ps livekit
```

All commands must pass before go-live is accepted.
