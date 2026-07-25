# Server-staging backup, restore, migration and recovery

Runtime candidate SHA: `1ecd0b379369258be466159364a8a48c79fb65aa`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Approved Ubuntu/server-staging state: **NOT COLLECTED — DISCOVERY REQUIRED**

The candidate completed a local-Docker backup/restore rehearsal: backup
timestamp `20260725T125008Z`, all six application writers stopped and then
restarted to their prior state, and 18 collections / 59 synthetic documents
restored with 0 failures into the dedicated disposable target. Phase 11
overall passed 22/22 gates, 0 failed and 0 blocked. This evidence is local-only;
it does not prove server ownership, off-host custody, timers, contention,
achieved server RPO/RTO or a human-reviewed interruption drill.

This procedure is governed by the
[server-staging design and discovery runbook](../29-server-staging-design-and-discovery-runbook.md).
Do not execute it before the Step A discovery, Step B collision pass/approval,
Step C preparation and Step D dry-render pass/second approval. No server step
has occurred.

## Dedicated recovery authority

Only the scripts under `menorah/deploy/server-staging/` are authoritative for
server staging:

| Operation | Dedicated entry point |
| --- | --- |
| Exact-SHA deployment/migration orchestration | `deploy-exact-sha.sh` |
| Consistent writer-quiesced backup | `run-consistent-backup.sh` |
| Disposable database/media restore | `run-disposable-restore.sh` |
| Recorded pre-migration rollback | `rollback-recorded.sh` |
| Exact proven-applied post-migration resume | `resume-post-migration.sh` |
| Candidate-bound migration (called by deploy orchestration) | `run-recorded-migration.sh` |
| Runtime/manifest verification | `verify-runtime-services.sh` |

Do not use production Compose files or `menorah/deploy/ubuntu/*` production
backup, restore, migration, rollback, resume or identity helpers. Former
`/srv/menorah-staging`, `/etc/menorah-staging` and production-script
instructions are superseded.

## Exact isolation contract

- Compose project: `menorah-staging`.
- Application checkout: `/opt/menorah-staging/app`.
- Protected environment:
  `/opt/menorah-staging/env/server-staging.env`.
- Data: `/opt/menorah-staging/data`.
- Backup bundles: `/opt/menorah-staging/backups`.
- Retrieval: `/opt/menorah-staging/data/backup-retrieval`.
- Disposable database restore:
  `/opt/menorah-staging/data/restore`.
- Disposable media restore:
  `/opt/menorah-staging/data/restore-media`.
- Deployment/recovery markers and locks:
  `/opt/menorah-staging/deploy-state`.
- Logs: `/opt/menorah-staging/logs`.
- Source database/replica set: `menorah_staging` /
  `menorah-staging-rs`.
- Restore replica set: `menorah-staging-restore-rs`.
- Mongo identities are distinct for root, app, migration, backup, restore and
  monitoring; Redis uses the dedicated `menorah-staging-app` ACL identity.

All paths must be canonical existing non-symlink staging roots. The operation
must stop if a root, URI, replica set, service label, marker, lock or manifest
does not exactly match the reviewed staging identity. There are no host
MongoDB or Redis ports.

## Preconditions

Before any rehearsal:

1. record both discovery/collision approvals from runbook 29;
2. prove production inventory is unchanged and every target belongs to exact
   project `menorah-staging`;
3. validate the environment and isolation model without printing values;
4. prove the checkout, script blob, manifest and digest-qualified images bind
   to the exact requested SHA;
5. confirm backup encryption/signing keys are protected staging-only inputs;
6. confirm restore targets are disposable staging volumes/replica sets;
7. name the database/recovery operator, independent reviewer and abort owner;
8. preserve current/last-good/migration/recovery marker evidence; and
9. block provider, production, real-person and live-payment data from the
   exercise.

A missing, ambiguous or symlinked root/marker is a P0 stop condition. Never
delete or rewrite a marker merely to make a command start.

## Backup rehearsal

After approval, invoke only the top-level consistent-backup wrapper from the
clean exact-SHA checkout:

```bash
cd /opt/menorah-staging/app
/opt/menorah-staging/app/menorah/deploy/server-staging/run-consistent-backup.sh
```

The wrapper, not the operator, establishes the one-shot backup/root/writer
acknowledgements. It must:

- identify exactly one container for each of the six reviewed writer services;
- stop them before the backup and restore their prior state afterward;
- take a replica-set-consistent dump using only the staging backup identity;
- include uploads and managed media;
- encrypt and authenticate/sign the complete bundle;
- write immutable metadata/digests and a safe `LATEST` pointer;
- traverse the created bundle through the staging retrieval root; and
- remove incomplete artifacts/locks on the defined paths without touching
  another project.

Retain redacted UTC start/end time, exact runtime SHA, source identities,
archive/media digests, crypto verification, writer timeline, achieved age,
size, custody target and reviewer. Do not retain credentials or record
content.

## Disposable restore rehearsal

Select an explicit reviewed `YYYYMMDDTHHMMSSZ` bundle and invoke only:

```bash
cd /opt/menorah-staging/app
/opt/menorah-staging/app/menorah/deploy/server-staging/run-disposable-restore.sh \
  '<reviewed-YYYYMMDDTHHMMSSZ>'
```

Replace the placeholder before execution. The wrapper must validate encrypted
bundle metadata/digests before restore, start only the dedicated
`staging-mongo-restore` target, initialize only
`menorah-staging-restore-rs`, restore only into `menorah_staging`, verify
document/media counts and digests, and return the disposable target to its
reviewed stopped/clean state. It must never target the live staging replica
set, any production service or any host database port.

