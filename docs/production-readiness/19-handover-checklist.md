# Production handover checklist

Last reviewed: 2026-07-23.

## How to use this checklist

A checked item must link to dated evidence. Source code, a template, or a
successful desktop test is not evidence that a live control operates. Do not
place credentials, tokens, private keys, connection strings, personal data,
clinical data, payment data or unredacted logs in this repository or its
handover tickets.

Status meanings:

- `[ ]` not evidenced;
- `[x]` evidenced for the stated environment and candidate SHA;
- `N/A` approved as not applicable, with decision owner and rationale.

The current overall release verdict is **NOT READY**. This file must not be
treated as a launch approval.

## 1. Immutable release identity

- [ ] Record the exact release branch, commit SHA and tree-clean status.
- [ ] Prove the candidate is synchronized with the intended remote branch.
- [ ] Link every focused commit to its scope and targeted test evidence.
- [ ] Record the final full-stack CI run against the same immutable SHA.
- [ ] Record all skipped, blocked, quarantined and environment-only tests.
- [ ] Confirm no live environment file, secret or production-data artifact is
      tracked or present in the release diff.
- [ ] Obtain an independent code review for authentication, authorization,
      payments, privacy, migrations, deployment and recovery changes.
- [ ] Create a protected release tag only after approval.
- [ ] `OWNER ACTION`: verify GitHub rulesets, required checks, reviewer teams,
      tag protection and emergency-bypass logging are active.

Evidence: release record based on
[the repository template](../../.github/RELEASE_EVIDENCE_TEMPLATE.md), pull
request, CI URLs, commit list and redacted secret-scan result.

## 2. Build and test evidence

- [ ] Backend lint, unit tests and approved isolated integration tests pass.
- [ ] User web, admin and counsellor web lint/type-check/production builds pass.
- [ ] Mobile lint, type-check, tests and Expo Doctor pass within documented
      approved exceptions.
- [ ] Android release build and signed-device smoke test pass.
- [ ] `APPLE ACTION`: iOS CocoaPods regeneration, archive and signed-device
      smoke test pass on an approved macOS builder.
- [ ] Playwright and API smoke tests pass against an isolated staging release.
- [ ] Docker Compose, Caddy, shell, migration, monitoring and release-script
      validation pass.
- [ ] Fresh production dependency audits are attached per package, with every
      unresolved advisory assigned an owner, expiry and rationale.
- [ ] Gitleaks or the approved equivalent passes against the release and
      reachable history within the agreed scope.
- [ ] No failed check is hidden, neutralized or reclassified without an
      explicit risk decision.

## 3. Configuration and secret custody

- [ ] Compare the tracked environment reference with the production secret
      inventory by **name only**.
- [ ] Startup validation passes on the intended service set without printing
      values.
- [ ] All required secrets are non-placeholder, unique where required and
      injected through the approved protected mechanism.
- [ ] Encryption, audit-signing, JWT and backup-integrity/encryption keys have
      distinct custodianship and tested recovery procedures.
- [ ] Payment webhook rotation has a documented overlap/removal plan.
- [ ] No secret is passed on a command line, copied into a ticket, or retained
      in shell history.
- [ ] `OWNER ACTION`: approve named primary and alternate secret custodians.
- [ ] `INFRASTRUCTURE ACTION`: retain a redacted configuration-validation
      record from the target host.

Use [the environment variable
reference](./22-environment-variable-reference.md); never copy values into it.

## 4. Database, migrations and durable evidence

- [ ] Back up the database before the migration boundary.
- [ ] Restore the candidate backup into the isolated restore-test environment.
- [ ] Run every ordered migration exactly once in isolated staging first.
- [ ] Verify migration ledger entries, expected indexes and data invariants.
- [ ] Prove destructive migrations are not run implicitly at application
      startup.
- [ ] Verify application, backup, restore and monitoring MongoDB identities
      authenticate with their exact approved direct roles.
