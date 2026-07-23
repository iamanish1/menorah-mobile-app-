# Security verification

Last reviewed: 2026-07-23.

## Scope and assurance boundary

This document defines repeatable verification for the Menorah release
candidate. It is an engineering evidence plan, not a penetration-test report,
legal opinion or assertion of compliance. The current production verdict is
**NOT READY**.

Run repository checks against an exact reviewed SHA. Run integration,
migration, provider and destructive scenarios only in an isolated environment
with synthetic data. Do not query production data, reveal secrets or place raw
tokens, personal data, health data, payment data or unredacted logs in evidence.

Independent testing remains a `VAPT ACTION`.

## Evidence record

For every command or scenario record:

- candidate SHA, branch and clean/dirty status;
- test environment and timestamp in UTC;
- tool and version;
- exact command or scenario identifier;
- pass, fail, skipped or blocked;
- redacted output location and checksum where appropriate;
- defect/risk reference and owner;
- retest result against the same or a later immutable SHA.

Never collapse unrelated suites into one total. A skipped environment-only
test is not a pass.

## Repository and release identity

Run from the repository root:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
git rev-list --left-right --count HEAD...origin/release/final-production-readiness
git diff --check
```

Expected security properties:

- the intended release branch and exact SHA are explicit;
- the candidate has not diverged from the reviewed remote;
- unrelated or secret-bearing files are absent;
- the production deployment workflow is validation-only;
- the guarded Ubuntu updater is the sole production release path;
- legacy Cloud Build and Cloud Run entry points fail closed.

Actual branch rules and trigger permissions are `OWNER ACTION` and
`INFRASTRUCTURE ACTION`.

## Verification matrix

| Boundary | Required adversarial checks | Pass condition |
| --- | --- | --- |
| Token audiences | user token on admin API; admin token where user context is mandatory; counsellor token on other roles; expired/malformed tokens | every wrong audience/type fails before object access |
| Session lifecycle | logout, logout-all, password change, revoked refresh, suspended/deleted account, simultaneous device, stale role | revoked or ineligible sessions cannot retain authority |
| Object authorization | user A/B, counsellor A/B users and earnings, exports, files, search and WebSocket rooms | authorization is checked server-side for the object and action |
| Least privilege | support versus finance/clinical; finance versus clinical; content versus users/payments; permission removal | route matrix matches explicit permission matrix; denials create safe audit events |
| Booking price | client amount/currency/status/counsellor/owner changes, negative/zero values, forged discounts/free codes | server catalog and approved entitlement are authoritative |
| Unassigned preview | identity, email, phone, emergency contact, detailed symptoms, notes, goals and clinical fields | bounded allowlist contains none of the prohibited fields |
| Acceptance race/state | two counsellors, unpaid, cancelled, refunded, expired, terminal and unauthorized counsellor | one atomic eligible assignment at most; all invalid states fail |
| Payment webhook | invalid signature; wrong booking/order/payment; amount/currency/state mismatch; duplicate/delayed/out-of-order event | only provider-bound valid event advances state once |
| Refund/payout | duplicate/over-limit refund; impossible states; approval/MFA bypass; replay and mismatch | approved state machine, two-admin payout approval, fresh MFA and cap remain enforced |
| Counsellor verification | self-declared activation, missing consent/evidence/reviewer, invalid transition, expiry/suspension | only approved evidence-backed lifecycle state can accept bookings |
| Call access | wrong party, early/late, unpaid, cancelled/refunded, reassigned and replayed ticket | assigned eligible participants only; one-time ticket consumed once |
| Chat/WebSocket | connection and room join by wrong/suspended/deleted/reassigned party | authorization is repeated at connection and every join |
| SSRF/media fetch | HTTP, loopback, RFC1918, IPv6 loopback, link-local, metadata, reserved, DNS-to-private, redirect-to-private, slow/large/non-image | HTTPS only; every resolved hop validated; strict limits; no app credentials forwarded |
| Privacy rights | wrong requester, consent version/withdrawal, export, correction, deletion, legal hold, retention race | authenticated state transitions and audit evidence; protected records not silently deleted |
| Sensitive logging | tokens, secrets, contact/clinical/payment values and request bodies in application logs | prohibited values absent; safe identifiers and security event metadata only |
| Configuration | missing, malformed, insecure and placeholder required values | startup and release validation fail safely without printing values |
| Database/migration | ordering, idempotency, unique indexes, partial migration and startup behavior | approved migration runs once; destructive migration never runs implicitly |

Product-policy expectations must come from approved policy, not from tests
invented for convenience.

## Durable security-audit evidence

Verify each service produces signed, durable audit records for its privileged
and denial events. At minimum test:

- authentication failures, admin MFA failures and session revocation;
- `admin_permission_denied` and privilege changes;
- payment/refund/payout state changes and reconciliation mismatches;
- counsellor approval, rejection, suspension and evidence changes;
- privacy request, legal-hold and retention actions;
- deployment, migration and recovery boundaries where implemented.

Verify:

1. chain/checkpoint validation succeeds for untampered data;
2. altered or missing checkpoints produce
   `checkpoint_invalid` evidence and an alert;
3. bounded queue overflow produces `queue_overflow` evidence and an alert;
4. pending entries and repeated write failures alert;
5. planned shutdown drains the queue or exits nonzero;
6. logs and metrics never expose signed payloads or secret key material.

The in-process queue is not lossless during a long database outage plus process
loss. That limitation remains in
[known issues](./20-known-issues-and-technical-debt.md).

## Monitoring control verification

From `menorah/scripts/qa`:

```bash
npm run test:monitoring
```

The current repository gate validates 14 scrape jobs, 69 alert rules, 26
coverage records and all 20 required P0 alert mappings. It also validates
Prometheus, Alertmanager, Blackbox, Alloy and Loki configuration, backup
metrics, and the constrained Docker metrics path.

The Docker gateway security tests must prove:

- only `GET /v1/containers`,
  `GET /v1/containers/{id}/state`, and
  `GET /containers/{id}/stats?stream=false&one-shot=true` are usable by the
  exporter;
- container list, state and stats responses are sanitized;
- only containers in the configured Compose project are accessible;
- raw inspect, logs, archive, export and all mutations return `403`;
- the exporter has no Docker socket or host filesystem mount;
- oversized or malformed Docker responses fail closed.

The gateway is the sole trusted root-equivalent Docker control-plane component.
A read-only socket bind does not reduce Docker API authority. Keep it isolated,
reviewed and minimal.

Live receiver delivery, targets, probes and response ownership remain
`INFRASTRUCTURE ACTION`. The committed Alertmanager configuration deliberately
contains no destination secret.

## Backup and recovery verification

Repository and isolated Linux tests must prove:

- archives are readable by the invoking host operator;
- checksum and signature failures are detected;
- encryption is required before off-host transfer;
- restore targets are isolated and explicit;
- a partial or incompatible migration blocks code-only rollback;
- release and rollback locks exclude concurrent operations;
- Prometheus backup evidence never substitutes for host-side signature
  verification;
- restore-test evidence older than 24 hours alerts.

Then `INFRASTRUCTURE ACTION` must prove on the intended host:

- all approved timers are enabled and active;
- a fresh encrypted backup verifies;
- an off-host copy exists under approved custody;
- an isolated database and managed-media restore succeeds;
- achieved RPO/RTO and evidence age meet approved objectives.

See [backup and restore](./10-backup-and-restore-runbook.md) and
[rollback](./09-rollback-runbook.md).

## Supply-chain and dependency verification

For each Node workspace:

1. install with its locked, documented package-manager path;
2. run lint, type-check, tests and production build where a script exists;
3. run a production dependency audit;
4. identify the exact advisory, dependency path, runtime reachability and
   patched version;
5. upgrade in a bounded batch without blanket force changes;
6. rerun the workspace gates;
7. assign every remaining advisory an owner, rationale and expiry.

Also verify:

- third-party production images are immutable/digest-pinned where required;
- container configuration drops unnecessary privilege;
- generated artifacts correspond to the candidate SHA;
- secret-history, SAST and container/configuration scans are retained;
- no scan failure is suppressed to turn a red gate green.

## Mobile and external verification

Repository tests cannot prove signed releases or store declarations.

- run mobile lint, type-check, contract tests, release-config validation and
  Expo Doctor;
- test screenshot/app-switcher protection, secure storage, clipboard, logs,
  notifications and deep-link authorization on real devices;
- `APPLE ACTION`: regenerate native dependencies where required, archive on an
  approved macOS builder and test the signed build;
- `GOOGLE ACTION`: produce and test an internal-track signed Android build;
- verify Apple association and Android asset-link files from external networks;
- verify account deletion, privacy/support URLs and accurate declarations.

Use the dedicated
[Apple checklist](./15-app-store-release-checklist.md) and
[Google checklist](./16-google-play-release-checklist.md).

## Independent security assessment

`VAPT ACTION` must cover at least:

- public web and APIs;
- authenticated user, counsellor, admin and least-privilege roles;
- object authorization, exports and files;
- WebSockets, chat and call ticket replay;
- booking/payment/refund/payout integrity;
- SSRF and upload/media handling;
- mobile storage, links and transport;
- externally reachable infrastructure and common misconfiguration.

The assessor must test an immutable staging candidate under approved rules of
engagement. Critical/high findings require remediation and closure retest.
Residual findings require a named owner, treatment, expiry and launch decision.

## Stop conditions

Stop the release verification when:

- the tested SHA changes or the worktree is unexplained;
- production data or credentials appear in test output;
- a required control fails closed for an unknown reason;
- a migration or restore target is not provably isolated;
- an expected secret is requested on a command line;
- a P0 result fails or is skipped;
- evidence conflicts with a previous result.

Preserve evidence, open a defect and repeat only after the root cause is
understood.
