# Production Backup And Restore Runbook

Production backups live under:

```text
MENORAH_BACKUP_ROOT=/mnt/menorah-backups
```

For production, `/mnt/menorah-backups` should be a RAID1 mirror across the two backup HDDs, encrypted with LUKS and mounted by UUID.

Directory layout:

```text
manual/
six-hourly/
daily/
weekly/
monthly/
metadata/
  integrity-epochs/
restore-tests/
  sanitized/
```

## What Is Backed Up

The source backup set includes:

- An encrypted, full-instance MongoDB archive with an oplog.
- A mandatory encrypted uploads archive from the shared
  `MENORAH_DATA_ROOT/uploads` namespace.
- A media manifest (path, byte size, and SHA-256) and database-reference
  verification report linked to that exact manifest.
- Source metadata with the archive digest, exact deployed release, migration
  marker, MongoDB Database Tools version, server version, FCV, and backup type.
- Immutable signed evidence inside the configured integrity epoch that binds
  every source artifact, metadata digest, restore result, and latest pointer.

The full source archive contains MongoDB system identity data and is never a
direct production-restore input. A successful isolated restore test derives a
separately encrypted `menorah.*`-only archive. Production restore accepts only
that signed, checksum-verified sanitized artifact.

Production media uses `MEDIA_STORAGE_BACKEND=local`,
`UPLOAD_PATH=/app/uploads`, and the canonical HTTPS
`MEDIA_PUBLIC_BASE_URL`. Every API and the worker mounts the same host
directory. Writes use never-reused object keys, file fsync, atomic rename, and
write-before-database-reference ordering. Replaced objects are retained; they
are not overwritten or deleted by request paths. Those properties make the
post-database media snapshot a safe superset of the MongoDB point-in-time.

Backup fails closed when the uploads directory is absent or symlinked, a media
path is unsafe, bytes change while being hashed, a managed database reference
is missing immutable hash/size/service metadata, a referenced file is absent,
or a managed Cloudinary object remains outside the local recovery set.

Secrets are not written into git or normal logs. Env/secrets are represented as a checklist, not raw values.

## Encryption Rule

Set `BACKUP_ENCRYPTION_PASSWORD` in the host-only `production.env` before copying backups off-host.
Set a distinct `BACKUP_INTEGRITY_HMAC_KEY` of at least 32 characters and the
non-secret `BACKUP_INTEGRITY_EPOCH_ID`. New authenticated evidence is written
only below `metadata/integrity-epochs/<epoch-id>/`; legacy root-level markers
remain retained but cryptographically unverifiable and are never a fallback.

For production, set:

```env
BACKUP_REQUIRE_MOUNT=true
BACKUP_REQUIRE_ENCRYPTION=true
BACKUP_EXPECT_RAID=true
```

If encryption is not enabled, the backup script writes `ENCRYPTION-BLOCKER.txt`. Treat that as a production blocker.

## Prepare The Backup HDDs

Confirm the two intended backup disks before running the destructive setup:

```bash
lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINTS,MODEL,SERIAL,UUID
```

Then run the guarded setup script with stable `/dev/disk/by-id/...` paths:

```bash
cd /opt/menorah/menorah
sudo BACKUP_DISK_CONFIRM=WIPE_THESE_DISKS \
  bash deploy/ubuntu/setup-backup-raid-luks.sh \
  /dev/disk/by-id/<first-backup-hdd> \
  /dev/disk/by-id/<second-backup-hdd>
```

The script refuses to run without two explicit disk paths and the confirmation value. It creates:

- RAID1 array: `/dev/md/menorah-backups`
- LUKS mapper: `/dev/mapper/menorah-backups-crypt`
- Mount point: `/mnt/menorah-backups`
- LUKS key file: `/opt/menorah/secrets/backup-luks.key`

## Manual Backup

```bash
cd /opt/menorah/menorah
bash deploy/ubuntu/backup-now.sh daily
```

Other accepted labels:

```bash
bash deploy/ubuntu/backup-now.sh six-hourly
bash deploy/ubuntu/backup-now.sh weekly
bash deploy/ubuntu/backup-now.sh monthly
```

## Schedule

Install systemd timers on the Ubuntu host:

```bash
cd /opt/menorah/menorah
sudo bash deploy/ubuntu/install-backup-schedule.sh
```

This installs timers for:

- Six-hourly backup: `00:15`, `06:15`, `12:15`, and `18:15 UTC`
- Daily backup: `02:30 UTC`
- Weekly backup: Sunday `03:00 UTC`
- Monthly backup: first day of month `04:00 UTC`
- Daily restore-test
- Daily pruning: `06:00 UTC`
- Hourly backup health checks

Logs are written under `/opt/menorah/logs/` and rotated weekly.

## Retention Policy