- [ ] Verify routine reconciliation does not rotate credentials.
- [ ] Run any credential rotation only in an approved maintenance window with
      writers stopped and all dependent URI secrets staged together.
- [ ] Apply and verify the security-audit ledger indexes.
- [ ] Generate non-sensitive audit events for each service and verify the full
      signed durable chain.
- [ ] Prove planned shutdown drains the audit queue; investigate any nonzero
      exit rather than treating restart as delivery proof.
- [ ] Preserve before/after counts and redacted verification output.

## 5. Backup, restore and continuity

- [ ] Host-owned six-hourly, daily, weekly and monthly timers are enabled and
      active.
- [ ] The latest encrypted backup is readable by the invoking host operator and
      its checksum/signature verifies.
- [ ] A current isolated restore test completes, including managed media.
- [ ] An approved off-host copy exists and can be decrypted by authorized
      custodians.
- [ ] Restore evidence contains no data extracts or secret values.
- [ ] `OWNER ACTION`: approve RPO, RTO, backup retention, off-site location and
      key custody.
- [ ] `LEGAL ACTION` and `PRIVACY ACTION`: approve deletion, legal-hold and
      backup-retention behavior.
- [ ] Exercise pre-migration rollback separately from post-migration
      coordinated recovery.
- [ ] Record achieved recovery time and recovery point against the approved
      objectives.

Evidence and commands belong in the
[backup/restore runbook](../../menorah/docs/production-backup-restore-runbook.md)
and release record.

## 6. Live infrastructure

- [ ] `INFRASTRUCTURE ACTION`: validate the fully interpolated production
      Compose model on the target host.
- [ ] Confirm only the guarded
      `menorah/deploy/ubuntu/update-from-git.sh` workflow can release production.
- [ ] Verify public and internal network boundaries, host firewall, file
      permissions and container hardening.
- [ ] Verify every intended Cloudflare hostname and tunnel route against the
      source-controlled manifest.
- [ ] Verify TLS chains and expiry monitoring.
- [ ] Verify MongoDB replica state and Redis health from least-privilege
      monitoring identities.
- [ ] Verify every Prometheus target and blackbox probe.
- [ ] Install an approved Alertmanager destination outside the repository.
- [ ] Complete controlled alert delivery, acknowledgement, repeat and resolved
      notification tests.
- [ ] Create Uptime Kuma monitors and retain screenshots/export evidence.
- [ ] Name primary and secondary responders for every alert owner label.
- [ ] Verify NTP/time synchronization and the CERT-In log inventory.
- [ ] Prove required ICT logs are securely retained in India for a rolling 180
      days and can be retrieved within the incident workflow.

## 7. Product, payments and finance

- [ ] Server-authoritative booking prices and paid/entitled acceptance are
      proven in staging.
- [ ] Unassigned booking previews contain no prohibited identity, contact,
      emergency or clinical detail.
- [ ] Payment and payout webhooks pass signature, identity, amount, currency,
      state, replay and delayed-order tests using provider test mode.
- [ ] Reconciliation reports run with least-privilege read-only access and
      reach the named reviewers.
- [ ] `OWNER ACTION`: approve cancellation, refund, rescheduling, free/promo,
      late-capture, retry and manual-review rules.
- [ ] `OWNER ACTION`: appoint payment reconciliation and dual-approval owners.
- [ ] `VENDOR ACTION`: verify provider callback configuration, test events,
      account ownership and escalation contacts.
- [ ] Keep booking-payment and payout initiation gates off until every gate is
      evidenced.
- [ ] Keep subscription payment flow unavailable until its durable
      attempt/reconciliation design is implemented and reviewed.

## 8. Privacy, legal and clinical governance

- [ ] `LEGAL ACTION`: approve the legal register, notices, purposes, disclosures,
      transfers, retention and rights interpretation.
- [ ] `PRIVACY ACTION`: approve the data inventory, consent points, privacy risk
      assessments, request procedure, identity checks and evidence standard.
