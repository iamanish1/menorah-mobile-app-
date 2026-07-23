# Service and vendor register

Last reviewed: 2026-07-23.

## Status and ownership boundary

This register describes repository-visible services and integrations. It does
not prove that a service is deployed, that a vendor account is owned, or that a
contract/privacy review is complete. No production account identifiers,
credentials, personal contacts or secret-bearing URLs belong here.

Every enabled external service requires a named business owner, technical
owner, privacy/security review, contract and exit path. Until those records are
linked, its status is `Pending evidence` or `Disabled`.

Data-risk shorthand:

- `P` — personal/account/contact data;
- `H` — mental-health, clinical, counselling or biometric/face data;
- `F` — payment, payout or bank data;
- `S` — security credentials, logs or device/network identifiers;
- `C` — public/editorial content;
- `None` — no user data expected; verify in operation.

## Repository-operated services

| Service | Purpose and exposure | Data | Dependencies | Required owner/evidence | Current status |
| --- | --- | --- | --- | --- | --- |
| `reverse-proxy` (Caddy) | Public HTTP routing, TLS/origin boundary and private diagnostics | P, S in request metadata | Cloudflare, application services | `INFRASTRUCTURE ACTION`: route, header, TLS, access-log and firewall proof | Repository configured; live proof pending |
| `cloudflared` | Outbound Cloudflare Tunnel connector | S | Cloudflare account/token file, reverse proxy | `INFRASTRUCTURE ACTION`: hostname/tunnel comparison and connector health | Separate Compose overlay; live proof pending |
| `landing-page` | Public marketing/site entry | P only if a form is enabled | Reverse proxy, public API/links | Product/web owner; build, content and privacy review | Candidate build evidence required |
| `user-web-app` | User browser application | P, H, F | `api-web`, identity/payment/call providers | Product/web/privacy owners; build and E2E tests | Candidate evidence required |
| `web-app` | Counsellor browser application | P, H, F | `api-web`, calls, media | Product/clinical/privacy owners; build and authorization tests | Candidate evidence required |
| `admin-panel` | Privileged support/finance/content/admin UI | P, H, F, S, C | `api-admin` | Security/owner; role matrix, fresh MFA, build and audit evidence | Candidate evidence required |
| `api-ios` | Native iOS API profile and Apple sign-in path | P, H, F, S | MongoDB, Redis, email, Apple, payments, calls | Backend/mobile/security owners; test and startup evidence | Candidate evidence required |
| `api-android` | Native Android API profile | P, H, F, S | MongoDB, Redis, email, Google, payments, calls | Backend/mobile/security owners; test and startup evidence | Candidate evidence required |
| `api-web` | User/counsellor browser API and WebSockets | P, H, F, S | MongoDB, Redis, email, payments, calls | Backend/security/privacy owners; test and startup evidence | Candidate evidence required |
| `api-admin` | Admin API, payment/payout callbacks and operational views | P, H, F, S, C | MongoDB, Redis, Razorpay/X, media | Security/finance/privacy owners; least privilege and webhook evidence | Candidate evidence required |
| `worker` | Scheduled expiry, retention, notifications and approved background jobs | P, H, F, S | MongoDB, Redis, email/vendors | Platform plus functional owners; single-worker, job and alert evidence | Candidate evidence required |
| `livekit` | Self-hosted real-time call signalling/media | P, H, S | Host network/firewall, APIs | Realtime/infrastructure/clinical/privacy owners; call and regional tests | Production Compose service; live proof pending |
| `mongo-primary` | Primary application database/replica-set member | P, H, F, S, C | Host storage, keyfile, managed identities | DBA/infrastructure; backup, roles, replica, access and restore evidence | Source configured; live proof pending |
| `mongo-replica-init` | One-time replica-set initialization/reconciliation helper | S | Mongo root identity | DBA/infrastructure; idempotent init evidence | Maintenance helper |
| `mongo-restore-test` | Isolated restoration target | Restored P, H, F, S, C | Backup/restore tooling and isolated network | DBA/privacy/infrastructure; isolation and destruction record | Test-only profile |
| `redis` | Sessions, rate-limit/Socket.IO coordination and queues where configured | P, S | Host storage/network | Infrastructure/security; auth, persistence, monitoring and failure evidence | Source configured; live proof pending |
| `backup-runner` | Guard container; host systemd owns scheduled backups | P, H, F, S, C in encrypted archive | Mongo, media, keys, host mount | Backup custodian; signed encrypted archive and host readability | Direct Compose execution intentionally blocked |
| `production-restore-runner` | Destructive coordinated production recovery | Restored P, H, F, S, C | Approved archive, writers stopped, restore identity | `OWNER ACTION`, `INFRASTRUCTURE ACTION`; explicit recovery approval/evidence | Maintenance-only |
| `restore-test-runner` | Daily isolated restore validation | Restored P, H, F, S, C | Backup and isolated Mongo target | Infrastructure/privacy; isolation, success and cleanup evidence | Timer-driven; live proof pending |
| `media-verifier` | Verifies managed-media manifest/bytes | H, P, S metadata | Upload root, backup manifest | Infrastructure/privacy; pass evidence | Maintenance component |
| `prometheus` | Metrics collection and alert evaluation | S, aggregate operational data | Exporters, APIs, Alertmanager | Infrastructure/security; target coverage and retention/access | Configured; live proof pending |
| `alertmanager` | Alert routing/deduplication | S, incident metadata | External receiver | `INFRASTRUCTURE ACTION`, `OWNER ACTION`; receiver and delivery test | Human destination intentionally unconfigured |
| `blackbox-exporter` | HTTP/TCP/TLS probing | S | Internal/public endpoints | Infrastructure; probe coverage | Configured; live proof pending |
| `mongodb-exporter`, `redis-exporter`, `node-exporter` | Database/host metrics | S | Least-privilege credentials/host namespaces | Infrastructure; role and target evidence | Configured; live proof pending |
| `docker-metrics-gateway`, `docker-stats-exporter` | Constrained container state/resource metrics | S | The trusted gateway mounts the Docker socket directly; only the exporter reaches its allowlisted API over the restricted monitoring network | Infrastructure/security; prove denied raw inspection/log/archive/mutation routes and no secret/env exposure; direct socket risk remains confined to the trusted gateway | Candidate tests; live proof pending |
| `backup-metrics` | Exports backup age/status metadata | S | Protected status files | Infrastructure; stale/failure alert evidence | Configured; live proof pending |
| `grafana` | Local dashboards | S | Prometheus/Loki | Infrastructure; loopback/access control and backup | Local-only design; live proof pending |
| `uptime-kuma` | Availability monitoring | S, destination metadata | Configured monitors/notifications | Infrastructure; monitor and notification export/screenshots | No live monitors evidenced |
| `log-collector`, `loki` | Operational log collection/storage | P/S risk depending on log contents | Containers/host storage | Security/privacy/infrastructure; minimization, India location, 180-day coverage and access | Source configured; complete live coverage unproved |

