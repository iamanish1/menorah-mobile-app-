# Staging functional QA

Runtime candidate SHA: `3fb99858c6766a341bb7b7dab2377195427f0ea1`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Initial state: **not run**

Use the aliases and fixtures in
[04-staging-data-and-test-accounts.md](./04-staging-data-and-test-accounts.md).
All actions target staging domains and sandbox providers. For each case record
the exact build/SHA, UTC time, actor alias, request/correlation ID, actual
result, defect, retest and evidence ID. Never record a bearer token, cookie,
OTP, contact value, clinical narrative or payment credential.

## Execution protocol

1. Confirm candidate identity and fixture version.
2. Capture the UI result and the relevant API status/schema without sensitive
   fields.
3. Use an approved read-only QA database check to confirm state and uniqueness;
   do not edit the result directly.
4. Confirm the expected durable audit/security event using a correlation ID.
5. Confirm the expected metric/alert effect. If no metric exists, record the
   monitoring gap; do not call it a pass.
6. Mark exactly one of `PASS`, `FAIL`, `SKIPPED` or `BLOCKED`. P0 cases cannot
   be accepted as skipped.

`API/UI` below states the observable outcome; `DB` states the invariant;
`Audit` and `Monitor` state the required evidence. “No metric” is an explicit
gap to track in [09-monitoring-alert-validation.md](./09-monitoring-alert-validation.md).

## Functional test matrix

