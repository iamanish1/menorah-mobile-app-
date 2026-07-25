# Staging monitoring and alert validation

Runtime candidate SHA: `1ecd0b379369258be466159364a8a48c79fb65aa`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Approved Ubuntu/server staging state: **not run**. The local Docker exercise
finished with 35/35 Prometheus targets healthy across 14 scrape jobs, 69 rules
loaded, 26 coverage records present, all 20 required P0 fixtures fired and
resolved in both Prometheus and Alertmanager, and zero alerts active before and
after the exercise. Protected receiver/human-response evidence remains open.

The server overlay and approval order are defined in the
[server-staging design and discovery runbook](../29-server-staging-design-and-discovery-runbook.md).

Repository status: **14 scrape jobs, 69 alert rules, 26 coverage records and
all 20 required P0 mappings pass source validation**

The rule-specific response source is
[the monitoring alert runbook](../../../menorah/docs/monitoring-alert-runbook.md);
the handover status and activation controls are in
[the monitoring and alerting runbook](../12-monitoring-and-alerting-runbook.md).
This plan does not configure or authorize a production destination.

## Required environment

- All 14 expected scrape jobs and blackbox probes expand to exactly 35 healthy
  targets in isolated staging.
- MongoDB/Redis exporters use dedicated least-privilege staging identities.
- The server-staging overlay has no Docker metrics gateway/exporter pair and no
  Uptime Kuma service. Those production-monitoring components and their
  evidence are a separate external production-readiness gap.
- Alertmanager uses an approved protected **staging** receiver, not
  `unconfigured-destination`.
- Named primary/alternate responders cover every owner placeholder.
- Logs use synthetic data, controlled access, synchronized UTC time and an
  approved staging retention period.

## Historical repository evidence and current native validation

[Exact-SHA functional run 30051102471](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102471)
validated 14 scrape jobs, 69 rules, 26 coverage records, all 20 required P0
mappings, configuration mutation tests, Prometheus rule fixtures and the
pinned native monitoring suite at historical SHA
`3fb99858c6766a341bb7b7dab2377195427f0ea1`. That result is
**INVALIDATED** for `1ecd0b379369258be466159364a8a48c79fb65aa` and cannot be
relabelled. At the current candidate, the
[exact functional push run](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30158172290)
passed 9/9 jobs and 89/89 steps, and the local runtime ended with 35/35
targets healthy, the 20 required alert fixtures resolved and zero active
alerts. This does not prove protected server receiver delivery,
acknowledgement or escalation; exact local results are in report 28.

Rerun on the approved isolated-staging checkout:

```bash
cd menorah/scripts/qa
npm ci
npm run test:monitoring
```

