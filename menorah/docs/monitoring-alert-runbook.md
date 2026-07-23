# Production monitoring and alert runbook

The current public-production verdict is **NOT READY**. This runbook describes
verification and controlled activation only; it does not authorize launch or a
live infrastructure change.

## Current readiness state

The repository now contains Prometheus, blackbox exporter, MongoDB exporter,
Redis exporter, node_exporter, a constrained Docker stats exporter, and
Alertmanager configuration. Health
URLs are JSON and are probed through blackbox_exporter; Prometheus never scrapes
them as metrics.

Notification delivery is intentionally **not configured**. The committed
Alertmanager receiver has no email, chat, paging, or webhook destination and
therefore cannot notify a human. Production launch remains blocked on the
infrastructure actions below. Do not interpret a healthy Alertmanager process
as proof that notifications are delivered.

The exact covered and unavailable signals are maintained in
`deploy/monitoring/observability-coverage.yml`. In particular, the repository
does not yet emit honest metrics for queue backlog, immediate systemd backup
failure, general payment-provider failure, email delivery outcomes, call media
or provider failures, specific role/permission changes, or separate
401/403/429/500 response rates.

Every committed alert links to this runbook on the protected
`release/final-production-readiness` branch because the file is not yet present
on `main`. Operators must keep the same checked-out file available locally as
the outage fallback. After an approved merge creates a stable protected path,
change all 53 URLs and their validator together in a separately reviewed
commit; never leave alerts pointing at a deleted branch or an unreviewed moving
document.

## Local logging retention contract

Production uses Grafana Alloy, not end-of-life Promtail, to tail Caddy access
files and Docker's `json-file` logs. Alloy persists file positions under
`${MENORAH_DATA_ROOT}/alloy`, so an ordinary collector restart does not replay
every active file from the beginning. The collector has read-only log mounts;
it does not receive the Docker socket.

`prepare-host.sh` safely merges these Docker daemon defaults and refuses to
replace conflicting operator settings or restart Docker when containers already
exist:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "25m",
    "max-file": "5"
  }
}
```

These defaults apply when containers are created; changing the daemon file does
not retrofit existing containers. Recreate them only through the guarded
release workflow. Caddy access files independently roll at 25 MiB, retain five
files, and delete files older than 30 days. Loki's singleton compactor enforces
`720h` (30-day) local operational-log retention with a two-hour delayed delete.
The Loki filesystem volume is single-host operational storage, not an off-host
archive or the authoritative durable security-audit ledger. Legal hold and
long-term audit retention remain owner/legal actions and must not be inferred
from this local disk policy.

## Infrastructure actions before launch

1. `INFRASTRUCTURE ACTION`: configure a dedicated monitoring username/password
   and `MONGODB_MONITORING_URI` in the operator-controlled production
   environment; never commit or print those values. Empty-host bootstrap creates
   the identity with `clusterMonitor` on `admin` and `read` on `local`. On an
   existing volume, do not run an ad hoc user-creation command. The guarded
   updater first performs a no-write drift/missing-identity preflight. Only
   after it acquires the shared lock, stops and verifies every writer, and writes
   durable recovery state does it idempotently create a missing candidate-managed
   identity, reconcile exact roles, and validate the monitoring login. If that
   boundary is interrupted, keep writers stopped and use only the documented
   `recover-managed-mongo-identities.sh` flow. Retain the approved change record
   and redacted exact-role evidence; do not capture command traces or environment
   values.
2. If Redis authentication is enabled, create a read-only monitoring ACL and set
   `REDIS_MONITORING_URL` through the operator-controlled environment. Do not
   commit it.
3. Create an Alertmanager file outside the repository with the approved
   notification destinations, credential references, severity routing, and
   escalation ownership. Set `ALERTMANAGER_CONFIG_FILE` to its absolute host
   path. Install it outside the checkout as uid `65534`, the pinned image's
   non-root user, with the production operator's group and mode `0440`. Back it
   up as protected configuration, never in Git.
4. Record named primary and secondary responders for the source-controlled owner
   labels: `platform`, `backend`, `web`, `realtime`, `data-platform`,
   `infrastructure`, `security`, `payments`, and `finance-operations`.
5. Start the monitoring services only through the approved production update
   workflow. Confirm every Prometheus target is `UP`, every blackbox target has
   `probe_success=1`, MongoDB reports `mongodb_up=1` and replica state `1`, and
   Redis reports `redis_up=1`.
6. Run the controlled notification test below in a change window and retain
   receiver-side evidence. This is an **INFRASTRUCTURE ACTION** and is not
   performed by repository validation.

## Repository validation

Run from the repository root:

```sh
cd menorah/scripts/qa
npm ci
npm run test:monitoring
```

The test validates YAML structure, pinned exporter images, alert metadata,
probe coverage, explicit unavailable-signal records, and the absence of JSON
health paths from Prometheus metric scrapes.

For native upstream validation where Docker is available:

```sh
MONITORING_DIR="$(pwd)/menorah/deploy/monitoring"

