# Local QA Android/Web Report

## Summary

Overall result: PARTIAL

Local Docker APIs are healthy, iOS payment blocking remains intact, web/admin unauthenticated page smoke checks pass, and route isolation is mostly correct. Full Android UI QA is blocked because Android SDK tools are not installed on this machine. Authenticated web/admin/mobile flows are blocked because local QA users are not seeded, and api-admin currently does not mount the auth router used by the admin panel login.

## Environment

| Item | Value |
|---|---|
| Date/time | `2026-06-14T02:51:12+04:00` |
| Branch | `architecture/self-host-cloudrun-failover` |
| Commit under test | `da1a8292af00f08d7f964e71814f70d606d5a20d` |
| Docker stack | `menorah/deploy/docker-compose.home.yml` with `menorah/deploy/env/home.env` |
| Android emulator | BLOCKED - `emulator` not found |
| Android adb | BLOCKED - `adb` not found |
| Maestro | BLOCKED - not installed |

## API URLs

| Service | URL |
|---|---|
| api-ios | `http://localhost:18080` |
| api-android | `http://localhost:18084` |
| api-web | `http://localhost:18082` |
| api-admin | `http://localhost:18083` |
| worker | `http://localhost:18090` |
| web app | `https://app.localhost:8443` |
| admin panel | `https://admin.localhost:8443` |
| Android emulator API base | `http://10.0.2.2:18084/api` |

## Docker Compose Status

`docker compose -f menorah/deploy/docker-compose.home.yml --env-file menorah/deploy/env/home.env ps`

| Service | Result |
|---|---|
| `api-ios` | Up, healthy, `127.0.0.1:18080->8080` |
| `api-android` | Up, healthy, `127.0.0.1:18084->8080` |
| `api-web` | Up, healthy, `127.0.0.1:18082->8080` |
| `api-admin` | Up, healthy, `127.0.0.1:18083->8080` |
| `worker` | Up, healthy, `127.0.0.1:18090->8080` |
| `reverse-proxy` | Up, `8088->80`, `8443->443` |
| Mongo/Redis | Up |

## Health Checks

| Service | URL | Result |
|---|---|---|
| api-ios | `http://localhost:18080/health/ready` | PASS - `200` |
| api-android | `http://localhost:18084/health/ready` | PASS - `200` |
| api-web | `http://localhost:18082/health/ready` | PASS - `200` |
| api-admin | `http://localhost:18083/health/ready` | PASS - `200` |
| worker | `http://localhost:18090/health/ready` | PASS - `200` |

## Android QA

| Flow | Result | Notes |
|---|---|---|
| Android SDK tooling | BLOCKED | `emulator -list-avds` failed: command not found. `adb devices` failed: command not found. |
| Maestro automation | BLOCKED | `maestro` is not installed. |
| Expo API config | PASS | `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:18084/api npx expo config --json` resolved `extra.API_BASE_URL` to `http://10.0.2.2:18084/api`. |
| App launches without crash | BLOCKED | No emulator or adb available. |
| Login screen loads | BLOCKED | No emulator or adb available. |
| Signup/login with QA user | BLOCKED | No emulator or adb available. Local QA user login against api-android returned `401 Invalid credentials`, so the preferred QA user is not seeded. |
| Current user endpoint | PASS | api-android `/api/auth/me` returns `401` without token, proving the auth router is mounted and protected. Authenticated check blocked by missing seeded user. |
| Articles | API PASS, UI BLOCKED | api-web public articles returned `200`; Android UI blocked by missing emulator. |
| Counsellors | BLOCKED | UI blocked by missing emulator. |
| Booking | BLOCKED | UI blocked by missing emulator and no seeded user. |
| Booking payment | API PASS, UI BLOCKED | api-ios booking route returned `401` without token; Android full route is auth-protected. UI blocked by missing emulator. |
| Chat | BLOCKED | UI blocked by missing emulator and no seeded user. |
| Video/call | BLOCKED | UI blocked by missing emulator and no seeded user. |
| eKYC | BLOCKED | UI blocked by missing emulator and no seeded user. |
| Logout | BLOCKED | UI blocked by missing emulator and no seeded user. |

## Web App QA

| Flow | Result | Notes |
|---|---|---|
| Web app loads | PASS | Playwright loaded `https://app.localhost:8443/login` with HTTP `200`. |
| Login page loads | PASS | Playwright loaded `/login`. |
| Register page loads | PASS | Playwright loaded `/register`. |
| Login with QA user | BLOCKED | Preferred QA user is not seeded; direct api-android login returned `401 Invalid credentials`. |
| Dashboard/home loads | BLOCKED | Requires authentication. |
| Articles load | PASS | Playwright loaded `/articles` with HTTP `200`; api-web `/api/articles` returned `200`. |
| Counsellor list loads | BLOCKED | Requires authenticated/manual browser flow. |
| Booking flow opens | PASS unauth gate | `/bookings` redirected to `/login?redirect=%2Fbookings`, which is correct without auth. |
| Payment checkout route | BLOCKED | Requires authenticated user and booking fixture. |
| Chat page opens | PASS unauth gate | `/chat` redirected to `/login?redirect=%2Fchat`, which is correct without auth. |
| Video/call page opens | BLOCKED | Requires booking/auth fixture. |
| Logout works | BLOCKED | Requires authenticated session. |

