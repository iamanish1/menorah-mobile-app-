# Local synthetic staging validation report

Report date: **2026-07-24 (Asia/Dubai)**

Runtime candidate: `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`

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
| Runtime candidate | `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` |
| Documentation revision | The documentation-only descendant containing this report; its exact SHA is recorded in PR #2 after commit because a commit cannot contain its own SHA |
| Docker Desktop | `4.64.0` |
| Docker Engine / client | `29.2.1` / `29.2.1` |
| Compose project | `menorah-local-staging` |
| Compose definition | `menorah/deploy/local-staging/compose.yml` |
| Host | Local Windows development workstation |
| Generated environment | Validated locally; neither values nor a secret-file digest are recorded in this report |
| Workstation-file independence | **RUNTIME PASS:** the tracked generator created a fresh disposable environment and refused pre-existing credential artifacts; no pre-existing ignored workstation file was used as candidate evidence |
| Rendered Compose digest | SHA-256 `4b2608b4eeb6e0e3acdac06b047fb9f427f1c373f5b03afc4b38e5c70e02c728` |
| Environment contract | 194 keys validated; `syntheticOnly=true`; optional providers disabled |
| Production access | **RUNTIME PASS:** no production database, Redis, environment file, provider account, domain, volume, network, or data was used |
| Isolation verdict | **RUNTIME PASS:** unique project, Docker-managed storage, loopback-only published ports, synthetic identities only |

The all-profile rendered model contained exactly 30 services:
`mail-capture`, `mongo-primary`, `mongo-replica-init`, `redis`, `api-ios`,
`admin-panel`, `api-admin`, `api-android`, `api-web`, `web-app`, `livekit`,
`user-web-app`, `worker`, `logs-init`, `caddy`, `loki`, `mongodb-exporter`, `alloy`,
`mongo-restore`, `mongo-restore-replica-init`, `restore-job`, `alert-sink`,
`alertmanager`, `redis-exporter`, `blackbox-exporter`,
`migrate-local-staging`, `alert-fixture`, `backup-job`, `prometheus`, and
`seed-local-staging`.

| Inventory | Exact result |
| --- | --- |
| Networks | 5: `menorah-local-staging`, `menorah-local-staging-data`, `menorah-local-staging-ingress`, `menorah-local-staging-monitoring`, `menorah-local-staging-restore` |
| Volumes | 12, all prefixed `menorah-local-staging-`: `alertmanager`, `alloy`, `backups`, `logs`, `loki`, `mongo`, `prometheus`, `redis`, `restore-media`, `restore-mongodb`, `retrieval`, `uploads` |
| Published sockets | 15 TCP and 101 UDP bindings; all host addresses were exactly `127.0.0.1` |
| Exact host ports | TCP `22345`, `23001`–`23003`, `23100`, `27880`, `27881`, `28080`–`28084`, `28443`, `29090`, and `29093`; LiveKit UDP `25000`–`25100` |
| Non-loopback bindings | 0 |
| MongoDB / restore-MongoDB / Redis published ports | 0 |
| Production host paths or Docker socket | 0 |

## 2. Images, deployment, and health

| Item | Result | Exact evidence |
| --- | --- | --- |
| Full all-profile build | **RUNTIME PASS** | All 11 project-built image targets completed at the final runtime SHA; exit `0`; 112.95 seconds |
| Image identity | **RUNTIME PASS** | Project images were inspected by immutable image ID; upstream images remained digest-pinned. The shared backend image was `sha256:827fe5a96d3675db35ee2d4c4df3efdfe11c7283c5423aa6acef531194c5376e`; no mutable production image was used |
| Core start | **RUNTIME PASS** | MongoDB, Redis, mail capture, and replica initialization reached their gate; exit `0`; 16.28 seconds |
| Full-profile start | **RUNTIME PASS** | `docker compose up --wait` completed; exit `0`; 55.64 seconds |
| Container inventory | **RUNTIME PASS** | 26 retained containers named `menorah-local-staging-<service>-1`: 23 running and healthy; 3 expected successful one-shots exited |
| Expected exited one-shots | **RUNTIME PASS** | `logs-init`, `mongo-replica-init`, and `mongo-restore-replica-init`, each exited `0` |
| Running unhealthy | **RUNTIME PASS** | 0 |
| Restart counts | **RUNTIME PASS** | 0 restarts across every retained container |
| Caddy log/process lifecycle | **RUNTIME PASS** | After the extended alert and recovery run, Caddy was healthy with one workload process, zero zombies, and zero restarts. Its active access log was mode `0600`, UID/GID `473:473`; Alloy read it and Loki returned the final-run access record |
| Resource sample | **RUNTIME PASS, bounded observation only** | Application containers used approximately 56.93–82.5 MiB each within 1 GiB limits; primary MongoDB used 207.1 MiB, restore MongoDB 101.6 MiB, Prometheus 101.9 MiB, and Loki 80.03 MiB. Momentary CPU maxima were restore MongoDB 43.23%, Loki 6.25%, and Redis 6.05% |

The 11 project-built image IDs were:

| Image | Immutable local image ID |
| --- | --- |
| `admin-panel:runtime` | `sha256:4b4c6a55b7c9a48aa90178306b082a3fc7e35ef7d1c270f7a7ccb458d405e68f` |
| `alert-fixture:runtime` | `sha256:7ba9f07fd4f85b5009bae050acf9e77108df67d358143726ba36776b4aba65f4` |
| `alloy:runtime` | `sha256:dc816d0f10fc337b0d9a5e7962f9b53c1c3f19fc86559dc7601734842de904c8` |
| `backend:runtime` | `sha256:827fe5a96d3675db35ee2d4c4df3efdfe11c7283c5423aa6acef531194c5376e` |
| `backup-tools:runtime` | `sha256:33822daefc0a06d358eca1fcd617be8d856e0c6500bb2a96897e3c4cad5c6066` |
| `counsellor-web:runtime` | `sha256:cba97707aa0ac9a6ad3bf0e6bbe772de657418cf7fda17a636da8bb2fde06b57` |
| `loki:runtime` | `sha256:26e4a34a4cda501890b0d7a312468734a8bc542b1e71c42e6d452da8e5577385` |
| `mail-capture:runtime` | `sha256:d796be1b5c1ba10909f5c9c84157019a2a561b82b79b02d0ef86882995b54efa` |
| `mongodb-exporter:runtime` | `sha256:e983ee77f5b87b126f7cf376505765e109cfc2412337729da05d2b34b50daf85` |
| `redis-exporter:runtime` | `sha256:92e29335f974f30e50fea070b532813d5bcfb6ef64d81de35c5a82f179aa6415` |
| `user-web-app:runtime` | `sha256:6e3546c69958d2c5167740ee3f484df1fb62cba74d5e7e70b0c6ff18a7bd0ce2` |

The eight retained upstream images were also immutable:

| Upstream image | Pinned image ID |
| --- | --- |
| `caddy:2.8-alpine` | `sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17` |
| `livekit/livekit-server:v1.13.3` | `sha256:483b8b7b5b0654f91f1e8bdc7b46fcd37fd9911612ecf627f97e3185a89825bd` |
| `mongo:7` | `sha256:340c1c56fb10e95cf79ff547f8664b96bc6ead9909bc355238cbf865a9695a6f` |
| `node:22-alpine` | `sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2` |
| `prom/alertmanager:v0.32.1` | `sha256:51a825c2a40acc3e338fdd00d622e01ec090f72be2b3ea46be0839cd47a4d286` |
| `prom/blackbox-exporter:v0.28.0` | `sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc` |
| `prom/prometheus:v2.55.1` | `sha256:2659f4c2ebb718e7695cb9b25ffa7d6be64db013daba13e05c875451cf51b0d3` |
| `redis:7-alpine` | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |

The service list in section 1 plus the exact
`menorah-local-staging-<service>-1` naming rule is the complete sanitized
container-name inventory. The retained 26 are the rendered 30 minus
`migrate-local-staging`, `seed-local-staging`, `backup-job`, and `restore-job`;
their final health/restart state and bounded resource sample are recorded
above.

Migration and seed jobs were transient and removed after their authoritative
success or expected-rejection result was recorded. The duplicate-seed
container exited `1` as required and was removed after its safe rejection
marker was recorded; it is therefore not part of the retained 26-container
inventory.
Intermediate build/start defects are retained in section 10 and were not
silently relabelled as first-run success.

## 3. Migration and database results

| Requirement | Result | Exact evidence |
| --- | --- | --- |
| Migration ordering and current repository guards | **STATIC PASS** | Final `npm run test:release-workflow`: 75/75 release assertions plus 58/58 local-staging assertions, 133/133 total |
| First migration run | **RUNTIME PASS** | 11 migrations applied; exit `0`; 5.86 seconds |
| Second migration run | **RUNTIME PASS** | The same 11 migrations were recognized and skipped; exit `0`; 2.93 seconds |
| Migration ledger | **RUNTIME PASS** | 11 ledger entries; indexes `_id_` and `migration_name_unique` |
| Seeded database structure | **RUNTIME PASS** | 18 collections and 117 indexes after seed |
| First synthetic seed | **RUNTIME PASS** | 10 users, 3 counsellors, 2 counsellor applications, 15 total roster records; exit `0`; 8.13 seconds |
| Duplicate seed | **RUNTIME PASS, expected rejection** | Exit `1` with `LOCAL_STAGING_ROSTER_ALREADY_PRESENT`; 7.74 seconds |
| Synthetic roster | **RUNTIME PASS** for bounded identities; distinct super-admin **GAP** | Two user aliases; approved, draft, and suspended counsellors; support, finance, content, and two full-admin aliases; 10 safe identity aliases total. The current role model has no separate super-admin role |
| Managed local Mongo identities | **STATIC PASS** | 22/22 identity-validator assertions on unchanged identity scripts; no role credential was printed |
| Normal API startup is non-destructive | **STATIC PASS plus runtime observation** | Release guards passed; normal API restarts did not rerun seed or change the migration ledger |
| Post-restore main database invariant | **RUNTIME PASS** | Main local database remained at 18 collections, 89 documents, 117 indexes, 10 users, 3 counsellors, and 11 migration records |

The final count includes only synthetic fixture and operational records
created inside this project. No production record or credential was inspected
or copied. The requested administrator and super-administrator identities were
represented by two distinct aliases with the same full-admin authority; role
separation between them was not claimed or tested.

## 4. Backup, restore, and recovery results

