# Cloudflare Go-Live Runbook

The production ingress target is Cloudflare proxied DNS with SSL/TLS mode set to **Full (strict)**. Caddy listens on 80 and 443, redirects HTTP to HTTPS, and serves every production hostname over TLS with a Cloudflare Origin CA certificate mounted from host-only secret files. The Ubuntu host should not expose MongoDB, Redis, Prometheus, Grafana, Loki, or Uptime Kuma to public DNS.

Required host-only files:

```text
/opt/menorah/secrets/cloudflare-origin.pem
/opt/menorah/secrets/cloudflare-origin-key.pem
```

Create the certificate in Cloudflare with SANs for `menorah.me` and `*.menorah.me`, store the certificate/key at those paths, and set Cloudflare SSL/TLS mode to **Full (strict)** before sending traffic.

## Optional Dashboard-Managed Tunnel

Use this only if direct proxied DNS to the Ubuntu origin is unavailable. Configure Cloudflare public hostname services to `https://reverse-proxy:443` with Origin CA trust. Do not target `http://reverse-proxy:80`; Caddy will redirect that traffic back to HTTPS.

1. Open Cloudflare Zero Trust.
2. Create a tunnel for the production Ubuntu host.
3. Choose Docker connector.
4. Copy the tunnel token.
5. On the host, put the token in:

```text
menorah/deploy/env/cloudflare.env
```

Example:

```env
TUNNEL_TOKEN=your_real_token
```

6. Start the stack:

```bash
cd /opt/menorah/menorah-mobile-app-/menorah/deploy
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.tunnel.yml \
  --env-file ./env/production.env \
  --env-file ./env/cloudflare.env \
  up -d --build
```

## Public Hostname Mapping

Create these proxied public hostnames in Cloudflare. For direct DNS, point them to the Ubuntu origin IP. For an optional tunnel, point each service to `https://reverse-proxy:443`.

```text
menorah.me
www.menorah.me
app.menorah.me
admin.menorah.me
counsellor.menorah.me
api-ios.menorah.me
api-android.menorah.me
api-web.menorah.me
api-admin.menorah.me
calls.menorah.me
```

`calls.menorah.me` is routed by Caddy to `LIVEKIT_UPSTREAM`. For same-VPS Hostinger LiveKit, set `LIVEKIT_UPSTREAM=http://livekit:7880` in `production.env`.

Cloudflare Tunnel/HTTP proxying handles HTTPS/WSS signaling, but it does not carry LiveKit UDP media. On the Hostinger VPS, allow direct media ports configured in `deploy/livekit/livekit.yaml`, normally:

```text
7881/tcp
50000-50100/udp
```

## Start, Stop, Logs

Start tunnel:

```bash
cd menorah/deploy
docker compose -f docker-compose.production.yml -f docker-compose.tunnel.yml --env-file ./env/production.env --env-file ./env/cloudflare.env up -d cloudflared
```

Stop tunnel:

```bash
cd menorah/deploy
docker compose -f docker-compose.production.yml -f docker-compose.tunnel.yml --env-file ./env/production.env --env-file ./env/cloudflare.env stop cloudflared
```

Logs:

```bash
cd menorah/deploy
docker compose -f docker-compose.production.yml -f docker-compose.tunnel.yml logs cloudflared --tail=100
```

## Verify Tunnel Status

Local:

```bash
bash menorah/deploy/ubuntu/health-check.sh
```

Public:

```bash
CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh
```

Direct checks:

```bash
curl -i https://api-ios.menorah.me/health/ready
curl -i https://api-android.menorah.me/health/ready
curl -i https://api-web.menorah.me/health/ready
curl -i https://api-admin.menorah.me/health/ready
curl -i https://www.menorah.me
curl -i https://app.menorah.me
curl -i https://admin.menorah.me
curl -i https://counsellor.menorah.me/register
```

## Add A Second Connector Later

After first go-live is stable:

1. Prepare a second host with Docker.
2. Use the same Cloudflare tunnel token.
3. Run only the tunnel connector if the second host is just a connector, or a full standby stack if explicitly designed.
4. Verify Cloudflare shows two healthy connectors.
5. Do not run a second active worker unless distributed locks are implemented or `WORKER_MODE=standby`.

## Safety Rules

- Do not expose MongoDB or Redis ports.
- Do not create public hostnames for internal monitoring tools.
- Do not route `/socket.io/` to Cloud Run fallback services.
- Browser camera and microphone permissions are allowed only on `app.menorah.me`, `counsellor.menorah.me`, and `calls.menorah.me`.
- Keep `admin.menorah.me` behind admin auth and monitor login failures.
