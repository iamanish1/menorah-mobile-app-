# Production Readiness TODO For July 3, 2026

Target: get the Menorah app stack ready for production traffic by Friday, July 3, 2026.

This checklist is based on a local repo sweep on July 2, 2026. It covers backend APIs, web apps, mobile app, Social Studio/brand tooling, self-host deployment, Cloudflare ingress, rate limiting, payments, calls, backups, monitoring, QA, and release operations.

## Production-Ready Master Checklist

Use this as the final go/no-go list. The app is not production-ready until every P0 item here is either completed or explicitly accepted by you as a launch risk.

### 1. Code, Branch, And Release Control

- [ ] Freeze scope. No new features unless they fix a launch blocker.
- [ ] Review all uncommitted local changes and separate your own edits from generated/audit fixes.
- [ ] Confirm the release branch and exact commit SHA.
- [ ] Confirm no secrets are staged or committed.
- [ ] Commit or stash the launch-ready changes before deployment.
- [ ] Push the release branch so the MacBook/host/GitHub state is recoverable.
- [ ] Keep rollback commit SHA written down before deploying.

### 2. Security And Dependency Gate

- [x] Backend production audit is clean.
- [x] User web production audit is clean.
- [x] Admin panel production audit is clean.
- [x] Counsellor web production audit is clean.
- [x] Mobile critical/high audit findings are cleared.
- [ ] Decide whether to accept the remaining mobile moderate Expo audit findings or postpone mobile launch until an Expo 57 upgrade is tested.
- [ ] Confirm all production secrets are strong, unique, and only stored on the host or provider dashboards.
- [ ] Confirm JWT, refresh JWT, Razorpay, LiveKit, email, database, Redis, backup, Cloudinary, Google, Apple, and Social Studio secrets are not placeholders.
- [ ] Confirm production logs do not expose JWTs, OTPs, provider tokens, authorization headers, webhook bodies, or raw secrets.

### 3. Production Environment

- [x] Fill and verify `deploy/env/production.env` on the host.
- [x] Fill and verify `deploy/env/cloudflare.env` on the host.
- [x] Fill and verify `deploy/livekit/livekit.yaml` on the host.
- [x] Confirm `ALLOWED_ORIGINS` contains only production domains.
- [ ] Confirm production canonical domains: `www`, `app`, `admin`, `counsellor`, `api-ios`, `api-android`, `api-web`, `api-admin`, and `calls`.
- [x] Replace production runtime/mobile `menorahhealth.app` fallbacks with `menorah.me` domains.
- [ ] Add Social Studio env if brand/social publishing is launching.
- [x] Add remaining Google Android auth env if Google login is launching on Android.
- [x] Defer iOS app launch until the Apple developer account review is complete.
- [x] Run provider/env validation with production env loaded.

### 4. Gateway, Cloudflare, And Network

- [x] Confirm Cloudflare Tunnel is running and is the only intended public ingress.
- [x] Confirm Caddy routes every hostname to the correct internal service.
- [ ] Enable Cloudflare WAF managed rules.
- [ ] Add Cloudflare rate rules for auth, general API, upload routes, and admin hostname.
- [ ] Confirm backend Redis-backed rate limiting is active in production.
- [ ] Confirm host firewall does not expose MongoDB, Redis, Prometheus, Loki, Grafana, or Uptime Kuma publicly.
- [ ] Confirm LiveKit media ports are open as required: `7881/tcp` and `50000-50100/udp`.
- [ ] Confirm SSH is private only, preferably via Tailscale or Cloudflare Access, not public port 22.

### 5. Backend API Readiness

- [x] Confirm backend tests pass.
- [x] Confirm backend lint passes.
- [x] Confirm route isolation:
  - `api-ios`, `api-android`, and `api-web` do not expose admin routes.
  - `api-admin` does not expose public payment checkout routes.
  - iOS payment profile exposes only the intended booking payment routes.
- [x] Confirm `/health/live`, `/health/ready`, and `/health/deep` work.
- [x] Confirm `/health/deep` returns redacted provider status only.
- [ ] Confirm production error responses do not include stack traces.
- [ ] Confirm Redis is required in production and app startup fails if Redis is unavailable.

### 6. Web Apps

