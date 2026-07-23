# Production release runbook

Last reviewed: 2026-07-24.

## Status and authority

This handover document describes the production sequence; it does not authorize
execution. The current verdict is **NOT READY**.

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

The repository-controlled runtime candidate is
`3fb99858c6766a341bb7b7dab2377195427f0ea1` on
`release/final-production-readiness`. Its exact-SHA release-readiness,
functional aggregate and security aggregate workflows pass. This identity
does not satisfy the remaining pre-release stop/go items below and does not
authorize execution.

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