| Requirement | Result | Timing / evidence |
| --- | --- | --- |
| Backup refuses with writers active | **RUNTIME PASS** | Exit `1` in 2.84 seconds; exact safe reason: `application writers must be explicitly quiesced` |
| Failure alert | **RUNTIME PASS** | `BackupJobFailed` became firing in both Prometheus and Alertmanager in 26.01 seconds |
| Exact writer quiescence | **RUNTIME PASS** | `api-ios`, `api-android`, `api-web`, `api-admin`, and `worker` all exited `0`; the final stop completed in 3.74 seconds |
| Encrypted and signed backup | **RUNTIME PASS** | Stamp `20260724T070020Z`; exit `0`; AES-256-CBC/PBKDF2 archive creation completed in 3.72 seconds; HMAC and content hashes verified without recording keys |
| Managed-media manifest | **RUNTIME PASS** | Exactly one clearly synthetic byte-bearing fixture was archived and restored; an independent read-only, networkless verifier counted one source and one restored file, returned byte comparison exit `0`, and matched SHA-256 `f6a3696beab87fb37d0ac3bc3db7df406ce7d59149b57c8d7bf724277e604e79` |
| Separate retrieval storage | **RUNTIME PASS** | Docker volume `menorah-local-staging-retrieval` was used and its retrieved copy verified |
| Host-readable ownership | **GAP** | A separate restore container read and verified the Docker-managed retrieval volume, but Windows Docker Desktop does not prove numeric ownership/readability at `/srv/menorah-staging/backups` for the eventual Ubuntu host |
| Isolated restore target | **RUNTIME PASS** | Separate restore network plus `restore-mongodb` and `restore-media` volumes; `mongo-restore` started in 9.19 seconds and replica initialization exited `0`; the target was never the main local database |
| Restore | **RUNTIME PASS** | Exit `0`; 8.72 seconds; 18 collections, 89 documents, 117 indexes; 0 document failures; database and non-empty media manifests matched |
| Main local database untouched | **RUNTIME PASS** | Final main-database counts exactly matched the pre-restore invariant |
| Writer recovery | **RUNTIME PASS** | All five writer services returned healthy in 12.39 seconds; measured outage from all writers stopped to all writers healthy was 39.70 seconds |
| Failure-alert resolution | **RUNTIME PASS** | Successful quiesced backup cleared `BackupJobFailed` in both Prometheus and Alertmanager in 0.94 seconds |
| Local recovery-point boundary | **RUNTIME PASS, local definition only** | The proved recovery point is the signed snapshot stamped `20260724T070020Z`; this is not an approved business RPO |
| Local recovery time | **RUNTIME PASS, local definition only** | Restore 8.72 seconds; writer outage 39.70 seconds; backup creation 3.72 seconds |
| Migration rollback/resume invariants | **STATIC PASS** | Current release/local-staging guard suite passed 133/133, including guarded ordering and recovery-contract assertions; destructive Linux fault injection was not run on Windows |
| Disposable coordinated restoration | **RUNTIME PASS** | Restore completed against isolated disposable services and storage |

The requested interruption and rollback cases were dispositioned individually:

| Recovery scenario | Local result | Remaining server proof |
| --- | --- | --- |
| Pre-migration rollback | **STATIC PASS**; Ubuntu execution **BLOCKED** | Release-script guards reject unsafe sequencing; execute the guarded rollback against an approved Ubuntu staging release and retained predecessor artifacts |
| Interrupted identity reconciliation | **STATIC PASS**; Ubuntu execution **BLOCKED** | Managed-identity recovery tests cover exact scope, marker and role checks; interrupt and resume the real Linux workflow on staging |
| Interrupted migration marker behavior | **STATIC PASS**; Ubuntu execution **BLOCKED** | Marker ordering/fail-closed regression assertions passed; perform controlled Linux process interruption and verify persisted state |
| Proven-applied crash resume | **STATIC PASS**; Ubuntu execution **BLOCKED** | Post-migration resume accepts only validated state and cannot rerun migrations; execute an approved crash/resume rehearsal on Ubuntu |
| Incompatible code-only rollback rejection | **STATIC PASS**; Ubuntu execution **BLOCKED** | Repository guards reject migration/code mismatch and mutable migration images; prove rejection with actual staged predecessor/candidate artifacts |
| Coordinated disposable restoration | **RUNTIME PASS** | The separate restore network, database and media volumes passed locally; repeat with protected off-host custody on Ubuntu |

Before quiescence, the primary contained 18 collections, 89 documents, 117
indexes, 10 users, 3 counsellors, and 11 migration records. The same invariant
held after isolated restore validation.

The latest archive also contained the sole managed-upload fixture. Its restored
path, file count, manifest digest, and bytes matched the source through a
separate read-only verifier with no network access.

After this later media recovery rerun, all 25 Prometheus targets were still up
and both Prometheus and Alertmanager contained only the same two allowed local
`BlackboxProbeCoverageIncomplete` baseline instances.

The restore emitted a non-blocking `mongosh` `EACCES` warning when it attempted
to create `/data/db/.mongodb`; the process still exited `0` and every document,
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
automation, distinct super-admin role semantics, no-gender automation,
complete OTP/provider journeys,
authenticated chat/call UI, responsive cross-browser coverage,
accessibility, bounded load, and upload hardening. The blocked cases require
two-person payout controls, refund and duplicate-refund provider behavior,
payout completion/reconciliation, real provider/media/fallback behavior, full
history/independent security review, and DAST/VAPT.

The distinct super-admin roster limitation is a Phase 5 identity/model gap
outside the 107-case functional mapping; it does not alter the matrix totals.

Supporting executable evidence at the final runtime SHA includes 133/133
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
failure signals; it did not call a real provider. Before and after the
exercise, exactly 25/25 Prometheus targets were up. The sole active baseline
alert was `BlackboxProbeCoverageIncomplete` in two local-only instances, an
explicitly allowed limitation: the production rule requires 19 public HTTPS
probes and two call probes, which local Docker cannot prove. All 20 required
exercise alerts were observed firing in both systems and subsequently
resolved.

For every row, `L20` means the candidate-bound live Prometheus and Alertmanager
observations recorded in this tracked table. The ignored generated JSON was a
transient corroborating diagnostic whose safe schema was verified; neither
this report nor candidate reproducibility depends on retaining that
workstation file.