- [x] User web production build passes.
- [x] Admin panel production build passes.
- [x] Counsellor web production build passes.
- [ ] Confirm web production env is baked into the deployed images.
- [ ] Verify login/logout and protected route redirects on all web apps.
- [ ] Verify user booking, payment return, chat, and video routes.
- [ ] Verify admin dashboard, users, counsellors, articles, payouts/revenue, and Social Studio if launching.
- [ ] Verify counsellor dashboard, sessions, chat, and call flows.
- [ ] Decide whether current web lint warnings are acceptable for launch.

### 7. Mobile App

- [x] Mobile typecheck passes.
- [x] Mobile critical/high audit findings are cleared.
- [x] Expo Doctor improved to 17/18 checks.
- [ ] Resolve or explicitly accept Expo Doctor's native-project sync warning.
- [x] Confirm production EAS env for Android.
- [x] Confirm Google Android client ID is set if Google login is launching on Android.
- [x] Defer Apple/iOS sign-in and iOS production build until Apple account review is complete.
- [ ] Confirm account deletion, privacy policy, terms, and support paths work.
- [ ] Confirm moderation/blocking UI is either backed by real endpoints or hidden.
- [x] Run production Android EAS build.
- [x] Defer production iOS EAS build until Apple developer account review is complete.
- [ ] Test the app on a real device before submitting or sending users.

### 8. Payments, Calls, And Critical User Flows

- [ ] Verify Razorpay live/test mode decision.
- [ ] Verify booking payment create and verify flow end-to-end.
- [ ] Verify Razorpay webhook signature validation in production.
- [ ] Verify duplicate webhook delivery is idempotent.
- [ ] Verify failed payment behavior.
- [ ] Verify payouts are either fully configured or disabled/hidden.
- [ ] Verify LiveKit call on normal network.
- [ ] Verify LiveKit call on restrictive network or TCP fallback.
- [ ] Verify chat send/read/delete/typing between real accounts.
- [ ] Verify India/UAE/unknown-region call policy behavior.

### 9. Data, Backups, Restore, And Monitoring

- [ ] Confirm MongoDB app/root/backup/restore users are distinct.
- [ ] Confirm MongoDB keyfile permissions are correct.
- [x] Run a fresh encrypted backup.
- [x] Restore the newest backup into the restore-test database.
- [ ] Confirm backup retention policy.
- [ ] Configure Uptime Kuma checks for all public pages and API readiness endpoints.
- [ ] Configure alerts for API down, 5xx spikes, disk usage, backup failure, Mongo/Redis down, and LiveKit down.
- [ ] Confirm log rotation and disk retention.
- [x] Confirm Grafana, Prometheus, Loki, MongoDB, Redis, and Uptime Kuma are private.

### 10. Deployment And Smoke Testing

- [x] Validate Docker Compose config with real env files.
- [ ] Run first deployment on the host.
- [x] Confirm containers are healthy: MongoDB, Redis, APIs, worker, web apps, Caddy, Cloudflare tunnel, LiveKit, monitoring.
- [x] Run local health checks from the host.
- [x] Run public health checks through Cloudflare.
- [ ] Run safe QA smoke tests.
- [x] Run API smoke tests.
- [ ] Run browser smoke tests.
- [ ] Manually verify registration, OTP, login, password reset, profile, eKYC, counsellor browsing, booking, payment, chat, video, admin, articles, and Social Studio if launching.
- [ ] Monitor logs, health, payments, calls, backups, CPU, memory, disk, and 5xx responses for at least 2 hours after go-live.

## Current Audit Snapshot

Passed locally:

