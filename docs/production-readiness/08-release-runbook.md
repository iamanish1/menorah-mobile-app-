# Production release runbook

Last reviewed: 2026-07-25.

## Status and authority

This handover document describes the production sequence; it does not authorize
execution. The current verdict is **NOT READY**.

The only permissible next technical stage is the inspection-first
server-staging process in
[29-server-staging-design-and-discovery-runbook.md](./29-server-staging-design-and-discovery-runbook.md).
A prior read-only discovery attempt ended `discovery=incomplete` and is not a
server-staging pass. The server-staging design is repository-controlled, but it
is not approved for the shared Ubuntu host until replacement host metadata is
returned and its collision review explicitly passes.

Server staging must use only:

- Compose project `menorah-staging`;
- application checkout `/opt/menorah-staging/app`;
- environment file `/opt/menorah-staging/env/server-staging.env`;
- data, backup, deployment-state and log roots below
  `/opt/menorah-staging/`; and
- scripts under `menorah/deploy/server-staging/`.

The all-profile overlay has 32 services, six networks and 21 volumes. Its
`staging-egress` bridge is NAT-capable only for explicitly scoped services,
but it is not a destination or FQDN allowlist. Server firewall/proxy
restrictions, the reviewed LiveKit media bind/node addresses and collision
freedom are discovery-time evidence, not repository facts.

The existing `menorah-local-staging` Docker Desktop project is historical
local evidence and must not be modified, reused, renamed or removed by a
server-staging procedure.

The sole production deployment method is an authorized operator running:

```bash
bash menorah/deploy/ubuntu/update-from-git.sh
```

from the Ubuntu production checkout. The script releases
`menorah/deploy/docker-compose.production.yml` plus
`menorah/deploy/docker-compose.tunnel.yml`.

GitHub Actions validates readiness but does not deploy. Legacy Cloud Build and
Cloud Run paths are fail-closed tombstones and are not fallback deployment
methods. Do not deploy from a developer desktop, merge as part of this
procedure, run migrations separately or substitute a moving branch name for an
approved SHA.

The detailed operator procedure remains
[the production update runbook](../../menorah/docs/production-update-runbook.md).
Rollback and recovery are in
[09-rollback-runbook.md](./09-rollback-runbook.md).

## Current reviewed candidate input

The repository-controlled replacement runtime candidate is
`25cd808602020988a09ee9e58cc9d4738cc068c9` on
`release/final-production-readiness`. It supersedes
`1ecd0b379369258be466159364a8a48c79fb65aa` and its intermediate correction
`92c841ac40e75681019689ca59fd1989e6db6f21`: the former misparsed systemd
output and omitted the actual production Caddy bind-mount source, while the
latter still emitted an unnecessary secondary unavailable summary. The final
correction passed the 293-test server-staging contract,
Bash syntax and pinned ShellCheck locally; its exact-SHA push workflows passed:
readiness run `30209920365` (1/1 jobs, 11/11 steps), functional run
`30209920383` (9/9 jobs, 89/89 steps), and security run `30209920358` (15/15
jobs, 104/104 steps), with zero failed, skipped or cancelled jobs/steps. The
earlier candidate evidence is historical and must not be relabelled as current
evidence. This identity does not authorize execution.

The draft PR records the final documentation HEAD. The runtime-to-docs diff
must contain only `docs/**` or `menorah/docs/**`. Any other change invalidates
the candidate. Use
[the immutable candidate record](./26-immutable-candidate-record.md) as the
repository evidence source.

## Roles

At minimum name:

- release/change approver;
- engineering release owner;
- infrastructure operator and alternate;
- database/recovery owner;
- security and incident owner;
- application smoke-test owner;
- payment/finance owner when payment tests are in scope;
- privacy and clinical escalation contacts.

No operator may infer missing policy approval. `OWNER ACTION`,
`INFRASTRUCTURE ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`,
`VAPT ACTION`, `APPLE ACTION`, `GOOGLE ACTION` and `VENDOR ACTION` remain
distinct.

## Server-staging approval sequence

The stages below are ordered gates. Passing a stage authorizes only review of
the next stage; it does not authorize production work.

