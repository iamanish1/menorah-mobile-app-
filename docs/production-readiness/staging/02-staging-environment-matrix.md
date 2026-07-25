# Selected redacted staging environment mappings and provenance

Runtime candidate SHA: `1ecd0b379369258be466159364a8a48c79fb65aa`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

This document records selected executable mappings and historical
production-contract provenance for the isolated staging run. It is not an
exhaustive per-variable inventory. It contains safe literals and symbolic
relationships, but no credential, secret, private key, database URI, account
identifier, recipient, provider token or production value. The protected
execution copy receives staging-only values through the approved secret path.
Production values are never read or compared during staging.

For this candidate, the tracked
[`server-staging.env.example`](../../../menorah/deploy/env/server-staging.env.example),
the dedicated
[`server-staging` overlay](../../../menorah/deploy/server-staging/compose.yml),
and its validators are authoritative. Any older production-model source tag
below is contract provenance only, not an instruction to run a production
Compose file or production script. Server values, secrets, provider accounts,
DNS/TLS/Tunnel configuration and provisional network ranges remain
**NOT COLLECTED — DISCOVERY REQUIRED**; use the
[server-staging design and discovery runbook](../29-server-staging-design-and-discovery-runbook.md).

The larger table below is a selected comparison/provenance view and must not
be used to infer executable completeness. The current tracked authority is the
268-assignment-key `server-staging.env.example`; its generator produces the
291-key environment consumed by the dedicated validators and Compose render.
Those two counts describe different artifacts and are both expected. The
retired developer-home model is outside staging scope.

Every production-source cell is a redacted source class, never a value:
reviewed production configuration, protected production configuration,
protected secret-manager/file reference, derived immutable artifact/release
record, or approved unset decision. “Not accessed” means the staging exercise
does not query, copy or compare the corresponding production value.

## Authoritative source tags

- `SSENV` — [server-staging environment contract](../../../menorah/deploy/env/server-staging.env.example)
- `SSCOMPOSE` — [server-staging Compose overlay](../../../menorah/deploy/server-staging/compose.yml)
- `SSVAL` — [environment](../../../menorah/deploy/server-staging/validate-environment.mjs)
  and [isolation](../../../menorah/deploy/server-staging/validate-isolation.mjs)
  validators
- `SSOPS` — [dedicated server-staging operations](../../../menorah/deploy/server-staging/)
- `SSING` — [server-staging ingress manifest](../../../menorah/deploy/server-staging/ingress-manifest.json)

- `DE` — [deployment-environment validator](../../../menorah/backend/src/config/deploymentEnvironment.js)
- `SV` — [backend startup validator](../../../menorah/backend/src/shared/app/startupValidation.js)
- `MAIL` — [backend outbound-email guard](../../../menorah/backend/src/utils/email.js)
- `DC` — [production-like Compose model](../../../menorah/deploy/docker-compose.production.yml)
- `REL` — [guarded release script](../../../menorah/deploy/ubuntu/update-from-git.sh)
- `MIG` — [checksum-bound migration runner](../../../menorah/deploy/ubuntu/run-recorded-migration.sh)
- `TUN` — [Tunnel Compose model](../../../menorah/deploy/docker-compose.tunnel.yml)
- `BACKUP` — [backup runner](../../../menorah/deploy/ubuntu/backup-now.sh)
- `BHEALTH` — [backup-health validator](../../../menorah/deploy/ubuntu/check-backup-health.sh)
- `PE` — [environment-name reference](../../../menorah/deploy/env/production.env.example)
- `ER` — [full handover environment reference](../22-environment-variable-reference.md)
- `MR` — [mobile release-environment validator](../../../menorah/mobile-app/scripts/release-environment.cjs)
- `AC` — [Expo application configuration](../../../menorah/mobile-app/app.config.ts)
- `EAS` — [EAS build profiles](../../../menorah/mobile-app/eas.json)
- `SM` — [smoke-target safety validator](../../../menorah/scripts/qa/smoke-target-safety.js)
- `API` — [API smoke runner](../../../menorah/scripts/qa/production-api-smoke.js)
- `AUTH` — [authentication smoke runner](../../../menorah/scripts/qa/production-auth-smoke.js)
- `PW` — [Playwright staging configuration](../../../menorah/scripts/qa/playwright.config.js)
- `DAST` — [authenticated DAST workflow](../../../.github/workflows/dast.yml)
- `ANDROID` — [Android release-signing workflow](../../../.github/workflows/build-android.yml)
- `REST` — [restore](../../../menorah/deploy/ubuntu/restore-latest-backup.sh) and
  [restore acknowledgement](../../../menorah/deploy/ubuntu/acknowledge-production-restore.sh)
- `MON` — [Alertmanager delivery validator](../../../menorah/deploy/monitoring/validate-alertmanager-delivery.mjs)

`R` means required, `C` conditional, `O` optional and `U` must be unset. The
“production source” column deliberately never identifies or reads a production
secret. `Reference only` always means an access-controlled reference, not the
value.

For server execution, `SSENV`, `SSCOMPOSE`, `SSVAL`, `SSOPS` and `SSING`
override older production-provenance tags. A variable absent from `SSENV` must
be unset unless the dedicated validator explicitly accepts it. In particular,
the server-staging contract fixes project `menorah-staging`; roots beneath
`/opt/menorah-staging`; 32 services, six dedicated networks and 21 volumes in
the all-profile static model; and 26 containers on five networks in the
default runtime. The default service graph references 19 volumes; the
validated post-migration runtime retained 20 because
`staging-migration-temp` persists. The recovery/all-profile model adds the
sixth (`restore`) network and `staging-restore-mongodb` as the 21st volume.
Published application/monitoring ports are loopback-only, no database/cache
port is published, and the ingress contract has 10 exact hosts. Network CIDRs
are provisional until discovery/collision approval.

## Executable server-staging authority

These selected safe values are copied from the 268-key tracked template. They
describe the candidate contract, not a deployed server; discovery, collision
approval and the protected 291-key generated environment remain required.

| Key | Exact candidate value | Status / validation |
| --- | --- | --- |
| `MENORAH_SERVER_STAGING_PROJECT_NAME` | `menorah-staging` | Fixed project boundary |
| `MENORAH_SERVER_STAGING_RESOURCE_PREFIX` | `menorah-staging` | Fixed resource boundary |
| `MENORAH_SERVER_STAGING_ENVIRONMENT_ID` | `menorah-server-staging-v1` | Fixed environment attestation |
| `MENORAH_RUNTIME_CANDIDATE_SHA` | `1ecd0b379369258be466159364a8a48c79fb65aa` | Must equal the executable checkout, scripts, images, manifests and release markers |
| `MENORAH_SERVER_STAGING_RUNTIME_SHA` | `1ecd0b379369258be466159364a8a48c79fb65aa` | Must equal `MENORAH_RUNTIME_CANDIDATE_SHA`; a later docs head is invalid here |
| `MENORAH_SERVER_STAGING_ROOT` | `/opt/menorah-staging` | Canonical server-staging root |
| `MENORAH_SERVER_STAGING_INGRESS_SUBNET` / `MENORAH_SERVER_STAGING_INGRESS_IP_RANGE` | `10.252.240.0/24` / `10.252.240.128/25` | Provisional until collision approval |
| `MENORAH_SERVER_STAGING_APP_SUBNET` / `MENORAH_SERVER_STAGING_APP_IP_RANGE` | `10.252.241.0/24` / `10.252.241.128/25` | Provisional until collision approval |
| `MENORAH_SERVER_STAGING_CADDY_APP_IP` | `10.252.241.10` | Exact app-network proxy address; source of `TRUST_PROXY` |
| `MENORAH_SERVER_STAGING_DATA_SUBNET` / `MENORAH_SERVER_STAGING_DATA_IP_RANGE` | `10.252.242.0/24` / `10.252.242.128/25` | Provisional until collision approval |
| `MENORAH_SERVER_STAGING_MONITORING_SUBNET` / `MENORAH_SERVER_STAGING_MONITORING_IP_RANGE` | `10.252.243.0/24` / `10.252.243.128/25` | Provisional until collision approval |
| `MENORAH_SERVER_STAGING_RESTORE_SUBNET` / `MENORAH_SERVER_STAGING_RESTORE_IP_RANGE` | `10.252.244.0/24` / `10.252.244.128/25` | Restore profile only; provisional until collision approval |
| `MENORAH_SERVER_STAGING_EGRESS_SUBNET` / `MENORAH_SERVER_STAGING_EGRESS_IP_RANGE` | `10.252.245.0/24` / `10.252.245.128/25` | Provisional until collision approval |

The `egress` network is an ordinary NAT-capable Docker bridge, not a
destination or FQDN allowlist. Its members are `staging-api-ios`,
`staging-api-android`, `staging-api-web`, `staging-api-admin`,
`staging-user-web` and `staging-alertmanager`; the worker, migration and seed
services have no egress membership. Approved host firewall/proxy controls and
denied production/private-route evidence are therefore still mandatory.

