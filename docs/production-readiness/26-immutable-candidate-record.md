# Immutable runtime candidate record

Recorded: 2026-07-24 02:53 GST / 2026-07-23 22:53 UTC.

Repository-remediation verdict:
**REPOSITORY REMEDIATION COMPLETE — REVIEW REQUIRED**

Public-production verdict: **NOT READY**

This record freezes repository-controlled runtime content only. It is not
authorization to merge, deploy, migrate, restore, change infrastructure,
enable providers, submit to a store, or use production data.

## Frozen identity

| Field | Value |
| --- | --- |
| Branch | `release/final-production-readiness` |
| Runtime candidate SHA | `3fb99858c6766a341bb7b7dab2377195427f0ea1` |
| Runtime freeze | 2026-07-24 02:51 GST / 2026-07-23 22:51 UTC |
| Commits ahead of `origin/main` at freeze | 109 |
| Documentation HEAD | The exact draft-PR head, recorded in GitHub after the final documentation-only commit |
| Runtime-to-docs relationship | Runtime SHA must be an ancestor; every intervening path must satisfy the documentation-only allowlist below |

A Git commit cannot embed its own SHA. The draft PR is therefore the
authoritative external record of the final documentation HEAD. Reviewers must
verify it with `git rev-parse HEAD` and the path-diff command below.

## Documentation-only allowlist and invalidation

After the runtime freeze, the only permitted changed paths are:

- `docs/**`
- `menorah/docs/**`

The documentation changes may update narrative, links, evidence references,
checklists, runbooks, and PR-body material only. Any source, test, workflow,
action, lockfile, package manifest, generated native project, migration,
Compose/Caddy/monitoring configuration, deployment script, environment
template, or provider-callback behavior change invalidates this runtime
candidate and requires a new SHA plus complete downstream validation.

Review the boundary with:

```bash
git diff --name-only \
  3fb99858c6766a341bb7b7dab2377195427f0ea1..HEAD
```

If any returned path is outside the two allowlisted documentation trees, stop.

## Exact-SHA GitHub evidence

All links below identify runtime SHA
`3fb99858c6766a341bb7b7dab2377195427f0ea1`.

| Workflow | Run | Result | Material coverage |
| --- | --- | --- | --- |
| Production Release Readiness | [30051102484](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102484) | PASS | Exact checkout, workflow/release invariants, production Compose and shell syntax |
| Exact-SHA functional release validation | [30051102471](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102471) | PASS | Backend default and disposable integration, user/admin/counsellor web, mobile, release/infrastructure and aggregate gate |
| Security gates | [30051102473](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102473) attempt 2 | PASS | Gitleaks, Semgrep, dependency policy, four image builds, Trivy, SBOMs, Expo diagnostics and aggregate gate |

Security run attempt 1 had one external Docker Hub metadata timeout before the
backend image build began. The failed job was rerun without changing the SHA.
Attempt 2 built the image, found no high/critical container vulnerability,
generated its CycloneDX SBOM, and passed the aggregate security gate.

## Exact-SHA result totals

| Workspace/gate | Passed | Failed | Skipped/blocked | Warnings/disposition |
| --- | ---: | ---: | ---: | --- |
| Backend default Jest | 112 suites / 1,426 tests | 0 | 0 | Production dependency policy: no findings |
| Backend disposable integration | 13 suites / 45 tests | 0 | 0 | Disposable MongoDB and Redis; silent skips prohibited |
| Backend aggregate | 125 suites / 1,471 tests | 0 | 0 | Lint and production dependency audit passed |
| User web | lint, type-check, 36-page production build, audit | 0 | 0 | 3 non-blocking lint warnings; production dependency policy has no findings |
| Admin web | lint, type-check, 22-page production build, audit | 0 | 0 | 9 non-blocking lint warnings and Next lint deprecation; production dependency policy has no findings |
| Counsellor web | lint, type-check, production build, audit | 0 | 0 | 19 non-blocking lint warnings; production dependency policy has no findings |
| Mobile | lint, type-check, 20/20 release-contract tests, 19/19 Expo Doctor, audit | 0 | 0 | 1,480 existing inline-style warnings; one Doctor check is explicitly disabled; 11 constrained moderate transitive findings under the approved exception expiring 2026-10-31 |
| Release/infrastructure TAP groups | 159 tests | 0 | 0 | Compose/Caddy, clean archive, Bash syntax and pinned ShellCheck also passed |
| Production Release Readiness | 1 job | 0 | 0 | No warning converted into a pass |
| Functional workflow | 9 jobs including aggregate | 0 | 0 | Exact-SHA artifacts retained for 30 days |
| Security workflow | 15 jobs including aggregate | 0 | 0 | Same-SHA retry after external registry timeout |

