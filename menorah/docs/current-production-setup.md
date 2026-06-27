# Current Production Setup

This document captures the production architecture before the self-hosted Cloud Run failover migration. It is intentionally redacted: real secret values must stay outside git.

## Current Hosting And Domains

| Area | Current production setup |
| --- | --- |
| Frontend hosting | Vercel |
| Database | MongoDB Atlas |
| Backend | VPS / current API server |
| Mobile API | `https://api.menorah.me/api` |
| Call service | Hostinger VPS / LiveKit at `calls.menorah.me` |

Current production domains:

- `www.menorah.me`
- `app.menorah.me`
- `counsellor.menorah.me`
- `admin.menorah.me`
- `api.menorah.me`
- `calls.menorah.me`

## Private Export Location

Actual production env exports must be stored outside the repository:

```text
C:\menorah\private-env-exports\current-production-setup\
```

The files in that directory are not committed. Keep the committed inventory below as the source of truth for which service owns each variable.

## Redacted Env Ownership Inventory

### Vercel

User web app / landing:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SOCKET_URL`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_JITSI_DOMAIN`
- `NEXT_PUBLIC_WEB_BASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `PUBLIC_WEB_BASE_URL`
- `MENORAH_API_BASE_URL`
- `MONGODB_URI`
- `MONGO_DATABASE`
- `CONTACT_TO_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`

Admin panel:

- `NEXT_PUBLIC_API_URL`

### VPS Backend

- `NODE_ENV`
- `PORT`
- `API_BASE_URL`
- `MONGODB_URI`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_SECRET`
- `JWT_REFRESH_EXPIRES_IN`
- `ALLOWED_ORIGINS`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`
- `MSG91_SMS_TEMPLATE_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_X_KEY_ID`
- `RAZORPAY_X_KEY_SECRET`
- `RAZORPAY_PAYOUT_ACCOUNT_NUMBER`
- `RAZORPAY_X_WEBHOOK_SECRET`
- `CHECKOUT_RETURN_URL`
- `LIVEKIT_URL`
- `LIVEKIT_API_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_UPSTREAM`
- `LIVEKIT_CONFIG_FILE`
- `LIVEKIT_RTC_TCP_PORT`
- `LIVEKIT_RTC_UDP_PORT_RANGE`
- `CALLING_REGION_MODE`
- `LIVEKIT_BLOCKED_COUNTRIES`
- `BLOCKED_COUNTRY_CALL_PROVIDER`
- `BLOCK_LIVEKIT_FOR_UAE`
- `BLOCK_LIVEKIT_FOR_UNKNOWN_REGION`
- `UAE_CALL_PROVIDER`
- `UAE_CALLING_ENABLED`
- `VSEE_ENABLED`
- `VSEE_INTEGRATION_MODE`
- `DOXY_ENABLED`
- `ZOOM_ENABLED`
- `GOOGLE_MEET_ENABLED`
- `TEAMS_ENABLED`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_ARTICLE_FOLDER`
- `LUXAND_API_TOKEN`
- `LUXAND_DETECT_URL`
- `LUXAND_FACE_CONFIDENCE_THRESHOLD`
- `EKYC_MAX_FILE_SIZE`
- `ARTICLE_SCHEDULER_ENABLED`
- `ARTICLE_DAILY_GENERATION_COUNT`
- `ARTICLE_GENERATION_TIMEZONE`
- `ARTICLE_MANUAL_MAX_COUNT`
- `ARTICLE_MIN_WORD_COUNT`
- `ARTICLE_TARGET_WORD_COUNT`
- `ARTICLE_MAX_WORD_COUNT`
- `SOCIAL_STUDIO_ENABLED`
- `SOCIAL_STUDIO_AUTO_PUBLISH`
- `SOCIAL_STUDIO_GENERATION_RATE_LIMIT`
- `SOCIAL_STUDIO_MAX_POSTS_PER_RUN`
- `SOCIAL_STUDIO_STORAGE`
- `AI_PROVIDER`
- `AI_MOCK_MODE`
- `AI_TEXT_MODEL`
- `AI_IMAGE_MODEL`
- `SOCIAL_STUDIO_AI_PROVIDER`
- `SOCIAL_STUDIO_OPENAI_API_KEY`
- `SOCIAL_STUDIO_AI_TEXT_MODEL`
- `SOCIAL_STUDIO_AI_IMAGE_MODEL`
- `SOCIAL_STUDIO_AI_IMAGE_SIZE`
- `SOCIAL_STUDIO_AI_IMAGE_QUALITY`
- `SOCIAL_STUDIO_AI_IMAGE_FORMAT`
- `SOCIAL_STUDIO_AI_IMAGE_TIMEOUT_MS`
- `CLOUDINARY_SOCIAL_STUDIO_FOLDER`
- `CLOUDINARY_SOCIAL_STUDIO_ASSET_FOLDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_ARTICLE_MODEL`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION`
- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `PUBLIC_WEB_BASE_URL`
- `WEB_APP_URL`
- `JITSI_BASE_URL`
- `PASSWORD_RESET_BASE_URL`
- `PASSWORD_RESET_URL_TEMPLATE`
- `ENABLE_SOCKET_ADAPTER`
- `AUTH_RATE_LIMIT_MAX`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `SERVER_TZ`
- `BCRYPT_ROUNDS`
- `MAX_FILE_SIZE`
- `UPLOAD_PATH`
- `MOBILE_APP_SCHEME`

### MongoDB Atlas

- `MONGODB_URI`
- `MONGO_DATABASE`

### Cloudinary

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_ARTICLE_FOLDER`
- `CLOUDINARY_SOCIAL_STUDIO_FOLDER`
- `CLOUDINARY_SOCIAL_STUDIO_ASSET_FOLDER`

