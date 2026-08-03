# Payment reconciliation runbook

This runbook is intentionally fail-closed. Separate read-only reports provide
visibility for Razorpay booking payments and RazorpayX payout reconciliation.
Neither report approves refunds, cancels bookings, marks money movement
successful, executes payouts, or resolves review records.

## Launch gate

Keep both initiation gates off:

```dotenv
BOOKING_PAYMENTS_ENABLED=false
PAYOUTS_ENABLED=false
SUBSCRIPTION_PAYMENTS_ENABLED=false
```

`BOOKING_PAYMENTS_ENABLED` must stay `false` until all of the following are
complete:

- the payment reconciliation migrations have been reviewed and run through the
  approved production migration workflow;
- a valid `PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS` has been selected;
- current and, only during a planned rotation, previous webhook secrets are
  configured and provider delivery is verified;
- a named payment-reconciliation owner and escalation path exist;
- read-only reconciliation reporting and alerts are operational;
- refund, cancellation, late-capture, and manual-resolution rules are approved.

`PAYOUTS_ENABLED` must stay `false` until dedicated RazorpayX execution
credentials, its settlement account, sandbox payout behavior, dual approval,
fresh MFA, finance review, operational alerts, and escalation procedures have
all been verified. Checkout credentials are not a fallback for RazorpayX
credentials.

`SUBSCRIPTION_PAYMENTS_ENABLED` remains unsupported and must stay disabled.

The application gates initiation, not reconciliation. Delayed, signed provider
events must remain reachable while both initiation gates are off:

| Provider callback | Canonical endpoint | Application profile |
| --- | --- | --- |
| Booking payment | `https://api-web.menorah.me/api/payments/razorpay-webhook` | `api-web` |
| RazorpayX payout | `https://api-admin.menorah.me/api/payouts/webhook` | `api-admin` |

Caddy forwards payment paths to the corresponding application profile. The
application's exact-default-false gate rejects new booking orders and payout
requests/approvals. The payout callback is mounted only on `api-admin`, consumes
the signed raw JSON body before general JSON/CSRF processing, and remains active
when `PAYOUTS_ENABLED=false`.

Each signed payout delivery is claimed by a durable replay ledger using a
SHA-256 digest of the unchanged signed bytes and, when supplied, the provider
event ID. Before a payout status changes, the handler compares the provider
payout ID, amount in paise, `INR` currency, internal reference, fund account,
purpose, counsellor note, event type, and provider status with the stored payout
request. A mismatch is acknowledged into `needs_review` without changing the
payout status. Terminal states win over stale, out-of-order non-terminal events;
a documented `processed` to `reversed` transition remains possible. This follows
the provider's documented payout entity fields and warning that webhook order is
not guaranteed: <https://razorpay.com/docs/webhooks/payouts/>.

Expired `awaiting_approval` payout requests are changed to `expired` in bounded
batches before payout request/list/approval operations. This expiry is not an
approval, payout execution, refund, or finance-policy decision.

## Generate the read-only report

Use an approved MongoDB credential that has read access only to `bookings`,
`paymentattempts`, and `paymentwebhookevents`. Do not use an application
read/write credential for scheduled reporting.

```bash
cd menorah/backend
MONGODB_URI='<READ_ONLY_MONGODB_URI>' npm run report:payment-reconciliation -- --limit=100
```

The JSON report contains only opaque local IDs, provider order/payment IDs,
safe reconciliation codes, states, timestamps, and ages. It intentionally omits
user IDs, contact data, payment payload digests, receipts, notes, and amounts.
Treat the output as restricted operational data because provider identifiers can
still be sensitive.

The report is read-only. A row cap from 1 to 1000 is required; counts in
`summary` are not capped, while the detail arrays may be truncated at the
reported `truncatedAt` value.

Each detail stream has an independent cursor under `pagination`. When
`hasMore` is `true`, pass that stream's `nextAfterId` to the matching flag:

| Report stream | Cursor flag |
| --- | --- |
| `webhookEvents` | `--webhook-events-after-id` |
| `paymentAttempts` | `--payment-attempts-after-id` |
| `quarantinedBookings` | `--quarantined-bookings-after-id` |
| `paidAuthorizationGaps` | `--paid-authorization-gaps-after-id` |

Cursor values must be exactly 24 hexadecimal characters. Use only a
`nextAfterId` returned for the same stream; never substitute a provider ID or
reuse one stream's cursor for another.

For example, preserve the first page and inspect its cursor metadata:

```bash
MONGODB_URI='<READ_ONLY_MONGODB_URI>' npm run --silent report:payment-reconciliation -- \
  --limit=100 > payment-reconciliation-page-1.json

jq '.pagination' payment-reconciliation-page-1.json
```

