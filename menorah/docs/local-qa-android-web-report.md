# Local QA Android/Web Report

## Summary

Overall result: PARTIAL

All local API and web/admin automated checks now pass. The remaining partial status is only because Android emulator UI automation is blocked by missing Android SDK tooling on this Windows machine. The prior api-admin auth blocker is fixed: api-admin now exposes a limited admin auth router, seeded admin login succeeds, seeded normal-user login is rejected, and public registration/OTP/reset flows remain absent from api-admin.

## Final Audit Status

| Area | Result |
|---|---|
| API smoke | PASS - 30 PASS, 0 FAIL, 0 BLOCKED |
| Web/admin smoke | PASS - 19 PASS, 0 FAIL, 0 BLOCKED |
| Admin auth | PASS |
| QA seed | PASS |
| Android UI QA | BLOCKED - tooling missing (`emulator`, `adb`, Maestro) |

## Merge Status

Do not merge this branch to `main` yet. The branch is local-staging-ready, but not production-ready.

External validation still required:

- Public DNS/proxy wiring.
- Cloud Run staging deploy.
- Cloud Run standby worker validation.
- Cloud Run REST-only validation.
- Public HTTPS health checks.
- Android emulator QA.
- iOS simulator or real-device QA.

Next technical phase: create staging Cloud Run services first, not production services:

- `staging-menorah-api-ios`
- `staging-menorah-api-android`
- `staging-menorah-api-web`
- `staging-menorah-api-admin`
- `staging-menorah-worker`

Cloud Run staging must prove `/health/ready` returns `200` on all APIs, worker stays standby, `/socket.io/` is not exposed, iOS subscription Razorpay routes remain `404`, admin login works with a seeded staging admin, and `/health/deep` leaks no secrets.

## Environment

| Item | Value |
|---|---|
| Date/time | `2026-06-14T03:35:00+04:00` |
| Branch | `architecture/self-host-cloudrun-failover` |
| Base commit before this fix | `8e854e4` |
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

## Local QA Seed

Command:

```powershell
docker compose -f menorah/deploy/docker-compose.home.yml --env-file menorah/deploy/env/home.env run --rm --no-deps -e QA_SEED_ENABLED=true -e NODE_ENV=development api-admin npm run seed:qa
```

Result:

| Account | Result |
|---|---|
| `qa.user+local@menorah.test` | Created |
| `qa.counsellor+local@menorah.test` | Created |
| `qa.admin+local@menorah.test` | Created |

The seed script is guarded by `QA_SEED_ENABLED=true` plus a local-safe environment gate and does not print passwords.

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
| Signup/login with QA user | API READY, UI BLOCKED | Seeded QA user exists; UI blocked by missing emulator/adb. |
| Current user endpoint | PASS | api-android `/api/auth/me` returns `401` without token, proving the auth router is mounted and protected. |
| Articles | API PASS, UI BLOCKED | api-web public articles returned `200`; Android UI blocked by missing emulator. |
| Counsellors | BLOCKED | UI blocked by missing emulator. |
| Booking | BLOCKED | UI blocked by missing emulator. |
| Booking payment | API PASS, UI BLOCKED | Booking payment route is auth-protected; UI blocked by missing emulator. |
| Chat | BLOCKED | UI blocked by missing emulator. |
| Video/call | BLOCKED | UI blocked by missing emulator. |
| eKYC | BLOCKED | UI blocked by missing emulator. |
| Logout | BLOCKED | UI blocked by missing emulator. |

## Web App QA

| Flow | Result | Notes |
|---|---|---|
| Web app loads | PASS | Playwright loaded `https://app.localhost:8443/login` with HTTP `200`. |
| Login page loads | PASS | Playwright loaded `/login`. |
| Register page loads | PASS | Playwright loaded `/register`. |
| Login with QA user | API READY, UI NOT AUTOMATED | Seeded QA user exists; authenticated web-user UI flow was not expanded in this pass. |
| Dashboard/home loads | BLOCKED | Requires web-user authenticated UI flow. |
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
| Admin login works with QA admin | PASS | Seeded admin login reached `https://admin.localhost:8443/dashboard`. |
| Normal user rejected on api-admin | PASS | Seeded normal user login returned `403`. |
| Dashboard loads | PASS | Authenticated `/dashboard` returned HTTP `200`. |
| Users page loads | PASS | Authenticated `/users` returned HTTP `200`. |
| Counsellors page loads | PASS | Authenticated `/counsellors` returned HTTP `200`. |
| Bookings page loads | BLOCKED | No admin bookings route/page was identified in the current admin panel file tree. |
| Articles/admin article section loads | PASS | Authenticated `/articles` returned HTTP `200`. |
| eKYC/admin verification section loads | PASS | Authenticated `/ekyc` returned HTTP `200`. |
| Social Studio loads | PASS | Authenticated `/ai-social-studio` returned HTTP `200`. |
| Admin-only API routes | PASS | `/api/admin` returns `404` on api-ios/api-android/api-web and `401` on api-admin without token. |

## API Smoke Test Results

Command:

```powershell
node menorah/scripts/qa/local-api-smoke-test.js
```

Result:

```text
PASS: 30
FAIL: 0
BLOCKED: 0
```

Admin auth checks:

| Check | Expected | Actual | Result |
|---|---|---|---|
| `GET /api/auth/me` without token on api-admin | `401` | `401` | PASS |
| `POST /api/auth/login` empty body on api-admin | `400` | `400` | PASS |
| Seeded admin login on api-admin | `200` | `200` | PASS |
| Seeded normal user login on api-admin | rejected | `403` | PASS |
| `POST /api/auth/register` on api-admin | `404` | `404` | PASS |
| `POST /api/auth/forgot-password` on api-admin | `404` | `404` | PASS |
| `POST /api/auth/verify-email-otp` on api-admin | `404` | `404` | PASS |
| `GET /api/auth/me` with admin token | `200` | `200` | PASS |

## Web/Admin Smoke Test Results

Command:

```powershell
python menorah/scripts/qa/local-web-admin-smoke.py
```

Result:

```text
PASS: 19
FAIL: 0
BLOCKED: 0
```

## Payment Safety

| Check | Expected | Actual | Result |
|---|---|---|---|
| `POST /api/payments/create-subscription-checkout` on api-ios | `404` | `404` | PASS |
| `POST /api/payments/verify-subscription-payment` on api-ios | `404` | `404` | PASS |
| `GET /api/payments/subscription/status` on api-ios | `404` | `404` | PASS |
| Future subscription create route on api-ios | `404` | `404` | PASS |
| Future subscription verify route on api-ios | `404` | `404` | PASS |
| Future non-booking payment route on api-ios | `404` | `404` | PASS |
| Booking payment create route on api-ios | Auth-required response | `401` | PASS |
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
2. Web user authenticated flows beyond unauthenticated route gates were not expanded in this admin-auth fix pass.
3. Admin bookings page remains blocked because no admin bookings page exists in the current admin panel routes.

## Next Steps

1. Install Android SDK platform tools and an emulator, then rerun Android QA with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:18084/api`.
2. Expand web-user authenticated Playwright coverage using the seeded normal QA user.
3. Add an admin bookings page or remove it from future QA acceptance criteria if it is not a product requirement.