Run the exact pinned native commands from
[the source runbook](../../../menorah/docs/monitoring-alert-runbook.md#repository-validation).
Counts do not replace exit-code, failure and warning review.

## Universal staging evidence

For every rule retain:

- exact runtime SHA, rule name, severity and owner label;
- bounded trigger and UTC start/firing times;
- Prometheus expression/series and Alertmanager route;
- primary and alternate delivery plus acknowledgement actor/time;
- deduplication/repeat behavior;
- corrective action and UTC recovery/resolved times; and
- links to the source runbook and controlled evidence location.

Also retain the exact 35-target inventory, redacted Prometheus targets/rules,
blackbox `probe_success`, MongoDB/Redis exporter health, backup cryptographic
health and Alloy/Loki ingestion. Missing series fail. The server overlay has no
Docker metrics gateway/exporter or Uptime Kuma; their production evidence must
remain separately labelled and cannot be inferred here.

## Required P0 alert rows

All rows below have bounded repository producers, source rules,
firing/recovery fixtures and runbooks. The local Docker exercise passed all 20
as recorded in report 28. The `NOT RUN` status in this table refers only to
approved Ubuntu/server-staging execution with protected receiver and human
response evidence.

| Rule | Controlled server-staging firing proof | Controlled server-staging recovery proof | Approved Ubuntu/server evidence |
| --- | --- | --- | --- |
| `WorkerQueueBacklogHigh` | Create bounded synthetic backlog/age/retry/dead-letter or pause only the disposable worker | Drain fixture, restore heartbeat and receive resolved notification | NOT RUN |
| `BackupJobFailed` | Run an isolated scheduled-backup failure fixture without modifying a valid archive | Complete a fresh signed/encrypted staging backup and receive resolved notification | NOT RUN |
| `PaymentProviderFailure` | Use provider sandbox/stub order, verification, refund or payout failure | Restore sandbox path and receive resolved notification | NOT RUN |
| `PaymentWebhookFailure` | Use signed sandbox signature/relationship/processing/reconciliation failure and replay cases | Reconcile the bounded event and receive resolved notification | NOT RUN |
| `EmailDispatchFailed` | Use exact staging-domain synthetic email with provider/stub failure | Restore dispatch and receive resolved notification | NOT RUN |
| `EmailDeliveryOutcomeFailed` | Send a signed Resend/Svix bounce, complaint, suppression or failure callback fixture | Clear fixture/provider condition and receive resolved notification | NOT RUN |
| `CallProviderFailure` | Use an approved staging token/room/fallback provider failure | Restore approved provider access and receive resolved notification | NOT RUN |
| `CallMediaFailure` | Use a disposable room/device/network media-establishment failure without recording content | Restore media path and receive resolved notification | NOT RUN |
| `PrivilegedRoleChanged` | Perform a pre-approved synthetic privileged-role transition | Reconcile the intended role and receive resolved notification | NOT RUN |
| `AdminRoleChanged` | Perform a pre-approved synthetic admin-permission transition | Reconcile exact permissions and receive resolved notification | NOT RUN |
| `UserAuthenticationFailureSpike` | Emit bounded synthetic user failures | Stop fixture, wait the rule window and receive resolved notification | NOT RUN |
| `AdminAuthenticationMfaFailureSpike` | Emit bounded synthetic admin MFA failures | Stop fixture, wait the rule window and receive resolved notification | NOT RUN |
| `CounsellorAuthenticationFailureSpike` | Emit bounded synthetic counsellor failures | Stop fixture, wait the rule window and receive resolved notification | NOT RUN |
| `ElevatedHttp401Rate` | Send bounded unauthenticated requests to normalized routes | Stop fixture and receive resolved notification | NOT RUN |
| `ElevatedHttp403Rate` | Send bounded wrong-role requests to normalized routes | Stop fixture and receive resolved notification | NOT RUN |
| `ElevatedHttp429Rate` | Trigger an approved bounded staging rate limit | Stop fixture and receive resolved notification | NOT RUN |
| `ElevatedHttp500Rate` | Inject an isolated controlled server failure | Remove injection, prove healthy responses and receive resolved notification | NOT RUN |
| `UserFrontendProbeFailed` | Stop only the disposable user frontend | Restore exact artifact/probe and receive resolved notification | NOT RUN |
| `AdminFrontendProbeFailed` | Stop only the disposable admin frontend | Restore exact artifact/probe and receive resolved notification | NOT RUN |
| `CounsellorFrontendProbeFailed` | Stop only the disposable counsellor frontend | Restore exact artifact/probe and receive resolved notification | NOT RUN |

The other 49 implemented rules require the same evidence. Use the source
runbook as the authoritative inventory and response procedure; do not
duplicate expressions or thresholds here.

## Staging-only controlled delivery test

Run only after the protected staging receiver and named responder are approved:

```bash
# STAGING-ONLY; approved isolated staging host.
cd /opt/menorah-staging/app
docker compose \
  --project-name menorah-staging \
  --env-file /opt/menorah-staging/env/server-staging.env \
  -f menorah/deploy/server-staging/compose.yml \
  exec -T staging-alertmanager \
  amtool alert add MonitoringDeliveryTest \
    environment=staging stack=menorah-staging \
    monitoring_scope=server-staging \
    severity=warning owner=platform service=alert-test \
    --annotation=summary="Controlled Menorah staging notification test"
```

Record route/receiver, primary and alternate delivery, acknowledgement,
deduplication/repeat and cleanup. Separately trigger each real rule with only
synthetic fixtures or disposable staging targets, then restore it and record
the resolved notification. Never stop a production dependency, use live
provider accounts or silence a rule to manufacture success.

## Logging and sensitive-data validation

Generate unique synthetic canaries for token, contact, clinical, payment,
consent and file content. Pass only when prohibited values are absent from
application/proxy logs and bounded correlation/audit fields remain. Verify
source coverage, UTC timestamps, access denial, retrieval and disposition.
India location/180-day production evidence remains `LEGAL ACTION`,
`PRIVACY ACTION` and `INFRASTRUCTURE ACTION`; staging does not prove it.

## Completion gate

Server-staging monitoring is **NO-GO** until all 69 rules load and pass source
validation; all 20 required P0 rows have controlled firing, receiver delivery,
human acknowledgement, recovery and resolved evidence; all 35 targets are
healthy; pre/post exercise alert state is quiet; backup health is
cryptographically verified; and named responders replace every owner
placeholder.

Passing that server-staging gate would not close the separate production
monitoring gap: production Docker metrics gateway/exporter and Uptime Kuma
evidence still require external collection and review.
