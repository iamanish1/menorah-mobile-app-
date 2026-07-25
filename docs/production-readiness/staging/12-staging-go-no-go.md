# Staging go/no-go record

Runtime candidate SHA: `1ecd0b379369258be466159364a8a48c79fb65aa`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Approved Ubuntu/server staging decision: **NO-GO — server evidence not yet
collected**. Local Docker validation passed with explicit gaps/blocks and does
not change this server decision.

Current runtime-candidate push gates are green:
[release readiness](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30158172303)
(1/1 jobs, 11/11 steps),
[functional](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30158172290)
(9/9 jobs, 89/89 steps), and
[security](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30158172293)
(15/15 jobs, 104/104 steps), with zero failed, skipped or cancelled
jobs/steps. Local overlay Phase 11 passed 22/22, with 0 failed and 0 blocked.
Release-contract validation passed 432/432 assertions: 81 workflow,
59 local-staging and 292 server-staging. The
[server-staging design and discovery runbook](../29-server-staging-design-and-discovery-runbook.md)
remains unexecuted with status
**SERVER STAGING DESIGN COMPLETE — DISCOVERY REQUIRED**.

Public-production verdict: **NOT READY**

A later docs/PR head is review identity only and must be a docs-only descendant
of the frozen runtime. The server checkout, script blob, images, image
manifest, release/recovery markers and deployment arguments must all bind to
exact runtime SHA `1ecd0b379369258be466159364a8a48c79fb65aa`; the docs head
must never be substituted into either runtime-SHA environment key.

A future staging pass means only that this immutable candidate completed the
approved staging gates. It does not authorize production, a limited pilot,
store submission or public launch. Production remains governed by
[21-production-go-no-go.md](../21-production-go-no-go.md).

## Confirmed current blockers

- Read-only server discovery has not been returned; port, network/CIDR, volume,
  filesystem, database/cache, ingress, process-authority and production
  collision rows remain **NOT COLLECTED**.
- DNS, TLS, Caddy, Cloudflare Tunnel, dedicated secrets and real
  provider-sandbox accounts/callbacks remain **NOT COLLECTED**.
- The required `staging-security` GitHub environment is absent, so
  authenticated DAST is blocked.
- The required `android-release-signing` GitHub environment and protected
  `ANDROID_RELEASE_SIGNING_READY=protected-main-only` marker are absent;
  signing secrets remain repository-scoped and Android release signing is
  blocked.
- `main` and the release branch have no branch protection and the repository
  has no rulesets.
- Approved Ubuntu staging, independent VAPT, physical-device/store,
  real-provider and governance evidence is not collected. Named ownership,
  legal/privacy, clinical, Apple, Google and ISO/BCM actions remain open. The
  local Docker evidence remains recorded separately in report 28.

These findings require approved external owner/security actions. This package
does not authorize creating environments, moving secrets, changing repository
protection, mutating providers or deploying production.

## Meeting record

Complete in the controlled decision record:

| Field | Record |
| --- | --- |
| Runtime candidate branch/SHA | `release/final-production-readiness` / `1ecd0b379369258be466159364a8a48c79fb65aa` |
| Docs/PR-head revision | Record the final full `git rev-parse HEAD` externally after the package commit; it cannot be embedded in its own content-addressed commit |
| Meeting UTC time | TBD |
| Change/evidence-pack reference | TBD |
| Staging host/environment ID | TBD; non-secret reference only |
| Chair / recorder | TBD |
| Engineering, QA, infrastructure, security attendees | TBD |
| Owner, legal, privacy, clinical, VAPT, vendor, Apple/Google attendees | TBD or explicitly absent/blocking |
| Open incident/defect/risk references | TBD |
| Decision and conditions | NO-GO until completed below |

Silence, absence, a template, or a verbal assurance is not approval.

## Mandatory gate matrix