- Backend tests: 11 suites, 36 tests passed on July 3.
- Backend lint: passed on July 3.
- Backend production dependency audit: 0 vulnerabilities.
- User web production dependency audit: 0 vulnerabilities.
- Admin panel production dependency audit: 0 vulnerabilities.
- Counsellor web production dependency audit: 0 vulnerabilities.
- Mobile typecheck: passed after dependency/config fixes on July 3.
- Mobile high/critical production audit findings: cleared with normal `npm audit fix`.
- Mobile Expo Doctor: improved to 17/18 checks passing.
- User web build: passed after moving stale root-owned `.next` output aside.
- Admin panel build: passed after moving stale root-owned `.next` output aside.
- Counsellor web build: passed after moving stale root-owned `.next` output aside.
- User web lint: passed with 3 warnings after excluding parked root-owned dependency folders.
- Counsellor web lint: passed with 28 warnings after excluding parked root-owned dependency folders.
- Mobile lint: passed with warnings only after excluding parked root-owned dependency folders.
- Production compose syntax validates with real production/cloudflare env files.
- Redacted provider/env validation passed for required env and Resend.
- JWT secrets and backup encryption password are 64+ chars; JWT and refresh secrets differ.
- Local and public health checks pass through Cloudflare.
- LiveKit container is running and `https://calls.menorah.me` returns 200.
- Fresh encrypted daily backup created and restored into restore-test on July 3.
- API smoke passed 7 checks; admin credential login smoke is blocked until `QA_ADMIN_EMAIL` and `QA_ADMIN_PASSWORD` are set.
- MSG91 has been removed from the production provider path; email OTP/transactional email uses Resend only.
- Web Google auth env is present in production, and mobile EAS profiles no longer overwrite Google IDs with blank values.
- Android native settings were checked for the Android-first launch: package `com.menorah.healthmobile`, version `2.6.0`, versionCode `14`, required permissions, deep-link schemes, and New Architecture enabled for Reanimated 4.
- iOS app launch is deferred until the Apple developer account review is complete.
- After the MSG91/social-auth changes, backend tests, backend lint, mobile typecheck, mobile lint with `--quiet`, user web build, Compose config validation, and provider validation were rerun.
- After the Android-first rescope on July 4, mobile typecheck, mobile lint with `--quiet`, production provider validation, and Compose config validation passed. Expo Doctor remains 17/18 with only the native-folder sync warning.
- Google Android OAuth is configured in production env and Android EAS profiles; provider validation and Expo config show Android Google Sign-In configured on July 5.
- Android production EAS build `3c79a458-91a0-4093-a7ce-6972ccd3f6b7` finished on July 5 after enabling Android New Architecture for Reanimated 4. Artifact: `https://expo.dev/artifacts/eas/vLZuevJ4G4Zj6z6xhEysKu3SFDouVUHbgJR-6lmUwWg.aab`.
- `deploy/env/production.env` is ignored by Git and not tracked.

Blocked or needs action:

- Old root-owned Next build folders were moved aside as `.next.root-owned-20260702T173408Z` and ignored via top-level `.gitignore`; remove them later with interactive sudo or host cleanup.
- Old root-owned package installs were moved aside as `node_modules.root-owned-*` and ignored/excluded from local tooling; remove them later with interactive sudo or host cleanup.
- Admin lint script uses deprecated `next lint` and opens an interactive setup prompt, so it is not a usable CI/release gate yet.
- Mobile production audit still reports 16 moderate Expo toolchain findings. `npm audit` says the remaining fix requires a breaking Expo/CLI 57 upgrade, so do not force it without a dedicated native regression pass.
- Expo Doctor still reports that native `android/` and `ios/` folders exist, so app config fields will not auto-sync into native projects during EAS Build. Either manually verify native settings or run a controlled prebuild before release.
- Browser smoke is blocked on missing host OS dependencies for Playwright Chromium. `npx playwright install-deps chromium` needs interactive sudo.
- SSH is listening on `0.0.0.0:22`; lock this behind Tailscale/Cloudflare Access or host firewall before treating remote admin as production-safe.
- LiveKit HTTP signaling is up, but a real media call on normal and restrictive networks still needs device testing.
- iOS OAuth/App Store work is intentionally deferred until the Apple developer account review is complete.
- Android production EAS build `41630885-32d9-46de-8dbe-7735eceeaa97` uploaded successfully but failed in Gradle because Reanimated 4 requires Android New Architecture.
- Android `newArchEnabled=true` is now set and replacement build `3c79a458-91a0-4093-a7ce-6972ccd3f6b7` finished successfully: https://expo.dev/accounts/menorahsoftware/projects/menorah-health-app/builds/3c79a458-91a0-4093-a7ce-6972ccd3f6b7
- Expo Doctor still reports native-project sync warning because native `android/` and `ios/` folders are checked in. For Android-first launch, Android native settings were manually checked; rerun Doctor before each EAS build and accept this warning only if native Android files still match app config.
- Mobile client still has TODO endpoint mappings for moderation, blocking, privacy preferences, and account deletion in `mobile-app/src/lib/api.ts`.
- Social Studio/brand publishing code requires env that is not fully represented in `deploy/docker-compose.production.yml` / `deploy/env/production.env.example`, especially `SOCIAL_TOKEN_ENCRYPTION_KEY` and optional `SOCIAL_STUDIO_*` / `CLOUDINARY_SOCIAL_STUDIO_*` settings.
- Backend tests emit Mongoose warnings for duplicate payout indexes and reserved `errors` schema paths. Not a launch blocker if tests pass, but clean after go-live.

