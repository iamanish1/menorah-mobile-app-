# Immutable runtime candidate record

Historical frozen-runtime record updated: 2026-07-26.
Android successor status reviewed: 2026-08-03.

Prior repository-remediation verdict (superseded by runtime `1ecd0b379369258be466159364a8a48c79fb65aa`):
**LOCAL STAGING VALIDATION PASSED — SERVER STAGING REQUIRED**

Repository-remediation status: **DISCOVERY OUTPUT COLLECTED — COLLISION REVIEW REQUIRED**

Public-production verdict: **NOT READY**

This record freezes repository-controlled runtime content only. It is not
authorization to merge, deploy, migrate, restore, change infrastructure,
enable providers, submit to a store, or use production data.

## Android 2.7.0 successor status

The Android `2.7.0` integration combines later production, PR #4 feature and
guarded-tooling lineages and therefore requires a new immutable candidate.
The frozen runtime and workflow evidence below remains valid only for the
exact historical SHA it names; it is not Android `2.7.0` release evidence.

The successor candidate SHA, tree, final commit ledger and exact-SHA workflow
runs are pending. Until they are regenerated, independently reviewed and
recorded in [the Android 2.7.0 launch record](./30-android-2.7.0-production-launch.md),
the successor is **NOT READY** and no old run may be promoted or relabelled.

## Frozen identity

| Field | Value |
| --- | --- |
| Branch | `release/final-production-readiness` |
| Previous runtime candidate | `25cd808602020988a09ee9e58cc9d4738cc068c9` — superseded because valid escaped and template systemd unit-file names were still reported as unavailable |
| Earlier superseded runtime (1) | `92c841ac40e75681019689ca59fd1989e6db6f21` — corrected systemd field parsing and ingress mount discovery |
| Earlier superseded runtime (2) | `1ecd0b379369258be466159364a8a48c79fb65aa` — its systemd parser and ingress metadata discovery required correction |
| Starting documentation HEAD for this phase | `eafd8c83167a14c4a979af6014cde8079d25b53c` |
| Runtime candidate SHA | `142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2` |
| Runtime parent SHA | `eafd8c83167a14c4a979af6014cde8079d25b53c` |
| Runtime commit time | 2026-07-26 17:36:28 UTC |
| Commits ahead of `origin/main` at freeze | 188 |
| Documentation HEAD | The documentation-only successor commit containing this record; resolve externally with `git rev-parse HEAD` |
| Runtime-to-docs relationship | Runtime SHA must be an ancestor; every intervening path must satisfy the documentation-only allowlist below |

A Git commit cannot embed its own SHA. The draft PR is therefore the
authoritative external record of the documentation HEAD after the
documentation-only commit is created and pushed. Reviewers must resolve it
with `git rev-parse HEAD` and verify it with the path-diff command below.

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
readonly RUNTIME_SHA='142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2'
git diff --name-only \
  "${RUNTIME_SHA}..HEAD"
