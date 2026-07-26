# Menorah immutable-candidate staging validation

Candidate branch: `release/final-production-readiness`

Runtime candidate SHA: `25cd808602020988a09ee9e58cc9d4738cc068c9`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Package status: **local synthetic validation passed; protected Ubuntu staging
evidence not yet collected**

Runtime-candidate push gates are green: release readiness
[30209920365](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920365)
(1/1 jobs, 11/11 steps), functional
[30209920383](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920383)
(9/9 jobs, 89/89 steps), and security
[30209920358](https://github.com/menorahsoftware-cmyk/menorah-mobile-app-/actions/runs/30209920358)
(15/15 jobs, 104/104 steps). All three have zero failed, skipped or canceled
jobs/steps. The local server-staging overlay completed Phase 11 with 22/22
gates passed, 0 failed and 0 blocked. These are repository/CI and local-Docker
results only; no approved Ubuntu/server-staging execution has occurred.

The all-profile static model contains 32 services, six staging networks and 21
staging volumes, with 117 published port instances bound only to loopback. The
default service graph references 19 volumes. After the required migration/seed
lifecycle, the retained runtime used five networks and 20 volumes, including
`staging-migration-temp`, and retained 26 containers: 22 healthy long-running
services and four expected exited-zero one-shots, with zero restarts.
Recovery/all-profile supplies the restore network and
`staging-restore-mongodb` for six networks and 21 volumes. The exact local
release-contract aggregate passed 432/432 assertions: 81 workflow, 59
local-staging and 292 server-staging.

Server-staging discovery, collision review and external evidence remain
**NOT COLLECTED — REPLACEMENT DISCOVERY REQUIRED**. The authoritative co-host design and
Step A–G approval sequence is the
[server-staging design and discovery runbook](../29-server-staging-design-and-discovery-runbook.md).
Evidence for former runtime `0b9f6e484c8e7383f5a9d5fc5c94f37ae7c9cf1a`
is historical and superseded; it must never be relabelled as current.

Superseded pre-overlay verdict:
**LOCAL STAGING VALIDATION PASSED — SERVER STAGING REQUIRED**

Current repository-remediation status:
**SERVER STAGING DESIGN COMPLETE — REPLACEMENT DISCOVERY REQUIRED**

Public-production verdict: **NOT READY**

## Purpose and authority boundary

This package is the executable staging plan for the exact candidate above. It
does not authorize production deployment, production-data access, a provider
live-mode change, DNS or Cloudflare production changes, a store submission, or
a public launch. The package must be executed only on an approved isolated
staging host with synthetic data, dedicated MongoDB and Redis instances,
staging domains and storage, sandbox providers, and a non-production alert
receiver.

The runtime SHA freezes the tested code, configuration and workflow content.
The final docs/PR-head SHA is necessarily later because a Git commit cannot
embed its own content-addressed SHA. Record that full SHA outside Git in the
approved change record after this package is committed. Prove that the runtime
SHA is its ancestor and every intervening changed path is under `docs/**` or
`menorah/docs/**`, but deploy only the exact runtime SHA. The server-staging
checkout, script-blob checks, images and release markers must never be
relabelled to the later documentation head. The exact documentation HEAD is
recorded in the draft PR because a commit cannot embed its own SHA.

The sixth network is a staging-only egress bridge. It is ordinary NAT-capable
egress, not a destination or FQDN allowlist; target-host firewall or proxy
restriction remains required evidence. Only Alertmanager, the four APIs and
the user web service join it; the worker, migration and seed services do not.
Razorpay secrets are scoped only to `api-ios`, RazorpayX secrets only to
`api-admin`, and the Resend webhook secret only to `api-web`. Worker, migration
and seed receive no provider secret. The non-secret booking catalog is shared
with the seven backend services that require it.

The server-staging overlay does not contain the production Docker metrics
gateway/exporter pair or Uptime Kuma. Its local monitoring result is 35/35
healthy Prometheus targets, 69 rules and all 20 required P0 fixtures fired and
resolved. Production Docker telemetry and Uptime Kuma remain separate
infrastructure evidence; they are not implied by this local result.

All synthetic accounts and every outbound email recipient must use the exact
protected `MENORAH_STAGING_EMAIL_DOMAIN`; any other recipient must fail closed
before a provider request.

Never use production credentials, production database snapshots, production
media, real patient or counsellor records, or real payment instruments. Do not
copy redacted-looking production data: create synthetic fixtures instead.

The operating source of truth remains:

- [final QA plan](../07-final-qa-plan.md);
- [production release runbook](../08-release-runbook.md);
- [rollback and recovery runbook](../09-rollback-runbook.md);
- [backup and restore runbook](../10-backup-and-restore-runbook.md);
- [incident response runbook](../11-incident-response-runbook.md);
- [monitoring and alerting runbook](../12-monitoring-and-alerting-runbook.md);
- [production go/no-go record](../21-production-go-no-go.md);
- [environment-variable reference](../22-environment-variable-reference.md);
  and
- [immutable candidate record](../26-immutable-candidate-record.md).
- [server-staging design and discovery runbook](../29-server-staging-design-and-discovery-runbook.md).

This staging package links those controls and adds staging execution records;
it does not restate or replace production procedures.

## Required execution order

1. [Staging prerequisites](./01-staging-prerequisites.md)
2. [Redacted environment matrix](./02-staging-environment-matrix.md)
3. [Staging deployment procedure](./03-staging-deployment-procedure.md)
4. [Synthetic data and test accounts](./04-staging-data-and-test-accounts.md)
5. [Functional QA](./05-staging-functional-qa.md)
6. [Security QA](./06-staging-security-qa.md)
7. [Payment and provider sandbox matrix](./07-payment-provider-sandbox-matrix.md)
8. [Backup, restore, migration and recovery](./08-backup-restore-migration-recovery.md)
9. [Monitoring and alert validation](./09-monitoring-alert-validation.md)
10. [Mobile device and store preflight](./10-mobile-device-and-store-preflight.md)
11. [Independent VAPT scope and evidence](./11-vapt-scope-and-evidence.md)
12. [Staging go/no-go](./12-staging-go-no-go.md)
13. [Unified evidence index](./13-evidence-index.md)

The go/no-go record is signed only after the evidence index links every
required result. Pass, fail, skipped and blocked are distinct outcomes.

## Action labels

An item carrying one of these labels is not closed by an engineering test:

- `OWNER ACTION` — product, finance, operations, continuity or risk decision.
- `LEGAL ACTION` — qualified counsel review or approval.
- `PRIVACY ACTION` — privacy governance, data-map, notice or rights approval.
- `CLINICAL ACTION` — clinical safety and professional-governance approval.
- `VAPT ACTION` — independent assessment and closure retest.
- `APPLE ACTION` — Apple account, signing, device, TestFlight or declaration.
- `GOOGLE ACTION` — Play account, signing, track, device or declaration.
- `VENDOR ACTION` — provider account, contract, callback or assurance.
- `INFRASTRUCTURE ACTION` — approved host, network, secrets, monitoring or
  recovery operation.

## Candidate and evidence invalidation

All technical evidence must name the full candidate SHA. If code,
lockfiles, deployment configuration, migrations, generated native projects, or
provider callback behavior changes, stop and issue a new candidate SHA.
Invalidate and rerun every affected downstream repository, staging, recovery,
VAPT, mobile-build and store result. A reviewer may retain unaffected
governance evidence only when the evidence index records the impact decision,
reviewer and date.

Screenshots and exports must show environment identity and UTC time without
showing secrets or personal data. Store evidence outside Git in an approved
access-controlled location; put only a reference and, where appropriate, a
SHA-256 digest in [the evidence index](./13-evidence-index.md).

## Universal stop conditions

Stop immediately if any of these occurs:

- the reviewed documentation head is not on
  `release/final-production-readiness`, is not the externally approved
  docs/PR-head SHA, does not descend from the frozen runtime SHA, or has an
  intervening change outside `docs/**` or `menorah/docs/**`;
- the prepared server application checkout, script blob, image manifest or
  release marker differs from exact runtime SHA
  `25cd808602020988a09ee9e58cc9d4738cc068c9`; never deploy the later
  documentation head;
- the worktree is unexplained or a tested artifact cannot be tied to the SHA;
- a hostname, database, Redis endpoint, storage bucket, callback or credential
  may be production;
- a test contains real personal, mental-health, biometric or payment data;
- an isolated restore or migration target cannot be proved before execution;
- a command requests a secret on the command line or would print a secret;
- a P0 test fails, is skipped, or produces conflicting evidence;
- writers cannot be proved stopped at a destructive boundary; or
- an incident or unexpected external side effect occurs.

Preserve redacted evidence, open a defect or incident as appropriate, and do
not turn an unknown result into a pass.