## P0 No-Go Checklist

These must be done before sending real production traffic.

- [ ] Freeze scope for July 3. No new features unless they fix a launch blocker.
- [ ] Review and commit/stash current local changes. Current working tree has edits in:
  - `mobile-app/src/screens/auth/LoginModern.tsx`
  - `mobile-app/src/screens/auth/Register.tsx`
- [ ] Decide the release branch and exact commit SHA. Current branch observed locally: `architecture/self-host-cloudrun-failover`.
- [ ] Confirm no real secrets are staged:
  - `git status --short --untracked-files=all`
  - `git diff --cached --name-only`
- [x] Fix local build-output ownership workaround, then rerun web builds:
  - Moved root-owned `.next` folders aside as `.next.root-owned-20260702T173408Z`.
  - `cd user-web-app && npm run build`
  - `cd ../admin-panel && npm run build`
  - `cd ../web-app && npm run build`
- [x] Patch backend/web dependency audit blockers:
  - `cd backend && npm audit --omit=dev --audit-level=high`
  - `cd ../user-web-app && npm audit --omit=dev --audit-level=high`
  - `cd ../admin-panel && npm audit --omit=dev --audit-level=high`
  - `cd ../web-app && npm audit --omit=dev --audit-level=high`
- [x] Patch mobile critical/high audit blockers with normal `npm audit fix`.
- [ ] Decide whether to accept the remaining mobile moderate Expo audit findings for July 3 or schedule the breaking Expo 57 upgrade separately.
- [x] Prioritize backend/public web dependency fixes first: `axios`, `express`/`path-to-regexp`/`qs`, `mongoose`, `socket.io`/`ws`, `cloudinary`, `form-data`, `validator`, `next`, and `nodemailer`.
- [x] Fill production env on the host, not in Git:
  - `deploy/env/production.env`
  - `deploy/env/cloudflare.env`
  - `deploy/livekit/livekit.yaml`
- [x] Run provider/env validation from a shell with production env loaded:
  - `cd /opt/menorah/menorah/scripts/qa`
  - `node production-provider-check.js`