| Test ID | Prerequisite | Actor | Steps | API / UI expected | DB check | Audit expected | Monitor expected | Evidence | Pass / fail | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FUN-REG-001` | Clean email/phone sink on exact staging email domain; published test notices | New synthetic adult | Register, accept required versions, verify through sink, sign in | Validation is consistent; account is inactive until required verification; UI shows no unsupported promise | One account; normalized unique identifiers; exact consent version/source/time | Registration, verification and consent records with safe identifiers | No secret/PII labels; auth failure metric unaffected | TBD | NOT RUN | P0 |
| `FUN-REG-002` | `USER-UNVERIFIED` | Unverified user | Attempt protected profile, booking, chat and call actions before verification | Every protected action is denied consistently; no partial object created | No booking/session authority granted | Safe denial events correlated | Authorization-denial signal present where designed | TBD | NOT RUN | P1 |
| `FUN-AUTH-001` | `USER-A` | User | Sign in, use protected route, logout, replay old access/refresh material | Login succeeds; logout revokes; replay fails; UI clears authenticated state | Session/revocation state consistent | Login and logout/revocation events | Auth failures bounded; no sensitive labels | TBD | NOT RUN | P0 |
| `FUN-AUTH-002` | `USER-A` on two sessions | User | Change password on one device; retry both old sessions; sign in with new password | Password policy matches registration; old authority is revoked according to approved policy | Password version and session revocations atomic | Password-change and revocation events | Unexpected authentication failures visible | TBD | NOT RUN | P0 |
| `FUN-AUTH-003` | Two active `USER-A` devices | User | Refresh concurrently; replay consumed refresh; run logout-all | Rotation/replay behavior matches config; logout-all revokes every device | At most intended successor token/session; all sessions revoked after logout-all | Refresh-replay and logout-all events | Auth anomaly signal if supported | TBD | NOT RUN | P0 |
| `FUN-AUTH-004` | Suspended/deleted aliases with existing sessions | Suspended/deleted user | Reuse UI, API, WebSocket and call access after state change | All authority is denied and clients transition safely | Status remains terminal; no new privileged object/event | Suspension/deletion denials | Authorization-denial signal | TBD | NOT RUN | P0 |
| `FUN-AUTH-005` | Approved staging-domain email and social sandbox, if enabled | User | Password reset request/consume/replay; exercise enabled social login and account-link collision | Reset token is one-time/expiring; responses do not enumerate; identity links cannot steal an account | One intended identity/session; consumed token unusable | Reset/link success and denial events | Auth failure signal; email outcome gap recorded | TBD | NOT RUN | P1 |
| `FUN-EMAIL-001` | Every synthetic alias has exact `MENORAH_STAGING_EMAIL_DOMAIN`; approved provider sink | Users, counsellors and admins | Trigger registration OTP/verification, password reset, booking and all enabled notification email paths | Every provider request uses the protected staging sender and a recipient on the exact staging domain; expected deliveries arrive only in the staging sink | Delivery state/idempotency remains correct; no duplicate job or message | Safe dispatch/result events without recipient, subject, token or content | Provider outcome gap and worker health recorded honestly | TBD | NOT RUN | P0 |
| `FUN-EMAIL-002` | QA-owned reserved non-staging-domain addresses; provider-call spy or sandbox request inventory | Adversarial synthetic actors/operator | Attempt every backend email path with an external-domain account or substituted recipient, including job retries | Every path fails closed before provider dispatch; no external/live address is contacted and no fallback/catch-all is used | No sent/delivered state, retry loop or account-domain bypass | Domain-boundary denial without logging the address/content | No provider request; denial signal or explicit telemetry gap | TBD | NOT RUN | P0 |
| `FUN-CONSENT-001` | Approved test notice versions | `USER-A` | View notice, consent, withdraw, then attempt consent-dependent processing | Exact version shown/stored; withdrawal status visible; blocked processing fails safely | Append-only consent/withdrawal record with source/time | Consent and withdrawal audit | Audit-sink metrics healthy | TBD | NOT RUN | P0 |
| `FUN-PROFILE-001` | `USER-A`, `USER-B` | Users A/B | Create/update own profile; attempt object-ID and file substitution across users | Own permitted fields work; cross-user read/write/file access denied | Only owner record changes; no mass-assignment of role/status/owner | Safe success and object-denial events | Authorization-denial signal | TBD | NOT RUN | P0 |
| `FUN-KYC-001` | `COUNSELLOR-DRAFT`; approved synthetic evidence | Counsellor | Create account, accept onboarding consent, submit evidence | Submission moves to review only; self-declared fields never activate approval | Consent version/source/time and evidence metadata present; no reviewer yet | Submission/evidence event | Audit-sink health | TBD | NOT RUN | P0 |
| `FUN-KYC-002` | Review fixture; full admin reviewer | `ADMIN-FULL-1` | Exercise valid and invalid draft/submitted/review/approve/reject transitions; omit each required field in turn | Only authorized valid transition succeeds; missing consent/evidence/reviewer fails | One legal transition; reviewer/time recorded on approval | Transition and permission-denial events | Privileged-action/admin-change signals | TBD | NOT RUN | P0 |
| `FUN-KYC-003` | Approved, expired, suspended, rejected aliases | Counsellor/admin | Attempt booking acceptance and protected access before/after expiry/suspension; perform approved re-review path | Only currently approved counsellor can act; stale session loses authority | State and review history retained; no silent reactivation | Expiry/suspension/review events and denials | Auth/authorization signals | TBD | NOT RUN | P0 |
| `FUN-BOOK-001` | Active catalog; `USER-A` | User | Load catalog; create each supported service booking without client amount override | UI/API price and currency come from server catalog | Booking/order amount, currency and catalog revision match server source | Booking creation metadata | Payment metrics gap noted if no signal | TBD | NOT RUN | P0 |
| `FUN-BOOK-002` | Catalog fixture | User/adversarial client | Submit negative, zero, altered/high amount, unsupported currency, changed owner/status/counsellor | All client-controlled authoritative-field attempts rejected or ignored; no free bypass | No invalid booking/order/state; stored values are server-authoritative | Tamper/validation denial without payload leakage | Denial observable; missing specific metric recorded | TBD | NOT RUN | P0 |
| `FUN-BOOK-003` | Approved synthetic entitlement if policy exists | User | Submit forged free/discount codes; use one valid server-side entitlement twice | Forgery denied; valid entitlement follows approved limits and is idempotent | Entitlement consumption atomic; amount/state valid | Entitlement use/denial event | Payment gap recorded | TBD | NOT RUN | P0 |
| `FUN-BOOK-004` | Paid/authorized unassigned fixture | `COUNSELLOR-A` | List and open marketplace preview; inspect UI/API serialization | Only bounded decision fields appear; no identity, email, phone, emergency, detailed symptoms, notes, goals or clinical detail | No assignment/read side effect | Preview access/denial as designed | No sensitive labels/logs | TBD | NOT RUN | P0 |
| `FUN-BOOK-005` | One eligible unassigned booking | `COUNSELLOR-A` and `COUNSELLOR-B` | Synchronize two acceptance requests; repeat winning request | Exactly one succeeds; loser receives safe conflict; repeat is idempotent | One assignee and one transition; no duplicate earnings/session | Both attempts correlated | Conflict/authorization evidence without PII | TBD | NOT RUN | P0 |
| `FUN-BOOK-006` | Unpaid, cancelled, refunded, expired, terminal fixtures | Approved and ineligible counsellors | Attempt preview/accept for every state and with unverified/suspended counsellor | Every invalid combination denied; no state leaks sensitive details | No assignee or downstream object created | State/eligibility denials | Authorization signal where designed | TBD | NOT RUN | P0 |
| `FUN-BOOK-007` | Successfully assigned booking | Winning counsellor, other counsellor, user | Read booking after assignment; attempt owner/counsellor/status/amount mutation | Assigned parties receive only permitted fields; other counsellor denied; client cannot mutate authority fields | Assignment and permitted transitions only | Read/mutation denial evidence | Authorization signal | TBD | NOT RUN | P0 |
| `FUN-BOOK-008` | Approved cancellation policy; paid and unpaid fixtures | User, counsellor and authorized admin | Cancel at each approved boundary; repeat and race cancellation against acceptance/payment/call start | Only the approved actor/window/reason succeeds; duplicate is idempotent; UI states the actual refund/review outcome without inventing it | One legal cancellation transition; assignment, session and payment references remain consistent | Cancellation request/decision/denial and actor evidence | Booking/payment provider outcome gaps recorded | TBD | NOT RUN | P0 |
| `FUN-BOOK-009` | Cancelled, refunded, completed, expired and payout-linked fixtures | All actors | Attempt cancel from every terminal/impossible state and with stale role/session | Every impossible or unauthorized transition fails; no refund/payout duplication or state regression | Booking/payment/refund/payout invariants unchanged | State/permission denials | Authorization/reconciliation signal where implemented | TBD | NOT RUN | P0 |
| `FUN-BOOK-010` | Approved rescheduling policy; paid assigned booking; two available slots | User, assigned counsellor and authorized admin | Reschedule through each permitted actor/path; verify participant notification and old/new call window | Only approved actor/window succeeds; old time/ticket becomes invalid; payment entitlement is preserved or reviewed exactly as policy states | One atomic slot/booking transition; no duplicate booking, charge, refund or call authority | Reschedule request/decision and old-ticket denial | Call/notification/provider gaps recorded | TBD | NOT RUN | P0 |
| `FUN-BOOK-011` | Conflicting/unavailable/past slots and concurrent requests | User/counsellor/adversarial clients | Race two reschedules; submit unsupported duration/counsellor/price/status and terminal booking states | At most one valid slot wins; tampering and unavailable/terminal cases fail safely | Unique slot/invariant holds; server retains authoritative price, counsellor and ownership | Conflict/tamper/authorization evidence | Conflict and call-denial evidence where implemented | TBD | NOT RUN | P0 |
| `FUN-PAY-001` | Razorpay test mode; eligible booking | `USER-A` | Create order, complete sandbox captured payment, deliver webhook/redirect in both orders | UI remains pending until server reconciliation; valid webhook confirms once | Booking/order/payment/receipt associations and amount/currency exact | Payment reconciliation event with safe IDs | Reconciliation-block alert remains clear | TBD | NOT RUN | P0 |
| `FUN-PAY-002` | Approved refund policy and sandbox captured payment | User/finance admin | Request allowed refund; repeat; attempt over-limit/ineligible refund | Approved transition succeeds once; duplicate and invalid cases fail without impossible state | Refund amount/state and booking/payment relationships consistent | Refund decisions/denials | Provider-failure metric gap recorded | TBD | NOT RUN | P0 |
| `FUN-PAY-003` | Valid captured sandbox payment; expired browser session/redirect; signed delayed event | Razorpay sandbox webhook driver; `USER-A` | Execute `PAY-WEB-004`, `PAY-WEB-012` and `PAY-WEB-013`: delay the webhook beyond browser/session expiry and exercise redirect-before-webhook plus webhook-before-redirect | Signed event reconciles from server/provider state; UI stays pending until server confirmation, then shows one final state; redirect never grants authority | Exactly one payment/booking transition and receipt association; delay does not create a second order, earning or notification | Value-free delayed-event, webhook and redirect timeline with safe IDs | Reconciliation-block rule remains clear on success; missing immediate webhook-failure signal is recorded | TBD — controlled `PAY-WEB-004/012/013` timeline | NOT RUN | P0 |
| `FUN-PAY-004` | Previously processed valid payment event and concurrent-delivery harness | Razorpay sandbox webhook driver; QA adversarial operator | Execute `PAY-WEB-003`: replay the exact event sequentially and concurrently after success | API returns stable idempotent semantics; UI shows one payment/booking result without duplicate notification | One provider event/reconciliation record and one legal booking/payment/earning transition maximum | Duplicate/replay decisions correlated to the original safe event ID | No payout/payment action alert; duplicate-specific telemetry or its explicit gap is recorded | TBD — controlled `PAY-WEB-003` replay record | NOT RUN | P0 |
| `FUN-PAY-005` | Valid order/payment with a controlled expected-amount mismatch | Razorpay sandbox webhook driver; QA adversarial operator | Execute `PAY-WEB-005`: deliver a correctly signed event whose amount differs from the server order/catalog | API rejects or quarantines; UI remains unpaid/pending manual review and never displays confirmed success | Booking does not become paid; stored order/payment/receipt amount remains authoritative; one reconciliation case exists | Value-free amount-mismatch/reconciliation event with safe IDs | `PaymentWebhookReconciliationBlocked` fires for terminal block and later resolves only after reviewed reconciliation | TBD — controlled `PAY-WEB-005` mismatch and alert record | NOT RUN | P0 |
| `FUN-PAY-006` | Valid order/payment with a controlled currency mismatch | Razorpay sandbox webhook driver; QA adversarial operator | Execute `PAY-WEB-006`: deliver a correctly signed event in a currency different from the stored server order | API rejects or quarantines; UI remains unpaid/pending review with no currency substitution | No paid transition; stored catalog/order currency remains unchanged; one reconciliation case exists | Value-free currency-mismatch/reconciliation event | Reconciliation-block firing/resolved evidence or an explicit implementation gap | TBD — controlled `PAY-WEB-006` mismatch record | NOT RUN | P0 |
| `FUN-PAY-007` | Two synthetic bookings, orders, receipts and payment IDs | Razorpay sandbox webhook driver; QA adversarial operator | Execute `PAY-WEB-007`–`PAY-WEB-009`: cross-pair payment/order, booking/receipt and payment association while preserving a valid signature | Every relationship mismatch is rejected/quarantined; neither UI exposes or confirms the other booking | No cross-booking transition, rebound payment, duplicate earning or corrupted receipt; each original relationship remains intact | Safe relationship-mismatch events with no payload, receipt value or provider secret | Reconciliation-block evidence for terminal cases; general provider metric gap remains explicit | TBD — controlled `PAY-WEB-007`–`009` relationship matrix | NOT RUN | P0 |
| `FUN-PAY-008` | Captured sandbox payment eligible under approved refund policy | `USER-A`; `ADMIN-FINANCE`; Razorpay sandbox | Execute `PAY-REF-001` and policy boundary `PAY-REF-005`: request, authorize and complete one allowed refund | API/UI expose the approved pending/final state and exact eligible amount/currency without claiming completion before provider confirmation | One refund linked to the exact booking/payment; amount never exceeds captured eligibility; booking/payment/refund states remain consistent | Request, approval and completion events with safe internal/provider IDs | Provider-failure telemetry gap is explicit; no reconciliation alert remains after confirmed completion | TBD — controlled `PAY-REF-001/005` policy and completion record | NOT RUN | P0 |
| `FUN-PAY-009` | Pending/completed refund with captured original request/event | `USER-A`; `ADMIN-FINANCE`; Razorpay sandbox webhook driver | Execute `PAY-REF-002`–`PAY-REF-004`: repeat/concurrently replay the request/event and try excess, unrelated and terminal-state refunds | Duplicate is idempotent; invalid request is denied before provider call; UI never shows a second credit or regressed state | One refund maximum per idempotency key/provider refund; no excess, duplicate credit or terminal-state regression | Duplicate/denial/reconciliation events with zero provider operations for preflight rejection | Refund/provider outcome gap and any terminal reconciliation block are recorded separately | TBD — controlled `PAY-REF-002`–`004` replay/denial matrix | NOT RUN | P0 |
| `FUN-PAY-010` | Eligible synthetic earning; RazorpayX sandbox enabled; two distinct approved full admins with fresh MFA | `ADMIN-FULL-1`; `ADMIN-FULL-2`; finance operator | Execute `PAY-PAYOUT-002`–`PAY-PAYOUT-005`: create, self-approve, dual-approve, reuse actor/MFA and exercise the cap boundary | API/UI deny self/same-actor/stale-MFA/over-cap attempts; exactly two distinct current approvals and fresh MFA permit one provider initiation | One payout intent, two distinct approvals and at most one provider request/earning deduction; bank details remain unchanged | Initiation, approval, MFA/cap denials and provider request with safe IDs only | `PayoutActionFailed`, MFA/admin-permission alerts as applicable; missing specific role-change signal remains blocked | TBD — controlled `PAY-PAYOUT-002`–`005` approval pack | NOT RUN | P0 |
| `FUN-PAY-011` | Eligible payout; sandbox timeout/failure/unknown-response fixtures | Finance operator; RazorpayX sandbox fault driver | Execute `PAY-PAYOUT-010`: force timeout before response and explicit provider failure, then query/reconcile before any retry | API/UI show pending review/failure honestly; no blind retry or success claim; operator receives a bounded reconciliation path | One payout intent remains in a legal pending/failed state; no duplicate provider request, payout or earning deduction | Failure/unknown-response and operator reconciliation decisions with safe IDs | `PayoutActionFailed` fires/resolves where implemented; provider-outcome gap is recorded | TBD — controlled `PAY-PAYOUT-010` fault/reconciliation timeline | NOT RUN | P0 |
| `FUN-PAY-012` | Existing sandbox payout and signed success/failure/reversed/queued events | RazorpayX sandbox webhook driver; finance operator | Execute `PAY-PAYOUT-006`–`PAY-PAYOUT-009`: deliver valid, replayed, mismatched, delayed and out-of-order payout events | API rejects invalid relationships/signatures and accepts only legal monotonic transitions; UI displays server-reconciled state | One transition per provider event; no duplicate earning deduction/payout and no terminal-state regression | Signature, replay, mismatch and transition decisions with safe payout/event IDs | `PayoutActionFailed`/reconciliation action evidence; missing generic provider/webhook signals stay explicit | TBD — controlled `PAY-PAYOUT-006`–`009` webhook matrix | NOT RUN | P0 |
| `FUN-PAY-013` | Completed payout webhook matrix and read-only internal/provider reports | `ADMIN-FINANCE`; independent QA reviewer | Run payment/payout reconciliation reports, compare provider-side sandbox records and investigate every nonzero/unknown case without mutation | API/UI final states are accepted only when provider and internal reports agree; unresolved cases remain pending/blocked | Booking/payment/refund/payout/earning ledgers and provider IDs reconcile one-to-one with no impossible state | Report generation, reviewer decision and any manual-review case with safe IDs/checksums | Reconciliation-block and payout-failure alerts are clear or linked to unresolved cases; all missing signals remain blockers | TBD — controlled reconciliation reports and reviewer sign-off | NOT RUN | P0 |
| `FUN-CALL-001` | Paid assigned in-window booking | Assigned user/counsellor | Request tickets, join, replay each ticket, try wrong participant | Assigned parties join once; replay/wrong party denied; recording remains off | One-time ticket consumed atomically; no unauthorized room grant | Call authorization successes/denials | Call-denial signal; provider outcome gap recorded | TBD | NOT RUN | P0 |
| `FUN-CALL-002` | Early, late, cancelled, refunded and reassigned fixtures | All affected actors | Request/join before window, after grace and after each state change | Every ineligible case denied; approved regional fallback is represented accurately | No active ticket/room authority for invalid state | Reason-bounded denial events | Call-denial signal | TBD | NOT RUN | P0 |
| `FUN-CALL-003` | UAE-classified synthetic user; paid assigned in-window booking; owner/legal/clinical/vendor-approved staging fallback provider and external link | Assigned UAE user/counsellor | Prove trusted UAE classification, request the session, inspect the response, attempt LiveKit token/room use, then disable or corrupt the staging fallback fixture | Only the approved external-provider link and honest disclosure are returned; no LiveKit token/room is minted for UAE; recording remains off; disabled/malformed/unapproved fallback fails closed without inventing availability | Booking/participant/time authority remains intact; no unauthorized room, provider session or recording state is created | Safe region-policy/provider-selection success and denial events without link/query or participant data | Region/provider outcome is observable or an explicit call-provider telemetry gap is recorded | TBD | NOT RUN | P0 |
| `FUN-CHAT-001` | Active assigned booking | Assigned and wrong participants | Connect Socket.IO; join room; send/read; attempt guessed room | Authorization occurs at connection and join; wrong party never sees history/event | Message belongs to authorized room; no cross-room data | Connection/join denial evidence | Authorization signal; logs redacted | TBD | NOT RUN | P0 |
| `FUN-CHAT-002` | Connected session | Assigned participant then suspended/cancelled/reassigned | Change state, then send/read/rejoin without reconnect and after reconnect | Authority is revalidated; access ends promptly in every path | No message accepted after authority loss | State-change and room-denial events | Authorization signal | TBD | NOT RUN | P0 |
| `FUN-PRIV-001` | `USER-A`; approved rights process | User/privacy admin | Submit correction, export and deletion requests; attempt cross-user case access | Authenticated requester receives safe status; unauthorized actor denied; no unsupported immediate-deletion claim | Case state/history/identity evidence; payload encrypted | Rights request/admin action/denial events | Audit-sink health | TBD | NOT RUN | P0 |
| `FUN-PRIV-002` | Eligible and legal-hold fixtures | Privacy admin/worker | Run approved retention dry-run/batch; collide deletion with legal hold and protected finance/security records | Held/protected records remain; eligible synthetic records follow approved state machine | Deterministic disposition with reason and no orphaned references | Hold/retention/deletion evidence | Audit-sink and job evidence; no blanket success | TBD | NOT RUN | P0 |
| `FUN-FILE-001` | User/counsellor/admin file/export fixtures | Every role | Open own and foreign signed/unsigned file URLs; enumerate IDs; retry after logout/revocation | Every access is object- and role-authorized; URL expiry/revocation enforced | No ownership/state mutation; access log scoped | File/export success and denial events | Authorization signal without file names/data | TBD | NOT RUN | P0 |
| `FUN-NOTIFY-001` | Test devices and exact-domain staging email sink | User/admin | Trigger booking, payment, rights and security notifications | Content is minimal on lock screen/email subject; deep link reauthorizes; no clinical/payment secret; email recipient remains staging-domain-bound | Notification record contains safe template metadata | Dispatch and deep-link denial events | Email/provider outcome gap explicitly recorded | TBD | NOT RUN | P1 |
| `FUN-ROLE-001` | All admin aliases | Support, finance, content, full admin | Execute the complete route-permission matrix, including direct API calls hidden by UI | Support cannot access finance/clinical; finance cannot access clinical; content cannot access users/payments; full admin follows explicit permissions | Only permitted mutations occur | `admin_permission_denied` and privileged success events | Admin-permission/privileged-action signals | TBD | NOT RUN | P0 |
| `FUN-ROLE-002` | `ADMIN-REVOKED` active session | Owner/full admin then revoked admin | Remove permission; reuse open UI, API token and WebSocket; refresh/relogin | Stale permission loses authority without waiting for token expiry | Authority source shows revocation; no later mutation | Privilege change and subsequent denials | Admin-change/permission-denial signals | TBD | NOT RUN | P0 |
| `FUN-WORKER-001` | Staging worker and synthetic scheduled work | QA/operator | Exercise approved email/notification/article jobs once; restart worker | Jobs respect gates, are idempotent and recover without duplicates | One intended outcome and durable retry state | Worker/job actions with safe IDs | Worker readiness; queue backlog gap recorded | TBD | NOT RUN | P1 |

## Requirement-to-test traceability

| Requirement | Primary tests | Supporting automated command / evidence |
| --- | --- | --- |
| Registration, verification and notice versions | `FUN-REG-001`, `FUN-REG-002`, `FUN-CONSENT-001` | Backend test groups plus auth smoke below |
| Login, reset, refresh, logout and revocation | `FUN-AUTH-001`–`FUN-AUTH-005` | Backend auth/session tests plus auth smoke |
| Outbound email sender/recipient isolation for every pathway | `FUN-EMAIL-001`, `FUN-EMAIL-002`, `SEC-EMAIL-001` | Backend email tests, provider request inventory and protected domain evidence |
| User/object isolation | `FUN-PROFILE-001`, `FUN-FILE-001`, `SEC-OBJ-*` | Backend authorization tests and DAST |
| Counsellor evidence-backed lifecycle | `FUN-KYC-001`–`FUN-KYC-003` | Backend counsellor-verification transition tests |
| Server-authoritative catalog/price/currency | `FUN-BOOK-001`, `FUN-BOOK-002` | Backend pricing/tamper regression tests |
| Explicit free/promotion entitlement only | `FUN-BOOK-003` | Backend entitlement/idempotency tests; `OWNER ACTION` policy |
| Unassigned preview minimization | `FUN-BOOK-004` | Serializer allowlist/privacy tests |
| Paid-state eligibility and atomic acceptance | `FUN-BOOK-005`, `FUN-BOOK-006` | Backend race/state tests |
| Post-assignment authorization | `FUN-BOOK-007` | Backend object/field authorization tests |
| Cancellation state/policy and races | `FUN-BOOK-008`, `FUN-BOOK-009` | Booking/payment state-machine tests; owner policy evidence |
| Rescheduling slot/authority/payment/call invariants | `FUN-BOOK-010`, `FUN-BOOK-011` | Booking race and call-window tests; owner policy evidence |
| Order/webhook/redirect/refund integrity | `FUN-PAY-001`–`FUN-PAY-009`, `PAY-ORD-*`, `PAY-WEB-*`, `PAY-REF-*` | Provider sandbox and reconciliation reports |
| Payout approval, MFA, cap, webhook, failure and reconciliation | `FUN-PAY-010`–`FUN-PAY-013`, `PAY-PAYOUT-*`, `SEC-MFA-001` | Payout/auth tests, provider matrix and sandbox reconciliation |
| Call participant/state/time/ticket controls and explicit UAE fallback | `FUN-CALL-001`–`FUN-CALL-003`, `SEC-CALL-001` | Backend call-policy/video-route tests, approved fallback decision and device cases |
| Chat/WebSocket connection and room authority | `FUN-CHAT-001`, `FUN-CHAT-002`, `SEC-WS-001` | Backend socket tests |
| Privacy requests, holds and retention | `FUN-PRIV-001`, `FUN-PRIV-002`, `SEC-PRIV-001` | Privacy/retention tests plus policy evidence |
| Admin least privilege and stale grants | `FUN-ROLE-001`, `FUN-ROLE-002`, `SEC-ROLE-001` | Backend admin-permission tests |
| Notification/deep-link minimization | `FUN-NOTIFY-001`, `MOB-PUSH-001`, `MOB-LINK-001` | Mobile release-config tests and devices |
| Worker idempotency and gates | `FUN-WORKER-001` | Worker tests; queue-backlog gap remains explicit |
| Recovery, monitoring, mobile and VAPT | `REC-*`, all 69 monitoring rows, `MOB-*`, VAPT scope | Documents `08`–`11` and unified tracker |

Every P0 requirement must have an executed test/evidence record. An automated
test name in this map is not a pass until its final-candidate result is linked
in [the evidence index](./13-evidence-index.md).

## STAGING-ONLY executable API, auth and Playwright smoke

These commands are additive smoke evidence, not substitutes for the functional
matrix. Run only after the deployment preflight and synthetic-account roster
pass. The protected QA file contains references/credentials and must never be
printed or committed.

```bash
set -euo pipefail
umask 077

