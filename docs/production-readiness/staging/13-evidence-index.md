# Unified production-readiness evidence index

Runtime candidate SHA: `4c82121bfa2293a21a831bc490f4101eb4db1213`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Tracker state: **runtime SHA frozen; repository-local checks collected;
external execution evidence not collected**

This is the single tracker for repository, staging, live, governance and
external evidence. Artifacts belong in an approved access-controlled store,
not Git. References must never expose credentials, tokens, production data,
personal or clinical data, signing material, or restricted VAPT detail.

The runtime SHA identifies the reviewed code, configuration and artifact
content. The docs/PR-head revision identifies the later evidence-package
commit and the updater's required remote-tip checkout/marker SHA. Do not
relabel runtime, VAPT or mobile-build evidence: accept that later head only
with recorded ancestry and a diff confined to this staging package.

## Field and status rules

- `ID` is stable and unique.
- `Requirement` is an objectively testable claim or required decision.
- `Responsible party` names the accountable role and action label.
- `Evidence` states the required artifact, UTC time and reviewer.
- `Location` is a controlled reference, never a secret-bearing URL.
- `Status` is `NOT COLLECTED`, `PASS`, `FAIL`, `BLOCKED`, `SKIPPED`,
  `INVALIDATED` or approved `NOT APPLICABLE`.
- `Severity` is `P0`, `P1` or governance scope.
- `Renewal / expiry` is the rerun or review interval.
- `Candidate SHA` refers to the runtime SHA at the top of this file.

`PASS` requires accessible evidence reviewed by the responsible party. Local
console observations are useful diagnostics but are not durable candidate
evidence. A skipped, failed, blocked or uncollected P0 prevents go-live. When
runtime code, configuration or artifacts change, retain old evidence, mark
affected rows `INVALIDATED` and rerun them for the new SHA.

## Current repository observation log

These results were observed locally on the exact frozen runtime SHA
`4c82121bfa2293a21a831bc490f4101eb4db1213`. They are diagnostic console
observations, not durable external evidence. Controlled storage, responsible
party review and any required skipped-test disposition remain necessary before
a related tracker row can become `PASS`.

| Command | Most recent local result | Current tracker treatment |
| --- | --- | --- |
| `git rev-parse HEAD` at runtime freeze | `4c82121bfa2293a21a831bc490f4101eb4db1213` | Exact local runtime identity; final docs/PR-head and remote synchronization record still required |
| `cd menorah/scripts/qa && npm run test:release-workflow` | 61/61 checks passed, including CRLF regression coverage | Diagnostic only; durable log and independent review required |
| `cd menorah/scripts/qa && npm run test:smoke-safety` | 12/12 checks passed | Diagnostic only; durable log required |
| `cd menorah/mobile-app && npm run test:release-config` | 20/20 checks passed | Diagnostic only; durable log required |
| `cd menorah/mobile-app && npm run validate:release-config` | Passed | Diagnostic only; durable log required |
| Backend lint | Passed | Diagnostic only; durable log required |
| Default backend Jest run | 108 suites and 1,411 tests passed; 13 suites and 45 tests skipped | Skips require explicit disposition; `REP-002` cannot be `PASS` |
| Backend production dependency audit | 0 vulnerabilities | Diagnostic only; durable report required |
| User web lint | 0 errors; 3 warnings | Diagnostic only; warning disposition and durable log required |
| User web TypeScript check | Passed | Diagnostic only; durable log required |
| User web email-routing tests | 5/5 checks passed | Diagnostic only; durable log required |
| User web production build | Passed; 36 pages plus middleware | Diagnostic only; artifact checksum and durable log required |
| User web production dependency audit | 0 vulnerabilities | Diagnostic only; durable report required |
| `actionlint` v1.7.12 | Passed | Diagnostic only; pinned-tool durable log required |
| Production Compose, missing-authoritative-value and home/live-mailbox guards | Passed | Diagnostic only; protected staging render evidence required |
| Shell staging guards | Passed | Diagnostic only; protected-host execution evidence required |
| Pinned Gitleaks v8.30.1 full-history scan | 344 commits, approximately 11.84 MB, 0 leaks | Local clean result only; remaining security scans, durable report and review required |

## Current external governance snapshot