docker run --rm --entrypoint /bin/promtool \
  -v "${MONITORING_DIR}:/etc/prometheus:ro" \
  prom/prometheus:v2.55.1@sha256:2659f4c2ebb718e7695cb9b25ffa7d6be64db013daba13e05c875451cf51b0d3 \
  check config /etc/prometheus/prometheus.yml

docker run --rm --entrypoint /bin/promtool \
  -v "${MONITORING_DIR}:/etc/prometheus:ro" \
  -w /etc/prometheus \
  prom/prometheus:v2.55.1@sha256:2659f4c2ebb718e7695cb9b25ffa7d6be64db013daba13e05c875451cf51b0d3 \
  test rules alert-rules.test.yml

docker run --rm \
  -v "${MONITORING_DIR}:/config:ro" \
  prom/blackbox-exporter:v0.28.0@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc \
  --config.file=/config/blackbox.yml --config.check

docker run --rm --entrypoint /bin/amtool \
  -v "${MONITORING_DIR}:/config:ro" \
  prom/alertmanager:v0.32.1@sha256:51a825c2a40acc3e338fdd00d622e01ec090f72be2b3ea46be0839cd47a4d286 \
  check-config /config/alertmanager.yml

docker run --rm \
  -v "$(pwd)/menorah/deploy/logging/config.alloy:/etc/alloy/config.alloy:ro" \
  grafana/alloy:v1.18.0@sha256:491b0578c04983fd54fe99b587b6fab4404dc46d0dc16677bd6b00cc1140b308 \
  validate /etc/alloy/config.alloy

docker run --rm --entrypoint /usr/bin/loki \
  -v "$(pwd)/menorah/deploy/logging/loki-config.yml:/etc/loki/config.yml:ro" \
  grafana/loki:3.7.3@sha256:70b9f699fc9bb868b62f1cfd4f787dfa50242f1fd92e6089787d5d7daea75fe8 \
  -config.file=/etc/loki/config.yml -verify-config
```

Validate the fully interpolated Compose model with the real production
environment on the production host before starting it:

```sh
docker compose \
  --env-file deploy/env/production.env \
  --env-file deploy/env/cloudflare.env \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.tunnel.yml \
  config --quiet
