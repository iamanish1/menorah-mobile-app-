# Cloudflare Production Ingress

Production ingress uses Cloudflare proxied hostnames with SSL/TLS encryption mode set to **Full (strict)**. Caddy terminates HTTPS on the origin with a Cloudflare Origin CA certificate/key mounted from host-only secret files. MongoDB and Redis must never be exposed publicly.

Create the Origin CA certificate in Cloudflare with SAN coverage for:

```text
menorah.me
*.menorah.me
```

Store the files outside git:

```text
/opt/menorah/secrets/cloudflare-origin.pem
/opt/menorah/secrets/cloudflare-origin-key.pem
```

Set these paths in `menorah/deploy/env/production.env`:

```env
CLOUDFLARE_ORIGIN_CERT_PATH=/opt/menorah/secrets/cloudflare-origin.pem
CLOUDFLARE_ORIGIN_KEY_PATH=/opt/menorah/secrets/cloudflare-origin-key.pem
```

In Cloudflare, set SSL/TLS mode to **Full (strict)** before sending production traffic. Cloudflare's Full (strict) mode requires an unexpired origin certificate issued by a publicly trusted CA or Cloudflare Origin CA, with a hostname match. Cloudflare Origin CA certificates are compatible with Strict SSL mode.

## Hostname Map

Use proxied DNS records for these public hostnames, pointing to the Ubuntu origin that exposes Caddy on ports 80 and 443:

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

`calls.menorah.me` is proxied by Caddy to `LIVEKIT_UPSTREAM`. For same-VPS Hostinger LiveKit, use:

```env
LIVEKIT_UPSTREAM=http://livekit:7880
```

Cloudflare HTTP proxying is only for HTTPS/WSS signaling. LiveKit media still needs Hostinger firewall/NAT access to the configured RTC ports, normally `7881/tcp` and `50000-50100/udp`, or clients must rely on LiveKit TCP fallback.

## Optional Tunnel Connector

The direct proxied-DNS path above is the production Full (strict) path. If a Cloudflare Tunnel connector is used later, configure each public hostname to reach `https://reverse-proxy:443`, not `http://reverse-proxy:80`, and make the connector trust the Cloudflare Origin CA certificate. Mapping tunnel traffic to port 80 will loop because Caddy redirects HTTP to HTTPS.

## Optional Mode A: Dashboard-Managed Tunnel Token

Use this only if the direct proxied-DNS path is unavailable. The Cloudflare public hostname service target must be `https://reverse-proxy:443` with Origin CA trust configured in Cloudflare Zero Trust.

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

## Optional Mode B: Locally Managed Tunnel Config File

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