## Admin QA

| Flow | Result | Notes |
|---|---|---|
| Admin panel loads | PASS | Playwright loaded `https://admin.localhost:8443/login` with HTTP `200`. |
| Admin login page loads | PASS | Login form rendered. |
| Admin login works with QA admin | FAIL | Admin panel calls `/api/auth/login`, but api-admin does not mount the auth router. Direct `POST http://localhost:18083/api/auth/login` returned `404` before rate limiting was hit. `GET http://localhost:18083/api/auth/me` returns `404`. |
| Dashboard loads | PASS unauth gate | `/dashboard` redirected to `/login?redirect=%2Fdashboard`, which is correct without auth. |
| Users page loads | PASS unauth gate | `/users` redirected to login. |
| Counsellors page loads | PASS unauth gate | `/counsellors` redirected to login. |
| Bookings page loads | BLOCKED | No admin bookings route/page was identified in the current admin panel file tree. |
| Articles/admin article section loads | PASS unauth gate | `/articles` redirected to login. |
| eKYC/admin verification section loads | PASS unauth gate | `/ekyc` redirected to login. |
| Social Studio loads | PASS unauth gate | `/ai-social-studio` redirected to login. |
| Admin-only API routes | PASS | `/api/admin` returns `404` on api-ios/api-android/api-web and `401` on api-admin. |

## API Smoke Test Results

Command:

```powershell
node menorah/scripts/qa/local-api-smoke-test.js
```

Result:

```text
PASS: 22
FAIL: 1
BLOCKED: 0
```

Failing check:

| Check | Expected | Actual | Result |
|---|---|---|---|
| api-admin auth router mounted for admin login | `401` from protected `/api/auth/me` | `404 Not Found - /api/auth/me` | FAIL |

## Payment Safety

| Check | Expected | Actual | Result |
|---|---|---|---|
| `POST /api/payments/create-subscription-checkout` on api-ios | `404` | `404` | PASS |
| `POST /api/payments/verify-subscription-payment` on api-ios | `404` | `404` | PASS |
| `GET /api/payments/subscription/status` on api-ios | `404` | `404` | PASS |
| Future subscription create route on api-ios | `404` | `404` | PASS |
| Future subscription verify route on api-ios | `404` | `404` | PASS |
| Future non-booking payment route on api-ios | `404` | `404` | PASS |
| Booking payment create route on api-ios | Auth-required response | `401 Access denied. No token provided.` | PASS |
| Android subscription payment route | Auth-required response | `401` | PASS |

## Route Isolation

| Check | Expected | Actual | Result |
|---|---|---|---|
| `GET http://localhost:18080/api/admin` | Not exposed | `404` | PASS |
| `GET http://localhost:18084/api/admin` | Not exposed | `404` | PASS |
| `GET http://localhost:18082/api/admin` | Not exposed | `404` | PASS |
| `GET http://localhost:18083/api/admin` | Exposed and auth protected | `401` | PASS |
| `GET http://localhost:18080/api/admin/stats` | Not exposed | `404` | PASS |
| `GET http://localhost:18084/api/admin/stats` | Not exposed | `404` | PASS |
| `GET http://localhost:18082/api/admin/stats` | Not exposed | `404` | PASS |
| `GET http://localhost:18083/api/admin/stats` | Exposed and auth protected | `401` | PASS |

## Browser Header Checks

| Domain | Permissions-Policy | Result |
|---|---|---|
| `https://app.localhost:8443/login` | `camera=(self), microphone=(self), geolocation=()` | PASS |
| `https://admin.localhost:8443/login` | `camera=(), microphone=(), geolocation=()` | PASS |

## Failures / Blockers

1. Android emulator UI QA is blocked because `emulator`, `adb`, and Maestro are not installed on this machine.
2. Local QA users are not seeded. `qa.user+local@menorah.test` with `TestPass123!` returned `401 Invalid credentials`.
3. Admin authenticated QA is blocked because api-admin does not mount `/api/auth`. The admin panel login uses `/auth/login` through its API client, so admin login against api-admin cannot succeed until an admin auth route is exposed.
4. Web/admin full authenticated browser workflows need seeded users and, for browser API calls through local Caddy, either local 443 mapped to Caddy or frontend rebuilds using API URLs that include `:8443`.
5. No screenshots were committed. The Playwright smoke run had no browser failures; Android screenshots could not be captured without emulator/adb.

## Next Steps

1. Install Android SDK platform tools and an emulator, then rerun Android QA with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:18084/api`.
2. Add a guarded local-only seed script for the preferred QA user, counsellor, and admin accounts, using `QA_SEED_ENABLED=true` plus development/test environment checks.
3. Expose an auth route needed by the admin panel on api-admin, or add a dedicated admin login route under `/api/admin/auth/login`.
4. For browser API-backed local QA, either map Caddy to local 443 or rebuild web/admin images with local API URLs that include `:8443`.
5. Rerun `node menorah/scripts/qa/local-api-smoke-test.js` and `python menorah/scripts/qa/local-web-admin-smoke.py` after the above fixes.