```

## Controlled alert-delivery test

Do this only after an approved destination config is installed and only during
an approved non-production or production change window.

1. Confirm Alertmanager reports the intended receiver and that the committed
   `unconfigured-destination` receiver is no longer the effective destination.
2. Submit one clearly synthetic alert:

   ```sh
   docker compose \
     --env-file deploy/env/production.env \
     -f deploy/docker-compose.production.yml \
     exec alertmanager \
     amtool alert add MonitoringDeliveryTest \
       severity=warning owner=platform service=alert-test \
       --annotation=summary="Controlled Menorah notification delivery test"
   ```

3. Confirm delivery at the primary destination, acknowledgement by the named
   responder, repeat suppression, and resolved notification behavior.
4. Silence or delete the synthetic alert according to the approved receiver's
   procedure. Preserve the Alertmanager status screenshot, receiver delivery
   timestamp, acknowledgement timestamp, and tester identity in the launch
   evidence pack.
5. Separately exercise a real rule in staging by stopping a disposable staging
   target for longer than its `for` interval. Never stop a production dependency
   merely to test an alert.

## Triage conventions

- `critical`: acknowledge immediately under the incident rota, assess user and
  data impact, and appoint an incident lead.
- `warning`: investigate during the defined operational response window and
  escalate if impact or trend worsens.
- Never solve an alert by disabling a rule or widening a threshold during an
  incident. Preserve graphs, target status, container logs, audit events, and
  the release SHA first.
- Run commands from the approved deployment directory with the production env
  file. Do not paste secret-bearing output into tickets or chat.

## Availability alerts

### BlackboxExporterDown

Owner: `platform`. Check the exporter container, config mount, and Prometheus
target error. Restore probe telemetry before trusting service availability
dashboards.

### BlackboxProbeCoverageIncomplete

Owner: `platform`. Compare active Prometheus targets with the required inventory
in `deploy/monitoring/prometheus.yml`. This catches missing series even while
blackbox_exporter is healthy. Restore the target or revert the faulty config;
do not lower the required target counts.

### InternalApiProbeFailed

Owner: `backend`. Compare `/health/ready` status with API logs, MongoDB/Redis
alerts, and container restarts. A readiness failure is dependency-aware; do not
route traffic back until it is consistently `200`.

### InternalFrontendProbeFailed

Owner: `web`. Check the named frontend container, its build/release SHA, reverse
proxy upstream resolution, and server logs. Confirm the public probe separately.

### WorkerReadinessProbeFailed

Owner: `backend`. Check worker mode, boot logs, MongoDB/Redis connectivity, and
job scheduler state. This alert proves process readiness only; it does not prove
job throughput or queue depth.

### CallServiceProbeFailed

Owner: `realtime`. Distinguish internal LiveKit TCP failure from public TLS/HTTP
failure, then inspect LiveKit and reverse-proxy logs. Use the approved regional
provider fallback procedure; do not bypass booking authorization.

### DatastoreTcpProbeFailed

Owner: `data-platform`. Compare the TCP probe with exporter health. Check
container state, listener, internal network, disk, and memory before any restart.

### PublicEndpointProbeFailed

Owner: `platform`. Compare internal probes to public probes to isolate DNS,
Cloudflare Tunnel, certificate, Caddy, or upstream failure. Do not make live DNS
or tunnel changes outside the infrastructure change procedure.

### TlsCertificateExpiringSoon

Owner: `platform`. Confirm the certificate chain and expiry from two networks,
then inspect the authoritative certificate automation path. Renew through the
approved Cloudflare/Caddy workflow and verify every hostname after propagation.

### SecurityMetricsScrapeFailed

Owner: `security`. Treat alert coverage for the named API or worker as blind
until its `/metrics/security` target is `UP`. Correlate with service readiness
and logs; downstream alert silence is not recovery evidence.

### SecurityMetricsCoverageIncomplete

Owners: `security` and `platform`. The `security-events` job must contain the
four APIs plus worker. Restore the missing target or revert the monitoring
configuration before accepting a release.

## Data-service alerts

### MongoExporterDown

Owner: `data-platform`. Inspect exporter logs and the monitoring URI mount. A
credential or permission error must be corrected in the external secret; never
replace it with an application or root credential.

### MongoUnavailable

Owner: `data-platform`. Check MongoDB listener, authentication, disk, and
replica-set state. Correlate with API readiness failures before deciding on a
restart.

### MongoMetricsCoverageMissing

Owner: `data-platform`. Inspect the exporter target and response body. An `UP`
scrape without `mongodb_up` is not database-health evidence. Check collector
compatibility and the monitoring identity before changing any rule.

### MongoReplicaNotPrimary

Owner: `data-platform`. Preserve `rs.status()` evidence and MongoDB logs. On the
single-member production replica set, state other than PRIMARY blocks writes;
follow the documented database recovery procedure rather than reinitializing.

### RedisExporterDown

Owner: `data-platform`. Inspect exporter connectivity and ACL errors. Keep the
monitoring identity read-only and correct the external URL or ACL.

### RedisUnavailable

Owner: `data-platform`. Check Redis process, persistence errors, disk, memory,
and internal network. Correlate with API and worker readiness.

### RedisMetricsCoverageMissing

Owner: `data-platform`. Inspect the exporter response and version. An `UP`
scrape without `redis_up` is not Redis-health evidence. Restore the expected
metric before relying on downstream Redis alerts.

### RedisMemoryPressure

Owner: `data-platform`. Check memory trend, eviction policy, key count, and
largest approved namespaces. Do not delete keys without an application owner and
a recovery plan.

### RedisRejectedConnections

Owner: `data-platform`. Inspect `maxclients`, client count, connection churn, and
application reconnect storms. Address the cause before raising connection
limits.

## Host and container alerts

### NodeExporterDown

Owner: `infrastructure`. Check the node_exporter container and root/textfile
mounts. Host capacity and backup-age alerts are blind while it is down.

### HostDiskSpaceLow

Owner: `infrastructure`. Identify the exact filesystem and largest approved
consumers. Preserve required logs and backups, use documented retention tools,
and never recursively delete broad host paths.

### HostCpuSaturation

Owner: `infrastructure`. Identify the responsible containers/processes, compare
request and job load, and check restart/dependency alerts. Scale or throttle only
through the approved operations procedure.

### HostMemoryPressure

Owner: `infrastructure`. Check working set, swap/OOM evidence, and container
limits. Preserve crash evidence before a controlled restart.

### ContainerMetricsDown

Owner: `infrastructure`. Check the Docker stats exporter and its isolated
repository path gateway. The exporter has no host socket or host filesystem
mount. The gateway is the sole socket-bearing component and therefore remains a
trusted, root-equivalent Docker control-plane component internally; mounting a
Unix socket with a read-only bind option would not reduce that privilege. It is
isolated on `docker_metrics_socket_net`, limits discovery to the active Compose
project label, allows only the exact sanitized project-list, one-shot-stats,
and sanitized-state requests required by the exporter, and returns only bounded
names, Compose labels, running/start/restart state, and memory fields. Raw
inspect, cross-project listing, environment, logs, archive, export, and every
non-GET request are denied. Container resource and restart alerts are blind
while this alert is firing.

### ContainerMetricsCoverageMissing

Owner: `infrastructure`. This is the false-green guard. Confirm
`menorah_docker_exporter_collection_success == 1`, a recent
`menorah_docker_exporter_last_success_timestamp_seconds`, and at least one
`menorah_container_start_time_seconds{container!=""}` series. Run the native
runtime contract, which also proves that raw inspect/log/archive/export GETs
and a stop POST return `403`; do not treat a `200` response from `/metrics` as
sufficient evidence.

### ContainerRestartLoop

Owner: `platform`. Inspect the named container's exit status, health, recent
logs, configuration, and release SHA. Stop automated churn only through the
incident procedure; do not erase the container evidence first. The metric is a
Prometheus counter for the current Docker container lifetime. Recreating a
container is an expected counter reset, which `increase()` handles.

### ContainerMemoryNearLimit

Owner: `platform`. Correlate working-set growth with traffic and recent changes.
Docker can report a host/cgroup ceiling when no explicit per-container limit is
configured, so confirm the effective cgroup limit before changing configuration.
Capture a safe profile or heap evidence where supported before adjusting limits.

## Backup alerts

### BackupMetricsStale

Owner: `infrastructure`. Check the `backup-metrics` sidecar, textfile volume, and
node_exporter textfile collector. This alert is telemetry failure, not proof of a
backup failure. The sidecar reports filesystem age and requires both a marker
and its `.hmac-sha256` sidecar, but does not possess the signing key and does not
cryptographically validate either file. Use `check-backup-health.sh` for signed
content, archive checksum, encryption, and linkage verification.

### SixHourlyBackupTooOld

Owner: `infrastructure`. Treat this as an RPO breach: inspect the six-hourly
timer, the shared backup lock, mount capacity, encryption, archive checksum,
and latest marker. The expression uses the six-hour timer interval; the
15-minute `for` duration is notification grace for the five-minute randomized
start and completion, not an extension of backup freshness. Do not manufacture
or copy a marker to clear the alert.

### DailyBackupMissing

Owner: `infrastructure`. Verify the backup root mount and systemd timer result.
Do not create a marker manually. Run an approved backup and restore verification
to clear the condition honestly.

### DailyBackupTooOld

Owner: `infrastructure`. Inspect the daily timer and backup logs, storage mount,
checksum, encryption, signature sidecar, and free space. The maximum accepted
age is 24 hours. The 15-minute alert hold is operational notification grace;
the host health contract remains 24 hours. A new success marker is valid only
after the archive, checksum, and signature-sidecar publication succeed, and the
host health check verifies the HMAC before accepting it.

### WeeklyBackupTooOld

Owner: `infrastructure`. Inspect the weekly timer and archive/checksum evidence.
The expression matches the seven-day timer and the 30-minute hold is
notification grace. Run a controlled replacement backup if the schedule was
missed.

### MonthlyBackupTooOld

Owner: `infrastructure`. Inspect the monthly timer and retained archive. Confirm
retention/pruning did not remove the only valid monthly recovery point. The
31-day expression covers the longest calendar interval; the 30-minute hold is
notification grace.

### RestoreTestTooOld

Owner: `infrastructure`. Run the isolated restore test from an approved backup
and verify the marker references that archive. Never test by restoring over the
production database. Both the alert expression and the signed recovery health
gate use a 24-hour maximum. The alert's 30-minute hold permits the scheduled
isolated restore to finish before paging but does not make evidence older than
24 hours acceptable for production recovery.

## Security and critical-flow alerts

### SecurityAuditEvidenceIntegrityFailure

Owner: `security`. Any `checkpoint_invalid` or `queue_overflow` counter increase
is an incident. Preserve the affected MongoDB ledger/checkpoint, relevant
container stdout, and the signing-key version identifier. Do not edit audit
collections, rotate the signing key, restart the affected service, or clear the
queue before evidence capture. A checkpoint failure means the writer refused to
extend an untrusted head; an overflow means at least one new event could not
enter the bounded process queue.

### SecurityAuditSinkPending

Owner: `security`. One or more audit events have remained only in process memory
for ten minutes, which exceeds the sink's normal bounded retry backoff. Check
MongoDB primary/write health and the failure-reason counters, then confirm the
pending gauge drains to zero and the durable chain verifies. Do not perform a
planned restart while pending is nonzero: process-local events can be lost.

### SecurityAuditSinkWriteFailures

Owner: `security`. Three or more configuration, database-unavailable,
transaction-conflict, or write-failure increments within ten minutes, sustained
for the five-minute hold, indicate a degraded durable sink rather than a single
transient retry. Restore the dependency or configuration through the incident
procedure, require pending to return to zero, and run read-only chain
verification. Do not print connection strings, signing material, or event
payloads while collecting evidence.

### AuthenticationFailureSpike

Owner: `security`. Break down by service and correlate redacted audit logs,
source networks, and account targets. Apply approved abuse controls without
blocking responders or exposing account existence.

### MfaFailureSpike

Owner: `security`. Check admin/user MFA audit events, targeted identities, and
source networks. Escalate suspected credential stuffing or MFA fatigue.

### AdminMfaFailureSpike

Owner: `security`. Focus on MFA failures recorded by `api-admin`, confirm the
targeted admin identities from redacted audit evidence, and activate the
privileged-access incident process when activity is unexplained.

### AuthorizationDenialSpike

Owner: `security`. Review bounded audit events and recent authorization changes.
This signal combines instrumented 401 and 403 denials; it is not a separate
status-code rate.

### AdminPermissionDenied

Owner: `security`. Review the bounded `permission` and `operationalRole` fields
in the corresponding secret-safe audit event, identify the actor and operation,
and determine whether this was abuse, a stale role assignment, or an
authorization-policy deployment error. Do not weaken the permission check to
silence the alert.

### PrivilegedActionFailure

Owner: `security`. Identify the admin mutation, actor, target resource, and
failure reason from signed audit evidence. Confirm no partial state change.

### AdminChangeBurst

Owner: `security`. Confirm the activity is tied to an approved operation and
expected actor. Escalate unexplained volume as a privileged-access incident.

### BankDetailsChanged

Owner: `finance-operations`. Follow the approved payout-control verification and
cooling-off process. Do not approve or execute a payout merely because the
change was authenticated.

### PayoutActionFailed

Owner: `finance-operations`. Preserve the idempotency key, approvals, audit
event, and provider response. Do not blindly retry or bypass dual approval.

### PaymentWebhookReconciliationBlocked

Owner: `payments`. Inspect the durable webhook record, identity conflict/retry
state, provider event ID, booking/order/payment linkage, and reconciliation
runbook. Keep payment feature flags closed unless the launch gate is approved.

### CallAuthorizationDenialSpike

Owner: `realtime`. Review denial reasons and booking state without logging room
tokens or clinical content. Confirm policy consistency across create, join, and
redeem paths.

## Monitoring-stack alerts

### LogCollectorDown

Owner: `infrastructure`. Check Alloy component health and
`loki_write_*` failure/retry metrics, Loki reachability, persistent position
storage permissions, and the two read-only host log mounts. Do not solve a read
failure by mounting the Docker socket. After recovery, confirm a synthetic
non-sensitive line reaches Loki once without replaying an entire file.

### LokiDown

Owner: `infrastructure`. Check Loki process/storage health, free space,
filesystem ownership, compactor errors, and Alloy write retries. Preserve
incident evidence before any storage repair. Do not recursively delete `/loki`
or disable retention to clear disk pressure.

### AlertmanagerDown

Owner: `platform`. Restore Alertmanager and confirm Prometheus can reach it.
After recovery, verify pending/firing alerts and the approved receiver delivery
path; alerts may have been undelivered during the outage.

### PrometheusSelfScrapeFailed

Owner: `platform`. Check Prometheus process, storage, config reload errors, and
host capacity. This self-alert cannot notify while Prometheus itself is fully
down, so an independent external monitor remains required.