## Deployment identity, hostnames and exact URL mappings

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | All backend services; mobile release validation | R; exactly `production` so all hardening checks execute | Startup and mobile validators | Reviewed non-secret config | Reviewed production configuration - not accessed | No | Platform | Redacted preflight | SV, MR, DC |
| `DEPLOYMENT_ENVIRONMENT` | All backend services/health | R; exactly `staging` | Startup rejects any other staging identity; readiness emits staging attestation | Reviewed non-secret config | Reviewed production configuration - not accessed | No | Platform/security | Validator and response-header evidence | DE, SV, DC |
| `MENORAH_STAGING_ALLOWED_HOSTS` | Backend startup | R; comma-separated set containing exactly the ten unique `*_DOMAIN` hosts below, with no spaces, aliases, duplicates or extras | Exact-set validation | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/security | Redacted host-set review | DE, DC |
| `MENORAH_STAGING_EMAIL_DOMAIN` | Backend outbound email, web contact sink and all synthetic staging accounts | R; lowercase DNS name with `staging` as a full label; exact domain for `EMAIL_FROM`, `CONTACT_TO_EMAIL`, every backend OTP/reset/booking/notification recipient and every synthetic account email; external/live recipients fail closed before provider dispatch | Staging isolation/startup, outbound-recipient and provider-call validation | Approved staging email-domain inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/security/vendor/QA | Redacted domain, negative-recipient and delivery evidence | DE, SV, MAIL, DC |
| `SERVICE_RUNTIME` | APIs/worker | R; reviewed production-like staging runtime | Rendered model/startup | Reviewed non-secret config | Reviewed production configuration - not accessed | No | Platform | Render evidence | DC, PE |
| `PUBLIC_EMAIL` | Public UI/API | C; approved synthetic/support sink only | UI/email review | Approved staging contact reference | Protected production configuration reference - not accessed | Sensitive | Owner/QA | Redacted contact approval | DC, ER |
| `ROOT_DOMAIN` | Caddy/backend | R; unique lowercase FQDN with `staging` as a full DNS label; exact allowlist member | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | DNS/validator evidence | DE, DC |
| `WWW_DOMAIN` | Landing/user web | R; same hostname rules; must not equal another service host | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | DNS/route evidence | DE, DC |
| `APP_DOMAIN` | User application/reset | R; same hostname rules; canonical staging app host | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | DNS/route evidence | DE, DC |
| `ADMIN_DOMAIN` | Admin UI | R; same hostname rules; unique | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/security | DNS/route evidence | DE, DC |
| `COUNSELLOR_DOMAIN` | Counsellor UI | R; same hostname rules; unique | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | DNS/route evidence | DE, DC |
| `API_IOS_DOMAIN` | iOS API | R; same hostname rules; unique | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | DNS/route evidence | DE, DC |
| `API_ANDROID_DOMAIN` | Android API | R; same hostname rules; unique | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | DNS/route evidence | DE, DC |
| `API_WEB_DOMAIN` | Web API/socket/media | R; same hostname rules; unique | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | DNS/route evidence | DE, DC |
| `API_ADMIN_DOMAIN` | Admin API | R; same hostname rules; unique | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/security | DNS/route evidence | DE, DC |
| `CALLS_DOMAIN` | LiveKit/calls | R; same hostname rules; unique | Staging isolation validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | Realtime/infrastructure | DNS/route evidence | DE, DC |
| `FRONTEND_API_WEB_URL` | User/counsellor web builds | R; exactly `https://${API_WEB_DOMAIN}/api` | Exact staging mapping | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Web/platform | Rendered build-arg review | DE, DC |
| `FRONTEND_API_ADMIN_URL` | Admin build | R; exactly `https://${API_ADMIN_DOMAIN}/api` | Exact staging mapping | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Admin/platform | Rendered build-arg review | DE, DC |
| `FRONTEND_SOCKET_WEB_URL` | User/counsellor web sockets | R; exactly `https://${API_WEB_DOMAIN}` | Exact staging mapping | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Web/realtime | Rendered build-arg review | DE, DC |
| `LIVEKIT_URL` | Backend/web/mobile | R; exactly `wss://${CALLS_DOMAIN}` | Exact staging mapping | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Realtime | Startup/render/client inspection | DE, SV, DC |
| `LIVEKIT_API_URL` | Backend | R; exactly `https://${CALLS_DOMAIN}` | Exact staging mapping | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Realtime | Startup/render evidence | DE, SV, DC |
| `LIVEKIT_UPSTREAM` | Caddy | R when self-hosted; internal Compose upstream only | Rendered Caddy/Compose | Reviewed internal route | Protected production configuration reference - not accessed | Sensitive | Realtime/infrastructure | Render evidence | DC, PE |
| `PASSWORD_RESET_BASE_URL` | Backend email/auth | R; exactly `https://${APP_DOMAIN}`, with no path, port, query, fragment or credentials | Exact staging mapping and email helper | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Auth/platform | Startup and reset-link test | DE, SV |
| `CHECKOUT_RETURN_URL` | Backend checkout/web handoff | R; exactly `https://${APP_DOMAIN}/checkout/return`, with no credentials, port, query or fragment | Exact staging mapping and Compose requirement | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Payment/platform | Startup/render/checkout evidence | DE, SV, DC |
| `PASSWORD_RESET_URL_TEMPLATE` | Backend email/auth | U in hardened runtime | Startup failure test | Unset | Approved production unset decision - not accessed | No | Auth/platform | Negative preflight | SV |
| `MEDIA_PUBLIC_BASE_URL` | Media/API | R; exactly `https://${API_WEB_DOMAIN}` | Exact staging mapping plus media validator | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Platform | Startup/media test | DE, SV, DC |
| `ALLOWED_ORIGINS` | APIs | R; exact set `https://${WWW_DOMAIN}`, `https://${APP_DOMAIN}`, `https://${ADMIN_DOMAIN}`, `https://${COUNSELLOR_DOMAIN}`; no whitespace/duplicates/extras | Exact-set validation | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Security | Startup/CORS test | DE, SV, DC |
| `WEB_SESSION_ORIGINS` | Session/CSRF | R; exact set `https://${WWW_DOMAIN}=user`, `https://${APP_DOMAIN}=user`, `https://${COUNSELLOR_DOMAIN}=counsellor`, `https://${ADMIN_DOMAIN}=admin`; no whitespace/duplicates/extras | Exact-set and role validation | Derived from approved domains | Protected production configuration reference - not accessed | Sensitive | Security | Startup/session test | DE, SV, DC |
| `SESSION_COOKIE_DOMAIN` | APIs | U; host-only `__Host-` cookies | Startup failure test | Unset | Approved production unset decision - not accessed | No | Security | Negative preflight | SV |
| `TRUST_PROXY` | APIs | R; derived exactly as `${CADDY_APP_IP}`, never a free-form hop count, `true` or broad private-range trust | Startup/render/network checks | Derived from approved staging network inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/security | Render and spoofing test | DC, ER |
| `NEXT_PUBLIC_API_URL` | Web build output | R; derived at build time: web/counsellor use `FRONTEND_API_WEB_URL`, admin uses `FRONTEND_API_ADMIN_URL`; not separately supplied | Build args and client bundle inspection | Derived only | Reviewed production configuration - not accessed | No | Web/admin | Bundle scan | DC |
| `NEXT_PUBLIC_SOCKET_URL` | User/counsellor web build | R; derived at build time exactly as `FRONTEND_SOCKET_WEB_URL`; not separately supplied | Build args and bundle inspection | Derived only | Reviewed production configuration - not accessed | No | Web/realtime | Bundle scan | DC |
| `NEXT_PUBLIC_CALLS_URL` | User/counsellor web build | R; derived at build time exactly as `LIVEKIT_URL` (`wss://${CALLS_DOMAIN}`); not separately supplied | Build args and bundle inspection | Derived only | Reviewed production configuration - not accessed | No | Web/realtime | Bundle scan and call smoke | DC |

