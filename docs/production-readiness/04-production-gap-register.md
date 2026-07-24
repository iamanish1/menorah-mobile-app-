# Production gap register

Last reviewed: 2026-07-24.

## Status and relationship to other registers

**Public-production verdict: NOT READY.**

This is the high-level closure register for release decision-makers. It
consolidates repository, live-environment and external/governance gaps without
reclassifying source code as operational evidence. Detailed engineering
limitations remain in
[known issues and technical debt](./20-known-issues-and-technical-debt.md);
the checkbox evidence gate is
[the handover checklist](./19-handover-checklist.md).

All rows below are open until a dated closure record identifies the immutable
candidate SHA, environment, evidence location, responsible person, reviewer
and approval. A template, passing desktop test, feature flag or undocumented
risk acceptance does not close a row.

Priority meanings:

- `P0` — blocks public production;
- `P1` — blocks the intended operating model or broader launch and may be
  deferred only through an authorized, bounded decision that does not waive
  law, safety or store requirements.

The replacement runtime candidate is frozen at
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`. Its complete isolated local
exercise passed, with 81 requested assertions classified as **STATIC PASS**,
14 recorded gaps and 12 recorded blocked items. All six candidate-bound
push/PR workflow executions
passed. Earlier completion statements and green workflow runs attached to
`3fb99858c6766a341bb7b7dab2377195427f0ea1` are historical and
**INVALIDATED** for this newer runtime. The repository-controlled portion of
`CX-P0-01` through `CX-P0-06` has current local evidence but still requires
independent review and the external proof recorded below. This does not close the
local-staging, Ubuntu staging, live, owner, legal/privacy, clinical, VAPT,
store, vendor or ISO rows below. Identity and evidence boundaries are recorded
in [the immutable candidate record](./26-immutable-candidate-record.md) and
[the local staging validation report](./28-local-staging-validation-report.md).

## Repository and release-evidence gaps

| ID | Pri. | Current repository evidence | Missing closure evidence | Owner/action |
| --- | --- | --- | --- | --- |
| GAP-REL-001 | P0 | Runtime SHA `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` is frozen; current local and six push/PR workflow results exist; old exact-SHA runs are retained only as invalidated history | Independent review, final documentation-head verification, approved branch/ruleset governance and protected production release identity | Engineering; `OWNER ACTION` for repository governance |
| GAP-QA-001 | P0 | Local matrix: 81 STATIC PASS, 14 GAP and 12 BLOCKED; API smoke 31/31 and Playwright 7/7 passed | Approved Ubuntu staging web/mobile/API E2E, physical-device/provider behavior, accessibility/responsive/load coverage, independent VAPT and reviewer acceptance | Engineering and QA |
| GAP-DEP-001 | P1 | Dependency audit policy, lockfiles and a bounded Expo transitive exception exist | Fresh production-scope audits and exploitability review for every package at final SHA; supported upgrades/tests and time-bound exceptions | Engineering; security reviewer |
| GAP-ARC-001 | P1 | Production Compose separates services/networks and hardens containers | Independent architecture/least-privilege review of final rendered model, including web-service DB/email access, external network membership and high-trust components | Engineering; security; `INFRASTRUCTURE ACTION` |
| GAP-OBS-SIGNAL-001 | P0 | Source has 14 scrape jobs, 69 alert rules and 26 coverage records; all 20 required P0 alerts fired and resolved in local Prometheus and Alertmanager | Approved Ubuntu threshold/target/provider-callback execution, protected human receiver delivery, acknowledgement/escalation and approved ownership | Engineering; `INFRASTRUCTURE ACTION`; owner placeholders in coverage manifest |

## Live infrastructure and recovery gaps

| ID | Pri. | Current repository evidence | Missing closure evidence | Owner/action |
| --- | --- | --- | --- | --- |
| GAP-CFG-001 | P0 | Production startup and Compose validators fail closed on missing, malformed, insecure or placeholder configuration | Validate the fully rendered target-host configuration by name/constraint, mounts, permissions and service identity without disclosing values; prove custody and recovery | `INFRASTRUCTURE ACTION`; `OWNER ACTION` |
| GAP-DB-001 | P0 | Local replica-set execution applied 11 migrations, skipped the same 11 on rerun, and preserved ledger/index/main-database invariants | Approved Ubuntu execution plus interruption, rollback/resume and protected-host invariant evidence; any production maintenance remains separately authorized | `INFRASTRUCTURE ACTION`; DBA/release approvers |
| GAP-BKP-001 | P0 | A signed/encrypted local backup and separate-volume/database restore passed with 18 collections, 89 documents, 117 indexes, and one byte-bearing synthetic managed-media file whose source/restored bytes matched | Approved Ubuntu backup/restore, protected off-site custody/retrieval, independent key recovery, host-loss rehearsal and owner-approved RPO/RTO; newest server restore evidence must meet the approved age | `INFRASTRUCTURE ACTION`; `OWNER ACTION` for RPO/RTO and custody |
| GAP-ROLL-001 | P0 | Pre-migration rollback and post-migration coordinated recovery are separated | Exercise both paths on an approved Linux staging host; record achieved recovery time, data invariants, operators and failure handling | `INFRASTRUCTURE ACTION`; release/recovery owners |
| GAP-NET-001 | P0 | Domain manifest, Caddy routes, trusted-proxy validation and Tunnel overlay exist | Read-only Cloudflare/DNS/Tunnel comparison, host/cloud firewall inspection, TLS/public route tests and failed bypass attempts | `INFRASTRUCTURE ACTION`; Cloudflare `VENDOR ACTION` |
| GAP-CALL-NET-001 | P1 | Self-hosted LiveKit and guarded ticket/state/time authorization exist | Device tests on normal/restrictive networks; direct media port/firewall proof; approved regional fallback behavior and provider evidence | `INFRASTRUCTURE ACTION`; `CLINICAL ACTION`; `VENDOR ACTION` |
| GAP-OBS-DELIVERY-001 | P0 | Prometheus, blackbox/exporters, rules and Alertmanager template exist | Install approved protected Alertmanager destination outside Git; prove all targets/probes, controlled firing, receiver delivery, human acknowledgement, escalation and resolution; evidence Uptime Kuma monitors | `INFRASTRUCTURE ACTION`; `OWNER ACTION` for rota/destination |
| GAP-OBS-DOCKER-001 | P1 | Project-scoped gateway tests allow sanitized list/one-shot stats/state and deny raw inspect/log/archive/export, cross-project access and all mutations; exporter has no socket | Verify exact live image, isolated two-service network, project filtering, denied routes, metric coverage, restarts and no secret/environment exposure | `INFRASTRUCTURE ACTION`; security reviewer |
| GAP-LOG-001 | P0 | Production uses Alloy -> local Loki with source-controlled file positions, rotation and retention | Prove source completeness/minimization, access control, time sync, capacity and incident retrieval; establish required India location/180-day ICT coverage and protected off-host evidence where required | `INFRASTRUCTURE ACTION`; `LEGAL ACTION`; `PRIVACY ACTION` |

## Product, payment and data-governance gaps

| ID | Pri. | Current repository evidence | Missing closure evidence | Owner/action |
| --- | --- | --- | --- | --- |
| GAP-PAY-001 | P0 | Server pricing, paid/entitled assignment, signed idempotent callbacks, durable attempts, reconciliation and fail-closed feature gates exist | Approve cancellation/refund/reschedule/free-promotion and mismatch-repair rules; name reconciler; complete Razorpay/RazorpayX test-mode event matrix and callback proof | `OWNER ACTION`; finance; `VENDOR ACTION` |
| GAP-PAYOUT-001 | P1 | Encrypted bank fields, fresh MFA, two-person payout approval and cap validation exist | Least-privilege finance roles, vendor sandbox, failure/retry/reconciliation exercise and approved manual resolution | `OWNER ACTION`; finance; `VENDOR ACTION` |
| GAP-PRIV-001 | P0 | Versioned consent, withdrawal, correction/deletion/export request states, legal holds and configurable retention controls exist | Approved field-level data map, notices, purposes, identity checks, retention schedule, rights/grievance operating procedure, vendor/backup propagation and staged cases | `LEGAL ACTION`; `PRIVACY ACTION`; `OWNER ACTION` |
| GAP-MINOR-001 | P0 | No complete minor/guardian operating model is represented as approved | Decide whether minors are excluded or supported; implement and test accurate age, guardian, safeguarding, rights and crisis controls under qualified approval | `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION` |
| GAP-KYC-001 | P0 | Counsellor lifecycle states, versioned consent/policy, evidence and reviewer records exist | Approve qualification sufficiency, acceptable evidence, reviewer competence, renewal/expiry/suspension/appeal and face-check necessity; stage full workflow | `CLINICAL ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `OWNER ACTION` |
| GAP-RIGHTS-001 | P1 | Reviewable privacy case workflow exists | Secure minimized export assembly/delivery, verified out-of-band status for deactivated users, social-account reauthentication decision and tested completion evidence | `PRIVACY ACTION`; `OWNER ACTION`; engineering after policy |
| GAP-RET-001 | P1 | Retention execution is default-off, legal-hold-aware and narrow | Approve each category/trigger/exception; add tested handlers before enabling; define audit-ledger, log, backup and vendor disposition | `LEGAL ACTION`; `PRIVACY ACTION`; `OWNER ACTION` |
| GAP-CLIN-001 | P0 | Application authorization and no-recording default provide technical guardrails | Approve counselling scope, clinical record boundary, crisis/suicide-risk escalation, emergency disclosure, continuity and remote-session safety | `CLINICAL ACTION`; `LEGAL ACTION`; `OWNER ACTION` |

