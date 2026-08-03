# Building the Menorah Health Android AAB

The Android native project is checked in and is the release source of truth. Do not run
`expo prebuild`, do not regenerate `android/`, and do not build a second artifact for promotion.
The detailed external gate is in `docs/android-2.7.0-release.md`.

## Candidate identity

- App/package: Menorah Health / `com.menorah.healthmobile`
- Marketing/runtime version: `2.7.0`
- Provisional versionCode and coupled build number: `15`
- EAS version source: local
- Automatic increment: disabled
- Build profile: `production-android`

VersionCode 15 is backed only by the known EAS maximum of 14. A release owner must check the
highest code in Play Console immediately before building and set protected EAS variable
`PLAY_HIGHEST_VERSION_CODE`. The build hook fails if the value is missing or not lower than the
repository candidate.

## Required protected configuration

- EAS file secret `GOOGLE_SERVICES_JSON`, for Firebase project `873291355021` and Android
  package `com.menorah.healthmobile`.
- Dedicated FCM V1 service-account key in EAS credentials.
- Separate least-privilege Play submission service account in EAS credentials.
- Approved production public URLs and OAuth client IDs in the EAS `production` environment.
- Protected EAS plain-text variable `MENORAH_APPROVED_RELEASE_SHA` set to the exact independently
  approved 40-character release commit. The remote hook compares it with EAS's build commit.
- Verified EAS upload key matching Play Console's upload certificate.

Never commit Google Services, service-account, keystore, or credential files. The EAS
post-install hook validates and temporarily copies `GOOGLE_SERVICES_JSON` with mode `0600`; the
completion/cancellation hook removes only that marked generated copy.

## Validate without building

```bash
npm ci
npm run typecheck
npm run validate:release-config
node --test scripts/*.test.cjs
```

Do not start the remote build until the exact candidate SHA has passed the release gates and the
Play maximum has been recorded. Then build exactly once:

```bash
eas build --platform android --profile production-android --non-interactive
```

Download that AAB and inspect it:

```bash
export BUNDLETOOL_JAR=/approved/path/to/bundletool.jar
export PLAY_HIGHEST_VERSION_CODE=14
export EXPECTED_ANDROID_UPLOAD_CERT_SHA256=approved-upload-certificate-sha256
npm run inspect:android-aab -- /approved/path/to/menorah-2.7.0.aab
```

The inspector fails unless the AAB has package `com.menorah.healthmobile`, version 2.7.0/code
15, target SDK 36, the approved upload signer, production origins/OAuth clients, Firebase
resources, notification components, required permissions, and no cleartext/debug/prohibited
permissions.

After installing the internal-track build, pull the Play-delivered base APK from the test device
and verify the Play App Signing certificate separately:

```bash
adb shell pm path com.menorah.healthmobile
adb pull /device/path/reported/as/base.apk /approved/path/menorah-play-base.apk
export EXPECTED_PLAY_APP_SIGNING_CERT_SHA256=approved-play-signing-certificate-sha256
npm run inspect:play-apk -- /approved/path/menorah-play-base.apk
```

This second phase uses `apksigner` and `apkanalyzer`; it must match the Play App Signing SHA-256,
not the EAS upload certificate.

Submit the inspected artifact to Play internal testing using submit profile `internal-testing`.
Install only the Play-delivered build for release QA. Promote that exact existing artifact to
production externally after the signed go/no-go; do not rebuild it and do not use an OTA update
as a binary substitute.