## Staging host, network, storage and data services

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MENORAH_RELEASE_REPO_ROOT` | Production guarded updater provenance only | U for server staging; the dedicated checkout is fixed by `MENORAH_SERVER_STAGING_APP_ROOT` | Absence from `SSENV`; server context assertion | Not used by server staging | Protected production configuration reference - not accessed | Sensitive | Release/infrastructure | Server environment validation | REL |
| `PRODUCTION_ENV` | Production release/backup/restore provenance only | U for server staging; use `MENORAH_SERVER_STAGING_ENV_FILE` | Absence from `SSENV`; server context assertion | Not used by server staging | Protected production configuration reference - not accessed | Sensitive | Release/infrastructure | Server environment validation | REL, REST, BACKUP |
| `CLOUDFLARE_ENV` | Production updater/Tunnel provenance only | U for server staging; ingress is governed by the dedicated server-staging contract | Absence from `SSENV`; server context assertion | Not used by server staging | Protected production configuration reference - not accessed | Sensitive | Release/infrastructure | Server environment validation | REL, TUN |
| `DEPLOY_BRANCH` | Production guarded updater provenance only | U for server staging; documentation review may name the release branch, but server artifacts are bound to the exact runtime SHA | Absence from `SSENV`; exact-SHA server assertion | Not used by server staging | Reviewed production configuration - not accessed | No | Release | Git identity evidence | REL |
| `DEPLOY_RELEASE_SHA` | Production guarded updater provenance only | U for server staging; never set to the later docs/PR-head SHA | Absence from `SSENV`; runtime-SHA pair validates instead | Not used by server staging | Derived immutable artifact/release record - not accessed | No | Release | Server environment/artifact evidence | REL |
| `DEPLOY_MIGRATION_APPROVED_SHA` | Production guarded updater provenance only | U for server staging; dedicated migration is bound to the exact runtime SHA and immutable server image manifest | Absence from `SSENV`; dedicated migration guards | Not used by server staging | Reviewed production configuration - not accessed | No | Release/recovery | Server migration evidence | REL |
| `MENORAH_MIGRATION_IMAGE_ID` | Production one-shot migration provenance only | U for server staging; dedicated server migration consumes the checksum-protected server image manifest | Absence from `SSENV`; dedicated migration guards | Not used by server staging | Approved production unset decision - not accessed | No | Release/recovery | Server image-manifest and migration evidence | MIG |
| `DEPLOY_CHANGE_REFERENCE` | Guarded updater | R; approved bounded staging change reference | Release metadata validation | Approved change record | Protected production configuration reference - not accessed | Sensitive | Release/recovery | Change/release evidence | REL |
| `MENORAH_DEPLOY_STATE_ROOT` | Release/recovery scripts | R; dedicated staging state root beneath approved staging prefix | Canonical path/symlink guard | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure/recovery | Path/mode evidence | REL |
| `MENORAH_DATA_ROOT` | APIs/media/Mongo/Redis/log data | R; dedicated staging data root, no production/shared mount | Canonical path, mount and Compose review | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Mount/volume inventory | DC, PE |
| `MENORAH_BACKUP_ROOT` | Backup/restore/admin read-only status | R; dedicated staging backup root | Canonical path, mount, owner and restore guard | Staging host config | Protected production configuration reference - not accessed | Sensitive | Recovery/infrastructure | Mount/ownership evidence | REST, PE |
| `MENORAH_SECRETS_ROOT` | Protected host files | R; staging-only root outside checkout | Owner/mode/symlink checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure/security | Name/mode evidence only | PE |
| `MENORAH_MEDIA_GROUP_ID` | App/media containers | R; numeric host group dedicated to the protected staging upload mount | Render, group and mount-permission checks | Staging host inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/platform | Numeric group and access evidence | DC, PE |
| `SERVER_USAGE_LABEL` | Admin server-usage view | R/O; staging host label only; must not disclose a production asset name | Render and admin-response review | Approved staging inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/admin | Redacted UI/API evidence | DC, PE |
| `SERVER_USAGE_PATH` | Admin server-usage view | R/O; exact in-container staging storage path, normally `/app/uploads` | Render, canonical-path and mount checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure/admin | Render/mount evidence | DC, PE |
| `MONGO_KEYFILE_PATH` | MongoDB | R for managed replica set; protected staging file | Name/mode/startup check | Secret-file reference only | Protected production secret-manager/file reference - not accessed | Yes | Data platform | Permission/auth evidence | DC, PE |
| `COMPOSE_PROJECT_NAME` | Docker Compose | R by this plan; unique approved staging project | Rendered model/label check | Staging change record | Reviewed production configuration - not accessed | No | Infrastructure | Project/label evidence | DC |
| `TUNNEL_INGRESS_SUBNET` | Compose network | R; staging-only non-overlapping subnet | Host route and render checks | Approved network inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Route/IPAM evidence | DC, PE |
| `CADDY_TUNNEL_IP` | Caddy/tunnel network | R; unique address inside staging tunnel subnet | Render/network check | Approved network inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Network evidence | DC, PE |
| `CLOUDFLARED_TUNNEL_IP` | cloudflared | R; unique address inside staging tunnel subnet | Render/network check | Approved network inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Network evidence | DC, PE |
| `APP_NETWORK_SUBNET` | Application network | R; staging-only, non-overlapping | Host route and render checks | Approved network inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Route/IPAM evidence | DC, PE |
| `CADDY_APP_IP` | Caddy/application trust | R; unique address inside staging app subnet | Render/startup validation | Approved network inventory | Protected production configuration reference - not accessed | Sensitive | Infrastructure/security | Network/proxy evidence | DC, PE |
| `CLOUDFLARE_TUNNEL_TOKEN_FILE` | Server-staging | U; legacy token-file deployment mode is not part of the dedicated overlay | Dedicated validator and dry-render review | Unset | Protected production secret-manager/file reference - not accessed | Sensitive; contents Yes | Infrastructure/vendor | Unset proof | SSENV, SSVAL |
| `CLOUDFLARE_TUNNEL_CREDENTIAL_FILE` | Approved external staging Tunnel process | C; exactly `/opt/menorah-staging/env/cloudflared-staging-credentials.json` when `MENORAH_STAGING_TUNNEL_ENABLED=true`; staging credential only | Canonical non-symlink protected file plus exact Tunnel ID/account/route review | Protected staging credential-file reference only | Protected production secret-manager/file reference - not accessed | Yes | Infrastructure/vendor | Name/mode/owner and redacted staging account/route proof | SSENV, SSING, SSVAL |
| `CLOUDFLARE_ORIGIN_CERT_PATH` | Caddy | C; staging certificate host path | Path/permission and Caddy validation | Protected file reference | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Name/mode/cert metadata | DC, PE |
| `CLOUDFLARE_ORIGIN_KEY_PATH` | Caddy | C; matching protected staging private-key path | Path/permission and Caddy validation | Protected file reference | Protected production secret-manager/file reference - not accessed | Yes | Infrastructure | Name/mode only | DC, PE |
| `CLOUDFLARE_ORIGIN_CERT_FILE` | Caddy container | C; when origin-certificate TLS is enabled, derived as the reviewed in-container certificate mount path; otherwise U | Render/Caddy validation | Derived only | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Render evidence | DC, PE |
| `CLOUDFLARE_ORIGIN_KEY_FILE` | Caddy container | C; when origin-certificate TLS is enabled, derived as the matching reviewed in-container key mount path; otherwise U | Render/Caddy validation | Derived only | Protected production secret-manager/file reference - not accessed | Yes | Infrastructure | Render evidence | DC, PE |
| `CADDY_HTTP_PORT` | Caddy host listener | R; loopback-only staging endpoint | Render and listener inventory | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `LANDING_LOCAL_PORT` | Landing | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `USER_WEB_APP_LOCAL_PORT` | User web | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `WEB_APP_LOCAL_PORT` | Counsellor web | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `ADMIN_PANEL_LOCAL_PORT` | Admin web | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `API_IOS_LOCAL_PORT` | iOS API | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `API_ANDROID_LOCAL_PORT` | Android API | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `API_WEB_LOCAL_PORT` | Web API | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `API_ADMIN_LOCAL_PORT` | Admin API | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `WORKER_LOCAL_PORT` | Worker readiness | R/O; loopback only, unique | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `MONGO_ROOT_USER` | Mongo bootstrap | R | Managed identity validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data platform | Authentication/role evidence | DC, PE |
| `MONGO_ROOT_PASSWORD` | Mongo bootstrap | R | Managed identity validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data platform | Authentication evidence | DC, PE |
| `MONGO_APP_USER` | APIs/worker | R; separate app identity | Managed identity/role validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data platform | Exact-role evidence | DC, PE |
| `MONGO_APP_PASSWORD` | APIs/worker | R | Authentication validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data platform | Authentication evidence | DC, PE |
| `MONGO_BACKUP_USER` | Backup | R; separate backup identity | Managed identity/role validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/data | Exact-role evidence | DC, PE |
| `MONGO_BACKUP_PASSWORD` | Backup | R | Authentication validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/data | Authentication evidence | DC, PE |
| `MONGO_RESTORE_USER` | Coordinated restore | R; separate restore identity | Managed identity/role validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/data | Exact-role evidence | DC, PE |
| `MONGO_RESTORE_PASSWORD` | Coordinated restore | R | Authentication validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/data | Authentication evidence | DC, PE |
| `MONGO_MONITOR_USER` | Mongo exporter | R; least-privilege monitor identity | Managed identity/role validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data/infrastructure | Exact-role evidence | DC, PE |
| `MONGO_MONITOR_PASSWORD` | Mongo exporter | R | Authentication validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data/infrastructure | Authentication evidence | DC, PE |
| `MONGODB_URI` | APIs/worker | R; staging replica set, app DB and app identity only | Startup/connectivity/target attestation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data platform | Redacted target/role evidence | SV, DC, PE |
| `MONGODB_BACKUP_URI` | Backup runner | R; empty database path, admin auth source and staging replica set | Backup URI validator | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/data | Redacted target/role evidence | BACKUP, PE |
| `MONGODB_PRODUCTION_RESTORE_URI` | Destructive staging recovery rehearsal | R for rehearsal; independently bound to the synthetic operational staging replica set, never production | Restore URI/host/project/replica attestation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/data | Two-person target proof | REST, PE |
| `MONGODB_RESTORE_TEST_URI` | Disposable restore test | R; exact fixed no-auth restore-test URI required by script | Exact literal check and isolated Compose labels | Staging protected config | Protected production configuration reference - not accessed | Sensitive | Recovery | Restore-test target/cleanup | REST, PE |
| `MONGODB_MONITORING_URI` | Mongo exporter | R; staging monitor identity only | Exporter/role validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data/infrastructure | Exporter/role evidence | DC, PE |
| `MONGODB_REPLICA_SET_NAME` | Mongo/services/tools | R; exact staging replica-set name shared by all URIs | URI/replica status validation | Staging data inventory | Protected production configuration reference - not accessed | Sensitive | Data platform | Replica identity | REST, DC, PE |
| `MONGO_PRIMARY_HOST` | Mongo replica initialization | R; exactly the isolated Compose member `mongo-primary:27017` | Render and replica-member identity check | Staging data inventory | Protected production configuration reference - not accessed | Sensitive | Data platform | Replica configuration evidence | DC |
| `MONGO_DATABASE` | Landing/user web server-side data | R/O; approved synthetic staging database name matching the application URI | Render and target attestation | Staging data inventory | Protected production configuration reference - not accessed | Sensitive | Data platform/web | Redacted target evidence | DC |
| `MONGODB_READ_PREFERENCE` | APIs/worker | R; reviewed behavior | Startup/integration tests | Staging config | Reviewed production configuration - not accessed | No | Data platform | Config/test evidence | DC, PE |
| `MONGODB_RETRY_WRITES` | APIs/worker | R; compatible with staging replica set | Startup/integration/race tests | Staging config | Reviewed production configuration - not accessed | No | Data platform | Config/test evidence | DC, PE |
| `REDIS_URL` | APIs/worker | R; dedicated staging Redis | Startup/connectivity/target check | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data platform | Redacted target evidence | SV, DC, PE |
| `REDIS_MONITORING_URL` | Redis exporter | R/C; staging read-only ACL where auth supported | Exporter/ACL validation | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Data/infrastructure | ACL/exporter evidence | DC, PE |

## Application, security, privacy and provider variables

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `JWT_SECRET` | APIs | R; strong non-placeholder staging key | Startup negative/positive tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Security | Validator result | SV, PE |
| `JWT_REFRESH_SECRET` | APIs | R; strong, distinct staging key | Startup/session tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Security | Validator result | SV, PE |
| `JWT_ISSUER` | APIs | R; reviewed staging issuer contract | Token tests | Staging config | Protected production configuration reference - not accessed | Sensitive | Security | Token evidence | PE, ER |
| `JWT_EXPIRES_IN` | APIs | R; approved bounded duration | Startup/session tests | Staging config | Reviewed production configuration - not accessed | No | Security/owner | Test evidence | SV, PE |
| `JWT_REFRESH_EXPIRES_IN` | APIs | R; approved bounded duration | Startup/session tests | Staging config | Reviewed production configuration - not accessed | No | Security/owner | Test evidence | SV, PE |
| `ADMIN_JWT_EXPIRES_IN` | Admin API | R; no more than 30 minutes | Startup/session tests | Staging config | Reviewed production configuration - not accessed | No | Security | Validator evidence | SV, PE |
| `ADMIN_MFA_REQUIRED` | Admin API | R; exactly `true` | Startup/MFA tests | Staging config | Reviewed production configuration - not accessed | No | Security/owner | Validator/MFA evidence | SV, PE |
| `ADMIN_BOOTSTRAP_EMAIL` | Blocked legacy admin bootstrap input | U; candidate `create-admin.js` is not staging-safe and must not run; any replacement requires separate authorization, exact staging-database/domain binding and refusal to mutate an existing account | Protected environment absence plus separately reviewed replacement design; generic email syntax is insufficient | Approved unset decision | Approved production unset decision - not accessed | Sensitive | Owner/security | Absence/blocker record; no address | PE |
| `ADMIN_BOOTSTRAP_PASSWORD` | Blocked legacy admin bootstrap input | U; do not provision a candidate-harness credential; any replacement uses a unique protected secret with approved policy | Protected environment absence and secret-manager name-only review for any future replacement | Approved unset decision | Approved production unset decision - not accessed | Yes | Owner/security | Absence/blocker record; no value | PE |
| `ADMIN_BOOTSTRAP_CONFIRM` | Blocked legacy admin bootstrap input | U; literal `create-admin` is not approval and must not be set for staging | Protected environment absence; separately authorized replacement must use its own fail-closed confirmation | Approved unset decision | Approved production unset decision - not accessed | No | Owner/security | Absence/blocker record | PE |
| `ENABLE_SOCKET_IO` | APIs | R; exact reviewed boolean; enabled only for the intended user-facing API services | Render and socket integration tests | Staging config | Reviewed production configuration - not accessed | No | Backend/realtime | Render/socket evidence | DC, PE |
| `ENABLE_SOCKET_ADAPTER` | APIs | R; exact reviewed boolean aligned with socket service mode | Render and cross-instance socket tests | Staging config | Reviewed production configuration - not accessed | No | Backend/realtime | Render/socket evidence | DC, PE |
| `WORKER_MODE` | Worker/APIs | R; `active` only on the dedicated worker and standby/overridden elsewhere | Render and worker-job inventory | Staging config | Reviewed production configuration - not accessed | No | Backend/platform | Render/job evidence | DC, PE |
| `ENABLE_ARTICLE_SCHEDULER` | Worker | R; explicit boolean; enabled only once on the active worker | Worker-job inventory and duplicate-execution test | Staging config | Reviewed production configuration - not accessed | No | Backend/platform | Job evidence | DC, PE |
| `ENABLE_SOCIAL_SCHEDULER` | Worker | R; explicit boolean; disabled unless current feature/provider plan requires it | Worker-job inventory | Staging config | Reviewed production configuration - not accessed | No | Backend/owner | Job/gate evidence | DC, PE |
| `ENABLE_BACKUP_JOBS` | Worker | R; exactly `false`; host backup automation is authoritative | Render and worker-job inventory | Staging config | Reviewed production configuration - not accessed | No | Recovery/platform | No-duplicate-job evidence | DC, PE |
| `ENABLE_EMAIL_JOBS` | Worker | R; explicit reviewed boolean with a dedicated staging sink | Worker-job inventory and sink test | Staging config | Reviewed production configuration - not accessed | No | Backend/vendor | Job/delivery evidence | DC, PE |
| `ENABLE_NOTIFICATION_JOBS` | Worker | R; explicit reviewed boolean with staging-only destinations | Worker-job inventory and destination test | Staging config | Reviewed production configuration - not accessed | No | Backend/vendor | Job/delivery evidence | DC, PE |
| `DATA_ENCRYPTION_KEY` | APIs/worker | R; strong, non-placeholder and distinct | Startup/decrypt/recovery test | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Security | Validator/recovery evidence | SV, PE |
| `AUDIT_LOG_SIGNING_KEY` | APIs/worker | R; strong, non-placeholder and distinct | Startup/audit integrity test | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Security | Audit-chain evidence | SV, PE |
| `SECURITY_AUDIT_PENDING_MAX` | APIs/worker | R/O; bounded queue size | Startup/overflow tests | Staging config | Reviewed production configuration - not accessed | No | Security/platform | Fault-injection evidence | PE, ER |
| `ADMIN_ROLE_GRANTS_JSON` | Admin API | R; synthetic named admins and explicit roles only | Startup/role matrix | Protected staging reference only | Protected production configuration reference - not accessed | Sensitive | Owner/security | Redacted grant/test evidence | SV, PE |
| `PRIVACY_ADMIN_PERMISSION_GRANTS_JSON` | Privacy admin authority | R; explicit synthetic task permissions | Startup/rights tests | Protected staging reference only | Protected production configuration reference - not accessed | Sensitive | Privacy/owner | Redacted grant/test evidence | SV, PE |
| `PRIVACY_NOTICE_VERSION` | Privacy flows | R; approved non-placeholder staging version | Startup/consent test | Approved policy reference | Reviewed production configuration - not accessed | No | Legal/privacy | Approval/test evidence | SV, PE |
| `KYC_CONSENT_VERSION` | KYC/face check | R; approved staging version | Startup/consent test | Approved policy reference | Reviewed production configuration - not accessed | No | Legal/privacy/owner | Approval/test evidence | SV, PE |
| `KYC_RETENTION_DAYS` | KYC/retention | R; approved decimal period | Startup/retention test | Approved policy reference | Reviewed production configuration - not accessed | No | Legal/privacy/owner | Approval/test evidence | SV, PE |
| `PRIVACY_RETENTION_POLICY_JSON` | Privacy worker/admin | R; exact approved categories/modes/references | Startup/schema/hold tests | Protected policy reference only | Protected production configuration reference - not accessed | Sensitive | Legal/privacy/owner | Approval/test evidence | SV, PE |
| `PRIVACY_RETENTION_EXECUTION_ENABLED` | Privacy worker | R; exactly `false` until policy approval and staged execution evidence | Startup/worker tests | Staging config | Reviewed production configuration - not accessed | No | Privacy/owner | Gate evidence | SV, PE |
| `PRIVACY_RETENTION_BATCH_SIZE` | Privacy worker | O; bounded positive integer | Startup/job tests | Staging config | Reviewed production configuration - not accessed | No | Privacy/platform | Test evidence | SV, PE |
| `COUNSELLOR_ONBOARDING_CONSENT_VERSION` | Verification | R; approved version | Startup/lifecycle tests | Approved policy reference | Reviewed production configuration - not accessed | No | Legal/clinical/owner | Approval/test evidence | SV, PE |
| `COUNSELLOR_CREDENTIAL_POLICY_VERSION` | Verification | R; approved version | Startup/lifecycle tests | Approved policy reference | Reviewed production configuration - not accessed | No | Legal/clinical/owner | Approval/test evidence | SV, PE |
| `COUNSELLOR_ONBOARDING_NOTICE_URL` | Verification UI/API | R; approved staging HTTPS notice | Startup/link tests | Approved policy reference | Protected production configuration reference - not accessed | Sensitive | Legal/clinical | Approval/link evidence | SV, PE |
| `BOOKING_SERVICE_CATALOG_JSON` | Four APIs, worker, migration and seed | R; approved synthetic INR catalog; shared non-secret configuration across exactly these seven backend services | Parser, render and pricing/tamper tests | Reviewed non-secret staging config | Protected production configuration reference - not accessed | No | Product/payment | Catalog version/test evidence | SSENV, SSCOMPOSE, SSVAL, SV, PE |
| `BOOKING_PAYMENTS_ENABLED` | Payment APIs | R; explicit owner-controlled staging gate | Startup/payment tests | Staging config | Reviewed production configuration - not accessed | No | Payment/owner | Gate and sandbox evidence | SV, PE |
| `SUBSCRIPTION_PAYMENTS_ENABLED` | APIs | R; exactly `false` under current contract | Startup failure test | Staging config | Reviewed production configuration - not accessed | No | Payment/owner | Validator evidence | SV, PE |
| `PAYOUTS_ENABLED` | Admin/payout | R; false until sandbox/owner gates complete, then controlled staging-only enablement | Startup/payout matrix | Staging config | Reviewed production configuration - not accessed | No | Finance/owner | Change and test evidence | SV, PE |
| `MAX_PAYOUT_AMOUNT_PAISE` | Admin/payout | R; exact approved integer | Startup/cap tests | Approved non-secret config | Reviewed production configuration - not accessed | No | Finance/owner | Approval/test evidence | SV, PE |
| `PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS` | Payment reconciliation | R when booking payments enabled; bounded integer | Startup/retry tests | Approved staging config | Reviewed production configuration - not accessed | No | Payment owner | Validator/retry evidence | SV, PE |
| `RAZORPAY_KEY_ID` | `staging-api-ios` only | R when payment cases run; must match staging `rzp_test_` pattern | Staging isolation/startup/provider-scope checks | Staging sandbox reference only | Protected production configuration reference - not accessed | Sensitive | Vendor/payment | Test-mode and rendered-scope proof | SSCOMPOSE, SSVAL, DE, SV, PE |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `staging-user-web` build/runtime only | R when checkout UI is tested; public test key only and `rzp_test_` pattern | Staging isolation and bundle/render scan | Staging sandbox public-ID reference | Reviewed production configuration - not accessed | No | Vendor/payment | Bundle/test-mode proof | SSCOMPOSE, SSVAL, DE, DC |
| `RAZORPAY_KEY_SECRET` | `staging-api-ios` only | R when enabled; sandbox secret only | Startup/sandbox call and rendered-scope rejection | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/payment | Presence/provider-scope evidence | SSCOMPOSE, SSVAL, SV, PE |
| `RAZORPAY_WEBHOOK_SECRET` | `staging-api-ios` only | R; staging callback secret only | Signature matrix and rendered-scope rejection | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/security | Webhook/scope evidence | SSCOMPOSE, SSVAL, SV, PE |
| `RAZORPAY_WEBHOOK_SECRET_PREVIOUS` | `staging-api-ios` only | C; unset except approved staging overlap; distinct from current | Startup/rotation and rendered-scope tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/security | Rotation/scope evidence | SSCOMPOSE, SSVAL, SV, PE |
| `RAZORPAY_X_KEY_ID` | `staging-api-admin` only | C; must match staging `rzp_test_` pattern if set | Staging isolation/startup and rendered-scope checks | Staging sandbox reference only | Protected production configuration reference - not accessed | Sensitive | Vendor/finance | Test-mode/scope proof | SSCOMPOSE, SSVAL, DE, SV, PE |
| `RAZORPAY_X_KEY_SECRET` | `staging-api-admin` only | C; sandbox only | Startup/payout and rendered-scope tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/finance | Provider-scope evidence | SSCOMPOSE, SSVAL, SV, PE |
| `RAZORPAY_PAYOUT_ACCOUNT_NUMBER` | `staging-api-admin` only | C; synthetic sandbox destination only | Startup/payout and rendered-scope tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/finance | Sandbox/scope proof | SSCOMPOSE, SSVAL, SV, PE |
| `RAZORPAY_X_WEBHOOK_SECRET` | `staging-api-admin` only | R for delayed/sandbox webhook cases | Signature/replay and rendered-scope tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/security | Webhook/scope evidence | SSCOMPOSE, SSVAL, SV, PE |
| `RESEND_API_KEY` | Four APIs and `staging-user-web` | R under current startup contract; dedicated staging account/scope | Startup, approved-sink and rendered-scope tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/platform | Sandbox/account/scope proof | SSCOMPOSE, SSVAL, SV, PE |
| `RESEND_WEBHOOK_SECRET` | `staging-api-web` only | R when the Resend webhook path is exercised; dedicated staging signing secret | Signature/replay and rendered-scope tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/security | Webhook/scope evidence | SSCOMPOSE, SSVAL, SV, PE |
| `EMAIL_FROM` | Email | R; valid sender whose address domain exactly equals `MENORAH_STAGING_EMAIL_DOMAIN`; display name is allowed, fallback is forbidden | Staging isolation/startup and controlled-sink tests | Approved staging sender reference | Protected production configuration reference - not accessed | Sensitive | Vendor/platform/security | Redacted sender-domain and delivery evidence | DE, SV, DC |
| `CONTACT_TO_EMAIL` | Landing/user web contact form | R; bare address only and its domain must exactly equal `MENORAH_STAGING_EMAIL_DOMAIN`; fallback and production/shared mailboxes are forbidden | Staging isolation, render and controlled delivery test | Protected staging contact reference | Protected production configuration reference - not accessed | Sensitive | Vendor/platform/security | Redacted recipient-domain and delivery evidence | DE, SV, DC |
| `LIVEKIT_API_KEY` | Calls | R under current startup contract; staging project/server only | Startup/token/call tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Realtime/vendor | Project/token evidence | SV, PE |
| `LIVEKIT_API_SECRET` | Calls | R; matching staging secret | Startup/token/call tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Realtime/vendor | Project/token evidence | SV, PE |
| `LIVEKIT_CONFIG_FILE` | Self-hosted LiveKit | C/R; protected staging config path | File mode/startup test | Protected file reference | Protected production configuration reference - not accessed | Sensitive | Realtime/infrastructure | Name/mode evidence | PE, ER |
| `LIVEKIT_NODE_IP` | LiveKit | C; staging node address only | Network/media tests | Staging network inventory | Protected production configuration reference - not accessed | Sensitive | Realtime/infrastructure | Network evidence | PE, ER |
| `LIVEKIT_RTC_TCP_PORT` | LiveKit | R/C; approved staging listener | Firewall/media tests | Staging config | Protected production configuration reference - not accessed | Sensitive | Realtime/infrastructure | Listener/media evidence | PE, ER |
| `LIVEKIT_RTC_UDP_PORT_RANGE` | LiveKit | R/C; approved staging range | Firewall/media tests | Staging config | Protected production configuration reference - not accessed | Sensitive | Realtime/infrastructure | Listener/media evidence | PE, ER |
| `CALLING_REGION_MODE` | Call routing | R; approved staging mode | Startup/region tests | Approved config | Reviewed production configuration - not accessed | No | Owner/legal/realtime | Decision/test evidence | PE, ER |
| `LIVEKIT_BLOCKED_COUNTRIES` | Call routing | R; approved list | Region tests | Approved config | Reviewed production configuration - not accessed | No | Owner/legal/realtime | Decision/test evidence | PE, ER |
| `CALL_JOIN_EARLY_MINUTES` | Booking call authorization | R; approved bounded integer, currently referenced as 15 minutes | Authorization boundary tests | Approved staging config | Reviewed production configuration - not accessed | No | Product/clinical/realtime | Boundary-test evidence | DC, PE |
| `CALL_JOIN_LATE_GRACE_MINUTES` | Booking call authorization | R; approved bounded integer, currently referenced as 15 minutes | Authorization boundary tests | Approved staging config | Reviewed production configuration - not accessed | No | Product/clinical/realtime | Boundary-test evidence | DC, PE |
| `VIDEO_MEET_TICKET_TTL_SECONDS` | Call join ticket | R; integer clamped by code to 30–300 seconds, currently referenced as 120 | Token expiry/replay tests | Approved staging config | Reviewed production configuration - not accessed | No | Security/realtime | Expiry/replay evidence | DC, PE |
| `BLOCK_LIVEKIT_FOR_UAE` | Call routing | R; explicit boolean | Region tests | Approved config | Reviewed production configuration - not accessed | No | Owner/legal/realtime | Decision/test evidence | PE, ER |
| `BLOCK_LIVEKIT_FOR_UNKNOWN_REGION` | Call routing | R; explicit boolean | Region tests | Approved config | Reviewed production configuration - not accessed | No | Owner/legal/realtime | Decision/test evidence | PE, ER |
| `BLOCKED_COUNTRY_CALL_PROVIDER` | Call fallback | C; enabled staging provider only | Region/fallback tests | Approved config | Reviewed production configuration - not accessed | No | Owner/legal/vendor | Decision/test evidence | PE, ER |
| `UAE_CALL_PROVIDER` | Call fallback | C; enabled staging provider only | Region/fallback tests | Approved config | Reviewed production configuration - not accessed | No | Owner/legal/vendor | Decision/test evidence | PE, ER |
| `UAE_CALLING_ENABLED` | Calls | R; explicit boolean | Region tests | Approved config | Reviewed production configuration - not accessed | No | Owner/legal/clinical | Decision/test evidence | PE, ER |
| `VSEE_ENABLED` | Optional calls | R; false unless provider pack complete | Startup/route tests | Staging config | Reviewed production configuration - not accessed | No | Vendor/owner | Gate evidence | PE, ER |
| `VSEE_INTEGRATION_MODE` | Optional calls | C if enabled | Route/failure tests | Approved staging config | Reviewed production configuration - not accessed | No | Vendor/owner | Test evidence | PE, ER |
| `DOXY_ENABLED` | Optional calls | R; false unless provider pack complete | Startup/route tests | Staging config | Reviewed production configuration - not accessed | No | Vendor/owner | Gate evidence | PE, ER |
| `ZOOM_ENABLED` | Optional calls | R; false unless provider pack complete, or approved staging account | Route/failure tests | Staging config | Reviewed production configuration - not accessed | No | Vendor/owner | Gate evidence | PE, ER |
| `GOOGLE_MEET_ENABLED` | Optional calls | R; false unless provider pack complete | Route/failure tests | Staging config | Reviewed production configuration - not accessed | No | Vendor/owner | Gate evidence | PE, ER |
| `TEAMS_ENABLED` | Optional calls | R; false unless provider pack complete | Route/failure tests | Staging config | Reviewed production configuration - not accessed | No | Vendor/owner | Gate evidence | PE, ER |
| `LUXAND_API_TOKEN` | Face check | C; sandbox only; unset unless legal/privacy/clinical/vendor gates complete | Startup/provider/consent tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/privacy/clinical | Approval/sandbox evidence | PE, ER |
| `OPENAI_API_KEY` | Optional AI | C; unset unless complete vendor/data-purpose approval | Feature/provider tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/privacy/owner | Approval evidence | PE, ER |
| `CLOUDINARY_CLOUD_NAME` | Optional legacy media | C; staging account only | Media/provider tests | Staging reference only | Protected production configuration reference - not accessed | Sensitive | Vendor/platform | Account evidence | PE, ER |
| `CLOUDINARY_API_KEY` | Optional legacy media | C; staging account only | Media/provider tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/platform | Account evidence | PE, ER |
| `CLOUDINARY_API_SECRET` | Optional legacy media | C; staging account only | Media/provider tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Vendor/platform | Account evidence | PE, ER |
| `MEDIA_STORAGE_BACKEND` | APIs/worker | R; `local` under current hardened contract | Startup/media validation | Staging config | Reviewed production configuration - not accessed | No | Platform | Validator/media evidence | SV, DC, PE |
| `UPLOAD_PATH` | APIs/worker | R; `/app/uploads` inside container | Startup/media validation | Staging config | Protected production configuration reference - not accessed | Sensitive | Platform | Render/media evidence | SV, DC, PE |
| `SOCIAL_STUDIO_STORAGE` | APIs | U | Startup failure test | Unset | Approved production unset decision - not accessed | No | Platform/security | Negative preflight | SV |
| `COUNSELLOR_MEDIA_STORAGE` | APIs | U | Startup failure test | Unset | Approved production unset decision - not accessed | No | Platform/security | Negative preflight | SV |

Rendered scope is part of the contract: Razorpay secrets appear only on
`staging-api-ios`, RazorpayX secrets only on `staging-api-admin`, and
`RESEND_WEBHOOK_SECRET` only on `staging-api-web`. `staging-worker`,
`staging-migrate` and `staging-seed` receive no provider secrets. This boundary
must be proved from the rendered model, not merely from blank template values.

## Apple and Google modes

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `APPLE_SIGN_IN_ENABLED` | `api-ios`, worker | R; exactly `false` to disable, or `true` only with the complete staging Apple configuration below | Startup Apple-mode validator | Approved staging config | Reviewed production configuration - not accessed | No | Apple/platform | Mode/startup evidence | SV, DC, PE |
| `APPLE_IOS_BUNDLE_ID` | `api-ios`, worker | C when staging Apple mode is true; valid bundle identifier matching the signed preview client | Startup Apple validator | Approved Apple app reference | Protected production configuration reference - not accessed | Sensitive | `APPLE ACTION` | App/config evidence | SV, DC, PE |
| `APPLE_TEAM_ID` | `api-ios`, worker | C when Apple mode is true; valid 10-character identifier | Startup Apple validator | Staging secret/account reference only | Protected production configuration reference - not accessed | Sensitive | `APPLE ACTION` | Account reference | SV, DC, PE |
| `APPLE_KEY_ID` | `api-ios`, worker | C when Apple mode is true; valid 10-character identifier | Startup Apple validator | Staging secret/account reference only | Protected production configuration reference - not accessed | Sensitive | `APPLE ACTION` | Account reference | SV, DC, PE |
| `APPLE_PRIVATE_KEY` | `api-ios`, worker | C when Apple mode is true; PKCS#8 private key | Startup Apple validator | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | `APPLE ACTION` | Presence/startup evidence | SV, DC, PE |
| `APPLE_WEB_SERVICE_ID` | Future web Apple flow | O; unset unless implemented and approved | Provider/config review | Approved reference only | Protected production configuration reference - not accessed | Sensitive | `APPLE ACTION` | Feature evidence | PE, ER |
| `GOOGLE_WEB_CLIENT_ID` | Backend/social auth | C; staging-approved OAuth client | Auth/provider tests | Staging account reference only | Protected production configuration reference - not accessed | Sensitive | Google/vendor | OAuth evidence | DC, PE |
| `GOOGLE_IOS_CLIENT_ID` | Backend/mobile | C; staging-approved iOS OAuth client | Auth/mobile tests | Staging account reference only | Protected production configuration reference - not accessed | Sensitive | Google/vendor | OAuth evidence | DC, PE |
| `GOOGLE_ANDROID_CLIENT_ID` | Backend/mobile | C; staging-approved Android OAuth client | Auth/mobile tests | Staging account reference only | Protected production configuration reference - not accessed | Sensitive | Google/vendor | OAuth evidence | DC, PE |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Web builds | C; public staging web OAuth client; if set, it must match the approved backend web client | Build args, bundle scan and OAuth test | Staging account public-ID reference | Reviewed production configuration - not accessed | No | `GOOGLE ACTION` | Bundle/OAuth evidence | DC, PE |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Mobile preview | C/R when Google sign-in tested; approved OAuth-client-ID format | Mobile validator/auth test | EAS preview reference only | Reviewed production configuration - not accessed | No | `GOOGLE ACTION` | Resolved build config | MR, AC |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Mobile preview | C/R for iOS Google sign-in | App config/auth test | EAS preview reference only | Reviewed production configuration - not accessed | No | `GOOGLE ACTION` | Resolved build config | AC |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Mobile preview/Android release | C/R for Android Google sign-in; workflow validates format for release | Mobile/release validator | EAS/environment reference only | Reviewed production configuration - not accessed | No | `GOOGLE ACTION` | Resolved build config | MR, AC, ANDROID |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | Mobile preview | O; derived from iOS client ID when unset, otherwise exact approved scheme | App config/device login | EAS preview reference only | Reviewed production configuration - not accessed | No | `GOOGLE ACTION` | Resolved build config | AC |

When `APPLE_SIGN_IN_ENABLED=false`, Apple staging cases are `BLOCKED`, not
passed. The Android/web/admin API services are forced to Apple mode `false` by
Compose regardless of the operator value.

## Mobile preview environment and five release URLs

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MENORAH_MOBILE_ENVIRONMENT` | EAS preview builds | R; exactly `preview` | Release-environment validator/profile resolution | EAS `preview` environment | Reviewed production configuration - not accessed | No | Mobile | Resolved profile evidence | MR, EAS |
| `MENORAH_MOBILE_ALLOWED_HOSTS` | EAS preview builds | R; exact reviewed set of the four unique hosts used by the five URLs: `${API_IOS_DOMAIN}`, `${API_ANDROID_DOMAIN}`, `${APP_DOMAIN}`, `${CALLS_DOMAIN}`; each contains `preview`, `staging` or `security-test` as a full token | Mobile allowlist validator | EAS preview environment | Protected production configuration reference - not accessed | Sensitive | Mobile/infrastructure | Redacted set and validator | MR |
| `EXPO_PUBLIC_IOS_API_BASE_URL` | Mobile preview | R; exactly `https://${API_IOS_DOMAIN}/api` | Mobile release validator | EAS preview environment | Reviewed production configuration - not accessed | No | Mobile | Resolved config/device evidence | MR, AC |
| `EXPO_PUBLIC_ANDROID_API_BASE_URL` | Mobile preview | R; exactly `https://${API_ANDROID_DOMAIN}/api` | Mobile release validator | EAS preview environment | Reviewed production configuration - not accessed | No | Mobile | Resolved config/device evidence | MR, AC |
| `EXPO_PUBLIC_WEB_BASE_URL` | Mobile preview | R; exactly `https://${APP_DOMAIN}` | Mobile release validator | EAS preview environment | Reviewed production configuration - not accessed | No | Mobile | Resolved config/device evidence | MR, AC |
| `EXPO_PUBLIC_CHECKOUT_RETURN_URL` | Mobile preview | R; exactly `https://${APP_DOMAIN}/checkout/return` | Mobile release validator | EAS preview environment | Reviewed production configuration - not accessed | No | Mobile/payment | Resolved config/device evidence | MR, AC |
| `EXPO_PUBLIC_JITSI_BASE_URL` | Mobile preview | R; exactly `https://${CALLS_DOMAIN}` for this staging plan | Mobile release validator | EAS preview environment | Reviewed production configuration - not accessed | No | Mobile/realtime | Resolved config/device evidence | MR, AC |
| `EXPO_PUBLIC_API_BASE_URL` | Mobile preview | U; development-only override must not replace platform release URLs | Resolved app config inspection | Unset | Approved production unset decision - not accessed | No | Mobile | Build config evidence | AC |
| `EXPO_PUBLIC_LOCAL_IP` | Mobile preview | U; development-only | Resolved app config inspection | Unset | Approved production unset decision - not accessed | No | Mobile | Build config evidence | AC |
| `PUBLIC_WEB_BASE_URL` | Mobile preview | U; use the required Expo release variable | Resolved app config inspection | Unset | Approved production unset decision - not accessed | No | Mobile | Build config evidence | AC |

