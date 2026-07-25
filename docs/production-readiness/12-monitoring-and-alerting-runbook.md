# Production monitoring and alerting runbook

Last reviewed: 2026-07-25.

## Current verdict

**NOT READY**

The repository defines Prometheus, blackbox exporter, MongoDB and Redis
exporters, node exporter, a constrained Docker metrics path, Grafana Alloy,
Loki and Alertmanager. JSON health endpoints are blackbox probes rather than
Prometheus metric scrapes.

Human notification is intentionally not configured in Git. The committed
Alertmanager receiver is `unconfigured-destination` and has no email, chat,
paging or webhook destination. Uptime Kuma monitors are not evidenced. Live
targets, notification delivery, acknowledgement and production alert behavior
were not tested while preparing this document.

Runtime candidate `1ecd0b379369258be466159364a8a48c79fb65aa`
candidate-bound local server-staging validation passed 35/35 targets and drove
all 20 required P0 alerts through firing and resolution in Prometheus and the
isolated Alertmanager sink, returning both systems to zero active alerts.
That overlay deliberately has neither the production Docker metrics gateway
nor Uptime Kuma. It does not prove an approved protected receiver, human
delivery, real-server targets, production probe coverage or response.

The detailed rule-by-rule response source is
[the monitoring alert runbook](../../menorah/docs/monitoring-alert-runbook.md).
The 69 alert annotations currently bind to that file on the protected release
branch because it is absent from `main`; retain a local checked-out copy for
provider/GitHub outages and update the URLs plus validator atomically after an
approved stable merge.

## Launch-blocking monitoring state

| Area | Repository state | External evidence required |
| --- | --- | --- |
| Metrics and probes | Configured and repository-testable | Every target `UP`; every blackbox target `probe_success=1` |
| MongoDB | Exporter and rules configured | Dedicated monitor role; `mongodb_up=1`; primary replica state |
| Redis | Exporter and rules configured | Least-privilege ACL where enabled; `redis_up=1` |
| Host/containers | Node and constrained container metrics configured | Disk/CPU/memory/restart coverage on target host |
| Backups | Age/status metrics and rules configured | Signed health check, daily backup and restore test each within 24 hours |
| Logs | Alloy/Loki local configuration exists | Live source coverage, India location/180-day retrieval and access control |
| Alert routing | Alertmanager process/config exists | Approved protected destination, routing and receiver-side delivery |
| External uptime | No Uptime Kuma monitors evidenced | Public monitor inventory, alert route and controlled test |
| Response | Owner labels exist | Named primary/alternate, rota, acknowledgement and escalation evidence |

No process-level “healthy” status substitutes for end-to-end delivery to a
human.

## Owners and first response

Assign a named primary and alternate to every source-controlled owner label:

| Label | Responsibility |
| --- | --- |
| `platform` | APIs, workers, deployment artifacts and container lifecycle |
| `backend` | API dependency/readiness and application failures |
| `web` | user, counsellor, admin and landing frontends |
| `realtime` | call and WebSocket authorization/availability |
| `data-platform` | MongoDB, Redis and schema state |
| `infrastructure` | host, disk, network, TLS, backups and monitoring stack |
| `security` | audit integrity, authentication, MFA and authorization anomalies |
| `payments` | webhook and payment reconciliation |
| `finance-operations` | bank-change and payout events |

Critical alerts require immediate incident-rotation acknowledgement and an
incident lead. Warning alerts use the owner-approved response window and
escalate when impact grows. Preserve graphs, target status, release SHA,
container identity, bounded logs and audit evidence before restart.

## Repository validation

These commands are validation instructions, not a claim of results:

```sh
cd menorah/scripts/qa
npm ci
npm run test:monitoring
```

Where Docker is available, also use the pinned native validators documented in
the source monitoring runbook for Prometheus configuration/rules, blackbox,
Alertmanager, Alloy and Loki. Validate the fully interpolated model on the
target host without displaying environment values:

```sh
cd /opt/menorah/menorah-mobile-app-/menorah
docker compose \
  --env-file deploy/env/production.env \
  --env-file deploy/env/cloudflare.env \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.tunnel.yml \
  config --quiet
```

Repository tests prove configuration invariants only. They do not prove live
scrapes, network access, alert delivery, logging retention or operator
response.

## Infrastructure activation before launch

1. `INFRASTRUCTURE ACTION`: configure the documented least-privilege MongoDB
   monitoring identity inputs and, where Redis authentication is enabled, a
   read-only monitoring ACL. Keep URIs outside Git. Do not create the MongoDB
   user ad hoc: the guarded, writer-stopped release boundary provisions a
   missing candidate-managed identity under durable recovery state.
2. Create an external Alertmanager file with approved destinations, safe
   redaction, severity routing and escalation. Install it outside the checkout
   as uid `65534`, production-operator group, mode `0440`; set only the path in
   `ALERTMANAGER_CONFIG_FILE`.
3. Start/reconcile the stack only through the guarded exact-SHA release path.
4. Confirm Prometheus, Alertmanager, exporters, Alloy, Loki and Grafana are
   healthy and access controlled.
5. Confirm every expected target is present and `UP`, and every blackbox probe
   succeeds.
6. Confirm API/security metrics do not expose secrets, tokens, user data or
   unbounded labels.
7. Configure public Uptime Kuma monitors and approved notification routes;
   retain a monitor export or redacted screenshots.