Pass evidence includes exact bundle timestamp, source/retrieval/custody
digests, source and restored synthetic counts, media comparison, duration,
target project/service/replica set and independent review. Any failed document
or unexplained count/digest difference is P0.

## Migration contract

Do not run `run-recorded-migration.sh` manually to obtain a passing result.
The exact-SHA deploy wrapper owns datastore prerequisites, initializer state,
writer stopping, immutable image manifest, recorded migration and
post-migration recovery marker.

Required evidence:

- candidate and migration checksum/manifest binding;
- current/last-good and predecessor identity;
- database/replica-set and migration-role identity;
- writer-stop and prerequisite health timeline;
- every migration applied/skipped result and invariant count;
- durable migration-in-progress, applied and recovery markers;
- exact failure injection point and resulting state;
- safe resume/rollback/forward-fix decision; and
- application health before any writer resumes.

## Recovery decision matrix

| ID | Controlled state | Required action | Pass condition | Server state |
| --- | --- | --- | --- | --- |
| `REC-001` | Fresh consistent backup | Run dedicated wrapper | Signed/encrypted bundle, media, metadata and retrieval copy validate; writers recover | NOT COLLECTED |
| `REC-002` | Tampered dump/media/metadata | Verify before restore | Restore refuses before mutation | NOT COLLECTED |
| `REC-003` | Wrong key or signature | Verify before restore | Fail closed without plaintext residue or target mutation | NOT COLLECTED |
| `REC-004` | Disposable restore | Run exact timestamp | Source/restore counts and media digests agree; target is isolated | NOT COLLECTED |
| `REC-005` | Concurrent backup/deploy/rollback/restore | Start bounded competing operation | Locks refuse concurrency without corrupting first operation | NOT COLLECTED |
| `REC-006` | Failure before writer stop | Preserve record; review rollback | No datastore mutation; predecessor remains coherent | NOT COLLECTED |
| `REC-007` | Failure after writer stop, before migration | Recorded pre-migration rollback | Exact manifest artifacts recover; no pull/build substitute | NOT COLLECTED |
| `REC-008` | Migration interrupted before proven completion | Keep writers stopped | Older code is refused; marker persists for reviewed forward/restore path | NOT COLLECTED |
| `REC-009` | Exact proven-applied migration, deploy crash | Exact-SHA resume | Recorded images start without migration rerun/pull/build | NOT COLLECTED |
| `REC-010` | Failure after migration outside strict resume state | Keep writers stopped | No unsafe code rollback; reviewed forward fix/restore only | NOT COLLECTED |
| `REC-011` | Rollback interrupted | Re-run exact recorded target | Durable target reused; no target reselection | NOT COLLECTED |
| `REC-012` | Manifest/image digest altered or unavailable | Run recovery preflight | Operation refuses; mutable tags/rebuilds cannot substitute | NOT COLLECTED |
| `REC-013` | Wrong project/root/URI/role/replica set | Run context guard | Operation refuses before mutation | NOT COLLECTED |
| `REC-014` | RPO/RTO drill | Time backup retrieval and restore | Achieved values recorded; owner decides against approved objectives | NOT COLLECTED |
| `REC-015` | Production-collision canary | Compare before/after inventories | Production project/resources remain byte-for-byte/ID-set unchanged | NOT COLLECTED |
| `REC-016` | Host restart/timer recovery | Approved bounded restart | Exact project resumes safely; timers/locks/markers remain coherent | NOT COLLECTED |
| `REC-017` | Safe removal | Exact staging down/verification | Only staging-labelled resources stop; volume deletion separately approved | NOT COLLECTED |

Local evidence for `REC-001` and `REC-004` must remain labelled local-only and
does not change these server rows.

## Recorded rollback

Rollback is allowed only for a reviewed pre-migration/schema-compatible target
already present in the immutable release state. The checkout must already be
at the exact recorded target and the process-authority guard must pass:

```bash
COMPOSE_PROJECT_NAME=menorah-staging \
MENORAH_STAGING_ROLLBACK_ACK=ROLLBACK_MENORAH_STAGING_RECORDED_ARTIFACTS \
  /opt/menorah-staging/app/menorah/deploy/server-staging/rollback-recorded.sh \
  '<reviewed-full-recorded-target-sha>'
```

Do not use this path once migration state is uncertain or proven applied.
Do not pull, rebuild, change a manifest, select a different target, delete a
marker or restore a database as an improvised code rollback.

## Exact post-migration resume

Resume is permitted only when the candidate script proves all applied,
recovery, checkout, manifest, image and marker preconditions for the same full
SHA. The exact acknowledgement is:

```text
MENORAH_STAGING_RECOVERY_ACK=RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION
```

After recorded approval:

```bash
COMPOSE_PROJECT_NAME=menorah-staging \
MENORAH_STAGING_RECOVERY_ACK=RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION \
  /opt/menorah-staging/app/menorah/deploy/server-staging/resume-post-migration.sh \
  '1ecd0b379369258be466159364a8a48c79fb65aa'
```

This is not a generic bypass. If any strict precondition fails, writers remain
stopped pending a reviewed forward fix or coordinated disposable-source
restore plan.

## Server evidence completion

The server recovery gate remains **NOT COLLECTED** until the approved Ubuntu
run supplies:

- root ownership/mode/symlink and process-authority proof;
- encrypted/signed backup and approved off-host custody/retrieval;
- disposable database and media restore with independent comparison;
- migration, interruption, crash-resume and rollback cases above;
- systemd/timer schedule, lock and restart behavior;
- bounded production-contention observation without production mutation;
- exact production before/after inventory invariants; and
- achieved RPO/RTO with named owner acceptance or explicit no-go.

Until then, recovery status is **STAGING NO-GO** and production remains
**NOT READY**.
