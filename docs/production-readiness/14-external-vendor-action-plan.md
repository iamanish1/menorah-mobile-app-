# External vendor and platform action plan

Last reviewed: 2026-08-03.

## Status

The public-release verdict is **NOT READY**. Repository configuration identifies
vendors and fail-closed gates, but it does not prove account ownership,
contracts, data locations, live credentials, callbacks, delivery, signing,
store approval, VAPT or vendor deletion. No vendor account was accessed or
changed and no vendor/live test was run while preparing this plan.

Use [the service and vendor register](./23-service-and-vendor-register.md) for
the complete inventory. Never put account identifiers, credentials, private
keys, secret-bearing URLs, user data or vendor exports in this repository.

## Minimum evidence for every enabled vendor

- [ ] Named business owner, technical owner and alternates.
- [ ] Unique MFA accounts, least-privilege roles and account-recovery test.
- [ ] `LEGAL ACTION`: executed terms/DPA as applicable, liability, termination
      and incident obligations.
- [ ] `PRIVACY ACTION`: purpose, fields, subjects, role, location, transfer,
      subprocessors, retention, access, request assistance and deletion/return.
- [ ] Security evidence: encryption, access logs, key/token lifecycle,
      vulnerability/assurance material and breach contact/timing.
- [ ] Approved sandbox/staging result for the exact candidate integration.
- [ ] Availability, quota, failure/fallback and escalation procedure.
- [ ] Exit test: disable, revoke, export needed evidence and verify deletion.
- [ ] Review date, renewal trigger and evidence custodian.

Optional integrations remain disabled until their pack is complete.

## Critical infrastructure providers

| Provider | Required external action and evidence | Fail-safe position / launch gate |
| --- | --- | --- |
| Cloudflare and domain registrar | `OWNER ACTION` and `INFRASTRUCTURE ACTION`: prove organizational account/domain ownership, unique MFA roles, recovery, DNS/Tunnel hostname match, trusted-proxy path, TLS, logging and change history. `LEGAL ACTION` and `PRIVACY ACTION`: approve data terms, locations and retention. | Do not change live configuration from desktop. Public launch blocked until every intended hostname and external probe is evidenced. |
| GitHub/GitHub Actions | `OWNER ACTION`: configure protected release/main rules, stable required checks, reviewer separation, tag governance and emergency-bypass logging. Review organization members, apps, runners, secrets, artifacts and retention. | Workflows must not deploy production. Missing governance blocks immutable release acceptance. |
| Container registry/image publishers | `OWNER ACTION`, `INFRASTRUCTURE ACTION` and `VENDOR ACTION`: verify account/pull custody, provenance, digest pinning, vulnerability response, availability and license/terms for every runtime image. | Do not pull an unreviewed mutable image during release or rollback. |
| Alert delivery provider | `OWNER ACTION`, `INFRASTRUCTURE ACTION` and `VENDOR ACTION`: approve receiver, safe payload, severity routing, on-call contacts, secret storage, retention and incident path. Install configuration outside Git and run receiver-side delivery/acknowledgement/resolution tests. | Effective `unconfigured-destination` blocks public launch. |
| Off-site backup provider/location | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `INFRASTRUCTURE ACTION` and `VENDOR ACTION`: approve jurisdiction, encryption, key separation, access, immutability, retention, legal holds, retrieval and verified deletion/exit. Retrieve and restore a signed copy. | No unencrypted copy; absent retrieval/restore evidence blocks public launch. |
| Certificate authority/domain services | `OWNER ACTION`, `INFRASTRUCTURE ACTION` and `VENDOR ACTION`: prove ownership, renewal, expiry monitoring, emergency recovery and change access. | Certificate/public-domain uncertainty blocks public traffic. |

## Payment and communications providers

