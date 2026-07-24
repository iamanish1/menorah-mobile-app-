# Immutable runtime candidate record

Updated for the current runtime candidate: 2026-07-24.

Repository-remediation verdict:
**LOCAL STAGING VALIDATION PASSED — SERVER STAGING REQUIRED**

Public-production verdict: **NOT READY**

This record freezes repository-controlled runtime content only. It is not
authorization to merge, deploy, migrate, restore, change infrastructure,
enable providers, submit to a store, or use production data.

## Frozen identity

| Field | Value |
| --- | --- |
| Branch | `release/final-production-readiness` |
| Runtime candidate SHA | `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` |
| Runtime commit time | 2026-07-24 09:35 GST / 2026-07-24 05:35 UTC |
| Commits ahead of `origin/main` at freeze | 130 |
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
readonly RUNTIME_SHA='0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a'
git diff --name-only \
  "${RUNTIME_SHA}..HEAD"
```

If any returned path is outside the two allowlisted documentation trees, stop.

## Current candidate-bound GitHub evidence

All six push and pull-request workflow executions for
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` completed successfully on attempt
1: 50/50 jobs and 404/404 steps. This is repository automation evidence only;
it is not an approval to merge or deploy.

| Event | Workflow | Run | Result |
| --- | --- | --- | --- |
| Push | Production Release Readiness | [30069836961](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836961) | PASS, 1/1 jobs and 10/10 steps |
| Push | Exact-SHA functional release validation | [30069836968](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836968) | PASS, 9/9 jobs and 88/88 steps |
| Push | Security gates | [30069836976](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836976) | PASS, 15/15 jobs and 104/104 steps |
| Pull request | Production Release Readiness | [30069839620](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839620) | PASS, 1/1 jobs and 10/10 steps |
| Pull request | Exact-SHA functional release validation | [30069839619](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839619) | PASS, 9/9 jobs and 88/88 steps |
| Pull request | Security gates | [30069839629](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839629) | PASS, 15/15 jobs and 104/104 steps |

## Superseded runtime and documentation evidence

Runtime `48fb83c248b0e969e699433a8bacdd276ed4311d` and its documentation-only
successor `2f2c6e45608300a05443aa7a95d2fd4513e28b71` both had 50/50 successful
push/PR jobs. Later executable Caddy and monitoring changes invalidated both
sets as final-candidate evidence. The two intervening runtimes are also
historical only:

| Revision | Push runs | Pull-request runs | Treatment |
| --- | --- | --- | --- |
| Runtime `48fb83c248b0e969e699433a8bacdd276ed4311d` | 30064845086, 30064845082, 30064845089 | 30064847263, 30064847275, 30064847259 | **INVALIDATED** after the Caddy reaper change |
| Documentation `2f2c6e45608300a05443aa7a95d2fd4513e28b71` | 30066516144, 30066516157, 30066516165 | 30066518424, 30066518430, 30066518427 | **INVALIDATED** because it documented the superseded runtime |
| Runtime `a9ea55ea85ab3bd91e68797256e0b8fc9f677966` | 30066907139, 30066907147, 30066907138 | 30066909073, 30066909086, 30066909094 | **INVALIDATED** after the monitoring-visibility change |
| Runtime `fbf2de8c5bb3e50e41fcaa6bc75f739cfdc0aca2` | 30068864716, 30068864666, 30068864690 | 30068866416, 30068866415, 30068866435 | **INVALIDATED** after the Caddy log-ownership change |

## Historical GitHub evidence — invalidated for this candidate

