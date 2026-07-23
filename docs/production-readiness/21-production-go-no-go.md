# Production go/no-go record

Decision date: 2026-07-24.

## Verdict

# NOT READY

This verdict applies to public production launch. Repository remediation has
materially improved control design and the repository-controlled P0 scope is
complete at a frozen exact-SHA candidate. Independent review, protected
repository governance, isolated-staging evidence, live infrastructure proof,
approved operating policies, independent VAPT, store validation and vendor
evidence are not complete.

No part of this document authorizes deployment, migration, secret changes,
provider changes, DNS/Cloudflare changes or store submission.

## Evidence boundary

| Evidence type | What exists | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Repository implementation | Candidate code, tests, configuration and runbooks | Intended behavior under covered test conditions | Live configuration, production data safety, operator execution or policy approval |
| Desktop validation | Unit/lint/config checks run without production access | Local regression status | Linux host behavior, vendor callbacks, DNS, alert delivery, backups or stores |
| Isolated integration | All 13 backend integration suites ran against disposable MongoDB and Redis; 45/45 tests passed | Covered behavior under the exact workflow fixture | Production data, host behavior or staging completeness |
| Live proof | Not completed for this candidate | Nothing may be inferred | Required before any public launch |
| Governance/external proof | Decisions and sign-offs remain pending | Nothing may be inferred | Cannot be replaced by code or a template |

## Repository release gates

| Gate | Current assessment | Required evidence |
| --- | --- | --- |
| Immutable candidate | Repository complete; review required | Runtime SHA `3fb99858c6766a341bb7b7dab2377195427f0ea1`, documentation-head verification, independent review and protected release record |
| Backend regression | Pass | 112/112 default suites and 1,426/1,426 tests plus 13/13 disposable integration suites and 45/45 tests |
| Web/admin/counsellor/mobile | Pass for repository automation | Exact-SHA lint/type/build/audit jobs; mobile 20/20 contracts and 19/19 Doctor |
| Release/recovery scripts | Pass for repository automation | Exact-SHA Linux safety suites, Bash syntax and pinned ShellCheck |
| Compose/Caddy/monitoring | Pass for repository automation | Clean-archive Compose, Caddy, 14 jobs, 69 rules, 26 coverage records and all 20 P0 mappings; protected-host/live proof remains open |
| Migrations | Unit/preflight tests exist | Disposable replica-set execution, invariants, ordering and recovery evidence |
| Dependency/security scans | Exact-SHA automated gates pass | Gitleaks, Semgrep, production dependency policies, four Trivy image gates and SBOMs pass; independent VAPT remains open |

Repository-controlled P0 decision:
**REPOSITORY REMEDIATION COMPLETE — REVIEW REQUIRED**.

Public-production decision remains **NO-GO** because the external and
operational evidence below is incomplete. Exact repository results are in
[the immutable candidate record](./26-immutable-candidate-record.md).

## Live infrastructure blockers

- `INFRASTRUCTURE ACTION`: validate the target host configuration by name and
  constraint without exposing values.
- `INFRASTRUCTURE ACTION`: create and verify a current encrypted backup, off-host
  recovery copy and isolated database/media restore.
- `INFRASTRUCTURE ACTION`: execute approved migrations through the guarded
  maintenance boundary and retain invariant evidence.
- `INFRASTRUCTURE ACTION`: verify Cloudflare hostnames, tunnel, DNS, Caddy,
  firewall, TLS and external probes.
- `INFRASTRUCTURE ACTION`: prove MongoDB/Redis roles and health, monitoring
  coverage, Alertmanager delivery, Uptime Kuma monitors and responder
  acknowledgement.
- `INFRASTRUCTURE ACTION`: prove time synchronization, 180-day India ICT log
  retention and incident-time retrieval.
- `INFRASTRUCTURE ACTION`: exercise pre-migration rollback and post-migration
  coordinated recovery separately.

Live infrastructure decision: **NO-GO**.

## Owner and operations blockers

- `OWNER ACTION`: approve public-launch scope, risk appetite and final residual
  risks.
- `OWNER ACTION`: approve any limited pilot's eligibility, data scope, duration,
  monitoring and stop conditions separately from approval for public launch.
- `OWNER ACTION`: assign release, on-call, incident, backup, privacy/grievance,
  payment reconciliation, vendor and store owners with alternates.
- `OWNER ACTION`: approve RPO/RTO, retention, off-site backup and key custody.
- `OWNER ACTION`: approve cancellation, refund, rescheduling, free/promotion,
  payout and manual-review rules.
- `OWNER ACTION`: configure and verify GitHub governance and release-tag rules.

