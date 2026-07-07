# Ubuntu Production Host Deployment

This package lets development continue on Windows while the production runtime runs on an Ubuntu host from a GitHub checkout.

Target branch:

```bash
architecture/self-host-cloudrun-failover
```

## 1. Prepare Ubuntu

Install Ubuntu Server, sign in with a sudo-capable user, then install git if it is missing:

```bash
sudo apt-get update
sudo apt-get install -y git
```

Clone the repo under `/opt/menorah`:

```bash
sudo mkdir -p /opt/menorah
sudo chown "$USER":"$USER" /opt/menorah
cd /opt/menorah
git clone https://github.com/menorahsoftware-cmyk/menorah-mobile-app-.git
cd menorah-mobile-app-
git checkout architecture/self-host-cloudrun-failover
git pull
```

Run host preparation:

```bash
sudo bash menorah/deploy/ubuntu/prepare-host.sh
```

This installs Docker Engine and the Docker Compose plugin if needed, creates `/opt/menorah/data`, `/opt/menorah/backups`, `/opt/menorah/secrets`, `/opt/menorah/logs`, and prepares safe permissions.

## 2. Create Host Env Files

Copy examples to host-only env files:

```bash
cp menorah/deploy/env/production.env.example menorah/deploy/env/production.env
cp menorah/deploy/env/cloudflare.env.example menorah/deploy/env/cloudflare.env
```

Fill both files with real values:

```bash
nano menorah/deploy/env/production.env
nano menorah/deploy/env/cloudflare.env
```

Never commit `production.env` or `cloudflare.env`.

## 3. First Run

Start the production stack and Cloudflare Tunnel:

```bash
bash menorah/deploy/ubuntu/first-run.sh
```

Equivalent Compose command:

```bash
cd menorah/deploy
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.tunnel.yml \
  --env-file ./env/production.env \
  --env-file ./env/cloudflare.env \
  up -d --build
```

If the installed Docker Compose version does not support multiple `--env-file` flags, combine `production.env` and `cloudflare.env` into one host-only env file and pass that single file. Do not commit the combined file.

## 4. Health Checks

Run local checks:

```bash
bash menorah/deploy/ubuntu/health-check.sh
```

After Cloudflare public hostnames are mapped and live:

```bash
CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh
```

The script checks API health, deep health secret leakage, iOS Razorpay subscription blocking, admin auth protection, and admin route isolation.

## 5. Cloudflare Tunnel

Preferred first go-live mode is dashboard-managed tunnel token:

1. Create a Cloudflare Tunnel in the dashboard.
2. Add public hostnames for `www`, `app`, `admin`, `api-ios`, `api-android`, `api-web`, `api-admin`, and `calls`.
3. Point each hostname to `http://reverse-proxy:80`.
4. Put the token in `menorah/deploy/env/cloudflare.env`.
5. Start with `first-run.sh` or the compose command above.

See [Cloudflare README](../cloudflare/README.md).

## 6. Update Later From Git

```bash
bash menorah/deploy/ubuntu/update-from-git.sh
```

The script requires a clean tracked working tree, records the previous commit SHA, pulls the configured branch, rebuilds, restarts, runs health checks, and rolls back automatically if checks fail.

## 7. Roll Back

```bash
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

Deploy state is stored under `/opt/menorah/deploy-state`.

## 8. Back Up And Restore

Prepare the encrypted RAID1 HDD backup volume after both backup disks are installed:

```bash
cd /opt/menorah/menorah
sudo BACKUP_DISK_CONFIRM=WIPE_THESE_DISKS \
  bash deploy/ubuntu/setup-backup-raid-luks.sh \
  /dev/disk/by-id/<first-backup-hdd> \
  /dev/disk/by-id/<second-backup-hdd>
```

Install backup, restore-test, pruning, and health-check timers:

```bash
cd /opt/menorah/menorah
sudo bash deploy/ubuntu/install-backup-schedule.sh
```

Manual backup:

```bash
cd /opt/menorah/menorah
bash deploy/ubuntu/backup-now.sh daily
```

Restore latest backup into the restore-test database:

```bash
bash deploy/ubuntu/restore-latest-backup.sh restore-test
```

Check backup health:

```bash
bash deploy/ubuntu/check-backup-health.sh
```

Production restore is blocked unless explicitly confirmed:

```bash
RESTORE_CONFIRM_PRODUCTION=true bash deploy/ubuntu/restore-latest-backup.sh production
```

See [backup restore runbook](../../docs/production-backup-restore-runbook.md).

## 9. Go Live

Do not send production traffic until [the go-live checklist](../../docs/ubuntu-host-go-live-checklist.md) is complete.
