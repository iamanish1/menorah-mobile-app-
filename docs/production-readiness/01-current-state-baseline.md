# Current-state baseline

Last reviewed: 2026-07-24.

## Purpose and verdict

This baseline records what can be established from the candidate repository
without treating source code as proof of live operation.

**Public-production verdict: NOT READY.**

The remediation workspace is on `release/final-production-readiness`. The
recovery-safety starting point identified for this effort is commit
`353b19aced537d7acee6310bc0d8acbcc512f739`. Later repository remediation is
preserved as focused commits on the same release branch. The replacement
runtime candidate is frozen at
`48fb83c248b0e969e699433a8bacdd276ed4311d`. Its candidate-bound local
validation and all six push/PR GitHub workflow executions passed. Exact-SHA
release, functional and security aggregate results cited for
`3fb99858c6766a341bb7b7dab2377195427f0ea1` are historical and
**INVALIDATED** for this newer runtime and were not relabelled. All commits and
local results remain engineering evidence, not an owner-approved production release.
The final protected release record and repository-governance approval remain
external actions. See
[the immutable candidate record](./26-immutable-candidate-record.md) and
[the local staging validation report](./28-local-staging-validation-report.md).

## Evidence classes

| Evidence class | Current meaning | May support | Must not be used to claim |
| --- | --- | --- | --- |
| Repository observation | Code, configuration, tests or documentation is present | Intended design and testable requirements | Deployment, live health, policy approval or operational effectiveness |
| Desktop result | A command ran in the non-production workstation environment | Regression behavior under that command's conditions | Ubuntu host behavior, production data safety, provider callbacks or store readiness |
| Disposable integration result | A test ran against explicitly isolated infrastructure | Covered integration behavior and migration/recovery mechanics | Production execution or completeness outside the fixture |
| Staging result | A dated result from an approved production-like environment | Candidate behavior in that stated environment | Production operation unless the environments and evidence are demonstrably equivalent |
| Live infrastructure result | A dated, redacted observation from the approved host/provider | Only the exact control, target and time observed | Future availability or unrelated controls |
| Governance/external approval | Signed owner, legal, privacy, clinical, VAPT, store or vendor evidence | The decision and scope stated in the record | Technical operation beyond the evidence attached |

Unchecked checklist items and absent evidence remain open. A skipped test is
not a pass.

## Repository-visible product surface

| Surface | Repository-visible role | Current repository position | Remaining proof |
| --- | --- | --- | --- |
| Landing and user web | Public content, account and user journeys | Separate production service definitions and route configuration exist | Final build/E2E, content/privacy approval and live routing |
| Counsellor web | Counsellor onboarding and assigned-service journeys | Separate frontend and counsellor authorization controls exist | Final build/E2E plus clinical policy and staged role testing |
| Admin panel | Privileged support, finance, privacy and content operations | Separate admin API/UI, permission configuration, fresh-MFA and audit controls exist | Least-privilege owner grants, operational sampling and independent test |
| Mobile application | iOS and Android user journeys | SDK/configuration remediation and store checklists exist | Final builds, physical-device tests, signed artifacts and store-console evidence |
| API profiles | iOS, Android, web/counsellor and admin routing boundaries | Profile-specific routing, authentication and authorization tests exist | Final-SHA regression plus staging and VAPT evidence |
| Worker | Approved scheduled and background functions | Single-worker and feature-gated scheduler configuration exists | Live singleton, queue/job behavior and monitoring proof |
| Calls and chat | Authorized real-time session and messaging paths | Participant, booking-state, time-window and ticket controls exist | Device/network E2E, provider/fallback review and live operational proof |
| Payments and payouts | Booking payment, webhook, reconciliation and payout controls | Server authority, durable attempts, idempotency and fail-closed feature gates exist | Owner policy, vendor test-mode E2E, reconciliation ownership and live enablement decision |
| Privacy and verification | Consent, rights requests, legal hold and counsellor evidence states | Versioned technical workflows and configurable retention machinery exist | Approved notices/policies, staged cases, processor handling and qualified review |

This table is an orientation, not a replacement for the detailed
[service and vendor register](./23-service-and-vendor-register.md).

## Repository-visible platform baseline

The intended production source is
[the production Compose definition](../../menorah/deploy/docker-compose.production.yml)
with the separately controlled
[Cloudflare Tunnel overlay](../../menorah/deploy/docker-compose.tunnel.yml).
The home Compose file is not the production authority.

