# Owner action plan

Last reviewed: 2026-07-23.

## How to use this plan

The public-release verdict is **NOT READY**. Every row is pending unless a
dated, approved evidence link is added. Code and templates do not make the
business, legal, privacy or clinical decision.

“Block” means the decision or evidence must exist before the stated release.
The conservative recommendation is a safe interim position, not an invented
company policy. Qualified Indian counsel and the privacy/clinical owners must
approve their domains.

## Privacy, consent, age and retention

| Checklist item | What must be decided and why | Conservative recommendation | Where documented/configured | Evidence required | Block |
| --- | --- | --- | --- | --- | --- |
| [ ] `OWNER ACTION` + `LEGAL ACTION` + `PRIVACY ACTION`: privacy notice | Approve purposes, data categories, sharing, rights, contacts and effective version so user consent is truthful | Do not collect optional sensitive data or launch publicly until a published notice matches actual flows | `18-india-privacy-readiness-map.md`; backend consent/version configuration | Signed notice, version/effective date, public URL and product mapping | Public launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION`: KYC/ordinary face-check notice | Approve necessity, purpose, data/vendor use, human review, withdrawal and retention for face checks | Keep face-check/KYC activation closed until notice and consent evidence are approved | environment reference; privacy/KYC services; India map | Signed legal/privacy/clinical notice and tested versioned-consent record | Any face-check use |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION`: counsellor consent notice | Approve onboarding/verification terms, credential processing, declarations and version | Keep counsellors in non-approved states without recorded current consent | counsellor verification state/consent configuration | Approved notice/version plus sampled timestamp/source evidence | Counsellor activation |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION`: minimum user age | Select a legally and clinically defensible minimum age | Do not permit uncertain-age registrations until counsel/clinical review completes | registration policy and public terms | Signed decision, implementation and boundary tests | Public launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION`: whether minors are allowed | Decide whether the service will serve minors and in which functions/jurisdictions | Exclude minors until the complete safeguarding and consent model is ready | age/minors policy; India map | Legal/clinical/privacy approval and product enforcement | Public launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION`: parental-consent process | If minors are allowed, decide verification, authority, revocation, child rights and emergency handling | Do not serve minors without a tested verifiable process | registration, consent, deletion/correction and support procedures | End-to-end staging evidence and approved notices | Minor use |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`: data retention by category | Set periods/triggers for account, chat, booking, clinical, face, payment, payout, audit, support, log, backup and deletion evidence | Minimize optional data; use configurable holds; do not promise immediate universal deletion | privacy rights runbook, worker retention config, backup/log docs | Signed schedule, legal basis, hold/exceptions and tested jobs | Public launch |

## Counsellor and clinical safety

| Checklist item | What must be decided and why | Conservative recommendation | Where documented/configured | Evidence required | Block |
| --- | --- | --- | --- | --- | --- |
| [ ] `OWNER ACTION`; `CLINICAL ACTION`; `LEGAL ACTION`: counsellor qualifications | Define sufficient qualifications for each service and jurisdiction | No self-declared qualification may activate a counsellor | verification states and admin review workflow | Approved matrix and reviewer training | Counsellor activation |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION`: counsellor credential evidence | Define acceptable documents, authenticity checks, minimization and access | Require verified metadata/evidence before approval; restrict raw documents | KYC/verification models and admin permissions | Evidence checklist, access review and sample decision | Counsellor activation |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `CLINICAL ACTION`: renewal and suspension | Set expiry, renewal timing, failed-review, suspension and appeal rules | Expire access safely; suspended/expired counsellors cannot accept or access active work except approved handoff | verification state machine and booking authorization | Approved state policy and transition tests | Counsellor activation |
| [ ] `OWNER ACTION`; `CLINICAL ACTION`; `LEGAL ACTION`: crisis and suicide-risk escalation | Define scope, disclaimers, responder training, jurisdiction-aware emergency route and documentation | Do not claim emergency service or automated clinical intervention; use approved human escalation | app safety copy, support workflow, incident runbook | Clinical/legal policy, training and tabletop evidence | Public launch |

## Contacts and incident obligations

| Checklist item | What must be decided and why | Conservative recommendation | Where documented/configured | Evidence required | Block |
| --- | --- | --- | --- | --- | --- |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`: grievance contact | Name the role/channel, coverage and escalation for complaints and rights | Publish only a real monitored channel with an alternate | public privacy/terms/support surfaces; India map | Public URL/contact test, ownership and response procedure | Public launch/store |
| [ ] `OWNER ACTION`; `PRIVACY ACTION`: privacy contact | Name the person/role authorized to receive privacy requests and incidents | Separate privacy case access from general support | privacy rights runbook and access matrix | Named primary/alternate, monitored channel and access review | Public launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `INFRASTRUCTURE ACTION`: CERT-In reporting responsibility | Appoint the contact and legal decision path for potentially reportable incidents | Treat the six-hour classification path as urgent; escalate immediately to counsel | incident runbook and India map | Designation, alternate, legal matrix and tabletop timestamp evidence | Public launch |
| [ ] `OWNER ACTION`; `INFRASTRUCTURE ACTION`: on-call responsibility | Set primary/alternate rota, acknowledgement/escalation targets and authority | No unattended public launch; critical alerts page a human immediately | monitoring and incident runbooks | Rota, test alert acknowledgement and handoff record | Public launch |

