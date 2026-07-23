# Apple App Store release checklist

Last reviewed: 2026-07-23.

## Verdict and evidence boundary

**NOT READY**

Repository metadata currently describes Menorah Health `2.6.0`, iOS bundle
identifier `com.menorah.health.app`, build `14`, minimum iOS `16.4`, and
Associated Domain `applinks:app.menorah.me`. Those are source observations, not
proof of an archived, signed or uploaded binary.

No App Store Connect action, Apple credential use, macOS archive, TestFlight
upload, physical-iPhone test or Apple review was performed for this handover.
All unchecked items require dated evidence for the exact candidate.

## 1. Immutable candidate and repository checks

- [ ] Record the exact reviewed commit SHA, clean tree, dependency lockfiles,
      app version, build number and runtime version.
- [ ] Confirm build `14` is greater than every build already uploaded to App
      Store Connect. If not, increment the iOS and Android repository/native
      values together before building.
- [ ] Confirm the archive uses bundle ID `com.menorah.health.app` and minimum
      iOS `16.4`.
- [ ] Run and retain exact results:

  ```sh
  cd menorah/mobile-app
  npm ci
  npm run lint
  npm run typecheck
  npm run test:payment-policy
  npm run test:release-config
  npm run validate:release-config
  npm run doctor
  npm audit --omit=dev
  ```

- [ ] Record pass/fail/skip totals and every accepted dependency exception.
      The current Expo transitive `uuid <11.1.1` moderate exception is narrowly
      scoped and expires 2026-10-31; do not use `npm audit fix --force`.
- [ ] Confirm `production-ios` supplies both
      `https://api-ios.menorah.me/api` and
      `https://api-android.menorah.me/api`, with the runtime selecting the iOS
      origin, plus the intended public web/return/call values. Confirm the EAS
      `production` environment contains matching public values before any
      binary or qualified OTA update.
- [ ] `INFRASTRUCTURE ACTION`: from the approved release network, verify
      `api-ios.menorah.me` resolves, presents valid TLS and routes `/api` to the
      intended iOS service before building.
- [ ] Never use the generic production base profile directly and never run an
      unqualified `eas update`.

Repository checks do not replace signed-archive checks.

## 2. Apple account, signing and native build

- [ ] `OWNER ACTION` and `APPLE ACTION`: confirm Apple Developer/App Store
      Connect organization ownership, agreements, billing, recovery, primary
      and alternate release owners.
- [ ] Review unique human accounts, MFA, least-privilege roles, signing access
      and offboarding.
- [ ] Keep Team ID, key ID, PKCS#8 key, certificates and provisioning material
      only in the approved production credential store; never in Git or review
      notes.
- [ ] Enable Sign in with Apple and Associated Domains for the App ID.
- [ ] Regenerate the distribution provisioning profile after capability
      changes.
- [ ] On an approved macOS builder, install JavaScript dependencies and run
      `bundle exec pod install` from the iOS project using the repository's
      approved Ruby/CocoaPods environment.
- [ ] Review the complete `Podfile.lock`/native diff. The checked-in lock
      predates SDK 57; do not treat the change as a one-pod update.
- [ ] Do **not** run `expo prebuild --clean`; tracked native folders are
      authoritative and must be updated in place.
- [ ] Archive the Release scheme for the exact SHA and retain archive/build,
      signing, provisioning and dependency evidence.
- [ ] Build the exact reviewed production candidate with the explicit profile:

  ```sh
  cd menorah/mobile-app
  npm run build:ios:production
  ```

- [ ] Confirm the signed archive contains:
  - bundle `com.menorah.health.app`;
  - build/version expected above;
  - Associated Domain `applinks:app.menorah.me`;
  - Sign in with Apple entitlement;
  - expected camera, microphone and photo usage text; and
  - no unapproved debug entitlement or endpoint.

## 3. Privacy manifest and data declarations

The repository privacy manifest currently declares:

- User Defaults reason `CA92.1`;
- File Timestamp reason `C617.1`;
- Disk Space reason `E174.1`;
- System Boot Time reason `35F9.1`; and
- tracking `false`.

These declarations must be checked against the actual archive:

- [ ] Inspect Xcode's generated privacy report for the exact archive.
- [ ] Resolve every missing/invalid required-reason API declaration and SDK
      signature warning; do not assume the source manifest covers transitive
      SDK behavior.
- [ ] `PRIVACY ACTION`: map profile, contact, chat, booking, payment,
      face-check, diagnostics, support and rights data to App Store privacy
      declarations.
- [ ] Confirm collection, linkage, purpose, sharing, retention and deletion
      answers from approved product/vendor facts; do not infer them from code.
- [ ] Confirm whether OS push notifications ship. The current candidate has
      memory-resident in-app socket notifications and no push-token
      registration library; declarations and reviewer copy must remain
      accurate.
- [ ] Publish approved privacy policy, terms and support URLs over public HTTPS
      and prove they are monitored and match the app.
- [ ] Complete age rating, export compliance and content-rights declarations.

## 4. Universal Link and reset security

- [ ] Confirm the signed entitlement contains
      `applinks:app.menorah.me`.
- [ ] Obtain the production Apple Team ID from the account.
- [ ] Render
      `menorah/mobile-app/associations/apple-app-site-association.template.json`
      outside the repository with the Team ID and bundle ID. Do not commit the
      rendered identifier.
