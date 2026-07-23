# Staging data and test accounts

Runtime candidate SHA: `f507fc41eb636e0c4607d6c34bd80354f8ccff2e`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

## Data rule

Use generated synthetic people, bookings, messages, clinical-like text,
documents, media and payment identifiers. Do not derive fixtures from a
production snapshot, export, backup, log, screenshot, support ticket or real
person. Names and phone numbers must use reserved/test ranges; email addresses
must use the dedicated staging domain and sink controlled by the QA owner.

Every synthetic staging account that has an email address must use the exact
protected `MENORAH_STAGING_EMAIL_DOMAIN`. This applies to users, counsellors,
admins, DAST identities and provider-test recipients. Do not use a real,
external, shared, production or catch-all mailbox. Backend outbound delivery
for OTP, verification, reset, booking, notification and other flows must fail
closed before provider dispatch when the recipient domain differs.

Credentials belong in the approved staging secret manager, not Git, this
document, screenshots or the evidence index. Evidence refers to account IDs by
synthetic aliases below.

## Synthetic account roster

| Alias | Role/state | Required purpose | Data restrictions | Owner |
| --- | --- | --- | --- | --- |
| `USER-A` | Active verified user | Happy path and ownership baseline | Synthetic adult profile only | QA |
| `USER-B` | Active verified user | Cross-user denial | Must not share USER-A objects | QA |
| `USER-UNVERIFIED` | Pending verification | Verification and pre-auth denial | No real mailbox/phone | QA |
| `USER-SUSPENDED` | Suspended | Session/WebSocket/call denial | Synthetic only | Security |
| `USER-DELETED` | Deletion-state account | Revocation, status and rights flows | Synthetic protected-record fixtures | Privacy/QA |
| `USER-MINOR-FIXTURE` | Age-boundary fixture, login disabled by default | Test approved age decision only | `OWNER ACTION`; `LEGAL ACTION`; `CLINICAL ACTION` before enablement | QA |
| `COUNSELLOR-A` | Approved, current | Assignment and participant baseline | Synthetic credentials/evidence | Clinical QA |
| `COUNSELLOR-B` | Approved, current | Atomic acceptance race and isolation | Synthetic credentials/evidence | Clinical QA |
| `COUNSELLOR-DRAFT` | Draft | Self-declaration cannot activate | Synthetic metadata | Clinical QA |
| `COUNSELLOR-REVIEW` | Submitted/under review | Transition authorization | Synthetic evidence | Clinical QA |
| `COUNSELLOR-REJECTED` | Rejected | Acceptance/access denial | Synthetic reason | Clinical QA |
| `COUNSELLOR-SUSPENDED` | Suspended | Session, booking, chat/call denial | Synthetic reason | Clinical QA |
| `COUNSELLOR-EXPIRED` | Approved then expired | Re-verification denial | Synthetic expiry | Clinical QA |
| `ADMIN-FULL-1` | Full administrator | Approval baseline and first payout approver | No shared login | Security/owner |
| `ADMIN-FULL-2` | Full administrator | Second payout approver | No shared login | Security/owner |
| `ADMIN-SUPPORT` | Support | Support-only allow/deny matrix | No finance/clinical access | Security/owner |
| `ADMIN-FINANCE` | Finance | Reconciliation and finance matrix | No clinical-note access | Security/owner |
| `ADMIN-CONTENT` | Content | Content-only matrix | No user/payment/clinical access | Security/owner |
| `ADMIN-REVOKED` | Permission removed with existing session | Stale-role/session denial | Synthetic only | Security |

Create separate sessions for simultaneous-device and token-replay cases. Never
reuse an administrator account between actors or share MFA material.

## Fixture-state inventory

| Fixture group | Required states |
| --- | --- |
| Service catalog | Supported service/currency; disabled service; approved synthetic promotion/entitlement only if owner policy exists |
| Booking | Draft, awaiting payment, paid/authorized unassigned, assigned, cancelled, refunded, expired and terminal |
| Acceptance race | One paid unassigned booking visible in bounded form to COUNSELLOR-A and COUNSELLOR-B at the same instant |
| Payment/order | Sandbox order linked to booking/receipt; wrong-order, wrong-payment, wrong-booking, amount/currency mismatch and non-captured variants |
| Refund | Eligible synthetic payment plus duplicate, over-limit, already-refunded and policy-blocked variants |
| Payout | Eligible synthetic earning; pending dual approval; MFA-expired; cap boundary; failed/retry/reconciled variants |
| Calls | Before window, in window, after grace, cancelled/refunded, wrong participant and consumed-ticket variants |
| Chat | Assigned active room, unassigned room, cancelled/reassigned room and connected-then-suspended participant |
| Counsellor verification | Every lifecycle state with consent/evidence/reviewer fields varied independently |
| Privacy | Consent versions, withdrawal, correction/export/deletion requests, legal hold and retention eligibility collisions |
| Files/media | Authorized owner object, cross-user object, oversized/non-image fixture and safe synthetic managed media |
| SSRF | QA-controlled HTTPS responder for redirects, private-DNS answer, delay, size and content-type cases; never scan third parties |
| Audit | Known event chain/checkpoint, tampered copy and bounded sink-failure fixture |
| Recovery | Synthetic MongoDB documents, indexes and media with a manifest/checksum suitable for before/after comparison |

