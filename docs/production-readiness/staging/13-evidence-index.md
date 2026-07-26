# Unified production-readiness evidence index

Runtime candidate SHA: `25cd808602020988a09ee9e58cc9d4738cc068c9`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Tracker state: **successor runtime SHA frozen; exact push gates and local
overlay checks collected; server/external execution evidence not collected**

The authoritative co-host architecture, read-only discovery and Step A–G
approval sequence is
[runbook 29](../29-server-staging-design-and-discovery-runbook.md). Until its
server evidence is returned, all `STG-*`/`LIVE-*` server rows remain
`NOT COLLECTED` or explicitly blocked.

This is the single tracker for repository, staging, live, governance and
external evidence. Artifacts belong in an approved access-controlled store,
not Git. References must never expose credentials, tokens, production data,
personal or clinical data, signing material, or restricted VAPT detail.

The runtime SHA identifies the reviewed code, configuration and artifact
content. The docs/PR-head revision identifies the later evidence-package
commit. Do not relabel runtime, VAPT or mobile-build evidence: bind the later
head to this package only with recorded ancestry and a diff confined to
`docs/**` or `menorah/docs/**`. Server checkout, deployment and release
scripts, image digests/manifests, markers and arguments remain bound to the
exact runtime SHA; the later documentation head is never an executable
substitute.

## Field and status rules

- `ID` is stable and unique.
- `Requirement` is an objectively testable claim or required decision.
- `Responsible party` names the accountable role and action label.
- `Evidence` states the required artifact, UTC time and reviewer.
- `Location` is a controlled reference, never a secret-bearing URL.
- `Status` is `NOT COLLECTED`, `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`,
  `SKIPPED`, `INVALIDATED` or approved `NOT APPLICABLE`. A qualified
  `PASS LOCALLY`, `PASS FOR REPOSITORY SCOPE` or
  `PASS FOR AUTOMATED/TRACKED SCOPE` is permitted only when the row names the
  exact proved scope and leaves every external remainder explicit.
- `Severity` is `P0`, `P1` or governance scope.
- `Renewal / expiry` is the rerun or review interval.
- `Candidate SHA` refers to the runtime SHA at the top of this file.

`PASS` requires accessible evidence reviewed by the responsible party. Local
console observations are useful diagnostics but are not durable candidate
evidence. A skipped, failed, blocked or uncollected P0 prevents go-live. When
runtime code, configuration or artifacts change, retain old evidence, mark
affected rows `INVALIDATED` and rerun them for the new SHA.

## Current candidate-bound repository observation log

Runtime SHA `25cd808602020988a09ee9e58cc9d4738cc068c9` has these exact
successful push executions:

| Workflow | Exact run | Jobs | Steps | Failed / skipped / cancelled |
| --- | --- | --- | --- | --- |
| Production release readiness | [30209920365](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920365) | 1/1 | 11/11 | 0 / 0 / 0 |
| Functional release validation | [30209920383](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920383) | 9/9 | 89/89 | 0 / 0 / 0 |
| Security gates | [30209920358](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920358) | 15/15 | 104/104 | 0 / 0 / 0 |

The superseded runtime's local server-staging overlay completed Phase 11 with 22/22 gates passed,
0 failed and 0 blocked. Its all-profile static model has 32 services, six
networks, 21 volumes and 117 published-port instances, all loopback-bound,
with 10 exact ingress hosts, 20 P0 alert mappings and zero static collisions.
The default service graph references 19 volumes. After the required
migration/seed lifecycle, the retained runtime had 26 containers (22 healthy
and four expected successful one-shots), five networks, 20 volumes including
`staging-migration-temp`, and zero restarts. Recovery/all-profile adds the
restore network and `staging-restore-mongodb` for six networks and 21 volumes.

The authoritative environment artifacts are the 268-assignment-key tracked
template and its 291-key generated validation environment. Both runtime-SHA
keys resolved to `25cd808602020988a09ee9e58cc9d4738cc068c9`. Release contracts
passed 432/432 (81 workflow, 59 local-staging and 292 server-staging);
pinned recovery passed 34/34, Bash syntax 48/48, actionlint 6/6 and ShellCheck
23/23. Backend evidence passed 117 suites / 1,716 tests plus 13 disposable
integration suites / 45 tests; API smoke passed 31/31 and Playwright 9/9.
Mobile payment policy passed 7/7, release/configuration 21/21 and Doctor 19/19.

