# Durable security-audit ledger runbook

## What this repository provides

Security events continue to be emitted as secret-safe structured JSON on stdout.
In addition, each API process queues the same whitelisted event for asynchronous
storage in MongoDB:

- `securityauditevents` is an append-only logical ledger. Each service
  (`api-ios`, `api-android`, `api-web`, or `api-admin`) has a monotonically
  increasing sequence and an HMAC link to its preceding event.
- `securityauditcheckpoints` holds one signed head per service. The event insert
  and checkpoint advance occur in the same majority-written MongoDB
  transaction.
- Event and checkpoint signatures use `AUDIT_LOG_SIGNING_KEY`. The value is
  never stored in either collection and must remain separate from database
  credentials.
- A process restart reads the signed MongoDB checkpoint; it does not restart the
  durable chain from process memory.

The stdout chain is useful secondary evidence but restarts with the process.
The MongoDB ledger and its signed checkpoint are the authoritative durable
chain.

The persistence path is deliberately asynchronous. A transient MongoDB or
transaction failure therefore does not fail a normal customer request. Failed
events remain in a bounded, oldest-first process queue and are retried with
backoff. The default bound is 1,024 events; `SECURITY_AUDIT_PENDING_MAX` may be
set from 128 through 8,192 after capacity review. When that queue is full, new
events cannot be accepted: the process emits a fixed, secret-free diagnostic
and increments an overflow metric. This is an explicit availability/evidence
tradeoff, not a claim of lossless delivery during an unlimited database outage.

## Required rollout actions

Do not enable or claim this ledger in a live environment until all of these
actions have evidence:

1. Back up MongoDB under the approved production backup procedure.
2. Run `npm run migrate` from `menorah/backend` using the approved migration
   identity. Confirm that
   `20260723-security-audit-ledger-indexes.js` is recorded in the migration
   ledger.
3. Confirm these exact indexes:
   - unique `security_audit_event_id_unique_v1`;
   - unique `security_audit_scope_sequence_unique_v1`;
   - `security_audit_scope_timestamp_v1`;
   - unique `security_audit_checkpoint_scope_unique_v1`.
4. Confirm every API service has the same approved
   `AUDIT_LOG_SIGNING_KEY` reference without printing the key.
5. Exercise one non-sensitive test event per service, then perform the
   verification procedure below.
6. Add alerts for sustained pending events and any sink failure increase.

The migration intentionally fails before creating indexes if duplicate
coordinates or incompatible same-name/same-key indexes exist. Do not delete,
rename, or deduplicate audit data ad hoc; investigate under an approved
incident/change plan.

## Metrics and failure response

The existing metrics endpoint includes:

- `menorah_security_audit_sink_pending`;
- `menorah_security_audit_sink_persisted_total`;
- `menorah_security_audit_sink_failures_total`, with only the bounded reasons
  `configuration`, `database_unavailable`, `checkpoint_invalid`,
  `transaction_conflict`, `write_failure`, and `queue_overflow`.

Treat `checkpoint_invalid` and `queue_overflow` as security incidents. For a
checkpoint failure, the writer refuses to overwrite or extend the untrusted
head. Preserve the database, relevant stdout/container logs, and the secret
version identifier; do not rotate the signing key or edit the collections
before evidence capture. For database unavailability, restore MongoDB service
and confirm the pending gauge drains to zero. A process restart while events
remain only in the pending queue can lose those not-yet-persisted events, so a
planned restart must wait for a zero pending gauge.
The backend shutdown hook stops accepting requests, makes a bounded audit-drain
attempt before closing MongoDB, and refuses exit code zero if any event remains
pending. An orchestrator restart after that nonzero exit is not evidence that
the missing event was persisted; investigate the sink metrics and durable chain.

Diagnostics never include event payloads, exception messages, connection
strings, or signing material.

Do not rotate `AUDIT_LOG_SIGNING_KEY` as an ordinary secret replacement. The
current checkpoint is signed by that key, so an unplanned replacement correctly
causes `checkpoint_invalid` and stops extension of the chain. Security must
approve and test a signed chain-rollover procedure, including historical-key
custody, before a live key rotation.

## Read-only integrity verification

Run verification only from an approved maintenance environment. Load
`AUDIT_LOG_SIGNING_KEY` through the normal secret injection mechanism; never
paste it into shell history or print it.

For each expected service scope:

1. Read its single document from `securityauditcheckpoints`.
2. Read all matching `securityauditevents` sorted by `sequence: 1`, projecting
   out only MongoDB's `_id`.
3. Pass the events and checkpoint to
   `verifyDurableSecurityAuditChain` exported by
   `src/services/securityAuditSink.js`, with the expected scope.
4. Require `valid: true`, the expected scope, a sequence equal to the
   checkpoint sequence, and a head equal to `headIntegrityHash`.

Any missing checkpoint, sequence gap, reorder, modified event, cross-service
entry, checkpoint rewind, or signature mismatch returns a non-valid result.
Do not “repair” a failed chain. Capture the read-only query results and follow
the security-incident process.

After deployment, test the outage path in a non-production environment:

1. make the database temporarily unavailable;
2. generate a non-sensitive auditable request;
3. confirm the request behavior is unchanged and the pending/failure metrics
   increase;
4. restore the database;
5. confirm pending returns to zero; and
6. verify the full chain again.

## Retention and access decisions

**OWNER ACTION / LEGAL ACTION:** approve the audit-record retention period,
legal-hold behavior, archival destination, deletion authority, and data-subject
handling before any pruning or TTL is implemented. This repository deliberately
creates no TTL index and performs no automatic ledger deletion.

**INFRASTRUCTURE ACTION:** restrict direct collection mutation and
deletion to approved break-glass identities, monitor their use, and confirm the
application identity has only the permissions needed to insert events and
advance checkpoints transactionally.

**INFRASTRUCTURE ACTION:** define alert thresholds from measured event
volume and outage recovery time. The repository does not invent those operating
thresholds.
