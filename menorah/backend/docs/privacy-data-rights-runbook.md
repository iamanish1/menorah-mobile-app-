# Privacy data-rights and retention runbook

Status: repository implementation only. This document does not establish a legal
policy and does not claim compliance with any law or standard.

## Safety boundary

The application now records privacy-notice acceptance and withdrawal as signed,
append-only events. Export, correction, and grievance submissions are durable
review requests. The existing authenticated `DELETE /api/users/account` flow
uses one database transaction to disable the account, revoke sessions, create a
`DataDeletionRequest`, and append a signed `account_deletion_requested`
`PrivacyEvent`. Its existing successful-response security audit remains in
place.

None of those actions promises immediate erasure. Financial, fraud, security,
clinical, contractual, backup, vendor, or legal-hold obligations may require
review or retention. The word `completed` describes completion of the controlled
review workflow; it is not proof that every related record was erased.

Automated export archive generation and download are intentionally not
implemented. An export request must be identity-checked, assembled, reviewed,
and delivered through an independently approved secure channel. The API never
returns a bulk archive or download URL.

## API inventory

Consumer API services (`api-ios`, `api-android`, and `api-web`) expose:

| Method and path | Purpose | Boundary |
| --- | --- | --- |
| `GET /api/privacy/consent` | Read the caller's latest privacy-notice event | Authenticated caller only |
| `POST /api/privacy/consent` | Record acceptance or withdrawal | Current server-configured notice version; caller identity is taken from the token; durable state and signed events advance together using compare-and-set |
| `POST /api/privacy/requests/export` | Create a bounded `account_data` export request | No inline export or arbitrary user ID |
| `POST /api/privacy/requests/correction` | Request correction of allow-listed account fields | Description is encrypted |
| `POST /api/privacy/requests/grievance` | Create a privacy contact/grievance request | Description is encrypted |
| `GET /api/privacy/requests` | List the caller's request metadata | Encrypted payload is excluded |
| `GET /api/privacy/requests/:id` | Read one caller-owned request | Query includes both request ID and authenticated user ID |
| `GET /api/privacy/deletion-requests/current` | Read the caller's deletion-review status | No erasure promise |
| `GET /api/privacy/deletion-requests/:id` | Read one caller-owned deletion request | Query includes both request ID and authenticated user ID |
| `DELETE /api/users/account` | Disable access and initiate deletion review | Password re-check; account, sessions, durable request, and signed privacy event change atomically; a social-only account must first establish a password through the verified-email reset flow |

For rights submissions, a supplied `Idempotency-Key` replays only when the
normalized request type and body match. Reuse for another type or body returns
`PRIVACY_IDEMPOTENCY_KEY_REUSED` instead of returning an unrelated request.
When the caller already has an active correction or grievance, an equivalent
submission returns that request, but a different normalized body is rejected
with `PRIVACY_ACTIVE_REQUEST_CONFLICT` rather than being discarded.

Consent transitions persist both the client idempotency-key fingerprint and a
server-derived transition identity bound to the predecessor event. A same-key
retry can replay only the same currently effective signed transition. Reusing a
key for another operation, replaying an earlier acceptance after withdrawal, or
racing the same transition under a different key is rejected; the consent-state
compare-and-set prevents predecessor forks.

The admin API exposes queues, fresh-MFA payload review, state transitions, and
legal-hold changes under `/api/privacy`. Queue reads require the explicit
`privacy_reader` permission. Payload reads and status transitions require
`privacy_reviewer` plus fresh MFA. Legal-hold changes require
`privacy_legal_hold` plus fresh MFA. An admin role alone grants none of these
permissions. Responses and security audit events exclude review notes, evidence
references, tokens, contact details, and request text.

The environment grant map is the authorization source, not the token, session,
or `User` document. It is resolved on every privacy-admin request, so a removed
administrator is denied even with an already-issued otherwise-valid session and
a newly added administrator does not wait for a database grant write. An invalid
map fails closed with `PRIVACY_PERMISSION_CONFIGURATION_INVALID`. During
`api-admin` startup, after MongoDB connects and before the server listens, every
configured ID is verified as an active admin and any legacy persisted
`privacyPermissions` field is removed. Startup fails if either check cannot be
completed.

All consumer and admin privacy-route responses set `Cache-Control: no-store` and
`Pragma: no-cache`.

## State transitions

Export, correction, and grievance requests:

```text
submitted -> under_review -> action_required -> under_review
                          \-> completed
                          \-> rejected
submitted/action_required -> cancelled
```

Deletion review requests:

```text
pending -> under_review -> completed
        \-> rejected      \-> rejected
```

Deletion and rights transitions, legal-hold changes, and retention disposition
use a workflow-version compare-and-set inside their transaction. The commit
order determines the safe outcome: if a hold commits before disposition's
compare-and-set, disposition can no longer match and retries as protected. If
disposition commits first, the later or racing hold retries and is rejected with
`LEGAL_HOLD_PAYLOAD_ALREADY_DISPOSED`. A hold is never silently recorded against
an already-disposed payload and is not retroactive. Deletion completion also
repeats `legalHold != true`; retention disposition repeats every
due/status/policy/legal-hold predicate. There is no force or bypass parameter.

Admin transitions require a bounded, non-sensitive evidence reference. Put the
actual review record in the approved case-management/evidence system; do not put
health details, contact details, free-form allegations, or credentials in the
reference.

## Data minimization and encryption

- Correction and grievance descriptions are stored only in an AES-256-GCM
  envelope derived from `DATA_ENCRYPTION_KEY`.
- The request ID is authenticated as additional data, so a ciphertext copied to
  another request cannot be decrypted there.
- User-facing serialization excludes ciphertext, reviewer identity, and
  evidence references.
- Security audit calls contain only event name, actor, bounded request ID, and
  workflow resource. They do not contain request bodies.
- Retention disposition removes only the encrypted request payload and keeps the
  minimal state/evidence record.
- Version `v2` privacy audit evidence is separately HMAC-signed with
  `AUDIT_LOG_SIGNING_KEY`. The signature covers the complete operation identity,
  including semantic status/policy fields, idempotency fingerprints, consent
  predecessor and transition identity, and timestamp. Idempotent replays verify
  both the HMAC and expected operation identity before returning a stored result.
- Application middleware rejects document/query updates, replacements, deletes,
  `bulkWrite`, and `insertMany` against privacy events. Database permissions and
  protected off-host audit storage must still enforce operational immutability.

The face-check path was inspected during this change. It sends a transient image
buffer to the configured provider and persists derived check metadata, consent
evidence, and provider request identifiers; it does not persist the raw selfie
in the `User` or `KycVerification` models. No hidden gender-inference code or
face-based alert mechanism was found. Existing counsellor gender matching uses
an explicitly supplied booking preference and account field, not image
inference.

`PRIVACY ACTION`: approve whether derived face-check metadata and provider
request identifiers must be minimized further than the existing approved
face-check retention setting.

`VENDOR ACTION`: obtain and verify the face provider's processing location,
subprocessor list, deletion capability, retention behaviour, incident terms,
and evidence of deletion. Repository inspection cannot prove vendor-side
disposition.

## Required configuration

Production startup fails closed unless all of the following are explicit:

- `PRIVACY_NOTICE_VERSION`: the owner/legal/privacy-approved notice version.
- `PRIVACY_RETENTION_EXECUTION_ENABLED`: exactly `false` or `true`. Keep it
  `false` until the activation checklist is complete.
- `PRIVACY_RETENTION_POLICY_JSON`: a versioned JSON object containing every
  category listed below.
- `PRIVACY_ADMIN_PERMISSION_GRANTS_JSON`: a non-empty JSON array mapping explicit
  active administrator ObjectIds to one or more of `privacy_reader`,
  `privacy_reviewer`, and `privacy_legal_hold`. Across the approved grants all
  three permissions must be covered; do not grant them to every admin by
  default. Permissions are not persisted on administrator records.
- `DATA_ENCRYPTION_KEY`: distinct encryption key already required by production
  API services.
- `AUDIT_LOG_SIGNING_KEY`: distinct signing key already required in production.

Policy shape (replace every angle-bracket token only after approval):

```json
{
  "version": "<APPROVED_POLICY_VERSION>",
  "categories": {
    "account_profile": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "booking_clinical": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "chat_content": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "call_metadata": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "payment_finance": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "security_audit": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "privacy_consent_evidence": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "privacy_rights_request_payload": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "face_check_metadata": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "backups": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "operational_logs": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    },
    "vendor_copies": {
      "mode": "manual",
      "policyReference": "<APPROVED_REFERENCE>"
    }
  }
}
```

