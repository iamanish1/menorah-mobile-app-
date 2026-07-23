# Mobile Store External Actions

Repository validation cannot complete signing, website association, physical-device, or store
console work. Do not mark the mobile release ready until the accountable owners complete the
following actions with the exact candidate binary.

## APPLE ACTION

- Confirm that `com.menorah.health.app` is the App Store Connect bundle identifier.
- Confirm build number `14` is higher than every uploaded build. If it is not, increment the
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
- Confirm version code `14` is higher than every uploaded artifact; increment both platforms
  together if it is not.
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

## PRIVACY ACTION

- Review the candidate archive's privacy report against actual API and SDK behavior.
- Map user profile, contact, chat, booking, payment, face-check, diagnostics, and account-rights
  data to App Store Privacy and Play Data Safety declarations. The repository deliberately does
  not invent collection purposes, linkage, retention, or sharing answers.
- Confirm whether OS push notifications will ship. This candidate contains only memory-resident
  in-app socket notifications; no push-token registration library is installed. If push is
  added, use generic lock-screen text and fetch sensitive content only after authenticated app
  launch.

## OWNER ACTION

- Create a dedicated reviewer account and place its credentials only in the store console,
  never in this repository.
- Provide monitored support details and approved public privacy-policy and terms URLs.
- Resolve the Apple payment classification for each booking/subscription flow before
  submission.
