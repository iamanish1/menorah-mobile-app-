# Production Backup And Restore Runbook

Production backups live under:

```text
MENORAH_BACKUP_ROOT=/opt/menorah/backups
```

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

If encryption is not enabled, the backup script writes `ENCRYPTION-BLOCKER.txt`. Treat that as a production blocker for off-host upload.

## Manual Backup

```bash
bash menorah/deploy/ubuntu/backup-now.sh daily
```

Other accepted labels:

```bash
bash menorah/deploy/ubuntu/backup-now.sh six-hourly
bash menorah/deploy/ubuntu/backup-now.sh weekly
bash menorah/deploy/ubuntu/backup-now.sh monthly
```

## Minimum Schedule

Install cron entries on the Ubuntu host:

```cron
0 */6 * * * cd /opt/menorah/menorah-mobile-app- && bash menorah/deploy/ubuntu/backup-now.sh six-hourly >> /opt/menorah/logs/backup.log 2>&1
30 2 * * * cd /opt/menorah/menorah-mobile-app- && bash menorah/deploy/ubuntu/backup-now.sh daily >> /opt/menorah/logs/backup.log 2>&1
0 3 * * 0 cd /opt/menorah/menorah-mobile-app- && bash menorah/deploy/ubuntu/backup-now.sh weekly >> /opt/menorah/logs/backup.log 2>&1
0 4 1 * * cd /opt/menorah/menorah-mobile-app- && bash menorah/deploy/ubuntu/backup-now.sh monthly >> /opt/menorah/logs/backup.log 2>&1
0 5 */14 * * cd /opt/menorah/menorah-mobile-app- && bash menorah/deploy/ubuntu/restore-latest-backup.sh restore-test >> /opt/menorah/logs/restore-test.log 2>&1
```

Do not silently delete backups until a written retention policy exists and is approved.

## Restore Test

Default restore target is the test database/container:

```bash
bash menorah/deploy/ubuntu/restore-latest-backup.sh restore-test
```

This starts the `mongo-restore-test` service and restores the latest MongoDB archive into `menorah_restore_test`.

## Production Restore

Production restore is destructive and uses `--drop`.

It is blocked unless explicitly confirmed:

```bash
RESTORE_CONFIRM_PRODUCTION=true bash menorah/deploy/ubuntu/restore-latest-backup.sh production
```

Before production restore:

- [ ] Stop public traffic or put Cloudflare in maintenance mode.
- [ ] Take a fresh backup.
- [ ] Confirm the target backup timestamp.
- [ ] Confirm the git commit SHA in backup metadata.
- [ ] Confirm backup checksum.
- [ ] Run restore-test successfully first.

After production restore:

- [ ] Run `bash menorah/deploy/ubuntu/health-check.sh`.
- [ ] Run `CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh`.
- [ ] Verify login, articles, bookings, chat, and admin.

## Weekly And Monthly Off-Host Copies

Weekly:

- Copy the latest encrypted backup to offline storage.
- Verify checksum after copy.

Monthly:

- Archive the latest encrypted monthly backup.
- Record archive location and checksum.

Do not upload unencrypted backup files to any off-host storage.
