# Local synthetic staging validation report

Report date: **2026-07-24 (Asia/Dubai)**

Runtime candidate: `48fb83c248b0e969e699433a8bacdd276ed4311d`

Branch: `release/final-production-readiness`

This report covers only the isolated Docker Desktop environment on the local
development workstation. It does not authorize a production connection,
production migration or restore, merge, deployment, provider activation,
mobile-store submission, or use of real user data.

Status terms used below are deliberately distinct:

- **RUNTIME PASS** means the stated assertion was exercised against the pinned
  runtime candidate in the local Compose project.
- **STATIC PASS** means a current repository assertion, validator, or unit test
  passed, but the full external or end-to-end behavior was not exercised.
- **GAP** means an executable assertion or retained evidence is incomplete.
- **BLOCKED** means the required external system, independent reviewer, Linux
  host capability, policy decision, or safe topology was unavailable.

## 1. Local staging identity

| Field | Candidate-bound record |
| --- | --- |
| Branch | `release/final-production-readiness` |
| Runtime candidate | `48fb83c248b0e969e699433a8bacdd276ed4311d` |
| Documentation revision | The documentation-only descendant containing this report; its exact SHA is recorded in PR #2 after commit because a commit cannot contain its own SHA |
| Docker Desktop | `4.64.0` |
| Docker Engine / client | `29.2.1` / `29.2.1` |
| Compose project | `menorah-local-staging` |
| Compose definition | `menorah/deploy/local-staging/compose.yml` |
| Host | Local Windows development workstation |
| Generated environment digest | SHA-256 `00b3f97c22017a39be5b8b2f66112fe1e5f49b066b430670eed1a8dbc91fd60a`; values were not recorded |
| Rendered Compose digest | SHA-256 `f0e519a4ae667fb400b215451a95db80a7198a0983b9940d2d2fcace68a0fe5c` |
| Environment contract | 194 keys validated; `syntheticOnly=true`; optional providers disabled |
| Production access | **RUNTIME PASS:** no production database, Redis, environment file, provider account, domain, volume, network, or data was used |
| Isolation verdict | **RUNTIME PASS:** unique project, Docker-managed storage, loopback-only published ports, synthetic identities only |

The all-profile rendered model contained exactly 29 services:
`mail-capture`, `mongo-primary`, `mongo-replica-init`, `redis`, `api-ios`,
`admin-panel`, `api-admin`, `api-android`, `api-web`, `web-app`, `livekit`,
`user-web-app`, `worker`, `caddy`, `loki`, `mongodb-exporter`, `alloy`,
`mongo-restore`, `mongo-restore-replica-init`, `restore-job`, `alert-sink`,
`alertmanager`, `redis-exporter`, `blackbox-exporter`,
`migrate-local-staging`, `alert-fixture`, `backup-job`, `prometheus`, and
`seed-local-staging`.

| Inventory | Exact result |
| --- | --- |
| Networks | 5: `menorah-local-staging`, `menorah-local-staging-data`, `menorah-local-staging-ingress`, `menorah-local-staging-monitoring`, `menorah-local-staging-restore` |
| Volumes | 12, all prefixed `menorah-local-staging-`: `alertmanager`, `alloy`, `backups`, `logs`, `loki`, `mongo`, `prometheus`, `redis`, `restore-media`, `restore-mongodb`, `retrieval`, `uploads` |
| Published sockets | 15 TCP and 101 UDP bindings; all host addresses were exactly `127.0.0.1` |
| Non-loopback bindings | 0 |
| MongoDB / restore-MongoDB / Redis published ports | 0 |
| Production host paths or Docker socket | 0 |

## 2. Images, deployment, and health

