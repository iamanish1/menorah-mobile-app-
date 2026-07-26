# Security and production incident response runbook

Last reviewed: 2026-07-23.

## Status and scope

The public-release verdict is **NOT READY**. Named on-call responders,
notification delivery, legal/privacy/clinical escalation, CERT-In operations
and incident exercises are not evidenced. This runbook was prepared from
repository controls; it does not claim a live incident drill, vendor exercise,
VAPT or notification test.

Use this process for availability, security, privacy, payment, payout,
database, backup, mobile-signing, vendor and clinical-safety events. Do not
place secrets, raw personal/health/payment data or unredacted audit logs in
ordinary tickets or chat.

## Roles to assign

| Role | Responsibility |
| --- | --- |
| Incident lead | Declares severity, coordinates decisions, maintains the timeline and closes the incident |
| Operations lead | Safely contains infrastructure and runs approved recovery |
| Engineering lead | Diagnoses application behavior and prepares reviewed fixes |
| Security/evidence lead | Preserves logs, audit-chain evidence and indicators; controls forensic access |
| Communications lead | Coordinates truthful user, workforce and partner messages |
| Privacy/legal lead | Assesses personal-data impact, notification duties and evidence handling |
| Finance/payment lead | Freezes/reconciles payment, refund and payout actions |
| Clinical-safety lead | Handles counsellor, crisis, minor-user or health-safety implications |
| Vendor liaison | Opens provider cases, records timestamps and preserves provider evidence |
| CERT-In point of contact | Performs the approved regulatory escalation under legal guidance |

`OWNER ACTION`: assign a primary and alternate for each applicable role and
approve response/acknowledgement targets. Until targets are approved, treat
critical alerts and suspected personal-data, privileged-access, payment,
signing-key or recovery-key compromise as requiring immediate human escalation.

## Severity guide

| Severity | Examples | Default handling |
| --- | --- | --- |
| Critical | Active privileged compromise; audit-integrity failure; suspected sensitive-data exposure; incorrect payout; database corruption; unusable backups; broad outage; signing/recovery-key compromise | Page immediately, appoint incident lead, preserve evidence, contain under two-person review |
| High | Material authorization failure; payment reconciliation blocked; repeated admin MFA failures; partial outage; vendor failure affecting protected flows | Urgent incident bridge and named owner; escalate to critical if impact expands |
| Medium | Degraded non-critical function, bounded control failure without known impact, warning alert that persists | Investigate in the owner-approved window and record disposition |
| Low | No-impact observation or improvement | Track through normal change control |

These labels do not replace legal, privacy, payment or clinical classification.

## On detection

1. Open an incident record with a non-sensitive identifier and UTC timestamp.
2. Appoint the incident lead and evidence lead.
3. Record what is known, what is unknown, affected environments, exact release
   SHA, first alert and current user impact. Do not speculate publicly.
4. Preserve relevant alerts, target status, container/image identity, bounded
   logs, audit-ledger verification state, database/backup state and vendor event
   IDs without copying secrets or payloads.
5. Decide whether to freeze releases, privileged actions, payments, payouts,
   new bookings, calls, vendor callbacks or mobile signing.
6. Start legal, privacy, clinical and finance assessment when applicable.
7. Establish an update cadence and a separate restricted evidence location.

Do not restart a service, clear a queue, rotate an audit key, delete a marker,
edit audit collections or purge logs before evidence capture unless doing so is
necessary to stop immediate harm; record any emergency deviation.

## Containment principles

- Prefer reversible feature gates, traffic drains, session revocation and
  least-privilege credential disablement.
- Do not alter production data merely to make dashboards green.
- Never expose a secret in a process list, shell trace, ticket or screen share.
- Rotate only after mapping every dependent service and preserving evidence.
  Confirm replacement operation and old-credential invalidity.
- Keep application writers stopped when migration or restore state is
  uncertain.
- Do not disable alert rules or widen thresholds during the incident.
- Use a reviewed exact-SHA forward fix or the guarded rollback/recovery paths;
  no ad hoc rebuilds.

## Scenario procedures

### Privileged account, token or secret compromise

1. Disable or suspend the affected identity and revoke active sessions/tokens.
2. Preserve bounded authentication, MFA, permission-denial and admin-action
   evidence.
3. Identify accessible systems and actions; review support, finance, content,
   privacy and full-admin grants separately.
4. Rotate affected credentials through the approved secret mechanism; never
   paste values into the incident record.
5. Verify old credentials are rejected and new ones work only for intended
   services.
6. Review unauthorized changes and data access; trigger privacy/legal and
   finance procedures as needed.

### Audit-integrity or evidence-sink failure

1. Treat `SecurityAuditEvidenceIntegrityFailure`, unexplained chain gaps or
   checkpoint failure as a critical security incident.
2. Preserve the ledger/checkpoint, relevant container stdout and signing-key
   version identifier.
3. Do not edit ledger collections, rotate the signing key, restart the writer
   or clear pending events before the evidence lead records state.
4. Limit privileged changes until durable evidence is trustworthy.
5. Follow
   [the durable audit-ledger runbook](../../menorah/backend/docs/security-audit-durable-ledger-runbook.md).

### Payment, webhook, refund or payout mismatch

