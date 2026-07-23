# Production rollback and coordinated recovery runbook

Last reviewed: 2026-07-23.

## Status and authority

The public-release verdict is **NOT READY**. This runbook describes an
operator procedure; it is not evidence that rollback or recovery has been
exercised on the production host. No production rollback, migration, restore,
traffic change or live health test was performed while preparing it.

The only authoritative deployment and rollback tooling is under
`menorah/deploy/ubuntu/`. GitHub Actions performs readiness validation and does
not deploy. Run these procedures only on the approved Ubuntu host, from the
approved checkout, under a recorded incident or change.

Required roles:

- release/incident lead: owns the decision and timeline;
- infrastructure operator: runs the guarded tooling;
- database/recovery reviewer: decides schema compatibility;
- application owner: validates business invariants;
- security/privacy/finance/clinical owners: join when their data or flows may
  be affected.

Do not use `git reset --hard`, start containers manually, run migrations
separately, delete state markers, rebuild a historical release, or restore a
database selected merely because it is the newest file.

## Decide which path applies

| Observed boundary | Required path | Forbidden action |
| --- | --- | --- |
| Failure occurred before a migration started, no partial migration marker exists, and the recorded target is schema-compatible | Guarded pre-migration code/artifact rollback | Rebuilding, pulling or choosing an unrecorded target |
| `mongo-identity-reconciliation-in-progress-sha` exists | Complete and verify exact candidate identity provisioning/reconciliation with writers stopped | Code rollback, clearing the marker by hand or starting writers |
| `migration-in-progress-sha` exists and it, `migration-applied-sha` and `post-migration-recovery-sha` are strict same-candidate markers | Let the guarded resume validate the exact proven-applied crash window | Rerunning migration, code rollback or editing a marker to create agreement |
| Any other `migration-in-progress-sha` state, or migration completion is uncertain | Coordinated incident recovery with writers stopped | Code-only rollback or manually removing the marker |
| `migration-applied-sha` identifies a release other than the rollback target | Forward repair or coordinated post-migration database/media recovery | Starting older code against the migrated database |
| `post-migration-recovery-sha` exists and the recorded candidate remains approved | Guarded exact-artifact post-migration resume | Rerunning migration, rebuilding, pulling or selecting another SHA |
| `production-restore-in-progress.json` or `production-restore-requires-review.json` exists | Continue the restore/review workflow | Starting writers or invoking code rollback |
| Target artifact metadata, manifest, checksum or local image is missing | Rebuild a reviewed forward fix; treat recovery as unavailable | Recreating or guessing historical artifacts |

When evidence is ambiguous, use the more conservative post-migration path.

## Preserve evidence before intervention

Create an incident/change record and capture, without secret values or personal
data:

- UTC detection time, reporter, symptoms and user impact;
- exact current checkout SHA and intended recovery SHA;
- release record phase and the names/content hashes of applicable state files;
- running container names, image IDs, health state and restart counts;
- relevant alert graphs, target state and bounded logs;
- backup-health result and the exact signed archive/restore-test identifiers if
  recovery may require a restore;
- every decision, approver, command, result and hand-off.

Do not copy environment files, tokens, connection strings, audit signing
material, backup keys, user records or unredacted logs into the incident record.

The guarded tools use a shared deployment lock. If the lock is held, find the
active deployment, bootstrap, rollback or restore owner; do not bypass it.

## Path A: pre-migration code and artifact rollback

### Entry gate

All of the following must be true:

- [ ] An incident/change reference and rollback owner exist.
- [ ] The worktree is clean and the current SHA is recorded.
- [ ] No migration is in progress.
- [ ] No production restore is in progress or awaiting review.
- [ ] The script-selected target is understood: `current-sha` for an
      interrupted candidate checkout, or `last-good-sha` after a completed
      release. If a durable rollback-in-progress marker exists, its exact
      recorded target is reused on retry.
- [ ] The target has complete healthy release JSON, image manifest and manifest
      checksum evidence under `/opt/menorah/deploy-state/releases/`.
- [ ] Every manifest image ID is still present locally.
- [ ] The database schema is compatible with that target. If a migration marker
      exists, it identifies the same target SHA.
- [ ] Backup health and the current recovery posture have been reviewed. The
      daily backup and isolated restore evidence must each be no older than 24
      hours for a recovery-ready production system.

### Execute

From the repository root on the approved host:

```sh
cd /opt/menorah/menorah-mobile-app-
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

The script, not the operator, resolves the target. It:

1. acquires the shared deployment lock;
2. refuses identity/migration/restore conflicts, a dirty tree or an invalid
   target, and preserves a durable rollback target for an idempotent retry;
3. validates release metadata, the image manifest and its checksum;
4. verifies every content-addressed image exists locally;
5. checks out the exact target in detached state;
6. recreates only the recorded release services with `--no-build --pull never`;
7. verifies each running container uses its recorded image ID;
8. reloads Caddy and runs local and public health checks; and
9. updates `current-sha` only after those checks pass.

If the script refuses, do not weaken a gate. Move to coordinated recovery or a
reviewed forward fix.

### Validate and close

- [ ] Script output records the exact target SHA and successful local/public
      health.
- [ ] Critical login, authorization, booking, payment-read, call/chat and admin
      smoke checks pass using approved non-production test identities.
- [ ] MongoDB, Redis, worker, certificate, backup and security-audit signals are
      healthy.
- [ ] Payment and payout feature gates remain in their approved state.
- [ ] The incident lead confirms no incompatible data was written during the
      failed release.
- [ ] Monitoring shows no recurrence through the owner-approved observation
      window.
- [ ] The incident record links the release metadata and retained evidence.

Rollback is not complete merely because containers are running.

## Path B: migration in progress or uncertain

If `/opt/menorah/deploy-state/mongo-identity-reconciliation-in-progress-sha`
exists before migration, keep writers stopped and use the exact clean candidate
checkout only:

```sh
MENORAH_MONGO_IDENTITY_RECOVERY_CONFIRM=RECOVER_RECORDED_MONGO_IDENTITIES \
  bash menorah/deploy/ubuntu/recover-managed-mongo-identities.sh