readonly RUNTIME_SHA='3fb99858c6766a341bb7b7dab2377195427f0ea1'
readonly REPO='/srv/menorah-staging/repository'
readonly STAGING_ENV='/etc/menorah-staging/staging.env'
readonly QA_ENV='/etc/menorah-staging/qa.env'
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
test -r "${STAGING_ENV}" && test -r "${QA_ENV}"

set -a
# shellcheck disable=SC1090
. "${STAGING_ENV}"
# shellcheck disable=SC1090
. "${QA_ENV}"
set +a

test "${QA_TARGET_ENVIRONMENT}" = 'staging'
test "${QA_SYNTHETIC_DATA_CONFIRM}" = 'PROJECT_OWNED_SYNTHETIC_DATA_ONLY'
test -z "${QA_ALLOW_PRODUCTION_SMOKE:-}"
test -z "${QA_PRODUCTION_CHANGE_REFERENCE:-}"

cd "${REPO}/menorah/scripts/qa"
node <<'NODE'
const {
  requireSyntheticEmail,
  validateOptionalSyntheticAdminCredentials,
  validateSmokeTargets,
} = require('./smoke-target-safety');

const exact = {
  QA_API_WEB_URL: `https://${process.env.API_WEB_DOMAIN}`,
  QA_API_IOS_URL: `https://${process.env.API_IOS_DOMAIN}`,
  QA_API_ANDROID_URL: `https://${process.env.API_ANDROID_DOMAIN}`,
  QA_API_ADMIN_URL: `https://${process.env.API_ADMIN_DOMAIN}`,
  QA_API_BASE: `https://${process.env.API_WEB_DOMAIN}/api`,
  QA_WWW_URL: `https://${process.env.WWW_DOMAIN}`,
  QA_APP_URL: `https://${process.env.APP_DOMAIN}`,
  QA_ADMIN_URL: `https://${process.env.ADMIN_DOMAIN}`,
  QA_COUNSELLOR_WEB_URL: `https://${process.env.COUNSELLOR_DOMAIN}`,
};
for (const [name, expected] of Object.entries(exact)) {
  if (process.env[name] !== expected) {
    throw new Error(`${name} does not match the staging runtime domain contract`);
  }
}
validateSmokeTargets(process.env, Object.fromEntries(
  ['QA_API_WEB_URL', 'QA_API_IOS_URL', 'QA_API_ANDROID_URL', 'QA_API_ADMIN_URL']
    .map((name) => [name, process.env[name]])
));
validateSmokeTargets(process.env, { QA_API_BASE: process.env.QA_API_BASE });
validateSmokeTargets(process.env, Object.fromEntries(
  ['QA_WWW_URL', 'QA_APP_URL', 'QA_ADMIN_URL', 'QA_COUNSELLOR_WEB_URL']
    .map((name) => [name, process.env[name]])
));
requireSyntheticEmail(process.env);
validateOptionalSyntheticAdminCredentials(process.env);

