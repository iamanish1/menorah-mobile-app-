## Summary

This draft completes the final production-readiness engineering slice and
records the results of the isolated synthetic staging rehearsal performed on
Docker Desktop.

- Branch: `release/final-production-readiness`
- Immutable runtime candidate:
  `48fb83c248b0e969e699433a8bacdd276ed4311d`
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
`48fb83c248b0e969e699433a8bacdd276ed4311d`.

### Isolation, images and health

- Full-profile build passed for all 11 locally built images.
- The rendered Compose model contains 29 services, five staging-only networks
  and 12 staging-only volumes.
- Final inventory: 26 containers, comprising 23 running and healthy services
  plus three expected exited one-shot migration/replica-init services.
- There were zero container restarts and zero unhealthy running services.
- Every published socket was bound to `127.0.0.1`; MongoDB and Redis had no
  published host ports.
- The generated environment passed the synthetic-only contract, with optional
  external providers disabled. No production environment, database, Redis,
  provider or customer data was loaded or contacted.

### Migration and synthetic roster

- First migration run applied all 11 versioned migrations.
- Second migration run skipped the same 11 migrations, proving idempotence.
- The migration ledger contained 11 unique entries.
- First seed run created the bounded synthetic roster: 10 users, three
  counsellors and two application identities.
- Second seed run failed closed with
  `LOCAL_STAGING_ROSTER_ALREADY_PRESENT`.
- After the seed, MongoDB contained 18 collections and 117 indexes.

### Functional and browser validation

- Local API smoke suite: **31/31 passed**.
- Playwright browser suite: **7/7 passed**, covering public, user, admin and
  counsellor surfaces, synthetic internal MFA, and authentication-loop
  regressions.
- Final release-workflow test command: **127/127 passed** with no failures or
  skips.
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
- The negative backup test also caused `BackupJobFailed` to fire in both
  systems; a successful backup cleared it.

### Backup and isolated restore

- A backup attempted while application writers were live failed closed with
  `application writers must be explicitly quiesced`.
- All five writers were then proven stopped before the successful signed
  backup: four API services and the worker.
- Backup timestamp: `20260724T040533Z`.
- Writer outage was 29.44 seconds; all five writers returned healthy.
- Restore into the separate restore-only MongoDB instance passed.
- Restored inventory matched the manifest: 18 collections, 51 documents and
  117 indexes, with HMAC, archive hash and media-manifest verification
  successful and zero document failures.
- The primary staging database was unchanged by the restore rehearsal.

## Functional evidence matrix

This matrix classifies the 107 requested assertions against final automated
and static evidence. A `GAP` is not represented as a pass; `BLOCKED` requires
an external system, approval or environment.

| Category | Requested | PASS | GAP | BLOCKED |
| --- | ---: | ---: | ---: | ---: |
| Authentication | 15 | 10 | 5 | 0 |
| Authorization | 8 | 7 | 0 | 1 |
| Counsellor lifecycle | 10 | 9 | 1 | 0 |
| Booking | 12 | 12 | 0 | 0 |
| Payment and payout | 19 | 13 | 0 | 6 |
| Chat and calls | 12 | 9 | 0 | 3 |
| Privacy | 10 | 9 | 1 | 0 |
| Web and API | 11 | 5 | 6 | 0 |
| Security | 10 | 7 | 1 | 2 |
| **Total** | **107** | **81** | **14** | **12** |

The principal gaps or blockers are positive user registration/OTP coverage,
self-approval and no-gender automation, full responsive/accessibility/load
coverage, upload hardening, two-person payout and refund flows, real
payment/email/call/media provider sandboxes, external fallback behavior,
full-history independent secret review, and independent DAST/VAPT.

## Security evidence and urgent credential follow-up

- Trivy repository secret scanning at the immutable runtime candidate found
  zero tracked-current findings.
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
- non-root/cache/configuration issues in Redis and the monitoring images; and
- the credential-bearing legacy external MongoDB URI described above.

The final complete evidence set is bound only to
`48fb83c248b0e969e699433a8bacdd276ed4311d`.

## Exact-SHA GitHub checks

All six final candidate workflows passed on attempt 1: **50/50 jobs**.

- [Push — Production Release Readiness, run 30064845086](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064845086)
- [Push — Exact-SHA Functional Validation, run 30064845082](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064845082)
- [Push — Security Gates, run 30064845089](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064845089)
- [Pull request — Production Release Readiness, run 30064847263](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064847263)
- [Pull request — Exact-SHA Functional Validation, run 30064847275](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064847275)
- [Pull request — Security Gates, run 30064847259](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064847259)

PR #2 remains open and draft. Passing checks are engineering evidence only;
they are not a production authorization.

## What remains unproven

- Approved Ubuntu server staging and a recovery rehearsal on that host.
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
