# Cloudflare Tunnel Setup

Cloudflare Tunnel is the only intended public ingress for the Ubuntu production host. MongoDB and Redis must never be exposed publicly.

## Hostname Map

Use these public hostnames:

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

`calls.menorah.me` is proxied by Caddy to `LIVEKIT_UPSTREAM`. For same-VPS Hostinger LiveKit, use:

```env
LIVEKIT_UPSTREAM=http://livekit:7880
```

Cloudflare Tunnel/HTTP proxying is only for HTTPS/WSS signaling. LiveKit media still needs Hostinger firewall/NAT access to the configured RTC ports, normally `7881/tcp` and `50000-50100/udp`, or clients must rely on LiveKit TCP fallback.

## Mode A: Dashboard-Managed Token

This is preferred for first go-live.

1. In Cloudflare Zero Trust, create a tunnel for the Ubuntu host.
2. Choose Docker as the connector type.
3. Copy the tunnel token.
4. On the host:

```bash
cp menorah/deploy/env/cloudflare.env.example menorah/deploy/env/cloudflare.env
nano menorah/deploy/env/cloudflare.env
```

5. Set:

```env
TUNNEL_TOKEN=your_real_token
```

6. Start the combined stack:

```bash
cd menorah/deploy
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.tunnel.yml \
  --env-file ./env/production.env \
  --env-file ./env/cloudflare.env \
  up -d --build
```

## Mode B: Locally Managed Config File

Use this only after the token-based setup is understood.

1. Create a named tunnel with `cloudflared tunnel create`.
2. Copy `tunnel-config.yml.example` to a host-only config path.
3. Put the Cloudflare credentials JSON outside git, for example `/opt/menorah/secrets/cloudflared/`.
4. Run cloudflared with the config file instead of `TUNNEL_TOKEN`.

The example config is:

```text
menorah/deploy/cloudflare/tunnel-config.yml.example
```

## Start And Stop

Start:

```bash
cd menorah/deploy
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.tunnel.yml \
  --env-file ./env/production.env \
  --env-file ./env/cloudflare.env \
  up -d cloudflared
```

Stop:

```bash
cd menorah/deploy
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.tunnel.yml \
  --env-file ./env/production.env \
  --env-file ./env/cloudflare.env \
  stop cloudflared
```

## Verify

```bash
docker compose -f docker-compose.production.yml -f docker-compose.tunnel.yml ps cloudflared
docker compose -f docker-compose.production.yml -f docker-compose.tunnel.yml logs cloudflared --tail=100
CHECK_PUBLIC=true bash ubuntu/health-check.sh
```

## Second Connector Later

After the first connector is stable, a second `cloudflared` replica can be added on another machine with the same tunnel token. Do not scale replicas on the same host until resource and routing behavior are verified.

## Safety

Do not create public Cloudflare records for:

```text
mongo-primary
redis
prometheus
grafana
uptime-kuma
loki
```

Grafana and Uptime Kuma are bound to host loopback ports only. Access them over SSH tunnel or a locked-down private admin path, not public DNS.