const stagingEmailDomain = process.env.MENORAH_STAGING_EMAIL_DOMAIN;
const domainOf = (address) => {
  const value = String(address || '').trim();
  const at = value.lastIndexOf('@');
  return at > 0 ? value.slice(at + 1) : '';
};
for (const name of ['QA_EMAIL', 'QA_ADMIN_EMAIL']) {
  if (process.env[name] &&
      domainOf(process.env[name]) !== stagingEmailDomain) {
    throw new Error(`${name} is not on MENORAH_STAGING_EMAIL_DOMAIN`);
  }
}
NODE

npm ci
npm run test:smoke-safety
npm run test:api
npm run test:web
```

`test:api` reports an admin-login case as `BLOCKED` when the synthetic admin
pair is absent; that is not a pass. Playwright retains traces, screenshots and
video on failure; inspect/redact them before external storage.

Run auth smoke first without an OTP:

```bash
unset QA_OTP
set +e
npm run test:otp
AUTH_FIRST_STATUS=$?
set -e
test "${AUTH_FIRST_STATUS}" -eq 3
```

Exit `3` means OTP verification is explicitly not complete. Retrieve the
short-lived OTP from the approved synthetic inbox, supply it through the
protected shell without echoing it, and rerun:

```bash
read -r -s -p 'Synthetic staging OTP: ' QA_OTP
printf '\n'
export QA_OTP
npm run test:otp
unset QA_OTP
```

Any target-safety failure, non-synthetic account, production hostname, failed
case or unredacted artifact stops the run. No provider live-mode or production
mutation is authorized.

## Cross-browser and accessibility pass

Run critical user, counsellor and admin journeys on the supported browser
matrix. At minimum verify keyboard-only use, focus order/visibility, labels,
error association, zoom/reflow, contrast, reduced motion and screen-reader
announcements. Record automated scanner output and manual results separately;
automation alone is not an accessibility pass.

Run broader supported-browser and accessibility work after the guarded
Playwright smoke above. Any destructive harness must independently reject
production URLs.

## Completion

Summarize counts by functional group, not as one blended number. A defect fix
changes the candidate SHA and triggers the invalidation policy in
[README.md](./README.md#candidate-and-evidence-invalidation).
