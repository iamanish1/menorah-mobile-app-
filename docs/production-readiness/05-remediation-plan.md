# Production-readiness remediation plan

Last reviewed: 2026-07-25.

## Purpose and release posture

This plan turns the production-readiness findings into evidence-producing work.
It is not a deployment authorization. The current verdict remains **NOT READY**
until the gates in
[the go/no-go record](./21-production-go-no-go.md) are closed against one
immutable release SHA.

The following terms are deliberately separate:

- **Repository complete**: reviewed code, configuration, tests or a runbook
  exists in the candidate.
- **Staging verified**: the immutable candidate passed the stated test in an
  isolated, production-like environment using synthetic data.
- **Live verified**: an authorized operator collected dated, redacted evidence
  from the intended production environment.
- **Decision complete**: the named owner approved the policy or residual risk.

Repository work must never be used to imply that a live control, vendor
account, notification path, backup or store release has been verified.

## Working rules

1. Use `release/final-production-readiness`; do not merge or deploy from this
   plan.
2. Preserve focused, reviewable commits and bind every result to an exact SHA.
3. Do not place secrets, production records, payment data, health data or
   unredacted logs in Git, CI output or handover evidence.
4. Run database and migration tests only against disposable databases.
5. Keep optional or incomplete integrations disabled.
6. Record failed, skipped and blocked checks as prominently as passing checks.
7. A policy-dependent technical control stays gated until the policy owner
   approves its inputs.

## Current frozen boundary

The repository-controlled runtime is frozen at
`1ecd0b379369258be466159364a8a48c79fb65aa`. Exact push runs
`30158172303`, `30158172290` and `30158172293` passed 25/25 jobs and
204/204 steps. The functional run recorded 117/117 default backend suites with
1,716/1,716 tests, 13/13 disposable integration suites with 45/45 tests and
432/432 core release-contract tests. This completes the current
repository-controlled remediation evidence; it does not complete server
discovery, dry render, Ubuntu deployment, DNS/Cloudflare, secret custody,
provider sandboxes, physical devices, VAPT, owner, legal/privacy, clinical,
Apple, Google, vendor or ISO evidence.

## Priority plan

### Phase 0 — freeze identity and recovery foundations

Entry criteria: the intended release branch and starting SHA are known.

Work:

- confirm branch, ancestry, remote synchronization and worktree scope;
- validate the recovery-safety commit and release-script regressions;
- keep the guarded Ubuntu updater as the sole production deployment method;
- preserve migration, release, image and backup identity markers;
- require a fresh encrypted backup and isolated restore before a migration
  boundary;
- maintain separate pre-migration rollback and post-migration recovery paths;
- verify managed MongoDB user reconciliation and the read-only monitoring
  identity only after writers stop and before migration.

Exit evidence:

- clean reviewed release SHA and commit inventory;
- release workflow tests, shell validation and Compose rendering;
- isolated backup lifecycle evidence;
- approved recovery and maintenance records.

Live backup, timer, restore and host-marker verification remains an
`INFRASTRUCTURE ACTION`.

### Phase 1 — close application P0 security boundaries

Workstreams:

| Workstream | Required outcome | Minimum evidence |
| --- | --- | --- |
| Booking price | Service and booking prices are resolved on the server; client amount, currency and free/discount claims are untrusted | tamper, negative, zero, currency and forged-entitlement tests |
| Marketplace privacy | Unassigned previews expose only bounded decision data | serializer allowlist tests; no identity, contact, emergency or detailed clinical fields |
| Booking acceptance | Only paid or explicitly server-authorized bookings can be accepted, atomically, by eligible counsellors | unpaid/terminal/unauthorized tests and two-counsellor race test |
| Payment integrity | Signature, order, payment, booking, amount, currency, capture state and receipt association are verified; replay is idempotent | valid, invalid, duplicate, delayed and mismatch suites |
| Counsellor verification | Account creation is distinct from professional approval; versioned consent, evidence, reviewer and lifecycle states are required | authorization and state-transition tests |
| Authentication | User, admin and counsellor audiences remain isolated; session revocation and role removal take effect | token-type, revoked, suspended, deleted and stale-role tests |
| Calls and chat | Every join is participant-, booking-, time- and state-authorized; tickets are one-time | wrong party, early/late, terminal state, reassignment and replay tests |
| Server-side fetches | Only bounded HTTPS image fetches can occur; resolved and redirected private/reserved targets are blocked | address, DNS rebinding/redirect, timeout, size and content-type tests |

Product rules that are not already defined remain `OWNER ACTION`. Counsellor
qualification sufficiency remains `CLINICAL ACTION` and `LEGAL ACTION`.

### Phase 2 — make operations observable and fail closed

Repository controls in this candidate include:

- JSON readiness checks are probed through Blackbox rather than scraped as
  Prometheus text;
- 14 Prometheus scrape jobs, 69 validated rules and 26 coverage records;
- severity, owner and runbook metadata for alerts;
- a project-scoped Docker metrics gateway that exposes only a sanitized
  container list, sanitized state and one-shot stats to the exporter;
- bounded running, restart, start-time and memory metrics without exposing the
  Docker socket to the exporter;
- current Grafana Alloy log collection and Loki storage with 30-day local
  retention;
- explicit audit-sink integrity, queue overflow, pending, write-failure and
  admin-permission-denied alert paths;
- six-hourly, daily, weekly and monthly backup evidence plus a maximum
  24-hour restore-test evidence age.