| Item | Result | Exact evidence |
| --- | --- | --- |
| Full all-profile build | **RUNTIME PASS** | All 11 project-built image targets completed at the final runtime SHA; exit `0`; 108.73 seconds |
| Image identity | **RUNTIME PASS** | Project images were inspected by immutable image ID; upstream images remained digest-pinned. The shared backend image began `sha256:559317`; no mutable production image was used |
| Core start | **RUNTIME PASS** | MongoDB, Redis, and core applications reached their gate in 18.07 seconds |
| Full-profile start | **RUNTIME PASS** | `docker compose up --wait` completed in 56.1 seconds |
| Container inventory | **RUNTIME PASS** | 26 retained containers: 23 running and healthy; 3 expected successful one-shots exited |
| Expected exited one-shots | **RUNTIME PASS** | `migrate-local-staging`, `mongo-replica-init`, and `mongo-restore-replica-init`, each exited `0` |
| Running unhealthy | **RUNTIME PASS** | 0 |
| Restart counts | **RUNTIME PASS** | 0 restarts across every retained container |
| Resource sample | **RUNTIME PASS, bounded observation only** | Application containers used approximately 57–83 MiB each within 1 GiB limits; primary MongoDB approximately 208 MiB, Prometheus 89.8 MiB, restore MongoDB 104 MiB; the largest momentary CPU sample was Redis exporter at 5.03% |

The migration container inherited an application health check and therefore
appeared `unhealthy` in its historical Docker health field after it had
already exited successfully. It was not a running unhealthy service.
Intermediate build/start defects are retained in section 10 and were not
silently relabelled as first-run success.

## 3. Migration and database results

| Requirement | Result | Exact evidence |
| --- | --- | --- |
| Migration ordering and current repository guards | **STATIC PASS** | Final `npm run test:release-workflow`: 75/75 release assertions plus 52/52 local-staging assertions, 127/127 total |
| First migration run | **RUNTIME PASS** | 11 migrations applied; exit `0`; 9.24 seconds |
| Second migration run | **RUNTIME PASS** | The same 11 migrations were recognized and skipped; exit `0`; 6.61 seconds |
| Migration ledger | **RUNTIME PASS** | 11 ledger entries; indexes `_id_` and `migration_name_unique` |
| Seeded database structure | **RUNTIME PASS** | 18 collections and 117 indexes after seed |
| First synthetic seed | **RUNTIME PASS** | 10 users, 3 counsellors, 2 counsellor applications, 15 total roster records; 13.90 seconds |
| Duplicate seed | **RUNTIME PASS, expected rejection** | Exit `1` with `LOCAL_STAGING_ROSTER_ALREADY_PRESENT`; 13.90 seconds |
| Synthetic roster | **RUNTIME PASS** | Two user aliases; approved, draft, and suspended counsellors; support, finance, content, and two full-admin aliases; 10 safe identity aliases total |
| Managed local Mongo identities | **STATIC PASS** | 22/22 identity-validator assertions on unchanged identity scripts; no role credential was printed |
| Normal API startup is non-destructive | **STATIC PASS plus runtime observation** | Release guards passed; normal API restarts did not rerun seed or change the migration ledger |
| Post-restore main database invariant | **RUNTIME PASS** | Main local database remained at 18 collections, 51 documents, 117 indexes, 10 users, 3 counsellors, and 11 migration records |

The final count includes only synthetic fixture and operational records
created inside this project. No production record or credential was inspected
or copied.

## 4. Backup, restore, and recovery results