| Step | Permitted work | Exit gate |
| --- | --- | --- |
| A — discovery only | Download the exact candidate discovery blob to one temporary file, verify its recorded SHA-256, execute only that verified file, remove it on exit, collect redacted metadata and return it for review | Discovery output received; checksum passed; temporary file removed; no persistent mutation claimed |
| B — collision review | Compare the real server inventory with the exact rendered overlay across names, labels, ports, networks/CIDRs, volumes, roots, database/cache identities, ingress, monitoring, backup/recovery and providers | Explicit collision result `PASS` plus named human approval; any collision is `NO-GO` |
| C — prepare staging roots | Only after Step B approval, prepare `/opt/menorah-staging/{app,data,backups,deploy-state,logs,env}`, staging-only secrets, domains and sandbox/disabled provider settings | Ownership/modes and staging-only custody reviewed |
| D — dry render | Render Compose, validate Caddy and expected Tunnel hosts, verify limits, and rerun collision validators without starting services | Dry-render evidence passes; no container started |
| E — deploy staging | Only after a second named approval, use `menorah/deploy/server-staging/deploy-exact-sha.sh` for the exact frozen SHA | Exact artifacts, migration, synthetic initialization, health and production-invariance checks pass |
| F — server evidence | Exercise Ubuntu ownership, backup/restore, migration interruption, crash resume, rollback/recovery, DNS/TLS/Tunnel, alert delivery/human response, systemd/timers, contention and provider sandbox callbacks | Evidence reviewed; gaps remain gaps rather than inferred passes |
| G — safe removal | Target only project `menorah-staging`, verify production before and after, and remove only staging-labelled resources | Evidence preserved; separate explicit approval obtained before deleting any staging volume |

Step A is the current gate. Do not run Steps C–G now. The complete collision
matrix is in runbook 29. The exact command below is the only reviewed discovery
invocation; it deliberately uses an immutable raw URL rather than assuming the
repository already exists on the server:

```bash
(
  set -euo pipefail
  readonly DISCOVERY_SHA='25cd808602020988a09ee9e58cc9d4738cc068c9'
  readonly DISCOVERY_SHA256='f12794aa04a82cc2437244565b41b14d765479b80b578c80be7bfdc902e065ef'
  readonly DISCOVERY_URL="https://raw.githubusercontent.com/menorahsoftware-cmyk/menorah-mobile-app-/${DISCOVERY_SHA}/menorah/deploy/server-staging/discover-server-readonly.sh"
  discovery_file="$(mktemp)"
  readonly discovery_file
  trap 'rm -f -- "${discovery_file}"' EXIT
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --silent --show-error --location \
    --output "${discovery_file}" "${DISCOVERY_URL}"
  printf '%s  %s\n' "${DISCOVERY_SHA256}" "${discovery_file}" \
    | sha256sum --check --strict
  sudo /usr/bin/env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    /bin/bash --noprofile --norc "${discovery_file}"
)
```

A download or checksum failure stops before execution. The trap removes the
temporary file on success or failure. Do not replace the immutable SHA URL,
checksum, clean environment or script; do not run any preparation, Compose,
Docker mutation, DNS, secret or deployment command as part of Step A.

## Server-staging guarded release

After Steps A–D pass and the second approval for Step E is recorded, an
operator must place a clean exact-SHA checkout at
`/opt/menorah-staging/app`, with the reviewed non-symlink environment file at
`/opt/menorah-staging/env/server-staging.env`. Then the only staging deploy
entry point is:

```bash
cd /opt/menorah-staging/app
readonly SERVER_STAGING_SHA='25cd808602020988a09ee9e58cc9d4738cc068c9'
COMPOSE_PROJECT_NAME=menorah-staging \
  MENORAH_STAGING_DEPLOY_ACK=DEPLOY_EXACT_MENORAH_STAGING_SHA \
  bash menorah/deploy/server-staging/deploy-exact-sha.sh \
  "${SERVER_STAGING_SHA}"
```

This is a future approved-host command, not an instruction to run now. The
script fail-closes on the wrong project, unsafe process authority, noncanonical
environment file, dirty or wrong checkout, unexpected recovery markers,
unrecorded artifacts and unhealthy services. It uses the exact project
`menorah-staging`; it must never be adapted to target a production project.

If deployment is interrupted after the recorded migration boundary, keep
writers stopped and preserve the recovery marker. The only exact-candidate
resume is:

```bash
cd /opt/menorah-staging/app
readonly SERVER_STAGING_SHA='25cd808602020988a09ee9e58cc9d4738cc068c9'
COMPOSE_PROJECT_NAME=menorah-staging \
  MENORAH_STAGING_RECOVERY_ACK=RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION \
  bash menorah/deploy/server-staging/resume-post-migration.sh \
  "${SERVER_STAGING_SHA}"
```

Do not rerun the migration, delete a marker, rebuild an image, pull a moving
tag, start a writer manually or substitute another SHA.

## Required inputs

The change record must contain no secrets and must identify:

- exact reviewed lowercase 40-character release SHA;
- reviewed remote release branch whose tip is that SHA;
- previous deployed SHA;
- focused commit list and final QA evidence;
- approved migration SHA (the same release SHA);
- maintenance start/end and stakeholder notification;
- non-secret change reference;
- latest backup/restore evidence;
- expected smoke tests and named owners;
- pre-migration rollback and post-migration recovery decisions;
- incident and abort contacts.

