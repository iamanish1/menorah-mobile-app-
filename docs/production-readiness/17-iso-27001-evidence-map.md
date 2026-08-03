# ISO and related standards evidence map

Last reviewed: 2026-07-23.

## Status and use

This is a readiness map, not a statement of conformity, certification, or
legal compliance. Repository controls are candidate evidence only. They do not
prove that a control operates on the live host, that staff follow it, that a
risk has been accepted, or that an accredited certification body has audited
it.

An authorized standards owner must obtain the licensed standards, set the
organizational scope, and validate this map against the complete requirements.
ISO web pages are used here only to identify each publication's current status
and subject:

- [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) (edition 3),
  including Amendment 1:2024, is the published ISMS requirements standard.
- [ISO/IEC 27701:2025](https://www.iso.org/standard/27701) (edition 2) is the
  published privacy information management system requirements and guidance
  standard.
- [ISO 27799:2025](https://www.iso.org/standard/84647.html) (edition 3) is the
  published health information security controls guidance based on
  ISO/IEC 27002:2022 and includes remote or virtual healthcare.
- [ISO 22301:2019](https://www.iso.org/standard/75106.html) (edition 2),
  including Amendment 1:2024, remains the published business continuity
  management system requirements standard. ISO records it as due to be revised;
  that does not make an unpublished revision the audit basis.
- [ISO/IEC 27031:2025](https://www.iso.org/standard/27031) (edition 2) is the
  published ICT readiness for business continuity guidance.
- [ISO/IEC 27017:2015](https://www.iso.org/standard/43757.html) (edition 1)
  remains the current published cloud-control guidance as of this review. ISO
  lists [edition 2](https://www.iso.org/standard/82878.html) as under
  publication, not yet published; re-check its status before an audit.
- [ISO/IEC 27018:2025](https://www.iso.org/standard/27018) (edition 3) is the
  published public-cloud PII processor guidance.

## Evidence maturity

| Mark | Meaning | What is still required |
| --- | --- | --- |
| `R` | Repository evidence | Reviewed commit, passing CI, approved policy link, and configuration provenance |
| `O` | Operational evidence | Dated live output, ticket, log, test record, or access review from the in-scope environment |
| `G` | Governance evidence | Approved owner, policy, risk decision, training record, internal audit, or management-review minute |
| `E` | External evidence | Supplier assurance, legal opinion, VAPT report, or certification-body record |

No row below is complete until all marks applicable to the stated scope are
present.

## Cross-standard control evidence

| Control domain | Current repository evidence (`R`) | Missing operational or governance evidence | Accountable action |
| --- | --- | --- | --- |
| Secure change and release | Guarded deployment and rollback scripts; [production update runbook](../../menorah/docs/production-update-runbook.md); [.github release evidence template](../../.github/RELEASE_EVIDENCE_TEMPLATE.md) | Reviewed immutable release, live dry run, migration approval, rollback exercise, change records | `OWNER ACTION`, `INFRASTRUCTURE ACTION` |
| Source governance | Security workflows, PR template, and [branch protection recommendation](../../.github/BRANCH_PROTECTION.md) | Active ruleset, named reviewers, bypass log, protected release tags | `OWNER ACTION` |
| Identity and access | Separate user/counsellor/admin sessions; route tests; [admin authorization matrix](../../menorah/backend/docs/admin-operational-authorization.md); managed MongoDB identities | Live account inventory, joiner/mover/leaver records, privileged-access review, break-glass evidence | `OWNER ACTION`, `INFRASTRUCTURE ACTION` |
| Cryptography and secrets | Startup validation; distinct data-encryption and audit-signing keys; secret-free examples | Approved cryptographic policy, key inventory, custody, rotation and recovery exercises, live secret-store evidence | `OWNER ACTION`, `INFRASTRUCTURE ACTION` |
| Audit and monitoring | Structured security metrics; HMAC-linked durable audit ledger; alert rules and [monitoring runbook](../../menorah/docs/monitoring-alert-runbook.md) | Live migration, protected log destination, alert receiver, delivery test, responder rota, time-synchronization proof | `INFRASTRUCTURE ACTION` |
| Vulnerability management | Dependency/security CI and scheduled DAST/quarterly review workflows | Complete final audit results, remediation SLAs, exception ownership, independent VAPT and closure retest | `OWNER ACTION`, `VAPT ACTION` |
| Backup and recovery | Signed encrypted backup, restore-test, locking, and [backup/restore runbook](../../menorah/docs/production-backup-restore-runbook.md) | Current host backup, off-site copy, isolated restore evidence, key-recovery test, owner-approved RPO/RTO | `OWNER ACTION`, `INFRASTRUCTURE ACTION` |
| Incident response | Security event coverage and existing incident-remediation notes | Approved incident policy, severity matrix, contacts, CERT-In decision path, exercises, post-incident records | `OWNER ACTION`, `LEGAL ACTION`, `INFRASTRUCTURE ACTION` |
| Privacy rights and retention | Versioned consent and rights workflow; legal holds; configurable retention framework; [privacy runbook](../../menorah/backend/docs/privacy-data-rights-runbook.md) | Approved notices, lawful-purpose map, retention schedule, grievance process, processor deletion proof, response evidence | `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION` |
| Health and clinical data | Object authorization, minimised marketplace previews, face-check consent metadata, encryption | Approved health-data classification, clinical record rules, counsellor qualification policy, crisis governance, clinical access review | `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION` |
| Supplier and cloud security | Vendor-specific environment gates and source-controlled integration boundaries | Signed contracts, data-processing terms, locations, subprocessors, assurance reports, exit/deletion tests | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`, `VENDOR ACTION` |
| Business and ICT continuity | Redundant backup classes, guarded recovery, health checks, service monitoring | Business impact analysis, dependency tolerances, alternative communications, recovery team, full continuity exercises | `OWNER ACTION`, `INFRASTRUCTURE ACTION` |

## Standard-by-standard readiness

| Standard and focus | Candidate controls and evidence | Material gaps | Control owner | Internal-audit requirement | Management-review requirement | Certification or assurance blocker |
| --- | --- | --- | --- | --- | --- | --- |
| ISO/IEC 27001:2022 + Amd 1:2024 — ISMS | Secure SDLC tests, release controls, access boundaries, encryption, monitoring, backup/recovery, incident-oriented audit evidence | No approved ISMS scope, context/interested-parties analysis, asset inventory, risk method/register, risk treatment plan, Statement of Applicability, policy hierarchy, objectives, competence records, supplier register, or control-effectiveness history | Executive ISMS sponsor and security owner — `OWNER ACTION` | Independent, risk-based audit program covering management-system requirements and selected controls; findings, corrections, and effectiveness follow-up | Review scope, risks, objectives, incidents, audit results, supplier performance, resources, changes, and improvement actions; retain minutes and decisions | No implemented ISMS cycle, internal audit, management review, or accredited stage assessment |
| ISO/IEC 27701:2025 — PIMS | Consent evidence, privacy requests, legal holds, encrypted request payloads, explicit retention categories and admin permissions | No approved PIMS scope or controller/processor role map; notices, purpose/lawful-basis records, privacy risk assessment, data inventory, processor contracts, rights SLAs, child handling, transfer decisions, and deletion evidence remain incomplete | Privacy lead with legal and executive sponsorship — `PRIVACY ACTION`, `LEGAL ACTION`, `OWNER ACTION` | Audit data lifecycle samples, consent/withdrawal, rights cases, retention, access, incidents, processor oversight, and corrective actions | Review privacy objectives, complaints, requests, breaches, processor performance, legal change, residual risks, resources, and improvements | No approved privacy governance system, operational case evidence, internal audit, or management review |
| ISO 27799:2025 — health information security | Health-field minimization before assignment, assigned-care access tests, encrypted sensitive payloads, no-recording default | No approved health-information asset/classification model, clinical record policy, workforce confidentiality/competence evidence, emergency-access policy, healthcare threat assessment, or remote-care risk acceptance | Clinical governance and privacy/security owners — `CLINICAL ACTION`, `PRIVACY ACTION`, `LEGAL ACTION` | Sample health-data access, disclosure, remote-care, retention, incident, workforce, and vendor controls; validate clinical context with qualified reviewers | Review patient/service-user risk, clinical incidents, access exceptions, supplier performance, workforce competence, and control effectiveness | This map cannot establish healthcare conformity; clinical and legal governance plus operational evidence are absent |
| ISO 22301:2019 + Amd 1:2024 — BCMS | Recovery scripts, backups, health checks, rollback boundaries, restore-test automation | No approved BCMS scope, business impact analysis, maximum tolerable disruption, RTO/RPO, continuity strategies, crisis communications, succession, exercise program, or corrective-action history | Executive continuity sponsor — `OWNER ACTION`; technical recovery — `INFRASTRUCTURE ACTION` | Audit BIA inputs, continuity plans, exercises, supplier dependencies, recovery evidence, nonconformities, and corrective actions | Review disruption risks, BIA changes, exercise outcomes, supplier resilience, resource sufficiency, and improvement plan | No complete BCMS cycle, owner-approved recovery objectives, exercise record, internal audit, or management review |
| ISO/IEC 27031:2025 — ICT readiness | Mongo/Redis/API health checks, immutable release records, restore isolation, monitoring and recovery scripts | No service dependency map tied to recovery objectives, capacity/failover strategy, alternate-site decision, communications dependency plan, or end-to-end recovery-time evidence | Infrastructure/reliability owner — `INFRASTRUCTURE ACTION`; objectives — `OWNER ACTION` | Test selected disruption scenarios against approved recovery objectives and validate evidence integrity | Review achieved recovery times, failure modes, dependency changes, exercise actions, and investment decisions | Guidance cannot be claimed implemented until business objectives and repeated ICT recovery exercises exist |
| ISO/IEC 27017:2015 — cloud service controls | Cloudflare tunnel boundary, GitHub CI, optional vendor integrations, source-controlled deployment model | No cloud service inventory approved by owner, customer/provider responsibility matrix, tenant/configuration baseline, administrative access review, supplier monitoring, data location, portability, or exit plan | Cloud service owner — `OWNER ACTION`, `INFRASTRUCTURE ACTION`, `VENDOR ACTION` | Audit each cloud service against the responsibility matrix, contract, configuration, access, logging, change, and exit controls | Review supplier assurance, incidents, service changes, concentration risk, locations, and exit readiness | Current edition must be confirmed at audit start; edition 2 is not the basis until ISO publishes it; supplier evidence is incomplete |
| ISO/IEC 27018:2025 — public-cloud PII processors | Data minimization and encrypted application fields; vendor gates can be disabled | No proven public-cloud processor inventory, processing instructions, disclosure/subprocessor transparency, return/deletion commitments, government-request process, breach duties, or independent supplier assurance | Privacy/vendor owners — `PRIVACY ACTION`, `LEGAL ACTION`, `VENDOR ACTION` | Sample contracts, instructions, access, disclosures, deletion/return tests, incidents, and subprocessor changes | Review processor compliance, location/subprocessor changes, requests, deletion evidence, incidents, and residual risk | No complete processor contract/evidence pack; Menorah's controller/processor roles require legal validation |

## Evidence location and gap classification by standard

This table separates missing controls, policies and operational records. A
repository path proves only that an engineering artifact exists; it does not
prove that a control operated in production.

| Standard | Existing technical controls | Repository evidence location | Missing controls | Missing policies | Missing operational records | Control owner | Internal audit | Management review | Certification / assurance blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ISO/IEC 27001:2022 + Amd 1:2024 | Release gates, access boundaries, encryption, audit, monitoring and recovery mechanisms | [security verification](06-security-verification.md); [release runbook](08-release-runbook.md); [access matrix](24-access-and-ownership-matrix.md) | Approved asset/control inventory, risk treatment and effectiveness cycle | ISMS scope, policy hierarchy, risk method, Statement of Applicability and objectives | Risk register decisions, training, access reviews, supplier reviews, corrective actions | Executive ISMS sponsor and security owner — `OWNER ACTION` | Independent risk-based audit of the management system and sampled controls | Scope, risks, objectives, incidents, audit results, resources and improvements | No complete ISMS cycle, internal audit, management review or accredited assessment |
| ISO/IEC 27701:2025 | Versioned consent, rights requests, legal holds, retention framework and restricted administration | [India privacy map](18-india-privacy-readiness-map.md); [privacy runbook](../../menorah/backend/docs/privacy-data-rights-runbook.md); [data-flow inventory](03-data-flow-inventory.md) | Approved controller/processor map, privacy risk treatment and processor oversight | PIMS scope, notices, purpose/lawful-basis position, rights/children/transfer/retention policies | Rights-case samples, consent/withdrawal evidence, processor deletion tests and complaint metrics | Privacy lead, counsel and executive sponsor — `PRIVACY ACTION`, `LEGAL ACTION`, `OWNER ACTION` | Sample the full lifecycle, processor oversight and corrective actions | Privacy objectives, requests, breaches, suppliers, legal change and residual risks | No approved PIMS governance or operated evidence cycle |
| ISO 27799:2025 | Pre-assignment minimization, assigned-care authorization, encrypted sensitive payloads and no-recording default | [data-flow inventory](03-data-flow-inventory.md); [security verification](06-security-verification.md); [owner plan](13-owner-action-plan.md) | Clinical access review, emergency-access design and healthcare threat treatment | Health-information classification, clinical-record, workforce-confidentiality and remote-care policies | Clinical access samples, workforce competence, exceptions, incidents and supplier reviews | Clinical, privacy and legal owners — `CLINICAL ACTION`, `PRIVACY ACTION`, `LEGAL ACTION` | Qualified reviewers sample health-data access, disclosure, retention and remote-care controls | Service-user risk, clinical incidents, exceptions, suppliers and competence | Clinical/legal governance and operational health-control evidence are absent |
| ISO 22301:2019 + Amd 1:2024 | Guarded rollback/recovery, signed backups, restore isolation, health checks and alert design | [backup/restore runbook](10-backup-and-restore-runbook.md); [rollback runbook](09-rollback-runbook.md); [incident runbook](11-incident-response-runbook.md) | Approved BIA, dependency tolerances, continuity strategy and alternate communications | BCMS scope, continuity, crisis-communications, succession and exercise policies | Exercised RTO/RPO results, disruption records, supplier exercises and corrections | Executive continuity sponsor — `OWNER ACTION`; technical owner — `INFRASTRUCTURE ACTION` | Audit BIA inputs, plans, exercises, dependencies and corrections | Disruption risks, BIA changes, exercises, suppliers, resources and investment | No complete BCMS cycle, approved objectives or exercise history |
| ISO/IEC 27031:2025 | Service health gates, immutable artifacts, isolated restore and guarded post-migration resume | [architecture](02-current-architecture.md); [release runbook](08-release-runbook.md); [monitoring runbook](12-monitoring-and-alerting-runbook.md) | Objective-linked dependency map, failover/capacity strategy and alternate-site decision | ICT-readiness, recovery-priority and communications-dependency policies | Repeated end-to-end recovery times, failure-mode evidence and action closure | Infrastructure/reliability owner — `INFRASTRUCTURE ACTION`; objectives — `OWNER ACTION` | Test disruption scenarios against approved objectives and evidence integrity | Recovery results, dependency change, unresolved failure modes and investment | Business objectives and repeated ICT recovery exercises are absent |
| ISO/IEC 27017:2015 | Tunnel boundary, digest-pinned runtime images, read-only CI and vendor feature gates | [architecture](02-current-architecture.md); [vendor register](23-service-and-vendor-register.md); [external actions](14-external-vendor-action-plan.md) | Approved cloud inventory, responsibility matrix, tenant baseline, exit/portability and access review | Cloud use, shared-responsibility, configuration and supplier-exit policies | Supplier assurance, admin-access reviews, configuration checks, location and exit tests | Cloud owner — `OWNER ACTION`, `INFRASTRUCTURE ACTION`, `VENDOR ACTION` | Audit each service against responsibility, contract, configuration, logs and exit | Supplier changes, incidents, concentration, locations and exit readiness | Applicable edition/scope and supplier evidence remain unapproved |
| ISO/IEC 27018:2025 | Data minimization, encrypted fields, disabled optional processors and deletion workflow hooks | [data-flow inventory](03-data-flow-inventory.md); [vendor register](23-service-and-vendor-register.md); [privacy map](18-india-privacy-readiness-map.md) | Verified processor inventory, instructions, disclosure/subprocessor and return/deletion controls | Public-cloud PII processing, government-request, breach-duty and deletion/exit policies | Contracts, assurance reports, disclosure logs, deletion/return tests and subprocessor-change records | Privacy/vendor owners — `PRIVACY ACTION`, `LEGAL ACTION`, `VENDOR ACTION` | Sample contracts, instructions, disclosures, access, deletion, incidents and changes | Processor performance, locations, requests, deletion, incidents and residual risk | Controller/processor roles and a complete processor evidence pack are absent |

## Required management-system evidence

The repository cannot generate these records on behalf of management:

1. `OWNER ACTION`: approve scope, policy, objectives, risk appetite, roles,
   resources, RTO/RPO, and accepted residual risks.
2. `LEGAL ACTION` and `PRIVACY ACTION`: approve the legal register, privacy
   roles, notices, data inventory, retention, transfer and processor controls.
3. `CLINICAL ACTION`: approve health-information and counsellor governance.
4. `INFRASTRUCTURE ACTION`: collect dated operational evidence from the actual
   in-scope environment without exposing secrets.
5. `VENDOR ACTION`: obtain contracts, subprocessors, data locations,
   assurance reports, incident terms, deletion and exit evidence.
6. `VAPT ACTION`: perform an independent scoped assessment and verify closure.
7. Establish an internal-audit program independent of the work audited; retain
   scope, criteria, samples, findings, corrections and effectiveness checks.
8. Hold and minute management reviews only after sufficient operating evidence
   exists. Decisions must identify owner, due date, resources and accepted risk.
9. Select an accredited certification body only after the system has operated
   through at least one complete internal-audit and management-review cycle.

## Conclusion

Repository engineering provides useful control design evidence, but the
management systems, operational records and independent assurance needed for an
ISO claim do not yet exist. Menorah must not advertise certification,
conformity, or audit readiness based on this map.
