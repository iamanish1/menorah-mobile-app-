# Production data-flow inventory

Last reviewed: 2026-07-23.

## Status and use

This is a repository-derived processing inventory, not an approved record of
processing, legal opinion or proof of actual vendor/location behavior.

**Public-production verdict: NOT READY.**

`LEGAL ACTION`, `PRIVACY ACTION` and `CLINICAL ACTION` must validate the
purposes, lawful basis, notices, fields, recipients, locations, retention,
rights and health/minor safeguards. `INFRASTRUCTURE ACTION` must compare this
inventory to the live environment. Unknown or optional processing must remain
disabled until approved and evidenced.

Data shorthand:

- `P` — identity, contact, account, device or user-generated personal data;
- `H` — counselling, mental-health, clinical, credential or face/biometric
  data;
- `F` — payment, payout, bank and reconciliation data;
- `S` — authentication, authorization, audit, log and security metadata;
- `C` — public/editorial content.

## Subjects and principal stores

Repository-visible subjects include users, prospective and active
counsellors, administrators/workforce, support contacts and vendor
representatives. Minor/guardian processing is not approved and has no complete
operating model.

| Store or recipient | Repository-visible role | Data that may be present | Evidence boundary |
| --- | --- | --- | --- |
| MongoDB | Primary durable application store | P, H, F, S, C | Schema/code is visible; live records, roles, location and retention are not |
| Redis | Session, coordination, rate-limit, Socket.IO and queue state | P, S; payload scope must be sampled | Live ACL, persistence, expiry and minimization are not proved |
| Local managed uploads | Production media/document bytes | P, H, S metadata | Production is configured to require local storage; permissions/capacity/restore are not proved |
| Security audit ledger | Bounded security event fields and integrity links | S and opaque subject/object references | Durable design exists; live completeness, retention and external evidence protection are open |
| Alloy/Loki operational logs | Caddy and Docker operational events | S and possible P if upstream logging is unsafe | Source minimization and local retention are configured; complete live coverage/India 180-day evidence is absent |
| Encrypted recovery sets | Database and managed media plus provenance | P, H, F, S, C inside encryption | Tooling exists; off-site location, key custody and recent live restore are not proved |
| External providers | Service-specific processing | P, H, F, S or C by integration | Account, contract, location, subprocessor, retention and deletion facts require vendor evidence |

## Flow register

