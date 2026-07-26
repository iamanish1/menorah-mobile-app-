# Production-readiness executive summary

Last reviewed: 2026-07-25.

## Verdict

# NOT READY

This is the only evidence-supported verdict for a public production launch.
The repository now contains substantial security, recovery, release and
observability controls, but it does not contain the live, organizational,
legal, clinical, vendor, store or independent-assurance evidence needed to
authorize public service.

No part of this package authorizes deployment, migration, restoration, traffic
changes, secret changes, provider changes, store submission or production data
access.

## Repository-remediation status

**SERVER STAGING DESIGN COMPLETE — REPLACEMENT DISCOVERY REQUIRED**

The repository-controlled runtime is frozen at
`25cd808602020988a09ee9e58cc9d4738cc068c9` on
`release/final-production-readiness`. The superseded candidate's local overlay
baseline is retained as history; the discovery correction passed focused
regressions, the 293-test server-staging contract, Bash syntax and pinned
ShellCheck. Its exact push runs also passed: production release readiness
`30209920365` (1/1 jobs, 11/11 steps), functional release `30209920383`
(9/9 jobs, 89/89 steps), and security `30209920358` (15/15 jobs, 104/104
steps), with zero failed, skipped or cancelled jobs/steps. Evidence for
`a1bc1b6ec751926edc9981f57762277060acf9e4`,
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` and earlier candidates remains
historical and superseded; it is not current-candidate evidence. The exact
functional run recorded 117/117 default backend suites with 1,716/1,716 tests,
13/13 disposable integration suites with 45/45 tests, and 432/432 core
release-contract tests. After this freeze, only `docs/**` and
`menorah/docs/**` may change; any runtime, configuration, workflow or test
change invalidates the candidate and requires the affected evidence to be
rerun.

See [the immutable candidate record](./26-immutable-candidate-record.md) for
run links, test totals, warnings, skips, the evidence boundary and remaining
external proof. The completed local exercise is recorded in
[the local staging validation report](./28-local-staging-validation-report.md).
The isolated Ubuntu overlay and its discovery-first approval sequence are in
[the server-staging design and discovery runbook](./29-server-staging-design-and-discovery-runbook.md).
A prior read-only discovery attempt was incomplete and is invalid as server
evidence; no collision approval or deployment has occurred.
Its all-profile design has 32 services, six networks and 21 volumes. The
dedicated `staging-egress` bridge is NAT-capable for explicitly scoped
services, but it is not a destination or FQDN allowlist; target-host
firewall/proxy restrictions remain uncollected server evidence.

## What this verdict covers

The assessment covers the repository-visible Menorah platform:

- user, counsellor and administrator web applications;
- the iOS and Android mobile application and their API profiles;
- authentication, booking, payments, payouts, chat and call authorization;
- counsellor verification, consent and privacy-rights workflows;
- MongoDB, Redis, managed uploads, backups and migrations;
- the Ubuntu Compose deployment, Caddy and Cloudflare Tunnel boundary;
- monitoring, alerting, logs, incident response and recovery;
- mobile stores, external vendors, India privacy/cyber readiness and future
  ISO evidence.

The detailed evidence boundary and starting position are in
[the current-state baseline](./01-current-state-baseline.md). The intended
deployment is described in
[the current architecture](./02-current-architecture.md), and processing paths
are listed in [the data-flow inventory](./03-data-flow-inventory.md).

## Repository evidence that exists

The current candidate includes repository controls for:

- server-authoritative booking price resolution and paid/entitled acceptance
  gates;
- minimized unassigned-booking previews and assignment authorization;
- payment-webhook signature, identity, amount, currency, state, replay and
  reconciliation handling;
- explicit counsellor verification states, versioned consent and approval
  evidence gates;
- separated user, counsellor and administrator authorization boundaries;
- call, WebSocket, privacy-rights, audit-ledger and SSRF protections;
- fail-closed production configuration validation;
- guarded release, migration, rollback, backup and restore workflows;
- source-controlled ingress, health probes, metrics, alerts and local log
  collection; and
- store-readiness, vendor, ownership, incident and recovery checklists.

These controls and their exact-SHA automated repository results are candidate
implementation evidence only. Staging behavior and live operation still
require evidence.

## Current observability position

Repository validation currently accounts for **14 Prometheus scrape jobs**,
**69 alert rules** and **26 observability coverage records**. The
machine-validated P0 register covers all 20 required alert gaps. JSON health
endpoints are probed through blackbox exporter rather than being treated as
Prometheus metrics.

The production definition uses Grafana Alloy for log collection and Loki for
local operational log storage. Container telemetry uses a constrained,
Compose-project-scoped Docker metrics gateway. That gateway is the only
monitoring component with the Docker socket; the exporter receives only a
sanitized project container list, one-shot resource statistics and sanitized
runtime state. Raw inspection, logs, archives, exports, cross-project access
and mutations are denied by the repository implementation and covered by
candidate tests.

This does **not** prove that any production target is up, any log source is
complete, or any notification reaches a person. The committed Alertmanager
configuration intentionally has no human destination. Installing an approved
protected destination and proving delivery, acknowledgement and resolution is
an `INFRASTRUCTURE ACTION`. Uptime Kuma monitor configuration and live
notification evidence are also absent.

See [the monitoring and alerting runbook](./12-monitoring-and-alerting-runbook.md)
for the exact evidence required.

## Why public launch remains blocked

| Blocking area | Repository position | Evidence or decision still required |
| --- | --- | --- |
| Immutable release | Runtime SHA `25cd808602020988a09ee9e58cc9d4738cc068c9` is frozen; candidate-bound local validation and three exact push gate families passed | Review the local report, record the final documentation HEAD and its current GitHub results, then obtain repository governance and an owner-approved protected release record |
| Server staging | A dedicated project, roots, networks, volumes, listeners, data identities, monitoring stores and discovery-first runbook exist | `INFRASTRUCTURE ACTION`: run authorized read-only discovery, return its output, complete every collision check and obtain the two recorded human approvals before preparation and deployment |
| Configuration | Fail-closed validators and a redacted variable reference exist | `INFRASTRUCTURE ACTION`: validate the actual host configuration without disclosing values |
| Data and migrations | Ordered migration and preflight controls exist | `INFRASTRUCTURE ACTION`: disposable staging execution, approved maintenance boundary and invariant evidence |
| Backup and recovery | Signed/encrypted backup and isolated-restore tooling exists | `INFRASTRUCTURE ACTION`: current host backup, off-site copy and successful restore evidence; the newest restore test must be no more than 24 hours old |
| Network and ingress | Caddy, domain manifests and tunnel tooling exist | `INFRASTRUCTURE ACTION`: live DNS, Tunnel, firewall, TLS and route evidence |
| Monitoring and response | Metrics, alerts and runbooks exist | Approved Alertmanager destination, live target/probe coverage, on-call rota and controlled delivery test |
| Payments and payouts | Integrity and reconciliation controls exist; feature gates fail closed | `OWNER ACTION` and `VENDOR ACTION`: policy decisions, ownership and provider test-mode evidence |
| Privacy and clinical governance | Technical workflows and evidence states exist | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION` and `OWNER ACTION`: approve notices, age/minors position, retention, qualifications and crisis processes |
| Security assurance | Automated security coverage exists | `VAPT ACTION`: independent assessment of the immutable staging candidate and closure retest |
| Mobile stores | Repository configuration/checklists exist | `APPLE ACTION` and `GOOGLE ACTION`: signed builds, devices, declarations, association files and console evidence |
| Vendors and ownership | Integrations are inventoried and can be gated | Complete ownership, contract, location, access, incident, deletion and exit evidence for each enabled provider |

The full high-level register is
[the production gap register](./04-production-gap-register.md). Detailed open
issues and bounded limitations are maintained in
[known issues and technical debt](./20-known-issues-and-technical-debt.md).

## Minimum route to reconsideration

1. Independently review the frozen immutable candidate and its documentation-only boundary.
2. Preserve the recorded tests, builds, scans, skips and exceptions against that SHA.
3. Authorize and return the inspection-only server discovery record using the
   runbook's immutable raw URL, temporary file and exact SHA-256 check. A
   checksum or download failure must stop before execution; do not prepare
   resources or otherwise mutate the host.
4. Complete every collision class as PASS and obtain the first human approval.
5. Prepare and dry-render only the isolated staging proposal, then obtain the
   separate deployment approval.
6. Exercise migrations and recovery in the approved server-staging environment.
7. Obtain the outstanding owner, legal, privacy and clinical decisions.
8. Complete vendor and mobile-store prerequisites.
9. Complete independent VAPT and retest all critical/high remediation.
10. Perform the labelled infrastructure actions for configuration, backup,
    restore, ingress, observability, log retention and rollback.
11. Rehearse incident and operational procedures with named primary and
    alternate responders.
12. Complete [the handover checklist](./19-handover-checklist.md).
13. Record a cross-functional decision in
    [the production go/no-go record](./21-production-go-no-go.md).

Silence, a healthy process, a passing desktop test or the presence of a
template is not approval.

## Decision and evidence ownership

Use these labels consistently:

- `OWNER ACTION` — business, risk, operating-model or accountability decision;
- `LEGAL ACTION` — qualified legal review and approval;
- `PRIVACY ACTION` — processing, rights, minimization and data-governance
  approval;
- `CLINICAL ACTION` — counselling and health-safety governance;
- `VAPT ACTION` — independent security assessment and retest;
- `APPLE ACTION` and `GOOGLE ACTION` — store and platform evidence;
- `VENDOR ACTION` — provider account, contract and operational evidence;
- `INFRASTRUCTURE ACTION` — action or proof from the approved environment.

The ownership model is in
[the access and ownership matrix](./24-access-and-ownership-matrix.md), and
pending non-technical decisions are ordered in
[the owner action plan](./13-owner-action-plan.md).

## Evidence-safe handling

Never place credentials, private keys, secret-bearing URLs, production
connection strings, personal data, counselling or biometric data, payment or
bank data, backup contents, or unredacted logs in this directory. Evidence
references should identify the environment, immutable SHA, command or
procedure, result, custodian, approver and timestamp without exposing protected
values.