| Requirement | Result | Timing / evidence |
| --- | --- | --- |
| Backup refuses with writers active | **RUNTIME PASS** | Exit `1`; exact safe reason: `application writers must be explicitly quiesced` |
| Failure alert | **RUNTIME PASS** | `BackupJobFailed` became firing in both Prometheus and Alertmanager after the applicable rule-evaluation interval |
| Exact writer quiescence | **RUNTIME PASS** | `api-ios`, `api-android`, `api-web`, `api-admin`, and `worker` were all proven exited |
| Encrypted and signed backup | **RUNTIME PASS** | Stamp `20260724T040533Z`; AES-256-CBC/PBKDF2 archive creation completed in 14.23 seconds; HMAC and content hashes verified without recording keys |
| Managed-media manifest | **RUNTIME PASS** | Manifest hash and media inventory verified; no media content was copied into this report |
| Separate retrieval storage | **RUNTIME PASS** | Docker volume `menorah-local-staging-retrieval` was used and its retrieved copy verified |
| Isolated restore target | **RUNTIME PASS** | Separate restore network plus `restore-mongodb` and `restore-media` volumes; restore target was `mongo-restore`, never the main local database |
| Restore | **RUNTIME PASS** | Exit `0`; 18.97 seconds; 18 collections, 51 documents, 117 indexes; 0 document failures; manifest matched |
| Main local database untouched | **RUNTIME PASS** | Final main-database counts exactly matched the pre-restore invariant |
| Writer recovery | **RUNTIME PASS** | All five writer services returned healthy; measured writer outage 29.44 seconds |
| Failure-alert resolution | **RUNTIME PASS** | Successful quiesced backup cleared `BackupJobFailed` in both Prometheus and Alertmanager |
| Local recovery-point boundary | **RUNTIME PASS, local definition only** | The proved recovery point is the signed snapshot stamped `20260724T040533Z`; this is not an approved business RPO |
| Local recovery time | **RUNTIME PASS, local definition only** | Restore 18.97 seconds; writer outage 29.44 seconds; backup creation 14.23 seconds |
| Migration rollback/resume invariants | **STATIC PASS** | Current release/local-staging guard suite passed 127/127, including guarded ordering and recovery-contract assertions; destructive Linux fault injection was not run on Windows |
| Disposable coordinated restoration | **RUNTIME PASS** | Restore completed against isolated disposable services and storage |

The restore emitted a non-blocking `mongosh` warning when it attempted to
create `/data/db/.mongodb`; the process still exited `0` and every document,
index, signature, manifest, and isolation invariant passed. Earlier recovery
attempts that exposed signature-stream and tar-ownership defects were
invalidated; their fixes and reruns are in section 10.

Protected off-host custody, key recovery by an independent operator, host-loss
recovery, repeated samples, and an approved business RPO/RTO remain
**BLOCKED** until server staging.

## 5. Functional category counts

The requested case-level specification remains in
[`staging/05-staging-functional-qa.md`](./staging/05-staging-functional-qa.md).
The counts below are a static assertion mapping; they must not be read as 107
manual end-to-end journeys. No requested assertion was marked as a pass merely
because its external provider was disabled.

| Category | Requested | Static pass | Fail | Blocked | Gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Authentication | 15 | 10 | 0 | 0 | 5 |
| Authorization | 8 | 7 | 0 | 1 | 0 |
| Counsellor lifecycle | 10 | 9 | 0 | 0 | 1 |
| Booking | 12 | 12 | 0 | 0 | 0 |
| Payment and payout | 19 | 13 | 0 | 6 | 0 |
| Chat and calls | 12 | 9 | 0 | 3 | 0 |
| Privacy | 10 | 9 | 0 | 0 | 1 |
| Web/API | 11 | 5 | 0 | 0 | 6 |
| Security | 10 | 7 | 0 | 2 | 1 |
| **Total** | **107** | **81** | **0** | **12** | **14** |

The principal gaps are positive registration, invalid user OTP and resend
throttling, incorrect-password UI coverage, counsellor self-approval
automation, no-gender automation, complete OTP/provider journeys,
authenticated chat/call UI, responsive cross-browser coverage,
accessibility, bounded load, and upload hardening. The blocked cases require
two-person payout controls, refund and duplicate-refund provider behavior,
payout completion/reconciliation, real provider/media/fallback behavior, full
history/independent security review, and DAST/VAPT.

Supporting executable evidence at the final runtime SHA includes 127/127
release/local-staging guard assertions, 31/31 API-smoke assertions, and 7/7
Playwright assertions. Earlier unchanged-source test evidence also recorded
1,509 passed and 45 intentionally skipped backend assertions with 0 failures;
the 45 belong to 13 database/Redis integration suites and are not promoted to
runtime passes here.

## 6. Provider stubs and sandbox boundaries