1. Keep payment/payout launch gates closed or freeze affected mutations.
2. Preserve provider event ID, internal event record, booking/order/payment
   references, amount/currency/state and safe reconciliation reason.
3. Do not trust a frontend redirect as payment truth and do not replay provider
   events manually.
4. Use
   [the payment reconciliation runbook](../../menorah/docs/payment-reconciliation-runbook.md).
5. Require separate finance approval for corrective payout/refund actions and
   fresh MFA/two-admin controls where specified.
6. Escalate provider discrepancies through the vendor owner without disclosing
   unnecessary user data.

### Database, migration, backup or media corruption

1. Stop writers and drain public write traffic.
2. Preserve migration/restore markers, release records, database health,
   backup digests and media manifest evidence.
3. Determine whether the failure is pre-migration, partial migration or
   post-migration.
4. Follow [the rollback runbook](./09-rollback-runbook.md) and
   [the backup/restore runbook](./10-backup-and-restore-runbook.md).
5. Reject any signed backup or restore evidence older than the 24-hour hard
   gate for production recovery.
6. Keep writers stopped after restore until schema review is acknowledged and
   the exact-SHA guarded update completes.

### Personal, mental-health, biometric or clinical data incident

1. Restrict evidence access to the minimum incident/privacy/legal/clinical
   group.
2. Record categories, subjects, systems, time range, exposure path, recipients,
   containment and uncertainty without copying raw records.
3. Preserve consent, access, export, deletion, legal-hold and vendor evidence.
4. `LEGAL ACTION` and `PRIVACY ACTION`: determine applicable notices,
   authorities, data-principal communications and timing.
5. `CLINICAL ACTION`: determine safeguarding and clinical communications; do
   not invent crisis or minor-user decisions during the event.
6. Coordinate processor containment, return/deletion and evidence through
   vendor owners.

### Availability, call or vendor outage

1. Confirm the failure using independent probes; identify whether the app,
   Cloudflare, database, Redis, email, calls or a provider is responsible.
2. Preserve graphs and release/vendor status before restart.
3. Apply only the approved user-visible fallback. Do not represent recording,
   delivery, moderation or a provider as available when it is not.
4. Disable optional integration paths that cannot fail safely.
5. Escalate to the vendor with the incident identifier, minimum safe diagnostic
   data and contract contact.

### Mobile signing credential incident

Repository history contains non-placeholder Android keystore/key passwords in
commit `d9bb6686738c1c9aeeebc539cb83e9b62861ec85`; the keystore itself was not
found in reachable Git objects, password values were not displayed, and
rotation is not evidenced.

1. Freeze Android production signing and affected EAS/CI credentials.
2. Determine Play App Signing status and whether the affected key is an upload
   key or app-signing key.
3. Follow
   [the security incident remediation record](../../menorah/docs/security-incident-remediation.md).
4. Require provider-side reset/recovery evidence, a signed internal-track
   build, replacement custody and proof old credentials are invalid before
   release.
5. Coordinate any Git-history remediation as a separate repository-wide
   maintenance event; do not rewrite history during incident containment
   without approval.

## Regulatory and external escalation

`LEGAL ACTION`: qualified Indian counsel must determine whether an event is a
reportable cyber incident or personal-data breach and approve notifications.
The existing India readiness map records that specified CERT-In incidents may
require reporting within six hours of noticing and that covered logs may need
180-day retention in Indian jurisdiction. Treat the six-hour decision path as
a critical operational deadline; do not wait for a complete forensic report
before escalating internally.

Before launch:

- `OWNER ACTION`: appoint and maintain the CERT-In contact and alternates.
- `LEGAL ACTION`: approve the incident classification/notification matrix.
- `INFRASTRUCTURE ACTION`: prove time synchronization, source coverage,
  protected India log retention and rapid retrieval.
- `VENDOR ACTION`: record each provider's incident contact and contractual
  notice timing.

See [the India readiness map](./18-india-privacy-readiness-map.md). This runbook
does not make a legal conclusion.

## Recovery and return to service

Return service only when:

- containment is stable and the affected access path is closed;
- the exact reviewed release/configuration is identified;
- database/schema, payment, authorization and audit invariants pass;
- backup/restore posture meets the signed 24-hour gates;
- monitoring and human notification are operational;
- old credentials are demonstrably invalid where rotation occurred;
- affected vendor paths pass approved sandbox/staging checks;
- legal/privacy/clinical/finance owners accept their domain; and
- the incident lead records residual risk, observation window and rollback
  trigger.

Communications must distinguish confirmed facts, investigation, workaround and
resolution. Never promise deletion, confidentiality, refunds, clinical
outcomes or notification timing without the accountable owner's approval.

## Post-incident review

Within the owner-approved period:

- preserve the immutable timeline and decisions;
- identify root cause and contributing control failures;
- link corrective changes, tests and owner;
- review detection delay, response, recovery and RTO/RPO;
- update threat, vendor, data-flow and risk records;
- verify credential/access cleanup;
- assign VAPT or independent retest where appropriate; and
- exercise the corrected scenario in isolated staging.

Launch remains blocked until named responders, controlled alert delivery,
incident exercises, CERT-In/log evidence, vendor contacts and independent VAPT
are complete.