The quiesced backup `20260725T125008Z` restored 18 collections / 59 documents
with zero failures and all six writers returned to their prior running state.
Monitoring ended with 35/35 targets healthy across 14 jobs, 69 loaded rules,
26 coverage records, all 20 P0 fixtures fired/resolved and pre/post alert state
quiet. The server overlay has no production Docker metrics gateway/exporter
pair and no Uptime Kuma; those remain separate production evidence gaps.

That local exercise is historical; the current correction's focused discovery
regressions, 293-test contract, Bash syntax and pinned ShellCheck are recorded
in [the immutable candidate record](../26-immutable-candidate-record.md).
Exact local synthetic evidence belongs in [report 28](../28-local-staging-validation-report.md). These workflow and
local-Docker results do not convert approved Ubuntu/server staging, live,
provider, physical-device, VAPT, governance or external-review rows to `PASS`.

Runtime `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` and its push runs
`30069836961`, `30069836968`, `30069836976` and pull-request runs
`30069839620`, `30069839619`, `30069839629` are retained as historical
successful observations. They are **SUPERSEDED/INVALIDATED** for the current
candidate and must not be relabelled.

The successful run sets for superseded runtime
`48fb83c248b0e969e699433a8bacdd276ed4311d`, documentation head
`2f2c6e45608300a05443aa7a95d2fd4513e28b71`, Caddy reaper runtime
`a9ea55ea85ab3bd91e68797256e0b8fc9f677966`, and monitoring-visibility
runtime `fbf2de8c5bb3e50e41fcaa6bc75f739cfdc0aca2` are retained in the
immutable candidate record. They are **INVALIDATED** for the current runtime:
the reaper fix superseded `48fb83`, monitoring visibility superseded `a9ea55`,
and proxy-log readability superseded `fbf2de8`.

## Historical repository observation log

The following durable GitHub runs checked out historical runtime SHA
`3fb99858c6766a341bb7b7dab2377195427f0ea1` exactly. They are retained for
traceability and are **INVALIDATED** for
`25cd808602020988a09ee9e58cc9d4738cc068c9`. Repository
evidence does not convert any staging, live or governance row to `PASS`.

| Evidence | Exact result | Current tracker treatment |
| --- | --- | --- |
| [Production Release Readiness 30051102484](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102484) | PASS at historical SHA: workflow/release invariants, production Compose and shell syntax | **INVALIDATED** for current `REP-005`, `REP-006`, `REP-008` and `REP-009` |
| [Functional release validation 30051102471](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102471) | PASS at historical SHA: all 9 jobs including aggregate | **INVALIDATED** for current `REP-002` through `REP-006` and `REP-009` |
| Backend default | PASS at historical SHA: 112/112 suites; 1,426/1,426 tests; lint and production audit pass | **INVALIDATED** for the current candidate; retained only for traceability |
| Backend disposable integration | PASS at historical SHA: 13/13 suites; 45/45 tests against disposable MongoDB/Redis | **INVALIDATED** for the current candidate; retained only for traceability |
| User/admin/counsellor web | PASS at historical SHA: all three lint/type/build/audit jobs | **INVALIDATED** for the current candidate; warnings retained in the historical record |
| Mobile | PASS at historical SHA: lint/type, 20/20 contracts, 19/19 Doctor and dependency policy | **INVALIDATED** for the current candidate; historical exception expires 2026-10-31 |
| Release/infrastructure | PASS at historical SHA: 159 TAP tests plus Compose, Caddy, clean archive, Bash and pinned ShellCheck | **INVALIDATED** for the current candidate; retained only for traceability |
| Monitoring | PASS at historical SHA: 14 scrape jobs, 69 alerts and 26 records; all 20 P0 mappings validate | **INVALIDATED** for the current candidate; current local evidence is in report 28 |
| [Security gates 30051102473 attempt 2](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102473) | PASS at historical SHA: all 15 jobs including aggregate | **INVALIDATED** for the current candidate; current security runs are recorded above |
| Security attempt 1 | Backend base-image metadata request timed out before build | Same-SHA failed-job retry passed; retained as a warning, not hidden |
| Documentation HEAD | Exact draft-PR head; runtime-to-head path diff must satisfy the documentation allowlist | Recorded externally because a commit cannot embed its own SHA |