- [x] Ensure required production env is real, non-placeholder, and strong:
  - `JWT_SECRET` and `JWT_REFRESH_SECRET`: 64+ chars, different values.
  - `MONGODB_URI`, `MONGODB_BACKUP_URI`, `MONGODB_RESTORE_TEST_URI`.
  - `REDIS_URL`.
  - `ALLOWED_ORIGINS`.
  - `RESEND_API_KEY`, `EMAIL_FROM`.
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
  - `LIVEKIT_URL`, `LIVEKIT_API_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
  - `BACKUP_ENCRYPTION_PASSWORD`.
- [ ] If Social Studio/brand publishing is launching, add/pass these env values into compose:
  - `SOCIAL_TOKEN_ENCRYPTION_KEY`.
  - `SOCIAL_STUDIO_ENABLED`.
  - `SOCIAL_STUDIO_STORAGE`.
  - `SOCIAL_STUDIO_OPENAI_API_KEY` or `OPENAI_API_KEY`.
  - `SOCIAL_STUDIO_AI_TEXT_MODEL`, `SOCIAL_STUDIO_AI_IMAGE_MODEL`, if different from defaults.
  - `SOCIAL_STUDIO_GENERATION_RATE_LIMIT`.
  - `SOCIAL_STUDIO_MAX_POSTS_PER_RUN`.
  - `CLOUDINARY_SOCIAL_STUDIO_FOLDER`.
  - `CLOUDINARY_SOCIAL_STUDIO_ASSET_FOLDER`.
  - `META_GRAPH_API_VERSION`, if not using default.
- [ ] If Instagram publishing is launching, verify one connected Instagram account can be encrypted, verified, and publish a test post from production.
- [x] If Google login is launching on Android, set real Android client ID in backend env and EAS env. Web Google client ID is already present.
- [x] Defer Apple/iOS login until Apple developer account review is complete. `APPLE_WEB_SERVICE_ID` is only required for future Apple web login.
- [x] Confirm canonical runtime domains use `menorah.me`. Historical troubleshooting docs may still mention old domains.
- [ ] Confirm app-store required account deletion path exists and works. The mobile client currently references `/users/account-deletion-request`; backend support must be verified before release.
- [ ] Confirm moderation/blocking endpoints exist or hide the UI until implemented:
  - `/moderation/report-user`
  - `/moderation/report-content`
  - `/moderation/block-user`
- [x] Validate Docker Compose config with real env:
  - `docker compose -f deploy/docker-compose.production.yml -f deploy/docker-compose.tunnel.yml --env-file deploy/env/production.env --env-file deploy/env/cloudflare.env config >/dev/null`
- [ ] Run first deployment on the host:
  - `bash menorah/deploy/ubuntu/first-run.sh`
- [x] Run local health and route-isolation checks on the host:
  - `bash menorah/deploy/ubuntu/health-check.sh`
- [x] Run public health checks after Cloudflare hostnames are mapped:
  - `CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh`
- [x] Run a backup and restore test before traffic:
  - `bash menorah/deploy/ubuntu/backup-now.sh daily`
  - `bash menorah/deploy/ubuntu/restore-latest-backup.sh restore-test`
- [x] Verify MongoDB, Redis, APIs, worker, monitoring, and reverse proxy containers are running.
- [x] Verify public services:
  - `https://www.menorah.me`
  - `https://app.menorah.me`
  - `https://admin.menorah.me`
  - `https://counsellor.menorah.me`
  - `https://api-ios.menorah.me/health/ready`
  - `https://api-android.menorah.me/health/ready`
  - `https://api-web.menorah.me/health/ready`
  - `https://api-admin.menorah.me/health/ready`
- [x] Confirm `/health/deep` exposes only redacted provider status and no secret values.

## API Gateway, Edge, And Rate Limiting

Current repo position:

- Cloudflare Tunnel plus Caddy reverse proxy is the production ingress/gateway path.
- Caddy routes each public hostname to internal services.
- Backend has Redis-backed Express rate limiting when Redis is connected.
- Auth endpoints have a stricter limiter.
- `/api/` has a broad limiter.
- CORS is allowlist-based through `ALLOWED_ORIGINS`.
- `trust proxy` is enabled in Express.

For July 3, do this:

- [ ] Treat Cloudflare as the edge gateway for launch. Do not add Kong/Nginx API Gateway tonight unless there is a compliance requirement.
- [ ] In Cloudflare, enable WAF managed rules and bot protection for all public hostnames.
- [ ] In Cloudflare, add rate rules:
  - Auth endpoints: stricter per-IP rule for `/api/auth/login`, `/api/auth/register`, OTP, forgot/reset password.
  - API general: moderate per-IP rule for `/api/*`.
  - Upload routes: stricter per-IP and request-size rules.
  - Admin hostname: stricter country/IP/bot controls if possible.
- [ ] Keep backend env limits conservative:
  - `AUTH_RATE_LIMIT_MAX`: start around 20-30 per 15 minutes.
  - `RATE_LIMIT_WINDOW_MS`: 900000.
  - `RATE_LIMIT_MAX_REQUESTS`: start around 500-1000 per 15 minutes, adjust after monitoring.
  - `SOCIAL_STUDIO_GENERATION_RATE_LIMIT`: low, around 5-10 per 15 minutes.
- [x] Confirm Redis is required in production. Backend defaults to requiring Redis when `NODE_ENV=production`; keep it that way.
- [ ] Add or configure Socket.IO abuse controls if chat/calls are public:
  - connection rate at Cloudflare/Caddy where possible.
  - lower `maxHttpBufferSize` in Socket.IO if binary messages are not needed.
  - app-level event throttling for `send_message`, typing, and room joins.
- [ ] Do not IP-restrict Razorpay or LiveKit webhooks unless provider IP ranges are officially stable. Signature verification is already the primary control.

## Remote Work From MacBook

Recommended setup for July 3: use Tailscale plus VS Code/Cursor Remote SSH. Do not expose SSH port 22 directly to the public internet.

- [ ] Install Tailscale on the Ubuntu host:
  - `curl -fsSL https://tailscale.com/install.sh | sh`
  - `sudo tailscale up --ssh --hostname menorah-prod-dev`
