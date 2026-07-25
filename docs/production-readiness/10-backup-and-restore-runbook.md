# Production backup and restore runbook

Last reviewed: 2026-07-25.

## Status

The public-release verdict is **NOT READY**. The repository contains guarded
backup, integrity, isolated-restore and production-recovery tooling, but this
document does not prove that a live encrypted backup, off-site copy or
production-like restore has succeeded. No production backup or restore was run
while preparing this handover.

No backup or restore has been run on the shared Ubuntu server. The frozen
server-staging runtime candidate is
`1ecd0b379369258be466159364a8a48c79fb65aa`; prior local evidence for
`a1bc1b6ec751926edc9981f57762277060acf9e4` and
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` is retained only as superseded
history. At the frozen candidate, the local signed/encrypted backup
`20260725T125008Z` recovered all six writers, and its disposable restore
verified 18 collections, 59 documents, zero document failures and both media
manifests. This is Docker Desktop evidence only, not approved Ubuntu,
off-site-custody or production evidence.

The detailed implementation source is
[the production backup/restore runbook](../../menorah/docs/production-backup-restore-runbook.md).
This document is the release gate and operator checklist.

The dedicated server-staging implementation is under
`menorah/deploy/server-staging/`, principally:

- `run-consistent-backup.sh` and `backup-staging.sh`;
- `run-disposable-restore.sh` and `restore-staging.sh`; and
- the isolated roots `/opt/menorah-staging/backups`,
  `/opt/menorah-staging/data/backup-retrieval`,
  `/opt/menorah-staging/data/restore`,
  `/opt/menorah-staging/data/restore-media`, and
  `/opt/menorah-staging/deploy-state/recovery`.

These are not production backup or restore paths and must never be redirected
to production data, credentials, volumes, roots or replica sets.

## Server-staging approval boundary

Backup and restore evidence belongs to Step F of the ordered Step A–G model in
[29-server-staging-design-and-discovery-runbook.md](./29-server-staging-design-and-discovery-runbook.md):

1. Step A downloads the exact discovery blob to a temporary file, verifies
   SHA-256
   `b7ba1341ad78aa5698020ec040404c8418365481da2d7b0e7c105fae0d788a17`,
   executes only the verified read-only script and removes the file on exit.
2. Step B requires an explicit collision `PASS` and human approval.
3. Step C prepares only reviewed `/opt/menorah-staging` roots, environment,
   secrets, domains and provider settings.
4. Step D dry-renders and validates the overlay without starting it.
5. Step E requires a second human approval before exact-SHA deployment.
6. Step F proves Ubuntu ownership/readability, consistent backup, signed
   retrieval, disposable restore, interruption/recovery and alert/human
   response.
7. Step G removes only exact project `menorah-staging` and staging-labelled
   resources, verifies production invariance, preserves evidence, and requires
   separate explicit approval before deleting staging volumes.

Only Step A is currently eligible. The commands below are the future Step F
procedure after Steps A–E pass; they are not instructions to run now.

## Server-staging consistent backup

The host wrapper is the authoritative server-staging entry point:

```bash
cd /opt/menorah-staging/app
bash menorah/deploy/server-staging/run-consistent-backup.sh
```

It binds itself to project `menorah-staging`, environment identity
`menorah-server-staging-v1`, runtime SHA, database `menorah_staging`, replica
set `menorah-staging-rs`, exact roots, signing/encryption keys and backup
identity. It verifies all six application writers are stopped for the backup
window, creates the signed/encrypted set, retrieves it through the separate
retrieval path and recovers writers through the guarded lifecycle. A failure
does not become a usable backup and must leave evidence for review.

Record the returned timestamp without secret material. Never invoke
`backup-staging.sh` with hand-assembled production variables; the wrapper
supplies the reviewed staging acknowledgements and container boundary.

## Server-staging disposable restore

Restore one explicitly selected timestamp from the preceding successful
backup:

```bash
cd /opt/menorah-staging/app
readonly SERVER_STAGING_BACKUP_TIMESTAMP='<YYYYMMDDTHHMMSSZ>'
bash menorah/deploy/server-staging/run-disposable-restore.sh \
  "${SERVER_STAGING_BACKUP_TIMESTAMP}"