| Gate | Minimum evidence | Accountable decision | Current status |
| --- | --- | --- | --- |
| Candidate freeze | Clean/synchronized exact SHA, reviewed commit scope, immutable artifact provenance | Engineering release owner | LOCAL PASS / INDEPENDENT REVIEW REQUIRED / NO-GO |
| Repository checks | Backend/web/admin/counsellor/mobile lint, type, tests, builds, audits; production QA; Compose/Caddy/shell; scans | Engineering + QA + security | THREE EXACT PUSH WORKFLOWS PASS (25/25 JOBS, 204/204 STEPS, ZERO FAILED/SKIPPED/CANCELED); SERVER STAGING STILL NO-GO |
| Staging isolation | Dedicated host/network/domains/Mongo/Redis/storage/providers/alerts; 268-key template and 291-key generated environment validate; six-network all-profile/default-five boundary; no production route/data/credential | `INFRASTRUCTURE ACTION`; QA data custodian | LOCAL PHASE 11: 22/22 PASS; STATIC 32 SERVICES / 6 NETWORKS / 21 VOLUMES / 117 LOOPBACK PORT INSTANCES; DEFAULT 26 CONTAINERS / 5 NETWORKS / 20 VOLUMES; SERVER DISCOVERY/COLLISION REVIEW NOT COLLECTED / NO-GO |
| Guarded deployment | Exact-SHA release record, image manifest, health and marker consistency | Engineering + infrastructure | OPEN / NO-GO |
| Functional QA | All P0 auth, booking, KYC, chat/call, privacy and role cases pass; P1 disposition recorded | QA/product owners | CURRENT AUTOMATION: BACKEND 117 SUITES / 1,716 TESTS + INTEGRATION 13 / 45; API 31/31; PLAYWRIGHT 9/9. SUPERSEDED `0b9f6e4` MATRIX REMAINS HISTORICAL; CURRENT SERVER EXECUTION NOT COLLECTED / NO-GO |
| Security QA | All P0 adversarial cases pass; outbound email is exact staging-domain-only; no secret/PII leakage; scan findings treated | Security owner | EXACT SECURITY PUSH RUN 15/15 JOBS / 104/104 STEPS; FULL SERVER/DAST/INDEPENDENT COVERAGE OPEN / NO-GO |
| Payments/providers | Sandbox order/webhook/refund/payout/reconciliation passes; each enabled provider pack complete | Payment/finance + `VENDOR ACTION` | LOCAL STUBS ONLY; REAL SANDBOX/DUAL-CONTROL OPEN / NO-GO |
| Recovery | Encrypted signed backup, isolated restore, migration, interruption, rollback/resume, media and RPO/RTO rehearsal | Database/recovery + infrastructure | LOCAL BACKUP `20260725T125008Z`: 18 COLLECTIONS / 59 DOCUMENTS / 0 FAILURES; SIX WRITERS RESTARTED; UBUNTU/OFF-SITE/INTERRUPTION CASES OPEN / NO-GO |
| Monitoring | Exactly 35 targets across 14 jobs, 69 loaded rules, 26 coverage records, all 20 required P0 fixtures, controlled delivery/ack/resolved and logging; production Docker telemetry/Kuma tracked separately | Infrastructure + on-call owner | LOCAL 35/35 TARGETS HEALTHY; 20/20 FIRED/RESOLVED; PRE/POST QUIET. PROTECTED RECEIVER/UBUNTU STAGING AND SEPARATE PRODUCTION DOCKER/KUMA EVIDENCE OPEN / NO-GO |
| Mobile/store preflight | Repository checks, signed candidate builds, physical devices, links, declarations and account ownership | `APPLE ACTION`; `GOOGLE ACTION` | AUTOMATION: PAYMENT 7/7, RELEASE/CONFIG 21/21, DOCTOR 19/19; SIGNED BUILD/DEVICE/STORE EVIDENCE OPEN / NO-GO |
| Independent VAPT | Immutable staging assessment and critical/high closure retest; residual treatments approved | `VAPT ACTION`; security owner | OPEN / NO-GO |
| Owner/operations | Named primaries/alternates; product/finance/RPO/RTO/pilot/risk decisions | `OWNER ACTION` | OPEN / NO-GO |
| Legal/privacy | Notices, purposes, consent/rights, retention/holds, minors, biometrics/health, vendor/transfer and incident obligations | `LEGAL ACTION`; `PRIVACY ACTION` | OPEN / NO-GO |
| Clinical | Qualification lifecycle, minors, crisis/emergency, records, continuity, face check and remote-call safety | `CLINICAL ACTION` | OPEN / NO-GO |
| Vendor assurance | Ownership, MFA/access, contracts/DPA, locations/subprocessors, incident, retention/deletion/export and exit for every enabled provider | `VENDOR ACTION` | OPEN / NO-GO |
| ISO/BCM evidence | Control ownership, risk treatment, audit/management review, backup/continuity exercises without compliance claim | `OWNER ACTION`; control owners | OPEN / NO-GO |
| Unified evidence | Every gate links complete, access-controlled, reviewable evidence with renewal/expiry and candidate SHA | QA lead + release owner | OPEN / NO-GO |

