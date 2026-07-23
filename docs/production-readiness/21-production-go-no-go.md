# Production go/no-go record

Decision date: 2026-07-23.

## Verdict

# NOT READY

This verdict applies to public production launch. Repository remediation has
materially improved control design, but an immutable reviewed release, complete
cross-stack evidence, live infrastructure proof, approved operating policies,
independent VAPT, store validation and vendor evidence are not complete.

No part of this document authorizes deployment, migration, secret changes,
provider changes, DNS/Cloudflare changes or store submission.

## Evidence boundary

| Evidence type | What exists | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Repository implementation | Candidate code, tests, configuration and runbooks | Intended behavior under covered test conditions | Live configuration, production data safety, operator execution or policy approval |
| Desktop validation | Unit/lint/config checks run without production access | Local regression status | Linux host behavior, vendor callbacks, DNS, alert delivery, backups or stores |
| Isolated integration | Some database-dependent suites are gated for disposable databases | Behavior when explicitly executed in the approved isolated environment | They are not passing evidence when skipped |
| Live proof | Not completed for this candidate | Nothing may be inferred | Required before any public launch |
| Governance/external proof | Decisions and sign-offs remain pending | Nothing may be inferred | Cannot be replaced by code or a template |

## Repository release gates

| Gate | Current assessment | Required evidence |
| --- | --- | --- |
| Immutable candidate | Open | Clean reviewed SHA, remote sync, focused commit list, protected release record |
| Backend regression | Candidate evidence exists; final release-SHA record still required | Exact pass/fail/skip counts and isolated integration results |
| Web/admin/counsellor/mobile | Final combined release evidence not recorded here | Lint, type-check, test and production build results per app |
| Release/recovery scripts | Candidate regression coverage exists | Linux syntax/runtime validation against final SHA |
| Compose/Caddy/monitoring | Source validation exists | Final config tests plus host interpolation and native validators |
| Migrations | Unit/preflight tests exist | Disposable replica-set execution, invariants, ordering and recovery evidence |
| Dependency/security scans | Scheduled gates exist | Fresh final-SHA results, exceptions, VAPT and closure retest |

Repository gate decision: **NO-GO** until the immutable evidence pack is
complete.

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

1. Freeze and review one immutable candidate SHA.
2. Complete every repository and isolated-staging test against that SHA.
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
| Engineering | No-go for public launch | Final immutable cross-stack evidence incomplete |
| Infrastructure | No-go | Live recovery, network, monitoring and log evidence incomplete |
| Owner/operations | No-go | Policies, roles and risk decisions incomplete |
| Legal/privacy | No-go | Qualified approvals and operating evidence incomplete |
| Clinical | No-go | Clinical governance incomplete |
| Security/VAPT | No-go | Independent assessment and retest incomplete |
| Apple/Google | No-go | Store and signed-build evidence incomplete |
| Vendors | No-go | Provider evidence incomplete |

The only evidence-supported verdict on 2026-07-23 is **NOT READY**.
