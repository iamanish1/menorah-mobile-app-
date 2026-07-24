## Summary

This draft completes the final production-readiness engineering slice and
records the results of the isolated synthetic staging rehearsal performed on
Docker Desktop.

- Branch: `release/final-production-readiness`
- Immutable runtime candidate:
  `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`
- Documentation HEAD: recorded in PR #2 after this documentation-only commit
  because a commit cannot embed its own SHA
- Base branch: `main`
- Local verdict:
  **LOCAL STAGING VALIDATION PASSED — SERVER STAGING REQUIRED**
- Production verdict: **NOT READY**

The runtime candidate is frozen. Documentation-only commits under `docs/**`
and `menorah/docs/**` may follow without changing it. Any source, workflow,
test, lockfile, migration, deployment/configuration or provider-behavior
change invalidates the candidate and requires a complete rerun.

## Scope

- Authentication, authorization, session, audit-integrity and SSRF hardening.
- Booking, pricing, payment, webhook, reconciliation and payout state
  transitions.
- Counsellor verification states and evidence gates.
- Consent, privacy-rights, legal-hold and bounded-retention engineering.
- Backup, restore, migration, rollback and recovery controls.
- Twenty launch-critical observability signals with fixtures and runbooks.
- Mobile release contracts and production configuration validation.
- Exact-SHA cross-stack CI, Compose validation, supply-chain checks, image
  scans and SBOMs.
- An isolated local staging harness that rejects production configuration and
  uses synthetic data and stubbed providers only.

## Candidate-bound local staging evidence