| Provider | Required external action and evidence | Fail-safe position / launch gate |
| --- | --- | --- |
| Razorpay/RazorpayX | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION` and `VENDOR ACTION`: verify merchant/account ownership, product/payment classification, contracts, callback endpoints, webhook secret rotation, allowed IP/network assumptions, event retention, disputes/refunds and incident contacts. Run sandbox tests for signatures, replay, amount/currency/order/booking mismatch, capture state, delayed events, refund and payout reconciliation. | Keep live payment/payout initiation gates closed until finance accepts a signed reconciliation report. Never use frontend redirect as truth. |
| Resend | `OWNER ACTION`, `PRIVACY ACTION` and `VENDOR ACTION`: verify domain/sender, account roles, minimized templates, sandbox delivery, bounce/failure handling, suppression, logs/retention, subprocessors, deletion and incident escalation. | Disable email-dependent launch flows or provide an honest approved fallback when delivery is unproved. |
| Alert/paging/email destination | `OWNER ACTION`, `INFRASTRUCTURE ACTION` and `VENDOR ACTION`: verify redacted alert body, no sensitive labels, primary/alternate acknowledgement and resolved notification. | A healthy Alertmanager without human receipt is not ready. |

## Calls, face processing and optional providers

| Provider | Required external action and evidence | Fail-safe position / launch gate |
| --- | --- | --- |
| LiveKit | `OWNER ACTION`, `INFRASTRUCTURE ACTION`, `PRIVACY ACTION` and `VENDOR ACTION`: distinguish the current self-hosted software from any managed-vendor service. Verify host/network ownership, media paths/regions, logs, participant/time/state authorization, outage handling and contract if managed. | Default to no recording. Disable calls if authorization, availability or regional operation is unproved. |
| Luxand | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION` and `VENDOR ACTION`: approve necessity, accuracy/bias, fields, purpose, human review, location, transfer, training/use, subprocessors, retention/deletion, incident and exit. Test only with approved synthetic/consented staging data. | Keep face-check feature disabled if any required configuration or evidence is absent. |
| Google Meet, Doxy.me, VSee, Zoom, Teams or Jitsi-compatible fallback | `OWNER ACTION`, `CLINICAL ACTION`, `PRIVACY ACTION` and `VENDOR ACTION`: for each enabled fallback, approve clinical use, participant privacy, account ownership, regions, recording state, logs, consent, failure and deletion. | Do not advertise or enable a fallback merely because a feature flag/domain exists. |
| OpenAI Social Studio | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION` and `VENDOR ACTION`: approve account/model ownership, prohibit sensitive prompts, determine data use/retention, roles, content review, logs, incident and disable/exit. | Keep disabled until the content/privacy/vendor pack is complete. |
| Meta/Instagram publishing | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION` and `VENDOR ACTION`: verify business account, minimum scopes, token custody/revocation, content approval, data terms, audit and incident recovery. | Keep publishing disabled until evidence exists. |
| Cloudinary | Production currently requires local storage. Any future use requires `LEGAL ACTION`, `PRIVACY ACTION` and `VENDOR ACTION` plus migration, backup and deletion design. | Keep disabled; do not weaken production startup rejection. |

## Expo/EAS, Apple and Google

### Expo/EAS

- [ ] `OWNER ACTION`: name organization, billing, publisher and recovery owners.
- [ ] `VENDOR ACTION`: approve build-artifact/log retention, data locations,
      subprocessor terms, access roles and incident response.
- [ ] Keep Apple/Google signing material only in the approved protected
      mechanism; never commit an EAS credential bundle.
- [ ] Configure both `preview` and `production` EAS environments with the
      approved public platform API/web/return values. Profile `env` values do
      not populate OTA environments.
- [ ] From the approved release network, verify both platform API origins
      resolve, present valid TLS and route `/api` to the intended service.
- [ ] Set `PASSWORD_RESET_BASE_URL` to exactly `https://app.menorah.me`, leave
      `PASSWORD_RESET_URL_TEMPLATE` unset, and verify reset tokens remain only
      in URL fragments.
- [ ] Restrict preview/production channel publishing and retain candidate SHA,
      runtime, message, actor and rollback evidence.
- [ ] Never run an unqualified `eas update`.

### Exact Apple external blockers

- `APPLE ACTION`: confirm Apple organization/App Store Connect ownership,
  recovery, unique MFA roles and `com.menorah.health.app`.
- Confirm build `14` is greater than every uploaded build; increment the iOS
  and Android repository/native values together before building if it is not.
- Enable Associated Domains and regenerate the distribution provisioning
  profile; the signed entitlement must contain `applinks:app.menorah.me`.
- Supply the real Team ID only when rendering the AASA file outside Git.
- Keep the Team ID, key ID, PKCS#8 key, certificates and provisioning material
  only in the approved protected credential store.
