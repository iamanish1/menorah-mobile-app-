# Staging prerequisites

Runtime candidate SHA: `3fb99858c6766a341bb7b7dab2377195427f0ea1`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Complete every P0 prerequisite before deployment. Record evidence IDs from
[13-evidence-index.md](./13-evidence-index.md); a checked box without evidence
is not a pass.

## Isolation declaration

| Control | Required staging condition | Owner/action | Evidence |
| --- | --- | --- | --- |
| Host | Dedicated approved Linux host or VM, not a production node and not sharing its Docker daemon | `INFRASTRUCTURE ACTION` | Host inventory, FQDN, instance ID and signed approval |
| Network | Separate network/security group; no route to production MongoDB, Redis, private services or storage | `INFRASTRUCTURE ACTION` | Diagram, route/firewall export and denied-connectivity test |
| Domains | Staging-only application, API, call and callback hostnames; no production hostname resolves to the host | `INFRASTRUCTURE ACTION` | DNS/TLS inventory and external resolution |
| Cloudflare | Dedicated staging tunnel/account scope or approved direct staging ingress; never a production tunnel token | `INFRASTRUCTURE ACTION`; `VENDOR ACTION` | Redacted route export and account owner |
| MongoDB | Dedicated disposable staging replica set and separate app, backup, restore and monitor identities | `INFRASTRUCTURE ACTION` | Instance/replica identity and role proof |
| Redis | Dedicated disposable staging instance and least-privilege monitoring access where enabled | `INFRASTRUCTURE ACTION` | Instance identity, ACL proof and denied production route |
| Storage | Staging-only uploads, backup, evidence and log roots; no production mount, bucket or volume | `INFRASTRUCTURE ACTION` | Mount/volume inventory |
| Data | Generated synthetic fixtures only; no production snapshot, export, log bundle or media | QA owner; `PRIVACY ACTION` oversight | Fixture manifest and provenance attestation |
| Providers | Test/sandbox accounts and callbacks only; optional provider disabled until its evidence is complete | `VENDOR ACTION` | Account-mode screenshot/export and callback inventory |
| Email | Dedicated lowercase staging domain; sender, contact sink, every synthetic account and every backend outbound recipient use that exact domain; off-domain delivery fails before provider dispatch | `INFRASTRUCTURE ACTION`; QA/security; `VENDOR ACTION` | Redacted domain review, provider inventory and off-domain negative test |
| Alerts | Non-production receiver and named staging responder; controlled test approved | `INFRASTRUCTURE ACTION`; `OWNER ACTION` | Receiver approval and rota |
| Mobile | Preview/internal build profiles point only to staging and sandbox providers | `APPLE ACTION`; `GOOGLE ACTION` | Resolved config and signed-build identity |

The staging owner and infrastructure operator must sign:

> We verified that this host, its networks, databases, cache, storage, domains,
> provider credentials and alert receiver are staging-only. No production
> data, credentials, snapshot, domain, provider live mode or host is in scope.

Record signer, UTC time and evidence ID outside Git.

## People and approvals

- [ ] Engineering release owner and alternate are named.
- [ ] QA lead and test-data custodian are named.
- [ ] Staging infrastructure operator and database/recovery owner are named.
- [ ] Security lead and independent VAPT contact are named.
- [ ] Payment/finance sandbox owner is named.
- [ ] Privacy and clinical escalation contacts are named.
- [ ] A staging incident channel, responder and abort authority are named.
- [ ] The change record allows destructive tests only against the identified
      disposable staging targets.
- [ ] Required `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`,
      `CLINICAL ACTION`, `VENDOR ACTION`, `APPLE ACTION` and `GOOGLE ACTION`
      inputs are either approved or explicitly marked blocked.

See the [access and ownership matrix](../24-access-and-ownership-matrix.md) and
[owner action plan](../13-owner-action-plan.md). Do not invent missing policy
to unblock a test.

## Host prerequisites

- Supported Ubuntu host, synchronized UTC time and current security updates.
- Docker Engine with Compose v2, Git, Bash, OpenSSL, Node/npm and the native
  tools required by the candidate scripts.
- Capacity for two MongoDB datasets, application images, staging uploads,
  encrypted backups, recovery artifacts, monitoring and retained evidence.
- Protected staging environment files outside Git, owned by the approved
  operator and unreadable by other users.
