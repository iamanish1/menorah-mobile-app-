# Production go/no-go record

Decision record updated: 2026-08-03.

## Verdict

# NOT READY

This verdict applies to public production launch. Repository remediation has
materially improved control design. The inherited local-overlay baseline is
historical; the candidate-specific discovery regression and 293-test contract
passed at `142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2`, and its three exact push gate runs
passed. Replacement read-only discovery output is collected, but no
collision-approved server-staging or production fact may be inferred. Protected repository governance, approved
Ubuntu staging, live infrastructure proof, approved operating policies,
independent VAPT, store validation and vendor evidence are not complete.

No part of this document authorizes deployment, migration, secret changes,
provider changes, DNS/Cloudflare changes or store submission.

## Android 2.7.0 decision boundary

The planned Android-only `2.7.0` release remains **NO-GO**. A final protected
release SHA, Play-safe version code, signing-incident closure, Firebase/FCM
configuration, signed AAB, internal-track Play delivery, clean pre-launch
report, same-day emulator/physical-device QA and separate owner approval do not
yet have recorded evidence.

Internal QA, when complete, will not authorize production by itself. The owner
must separately identify and approve the exact AAB, and explicitly accept the
risk of a 100% rollout without staged percentages. Production promotion must
use that same internal-track artifact; a rebuild or OTA update is not an
acceptable substitute. See
[the Android 2.7.0 launch record](./30-android-2.7.0-production-launch.md).

## Evidence boundary

| Evidence type | What exists | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Repository implementation | Candidate code, tests, configuration and runbooks | Intended behavior under covered test conditions | Live configuration, production data safety, operator execution or policy approval |
| Desktop validation | Unit/lint/config checks run without production access | Local regression status | Linux host behavior, vendor callbacks, DNS, alert delivery, backups or stores |
| Historical candidate evidence | Evidence for `a1bc1b6ec751926edc9981f57762277060acf9e4`, `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`, `3fb99858c6766a341bb7b7dab2377195427f0ea1` and earlier candidates remains recorded as history | Only behavior of the cited older SHA under its stated fixture | Current runtime behavior, production data, host behavior or staging completeness; it is superseded for the current candidate |
| Historical local synthetic staging | Complete at superseded runtime `1ecd0b379369258be466159364a8a48c79fb65aa`; report 28 remains the authoritative historical record | Docker Desktop isolation, migrations/seed, API/browser checks, local stubs, monitoring, backup/restore and explicit evidence boundaries | Current runtime behavior, Ubuntu host behavior, real-provider callbacks, physical devices, independent VAPT, external approval or production readiness |
| Server-staging design | Dedicated project/resources and a discovery-first Steps A-G runbook exist at the candidate | Intended isolation contract and approval order | Target-host truth, collision freedom, prepared resources, deployment or live behavior |
| Live proof | Not completed for this candidate | Nothing may be inferred | Required before any public launch |
| Governance/external proof | Decisions and sign-offs remain pending | Nothing may be inferred | Cannot be replaced by code or a template |

## Repository release gates

| Gate | Current assessment | Required evidence |
| --- | --- | --- |
| Immutable candidate | Runtime SHA frozen; local overlay and three exact push gates passed; review incomplete | `142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2`, final documentation-head verification, independent review and protected release record |
| GitHub push gates | Exact candidate runs passed with no failed, skipped or cancelled jobs/steps | Readiness `30212940956`: 1/1 jobs, 11/11 steps; functional `30212940958`: 9/9 and 89/89; security `30212940952`: 15/15 and 104/104 |
| Backend regression | Pass at the runtime candidate | Default backend run: 117 suites and 1,716 tests passed; the separate integration run: 13 suites and 45 tests passed |
| Web/admin/counsellor/mobile | Pass for recorded repository automation; device proof open | Recorded lint/type/test checks passed with warnings documented; physical-device, accessibility, responsive and real-provider coverage remains open |
| Release/recovery scripts | Pass for recorded repository automation and local recovery | Core release contracts passed 432/432 (81 workflow/release, 59 local-staging and 292 server-staging); signed backup and isolated restore passed; approved Ubuntu execution remains open |
| Compose/Caddy/monitoring | Pass locally; protected-host proof open | Default runtime ended with 22 healthy services plus four successful one-shot services and zero bad services; API smoke 31/31, browser 9/9 and all 20 required alerts fired/resolved; approved Ubuntu staging and live proof remain open |
| Migrations | Pass locally | All 11 applied and then all 11 skipped on the local replica-set rerun with ledger/index invariants; approved Ubuntu interruption/rollback/resume and host evidence remain open |
| Dependency/security scans | Exact security workflow passed; independent VAPT remains open | Full-history secret scan, OWASP SAST, all seven production audit-policy roots, four image high/critical scans and four CycloneDX SBOM jobs passed; `brace-expansion` 5.0.7 is patched to 5.0.8, while only the bounded moderate `uuid` exception `GHSA-w5hq-g745-h8pq` remains through 2026-10-31 |

