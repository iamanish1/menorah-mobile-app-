# Mobile device and store preflight

Runtime candidate SHA: `3fb99858c6766a341bb7b7dab2377195427f0ea1`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Mobile version in candidate: verify from source and signed artifact

Initial state: **not run**

Repository checks do not prove signing, device behavior, TestFlight/internal
track behavior or store declarations. Use the
[Apple release checklist](../15-app-store-release-checklist.md) and
[Google Play checklist](../16-google-play-release-checklist.md) as the sources
of truth.

## Candidate repository gate

From `menorah/mobile-app`:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:payment-policy
npm run test:release-config
npm run validate:release-config
npm run doctor
npm audit --omit=dev
```

Record each result separately. Review every Expo Doctor exclusion and
dependency advisory by package/path/impact/owner/expiry. Do not run
`expo prebuild --clean` against tracked native projects or use blanket
`npm audit fix --force`.

## STAGING-ONLY EAS preview procedure

The preview profiles are internal-distribution profiles. They are not store
release signing and do not authorize production submission. The EAS `preview`
environment must contain the reviewed non-production public variables from
[the environment matrix](./02-staging-environment-matrix.md#mobile-preview-environment-and-five-release-urls).
No production/provider mutation is authorized.

On the approved staging build workstation, first validate the same protected
values locally without printing them:

```bash
set -euo pipefail
umask 077

readonly RUNTIME_SHA='3fb99858c6766a341bb7b7dab2377195427f0ea1'
readonly REPO='/srv/menorah-staging/repository'
readonly STAGING_ENV='/etc/menorah-staging/staging.env'
readonly MOBILE_ENV='/etc/menorah-staging/mobile-preview.env'
: "${APPROVED_PR_HEAD_SHA:?Set the externally recorded deployed docs/PR-head SHA}"
readonly APPROVED_PR_HEAD_SHA

[[ "${RUNTIME_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${APPROVED_PR_HEAD_SHA}" =~ ^[0-9a-f]{40}$ ]]
test "$(git -C "${REPO}" rev-parse HEAD)" = "${APPROVED_PR_HEAD_SHA}"
git -C "${REPO}" merge-base --is-ancestor \
  "${RUNTIME_SHA}" "${APPROVED_PR_HEAD_SHA}"
git -C "${REPO}" diff --quiet \
  "${RUNTIME_SHA}..${APPROVED_PR_HEAD_SHA}" -- \
  . ':(exclude)docs/production-readiness/staging/**'
test -z "$(git -C "${REPO}" status --porcelain)"
grep -qx 'MENORAH_STAGING_ONLY' /etc/menorah-staging/STAGING_HOST
test -r "${STAGING_ENV}" && test -r "${MOBILE_ENV}"

set -a
# shellcheck disable=SC1090
. "${STAGING_ENV}"
# shellcheck disable=SC1090
. "${MOBILE_ENV}"
set +a

test "${NODE_ENV}" = 'production'
test "${MENORAH_MOBILE_ENVIRONMENT}" = 'preview'

cd "${REPO}/menorah/mobile-app"
node <<'NODE'
const {
  readReleaseEnvironment,
} = require('./scripts/release-environment.cjs');

const expected = {
  EXPO_PUBLIC_IOS_API_BASE_URL: `https://${process.env.API_IOS_DOMAIN}/api`,
  EXPO_PUBLIC_ANDROID_API_BASE_URL: `https://${process.env.API_ANDROID_DOMAIN}/api`,
  EXPO_PUBLIC_WEB_BASE_URL: `https://${process.env.APP_DOMAIN}`,
  EXPO_PUBLIC_CHECKOUT_RETURN_URL: `https://${process.env.APP_DOMAIN}/checkout/return`,
  EXPO_PUBLIC_JITSI_BASE_URL: `https://${process.env.CALLS_DOMAIN}`,
};
for (const [name, value] of Object.entries(expected)) {
  if (process.env[name] !== value) {
    throw new Error(`${name} does not match the staging runtime domain contract`);
  }
}
readReleaseEnvironment(process.env);
NODE