Still required:

- `INFRASTRUCTURE ACTION`: install an approved external Alertmanager
  destination and prove delivery, acknowledgement, repeat and resolved paths;
- `INFRASTRUCTURE ACTION`: validate every target, probe and label on the
  intended host;
- add or approve compensating controls for signals listed as unavailable in
  `observability-coverage.yml`;
- prove Docker log rotation, Alloy positions, Loki retention and host log
  access on the target host;
- prove that backup marker signatures are cryptographically verified by the
  host health check, not inferred from metrics-file presence.

The detailed procedure is in
[the monitoring runbook](./12-monitoring-and-alerting-runbook.md).

### Phase 3 — configuration, infrastructure and supply chain

Work:

- validate every required production variable for absence, malformed content,
  insecure values and placeholders without printing values;
- keep production secrets and operator-controlled Alertmanager, LiveKit and
  Tunnel files outside the checkout;
- validate production Compose, Caddy, tunnel hostname coverage and pinned
  third-party images;
- disable obsolete automatic deployment authority and require stable CI checks
  through branch rules;
- run fresh dependency audits per package, upgrade in bounded batches and
  attach exploitability/risk decisions for anything remaining;
- run secret, SAST and container/configuration scans against the immutable
  candidate.

Actual GitHub rules, Cloudflare, DNS, firewall, host permissions and external
accounts are `OWNER ACTION`, `INFRASTRUCTURE ACTION` or `VENDOR ACTION`.

At the frozen candidate, the affected Expo-path `brace-expansion` production
nodes are patched from 5.0.7 to 5.0.8 in both mobile lockfiles. All seven
production audit-policy roots passed. The remaining reviewed mobile exception
is the moderate transitive `uuid` advisory `GHSA-w5hq-g745-h8pq`, constrained
to the approved Expo dependency set and expiring 2026-10-31.

### Phase 4 — privacy, clinical, payments and continuity governance

Technical workflows must remain conservative until approved inputs exist:

- `OWNER ACTION`: cancellation, refund, rescheduling, promotion/free booking,
  late payment, manual review, RPO, RTO, on-call and account ownership;
- `LEGAL ACTION` and `PRIVACY ACTION`: notices, purposes, consent, retention,
  legal hold, rights handling, minors and vendor terms;
- `CLINICAL ACTION`: qualification evidence, renewal/suspension, crisis
  escalation and care boundaries;
- `VAPT ACTION`: independent assessment and closure retest;
- `APPLE ACTION` and `GOOGLE ACTION`: signed builds, association files,
  declarations, review evidence and release controls.

Use the
[owner action plan](./13-owner-action-plan.md),
[vendor action plan](./14-external-vendor-action-plan.md) and
[India readiness map](./18-india-privacy-readiness-map.md). These documents do
not claim legal compliance, clinical approval or certification.

### Phase 5 — immutable staging candidate

Entry criteria:

- repository P0 fixes reviewed;
- configuration templates and startup gates pass;
- no unresolved critical/high dependency or security finding lacks a signed
  treatment decision;
- migrations, backup and restore procedures are approved for staging.

The local synthetic sequence in
[the final QA plan](./07-final-qa-plan.md) is complete for the frozen
candidate. The next permissible technical step is only the checksum-pinned
temporary download and read-only discovery command in
[the server-staging design and discovery runbook](./29-server-staging-design-and-discovery-runbook.md).
After the returned inventory passes every collision class and receives the
first human approval:

1. prepare only the approved staging roots and protected inputs;
2. complete a no-start dry render for the exact frozen SHA;
3. obtain the separate deployment approval;
4. build content-addressed artifacts and deploy only to isolated staging;
5. run migrations once against the approved staging copy;
6. execute authentication, authorization, booking, payment, call, chat,
   privacy, monitoring and recovery scenarios;
7. run provider test-mode reconciliation;
8. complete independent VAPT and closure retest;
9. preserve redacted results by suite, command, SHA and environment.

Any candidate change invalidates downstream build, VAPT and acceptance
evidence.

### Phase 6 — production readiness review

The review must use
[the handover checklist](./19-handover-checklist.md) and
[go/no-go record](./21-production-go-no-go.md). It must distinguish:

- repository findings;
- staging findings;
- live-server verification;
- owner decisions;
- legal/privacy and clinical approvals;
- VAPT closure;
- Apple and Google evidence;
- vendor evidence.

Only named approvers may accept residual risk. Public launch remains blocked
while any P0 row in
[the gap register](./04-production-gap-register.md) is open.

## Scheduling and dependencies

The critical path is:

```text
immutable SHA
  -> application P0 boundaries
  -> isolated migrations and recovery
  -> complete configuration and artifacts
  -> staging QA and provider test mode
  -> independent VAPT/retest
  -> live infrastructure and alert/restore evidence
  -> owner/legal/privacy/clinical/store approvals
  -> go/no-go decision
```

Parallel work is acceptable only where it does not create evidence against a
moving candidate. The maintenance cadence and evidence owners are recorded in
[the maintenance calendar](./25-maintenance-calendar.md).

## Definition of done

A finding is closed only when its row records:

- exact candidate SHA and environment;
- the control or decision owner;
- command or scenario and expected result;
- dated result and durable evidence reference;
- every failure, skip and limitation;
- independent review where required;
- confirmation that no secrets or sensitive records were captured.

Statements such as “configured”, “should work” or “test exists” are not closure
evidence.