## Booking, payment and payout policy

| Checklist item | What must be decided and why | Conservative recommendation | Where documented/configured | Evidence required | Block |
| --- | --- | --- | --- | --- | --- |
| [ ] `OWNER ACTION`; `LEGAL ACTION`: refund policy | Define eligible states, amounts, windows, exceptions and authority | Keep unsupported automatic refund paths off; require reconciliation and manual review | payment reconciliation runbook and public terms | Approved policy, state mapping and test cases | Paid launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`: cancellation policy | Define who may cancel, when, consequences and refund relationship | Reject ambiguous/terminal transitions and show no unsupported promise | booking/payment state machines and terms | Approved matrix and transition tests | Paid booking launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`: rescheduling policy | Define windows, limits, consent and payment effect | Do not auto-reschedule or alter price without explicit server rules | booking state machine and support procedure | Approved rules and concurrency tests | Booking launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`: free/promotional booking policy | Define authorized entitlements/codes, funding, limits and audit | No client-selected zero/free path; require explicit server-side approval | authoritative pricing/promotion service | Approved promotion types and tampering/replay tests | Booking launch |
| [ ] `OWNER ACTION`: payment reconciliation owner | Name daily/event-driven reconciliation and incident owners | Keep live payment gate closed until mismatches are owned and recoverable | payment reconciliation runbook and alerts | Named primary/alternate, sandbox exercise and signed report | Paid launch |
| [ ] `OWNER ACTION`: payout review policy | Define request/approval separation, cap, exceptions and failed recovery | Preserve two different admins, fresh MFA and the approved ₹50,000 cap; no self-approval | payout state machine, finance permissions and alerts | Approved procedure, account assignments and failure/replay tests | Payout enablement |
| [ ] `OWNER ACTION`: finance/support/content/admin roles | Assign least-privilege profiles and full-admin exceptions | Give each person only one minimum routine profile; separately grant privacy tasks | admin authorization doc and access matrix | Named assignments, MFA, runtime grant review and stale-session test | Admin/public launch |

## Continuity and backup custody

| Checklist item | What must be decided and why | Conservative recommendation | Where documented/configured | Evidence required | Block |
| --- | --- | --- | --- | --- | --- |
| [ ] `OWNER ACTION`: RTO and RPO | Set tolerable outage and data-loss objectives for each critical service | Do not claim objectives until timed restore/rollback exercises meet them | rollback and backup/restore runbooks | Signed objectives and timed staging/live-format exercise | Public launch |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `INFRASTRUCTURE ACTION`: off-site backup location | Select jurisdiction/provider, access, redundancy, retention and exit | Store only encrypted/signed copies; separate archive and key custody | backup runbook and vendor register | Contract/location, inventory, retrieval and deletion evidence | Public launch |
| [ ] `OWNER ACTION`; `INFRASTRUCTURE ACTION`: backup key custody | Assign primary/alternate encryption and HMAC/recovery custodians | Separate keys and archive access; test recovery without exposing values | backup runbook and access matrix | Custody register, access review and recovery exercise | Public launch |

## Account and vendor ownership

| Checklist item | What must be decided and why | Conservative recommendation | Where documented/configured | Evidence required | Block |
| --- | --- | --- | --- | --- | --- |
| [ ] `OWNER ACTION`; `VENDOR ACTION`: vendor account ownership | Name business/technical owner and alternate for every enabled provider | Keep optional vendors disabled until ownership, contract, privacy/security and exit evidence exist | vendor register and external action plan | Completed provider pack and quarterly review date | Relevant feature/public launch |
| [ ] `OWNER ACTION`; `APPLE ACTION`: Apple account ownership | Assign organization, App Store, signing, recovery and submission roles | Use unique MFA accounts; keep signing credentials only in approved custody | App Store checklist and access matrix | Account/role review, recovery test and signed-build record | iOS submission |
| [ ] `OWNER ACTION`; `GOOGLE ACTION`: Google account ownership | Assign Play Console, Play App Signing, upload-key, recovery and release roles | Freeze release until exposed-signing incident is closed | Play checklist and security incident record | Account/role review, key reset/invalidity and signed-track evidence | Android submission |
| [ ] `OWNER ACTION`; `INFRASTRUCTURE ACTION`; `VENDOR ACTION`: Cloudflare/domain ownership | Assign registrar, DNS, Tunnel, recovery and change approvers | Two-person review for public routing; preserve account recovery | Cloudflare runbook, vendor register and access matrix | Account roles, route comparison, TLS and recovery test | Public launch |
| [ ] `OWNER ACTION`; `VENDOR ACTION`: Razorpay/RazorpayX ownership | Assign business, finance, webhook, dispute, refund and payout owners | Keep payment/payout gates closed until sandbox and reconciliation evidence exists | payment runbook, vendor register and environment reference | Contract/account roles, webhook/rotation/reconciliation tests | Paid launch |
| [ ] `OWNER ACTION`; `VENDOR ACTION`: Resend ownership | Assign domain, sender, delivery, bounce and incident owners | Send only minimal content; do not enable without monitored delivery/failure path | vendor register and email configuration | Domain/sender proof, sandbox delivery/bounce and retention review | Email-dependent launch |
| [ ] `OWNER ACTION`; `VENDOR ACTION`: LiveKit ownership | Decide self-hosted responsibility and any external fallback/provider | Default no recording; disable unapproved provider fallback | call service, vendor register and access matrix | Host/network/call authorization and incident evidence | Call feature |
| [ ] `OWNER ACTION`; `LEGAL ACTION`; `PRIVACY ACTION`; `CLINICAL ACTION`; `VENDOR ACTION`: Luxand ownership | Decide whether face processing remains enabled and who owns accuracy/privacy/vendor risk | Disable if legal/privacy/clinical/vendor evidence is incomplete | KYC config, India map and vendor register | Contract, processing/location/deletion/accuracy evidence and staged test | Face-check feature |

## Independent assurance and release authority

| Checklist item | What must be decided and why | Conservative recommendation | Where documented/configured | Evidence required | Block |
| --- | --- | --- | --- | --- | --- |
| [ ] `OWNER ACTION`; `VAPT ACTION`: final VAPT provider | Select an independent qualified provider, scope, rules and retest | Test the immutable staging candidate including API, auth, admin, WebSockets, payments, SSRF, mobile and infrastructure | security verification plan, vendor register and go/no-go | Contract/scope, final report, fixes and closure retest | Public launch |
| [ ] `OWNER ACTION`: ISO certification body | Decide whether/when to pursue certification and select an appropriately qualified independent body | Do not market certification; operate controls and complete internal audit/management review first | ISO evidence map and vendor register | Selection due diligence and formal engagement when ready | Certification claim, not engineering launch by itself |
| [ ] `OWNER ACTION`: limited-pilot approval | Define cohort, geography, features, data/payment limits, support, rollback and stop conditions | No pilot until P0 safety gates, owner/legal/privacy/clinical sign-offs and monitoring/on-call are complete | go/no-go, QA and release plans | Signed scope, residual risks, evidence pack and stop authority | Limited pilot |
| [ ] `OWNER ACTION`: public-launch approval | Accept only documented residual risk after all gates and external evidence | Keep verdict `NOT READY` until every public-launch blocker closes | `21-production-go-no-go.md` and handover checklist | Signed approvals from product, engineering, infrastructure, security, finance, legal, privacy, clinical and stores | Public launch |

## Recommended order

1. Assign accountable owners, alternates and restricted evidence locations.
2. Decide age/minors, clinical scope, notices, retention and policy boundaries.
3. Close backup, incident, monitoring and vendor ownership.
4. Close payment/payout and mobile-signing incidents before enabling money or
   store distribution.
5. Complete immutable staging QA and independent VAPT/retest.
6. Consider a tightly scoped limited pilot only after its own signed go/no-go.
7. Approve public launch separately; pilot approval is not public approval.

No row in this plan is marked complete by this repository change.