The monitoring validator reports **14 scrape jobs, 69 alert rules and 26
coverage records**. Its machine-validated P0 section maps all 20 required
alerts to metrics, bounded producers, rules, firing/recovery fixtures,
severity, runbooks, live-evidence requirements and explicit owner
placeholders.

## Repository-controlled P0 closure

| ID | Repository result | Exact evidence | Remaining proof |
| --- | --- | --- | --- |
| CX-P0-01 | Complete | Clean `git archive` Compose validation, tracked fixture tests, placeholder/empty rejection, production fail-closed checks and Caddy validation | Protected target-host render remains staging/live evidence |
| CX-P0-02 | Complete | Exact-SHA functional run 30051102471 and aggregate gate | Production-like UI/device/provider behavior remains staging evidence |
| CX-P0-03 | Complete | Immediate backup result plus separate user/admin/counsellor probes, rule fixtures and coverage validation | Controlled delivery and human response in isolated staging |
| CX-P0-04 | Complete | Bounded HTTP 401/403/429/500, user/counsellor/admin-MFA auth, privileged/admin role metrics, signed-audit preservation and Prometheus tests | Threshold tuning and controlled delivery in isolated staging |
| CX-P0-05 | Complete | Durable queue, payment/webhook, Resend dispatch/delivery, call/provider/media metrics, signature/replay controls, privacy/cardinality tests and Prometheus fixtures | Provider sandbox callbacks, live targets and controlled delivery in isolated staging |
| CX-P0-06 | Complete | This frozen SHA, exact green runs, documentation-only boundary and draft-PR evidence binding | Independent review and repository-governance approval |

## Warnings and known limits

- Mobile lint has 1,480 existing `react-native/no-inline-styles` warnings; no
  lint errors.
- User, admin and counsellor lint have 3, 9 and 19 existing warnings
  respectively; no lint errors.
- Next.js reports the `next lint` deprecation in the admin workspace.
- Expo Doctor passed 19/19 while reporting the repository's explicit
  `appConfigFieldsNotSyncedCheck` disablement and stale baseline-browser data.
- The mobile production dependency policy retains 11 moderate transitive
  findings constrained to `GHSA-w5hq-g745-h8pq`; the recorded exception
  expires 2026-10-31. All other production dependency policies passed with no
  findings.
- Local default Jest skips the 13 integration suites by design; the exact-SHA
  workflow ran all 13 against disposable MongoDB/Redis, with 45/45 tests
  passing and zero skips.
- No warning, skip, transient service failure or unavailable external evidence
  has been represented as a successful staging or production result.

## Remaining evidence

No isolated staging deployment or staging execution has occurred. Required
evidence remains open for:

- isolated host/network/storage/database/cache and synthetic-account proof;
- migration, interrupted migration, rollback, resume, backup/off-site custody
  and independent restore rehearsal;
- payment, payout, email, call and identity-provider sandbox callbacks;
- target/probe health, all alert firing/recovery, protected receiver delivery,
  acknowledgement, escalation, logging and retrieval;
- live server, DNS, TLS, Tunnel, firewall, runtime identities and time/retention
  validation;
- named owners, access/ruleset decisions, policies and residual-risk approval;
- legal/privacy and clinical review;
- independent VAPT and closure retest;
- Apple and Google signing, physical-device, declaration and store evidence;
- provider/vendor assurance and exit evidence; and
- operational ISO/ISMS/BCM evidence.

The next permissible technical stage is an independently approved isolated
staging review. Public production remains **NOT READY**.