## QA, Playwright and DAST variables

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `QA_TARGET_ENVIRONMENT` | API/auth/Playwright smoke | R; exactly `staging` | Smoke safety validator | Test-process config | Reviewed production configuration - not accessed | No | QA | Command/output | SM |
| `QA_STAGING_ALLOWED_HOSTS` | API/auth/Playwright smoke | R; reviewed set containing every QA target host; no production host; each contains `staging` or `security-test` token | Smoke safety validator | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/security | Redacted allowlist/result | SM |
| `QA_SYNTHETIC_DATA_CONFIRM` | API/auth/admin smoke | R when credentials/data used; exactly `PROJECT_OWNED_SYNTHETIC_DATA_ONLY` | Smoke safety validator | Test-process config | Reviewed production configuration - not accessed | No | QA/privacy | Command/output | SM |
| `QA_ALLOW_PRODUCTION_SMOKE` | Staging QA | U; production confirmation must never be set | Operator/env review | Unset | Approved production unset decision - not accessed | No | QA/security | Preflight evidence | SM |
| `QA_PRODUCTION_CHANGE_REFERENCE` | Staging QA | U; production-only | Operator/env review | Unset | Approved production unset decision - not accessed | Sensitive | QA/security | Preflight evidence | SM |
| `QA_API_WEB_URL` | API smoke | R; exact origin `https://${API_WEB_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/backend | API smoke output | SM, API |
| `QA_API_IOS_URL` | API smoke | R; exact origin `https://${API_IOS_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/backend | API smoke output | SM, API |
| `QA_API_ANDROID_URL` | API smoke | R; exact origin `https://${API_ANDROID_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/backend | API smoke output | SM, API |
| `QA_API_ADMIN_URL` | API smoke | R; exact origin `https://${API_ADMIN_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/backend | API smoke output | SM, API |
| `QA_API_BASE` | Auth smoke | R; exactly `https://${API_WEB_DOMAIN}/api` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/auth | Auth smoke output | SM, AUTH |
| `QA_WWW_URL` | Playwright | R; exact origin `https://${WWW_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/web | Playwright output | SM, PW |
| `QA_APP_URL` | Playwright | R; exact origin `https://${APP_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/web | Playwright output | SM, PW |
| `QA_ADMIN_URL` | Playwright | R; exact origin `https://${ADMIN_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/admin | Playwright output | SM, PW |
| `QA_COUNSELLOR_WEB_URL` | Playwright | R; exact origin `https://${COUNSELLOR_DOMAIN}` | Smoke target allowlist | Approved staging DNS inventory | Protected production configuration reference - not accessed | Sensitive | QA/web | Playwright output | SM, PW |
| `QA_EMAIL` | API/auth smoke | R; project-owned synthetic inbox whose domain exactly equals `MENORAH_STAGING_EMAIL_DOMAIN` | Email format, exact domain and synthetic-data confirmation | Staging secret/test-data reference | Protected production configuration reference - not accessed | Sensitive | QA/privacy/security | Redacted alias/domain/result | SM, API, AUTH, MAIL |
| `QA_PASSWORD` | Auth smoke | R | Presence only; never printed | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | QA | Auth output | AUTH |
| `QA_PHONE` | Auth smoke | R; explicit synthetic E.164 number | Auth runner validation | Staging test-data reference | Protected production configuration reference - not accessed | Sensitive | QA/privacy | Redacted alias/result | AUTH |
| `QA_OTP` | Auth smoke second pass | C; short-lived approved-inbox OTP; first pass without it must exit blocked | Auth runner behavior | Ephemeral operator input | Protected production secret-manager/file reference - not accessed | Yes | QA | Redacted second-pass result | AUTH |
| `QA_WRONG_PASSWORD` | API smoke | O; synthetic value or safe generated default | Runner redaction | Ephemeral test input | Protected production secret-manager/file reference - not accessed | Yes | QA | API output | API |
| `QA_ADMIN_EMAIL` | API/Playwright admin smoke | C; synthetic admin only, exact `MENORAH_STAGING_EMAIL_DOMAIN`, and paired with password | Smoke synthetic credential and staging-domain validator | Staging secret reference only | Protected production configuration reference - not accessed | Sensitive | QA/security | Redacted admin-domain/result | SM, API, PW, MAIL |
| `QA_ADMIN_PASSWORD` | API/Playwright admin smoke | C; required with admin email | Smoke synthetic credential validator | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | QA/security | Redacted admin result | SM, API, PW |
| `CI` | Playwright | O; enables one retry in CI; does not change target safety | Playwright config | CI runtime | Reviewed production configuration - not accessed | No | QA | Test metadata | PW |
| `DAST_TARGET_URL` | GitHub DAST | R once environment exists; exact HTTPS API-web origin with no path/port/query/fragment, staging/security-test token, and allowlist membership | Workflow target validator and readiness attestation | `staging-security` environment variable | Protected production configuration reference - not accessed | Sensitive | Security/infrastructure | Run logs/target attestation | DAST |
| `DAST_TRUSTED_ORIGIN` | GitHub DAST login/logout | R; exact HTTPS app origin with same restrictions and allowlist membership | Workflow target validator | `staging-security` environment variable | Protected production configuration reference - not accessed | Sensitive | Security/infrastructure | Run logs | DAST |
| `DAST_ALLOWED_HOSTS` | GitHub DAST | R; reviewed comma-separated DAST target/origin hosts only, each with staging/security-test token | Workflow exact safety checks | `staging-security` environment variable | Protected production configuration reference - not accessed | Sensitive | Security/infrastructure | Redacted environment review | DAST |
| `DAST_EMAIL` | GitHub DAST | R; synthetic user whose domain exactly equals `MENORAH_STAGING_EMAIL_DOMAIN` for the deployed target | Protected-environment review and authenticated login | `staging-security` secret reference | Protected production configuration reference - not accessed | Sensitive | Security/QA | Redacted domain/run result | DAST, MAIL |
| `DAST_PASSWORD` | GitHub DAST | R | Environment secret presence | `staging-security` secret reference | Protected production secret-manager/file reference - not accessed | Yes | Security/QA | Redacted run result | DAST |

