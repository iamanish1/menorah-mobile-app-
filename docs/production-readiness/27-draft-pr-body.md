# Draft pull-request body material

The PR-creation operator must replace `<DOCUMENTATION_HEAD>` with the exact
full SHA returned by `git rev-parse HEAD` after the final documentation-only
commit. This template is not deployment authorization.

## Summary

- Completes application and security remediation across authentication,
  authorization, sessions, audit integrity, SSRF, calls, chat and safe
  configuration.
- Hardens booking, pricing, payment, webhook, reconciliation and payout state
  transitions.
- Adds explicit counsellor verification states and evidence gates.
- Adds consent, privacy-rights, legal-hold and bounded retention engineering.
- Hardens backup, restore, migration, rollback and recovery boundaries.
- Completes 20 launch-critical observability signals with low-cardinality
  producers, Prometheus rules, firing/recovery fixtures and runbooks.
- Adds mobile release contracts, configuration validation and supported
  dependency policy.
- Adds exact-SHA cross-stack CI, clean-checkout Compose validation, pinned
  supply-chain checks, image scans and SBOMs.
- Rebinds the handover and isolated-staging package to one immutable runtime
  candidate.

## Immutable candidate

- Runtime candidate:
  `3fb99858c6766a341bb7b7dab2377195427f0ea1`
- Documentation HEAD: `<DOCUMENTATION_HEAD>`
- Branch: `release/final-production-readiness`
- Runtime commits ahead of `main` at freeze: 109
- Changed components: backend/API/worker, user/admin/counsellor web, Expo
  mobile, deployment/recovery, MongoDB identity/migrations, Cloudflare/Caddy,
  monitoring/logging, CI/security and production-readiness documentation.
- Migrations: 11 versioned migrations covering auth/social indexes, security
  remediation, payment/payout reconciliation, privacy state/retention,
  counsellor verification, provider deletion and audit-ledger indexes.
- New required configuration in the final P0 slice:
  `RESEND_WEBHOOK_SECRET`; the complete non-secret variable contract is in
  [the environment reference](./22-environment-variable-reference.md).
- Evidence policy: after the runtime freeze, only `docs/**` and
  `menorah/docs/**` may differ. Any source, workflow, test, lockfile,
  migration, deployment/configuration or provider-behavior change invalidates
  the candidate.

## Exact-SHA validation

Only runtime candidate
`3fb99858c6766a341bb7b7dab2377195427f0ea1` is cited:

- [Production Release Readiness run 30051102484](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102484):
  passed exact checkout, workflow/release invariants, Compose and shell
  validation.
- [Exact-SHA functional run 30051102471](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102471):
  passed all nine jobs including the aggregate gate.
- Backend: 112/112 default suites and 1,426/1,426 tests; 13/13 disposable
  integration suites and 45/45 tests; zero skips; lint and production
  dependency audit passed.
- User/admin/counsellor web: deterministic install, lint, type-check,
  production build and production dependency policy passed.
- Mobile: lint/type-check, 20/20 release-contract tests, 19/19 Expo Doctor and
  production dependency policy passed.
- Release/infrastructure: 159 TAP tests plus action/workflow validation,
  Compose, Caddy, clean-archive independence, Bash syntax, pinned ShellCheck,
  release/recovery, Mongo identity, Tunnel, monitoring, backup and media
  safety passed.
- Observability: 14 scrape jobs, 69 alert rules, 26 coverage records and all
  20 required P0 alert mappings passed validator and firing/recovery fixtures.
- [Security gates run 30051102473, attempt 2](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102473):
  all 15 jobs including the aggregate gate passed.
- Gitleaks history scan, Semgrep, seven production dependency policies, four
  image builds, Trivy high/critical gates and four CycloneDX SBOMs passed.
- The first security attempt encountered a Docker Hub metadata timeout before
  the backend build; the unchanged SHA passed build, Trivy and SBOM on retry.
- Exact warnings and dispositions are in
  [the immutable candidate record](./26-immutable-candidate-record.md).

## High-risk review areas

- Versioned migrations and their ordering/invariants.
- Encrypted backup, restore, rollback, interruption and recovery boundaries.
- Payment, payout, refund and webhook state transitions.
- Counsellor verification migration and evidence lifecycle.
- Privacy retention, deletion, legal hold and export handling.
- Queue/payment/email/call/auth/HTTP/privilege telemetry privacy and
  cardinality.
- Guarded Ubuntu deployment workflow and legacy Cloud Build/Cloud Run
  tombstones.
- Mobile production configuration, deep links, signing gates and store
  declarations.

## Remaining external blockers

- No isolated staging evidence.
- No recovery rehearsal on an approved staging host.
- No provider sandbox evidence.
- No live-server validation.
- No independent VAPT.
- No named owner, on-call, repository-governance or risk decisions.
- No legal/privacy approval.
- No clinical approval.
- No Apple signing/device/TestFlight/store completion.
- No Google signing/device/internal-track/store completion.
- No complete vendor assurance/callback/exit evidence.
- No operational ISO/ISMS/BCM evidence.

## Review links

- [Immutable candidate record](./26-immutable-candidate-record.md)
- [Release runbook](./08-release-runbook.md)
- [Rollback runbook](./09-rollback-runbook.md)
- [Backup and restore runbook](./10-backup-and-restore-runbook.md)
- [Monitoring runbook](./12-monitoring-and-alerting-runbook.md)
- [Staging QA package](./staging/README.md)
- [Evidence index](./staging/13-evidence-index.md)
- [Production go/no-go](./21-production-go-no-go.md)

## Warning

**THIS DRAFT PR IS NOT AUTHORIZATION TO MERGE OR DEPLOY.**
