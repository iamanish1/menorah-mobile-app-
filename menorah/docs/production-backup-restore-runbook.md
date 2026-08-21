# Production Backup And Restore Runbook

Production backups live under:

```text
MENORAH_BACKUP_ROOT=/mnt/menorah-backups
```

For production, `/mnt/menorah-backups` should be a RAID1 mirror across the two backup HDDs, encrypted with LUKS and mounted by UUID.

Directory layout:

```text
six-hourly/
daily/
weekly/
monthly/
restore-tests/
```

## What Is Backed Up

Backups include:

- MongoDB dump archive.
- Uploads archive from `MENORAH_DATA_ROOT/uploads`.
- Metadata with timestamp, git commit SHA, Docker Compose service state, Docker image list, database name, and backup type.

Secrets are not written into git or normal logs. Env/secrets are represented as a checklist, not raw values.

## Encryption Rule

Set `BACKUP_ENCRYPTION_PASSWORD` in the host-only `production.env` before copying backups off-host.

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

- Daily backup: `02:30 UTC`
- Weekly backup: Sunday `03:00 UTC`
- Monthly backup: first day of month `04:00 UTC`
- Weekly restore-test: Sunday `05:00 UTC`
- Daily pruning: `06:00 UTC`
- Hourly backup health checks

Logs are written under `/opt/menorah/logs/` and rotated weekly.

## Retention Policy

Default retention:

- Six-hourly: 7 days
- Daily: 30 days
- Weekly: 84 days
- Monthly: 366 days

The pruning script never deletes the newest backup in each category.

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
- Latest archive is above `BACKUP_MIN_SIZE_BYTES`.
- Checksum exists and validates.
- Backup disk usage is below `BACKUP_DISK_USAGE_MAX_PERCENT`.
- RAID1 device is healthy when expected.
- Restore-test marker is fresh.

Optional Uptime Kuma push monitoring:

```env
BACKUP_HEALTH_PUSH_URL=https://<uptime-kuma-private-url>/api/push/<token>
```

## Restore Test

Default restore target is the test database/container:

```bash
bash deploy/ubuntu/restore-latest-backup.sh restore-test
```

This starts the `mongo-restore-test` service and restores the latest MongoDB archive into `menorah_restore_test`.

## Production Restore

Production restore is destructive and uses `--drop`.

It is blocked unless explicitly confirmed:

```bash
RESTORE_CONFIRM_PRODUCTION=true bash deploy/ubuntu/restore-latest-backup.sh production
```

Before production restore:

- [ ] Stop public traffic or put Cloudflare in maintenance mode.
- [ ] Take a fresh backup.
- [ ] Confirm the target backup timestamp.
- [ ] Confirm the git commit SHA in backup metadata.
- [ ] Confirm backup checksum.
- [ ] Run restore-test successfully first.

After production restore:

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
