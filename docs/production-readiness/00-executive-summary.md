# Production-readiness executive summary

Last reviewed: 2026-07-23.

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

These controls are candidate implementation evidence only. Their final
release-SHA tests, staging behavior and live operation still require evidence.

## Current observability position

Repository validation currently accounts for **14 Prometheus scrape jobs**,
**53 alert rules** and **26 observability coverage records**. JSON health
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
| Immutable release | Remediation is preserved as focused release-branch commits, but no owner-approved protected production release record exists | Reviewed clean final SHA, final tests, remote synchronization, protected release record |
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

1. Freeze and independently review one immutable candidate SHA.
2. Record every final test, build, scan, skip and exception against that SHA.
3. Exercise migrations and recovery in an approved disposable environment.
4. Obtain the outstanding owner, legal, privacy and clinical decisions.
5. Complete vendor and mobile-store prerequisites.
6. Complete independent VAPT and retest all critical/high remediation.
7. Perform the labelled infrastructure actions for configuration, backup,
   restore, ingress, observability, log retention and rollback.
8. Rehearse incident and operational procedures with named primary and
   alternate responders.
9. Complete [the handover checklist](./19-handover-checklist.md).
10. Record a cross-functional decision in
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
