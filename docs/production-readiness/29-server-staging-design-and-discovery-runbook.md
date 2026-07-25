# Server-staging design and discovery runbook

Last reviewed: 2026-07-25.

## Status, authority and evidence boundary

**SERVER STAGING DESIGN COMPLETE — DISCOVERY REQUIRED**

This runbook describes the isolated Ubuntu server-staging overlay frozen at
runtime candidate
`1ecd0b379369258be466159364a8a48c79fb65aa`. It does not establish any fact
about the target server and does not authorize a server login, discovery run,
directory creation, secret change, DNS/Cloudflare change, container start,
migration, restore, provider action or production deployment.

The exact candidate-bound push gates are terminal successes:

| Workflow gate | Run | Jobs | Steps | Result |
| --- | ---: | ---: | ---: | --- |
| Production release readiness | `30158172303`, attempt 2 | 1/1 | 11/11 | success |
| Functional release | `30158172290`, attempt 2 | 9/9 | 89/89 | success |
| Security | `30158172293`, attempt 1 | 15/15 | 104/104 | success |

There were zero failed, skipped or cancelled jobs/steps in those three exact
push runs. This is repository evidence, not server-staging or production
evidence. Earlier candidates and their results remain historical and
superseded; they must not be relabelled as evidence for this SHA.

The workflow below has two explicit approval boundaries:

1. approval after read-only discovery and collision review, before preparing
   any server-staging resource; and
2. a separate approval after the prepared environment passes a no-start dry
   render, before deploying the exact SHA.

Stopping at either boundary is safe and expected. Production resources and the
legacy local project `menorah-local-staging` are outside this runbook.

## Intended isolated architecture

| Boundary | Intended server-staging value |
| --- | --- |
| Compose project | `menorah-staging` |
| Local-only validation project | `menorah-server-staging-validation` |
| Resource prefix | `menorah-staging` |
| Environment identifier | `menorah-server-staging-v1` |
| Filesystem roots | `/opt/menorah-staging`, `/opt/menorah-staging/data`, `/opt/menorah-staging/backups`, `/opt/menorah-staging/deploy-state`, `/opt/menorah-staging/logs`, `/opt/menorah-staging/env`, `/opt/menorah-staging/app` |
| Public ingress | Caddy plus a staging-only Cloudflare Tunnel route set |
| Data services | Staging-only MongoDB replica set and Redis ACL identity; no published database ports |
| Recovery | Staging-only backup, retrieval, restore and deploy-state roots, volumes, locks and markers |
| Monitoring | Staging-only Prometheus, Alertmanager, Loki and Alloy stores and staging-labelled targets |

### Networks and address plan

The all-profile overlay owns exactly six networks; the default runtime uses
five, and the recovery profile adds the restore network:

| Network | Provisional subnet / dynamic range | Notes |
| --- | --- | --- |
| `menorah-staging-ingress` | `10.252.240.0/24` / `10.252.240.128/25` | Caddy/Tunnel ingress boundary |
| `menorah-staging-app` | `10.252.241.0/24` / `10.252.241.128/25` | Application services; Caddy's provisional static address is `10.252.241.10` |
| `menorah-staging-data` | `10.252.242.0/24` / `10.252.242.128/25` | MongoDB/Redis data plane |
| `menorah-staging-monitoring` | `10.252.243.0/24` / `10.252.243.128/25` | Metrics, probes and logs |
| `menorah-staging-restore` | `10.252.244.0/24` / `10.252.244.128/25` | Disposable restore boundary |
| `menorah-staging-egress` | `10.252.245.0/24` / `10.252.245.128/25` | NAT-capable provider/receiver egress for Alertmanager, four APIs and user web |

The egress bridge disables inter-container communication but is not a
destination or FQDN allowlist. Host firewall or approved proxy controls and
their server evidence remain mandatory. The worker has no egress membership.

Every subnet and IP range is provisional until Step A proves it is unused on
the target host and Step B records a collision-review PASS. Discovery may
require choosing different staging-only ranges before any resource is created.

### Volumes

The resource prefix owns exactly these 21 volumes:

`filesystem-root`, `app-root`, `data-root`, `env-root`, `mongo`, `redis`,
`uploads`, `managed-media`, `backups`, `retrieval`, `migration-temp`,
`prometheus`, `alertmanager`, `loki`, `alloy`, `caddy-data`, `caddy-config`,
`restore-mongodb`, `restore-media`, `restore-root`, and `logs`.

Their full default names are `menorah-staging-<suffix>`. No production volume,
bind root or existing unlabelled volume may be adopted, mounted, renamed or
removed.

### Host listeners

The intended TCP listeners are loopback-only:

`127.0.0.1:32345`, `127.0.0.1:33001` through `127.0.0.1:33003`,
`127.0.0.1:33100`, `127.0.0.1:37880`, `127.0.0.1:37881`,
`127.0.0.1:38000`, `127.0.0.1:38080` through `127.0.0.1:38084`,
`127.0.0.1:38443`, `127.0.0.1:39090`, and `127.0.0.1:39093`.

Local validation binds LiveKit TCP `37881` and UDP `35000-35100` to loopback.
A real media path may require a separately reviewed non-loopback/public node
IP and firewall policy; the local binding is not proof that remote media can
flow. MongoDB and Redis have no published host ports. Step B must reject every
occupied listener or overlapping range; it must not stop, rebind or
reconfigure the existing owner.

### Ingress names

The intended host set is exactly:

- `staging.menorah.me`
- `www.staging.menorah.me`
- `app.staging.menorah.me`
- `admin.staging.menorah.me`
- `counsellor.staging.menorah.me`
- `api-ios.staging.menorah.me`
- `api-android.staging.menorah.me`
- `api-web.staging.menorah.me`
- `api-admin.staging.menorah.me`
- `calls.staging.menorah.me`

These are proposed names only. No DNS record, certificate, Tunnel route or
public reachability has been inspected or changed.

The nine application/API names and the one calls name are distinct probe
contracts. Frontend probes may follow reviewed redirects; API and calls probes
are strict. The internal local-Caddy TLS exercise is diagnostic and is
explicitly excluded from public DNS, certificate, Tunnel and external-TLS
evidence.

### Data, monitoring and release-state separation

- MongoDB uses database `menorah_staging`, replica set
  `menorah-staging-rs`, isolated restore replica set
  `menorah-staging-restore-rs`, and six distinct staging-prefixed identities:
  root, application, migration, backup, restore and monitor. Its credentials
  and URIs must differ from production and from one another where required.
- Redis uses the staging-only ACL identity `menorah-staging-app` and a unique
  secret and URL. It may not reuse a production host, identity, database
  contract or credential.
- Prometheus, Alertmanager, Loki and Alloy use separate staging volumes. Their
  required labels are `environment=staging`, `stack=menorah-staging`, and
  `monitoring_scope=server-staging`. The repository defines 20 required P0
  alerts; the committed Alertmanager receiver is intentionally a placeholder
  and does not prove human delivery.
- The deploy-state root is separate from production and holds only the
  staging current/last-good SHA, manifest, migration, identity,
  post-migration-recovery and lock state. Backup metadata, retrieval state and
  restore state remain in their dedicated staging roots.
- Provider secret scope is service-specific: Razorpay booking credentials are
  available only to `staging-api-ios`, RazorpayX payout credentials only to
  `staging-api-admin`, and the Resend webhook secret only to
  `staging-api-web`. The worker, migration and seed services receive no
  provider secrets. A non-secret booking/catalogue configuration is shared
  across the seven backend service/one-shot roles and is validated for exact
  equality.

Post-migration recovery is deliberately exceptional and requires this exact
one-use acknowledgement in the approved operation:

```text
MENORAH_STAGING_RECOVERY_ACK=RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION
```

It is not a persistent environment value and must never be stored in the
server-staging environment file.

## Collision review scope

Step B must compare the discovery record and the fully rendered proposal
across every class below. A missing observation is not a PASS.

| Collision class | Required comparison |
| --- | --- |
| Project and resources | Compose project, resource prefix, container names, service names, Compose/project/environment labels |
| Listeners | TCP/UDP ports, ranges, bind addresses, host listeners and firewall ownership |
| Networks | Names, drivers, subnets, IP ranges, gateways, static addresses and overlap with Docker/host/VPN routes |
| Storage | Volume names, drivers, labels, mounts and capacity |
| Filesystem | Root, app, data, backup, retrieval, restore, log, environment and deploy-state paths; ownership, permissions, mounts and symlink escape |
| MongoDB | Hosts, database names, replica-set names, six role identities, authentication database and every URI |
| Redis | Host, port exposure, ACL identity, URL/database contract and credential separation |
| Caddy | All ten hosts, matchers, routes, upstream names/ports, listener ownership and persisted state |
| Cloudflare Tunnel | Hostnames, route order, tunnel ID/name, credential/token custody and origin targets |
| Backup | Archive/metadata/integrity roots and keys, lock, `LATEST`, retention and pruning namespace |
| Restore | Retrieval/restore roots, target database/replica set, media destinations, acknowledgements and markers |
| Deploy/recovery | Current/last-good SHA, image manifest, migration and identity markers, recovery markers and all locks |
| Monitoring | Scrape/probe targets, external labels, stores, dashboards and monitoring network |
| Alertmanager | Routing labels, receiver identity, protected destination and data store |
| Providers | Provider modes, accounts, credentials, live/test modes, callbacks and ownership |
| Public URL contract | Callback URLs, allowed origins, CORS, trusted proxy, cookies and the complete public URL tuple |
| Object storage | Bucket/account/region names, prefixes, access identities and retention |
| Configuration authority | Environment files, secrets, process-influencing variables, Compose authority and systemd/timer authority |