- [ ] `INFRASTRUCTURE ACTION`: publish directly at
      `https://app.menorah.me/.well-known/apple-app-site-association`.
- [ ] Verify HTTPS 200 and `Content-Type: application/json` with no redirect,
      authentication, geo/IP restriction or placeholder.
- [ ] `INFRASTRUCTURE ACTION`: set `PASSWORD_RESET_BASE_URL` to exactly
      `https://app.menorah.me`, leave `PASSWORD_RESET_URL_TEMPLATE` unset, and
      verify generated links append `/reset-password` with the token only after
      `#`.
- [ ] Allow for Apple CDN propagation, then verify on the signed build that only
      `https://app.menorah.me/reset-password#token=<64 hexadecimal characters>`
      enters the reset flow.
- [ ] Confirm invalid/missing/duplicate tokens fail and tokens never appear in
      query strings, logs, analytics, crash reports or notifications.

An HTTP response is not Universal Link proof; the signed physical-device flow
must work.

## 5. Authentication and account rights

- [ ] Create a dedicated reviewer account and store credentials only in App
      Store Connect.
- [ ] Prove fresh web incognito and fresh TestFlight login without hidden setup.
- [ ] Test registration, password login/reset/change, logout, logout-all,
      expired/revoked session and account switch.
- [ ] Test Apple authorization-code exchange in the signed build.
- [ ] Test Apple-linked account deletion with fresh Apple reauthorization,
      durable worker revocation and the subsequent first-time authorization
      behavior.
- [ ] Test Settings > Account > Delete Account end to end, including honest
      status/follow-up where retention or legal hold applies.
- [ ] Verify correction, export, grievance/privacy contact and consent
      withdrawal paths match approved notices.

## 6. Safety, content and clinical claims

- [ ] `CLINICAL ACTION` and `LEGAL ACTION`: approve app description,
      counsellor/qualification claims, age/minor handling, crisis disclaimer
      and escalation.
- [ ] Remove placeholder, fake or unmonitored support and safety content.
- [ ] Current review notes state that in-app user/content/message reporting and
      blocking are not available. Either implement and test the required
      report/block/moderation workflow or obtain an explicit approved
      submission decision with completely accurate UI and review notes.
- [ ] Verify the moderation/admin queue and response ownership before claiming
      that reports are submitted or acted upon.
- [ ] Confirm the app never claims emergency service, diagnosis, treatment,
      guaranteed confidentiality, end-to-end encryption or active recording
      without approved evidence.

Unresolved reporting/blocking/moderation is an App Store submission blocker.

## 7. Payments

- [ ] Confirm new digital subscription/premium-content purchases remain
      disabled on iOS and no browser/WebView/external auto-login workaround
      exists.
- [ ] Implement and approve Apple In-App Purchase before enabling digital
      subscriptions or premium app content.
- [ ] `OWNER ACTION`, `LEGAL ACTION` and `APPLE ACTION`: decide whether
      Razorpay booking payments are permitted solely for real-world one-to-one
      services.
- [ ] Confirm booking payment never unlocks digital subscription/premium
      content.
- [ ] If booking Razorpay remains, validate the New Architecture native module,
      successful/cancelled/failed/return flows and server reconciliation in a
      development build and TestFlight—not Expo Go.
- [ ] Use only the approved sandbox/test path in review notes; never include
      live credentials.

## 8. Physical iPhone and TestFlight QA

- [ ] Build `production-ios` only after preview QA and external account approval.
- [ ] Install the exact TestFlight candidate on supported physical iPhones.
- [ ] Verify clean install, upgrade and reinstall/Keychain behavior.
- [ ] Verify screenshots/screen recording are blocked on authenticated/reset
      screens and app-switcher snapshots are obscured.
- [ ] Verify secure-token persistence, logout, logout-all and account change.
- [ ] Verify Universal Link reset, Apple/Google/password auth and deletion.
- [ ] Verify booking, allowed payment path, chat, calls, support/privacy/legal
      screens and all failure/offline states.
- [ ] Verify no sensitive data appears in notifications, logs, clipboard,
      screenshots or crash/error UI.
- [ ] Retain device/OS/build/SHA, tester, timestamp and redacted results.

Follow the repository
[TestFlight checklist](../../menorah/mobile-app/docs/testflight-qa-checklist.md).

## 9. Store metadata and review

- [ ] Complete name, subtitle, description, keywords, category, screenshots,
      preview, support URL, privacy URL and terms.
- [ ] Ensure screenshots and preview are recent, accurate and contain no real
      user data.
- [ ] Complete App Privacy, age rating, export, Sign in with Apple, account
      deletion and payment declarations.
- [ ] Update
      [review notes](../../menorah/mobile-app/docs/app-store-review-notes.md)
      with verified facts and console-only reviewer credentials.
- [ ] Keep the approved reviewer environment available and monitored for the
      review window.
- [ ] Record submission owner, archive identity, App Store build identity,
      declarations, review correspondence and final decision.

## Final App Store gate

Do not upload for review until repository checks, macOS archive, signing,
privacy report, association file, physical-device QA, policies, reporting/
blocking decision, reviewer account, payment classification and store
declarations are all complete for one immutable candidate.

See
[mobile external actions](../../menorah/mobile-app/docs/mobile-store-external-actions.md)
and [App Store blockers](../../menorah/mobile-app/docs/app-store-blockers.md).
No Apple external item is claimed complete in this checklist.