| Alert | Exact local trigger | Prometheus / Alertmanager | Resolution | Runbook | Local evidence | Remaining real-server evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `WorkerQueueBacklogHigh` | Sustained synthetic queue depth `30` | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#workerqueuebackloghigh) | `L20` | Real staging worker backlog, protected receiver and operator response |
| `BackupJobFailed` | Fixture result `0`; separately, live-writer backup refusal | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#backupjobfailed) | `L20` plus signed-backup failure/recovery run | Scheduled Ubuntu backup, off-host custody, protected receiver and response |
| `PaymentProviderFailure` | Add `2` synthetic failed payment operations per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#paymentproviderfailure) | `L20` | Razorpay sandbox failure/correlation and protected receiver |
| `PaymentWebhookFailure` | Add `2` synthetic failed webhook events per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#paymentwebhookfailure) | `L20` | Signed sandbox callbacks, retries/reconciliation and response |
| `EmailDispatchFailed` | Add `5` synthetic dispatch failures per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#emaildispatchfailed) | `L20` | Staging-domain provider failure, delivery receiver and response |
| `EmailDeliveryOutcomeFailed` | Add `2` synthetic bounced outcomes per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#emaildeliveryoutcomefailed) | `L20` | Provider delivery webhook, bounce handling and response |
| `CallProviderFailure` | Add `3` synthetic failed connect operations per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#callproviderfailure) | `L20` | Approved call sandbox/fallback failure and operator response |
| `CallMediaFailure` | Add `3` synthetic failed video outcomes per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#callmediafailure) | `L20` | Device/network media failure, fallback and operator response |
| `PrivilegedRoleChanged` | Add `1` synthetic privileged-role change per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#privilegedrolechanged) | `L20` | Protected audit pipeline, approved actor and human acknowledgement |
| `AdminRoleChanged` | Add `1` synthetic admin-role change per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#adminrolechanged) | `L20` | Protected audit pipeline, approved actor and human acknowledgement |
| `UserAuthenticationFailureSpike` | Add `25` user/password failures per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#userauthenticationfailurespike) | `L20` | Staging traffic threshold, protected logs and response |
| `CounsellorAuthenticationFailureSpike` | Add `15` counsellor/password failures per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#counsellorauthenticationfailurespike) | `L20` | Staging traffic threshold, protected logs and response |
| `AdminAuthenticationMfaFailureSpike` | Add `10` admin/MFA failures per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#adminauthenticationmfafailurespike) | `L20` | Real staging MFA failure path, protected logs and response |
| `ElevatedHttp401Rate` | Add `30` synthetic HTTP `401` responses per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#elevatedhttp401rate) | `L20` | Representative staging traffic, threshold tuning and response |
| `ElevatedHttp403Rate` | Add `15` synthetic HTTP `403` responses per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#elevatedhttp403rate) | `L20` | Representative staging traffic, threshold tuning and response |
| `ElevatedHttp429Rate` | Add `30` synthetic HTTP `429` responses per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#elevatedhttp429rate) | `L20` | Distributed/edge rate limits, threshold tuning and response |
| `ElevatedHttp500Rate` | Add `10` synthetic HTTP `500` responses per scrape | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#elevatedhttp500rate) | `L20` | Representative failure traffic, protected traces/logs and response |
| `UserFrontendProbeFailed` | Stop `user-web-app`, then restart healthy | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#userfrontendprobefailed) | `L20` plus post-restart health | Public DNS/TLS route, external probe location and response |
| `AdminFrontendProbeFailed` | Stop `admin-panel`, then restart healthy | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#adminfrontendprobefailed) | `L20` plus post-restart health | Public DNS/TLS route, external probe location and response |
| `CounsellorFrontendProbeFailed` | Stop `web-app`, then restart healthy | **RUNTIME PASS:** firing / firing | **RUNTIME PASS:** resolved / resolved | [runbook](../../menorah/docs/monitoring-alert-runbook.md#counsellorfrontendprobefailed) | `L20` plus post-restart health | Public DNS/TLS route, external probe location and response |

The end-to-end alert exercise exited `0` after 1,357.57 seconds. Its ignored local evidence
file,
`menorah/deploy/local-staging/generated/p0-alert-exercise-evidence.json`,
contains only the 20 allowlisted alert names, safe states, timestamps, and
runbook URLs. The
independent backup-refusal exercise additionally proved that
`BackupJobFailed` fired from the real fail-closed backup condition, rather
than only from a fixture.

The active Caddy access log remained mode `0600`, UID/GID `473:473`, and Loki
returned a successful query containing the final-run access record.

Static monitoring evidence covered 14 scrape jobs, 69 configured alerts, and
26 expected signal families, with 42/42 monitoring tests. Rules outside the 20
listed above were dispositioned as follows rather than silently promoted to
runtime passes:

| Requested additional rule family | Local result | Firing status / remaining evidence |
| --- | --- | --- |
| MongoDB | **RUNTIME PASS** for primary/exporter health and replica state; **STATIC PASS** for rules | Failure firing deliberately **BLOCKED** to avoid corrupting the validated database; repeat against disposable Ubuntu staging |
| Redis | **RUNTIME PASS** for Redis/exporter health; **STATIC PASS** for rules | Unavailable/memory/rejected-connection firing was not forced; **GAP** pending isolated server exercise |
| Disk | **STATIC PASS** for `HostDiskSpaceLow` rule/tests | Host-disk exhaustion is a destructive host-wide test and **BLOCKED**; use a bounded staging filesystem |
| CPU | **RUNTIME PASS** for bounded resource observation; **STATIC PASS** for `HostCpuSaturation` | Sustained saturation was not forced; **GAP** pending bounded Ubuntu load |
| Memory | **RUNTIME PASS** for bounded resource observation; **STATIC PASS** for host/container rules | OOM/pressure was not forced; **GAP** pending bounded Ubuntu load |
| Restart loop | **STATIC PASS** for `ContainerRestartLoop`; **RUNTIME PASS** for final zero-restart inventory | A deliberate restart loop was not forced; **GAP** pending disposable server exercise |
| Certificate | **STATIC PASS** for `TlsCertificateExpiringSoon` | Local Caddy certificate behavior does not prove public renewal/expiry; **BLOCKED** pending staging DNS/TLS |
| Worker | **RUNTIME PASS** for `WorkerQueueBacklogHigh` and healthy worker target; **STATIC PASS** for readiness rule | `WorkerReadinessProbeFailed` was not separately forced; **GAP** pending server exercise |
| Stale backup | **STATIC PASS** for `BackupMetricsStale`; safe runtime age condition and reset observed | The alert was not held through protected Alertmanager delivery; **GAP** pending scheduled Ubuntu backup telemetry |

Local Alertmanager receipt does not prove protected human notification,
acknowledgement, escalation, or on-call response.

## 8. Web and API results

| Suite / surface | Result | Exact evidence or limitation |
| --- | --- | --- |
| API smoke | **RUNTIME PASS** | Exit `0`; 31/31 assertions; 6.98 seconds |
| Playwright | **RUNTIME PASS** | Exit `0`; 7/7 assertions; 15.33 seconds overall, including 12.9 seconds of test execution |
| User surface | **RUNTIME PASS** | Public and authenticated synthetic-user surface included |
| Admin surface | **RUNTIME PASS** | Authenticated synthetic MFA and admin surface included |
| Counsellor surface | **RUNTIME PASS** | Counsellor surface included |
| Provider-stub tests | **STATIC PASS** | Deterministic payment/email/call fixtures and fail-closed disabled-provider configuration passed; no external provider was called |
| Authentication-loop regressions | **RUNTIME PASS** | Real internal synthetic MFA plus user/admin/counsellor reload-loop assertions |
| Browser | **RUNTIME PASS for one browser only** | Playwright `1.61.0`, bundled Chromium `149.0.7827.55` on Windows |
| Full OTP behavior | **GAP** | Valid internal synthetic MFA passed; invalid/resend/throttle/external-delivery matrix incomplete |
| Authenticated chat/call UI | **GAP** | Backend/static authorization exists; complete UI session path was not exercised |
| Provider UI journey (extra, unscored) | **GAP** | Optional providers were intentionally disabled |
| Responsive/cross-browser matrix | **GAP** | Chromium desktop run only |
| Accessibility | **GAP** | No complete automated plus manual accessibility pass |
| Bounded load | **GAP** | Resource sampling is not a load test |
| Rate limiting | **STATIC PASS plus runtime smoke** | Isolation-safe rate buckets were flushed only in local Redis before the test; broader sustained-rate behavior remains unproven |

For the 11 Phase 9 suite requests, the exact classification is 6 supported
passes (four runtime surfaces plus provider-stub and rate-limit repository
evidence), 0 failures, 0 blocked, and 5 gaps: OTP matrix,
authenticated-chat/call UI, responsive/cross-browser, accessibility and
bounded load.

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
| Current tracked-tree secret scan | **STATIC PASS** | Trivy `0.70.0` repository secret scan pinned with `--commit 0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`: exit `0`; 0 findings; 10.59 seconds |
| Additional tracked-tree patterns | **STATIC PASS** | 23 credential-bearing URI matches were all tests, examples, or synthetic fixtures; 0 non-fixture operational matches, 0 common provider-token or PEM findings, and 0 tracked runtime environment files |
| Full-history/independent secret review | **BLOCKED** | Current-tree scans do not prove every historical object or external secret store; the external Mongo account referenced by the removed legacy URI must be verified and rotated by its owner |
| Log privacy | **STATIC PASS** | Synthetic-marker/redaction assertions passed; protected operational-log review remains server work |
| DAST / independent VAPT | **BLOCKED** | No DAST or independent VAPT was run; `GAP-VAPT-001` remains open |

No discovered credential value is reproduced here. Public OAuth client IDs
were treated as identifiers rather than secrets. Local tests are not an
independent security assessment and do not close privacy, legal, clinical, or
residual-risk approval.

An intermediate PowerShell summary incorrectly counted null Trivy result
sections as findings. That interpretation was invalidated; the authoritative
exact-commit scan result above is exit `0` with 0 findings.

## 10. Defects, commits, and evidence invalidation

Every item below was committed and pushed on
`release/final-production-readiness`. Short SHAs are unique repository commit
identifiers. Each change invalidated earlier evidence for its affected scope;
only the final candidate results elsewhere in this report are authoritative.
The table names the principal changed files; the complete exact inventory for
any row is reproducible with `git show --name-only <commit>`.

| Commit | Severity and principal changed files | Gate defect / reproduction | Fix and regression evidence | Disposition |
| --- | --- | --- | --- | --- |
| `23caa24` | P0; `menorah/deploy/local-staging/**`, `menorah/backend/src/database/seed-local-staging.js`, `menorah/scripts/qa/**` | No complete isolated local-staging harness existed | Added guarded synthetic Compose/test harness | Superseded baseline; required for all later runtime evidence |
| `94b3652` | P0; `menorah/deploy/local-staging/validate-isolation.mjs` | Internal API targets could bypass intended local target validation | Tightened internal API validation | Release/local-staging guards rerun |
| `4ea22eb` | P0; local `compose.yml`; both web Dockerfiles/call-origin scripts; `menorah/scripts/qa/call-origin-policy.test.cjs` | Web call origin contract failed in isolated routing | Corrected web-call origin handling | Web/API scope invalidated and rerun |
| `e94f284` | P0; local `compose.yml`, `isolation.test.mjs`, `validate-isolation.mjs` | Image build ownership/permissions blocked reliable startup | Corrected build-time owners | Images rebuilt; earlier build evidence invalidated |
| `5c28fc` | P0; local `compose.yml`, `isolation.test.mjs` | Redis ran with an unsafe ownership/user arrangement | Made Redis non-root | Runtime recreated; health and persistence rechecked |
| `ea73203` | P0; `menorah/backend/src/database/migrations/20260719-iso-security-remediation.js` and its test | Empty migration behavior was not safely handled | Added explicit empty-migration handling | Migration idempotency evidence regenerated |
| `bbbe9fc` | P0; local `blackbox.yml`, `compose.yml`, `loki.yml`, `isolation.test.mjs` | Monitoring configuration was incomplete for local isolation | Added/corrected local monitoring configuration | Monitoring runtime evidence invalidated |
| `8b63efc` | P0; local `compose.yml`, `isolation.test.mjs`, `monitoring-health.test.mjs` | Proxy/Alloy routing failed under the isolated network model | Corrected proxy and Alloy connectivity | Full health gate rerun |
| `1436eb4` | P0; local `compose.yml`, `isolation.test.mjs` | Proxy address resolution selected the wrong path | Corrected proxy address selection | Ingress evidence invalidated |
| `386e379` | P0; local `compose.yml`, `isolation.test.mjs`, `validate-isolation.mjs` | Ingress behavior did not meet the loopback-only model | Corrected local ingress | Port/isolation inventory rerun |
| `d6d763b` | P0; `menorah/deploy/local-staging/validate-isolation.mjs` | Ingress validation did not fail closed for unsafe bindings | Added/fixed ingress validator | Guard suite and rendered-config checks rerun |
| `8be01d74` | P0; local `Caddyfile`, `compose.yml`, `isolation.test.mjs` | Proxy could not reliably resolve private service targets | Added private-network aliases | Full runtime rebuilt/recreated |
| `38f50b99847643db7f70208e6bd641ecd9ce4667` | P0; admin `login/page.tsx` and `lib/api.ts`; counsellor `lib/api.ts`; Playwright `admin-smoke.spec.js` and `public-web.spec.js` | Authenticated clients entered reload/authentication loops | Fixed auth reload behavior and regression assertions | Final Playwright 7/7 includes loop regressions |
| `8f1d447f008f996e5e727291b114789bb1614535` | P0; local `backup-local.sh`, `restore-local.sh`, `isolation.test.mjs` | Recovery first failed HMAC verification because a Perl slurp consumed the expected newline; the next restore hit tar ownership permission errors | Scoped the signature reads and restored with `--no-same-owner` | Signed backup and isolated restore rerun to exit `0`; both failed attempts invalidated |
| `3cc3367a97a66bd46c86df07206b7568a550187d` | P0; local `compose.yml`, `prometheus.yml`, `exercise-p0-alerts.mjs`, `alert-exercise.test.mjs`, `isolation.test.mjs` | Prometheus fired all alerts, but Alertmanager received 0 because `alertmanager:9093` resolved through an ingress address blocked by inter-container isolation | Added a private monitoring-network alias and fail-fast preflight | Final exercise: all 20 fired and resolved in both systems; the Prometheus-only run was invalidated |
| `48fb83c248b0e969e699433a8bacdd276ed4311d` | P0 security; `scripts/vps-setup.sh`, release-workflow regression test | A tracked legacy VPS setup script contained an active credential-bearing external MongoDB URI | Removed the URI and added a regression assertion that rejects credential-bearing URI content | Final tracked-tree scan found 0 non-fixture credential URI matches; external account owner must still verify/rotate the referenced account |
| `a9ea55ea85ab3bd91e68797256e0b8fc9f677966` | P0; local `compose.yml`, `isolation.test.mjs` | An extended run accumulated 106 defunct `ssl_client` health-check children, reached 125 PIDs against the 128-PID limit, and made Caddy unhealthy with a failing streak of 54 and `wget: fork: Resource temporarily unavailable` | Added `init: true` to make Docker's init process reap health-check descendants and added a regression assertion | The reaper fix remained in the final tree, but the complete `a9ea55` runtime evidence was invalidated by the later monitoring and proxy-log changes |
| `fbf2de8c5bb3e50e41fcaa6bc75f739cfdc0aca2` | P0; local `Caddyfile`, `compose.yml`, `config.alloy`, `prometheus.yml`, alert fixture/exercise scripts and tests | Seven of 25 Prometheus targets were down because five security-event targets plus Loki and Alloy resolved through raw ingress aliases blocked by isolation; Alloy also targeted Loki through the raw alias, while `BackupMetricsStale` contaminated the baseline | Added private monitoring/application aliases, a fresh backup heartbeat, and exact 25-target/baseline validation | Targeted tests and runtime proved 25/25 targets up with only the explicitly allowed local probe limitation; the complete `a9ea55` runtime evidence was invalidated |
| `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` | P0; local `Caddyfile`, `compose.yml`, `isolation.test.mjs`, `monitoring-health.test.mjs` | Pinned Caddy 2.8 silently ignored unsupported `mode 0640`, creating a root-owned mode-`0600` access log that Alloy UID 473 could not read | Added the isolated `logs-init` one-shot, ran Caddy and Alloy as UID/GID 473, normalized tmpfs/log ownership, and retained the pinned production-parity Caddy binary | Final proof: log mode `0600`, UID/GID `473:473`, successful Loki ingestion, 25/25 targets up, and the extended alert/recovery run healthy; the complete `fbf2de8` runtime evidence was invalidated |

The user-provided starting candidate
`3fb99858c6766a341bb7b7dab2377195427f0ea1`, dirty-container experiments,
intermediate candidates, the Prometheus-only alert run, superseded runtime
`48fb83c248b0e969e699433a8bacdd276ed4311d`,
`a9ea55ea85ab3bd91e68797256e0b8fc9f677966`, and
`fbf2de8c5bb3e50e41fcaa6bc75f739cfdc0aca2`, plus superseded documentation
head `2f2c6e45608300a05443aa7a95d2fd4513e28b71`, are historical and
**INVALIDATED** as final-candidate evidence.

Three pre-authoritative API invocations were excluded: a host-side loader
preserved JSON quoting in generated credentials and produced a 27-pass/2-fail
diagnostic result, while two retries encountered only isolated Redis
rate-limit residue. Only the exact local `rl:*` namespace was cleared; the
clean authoritative rerun passed 31/31. One Playwright
invocation omitted the local HTTPS port and executed no tests; a later 6/7
attempt was an admin hydration automation race, and Caddy logs proved no POST
was submitted. Both were invalidated; the clean rerun passed 7/7.

The first attempt to strengthen recovery evidence with a non-empty media
fixture was also invalidated. The test fixture had been created with an
artificially restrictive `0700` directory, so the capability-dropped backup
container failed safely before finalizing an archive. No repository change was
made: the synthetic fixture was reset to ordinary app-readable `0755/0644`
permissions, all writers were returned healthy, and a fresh quiescence,
signed-backup, retrieval, isolated-restore, manifest, and byte-comparison cycle
passed at stamp `20260724T070020Z`.

Early defect SHAs `23caa24`, `94b3652`, and `386e379` had superseded
push/PR workflow attempts cancelled by concurrency (respectively four, two,
and four of six runs). They are not represented as fully green exact-SHA
candidates; later cumulative and final candidates supplied the authoritative
successful checks.

## 11. SHA history, workflows, and PR #2

| Field | Record |
| --- | --- |
| User-provided starting runtime candidate | `3fb99858c6766a341bb7b7dab2377195427f0ea1` |
| User-provided starting documentation HEAD | `f2f35624a13a8ad4e5d0b713f3e53f5119b001fc` |
| Superseded runtime candidate | `48fb83c248b0e969e699433a8bacdd276ed4311d`; invalidated by the Caddy reaper fix |
| Superseded documentation head | `2f2c6e45608300a05443aa7a95d2fd4513e28b71`; invalidated because it documented the superseded runtime |
| Superseded runtime candidate | `a9ea55ea85ab3bd91e68797256e0b8fc9f677966`; invalidated by the monitoring-visibility fix |
| Superseded runtime candidate | `fbf2de8c5bb3e50e41fcaa6bc75f739cfdc0aca2`; invalidated by the proxy-log readability fix |
| Final runtime candidate | `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a` |
| Runtime-to-documentation rule | The successor may change only `docs/**` and `menorah/docs/**`; executable/runtime drift requires a new runtime candidate and complete invalidation |
| PR | [#2](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/pull/2) |
| PR state at runtime freeze | `OPEN`, `DRAFT`, `MERGEABLE`, `CLEAN`, not merged |
| PR base | `main` at `8e292f2de421bc4a0aa148742bbd3cfa82647aa1` |
| Review state at runtime freeze | No reviewers, reviews, comments, labels, or assignees |

All six final-runtime workflow runs succeeded on their first attempt, 50/50
jobs and 404/404 steps:

- Push readiness: [run 30069836961](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836961), 1/1 jobs and 10/10 steps.
- Push functional: [run 30069836968](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836968), 9/9 jobs and 88/88 steps.
- Push security: [run 30069836976](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069836976), 15/15 jobs and 104/104 steps.
- PR readiness: [run 30069839620](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839620), 1/1 jobs and 10/10 steps.
- PR functional: [run 30069839619](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839619), 9/9 jobs and 88/88 steps.
- PR security: [run 30069839629](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30069839629), 15/15 jobs and 104/104 steps.

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
- the production probe rule's required 19 public HTTPS targets plus two call
  targets; the local `BlackboxProbeCoverageIncomplete` baseline remains a
  server-staging gate;
- off-host backup custody, whole-host disaster recovery, repeated recovery
  performance, or an approved RPO/RTO;
- real Razorpay/RazorpayX, Resend, regional call fallback, Cloudinary, face,
  social, or other provider callbacks, quotas, contracts, or incident paths;
- signed iOS/Android artifacts, Android Emulator, iOS Simulator, physical
  devices, restrictive networks, TestFlight/internal-track distribution,
  association files, declarations, or store review;
- responsive cross-browser behavior, a complete accessibility audit, or
  representative load;
- distinct administrator versus super-administrator role semantics; two
  synthetic aliases used the same full-admin role;
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

The concrete co-host blockers and required successor design are:

| Boundary | Current blocker | Required co-host successor condition |
| --- | --- | --- |
| Edge network | Production Compose attaches to fixed external `mentle_internal` | A reviewed override must use a uniquely labelled `menorah-staging-edge` network with non-overlapping IPAM; no staging service may attach to the production network |
| Docker daemon | `docker-metrics-gateway` mounts the shared host Docker socket | Omit it for co-host staging or provide an independently reviewed constrained metrics boundary; otherwise a separate host is mandatory |
| Host services | Backup/update units use fixed `menorah-*` names | Namespace every staging unit/timer `menorah-staging-*`, or keep automation disabled and use approved manual staging-only commands |
| Ports | Production defaults would collide | Proposed staging bindings are loopback TCP `22345`, `23001`–`23003`, `23100`, `27880`, `27881`, `28080`–`28084`, `28443`, `29090`, `29093`, and UDP `25000`–`25100`; every listener must be proven free before `up` |
| Secrets/config | Several production defaults can resolve outside the staging root | Canonical, non-symlink files must live under `/etc/menorah-staging/secrets/`, including Mongo keyfile, LiveKit, Alertmanager and Tunnel material, with approved owners/modes |
| Storage/state | String prefixes alone do not prove canonical isolation | Canonicalize and label `/srv/menorah-staging/{data,backups,deploy-state}` plus every named volume; reject any production bind, volume or backup root |
| Capacity | Most production services lack complete limits | Set and review CPU, memory and PID limits for every service/one-shot, disk reservations and stop thresholds from a host-capacity worksheet before a successor candidate is frozen |
| Providers/egress | Sandbox/disabled state is not complete for every provider | Fail closed on an exact Razorpay/Resend/LiveKit/optional-provider matrix, staging domains and permitted egress; retain redacted account attestations |
| Environment parser | Existing procedure sources Docker dotenv as Bash | Add a non-executing structured dotenv validator before any protected value is consumed |
| Synthetic bootstrap | Current server package prohibits the local seed/admin harness | Add a reviewed, target-bound, value-free staging bootstrap with the bounded fake roster; until then server functional QA remains blocked |
| Production invariance | Project-scoped checks do not prove the live project stayed unchanged | Capture safe before/after IDs, health/restarts, mounts, networks, listeners and unit/timer metadata for independent comparison |

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

1. For the requested existing Ubuntu server, design and independently approve
   a collision-free co-host overlay. If that review cannot prove the shared
   daemon/host boundary safe, use a separate staging VM/host instead.
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

An executable existing-server deployment plan is **BLOCKED** until the co-host
design exists and is approved. The exact safe handoff available now is the
following non-accepting, value-free discovery preflight; it deliberately ends
in **NO-GO** and is not a deployment command set or a co-host-safety proof. Run
it only on the approved Ubuntu server, never from this desktop, with shell
tracing disabled:

Any new co-host overlay, resource-limit or egress-isolation file is a runtime
change. It must be committed on the release branch, freeze a successor runtime
SHA and repeat the complete local candidate evidence before these commands may
accept it; `0b9f6e4` must not be deployed to the shared server as-is.

```bash
set -euo pipefail
umask 077

readonly RUNTIME_SHA='0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a'
readonly CANDIDATE_BRANCH='release/final-production-readiness'
readonly STAGING_REPO='/srv/menorah-staging/repository'
readonly STAGING_ENV='/etc/menorah-staging/staging.env'
readonly STAGING_CF_ENV='/etc/menorah-staging/cloudflare.env'
readonly STAGING_SENTINEL='/etc/menorah-staging/STAGING_HOST'
readonly APPROVED_COMPOSE_PROJECT='menorah-staging'
: "${APPROVED_PR_HEAD_SHA:?Set the exact reviewed PR #2 documentation HEAD}"
readonly APPROVED_PR_HEAD_SHA

test -f "${STAGING_SENTINEL}"
grep -qx 'MENORAH_STAGING_ONLY' "${STAGING_SENTINEL}"
test "$(readlink -f -- "${STAGING_ENV}")" = "${STAGING_ENV}"
test "$(readlink -f -- "${STAGING_CF_ENV}")" = "${STAGING_CF_ENV}"
test "$(stat -c '%a' "${STAGING_ENV}")" = '600'
test "$(stat -c '%a' "${STAGING_CF_ENV}")" = '600'
test "$(stat -c '%U:%G' "${STAGING_ENV}")" = 'root:menorah-staging'
test "$(stat -c '%U:%G' "${STAGING_CF_ENV}")" = 'root:menorah-staging'
test -d "${STAGING_REPO}/.git"
cd "${STAGING_REPO}"

git fetch --prune origin \
  "+refs/heads/${CANDIDATE_BRANCH}:refs/remotes/origin/${CANDIDATE_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${CANDIDATE_BRANCH}")" \
  = "${APPROVED_PR_HEAD_SHA}"
test "$(git rev-parse HEAD)" = "${APPROVED_PR_HEAD_SHA}"
test -z "$(git status --porcelain)"
git merge-base --is-ancestor "${RUNTIME_SHA}" "${APPROVED_PR_HEAD_SHA}"
git diff --quiet "${RUNTIME_SHA}..${APPROVED_PR_HEAD_SHA}" -- \
  . ':(exclude)docs/**' ':(exclude)menorah/docs/**'

# Safe metadata inventories for the independent collision review.
docker ps -a \
  --format '{{.Label "com.docker.compose.project"}}|{{.Names}}|{{.Ports}}'
docker network ls --format '{{.Name}}|{{.Driver}}|{{.Scope}}'
docker volume ls --format '{{.Name}}|{{.Driver}}'

for port in 22345 23001 23002 23003 23100 27880 27881 \
  28080 28081 28082 28083 28084 28443 29090 29093; do
  if ss -H -ltn "sport = :${port}" | grep -q .; then
    echo "Required staging TCP port is already in use: ${port}" >&2
    exit 1
  fi
done
for port in $(seq 25000 25100); do
  if ss -H -lun "sport = :${port}" | grep -q .; then
    echo "Required staging UDP port is already in use: ${port}" >&2
    exit 1
  fi
done

echo 'NO-GO: reviewed co-host overlay and successor runtime SHA do not exist' >&2
exit 1
```

The inventory contains names, project labels and ports only. Any
production/staging name, path, port, network,
volume, database, Redis, credential, provider, domain, CPU/memory or egress
collision stops the handoff. The current discovery preflight always returns
NO-GO; it cannot authorize deployment or accept `0b9f6e4`. After a named co-host
overlay is committed as a successor runtime, the full local suite is rerun,
and the overlay path and successor SHA are added to a separately reviewed
fail-closed validator, independently adapt and review
[the staging deployment procedure](./staging/03-staging-deployment-procedure.md)
for the shared-server boundary. Do not run its deployment commands on the
production host as currently written, and do not improvise a second Compose
project from the current production files.

Explicit prohibitions remain: no production volume, database, Redis,
environment file, provider credential, user data, counsellor data, health
data, KYC evidence, bank data, payment data, host-wide destructive test,
production firewall/DNS/Tunnel change, production migration, production
restore, or inference that this Windows result is an Ubuntu staging result.

## 15. Production verdict

**Production NOT READY**

Do not merge PR #2. Do not deploy production. Do not migrate or restore
production. The local verdict is evidence for proceeding to an isolated server
staging phase only.
