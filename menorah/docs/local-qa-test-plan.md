# Local QA Test Plan

## Scope

Validate the architecture branch against the local Docker split APIs only. Do not touch production DNS, production APIs, Cloud Run, or real payment/provider flows.

## Local URLs

| Service | URL |
|---|---|
| api-ios | `http://localhost:18080` |
| api-android | `http://localhost:18084` |
| api-web | `http://localhost:18082` |
| api-admin | `http://localhost:18083` |
| worker | `http://localhost:18090` |
| web app via Caddy | `https://app.localhost:8443` |
| admin panel via Caddy | `https://admin.localhost:8443` |
| Android emulator API base | `http://10.0.2.2:18084/api` |

## Safety Rules

- Use only local Docker APIs.
- Do not use production payment keys for real charges.
- Do not send real SMS, OTP, or email during automated QA.
- Do not commit `.env`, tokens, screenshots with secrets, or local database dumps.
- Do not bypass production authentication logic.
- If test accounts are needed, create them only with a local-only guard such as `QA_SEED_ENABLED=true` and `NODE_ENV=development` or `NODE_ENV=test`.

## Preflight

Run:

```powershell
docker compose -f menorah/deploy/docker-compose.home.yml --env-file menorah/deploy/env/home.env ps
curl.exe -i http://localhost:18080/health/ready
curl.exe -i http://localhost:18084/health/ready
curl.exe -i http://localhost:18082/health/ready
curl.exe -i http://localhost:18083/health/ready
```

Expected:

- All split API containers are running.
- All readiness endpoints return `200`.

## API Smoke Suite

Run:

```powershell
node menorah/scripts/qa/local-api-smoke-test.js
```

The script validates:

- api-ios health endpoints.
- api-ios subscription and future non-booking payment routes return `404`.
- api-ios booking payment route exists and is auth-protected.
- api-android health, auth router, and subscription payment auth protection.
- api-web health, auth router, and public articles.
- api-admin health, auth route mounting, admin route auth protection.
- worker readiness.
- admin route isolation from api-ios, api-android, and api-web.

## Web And Admin Browser Smoke Suite

Run:

```powershell
python menorah/scripts/qa/local-web-admin-smoke.py
```

The script uses Python Playwright when available. It checks:

- Web login, register, and articles routes load through local Caddy.
- Web bookings and chat routes redirect to login when unauthenticated.
- Admin login loads through local Caddy.
- Admin dashboard, users, counsellors, articles, eKYC, and social studio routes redirect to login when unauthenticated.

## Android QA

Check tooling:

```powershell
emulator -list-avds
adb devices
```

If Android SDK tools are available, start an emulator and run:

```powershell
cd menorah/mobile-app
$env:EXPO_PUBLIC_API_BASE_URL = "http://10.0.2.2:18084/api"
npx expo start --dev-client
```

Target flows:

| Flow | Expected |
|---|---|
| App launch | No crash |
| Login screen | Loads |
| Signup/login | Works with seeded local QA user, or blocked by OTP/provider dependency |
| Current user | Authenticated `/auth/me` works |
| Articles | Loads from api-android |
| Counsellors | Loads from api-android |
| Booking | Opens and reaches creation/validation |
| Booking payment | Booking route is reachable and auth-protected |
| Chat | Opens or reaches auth/data requirement |
| Video | Reaches token/request stage |
| eKYC | Opens and handles missing/upload input safely |
| Logout | Clears session |

If emulator automation is unavailable, record the exact blocker and do not mark Android UI flows as passed.

## Test Data

Preferred local-only QA accounts:

| Role | Email |
|---|---|
| Normal user | `qa.user+local@menorah.test` |
| Counsellor | `qa.counsellor+local@menorah.test` |
| Admin | `qa.admin+local@menorah.test` |

Password for all: `TestPass123!`

If the accounts are not present and registration requires OTP/provider delivery, either add a guarded local seed script or record the blocker.