| Provider boundary | Local mode | Result | Required server/external proof |
| --- | --- | --- | --- |
| Payment/order/webhook | Optional provider disabled; deterministic repository fixtures only | **STATIC PASS** for fail-closed configuration; no live payment | Approved Razorpay test-account callbacks, retries, reconciliation, refunds |
| Payout | Disabled | **BLOCKED** for end-to-end payout | RazorpayX sandbox, distinct finance actors, fresh MFA, dual control, provider reconciliation |
| Email/OTP | Internal synthetic mail capture | **RUNTIME PASS** for local capture and synthetic MFA; **GAP** for full OTP matrix | Approved staging-domain delivery, resend, bounce/outcome, provider incident path |
| Calls/media | Local LiveKit test service | **RUNTIME PASS** for service health and API boundaries; **BLOCKED** for devices/fallback | Physical devices, restrictive networks, approved regional fallback and failure path |
| Face/social/cloud media | Disabled | **RUNTIME PASS** for disabled configuration only | Vendor, legal, privacy, clinical, retention, deletion, quota, and failure evidence |

No production provider credential, live transfer, real bank destination, real
recipient, face image, clinical data, or other personal data was used.

## 7. Alert firing and resolution

The final exercise evaluated the actual Prometheus rules and actual
Alertmanager routing. A deterministic local fixture supplied synthetic
failure signals; it did not call a real provider. All 20 required alerts were
observed firing in both systems and subsequently resolved.

| Alert | Prometheus | Alertmanager | Resolution |
| --- | --- | --- | --- |
| `WorkerQueueBacklogHigh` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `BackupJobFailed` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `PaymentProviderFailure` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `PaymentWebhookFailure` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `EmailDispatchFailed` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `EmailDeliveryOutcomeFailed` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `CallProviderFailure` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `CallMediaFailure` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `PrivilegedRoleChanged` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `AdminRoleChanged` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `UserAuthenticationFailureSpike` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `CounsellorAuthenticationFailureSpike` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `AdminAuthenticationMfaFailureSpike` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `ElevatedHttp401Rate` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `ElevatedHttp403Rate` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `ElevatedHttp429Rate` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `ElevatedHttp500Rate` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `UserFrontendProbeFailed` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `AdminFrontendProbeFailed` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |
| `CounsellorFrontendProbeFailed` | **RUNTIME PASS** | **RUNTIME PASS** | **RUNTIME PASS** |

The end-to-end alert exercise took 985.75 seconds. Its ignored local evidence
file,
`menorah/deploy/local-staging/generated/p0-alert-exercise-evidence.json`,
contains only the 20 allowlisted alert names, safe states, and timestamps. The
independent backup-refusal exercise additionally proved that
`BackupJobFailed` fired from the real fail-closed backup condition, rather
than only from a fixture.

Static monitoring evidence covered 14 scrape jobs, 69 configured alerts, and
26 expected signal families, with 42/42 monitoring tests. Rules outside the 20
listed above were not all independently forced to fire in this run. Local
Alertmanager receipt does not prove protected human notification,
acknowledgement, escalation, or on-call response.

## 8. Web and API results

| Suite / surface | Result | Exact evidence or limitation |
| --- | --- | --- |
| API smoke | **RUNTIME PASS** | 31/31 assertions; 5.55 seconds |
| Playwright | **RUNTIME PASS** | 7/7 assertions; 18.67 seconds |
| User surface | **RUNTIME PASS** | Public and authenticated synthetic-user surface included |
| Admin surface | **RUNTIME PASS** | Authenticated synthetic MFA and admin surface included |
| Counsellor surface | **RUNTIME PASS** | Counsellor surface included |
| Authentication-loop regressions | **RUNTIME PASS** | Real internal synthetic MFA plus user/admin/counsellor reload-loop assertions |
| Browser | **RUNTIME PASS for one browser only** | Playwright `1.61.0`, bundled Chromium `149.0.7827.55` on Windows |
| Full OTP behavior | **GAP** | Valid internal synthetic MFA passed; invalid/resend/throttle/external-delivery matrix incomplete |
| Authenticated chat/call UI | **GAP** | Backend/static authorization exists; complete UI session path was not exercised |
| Provider UI journey | **GAP** | Optional providers were intentionally disabled |
| Responsive/cross-browser matrix | **GAP** | Chromium desktop run only |
| Accessibility | **GAP** | No complete automated plus manual accessibility pass |
| Bounded load | **GAP** | Resource sampling is not a load test |
| Rate limiting | **STATIC PASS plus runtime smoke** | Isolation-safe rate buckets were flushed only in local Redis before the test; broader sustained-rate behavior remains unproven |

