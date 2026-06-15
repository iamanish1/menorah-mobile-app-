# Cloudflare Tunnel Go-Live Runbook

Cloudflare Tunnel is the production public ingress. The Ubuntu host should not expose MongoDB, Redis, Prometheus, Grafana, Loki, or Uptime Kuma to public DNS.

## Dashboard-Managed Tunnel

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

Create these public hostnames in Cloudflare:

```text
www.menorah.me          -> http://reverse-proxy:80
app.menorah.me          -> http://reverse-proxy:80
admin.menorah.me        -> http://reverse-proxy:80
api-ios.menorah.me      -> http://reverse-proxy:80
api-android.menorah.me  -> http://reverse-proxy:80
api-web.menorah.me      -> http://reverse-proxy:80
api-admin.menorah.me    -> http://reverse-proxy:80
calls.menorah.me        -> http://reverse-proxy:80
```

`calls.menorah.me` is routed by Caddy to `LIVEKIT_UPSTREAM`. Set `LIVEKIT_UPSTREAM` in `production.env`.

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
- Browser camera and microphone permissions are allowed only on `app.menorah.me` and `calls.menorah.me`.
- Keep `admin.menorah.me` behind admin auth and monitor login failures.
