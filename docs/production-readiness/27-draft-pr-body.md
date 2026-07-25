## Summary

This draft adds a source-controlled, co-host-safe server-staging overlay and
records its complete local validation. It does **not** claim that the shared
Ubuntu server has been inspected, that server staging has been approved or
deployed, or that production is ready.

- Branch: `release/final-production-readiness`
- Previous runtime candidate:
  `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` — superseded
- Frozen runtime candidate:
  `1ecd0b379369258be466159364a8a48c79fb65aa`
- Documentation HEAD: the documentation-only successor commit containing
  this PR-body source; resolve externally from PR #2 with `git rev-parse HEAD`
- Base: `main`
- PR: [#2](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/pull/2)
  is open, draft, unmerged and currently mergeable; auto-merge is disabled
- Complete current-candidate local matrix: **PASS**
- Server discovery/evidence: **NOT COLLECTED**
- Production verdict: **NOT READY**

PR #2 remains open, draft and unmerged. This PR body grants no authority to
merge, deploy, migrate, restore, alter production or change DNS/Cloudflare.

**THIS DRAFT PR IS NOT AUTHORIZATION TO MERGE OR DEPLOY.**

## Runtime freeze

The runtime candidate is frozen at
`1ecd0b379369258be466159364a8a48c79fb65aa`. Any later source, workflow,
test, lockfile, package manifest, migration, deployment script, Compose,
Caddy, monitoring, environment-template or provider-behavior change
invalidates it and requires a new runtime SHA plus complete downstream
validation.

After the freeze, only narrative changes under `docs/**` and
`menorah/docs/**` are allowed. Reviewers should resolve the PR head
externally and verify:

```bash
readonly RUNTIME_SHA='1ecd0b379369258be466159364a8a48c79fb65aa'
git merge-base --is-ancestor "${RUNTIME_SHA}" HEAD
git diff --name-only "${RUNTIME_SHA}..HEAD"
```

Every returned path must be in one of the two documentation trees.

The complete ordered 52-commit runtime ledger, purposes and focused/cumulative
evidence is in
[the immutable candidate record](./26-immutable-candidate-record.md).

## Server-staging design

**SERVER STAGING DESIGN COMPLETE — DISCOVERY REQUIRED**

The new overlay is independent of both production and the pre-existing
`menorah-local-staging` Docker Desktop project.

| Boundary | Server-staging identity |
| --- | --- |
| Compose project | `menorah-staging` |
| Environment identity | `menorah-server-staging-v1` |
| Root | `/opt/menorah-staging` |
| Checkout | `/opt/menorah-staging/app` |
| Environment | `/opt/menorah-staging/env/server-staging.env` |
| Data | `/opt/menorah-staging/data` |
| Backups | `/opt/menorah-staging/backups` |
| Deployment/recovery state | `/opt/menorah-staging/deploy-state` |
| Logs | `/opt/menorah-staging/logs` |
| Database | `menorah_staging` |
| Primary replica set | `menorah-staging-rs` |
| Disposable restore replica set | `menorah-staging-restore-rs` |
| Redis ACL identity | `menorah-staging-app` |
| Networks | Six staging-only networks: ingress, app, data, monitoring, restore and egress; default runtime uses five and recovery adds restore |
| Volumes | 21 staging-only volumes |
| Ingress | Ten staging hostnames; exact Caddy and Tunnel host/target contracts |
| Monitoring | Separate Prometheus, Alertmanager, Loki and Alloy stores; exact staging labels and 20 required P0 alerts |

The proposed network CIDRs and loopback host ports are provisional until
actual server discovery proves them collision-free. MongoDB and Redis publish
no host port. All host-published TCP sockets bind to `127.0.0.1`; the isolated
LiveKit UDP range is also collision-validated.

The egress network is NAT-capable but is not a destination/FQDN allowlist;
approved server firewall or proxy proof remains open. Only Alertmanager, the
four APIs and user web join it; the worker does not. Razorpay secrets are
scoped only to api-ios, RazorpayX only to api-admin, and the Resend webhook
secret only to api-web. Migration, seed and worker receive no provider
secrets. Local loopback LiveKit proof does not replace review of the real
server's media IP/firewall path.

The overlay includes fail-closed environment parsing, project/process
authority checks, exact-SHA image manifests, recorded migration state,
crash-resumable deployment, recorded-artifact rollback, exact-candidate
post-migration resume, quiesced signed backup, disposable restore, synthetic
initialization, runtime verification and controlled P0 alert exercise.

## Collision controls

Static and runtime validators reject overlap across:

- Compose projects, resource prefixes, container/service identities and
  required labels;
- TCP/UDP listeners, loopback bindings and unpublished database/cache ports;
- network names, CIDRs/IP ranges and production network attachment;
- volumes plus canonical app, environment, data, backup, retrieval, restore,
  media, log and deployment-state roots, including symlink escape;
- MongoDB database, host, replica-set, users, exact roles and URIs;
- Redis host, ACL identity and URL;
- Caddy/Tunnel hosts, routes, targets, IDs and tokens;
- backup keys, roots, metadata, locks, `LATEST`, pruning and restore targets;
- deployment manifests, current/last-good/migration/identity/recovery markers
  and locks;
- monitoring targets, labels, stores, receivers and alert routing;
- provider modes/accounts, callback origins, public URL tuple, storage
  buckets, environment files and process authority.

The production metadata fixture reports zero collisions locally. That does not
predict the real host: Step A discovery and Step B human review remain
mandatory.

## Current-candidate local evidence

The complete local matrix passed for the frozen candidate. Its 22 primary
runtime assertions were:

1. clean exact-SHA checkout;
2. overlay render;
3. zero production path/resource references;
4. all-profile build;
5. required service startup;
6. required health;
7. first migration;
8. safe second migration;
9. bounded synthetic seed;
10. backup and disposable restore;
11. all 20 P0 alert contracts/exercise;
12. user, admin, counsellor, browser and API smoke;
13. complete service resource limits;
14. no published MongoDB/Redis ports;
15. localhost-only administrative TCP bindings;
16. staging-only networks and volumes;
17. zero production-fixture collisions;
18. shell syntax;
19. ShellCheck;
20. Compose and Caddy validation;
21. workflow validators; and
22. exact-SHA GitHub readiness, functional and security gates.

Selected exact local results:

- Static isolation: 32 services, six networks, 21 volumes, 117
  loopback-only published port instances, ten ingress hosts, 20 required P0
  alerts and zero fixture collisions.
- All-profile image build: passed.
- Default service graph: 19 named volumes. Retained post-migration runtime:
  26 containers on five networks and 20 volumes (including
  `staging-migration-temp`) — 22 healthy, four expected exited-zero one-shots,
  zero bad state and zero restarts. Recovery/all-profile adds
  `staging-restore-mongodb` and the restore network for 21/six.
- Default-runtime caps: 7,008 MiB memory, 1,984 MiB reservation, 6.30 CPU and
  2,832 PIDs. All-profile static caps: 8,736 MiB, 2,448 MiB reservation,
  7.65 CPU and 3,536 PIDs.
- Migration: 11 applied first run, the same 11 safely skipped second run.
- Synthetic roster: ten users, three counsellors and two applications;
  duplicate seed refused.
- Playwright: 9/9 passed.
- API smoke: 31/31 passed, including admin MFA and exact role authentication.
- Backup: timestamp `20260725T125008Z`; all six writers quiesced and recovered.
- Disposable restore: 18 collections and 59 documents matched, zero failures;
  initializer
  exited zero; no transient recovery container/state remained.
- Alert exercise: all 20 fired and resolved in both Prometheus and
  Alertmanager; 35/35 targets healthy; zero expected active alerts afterward.
- Teardown: zero validation containers, networks and volumes remained.
- Static/QA gates: tracked blobs 1,131/1,131; release contracts 432/432;
  tunnel 22/22; managed Mongo 22/22; monitoring 42/42; Bash 54/54 repository
  and 48/48 workflow scope; actionlint 6/6; ShellCheck 23/23; pinned Linux
  recovery 34/34; rate-limit regression 4/4.
- Security: seven production audit roots passed; Gitleaks found zero leaks in
  427 commits; Semgrep found zero issues across 77 OWASP rules/614 files;
  four Trivy scans found zero HIGH/CRITICAL issues; four CycloneDX SBOMs
  parsed successfully.

The existing `menorah-local-staging` environment was not modified: 26
containers (23 running, three exited zero), five networks and 12 volumes
remained, with exact container-ID set SHA-256
`109629e5dc63c8581268c42bd18765ccd38921aeb50366d8a752019a25c06ff4`.

Prior local observations at
`0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` remain in
[report 28](./28-local-staging-validation-report.md) as superseded history;
their counts were not rewritten or attributed to this candidate.

## Exact-SHA GitHub gates

All three frozen-runtime push workflows are terminal success, with **25/25
jobs and 204/204 steps** and zero failed, skipped or cancelled jobs/steps:

- [Production Release Readiness — run 30158172303, attempt 2](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30158172303):
  1/1 jobs, 11/11 steps.
- [Exact-SHA functional release validation — run 30158172290, attempt 2](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30158172290):
  9/9 jobs, 89/89 steps.
- [Security gates — run 30158172293](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30158172293):
  15/15 jobs, 104/104 steps.

Readiness and functional attempt 1 each failed with zero materialized jobs and
a GitHub internal-server-error annotation. Their workflow blobs were
unchanged, local actionlint passed, and unchanged exact-SHA attempt 2 passed
every job/step. No repository fix or waiver was used. The exact runtime
deployment query returned `[]`.

The documentation-only successor must also have green triggered workflows at
its externally resolved PR head. Passing checks are engineering evidence, not
merge or deployment approval.

## Defects found and closed

The overlay was repeatedly invalidated and corrected when local or GitHub
evidence exposed a defect. Material fixes include exact origin/URL selection,
active-project restore binding, runtime authority, startup contracts,
admin-grant/bootstrap gating, Caddy ownership/probes, private ingress and
monitoring aliases, role/MFA smoke, backup traversal, deployment crash resume
and exact release-gate contexts.

The user, admin and counsellor workspaces now require patched PostCSS
`8.5.18`, closing `GHSA-r28c-9q8g-f849` in the affected lockfiles.

Final commit `1ecd0b379369258be466159364a8a48c79fb65aa` closes
`GHSA-mh99-v99m-4gvg` with a lockfile-only
`brace-expansion@5.0.7` → `5.0.8` update in exactly
`menorah/mobile-app/package-lock.json` and
`menorah/mobile-app/mobile-app/package-lock.json`. All six affected outer and
five affected nested production paths are patched. No manifest, audit policy
or exception changed; the separate bounded
`GHSA-w5hq-g745-h8pq` moderate exception still expires 2026-10-31.

Earlier readiness run `30125885611` and functional run `30125885628` failed
because their release-infrastructure paths did not install backend
dependencies required by a startup-contract import. Those failures were not
waived. Commits `6ff94386187596f841a5cf1742d453b9abc7e69b` and
`a1bc1b6ec751926edc9981f57762277060acf9e4` fixed the two workflow families;
the final exact-SHA runs above are the accepted evidence.

## Server runbook and approvals

Server work is deliberately split:

- Step A — run only the non-mutating discovery script, return redacted output,
  and change nothing.
- Step B — compare actual host metadata to the overlay; require explicit
  collision `PASS` and human approval.
- Step C — only then prepare `/opt/menorah-staging` roots, protected
  staging-only environment/secrets, domains and providers.
- Step D — dry-render Compose/Caddy/Tunnel, limits and collision validators;
  do not start services.
- Step E — only after a second approval, use the guarded wrapper to start
  isolated MongoDB/Redis and application services, run the recorded staging
  migration, create the bounded synthetic roster, and prove health plus
  production invariance.
- Step F — collect Ubuntu ownership, backup/restore,
  migration-interruption/crash-resume/rollback, DNS/TLS/Tunnel,
  alert/human-delivery, systemd/timer, contention and provider-sandbox
  evidence.
- Step G — target only project `menorah-staging`, verify production before and
  after, remove only staging-labelled resources, preserve evidence, and
  require separate explicit approval before deleting staging volumes.

The full procedure and exact inspection-only Step A command are in
[the server-staging design and discovery runbook](./29-server-staging-design-and-discovery-runbook.md).
Do not run Steps C–G now.

## Open blockers

The following remain unproved and are not converted to passes:

- real-server discovery and co-host collision approval;
- approved no-start server dry render after discovery/collision review;
- separately approved server-staging deployment and evidence collection;
- DNS, TLS, Cloudflare Tunnel, firewall and external probe behavior;
- protected secret/key custody and rotation;
- payment, payout/refund, email, call/media, identity and other provider
  sandbox callbacks;
- physical iOS/Android device, restrictive-network, signed-build,
  TestFlight/internal-track and store evidence;
- independent DAST/VAPT, remediation review and closure retest;
- named operational owner/on-call/change authority and approved RTO/RPO;
- legal/privacy retention, consent, processor and data-rights decisions;
- clinical safety/escalation review;
- Apple signing/declarations/store review;
- Google signing/declarations/store review;
- vendor ownership, contract, data-location, security, deletion and exit
  evidence; and
- operational ISO/ISMS/BCM evidence.

## Review links

- [Immutable candidate record](./26-immutable-candidate-record.md)
- [Local validation report](./28-local-staging-validation-report.md)
- [Server-staging design and discovery runbook](./29-server-staging-design-and-discovery-runbook.md)
- [Release runbook](./08-release-runbook.md)
- [Rollback runbook](./09-rollback-runbook.md)
- [Backup and restore runbook](./10-backup-and-restore-runbook.md)
- [Monitoring runbook](./12-monitoring-and-alerting-runbook.md)
- [Evidence index](./staging/13-evidence-index.md)
- [Production go/no-go](./21-production-go-no-go.md)

## Warning

**PRODUCTION IS NOT READY. DO NOT MERGE AND DO NOT DEPLOY.**

**THIS DRAFT PR IS NOT AUTHORIZATION TO MERGE OR DEPLOY.**

PR #2 must remain draft and unmerged. No server discovery, deployment,
migration, backup, restore, DNS/Cloudflare change, production access or
production-data use is claimed.