All results in this section were produced from runtime candidate
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`.

### Isolation, images and health

- Full-profile build passed for all 11 locally built images in 112.95 seconds.
- Rendered Compose SHA-256:
  `4b2608b4eeb6e0e3acdac06b047fb9f427f1c373f5b03afc4b38e5c70e02c728`;
  30 services, five staging-only networks and 12 staging-only volumes.
- Core startup completed in 16.28 seconds and full startup in 55.64 seconds.
- Final inventory: 26 containers, comprising 23 running and healthy services
  plus three expected exited-zero one-shots: `logs-init`,
  `mongo-replica-init`, and `mongo-restore-replica-init`.
- There were zero container restarts and zero unhealthy running services.
- Caddy remained healthy with one workload process and zero zombies/restarts;
  its access log was mode `0600`, UID/GID `473:473`, and Loki ingestion
  succeeded.
- Every published socket was bound to `127.0.0.1`; MongoDB and Redis had no
  published host ports.
- The generated environment passed the synthetic-only contract, with optional
  external providers disabled. No production environment, database, Redis,
  provider or customer data was loaded or contacted.

### Migration and synthetic roster

- First migration run applied all 11 versioned migrations in 5.86 seconds.
- Second migration run skipped the same 11 migrations in 2.93 seconds,
  proving idempotence.
- The migration ledger contained 11 unique entries.
- First seed run created the bounded synthetic roster: 10 users, three
  counsellors and two application identities in 8.13 seconds.
- Second seed run failed closed with
  `LOCAL_STAGING_ROSTER_ALREADY_PRESENT` in 7.74 seconds.
- Final primary inventory was 18 collections, 89 documents and 117 indexes.
- The requested administrator and super-administrator identities are distinct
  aliases but share the current full-admin role; distinct role semantics remain
  an out-of-matrix Phase 5 gap.

### Functional and browser validation

- Local API smoke suite: **31/31 passed** in 6.98 seconds.
- Playwright browser suite: **7/7 passed**, covering public, user, admin and
  counsellor surfaces, synthetic internal MFA, and authentication-loop
  regressions, in 15.33 seconds.
- Final release-workflow test command: **133/133 passed** — 75/75 release plus
  58/58 local-staging assertions, with no failures or skips.
- Preliminary misconfigured or state-contaminated API/browser invocations were
  invalidated and are not included in these totals.
- Applicable backend unit tests, client type-checks, linters and focused
  payment/email/release checks passed; platform- or provider-dependent gaps
  remain listed below.

### Alerts

- All **20/20** required launch-critical alerts were observed firing and then
  resolving in both Prometheus and Alertmanager:
  worker backlog, backup failure, payment/provider/webhook failures,
  email dispatch/delivery failures, call provider/media failures, privileged
  and admin role changes, user/counsellor/admin authentication failures,
  elevated HTTP 401/403/429/500 rates, and all three frontend probes.
- The exact pre/post state was 25/25 Prometheus targets up. The sole allowed
  local baseline was two instances of `BlackboxProbeCoverageIncomplete`;
  local Docker cannot supply the production rule's 19 public HTTPS probes plus
  two call probes.
- The all-alert exercise completed in 1,357.57 seconds.
- The negative backup test also caused `BackupJobFailed` to fire in both
  systems; a successful backup cleared it.

### Backup and isolated restore

- A backup attempted while application writers were live failed closed with
  `application writers must be explicitly quiesced` in 2.84 seconds.
- `BackupJobFailed` fired in both systems in 26.01 seconds.
- All five writers were then proven stopped before the final successful signed
  backup: four API services and the worker; stop completed in 3.74 seconds.
- Backup timestamp: `20260724T070020Z`; signed backup creation took 3.72
  seconds.
- Writer recovery took 12.39 seconds; outage from all writers stopped to all
  writers healthy was 39.70 seconds.
- Restore into the separate restore-only MongoDB instance passed.
- Restore verification took 8.72 seconds.
- Restored inventory matched the manifest: 18 collections, 89 documents and
  117 indexes, with HMAC, archive hash and media-manifest verification
  successful and zero document failures. The non-empty media check counted one
  clearly synthetic source file and one restored file; an independent
  read-only networkless verifier returned byte comparison exit `0` and the
  same file hash.
- `BackupJobFailed` resolved in both systems in 0.94 seconds.
- The primary staging database was unchanged by the restore rehearsal.
- After the later non-empty media recovery rerun, all 25 Prometheus targets
  remained up and only the same two allowed local
  `BlackboxProbeCoverageIncomplete` baseline instances were active.

## Functional evidence matrix

This matrix classifies the 107 requested assertions against final automated
and static evidence. A `GAP` is not represented as a pass; `BLOCKED` requires
an external system, approval or environment.

| Category | Requested | STATIC PASS | FAIL | GAP | BLOCKED |
| --- | ---: | ---: | ---: | ---: | ---: |
| Authentication | 15 | 10 | 0 | 5 | 0 |
| Authorization | 8 | 7 | 0 | 0 | 1 |
| Counsellor lifecycle | 10 | 9 | 0 | 1 | 0 |
| Booking | 12 | 12 | 0 | 0 | 0 |
| Payment and payout | 19 | 13 | 0 | 0 | 6 |
| Chat and calls | 12 | 9 | 0 | 0 | 3 |
| Privacy | 10 | 9 | 0 | 1 | 0 |
| Web and API | 11 | 5 | 0 | 6 | 0 |
| Security | 10 | 7 | 0 | 1 | 2 |
| **Total** | **107** | **81** | **0** | **14** | **12** |

The principal gaps or blockers are positive user registration/OTP coverage,
self-approval, distinct super-admin role semantics, and no-gender automation,
full responsive/accessibility/load coverage, upload hardening, two-person
payout and refund flows, real
payment/email/call/media provider sandboxes, external fallback behavior,
full-history independent secret review, and independent DAST/VAPT.

## Security evidence and urgent credential follow-up

- Trivy `0.70.0` exact-commit repository secret scanning completed in 10.59
  seconds with exit `0` and zero findings.
- The immutable-tree credential scan found no non-fixture credential-bearing
  URI, no tracked runtime environment file and no tracked private key.
- A credential-bearing legacy external MongoDB URI was discovered in
  `scripts/vps-setup.sh`, removed without connecting to the endpoint or
  exposing the credential, and covered by a regression test in
  `48fb83c248b0e969e699433a8bacdd276ed4311d`.
- The owner of that external MongoDB account must independently verify whether
  it remains active, rotate/revoke its credential, and retain auditable
  evidence. Source removal alone does not complete that operational action.
- Independent full-history review and DAST/VAPT are not proven by this local
  rehearsal.

## Defects fixed during the rehearsal

The rehearsal found and fixed candidate-invalidating defects; evidence from
the affected earlier SHAs was discarded and the relevant checks were rerun:

- authentication reload loops in the local browser flow;
- non-portable signed-recovery verification and restore ownership handling;
- Alertmanager reachability across the isolated private monitoring network,
  including fail-fast preflight behavior;
- private proxy/ingress address validation and related staging boundaries;
- non-root/cache/configuration issues in Redis and the monitoring images;
- the credential-bearing legacy external MongoDB URI described above; and
- a long-duration Caddy health-check leak that accumulated 106 defunct
  `ssl_client` children, exhausted the 128-PID limit, and made health checks
  fail; `init: true` plus a regression test fixed and bounded the process
  lifecycle;
- raw ingress aliases that left 7/25 scrape targets down, broke Alloy-to-Loki
  visibility, and polluted the baseline with `BackupMetricsStale`; private
  aliases, a backup heartbeat, and exact target/baseline validation restored
  25/25 visibility in `fbf2de8c5bb3e50e41fcaa6bc75f739cfdc0aca2`; and
- Caddy 2.8 silently ignoring the configured access-log mode and producing a
  root-owned `0600` log unreadable by Alloy; the isolated `logs-init` service
  plus shared UID/GID 473 restored rotation-safe log visibility in
  `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`.

The first non-empty media rehearsal used an artificially restrictive `0700`
test-fixture directory and failed safely before archive finalization. That
setup attempt was invalidated; ordinary synthetic fixture permissions were
restored and the complete fresh backup/retrieval/restore/byte-comparison cycle
above passed. Early SHAs `23caa24`, `94b3652`, and `386e379` also had
superseded workflow runs cancelled by concurrency; they are not claimed as
fully green exact-SHA candidates.

The final complete evidence set is bound only to
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`. Runtime revisions
`48fb83c248b0e969e699433a8bacdd276ed4311d`,
`a9ea55ea85ab3bd91e68797256e0b8fc9f677966`, and
`fbf2de8c5bb3e50e41fcaa6bc75f739cfdc0aca2`, plus documentation head
`2f2c6e45608300a05443aa7a95d2fd4513e28b71`, are historical and
**INVALIDATED** for the current candidate.

