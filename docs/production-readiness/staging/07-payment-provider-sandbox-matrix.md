# Payment and provider sandbox matrix

Runtime candidate SHA: `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Initial state: **not run**

## Provider boundary

Use Razorpay/RazorpayX test mode and synthetic accounts only. Never use live
credentials, a real payment instrument, real beneficiary, production webhook,
production redirect or live settlement. Confirm provider mode and callback
domain independently before each group. Frontend redirects are never the
source of truth.

Before checkout cases, prove `CHECKOUT_RETURN_URL` is exactly
`https://${APP_DOMAIN}/checkout/return` and the mobile preview
`EXPO_PUBLIC_CHECKOUT_RETURN_URL` has the same value. Any fallback, different
host, port, query, fragment or credential component is P0 no-go.

`OWNER ACTION` must supply approved refund, cancellation, rescheduling,
free/promotional booking, payout and manual-review rules. `VENDOR ACTION` must
approve sandbox accounts, callback ownership and evidence access. Cases whose
expected product outcome depends on an unapproved rule are `BLOCKED`, not
invented.

## Razorpay order and payment-webhook matrix

| Test ID | Prerequisite | Action / event | Required validation and state | Idempotency / reconciliation | Audit / monitoring evidence | Severity | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `PAY-ORD-001` | Eligible booking/catalog | Create order with no client amount override | Server resolves service, amount, currency, receipt/internal reference and booking; provider order bound once | Repeated request does not create conflicting payable orders | Safe order/booking IDs; no key/secret | P0 | NOT RUN |
| `PAY-ORD-002` | Eligible booking | Submit negative/zero/altered amount, currency, booking, owner, counsellor or forged promotion | Authoritative fields rejected/ignored; no undocumented free path | No order or invalid state survives | Tamper denial; payment gap recorded | P0 | NOT RUN |
| `PAY-WEB-001` | Test captured payment | Deliver correctly signed webhook | Signature, stored order, payment association, booking, receipt, amount, currency and captured/success state all pass | Booking/payment confirms exactly once | Reconciliation audit; no terminal alert | P0 | NOT RUN |
| `PAY-WEB-002` | Valid payload | Change signature or sign with unrelated/expired secret outside approved overlap | Rejected before any state transition | Retry remains rejected; no dedupe poisoning | Signature denial without payload/secret | P0 | NOT RUN |
| `PAY-WEB-003` | Valid processed event | Deliver exact event repeatedly and concurrently | Same accepted response semantics; no duplicate confirmation, earning, refund or notification | One event/reconciliation record and transition | Duplicate metadata and stable state | P0 | NOT RUN |
| `PAY-WEB-004` | Valid delayed event | Deliver after redirect/session expiry and after unrelated reads | Server reconciles from provider-bound state, not browser session | One transition; delay metadata safe | Delayed-event audit | P0 | NOT RUN |
| `PAY-WEB-005` | Correct order | Change expected amount | Rejected/quarantined; booking stays unpaid/pending review | Reconciliation report identifies mismatch once | `PaymentWebhookReconciliationBlocked` where terminal | P0 | NOT RUN |
| `PAY-WEB-006` | Correct order | Change currency | Rejected/quarantined; no paid booking | Stable mismatch state | Reconciliation audit/alert | P0 | NOT RUN |
| `PAY-WEB-007` | Two test orders | Pair payment with wrong stored order | Relationship mismatch rejected | Neither booking incorrectly advances | Safe mismatch metadata | P0 | NOT RUN |
| `PAY-WEB-008` | Two bookings | Pair valid order/payment with wrong booking or receipt/reference | Relationship mismatch rejected | No cross-booking transition | Safe mismatch metadata | P0 | NOT RUN |
| `PAY-WEB-009` | Order with another payment ID | Substitute payment association | Rejected; provider lookup cannot rebind another payment | No duplicate/rebound record | Safe mismatch audit | P0 | NOT RUN |
| `PAY-WEB-010` | Failed payment event | Deliver correctly signed failed status | Does not confirm booking; approved failure state only | Repeated failure cannot regress later terminal state | Failure event; general provider metric gap | P0 | NOT RUN |
| `PAY-WEB-011` | Authorized but not captured payment | Deliver non-captured event | Does not confirm where capture is required | Later valid captured event reconciles once | State/status evidence | P0 | NOT RUN |
| `PAY-WEB-012` | Test checkout | Redirect success before webhook | UI stays pending/queries server; redirect cannot confirm | Later webhook confirms once | Redirect/API timeline | P0 | NOT RUN |
| `PAY-WEB-013` | Test checkout | Webhook before redirect | Server confirms; later redirect only displays server state | No second transition | Webhook/redirect timeline | P0 | NOT RUN |
| `PAY-WEB-014` | Current and previous test secrets under approved rotation | Deliver events signed by current, approved previous and unrelated secrets | Current and temporary previous accepted only as configured; unrelated rejected | Event dedupe crosses secret rotation | Rotation evidence without secret | P1 | NOT RUN |
| `PAY-WEB-015` | Retry-limit fixture | Force recoverable processing failures to bound, then repair dependency/reconcile | Retry states are explicit; terminal block requires operator reconciliation | Reconciliation tool resolves once without replay side effects | Block alert firing/resolved | P0 | NOT RUN |

