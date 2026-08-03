# Cloudflare Production Ingress

Production ingress uses a Cloudflare Tunnel. Browsers connect to Cloudflare over HTTPS and `cloudflared` creates an outbound encrypted tunnel to the host; Caddy then receives HTTP only on the private Docker network. MongoDB and Redis must never be exposed publicly.

## Client Identity Trust Boundary

Production Compose separates connector egress from origin ingress:

```text
Cloudflare edge
  -> cloudflared (public_net + tunnel_ingress_net)
  -> Caddy (tunnel_ingress_net + app_net)
  -> Express APIs (app_net)
```

`tunnel_ingress_net` is internal and may contain only `cloudflared` and Caddy.
Caddy is not attached to `public_net`; it trusts only the connector's exact
`CLOUDFLARED_TUNNEL_IP`, derives `{client_ip}` only from the single-value
`CF-Connecting-IP` header, and overwrites forwarding headers sent upstream.
It returns `400` if the trusted connector arrives without client-IP
provenance, preventing all callers from collapsing into one rate-limit bucket.
It strips browser-supplied geolocation aliases and promotes a syntactically
valid `CF-IPCountry` into the private `X-Menorah-Client-Country` header only
when the immediate peer is the connector.

Express trusts only Caddy's exact `CADDY_APP_IP`. Rate limiting, security audit
events, and call-region policy use middleware-validated request provenance;
they do not read raw `CF-*`, `X-Forwarded-*`, or generic country headers.
Production startup rejects boolean, hop-count, named-range, and CIDR
`TRUST_PROXY` values.

The environment template contains these candidate values:

```env
TUNNEL_INGRESS_SUBNET=10.253.250.0/29
CADDY_TUNNEL_IP=10.253.250.2
CLOUDFLARED_TUNNEL_IP=10.253.250.3
APP_NETWORK_SUBNET=10.253.251.0/24
CADDY_APP_IP=10.253.251.2
```

They are required inputs, not safe universal defaults. Before first deployment,
verify both subnets do not overlap host, LAN, VPN, provider, or existing Docker
routes. Change all five values together when necessary in the untracked
production environment. The repository validator verifies single-source wiring
and exact network membership.

## Hostname Map

Configure these as public hostnames on the Cloudflare Tunnel, each targeting `http://reverse-proxy:80`:

`ingress-manifest.json` is the source-controlled authority for this exact map.
The offline validator also checks that every manifest route has a matching
`Caddyfile.production` site and that Caddy has no extra public site.

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

## Offline Configuration Gate

Install the QA package and run the deterministic fixture suite:

```bash
npm --prefix menorah/scripts/qa ci --ignore-scripts
npm --prefix menorah/scripts/qa run test:tunnel-config
```

Validate an operator-supplied locally managed configuration without contacting
Cloudflare:

```bash
node menorah/scripts/qa/validate-cloudflare-tunnel-config.mjs \
  --config /absolute/path/to/operator-config.yml
cloudflared tunnel --config /absolute/path/to/operator-config.yml ingress validate
cloudflared tunnel --config /absolute/path/to/operator-config.yml \
  ingress rule https://api-web.menorah.me/health/ready
cloudflared tunnel --config /absolute/path/to/operator-config.yml \
  ingress rule https://not-configured.invalid/
```

The first command enforces the exact normalized hostname and service set,
rejects duplicate/missing/unexpected routes, path or wildcard shadowing,
non-terminal catch-alls, a final service other than `http_status:404`, unsafe
origin targets, Caddy/manifest drift, broad proxy trust, forwarding-header
sanitization drift, and Compose ingress-network drift. The Cloudflare CLI
commands add its native syntax validation and show the selected rule. Inspect
the last command's output to confirm the unmatched hostname selects the final
`http_status:404` rule. `--config` belongs before `ingress`; these commands
apply only to a locally managed YAML configuration.

`calls.menorah.me` is proxied by Caddy to `LIVEKIT_UPSTREAM`. For same-VPS Hostinger LiveKit, use:

```env
LIVEKIT_UPSTREAM=http://livekit:7880
```

## Native reset-link association files

The mobile apps verify HTTPS ownership through `/.well-known/apple-app-site-association`
and `/.well-known/assetlinks.json`. Keep the `menorah.me`, `app.menorah.me`,
`api-ios.menorah.me`, and `api-android.menorah.me` public hostnames pointed at
`http://reverse-proxy:80`; do not add a redirect, access policy, HTML rewrite,
or cache rule that intercepts either `/.well-known/` path.

`www.menorah.me` is also an App/Universal Link hostname. Caddy already sends
both association paths directly to `app-link-associations`, but it cannot
override a Cloudflare redirect that runs before the Tunnel. If Cloudflare
redirects `www.menorah.me` to `menorah.me`, edit the redirect rule itself so it
does **not** match either association path. For a Cloudflare Single Redirect
rule, use an expression equivalent to:

```text
http.host eq "www.menorah.me" and not (
  http.request.uri.path in {
    "/.well-known/apple-app-site-association"
    "/.well-known/assetlinks.json"
  }
)
```

Do not rely on a later WAF/Skip rule to repair this: a matching redirect is a
terminal response. If the redirect is implemented as a Page Rule, Bulk
Redirect, or Worker, add the same two-path exclusion there or replace it with
an equivalent conditional redirect rule. The public health gate below must
return direct `200 application/json` responses for those `www` URLs; `301`,
`302`, or a redirect followed by `curl -L` is not valid app-link verification.

Set the real Apple Team ID and Android signing SHA-256 fingerprint values in
the host-only `production.env` before enabling native reset links. Until then,
the edge intentionally returns `404` for these files. See
[`../app-links/README.md`](../app-links/README.md) for the exact variables and
post-deploy verification commands.