```

The guarded tool verifies its candidate blob and state, idempotently completes
missing candidate-managed identities, applies exact roles, then read-only
verifies the complete set. It never migrates or starts writers. Only after it
clears the marker may the incident lead reassess artifact rollback versus a
reviewed release retry.

If `/opt/menorah/deploy-state/migration-in-progress-sha` exists, assume the
database may be partially changed unless the guarded resume itself validates
the one proven-applied crash window: in-progress, applied and post-migration
recovery markers are strict files containing the same candidate SHA, with the
exact checkout, metadata, media and image evidence intact. Never create that
agreement manually.

1. Keep `api-ios`, `api-android`, `api-web`, `api-admin` and `worker` stopped.
2. Drain or block public write traffic through an approved infrastructure
   change.
3. Appoint an incident lead and database recovery reviewer.
4. Preserve the migration marker, migration output, current release record,
   database health and backup evidence.
5. If the three strict markers agree, use Path C and allow the guarded resume to
   prove eligibility; it will not rerun migration.
6. Otherwise, determine whether an idempotent reviewed forward migration can
   safely complete. Test the proposed path against an isolated copy first.
7. If forward completion is unsafe, use coordinated restore/recovery. Never
   delete the marker simply to make rollback run.

## Path C: post-migration coordinated recovery

A code-only rollback to an older incompatible release is intentionally blocked
after migration. When `post-migration-recovery-sha` identifies an operational
startup/health failure and the exact recorded candidate remains approved, use
the guarded resume first:

```sh
cd /opt/menorah/menorah-mobile-app-
MENORAH_POST_MIGRATION_RECOVERY_CONFIRM=RESUME_RECORDED_RELEASE \
  bash menorah/deploy/ubuntu/resume-post-migration-release.sh
```

It verifies the exact checkout/tree, migration state, release metadata, image
manifest path/digest and every recorded image, plus the media-transition
manifest path/digest. It neither rebuilds/pulls nor runs a migration, and it
stops writers again on failure. Otherwise choose one reviewed strategy:

1. **Forward repair, preferred when safe:** prepare and review a compatible
   release, test its migration against isolated data, then use
   `update-from-git.sh` with the exact approved SHA.
2. **Database and media recovery:** restore one explicitly selected signed
   backup through
   [the backup and restore runbook](./10-backup-and-restore-runbook.md).

Production restore entry requires, at minimum:

- an approved incident/change reference and external traffic drain;
- the exact current and backup release SHAs;
- independently reviewed source and sanitized archive SHA-256 digests;
- valid signed provenance and encrypted database/media artifacts;
- a successful isolated restore record for the same source archive no older
  than 24 hours;
- an allowlisted sanitized artifact containing only `menorah.*`;
- a fresh quiesced pre-restore backup; and
- explicit owner, infrastructure, database, privacy and affected-domain
  approval.

The production restore keeps writers stopped, verifies the non-Menorah control
plane is unchanged, publishes verified media with a rollback path, removes the
old migration marker, and creates
`production-restore-requires-review.json`. A database/schema reviewer must then
acknowledge the exact archive and sanitized digests:

```sh
RESTORE_RECOVERY_CONFIRM=ACKNOWLEDGE_SCHEMA_AND_MIGRATION_REVIEW \
RESTORE_RECOVERY_APPROVED_RELEASE_SHA=<approved-40-character-sha> \
RESTORE_RECOVERY_REVIEW_REFERENCE=<approved-review-reference> \
RESTORE_RECOVERY_ARCHIVE_SHA256=<reviewed-source-sha256> \
RESTORE_RECOVERY_SANITIZED_SHA256=<reviewed-sanitized-sha256> \
  bash menorah/deploy/ubuntu/acknowledge-production-restore.sh
```

That acknowledgement does not start writers. Run the guarded exact-SHA update
workflow afterward so approved migrations execute once before services restart.
Retain the pre-restore media rollback path until application, privacy and
incident owners accept the recovered state.

## Failure escalation

Stop and escalate when:

- health checks fail after artifact rollback;
- state files disagree with the checkout or release record;
- a signed digest, HMAC, media manifest or restore-test record does not match;
- backup or restore evidence is older than 24 hours;
- the non-Menorah control-plane fingerprint changes;
- writers restart before schema review;
- an identity, migration, post-migration recovery or rollback-in-progress
  marker disagrees with the checkout/release metadata;
- payment, payout, authorization or audit-ledger invariants fail; or
- the operator cannot explain the current migration/restore state.

Do not “repair” evidence by editing marker files or audit data. Preserve the
state and follow [the incident response runbook](./11-incident-response-runbook.md).

## Evidence still required

- `INFRASTRUCTURE ACTION`: exercise Path A on an isolated Linux staging host
  using recorded immutable artifacts.
- `INFRASTRUCTURE ACTION`: exercise Path C with disposable data and managed
  media, including failed checks and cleanup.
- `OWNER ACTION`: approve RTO/RPO, decision authority and observation windows.
- `PRIVACY ACTION` and `LEGAL ACTION`: approve recovery-data handling and
  retention.
- `VAPT ACTION`: review the release/recovery boundary and closure evidence.

Until those actions are complete, recovery readiness remains unproved and the
verdict remains **NOT READY**.