The run did not use Android Emulator, iOS Simulator, Safari/WebKit, Firefox,
physical devices, or an external mobile network.

## 9. Security results

| Control | Result | Evidence / limitation |
| --- | --- | --- |
| Authorization/BOLA matrix | **STATIC PASS** | Current repository role/object assertions passed; server-wide adversarial DAST remains blocked |
| Upload validation | **GAP** | Existing validation assertions do not constitute a complete malicious-file and storage hardening exercise |
| SSRF controls | **STATIC PASS** | Repository safety assertions passed; no external callback infrastructure was used |
| Rate limits | **STATIC PASS plus local smoke** | Local Redis only; no distributed or edge-layer proof |
| WebSocket authorization | **STATIC PASS** | Connection/room authorization assertions passed; device/network runtime matrix incomplete |
| Payment business logic | **STATIC PASS** | Stub/test assertions only; no provider account or real transfer |
| Administrator role isolation | **STATIC PASS** | Support, finance, content, full-admin, and revoked/stale-grant cases represented in the assertion matrix |
| Current tracked-tree secret scan | **STATIC PASS** | Trivy repository secret scan pinned with `--commit 48fb83c248b0e969e699433a8bacdd276ed4311d`: 0 tracked findings |
| Additional tracked-tree patterns | **STATIC PASS** | 23 credential-bearing URI matches were all tests/examples/synthetic fixtures; 0 non-fixture matches; 0 AWS, Google API, GitHub, Stripe, Twilio, SendGrid, Slack, or actual PEM findings; 0 tracked runtime environment files |
| Full-history/independent secret review | **BLOCKED** | Current-tree scans do not prove every historical object or external secret store; the external Mongo account referenced by the removed legacy URI must be verified and rotated by its owner |
| Log privacy | **STATIC PASS** | Synthetic-marker/redaction assertions passed; protected operational-log review remains server work |
| DAST / independent VAPT | **BLOCKED** | No DAST or independent VAPT was run; `GAP-VAPT-001` remains open |

No discovered credential value is reproduced here. Public OAuth client IDs
were treated as identifiers rather than secrets. Local tests are not an
independent security assessment and do not close privacy, legal, clinical, or
residual-risk approval.

## 10. Defects, commits, and evidence invalidation

Every item below was committed and pushed on
`release/final-production-readiness`. Short SHAs are unique repository commit
identifiers. Each change invalidated earlier evidence for its affected scope;
only the final candidate results elsewhere in this report are authoritative.

