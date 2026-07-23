# VAPT scope and evidence

Runtime candidate SHA: `4c82121bfa2293a21a831bc490f4101eb4db1213`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Required action: `VAPT ACTION`

Initial state: **not commissioned / not run**

Independent VAPT must assess the immutable candidate deployed to the approved
isolated staging environment. Repository tests, automated scanners and an
internal review are supporting evidence; they do not replace independent
assessment.

## Authorization and rules of engagement

Before testing, obtain a signed rules-of-engagement record containing:

- assessor organization and named testers;
- Menorah security owner, technical contact and 24-hour stop contact;
- exact candidate SHA/build IDs and staging host/domain/IP inventory;
- start/end UTC window, time zone and permitted source IPs;
- permitted techniques, request-rate/concurrency ceilings and test accounts;
- explicit exclusions and third-party/provider boundaries;
- data handling, encryption, evidence access, retention and deletion;
- critical-finding notification time and incident escalation;
- safe account/data reset and provider-test-mode constraints; and
- written confirmation that production, real users/data, denial-of-service,
  social engineering and provider infrastructure are out of scope unless
  separately authorized.

Stop on unexpected real data, production routing, material instability,
third-party impact or evidence of active compromise. Follow
[the incident runbook](../11-incident-response-runbook.md); do not continue
merely because a test window remains.

## In-scope target matrix

| Surface | Required scope | Accounts / fixtures | Key exclusions |
| --- | --- | --- | --- |
| Public web | Landing, user, counsellor and admin staging domains; headers, sessions, links, files | Anonymous plus synthetic user/counsellor/admin roles | No production domains |
| APIs | iOS, Android, web and admin APIs; REST, uploads, exports and error handling | All aliases from staging roster | No production API or real object IDs |
| Authentication | Password, reset/verification, enabled social login, refresh, logout, MFA and revocation | User/admin/counsellor, suspended/deleted/revoked states | No credential stuffing |
| Authorization | Horizontal/vertical/object/field authorization and least-privilege admin roles | User A/B, counsellor A/B, support/finance/content/full admin | No real staff accounts |
| Booking/payment | Catalog, acceptance races, sandbox order/webhook/refund/payout/reconciliation | Synthetic bookings and provider test IDs | No live mode, real instrument or beneficiary |
| Realtime | Socket.IO/chat, call tickets, LiveKit/fallback authorization and replay | Synthetic assigned/wrong participants | No provider-wide or other-tenant testing |
| Privacy/KYC | Consent, rights cases, legal hold, retention controls, counsellor lifecycle and face-check gate | Synthetic content/media only | No real health/biometric data |
| SSRF/media | Social Studio fetch, DNS/redirect controls, upload/file/media paths | QA-owned responder and fixtures | No scanning arbitrary third parties/cloud metadata |
| Mobile Android | Exact signed internal candidate, storage, transport, links, notifications and screen capture | Test devices/accounts | No production Play build |
| Mobile iOS | Exact archive/TestFlight candidate, storage, transport, links, notifications and screen capture | Test devices/accounts | No production App Store build |
| Infrastructure | External staging perimeter, TLS/Caddy/Tunnel, exposed ports, containers and monitoring access | Approved staging IPs only | Host exploitation beyond agreed proof; no production/shared provider edge |
| Supply chain/config | Candidate artifacts, dependencies, images, client bundles, secret/config exposure | Candidate source/artifacts | No destructive registry/provider activity |

## Required test themes

At minimum cover:

- OWASP web/API/mobile categories and business-logic abuse;
- token audience/type isolation, session lifecycle, refresh replay and MFA;
- user/counsellor horizontal isolation and admin least privilege;
- unassigned-booking data minimization and atomic paid-state acceptance;
- price, currency, promotion, order, webhook, refund and payout integrity;
- file/export/search/object authorization and signed URL behavior;
- WebSocket connection/join reauthorization and call ticket replay/timing;
- SSRF through scheme, address, DNS rebinding, redirect, timeout, size and type;
- upload/media traversal, content validation and unauthorized access;
- consent/rights/legal-hold/retention authorization and audit evidence;
- sensitive-data exposure in errors, logs, metrics, push, local storage,
  clipboard and app-switcher;
- CORS, CSRF/session origins, proxy trust, TLS, headers and rate limits;
- database/cache/dashboard/metrics exposure and container/network boundaries;
- dependency, secret, artifact and image provenance; and
- detection coverage for agreed authentication, authorization, audit,
  payment and infrastructure cases without sensitive-data leakage.

Use [staging security QA](./06-staging-security-qa.md) as a regression input,
not as a limit on independent testing.

## Finding record

Every finding must include:

- unique ID, title, affected target/build and candidate SHA;
- discovery/retest UTC times and assessor;
- precondition, role and synthetic object;
- minimal reproducible steps and redacted request/response evidence;
- observed impact and affected confidentiality/integrity/availability;
- severity methodology, vector and rationale;
- safe remediation recommendation and compensating control;
- responsible owner, target date, status and linked defect/change SHA; and
- closure retest steps, result and evidence reference.

Keep exploit material and sensitive technical details in the restricted VAPT
store, not Git or general tickets. Screenshots must not contain credentials,
tokens, personal/clinical data or provider secrets.

## Severity and release treatment

| Severity | Minimum treatment | Staging/public-launch effect |
| --- | --- | --- |
| Critical | Immediate notification/incident assessment, remediation and independent closure retest | Absolute no-go |
| High | Remediate and independently retest closure | No-go |
| Medium | Named owner, remediation/treatment, deadline and explicit security/owner risk decision | Open unless formally treated; may block by impact |
| Low/informational | Triage, owner and planned disposition | Track; cannot mask a higher systemic issue |

Risk acceptance cannot be authored by the assessor alone. It requires the
accountable security and `OWNER ACTION` approvers, and legal/privacy/clinical
approval where their risk is affected. Critical/high findings cannot be waived
for public launch under this plan.

## Retest and candidate binding

Remediation changes the candidate SHA. The assessor must review the diff,
confirm the new immutable staging build, retest every affected finding and
perform agreed regression around the changed boundary. A report for
`4c82121bfa2293a21a831bc490f4101eb4db1213` cannot be relabelled for a later
runtime SHA.

## Required deliverables

- Signed scope/rules of engagement and target inventory.
- Tool/technique inventory and testing timeline.
- Executive and restricted technical reports bound to the candidate.
- Complete finding register, including zero critical/high only if evidenced.
- Immediate-notification/incident records where applicable.
- Remediation diffs and independent closure-retest report.
- Residual-risk decisions with owners and expiry.
- Assessor evidence-destruction confirmation at the approved date.

Record only controlled references in
[13-evidence-index.md](./13-evidence-index.md). VAPT is complete only when all
critical/high findings are independently closed and every residual finding has
an approved treatment.