The review must explicitly identify the owner of every existing matching name,
path, listener or range. Reusing an existing object because it appears unused
is a collision, not an approval.

## Validator set

Use the candidate's own files at the exact SHA. The minimum no-start validator
set is:

- `validate-environment.mjs` for identities, roots, URLs, credentials by
  constraint, paths, ports, provider modes and placeholder rejection;
- `validate-isolation.mjs` for the rendered project, resources, networks,
  volumes, ports, hosts and production-collision metadata;
- `menorah/scripts/qa/validate-server-staging-isolation.sh` for repository-wide
  static isolation contracts;
- `assert-context.mjs` and `assert-process-authority.sh` for exact project,
  environment, SHA and sanitized process authority;
- `ingress-manifest.json` plus Caddy and Tunnel manifest/config comparison for
  exact hosts, routes and origin targets;
- `service-lifecycle.mjs` and `verify-runtime-services.sh` for bounded
  service-set and health contracts after deployment is separately approved;
  and
- the native server-staging contract, monitoring, backup/restore, migration,
  smoke, authorization and alert-exercise validators/tests applicable to the
  approved phase.

No validator may be pointed at production secrets or used to mutate production
state. Validation output must be redacted and tied to the exact candidate SHA.

## Step A — read-only discovery

**Do not run this command now.** It is the future inspection-only command for
an authorized operator on the target Ubuntu host:

```bash
(
  set -euo pipefail
  readonly DISCOVERY_SHA='1ecd0b379369258be466159364a8a48c79fb65aa'
  readonly DISCOVERY_URL="https://raw.githubusercontent.com/menorahsoftware-cmyk/menorah-mobile-app-/${DISCOVERY_SHA}/menorah/deploy/server-staging/discover-server-readonly.sh"
  readonly DISCOVERY_SHA256='b7ba1341ad78aa5698020ec040404c8418365481da2d7b0e7c105fae0d788a17'
  discovery_tmp="$(mktemp)"
  trap 'rm -f -- "${discovery_tmp}"' EXIT
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --silent --show-error --location \
    --output "${discovery_tmp}" "${DISCOVERY_URL}"
  printf '%s  %s\n' "${DISCOVERY_SHA256}" "${discovery_tmp}" \
    | sha256sum --check --strict -
  sudo env -i PATH='/usr/sbin:/usr/bin:/sbin:/bin' LC_ALL=C \
    /bin/bash "${discovery_tmp}"
)
```

This downloads only the exact immutable script to a mode-`0600` temporary
file; it does not fetch a repository, pull code, switch a branch or create a
directory. `set -e` prevents execution if HTTPS download or strict SHA-256
verification fails, and the `EXIT` trap deletes the file afterward. **Stop if
the checksum line does not report `OK`; do not bypass it or substitute another
SHA/URL.** The script only inspects allow-listed host/OS/resource/mount
metadata, reviewed root metadata, Docker
projects/containers/networks/volumes/listeners/isolation/resource statistics,
systemd unit metadata and ingress file metadata. It must not read secret
values, database contents, personal data or logs, and it must not mutate
anything.

Expected stdout begins with `[discovery-contract]` and ends with
`[completion]` followed by `discovery=complete`. An unavailable producer ends
with `discovery=incomplete` and a nonzero exit; that is a stop condition, not
permission to continue.

Return the complete discovery output to the reviewers through the approved
evidence channel after checking it for accidental sensitive material. Record
timestamp, host identity, operator, exact SHA and output digest. Do not proceed
to Step B by assuming omitted data is safe.

## Step B — collision review and first approval

1. Compare Step A with every collision class and the proposed architecture.
2. Record each check as PASS or FAIL with evidence; resolve every FAIL by
   changing only the proposed staging design, never an existing production
   resource.
3. Have infrastructure and release reviewers independently confirm that
   production, other Compose projects and the legacy local environment remain
   untouched.
4. Proceed only after the complete collision register is PASS and a human
   approver explicitly authorizes preparation. Otherwise stop.

## Step C — prepare isolated server-staging inputs

After the first approval only:

1. Create the seven dedicated `/opt/menorah-staging` roots with reviewed
   ownership, least privilege, mount/capacity policy and no symlink escape.
2. Place an exact-SHA application checkout in `/opt/menorah-staging/app`;
   establish protected environment and secret files under
   `/opt/menorah-staging/env`; and generate unique staging-only MongoDB,
   Redis, backup, signing and application secrets without printing them.
