# Production maintenance calendar

Last reviewed: 2026-07-23.

## Status and time basis

This calendar combines source-controlled schedules with required operational
reviews. It does not prove that any timer, CI schedule or human process is
active. All listed times are UTC unless explicitly approved otherwise.

Do not change a timer, retention period, key, provider or production system from
this document alone. Changes require the guarded release/change process.

## Source-controlled automated schedules

The host schedule is defined by
`menorah/deploy/ubuntu/install-backup-schedule.sh`:

| Schedule | Source-defined time | Job | Required evidence and response |
| --- | --- | --- | --- |
| Hourly | Hourly | Backup health check | Status of timers, latest archive and restore-test age; alert/investigate failure |
| Every six hours | 00:15, 06:15, 12:15, 18:15 | Six-hourly encrypted backup | Signed archive, host readability and current success marker |
| Daily | 02:30 | Daily encrypted backup | Archive/signature, size and age evidence |
| Weekly | Sunday 03:00 | Weekly encrypted backup | Archive/signature plus approved off-host/cold-copy handling |
| Monthly | First day 04:00 | Monthly encrypted backup | Archive/signature, retention/legal-hold review and off-site evidence |
| Daily | 05:00 | Isolated restore test | Database and managed-media verification; isolate and investigate any failure |
| Daily | 06:00 | Backup pruning | Only approved positive retention values; preserve legal holds and last valid recovery points |

Jobs share the repository backup/deployment lock. A delayed job must not be
made concurrent by bypassing that lock.

The Prometheus backup exporter reports marker/signature-file presence and the
marker filesystem timestamp; it does not cryptographically verify signed
metadata or archive bytes. The host backup-health check remains authoritative
for signature, checksum, safety-contract and readability evidence.

GitHub source schedules:

| Schedule | Source-defined time | Workflow | Required evidence |
| --- | --- | --- | --- |
| Weekly | Monday 02:23 | Security workflow | Dependency/static/secret/config gates for the current default/release scope; owned findings |
| Weekly | Wednesday 03:41 | DAST workflow | Authorized staging target, safe test accounts, result and remediation owner |
| Quarterly | 5 January/April/July/October at 08:05 | Quarterly security review workflow | Created review record, assigned reviewer, completed checklist and tracked actions |

`OWNER ACTION`: verify scheduled workflows are enabled in GitHub and cannot
target production destructively.

## Continuous and per-shift operations

| Cadence | Activity | Owner | Evidence |
| --- | --- | --- | --- |
| Continuous | Alertmanager/Prometheus/blackbox/exporter and public uptime monitoring | Primary on-call — `INFRASTRUCTURE ACTION` | Alerts, acknowledgements and resolved notifications |
| Continuous | Security-event, audit-sink pending/failure and privileged-action monitoring | Security/on-call | Incident or triage record |
| Continuous | Payment/payout webhook and reconciliation-block monitoring | Payments/finance on-call | Provider/local correlation without sensitive payloads |
| Start of on-call shift | Review critical/warning alerts, backup/restore status, open incidents and vendor status | Incoming responder | Handover acknowledgement |
| End of on-call shift | Transfer unresolved alerts, incidents and change windows | Outgoing responder | Handover record |

Named response times and escalation thresholds require `OWNER ACTION`; this
calendar does not invent them.

## Daily operations

- Review failed/degraded services, restart loops, disk, CPU, memory, database,
  Redis, worker and TLS alerts.
- Verify latest six-hourly/daily backup markers and the daily restore test.
- Review payment/payout reconciliation exceptions when money movement is
  enabled.
- Review privacy retention job failures only after the feature has approved
  activation; do not manually delete data to clear a queue.
- Review high-risk authentication/MFA/authorization events and active incidents.
- Check scheduled vendor incidents affecting calls, email, payments, identity
  or Cloudflare.
- Record outcomes; absence of an alert is not proof of coverage.

## Weekly operations

| Activity | Owner/action |
| --- | --- |
| Review security workflow and DAST results; assign every finding | Security/engineering; `VAPT ACTION` where independent review is needed |
| Verify weekly backup and approved off-host copy | `INFRASTRUCTURE ACTION`, backup custodian |
| Run/read payment and payout reconciliation reports when enabled | Finance/payment owner |
| Review dependency updates and supported patch releases without blanket force upgrades | Engineering/security |
| Review certificate/domain/tunnel warnings and expiring vendor credentials by metadata only | Infrastructure/vendor owners |
| Review failed privacy/retention/notification/email jobs | Privacy/platform/vendor owners |
| Sample audit-ledger continuity and monitoring ingestion | Security/infrastructure |

## Monthly operations

| Activity | Owner/action | Evidence |
| --- | --- | --- |
| Review production host/root, database root/restore, secret-store, backup and payment privileged access | `OWNER ACTION`, `INFRASTRUCTURE ACTION` | Access diff and removals |
| Verify monthly archive, off-site custody and recoverability | Backup/key custodians | Inventory and restore selection |
| Exercise a selected restore/recovery component beyond the automated smoke test | Infrastructure/continuity owner | Achieved time and issues |
| Review capacity: host disk, Mongo/Redis, logs, backups, media and monitoring stores | Infrastructure | Forecast and action record |
| Review patch posture for OS, containers, dependencies and mobile SDK | Security/engineering/infrastructure | Approved update plan |
| Review audit-sink failures, checkpoint verification and incident trends | Security | Integrity report |
| Review vendor service, quota, support and incident performance | `VENDOR ACTION` | Provider review |
| Review privacy requests, grievances, holds and overdue cases using aggregate/minimised evidence | `PRIVACY ACTION`, `LEGAL ACTION` | Case metrics and actions |
| Review clinical access samples and counsellor expiry/suspension exceptions | `CLINICAL ACTION` | Restricted review record |