| Commit | Gate defect / reproduction | Fix and regression evidence | Disposition |
| --- | --- | --- | --- |
| `23caa24` | No complete isolated local-staging harness existed | Added guarded synthetic Compose/test harness | Superseded baseline; required for all later runtime evidence |
| `94b3652` | Internal API targets could bypass intended local target validation | Tightened internal API validation | Release/local-staging guards rerun |
| `4ea22eb` | Web call origin contract failed in isolated routing | Corrected web-call origin handling | Web/API scope invalidated and rerun |
| `e94f284` | Image build ownership/permissions blocked reliable startup | Corrected build-time owners | Images rebuilt; earlier build evidence invalidated |
| `5c28fc` | Redis ran with an unsafe ownership/user arrangement | Made Redis non-root | Runtime recreated; health and persistence rechecked |
| `ea73203` | Empty migration behavior was not safely handled | Added explicit empty-migration handling | Migration idempotency evidence regenerated |
| `bbbe9fc` | Monitoring configuration was incomplete for local isolation | Added/corrected local monitoring configuration | Monitoring runtime evidence invalidated |
| `8b63efc` | Proxy/Alloy routing failed under the isolated network model | Corrected proxy and Alloy connectivity | Full health gate rerun |
| `1436eb4` | Proxy address resolution selected the wrong path | Corrected proxy address selection | Ingress evidence invalidated |
| `386e379` | Ingress behavior did not meet the loopback-only model | Corrected local ingress | Port/isolation inventory rerun |
| `d6d763b` | Ingress validation did not fail closed for unsafe bindings | Added/fixed ingress validator | Guard suite and rendered-config checks rerun |
| `8be01d74` | Proxy could not reliably resolve private service targets | Added private-network aliases | Full runtime rebuilt/recreated |
| `38f50b99847643db7f70208e6bd641ecd9ce4667` | Authenticated clients entered reload/authentication loops | Fixed auth reload behavior and regression assertions | Final Playwright 7/7 includes loop regressions |
| `8f1d447f008f996e5e727291b114789bb1614535` | Recovery first failed HMAC verification because a Perl slurp consumed the expected newline; the next restore hit tar ownership permission errors | Scoped the signature reads and restored with `--no-same-owner` | Signed backup and isolated restore rerun to exit `0`; both failed attempts invalidated |
| `3cc3367a97a66bd46c86df07206b7568a550187d` | Prometheus fired all alerts, but Alertmanager received 0 because `alertmanager:9093` resolved through an ingress address blocked by inter-container isolation | Added a private monitoring-network alias and fail-fast preflight | Final exercise: all 20 fired and resolved in both systems; the Prometheus-only run was invalidated |
| `48fb83c248b0e969e699433a8bacdd276ed4311d` | A tracked legacy VPS setup script contained an active credential-bearing external MongoDB URI | Removed the URI and added a regression assertion that rejects credential-bearing URI content | Final tracked-tree scan found 0 non-fixture credential URI matches; external account owner must still verify/rotate the referenced account |

The user-provided starting candidate
`3fb99858c6766a341bb7b7dab2377195427f0ea1`, dirty-container experiments,
intermediate candidates, and the Prometheus-only alert run are historical and
**INVALIDATED** as final-candidate evidence.

## 11. SHA history, workflows, and PR #2