- Dedicated staging data, backup, deploy-state and log roots; none may resolve
  beneath production paths or through symlinks.
- Staging backup timers and Alertmanager destination installed through a
  reviewed staging change before the guarded release rehearsal.
- Egress restricted to approved package registries and sandbox providers.
- Inbound exposure restricted to the approved staging domains and operator
  access. MongoDB, Redis, Prometheus, Grafana, Loki and exporters are not
  public.

Use [the production update runbook](../../../menorah/docs/production-update-runbook.md)
as the source for software and guarded-host requirements, substituting only
approved staging-scoped paths and credentials.

## Candidate identity gate

Run the following read-only commands on the desktop and again on the approved
staging checkout. Save outputs with UTC time.

```bash
set -euo pipefail

readonly RUNTIME_SHA='3fb99858c6766a341bb7b7dab2377195427f0ea1'
readonly CANDIDATE_BRANCH='release/final-production-readiness'
: "${APPROVED_PR_HEAD_SHA:?Set the externally recorded final docs/PR-head SHA}"
readonly APPROVED_PR_HEAD_SHA

[[ "${RUNTIME_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${APPROVED_PR_HEAD_SHA}" =~ ^[0-9a-f]{40}$ ]]
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
git fetch --prune origin \
  "+refs/heads/${CANDIDATE_BRANCH}:refs/remotes/origin/${CANDIDATE_BRANCH}"
git rev-list --left-right --count \
  "HEAD...origin/${CANDIDATE_BRANCH}"
git diff --check
git diff --check "${RUNTIME_SHA}..${APPROVED_PR_HEAD_SHA}"
git cat-file -t "${RUNTIME_SHA}"
git cat-file -t "${APPROVED_PR_HEAD_SHA}"
git merge-base --is-ancestor "${RUNTIME_SHA}" "${APPROVED_PR_HEAD_SHA}"
git diff --quiet "${RUNTIME_SHA}..${APPROVED_PR_HEAD_SHA}" -- \
  . ':(exclude)docs/production-readiness/staging/**'
```

Pass only when:

- the branch is `release/final-production-readiness`;
- `APPROVED_PR_HEAD_SHA` is the full SHA recorded in the approved external
  change record after the evidence-package commit;
- `HEAD` and the remote branch tip are exactly `APPROVED_PR_HEAD_SHA`;
- runtime SHA `3fb99858c6766a341bb7b7dab2377195427f0ea1` is an ancestor of that
  head and every intervening change is confined to this staging package;
- left/right divergence is `0 0`;
- the worktree is clean and both whitespace checks succeed; and
- both SHAs resolve to Git commits.

The PR-head SHA cannot be written into this tracked package: changing the
value would create a different Git object and therefore a different SHA. The
external record closes that content-addressing boundary without relabelling
runtime evidence.

## Deterministic repository gate

Execute every applicable command in the
[final QA plan](../07-final-qa-plan.md#stage-2--deterministic-repository-checks).
At minimum retain separate results for backend, each web application, mobile,
production QA scripts, Compose/Caddy/shell, dependency audit, secret scanning,
SAST and container/configuration scanning. Record the command, tool version,
pass/fail/skip/blocked counts and evidence reference. A skipped database,
Docker, native-validator or build step remains open.

## Provider and policy prerequisites

- Razorpay and RazorpayX accounts are in test mode, callback URLs are staging
  only, and no live key or bank destination is accessible.
- Resend uses the protected `MENORAH_STAGING_EMAIL_DOMAIN`; every synthetic
  account and outbound recipient uses that exact domain, and reserved
  off-domain negative cases prove provider dispatch is blocked.
- LiveKit and any regional fallback use staging projects/rooms and synthetic
  participants.
- Luxand or another face-check provider is disabled unless sandbox processing,
  notice/consent, deletion and clinical suitability are approved.
- Cloudinary or local media storage is staging-only.
- Refund, cancellation, rescheduling, free/promotional booking and payout
  expectations come from approved decisions; otherwise those cases are
  `OWNER ACTION` blocked.
- Minors, crisis response, qualification sufficiency and face-check
  suitability are `CLINICAL ACTION`/`LEGAL ACTION`, never QA assumptions.

## Entry decision

Deployment entry is **NO-GO** if any isolation control is unknown, any
candidate-identity check fails, a P0 repository gate is failed/skipped, or a
required staging credential/domain/provider has not been independently
identified as non-production.
