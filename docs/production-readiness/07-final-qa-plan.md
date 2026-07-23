# Final QA plan

Last reviewed: 2026-07-23.

## Objective

This plan produces release evidence for one immutable candidate. It does not
authorize production deployment and does not convert blocked external checks
into passes. The current verdict remains **NOT READY**.

## Environment and data rules

- Use synthetic accounts, bookings, payment-provider test mode and disposable
  databases.
- Never run migration, restore, destructive, payment or privacy-state tests
  against production.
- Never paste secrets or production records into commands, CI, screenshots or
  tickets.
- Run Bash release tests with Git Bash, WSL or an approved Linux container;
  do not rewrite the scripts as PowerShell.
- A candidate change invalidates downstream build, staging, VAPT and
  acceptance results.
- Record pass, fail, skipped and blocked separately for every suite.

## Stage 1 — candidate identity and scope

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/release/final-production-readiness
git diff --check
```

Pass gate:

- exact branch and SHA match the approved candidate;
- remote ancestry is understood and not diverged;
- worktree contents are intentional;
- no secret, production-data artifact or unrelated change is present.

Record the starting recovery commit and every focused candidate commit. Do not
discard user changes to make this gate pass.

## Stage 2 — deterministic repository checks

The repository executes this matrix in
`.github/workflows/functional-release.yml`. Every job checks out the exact
validated candidate SHA without persisted credentials. The stable
`Required functional release gates` check fails if candidate identity,
backend default tests, disposable MongoDB/Redis integration tests, any web
workspace, mobile, or release/infrastructure validation fails or is skipped.
The separate `Required security gates` check remains responsible for
Gitleaks, Semgrep, dependency-policy, Trivy and SBOM evidence.

CI uses only tracked synthetic configuration and disposable service data.
It does not bind a GitHub environment, consume repository secrets, contact
live providers, authenticate to infrastructure or deploy.

### Backend

From `menorah/backend`:

```bash
npm run lint
npm test -- --runInBand
npm audit --omit=dev
```

Run approved integration groups separately so their counts and environment
requirements remain visible. Migration tests must point only to a temporary
database.

### User web

From `menorah/user-web-app`:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

### Admin

From `menorah/admin-panel`:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

### Counsellor web

From `menorah/web-app`:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

### Mobile

From `menorah/mobile-app`:

```bash
npm run lint
npm run typecheck
npm run test:payment-policy
npm run test:release-config
npm run validate:release-config
npm run doctor
npm audit --omit=dev
```

Expo Doctor exceptions require exact package, impact, owner, expiry and store
build evidence. A checked-in native project may require approved native
regeneration; do not hide version drift.

### Production QA and configuration

From `menorah/scripts/qa`:

```bash
npm run test:release-workflow
npm run test:mongo-identities
npm run test:tunnel-config
npm run validate:tunnel-example
npm run test:media-recovery
npm run test:media-transition
npm run test:backup-lifecycle
npm run test:monitoring
```

The monitoring suite's current expected repository result is:

- 31 Node subtests;
- 14 scrape jobs;
- 53 alert rules;
- 26 coverage records;
- successful native Prometheus, Alertmanager, Blackbox, Alloy and Loki
  validation;
- successful backup-metrics and Docker gateway/exporter runtime checks.

Counts are an aid to drift detection, not a substitute for checking exit codes
and failures.

### Compose, Caddy and shell

```bash
bash menorah/deploy/ubuntu/validate-compose.sh
bash -n menorah/deploy/ubuntu/backup-now.sh
bash -n menorah/deploy/ubuntu/rollback-last-deploy.sh
bash -n menorah/deploy/ubuntu/update-from-git.sh
bash -n menorah/deploy/ubuntu/resume-post-migration-release.sh
bash -n menorah/deploy/ubuntu/recover-managed-mongo-identities.sh
bash -n menorah/deploy/ubuntu/consolidate-legacy-media.sh
bash -n menorah/deploy/ubuntu/run-recorded-migration.sh
bash -n menorah/deploy/ubuntu/prepare-runtime-directories.sh
bash -n menorah/deploy/ubuntu/first-run.sh
bash -n menorah/deploy/ubuntu/prepare-host.sh
bash -n menorah/deploy/ubuntu/health-check.sh
bash -n menorah/scripts/qa/test-release-scripts.sh
bash -n menorah/scripts/qa/test-monitoring-native.sh
bash menorah/scripts/qa/test-release-scripts.sh
```

Validate `Caddyfile.production` with the exact pinned production Caddy image.
Render production plus tunnel Compose with example files only. Do not use or
print live environment files during desktop QA.

### Security and supply chain

Run the repository-supported secret-history, SAST, dependency and container
configuration checks. Run Gitleaks or the approved equivalent if available.
Record tool versions and scope. Do not suppress an advisory or scan result
without a written, time-bounded treatment decision.

Stage 2 fails if any P0 test fails, any required command is silently skipped,
or a production build cannot be reproduced.

## Stage 3 — isolated database and recovery QA

Use a fresh temporary database and disposable test services.

1. create a signed/encrypted test backup using non-production keys;
2. verify host-readable ownership and integrity;
3. restore into a separate explicit target;
4. run ordered migrations once;
5. rerun to prove idempotency or guarded refusal, as designed;
6. verify unique indexes and application invariants;
7. simulate partial identity, partial migration and post-migration markers;
8. interrupt immediately before/after migration completion and prove guarded
   recovery retains the exact candidate without rerunning migration;
9. interrupt rollback after target checkout and prove retry reuses the durable
   recorded rollback target;
10. prove unsafe code-only rollback is blocked;
11. prove deployment and rollback locks exclude concurrency;
12. consolidate/restore managed media and verify collision, permission,
    manifest and integrity behavior.

Do not copy production data to desktop QA. If realistic shape is required, use
approved synthetic fixtures.

## Stage 4 — application security regression

Run each category as its own report.

### Authentication and authorization

- token audience/type isolation for user, admin and counsellor;
- expired, revoked, suspended and deleted sessions;
- password change, logout and logout-all;
- stale permissions after role removal;
- multiple devices and refresh replay where rotation applies;
- user A/B and counsellor A/B object isolation;
- support, finance, content and admin least privilege;
- exports, files, search and WebSocket authorization.

### Booking and privacy boundary

- authoritative price and currency;
- negative/zero/tampered amount and forged discount/free claims;
- unpaid, cancelled, refunded, expired and terminal acceptance denial;
- atomic simultaneous acceptance;
- ineligible/unverified counsellor denial;
- bounded unassigned preview with prohibited fields absent;
- assignment grants only the permitted post-assignment view.

### Payments and payouts

- valid/invalid signatures;
- duplicate, delayed and out-of-order webhooks;
- wrong order, payment, booking, receipt, amount, currency and capture state;
- redirect-before-webhook and webhook-before-redirect;
- duplicate/over-limit refund;
- payout replay, mismatch, approval and fresh-MFA controls;
- reconciliation reports and safe metadata.

Use provider test mode and fake credentials only. Production payment gates stay
off.

### Calls, chat and media

- wrong participant, early/late access and terminal booking states;
- one-time ticket replay;
- unauthorized WebSocket connection and room join;
- suspension, deletion and reassignment after connection;
- recording remains off unless a real approved system exists;
- sensitive log redaction;
- UAE/fallback behavior tested as a separate approved path.

### SSRF

- localhost, IPv4/IPv6 loopback, RFC1918, link-local, metadata and reserved
  targets;
- DNS resolving to private addresses;
- redirects to private addresses;
- slow, oversized and non-image responses;
- missing HTTPS and credential forwarding.

### Privacy state

- consent version and withdrawal evidence;
- export/correction/deletion authorization;
- legal hold versus retention and deletion races;
- protected financial/security records are not misrepresented as erased;
- audit evidence and safe requester communications.

## Stage 5 — production-like staging

Deploy only the immutable candidate to isolated staging through an approved
staging path. Then:

- verify every application route and JSON readiness probe;
- verify Blackbox, Prometheus targets, Alloy/Loki logs and bounded Docker
  metrics;
- inject controlled conditions for critical alert rules;
- prove Alertmanager delivery, acknowledgement, repeat and resolved messages
  through a non-production receiver;
- run Playwright:

  ```bash
  cd menorah/scripts/qa
  npm run test:web
  ```

- run API, authentication and provider smoke scripts only after confirming
  they point to staging and use synthetic accounts;
- exercise backup, restore, migration, rollback and incident runbooks;
- inspect logs for secrets and prohibited personal/clinical/payment content;
- run load/performance baselines with agreed thresholds;
- run accessibility and supported-browser/device checks.

No production URL should be accepted by a destructive QA harness.

## Stage 6 — mobile and store QA

- Android internal-track signed build and representative physical devices;
- iOS archive and signed-device tests on an approved macOS builder;
- login, MFA where applicable, booking, payment test mode, calls/chat,
  notification redaction, account deletion and deep-link authorization;
- screenshot/app-switcher protection on designated sensitive screens;
- secure token storage, clipboard, local persistence and logout cleanup;
- external Apple association and Android asset-link retrieval;
- accurate privacy, health, data-safety and required-reason declarations.

These are `APPLE ACTION` and `GOOGLE ACTION`; desktop configuration tests are
not substitutes.

## Stage 7 — independent and operational assurance

- `VAPT ACTION`: assess the immutable staging candidate and retest closure;
- `INFRASTRUCTURE ACTION`: execute target-host read-only preflight, backup,
  restore, monitoring and alert-delivery verification;
- `OWNER ACTION`: approve product/finance/continuity decisions and residual
  risk;
- `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`: approve their documented
  inputs and operating procedures;
- `VENDOR ACTION`: complete account, callback, incident, retention and exit
  evidence.

## Defect and rerun policy

For a failure:

1. retain the exact failing output safely;
2. identify severity and affected release gate;
3. fix in a focused reviewed change;
4. rerun the smallest causal suite;
5. rerun every affected downstream suite;
6. issue a new immutable candidate;
7. invalidate prior staging, VAPT or store evidence where the change affects
   it.

Quarantine is allowed only for a demonstrated flaky non-security test with a
named owner, expiry and compensating evidence. P0 security, payment, privacy,
migration, backup and authorization tests cannot be waived informally.

## Final QA report

The report must list, by suite:

- command/scenario and environment;
- exact SHA;
- passed count;
- failed count;
- skipped count;
- blocked count and reason;
- duration and evidence reference;
- defects and retest references;
- reviewer.

The release can proceed to the go/no-go meeting only when all P0 QA gates have
objective evidence and the remaining external actions are explicitly closed.
