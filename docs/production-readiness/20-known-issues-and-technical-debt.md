# Known issues and technical debt

Last reviewed: 2026-07-24.

## Reading this register

`Repository evidence` means a control or test exists in the candidate working
tree. `Live evidence` means a dated result from the intended environment. The
former never substitutes for the latter.

Severity:

- `P0`: blocks public production;
- `P1`: blocks the proposed operating model or requires resolution before a
  broader launch;
- `Debt`: bounded limitation that may be scheduled only after an authorized
  risk decision.

All items are open unless a later release record links objective closure
evidence.

## Public-production blockers

| ID | Sev. | Issue and current evidence | Required closure | Owner |
| --- | --- | --- | --- | --- |
| HO-REL-001 | P0 | Runtime SHA `48fb83c248b0e969e699433a8bacdd276ed4311d` has current local validation and six passing push/PR workflow executions; old evidence for `3fb99858c6766a341bb7b7dab2377195427f0ea1` is invalidated; no owner-approved protected production release record exists | Independent review, final documentation-head and workflow verification, protected rules and a signed release record | Engineering; `OWNER ACTION` |
| HO-CFG-001 | P0 | Startup and Compose validation are present, but the target host's complete non-placeholder configuration has not been validated in evidence | Secret-safe host validation for every service; approved custody/recovery | `INFRASTRUCTURE ACTION`, `OWNER ACTION` |
| HO-BKP-001 | P0 | The current candidate passed a signed/encrypted local backup and isolated restore; no approved Ubuntu, off-host-custody or independently operated recovery evidence exists | Successful server backup, signature/checksum, protected off-host copy, independent key recovery and isolated DB/media restore | `INFRASTRUCTURE ACTION`, `OWNER ACTION` |
| HO-DB-001 | P0 | Local replica-set execution applied and then idempotently skipped all 11 migrations with ledger/index invariants; production data/index preflight intentionally did not run | Approved Ubuntu interruption/rollback/resume rehearsal, invariant report and separately authorized production boundary/post-check | `INFRASTRUCTURE ACTION` |
| HO-OBS-001 | P0 | Prometheus/blackbox/exporters/rules are source-controlled; the committed Alertmanager receiver intentionally has no human destination | Approved external receiver, live targets/probes, controlled delivery/acknowledgement/resolution evidence and rota | `INFRASTRUCTURE ACTION`, `OWNER ACTION` |
| HO-OBS-002 | P0 | All 20 required signals fired and resolved in local Prometheus and Alertmanager; no approved Ubuntu provider/target exercise or protected human-delivery evidence exists | Validate server thresholds, provider callbacks, targets, protected receiver delivery, acknowledgement/escalation and human response | `INFRASTRUCTURE ACTION`, engineering |
| HO-NET-001 | P0 | Caddy and tunnel manifests cover intended domains, but live Cloudflare/DNS/tunnel state is not proved | Read-only comparison, route/TLS tests and change evidence | `INFRASTRUCTURE ACTION` |
| HO-PAY-001 | P0 | Payment integrity/reconciliation controls exist, but live initiation remains gated and product/finance rules are unresolved | Owner-approved cancellation/refund/promo/late-event rules; provider test-mode end-to-end evidence; reconciliation ownership | `OWNER ACTION`, `VENDOR ACTION` |
| HO-KYC-001 | P0 | Counsellor verification states and evidence gates exist; qualification sufficiency and clinical/legal policy remain unapproved | Approved qualification/evidence/renewal/suspension policy and staged workflow proof | `CLINICAL ACTION`, `LEGAL ACTION`, `OWNER ACTION` |
| HO-PRIV-001 | P0 | Rights, consent, legal-hold and configurable retention machinery exist; notices, periods, grievance and operating procedure remain unapproved | Approved data inventory, notices, purpose/retention schedule, rights/grievance process and staged evidence | `LEGAL ACTION`, `PRIVACY ACTION`, `OWNER ACTION` |
| HO-MINOR-001 | P0 | No approved minimum-age/minors position or complete guardian/safeguarding flow is evidenced | Decide exclusion/support; legal/privacy/clinical approval and tested accurate user flow | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION` |
| HO-INC-001 | P0 | Incident-oriented logging/runbooks exist; named on-call, CERT-In PoC, six-hour exercise and 180-day India log proof do not | Approved roles, contact registration, log matrix, India retention/retrieval and incident exercise | `OWNER ACTION`, `LEGAL ACTION`, `INFRASTRUCTURE ACTION` |
| HO-VAPT-001 | P0 | Automated security tests cannot replace independent assessment | Complete scoped VAPT and closure retest on the immutable staging candidate | `VAPT ACTION`, `OWNER ACTION` |
| HO-STORE-001 | P0 | Windows/CI evidence cannot prove signed store releases, external association files or declarations | macOS iOS archive/device test; Android internal track; store/privacy/health declarations and external links | `APPLE ACTION`, `GOOGLE ACTION` |
| HO-VENDOR-001 | P0 | Integrations are gated, but ownership, contracts, locations, subprocessors, security/privacy and incident evidence are incomplete | Complete vendor register and approve or disable each integration | `VENDOR ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `OWNER ACTION` |

## Security, reliability and operating-model limitations

