# Cloudflare Go-Live Runbook

Production ingress uses a Cloudflare Tunnel. Cloudflare handles public HTTPS and `cloudflared` carries traffic over its encrypted outbound tunnel to Caddy on the private Docker network. The Ubuntu host should not expose MongoDB, Redis, Prometheus, Grafana, Loki, or Uptime Kuma to public DNS.

## Trusted Proxy And Client Provenance Contract

The connector and Caddy share the internal `tunnel_ingress_net`; no other
service may join it. `cloudflared` also joins `public_net` for outbound
connectivity, while Caddy is deliberately absent from `public_net`. Caddy
trusts only the connector's exact address, reads client identity only from
`CF-Connecting-IP`, and sends sanitized forwarding headers to applications.
Connector traffic without valid client-IP provenance fails closed with `400`.
The APIs trust only Caddy's exact `app_net` address.

The environment template proposes `10.253.250.0/29` for tunnel ingress and
`10.253.251.0/24` for applications, but these are required operator inputs, not
safe universal defaults. Before deployment, compare them with `ip route`,
VPN/LAN/provider routes, and `docker network inspect` output. Set a
non-overlapping `TUNNEL_INGRESS_SUBNET`, `CADDY_TUNNEL_IP`,
`CLOUDFLARED_TUNNEL_IP`, `APP_NETWORK_SUBNET`, and `CADDY_APP_IP` together in
the untracked production environment. Never replace exact IP trust with
`private_ranges`, a hop count, `true`, or an entire subnet.

The backend accepts country provenance only through Caddy's private
`X-Menorah-Client-Country` header when the socket peer is the configured Caddy
IP. Browser-provided `CF-IPCountry`, `X-Country-Code`, and related aliases are
not policy inputs.

## Required Offline Release Gate

The exact 22-host Menorah and Mentle ingress map is owned by
`menorah/deploy/cloudflare/ingress-manifest.json`. From the repository root:

```bash
npm --prefix menorah/scripts/qa ci --ignore-scripts
npm --prefix menorah/scripts/qa run test:tunnel-config
npm --prefix menorah/scripts/qa run validate:tunnel-example
cloudflared tunnel \
  --config menorah/deploy/cloudflare/tunnel-config.yml.example \
  ingress validate
```

For an operator-supplied locally managed configuration, replace the example
path in the last two checks:

```bash
node menorah/scripts/qa/validate-cloudflare-tunnel-config.mjs \
  --config /absolute/path/to/operator-config.yml
cloudflared tunnel --config /absolute/path/to/operator-config.yml ingress validate
cloudflared tunnel --config /absolute/path/to/operator-config.yml \
  ingress rule https://menorah.me/
cloudflared tunnel --config /absolute/path/to/operator-config.yml \
  ingress rule https://not-configured.invalid/
```

The unmatched test URL must select the final `http_status:404` rule. Cloudflare
CLI ingress validation and rule testing apply to locally managed YAML, not a
remotely managed API export. A passing repository validator proves manifest,
Caddy, supplied ingress parity, exact Compose network membership, and
forwarding-header sanitization offline; it does not prove live DNS, connector
health, edge header transforms, or origin health.

## Dashboard-Managed Tunnel — INFRASTRUCTURE ACTION

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

## Public Hostname Mapping — INFRASTRUCTURE ACTION

Create these public hostnames in Cloudflare and point each service to `http://reverse-proxy:80`.

The list below mirrors `menorah/deploy/cloudflare/ingress-manifest.json`; the
manifest is authoritative.

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

## Start And Stop — INFRASTRUCTURE ACTION

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

## Verify Tunnel Status — INFRASTRUCTURE ACTION (Read-Only)

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

Verify all configured public hostnames through the existing read-only health
check:

```bash
cd /opt/menorah/menorah-mobile-app-/menorah/deploy
CHECK_PUBLIC=true bash ubuntu/health-check.sh
```

For a remotely managed tunnel, compare the live Cloudflare configuration with
the repository manifest without changing it:

```bash
# INFRASTRUCTURE ACTION — read-only Cloudflare API request.
cd /opt/menorah/menorah-mobile-app-
: "${CLOUDFLARE_ACCOUNT_ID:?set the Cloudflare account ID}"
: "${CLOUDFLARE_TUNNEL_ID:?set the tunnel UUID}"
: "${CLOUDFLARE_API_TOKEN:?set a read-only Cloudflare Tunnel API token}"
curl --fail --silent --show-error \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${CLOUDFLARE_TUNNEL_ID}/configurations" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" |
  node menorah/scripts/qa/validate-cloudflare-tunnel-config.mjs --config -
```

Use a minimally scoped Cloudflare Tunnel read token supplied through the
environment. Never put its value in a command, file, log, or Git. The command
uses Cloudflare's read-only `GET
/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` endpoint and
streams its response without saving it. The validator selects `result.config`
in memory and never prints account/tunnel metadata. It also accepts a
separately sanitized export containing only `success`, `result.source`, and
`result.config`. The response does not include the connector token.

Dashboard alternative: open **Zero Trust > Networks > Tunnels > [production
tunnel] > Public Hostnames** and compare hostname/service rows with
`menorah/deploy/cloudflare/ingress-manifest.json`. Do not select Edit or Save
during this read-only check.

Also capture read-only evidence that the live zone preserves the provenance
contract:

1. Confirm every hostname is orange-cloud proxied and resolves only through
   this Tunnel.
2. Confirm IP Geolocation is active and Cloudflare supplies `CF-IPCountry`.
3. Review Workers, Transform Rules, and any stacked CDN; none may inject or
   rewrite `CF-Connecting-IP` or `CF-IPCountry` before this connector.
4. From an external test client, send deliberately forged
   `CF-Connecting-IP`, `X-Forwarded-For`, `CF-IPCountry`, and
   `X-Menorah-Client-Country` headers. Confirm the Caddy/security-audit entry
   uses the real test-client IP, not either forged IP.
5. With an authenticated non-production booking fixture, confirm the forged
   country headers cannot change the call provider/region. Repeat through the
   normal tunnel path to confirm Cloudflare's actual country provenance is
   accepted.

Do not add a public echo/debug endpoint for this test. Use structured Caddy and
security-audit logs plus the authenticated call-policy response, retain only
redacted evidence, and remove the QA fixture afterward through the normal
application workflow.

The repository cannot perform these live account checks. They remain a
go-live blocker until an operator records passing evidence. Header behavior is
documented by Cloudflare at
<https://developers.cloudflare.com/fundamentals/reference/http-headers/>.

## Add A Second Connector Later — INFRASTRUCTURE ACTION

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