Read-only review found both required GitHub environments absent, `main` and
the release branch without branch protection, no repository rulesets, and
Android signing secrets at repository scope. These are release blockers, not
authorizations to mutate GitHub configuration.

| Control | Current state | Required external action |
| --- | --- | --- |
| `staging-security` environment | Absent | `OWNER ACTION` creates and protects it before DAST variables/secrets or a run |
| `android-release-signing` environment | Absent | `OWNER ACTION` / `GOOGLE ACTION` creates and protects it before the readiness marker or signing secrets |
| Android release workflow | Main-HEAD-only and marker-gated in code | Keep disabled until the protected environment holds `ANDROID_RELEASE_SIGNING_READY=protected-main-only` |
| Android signing secrets | Repository-scoped | Move to the protected environment and remove repository scope through an approved external change |
| Branch/ruleset governance | `main` and release unprotected; no rulesets | Add approved protections/rulesets and preserve read-only before/after evidence |

## Required category coverage

| Category | Tracker IDs |
| --- | --- |
| Repository | `REP-*` |
| Staging | `STG-*` |
| Live infrastructure | `LIVE-*` |
| Owner / operations | `OWN-*` |
| Legal | `LEG-*` |
| Privacy | `PRV-*` |
| Clinical | `CLI-*` |
| VAPT | `VAPT-*` |
| Apple | `APL-*` |
| Google | `GGL-*` |
| Vendors | `VEN-*` |
| ISO / ISMS / continuity | `ISO-*` |

## Evidence tracker