npm ci
npm run lint
npm run typecheck
npm run test:payment-policy
npm run test:release-config
npm run validate:release-config
npm run doctor
```

After the protected EAS `preview` environment has been independently reviewed,
build both internal artifacts:

```bash
# STAGING-ONLY internal distribution; requires approved EAS preview access.
npm run build:preview
npm run build:ios:preview
```

The remote build must fail if its EAS preview environment omits or misroutes
the five release URLs because `app.config.ts` calls the release-environment
validator. Retain EAS build IDs, resolved profile/environment names, candidate
SHA, runtime/version, artifact checksums and signing identities without
retaining environment values. Install only through the approved internal
distribution path and execute the device matrix below.

## Build identity and environment

- Preview/internal builds resolve only staging API, web, call, payment and
  callback endpoints.
- Application ID/bundle ID, version, build/version code, runtime version,
  update channel and EAS profile are recorded from source and signed artifact.
- Embedded public IDs are expected; no server secret, private key, provider
  secret, production token or production URL is present.
- OTA update branch/channel/runtime compatibility is proven; production
  updates are not published during this test.
- Build provenance binds commit SHA, lockfile, native project, EAS build ID,
  artifact checksum and signer/account.

Any native, configuration, dependency, signing or OTA change invalidates
affected device/store evidence.

## Android release-signing boundary

The checked-in `Build Android AAB` workflow is deliberately **not usable for
this release-branch staging candidate**. Its current contract requires:

1. manual `workflow_dispatch` from `refs/heads/main`;
2. `release_sha` equal to the exact dispatch-time `main` HEAD;
3. protected environment `android-release-signing`; and
4. environment marker `ANDROID_RELEASE_SIGNING_READY=protected-main-only`
   before checkout or candidate-controlled execution.

The `android-release-signing` environment is currently absent, so the marker
and environment-owned signing controls are absent. External review also found
the signing secrets repository-scoped. `OWNER ACTION`, `GOOGLE ACTION` and
security administration must create/protect the environment, require the
approved reviewers, prevent self-review/admin bypass as approved, move signing
secrets to it and remove repository-scoped copies. This package does not
authorize those mutations.

Signed Android release status is **BLOCKED / NOT COLLECTED**. This package does
not authorize a merge to `main`; a separately authorized governance action
must first supply an exact eligible protected `main` head and the protected
environment evidence, after which affected runtime/build evidence must be
revalidated. Never weaken the main-HEAD check or use preview credentials as
store-release evidence.

## Physical-device matrix

| Platform | Minimum coverage | Required evidence | Action |
| --- | --- | --- | --- |
| Android | Supported low/mid/high resource devices; current and oldest supported OS; Wi-Fi/mobile/restricted network | Model/OS/build ID, signed artifact checksum and result by case | `GOOGLE ACTION` |
| iOS | Current and oldest supported iOS on physical iPhone; at least one constrained/restricted network | Model/OS/build/archive/TestFlight ID and result by case | `APPLE ACTION` |
| Accessibility | Large text, screen reader, reduced motion, contrast, orientation and keyboard/switch where supported | Manual captures and issue references | Mobile/QA |
| Regional calls | Approved UAE/restricted-network and fallback scenarios on both platforms | Network/provider/room evidence without content | `CLINICAL ACTION`; `VENDOR ACTION` |

Simulator/emulator results may support diagnosis but do not replace signed
physical-device evidence.

## Device test matrix

| Test ID | Scenario | Required result | Evidence / action | Severity | Result |
| --- | --- | --- | --- | --- | --- |
| `MOB-ID-001` | Inspect signed app identity/version/runtime/channel/endpoints | Exact candidate/build metadata and staging endpoints; no production secret/URL | Binary/resolved config report | P0 | NOT RUN |
| `MOB-AUTH-001` | Register/login/verification/reset/logout/logout-all on device | Same server authority and revocation behavior as web/API; no credential leakage | Device/API/audit correlation | P0 | NOT RUN |
| `MOB-AUTH-002` | Google/Apple login and callback/deep-link manipulation | Correct app/account binding; state/nonce and post-login authorization enforced | `APPLE ACTION`; `GOOGLE ACTION` | P0 | NOT RUN |
| `MOB-STORE-001` | Inspect secure token persistence, backup/restore, reinstall and device migration | Sensitive tokens in approved secure storage only; logout clears; no insecure backup | Device security evidence | P0 | NOT RUN |
| `MOB-LOCAL-001` | Inspect AsyncStorage, files, cache, clipboard and app-switcher snapshot | No token/clinical/payment/biometric data beyond approved minimum; clipboard clears; sensitive screens protected | Privacy/security evidence | P0 | NOT RUN |
| `MOB-SCREEN-001` | Screenshot/screen-record/app-switcher on designated sensitive screens | Protection matches documented scope without false privacy claims | Device captures; `PRIVACY ACTION` scope | P0 | NOT RUN |
| `MOB-BOOK-001` | Catalog, tampered checkout, payment test mode and server-confirmed result | Server price/state authoritative; redirect cannot confirm | Sandbox provider correlation | P0 | NOT RUN |
| `MOB-CALL-001` | Assigned call in-window, early/late/wrong party/replay/reconnect/restricted network | Participant/state/ticket controls enforced; approved fallback accurate; recording off | Device/room/audit evidence | P0 | NOT RUN |
| `MOB-CHAT-001` | Chat join, reconnect, suspension/cancel/reassignment | Room authorization revalidated; sensitive logs absent | Device/API/log evidence | P0 | NOT RUN |
| `MOB-LINK-001` | Universal/App Link from cold/warm state, malicious path/object, logged-out return | External association succeeds; allowlisted route; authentication/object authorization repeats | External fetch and device evidence | P0 | NOT RUN |
| `MOB-PUSH-001` | Foreground/background/locked notification and deep link | Minimal non-sensitive content; device token lifecycle/logout cleanup; deep link reauthorizes | Redacted captures; privacy approval | P0 | NOT RUN |
| `MOB-PRIV-001` | Consent, withdrawal, correction/export/deletion/status/contact paths | Accurate version/status and no unsupported immediate-deletion promise | Device/API/audit evidence | P0 | NOT RUN |
| `MOB-NET-001` | Offline, timeout, TLS failure, captive/restricted network and retry | Safe error, no duplicate booking/payment, bounded retry and recovery | Network trace without secrets | P1 | NOT RUN |
| `MOB-LOG-001` | Inspect device logs/crash output while exercising sensitive paths | No token, contact, clinical, payment, biometric or provider secret | Redacted log scan | P0 | NOT RUN |
| `MOB-UPDATE-001` | Install prior approved preview then candidate OTA/native update compatibility case | Runtime/channel prevents incompatible update; candidate provenance retained | EAS/build/update evidence | P0 | NOT RUN |

## External association and URL checks

- Fetch Apple association and Android asset-links files from independent
  external networks.
- Verify status, MIME type, redirect behavior and exact app/team/package
  identities against signed builds.
- Test every public link route and an unauthorized object/deep link.
- Verify privacy, support, terms, account-deletion and grievance URLs render
  the approved staging/review content.

Repository templates or a local `200` response are not external proof.

## Apple preflight

`APPLE ACTION`:

- account ownership, MFA, roles and alternates;
- certificates, provisioning profiles and key custody;
- bundle ID, entitlements, associated domains and Sign in with Apple;
- privacy manifest/required-reason APIs and SDK privacy report;
- macOS archive of the exact candidate, signature/provenance and physical
  device/TestFlight tests;
- privacy, age, export, content, health and account-deletion declarations; and
- reviewer instructions/test account references without credentials.

No App Store submission is authorized by this package.

## Google preflight

`GOOGLE ACTION`:

- Play account ownership, MFA, roles and alternates;
- Play App Signing/upload-key status and any exposed-key incident closure;
- package ID, version code, intent filters and external asset links;
- signed internal-track build of the exact candidate and physical-device tests;
- Data Safety, Health Apps, content rating, target API, ads and account-deletion
  declarations; and
- reviewer instructions/test account references without credentials.

No Play production rollout is authorized by this package.

## Completion gate

Mobile/store preflight is **NO-GO** on any failed/skipped P0, unexplained
Doctor/advisory exception, native/config drift, production endpoint, unsigned
or unbound artifact, missing physical-device evidence, failed external
association, inaccurate declaration, or incomplete Apple/Google ownership.
