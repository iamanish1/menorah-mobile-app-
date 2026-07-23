# Access and ownership matrix

Last reviewed: 2026-07-23.

## Status

This file defines roles to be assigned; it does not name people, grant access
or prove that access is active. Production launch is blocked until the owner
assigns primary and alternate accountable people, and infrastructure produces a
dated least-privilege access review.

Principles:

- unique human accounts; no shared administrator credentials;
- least privilege and need-to-know/use;
- MFA for every privileged vendor and operational account;
- separation between request, approval and execution where money, production
  changes, deletion or break-glass access is involved;
- service identities cannot be used for interactive human administration;
- access is time-bound where practical, logged, reviewed and revoked promptly;
- health, privacy and finance access remain separate;
- evidence stores and backups are not a second ungoverned copy of production
  data.

## Accountable governance roles

| Role to assign | Accountable decisions | Must not self-approve | Required evidence |
| --- | --- | --- | --- |
| Product owner | Launch scope, product policies, residual business risk | Public launch without legal/privacy/clinical/security/infrastructure sign-off | `OWNER ACTION`: signed decision record |
| Release manager | Candidate SHA, change window, release/rollback coordination | Own unreviewed code or bypass evidence | Change ticket, approvals, release record |
| Infrastructure owner | Host, networking, secrets injection, databases, monitoring and recovery | Business policy or legal conclusions | `INFRASTRUCTURE ACTION`: access review and live evidence |
| Security owner / incident lead | Security controls, incidents, audit evidence, vulnerability treatment | Independent VAPT result or legal notification decision alone | Incident rota, risk register, exercises |
| CERT-In point of contact | Regulatory interface and current contact details | Sole incident decision without incident/legal lead | `INFRASTRUCTURE ACTION`, `LEGAL ACTION`: designation confirmation |
| Privacy owner / grievance owner | Notices, rights cases, retention operation, processors and complaints | Legal interpretation or clinical record disposition alone | `PRIVACY ACTION`: case process and access review |
| Indian legal counsel | Applicable law, notices, retention, disclosures, transfers and incident advice | Technical control operation | `LEGAL ACTION`: written approved advice |
| Clinical governance owner | Counsellor evidence, clinical data/safety, crisis and minors | Production access or legal conclusion alone | `CLINICAL ACTION`: approved clinical policies |
| Finance/payment owner | Payment/payout policy, reconciliation, refunds and dual control | Request and approve the same payout/correction | `OWNER ACTION`: policy and reviewer assignments |
| Backup/key custodians | Backup operation and independent recovery-key custody | One person controlling archive and all recovery secrets | Custody register and recovery exercise |
| Apple release owner | Apple account, signing and store evidence | Engineering-only public submission | `APPLE ACTION`: account/build/store record |
| Google release owner | Google account, signing and Play evidence | Engineering-only public submission | `GOOGLE ACTION`: account/build/store record |
| Vendor owner | Contract, account, risk, service and exit | Provider approval without legal/privacy/security review | `VENDOR ACTION`: completed provider pack |
| Independent assessor | VAPT/internal audit as scoped | Audit of their own implementation work | `VAPT ACTION` or internal-audit independence record |

## Application authorization

The source-level details are in
[administrator operational authorization](../../menorah/backend/docs/admin-operational-authorization.md).
Production assignments remain an `OWNER ACTION`.

| Application role/profile | Permitted scope | Explicitly excluded | Additional controls |
| --- | --- | --- | --- |
| User | Own account, bookings, privacy requests and assigned interactions | Other users, admin APIs, counsellor/finance operations | Current active account/session, object authorization |
| Counsellor | Own profile/earnings and assigned authorized bookings/interactions | Full unassigned sensitive previews, other counsellors, admin/finance control | Approved/non-suspended verification, assignment and booking state |
| Support | User/account support read and bounded booking/call-link support | Finance, clinical review, privacy administration, content, platform telemetry | `support` mapping; fresh MFA for sensitive support mutation |
| Finance | Revenue/payout read, payout request and approval permissions | Clinical, support records, privacy content, platform telemetry | `finance` mapping; two different admins and fresh MFA for payout approval |
| Content | Article and Social Studio content | User support, finance, clinical, privacy, platform telemetry | `content` mapping; approved vendor/content policy |
| Full administrator | Clinical, privacy and platform functions plus other admin permissions | No exemption from object checks, fresh MFA, dual control or audit | Fewest assignments practical; live DB account plus `admin` mapping |
| Privacy administrator | Separate explicit task grants to approved active full administrators | Operational role mapping alone cannot grant privacy access | Separate privacy grant map, per-request permission check, fresh MFA |

All administrator records currently carry the legacy application-database
field value `role: admin`, while the required `ADMIN_ROLE_GRANTS_JSON` mapping
narrows their runtime operational profile. This field is not a MongoDB
authorization role.
`PRIVACY_ADMIN_PERMISSION_GRANTS_JSON` is a separate authority and cannot
override that profile. Missing, stale or invalid mappings must fail closed.

## System access matrix

