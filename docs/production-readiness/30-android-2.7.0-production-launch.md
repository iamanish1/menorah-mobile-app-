# Android 2.7.0 production launch record

Created: 2026-08-03.

## Verdict

# NOT READY

This is the candidate record for the Android-only Menorah Health `2.7.0`
release. It is a release gate and evidence index, not authorization to deploy,
build with production credentials, submit to Google Play or promote a release.

No exact final candidate SHA, Play-safe version code, signed AAB, internal-track
result, same-day QA record, Play pre-launch report or owner go/no-go has been
recorded. The 100% production rollout therefore remains blocked.

## Intended release identity

| Field | Required value or rule | Current evidence |
| --- | --- | --- |
| Product name | **Menorah Health** | Repository listing copy prepared; Play Console rename not evidenced |
| Platform | Android only | Planned; no iOS store submission is authorized by this record |
| Package | `com.menorah.healthmobile` | Must be reverified in the signed AAB |
| Marketing/runtime version | `2.7.0` | Must match app config and checked-in native Android project at the final SHA |
| Android version code | `max(15, highest Play-uploaded versionCode + 1)` | `GOOGLE ACTION`: highest uploaded value not recorded; unresolved |
| Target SDK | 36 | Must be verified with bundletool on the downloaded AAB |
| Build profile | `production-android` | One build only after all pre-build gates pass |
| Release branch | `release/android-2.7.0-20260803` | Must be created at the reviewed post-merge `main` SHA |
| Candidate SHA | Full 40-character post-merge SHA | Pending; do not substitute a branch name or abbreviated SHA |
| Production rollout | Exact internal-track artifact, `releaseStatus=completed`, 100% | Requires a signed risk exception and separate owner go/no-go |

## Required source lineage

The final merge commit must retain all three of these commits as ancestors:

- current production lineage:
  `4091f8034e6e0444b93b27c4ac17743db50bcbca`;
- PR #4 feature lineage:
  `bdbed6fcf642430e4c90abb3da345fe18bf4f47c`; and
- guarded release-tooling lineage:
  `99f520dae6f755334747e25f8b540906570ee3dd`.

Record the merge commit, tree SHA, PR #4 URL, independent approval and the
three required aggregate checks only after they exist. Evidence belonging to
an ancestor or a superseded candidate must remain labelled historical.

## Pre-build hard gates

All boxes remain unchecked until a dated evidence reference is attached for
the exact candidate.

- [ ] `main` and `release/**` protections require an independent approval,
      stale-approval dismissal, resolved discussions, the readiness,
      functional and security aggregate checks, and block force-push/deletion.
- [ ] PR #4 is ready, independently approved and merged with a merge commit.
- [ ] The protected release branch points to the resulting `main` SHA and all
      three aggregate gates pass again for that exact SHA.
- [ ] The Play Console highest uploaded version code is recorded and every
      coupled repository/native build number uses the formula above with local
      version control and no automatic increment.
- [ ] Checked-in Android native configuration is synchronized explicitly;
      Continuous Native Generation is not assumed to apply config plugins.
- [ ] The EAS file secret `GOOGLE_SERVICES_JSON` exists and a fail-closed hook
      validates project/package before copying it temporarily without logging
      or committing it.
- [ ] A dedicated least-privilege FCM V1 service-account key is configured
      separately from the Play submission service account.
- [ ] Expo enhanced push security is enabled and
      `EXPO_PUSH_ACCESS_TOKEN` exists only in the protected backend runtime.
- [ ] The `general`, `messages`, `sessions` and `articles` Android notification
      channels are present and tested.
- [ ] The historical Android signing incident is closed: EAS upload and Play
      upload certificates are compared, any exposed upload key is reset, any
      possible app-signing-key exposure is escalated, and the retired
      credential is proved unusable.
- [ ] Play App Signing SHA-1 is registered for the production Android OAuth
      client; the debug client remains separate.
- [ ] Play App Signing SHA-256 is published at
      `https://app.menorah.me/.well-known/assetlinks.json` with HTTP 200, JSON
      content type and no redirect.
- [ ] A least-privilege Play service account can submit only to the required
      tracks, and separate internal and production submission profiles exist.
- [ ] Play listing name and copy match
      [`store-metadata/android`](../../store-metadata/android/README.md).
