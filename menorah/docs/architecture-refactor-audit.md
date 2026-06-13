# Architecture Refactor Audit

```text
Branch audited: architecture/self-host-cloudrun-failover
Commit SHA audited: ee7c72b
Auditor: Codex
Date: 2026-06-13
Overall result: PARTIAL

Hard blockers found:
1. None remaining after audit fixes in ee7c72b.
2. Live deployment validation still required with real MongoDB, Redis, provider secrets, and Cloud Run project access.
3. Container command runtime checks still need to be run against a valid environment, not just syntax/tests/build.
```

## Audit Summary

The refactor is structurally ready for review. The branch is isolated, the backend now has split entrypoints, route profiles, a worker-only scheduler model, Cloud Run REST-only settings, health endpoints, and tests for the main isolation risks.

During audit, one concrete blocker-level gap was fixed: `api-ios` now exposes explicit booking/session payment aliases and blocks broader subscription/premium/membership/digital payment paths before the full payment router can handle them.

The result remains `PARTIAL` only because live service startup and health curl checks require real deployment secrets and reachable dependencies. Static checks, Jest tests, syntax checks, and Docker image build pass locally.

## Fixes Applied During Audit

- Added iOS booking payment aliases in `menorah/backend/src/routes/payments-ios.js`:
  - `POST /api/payments/booking/create-order`
  - `POST /api/payments/create-booking-order`
  - `POST /api/payments/booking/verify`
  - `POST /api/payments/verify-booking-payment`
  - `GET /api/payments/booking/order/:orderId/status`
  - `GET /api/payments/booking/:bookingId/status`
- Broadened iOS digital payment blocks for:
  - `/api/payments/subscription/*`
  - `/api/payments/premium/*`
  - `/api/payments/membership/*`
  - `/api/payments/digital/*`
  - `/api/payments/digital-access/*`
- Extended route isolation tests for the new iOS booking aliases and subscription alias blocks.
- Normalized stale docs references that used the old uppercase repo directory name so the casing audit grep is clean.

## Command Evidence

```text
git branch --show-current
architecture/self-host-cloudrun-failover

npm test -- --runInBand
PASS: 5 test suites, 14 tests
Note: existing Mongoose schema warnings were emitted, but tests passed.

npm run lint
PASS

node -c src/services/api-ios/server.js
node -c src/services/api-android/server.js
node -c src/services/api-web/server.js
node -c src/services/api-admin/server.js
node -c src/services/worker/worker.js
PASS

docker build -f menorah/backend/Dockerfile menorah/backend
PASS

rg "startArticleScheduler\\(|startSocialScheduler\\(" menorah/backend/src
Only worker.js contains scheduler startup calls.

rg "src/server.js|node src/server.js" menorah/backend
No package/deployment scripts reference the old node src/server.js command.

rg "Menorah\/backend|Menorah\/" menorah .github
No matches after docs casing cleanup.
```