The [unified evidence index](./13-evidence-index.md) is the decision inventory.
A link must be accessible to the approver and must support the claimed result.

## Automatic no-go conditions

- Candidate SHA, lockfile, deployment config, migration, native project or
  provider callback changes without invalidation/rerun.
- Any P0 failure, skip, missing evidence, unresolved contradiction or unknown
  environment boundary.
- Any production data/credential/endpoint or provider live mode in staging.
- Any synthetic account or outbound email recipient outside the protected
  staging email domain, or any rejected recipient that reaches the provider.
- Dedicated exact-target/domain-bound server seed/admin execution evidence is
  not collected; generic seed/admin harnesses remain prohibited.
- Migration/restore uncertainty, unsafe marker state or unavailable recorded
  artifact.
- Payment reconciliation mismatch or impossible booking/refund/payout state.
- Missing human alert delivery, acknowledgement or resolved proof.
- Twenty required alert signals/rules remain explicitly missing.
- Critical/high VAPT finding not independently closed.
- Missing owner/legal/privacy/clinical decision required for tested behavior.
- Unsigned/unbound mobile artifact, missing physical-device evidence or
  inaccurate store declaration.
- Active security, privacy, payment, data-integrity or recovery incident.

## Decision options

Choose exactly one for this staging run:

- `STAGING NO-GO` — a mandatory gate is failed, blocked, skipped or missing.
- `STAGING PASS FOR INDEPENDENT VAPT` — engineering staging gates pass, but
  VAPT/external gates remain; no production implication.
- `STAGING PASS FOR PRODUCTION GO/NO-GO REVIEW` — all staging and independent
  gates pass and evidence is complete; still not deployment approval.

The current evidence supports only `STAGING NO-GO`.

## Sign-off

| Role | Name | Decision | Conditions / evidence IDs | UTC time |
| --- | --- | --- | --- | --- |
| Engineering release owner | TBD | NO-GO | Evidence incomplete | TBD |
| QA lead | TBD | NO-GO | Evidence incomplete | TBD |
| Infrastructure/recovery owner | TBD | NO-GO | Evidence incomplete | TBD |
| Security owner | TBD | NO-GO | VAPT/evidence incomplete | TBD |
| Payment/finance owner | TBD | NO-GO | Sandbox/policy evidence incomplete | TBD |
| Owner/operations | TBD | NO-GO | `OWNER ACTION` open | TBD |
| Legal/privacy/clinical | TBD | NO-GO | Required approvals open | TBD |
| Apple/Google/vendor owners | TBD | NO-GO | External evidence open | TBD |

## After a candidate change

Close the meeting without approval, mark affected evidence `INVALIDATED`, issue
the new full SHA, update every package header, rerun the causal and downstream
gates, obtain VAPT/store retest where affected, and convene a new recorded
decision. Never edit an old result to display the new SHA.