- [ ] Data Safety, Health Apps, payments, notifications/device identifiers,
      GAD-7 data, chat, emergency contacts, deletion, privacy, support,
      target-age and reviewer-access declarations match verified behavior.
- [ ] Cloudflare Tunnel token rotation, protected secret update and endpoint
      verification are complete without recording the token here.
- [ ] A fresh encrypted backup and isolated restore result are less than
      24 hours old; backend release, migrations, worker single-active-mode,
      image IDs, health and smoke evidence are complete.

## Build-once and artifact verification

After every pre-build gate passes, build once from the full protected release
SHA:

```sh
cd menorah/mobile-app
eas build --platform android --profile production-android --non-interactive
```

Record the EAS build ID, AAB SHA-256 and download time. Inspect that downloaded
AAB with bundletool/apksigner and require:

- package `com.menorah.healthmobile`;
- version `2.7.0` and the recorded Play-safe version code;
- target SDK 36 and the expected production signing lineage;
- no debug/cleartext configuration or prohibited storage/phone permissions;
- `POST_NOTIFICATIONS`, expected Expo/Firebase services and receivers,
  Firebase resources and default notification-channel metadata; and
- correct App Links, API origins, OAuth clients and runtime version.

Any failed check invalidates the artifact. Fixes require a new candidate, a
higher unused version code, a new AAB and rerun of all affected gates.

## Same-day internal-track QA

Submit the AAB to Google Play internal testing, then install the
**Play-delivered** build on an Android emulator with Play Services and at least
one physical Android device. Record pass/fail/block for each item:

- clean install and upgrade from the current Play version;
- email sign-in, forgot/reset/change password and Play-signed Google Sign-In;
- first-login tour;
- counsellor search/filters/profiles, visible hourly rates, booking,
  pending-payment cancellation and occupied-slot rejection;
- web-to-Android chat history, profile pictures, reconnect and duplicate
  suppression;
- all seven GAD-7 questions, incomplete/duplicate blocking, owner-only result
  access and booking navigation;
- article, counsellor-message and session-reminder notifications in
  foreground, background and killed states;
- notification denial/re-enable, token refresh/removal and tap destinations;
- Hostinger LiveKit camera/microphone call;
- offline/error states, account switching, logout and account deletion; and
- log review proving no tokens, assessment answers/scores, emergency contacts
  or chat content are exposed.

A clean Play pre-launch report is mandatory. Emulator testing does not replace
the physical-device pass.

## Separate go/no-go and exact-artifact promotion

Internal QA completion does not authorize production. A separate owner
go/no-go must identify the candidate SHA, EAS build ID, AAB digest, Play
release ID, evidence pack, unresolved risks and decision timestamp.

The owner must explicitly accept the risk of bypassing staged percentages.
Only then may the same internal-track artifact be promoted to production at
100% with `releaseStatus=completed`. Do not rebuild, change the binary,
substitute an OTA update or promote a different artifact. Google review can
delay public availability beyond the planned same-day sequence.

## Monitoring and stop conditions

Monitor continuously for two hours after availability and review again at
24 hours: API/worker health, notification queues/receipts, auth failures,
Socket.IO reconnects, booking conflicts, payments, crashes and ANRs.

Any wrong-recipient notification, authorization leak, duplicate active
booking, payment mismatch, launch crash or material regression starts incident
response. If push fails, disable notification jobs on the single active worker.
An installed Android release cannot be downgraded; a client defect requires a
reviewed hotfix with a higher unused version code.

## Evidence record

| Evidence | Reference | Status |
| --- | --- | --- |
| Final merge SHA/tree and three lineage ancestor checks | Pending | NOT READY |
| Branch protections and independent PR approval | Pending | NOT READY |
| Exact-SHA readiness/functional/security runs | Pending | NOT READY |
| Highest Play version code and selected release version code | Pending | NOT READY |
| Signing-incident closure and certificate identities | Restricted evidence pending | NOT READY |
| Firebase/FCM/EAS/Play credential configuration | Restricted evidence pending | NOT READY |
| Backend release, migrations, worker mode and fresh restore | Pending | NOT READY |
| EAS build ID and AAB digest/inspection | Pending | NOT READY |
| Internal-track Play delivery, emulator/device QA and pre-launch report | Pending | NOT READY |
| Separate owner go/no-go and 100% rollout exception | Pending | NOT READY |
| Production promotion, two-hour monitoring and 24-hour review | Pending | NOT READY |