| ID | Requirement | Responsible party | Evidence | Location | Status | Severity | Renewal / expiry | Candidate SHA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REP-001` | Exact runtime branch/SHA, docs revision, clean worktree and remote synchronization | Engineering release owner | Git identity, commit inventory and UTC reviewer record | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `REP-002` | Backend lint, unit/integration/migration tests and production dependency audit | Backend/QA | Commands, versions, counts, isolated DB identity and full logs | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `REP-003` | User, admin and counsellor web lint/type/build/audit | Web/QA | Per-workspace logs and artifact checksums | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `REP-004` | Mobile lint/type/contract/config/Doctor/audit | Mobile/QA | Exact-SHA logs, counts and exception register | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `REP-005` | Release/recovery, Mongo identity, tunnel, media, backup, smoke and monitoring tests | Platform/QA | Exact-SHA QA results including expected counts | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `REP-006` | Compose/Caddy/shell syntax and fully interpolated staging configuration | Platform/infrastructure | Exact-SHA local logs plus protected-host redacted render proof | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate/environment | Runtime SHA above |
| `REP-007` | Secret history, pinned Gitleaks, SAST, dependency, SBOM, image, container and config scans | Security | Clean exact-SHA reports, finding treatment and expiry | TBD — restricted security store | NOT COLLECTED | P0 | Each candidate/tool update | Runtime SHA above |
| `REP-008` | Immutable artifacts and deployment workflow governance | Release/security | Candidate image IDs/digests, checksum manifest and read-only CI validation | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `REP-009` | Adversarial workflow regression suite passes after security fixes | Security/release | Pinned workflow-test log and independent review | TBD — restricted security store | NOT COLLECTED | P0 | Each workflow change | Runtime SHA above |
| `REP-010` | Protected `staging-security` environment supports authenticated DAST | `OWNER ACTION`; security | Environment policy, variables/secrets presence and successful run ID | TBD — restricted GitHub evidence | BLOCKED | P0 | Each environment/change | Runtime SHA above |
| `REP-011` | Android signing is protected-environment, main-HEAD-only and marker-gated | `OWNER ACTION`; `GOOGLE ACTION`; security | Environment protection, secret-scope removal and successful guarded run | TBD — restricted GitHub evidence | BLOCKED | P0 | Each signing/environment change | Runtime SHA above |
| `REP-012` | Branch protections/rulesets enforce the approved release policy | `OWNER ACTION`; security/release | Read-only before/after protection and bypass inventory | TBD — restricted GitHub evidence | BLOCKED | P0 | Each governance change | Runtime SHA above |
| `STG-001` | Host/network/domain/database/cache/storage/provider isolation; no production path | `INFRASTRUCTURE ACTION`; privacy custodian | Signed inventories, denied-connectivity proof and two-person review | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each environment/change | Runtime SHA above |
| `STG-002` | Per-variable protected environment review and fail-closed startup validation | Infrastructure/security | Completed matrix and negative/positive validator logs | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each candidate/config change | Runtime SHA above |
| `STG-003` | Guarded approved-PR-head staging deployment with runtime content proven identical to the exact runtime SHA, plus healthy immutable artifacts | Release/infrastructure | Release metadata, ancestry/path-diff record, phase record, images, health and marker proof | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate/deploy | Runtime SHA above |
| `STG-004` | Synthetic-only fixtures, exact staging-domain account emails, first-admin authority and provenance | QA; security; `PRIVACY ACTION` | Target/domain-bound fixture and admin-bootstrap procedure, roster manifest, email-domain review, target proof and no-production-data attestation | TBD — controlled QA store | BLOCKED | P0 | Each fixture set | Runtime SHA above; candidate seed/admin harnesses prohibited |
| `STG-005` | Authentication, session, registration and outbound-recipient isolation QA | QA/security | `FUN-REG-*`, `FUN-AUTH-*`, `FUN-EMAIL-*` and `SEC-EMAIL-*` result pack including zero provider calls for rejected domains | TBD — controlled QA store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `STG-006` | Booking, cancellation, reschedule, pricing, privacy, paid-state and race QA | QA/product/privacy | Requirement map and `FUN-BOOK-*` API/UI/DB/audit evidence | TBD — controlled QA store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `STG-007` | Counsellor verification lifecycle and authorization | QA; `CLINICAL ACTION`; `LEGAL ACTION` | `FUN-KYC-*` transitions and approved policy references | TBD — restricted QA store | NOT COLLECTED | P0 | Each candidate/policy | Runtime SHA above |
| `STG-008` | Calls, chat/WebSocket and role isolation QA | QA/security/clinical | `FUN-CALL-*`, `FUN-CHAT-*` and `FUN-ROLE-*` evidence | TBD — controlled QA store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `STG-009` | Privacy rights, legal hold, retention and file/export QA | QA; privacy/legal | `FUN-PRIV-*`, `FUN-FILE-*` and approved expectations | TBD — restricted privacy store | NOT COLLECTED | P0 | Each candidate/policy | Runtime SHA above |
| `STG-010` | Engineering adversarial security matrix and authenticated DAST | Security/QA | `SEC-*`, DAST run, defects and retests | TBD — restricted security store | BLOCKED | P0 | Each candidate | Runtime SHA above; environment absent |
| `STG-011` | Razorpay order/webhook/refund sandbox integrity | Payment/finance; `VENDOR ACTION` | `PAY-ORD-*`, `PAY-WEB-*`, `PAY-REF-*` reconciliation | TBD — restricted payment store | NOT COLLECTED | P0 | Each candidate/provider config | Runtime SHA above |
| `STG-012` | RazorpayX payout sandbox, dual approval, MFA and reconciliation | Finance/security; `VENDOR ACTION`; `OWNER ACTION` | `PAY-PAYOUT-*` provider/internal evidence | TBD — restricted payment store | NOT COLLECTED | P0 | Each candidate/provider policy | Runtime SHA above |
| `STG-013` | Encrypted backup, cryptographic health, approved off-host transfer/retrieval and isolated restore | Recovery/infrastructure | `REC-001`–`REC-004`, `REC-017`, source/custody/retrieved archive and media digests, signed metadata and invariants | TBD — restricted recovery store | NOT COLLECTED | P0 | Each deploy/approved age | Runtime SHA above |
| `STG-014` | Migration, locks, interruption, rollback/resume and artifact retention | Recovery/release | `REC-005`–`REC-013`, phases, markers, images and invariants | TBD — restricted recovery store | NOT COLLECTED | P0 | Each candidate | Runtime SHA above |
| `STG-015` | Independently target-bound synthetic restore and RPO/RTO drill | Recovery/owner | `REC-014`–`REC-016`, review, acknowledgement and timings | TBD — restricted recovery store | NOT COLLECTED | P0 | Approved recurring exercise | Runtime SHA above |
| `STG-016` | Monitoring targets/probes, all 53 implemented rules, remediation of 20 explicit missing alert rows and sensitive-data logging checks | Infrastructure/security | 14 jobs, 53 implemented rule rows, 20 blocked/missing rows, 26-signal coverage register and canary pack | TBD — restricted monitoring store | BLOCKED | P0 | Each candidate/config change | Runtime SHA above; required alert signals absent |
| `STG-017` | Alertmanager/Uptime Kuma firing, delivery, acknowledgement and resolution | Infrastructure/on-call owner | Controlled real-rule and synthetic receiver-side timestamps | TBD — restricted monitoring store | NOT COLLECTED | P0 | Each route/receiver change | Runtime SHA above |
| `STG-018` | Performance, accessibility and supported-browser results | QA/product | Thresholds, reports and browser/device matrix | TBD — controlled QA store | NOT COLLECTED | P1 | Each material runtime/UI change | Runtime SHA above |
| `LIVE-001` | Target host, network, Tunnel, DNS, TLS and firewall proof | `INFRASTRUCTURE ACTION` | Read-only production evidence without values | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each production change | Runtime SHA above |
| `LIVE-002` | Fresh encrypted off-host backup and isolated DB/media restore | `INFRASTRUCTURE ACTION`; recovery owner | Signed custody, digest, restore and achieved-age evidence | TBD — restricted recovery store | NOT COLLECTED | P0 | Approved schedule/release | Runtime SHA above |
| `LIVE-003` | MongoDB/Redis identity, migrations, invariants and recovery exercise | `INFRASTRUCTURE ACTION`; DBA | Least-privilege, guarded migration and recovery evidence | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each release/exercise | Runtime SHA above |
| `LIVE-004` | Monitoring, human delivery, logging location, retention and retrieval | `INFRASTRUCTURE ACTION`; owner/legal | Targets, receiver, rota, retrieval and retention proof | TBD — restricted operations store | NOT COLLECTED | P0 | Each route/rota change | Runtime SHA above |
| `OWN-001` | Named primary/alternate release, incident, recovery, privacy, payment, vendor and store owners | `OWNER ACTION` | Approved ownership/access/rota record | TBD — governance store | NOT COLLECTED | Governance/P0 | Quarterly/on change | Runtime SHA above |
| `OWN-002` | Refund, cancellation, reschedule, promotion, payout and reconciliation policies | `OWNER ACTION`; finance | Approved versioned decisions and configuration mapping | TBD — governance store | NOT COLLECTED | Governance/P0 | Policy review date | Runtime SHA above |
| `OWN-003` | RPO/RTO, off-site backup, key custody, BCM and residual launch risk | `OWNER ACTION` | Signed objectives, exercises and risk decisions | TBD — governance store | NOT COLLECTED | Governance/P0 | Annual/after change | Runtime SHA above |
| `LEG-001` | Qualified Indian legal review of notices, rights, retention, transfers and processors | `LEGAL ACTION` | Versioned counsel approval and issue register | TBD — restricted legal store | NOT COLLECTED | Governance/P0 | Legal review/change | Runtime SHA above |
| `LEG-002` | Minors, SPDI, mental-health, biometric, CERT-In and logging obligations | `LEGAL ACTION` | Approved legal position and operating requirements | TBD — restricted legal store | NOT COLLECTED | Governance/P0 | Regulatory change | Runtime SHA above |
| `PRV-001` | Data map, minimization, consent, rights identity/delivery and grievance process | `PRIVACY ACTION` | Approved DPIA/data flow/notices and staged cases | TBD — restricted privacy store | NOT COLLECTED | Governance/P0 | Annual/material change | Runtime SHA above |
| `PRV-002` | Retention, legal hold, backup/log/vendor propagation and deletion disposition | `PRIVACY ACTION`; `LEGAL ACTION`; owner | Approved schedule and disposition evidence | TBD — restricted privacy store | NOT COLLECTED | Governance/P0 | Schedule/material change | Runtime SHA above |
| `CLI-001` | Counsellor qualification, reviewer, renewal, rejection and suspension lifecycle | `CLINICAL ACTION`; `LEGAL ACTION` | Approved clinical policy and operating sample | TBD — restricted clinical store | NOT COLLECTED | Governance/P0 | Credential/policy cycle | Runtime SHA above |
| `CLI-002` | Minors, clinical-record boundary, crisis, continuity and remote-call safety | `CLINICAL ACTION`; `LEGAL ACTION` | Approved protocols, training and rehearsal | TBD — restricted clinical store | NOT COLLECTED | Governance/P0 | Annual/incident/change | Runtime SHA above |
| `VAPT-001` | Signed independent scope/rules for the immutable staging candidate | `VAPT ACTION`; security owner | Targets, testers, window and data-handling scope | TBD — restricted VAPT store | NOT COLLECTED | P0 | Each assessment/candidate | Runtime SHA above |
| `VAPT-002` | Independent report and critical/high closure retest | `VAPT ACTION` | Findings, remediation, retest and residual treatment | TBD — restricted VAPT store | NOT COLLECTED | P0 | Each remediation | Runtime SHA above |
| `APL-001` | Apple ownership, signing, entitlements, associations and declarations | `APPLE ACTION` | Account/role, profile, associations and privacy proof | TBD — restricted store evidence | NOT COLLECTED | P0 | Each build/declaration change | Runtime SHA above |
| `APL-002` | Exact-candidate iOS archive, physical devices and TestFlight review | `APPLE ACTION`; mobile QA | Build ID/checksum, device matrix and reviewer evidence | TBD — restricted store evidence | NOT COLLECTED | P0 | Each candidate build | Runtime SHA above |
| `GGL-001` | Google ownership, Play signing/upload key, asset links and declarations | `GOOGLE ACTION` | Account/role/key, external-link and declaration proof | TBD — restricted store evidence | BLOCKED | P0 | Each account/build change | Runtime SHA above; protected signing environment absent |
| `GGL-002` | Exact-main-HEAD signed internal-track Android build and device review | `GOOGLE ACTION`; mobile QA | Guarded run, build ID/checksum, track and devices | TBD — restricted store evidence | BLOCKED | P0 | Each candidate build | Runtime SHA above; signing disabled |
| `VEN-001` | Enabled-provider ownership, MFA, contracts, location, subprocessors and assurance | `VENDOR ACTION`; legal/privacy | Provider-by-provider approved assurance pack | TBD — restricted vendor store | NOT COLLECTED | Governance/P0 | Annual/provider change | Runtime SHA above |
| `VEN-002` | Callback, quota, failure, incident, retention, deletion, export and exit tests | `VENDOR ACTION`; service owners | Sandbox cases and provider/exit records | TBD — restricted vendor store | NOT COLLECTED | P0 | Each integration change | Runtime SHA above |
| `ISO-001` | ISO/IEC 27001:2022 and ISO/IEC 27701:2025 scoped maps | Owner/security/privacy | Scope, control map, risks, audit and review | TBD — governance/ISMS store | NOT COLLECTED | Governance/P1 | ISMS cycle | Runtime SHA above |
| `ISO-002` | ISO 27799:2025 health-information security evidence | Clinical/security/privacy | Health-data controls, risk and operating records | TBD — governance/ISMS store | NOT COLLECTED | Governance/P1 | ISMS/clinical cycle | Runtime SHA above |
| `ISO-003` | ISO 22301 and ISO/IEC 27031 continuity/readiness evidence | Owner/infrastructure/recovery | BIA, RPO/RTO, strategies and exercises | TBD — BCM/ISMS store | NOT COLLECTED | Governance/P1 | Annual/after exercise | Runtime SHA above |
| `ISO-004` | ISO/IEC 27017 and ISO/IEC 27018 cloud/privacy evidence where applicable | Security/privacy/vendor owners | Shared-responsibility and cloud-processor evidence | TBD — governance/vendor store | NOT COLLECTED | Governance/P1 | Annual/provider change | Runtime SHA above |

## Review and integrity

For each immutable artifact, record an approved SHA-256 digest, UTC creation
time, collector, reviewer and access classification. Do not hash low-entropy
secrets as a storage substitute. The
[staging go/no-go record](./12-staging-go-no-go.md) cannot advance while a
required P0 is `NOT COLLECTED`, `FAIL`, `BLOCKED`, `SKIPPED` or `INVALIDATED`.

This tracker does not claim ISO certification, legal compliance, clinical
suitability, store acceptance or public-production readiness.
