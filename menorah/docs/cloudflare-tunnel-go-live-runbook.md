# Cloudflare Go-Live Runbook

Production ingress uses a Cloudflare Tunnel. Cloudflare handles public HTTPS and `cloudflared` carries traffic over its encrypted outbound tunnel to Caddy on the private Docker network. The Ubuntu host should not expose MongoDB, Redis, Prometheus, Grafana, Loki, or Uptime Kuma to public DNS.

## Dashboard-Managed Tunnel

Configure every Cloudflare public hostname service as `http://reverse-proxy:80`. Do not change the service to `https://reverse-proxy:443` unless a separate Origin-CA Caddy configuration and certificate mount are deployed together.

1. Open Cloudflare Zero Trust.
2. Create a tunnel for the production Ubuntu host.
3. Choose Docker connector.
4. Rotate the tunnel token. The former command-line token must be treated as
   exposed because it was readable through container inspection.
5. Write only the rotated token to a root-owned host file:

```text
/opt/menorah/secrets/cloudflare-tunnel-token
```

Use mode `0400`; do not place the token in Git, Compose YAML, a command argument,
or an environment file. In `menorah/deploy/env/cloudflare.env`, configure only
the file path:

```env
CLOUDFLARE_TUNNEL_TOKEN_FILE=/opt/menorah/secrets/cloudflare-tunnel-token
```

The container consumes the token through `TUNNEL_TOKEN_FILE` and a read-only
Compose secret mount.

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

Create these public hostnames in Cloudflare and point each service to `http://reverse-proxy:80`.

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
mentle.org
www.mentle.org
mentle.mentle.org
app.mentle.org
business.mentle.org
admin.mentle.org
counsellor.mentle.org
api.mentle.org
api-business.mentle.org
api-admin.mentle.org
api-counsellor.mentle.org
calls.mentle.org
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
