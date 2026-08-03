# Ubuntu Production Host Deployment

The current public-production verdict is **NOT READY**. These instructions do
not authorize deployment, migration, traffic, or production-data access.

This package lets development continue on Windows while the production runtime runs on an Ubuntu host from a GitHub checkout. The sole routine production deployment method is the guarded, operator-invoked `update-from-git.sh` flow described in [the production update runbook](../../docs/production-update-runbook.md). GitHub Actions performs readiness validation only.

The host may track only an owner-approved protected release branch. There is no
permanently trusted moving deployment branch:

```bash
release/<reviewed-release-name>
```

## 1. Prepare Ubuntu

Install Ubuntu Server, sign in with a sudo-capable user, then install git if it is missing:

```bash
sudo apt-get update
sudo apt-get install -y git
```

Clone the repo under `/opt/menorah`:

```bash
sudo install -d -m 0750 -o "$USER" -g "$(id -g)" /opt/menorah
cd /opt/menorah
git clone https://github.com/menorahsoftware-cmyk/menorah-mobile-app-.git
cd menorah-mobile-app-
git checkout 'release/<reviewed-release-name>'
```

The existing Hostinger production checkout predates that clone layout and is
explicitly supported with Git root `/opt/menorah` and application root
`/opt/menorah/menorah`. On that host, always invoke guarded scripts with
`MENORAH_RELEASE_REPO_ROOT=/opt/menorah`; do not relocate the live checkout or
installed timer working directories as part of an application release.

Run host preparation:

```bash
sudo bash menorah/deploy/ubuntu/prepare-host.sh
```

This installs Docker Engine and the Docker Compose plugin if needed, creates
the persistent data, backup, secret, log, and release-state directories, and
prepares the numeric ownership required by the digest-pinned non-root images.
Sign out and back in once so the operator's Docker group membership is active.

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

Create the LiveKit config, Cloudflare Tunnel token, and delivering Alertmanager
config as host-only files under `/opt/menorah/secrets`. Set their absolute paths
in the env files. Install the final reviewed files with these ownership models;
do not put secret values on the command line:

```bash
operator_gid="$(id -g)"
sudo install -o "$USER" -g "${operator_gid}" -m 0600 \
  /path/to/reviewed-livekit.yaml /opt/menorah/secrets/livekit.yaml
sudo install -o 65532 -g "${operator_gid}" -m 0440 \
  /path/to/rotated-cloudflare-token /opt/menorah/secrets/cloudflare-tunnel-token
sudo install -o 65534 -g "${operator_gid}" -m 0440 \
  /path/to/reviewed-alertmanager.yml /opt/menorah/secrets/alertmanager.yml
```

The numeric owners are the non-root users in the pinned Cloudflare and
Alertmanager images. The operator group remains read-only so preflight can
validate the files. `ALERTMANAGER_CONFIG_FILE` must not point at the committed
non-delivering placeholder.

The previously used Cloudflare Tunnel token is treated as compromised. Rotate
it in Cloudflare under a separately approved security change, replace only the
protected host file above, restart only `cloudflared`, and verify every public
hostname before any release deployment. Never copy the old token into release
evidence or command output.

## 3. First Run (Bootstrap Only)

Use this only for initial host provisioning before production traffic exists.
It is not an update or release procedure:

```bash
export DEPLOY_BRANCH='release/<reviewed-release-name>'
export DEPLOY_RELEASE_SHA='<reviewed-full-40-character-sha>'
MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST \
  bash menorah/deploy/ubuntu/first-run.sh
```

The bootstrap script refuses a dirty checkout, a SHA that differs from the
reviewed remote branch tip, non-empty MongoDB or Redis storage, any existing
deployment state, or any existing Compose containers. Before starting data
services it uses a digest-pinned networkless helper to prepare and verify the
empty upload/monitoring directories for their exact container UIDs, with
`MENORAH_MEDIA_GROUP_ID` equal to the invoking operator's `id -g`. It starts
and verifies only MongoDB and Redis and records both `current-sha` and
`bootstrap-complete-sha`; it does not start public or application services.
Bootstrap does not authorize production traffic: before
go-live, run the guarded update in section 6 for the same SHA with explicit
migration approval. That creates and restore-tests the first release backup,
applies migrations once inside the writer maintenance boundary, validates the
external monitoring delivery configuration, and records the complete release
evidence.

Do not replace bootstrap with a direct `docker compose up`; that would bypass
the exact-SHA, empty-storage, migration, backup, and recovery gates.

## 4. Health Checks

Run local checks:

```bash
bash menorah/deploy/ubuntu/health-check.sh
```

