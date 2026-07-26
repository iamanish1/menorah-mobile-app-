# Server-staging deployment procedure

Runtime candidate SHA: `142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Approved Ubuntu/server-staging state: **DISCOVERY OUTPUT COLLECTED — COLLISION REVIEW REQUIRED**

The local server-staging overlay completed Phase 11 with 22/22 gates passed,
0 failed and 0 blocked. The three exact runtime-candidate push workflows are
green as recorded in [13-evidence-index.md](./13-evidence-index.md). Neither
result is evidence that the shared server, DNS, TLS, Tunnel, secrets,
providers, timers or human alert route has been inspected or changed.

This file is a staging-only companion to the authoritative
[server-staging design and discovery runbook](../29-server-staging-design-and-discovery-runbook.md).
Do not execute a command from this procedure until that runbook's applicable
approval is recorded. It does not authorize production deployment, PR merge,
DNS/Cloudflare mutation, provider mutation or use of production data/secrets.

## Authoritative target

The only approved model for this work is the dedicated overlay under
`menorah/deploy/server-staging/`. Do **not** use
`menorah/deploy/docker-compose.production.yml`,
`menorah/deploy/docker-compose.tunnel.yml`, or any
`menorah/deploy/ubuntu/*` production deployment/recovery script for staging.
Earlier `/srv/menorah-staging`, `/etc/menorah-staging` and production-script
instructions were superseded by runtime candidate
`142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2`.

The reviewed server-staging identity is:

| Control | Exact design |
| --- | --- |
| Compose project | `menorah-staging` |
| Root | `/opt/menorah-staging` |
| Application checkout | `/opt/menorah-staging/app` |
| Environment | `/opt/menorah-staging/env` |
| Data | `/opt/menorah-staging/data` |
| Backups | `/opt/menorah-staging/backups` |
| Deployment state | `/opt/menorah-staging/deploy-state` |
| Logs | `/opt/menorah-staging/logs` |
| Docker isolation | Six networks and 21 volumes in the all-profile model; the default graph references 19 volumes, the validated post-migration runtime retains `staging-migration-temp` for five networks/20 volumes, and recovery/all-profile adds the restore network plus `staging-restore-mongodb` for six/21 |
| Published services | loopback-only application/monitoring ports; no host MongoDB or Redis port |
| Ingress | 10 staging-only hosts declared in the tracked ingress manifest |
| Network ranges | provisional staging CIDRs only; discovery and collision approval required |

All resources must carry the exact staging project/prefix and must remain
independent from the existing production project, containers, networks,
volumes, roots, databases, replica sets, Redis ACLs, ingress and monitoring
stores.

## Required change record

Before any mutating step, record outside Git:

- the full runtime SHA and the final documentation-head SHA;
- server identity and a reference to the returned read-only discovery bundle;
- collision-review result and both human approvals;
- exact staging roots, project, network/CIDR, ports, volumes, database,
  replica-set, Redis ACL, hosts, Tunnel and provider account references;
- named release, infrastructure, database/recovery, security, QA, on-call and
  abort owners;
- immutable image-manifest and secret-manager references without values;
- intended start, stop, migration, recovery and safe-removal boundaries; and
- UTC timestamps and restricted evidence location.

Never record environment contents, tokens, credentials, private keys,
personal/clinical data or provider payloads.

## Gated Step A–G sequence

### Step A — read-only discovery

Run only the exact non-mutating discovery command in
[runbook 29](../29-server-staging-design-and-discovery-runbook.md#step-a--read-only-discovery).
Return its output for review. The runbook's checksum-pinned HTTPS download to a
mode-`0600` temporary file is the only download permitted: it is deleted on
exit and must not run unless strict SHA-256 verification passes. Do not fetch a
repository, checkout or switch a branch, create a root, render Compose, start a
service or alter any existing resource during Step A.

### Step B — collision review and first human approval

Review the discovery output against every collision class:

- Compose project/resource names, container names and labels;
- listeners and TCP/UDP port ranges;
- Docker network names, CIDRs and IP ranges;
- volumes, mounts, filesystem roots and symlink resolution;
- MongoDB database, replica-set, host, role identity and URI;
- Redis host, ACL identity and URL;
- Caddy and Tunnel hosts, routes, target ports, IDs and token ownership;
- backups, retrieval, restore, pruning, locks and `LATEST`;
- release/deploy/migration/recovery markers and locks;
- monitoring targets, labels, stores, probes and alert receivers;
- provider accounts/modes, callbacks, storage buckets, public URL tuple; and
- environment/secrets/process authority.

Step B passes only with zero unexplained collision and recorded human
approval. Any unknown, including a provisional CIDR, is a stop condition.

### Step C — prepare dedicated staging inputs

Only after Step B approval, an authorized operator may prepare the exact
`/opt/menorah-staging` roots, the clean exact-SHA checkout, protected
`/opt/menorah-staging/env/server-staging.env`, dedicated staging secrets,
immutable digest-qualified images, staging domains and approved provider
sandbox references.

Use
`menorah/deploy/env/server-staging.env.example` as the environment contract.
The persistent file must not contain Docker/Git/Compose control variables that
the validator forbids. Production values must not be copied or inspected.

### Step D — dry render and second review

With all services still stopped:

1. run `validate-environment.mjs` against the protected environment and the
   returned production-metadata inventory;
2. render only `menorah/deploy/server-staging/compose.yml` for exact project
   `menorah-staging`;
3. run `validate-isolation.mjs` and
   `menorah/scripts/qa/validate-server-staging-isolation.sh`;
4. validate the exact Caddy and Tunnel route manifests, loopback bindings,
   resource limits, service identities and process authority; and
5. compare the dry render with discovery again.

The all-profile render must have exactly 32 services, six networks, 21 volumes
and 117 published-port instances, all bound to loopback. The default service
graph must reference 19 volumes. After the required migration/seed lifecycle,
the retained runtime must resolve to 26 containers, five networks and
20 volumes because `staging-migration-temp` persists; recovery/all-profile
adds the restore network and `staging-restore-mongodb` for six networks and
21 volumes. Any different count is a stop condition, not a documentation
adjustment.

Do not print or persist a secret-bearing rendered model in ordinary logs.
Do not start any service during Step D. Deployment requires a second recorded
human approval after all dry-render and collision checks pass.

### Step E — exact-SHA deployment

Only after the second approval, invoke the candidate's dedicated
`menorah/deploy/server-staging/deploy-exact-sha.sh` for exact runtime SHA
`142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2` with project
`menorah-staging` and its required one-shot acknowledgement. The script,
checkout and target commit must be byte/commit bound exactly as its guards
require.

Do not invoke migration, Compose `up`, production updater, first-run or
rollback commands separately to work around a failed guard. A failed guard
ends the attempt and preserves evidence/state for review.

### Step F — collect server evidence

The server run is not complete until reviewers receive:

- Ubuntu ownership/permission/process-authority evidence;
- exact service/health/resource-limit and no-production-collision inventory;
- migrations, intentional interruption, crash-resume and rollback results;
- signed/encrypted backup, retrieval, disposable database/media restore and
  achieved RPO/RTO timings;
- DNS, TLS, Caddy and Tunnel route/identity evidence;
- all 35 Prometheus targets healthy, all required P0 alerts fired/resolved,
  pre/post exercise alert state quiet, and protected receiver delivery plus
  human acknowledgement;
- systemd/timer ownership and schedule evidence;
- bounded contention observations against the co-hosted production workload;
  and
- provider-sandbox callback results with no production or real-person data;
- rendered proof that Razorpay secrets reach only `staging-api-ios`,
  RazorpayX secrets only `staging-api-admin`, the Resend webhook secret only
  `staging-api-web`, and worker/migration/seed receive no provider secret; and
- target-host firewall/proxy and denied-route evidence, because the ordinary
  NAT-capable `egress` bridge does not enforce destination/FQDN allowlisting.

Repository/CI, local Docker or placeholder-receiver evidence must remain
separately labelled and cannot satisfy this step.

### Step G — safe removal

Removal is a distinct approved change. Stop/down only exact project
`menorah-staging` using its dedicated Compose file and protected environment.
Then prove the production project and its exact container/network/volume
inventory are unchanged. Remove only resources carrying the reviewed staging
identity. Deleting any volume, backup, root or provider route requires a
further explicit approval and retained evidence; never use a global Docker
prune.

## Post-start acceptance

Pass only when:

- the current/last-good/manifest/deployment records bind to the exact runtime
  candidate and no unexpected migration/recovery marker remains;
- the complete expected service set is healthy, bounded and staging-labelled;
- every published endpoint is the reviewed loopback binding and no database,
  cache, dashboard or exporter is publicly exposed;
- the ten exact staging hosts route only to their reviewed staging targets;
- functional, role/MFA, email-domain, payment/call sandbox and privacy smoke
  checks pass using synthetic data;
- all 35 Prometheus targets and probes are healthy, the 20 required P0 alert
  fixtures fire and resolve, pre/post alert state is quiet, protected alert
  delivery is acknowledged, and logs contain no prohibited values; and
- an independent before/after inventory proves production is unchanged.

Any missing evidence remains **NOT COLLECTED** and produces `STAGING NO-GO`.

## Failure and recovery routing

- Before migration: preserve evidence and use only the recorded
  server-staging rollback path after review.
- During uncertain identity reconciliation or migration: keep all application
  writers stopped; do not delete a marker or start older code.
- After a proven-applied migration: resume only the exact recorded SHA using
  `menorah/deploy/server-staging/resume-post-migration.sh` and the exact
  acknowledgement
  `MENORAH_STAGING_RECOVERY_ACK=RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION`.
- If the exact resume preconditions do not hold, keep writers stopped and use
  a reviewed forward fix or coordinated dedicated staging restore.

See
[08-backup-restore-migration-recovery.md](./08-backup-restore-migration-recovery.md)
for the candidate-bound recovery matrix. Never substitute a production
recovery helper.

## Current decision

Step A discovery output has been returned, but no collision approval or server mutation has been
authorized or performed. Current decision: **STAGING NO-GO**.