## Refund matrix

| Test ID | Prerequisite | Action / event | Required state invariant | Audit / evidence | Severity | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `PAY-REF-001` | Captured payment eligible under approved policy | Authorized refund request and sandbox provider completion | Refund amount does not exceed eligible captured amount; booking/payment/refund states are consistent | Request, approval/provider IDs and completion with safe metadata | P0 | NOT RUN |
| `PAY-REF-002` | Completed/pending refund | Repeat same request and provider event concurrently | One refund maximum for the idempotency key/provider refund; no duplicate credit/state | Concurrency and final invariant | P0 | NOT RUN |
| `PAY-REF-003` | Captured payment | Request negative, zero, excess, unsupported-currency or unrelated-payment refund | Rejected before provider call | Denial and zero provider operations | P0 | NOT RUN |
| `PAY-REF-004` | Cancelled/refunded/terminal variants | Attempt impossible transitions or late conflicting payment event | State machine refuses regression and preserves reconciliation case | Transition-denial/reconciliation evidence | P0 | NOT RUN |
| `PAY-REF-005` | Policy boundary fixtures | Exercise allowed/denied window and manual review | Outcome exactly matches approved owner policy; otherwise BLOCKED | Policy version/decision evidence | P0 | NOT RUN |

## RazorpayX payout matrix

| Test ID | Prerequisite | Action / event | Required state invariant | Audit / monitoring evidence | Severity | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `PAY-PAYOUT-001` | Payout gate disabled | Attempt initiation through UI/direct API | Fails closed; webhook ingestion may remain available for delayed events | Permission/gate denial | P0 | NOT RUN |
| `PAY-PAYOUT-002` | Eligible synthetic earning; sandbox enabled | One admin attempts full approval/initiation | Cannot self-complete two-admin workflow | Approval attempt audit | P0 | NOT RUN |
| `PAY-PAYOUT-003` | Two distinct full admins | First approval, second approval with fresh MFA, initiate within approved cap | Exactly two distinct approvals and fresh MFA before provider call | `payout_action` audit and provider test ID | P0 | NOT RUN |
| `PAY-PAYOUT-004` | Eligible payout | Expired/replayed MFA, same admin twice, stale permission or non-finance role | Every bypass denied; no provider call | MFA/permission denial signals | P0 | NOT RUN |
| `PAY-PAYOUT-005` | Cap boundary fixtures | Submit at boundary and above approved cap | Boundary behavior matches configuration; above-cap denied | Cap decision without beneficiary details | P0 | NOT RUN |
| `PAY-PAYOUT-006` | Valid payout webhook | Signed success/failure/reversed/queued event | Signature and payout/account/amount/state relationship validated | One legal transition per provider event | P0 | NOT RUN |
| `PAY-PAYOUT-007` | Processed webhook | Replay exact event and concurrent duplicate | No duplicate earning deduction, payout or state change | Idempotency evidence | P0 | NOT RUN |
| `PAY-PAYOUT-008` | Mismatch fixtures | Wrong payout/fund account/amount/status or invalid signature | Rejected/quarantined; no unsafe transition | Reconciliation case and alert/action evidence | P0 | NOT RUN |
| `PAY-PAYOUT-009` | Out-of-order/delayed sequence | Deliver failure/success/reversal in adversarial order | State machine applies only permitted monotonic/reconciled transition | Timeline and final provider comparison | P0 | NOT RUN |
| `PAY-PAYOUT-010` | Failed/unknown provider request | Timeout before response then reconcile | Do not blindly retry initiation; query/reconcile provider state first | Payout reconciliation report and operator decision | P0 | NOT RUN |
| `PAY-PAYOUT-011` | Existing bank details | Attempt bank change without approved verification; use stale payout approval | Change and stale approval are blocked; new verification/approval required | `BankDetailsChanged` only for authorized change; denials | P0 | NOT RUN |