## Creation procedure

1. Record a fixture-set version and candidate SHA.
2. Do not run the candidate's `npm run seed:qa` harness. It contains hard-coded
   off-domain identities/shared credentials, logs full addresses, and lacks
   the required staging target and exact-domain guards.
3. Prove `MONGODB_URI`, Redis and media roots identify staging before seeding.
4. Prove the protected staging email-domain value and verify every generated
   account address has that exact domain before any email-producing test.
5. Create users through public workflows where the test is intended to cover
   them. Staff workflows remain blocked until an independently approved full
   admin exists; use direct factories only for unreachable fault states under
   a reviewed procedure and mark that fact.
6. Record synthetic aliases and object IDs in the protected test-management
   system. Do not put tokens, passwords, contact values or documents in Git.
7. Take a logical baseline manifest of expected counts, states, indexes and
   media checksums. This is synthetic test evidence, not a production backup.
8. Reset between destructive groups by restoring a reviewed synthetic fixture
   backup to the isolated staging target, never by copying production data.

## Blocked seed harness and approved creation boundary

The candidate `seed:qa` harness is **BLOCKED** for staging and must not be
enabled with `ALLOW_LOCAL_QA_SEED` or worked around. After the target guard in
[03-staging-deployment-procedure.md](./03-staging-deployment-procedure.md)
passes, create the bounded non-admin roster through public registration APIs
or UI so the ordinary validation paths execute. Use QA-owned exact-domain
addresses and separately provisioned protected credentials; retain only safe
object identifiers in the controlled evidence store.

Automated fixture creation remains blocked until a separately reviewed
generator fails closed on the approved staging host, database, cache, media
roots and `MENORAH_STAGING_EMAIL_DOMAIN`; rejects every off-domain identity
before writes or provider calls; accepts no shared default credential; and
does not print addresses, credentials or tokens. Direct factories may then be
used only for unreachable fault states under a bounded reviewed procedure.

The candidate `backend/scripts/create-admin.js` harness is also **BLOCKED** for
staging. It has a localhost database fallback, validates only generic email
syntax, can reactivate/upgrade an existing account, and prints the full email.
Do not invoke it or treat `ADMIN_BOOTSTRAP_CONFIRM=create-admin` as approval.
The first full admin must be supplied by a separately authorized,
independently reviewed bootstrap that is bound to the exact staging database
and email domain, refuses existing-user activation/role mutation, emits
value-free evidence and provisions two distinct approvers. Until then all
staff/admin flows, including payout approval, remain `BLOCKED / NOT RUN`.

## Test-provider data

- Razorpay/RazorpayX: vendor-generated test IDs only; use documented test
  instruments and no real bank beneficiary.
- Email: sender, contact sink and every synthetic account/recipient use the
  exact `MENORAH_STAGING_EMAIL_DOMAIN`; external/live recipients are negative
  fail-closed fixtures only and must never reach the provider.
- LiveKit/call fallback: synthetic room names and participants; recording off.
- Face check: generated/provider-approved synthetic media only; no real
  biometric template or undisclosed inference.
- Cloudinary/media: staging account/folder and synthetic objects only.
- Push: test-device tokens and non-sensitive notification bodies.

Provider test records are governed by
[07-payment-provider-sandbox-matrix.md](./07-payment-provider-sandbox-matrix.md).

## Cleanup and retention

Cleanup requires a separate staging-only target confirmation and named owner.
Revoke test sessions and provider artifacts, then delete or reset synthetic
accounts, databases, Redis keys, rooms, media and callbacks under the approved
staging procedure. Preserve only the minimum redacted evidence required by the
approved QA retention schedule.

Do not delete evidence under legal/security hold, use production retention
periods by assumption, or claim vendor deletion without vendor-side proof.
`OWNER ACTION`, `LEGAL ACTION` and `PRIVACY ACTION` must approve the evidence
retention and disposal schedule.