Production environment, Tunnel, LiveKit and tested Alertmanager destination
files remain operator-controlled outside Git. Compare variable **names** to
[the environment reference](./22-environment-variable-reference.md); never
copy their values into the record.

## Pre-release stop/go gate

Do not open maintenance unless all are true:

- candidate SHA is immutable, reviewed, remotely synchronized and has a clean
  checkout;
- stable release-readiness and security checks pass for that SHA;
- all required builds, tests and audits are recorded, including failures and
  skips;
- configuration validation succeeds without printing values;
- production Compose, Tunnel, Caddy, monitoring and shell validation pass;
- current deployment/recovery markers are internally consistent;
- no active incident, restore or another deployment owns the maintenance lock;
- all host backup timers are enabled and active;
- a fresh encrypted backup verifies and the candidate restore test is within
  24 hours;
- off-host backup and key custody meet the approved plan;
- migrations and compatibility boundary are reviewed;
- external Alertmanager delivery and on-call ownership are evidenced;
- live Cloudflare routes, DNS/TLS, firewall, logging and monitoring are
  verified;
- the go/no-go record has no open P0.

If any item is unavailable, the result is **NO-GO**. Do not edit evidence or
configuration merely to bypass the guard.

## Operator preparation

On the production host, from the repository:

```bash
cd /opt/menorah/menorah-mobile-app-
export DEPLOY_BRANCH='release/reviewed-release-name'
export DEPLOY_RELEASE_SHA='<reviewed-full-40-character-sha>'
export DEPLOY_MIGRATION_APPROVED_SHA="${DEPLOY_RELEASE_SHA}"
export DEPLOY_CHANGE_REFERENCE='change-YYYY-NNN'
```

These values are identifiers, not secrets. Confirm the two SHA variables are
identical. Fetch only the reviewed branch reference and compare its exact tip:

```bash
git fetch --prune origin \
  "+refs/heads/${DEPLOY_BRANCH}:refs/remotes/origin/${DEPLOY_BRANCH}"
git rev-parse "refs/remotes/origin/${DEPLOY_BRANCH}"
printf '%s\n' "${DEPLOY_RELEASE_SHA}"
```

If the tip moved, stop and review the new candidate. Never replace the approved
SHA just to make the script pass.

Existing hosts adopting the guarded tooling for the first time must use the
reviewed-blob procedure in the detailed production update runbook. That is a
one-time `INFRASTRUCTURE ACTION`, not a second release method.

## Guarded release sequence

Run once:

```bash
bash menorah/deploy/ubuntu/update-from-git.sh
```

The reviewed script must:

1. acquire the shared deployment/rollback lock, verify the reviewed branch tip
   and exact SHA, and transfer control under that lock to the exact candidate
   updater Git blob when the predecessor tooling differs;
2. verify host files, clean checkout, fast-forward ancestry, migration approval
   and recovery markers, then capture checksum-bound predecessor artifacts
   before any candidate build can replace mutable tags;
3. detach at the reviewed SHA and validate rollback-compatible loopback
   endpoints, the existing application network/static address, exact runtime
   directory ownership/modes and existing managed MongoDB identity safety
   without writes, authenticating configured credentials and reporting
   candidate-managed identities that are absent; atomically create and
   authenticate only a missing backup identity before backup;
4. create a fresh manual backup, verify it and restore that exact archive into
   the isolated restore-test database;
5. verify host backup/restore timers and retire unsupported continuous backup
   containers;
6. render Compose, validate Caddy and startup configuration, validate the
   external Alertmanager delivery file, build application images and pull
   digest-pinned third-party images;
7. record content-addressed image IDs in a checksum-protected release manifest;
8. enter maintenance, stop every API/worker writer and record the
   `writers-stopped` phase;
9. only after writers are stopped, collision-check and copy legacy media into
   the shared namespace without deleting predecessor copies, and preserve a
   checksum-bound transition manifest;
10. write the identity-reconciliation marker, idempotently create missing
     candidate-managed identities, reconcile exact MongoDB roles without routine
     password rotation, validate the separate least-privilege monitoring
     identity, and clear the marker only after the complete identity set passes;
     candidate programs use cleaned mode-0600 `mongosh --file` execution so
     script errors cannot be swallowed by stdin REPL behavior;
11. write the migration-in-progress marker and run the approved migration once
    using the checksum-recorded candidate API image identity, with pulling and
    rebuilding disabled;
12. after the command succeeds, establish durable post-migration recovery
    authority before recording migration completion or removing the
    in-progress marker, and retain that recovery state until release completion;
13. start the recorded artifacts without rebuilding or pulling and verify each
    running container matches the image manifest;
14. require local and public health checks, then label-verify and remove only
    the retired predecessor Promtail/cAdvisor containers;