| ID | Flow and actors | Data | Repository-visible path and controls | Missing approval or evidence |
| --- | --- | --- | --- | --- |
| DF-01 | Registration, login, password reset, token refresh and logout | P, S | Client -> profile-specific API -> MongoDB/Redis; separate user/admin audiences, password policy, session revocation/rotation controls and bounded security events | Final-SHA tests, live origin/cookie/token settings, email delivery, identity-proof and support procedure |
| DF-02 | Apple/Google social authentication | P, S | Mobile/web -> provider -> audience-specific API verification -> local account/session; configured client audiences are validated | `APPLE ACTION`, `GOOGLE ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION`: account ownership, redirect/audience, data use, revocation and staged tests |
| DF-03 | User profile, concerns, goals and counselling context | P, H | Authenticated client -> permitted API -> MongoDB; object/role authorization and minimized logs are repository requirements | Approved purpose/necessity, field-level inventory, role sampling, retention and clinical record boundary |
| DF-04 | Counsellor onboarding, credentials, review and face check | P, H, S | Counsellor -> API -> evidence metadata/managed media/MongoDB -> authorized admin review; explicit states, versioned consent/policy and reviewer evidence | `CLINICAL ACTION` and `LEGAL ACTION`: qualification sufficiency/renewal; `PRIVACY ACTION`: biometric necessity/retention; Luxand `VENDOR ACTION` if enabled |
| DF-05 | Counsellor discovery and unassigned-booking preview | Limited P/H | User/API -> eligible counsellor views; pre-assignment serializer is intended to exclude identity, contacts, emergency contacts, detailed symptoms and notes | Staging/VAPT serialization tests, clinical minimum-data approval and operational access sampling |
| DF-06 | Booking creation, pricing, payment/entitlement gate and assignment | P, H, F, S | Client inputs -> server service catalog/entitlement decision -> MongoDB; paid/authorized state required and acceptance is atomic | Owner-approved cancellation/reschedule/free-promotion policy, staged concurrency/invariant evidence and final catalog approval |
| DF-07 | Razorpay booking payment and webhook reconciliation | P, F, S | API -> provider order; signed provider callback -> raw-body verification -> durable event/attempt/linkage -> booking state; browser return is not payment truth | `VENDOR ACTION`: test-mode event matrix and callback configuration; `OWNER ACTION`: exception/refund policy and named reconciler |
| DF-08 | Bank-detail change, payout approval and RazorpayX | P, F, S | Counsellor/admin -> encrypted bank fields -> two-person/fresh-MFA approval -> provider -> callback/reconciliation/audit | Finance ownership, approved limits/repair/refund policy, vendor sandbox evidence, access review and incident procedure |
| DF-09 | Chat and WebSocket rooms | P, H, S | Authenticated participant -> `api-web`/Socket.IO -> Redis coordination and MongoDB state; connection and room joins require participant/booking state | Message-content purpose/retention, moderation representation, suspension/reassignment E2E, log sampling and incident access rules |
| DF-10 | Calls and session access | P, H, S; live media content | Participant -> API authorization -> short-lived LiveKit ticket or approved regional provider link -> call service; assignment, booking state and time window are checked; recording defaults off | `CLINICAL ACTION`/`PRIVACY ACTION`: session/recording/emergency policy; device/network/media tests; provider/location/fallback evidence |
| DF-11 | Transactional email and notifications | P, S; H/F content must be minimized | Worker/API -> Resend or platform notification channel; repository templates/configuration and feature gates exist | Approved content matrix, sender/domain, delivery/bounce/complaint metrics, provider retention/location/deletion and live tests |
| DF-12 | Administrator support, finance, privacy and content work | P, H, F, S, C according to permission | Admin panel -> `api-admin` -> explicit operational permission -> MongoDB/provider; fresh MFA and durable audit apply to high-risk actions | Named least-privilege grants, separation-of-duties review, sampled denied/allowed actions, training and break-glass process |
| DF-13 | Privacy consent, withdrawal, correction, export and deletion requests | P, H, F, S | Authenticated request -> stateful review workflow -> encrypted payload/MongoDB -> authorized admin action/audit; legal holds and manual disposition are explicit | Approved notices, identity verification, deadlines, exceptions, secure export delivery, vendor/backup propagation and out-of-band status path |
| DF-14 | Automated retention review | P, H, F, S, C depending on handler | Worker -> approved policy parser -> legal-hold check -> dry-run/execution -> audit; default production execution is off and most categories remain manual | Category-by-category `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`; tested handler and rollback/evidence before enabling |
| DF-15 | Managed media upload, access and verification | P, H, S | Authorized API -> local upload path -> protected access -> media manifest -> backup/restore verifier; Cloudinary is rejected as current production backend | File-type/size/access E2E, malware/content handling decision, capacity, off-site recovery and deletion/hold behavior |
| DF-16 | Security audit events | S plus bounded opaque references | Application security event -> bounded in-process queue -> transactional HMAC-linked MongoDB ledger -> metrics/alerts | Live completeness and time sync; queue-loss treatment; signing-key rollover; retention/hold/archive; protected off-host evidence |
| DF-17 | Metrics, health probes and alerting | Aggregate S and service metadata | APIs/exporters/blackbox -> Prometheus -> 53 rules -> Alertmanager; 14 jobs and 26 coverage records are repository-validated | `INFRASTRUCTURE ACTION`: target/probe coverage, protected human destination, delivery/acknowledgement/resolution and Uptime Kuma proof |
| DF-18 | Container state/resource telemetry | Bounded S | Docker socket -> trusted project-scoped gateway -> sanitized list/stats/state -> exporter -> Prometheus; raw and cross-project operations are denied by candidate tests | Live network membership, route-denial proof, image provenance, expected container coverage and high-trust gateway review |
| DF-19 | Operational logs | S and possible P | Caddy access and Docker `json-file` logs -> Grafana Alloy -> local Loki -> Grafana; positions and rotation/retention are source-controlled | Source-by-source minimization, access, India location, 180-day coverage/retrieval, time sync and off-host incident evidence |
| DF-20 | Backup, off-site copy and isolated restore | P, H, F, S, C encrypted | Host timer -> guarded backup helper -> encrypted/signed archive -> approved off-site location -> isolated restore target -> verification evidence | `INFRASTRUCTURE ACTION`: current backup/off-site retrieval/restore; `OWNER ACTION`: RPO/RTO/custody; latest restore-test evidence must be <=24 hours old |
| DF-21 | Social Studio/content generation and publication | C; P/S if operators enter or attach it | Authorized admin -> optional OpenAI generation and/or Meta publication; feature flags and encrypted token handling exist | Keep disabled until owner/privacy/vendor approval, prompt/data prohibition, scopes, review, retention, deletion and incident evidence |
| DF-22 | Public contact/enquiry | P and free text that may contain H | Public page -> server-side handling/database/email as implemented by the web service | Confirm exact fields/recipients/spam controls, prominent notice, retention, deletion and no collection of unnecessary health detail |

## Trust-boundary rules

- Clients may propose identifiers and choices but do not authoritatively set
  price, payment, ownership, assignment or privileged state.
- Browser redirects do not confirm payment; signed, provider-bound durable
  events and reconciliation do.
- A valid token does not replace role, object, participant, state or
  fresh-authentication checks.
- Unassigned counsellors receive only the approved preview, not a user's
  identity, contacts, emergency details or counselling narrative.
- Provider credentials, full callback bodies, raw face/media data and
  secret-bearing URLs must not enter ordinary logs or evidence tickets.
- Optional provider variables do not authorize processing. Disabled is the
  default until the evidence pack is complete.
- Restore tests use isolated networks and targets. Raw full-instance backup
  archives are not restored directly into production.

## Retention and location boundary

Repository defaults or technical limits are not automatically business or
legal retention decisions. Category-by-category periods, triggers, legal
holds, disposal evidence, backup/log effects and processor propagation require
approval. In particular:

- audit-ledger retention and signing-key rollover are unresolved;
- automatic disposition is intentionally narrow and otherwise manual;
- local Loki configuration does not prove 180-day India ICT-log retention;
- vendor data locations and subprocessors are not established here; and
- encrypted backups still require an approved off-site location and key
  separation.

See [the India privacy readiness map](./18-india-privacy-readiness-map.md),
[the privacy rights runbook](../../menorah/backend/docs/privacy-data-rights-runbook.md)
and [the maintenance calendar](./25-maintenance-calendar.md).

## Validation and ownership required

Before launch, the accountable privacy owner must convert this inventory into
a field-level, versioned record tied to actual schemas, forms, logs, exports,
vendors and locations. Qualified Indian counsel must approve the legal
interpretation. The clinical owner must approve counselling, credential,
biometric, crisis and minor-user boundaries. Infrastructure must compare
actual flows using metadata-safe tests and preserve only redacted evidence.

Provider details belong in
[the service and vendor register](./23-service-and-vendor-register.md), and
human/service access belongs in
[the access and ownership matrix](./24-access-and-ownership-matrix.md).
