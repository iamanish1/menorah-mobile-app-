# Android 2.7.0 Release Gate

Status: **NOT READY — external evidence required**

The repository candidate is `2.7.0` with provisional Android `versionCode` 15 and coupled build
number 15. Do not start an EAS build merely because repository validation passes. The final Play
maximum, signing lineage, Firebase files, and protected environment must be verified first.

## One-time protected configuration

1. In the EAS `production` environment, create `GOOGLE_SERVICES_JSON` as a file secret containing
   the Firebase Android client file for project number `873291355021` and package
   `com.menorah.healthmobile`. Use the same approved client configuration in other Android EAS
   environments that build push-capable binaries.
2. In EAS credentials, upload a dedicated least-privilege FCM V1 service-account key. Do not use
   the Play submission service account as the FCM sender and do not put either key in this repo.
3. Configure the least-privilege Play submission account in EAS credentials, not `eas.json`.
4. Enable Expo enhanced push security. Store `EXPO_PUSH_ACCESS_TOKEN` only in the protected
   backend environment.
5. Confirm the EAS upload certificate matches the Play upload certificate. Complete any upload
   key rotation incident before building.

## Exact pre-build gate

1. Open Play Console and record the highest version code across every track and artifact. EAS's
   current maximum of 14 is supporting evidence only.
2. Set protected EAS variable `PLAY_HIGHEST_VERSION_CODE` to that freshly checked integer. The
   production hook refuses to build unless repository versionCode 15 is greater.
3. Set protected EAS variable `MENORAH_APPROVED_RELEASE_SHA` to the independently approved exact
   40-character SHA at the head of `release/android-2.7.0-20260803`. The build hook compares it
   with `EAS_BUILD_GIT_COMMIT_HASH` and rejects any other source commit or EAS project/profile.
4. If Play reports 15 or higher, stop and increment Android `versionCode`, iOS build number, and
   all coupled native/repository values together. Re-run validation and regenerate approval
   evidence before any build.
5. Confirm production build variables still resolve to:
   - Android API: `https://api-android.menorah.me/api`
   - Web/callback origin: `https://app.menorah.me`
   - Mobile browser return page: `https://app.menorah.me/checkout/return`
   - Razorpay's provider callback is the separate backend setting
     `CHECKOUT_RETURN_URL=https://app.menorah.me/checkout/callback`.
   - Google Web client: `873291355021-soma7nima003rvq9usj8fqj0t9kbjm6a.apps.googleusercontent.com`
   - Google Android client: `873291355021-bi43pprpqlks9hvpjdto7kt0ekcbefr8.apps.googleusercontent.com`

Run repository checks before requesting the remote build:

```bash
npm ci
npm run typecheck
npm run validate:release-config
node --test scripts/*.test.cjs
```

Only after every external gate is recorded against the exact approved SHA:

```bash
eas build --platform android --profile production-android --non-interactive
```

The post-install hook fails closed if the Firebase file secret is absent, malformed, from the
wrong project/package, or if the Play maximum is absent/stale relative to versionCode 15. It does
not print file contents. The completion/cancellation hook removes only the marked temporary copy
at `android/app/google-services.json`.

## Artifact inspection and tracks

After downloading the single EAS AAB, set local paths/evidence and inspect it before upload:

```bash
export BUNDLETOOL_JAR=/approved/path/to/bundletool.jar
export PLAY_HIGHEST_VERSION_CODE=14
export EXPECTED_ANDROID_UPLOAD_CERT_SHA256=approved-upload-certificate-sha256
npm run inspect:android-aab -- /approved/path/to/menorah-2.7.0.aab
```

The inspector checks package/version/target SDK, cleartext/debug flags, permissions,
Expo/Firebase services and resources, production origins/OAuth IDs, and the upload signer. It
never prints Firebase resource contents.

Install the internal-track build from Google Play, pull its base APK from the device, and run the
separate Play signer gate:

```bash
adb shell pm path com.menorah.healthmobile
adb pull /device/path/reported/as/base.apk /approved/path/menorah-play-base.apk
export EXPECTED_PLAY_APP_SIGNING_CERT_SHA256=approved-play-signing-certificate-sha256
npm run inspect:play-apk -- /approved/path/menorah-play-base.apk
```

This verifies the APK with `apksigner`, requires the exact Play App Signing SHA-256, and rechecks
the compiled package/version/target/manifest policy. The upload-signed AAB alone cannot prove the
certificate Google Play used for delivery.

Submit the inspected AAB to internal testing with the `internal-testing` EAS submit profile.
Install the Play-delivered artifact for QA. Promotion to production must reuse that exact Play
artifact through Play Console or an approved promotion API; do not rebuild or re-upload under
the `production` submit profile. Record the signed go/no-go and the explicit 100% rollout risk
exception before promotion.
