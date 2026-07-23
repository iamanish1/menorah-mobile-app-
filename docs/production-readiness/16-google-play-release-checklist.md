# Google Play release checklist

Last reviewed: 2026-07-23.

## Verdict and evidence boundary

**NOT READY**

Repository metadata currently describes Menorah Health `2.6.0`, Android
application ID `com.menorah.healthmobile`, version code `14`, and Expo runtime
`2.6.0`. Those are source observations, not proof of a signed Android App
Bundle, internal-track upload, Play App Signing identity, physical-device test
or Play approval.

No Play Console action, Android signing credential use, EAS store build,
internal-track upload, physical-device test or Google review was performed for
this handover.

## 1. Immutable candidate and repository checks

- [ ] Record the exact reviewed SHA, clean tree, lockfiles, version, version
      code and runtime version.
- [ ] Confirm version code `14` is greater than every artifact already uploaded
      to Play Console. If not, increment the Android and iOS repository/native
      values together before build.
- [ ] Confirm Gradle namespace/application ID and manifest package behavior are
      `com.menorah.healthmobile`.
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

- [ ] Record every failure, skip and approved exception. Do not use force
      upgrades to hide the current narrowly scoped Expo transitive advisory.
- [ ] Confirm `production-android` supplies both
      `https://api-ios.menorah.me/api` and
      `https://api-android.menorah.me/api`, with the runtime selecting the
      Android origin, plus the intended public web/return/call and Google OAuth
      public values.
- [ ] Confirm matching public values exist in the EAS `production` environment
      before a binary or qualified OTA update.
- [ ] `INFRASTRUCTURE ACTION`: from the approved release network, verify
      `api-android.menorah.me` resolves, presents valid TLS and routes `/api` to
      the intended Android service before building.
- [ ] Never build the generic production base directly and never run an
      unqualified `eas update`.

## 2. Historical signing incident: hard block

Commit `d9bb6686738c1c9aeeebc539cb83e9b62861ec85` contains historical
`menorah/mobile-app/credentials.json` keystore/key passwords. The keystore was
not found in reachable Git objects, the values were not displayed during
review, and credential rotation is not evidenced.

- [ ] `GOOGLE ACTION`: freeze production signing and affected EAS/CI
      credentials until ownership and key type are confirmed.
- [ ] Confirm whether Play App Signing is enabled and distinguish the Play app
      signing key from the upload key.
- [ ] If affected material is an upload key, generate a replacement in the
      approved secure process, complete Play Console upload-key reset, replace
      protected EAS/CI credentials and revoke old copies.
- [ ] If the app-signing key may be affected, use the approved Play emergency
      support/recovery process; do not invent a replacement procedure.
- [ ] Inventory and revoke old CI, EAS, workstation and backup copies.
- [ ] Prove old credentials are invalid and one replacement-signed
      internal-track artifact is accepted.
- [ ] Complete coordinated Git-history remediation only in a separately
      approved repository-wide window.

See
[the incident remediation record](../../menorah/docs/security-incident-remediation.md).
This unresolved incident blocks Google Play release.

## 3. Google account, Play App Signing and release artifact

- [ ] `OWNER ACTION` and `GOOGLE ACTION`: confirm Play organization/account,
      agreements, billing, recovery and primary/alternate release owners.
- [ ] Review unique accounts, MFA, least privilege, service accounts, API
      access and offboarding.
- [ ] Keep keystore, alias/passwords and service credentials only in the
      approved protected mechanism; never in Git, Gradle properties or tickets.
- [ ] Confirm Play App Signing enrollment and record the app-signing
      certificate identity in restricted release evidence.
- [ ] Build the exact reviewed candidate with the `production-android` profile:

  ```sh
  cd menorah/mobile-app
  npm run build:production
  ```

- [ ] Verify the resulting AAB signature, application ID, version/version code,
      runtime, permissions, API/public configuration and absence of debug
      signing/configuration.
- [ ] Upload first to the approved internal track and retain artifact digest,
      Play version, signing certificate, SHA, actor and timestamp.

## 4. Android App Link and reset security

- [ ] Obtain the SHA-256 fingerprint for the **Play App Signing** certificate.
      Do not use the debug certificate or upload-key fingerprint.
- [ ] Render
      `menorah/mobile-app/associations/assetlinks.template.json` outside Git
      with `com.menorah.healthmobile` and that fingerprint. Do not commit the
      rendered fingerprint.
- [ ] `INFRASTRUCTURE ACTION`: publish directly at
      `https://app.menorah.me/.well-known/assetlinks.json`.
- [ ] Verify HTTPS 200 and `Content-Type: application/json` with no redirect,
      authentication, geo/IP restriction or placeholder.
- [ ] `INFRASTRUCTURE ACTION`: set `PASSWORD_RESET_BASE_URL` to exactly
      `https://app.menorah.me`, leave `PASSWORD_RESET_URL_TEMPLATE` unset, and
      verify generated links append `/reset-password` with the token only after
      `#`.
