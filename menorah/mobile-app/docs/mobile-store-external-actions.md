# Mobile Store External Actions

Repository validation cannot complete signing, website association, physical-device, or store
console work. Do not mark the mobile release ready until the accountable owners complete the
following actions with the exact candidate binary.

## APPLE ACTION

- Confirm that `com.menorah.health.app` is the App Store Connect bundle identifier.
- Confirm build number `15` is higher than every uploaded build. If it is not, increment the
  iOS and Android build values together before producing the candidate.
- Enable Associated Domains for the App ID and regenerate the distribution provisioning
  profile. Confirm the signed entitlement contains `applinks:app.menorah.me`.
- Supply the real Team ID only while rendering the AASA template outside the repository.
- On macOS, run `bundle exec pod install` or the repository-approved CocoaPods command after
  installing JavaScript dependencies. The checked-in lock predates SDK 57: review the full
  React Native/Expo pod refresh, including Apple Authentication and Screen Capture; do not run
  `expo prebuild --clean`.
- Archive the Release scheme, inspect Xcode's generated privacy report, and resolve every
  required-reason or SDK-signature warning from the actual archive.
- Test screenshot/recording protection, the blurred app-switcher snapshot, secure token
  persistence/logout, and the universal reset link on a physical iPhone.
- Complete App Store privacy, age rating, export compliance, Sign in with Apple, support URL,
  privacy-policy URL, reviewer account, and payment declarations using verified product facts.
- Configure the Apple Team ID, key ID, and PKCS#8 key only in the approved production secret
  store. On a signed TestFlight build, prove Apple login code exchange, social-only account
  deletion, durable worker revocation, and the subsequent first-time Apple authorization flow.

## GOOGLE ACTION

- Confirm that `com.menorah.healthmobile` is the Play Console application ID.
- Read the highest uploaded version code directly from Play Console immediately before the
  build. Version code `15` is provisional because EAS reports `14`, not because Play has been
  confirmed. Set protected EAS variable `PLAY_HIGHEST_VERSION_CODE` to that freshly verified
  value. If it is `15` or higher, increment every coupled repository/native build value before
  producing any AAB.
- Add `GOOGLE_SERVICES_JSON` to the applicable EAS environment as a **file** secret. It must be
  the Firebase client configuration for project number `873291355021` and Android package
  `com.menorah.healthmobile`. The build hook validates it without printing it, installs it with
  mode `0600`, and removes its generated copy when the EAS build completes or is cancelled.
- Upload a dedicated least-privilege FCM V1 service-account key through EAS credentials. Keep
  it separate from the Play submission service account and never commit either JSON key.
- Enable Expo enhanced push security and store `EXPO_PUSH_ACCESS_TOKEN` only in the protected
  backend environment; do not place it in an `EXPO_PUBLIC_*` mobile variable.
- Compare the EAS upload certificate with Play Console's upload certificate and retain the
  approved SHA-256 as `EXPECTED_ANDROID_UPLOAD_CERT_SHA256` only for local artifact inspection.
- Obtain the SHA-256 fingerprint for the **Play App Signing** certificate and render the
  asset-links template outside the repository. Do not use a debug or upload-key fingerprint.
- Use Play Console's deep-link verifier and a signed internal-track build to verify
  `https://app.menorah.me/reset-password#token=<64 hex characters>`.
- Test that screenshots and recent-app previews are blocked on supported physical Android
  devices, including after returning from Razorpay.
- Complete Data Safety, Health Apps, content rating, ads, account deletion, support, privacy,
  and payment declarations from the final data inventory and product behavior.

## INFRASTRUCTURE ACTION

- Publish the rendered association files at the two `.well-known` paths described in
  `associations/README.md`.
- From the approved staging/release network, verify the production profiles' configured API
  origins (`api-ios.menorah.me` and `api-android.menorah.me`) resolve, present valid TLS, and
  route `/api` to the intended production service before building the candidate.
- Set `PASSWORD_RESET_BASE_URL` to exactly `https://app.menorah.me` and leave
  `PASSWORD_RESET_URL_TEMPLATE` unset. Verify generated email links append `/reset-password`
  and contain the token only after `#`, never in the query string.
- Serve both directly over HTTPS with HTTP 200, `Content-Type: application/json`, no
  authentication, no geo/IP restriction, and no redirect.
- Keep reset tokens in URL fragments. Do not add them to query strings, access logs,
  analytics, crash reports, or notification payloads.
- Re-run Android domain verification after publication and allow for Apple CDN propagation.
- In EAS, configure both the `production` and `preview` environments with the same approved
  public values used by their binary profiles. At minimum this includes
  `EXPO_PUBLIC_IOS_API_BASE_URL=https://api-ios.menorah.me/api`,
  `EXPO_PUBLIC_ANDROID_API_BASE_URL=https://api-android.menorah.me/api`, the public web/return
  URLs, and the applicable public Google OAuth client IDs. Build-profile `env` values do not
  populate an OTA update environment.
- Before publishing an OTA update, compare the EAS environment with the exact candidate binary,
  then use the repository channel/environment scripts. Never run an unqualified `eas update`.

## PRIVACY ACTION

- Review the candidate archive's privacy report against actual API and SDK behavior.
- Map user profile, contact, chat, booking, payment, face-check, diagnostics, and account-rights
  data to App Store Privacy and Play Data Safety declarations. The repository deliberately does
  not invent collection purposes, linkage, retention, or sharing answers.
- Reconcile Play Data Safety with Android push registration and the Expo/Firebase device token.
  The candidate registers tokens only after permission and asks the backend to detach them on
  logout. If detachment cannot be confirmed, it retains an encrypted, owner-bound retry record
  instead of silently discarding the token. It uses generic lock-screen text and fetches
  sensitive content only after authenticated launch.

## OWNER ACTION

- Create a dedicated reviewer account and place its credentials only in the store console,
  never in this repository.
- Provide monitored support details and approved public privacy-policy and terms URLs.
- Resolve the Apple payment classification for each booking/subscription flow before
  submission.
- Approve who may publish to the EAS `preview` and `production` channels, require a reviewed
  message and candidate SHA, and retain the EAS update evidence for rollback.
