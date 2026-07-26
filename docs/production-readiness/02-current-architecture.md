# Current production architecture

Last reviewed: 2026-07-23.

## Status and authority

This document describes the architecture intended by the candidate repository.
It is not an inventory of running production resources and does not prove
network rules, service health, provider configuration or data location.

**Public-production verdict: NOT READY.**

The production authority is
[the production Compose definition](../../menorah/deploy/docker-compose.production.yml),
the [Caddy production configuration](../../menorah/deploy/caddy/Caddyfile.production)
and the
[Cloudflare Tunnel overlay](../../menorah/deploy/docker-compose.tunnel.yml).
The home Compose definition is non-authoritative for production.

## Intended request and service topology

```text
Web browsers / mobile apps / provider callbacks
                     |
              Public DNS and TLS
                     |
              Cloudflare / Tunnel
                     |
                cloudflared
                     |
          Caddy reverse-proxy boundary
          /          |             \
  web frontends   API profiles   LiveKit signalling
                       |                 |
                worker / sockets     authorized media
                   /       \         sessions; host media
              MongoDB     Redis      ports where approved
                  |
        local managed-upload storage

Operations:
  Prometheus <- probes/exporters/app metrics -> Alertmanager -> external
                                                       receiver NOT configured
  Caddy/Docker log files -> Grafana Alloy -> local Loki -> Grafana
  Docker socket -> trusted project-scoped gateway -> stats exporter
  host timers -> guarded backup/restore helpers -> encrypted recovery sets
```

Cloudflare carries HTTP/HTTPS and WebSocket signalling to Caddy. LiveKit media
has a separate network requirement; normal HTTP tunnelling does not prove or
carry the configured direct TCP/UDP media path. Actual DNS, Tunnel ingress,
firewall, TLS and media reachability remain an `INFRASTRUCTURE ACTION`.

## Application tier

| Component | Intended responsibility | Principal trust boundary |
| --- | --- | --- |
| `landing-page` | Public marketing and server-side public/contact functions | Public input; repository Compose also gives this service database/email configuration, which requires least-privilege live review |
| `user-web-app` | Authenticated user browser experience | User session and browser-origin boundary; repository Compose includes server-side database/email access |
| `web-app` | Counsellor browser experience | Counsellor identity, verification and assigned-object authorization |
| `admin-panel` | Privileged operational interface | Separate administrator audience, permissions and fresh-MFA requirements |
| `api-ios` | Native iOS API profile and Apple-auth path | Mobile token audience and restricted payment route surface |
| `api-android` | Native Android API profile | Mobile token audience and object authorization |
| `api-web` | User/counsellor browser API, WebSockets and booking payment callback | Browser origins, session role, webhook authenticity and object authorization |
| `api-admin` | Admin operations and payout/payment administrative callbacks | Administrator audience, explicit permissions, fresh MFA and audit evidence |
| `worker` | Approved expiry, retention, notification and scheduled jobs | Singleton execution, explicit feature gates and durable-state transitions |
| `livekit` | Self-hosted call signalling/media | Short-lived server-issued participant authorization, time/state gates and network boundary |

All public application routing is intended to traverse Caddy. Host loopback
ports exist for controlled diagnostics/probing and are not evidence of public
exposure. The application services must not be made public independently.

## Data tier

| Component | Intended use | Safety boundary and unresolved evidence |
| --- | --- | --- |
| `mongo-primary` | System of record for application, privacy, payment and audit state | Internal database network; managed identities, replica state, indexes, backup and live access review remain to be proved |
| `redis` | Sessions, coordination, rate limits, Socket.IO and queues where configured | Internal data network; persistence/auth/ACL and failure behavior require live proof |
| Managed uploads | Local production media selected so bytes join backup/restore | Capacity, permissions, manifest completeness and off-site recovery require operation |
| Security audit ledger | Durable HMAC-linked records in the application datastore | Pending-queue loss window, key rollover and retention remain documented limitations |
| Encrypted backups | MongoDB plus managed media, metadata, checksums and HMAC | Host timers and protected key/archive custody; live encrypted backup/off-site copy/restore are not evidenced |

Production migrations are not run implicitly. The guarded release workflow
stops writers, records phase state, performs approved identity reconciliation,
runs migrations once and requires post-checks. This source ordering still needs
disposable and target-environment evidence.

## Network and trust boundaries