All links below identify the previous runtime SHA
`3fb99858c6766a341bb7b7dab2377195427f0ea1`, not the current runtime candidate.
They are retained for traceability and are **INVALIDATED** as evidence for
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`. Do not relabel their result,
test totals or artifacts.

| Workflow | Historical run | Historical result / current treatment | Material coverage at old SHA only |
| --- | --- | --- | --- |
| Production Release Readiness | [30051102484](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102484) | PASS at old SHA / **INVALIDATED** for current candidate | Exact checkout, workflow/release invariants, production Compose and shell syntax |
| Exact-SHA functional release validation | [30051102471](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102471) | PASS at old SHA / **INVALIDATED** for current candidate | Backend default and disposable integration, user/admin/counsellor web, mobile, release/infrastructure and aggregate gate |
| Security gates | [30051102473](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30051102473) attempt 2 | PASS at old SHA / **INVALIDATED** for current candidate | Gitleaks, Semgrep, dependency policy, four image builds, Trivy, SBOMs, Expo diagnostics and aggregate gate |

Security run attempt 1 had one external Docker Hub metadata timeout before the
backend image build began. The failed job was rerun without changing the SHA.
Attempt 2 built the image, found no high/critical container vulnerability,
generated its CycloneDX SBOM, and passed the aggregate security gate.

## Historical old-SHA result totals — invalidated

The following totals belong only to
`3fb99858c6766a341bb7b7dab2377195427f0ea1`. They do not state the result of
the current runtime candidate.

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

At the old SHA, the monitoring validator reported **14 scrape jobs, 69 alert rules and 26
coverage records**. Its machine-validated P0 section maps all 20 required
alerts to metrics, bounded producers, rules, firing/recovery fixtures,
severity, runbooks, live-evidence requirements and explicit owner
placeholders.

## Current repository-controlled P0 status

| ID | Repository result | Exact evidence | Remaining proof |
| --- | --- | --- | --- |
| CX-P0-01 | PASS locally | Unique project, 30 services, five networks, 12 volumes, loopback-only published ports, no published MongoDB/Redis, 23 long-running containers healthy, three expected exited-zero one-shots (`logs-init`, `mongo-replica-init`, and `mongo-restore-replica-init`), zero restarts, one live Caddy workload process, zero zombies, access-log mode/UID/GID `0600/473/473`, and successful Loki ingestion | Protected Ubuntu target-host render remains staging/live evidence |
| CX-P0-02 | PASS with explicit gaps/blocks | Requested matrix: 81 STATIC PASS, 14 GAP, 12 BLOCKED; API smoke 31/31 and Playwright 7/7 passed; a separate out-of-matrix Phase 5 GAP records that two identities share full-admin authority because no distinct super-admin role exists | Ubuntu UI/device/provider behavior, distinct admin/super-admin role semantics, and the explicit gaps/blocks remain open |
| CX-P0-03 | PASS locally | Signed backup and isolated restore passed for 18 collections, 89 documents, 117 indexes, and one byte-bearing synthetic managed-media file with matching source/restored bytes; all required frontend-probe and `BackupJobFailed` alert exercises fired and resolved in both systems | Protected receiver delivery and human response remain external evidence; local Docker cannot supply the production rule's 19 public HTTPS probes plus two call probes, so `BlackboxProbeCoverageIncomplete` was the sole allowed local baseline |
| CX-P0-04 | PASS locally | Required HTTP/auth/privilege alert fixtures fired and resolved in Prometheus and Alertmanager | Ubuntu threshold tuning and controlled human delivery remain staging evidence |
| CX-P0-05 | PASS for synthetic fixtures only | Queue/provider/email/call fixtures and alert paths passed; optional providers were disabled | Real provider sandbox callbacks and protected receiver delivery remain external evidence |
| CX-P0-06 | PASS locally; review open | Frozen SHA, documentation-only boundary and six successful push/PR workflow executions exist | Final documentation-head verification, independent review and repository-governance approval |

## Current warnings and known limits

The client/backend checks below were run at
`8f1d447f008f996e5e727291b114789bb1614535`; those source trees are byte-for-byte
unchanged at the final runtime SHA. They are not represented as reruns of later
staging-only or VPS-script changes.

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
- Local default Jest passed 114/127 suites and 1,509/1,554 tests; the 13
  database/Redis integration suites and 45 tests were skipped by design.
- A disposable integration run at an earlier superseded candidate passed
  13/13 suites and 45/45 tests, but it is retained only as historical evidence
  and is not claimed as an exact-final-SHA local run.
- No warning, skip, transient service failure or unavailable external evidence
  has been represented as a successful staging or production result.

## Remaining evidence

The local synthetic Docker exercise is complete in
[report 28](./28-local-staging-validation-report.md). No approved Ubuntu
staging deployment, production execution or live-infrastructure validation has
occurred. Required external evidence remains open for:

- approved isolated Ubuntu host/network/storage/database/cache execution;
- migration rollback/interruption/resume cases not covered locally, off-site
  backup custody and an independently witnessed restore rehearsal;
- payment, payout, email, call and identity-provider sandbox callbacks;
- protected receiver delivery, acknowledgement, escalation and retained-log
  retrieval on the approved server;
- live server, DNS, TLS, Tunnel, firewall, runtime identities and time/retention
  validation;
- named owners, access/ruleset decisions, policies and residual-risk approval;
- legal/privacy and clinical review;
- independent VAPT and closure retest;
- Apple and Google signing, physical-device, declaration and store evidence;
- provider/vendor assurance and exit evidence; and
- operational ISO/ISMS/BCM evidence.

The next permissible technical stage is an independently approved isolated
Ubuntu staging review. Public production remains **NOT READY**.
