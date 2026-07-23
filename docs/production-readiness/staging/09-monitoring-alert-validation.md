# Staging monitoring and alert validation

Runtime candidate SHA: `4c82121bfa2293a21a831bc490f4101eb4db1213`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Initial state: **not run**

The rule-specific response source is
[the monitoring alert runbook](../../../menorah/docs/monitoring-alert-runbook.md);
the handover status and activation controls are in
[12-monitoring-and-alerting-runbook.md](../12-monitoring-and-alerting-runbook.md).
This staging plan does not configure a production destination.

## Required environment

- All 14 expected scrape jobs and blackbox probes run in isolated staging.
- MongoDB/Redis exporters use dedicated least-privilege staging identities.
- Docker metrics gateway/exporter use their isolated two-service network and
  cannot expose raw Docker operations or other projects.
- Alertmanager uses an approved protected **staging** receiver, not
  `unconfigured-destination`.
- Uptime Kuma has staging-only public monitors and the test receiver.
- Named primary/alternate responders cover every owner label.
- Logs use synthetic data, controlled access, synchronized UTC time and an
  approved staging retention period.

## Repository and native validation

```bash
cd menorah/scripts/qa
npm ci
npm run test:monitoring
```

Expected candidate drift checks are 31 Node subtests, 14 scrape jobs, 53 alert
rules and 26 signal records, plus the pinned native Prometheus, Alertmanager,
Blackbox, Alloy and Loki checks. The 20 required missing alert rows below are
additional blockers, not expected passing source rules. These counts do not
replace exit-code and failure review. Run the exact pinned native commands from
[the source runbook](../../../menorah/docs/monitoring-alert-runbook.md#repository-validation).

## Staging signal acceptance

Retain redacted Prometheus target and rule status, blackbox `probe_success`,
MongoDB/Redis exporter health, Docker gateway coverage, backup cryptographic
health, Alloy/Loki ingestion and public Uptime Kuma results. Every target must
be present; silently missing series are failures.

## Alert validation matrix

Every source rule has its own execution row. Preserve the rule name, severity
and owner label exactly; a grouped notification does not collapse the
rule-level evidence obligation.

| Trigger | Rule | Severity | Owner | Destination | Firing proof | Resolved proof | Runbook | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Blackbox exporter unavailable beyond `for` | `BlackboxExporterDown` | critical | platform | Staging platform receiver | Stop only the disposable staging exporter | Restore exporter; metric and notification resolve | Source runbook | TBD — NOT RUN |
| Expected blackbox probe series absent | `BlackboxProbeCoverageIncomplete` | critical | platform | Staging platform receiver | Remove one controlled staging probe target | Restore complete probe coverage and resolved delivery | Source runbook | TBD — NOT RUN |
| Internal API readiness probe fails | `InternalApiProbeFailed` | critical | backend | Staging backend receiver | Stop one disposable staging API | Restart exact artifact; readiness and notification resolve | Source runbook | TBD — NOT RUN |
| Internal frontend readiness probe fails | `InternalFrontendProbeFailed` | critical | web | Staging web receiver | Stop one disposable staging frontend | Restart exact artifact; readiness and notification resolve | Source runbook | TBD — NOT RUN |
| Worker readiness probe fails | `WorkerReadinessProbeFailed` | critical | backend | Staging backend receiver | Stop the disposable staging worker | Restart exact artifact; readiness and notification resolve | Source runbook | TBD — NOT RUN |
| Call-service readiness probe fails | `CallServiceProbeFailed` | critical | realtime | Staging realtime receiver | Stop the disposable staging call target | Restore target and dependent readiness; notification resolves | Source runbook | TBD — NOT RUN |
| Datastore TCP probe fails | `DatastoreTcpProbeFailed` | critical | data-platform | Staging data receiver | Block one approved staging probe path | Reopen path; probe and notification resolve | Source runbook | TBD — NOT RUN |
| Public endpoint probe fails | `PublicEndpointProbeFailed` | critical | platform | Staging platform receiver | Stop one disposable public staging route | Restore route; probe and notification resolve | Source runbook | TBD — NOT RUN |
| TLS remaining lifetime crosses threshold | `TlsCertificateExpiringSoon` | warning | platform | Staging platform receiver | Use an approved rule-test series, not certificate tampering | Remove fixture; rule and notification resolve | Source runbook | TBD — NOT RUN |
| Security metrics scrape target unavailable | `SecurityMetricsScrapeFailed` | critical | security | Staging security receiver | Stop one disposable API metrics target | Restore target; scrape and notification resolve | Source runbook | TBD — NOT RUN |
| Expected security metric series absent | `SecurityMetricsCoverageIncomplete` | critical | security | Staging security receiver | Remove one controlled expected series | Restore all expected series and resolved delivery | Source runbook | TBD — NOT RUN |
| Mongo exporter unavailable | `MongoExporterDown` | critical | data-platform | Staging data receiver | Stop only the staging exporter | Restore exporter; target and notification resolve | Source runbook | TBD — NOT RUN |
| Mongo reports unavailable | `MongoUnavailable` | critical | data-platform | Staging data receiver | Use approved isolated connection fault | Restore connectivity; `mongodb_up` and notification resolve | Source runbook | TBD — NOT RUN |
| Expected Mongo metric series absent | `MongoMetricsCoverageMissing` | critical | data-platform | Staging data receiver | Remove one controlled exporter series | Restore complete coverage and resolved delivery | Source runbook | TBD — NOT RUN |
| Mongo primary-state assertion fails | `MongoReplicaNotPrimary` | critical | data-platform | Staging data receiver | Use approved replica-state fixture; never corrupt the set | Restore approved primary state and resolved delivery | Source runbook | TBD — NOT RUN |
| Redis exporter unavailable | `RedisExporterDown` | critical | data-platform | Staging data receiver | Stop only the staging exporter | Restore exporter; target and notification resolve | Source runbook | TBD — NOT RUN |
| Redis reports unavailable | `RedisUnavailable` | critical | data-platform | Staging data receiver | Use approved isolated ACL/connection fault | Restore access; `redis_up` and notification resolve | Source runbook | TBD — NOT RUN |
| Expected Redis metric series absent | `RedisMetricsCoverageMissing` | critical | data-platform | Staging data receiver | Remove one controlled exporter series | Restore complete coverage and resolved delivery | Source runbook | TBD — NOT RUN |
| Redis memory crosses threshold | `RedisMemoryPressure` | warning | data-platform | Staging data receiver | Use a bounded disposable memory fixture | Remove fixture; memory and notification resolve | Source runbook | TBD — NOT RUN |
| Redis rejects a connection | `RedisRejectedConnections` | critical | data-platform | Staging data receiver | Use a bounded isolated rejection fixture | Restore capacity/access; counter condition and notification resolve | Source runbook | TBD — NOT RUN |
| Node exporter unavailable | `NodeExporterDown` | critical | infrastructure | Staging infrastructure receiver | Stop only the disposable staging exporter | Restore exporter; target and notification resolve | Source runbook | TBD — NOT RUN |
| Host disk space crosses threshold | `HostDiskSpaceLow` | critical | infrastructure | Staging infrastructure receiver | Use an approved bounded staging filesystem fixture | Remove fixture; free space and notification resolve | Source runbook | TBD — NOT RUN |
| Host CPU crosses threshold | `HostCpuSaturation` | warning | infrastructure | Staging infrastructure receiver | Apply approved bounded disposable load | Remove load; metric and notification resolve | Source runbook | TBD — NOT RUN |
| Host memory crosses threshold | `HostMemoryPressure` | critical | infrastructure | Staging infrastructure receiver | Apply approved bounded disposable load | Remove load; metric and notification resolve | Source runbook | TBD — NOT RUN |
| Container metrics target unavailable | `ContainerMetricsDown` | warning | infrastructure | Staging infrastructure receiver | Stop only the staging metrics exporter | Restore exporter; target and notification resolve | Source runbook | TBD — NOT RUN |
| Expected container metric series absent | `ContainerMetricsCoverageMissing` | critical | infrastructure | Staging infrastructure receiver | Remove one controlled staging container series | Restore complete coverage and resolved delivery | Source runbook | TBD — NOT RUN |
| Container restart count crosses threshold | `ContainerRestartLoop` | critical | platform | Staging platform receiver | Restart only a disposable staging container as approved | Restore stable artifact; window and notification resolve | Source runbook | TBD — NOT RUN |
| Container memory nears limit | `ContainerMemoryNearLimit` | warning | platform | Staging platform receiver | Use a bounded disposable container fixture | Remove fixture; memory and notification resolve | Source runbook | TBD — NOT RUN |
| Backup metric file becomes stale | `BackupMetricsStale` | critical | infrastructure | Staging recovery receiver | Use candidate fixture; never edit a real marker | Restore collector output; metric and notification resolve | Source and backup runbooks | TBD — NOT RUN |
| Six-hourly backup exceeds age | `SixHourlyBackupTooOld` | critical | infrastructure | Staging recovery receiver | Use approved age fixture | Produce and verify a fresh signed backup; notification resolves | Source and backup runbooks | TBD — NOT RUN |
| Daily backup series reports missing | `DailyBackupMissing` | critical | infrastructure | Staging recovery receiver | Use approved missing-series fixture | Restore verified daily backup series and resolved delivery | Source and backup runbooks | TBD — NOT RUN |
| Daily backup exceeds age | `DailyBackupTooOld` | critical | infrastructure | Staging recovery receiver | Use approved age fixture | Produce and verify a fresh signed backup; notification resolves | Source and backup runbooks | TBD — NOT RUN |
| Weekly backup exceeds age | `WeeklyBackupTooOld` | warning | infrastructure | Staging recovery receiver | Use approved age fixture | Produce and verify a fresh signed backup; notification resolves | Source and backup runbooks | TBD — NOT RUN |
| Monthly backup exceeds age | `MonthlyBackupTooOld` | warning | infrastructure | Staging recovery receiver | Use approved age fixture | Produce and verify a fresh signed backup; notification resolves | Source and backup runbooks | TBD — NOT RUN |
| Restore-test evidence exceeds age | `RestoreTestTooOld` | critical | infrastructure | Staging recovery receiver | Use approved restore-age fixture | Complete verified isolated restore test; notification resolves | Source and backup runbooks | TBD — NOT RUN |
| Audit evidence integrity check fails | `SecurityAuditEvidenceIntegrityFailure` | critical | security | Staging security receiver | Use candidate disposable integrity fixture | Restore intact evidence; integrity and notification resolve | Source and incident runbooks | TBD — NOT RUN |
| Audit sink remains pending | `SecurityAuditSinkPending` | critical | security | Staging security receiver | Use candidate disposable pending fixture | Drain sink safely; state and notification resolve | Source and incident runbooks | TBD — NOT RUN |
| Audit sink write failures increase | `SecurityAuditSinkWriteFailures` | critical | security | Staging security receiver | Use candidate disposable write-failure fixture | Repair sink; writes and notification resolve | Source and incident runbooks | TBD — NOT RUN |
| Authentication failures cross threshold | `AuthenticationFailureSpike` | warning | security | Staging security receiver | Emit bounded synthetic failures; no shared-service brute force | Stop fixture; wait window and verify resolved delivery | Source runbook | TBD — NOT RUN |
| MFA failures cross threshold | `MfaFailureSpike` | critical | security | Staging security receiver | Emit bounded synthetic MFA failures | Stop fixture; wait window and verify resolved delivery | Source runbook | TBD — NOT RUN |
| Admin MFA failures cross threshold | `AdminMfaFailureSpike` | critical | security | Staging security receiver | Emit bounded synthetic admin MFA failures | Stop fixture; wait window and verify resolved delivery | Source runbook | TBD — NOT RUN |
| Authorization denials cross threshold | `AuthorizationDenialSpike` | warning | security | Staging security receiver | Run bounded wrong-role synthetic cases | Stop cases; wait window and verify resolved delivery | Source runbook | TBD — NOT RUN |
| Admin permission denial occurs | `AdminPermissionDenied` | critical | security | Staging security receiver | Run approved synthetic denied-admin action | Stop case; prove normal authorization and resolved delivery | Source runbook | TBD — NOT RUN |
| Privileged action reports failure | `PrivilegedActionFailure` | warning | security | Staging security receiver | Run approved failed privileged-action fixture | Reconcile state and verify resolved delivery | Source runbook | TBD — NOT RUN |
| Admin change count crosses threshold | `AdminChangeBurst` | warning | security | Staging security receiver | Emit bounded approved synthetic changes | Stop fixture; wait window and verify resolved delivery | Source runbook | TBD — NOT RUN |
| Bank details change event occurs | `BankDetailsChanged` | warning | finance-operations | Staging finance receiver | Run approved synthetic change fixture | Reconcile state and record receiver closure | Source runbook | TBD — NOT RUN |
| Payout action reports failure | `PayoutActionFailed` | critical | finance-operations | Staging finance receiver | Run approved sandbox payout-failure fixture | Reconcile failure and verify resolved delivery | Source runbook | TBD — NOT RUN |
| Payment webhook reconciliation blocks | `PaymentWebhookReconciliationBlocked` | critical | payments | Staging payments receiver | Use terminal sandbox mismatch/retry fixture | Perform reviewed staging reconciliation; notification resolves | Source and provider runbooks | TBD — NOT RUN |
| Call authorization denials cross threshold | `CallAuthorizationDenialSpike` | warning | realtime | Staging realtime receiver | Run bounded wrong-party/replay cases | Stop cases; prove normal call and resolved delivery | Source runbook | TBD — NOT RUN |
| Log collector unavailable | `LogCollectorDown` | critical | infrastructure | Independent staging infrastructure receiver | Stop only the disposable staging collector | Restore collector and report lost/buffered interval; resolve | Source runbook | TBD — NOT RUN |
| Loki unavailable | `LokiDown` | critical | infrastructure | Independent staging infrastructure receiver | Stop only the disposable staging Loki service | Restore Loki and report lost/buffered interval; resolve | Source runbook | TBD — NOT RUN |
| Alertmanager unavailable | `AlertmanagerDown` | critical | platform | Independent staging platform receiver | Stop only the disposable staging Alertmanager | Restore service; target and independent notification resolve | Source runbook | TBD — NOT RUN |
| Prometheus self-scrape fails | `PrometheusSelfScrapeFailed` | critical | platform | Independent staging platform receiver | Stop only the disposable self-scrape path | Restore path; target and independent notification resolve | Source runbook | TBD — NOT RUN |

## Required but unavailable alert rows

These 20 required alerts are not present in `alert-rules.yml`. They are
explicitly **BLOCKED / MISSING**, not part of the 53 implemented-rule count.
Each must gain low-cardinality telemetry, a source rule, a tested route and a
runbook before its row can be executed.

| Trigger | Required rule | Severity | Owner | Destination | Firing proof | Resolved proof | Runbook | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Worker queue depth/oldest age crosses approved threshold | `WorkerQueueBacklogHigh` | critical | backend | Staging backend receiver | BLOCKED — queue depth/age telemetry and source rule are missing; after implementation use bounded synthetic jobs | MISSING — drain bounded fixture, prove metric recovery and resolved delivery | MISSING — backend/worker owner must approve threshold and response | BLOCKED — MISSING |
| Any scheduled/manual backup job exits unsuccessfully | `BackupJobFailed` | critical | infrastructure | Staging recovery receiver | BLOCKED — immediate job-result signal/rule is missing; after implementation run an isolated controlled failure | MISSING — complete a fresh encrypted/signed backup and prove resolved delivery | MISSING — recovery owner must add immediate-failure response | BLOCKED — MISSING |
| Payment provider request fails or times out | `PaymentProviderFailure` | critical | payments | Staging payments receiver | BLOCKED — provider outcome telemetry/rule is missing; after implementation use a sandbox failure fixture | MISSING — restore sandbox provider path and prove resolved delivery | MISSING — payments/vendor owner must define bounded provider response | BLOCKED — MISSING |
| Payment webhook processing fails before terminal reconciliation-block state | `PaymentWebhookFailure` | critical | payments | Staging payments receiver | BLOCKED — immediate webhook failure/retry-exhaustion rule is missing; use a sandbox signed failure fixture only | MISSING — process/reconcile the fixture and prove resolved delivery | MISSING — payments owner must link webhook and reconciliation runbooks | BLOCKED — MISSING |
| Email dispatch/provider request fails | `EmailDispatchFailed` | critical | backend | Staging backend/vendor receiver | BLOCKED — dispatch outcome telemetry/rule is missing; use exact-domain synthetic mail only | MISSING — restore the staging sender path and prove resolved delivery | MISSING — backend/vendor owner must add value-free email response steps | BLOCKED — MISSING |
| Email provider reports rejection, bounce or terminal delivery failure | `EmailDeliveryOutcomeFailed` | warning | backend | Staging backend/vendor receiver | BLOCKED — delivery outcome telemetry/rule is missing; use a staging-sink rejection fixture | MISSING — clear the bounded fixture and prove provider/receiver resolution | MISSING — backend/vendor owner must define suppression/retry handling | BLOCKED — MISSING |
| Approved regional call provider request fails | `CallProviderFailure` | critical | realtime | Staging realtime receiver | BLOCKED — provider outcome telemetry/rule is missing; use an approved staging fallback failure | MISSING — restore approved provider access and prove resolved delivery | MISSING — realtime/vendor/clinical owners must approve continuity response | BLOCKED — MISSING |
| LiveKit/media connection or transport fails after authorization | `CallMediaFailure` | critical | realtime | Staging realtime receiver | BLOCKED — media outcome telemetry/rule is missing; use a bounded disposable room/network fixture | MISSING — restore media path and prove resolved delivery without recording content | MISSING — realtime owner must add privacy-safe media response | BLOCKED — MISSING |
| Any privileged role is granted, removed or changed | `PrivilegedRoleChanged` | critical | security | Staging security receiver | BLOCKED — specific role-change signal/rule is missing; use a synthetic approved role transition | MISSING — reconcile intended role state and prove resolved delivery | MISSING — security/owner response and reviewer path required | BLOCKED — MISSING |
| Any admin permission set changes | `AdminRoleChanged` | critical | security | Staging security receiver | BLOCKED — admin permission-change signal/rule is missing; use a synthetic admin fixture | MISSING — reconcile exact approved permissions and prove resolved delivery | MISSING — security/admin owner response required | BLOCKED — MISSING |
| Repeated user authentication failures cross threshold | `UserAuthenticationFailureSpike` | warning | security | Staging security receiver | BLOCKED — user-surface counter/rule is missing; emit bounded synthetic failures | MISSING — stop fixture, wait window and prove resolved delivery | MISSING — security owner must approve threshold/rate-limit response | BLOCKED — MISSING |
| Repeated admin authentication failures cross threshold | `AdminAuthenticationFailureSpike` | critical | security | Staging security receiver | BLOCKED — admin-surface counter/rule is missing; emit bounded synthetic failures | MISSING — stop fixture, wait window and prove resolved delivery | MISSING — security/admin incident response required | BLOCKED — MISSING |
| Repeated counsellor authentication failures cross threshold | `CounsellorAuthenticationFailureSpike` | warning | security | Staging security receiver | BLOCKED — counsellor-surface counter/rule is missing; emit bounded synthetic failures | MISSING — stop fixture, wait window and prove resolved delivery | MISSING — security owner must approve threshold/rate-limit response | BLOCKED — MISSING |
| HTTP 401 rate crosses per-service threshold | `Http401RateHigh` | warning | security | Staging security receiver | BLOCKED — distinct low-cardinality 401 metric/rule is missing; use bounded unauthenticated requests | MISSING — stop fixture, wait window and prove resolved delivery | MISSING — security/backend runbook required | BLOCKED — MISSING |
| HTTP 403 rate crosses per-service threshold | `Http403RateHigh` | warning | security | Staging security receiver | BLOCKED — distinct low-cardinality 403 metric/rule is missing; use bounded wrong-role requests | MISSING — stop fixture, wait window and prove resolved delivery | MISSING — security/backend runbook required | BLOCKED — MISSING |
| HTTP 429 rate crosses per-service threshold | `Http429RateHigh` | warning | platform | Staging platform/security receiver | BLOCKED — distinct low-cardinality 429 metric/rule is missing; use bounded rate-limit requests | MISSING — stop fixture, wait window and prove resolved delivery | MISSING — platform/security runbook required | BLOCKED — MISSING |
| HTTP 500 rate crosses per-service threshold | `Http500RateHigh` | critical | backend | Staging backend receiver | BLOCKED — distinct low-cardinality 500 metric/rule is missing; use an isolated controlled failure | MISSING — remove fixture, prove healthy responses and resolved delivery | MISSING — backend incident runbook required | BLOCKED — MISSING |
| User application frontend readiness fails | `UserFrontendProbeFailed` | critical | web | Staging web receiver | BLOCKED — dedicated user-frontend probe/rule is missing; stop only the disposable user frontend | MISSING — restore exact artifact and prove probe plus resolved delivery | MISSING — web owner runbook required | BLOCKED — MISSING |
| Admin frontend readiness fails | `AdminFrontendProbeFailed` | critical | web | Staging web/security receiver | BLOCKED — dedicated admin-frontend probe/rule is missing; stop only the disposable admin frontend | MISSING — restore exact artifact and prove probe plus resolved delivery | MISSING — web/security owner runbook required | BLOCKED — MISSING |
| Counsellor frontend readiness fails | `CounsellorFrontendProbeFailed` | critical | web | Staging web receiver | BLOCKED — dedicated counsellor-frontend probe/rule is missing; stop only the disposable counsellor frontend | MISSING — restore exact artifact and prove probe plus resolved delivery | MISSING — web owner runbook required | BLOCKED — MISSING |

`INFRASTRUCTURE ACTION` must implement and test these rows or provide a
time-bounded manual control that remains a visible P0 exception. `OWNER ACTION`
decides any limited-pilot risk; none is silently accepted for public launch.

## STAGING-ONLY controlled delivery test

Run only after the protected staging receiver and named responder are approved:

```bash
# STAGING-ONLY; approved isolated staging host.
cd /srv/menorah-staging/repository/menorah
docker compose \
  --env-file /etc/menorah-staging/staging.env \
  -f deploy/docker-compose.production.yml \
  exec alertmanager \
  amtool alert add MonitoringDeliveryTest \
    severity=warning owner=platform service=alert-test \
    --annotation=summary="Controlled Menorah staging notification test"
```

Record Alertmanager route/receiver, firing time, primary and alternate
delivery, acknowledgement time/actor, deduplication/repeat behavior and the
approved cleanup. Separately trigger one real rule by stopping only a
disposable staging target for longer than its `for` interval, then restore it
and record the resolved notification. Never stop a production dependency or
silence a rule to manufacture success.

## Logging and sensitive-data validation

Generate unique synthetic canary strings for token, contact, clinical,
payment, consent and file content. Query application and proxy logs for the
canaries using the protected logging interface. Pass only when prohibited
values are absent and safe correlation/audit identifiers remain. Verify source
coverage, UTC timestamps, access denial, retrieval and disposition. India
location/180-day production evidence remains `LEGAL ACTION`,
`PRIVACY ACTION` and `INFRASTRUCTURE ACTION`; staging does not prove it.

## Completion gate

Monitoring is **NO-GO** until every one of the 53 implemented rule rows has
controlled firing, receiver delivery, human acknowledgement, recovery and
resolved evidence; all 20 missing rows are implemented and executed or retain
an explicitly approved P0 exception; every target/probe is healthy; backup
health is cryptographically verified; Uptime Kuma is evidenced; and named
responders exist.
