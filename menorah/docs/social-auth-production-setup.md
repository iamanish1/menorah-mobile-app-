# Social Auth Production Setup

This runbook covers production Google OAuth for web, iOS, and Android, plus iOS Sign in with Apple.

Do not commit real client IDs, private keys, or provider secrets. Public mobile/web client IDs may be supplied through production env files and EAS profile env, but keep private Apple keys outside git.

## Backend Endpoints

- Google: `POST /api/auth/google`
- Apple: `POST /api/auth/apple`

Both endpoints return the same Menorah auth response shape as email/password login. Email OTP remains unchanged and is still available for normal signup.

## Required Env Names

Production backend:

- `GOOGLE_WEB_CLIENT_ID`
- `GOOGLE_IOS_CLIENT_ID`
- `GOOGLE_ANDROID_CLIENT_ID`
- `APPLE_IOS_BUNDLE_ID`
- `APPLE_WEB_SERVICE_ID` if Apple web login is added later

Public web build:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Expo/EAS mobile builds:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

## Google Web OAuth

Create a Google OAuth Web client for the production web app.

Authorized JavaScript origins:

- `https://app.menorah.me`
- `https://www.menorah.me`

The current web flow uses Google Identity Services ID tokens, so no redirect URI is required for the button flow.

Set:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for the web bundle
- `GOOGLE_WEB_CLIENT_ID` for backend token audience validation

## Google iOS Sign-In

Create an iOS OAuth client using:

- Bundle ID: `com.menorah.health.app`

Set:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `GOOGLE_WEB_CLIENT_ID`
- `GOOGLE_IOS_CLIENT_ID`

Google Sign-In requires a development or production native build. It will not work inside Expo Go.

## Google Android Sign-In

Create an Android OAuth client using:

- Package: `com.menorah.healthmobile`
- SHA-1 certificate fingerprint from EAS credentials or Play App Signing

Set:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `GOOGLE_WEB_CLIENT_ID`
- `GOOGLE_ANDROID_CLIENT_ID`

Android ID tokens are validated server-side against the configured backend Google audiences.

## Sign In With Apple For iOS

Enable Sign in with Apple for the iOS App ID:

- Bundle ID: `com.menorah.health.app`

Set:

- `APPLE_IOS_BUNDLE_ID=com.menorah.health.app`

Apple web login is not enabled unless a Service ID is created and `APPLE_WEB_SERVICE_ID` is set.

App Store policy note: because Google Sign-In is offered on iOS, Sign in with Apple must also be offered on iOS. The mobile login and signup screens include both when configured and available.

## Production Verification

Run redacted provider checks from a shell that has production env loaded:

```bash
cd /opt/menorah/menorah/scripts/qa
npm run test:providers
```

Run safe API checks:

```bash
cd /opt/menorah/menorah/scripts/qa
npm run test:api
```

Manual checks still required:

- Google web login from `https://app.menorah.me/login`
- Google mobile login in iOS and Android production/dev builds
- Apple login on a real iOS device or simulator signed into Apple ID
- Existing email/password login
- Existing email OTP signup