The `staging-security` GitHub environment is currently absent, so every DAST
row is `BLOCKED / EXTERNAL EVIDENCE NOT COLLECTED` until `OWNER ACTION` creates
and protects it, assigns independent approval as required, and installs only
staging-owned variables/secrets. This package does not authorize that external
mutation.

## Android release-signing workflow variables

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `release_sha` | Manual Android release workflow input | C; exact lowercase 40-character SHA and exactly the workflow-dispatch `main` HEAD | Workflow guard before checkout/candidate code | Approved main release record | Derived immutable artifact/release record - not accessed | No | Release/Google | Workflow guard/run evidence | ANDROID |
| `ANDROID_RELEASE_SIGNING_READY` | Android release workflow | C; exactly `protected-main-only`, stored only in protected `android-release-signing` environment | Workflow guard before checkout | Environment variable reference | Reviewed production configuration - not accessed | No | Owner/security/Google | Environment protection evidence | ANDROID |
| `ANDROID_KEYSTORE_BASE64` | Android release workflow | C; protected environment secret only | Non-empty decode and cleanup | Environment secret reference | Protected production secret-manager/file reference - not accessed | Yes | Google/security | Environment ownership/run evidence | ANDROID |
| `ANDROID_KEYSTORE_PASSWORD` | Android release workflow | C; protected environment secret only | Gradle signing step | Environment secret reference | Protected production secret-manager/file reference - not accessed | Yes | Google/security | Run evidence | ANDROID |
| `ANDROID_KEY_ALIAS` | Android release workflow | C; protected environment secret only | Gradle signing step | Environment secret reference | Protected production secret-manager/file reference - not accessed | Yes | Google/security | Run evidence | ANDROID |
| `ANDROID_KEY_PASSWORD` | Android release workflow | C; protected environment secret only | Gradle signing step | Environment secret reference | Protected production secret-manager/file reference - not accessed | Yes | Google/security | Run evidence | ANDROID |