```

If any returned path is outside the two allowlisted documentation trees, stop.

## Current candidate-bound GitHub evidence

All three exact-SHA push workflow families for
`142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2` completed successfully. The total
is 25/25 jobs and 204/204 steps, with zero failed, skipped or cancelled
jobs/steps. This is repository automation evidence only; it is not approval to
merge or deploy.

| Event | Workflow | Run | Result |
| --- | --- | --- | --- |
| Push | Production Release Readiness | [30212940956](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30212940956), attempt 1 | PASS, 1/1 jobs and 11/11 steps |
| Push | Exact-SHA functional release validation | [30212940958](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30212940958), attempt 1 | PASS, 9/9 jobs and 89/89 steps |
| Push | Security gates | [30212940952](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30212940952), attempt 1 | PASS, 15/15 jobs and 104/104 steps |

The successful push evidence for superseded runtimes
`1ecd0b379369258be466159364a8a48c79fb65aa`,
`92c841ac40e75681019689ca59fd1989e6db6f21` and
`25cd808602020988a09ee9e58cc9d4738cc068c9` is historical only. It cannot be
relabelled as evidence for this runtime because the discovery executable and
its regression tests changed.

The GitHub deployment query for the exact runtime SHA returned `[]`; neither
the workflows nor this validation used a production environment.

The documentation-only successor must pass all workflows triggered for its own
SHA. Those future results belong to the documentation HEAD, not to the frozen
runtime candidate, and must be recorded externally in PR #2 after the commit
exists. PR #2 remains draft and unmerged.

## Runtime commit ledger

The 55 runtime/configuration commits from the previous candidate to the frozen
successor are listed in order. Each commit invalidated the earlier runtime
candidate for its affected scope; no intermediate SHA is a release candidate.
The evidence column names the proportionate regression or cumulative gate used
before progressing. The final cumulative evidence is recorded after the table.

| # | Full SHA | Purpose | Proportionate test/evidence |
| ---: | --- | --- | --- |
| 1 | `ce429f153cd399e4955607c5c9f81ca82a2b82ea` | Add the co-host-safe server-staging overlay | Static render/isolation contracts and focused server-staging tests |
| 2 | `fbfb262473ddfedda35cd0fe5ce23f120dfd5471` | Isolate deployment, backup, restore and recovery state | Recovery/deploy marker and path contracts |
| 3 | `0e1d69ad548364edb05ceb808a8bb7c4d9be2d8e` | Add server-staging isolation validation | Collision fixture and no-production-reference tests |
| 4 | `d2ddbf7dbe6f9c202b4081d459b1b96093b58923` | Admit only exact staging frontend origins | Origin-policy focused regression tests |
| 5 | `2917c75b22e785f7c4294329232e187286778653` | Reject crossed staging origin selectors | Negative selector/origin tests |
| 6 | `f3c588f207b2ee4dfa462a6a13bc7bb96c491cc0` | Bind restore to the active exact Compose project | Restore project-identity regression |
| 7 | `6a333cf2262183a045667a8f5b2e88ea635c9612` | Harden runtime preflight | Environment, authority, path and runtime preflight tests |
| 8 | `e97e4488a570916b0a460507b3e0592f5286772f` | Exercise all required server-staging P0 alerts | Alert fixture tests and live fire/resolve exercise |
| 9 | `28a4d656c2999656aaf6674a383a37ebc891121e` | Validate the exact public/internal URL tuple | URL-tuple positive and negative tests |
| 10 | `c64a916430e60c3ec9ed1c2c07dcb47a47eacc41` | Align generated startup contracts | Generated environment and service startup validation |
| 11 | `4a5a58205698eecbd77e8a3e42a33809a2ba4a0c` | Isolate staging mail-routing variables | Mail-routing environment regression tests |
| 12 | `50d980db9c3f63c63eff6cc4cb794c9c8265de82` | Bound initializer reservation | Initializer lifecycle/one-shot regression |
| 13 | `0c339ab9f114ae0c734921f22c38a771b66bea69` | Generate exact staging admin grants | Admin grant and role-boundary tests |
| 14 | `ecfcb2b1114165a77f29b0c5cb044d1f5e036b00` | Gate staging admin-authority bootstrap | Bootstrap acknowledgement and negative authority tests |
| 15 | `8065ced937a2db2989ba0bd4dd591cc0a7ea4cfe` | Initialize isolated Caddy state ownership | Container ownership/startup regression |
| 16 | `7c3a0a20e7edb73c4233700efd52f12bbf34a703` | Probe staging Caddy without TLS ambiguity | Caddy health/probe validation |
| 17 | `d0fa44fad20c6dc213a5252bb3ef5a3b8e789e4d` | Pass synthetic-only credentials to the seed | Seed and duplicate-refusal tests |
| 18 | `198e60d1ae72ce48d3b022165178a13c045f6003` | Route ingress through private staging aliases | Ingress target and network isolation tests |
| 19 | `152c1953ea5cada62c039b44a8760bfe550f3b31` | Stabilize admin MFA smoke behavior | Playwright/admin MFA regression |
| 20 | `61abafb65960f40d17a484dafde9590a594681e5` | Grant backup read traversal only within staging roots | Backup permission and retrieval regression |
| 21 | `b71b7a9e91835779fdd636058035033dac405e03` | Route monitoring through private staging aliases | Full target-health and alert-baseline tests |
| 22 | `d4547957570ae2cea3414f16c22ae7c22e09b7bb` | Authenticate exact staging user roles | API role-auth smoke tests |
| 23 | `234cd67ef8b8152f79d864dfc62f5ae4c84e9fb8` | Make deployment crash-resumable | Migration/crash-resume/marker regression |
| 24 | `388a8b274eaa22a888dece7fc2085838b9df2c0f` | Enforce process and project isolation authority | Shell authority guards and isolation tests |
| 25 | `079b68113691515ee2a8ac7c773a908e27cc3ac5` | Pin patched user-web PostCSS | Lockfile regression and production dependency audit |
| 26 | `8824575920f20103c214493fb352d072cd43973a` | Resolve server-staging wrapper ShellCheck defect | ShellCheck on all staging wrappers |
| 27 | `3e5985130950efa67c7d8518304af1a12b0be850` | Pin patched admin PostCSS | Lockfile regression and production dependency audit |
| 28 | `c26a0de254ea81fbece0ff723bc1757ca632e4c8` | Require all three release-gate contexts | Branch-protection validator tests, 65/65 at that revision |
| 29 | `78baad6fad9eb7bc004d67c1101cbe2286e29ced` | Pin patched counsellor PostCSS | Lockfile regression and production dependency audit |
| 30 | `6ff94386187596f841a5cf1742d453b9abc7e69b` | Install backend dependencies in readiness workflow | Release validator 66/66 and action syntax; invalidated failed run `30125885611` |
| 31 | `a1bc1b6ec751926edc9981f57762277060acf9e4` | Install backend dependencies in functional workflow | Functional validator 12/12, action syntax, and then-current exact-SHA gates; superseded by rows 32-52 |
| 32 | `ee2af00e0b8a6ec2e47381ec90b716d9f1872533` | Harden read-only server discovery | Discovery script and discovery-test regressions for fail-closed, allow-listed, redacted metadata |
| 33 | `6ac0e1daaa2a5d3f28cd5440c99e6d2041b85673` | Seed only the first server-staging deployment | Deploy/resume wrappers and recovery regressions for first-only bounded seed disposition |
| 34 | `39e90e255d9cc92ff5aef18af387ba0bead14950` | Require protected staging alert delivery | Environment, Alertmanager/preflight, Compose, deploy/recovery/validation/discovery scripts and server-staging contracts |
| 35 | `87b2732aec08ba6c2693d66d5cea3df9b6421a15` | Pin discovery executable authority | Discovery script/test hostile-PATH and inherited-function regressions |
| 36 | `96874678b27b087ca44d86e762c941aa89515560` | Serialize server-staging migrations | Migration runner plus direct/inherited-lock and contention tests |
| 37 | `fa3e9c0f9d019db819c39ce84ff78bb61e334239` | Gate real synthetic provider sandboxes | Backend deployment/email/media/startup and user-web landing-email source/tests |
| 38 | `badb7a49266f475cc4194b5442d8585ce7a04da8` | Harden backup and recovery authority | Context/backup/restore/wrapper scripts plus backup, recovery and restore-sequencing contracts |
| 39 | `3873e017a448e25053d1fe2c2d819dfbb5341e73` | Tighten per-service provider scopes | Backend/user-web provider configuration and positive/negative role-scope tests |
| 40 | `15e756d421774a0e081924aae4ef5d8c15407246` | Add bounded staging provider egress | Environment, Compose, generator/validators and six-network isolation tests |
| 41 | `7d52277e934dd5ef71add81c22347e65becfb96d` | Make the isolation fixture path caller-independent | One server-staging isolation test file; alternate-working-directory regression |
| 42 | `df15b91c38dea2cff6e0318528560cd8a3980b0a` | Serialize privileged backup/recovery sessions | Context/deploy/backup/restore/migration/rollback/resume scripts and lock/session/recovery suites |
| 43 | `108c62e48538e31fd9efe019c8bf823cc124589b` | Share the non-secret booking catalog safely | Compose/validator/isolation test and drift mutation |
| 44 | `520da46b6a97871805b2472f14d0f97a4adaf56b` | Keep staging manifests machine-readable | Compose/validator/isolation test for writable temporary HOME only |
| 45 | `8acfd15f7eface8135182a38371fcf8302ce6ae0` | Isolate distributed rate-limit namespaces | Backend startup service plus focused 4/4 client-IP/rate-limit tests |
| 46 | `343c36bb19a764ac5d52d4f27ce992de8355573d` | Make the staging monitoring baseline truthful | Alert rules/exercise, blackbox/Prometheus and isolation regressions; 69-rule and 20-alert/35-target proof |
| 47 | `a319fc31437481e73b033d0eefc51ee432556e7e` | Stabilize isolated API smoke transport | Smoke runner/safety test; exact API smoke 31/31 |
| 48 | `5ec3345131594b5f71d7b383371a02144ea7a5e2` | Gate ingress on TLS readiness | Compose/validator/isolation tests for all ten exact HTTPS health probes |
| 49 | `215ffc3fe8e94a71cebe236b18c7359b230f2619` | Make staging storage initialization repeat-safe | Compose/validator/isolation capability and lifecycle regressions |
| 50 | `299fbf5060392a1ed934bf8448be16057f4194a0` | Harden the TLS-readiness contract | Compose/validator/isolation proxy, unique-host and security-option regressions |
| 51 | `fbf2611fe537728f590285fbf83aef04a03e60df` | Run staging recovery checks with Bash | One recovery-test file; pinned Linux recovery reproduction 34/34 |
| 52 | `1ecd0b379369258be466159364a8a48c79fb65aa` | Patch the mobile brace-expansion advisory | Exactly two mobile lockfiles; clean installs, dependency/audit policy, lint/typecheck, payment 7/7, release 21/21 and Doctor 19/19 |
| 53 | `92c841ac40e75681019689ca59fd1989e6db6f21` | Correct read-only systemd parsing and production ingress metadata discovery | Discovery regressions, full 293-test server-staging contract, Bash syntax, pinned ShellCheck, and all three exact-SHA push gates (25/25 jobs; 204/204 steps) |
| 54 | `25cd808602020988a09ee9e58cc9d4738cc068c9` | Emit a single explicit result for genuine systemd/D-Bus unavailability | Discovery regressions, full 293-test server-staging contract, Bash syntax, pinned ShellCheck, and all three exact-SHA push gates (25/25 jobs; 204/204 steps) |
| 55 | `142b18a6e82843ad02c46e8cd61d9db3f1bfb3a2` | Recognize valid systemd escaped and template units without loosening command safety | Escaped/template discovery regressions, exact-host read-only result, full 293-test server-staging contract, Bash syntax, pinned ShellCheck and all three exact-SHA push gates (25/25 jobs; 204/204 steps) |

The PostCSS pins address the high-severity advisory
`GHSA-r28c-9q8g-f849` by requiring patched `8.5.18` in all affected web
workspaces. Readiness run `30125885611` and functional run `30125885628` at
the earlier runtime were valid defect evidence: both failed because their
release-infrastructure paths installed QA dependencies but not backend
dependencies needed by a startup-contract import. Security run `30125885593`
passed at that SHA. Commits 30 and 31 fixed the two workflow families
independently; only the final three green runs above are candidate evidence.

The final lockfile-only change closes `GHSA-mh99-v99m-4gvg`: all six affected
outer and five affected nested production paths now resolve
`brace-expansion@5.0.8`, with no affected `5.0.7` path remaining. The exact
lockfile SHA-256 values are
`a19056cd9fcb846b0c0b756b4bb59e9bcba3641a6a938d7add0286b609ee16fe`
and
`38607bcc0c875dddf0cb07001539589d2dfc1d6e07da1794c1ee61fdf5b142b6`.
No manifest, audit policy or advisory exception changed. The bounded
`GHSA-w5hq-g745-h8pq` moderate exception remains the only accepted mobile
production finding and expires 2026-10-31.

Runs `30141803123`, `30141803116` and `30141803110` at intermediate SHA
`299fbf5060392a1ed934bf8448be16057f4194a0` are defect evidence only: the
first two exposed the Windows-shell recovery-test issue and the newly
disclosed brace advisory; security also failed the advisory gate. Commits 51
and 52 corrected those defects, so none of the intermediate runs is relabelled
as final-candidate evidence.

## Current candidate local evidence

The candidate-specific correction passed focused discovery regressions, the
complete 293-test server-staging contract in an isolated temporary worktree,
Bash syntax for every release shell script, and the repository's pinned
ShellCheck image. The exact-SHA push evidence above completed all three
workflow families. The exact immutable blob was then run read-only on the
Ubuntu host at `2026-07-26T17:38:28Z`: its script checksum was
`8e23ecfb2d1a42f429e66ea618b15b09360f568010e5859666ec4063175e8f45`, its
redacted output digest was
`07f8e8a7ce914d028672ccd83aa0e14332d4373c361e31ab20ad11a77d6e5258`, and it
ended `discovery=complete`. This is collected discovery output, not a
collision-review PASS or approval to prepare, dry-render or deploy staging.

### Historical `1ecd0b379369258be466159364a8a48c79fb65aa` local baseline

The complete requested local matrix passed for the superseded runtime
`1ecd0b379369258be466159364a8a48c79fb65aa`. This is local Docker and
repository evidence, not Ubuntu-server evidence.

- Blob parity matched 1,131/1,131 tracked entries. Repository Bash syntax
  passed 54/54 scripts (48/48 in workflow scope), actionlint passed 6/6
  workflows, ShellCheck passed 23/23 selected scripts, pinned Linux recovery
  passed 34/34, and the rate-limit regression passed 4/4.
- Release/workflow contracts passed 432/432: 81 workflow/clean-checkout
  assertions, 59 local-staging contracts and 292 server-staging contracts.
  Tunnel and managed-Mongo groups passed 22/22 each; monitoring passed 42/42
  and validated 14 scrape jobs, 69 alert rules and 26 coverage records.
- Static all-profile isolation reported 32 services, six networks, 21 volumes,
  117 published-port instances all bound to loopback, ten ingress hosts,
  20 required P0 alerts and zero production-fixture collisions. Its aggregate
  static limits were 8,736 MiB memory, 2,448 MiB reservation, 7.65 CPU and
  3,536 PIDs. The tracked Compose definition SHA-256 is
  `a04f8e7e56e25aad8f2a60ac89416a597deef164c4aace06514dec2563e07601`;
  the local all-profile rendered output (not retained because it resolves
  secret-bearing inputs) hashed to
  `dc26eeee17b5ff744dcdb8fcf7dce196670014479d1007f57fef7434969a9bc5`.
- The default service graph references 19 named volumes. After the required
  migration/seed lifecycle, the retained default runtime had 26 containers on
  five networks and 20 volumes, including the retained
  `staging-migration-temp` volume: 22 healthy long-running services and four
  expected exited-zero one-shots, with zero restarts. The recovery/all-profile
  model adds `staging-restore-mongodb` as the 21st volume and the restore
  network as the sixth network. Default limits were 7,008 MiB memory,
  1,984 MiB reservation, 6.30 CPU and 2,832 PIDs. MongoDB and Redis published
  no host ports.
- Migration applied 11 entries on the first run and safely skipped the same
  11 on the second. The bounded synthetic seed created 10 users,
  three counsellors and two applications, then refused a duplicate run.
- Playwright passed 9/9 and API smoke passed 31/31, including admin MFA and
  exact role authentication. All ten exact staging HTTPS hosts returned the
  intended health response through the local Caddy diagnostic boundary.
- Quiesced, signed and encrypted backup `20260725T125008Z` stopped and
  recovered all six writers. Disposable restore matched 18 collections and
  59 documents with zero failed records; source and restored synthetic media
  bytes matched.
- All 20 P0 alerts fired and resolved in Prometheus and Alertmanager. The
  exercise ended with 35/35 targets healthy, zero Prometheus alerts and zero
  active Alertmanager alerts.
- All seven production dependency-policy roots passed. Gitleaks scanned
  427 commits with zero leaks; Semgrep ran 77 OWASP rules across 614 tracked
  files with zero findings; all four exact-candidate images had zero
  HIGH/CRITICAL Trivy findings; and four valid CycloneDX 1.6 SBOMs were
  generated (813, 846, 644 and 724 components).
- Exact teardown left zero validation containers, networks and volumes. The
  pre-existing `menorah-local-staging` baseline remained exactly 26 containers
  (23 running, three exited-zero), five networks and 12 volumes; its exact
  container-ID set SHA-256 remained
  `109629e5dc63c8581268c42bd18765ccd38921aeb50366d8a752019a25c06ff4`.

The exact functional-run artifacts add these candidate-bound totals:
backend default 117/117 suites and 1,716/1,716 tests; disposable integration
13/13 suites and 45/45 tests with no skips; user/admin/counsellor lint,
type-check and builds (36, 22 and 11 generated pages); and mobile lint with
zero errors/1,480 warnings, type-check, payment policy 7/7, release
configuration 21/21 and Expo Doctor 19/19. Existing web warnings are bounded:
three user-web image recommendations, seven admin image recommendations plus
two hook warnings, and 19 counsellor warnings. No warning was converted into
a pass condition.

### Current bounded warnings and exceptions

- Mobile lint completed with zero errors and 1,480 existing inline-style
  warnings. Expo Doctor passed 19/19 while noting the intentional
  `appConfigFieldsNotSyncedCheck` disablement and stale baseline-browser
  compatibility data.
- User web emitted three existing `next/image` recommendations. Admin web
  emitted seven existing `next/image` and two React hook warnings. Counsellor
  web emitted 19 lint warnings plus the Next.js middleware-convention
  deprecation.
- Caddy reported that the explicit `header_up X-Forwarded-For` setting is
  unnecessary under its default proxy behavior. Backend tests emitted the
  known Mongoose warning for the reserved `errors` schema key.
- Gitleaks could not identify the SCM platform, which affects generated
  finding links only; it still scanned 427 commits and reported zero leaks.
  Semgrep advertised an update and optional authenticated rules; it still
  completed the pinned 77-rule OWASP scan with zero findings. Trivy noted that
  Alpine 3.24 is not yet in its EOL list; all four pinned image scans completed
  with zero HIGH/CRITICAL findings.
- Raw all-dependency install output is not the production-policy result: the
  outer and nested mobile installs reported 11 moderate/20 high and
  10 moderate/4 high findings respectively, while counsellor/admin build
  installs reported 1 moderate/5 high and 2 high. All seven production-scope
  audit-policy roots passed. The only accepted production finding is the
  constrained `GHSA-w5hq-g745-h8pq` moderate `uuid` path: 11 outer and 10
  nested audit records under the existing exception expiring 2026-10-31.
- The two zero-job GitHub first attempts are recorded above as transient
  GitHub job-materialization failures. Only the successful attempts are
  candidate evidence.

No warning, raw all-dependency count, or transient external failure was
suppressed, downgraded or converted into a pass.

The prior read-only Ubuntu discovery attempt ended with
`discovery=incomplete`: it misparsed systemd unit rows and omitted the active
production Caddy mount source. It is historical only. The replacement exact
blob completed with the redacted digest recorded above, after safely reporting
the host's escaped cryptsetup unit and template unit. No container, migration,
backup, restore, DNS/Tunnel change or deployment was performed. Discovery
output is collected, but collision review, either human approval and the
no-start dry render remain **NOT COLLECTED** under
[runbook 29](./29-server-staging-design-and-discovery-runbook.md).

## Earlier superseded runtime and documentation evidence

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
`3fb99858c6766a341bb7b7dab2377195427f0ea1`, not the current runtime
candidate. They are retained for traceability and are **INVALIDATED** as
evidence for `1ecd0b379369258be466159364a8a48c79fb65aa`. Do not relabel their
result, test totals or artifacts.

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

## Superseded `0b9f6e4` local P0 status

The observations in this table were recorded for
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`. They are preserved without
rewriting as historical local evidence and are not current-candidate or
server evidence.