## Quarterly operations

- `OWNER ACTION`: review all user/admin operational profiles, privacy grants,
  GitHub, Cloudflare, monitoring, vendor and store access.
- Review the risk register, threat model, incidents, near misses, accepted
  risks and remediation deadlines.
- Run a controlled alert-delivery test and a real staging rule exercise.
- Exercise one incident scenario, including CERT-In six-hour decision/escalation
  and evidence assembly.
- Review data inventory, processors/subprocessors, locations, notices,
  purposes, retention, transfers and deletion evidence:
  `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`.
- Review counsellor qualification, clinical access, crisis and minors controls:
  `CLINICAL ACTION`.
- Review payment/payout policies, dual control, refunds/corrections and
  reconciliation trends: `OWNER ACTION`.
- Review mobile-store declarations, signing access and upcoming SDK/platform
  deadlines: `APPLE ACTION`, `GOOGLE ACTION`.
- Review continuity dependencies and exercise progress against approved RTO/RPO.
- Complete the source-controlled quarterly security review and retain closure
  evidence.

## Semiannual operations

- Conduct a broader disaster-recovery exercise covering service rebuild,
  database/media restore, secrets recovery, DNS/tunnel dependencies,
  communications and rollback/recovery distinction.
- Test vendor exit or substitution for one critical provider.
- Review cryptographic inventory and rotation/recovery plans. Audit-ledger key
  rotation requires a separately designed signed rollover and must not be
  tested ad hoc.
- Review security/privacy/clinical training and competence records.
- Reassess business impact analysis and recovery dependencies after material
  growth or architecture change.

`OWNER ACTION` approves the exercise scope; `INFRASTRUCTURE ACTION` executes
technical steps in an isolated environment; `LEGAL ACTION`, `PRIVACY ACTION`
and `CLINICAL ACTION` review scenarios involving their data.

## Annual operations

| Activity | Required action |
| --- | --- |
| Full policy, asset, data, vendor and access review | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION` |
| Independent VAPT and closure retest, or more often based on risk/change | `VAPT ACTION` |
| Internal ISMS/PIMS/continuity audit and management review if those programs are adopted | Owner-appointed independent auditors and management |
| Full continuity/incident exercise with executive participation | `OWNER ACTION`, `INFRASTRUCTURE ACTION` |
| Vendor contract, assurance, location, subprocessor and exit review | `VENDOR ACTION`, legal/privacy/security |
| Apple/Google account, signing, declarations and store-policy review | `APPLE ACTION`, `GOOGLE ACTION` |
| Review this calendar against current law, standards, architecture and source schedules | Every accountable owner |

An annual cadence is not enough after material change. Use the event-driven
triggers below.

## Per-release maintenance

Before every production release:

1. freeze the immutable reviewed SHA;
2. run the release evidence and dependency/security gates;
3. validate configuration without printing values;
4. verify host timers, backup health and restore-test freshness;
5. create and restore-test the required pre-release backup;
6. review migration and recovery boundaries;
7. deploy only through the guarded workflow in an approved window;
8. verify services, probes, metrics, audit sink and critical flows;
9. monitor the defined observation window; and
10. retain redacted release evidence.

Never combine routine release and managed-credential rotation. Never use a
code-only rollback after an incompatible migration.

## Event-driven maintenance

Perform an immediate scoped review after:

- a security/privacy/clinical/payment incident or suspected credential
  exposure;
- joiner, mover, leaver or vendor-owner change;
- new data field, purpose, recipient, location, subprocessor or AI use;
- new/changed payment, call, identity, email, media or face-check provider;
- material architecture, network, database or mobile SDK change;
- law, regulator, store or vendor-term change;
- failed backup/restore, audit-chain failure or lost key;
- high/critical vulnerability or VAPT finding;
- domain/certificate/signing-key ownership change; or
- missed maintenance task.

The review must decide whether to stop a feature, revoke/rotate credentials,
notify or report, update notices/records, retest and revise this calendar.

## Data retention is not set by this calendar

Backup rotation and CERT-In ICT log readiness are operational schedules.
Personal, clinical, payment, audit, vendor and backup retention periods require
separate approved decisions. Do not infer a lawful retention period from a
timer, source default or monthly review.

- `OWNER ACTION`: approve business and recovery needs.
- `LEGAL ACTION`: approve legal periods/exceptions.
- `PRIVACY ACTION`: approve minimization, notice, deletion and processor
  propagation.
- `CLINICAL ACTION`: approve clinical record needs.
- `INFRASTRUCTURE ACTION`: implement only the approved schedule and preserve
  legal holds.

## Missed-task rule

A missed backup, restore test, alert test, access review, VAPT, store review or
regulatory exercise remains open until completed and root-caused. Do not merely
move the due date. Assess whether the miss changes the production verdict,
record interim safeguards, assign an owner/date and escalate repeated misses to
management review.