## Current external governance snapshot

Read-only review found both required GitHub environments absent, `main` and
the release branch without branch protection, no repository rulesets, and
Android signing secrets at repository scope. These are release blockers, not
authorizations to mutate GitHub configuration.

| Control | Current state | Required external action |
| --- | --- | --- |
| `staging-security` environment | Absent; read-only lookup returned `404 Not Found` | `OWNER ACTION` creates and protects it before DAST variables/secrets or a run |
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
| `REP-001` | Exact runtime branch/SHA, docs revision, clean worktree and remote synchronization | Engineering release owner | Git identity, commit inventory and UTC reviewer record | Runtime identity is frozen; final docs HEAD is recorded externally in draft PR #2 | PARTIAL | P0 | Each candidate | `25cd808602020988a09ee9e58cc9d4738cc068c9` |
| `REP-002` | Backend lint, unit/integration/migration tests and production dependency audit | Backend/QA | Commands, versions, counts, isolated DB identity and full logs | [Exact functional push run 30209920383](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920383): 117 suites / 1,716 tests plus 13 / 45 disposable integration; local limitations in report 28 | PASS | P0 | Each candidate | Runtime SHA above |
| `REP-003` | User, admin and counsellor web lint/type/build/audit | Web/QA | Per-workspace logs and artifact checksums | Exact functional push run 30209920383 | PASS | P0 | Each candidate | Runtime SHA above |
| `REP-004` | Mobile lint/type/contract/config/Doctor/audit | Mobile/QA | Exact-SHA logs, counts and exception register | [Exact functional push run 30209920383](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920383): payment 7/7, release/config 21/21, Doctor 19/19; physical-device evidence remains open | PASS | P0 | Each candidate | Runtime SHA above |
| `REP-005` | Release/recovery, Mongo identity, tunnel, media, backup, smoke and monitoring tests | Platform/QA | Exact-SHA QA results including expected counts | [Exact functional push run 30209920383](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920383) plus candidate-bound local report 28; exact local counts are recorded above | PASS LOCALLY | P0 | Each candidate | Runtime SHA above |
| `REP-006` | Repository Compose/Caddy/clean-checkout/shell validation | Platform/infrastructure | Exact-SHA tracked-fixture render, Caddy and shell logs | [Exact release-readiness run 30209920365](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920365), [functional run 30209920383](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920383) and local report 28 | PASS LOCALLY | P0 | Each candidate | Runtime SHA above; server discovery/render remain `STG-002`/`STG-003` |
| `REP-007` | Secret history, pinned Gitleaks, SAST, dependency, SBOM, image, container and config scans | Security | Clean exact-SHA reports, finding treatment and expiry | [Exact security push run 30209920358](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920358); tracked-tree local evidence in report 28 | PASS FOR AUTOMATED/TRACKED SCOPE | P0 | Each candidate/tool update | Runtime SHA above; independent full-history review and VAPT remain open |
| `REP-008` | Read-only deployment workflow and fail-closed legacy-path governance | Release/security | Workflow validation, tombstone tests and immutable candidate record | Exact release-readiness run 30209920365, functional run 30209920383 and immutable candidate record | PASS FOR REPOSITORY SCOPE | P0 | Each candidate | Runtime SHA above |
| `REP-009` | Adversarial workflow regression suite passes after security fixes | Security/release | Pinned workflow-test log | Candidate-bound local suite and exact release/functional push runs pass; see report 28 for counts | PASS | P0 | Each workflow change | Runtime SHA above |
| `REP-010` | Protected `staging-security` environment supports authenticated DAST | `OWNER ACTION`; security | Environment policy, variables/secrets presence and successful run ID | TBD — restricted GitHub evidence | BLOCKED | P0 | Each environment/change | Runtime SHA above |
| `REP-011` | Android signing is protected-environment, main-HEAD-only and marker-gated | `OWNER ACTION`; `GOOGLE ACTION`; security | Environment protection, secret-scope removal and successful guarded run | TBD — restricted GitHub evidence | BLOCKED | P0 | Each signing/environment change | Runtime SHA above |
| `REP-012` | Branch protections/rulesets enforce the approved release policy | `OWNER ACTION`; security/release | Read-only before/after protection and bypass inventory | TBD — restricted GitHub evidence | BLOCKED | P0 | Each governance change | Runtime SHA above |
| `STG-001` | Host/network/domain/database/cache/storage/provider isolation; no production path | `INFRASTRUCTURE ACTION`; privacy custodian | Signed inventories, denied-connectivity proof and two-person review | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each environment/change | Runtime SHA above |
| `STG-002` | Protected 268-key template review, 291-key generated environment and fail-closed startup validation | Infrastructure/security | Selected mapping/provenance matrix plus negative/positive validator logs | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each candidate/config change | Runtime SHA above |
| `STG-003` | Guarded exact-runtime-SHA staging deployment with separately recorded documentation head and healthy immutable artifacts | Release/infrastructure | Release metadata, exact checkout/script/image binding, phase record, health and marker proof | TBD — controlled evidence store | NOT COLLECTED | P0 | Each candidate/deploy | Runtime SHA above |
| `STG-004` | Synthetic-only fixtures, exact staging-domain account emails, first-admin authority and provenance | QA; security; `PRIVACY ACTION` | Target/domain-bound fixture and admin-bootstrap procedure, roster manifest, email-domain review, target proof and no-production-data attestation | TBD — controlled QA store | NOT COLLECTED | P0 | Each fixture set | Runtime SHA above; local seed produced 10 users, three counsellors and two applications (15 records) and proved duplicate refusal, but does not prove server execution or governance |
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
| `STG-016` | Exactly 35 monitoring targets/probes across 14 jobs, all 69 implemented rules, 26 coverage records, all 20 required P0 alert mappings and sensitive-data logging checks | Infrastructure/security | Target inventory, loaded-rule/coverage output, controlled canary pack and pre/post quiet state | TBD — restricted monitoring store | NOT COLLECTED | P0 | Each candidate/config change | Runtime SHA above; repository and local-Docker proof complete for report 28's scope, approved Ubuntu/server-staging proof absent |
| `STG-017` | Alertmanager firing, protected delivery, human acknowledgement and resolution | Infrastructure/on-call owner | Controlled real-rule and synthetic receiver-side timestamps | TBD — restricted monitoring store | NOT COLLECTED | P0 | Each route/receiver change | Runtime SHA above; server overlay has no Uptime Kuma |
| `STG-018` | Performance, accessibility and supported-browser results | QA/product | Thresholds, reports and browser/device matrix | TBD — controlled QA store | NOT COLLECTED | P1 | Each material runtime/UI change | Runtime SHA above |
| `LIVE-001` | Target host, network, Tunnel, DNS, TLS and firewall proof | `INFRASTRUCTURE ACTION` | Read-only production evidence without values | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each production change | Runtime SHA above |
| `LIVE-002` | Fresh encrypted off-host backup and isolated DB/media restore | `INFRASTRUCTURE ACTION`; recovery owner | Signed custody, digest, restore and achieved-age evidence | TBD — restricted recovery store | NOT COLLECTED | P0 | Approved schedule/release | Runtime SHA above |
| `LIVE-003` | MongoDB/Redis identity, migrations, invariants and recovery exercise | `INFRASTRUCTURE ACTION`; DBA | Least-privilege, guarded migration and recovery evidence | TBD — restricted infrastructure store | NOT COLLECTED | P0 | Each release/exercise | Runtime SHA above |
| `LIVE-004` | Production monitoring, including Docker metrics gateway/exporter, Uptime Kuma, human delivery, logging location, retention and retrieval | `INFRASTRUCTURE ACTION`; owner/legal | Production targets, gateway boundary, Kuma monitors, receiver, rota, retrieval and retention proof | TBD — restricted operations store | NOT COLLECTED | P0 | Each route/rota change | Runtime SHA above; not supplied by server-staging overlay |
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