| System/data | Routine human access | Service access | Approval / separation | Review and evidence |
| --- | --- | --- | --- | --- |
| GitHub repository/settings | Named engineers; settings limited to repository owners | CI identity with minimum read/check permissions; no production deploy credential | PR reviewer differs from last pusher; emergency bypass documented | `OWNER ACTION`: quarterly and event-driven ruleset/member/token review |
| Production release | Release manager and infrastructure operator in approved window | Guarded deployment script only | Reviewed SHA; change approval; no push-to-production workflow | Release record, host transcript redacted of secrets |
| Production host/root | Named infrastructure break-glass operators | Container runtime/systemd service accounts | Time-bound elevation; incident/change reference | `INFRASTRUCTURE ACTION`: monthly privileged access review |
| Secret store/files | Named secret custodians; read only when operationally required | Per-service mounted/injected secrets | Rotation approved; recovery custody separated | Name/version/access evidence, never values |
| MongoDB root | DBA break-glass only | Bootstrap/reconciliation maintenance | No application use; approved change; writers stopped for credential rotation | Root-use audit and exact-role verification |
| MongoDB application identity | No human use | API and worker only; `readWrite@menorah` direct role | Credential managed independently | Authentication/role proof and rotation record |
| MongoDB backup identity | Backup operator only through tooling; no interactive browsing | Backup tooling; `backup@admin` | Archive access and key custody separated | Backup log and role proof |
| MongoDB restore identity | Approved recovery operators only | Restore tooling; scoped `readWrite` + `dbAdmin` on `menorah` | Destructive restore requires owner/change approval and writers stopped | Restore record and role proof |
| MongoDB monitoring identity | Infrastructure monitoring owner | Exporter; `clusterMonitor@admin` + `read@local` | Cannot become backup/app/restore identity | Role and exporter evidence |
| Redis | Infrastructure break-glass only | APIs/worker; exporter with read-only ACL where enabled | No broad monitoring credential | ACL, connection and access log review |
| Backups/off-site copies | Backup custodian; privacy/legal access only for approved recovery/investigation | Scheduled backup/restore tools | Archive custody separated from encryption/recovery key | Inventory, restore test, access and disposition record |
| Audit ledger and logs | Security/incident team; privacy/legal where case requires | APIs append; monitoring reads aggregate signals | Mutation/deletion restricted to break-glass | Chain verification, log-source/access/retention review |
| User/account support data | Support and full admin only as routes permit | APIs | Object/field minimization; export separately authorized | Sample access and security events |
| Clinical/mental-health/face data | Approved full admins and assigned approved counsellors only | Necessary API/worker/vendor path | Clinical/privacy purpose; fresh MFA for review/mutation | `CLINICAL ACTION`, `PRIVACY ACTION`: monthly sample review |
| Finance/payment/bank data | Finance and full admin only as permissions permit | APIs and payment/reconciliation services | Different payout requester/approver; bank changes strongly verified | Finance access and reconciliation review |
| Privacy request payloads | Explicit approved full-admin grants only | API/worker encrypted processing | Per-task permission plus fresh MFA; legal hold separation | Case log, access event and quarterly grant review |
| Monitoring dashboards | Named on-call, platform and security staff | Exporters/collectors | No secret/env/raw Docker inspection endpoints | User/access review and dashboard audit |
| Cloudflare/DNS | Named infrastructure owners, security break-glass | Tunnel connector token only | Two-person review for public route/security change | `INFRASTRUCTURE ACTION`: account and change audit |
| Payment provider | Named finance owner and technical webhook operator | Scoped API/webhook credentials | Refund/payout/change dual control | `VENDOR ACTION`: account, role and webhook evidence |
| Email/call/AI/social vendors | Named vendor owner and minimum operators | Feature-specific scoped credential | Product/privacy/security approval before enablement | Vendor account/scope/token review |
| Apple/Google consoles and signing | Named store owner plus alternate | CI/EAS only if explicitly approved | Signing custody separated from content approval/submission | `APPLE ACTION`, `GOOGLE ACTION`: quarterly and pre-release review |

## Access lifecycle

### Joiner

1. Owner approves role, purpose, environment and expiry.
2. System owner creates a unique account with MFA and minimum permissions.
3. No production data is used for training or testing.
4. User acknowledges security, privacy and clinical/finance duties as
   applicable.
5. Evidence records approver, implementer, timestamp and scope.

### Mover

1. Remove old access before or at role change.
2. Re-evaluate admin runtime mappings and privacy grants independently.
3. Revoke cached sessions/tokens where role or risk changed.
4. Review open cases, approvals, secrets and vendor ownership for transfer.

### Leaver

1. Disable human and vendor accounts promptly under the approved SLA.
2. Revoke sessions, tokens, SSH keys, signing access and recovery channels.
3. Rotate shared/exposed secrets where unique revocation is impossible.
4. Transfer evidence/cases without copying sensitive data into tickets.
5. Verify removal from GitHub, host, Cloudflare, databases, monitoring,
   payment, email, mobile stores and every enabled vendor.

### Break glass

1. Use only for an incident or approved recovery when routine roles are
   insufficient.
2. Require incident/change reference, named approver and time limit.
3. Log actions without secret values or unnecessary personal/health data.
4. Revoke access and rotate exposed credentials afterward.
5. Perform independent review by the next business day or the approved
   incident timetable.

## Review cadence

- Event-driven: every joiner/mover/leaver, suspected compromise, role change,
  vendor change and incident.
- Monthly: host/root, database root/restore, secret store, backup and payment
  privileged access.
- Quarterly: all application admin profiles, privacy grants, GitHub,
  Cloudflare, monitoring, vendors and mobile-store accounts.
- Annually: full role design and segregation-of-duties review, or sooner after
  material architecture/legal/clinical change.

Cadence is an operational baseline, not a data-retention decision.
`OWNER ACTION` must name reviewers and alternates; `LEGAL ACTION`,
`PRIVACY ACTION` and `CLINICAL ACTION` must approve scope where their data is
involved.