- [ ] Install Tailscale on the MacBook and sign into the same tailnet.
- [ ] On the MacBook, create a dedicated key:
  - `ssh-keygen -t ed25519 -C "macbook-menorah-2026-07" -f ~/.ssh/menorah_macbook_ed25519`
- [ ] Add the MacBook public key to the Ubuntu user:
  - append `~/.ssh/menorah_macbook_ed25519.pub` from the MacBook into `/home/tejasmenorah/.ssh/authorized_keys` on the host.
  - ensure host permissions: `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`.
- [ ] Add this to the MacBook `~/.ssh/config`:

```sshconfig
Host menorah
  HostName <tailscale-ip-or-magicdns-name>
  User tejasmenorah
  IdentityFile ~/.ssh/menorah_macbook_ed25519
  ServerAliveInterval 30
  ServerAliveCountMax 4
```

- [ ] Test from the MacBook:
  - `ssh menorah`
  - `cd /opt/menorah/menorah`
  - `git status --short`
- [ ] Use VS Code/Cursor Remote SSH to open `/opt/menorah/menorah`. Edits are made directly on this host, so changes are already "here"; no rsync or manual copying is needed.
- [ ] Before leaving the current machine, commit or stash any launch-critical local changes and push the release branch.
- [ ] Backup option: use Cloudflare Zero Trust Access for SSH with a private hostname such as `ssh.menorah.me`, protected by Cloudflare Access, routing to SSH on the host. Use this only if Tailscale is unavailable.

## Backend API And Security

Already present:

- Helmet headers.
- CORS allowlist.
- Body limits of 1 MB for JSON/form payloads.
- Raw body parsing for Razorpay and LiveKit webhook signature verification.
- JWT algorithm pinning.
- Redis token blocklist for logout/revocation.
- Admin/user/counsellor route separation across API profiles.
- Health endpoints: `/health/live`, `/health/ready`, `/health/deep`, `/api/health`.
- Upload size and MIME filters for profile image, eKYC, and Social Studio assets.

TODO:

- [x] Confirm `ALLOWED_ORIGINS` includes only production domains:
  - `https://www.menorah.me`
  - `https://app.menorah.me`
  - `https://admin.menorah.me`
  - `https://counsellor.menorah.me`
- [x] Confirm no localhost origins in production.
- [x] Confirm admin routes return 404 from `api-ios`, `api-android`, and `api-web`.
- [x] Confirm `api-admin /api/auth/me` returns 401/403 when unauthenticated.
- [x] Confirm iOS subscription Razorpay routes return 404 on `api-ios`.
- [ ] Confirm error responses do not include stack traces in production.
- [ ] Confirm production logs do not print JWTs, OTPs, provider secrets, access tokens, raw authorization headers, or webhook bodies.
- [ ] Add request IDs/correlation IDs if production debugging without them is too painful.
- [ ] Add Sentry or equivalent error tracking if not already externally configured.
- [ ] Fix Mongoose warnings after launch:
  - duplicate indexes in `backend/src/models/Payout.js`.
  - reserved `errors` paths in article/social generation run models.

## Payments And Payouts

- [ ] Verify Razorpay account mode: test vs live.
- [ ] Verify `NEXT_PUBLIC_RAZORPAY_KEY_ID` matches the live secret pair.
- [ ] Verify booking payment create and verify flow end-to-end.
- [ ] Verify Razorpay webhook signature validation in production.
- [ ] Verify duplicate webhook delivery is idempotent.
- [ ] Verify failed payment path returns the booking to a sensible state.
- [ ] Verify subscription routes are intentionally unavailable on iOS if needed for App Store compliance.
- [ ] If payouts are live, verify Razorpay X env:
  - `RAZORPAY_X_KEY_ID`.
  - `RAZORPAY_X_KEY_SECRET`.
  - `RAZORPAY_PAYOUT_ACCOUNT_NUMBER`.
  - `RAZORPAY_X_WEBHOOK_SECRET`.
- [ ] If payouts are not live, hide/disable payout initiation in admin or document that it is not operational.

## Calls, Chat, And LiveKit

- [x] Verify `calls.menorah.me` routes to LiveKit correctly.
- [ ] Verify host firewall allows:
  - `443/tcp`.
  - `7881/tcp`.
  - `50000-50100/udp`.