The candidate definition includes:

- Caddy as the application ingress/reverse-proxy boundary;
- separate web, admin, API and worker services;
- self-hosted LiveKit signalling/media support;
- a MongoDB replica-set primary and Redis;
- maintenance-only backup, restore and migration helpers;
- Prometheus, blackbox exporter, data/host exporters, Grafana, Alertmanager and
  Uptime Kuma;
- a project-scoped Docker metrics gateway plus an unprivileged stats exporter;
  and
- Grafana Alloy feeding local Loki operational log storage.

Presence in Compose does not show that a container exists, is healthy or has
the approved live configuration.

## Security and data-control baseline

Repository evidence supports the following intended controls:

- fail-closed production startup validation and placeholder rejection;
- distinct authentication audiences and administrative authorization;
- server-side booking price and acceptance decisions;
- minimized pre-assignment booking previews;
- provider-bound, idempotent payment webhook handling and reconciliation;
- dual-control/fresh-MFA payout protections;
- counsellor verification state transitions and versioned evidence;
- participant and booking-state authorization for chat/calls;
- SSRF-resistant remote image acquisition;
- encrypted sensitive fields and a durable HMAC-linked security audit ledger;
- reviewable privacy consent, correction, deletion and export requests;
- explicit legal-hold and retention gates; and
- guarded deployment, migration, rollback, backup and restore sequencing.

These are implementation observations. Exact tests, scopes and limitations
must be retained against the final SHA in
[security verification](./06-security-verification.md) and
[the handover checklist](./19-handover-checklist.md).

## Observability baseline

At this review point, repository validators describe:

- **14** Prometheus scrape jobs;
- **69** alert rules; and
- **26** observability coverage records.

The source configuration separates JSON health probing from metrics scraping,
uses Alloy/Loki for production log collection/storage, and constrains Docker
metrics through a Compose-project-scoped gateway. The gateway remains a
trusted, root-equivalent Docker control-plane component because it holds the
socket; the exporter itself has no socket or host-filesystem access.

The repository's machine-validated P0 register covers all 20 required alert
gaps, including queue backlog, immediate backup failure, provider/email/call
outcomes, permission changes and separate HTTP status rates. A rule count does
not prove target health, threshold suitability, receiver delivery or human
response.

The Alertmanager process and routing template exist, but the committed receiver
has no email, chat, paging or webhook integration. An approved destination and
live end-to-end delivery/acknowledgement/resolution test remain an
`INFRASTRUCTURE ACTION`. Live Uptime Kuma monitors are not evidenced.

## Recovery baseline

The repository defines:

- invocation-identity ownership for backup output;
- encrypted archives, checksums and an independent HMAC integrity record;
- backup classes and a host health gate;
- an isolated restore target and sanitized production restore artifact;
- migration/release locks and phase evidence; and
- distinct pre-migration rollback and post-migration recovery paths.

The repository requires the newest successful isolated restore-test evidence
to be no more than **24 hours old**. Alert `for` duration is notification grace;
it does not extend that recovery-evidence age. No current production backup,
off-site copy or production-like restore is established by this baseline.

See [the backup and restore runbook](./10-backup-and-restore-runbook.md) and
[the rollback runbook](./09-rollback-runbook.md).

## Evidence not established here

The following remain explicitly unproven:

- owner-approved repository governance and protected release identity;
- actual host configuration, ownership, mounts, time synchronization and
  least-privilege service identities;
- production migration, backup, restore or rollback execution;
- live DNS, Cloudflare Tunnel, firewall, certificate and route state;
- live target health, log completeness, 180-day India log retention, alert
  delivery or human response;
- payment/payout provider callbacks and reconciliation in the intended mode;
- approved privacy, retention, minors, counselling, crisis, refund and
  continuity policies;
- vendor ownership, contracts, data locations, subprocessors and exit tests;
- independent VAPT and remediation retest;
- signed mobile builds, physical-device results and store declarations; and
- ISO management-system operation, internal audit, management review or
  certification.

## Baseline maintenance rule

Update this document only when the underlying source or evidence boundary
changes. Put dated execution artifacts in the release evidence pack, not in
this narrative. A status may advance only when the exact closure evidence is
linked from [the production gap register](./04-production-gap-register.md),
[known issues](./20-known-issues-and-technical-debt.md) and
[the go/no-go record](./21-production-go-no-go.md).