### Razorpay

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_X_KEY_ID`
- `RAZORPAY_X_KEY_SECRET`
- `RAZORPAY_PAYOUT_ACCOUNT_NUMBER`
- `RAZORPAY_X_WEBHOOK_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`

### Email

- `RESEND_API_KEY`
- `EMAIL_FROM`

### MSG91 SMS

- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`
- `MSG91_SMS_TEMPLATE_ID`

### Luxand

- `LUXAND_API_TOKEN`
- `LUXAND_DETECT_URL`
- `LUXAND_FACE_CONFIDENCE_THRESHOLD`

### LiveKit

- `LIVEKIT_URL`
- `LIVEKIT_API_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_UPSTREAM`
- Host-only config file: `deploy/livekit/livekit.yaml`
- Hostinger firewall: `443/tcp`, `7881/tcp`, and `50000-50100/udp`

### Hybrid Calling Policy

- India-classified sessions use in-app LiveKit/WebRTC.
- Countries in `LIVEKIT_BLOCKED_COUNTRIES`, default `AE`, must use an approved external provider link and must not receive a LiveKit token.
- Non-blocked countries use in-app LiveKit/WebRTC.
- Unknown-region sessions use LiveKit by default unless `BLOCK_LIVEKIT_FOR_UNKNOWN_REGION=true`.
- `BLOCKED_COUNTRY_CALL_PROVIDER` stores the approved default external provider key, currently `zoom`.
- Provider enable flags (`VSEE_ENABLED`, `DOXY_ENABLED`, `ZOOM_ENABLED`, `GOOGLE_MEET_ENABLED`, `TEAMS_ENABLED`) control which external providers can be selected.

### Expo / EAS

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_WEB_BASE_URL`
- `EXPO_PUBLIC_JITSI_BASE_URL`
- `EXPO_PUBLIC_CHECKOUT_RETURN_URL`
- EAS project ID: `d7fb6e65-3440-4a79-b4b2-6746d2582fa7`
- Expo owner: `menorahsoftware`

## Required Private Export Files

Create or update these files in the private export directory before migrating traffic:

- `vercel-user-web-app.production.env`
- `vercel-admin-panel.production.env`
- `vps-backend.production.env`
- `atlas.mongodb-uri.txt`
- `cloudinary.env`
- `razorpay.env`
- `msg91.env`
- `luxand.env`
- `livekit.env`
- `eas-production.env`

Provider CLIs were not available in this local environment during the inventory pass, so the committed repository contains only this redacted map and private export templates.