3. Prepare staging-only image references, domain/Tunnel inputs, provider
   sandbox accounts, callback/origin tuple, email sink, object-storage
   namespace and a protected Alertmanager destination. Live provider modes
   remain disabled.
4. Preserve separate custody, permissions and recovery for environment,
   backup encryption and integrity material. Do not copy production secrets
   or data.

Preparation does not authorize a container start, DNS change or provider
callback.

## Step D — no-start render and second approval

From the exact application root, load only the reviewed server-staging
environment and run the full environment, authority, isolation, Compose,
ingress, Caddy and Tunnel validator set. Render all profiles without starting
containers. Compare the render back to Step A and Step B, including resource
limits, listeners, networks, volumes, bind roots, secrets/config references,
health checks, Caddy upstreams, Tunnel origin routes, monitoring targets and
labels.

Any warning, missing value, placeholder, unreviewed provider mode, route
mismatch or resource collision is a FAIL. Do not use `up`, create a network or
volume, modify DNS/Tunnel state, or repair an existing host resource during
this step. Proceed only after the dry-render record is fully PASS and a second
human approval explicitly authorizes deploying this exact SHA.

## Step E — deploy only after the second approval

Use the candidate's `deploy-exact-sha.sh` under the sanitized process authority
with `COMPOSE_PROJECT_NAME=menorah-staging`, the exact SHA and the reviewed
server-staging environment. Keep provider live modes, production data access
and public traffic disabled. Confirm that created objects have the exact
staging project/resource labels and that existing production container IDs,
networks, volumes, listeners and health remain unchanged.

The guarded wrapper owns the ordered Step E actions: start the isolated
staging MongoDB and Redis prerequisites, initialize their staging-only
identities, start the application prerequisites, run the recorded
candidate-bound staging migration, create only the bounded synthetic roster,
start the remaining application/ingress/monitoring services, and verify the
complete health and isolation contract. Operators must not split those actions
into ad hoc Compose, migration or seed commands.

Stop on any identity, manifest, migration, health, resource or isolation
failure. Do not improvise with raw Compose commands, delete markers, edit a
database or use the recovery acknowledgement unless the recorded
post-migration recovery procedure is specifically approved.

## Step F — collect approved Ubuntu evidence

The server-staging evidence pack must include:

- host ownership, operating system, clock, service identities, filesystem
  ownership/modes, mounts, capacity, resource limits and exact-SHA provenance;
- encrypted backup, integrity/signature, protected off-host retrieval,
  independent key recovery and isolated database/media restore;
- first migration, idempotent rerun, forced interruption, pre-migration
  rollback, crash-resumable post-migration recovery and invariant evidence;
- DNS, TLS, Cloudflare Tunnel, Caddy route, firewall, external probe and bypass
  tests for all ten hosts and the LiveKit media path;
- every monitoring target healthy, all 20 P0 signals firing then resolving,
  protected receiver delivery, human acknowledgement/escalation and responder
  resolution;
- systemd units/timers, singleton ownership, restart/boot behavior and
  maintenance-job scheduling;
- production-versus-staging CPU, memory, PID, disk, I/O and network contention
  under an approved load envelope, with production health continuously
  verified; and
- real sandbox callback flows for payments/payouts, email and each enabled
  provider, using non-production accounts and synthetic data only.

Each artifact must state environment, SHA, command/procedure, timestamp,
operator, result, redacted evidence location and reviewer. This evidence still
does not authorize production, replace physical-device/VAPT/governance proof,
or establish future availability.

## Step G — safe removal

Removal requires its own approved change record:

1. resolve the exact `menorah-staging` Compose file/environment and inventory
   containers, networks and volumes whose project/resource labels both identify
   this staging overlay;
2. stop and remove only the exact `menorah-staging` project containers and
   staging-owned networks; never use a global prune, broad prefix match or an
   inferred default project;
3. verify production container IDs, health, listeners, networks, volumes,
   routes and external probes are unchanged;
4. remove only staging-labelled, inventory-matched temporary artifacts; and
5. obtain explicit separate approval before removing any of the 21 persistent
   staging volumes or any staging backup/retrieval evidence.

An unlabelled object, label mismatch, unexpected mount, shared dependency or
production-health change requires an immediate stop. Filesystem and persistent
evidence removal follows approved retention/custody policy; it is not implied
by Compose teardown.

## Current conclusion

The isolated design and repository validators are available and the exact
runtime candidate's three push gates are green. Server discovery has not been
performed, no server truth has been collected, no collision review has passed,
neither approval has been granted, and no server resource, DNS/Tunnel record,
secret, provider, container or production system has been changed.

**SERVER STAGING DESIGN COMPLETE — DISCOVERY REQUIRED**