| Field | Record |
| --- | --- |
| User-provided starting runtime candidate | `3fb99858c6766a341bb7b7dab2377195427f0ea1` |
| User-provided starting documentation HEAD | `f2f35624a13a8ad4e5d0b713f3e53f5119b001fc` |
| Final runtime candidate | `48fb83c248b0e969e699433a8bacdd276ed4311d` |
| Runtime-to-documentation rule | The successor may change only `docs/**` and `menorah/docs/**`; executable/runtime drift requires a new runtime candidate and complete invalidation |
| PR | [#2](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/pull/2) |
| PR state at runtime freeze | `OPEN`, `DRAFT`, `MERGEABLE`, `CLEAN`, not merged |
| PR base | `main` at `8e292f2de421bc4a0aa148742bbd3cfa82647aa1` |
| Review state at runtime freeze | No reviewers, reviews, comments, labels, or assignees |

All six final-runtime workflow runs succeeded on their first attempt, 50/50
jobs:

- Push readiness: [run 30064845086](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064845086), 1/1.
- Push functional: [run 30064845082](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064845082), 9/9.
- Push security: [run 30064845089](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064845089), 15/15.
- PR readiness: [run 30064847263](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064847263), 1/1.
- PR functional: [run 30064847275](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064847275), 9/9.
- PR security: [run 30064847259](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30064847259), 15/15.

The documentation-only successor must also pass its own triggered workflows,
and PR #2 must be updated with its exact head. Nothing in this report
authorizes merging the draft.

## 12. Local staging verdict

**LOCAL STAGING VALIDATION PASSED — SERVER STAGING REQUIRED**

This verdict means the pinned candidate passed the exercised isolated local
runtime gates. It does not convert any **GAP** or **BLOCKED** item into a pass.

## 13. What local Docker did not prove

The local run did not prove:

- Ubuntu kernel, filesystem, UID/GID, systemd/timer, Docker-daemon, resource
  contention, or protected-host behavior;
- that the current production server can safely co-host staging;
- protected environment-file custody, secret rotation, access control,
  backup-key recovery, or break-glass procedures;
- DNS, Cloudflare Tunnel, origin TLS, firewall, public routing, bypass
  resistance, certificate renewal, or external probes;
- off-host backup custody, whole-host disaster recovery, repeated recovery
  performance, or an approved RPO/RTO;
- real Razorpay/RazorpayX, Resend, regional call fallback, Cloudinary, face,
  social, or other provider callbacks, quotas, contracts, or incident paths;
- signed iOS/Android artifacts, Android Emulator, iOS Simulator, physical
  devices, restrictive networks, TestFlight/internal-track distribution,
  association files, declarations, or store review;
- responsive cross-browser behavior, a complete accessibility audit, or
  representative load;
- protected alert delivery, human acknowledgement/escalation, on-call rota,
  Uptime Kuma, complete protected logs, or India location/retention;
- full-history secret custody, independent VAPT, remediation retest, or
  residual-risk approval;
- owner, finance, legal, privacy, clinical, vendor, Apple, Google, ISO/ISMS,
  or business-continuity decisions; or
- production data safety, production availability, or production readiness.

Windows-specific blockers also remain: the complete native monitoring command
mutates Docker state and was intentionally decomposed into safe local phases;
the backup lifecycle shell harness requires Linux `flock`; the media
permission transition requires root Linux/`setpriv`; and production
API/auth/provider scripts were deliberately excluded.

## 14. Server staging plan

Status: **BLOCKED PENDING A REVIEWED CO-HOST-SAFE DESIGN OR, PREFERABLY, A
SEPARATE STAGING VM/HOST**.

The current production topology is unsafe to reuse as-is for a second Compose
project. The reviewed definition contains shared external-network assumptions,
root/Docker-socket/host-log exposure, host timers, hard-coded production
checks, insufficient egress isolation, missing resource limits, and local seed
identity assumptions. None may be tested against production under this task.

Required isolated identities are:

| Boundary | Required staging identity |
| --- | --- |
| Compose project | `menorah-staging` |
| Checkout | `/srv/menorah-staging/repository` |
| Application environment | `/etc/menorah-staging/staging.env` |
| Cloudflare environment | `/etc/menorah-staging/cloudflare.env` |
| Data root | `/srv/menorah-staging/data` |
| Backup root | `/srv/menorah-staging/backups` |
| Deployment state | `/srv/menorah-staging/deploy-state` |
| Database/cache | Separate staging MongoDB and Redis |
| Networks/volumes/domains/providers | Unique staging-only resources, sandbox/stub providers, synthetic data only |

Required next sequence:

1. Approve a separate staging VM/host, or design and independently review a
   collision-free co-host overlay.
2. Freeze the runtime candidate and exact documentation/PR head; prove
   ancestry and a documentation-only tree difference.
3. Provision least-privilege identities, non-overlapping networks, unique
   domains, staging-only environment files, resource and egress limits, and
   sandbox provider accounts.
4. Prove by safe metadata only that no production environment, database,
   Redis, credential, volume, path, network, domain, or provider is referenced.
5. Render and review the full configuration without printing secret values.
6. Execute deployment, migrations, synthetic seed, health, functional,
   provider, recovery, monitoring, mobile, and security plans.
7. Retain redacted evidence, resolve every failure, rerun affected gates, and
   hold the documented staging go/no-go review.

Explicit prohibitions remain: no production volume, database, Redis,
environment file, provider credential, user data, counsellor data, health
data, KYC evidence, bank data, payment data, host-wide destructive test,
production firewall/DNS/Tunnel change, production migration, production
restore, or inference that this Windows result is an Ubuntu staging result.

## 15. Production verdict

# Production NOT READY

Do not merge PR #2. Do not deploy production. Do not migrate or restore
production. The local verdict is evidence for proceeding to an isolated server
staging phase only.