```

The wrapper targets only `staging-mongo-restore` in project
`menorah-staging`, replica set `menorah-staging-restore-rs`, and the isolated
restore database/media volumes. The restore must verify checksums, HMAC,
metadata identity, database collections/documents/indexes and both media
manifests. It must not alter the primary staging database, and it can never
select or restore a production archive.

A failed restore creates or preserves review state under
`/opt/menorah-staging/deploy-state/recovery`. Keep writers stopped when a
deploy/migration recovery marker also exists, preserve the marker, and follow
[09-rollback-runbook.md](./09-rollback-runbook.md). For an exact
post-migration code resume, the required acknowledgement is:

```text
MENORAH_STAGING_RECOVERY_ACK=RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION
```

Do not delete a recovery marker or claim restore success from decryption,
archive listing or partial database counts.

## Recovery object

Every usable recovery set must bind:

- a full-instance MongoDB archive captured with oplog consistency;
- an encrypted managed-uploads archive;
- a signed media manifest and media-reference report;
- signed metadata identifying the backup class, timestamps, exact deployed
  release and migration provenance;
- SHA-256 checksums; and
- an HMAC created with an integrity key distinct from the encryption password.

The full-instance source archive is evidence and recovery input; it is **never**
restored directly into production. The isolated restore process derives,
encrypts, signs and records a sanitized production artifact allowlisted to
`menorah.*`. Production recovery restores only that derived artifact.

Do not put archive keys, HMAC keys, MongoDB URIs, credentials, personal data,
media contents or environment-file output in tickets or repository files.

## Custody and approval

Assign before launch:

- backup operator and alternate;
- restore operator and alternate;
- database/schema reviewer;
- independent encryption/recovery-key custodian;
- off-site storage owner;
- privacy/legal retention owners; and
- incident/change approver for destructive recovery.

`BACKUP_ENCRYPTION_PASSWORD` and `BACKUP_INTEGRITY_HMAC_KEY` must be distinct,
host-protected values; the HMAC key must meet the repository-enforced minimum
length. No single person should control every archive and all recovery keys.

`OWNER ACTION`, `LEGAL ACTION` and `PRIVACY ACTION` must approve retention by
data category, off-site location, legal-hold behavior and deletion. Repository
defaults are operating parameters, not an approved retention policy.

## Schedule

Host systemd owns scheduling; the Compose backup service cannot be used as an
unreviewed direct backup path.

| Class | Intended schedule | Required evidence |
| --- | --- | --- |
| Six-hourly | Every six hours | timer result, encrypted/signed set and health marker |
| Daily | 02:30 UTC | encrypted/signed set; this is the hard freshness gate |
| Weekly | Sunday 03:00 UTC | encrypted/signed set and approved off-host copy |
| Monthly | First day 04:00 UTC | encrypted/signed set and approved off-host copy |
| Restore test | Daily | exact-source isolated restore record and sanitized artifact |
| Health/prune | Repository-defined timers | status, capacity and disposition record |

The latest daily backup must be no older than
`BACKUP_MAX_AGE_HOURS=24`. The successful restore-test evidence must also be no
older than 24 hours; production health validation refuses a restore-test
maximum above 24 hours or a disabled restore check. A grace period in an alert
does not relax either hard gate.

## Before every backup

- [ ] The approved backup filesystem is mounted, writable by the invoking host
      UID/GID and not silently falling back to root storage.
- [ ] Encryption and integrity keys are available through the protected host
      mechanism and are not printed.
- [ ] Database backup identity and media paths have the intended least
      privilege.
- [ ] Capacity, inode availability, time synchronization and systemd timer
      state are healthy.
- [ ] No deployment/backup lock conflict exists.
- [ ] The exact deployed release and migration state can be recorded.

## Create and validate a manual backup

Use a manual backup for a release/recovery gate; do not manufacture a scheduled
marker:

```sh
cd /opt/menorah/menorah-mobile-app-/menorah
bash deploy/ubuntu/backup-now.sh daily
bash deploy/ubuntu/check-backup-health.sh
```

The script also accepts the scheduled class labels below. Operators must use
them only for the corresponding approved schedule or replacement run; invoking
one manually does not prove that its systemd timer worked:

```sh
bash deploy/ubuntu/backup-now.sh six-hourly
bash deploy/ubuntu/backup-now.sh weekly
bash deploy/ubuntu/backup-now.sh monthly
```

Retain a redacted result containing timestamps, archive names/digests, release
SHA, backup class, host-readability result and exit status. Do not retain
command tracing or secret-bearing output.

## Isolated restore test

Run against the dedicated disposable restore environment:

```sh
cd /opt/menorah/menorah-mobile-app-/menorah
bash deploy/ubuntu/restore-latest-backup.sh restore-test
bash deploy/ubuntu/check-backup-health.sh
```

The test must establish:

- archive checksum and signed provenance match;
- database/tool/server/FCV compatibility is acceptable;
- oplog and release/migration metadata are valid;
- uploads, media manifest and reference digests match;
- restored database invariants pass;
- non-Menorah namespaces are excluded from the derived artifact;
- the sanitized `menorah.*` artifact is encrypted, checksummed and signed;
- the exact source-to-sanitized relationship is recorded; and
- the disposable container/volume is removed.

Treat cleanup failure as a security incident. Do not call a file “restorable”
because decryption or archive listing alone succeeds.

## Daily release gate

All items are mandatory:

- [ ] `check-backup-health.sh` exits successfully.
- [ ] The newest daily backup is at most 24 hours old.
- [ ] The newest successful isolated restore test is at most 24 hours old.
- [ ] The restore evidence refers to the same exact signed source archive and
      its matching sanitized artifact.
- [ ] The source and managed-media checksums/HMACs validate.
- [ ] The archive is readable by the host operator and stored on the intended
      mount.
- [ ] A current encrypted off-site copy exists under approved custody.
- [ ] Capacity and timer alerts are healthy.
- [ ] A dated evidence record identifies operator, release SHA and result
      without secrets or user data.

Missing or stale evidence is a launch and deployment blocker.

## Production restore: destructive recovery only

Use only for approved post-migration/corruption recovery after
[the rollback decision](./09-rollback-runbook.md) rejects code-only rollback.

### Entry gate

- [ ] Incident/change owner approves destructive recovery.
- [ ] Public traffic is drained and independently verified.
- [ ] Writers are or will be stopped by guarded tooling.
- [ ] One exact archive inside the configured backup root is selected; selection
      by “latest” is forbidden.
- [ ] The source archive and sanitized artifact digests were independently
      reviewed.
- [ ] The same source archive has successful signed isolated-restore evidence
      no older than 24 hours.
- [ ] Current and backup release SHAs are full reviewed 40-character SHAs.
- [ ] Database version/FCV, schema and migration path are reviewed.
- [ ] Managed-media archive, manifest, reference report and rollback capacity
      are verified.
- [ ] Backup and restore identities are separately authorized.
- [ ] Privacy/legal/finance/clinical owners have assessed affected records.

### Execute

Provide confirmations and reviewed identifiers through the protected operator
session; the placeholders below are not values:

```sh
cd /opt/menorah/menorah-mobile-app-/menorah