The historical retention values below describe the desired policy, but this
release deliberately makes pruning preservation-only until an operator-approved
epoch-aware deletion policy is implemented. It will not remove epoch records,
their evidence or pointers, current/closed records, restore evidence, or legacy
root-level markers.

Default retention:

- Manual: 30 days
- Six-hourly: 7 days
- Daily: 30 days
- Weekly: 84 days
- Monthly: 366 days
- Sanitized restore artifacts: 366 days, and never longer than their source set

Pruning acquires the deployment lock and then the backup lock, so it cannot race
a backup, restore, update, or rollback. It protects both every signed
latest-success set and the newest timestamped set in each category. When a
source set expires, its sanitized artifact, checksum, signed metadata, and HMAC
sidecar are removed first as a linked unit. Sanitized artifacts whose source is
already absent are also removed after `SANITIZED_ORPHAN_GRACE_HOURS` (24 hours
by default). Any malformed or partially published signed evidence makes pruning
fail before it deletes anything.

```bash
bash deploy/ubuntu/prune-backups.sh
```

## Backup Health Check

Run manually:

```bash
bash deploy/ubuntu/check-backup-health.sh
```

The check verifies:

- Backup root is mounted when required.
- Latest daily backup is under `BACKUP_MAX_AGE_HOURS`.
- A complete active integrity epoch has valid signed start, completion, and
  activation records; legacy root-level markers are ignored.
- Fresh daily and weekly signed evidence chains both match the expected
  full-instance/oplog safety contract.
- Source MongoDB and mandatory uploads archives are canonical files inside the
  signed backup set, are above the configured minimum where applicable, and
  match both their checksum sidecars and signed digests.
- Production source provenance contains an exact deployed release, Database
  Tools version, MongoDB 7 server version, and FCV `7.0`.
- Backup disk usage is below `BACKUP_DISK_USAGE_MAX_PERCENT`.
- RAID1 device is healthy when expected.
- The signed restore-test evidence is no older than 24 hours and is linked to
  the current daily or weekly source. Production refuses
  `CHECK_RESTORE_TEST=false` or a configured maximum above 24 hours.
- The restore-test source is fresh and checksum-valid, and the derived
  `menorah.*` artifact, checksum, signed metadata, source digest linkage,
  release linkage, version linkage, and timestamp chain all match.
- The signed uploads manifest and database-reference report match, contain no
  managed Cloudinary references, and report no missing or mismatched local
  objects.

The health check acquires the same deployment-then-backup lock order and reads
archives only to hash them. It never decrypts an archive or creates a plaintext
copy.

Optional Uptime Kuma push monitoring:

```env
BACKUP_HEALTH_PUSH_URL=https://<uptime-kuma-private-url>/api/push/<token>
```

Run the deterministic lifecycle regression tests on a Linux host:

```bash
bash scripts/qa/test-backup-lifecycle.sh
```

For the future approved production transition and later rotations, follow the
[backup-integrity epoch transition runbook](./backup-integrity-epoch-transition-runbook.md).

## Restore Test

Default restore target is the test database/container:

```bash
bash deploy/ubuntu/restore-latest-backup.sh restore-test
```

This starts a fresh isolated `mongo-restore-test` replica set, restores the
full source archive there, stages and verifies the uploads archive, proves
every restored managed-media reference against the staged manifest, derives a
Menorah-only database artifact, and destroys the no-auth test volume.

## Production Restore

Production restore is destructive and uses `--drop`. It requires the exact
source and sanitized digests, current and backup release SHAs, an approved
change reference, and a separately verified traffic drain. Example shape:

```bash
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

Before production restore:

- [ ] Stop public traffic or put Cloudflare in maintenance mode.
- [ ] Take a fresh backup.
- [ ] Confirm the target backup timestamp.
- [ ] Confirm the git commit SHA in backup metadata.
- [ ] Confirm backup checksum.
- [ ] Run restore-test successfully first.
- [ ] Confirm the signed media manifest/reference report has no violations.

After production restore:

- [ ] Keep every writer stopped while the restored schema is reviewed.
- [ ] Confirm the verified media tree was published and record the retained
      `preRestoreMediaRollbackPath` from the restore review marker.
- [ ] Run the approved schema/migration review and
      `acknowledge-production-restore.sh`; do not delete the media rollback
      tree until the recovery is accepted.
- [ ] Run `bash deploy/ubuntu/health-check.sh`.
- [ ] Run `CHECK_PUBLIC=true bash deploy/ubuntu/health-check.sh`.
- [ ] Verify login, articles, bookings, chat, and admin.

## Weekly And Monthly Off-Host Copies

Weekly:

- Copy the latest encrypted backup to offline storage.
- Verify checksum after copy.

Monthly:

- Archive the latest encrypted monthly backup.
- Record archive location and checksum.

Do not upload unencrypted backup files to any off-host storage.

An isolated full database-and-media restore drill and a checksum-verified
off-host copy remain operator-owned launch evidence; repository tests do not
prove either external control.