Cloudflare HTTP proxying is only for HTTPS/WSS signaling. LiveKit media still needs direct Hostinger access to `7881/tcp`, `3478/udp`, `5349/tcp`, and `61000-62000/udp`. The TURN relay allocation range remains internal and is not opened publicly.

## Dashboard-Managed Tunnel Token

The Cloudflare public hostname service target must remain `http://reverse-proxy:80`. Do not change it to `https://reverse-proxy:443` unless a separate Origin-CA Caddy configuration and trusted certificate mount are deployed together.

1. In Cloudflare Zero Trust, create a tunnel for the Ubuntu host.
2. Choose Docker as the connector type.
3. Rotate the tunnel token before this deployment because the previous Compose
   command exposed it through container inspection.
4. Write only the rotated token to an untracked root-owned file:

```bash
sudo install -d -m 0700 /opt/menorah/secrets
sudo install -m 0400 /dev/null /opt/menorah/secrets/cloudflare-tunnel-token
sudoedit /opt/menorah/secrets/cloudflare-tunnel-token
```

5. On the host:

```bash
cp menorah/deploy/env/cloudflare.env.example menorah/deploy/env/cloudflare.env
nano menorah/deploy/env/cloudflare.env
```

6. Set the non-secret file path:

```env
CLOUDFLARE_TUNNEL_TOKEN_FILE=/opt/menorah/secrets/cloudflare-tunnel-token
```

The connector receives only `TUNNEL_TOKEN_FILE=/run/secrets/cloudflare_tunnel_token`.
The token itself is not placed in the container command line or environment.

7. In the Tunnel dashboard, configure every hostname above with the service
   target `http://reverse-proxy:80`. A missing Mentle hostname produces a
   Cloudflare 404 before the request reaches Caddy.
8. Start the combined stack:

```bash
cd menorah/deploy
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.tunnel.yml \
  --env-file ./env/production.env \
  --env-file ./env/cloudflare.env \
  up -d --build
```

## Locally Managed Tunnel Config File

Use this only after the token-based setup is understood.

1. Create a named tunnel with `cloudflared tunnel create`.
2. Copy `tunnel-config.yml.example` to a host-only config path.
3. Put the Cloudflare credentials JSON outside git, for example `/opt/menorah/secrets/cloudflared/`.
4. Pass the copied file through the offline gate above.
5. Run cloudflared with the config file instead of `TUNNEL_TOKEN`.

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

**INFRASTRUCTURE ACTION — read-only production inspection:**

```bash
docker compose -f docker-compose.production.yml -f docker-compose.tunnel.yml ps cloudflared
docker compose -f docker-compose.production.yml -f docker-compose.tunnel.yml logs cloudflared --tail=100
CHECK_PUBLIC=true bash ubuntu/health-check.sh

# Before an internal/native mobile rollout, require the signed association
# files as well (they intentionally return 404 until identifiers are set).
# This checks all declared iOS/Android hosts and fails if any path redirects.
CHECK_PUBLIC=true CHECK_ANDROID_APP_LINKS=true bash ubuntu/health-check.sh
```

For a remotely managed tunnel, an operator with a minimally scoped read-only
Cloudflare Tunnel API token can stream a sanitized configuration response into
the same offline validator. Run from the repository root; do not paste a token
value into this document or commit the response:

```bash
# INFRASTRUCTURE ACTION — read-only Cloudflare API request.
: "${CLOUDFLARE_ACCOUNT_ID:?set the Cloudflare account ID}"
: "${CLOUDFLARE_TUNNEL_ID:?set the tunnel UUID}"
: "${CLOUDFLARE_API_TOKEN:?set a read-only Cloudflare Tunnel API token}"
curl --fail --silent --show-error \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${CLOUDFLARE_TUNNEL_ID}/configurations" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" |
  node menorah/scripts/qa/validate-cloudflare-tunnel-config.mjs --config -
```

This is the documented Cloudflare `GET
/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` endpoint. It does
not return or validate the connector token. The response is streamed rather
than saved; the validator selects `result.config` in memory and never prints
account or tunnel metadata. It also accepts a separately sanitized JSON export
containing only `success`, `result.source`, and `result.config`. In the
dashboard, the equivalent read-only review is **Zero Trust > Networks > Tunnels
> [production tunnel] > Public Hostnames**; compare the displayed hostname and
service columns with `ingress-manifest.json` without selecting Edit or Save.

The remote route export does **not** prove edge header behavior. Before go-live,
an operator must separately verify, without changing production:

- the hostname is orange-cloud proxied and reaches only this Tunnel;
- Cloudflare overwrites `CF-Connecting-IP` and supplies `CF-IPCountry`;
- no Worker, Transform Rule, or stacked CDN can inject or rewrite either
  provenance header before the tunnel;
- an external request carrying forged `CF-Connecting-IP`,
  `X-Forwarded-For`, `CF-IPCountry`, and `X-Menorah-Client-Country` values is
  recorded under the real source IP and cannot change call-country policy.

Record the Cloudflare dashboard/API evidence and authenticated negative-test
result in the release evidence bundle. This remains an external go-live
blocker until checked against the live zone. Cloudflare documents these headers
at <https://developers.cloudflare.com/fundamentals/reference/http-headers/>.

## Second Connector Later

After the first connector is stable, a second `cloudflared` replica can be added on another machine with the same tunnel token. Do not scale replicas on the same host until resource and routing behavior are verified.

## Safety

The `cloudflared` image is version- and digest-pinned. Review Cloudflare release
notes and update both values together during planned maintenance.

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
