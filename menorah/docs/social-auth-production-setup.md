# Social Auth Production Setup

This runbook currently covers the Android-first production launch: Google OAuth for web and Android. iOS and Sign in with Apple are deferred until the Apple developer account review is complete.

Do not commit provider secrets. Google OAuth client IDs are public identifiers and may be supplied through production env files or EAS environment variables. Keep private Apple keys outside git if Apple web/service-ID login is added later.

## Backend Endpoints

- Google: `POST /api/auth/google`
- Apple: `POST /api/auth/apple` exists in code, but iOS/Apple launch is deferred.

Both endpoints return the same Menorah auth response shape as email/password login. Email OTP remains unchanged and is still available for normal signup.

## Required Env Names

Production backend:

- `GOOGLE_WEB_CLIENT_ID`
- `GOOGLE_ANDROID_CLIENT_ID`
- `GOOGLE_IOS_CLIENT_ID` later, when iOS launch resumes

Public web build:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Expo/EAS mobile builds:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` later, when iOS launch resumes
- `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` later, only if the URL scheme cannot be derived from the iOS client ID

## Google Web OAuth

Create a Google OAuth Web client for the production web app.

Authorized JavaScript origins:

- `https://app.menorah.me`
- `https://www.menorah.me`

The current web flow uses Google Identity Services ID tokens, so no redirect URI is required for the button flow.

Set:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for the web bundle
- `GOOGLE_WEB_CLIENT_ID` for backend token audience validation

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

For Android-first launch, set these on the host and in EAS:

```env
GOOGLE_ANDROID_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

## Deferred iOS And Apple

iOS launch is deferred until the Apple developer account review is complete.

When iOS resumes, create an iOS Google OAuth client using:

- Bundle ID: `com.menorah.health.app`

Set:

- `GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`, optional. Defaults to the reversed iOS client ID.
- `APPLE_IOS_BUNDLE_ID=com.menorah.health.app`

The checked-in iOS project includes the Sign in with Apple entitlement in `ios/MenorahHealth/MenorahHealth.entitlements`, and `app.config.ts` sets `ios.usesAppleSignIn=true`.

Apple web login is not enabled unless a Service ID is created and `APPLE_WEB_SERVICE_ID` is set.

App Store policy note for later: because Google Sign-In is offered on iOS, Sign in with Apple must also be offered on iOS. The mobile login and signup screens include both when configured and available.

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
- Google Android login in an Android production/dev build
- `npx @react-native-google-signin/config-doctor` against the final Android build artifacts if Google native sign-in returns a developer/configuration error
- Existing email/password login
- Existing email OTP signup