8. Perform controlled rule and delivery tests in staging. Do not stop a
   production dependency just to create an alert.
9. Prove log-source coverage, time synchronization, protected access, India
   location and 180-day retrieval under legal/owner direction.

## Covered alerts

Use the rule-specific instructions in the source runbook.

| Domain | Alerts currently represented |
| --- | --- |
| Availability/TLS | `BlackboxExporterDown`, `BlackboxProbeCoverageIncomplete`, `InternalApiProbeFailed`, `InternalFrontendProbeFailed`, separate user/admin/counsellor frontend failures, `WorkerReadinessProbeFailed`, `CallServiceProbeFailed`, `DatastoreTcpProbeFailed`, `PublicEndpointProbeFailed`, `TlsCertificateExpiringSoon`, security-metrics scrape/coverage |
| MongoDB/Redis | exporter down, unavailable, metrics missing, non-primary replica, Redis memory pressure and rejected connections |
| Host/containers | `NodeExporterDown`, disk space, CPU, memory, container metrics/coverage, restart loop and near-memory-limit |
| Backup/recovery | immediate `BackupJobFailed`, metrics stale, six-hourly age, daily missing/age, weekly/monthly age and restore-test age |
| Security | audit-integrity failure, pending/write failures, separate user/counsellor/admin-MFA authentication spikes, HTTP 401/403/429/500 rates, authorization denials, admin permission denial, privileged/admin role changes, privileged-action failure and admin-change burst |
| Queue/payment/email/calls | worker backlog/age/retry/dead-letter/heartbeat, payment provider/webhook failure, email dispatch/delivery failure, call provider/media failure, bank details changed, payout action failed, payment-webhook reconciliation blocked and call-authorization denial spike |
| Monitoring/logging | log collector, Loki, Alertmanager and Prometheus self-scrape failures |

For backup acceptance, run the cryptographic health check:

```sh
cd /opt/menorah/menorah-mobile-app-/menorah
bash deploy/ubuntu/check-backup-health.sh
```

Filesystem age metrics do not validate an archive signature. The daily backup
and matching isolated restore-test evidence must each be no older than 24
hours. Never create or edit a marker to clear an alert.

## Repository P0 signal coverage

The source-controlled coverage register now includes all 20 required P0
signals: queue backlog; immediate backup failure; payment provider/webhook
failure; email dispatch/delivery failure; call provider/media failure;
privileged/admin role changes; separate user, counsellor and administrator/MFA
authentication spikes; HTTP 401, 403, 429 and 500 rates; and separate
user/admin/counsellor frontend failures.

Repository validation proves bounded label schemas, producer presence,
Prometheus rule syntax, firing/recovery fixtures, severity, runbook links,
explicit owner placeholders and privacy/cardinality mutation tests. It does
not prove live series, provider callbacks, threshold suitability, delivery or
human response.

- `INFRASTRUCTURE ACTION`: validate every signal and target in isolated
  staging, install an approved protected receiver, and retain controlled
  firing/recovery/delivery evidence.
- `OWNER ACTION`: replace explicit owner placeholders with approved named
  primary/alternate responsibilities before launch.
- `VAPT ACTION`: validate that security monitoring detects the agreed abuse
  cases and does not leak sensitive data.

## Controlled delivery test

Run only after an approved destination is installed and in an approved
staging/change window:

```sh
docker compose \
  --env-file deploy/env/production.env \
  -f deploy/docker-compose.production.yml \
  exec alertmanager \
  amtool alert add MonitoringDeliveryTest \
    severity=warning owner=platform service=alert-test \
    --annotation=summary="Controlled Menorah notification delivery test"
```

Record:

- effective receiver is not `unconfigured-destination`;
- alert arrival at the primary destination;
- acknowledgement by the named responder;
- repeat suppression and resolved behavior;
- Alertmanager status, delivery/acknowledgement UTC times and tester; and
- cleanup under the destination's approved procedure.

Separately stop only a disposable staging target for longer than a real rule's
`for` interval, then confirm firing, delivery, acknowledgement, recovery and
resolution. Never use a production dependency for this test.

## Triage sequence

1. Confirm the alert is real using a second signal.
2. Identify environment, exact release SHA, service, dependency and impact.
3. Preserve evidence before restart or scaling.
4. Follow the alert-specific owner instructions.
5. Open [the incident runbook](./11-incident-response-runbook.md) for critical,
   expanding, security, data, payment or recovery events.
6. Use only guarded deployment/rollback/recovery procedures.
7. Confirm the underlying condition, notification and dependent service all
   recover; silence alone is not resolution.
8. Record root cause, corrective action, missing telemetry and follow-up owner.

## Evidence pack

- [ ] Final candidate SHA and monitoring configuration checksum.
- [ ] Repository and pinned native validator results.
- [ ] Compose interpolation result from the target host.
- [ ] Prometheus target and blackbox coverage.
- [ ] MongoDB/Redis least-privilege role evidence.
- [ ] Signed backup health plus <=24-hour backup/restore evidence.
- [ ] Protected Alertmanager destination configuration approval.
- [ ] Controlled synthetic and real-rule staging delivery evidence.
- [ ] Uptime Kuma monitor inventory and test.
- [ ] Named rota and acknowledgement records.
- [ ] Logging source, access, retention, India location and retrieval test.
- [ ] Controlled isolated-staging proof for every required P0 signal.

Until all launch-critical items are evidenced, monitoring remains a public
launch blocker and the verdict remains **NOT READY**.