15. update `current-sha` and `last-good-sha` only after all prior checks pass,
    and retain the completed release record, backup identity, migration state,
    media evidence, artifact checksum and health result.

The identity-provisioning/reconciliation order is security-critical: the
pre-backup scope can create only one atomic backup user and immediately proves
its configured credential. Every other identity or role change cannot race
active writers, and monitoring access must be proven before migration. An
interrupted full create or role update retains its durable recovery marker;
changed credential inputs fail closed on retry. Release-workflow regression
tests must reject moving the full boundary before writer-stop or after
migration.

## Monitoring-specific post-start checks

The operator must verify without exposing secrets:

- all application readiness endpoints and Blackbox probes are healthy;
- all 14 intended Prometheus scrape jobs have expected targets;
- Alloy and Loki are healthy and recent non-sensitive logs are queryable;
- Docker exporter collection succeeds for the intended Compose project;
- raw Docker inspect, log, archive, export and mutation routes remain denied;
- bounded running/restart/start-time/memory series cover expected services;
- backup marker and restore-test evidence are current;
- audit checkpoint invalidity, queue overflow, pending/write failures and admin
  permission denial have viable alert paths;
- approved Alertmanager receiver delivery, repeat and resolved behavior works;
- no alert or log contains a credential or prohibited sensitive field.

The project-scoped metrics gateway is a trusted root-equivalent component
because it holds the Docker socket. Only that component may hold the socket;
the exporter and Alloy must not.

## Application smoke checks

Use pre-approved, synthetic smoke accounts and provider test mode only:

- user and counsellor authentication plus token-role isolation;
- admin authentication, MFA and least-privilege denial;
- bounded unassigned-booking preview;
- paid/authorized atomic assignment;
- booking price from the server;
- payment initiation remains gated unless separately approved;
- provider test event and reconciliation when in scope;
- user/counsellor call and chat authorization;
- account deletion/privacy request entry points;
- public web, admin and counsellor routes;
- deep links and external association files where the release includes mobile.

Do not perform a real charge or expose production user data in evidence.

## Failure boundaries

### Before writers stop

The guarded script may restore the checkout to the recorded previous SHA.
Investigate the validation, build, backup or configuration failure before
retrying. Confirm `HEAD`, `current-sha` and the clean worktree agree.

### After writers stop but before migration completion

Keep writers stopped. If neither the identity nor migration marker exists and
no migration was applied, the guarded rollback may restore the checksum-bound
recorded `current-sha` artifacts; the media transition retained every legacy
copy. If `mongo-identity-reconciliation-in-progress-sha` exists, complete and
verify exact candidate identity provisioning/reconciliation under an approved
recovery change with `recover-managed-mongo-identities.sh`; that tool keeps
writers stopped, idempotently completes missing identities and clears the
marker only after an exact-role dry-run passes. If
`migration-in-progress-sha` exists, normally treat the database as potentially
partially migrated. The sole exception is when that marker,
`migration-applied-sha` and `post-migration-recovery-sha` are all strict
same-candidate markers: the guarded resume may validate that exact crash window
and continue recorded artifacts without rerunning migration. Do not delete or
rewrite a marker, restart writers or run a migration manually. Any other state
must use the coordinated recovery path.

### After migration completion

Do not perform an automatic code-only rollback to an older incompatible SHA.
An operational startup/health interruption must retain
`post-migration-recovery-sha`; resume only the recorded candidate artifacts
with `resume-post-migration-release.sh`. That guard binds the image manifest
path/digest and every local image plus the media-transition manifest
path/digest, and never reruns migration. Use a reviewed forward fix or
coordinated database restore when that exact candidate is not safe to resume.

### After start or health failure

Preserve image, release, log, alert and marker evidence. Do not rebuild a
different artifact under the same release identity. Apply the appropriate
rollback/recovery decision from
[09-rollback-runbook.md](./09-rollback-runbook.md).

## Release evidence

Preserve, with restricted access:

- exact branch/SHA and review/CI links;
- release JSON and checksum-protected image manifest;
- backup archive identity, checksum/signature result and restore evidence;
- migration marker/ledger and invariant result;
- configuration validation result containing names/status only;
- target, probe, alert-delivery and log-retention evidence;
- smoke-test results by suite;
- incident/exception references;
- operator and approver names/timestamps.

Do not store secret values, database extracts, access tokens, private keys,
clinical detail or unredacted logs in the repository.

## Completion and handoff

A release attempt is not complete until:

- the guarded script records phase `complete`;
- migration status is `applied` or `already-applied`;
- artifact identity and health status pass;
- post-release smoke and monitoring checks are signed;
- the change record lists every skipped or failed item;
- incident/on-call ownership returns to normal operations;
- the next backup and monitoring cycles remain healthy.

If these conditions are not met, the release remains an active failed change,
not a success hidden behind partial service availability.