Android release signing is **not a staging procedure**. It is restricted to the
exact protected `main` HEAD and remains disabled because the
`android-release-signing` GitHub environment and protected readiness marker
are currently absent. The release branch candidate must not be signed by this
workflow. Current repository-scoped signing secrets must be moved to the
protected environment and removed from repository scope by `OWNER ACTION` /
`GOOGLE ACTION`; this document does not authorize those external changes.

## Monitoring, backup and restore control variables

The executable server-staging overlay has neither the production Docker
metrics gateway/exporter pair nor Uptime Kuma. Do not infer either service from
the production-provenance rows below. Their production evidence remains a
separate external gap.

| Variable | Service(s) | Requirement / exact staging mapping | Validation | Staging source | Production source | Secret? | Owner | Evidence | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ALERTMANAGER_CONFIG_FILE` | Alertmanager/release guard | R; protected staging receiver file outside checkout | Delivery config validator/digest | Protected staging file reference | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Mode/digest evidence | MON, PE |
| `ALERTMANAGER_CONFIG_SHA256` | Release guard | R; digest of effective staging receiver config | Delivery validator | Protected staging evidence | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Digest/validator result | MON, PE |
| `ALERTMANAGER_DELIVERY_RECEIVER` | Release guard | R after test; approved staging receiver name | Delivery validator | Staging evidence reference | Protected production configuration reference - not accessed | Sensitive | Infrastructure/owner | Receiver-side proof | MON, PE |
| `ALERTMANAGER_DELIVERY_TEST_REFERENCE` | Release guard | R after test; bounded evidence reference | Delivery validator | Staging evidence reference | Protected production configuration reference - not accessed | Sensitive | Infrastructure/owner | Ack/resolution proof | MON, PE |
| `ALERTMANAGER_DELIVERY_VERIFIED_AT` | Release guard | R after test; recent RFC3339 time | Delivery validator | Staging evidence reference | Protected production configuration reference - not accessed | Sensitive | Infrastructure/owner | Timestamp proof | MON, PE |
| `GRAFANA_LOCAL_PORT` | Grafana | O; loopback only | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `UPTIME_KUMA_LOCAL_PORT` | Production-model provenance only | U for the server-staging overlay, which has no Uptime Kuma service | Absence from `SSENV` and rendered server overlay | Not used by server staging | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Server render evidence; separate production-monitoring gap | DC, PE |
| `ALERTMANAGER_LOCAL_PORT` | Alertmanager | O; loopback only | Render/listener checks | Staging host config | Protected production configuration reference - not accessed | Sensitive | Infrastructure | Listener evidence | DC, PE |
| `BACKUP_AUTOMATION_ENABLED` | Host backup schedule | R for full rehearsal; explicit staging setting | Timer/release preflight | Staging host config | Reviewed production configuration - not accessed | No | Recovery/infrastructure | Timer evidence | PE, ER |
| `BACKUP_METRICS_RUN_AS` | Backup metrics | R; exact staging operator numeric UID:GID | Numeric/ownership checks | Staging host inventory | Protected production configuration reference - not accessed | Sensitive | Recovery/infrastructure | UID/GID/mode evidence | PE, ER |
| `BACKUP_RUN_AS` | Backup runner | R at execution; invoking staging operator numeric UID:GID | Backup script validation | Staging host inventory | Protected production configuration reference - not accessed | Sensitive | Recovery/infrastructure | Archive ownership | BACKUP |
| `BACKUP_REQUIRE_MOUNT` | Backup | R; staging decision, true when dedicated mount required | Backup preflight | Staging host config | Reviewed production configuration - not accessed | No | Recovery/infrastructure | Mount refusal/pass evidence | PE, ER |
| `BACKUP_REQUIRE_ENCRYPTION` | Backup | R; exactly `true` for release rehearsal | Backup preflight | Staging host config | Reviewed production configuration - not accessed | No | Recovery/security | Encryption evidence | PE, ER |
| `BACKUP_EXPECT_RAID` | Backup | R/C; reflect staging host design without claiming production topology | Backup preflight | Staging host config | Reviewed production configuration - not accessed | No | Recovery/infrastructure | Storage evidence | PE, ER |
| `BACKUP_RAID_DEVICE` | Backup | C if RAID expected; staging device only | Mount/device check | Staging host inventory | Protected production configuration reference - not accessed | Sensitive | Recovery/infrastructure | Device evidence | PE, ER |
| `BACKUP_STATUS_GROUP` | Host backup metadata/admin read-only access | O; existing staging-only group with least-privilege read access; empty when unused | Group existence, ownership and access-denial checks | Staging host inventory | Protected production configuration reference - not accessed | Sensitive | Recovery/infrastructure | Redacted group/mode evidence | PE, ER |
| `BACKUP_ENCRYPTION_PASSWORD` | Backup/restore | R; staging-only high-entropy secret | Encryption/decryption tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/security | Crypto result | REST, PE |
| `BACKUP_INTEGRITY_HMAC_KEY` | Backup/restore | R; independent staging-only key | HMAC verification/tamper tests | Staging secret reference only | Protected production secret-manager/file reference - not accessed | Yes | Recovery/security | Integrity result | REST, PE |
| `BACKUP_MAX_AGE_HOURS` | Backup health | R; approved staging threshold | Health/alert tests | Staging config | Reviewed production configuration - not accessed | No | Recovery/owner | Age/alert evidence | PE, ER |
| `BACKUP_RESTORE_TEST_MAX_AGE_HOURS` | Restore health | R; approved staging threshold | Health/alert tests | Staging config | Reviewed production configuration - not accessed | No | Recovery/owner | Age/alert evidence | PE, ER |
| `BACKUP_COLD_STORAGE_LABEL` | Backup health/admin display | R/O; approved staging storage label only; must not claim production topology | Render and status-output review | Approved staging inventory | Protected production configuration reference - not accessed | Sensitive | Recovery/infrastructure | Redacted status evidence | DC, PE |
| `BACKUP_HEALTH_PUSH_URL` | Backup health notification | O; approved staging-only receiver endpoint; unset if no protected receiver exists | Delivery and failure-isolation test | Staging secret/reference only | Protected production configuration reference - not accessed | Sensitive | Recovery/infrastructure | Redacted receiver-side evidence | BHEALTH, PE |
| `BACKUP_MIN_SIZE_BYTES` | Backup health | R/O; approved safe lower bound | Health tests | Staging config | Reviewed production configuration - not accessed | No | Recovery | Test evidence | PE, ER |
| `BACKUP_DISK_USAGE_MAX_PERCENT` | Backup health | R/O; approved threshold | Health/alert tests | Staging config | Reviewed production configuration - not accessed | No | Recovery/infrastructure | Alert evidence | PE, ER |
| `SIX_HOURLY_RETENTION_DAYS` | Backup pruning | R/O; staging evidence policy, not production policy | Prune tests | Approved staging config | Reviewed production configuration - not accessed | No | Recovery/owner | Test evidence | PE, ER |
| `DAILY_RETENTION_DAYS` | Backup pruning | R/O; staging evidence policy | Prune tests | Approved staging config | Reviewed production configuration - not accessed | No | Recovery/owner | Test evidence | PE, ER |
| `WEEKLY_RETENTION_DAYS` | Backup pruning | R/O; staging evidence policy | Prune tests | Approved staging config | Reviewed production configuration - not accessed | No | Recovery/owner | Test evidence | PE, ER |
| `MONTHLY_RETENTION_DAYS` | Backup pruning | R/O; staging evidence policy | Prune tests | Approved staging config | Reviewed production configuration - not accessed | No | Recovery/owner | Test evidence | PE, ER |
| `RESTORE_ARCHIVE` | Coordinated staging restore | C; exact reviewed archive under staging backup root | Canonical path and signed metadata | Staging recovery record | Protected production configuration reference - not accessed | Sensitive | Recovery | Path/digest evidence | REST |
| `RESTORE_CONFIRM_PRODUCTION` | Coordinated staging restore script | C; exact script confirmation `RESTORE_PRODUCTION_WITH_DROP` only after two-person staging target review | Restore precondition | Ephemeral operator input | Reviewed production configuration - not accessed | No | Recovery | Change record | REST |
| `RESTORE_TRAFFIC_DRAIN_CONFIRM` | Coordinated staging restore | C; exact `DRAINED_PUBLIC_TRAFFIC` after staging ingress/writers are independently drained | Restore precondition | Ephemeral operator input | Reviewed production configuration - not accessed | No | Recovery/infrastructure | Drain/writer evidence | REST |
| `RESTORE_STOP_TIMEOUT_SECONDS` | Coordinated staging restore | O; reviewed bounded writer-stop timeout, default 60 seconds | Stop/status precondition and fault test | Approved staging config | Reviewed production configuration - not accessed | No | Recovery/infrastructure | Writer-stop timing evidence | REST |
| `RESTORE_EXPECTED_ARCHIVE_SHA256` | Coordinated staging restore | C; independently calculated exact source archive digest | Restore precondition | Staging recovery evidence | Protected production configuration reference - not accessed | Sensitive | Recovery/reviewer | Digest match | REST |
| `RESTORE_EXPECTED_SANITIZED_SHA256` | Coordinated staging restore | C; independently calculated exact sanitized restore-test artifact digest | Restore precondition | Staging recovery evidence | Protected production configuration reference - not accessed | Sensitive | Recovery/reviewer | Digest match | REST |
| `RESTORE_EXPECTED_CURRENT_SHA` | Coordinated staging restore | C; exact externally recorded deployed docs/PR-head SHA | Restore precondition/Git check | Approved change record | Derived immutable artifact/release record - not accessed | No | Release/recovery | SHA match | REST |
| `RESTORE_EXPECTED_BACKUP_GIT_SHA` | Coordinated staging restore | C; exact deployed SHA recorded in selected signed backup metadata | Restore precondition | Staging recovery evidence | Derived immutable artifact/release record - not accessed | No | Recovery/reviewer | Metadata match | REST |
| `RESTORE_CHANGE_REFERENCE` | Coordinated staging restore | C; approved incident/change reference | Restore precondition | Change record | Protected production configuration reference - not accessed | Sensitive | Recovery/owner | Approval evidence | REST |
| `RESTORE_RECOVERY_CONFIRM` | Post-restore acknowledgement | C; exact `ACKNOWLEDGE_SCHEMA_AND_MIGRATION_REVIEW` only after recorded review | Acknowledgement script | Ephemeral operator input | Reviewed production configuration - not accessed | No | Recovery/DBA | Review evidence | REST |
| `RESTORE_RECOVERY_APPROVED_RELEASE_SHA` | Post-restore acknowledgement | C; exact externally recorded deployed docs/PR-head SHA | Checkout/marker validation | Approved change record | Derived immutable artifact/release record - not accessed | No | Release/recovery | SHA match | REST |
| `RESTORE_RECOVERY_REVIEW_REFERENCE` | Post-restore acknowledgement | C; approved schema/migration review reference | Acknowledgement validation | Review record | Protected production configuration reference - not accessed | Sensitive | DBA/recovery | Review evidence | REST |
| `RESTORE_RECOVERY_ARCHIVE_SHA256` | Post-restore acknowledgement | C; exact marker-bound source archive digest | Marker validation | Staging recovery evidence | Protected production configuration reference - not accessed | Sensitive | Recovery/reviewer | Digest match | REST |
| `RESTORE_RECOVERY_SANITIZED_SHA256` | Post-restore acknowledgement | C; exact marker-bound sanitized artifact digest | Marker validation | Staging recovery evidence | Protected production configuration reference - not accessed | Sensitive | Recovery/reviewer | Digest match | REST |

## Completion rules

1. Fill only source references, owner and evidence cells in the protected
   execution copy; never add values or secret-bearing rendered Compose output
   to Git.
2. Run the fail-closed preflight in
   [03-staging-deployment-procedure.md](./03-staging-deployment-procedure.md).
3. Any missing, extra, aliased, whitespace-modified or production hostname is
   a P0 failure. Do not weaken the validator.
4. Optional providers remain disabled until their individual vendor, policy,
   callback, deletion and failure evidence is complete.
5. Current GitHub environments `staging-security` and
   `android-release-signing` are absent. Treat DAST and signed Android release
   evidence as blocked; do not substitute repository-scoped secrets.
6. No command in this package authorizes production, provider live mode, DNS,
   Cloudflare, store, secret or signing mutation.