## Exact-SHA GitHub checks

All six final candidate workflows passed on attempt 1: **50/50 jobs and
404/404 steps**.

- [Push — Production Release Readiness, run 30069836961](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836961)
- [Push — Exact-SHA Functional Validation, run 30069836968](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836968)
- [Push — Security Gates, run 30069836976](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836976)
- [Pull request — Production Release Readiness, run 30069839620](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839620)
- [Pull request — Exact-SHA Functional Validation, run 30069839619](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839619)
- [Pull request — Security Gates, run 30069839629](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839629)

PR #2 remains open and draft. Passing checks are engineering evidence only;
they are not a production authorization.

## What remains unproven

- Approved Ubuntu server staging and a recovery rehearsal on that host.
- The production probe rule's 19 public HTTPS probes plus two call probes.
- Safe co-hosting on the existing production server; the current topology is
  unsuitable without a separately reviewed isolation design. A dedicated
  staging VM/host is the preferred next environment.
- Real provider sandbox behavior for payments, payouts/refunds, email,
  call/media and fallback paths.
- Independent DAST/VAPT and full-history security review.
- Android emulator/device UI, signing, TestFlight/internal-track and store
  completion.
- Named operational owners, on-call/governance/risk decisions, legal/privacy
  approval, clinical approval, vendor assurance and operational
  ISO/ISMS/BCM evidence.

## Required next gate

Reproduce the candidate on an approved, isolated Ubuntu staging host using
staging-only secrets, networks, storage, DNS and provider sandboxes. Repeat
the migration, synthetic roster, functional/browser, all-alert,
backup/restore, security and recovery evidence there. Do not reuse production
databases, Redis, environment files, provider credentials or customer data.

## Review links

- [Immutable candidate record](./26-immutable-candidate-record.md)
- [Release runbook](./08-release-runbook.md)
- [Rollback runbook](./09-rollback-runbook.md)
- [Backup and restore runbook](./10-backup-and-restore-runbook.md)
- [Monitoring runbook](./12-monitoring-and-alerting-runbook.md)
- [Staging QA package](./staging/README.md)
- [Evidence index](./staging/13-evidence-index.md)
- [Local staging validation report](./28-local-staging-validation-report.md)
- [Production go/no-go](./21-production-go-no-go.md)

## Warning

**PRODUCTION IS NOT READY. DO NOT MERGE AND DO NOT DEPLOY.**

This draft PR is for review and server-staging preparation only. It grants no
authority to merge, deploy, enable production providers, or touch production
data or infrastructure.