Owner/operations decision: **NO-GO**.

## Legal blockers

- `LEGAL ACTION`: qualified Indian counsel must approve the legal register,
  notices, purposes, rights/grievance process, retention/exceptions,
  disclosures, transfers and processor terms.
- `LEGAL ACTION`: confirm the current IT/SPDI and phased DPDP obligations,
  children/minor position, CERT-In process and any health-service-specific
  requirements.
- `LEGAL ACTION`: approve user-facing deletion, refund, clinical and incident
  statements so they do not promise unsupported outcomes.

Legal decision: **NO-GO**.

## Privacy blockers

- `PRIVACY ACTION`: approve the data-flow inventory, field-level minimization,
  consent points, privacy risk assessments and processor register.
- `PRIVACY ACTION`: approve category-by-category retention and legal-hold
  handling; automated retention must remain off until then.
- `PRIVACY ACTION`: test rights identity checks, secure response/delivery,
  vendor propagation, backup/log effects and completion evidence.
- `PRIVACY ACTION`: approve mental-health, biometric/face-check and child data
  handling.

Privacy decision: **NO-GO**.

## Clinical blockers

- `CLINICAL ACTION`: approve counsellor qualification evidence, reviewer
  competence, renewal, expiry, rejection and suspension policy.
- `CLINICAL ACTION`: define clinical record boundaries, role access, correction,
  crisis/suicide-risk escalation, emergency disclosure and continuity.
- `CLINICAL ACTION`: approve the minors position and face-check suitability.
- `CLINICAL ACTION`: validate remote session/call safety and fallback
  representation.

Clinical decision: **NO-GO**.

## Independent security-assessment blockers

- `VAPT ACTION`: assess the immutable staging candidate across public and
  authenticated web/mobile/API surfaces, WebSockets, object authorization,
  admin, payments, file access, SSRF and infrastructure.
- `VAPT ACTION`: close and retest critical/high findings and record approved
  treatment of all remaining findings.
- Automated tests and dependency scans are supporting evidence, not VAPT.

VAPT decision: **NO-GO**.

## Apple and Google blockers

- `APPLE ACTION`: verify account ownership, certificates/profiles, identifiers,
  entitlements, associated domains, privacy manifest/declarations, CocoaPods,
  archive, device tests and review instructions.
- `GOOGLE ACTION`: verify account ownership, app signing, package/asset-links,
  Data Safety, Health Apps declarations, internal-track build/device tests and
  review instructions.
- Neither desktop tests nor repository templates prove store acceptance.

Store decision: **NO-GO**.

## Vendor blockers

- `VENDOR ACTION`: verify ownership, contracts, data locations, subprocessors,
  security/privacy assurance, least-privilege access, callback configuration,
  incident contacts, service limits, export/deletion and termination for every
  enabled provider.
- `VENDOR ACTION`: perform test-mode payment/payout webhook and reconciliation
  validation without production credentials.
- Optional providers must remain disabled until their individual evidence pack
  is complete.

Vendor decision: **NO-GO**.

## Minimum sequence to reconsider the verdict

1. Independently review the frozen immutable candidate and documentation-only boundary.
2. Execute the isolated-staging package against that SHA.
3. Resolve or explicitly document every result in
   [known issues](./20-known-issues-and-technical-debt.md).
4. Obtain owner, legal, privacy and clinical decisions.
5. Complete vendor and mobile-store prerequisites.
6. Complete independent VAPT and closure retest.
7. Prove live configuration, backup/restore, migration, networking,
   observability, alert delivery, logging and recovery in the approved staging
   and host workflows.
8. Run a limited, non-production operational rehearsal with named responders.
9. Re-run the [handover checklist](./19-handover-checklist.md) and attach every
   evidence reference.
10. Convene a recorded cross-functional go/no-go review. A higher verdict
    requires affirmative sign-off from every accountable role; silence is a
    no-go.

## Decision record

| Role | Current decision | Reason |
| --- | --- | --- |
| Engineering | No-go for public launch; repository remediation complete pending review | Isolated staging, protected governance and external approvals incomplete |
| Infrastructure | No-go | Live recovery, network, monitoring and log evidence incomplete |
| Owner/operations | No-go | Policies, roles and risk decisions incomplete |
| Legal/privacy | No-go | Qualified approvals and operating evidence incomplete |
| Clinical | No-go | Clinical governance incomplete |
| Security/VAPT | No-go | Independent assessment and retest incomplete |
| Apple/Google | No-go | Store and signed-build evidence incomplete |
| Vendors | No-go | Provider evidence incomplete |

The only evidence-supported public-production verdict on 2026-07-24 is
**NOT READY**.
