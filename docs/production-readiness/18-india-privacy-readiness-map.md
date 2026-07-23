# India privacy and cyber-readiness map

Last reviewed: 2026-07-23.

## Legal boundary

This document is an engineering readiness aid, not legal advice or a compliance
opinion. Qualified Indian counsel must determine Menorah's legal roles,
territorial scope, lawful grounds, notices, health-service obligations,
children/minor rules, retention, transfers, grievance duties and transition
between the existing IT/SPDI framework and the DPDP regime.

Repository controls are not proof of live compliance. Evidence must cover the
actual company, services, users, staff, vendors, infrastructure and operating
records.

## Authoritative timing snapshot

The [13 November 2025 commencement
notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
phases the Digital Personal Data Protection Act, 2023:

| Date | Provisions | Readiness consequence |
| --- | --- | --- |
| 13 November 2025 | Section 1(2), section 2, sections 18–26, section 35, sections 38–43, and section 44(1) and (3) | Institutional and rule-making provisions began; this did not commence all substantive Data Fiduciary duties |
| 13 November 2026 | Section 6(9) and section 27(1)(d); DPDP Rule 4 | Future dated as of this review; prepare consent-manager and related Board handling if applicable |
| 13 May 2027 | Sections 3–5, section 6(1)–(8) and (10), sections 7–17, section 27 except section 27(1)(d), sections 28–34, sections 36–37 and section 44(2); Rules 3, 5–16 and 22–23 | Principal scope, processing, notice, consent, Data Fiduciary duties, child rules and Data Principal rights are scheduled to commence |

The [final DPDP Rules,
2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
use the same phased model: Rules 1, 2 and 17–21 commenced on publication, Rule
4 after one year, and Rules 3, 5–16, 22 and 23 after eighteen months.
Read that Gazette text together with the corrigendum listed on the official
[MeitY rules collection](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa);
this timing summary is not a substitute for a current consolidated legal review.

Do not describe the principal sections 3–17 as operational law on
2026-07-23. Equally, do not postpone engineering: the product needs time to
inventory data, approve purposes/notices, test rights handling, govern
processors and validate child handling before 13 May 2027.

Primary references:

- [Digital Personal Data Protection Act, 2023 — official
  Gazette](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf)
- [India Code — DPDP Act and section
  index](https://www.indiacode.nic.in/handle/123456789/22037?view_type=browse)
- [MeitY — Digital Personal Data Protection Rules,
  2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa)
- [IT (Reasonable Security Practices and Procedures and Sensitive Personal Data
  or Information) Rules,
  2011](https://www.meity.gov.in/writereaddata/files/GSR3_10511%281%29.pdf)
- [CERT-In directions under section
  70B](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)
  and [official FAQ](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)

## Data and legal-role inventory

| Area | Repository evidence | Gap and required decision | Evidence needed |
| --- | --- | --- | --- |
| Data Fiduciary/processor roles | Service and vendor inventory can identify systems and integrations | Corporate entity, each purpose/means decision, processor instructions, joint arrangements and territorial scope are not approved | `LEGAL ACTION`, `PRIVACY ACTION`: signed role and processing map |
| Account and authentication data | Role-separated sessions, revocation, encryption and authorization tests | Approved purpose, notice, collection minimum, fraud/security exception and retention | Versioned notice, data dictionary, retention rule and access review |
| Booking and mental-health context | Pre-assignment preview minimization; assigned-participant authorization | Clinical record boundary, permissible support/finance access, emergency use, correction and retention rules | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`: clinical data policy and sampled access evidence |
| Chat and call data | Participant/booking checks; recording is not represented as active by default | Content/metadata purposes, moderation position, emergency disclosure, recording prohibition/consent and retention | Approved policy, user notice, access samples and disposition evidence |
| Counsellor credentials and face checks | Versioned onboarding/face-check consent metadata; verification states; configurable face-check retention | Legal basis, qualification sufficiency, biometric minimization, vendor handling, evidence disposition and human review | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`, `VENDOR ACTION` |
| Payment, payout and bank data | Provider-bound payment attempts, reconciliation, encrypted bank fields, dual payout approval | Statutory/contractual record periods, disclosure, correction, chargeback/refund evidence and processor terms | `LEGAL ACTION`, `OWNER ACTION`, `VENDOR ACTION`; finance retention and access records |
| Security and operational logs | Structured bounded security events and durable signed ledger design | Complete log-source inventory, India location, 180-day coverage, access, integrity, time sync and incident retrieval are not live-proven | `INFRASTRUCTURE ACTION`: source-to-destination matrix and dated retrieval test |
| Backups and replicas | Encrypted signed backup/restore design | Approved retention, India/off-site locations, deletion propagation, legal holds, key custody and tested restore evidence | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `INFRASTRUCTURE ACTION` |
| Vendors and cross-border processing | Integrations are feature-gated and listed in configuration | No approved processor list, locations, subprocessors, transfer analysis, contracts, deletion or incident evidence | `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION` |

## DPDP readiness

The following maps the scheduled substantive regime without asserting that it
is already in force.

| Topic | Candidate repository control | Remaining blocker |
| --- | --- | --- |
| Lawful purpose and data minimization | Server-side payment/booking authority; preview serializers; safe audit fields | `LEGAL ACTION`, `PRIVACY ACTION`: approve every purpose, required field, use, sharing and retention trigger |
| Standalone notice and consent | Versioned privacy and face-check consent records; counsellor consent version | Approve clear itemised notices and accessible withdrawal/rights/grievance paths; registration is not yet gated on privacy-acceptance evidence |
| Consent withdrawal | Withdrawal is recorded and versioned | Decide downstream effect per purpose, service impact, processor propagation and evidence; do not promise universal immediate deletion |
| Data security safeguards | Encryption, authorization, secret validation, audit ledger, backups and monitoring configuration | Live key custody, access reviews, patches, alert delivery, incident exercises, vendor safeguards and independent VAPT |
| Personal-data breach handling | Security events and incident-oriented runbooks exist | Approved breach assessment, Board/Data Principal notification workflow when applicable, evidence template, decision authority and vendor escalation |
| Access information | Authenticated rights-request workflow supports export requests | DPDP access rights must be interpreted by counsel; an automated portable archive is not implemented |
| Correction and erasure | Correction/deletion workflow, review states, legal holds and audit events | Approve identity proof, exceptions, downstream/backup/vendor handling, response text and completion evidence |
| Grievance | Grievance request type and encrypted payload exist | Name and publish the grievance contact, approve acknowledgement/resolution process, escalation and records |
| Nomination | No complete product flow identified | `LEGAL ACTION`, `PRIVACY ACTION`: determine applicability and design before the scheduled commencement |
| Retention and erasure | Explicit categories; only privacy-request payload disposition can be automated | Approve category-by-category periods and exceptions. No period may be inferred from a technical default |
| Significant Data Fiduciary duties | Some security/privacy controls may support future assessment | Determine designation risk/applicability, DPO/data-auditor and impact-assessment obligations with counsel |
| Processor governance | Feature flags limit unconfigured vendors | Execute processing terms, instructions, safeguards, audit rights, breach timing, subprocessors, return/deletion and exit evidence |
| Cross-border processing | No source-code claim of a jurisdictional conclusion | Map every storage/support/telemetry route and obtain legal review of current restrictions and contracts |

The DPDP Act contains a right to access information about personal data. It does
not use a general data-portability right as the label for section 11. Menorah's
export request is a useful privacy feature, but the company must not describe it
as satisfying a statutory portability obligation without `LEGAL ACTION`.

## Children and minors

The Act defines a child as an individual under eighteen. The scheduled child
provisions include verifiable parental consent and restrictions on detrimental
processing, tracking/behavioural monitoring and targeted advertising, subject
to the Act, Rules and any applicable exemptions.

Current launch position:

- No approved minimum age or minors policy is evidenced.
- No complete age-assurance, parent/guardian verification, consent withdrawal,
  family access, safeguarding or child-rights workflow is evidenced.
- Mental-health context makes an unsupported minors launch particularly high
  risk.

`OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`: choose and
approve whether minors are prohibited or supported. The conservative launch
gate is to exclude minors through an approved, tested and accurately disclosed
flow until qualified counsel and clinical governance approve a complete
process. Do not invent an age or parental-consent mechanism in code or copy.

## SPDI, mental-health and biometric information

As of this review, qualified counsel must assess the continuing and transitional
application of section 43A of the IT Act and the 2011 SPDI Rules. DPDP section
44(2), which affects that framework, is in the eighteen-month commencement
tranche and is not yet in force.

The 2011 Rules identify categories including passwords; financial information;
physical, physiological and mental-health condition; sexual orientation;
medical records/history; and biometric information. Menorah processes or may
process several of these high-risk categories.

| Readiness requirement | Current position | Action |
| --- | --- | --- |
| Published privacy policy and purpose-specific collection | Version/config framework exists; approved public text is not evidenced | `LEGAL ACTION`, `PRIVACY ACTION` |
| Consent and withdrawal | Versioned records exist for selected flows | Validate form, timing, all SPDI flows, consequences and vendor propagation |
| Necessary/minimised collection | Sensitive marketplace preview is minimised; audit details are allowlisted | Complete field-level data inventory and justify each collection |
| Review and correction | Request workflow exists | Approve response, identity, clinical correction and record-preservation rules |
| Retention no longer than required | Configurable policy exists without invented periods | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION` |
| Disclosure and transfer controls | Authorization exists in code | Approve disclosures, contracts, equivalent protection analysis and evidence |
| Reasonable security practices | Technical controls exist in the candidate | Live controls, workforce procedures, risk assessment, VAPT and incident records remain unproved |
| Grievance handling | Request type exists | Publish responsible contact and approve service levels and escalation |

Face-check data must be minimised. The technical setting of 365 days and the
consent version in code are not a legal conclusion. `LEGAL ACTION` and
`PRIVACY ACTION` must approve the necessity, notice, vendor transfer, data
elements retained, access, deletion and exceptions; `CLINICAL ACTION` must
confirm that the feature is appropriate for the service. Raw face images or
vendor templates must not be assumed deleted without evidence.

## CERT-In operational readiness

The CERT-In directions apply operational obligations independently of the
future DPDP substantive commencement:

- specified cyber incidents must be reported within six hours of noticing them
  or being informed of them;
- covered entities must designate and maintain a CERT-In point of contact;
- ICT system clocks must use NIC/NPL or traceable accurate time sources as
  specified;
- ICT logs must be enabled, securely maintained for a rolling 180 days within
  Indian jurisdiction, and be available to CERT-In; and
- reportable categories include unauthorized access, data breach/leak, attacks
  on applications, payment systems, malicious mobile applications and
  cloud-related systems.

Repository readiness does not prove those obligations are met. Before launch:

1. `OWNER ACTION`: appoint primary and alternate incident decision-makers.
2. `LEGAL ACTION`: approve the regulatory assessment and communication path.
3. `INFRASTRUCTURE ACTION`: designate the CERT-In point of contact through the
   official process and retain confirmation.
4. `INFRASTRUCTURE ACTION`: inventory every required log source, destination,
   clock source, India storage location, access path and retention control.
5. `PRIVACY ACTION`: minimise and restrict log contents while preserving
   required security evidence.
6. Exercise a synthetic incident in staging: detect, classify, assemble the
   available initial facts, make a mock six-hour escalation, preserve evidence,
   and issue updates without exposing secrets or unnecessary health data.
7. Obtain `VAPT ACTION` evidence that logging, detection and incident paths
   cover the assessed attack surface.

## Rights, retention and processor launch gates

The following are blockers, not documentation-only tasks:

- `OWNER ACTION`: appoint the privacy-request owner, grievance owner, incident
  owner and alternates.
- `LEGAL ACTION`: approve the legal register, notices, purpose map, minors
  position, rights procedure, retention/exceptions, transfer and disclosure
  rules.
- `PRIVACY ACTION`: approve the data inventory, privacy risk assessments,
  processor register, request identity checks, response evidence and deletion
  truth criteria.
- `CLINICAL ACTION`: approve mental-health/clinical record boundaries,
  counsellor access, crisis handling and clinical retention.
- `VENDOR ACTION`: obtain processor locations, subprocessors, security,
  incident, assistance, export, deletion and termination evidence.
- `INFRASTRUCTURE ACTION`: prove encryption, access, backups, 180-day India log
  coverage, alert delivery, time synchronization and incident retrieval live.
- `VAPT ACTION`: complete independent testing and closure verification.

## Conclusion

Menorah has meaningful privacy-oriented engineering, but approved legal and
clinical policy, live operations, processor evidence and independent assurance
remain incomplete. The correct status is readiness work in progress, not DPDP,
SPDI, CERT-In or health-data compliance.