| ID | Historical repository result | Historical exact evidence | Remaining proof |
| --- | --- | --- | --- |
| CX-P0-01 | PASS locally | Unique project, 30 services, five networks, 12 volumes, loopback-only published ports, no published MongoDB/Redis, 23 long-running containers healthy, three expected exited-zero one-shots (`logs-init`, `mongo-replica-init`, and `mongo-restore-replica-init`), zero restarts, one live Caddy workload process, zero zombies, access-log mode/UID/GID `0600/473/473`, and successful Loki ingestion | Protected Ubuntu target-host render remains staging/live evidence |
| CX-P0-02 | PASS with explicit gaps/blocks | Requested matrix: 81 STATIC PASS, 14 GAP, 12 BLOCKED; API smoke 31/31 and Playwright 7/7 passed; a separate out-of-matrix Phase 5 GAP records that two identities share full-admin authority because no distinct super-admin role exists | Ubuntu UI/device/provider behavior, distinct admin/super-admin role semantics, and the explicit gaps/blocks remain open |
| CX-P0-03 | PASS locally | Signed backup and isolated restore passed for 18 collections, 89 documents, 117 indexes, and one byte-bearing synthetic managed-media file with matching source/restored bytes; all required frontend-probe and `BackupJobFailed` alert exercises fired and resolved in both systems | Protected receiver delivery and human response remain external evidence; local Docker cannot supply the production rule's 19 public HTTPS probes plus two call probes, so `BlackboxProbeCoverageIncomplete` was the sole allowed local baseline |
| CX-P0-04 | PASS locally | Required HTTP/auth/privilege alert fixtures fired and resolved in Prometheus and Alertmanager | Ubuntu threshold tuning and controlled human delivery remain staging evidence |
| CX-P0-05 | PASS for synthetic fixtures only | Queue/provider/email/call fixtures and alert paths passed; optional providers were disabled | Real provider sandbox callbacks and protected receiver delivery remain external evidence |
| CX-P0-06 | PASS locally; review open | Frozen SHA, documentation-only boundary and six successful push/PR workflow executions exist | Final documentation-head verification, independent review and repository-governance approval |

## Superseded local warnings and known limits

The client/backend checks below were run at
`8f1d447f008f996e5e727291b114789bb1614535`; those source trees are byte-for-byte
unchanged at the former `0b9f6e4` runtime. They are preserved as historical
observations, not represented as reruns at the successor SHA.

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

The next permissible technical stage is independent collision review of the
collected redacted output under
[runbook 29](./29-server-staging-design-and-discovery-runbook.md). Do not
repeat discovery unless that review requires it, and make no server change.
Collision review and explicit human approval must precede preparation; a
second approval must precede any server-staging deployment. Public production
remains **NOT READY**.