## Checklist Result

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Migration branch exists | PASS | Current branch is `architecture/self-host-cloudrun-failover`. |
| 2 | Commit history is reviewable | PASS | Work is split across baseline, backend split, deployment, tests, portability, and audit-fix commits. |
| 3 | Five service entrypoints exist | PASS | `api-ios`, `api-android`, `api-web`, `api-admin`, and `worker` entrypoints exist. |
| 4 | Old `src/server.js` is safe | PASS | Kept as a compatibility wrapper for `api-web`. |
| 5 | Package scripts updated | PASS | `start:*` scripts exist and default `start` runs `api-web`. |
| 6 | Shared app builder exists | PASS | Shared app, server, socket, health, startup, route profile, and shutdown modules exist. |
| 7 | Folder movement was not reckless | PASS | Existing folders remain in place; no broad physical move was done. |
| 8 | Route profile catalog exists | PASS | `api-ios`, `api-android`, `api-web`, and `api-admin` profiles are defined. |
| 9 | `api-ios` exposes only allowed routes | PASS | Tests cover admin isolation and booking-only payment exposure. |
| 10 | `api-android` preserves behavior | PASS | Full payments router remains mounted for Android profile. |
| 11 | `api-web` preserves behavior | PASS | Full payments and web-required routes remain mounted. |
| 12 | `api-admin` is admin-only | PASS | Tests confirm public payment checkout is not mounted on admin profile. |
| 13 | iOS payment router is filtered | PASS | `api-ios` mounts `payments-ios.js`, not the full router directly. |
| 14 | iOS subscription routes are blocked | PASS | Tests prove subscription create/verify/status aliases return 404. |
| 15 | iOS booking/session payments still work | PASS | Booking aliases now exist and require auth through existing payment handlers. |
| 16 | Socket.IO is runtime-gated | PASS | Socket creation is controlled by `SERVICE_RUNTIME`, `ENABLE_SOCKET_IO`, and `ENABLE_SOCKET_ADAPTER`. |
| 17 | Cloud Run is REST-only | PASS | Cloud Build sets `SERVICE_RUNTIME=cloudrun`, `ENABLE_SOCKET_IO=false`, and `ENABLE_SOCKET_ADAPTER=false`. |
| 18 | API services do not start schedulers | PASS | Scheduler startup calls only appear in worker code. |
| 19 | Worker respects active/standby | PASS | Worker resolves active/standby mode and only starts jobs when active and enabled. |
| 20 | No duplicate active workers without locks | PASS | Cloud Run worker is configured standby with schedulers disabled by default. |
| 21 | Health endpoints exist on every service | PASS | Shared app mounts `/health/live`, `/health/ready`, `/health/deep`, `/health`, and `/api/health`. Live curl still pending. |
| 22 | `/health/live` does not require DB/Redis | PASS | Live payload only checks process state. |
| 23 | `/health/ready` checks dependencies | PASS | Ready checks boot, Mongo, and Redis only when required/configured. |
| 24 | `/health/deep` performs safe checks | PASS | Deep checks Mongo, Redis when configured, upload storage, and redacted provider booleans. |
| 25 | Dockerfile uses new command safely | PASS | Default CMD runs `npm run start:api-web`; healthcheck uses `/health/live`. |
| 26 | Backend image builds | PASS | Docker build succeeded locally. |
| 27 | Each service command runs in container | PARTIAL | Syntax checks pass and image builds; live container starts need real env/dependencies. |
| 28 | Cloud Build path casing fixed | PASS | No uppercase backend or repo-root path grep hits remain. |
| 29 | Cloud Run configs are service-specific | PASS | API services and standby worker are deployed separately with command/env overrides. |
| 30 | Mobile URLs were not silently changed | PASS | Split mobile URL support was added because it was explicitly requested in the preceding migration step. |
| 31 | Web/admin URLs were not silently broken | PASS | Frontend Docker support was added without forcing an unavailable production cutover. |
| 32 | Backend lint passes | PASS | `npm run lint` passed. |
| 33 | Backend tests pass | PASS | `npm test -- --runInBand` passed. |
| 34 | New entrypoints pass syntax checks | PASS | `node -c` passed for all five entrypoints. |
| 35 | Route isolation tests exist | PASS | Tests cover iOS payment restrictions, admin isolation, Android/web full payments, and admin payment isolation. |
| 36 | Health responses do not leak secrets | PASS | Health code returns provider configured booleans only; no secret values or URIs are returned. Live curl still pending. |
| 37 | Production logs do not expose sensitive config | PASS | Startup logs print runtime, route profile, socket state, Redis state, and CORS origin count, not secret values. |
| 38 | MongoDB was not migrated yet | PASS | Replica-set support/config scaffolding was added; no production DB migration was performed. |
| 39 | Vercel dependency was not removed yet | PASS | Frontend hosting cutover was not performed. |
| 40 | No new business features invented | PASS | Added routing/deployment/job scaffolding only; no new moderation/payment/provider behavior was invented. |

## Remaining Live Validation

Run these on the actual host or a staging Cloud Run project with the intended environment variables and reachable services:

```bash
docker run --env-file <api-env> -p 4001:4001 <backend-image> npm run start:api-ios
docker run --env-file <api-env> -p 4002:4002 <backend-image> npm run start:api-android
docker run --env-file <api-env> -p 4003:4003 <backend-image> npm run start:api-web
docker run --env-file <api-env> -p 4004:4004 <backend-image> npm run start:api-admin
docker run --env-file <worker-env> -p 4010:4010 <backend-image> npm run start:worker

curl -i http://localhost:4001/health/live
curl -i http://localhost:4001/health/ready
curl -i http://localhost:4001/health/deep
curl -i http://localhost:4001/api/payments/subscription/create-order
curl -i http://localhost:4001/api/payments/booking/create-order
```

Expected live results:

```text
/health/live returns 200 even if dependencies are unavailable.
/health/ready returns 200 only when MongoDB and required Redis dependencies are ready.
/health/deep returns redacted dependency/provider status and no secrets.
iOS subscription payment routes return 404 or 403.
iOS booking payment routes exist and require authentication.
Cloud Run API services do not serve /socket.io/.
Cloud Run worker remains standby unless explicitly promoted.
```