## External vendor and platform register

The legal role column is deliberately `To determine` unless qualified review
has established it. Product names do not determine controller/processor status.

| Provider/platform | Intended use | Potential data | Repository control | Legal role / location / contract | Required decision and evidence |
| --- | --- | --- | --- | --- | --- |
| Cloudflare | DNS, proxy and Tunnel | P/S request and network metadata | Token file, hostname manifest, trusted-proxy validation | To determine | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`, `INFRASTRUCTURE ACTION`: account ownership, data terms/locations, routes, logs, incident and exit evidence |
| GitHub / GitHub Actions | Source, reviews and CI | S; test data must be synthetic | Workflows, templates and recommended rulesets | To determine | `OWNER ACTION`, `VENDOR ACTION`: organization ownership, rulesets, runners, secrets, logs, retention and offboarding |
| Container image registries / Docker | Build/runtime images | S supply-chain metadata | Pinned images/digests where configured | To determine | `VENDOR ACTION`, infrastructure: provenance, vulnerability, availability and pull credentials |
| Razorpay / RazorpayX | Checkout, payment and payout processing | P, F, S | Feature gates, signatures, provider-bound attempts, reconciliation | To determine | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`: account, contract, callbacks, events, disputes, retention, incident contacts |
| Resend | Transactional email | P, S | Required credential/sender validation | To determine | `VENDOR ACTION`, privacy: domain/sender, content minimization, delivery/bounce, retention, subprocessors, deletion and incident |
| Apple Sign in / Apple App Store | iOS authentication and distribution | P, S | Bundle/team/key validation and native config | To determine | `APPLE ACTION`, legal/privacy/vendor: ownership, key custody, declarations, signed build and store evidence |
| Google OAuth / Google Play | Authentication and Android distribution | P, S | Audience-specific client IDs and app config | To determine | `GOOGLE ACTION`, legal/privacy/vendor: ownership, redirects, Data Safety/Health declarations, signed build |
| Expo / EAS | Mobile SDK/tooling and optional build service | S; build artifacts may contain public config | Supported SDK checks and bare-workflow notes | To determine | `VENDOR ACTION`, `APPLE ACTION`, `GOOGLE ACTION`: account, build secrets, retention, signing custody and dependency exception |
| LiveKit software/service | Real-time calls; current production Compose is self-hosted | P, H, S media/metadata | Participant/time/state tickets and no-recording default | To determine; distinguish self-hosted software from any vendor service | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`, `VENDOR ACTION`: media paths, regions, logs, incident and fallback |
| Luxand | Face detection/check | H biometric/face data, P | Explicit token/config and consent metadata | To determine | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`, `VENDOR ACTION`: necessity, accuracy, retention/deletion, training/use, location and subprocessors |
| OpenAI | Optional Social Studio generation | C and potentially P if misused | Feature flags, separate keys/models | To determine | `OWNER ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`: prohibit sensitive prompts, approve data use/retention, monitoring and disable unless evidenced |
| Meta / Instagram | Optional content publishing | C, P/S account tokens | Encrypted social token and feature gates | To determine | `OWNER ACTION`, `VENDOR ACTION`, privacy: account ownership, scopes, token revocation, content approval, data terms |
| Cloudinary | Optional media service; production backend currently required to remain local | P/H media if enabled | Startup rejects it as production storage backend | To determine | Keep disabled in production; future use requires `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION` and backup/migration design |
| Google Meet | Optional call fallback/integration | P, H, S | Feature flag | To determine | `OWNER ACTION`, `CLINICAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`; disable until complete |
| Doxy.me | Optional call provider | P, H, S | Feature flag | To determine | Same approval and evidence; disable until complete |
| VSee | Optional call provider | P, H, S | Feature flag/mode | To determine | Same approval and evidence; disable until complete |
| Zoom | Optional call provider | P, H, S | Feature flag | To determine | Same approval and evidence; disable until complete |
| Microsoft Teams | Optional call provider | P, H, S | Feature flag | To determine | Same approval and evidence; disable until complete |
| Jitsi-compatible domain | Client-visible optional meeting domain | P, H, S | Public domain variable | To determine | `OWNER ACTION`, `CLINICAL ACTION`, privacy/vendor review; disable until complete |
| Certificate authority / domain registrar | TLS certificates and domain control | S | Caddy/Cloudflare configuration paths | To determine | `OWNER ACTION`, `VENDOR ACTION`, `INFRASTRUCTURE ACTION`: ownership, renewal, recovery and expiry test |
| Alert notification provider | Paging/email/chat delivery | S incident metadata, possibly P if alerts are unsafe | External Alertmanager file intentionally absent from Git | To determine | `OWNER ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`, `INFRASTRUCTURE ACTION`: approved receiver, secret storage, redaction and delivery test |
| Off-site backup provider/location | Disaster-recovery copy | Encrypted P, H, F, S, C | Encrypted/signed archive design | To determine | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`: location, access, key separation, retention, restore and deletion |
| Independent VAPT provider | Security assessment | S and controlled test accounts/data | Scope/checklists only | Independent assessor | `VAPT ACTION`, owner: contract, scope, rules of engagement, report custody and retest |
| ISO certification body / auditors | Future management-system assurance | Governance and evidence, possibly sensitive | Evidence map only | Not selected | `OWNER ACTION`: select qualified/accredited parties only after system operation; no certification claim |

## Vendor due-diligence minimum

For each provider marked enabled, link:

1. `OWNER ACTION`: named business and technical owners plus alternate.
2. `LEGAL ACTION`: executed agreement, service terms, liability, lawful
   disclosure and termination obligations.
3. `PRIVACY ACTION`: role, purpose, data fields, subjects, location, transfer,
   subprocessors, retention, access, request assistance and deletion/return.
4. Security evidence: authentication, least privilege, encryption, logs,
   vulnerability/assurance material, breach timing and incident contact.
5. `VENDOR ACTION`: sandbox/test evidence, quotas, availability, escalation,
   export, deletion and account recovery.
6. Exit plan: disable flag, revoke credentials, preserve required evidence,
   export needed records, verify deletion and update notices/data flows.
7. Review date and next review trigger.

No vendor is approved merely because a configuration variable exists. Optional
integrations remain disabled until the register row links a complete evidence
pack.