- [ ] Verify one full LiveKit call on normal network.
- [ ] Verify one full LiveKit call on restrictive network/TCP fallback.
- [ ] Verify Socket.IO connects from user web, mobile, and counsellor web.
- [ ] Verify chat send/read/delete/typing between two real accounts.
- [ ] Verify hybrid country policy:
  - India-classified users get LiveKit token.
  - UAE-classified users get external provider link only.
  - Unknown region follows `BLOCK_LIVEKIT_FOR_UNKNOWN_REGION`.

## Database, Backups, And Restore

- [ ] Confirm MongoDB root/app/backup/restore users are distinct.
- [ ] Confirm MongoDB keyfile exists and has `0400` permissions.
- [ ] Confirm Redis append-only persistence is acceptable for production.
- [ ] Confirm backups are encrypted before any off-host upload.
- [ ] Confirm backup retention policy:
  - six-hourly.
  - daily.
  - weekly.
  - monthly.
- [x] Run restore test from the newest backup before go-live.
- [ ] Document restore time objective and who has access to `BACKUP_ENCRYPTION_PASSWORD`.
- [ ] Snapshot production env inventory outside Git.

## Observability And Operations

- [x] Verify Grafana is reachable only privately/local tunnel, not public internet.
- [x] Verify Prometheus, Loki, Redis, MongoDB, and Uptime Kuma are not public.
- [ ] Configure Uptime Kuma for:
  - `api-ios /health/ready`.
  - `api-android /health/ready`.
  - `api-web /health/ready`.
  - `api-admin /health/ready`.
  - public web/app/admin/counsellor pages.
- [ ] Configure alerts for:
  - API down.
  - repeated 5xx.
  - disk usage high.
  - backup missing or too small.
  - Mongo/Redis container down.
  - LiveKit down.
- [ ] Confirm log rotation and disk retention for Caddy, app logs, Mongo, Loki, Docker.
- [ ] Record runbook owner and escalation contact.

## Frontend Web Apps

- [x] Move root-owned `.next` folders aside and rerun builds.
- [ ] Remove `.next.root-owned-*` and `node_modules.root-owned-*` backup folders with interactive sudo or host cleanup after launch artifacts are confirmed.
- [ ] Ensure production env is baked into images:
  - user web `NEXT_PUBLIC_API_URL`.
  - user web `NEXT_PUBLIC_SOCKET_URL`.
  - user web `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
  - user web `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
  - admin `NEXT_PUBLIC_API_URL`.
  - counsellor web `NEXT_PUBLIC_API_URL`.
  - counsellor web `NEXT_PUBLIC_SOCKET_URL`.
- [ ] Verify login, logout, protected-route redirects, and expired-token behavior.
- [ ] Verify article list/detail, booking creation, payment return, chat, and video route.
- [ ] Decide whether image lint warnings are acceptable for launch.
- [ ] Migrate admin lint from `next lint` to ESLint CLI so CI can run non-interactively.

## Mobile Release

- [x] Clear mobile critical/high npm audit findings with normal `npm audit fix`.
- [x] Pin `expo-apple-authentication` to the Expo SDK 54-compatible version.
- [x] Deduplicate `expo-font`.
- [x] Move invalid Android status/navigation bar config to Expo's supported top-level fields.
- [x] Enable React Native New Architecture in Android native settings for Reanimated 4 build compatibility.
- [ ] Decide whether the 16 remaining moderate Expo audit findings are accepted for July 3 or whether the app can absorb a breaking Expo 57 upgrade.
- [ ] Resolve or explicitly accept Expo Doctor's native-project sync warning before EAS production build.
- [x] Set production EAS env for Android:
  - `EXPO_PUBLIC_API_BASE_URL=https://api-android.menorah.me/api` for Android.
  - `EXPO_PUBLIC_WEB_BASE_URL`.
  - `EXPO_PUBLIC_CHECKOUT_RETURN_URL`.
  - `EXPO_PUBLIC_JITSI_BASE_URL`.
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` if Google login is enabled.
- [x] Confirm the canonical web base is not stale. `mobile-app/eas.json` now uses `https://app.menorah.me`.
- [x] Run `cd mobile-app && npm run typecheck`.
- [x] Run `cd mobile-app && npx expo-doctor` (currently 17/18; remaining warning is native config sync with checked-in `android/` and `ios/` folders).
- [x] Run `cd mobile-app && eas build --profile production-android --platform android` again after enabling Android New Architecture. Replacement build `3c79a458-91a0-4093-a7ce-6972ccd3f6b7` finished successfully.
- [x] Defer `eas build --profile production-ios --platform ios` until Apple developer account review is complete.
- [ ] Run Maestro smoke tests on a real device/emulator.
- [ ] Verify app links/deep links:
  - password reset.
  - payment return.
  - article links.