- [ ] `OWNER ACTION`: appoint privacy, grievance and data-request owners plus
      alternates.
- [ ] `CLINICAL ACTION`: approve counsellor qualifications, credential evidence,
      renewal/suspension, clinical records, crisis escalation and remote-care
      boundaries.
- [ ] Decide whether minors are prohibited or supported; approve and test the
      corresponding age/guardian/safeguarding flow.
- [ ] Approve every retention category; leave automated execution off until
      approved.
- [ ] Exercise access/export, correction, grievance, withdrawal, deletion and
      legal-hold races in isolated staging.
- [ ] Verify vendor export/deletion and backup/log implications before any
      deletion-complete message.
- [ ] Designate and register the CERT-In point of contact and exercise the
      six-hour escalation path.
- [ ] Confirm the public privacy, grievance, support and account-deletion URLs
      are accurate and reachable.

Use [the India readiness
map](./18-india-privacy-readiness-map.md). Qualified Indian counsel is required.

## 9. Security assurance and incident readiness

- [ ] `VAPT ACTION`: define the public, authenticated, mobile, API, WebSocket,
      admin, payment, SSRF and infrastructure scope.
- [ ] Complete independent VAPT against the immutable staging candidate.
- [ ] Remediate critical/high findings and retest closure; record risk treatment
      for every remaining item.
- [ ] Run table-top exercises for account compromise, data breach, payment
      mismatch, lost backup key, database corruption and vendor outage.
- [ ] Confirm incident severity, on-call, containment, evidence preservation,
      communications, legal/privacy/clinical escalation and post-incident review.
- [ ] Confirm security contacts can retrieve required logs without broad
      standing production access.

## 10. Mobile stores and external services

- [ ] `APPLE ACTION`: verify account ownership, signing, bundle identifier,
      entitlements, associated domains, privacy manifest, declarations, review
      account procedure and production archive.
- [ ] `GOOGLE ACTION`: verify Play account ownership, signing, package,
      asset-links, Data Safety, Health Apps declarations, review account
      procedure and internal-track release.
- [ ] Verify production deep links and both association files from external
      networks.
- [ ] Review notification content, screenshot protection, secure token storage,
      logs, clipboard and local persistence on real devices.
- [ ] `VENDOR ACTION`: complete the register, contracts, security/privacy
      evidence, subprocessors, locations, incident contacts and exit tests.
- [ ] Confirm every optional integration is explicitly disabled unless its
      full configuration and approval evidence exist.

## 11. Final acceptance record

The following roles must sign the same immutable release record. A blank,
delegated or self-approved role is not acceptance.

| Role | Decision required | Evidence reference | Name/date |
| --- | --- | --- | --- |
| Product owner | Launch scope and residual-risk acceptance | Pending | Pending — `OWNER ACTION` |
| Engineering owner | Candidate, tests, known issues | Pending | Pending |
| Infrastructure owner | Host, release, recovery, monitoring | Pending | Pending — `INFRASTRUCTURE ACTION` |
| Security owner | Threats, incidents, audit, VAPT closure | Pending | Pending — `VAPT ACTION` |
| Finance/payment owner | Payment, payout, reconciliation | Pending | Pending — `OWNER ACTION` |
| Privacy owner | Notices, requests, retention, processors | Pending | Pending — `PRIVACY ACTION` |
| Indian legal counsel | Legal register and launch advice | Pending | Pending — `LEGAL ACTION` |
| Clinical governance owner | Counsellor and clinical safety | Pending | Pending — `CLINICAL ACTION` |
| Apple release owner | iOS store evidence | Pending | Pending — `APPLE ACTION` |
| Google release owner | Android store evidence | Pending | Pending — `GOOGLE ACTION` |

Final decision must use exactly one verdict from
[the go/no-go record](./21-production-go-no-go.md). Until all blockers are
closed with evidence, it remains **NOT READY**.