- [ ] Use Play Console's deep-link verifier and a signed internal-track build
      to verify only
      `https://app.menorah.me/reset-password#token=<64 hexadecimal characters>`.
- [ ] Confirm invalid/missing/duplicate tokens fail and tokens never enter query
      strings, logs, analytics, crash reports or notifications.

The repository's `autoVerify` manifest and a reachable JSON file are not signed
device proof.

## 5. Permissions, security and physical-device QA

Repository configuration removes broad storage/media and phone-state
permissions and declares camera, microphone, network, vibration and audio
settings for current features. Validate the merged signed artifact:

- [ ] Review every merged permission against actual feature use and Play
      declarations.
- [ ] Confirm `allowBackup=false` and no debug/test component or cleartext
      production endpoint is present.
- [ ] On supported physical devices, confirm screenshots, screen recording and
      recent-app previews are blocked on sensitive screens, including after
      returning from Razorpay.
- [ ] Test clean install, upgrade, reinstall, secure-token persistence,
      logout/logout-all and account switching.
- [ ] Test password/Google authentication, App Link reset, revoked/expired
      session and account deletion.
- [ ] Test booking, allowed payment path, chat, calls, support/privacy/legal
      screens, offline and failure states.
- [ ] Verify no sensitive data enters notifications, logs, clipboard,
      screenshots, recent-app snapshots or error UI.
- [ ] Retain device model/OS/build/SHA, tester, timestamp and redacted results.

## 6. Data Safety, Health Apps and product declarations

- [ ] `PRIVACY ACTION`: map profile, contact, chat, booking, payment,
      face-check, diagnostics, support and rights data to Play Data Safety.
- [ ] Determine collection, sharing, purposes, optionality, encryption,
      retention and deletion using final product/vendor facts.
- [ ] Complete the Google Health Apps declaration from approved
      clinical/product facts; do not infer medical status from marketing copy.
- [ ] Complete content rating, target audience/age, ads and account-deletion
      declarations.
- [ ] Publish approved privacy policy, terms, support, grievance and deletion
      information at real monitored public URLs.
- [ ] Confirm whether OS push notifications ship. Current code has
      memory-resident in-app socket notifications and no push-token
      registration library; declarations must be accurate.
- [ ] `LEGAL ACTION`, `PRIVACY ACTION` and `CLINICAL ACTION`: approve
      age/minor, face/biometric, mental-health, counsellor and crisis positions.

## 7. Authentication, account deletion and reviewer access

- [ ] Create a dedicated reviewer account and place credentials only in Play
      Console.
- [ ] Prove fresh web and internal-track login without hidden setup.
- [ ] Test Settings > Account > Delete Account through backend processing,
      status/follow-up and honest retention/legal-hold behavior.
- [ ] Test correction, export, consent withdrawal and grievance/privacy contact
      paths against approved notices.
- [ ] Confirm support channels are real and monitored throughout review.
- [ ] Keep the approved reviewer environment available and record review
      correspondence without credentials.

## 8. Payments and user-generated content

- [ ] Confirm new digital subscription/premium-content purchases remain
      disabled.
- [ ] Implement and approve the applicable Google Play Billing flow before
      enabling digital subscriptions or premium app content.
- [ ] `OWNER ACTION` and `GOOGLE ACTION`: classify Razorpay booking payments and
      confirm they are limited to approved real-world one-to-one services.
- [ ] Validate success, cancel, failure, delayed webhook and reconciliation
      paths using approved test credentials.
- [ ] Current mobile review material states in-app report/block/moderation
      actions are unavailable. Implement and test the required workflow or
      approve an accurate submission position; never claim unavailable
      controls.

## 9. Internal track and staged release

- [ ] Upload the exact signed AAB to the internal track.
- [ ] Complete Play pre-launch results and review every crash, ANR,
      accessibility, security and compatibility finding.
- [ ] Run the physical-device and App Link checklist against the Play-delivered
      artifact, not a debug APK.
- [ ] Verify backend production-like API, vendor sandbox and alert evidence for
      the exact mobile candidate.
- [ ] Complete screenshots/listing with no real user data and no unsupported
      clinical/security/privacy claims.
- [ ] Record Data Safety, Health Apps, content, ads, age, deletion, support,
      privacy and payment declarations.
- [ ] Define staged rollout cohort, monitoring, stop conditions, rollback owner
      and EAS/native compatibility boundary.
- [ ] Obtain a separate signed go/no-go before any production rollout.

## Final Google Play gate

Do not submit or roll out until the historical signing incident, account
ownership, Play App Signing identity, version-code gate, signed AAB, App Link,
physical-device QA, Data Safety/Health declarations, policies, reviewer access,
payment classification and monitoring are complete for one immutable
candidate.

See
[mobile external actions](../../menorah/mobile-app/docs/mobile-store-external-actions.md)
and [mobile site associations](../../menorah/mobile-app/associations/README.md).
No Google external item is claimed complete here.