After Cloudflare public hostnames are mapped and live:

```bash
CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh
```

Before Android internal testing, configure the Play App Signing SHA-256 and run
the stricter direct-response gate:

```bash
CHECK_PUBLIC=true CHECK_ANDROID_APP_LINKS=true \
  bash menorah/deploy/ubuntu/health-check.sh
```

This requires `https://app.menorah.me/.well-known/assetlinks.json` to return a
direct HTTP 200 with JSON content type, the exact Android package, and every
configured Play signing fingerprint. Redirects and placeholder values fail.

The script checks API health, deep health secret leakage, iOS Razorpay subscription blocking, admin auth protection, and admin route isolation.

## 5. Cloudflare Ingress

Production ingress uses a Cloudflare Tunnel. Cloudflare handles public HTTPS and the connector uses its encrypted outbound tunnel to Caddy on the private Docker network.

1. Add public hostnames for `menorah.me`, `www`, `app`, `admin`, `counsellor`, `api-ios`, `api-android`, `api-web`, `api-admin`, and `calls`.
2. Set every service target to `http://reverse-proxy:80`.
3. Keep the host's Caddy port bound to loopback; the Tunnel connector is the only public ingress.
4. Complete `first-run.sh`, then use the guarded updater for the same reviewed
   SHA. Only the updater starts the proxy and Cloudflare Tunnel.

See [Cloudflare README](../cloudflare/README.md).

## 6. Update Later From Git

```bash
export DEPLOY_BRANCH='release/<reviewed-release-name>'
export DEPLOY_RELEASE_SHA='<reviewed-full-40-character-sha>'
export DEPLOY_MIGRATION_APPROVED_SHA="${DEPLOY_RELEASE_SHA}"
export DEPLOY_CHANGE_REFERENCE='change-YYYY-NNN'
MENORAH_RELEASE_REPO_ROOT=/opt/menorah \
  bash menorah/deploy/ubuntu/update-from-git.sh
```

The script requires a clean tracked working tree and the reviewed SHA to equal
the current remote branch tip. It acquires the shared deployment lock and, when
needed, re-execs the exact candidate updater Git blob while retaining that
lock. It records a healthy predecessor baseline before candidate builds,
creates and restore-tests a fresh backup, validates configuration and records
immutable image IDs. After stopping and verifying writers, it consolidates
legacy media without deleting predecessor copies, reconciles exact MongoDB
roles, and runs the approved migration once from the checksum-recorded
`api-web` image with pulling disabled. It starts only recorded artifacts,
requires local/public health, retires label-verified Promtail/cAdvisor
containers, and commits release state last. It never hides a post-migration
failure with an unsafe code-only rollback.

## 7. Roll Back

```bash
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

Deploy state is stored under `/opt/menorah/deploy-state`. An interrupted
rollback retains `rollback-in-progress-sha`; rerunning the same command reuses
that exact target and clears the marker only after artifact and health proof.

## 8. Guarded Failure Recovery

If managed-role reconciliation was interrupted before migration, keep writers
stopped and, after an approved identity review, run from the exact candidate:

```bash
MENORAH_MONGO_IDENTITY_RECOVERY_CONFIRM=RECOVER_RECORDED_MONGO_IDENTITIES \
  bash menorah/deploy/ubuntu/recover-managed-mongo-identities.sh
```

If migration completed but recorded artifact startup or health failed, keep
writers stopped and, only when the exact candidate remains approved, run:

```bash
MENORAH_POST_MIGRATION_RECOVERY_CONFIRM=RESUME_RECORDED_RELEASE \
  bash menorah/deploy/ubuntu/resume-post-migration-release.sh
```

The resume path verifies the recorded source tree, image/media evidence and
migration markers, never rebuilds, pulls or reruns migration, and stops writers
again on failure. Ambiguous or partial migration state requires coordinated
database/application recovery; never delete a marker by hand.

Legacy `menorah/backend/cloudbuild.yaml` and `gcp/cloudrun.yaml` paths now hold
fail-closed tombstones and are not approved production deployment methods.
Disable any external trigger that still references them as documented in the
production update runbook.

## 9. Back Up And Restore

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

See [backup restore runbook](../../docs/production-backup-restore-runbook.md).

## 10. Go Live

Do not send production traffic until the canonical
[handover checklist](../../../docs/production-readiness/19-handover-checklist.md)
and [production go/no-go record](../../../docs/production-readiness/21-production-go-no-go.md)
are complete and approved. The former
`menorah/docs/ubuntu-host-go-live-checklist.md` is superseded and is not a
launch authority.