| ID | Sev. | Limitation | Safe interim position and remediation |
| --- | --- | --- | --- |
| TD-AUD-001 | P1 | Durable security events first enter a bounded in-process queue. A long database outage plus process loss can lose pending entries | Alert on pending/failures, keep planned shutdown drain enabled, test outage recovery, and design an approved external durable spool if lossless intake becomes required |
| TD-AUD-002 | P1 | Audit-signing-key rotation has no signed rollover protocol | Do not rotate as routine secret maintenance; design historical-key custody and chain rollover under security approval |
| TD-AUD-003 | P1 | Audit-ledger retention, legal hold, archive and deletion are intentionally undefined; no TTL exists | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`: approve policy before any pruning |
| TD-PRIV-001 | P1 | Secure export assembly/delivery is manual; there is no automatic portable archive | Keep reviewed case handling; implement tested minimised export packaging only after scope and identity policy approval |
| TD-PRIV-002 | P1 | Deactivated users cannot use authenticated routes to track deletion; secure out-of-band status is undefined | `OWNER ACTION`, `PRIVACY ACTION`: approve and implement a verified communication path |
| TD-PRIV-003 | P1 | Social-only users need verified-email password reset before authenticated deletion; recent provider reauthentication is absent | Document accurately; assess provider reauthentication before broad social-auth launch |
| TD-PRIV-004 | P1 | Automatic retention disposition only covers encrypted privacy-request payloads | Keep every other category `manual` until an approved handler, legal hold, dry run and audit evidence exist |
| TD-PAY-001 | P1 | Subscription purchases are deliberately unavailable because durable attempt/reconciliation guarantees are absent | Keep `SUBSCRIPTION_PAYMENTS_ENABLED=false`; design and review a separate state machine before enabling |
| TD-PAY-002 | P1 | Payment/payout mismatch reports are read-only; manual repair/refund rules are not implemented | Keep fail-closed review states and use no ad hoc DB updates; implement approved resolution commands with dual control |
| TD-MEDIA-001 | P1 | Production media storage is intentionally local so it participates in signed backup/restore; host capacity and off-site recovery must be operated | Monitor capacity, verify every restore with media manifest, and approve any future storage migration separately |
| TD-MONGO-001 | P1 | Multi-user MongoDB password rotation cannot be transactional and may partially complete | Quiesce writers, stage all dependent secrets, run explicit confirmed maintenance reconciliation, verify each identity before restart |
| TD-GOV-001 | P1 | Branch/ruleset guidance in Git does not configure GitHub | `OWNER ACTION`: enable and test rulesets, required checks, tag protection and emergency bypass review |
| TD-BCM-001 | P1 | Technical recovery exists without approved business impact analysis, RPO/RTO or full continuity exercise | `OWNER ACTION`, `INFRASTRUCTURE ACTION`: approve objectives and exercise business/ICT recovery |
| TD-CERT-001 | P1 | Repository log retention settings do not prove all ICT logs remain in India for 180 days | Inventory sources and destinations, verify time sync/location/retention/access and sample retrieval |
| TD-HOME-001 | Debt | The explicitly non-authoritative home/staging Compose stack still uses legacy Promtail and does not mirror the production Alloy/Loki and constrained container-metrics topology | Never use the home stack as production evidence; migrate or retire its legacy logging path in a separate reviewed development-environment change |

## Mobile and dependency debt

| ID | Sev. | Limitation | Required handling |
| --- | --- | --- | --- |
| TD-MOB-001 | P1 | Expo SDK 57 has a reviewed transitive `uuid <11.1.1` moderate advisory through the Expo CLI/config-plugin/xcode path; the exception expires 2026-10-31 | Track Expo-supported patch path; do not use blanket `npm audit fix --force`; fail CI for any scope/severity/advisory change |
| TD-MOB-002 | P1 | Checked-in iOS `Podfile.lock` predates the SDK 57 native graph | `APPLE ACTION`: regenerate on approved macOS, review broad lock changes, archive and device-test |
| TD-MOB-003 | P1 | Bare-workflow native folders are authoritative; selected app-config fields do not auto-sync | Review native/app config together for every mobile release |
| TD-MOB-004 | P1 | App/Universal Links, store association and privacy declarations require external hosting/account evidence | `APPLE ACTION`, `GOOGLE ACTION`: prove from external devices/networks and store consoles |
| TD-DEP-001 | P1 | Final fresh dependency audits and exploitability review across all production packages are release-SHA-specific | Attach per-package reports, supported upgrades, tests and time-bounded exceptions |

## Optional and vendor-dependent capabilities

OpenAI/Social Studio, Meta/Instagram, Luxand, Google Meet, Doxy.me, VSee,
Zoom, Teams, Cloudinary and other optional integrations must be treated as
disabled unless the release record proves all of the following:

- explicit product approval and accurate user-facing representation;
- complete non-placeholder configuration in the protected environment;
- contract, owner, location, subprocessor and privacy/security review;
- least-privilege credentials and tested revocation;
- failure, timeout, incident, export and deletion behavior; and
- monitoring plus vendor escalation.

This is a `VENDOR ACTION`, `LEGAL ACTION`, `PRIVACY ACTION` and `OWNER ACTION`
boundary. Feature flags are not supplier due diligence.

## Closure rule

Close an item only when the release record cites the immutable SHA, environment,
test or decision, evidence location, approver and date. Moving a limitation into
this file does not accept its risk. Only the authorized owner may accept a
bounded residual risk, and no owner can waive applicable legal, clinical, store
or regulatory requirements.