- Publish it directly at
  `https://app.menorah.me/.well-known/apple-app-site-association` with HTTPS
  200 JSON, no redirect/authentication/geo or IP restriction.
- On approved macOS, regenerate/review CocoaPods without
  `expo prebuild --clean`; archive and inspect the exact privacy report and SDK
  signature warnings.
- Complete signed physical-iPhone/TestFlight tests for Universal Links,
  screenshot/recording/app-switcher protection, token persistence/logout,
  Apple login code exchange and Apple-linked deletion/revocation.
- Complete privacy, age, export, Sign in with Apple, support/privacy/terms,
  reviewer account and payment declarations using approved facts.
- Keep digital subscription purchases disabled until the applicable Apple
  in-app purchase implementation and policy review are complete.

See [the App Store checklist](./15-app-store-release-checklist.md). None of
these external actions is evidenced complete.

### Exact Google external blockers

- `GOOGLE ACTION`: confirm Play organization/account ownership, recovery,
  unique MFA roles and application ID `com.menorah.healthmobile`.
- Record the highest Play-uploaded version code and set Android plus every
  coupled repository/native build number to
  `max(15, highest Play-uploaded versionCode + 1)` with local version control
  and automatic increments disabled.
- Close the historical Android signing-password incident: determine Play App
  Signing status/key type, reset/recover the affected upload/app-signing path
  as appropriate, replace protected credentials, revoke copies and prove old
  credentials are invalid.
- Obtain the **Play App Signing** certificate SHA-256 fingerprint, not a debug
  or upload-key fingerprint; render the asset-links file outside Git.
- Register the Play App Signing SHA-1 with the production Android OAuth client
  while retaining a separate debug package/SHA-1 client.
- Configure validated `GOOGLE_SERVICES_JSON`, a dedicated least-privilege FCM
  V1 credential, Expo enhanced push security and protected
  `EXPO_PUSH_ACCESS_TOKEN`; keep the Play submission service account separate.
- Publish it directly at
  `https://app.menorah.me/.well-known/assetlinks.json` with HTTPS 200 JSON, no
  redirect/authentication/geo or IP restriction.
- Use a signed internal-track build and Play deep-link verification for the
  reset link, plus physical screenshot/recent-app tests including the return
  from Razorpay.
- Complete Data Safety, Health Apps, content rating, ads, account deletion,
  support, privacy, payments, push/device identifiers, GAD-7, chat and
  emergency-contact declarations from the final inventory.
- Rename the listing to **Menorah Health** and use the reviewed Android listing
  under `store-metadata/android`; remove fully-free, psychology-student, 24/7,
  absolute-confidentiality, diagnostic and emergency-service claims.
- Submit the single signed AAB to internal testing, complete Play-delivered
  emulator/physical-device QA and a clean pre-launch report, then require a
  separate owner go/no-go and signed 100% rollout risk exception before
  promoting that exact artifact.
- Keep digital subscription purchases disabled until applicable Google Play
  Billing implementation and policy review are complete.

See [the Google Play checklist](./16-google-play-release-checklist.md). None of
these external actions is evidenced complete.

## Independent assurance

| Party | Required action | Gate |
| --- | --- | --- |
| Independent VAPT provider | Contract an independent assessor; define public/authenticated API, admin, WebSocket, payment, SSRF, mobile, infrastructure and recovery scope; use approved staging accounts/data; remediate and obtain closure retest | `VAPT ACTION`: public launch blocker; no VAPT is claimed |
| ISO certification body/auditors | Select only after the management system has operated, internal audit and management review are complete; protect evidence shared externally | No certification or compliance claim may be made |
| Qualified Indian counsel/privacy/clinical advisors | Approve notices, age/minors, retention, processor roles/transfers, CERT-In/incident path, payment and clinical/counsellor decisions | Their decisions cannot be replaced by vendor terms or code |

## Closure record

For each enabled provider, record provider, feature, owners, approved account
role, contract/privacy/security decision dates, exact staging test, open risks,
incident contact, exit test and next review. Store secret or sensitive
attachments only in the approved restricted evidence system.

Until every enabled provider has a complete pack and disabled providers are
proved disabled, vendor readiness remains a launch blocker.