RESTORE_CONFIRM_PRODUCTION=RESTORE_PRODUCTION_WITH_DROP \
RESTORE_TRAFFIC_DRAIN_CONFIRM=DRAINED_PUBLIC_TRAFFIC \
RESTORE_EXPECTED_ARCHIVE_SHA256=<reviewed-source-sha256> \
RESTORE_EXPECTED_SANITIZED_SHA256=<reviewed-sanitized-sha256> \
RESTORE_EXPECTED_CURRENT_SHA=<current-40-character-sha> \
RESTORE_EXPECTED_BACKUP_GIT_SHA=<backup-40-character-sha> \
RESTORE_CHANGE_REFERENCE=<approved-change-or-incident-id> \
RESTORE_ARCHIVE=<exact-encrypted-source-archive> \
  bash deploy/ubuntu/restore-latest-backup.sh production
```

The guarded path:

1. acquires deployment and backup locks in the defined order;
2. rejects unresolved migration/restore state;
3. revalidates source, media, checksum, HMAC and <=24-hour restore evidence;
4. stops `api-ios`, `api-android`, `api-web`, `api-admin` and `worker`;
5. takes a fresh quiesced manual pre-restore backup;
6. fingerprints non-Menorah control-plane data;
7. restores only the derived `menorah.*` artifact with drop semantics;
8. verifies the control-plane fingerprint is unchanged;
9. publishes verified managed media while retaining a rollback path;
10. clears the old applied-migration marker; and
11. leaves writers stopped with
    `production-restore-requires-review.json`.

Do not restart services after the restore script exits.

### Schema review and restart

The reviewer confirms exact digests, namespace allowlist, database invariants,
media state, approved recovery release and migration sequence. Then run:

```sh
RESTORE_RECOVERY_CONFIRM=ACKNOWLEDGE_SCHEMA_AND_MIGRATION_REVIEW \
RESTORE_RECOVERY_APPROVED_RELEASE_SHA=<approved-40-character-sha> \
RESTORE_RECOVERY_REVIEW_REFERENCE=<approved-review-reference> \
RESTORE_RECOVERY_ARCHIVE_SHA256=<reviewed-source-sha256> \
RESTORE_RECOVERY_SANITIZED_SHA256=<reviewed-sanitized-sha256> \
  bash deploy/ubuntu/acknowledge-production-restore.sh
```

Acknowledgement records history and removes the review marker, but writers
remain stopped. Run `deploy/ubuntu/update-from-git.sh` for the exact approved
SHA so migrations execute once and health gates control startup.

## Acceptance and evidence

- [ ] Local and public health checks pass after the guarded update.
- [ ] Database, media, booking, payment, payout, privacy and authorization
      invariants pass.
- [ ] Security-audit continuity is reviewed; evidence is not edited to hide a
      gap.
- [ ] Backup health returns green with a new post-recovery recovery set.
- [ ] The pre-restore backup and media rollback path remain protected until
      formal acceptance.
- [ ] Incident owner, database reviewer and affected-domain owners sign the
      record.
- [ ] Recovery timing is compared with approved RTO/RPO.

## Evidence still required

- `INFRASTRUCTURE ACTION`: prove live host ownership/mount behavior and
  encrypted backup completion.
- `INFRASTRUCTURE ACTION`: prove an isolated database and media restore from a
  production-format archive.
- `INFRASTRUCTURE ACTION`: prove encrypted off-site copy, retrieval and key
  recovery.
- `OWNER ACTION`: approve RTO, RPO, retention and custodians.
- `LEGAL ACTION` and `PRIVACY ACTION`: approve retention, legal holds,
  locations, processor handling and disposal.
- `VAPT ACTION`: assess archive confidentiality/integrity and destructive
  recovery controls.

None of those live or external actions is claimed complete here.
