# Payment reconciliation runbook

This runbook is intentionally fail-closed. It provides read-only visibility for
Razorpay booking payments; it does not approve refunds, cancel bookings, mark
payments paid, or resolve review records.

## Launch gate

Keep `BOOKING_PAYMENTS_ENABLED=false` until all of the following are complete:

- the payment reconciliation migrations have been reviewed and run through the
  approved production migration workflow;
- a valid `PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS` has been selected;
- current and, only during a planned rotation, previous webhook secrets are
  configured and provider delivery is verified;
- a named payment-reconciliation owner and escalation path exist;
- read-only reconciliation reporting and alerts are operational;
- refund, cancellation, late-capture, and manual-resolution rules are approved.

`SUBSCRIPTION_PAYMENTS_ENABLED` remains unsupported and must stay disabled.

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

## Triage

1. Preserve the report output in the approved restricted incident location.
2. Correlate the opaque booking, attempt, order, payment, and webhook IDs with
   provider evidence using approved finance access.
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
  cancellation eligibility, and refund windows.
- **FINANCE ACTION:** define evidence and dual-control requirements for refunds,
  write-offs, and payment/booking corrections.
- **SECURITY ACTION:** approve webhook-secret rotation, verify both-secret overlap,
  and set the deadline for removing the previous secret.
- **INFRASTRUCTURE ACTION:** provision a least-privilege read-only MongoDB
  credential; schedule the report; route alerts to an approved destination; run
  migrations using the guarded deployment workflow; and verify webhook delivery
  without exposing payloads or secrets.

Until those actions are complete, the repository is ready for continued test
and staging validation, but the booking payment gate must remain off.