## Operations, assurance and external gaps

| ID | Pri. | Current repository evidence | Missing closure evidence | Owner/action |
| --- | --- | --- | --- | --- |
| GAP-OWN-001 | P0 | Role descriptions and separation principles exist | Assign named primary/alternate owners for release, infrastructure, security, on-call, backup, privacy/grievance, clinical, finance, vendors and stores; complete access review | `OWNER ACTION`; `INFRASTRUCTURE ACTION` |
| GAP-INC-001 | P0 | Incident scenarios, audit signals and recovery runbooks exist | Approve severity/acknowledgement targets, responder rota and communications; designate CERT-In path; run tabletop and technical exercises | `OWNER ACTION`; `LEGAL ACTION`; `INFRASTRUCTURE ACTION` |
| GAP-VAPT-001 | P0 | Automated security tests and verification scope exist | Independent VAPT of immutable staging across public/authenticated APIs, web/mobile, WebSockets, files, SSRF, admin, payments and infrastructure; close/retest critical/high findings | `VAPT ACTION`; `OWNER ACTION` |
| GAP-VENDOR-001 | P0 | Provider inventory, feature gates and fail-closed configuration exist | For each enabled provider: ownership, MFA/access, contract/DPA, location/subprocessors, security, callback, quota, incident, deletion/export and exit evidence; otherwise disable | `VENDOR ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `OWNER ACTION` |
| GAP-APPLE-001 | P0 | iOS identifiers/configuration and release checklist exist | Approved macOS dependency regeneration, signed archive, entitlement/association/privacy review, physical-device testing, TestFlight/reviewer and account evidence | `APPLE ACTION`; `OWNER ACTION` |
| GAP-GOOGLE-001 | P0 | Android identifiers/configuration and release checklist exist | App signing, asset links, Data Safety/Health declarations, internal-track build, physical-device/reviewer and account evidence | `GOOGLE ACTION`; `OWNER ACTION` |
| GAP-BCM-001 | P1 | Technical backup, recovery and maintenance processes exist | Business impact analysis; approved RPO/RTO and maximum tolerable disruption; dependency/communications plan; repeated continuity exercise and corrective actions | `OWNER ACTION`; `INFRASTRUCTURE ACTION` |
| GAP-ISO-001 | P1 | Cross-standard evidence map identifies candidate controls | Define scope/context/risk method, approve policies/objectives, operate controls, retain records, perform internal audit and management review, then engage qualified certification parties | `OWNER ACTION`; no certification claim |

## Safe interim positions

Until the relevant rows close:

- keep the public-production verdict `NOT READY`;
- keep booking payments and payouts behind exact-default-false gates unless the
  complete approved gate is met;
- keep subscription payments disabled;
- keep optional face, social-generation/publication, cloud-media and external
  call providers disabled unless individually approved and evidenced;
- keep automatic retention disposal disabled except for explicitly approved,
  tested handlers;
- do not run production migrations, restores or ad hoc database repairs from a
  desktop;
- do not expose databases, Redis, dashboards, Loki, Prometheus or exporter
  endpoints publicly; and
- do not treat a healthy Alertmanager, gateway, backup marker or Loki process
  as proof that a human was notified, a backup is valid or required evidence is
  complete.

## Closure workflow

1. Attach repository and test evidence to one immutable candidate SHA.
2. Name the environment and exact control being proved.
3. Link the redacted artifact, timestamp, operator and independent reviewer.
4. Obtain every action-label approval applicable to the row.
5. Update the detailed issue, checklist and this register consistently.
6. Re-run [the production go/no-go record](./21-production-go-no-go.md).

Only a recorded cross-functional decision may change the verdict. Technical
completion cannot waive legal, privacy, clinical, store or vendor obligations.