| Boundary | Repository intent | Required external proof |
| --- | --- | --- |
| `tunnel_ingress_net` | Internal, fixed-address path between approved tunnel and Caddy | Tunnel membership, route parity and no bypass |
| `app_net` | Internal application/reverse-proxy/LiveKit communication | Exact membership, address constraints and no unintended exposure |
| `db_net` | Internal MongoDB/Redis and approved clients/helpers | Least-privilege membership, credentials and listener exposure |
| `monitoring_net` | Internal metrics/logging plane | Target coverage, access and retention |
| `docker_metrics_socket_net` | Isolated gateway-to-exporter path | Only intended two services present; no public or application attachment |
| `restore_test_net` | Isolated disposable restore path | No production writers or ordinary application clients attached |
| `local_probe_net` / `public_net` | Controlled host probing or outbound reachability where defined | Host bind/firewall behavior and necessity of each membership |
| `mentle_internal` | External pre-existing network consumed by the production model | Ownership, membership and lifecycle on the target host |

Compose network declarations do not replace host firewall, cloud firewall,
Docker daemon or external-network inspection.

## Observability architecture

The candidate monitoring configuration contains **14 scrape jobs**, **69 alert
rules** and **26 coverage records**. Its machine-validated P0 register maps all
20 required alert gaps to bounded producers, rules, fixtures and runbooks.

Prometheus collects native metrics from the application and exporters.
Blackbox exporter probes JSON health endpoints, TCP dependencies and public TLS
without pretending JSON is Prometheus text. Alertmanager evaluates routing and
deduplication, but its committed receiver is deliberately
`unconfigured-destination`; a protected destination and live delivery test are
an `INFRASTRUCTURE ACTION`.

Production logging uses:

```text
Caddy access files --------\
                            Grafana Alloy -> Loki -> Grafana
Docker json-file logs -----/
```

Alloy persists positions and Loki is configured for local operational
retention. This single-host Loki store is not off-host evidence, a legal archive
or proof of the required India ICT-log coverage and retrieval.

Container resource/state monitoring uses:

```text
/var/run/docker.sock
        |
docker-metrics-gateway (trusted, root-equivalent socket holder)
        |
  project-scoped sanitized list / one-shot stats / sanitized state
        |
docker-stats-exporter -> Prometheus
```

The gateway authorizes only containers carrying the configured Compose project
label and returns bounded fields. Its repository tests deny cross-project
access, raw inspect/log/archive/export endpoints and every mutation. The
gateway is still a high-trust component because Docker-socket read-only mounts
do not remove Docker API privilege; image provenance, isolation and live route
behavior must be verified.

## Backup and recovery architecture

Host systemd timers invoke guarded repository scripts for six-hourly, daily,
weekly and monthly backups, daily isolated restores, hourly health checks and
pruning. Compose backup/restore helpers are maintenance profiles, not ordinary
long-running application services. A direct `backup-runner` invocation is
intentionally blocked.

Every recovery set binds database, managed-media, manifest, release/migration
metadata, checksums and HMAC evidence. Production recovery consumes a derived,
allowlisted artifact rather than restoring the raw full-instance archive.

The latest successful isolated restore evidence must be no more than 24 hours
old. A successful exporter scrape or marker-file presence alone is not
cryptographic verification; the host backup-health procedure is authoritative.

## External dependencies

Repository-visible dependencies include Cloudflare, GitHub/registries,
Razorpay/RazorpayX, Resend, Apple, Google, Expo/EAS and optional providers such
as Luxand, OpenAI/Meta and external call services. LiveKit is currently defined
as self-hosted. Cloudinary is rejected as the production media backend by the
current startup contract.

An environment variable or feature flag does not prove that an integration is
approved or active. The complete ownership and evidence boundary is in
[the service and vendor register](./23-service-and-vendor-register.md).

## Architecture acceptance evidence

Before this diagram can be treated as the deployed architecture:

1. `INFRASTRUCTURE ACTION`: render the exact production configuration with
   protected inputs and compare service/network membership to this source.
2. `INFRASTRUCTURE ACTION`: inspect host/cloud firewalls, published ports,
   Docker networks, volumes, identities and mounts.
3. `INFRASTRUCTURE ACTION`: prove every intended internal and public route,
   including failed bypass attempts and LiveKit media behavior.
4. `INFRASTRUCTURE ACTION`: prove metrics, logs, backups, restore isolation,
   destination delivery and responder acknowledgement.
5. `VENDOR ACTION`: prove every enabled external endpoint, callback, account
   owner, limit, failure mode and exit path.
6. Security/VAPT reviewers must test trust-boundary bypass, object
   authorization, admin separation, WebSockets, files, SSRF and callbacks
   against the immutable candidate.
