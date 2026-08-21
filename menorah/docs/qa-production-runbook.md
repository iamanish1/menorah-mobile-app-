# Menorah Production QA Runbook

This runbook covers safe production QA automation for public web, admin, counsellor web, production APIs, email OTP, and mobile Expo flows.

## Safety Rules

- Do not commit secrets, passwords, OTPs, JWTs, or env files.
- Do not hardcode real passwords in test files.
- Use admin credentials only through `QA_ADMIN_EMAIL` and `QA_ADMIN_PASSWORD`.
- Create production QA users only with emails matching:
  `tejasamirth+menorahqa-*@gmail.com`
- Keep OTP verification human-in-the-loop. Read OTPs from Gmail and pass them through `QA_OTP` only in the shell.

## One-Time QA Tool Setup

```bash
cd /opt/menorah/menorah/scripts/qa
npm install
npx playwright install chromium
```

This installs QA-only dependencies under `scripts/qa`.

## Public Web, Admin, And Counsellor Browser Smoke

Runs Playwright browser checks for:

- `www.menorah.me`
- `app.menorah.me`
- `app.menorah.me/login`
- unauthenticated `admin.menorah.me` redirect
- `admin.menorah.me/login`
- `counsellor.menorah.me/login`
- optional admin login when `QA_ADMIN_EMAIL` and `QA_ADMIN_PASSWORD` are set

```bash
cd /opt/menorah/menorah/scripts/qa
npm run test:web
```

Optional:

```bash
QA_COUNSELLOR_WEB_URL='https://counsellor.example.com' npm run test:web
QA_ADMIN_EMAIL='set-in-shell' QA_ADMIN_PASSWORD='set-in-shell' npm run test:web
```

## Production API Smoke

Checks:

- `api-web /health/ready`
- `api-ios /health/ready`
- `api-android /health/ready`
- `api-admin /health/ready`
- unauthenticated `/api/auth/me` returns `401`
- wrong-password login returns `401`
- optional real admin login/logout when env credentials are supplied

```bash
cd /opt/menorah/menorah/scripts/qa
npm run test:api
```

Optional:

```bash
QA_ADMIN_EMAIL='set-in-shell' QA_ADMIN_PASSWORD='set-in-shell' npm run test:api
```

## Email OTP E2E

Step 1 sends an OTP and stops:

```bash
cd /opt/menorah/menorah/scripts/qa
QA_EMAIL='tejasamirth+menorahqa-YYYYMMDDHHMM@gmail.com' \
QA_PASSWORD='set-in-shell' \
npm run test:otp
```

Expected result: signup passes, OTP required, and the script exits with `NOT VERIFIED` until `QA_OTP` is supplied.

Step 2 verifies OTP and continues login/logout:

```bash
QA_EMAIL='tejasamirth+menorahqa-YYYYMMDDHHMM@gmail.com' \
QA_PASSWORD='set-in-shell' \
QA_OTP='set-from-gmail' \
npm run test:otp
```

The script then checks:

- OTP verification
- login
- `/api/auth/me`
- `/api/users/me`
- logout
- wrong-password `401`
- duplicate registration behavior
- forgot-password email trigger for the QA account

## Mobile Expo / Maestro QA

Run these from a workstation with Maestro and an emulator/simulator/device:

```bash
cd /opt/menorah/menorah/mobile-app
maestro test maestro/00-launch.yaml
maestro test maestro/01-auth-navigation.yaml
QA_EMAIL='tejasamirth+menorahqa-YYYYMMDDHHMM@gmail.com' \
QA_PASSWORD='set-in-shell' \
maestro test maestro/02-login-logout.yaml
maestro test maestro/03-email-otp-manual.yaml
```

Maestro is not required on the production server. These files are committed test plans that can be run from the mobile QA machine.

## Combined Safe Gate

This runs API and browser smoke checks without creating users:

```bash
cd /opt/menorah/menorah/scripts/qa
npm run test:all-safe
```

## Still Manual

- Reading Gmail OTP.
- App Store / Play Store privacy forms.
- Real booking/payment E2E with the intended Razorpay mode.
- Chat send/receive across two users.
- Video/call quality through `calls.menorah.me`.
- Admin/counsellor workflow checks unless QA credentials are supplied.