## Read-only reconciliation evidence

After webhook/refund/payout groups, run the candidate reports against staging
using the protected staging environment. Confirm from source review that the
commands are read-only before execution.

```bash
# STAGING-ONLY; approved isolated staging host and synthetic data.
cd /srv/menorah-staging/repository/menorah/backend
npm run report:payment-reconciliation
npm run report:payout-reconciliation
```

Store redacted output outside Git. A zero-exit report is not a pass unless
provider-side test records and internal final states agree.

## Other provider sandbox matrix

| Provider / feature | Required staging mode and cases | Required evidence | Action / status |
| --- | --- | --- | --- |
| Resend/email | Staging sender and every synthetic account/OTP/reset/booking/notification recipient use exact `MENORAH_STAGING_EMAIL_DOMAIN`; reserved off-domain negative cases fail before dispatch; verify delivery, bounce, retry, redaction and link domains | Account mode, zero provider calls for rejected domains, accepted/delivered/bounce records for staging-domain recipients, no real recipient | `VENDOR ACTION`; email outcome monitoring gap remains |
| LiveKit | Dedicated staging project/server; token, assigned participant, early/late, replay, reconnect and restrictive-network cases; recording off | Project identity, room logs, media/device matrix, deletion/retention | `VENDOR ACTION`; `CLINICAL ACTION` for care suitability |
| UAE/regional call fallback | Staging-only provider link/room; region detection, disclosure, authorization, failure and continuity | Approved representation and regional cases | `OWNER ACTION`; `LEGAL ACTION`; `CLINICAL ACTION`; `VENDOR ACTION` |
| Luxand/face check | Disabled unless sandbox, approved notice/consent, synthetic media, minimization, error, timeout and deletion cases exist | Contract/location/subprocessor, sandbox mode, consent/deletion evidence | `VENDOR ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION` |
| Cloudinary | Dedicated staging account/folder; upload/read/delete, authorization, callback and exit cleanup | Account/folder identity and deletion evidence | `VENDOR ACTION`; otherwise local staging media |
| Cloudflare Tunnel | Dedicated staging route set; expected-host validator, TLS, access and fail-closed missing-route cases | Redacted route export and external probes | `INFRASTRUCTURE ACTION`; `VENDOR ACTION` |
| Apple/Google identity | Sandbox/test application identifiers and callback/deep-link authorization | Account/app identity and test login evidence | `APPLE ACTION`; `GOOGLE ACTION`; `VENDOR ACTION` |
| Push notifications | Preview/internal builds and test devices; token lifecycle, logout cleanup and content redaction | Provider/build identity and device captures | `APPLE ACTION`; `GOOGLE ACTION`; `PRIVACY ACTION` |
| Optional AI or other provider | Disabled by default; enable only with documented purpose, data fields, sandbox behavior, retention, incident and exit tests | Complete vendor pack | `VENDOR ACTION`; `LEGAL ACTION`; `PRIVACY ACTION` |

For every enabled provider, complete the
[external vendor action plan](../14-external-vendor-action-plan.md) and
[service/vendor register](../23-service-and-vendor-register.md). Optional
providers remain disabled when evidence is incomplete.

## Completion gate

Payment/provider staging is **NO-GO** if any P0 case fails or is skipped, test
and live mode cannot be distinguished, callback ownership is uncertain,
reconciliation disagrees with provider state, an owner policy is missing, or
provider evidence contains real customer/payment data.
