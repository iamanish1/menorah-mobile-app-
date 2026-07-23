# Menorah Production Setup

## Current status and authority

Production verdict: `NOT READY`.

This document describes repository preparation only. It does not authorize a
deployment, migration, provider change, DNS change, or production-data access.
The sole supported production release method is the guarded Ubuntu host flow:

- operator runbook: `menorah/docs/production-update-runbook.md`;
- bootstrap and recovery reference: `menorah/deploy/ubuntu/README.md`;
- exact handover and go/no-go evidence: `docs/production-readiness/`;
- authoritative Compose base: `menorah/deploy/docker-compose.production.yml`;
- authoritative ingress overlay: `menorah/deploy/docker-compose.tunnel.yml`;
- routine release command: `menorah/deploy/ubuntu/update-from-git.sh`.

`.github/workflows/deploy.yml` validates readiness only. It does not deploy.
`menorah/backend/cloudbuild.yaml` and `gcp/cloudrun.yaml` are fail-closed
tombstones. Their `.disabled` archives are historical evidence, not usable
deployment inputs. Cloud Run is not an approved primary, overflow, or failover
path for this release.

## Runtime architecture

The reviewed target architecture is:

```text
public clients
  -> Cloudflare DNS and Tunnel
  -> loopback-bound Caddy on the Ubuntu application host
  -> audience-specific web/API services
  -> host MongoDB replica set, Redis, worker, uploads, backup and monitoring

calls.menorah.me
  -> separately governed LiveKit signaling/media service
```

Only Cloudflare Tunnel may reach Caddy inside the Compose network. All
host-published HTTP, diagnostic and observability ports use the exact
`127.0.0.1:PORT` form. The only approved non-loopback exception is the
explicitly reviewed LiveKit RTC TCP/UDP media port set. MongoDB, Redis,
Prometheus, Loki and exporters must not be publicly exposed.

The production stack uses one canonical local upload namespace. A guarded
release copies legacy per-service media only after every application writer is
stopped, verifies collisions and checksums, and retains all predecessor copies.

## Prerequisites

Before any host command, record the owner-approved protected release branch,
the reviewed full 40-character commit SHA, change reference, maintenance
window, backup owner, rollback owner and post-migration recovery owner.

Required workstation and CI evidence includes:

- clean release worktree and remote parity;
- application tests, builds and dependency audits;
- release workflow, Compose, Caddy, monitoring and shell validation;
- secret-history, static-analysis and image-scan evidence;
- owner, legal/privacy, clinical, VAPT, Apple, Google and vendor actions in the
  handover package.

Do not put a secret value in Git, command history, CI logs, screenshots or the
handover documents.

## Empty-host bootstrap

Bootstrap is allowed only on an owner-approved empty host. It creates and
verifies data services; it does not start public/application services or
authorize traffic.

```bash
cd /opt/menorah/menorah-mobile-app-
git checkout 'release/<reviewed-release-name>'
git fetch --prune origin
git checkout --detach '<reviewed-full-40-character-sha>'

sudo bash menorah/deploy/ubuntu/prepare-host.sh

export DEPLOY_BRANCH='release/<reviewed-release-name>'
export DEPLOY_RELEASE_SHA='<reviewed-full-40-character-sha>'
MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST \
  bash menorah/deploy/ubuntu/first-run.sh
```

The bootstrap refuses non-empty data, existing Compose containers, any
existing release/recovery marker, a dirty worktree, branch/SHA mismatch, or
unsafe runtime-directory ownership. It records `current-sha` and
`bootstrap-complete-sha` only after MongoDB and Redis verification.

Complete the same-SHA guarded release below before any traffic is introduced.

## Guarded release

Never invoke the updater from a moving, unreviewed branch tip. Supply the exact
reviewed SHA and a separate migration approval for that same SHA:

```bash
cd /opt/menorah/menorah-mobile-app-
export DEPLOY_BRANCH='release/<reviewed-release-name>'
export DEPLOY_RELEASE_SHA='<reviewed-full-40-character-sha>'
export DEPLOY_MIGRATION_APPROVED_SHA="${DEPLOY_RELEASE_SHA}"
export DEPLOY_CHANGE_REFERENCE='change-YYYY-NNN'
bash menorah/deploy/ubuntu/update-from-git.sh
```

The updater retains the deployment lock while handing control to the exact
candidate script blob. It verifies the healthy predecessor and immutable
artifact baseline before candidate checkout, creates and restore-tests a new
backup, validates configuration, builds/pulls before maintenance, records image
IDs, stops writers, consolidates media, reconciles managed MongoDB identities,
runs migration once from the recorded `api-web` image with pulling disabled,
starts only recorded artifacts, verifies local/public health, then atomically
commits release state.

Do not use `docker compose up`, Cloud Build, Cloud Run, or an automatic push
workflow as a substitute.

## Configuration boundary

Create host-only `menorah/deploy/env/production.env` and
`menorah/deploy/env/cloudflare.env` from their committed examples. Use the
complete variable inventory in
`docs/production-readiness/22-environment-variable-reference.md`.

The updater must reject missing, malformed, placeholder, reused or unsafe
values. In particular, payment/payout gates remain disabled unless all owner,
finance, vendor, live callback and reconciliation evidence is approved. Actual
Cloudflare, Razorpay, Resend, LiveKit, Luxand, Apple, Google and infrastructure
configuration is an external action; repository examples never prove it.

## Backup and restore

Follow `docs/production-readiness/10-backup-and-restore-runbook.md`. Public
release requires a fresh encrypted backup and an isolated successful restore
test with signed/checksummed evidence. Never treat a desktop test as live-host
proof.

Production restore is destructive and requires every literal confirmation,
expected digest, source/target SHA, traffic-drain attestation and change or
incident reference enforced by `restore-latest-backup.sh`. Do not improvise or
delete recovery markers.

## Monitoring

The production Compose stack uses Prometheus, Alertmanager, blackbox and
datastore exporters, constrained Docker metrics exporters, Grafana, Loki,
Grafana Alloy, Uptime Kuma and the backup textfile exporter. Promtail and
cAdvisor are retired only after candidate health, using verified Compose
labels.

The committed Alertmanager file is intentionally non-delivering. A reviewed
host-only destination, delivery test and acknowledgement are an
`INFRASTRUCTURE ACTION`. Follow
`menorah/docs/monitoring-alert-runbook.md` and
`docs/production-readiness/12-monitoring-and-alerting-runbook.md`.

## Rollback and recovery

Before migration, use only the recorded-artifact rollback path:

```bash
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

An interrupted rollback retains its exact durable target. Rerun the same
command; do not rewrite `current-sha`, `last-good-sha` or
`rollback-in-progress-sha` manually.

After a migration is applied, code-only rollback is blocked. If managed MongoDB
role reconciliation failed before migration, follow the identity recovery
review and run the literal-confirmation helper from the exact candidate. If
migration succeeded but startup or health failed, keep writers stopped and use
the exact recorded-artifact resume helper:

```bash
MENORAH_MONGO_IDENTITY_RECOVERY_CONFIRM=RECOVER_RECORDED_MONGO_IDENTITIES \
  bash menorah/deploy/ubuntu/recover-managed-mongo-identities.sh

MENORAH_POST_MIGRATION_RECOVERY_CONFIRM=RESUME_RECORDED_RELEASE \
  bash menorah/deploy/ubuntu/resume-post-migration-release.sh
```

The resume path never rebuilds, pulls or reruns migration. Ambiguous migration
state requires coordinated database/application recovery from the recorded
backup and evidence; no marker may be removed by hand.

## Go-live boundary

Do not introduce public traffic until
`docs/production-readiness/21-production-go-no-go.md` is signed with all P0
evidence. Repository completion does not close live-server verification,
provider callbacks, alert delivery, external VAPT, legal/privacy/clinical
decisions, mobile-console declarations or store review.