If the first page reports more webhook events and payment attempts, copy their
non-null `nextAfterId` values into the matching flags for page two:

```bash
MONGODB_URI='<READ_ONLY_MONGODB_URI>' npm run --silent report:payment-reconciliation -- \
  --limit=100 \
  --webhook-events-after-id=64f000000000000000000001 \
  --payment-attempts-after-id=64f000000000000000000002 \
  > payment-reconciliation-page-2.json
```

Streams without a cursor flag start at their first page again. To advance
multiple streams together, supply every non-null cursor whose `hasMore` value
is `true`. Continue until all four streams report `hasMore: false`; a null
`nextAfterId` must not be passed. The summary remains the current uncapped
total on every invocation, while each detail stream advances independently.

`paidAuthorizationGaps` inventories legacy or inconsistent rows whose `paid`
flag does not satisfy the current strict payment/subscription authorization
snapshot. The report never upgrades those rows. A Razorpay row requires
corroborated provider capture and matching server-side evidence; a legacy
subscription row requires historical entitlement evidence and an owner-approved
policy before any authorization can be restored.

### Payout reconciliation report

Use a separate approved MongoDB credential with read access only to `payouts`
and `payoutwebhookevents`:

```bash
cd menorah/backend
MONGODB_URI='<READ_ONLY_MONGODB_URI>' npm run report:payout-reconciliation -- --limit=100
```

The payout report includes safe operational identifiers, payout amount in
paise, states, mismatch codes, timestamps, and ages. It excludes webhook bodies,
payload digests, webhook signatures/event headers, bank-account snapshots,
contact details, notes, and administrator identities. Treat it as restricted
finance/security evidence.

The report deliberately sets `policyThresholdsApplied: false`. It inventories
every non-success or review state without deciding when an in-flight payout is
"late"; the review SLA and alert/manual-review thresholds remain `OWNER ACTION`.
Use `pagination.webhookEvents.nextAfterId` with
`--webhook-events-after-id=<24-hex-id>` and `pagination.payouts.nextAfterId` with
`--payouts-after-id=<24-hex-id>` until both streams report `hasMore: false`.

The ordered migration
`20260723-payout-webhook-reconciliation-indexes.js` creates the unique replay
identities and review-query indexes after read-only duplicate/index preflight.
Run it only through the guarded, approved migration boundary; never from an
application startup or an ad hoc production shell.

## Triage

1. Preserve the report output in the approved restricted incident location.
2. Correlate the opaque booking, attempt, order, payment, and webhook IDs with
   provider evidence using approved finance access. For the payout report,
   correlate the local payout, provider payout, fund-account and internal
   reference without copying bank details into tickets or chat.
3. Verify the provider order, payment, amount, currency, receipt, notes, capture
   state, and local authorization state before proposing any mutation.
4. Escalate identity conflicts, signature failures, or unexpected status changes
   to Security as well as the payment owner.
5. Do not manually update MongoDB or replay a redirect/webhook from this report.
   Use a separately reviewed resolution workflow once product and finance rules
   exist.

`retryable_failure` means the provider or transaction evidence was not stable
enough to finalize. `needs_review` means automatic authorization deliberately
failed closed. A stale provider-bound booking also enters `needs_review`
because Razorpay orders cannot be cancelled by the current integration and may
still receive a late capture; its slot remains blocked until resolution.

## External actions required

- **OWNER ACTION:** appoint the reconciliation owner; approve the review SLA,
  retry/alert thresholds, manual-resolution rules, late-capture handling,
  cancellation eligibility, refund eligibility/windows, payout enablement,
  payout rejection/retry rules, manual-review thresholds, and named approver
  roles. Until these decisions exist, paid or entitled booking cancellations
  fail closed to manual review; the request does not determine cancellation or
  refund eligibility.
- **OWNER ACTION:** define evidence and dual-control requirements for refunds,
  write-offs, payout corrections, and payment/booking corrections.
- **OWNER ACTION:** approve webhook-secret rotation, verify both-secret overlap,
  and set the deadline for removing the previous booking-payment secret.
- **INFRASTRUCTURE ACTION:** provision a least-privilege read-only MongoDB
  credential for each report; schedule the reports; route alerts to an approved
  destination; run migrations using the guarded deployment workflow; and verify
  webhook delivery without exposing payloads or secrets.
- **INFRASTRUCTURE ACTION:** configure the two canonical callback URLs above,
  retain only the required provider events, and verify in staging that an
  unsigned request is rejected while a provider-signed test delivery is
  accepted. Confirm that the payout callback remains available with
  `PAYOUTS_ENABLED=false`, and do not use production credentials for the test.

Until those actions are complete, the repository is ready for continued test
and staging validation, but the booking-payment and payout gates must remain
off.