Repository-controlled P0 decision:
**DISCOVERY OUTPUT COLLECTED — COLLISION REVIEW REQUIRED**.

Public-production decision remains **NO-GO** because the external and
operational evidence below is incomplete. Exact repository results are in
[the immutable candidate record](./26-immutable-candidate-record.md) and
[the local staging validation report](./28-local-staging-validation-report.md).
The discovery and approval boundary is in
[the server-staging design and discovery runbook](./29-server-staging-design-and-discovery-runbook.md).

## Live infrastructure blockers

- `SERVER DISCOVERY REVIEW — INFRASTRUCTURE ACTION`: independently review the
  collected redacted output from immutable runtime
  `142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2` (script SHA-256
  `8e23ecfb2d1a42f429e66ea618b15b09360f568010e5859666ec4063175e8f45`) and
  classify every collision. Re-running discovery is not authorized absent a
  review instruction.
- `DRY RENDER — INFRASTRUCTURE ACTION`: after every collision class passes and
  the first human approval is recorded, prepare only the approved staging
  inputs and complete the no-start Compose/Caddy/isolation render.
- `STAGING DEPLOYMENT — INFRASTRUCTURE ACTION`: obtain a separate second
  approval before deploying the exact SHA; no deployment approval exists now.
- `SECRETS — INFRASTRUCTURE ACTION`: validate the target-host configuration by
  name and constraint without exposing values; prove custody, permissions,
  rotation/revocation and recovery.
- `INFRASTRUCTURE ACTION`: create and verify a current encrypted backup, off-host
  recovery copy and isolated database/media restore.
- `INFRASTRUCTURE ACTION`: execute approved migrations through the guarded
  maintenance boundary and retain invariant evidence.
- `DNS/CLOUDFLARE — INFRASTRUCTURE ACTION`: verify hostnames, Tunnel, DNS,
  Caddy, firewall, TLS and external probes without changing production routes
  during discovery.
- `NETWORK EGRESS — INFRASTRUCTURE ACTION`: prove reviewed LiveKit media
  exposure and host firewall/proxy destination restrictions; the sixth,
  NAT-capable `staging-egress` network is not an FQDN allowlist.
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
  Firebase/FCM and enhanced push security, Data Safety, Health Apps
  declarations, internal-track build/device tests, clean pre-launch report and
  review instructions.
- `GOOGLE ACTION` and `OWNER ACTION`: record the exact AAB identity, obtain the
  separate go/no-go and 100% rollout risk exception, and promote only that
  internal-track artifact.
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

## ISO and management-system blockers

- `OWNER ACTION`: define the ISMS/quality/continuity scope, context, interested
  parties, risk method, objectives and accountable roles.
- Operate the selected controls and retain evidence before claiming
  effectiveness.
- Complete internal audit, corrective actions and management review before
  engaging qualified certification parties.
- Repository mappings and technical controls are not ISO certification.

ISO/management-system decision: **NO-GO**.

## Minimum sequence to reconsider the verdict

1. Independently review the frozen immutable candidate and documentation-only boundary.
2. Authorize and return the checksum-pinned temporary-download discovery
   output; a download or SHA-256 failure must stop before script execution.
3. Complete every collision class as PASS and obtain the first human approval.
4. Prepare the dedicated staging roots and inputs, complete the no-start
   render/validator set, and obtain the separate deployment approval.
5. Deploy only the exact staging project/SHA and collect the approved Ubuntu
   ownership, recovery, ingress, alert/human-delivery, systemd/timer,
   contention and sandbox-callback evidence.
6. Resolve or explicitly document every result in
   [known issues](./20-known-issues-and-technical-debt.md).
7. Obtain owner, legal, privacy and clinical decisions.
8. Complete vendor and mobile-store prerequisites.
9. Complete independent VAPT and closure retest.
10. Prove live configuration, backup/restore, migration, networking,
   observability, alert delivery, logging and recovery in the approved staging
   and host workflows.
11. Run a limited, non-production operational rehearsal with named responders.
12. Re-run the [handover checklist](./19-handover-checklist.md) and attach every
   evidence reference.
13. Convene a recorded cross-functional go/no-go review. A higher verdict
    requires affirmative sign-off from every accountable role; silence is a
    no-go.

## Decision record

| Role | Current decision | Reason |
| --- | --- | --- |
| Engineering | No-go for public launch; local staging passed and discovery output awaits collision review | No collision approval, approved Ubuntu staging, protected governance or external approvals |
| Infrastructure | No-go | Live recovery, network, monitoring and log evidence incomplete |
| Owner/operations | No-go | Policies, roles and risk decisions incomplete |
| Legal/privacy | No-go | Qualified approvals and operating evidence incomplete |
| Clinical | No-go | Clinical governance incomplete |
| Security/VAPT | No-go | Independent assessment and retest incomplete |
| Apple/Google | No-go | Store and signed-build evidence incomplete |
| Vendors | No-go | Provider evidence incomplete |

The only evidence-supported public-production verdict on 2026-08-03 is
**NOT READY**.