- [ ] Verify permissions text for camera/microphone/photo access.
- [ ] Verify privacy policy, terms, account deletion, and support contact are reachable from the app.
- [x] iOS App Store payment/subscription review is deferred with the iOS launch.

## QA Gate

Run safe public smoke:

```bash
cd /opt/menorah/menorah/scripts/qa
npm install
npm run test:all-safe
```

Status on July 3: API smoke passed, but `test:all-safe` is still blocked because the host is missing Playwright Chromium OS libraries such as `libatk-1.0.so.0`. `npx playwright install-deps chromium` requires interactive sudo.

Run API smoke:

```bash
cd /opt/menorah/menorah/scripts/qa
npm run test:api
```

Run browser smoke:

```bash
cd /opt/menorah/menorah/scripts/qa
npm run test:web
```

Run OTP E2E with a QA-only email:

```bash
cd /opt/menorah/menorah/scripts/qa
QA_EMAIL='tejasamirth+menorahqa-YYYYMMDDHHMM@gmail.com' \
QA_PASSWORD='set-in-shell' \
npm run test:otp
```

Then rerun with `QA_OTP` from Gmail:

```bash
QA_EMAIL='tejasamirth+menorahqa-YYYYMMDDHHMM@gmail.com' \
QA_PASSWORD='set-in-shell' \
QA_OTP='set-from-gmail' \
npm run test:otp
```

Manual QA that must pass:

- [ ] New user registration.
- [ ] Email OTP verification.
- [ ] Login/logout.
- [ ] Forgot/reset password.
- [ ] Profile update and image upload.
- [ ] eKYC happy path and failure path.
- [ ] Browse counsellors.
- [ ] Create booking.
- [ ] Pay for booking.
- [ ] Counsellor/admin assignment flow.
- [ ] Chat between user and counsellor.
- [ ] Video call.
- [ ] Admin login and dashboard.
- [ ] Article list and article detail.
- [ ] Social Studio generation, asset upload, approval, publish, if launching.
- [ ] Backup after successful go-live.

## Rollback Plan

- [ ] Record current production commit SHA before deploy.
- [ ] Confirm `deploy/ubuntu/rollback-last-deploy.sh` is available on the host.
- [ ] Confirm backups are restorable before deployment.
- [ ] Keep previous images available locally or in registry.
- [ ] Define rollback trigger:
  - any API readiness failure after deploy.
  - payment creation/verification failure.
  - login failure.
  - calls unavailable.
  - data corruption concern.
- [ ] After rollback, rerun:
  - `bash menorah/deploy/ubuntu/health-check.sh`.
  - `CHECK_PUBLIC=true bash menorah/deploy/ubuntu/health-check.sh`.

## Launch Order

1. Freeze branch and commit.
2. Fix builds, audits, env gaps, and mobile launch env.
3. Run local tests/lint/typecheck/builds.
4. Validate compose with real env.
5. Deploy to host with Cloudflare tunnel.
6. Run health checks.
7. Run backup and restore test.
8. Run safe QA smoke.
9. Run manual critical flows.
10. Point/confirm Cloudflare public hostnames.
11. Monitor logs, health, payments, calls, and backups for at least 2 hours.

## Post-Launch P1 Cleanup

- [ ] Move admin lint to ESLint CLI.
- [ ] Add CI workflow for backend tests, all lints, all builds, mobile typecheck, compose validation, and npm audit.
- [ ] Add Redis/Cloudflare/socket-level abuse tests.
- [ ] Add request ID logging.
- [ ] Add Sentry or equivalent error tracking if not configured externally.
- [ ] Fix Mongoose schema warnings.
- [ ] Replace old domain fallbacks.
- [ ] Remove or implement mobile TODO endpoints.
- [ ] Document final architecture and production owners.