Only `privacy_rights_request_payload` currently has an automated handler. To use
it after approval, change that category to `mode: "automated"` and add the
approved integer `retentionDays`. No period is supplied by application defaults.
Other categories fail configuration validation if marked automated because no
tested handler exists.

## Retention decisions still required

The repository deliberately provides no period for these categories:

| Category | Decision and evidence |
| --- | --- |
| Account/profile and authentication data | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`: period/trigger, deletion versus anonymisation, fraud/security exceptions |
| Booking and clinical context | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`: record classes, clinical need, access and disposition |
| Chat content | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`: content/attachment split, moderation evidence, deletion trigger |
| Call metadata | `LEGAL ACTION`, `PRIVACY ACTION`: metadata period; recording remains disabled unless separately approved and implemented |
| Payment, payout, tax, and reconciliation data | `OWNER ACTION`, `LEGAL ACTION`: statutory/contractual periods and finance evidence |
| Security/audit evidence | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`: security and incident evidence period, immutable-store requirements |
| Privacy consent evidence | `LEGAL ACTION`, `PRIVACY ACTION`: evidence period after withdrawal/account closure |
| Privacy request payload | `LEGAL ACTION`, `PRIVACY ACTION`: payload minimization period and response evidence |
| Face-check metadata | The previously owner-approved technical setting is 365 days; `LEGAL ACTION` and `PRIVACY ACTION` must confirm legal sufficiency and disposition scope |
| Backups | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`: rotation, deletion propagation, legal holds, restore implications |
| Operational logs | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `INFRASTRUCTURE ACTION`: per-log period and access |
| Vendor copies | `VENDOR ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`: processor-by-processor retention and deletion evidence |

## Retention activation checklist

Keep `PRIVACY_RETENTION_EXECUTION_ENABLED=false` until every item is evidenced.

1. `LEGAL ACTION`: approve the retention schedule and exception rules.
2. `PRIVACY ACTION`: approve the category inventory, notice version, data-flow
   map, request response procedure, and vendor handling.
3. `OWNER ACTION`: assign the privacy-request queue owner and backup coverage.
4. `INFRASTRUCTURE ACTION`: put approved values in the secret/configuration
   system without committing them.
5. Configure `PRIVACY_ADMIN_PERMISSION_GRANTS_JSON` with only the approved active
   administrator IDs and task-specific permissions. Roll or restart every
   `api-admin` instance with the same map; do not intentionally operate mixed
   permission maps.
6. Apply `20260723-privacy-rights-retention.js`, followed by
   `20260723-privacy-state-authorization.js`, in an isolated staging database,
   then verify the migration ledger, indexes, consent-state backfill, password
   authentication flags, and absence of persisted `privacyPermissions` fields.
   The second migration fails closed if legacy consent evidence cannot be
   verified as version `v2`; use a separately reviewed repair procedure rather
   than re-signing it automatically.
7. Start `api-admin` in staging and prove it does not listen for an invalid,
   missing, inactive, or non-admin grant target. Replace test admin A with B in
   the map and prove A's already-issued session is denied, B's already-issued
   session is allowed, and no persisted grant remains.
8. Submit test export, correction, grievance, withdrawal, and deletion requests
   using non-production test identities.
9. Apply a test legal hold, advance a due test record, and prove disposition is
   blocked.
10. Remove the hold with fresh MFA, rerun the bounded worker, and verify only
   `payloadEncrypted` was removed and a signed event was appended.
11. Run both deterministic race orders: hold-first must protect the payload, and
    disposition-first must make the later/racing hold fail explicitly.
12. Verify audit events reach the protected off-host destination and contain no
   request text.
13. Obtain owner/privacy/legal sign-off before changing the execution flag to
     `true`.

The worker processes at most 25 candidates by default and never more than 100
per run. Runs are sequential and protected from scheduler overlap. A failed item
is reported by request ID and bounded error code only.

## Operational handling

1. Triage `submitted` requests in oldest-first order.
2. Use fresh MFA to open encrypted correction/grievance details.
3. Move the request to `under_review`; use `action_required` only when the
   approved process requires more input.
4. Store detailed evidence in the approved case system and put only its bounded
   reference in Menorah.
5. Before deletion completion or any disposition, check legal holds, payment and
   fraud obligations, clinical records, vendors, backups, and the approved
   category schedule.
6. Complete/reject the workflow only with evidence. User communication must not
   state that all data was erased unless the evidence proves all in-scope primary,
   replica, backup, log, and processor actions under the approved policy.
7. Review retention worker failures and retry only after the cause is understood.

## Verification commands

Run from `menorah/backend`:

```powershell
npm test -- --runInBand src/config/__tests__/privacy.test.js src/config/__tests__/privacyAdminPermissions.test.js src/utils/__tests__/privacyPayloadEncryption.test.js src/services/__tests__/privacyEventService.test.js src/services/__tests__/privacyConsentService.test.js src/services/__tests__/accountDeletionService.test.js src/services/__tests__/privacyRightsWorkflow.test.js src/services/__tests__/privacyRetention.test.js src/services/__tests__/privacyAdminPermissionAuthority.test.js src/services/api-admin/server.test.js src/routes/__tests__/privacyAuthorization.test.js src/routes/__tests__/privacyAdminAuthorization.test.js src/routes/__tests__/cookieSessionAuth.test.js src/routes/__tests__/usersProfileSerialization.test.js src/database/migrations/__tests__/20260723-privacy-rights-retention.test.js src/database/migrations/__tests__/20260723-privacy-state-authorization.test.js src/services/worker/__tests__/worker.test.js src/shared/app/__tests__/startupValidation.test.js src/shared/app/__tests__/routeAuthorizationMatrix.test.js
npm run lint
```

`INFRASTRUCTURE ACTION`: run the migration and hold/race test only against an
isolated, disposable replica-set database before any approved production change.
The gated suites use `PRIVACY_MIGRATION_TEST_URI`,
`PRIVACY_STATE_MIGRATION_TEST_URI`, `PRIVACY_RETENTION_TEST_URI`,
`PRIVACY_DELETION_TEST_URI`, `PRIVACY_CONSENT_TEST_URI`, and
`PRIVACY_RIGHTS_TEST_URI`. The admin grant/session regression uses
`PRIVACY_PERMISSION_AUTHORITY_TEST_URI`. Each rejects a database name that does
not begin with its explicit `menorah_privacy_*_test` prefix. Do not run desktop
tests against production.

## Known limitations and launch blockers

- `LEGAL ACTION` and `PRIVACY ACTION`: the notice text, notice version, rights
  procedure, grievance contact, response timelines, identity checks, and every
  category rule require approval.
- The current endpoints record post-authentication notice acceptance and
  withdrawal. Registration is not gated on this event. `LEGAL ACTION` and
  `PRIVACY ACTION` must decide the appropriate collection point and purpose
  before a client makes acceptance mandatory.
- `OWNER ACTION`: assign queue ownership, escalation, evidence storage, and
  out-of-hours coverage.
- `INFRASTRUCTURE ACTION`: configure protected audit delivery and verify worker
  monitoring/alerts.
- `OWNER ACTION` and `PRIVACY ACTION`: approve the individual administrator
  permission grants. Production validation and `api-admin` startup fail closed
  when the explicit mapping is missing, incomplete, or targets an account that
  is not an active admin; there is no implicit all-admin privacy access.
- `INFRASTRUCTURE ACTION`: approve and test encryption/signing-key rotation.
  The current `v1` request envelope requires the key that created it; do not
  discard or replace that key without a reviewed re-encryption/recovery plan.
- `VENDOR ACTION`: prove processor export/deletion and retention capabilities.
- Secure export assembly and delivery remain a manual reviewed process; there is
  no automated archive.
- Account deletion revokes the user's sessions and disables sign-in immediately.
  The authenticated deletion-status routes therefore do not provide
  post-deactivation tracking. `PRIVACY ACTION` and `OWNER ACTION` must approve a
  secure out-of-band response/status process; no bearer-by-reference status
  token was invented.
- Social-only accounts cannot authenticate deletion against their generated,
  unknown password. They must first complete the existing verified-email
  password-reset flow, which establishes password authentication and revokes
  existing sessions; recent provider reauthentication is not implemented.
- Automatic disposition exists only for encrypted privacy-request payloads. All
  other category modes must stay manual until separately implemented and tested.
- Account-deletion initiation now commits account deactivation, session
  revocation, its durable request, and signed privacy event together. Migrated
  pre-existing requests retain their separate legacy-registration event, and
  admin transitions append their own privacy events. These records evidence
  initiation and workflow changes; none of them alone proves downstream
  deletion.
- The state/authorization migration deliberately refuses to synthesize or
  silently upgrade unverifiable pre-`v2` consent evidence. Any such data requires
  a controlled, owner/privacy-approved repair decision before activation.
