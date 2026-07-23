# Staging security QA

Runtime candidate SHA: `4c82121bfa2293a21a831bc490f4101eb4db1213`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Initial state: **not run**

This is engineering security regression, not independent VAPT. Independent
scope and retest are in
[11-vapt-scope-and-evidence.md](./11-vapt-scope-and-evidence.md).

## Safety and evidence rules

- Test only staging assets named in the approved scope and rules of engagement.
- Use synthetic identities and QA-controlled responder services.
- Do not scan provider infrastructure, shared Cloudflare addresses or any
  production asset.
- Use bounded request rates and safe payloads. Stop on instability, unexpected
  data or out-of-scope access.
- Evidence must identify environment, SHA, UTC time, tool/version, test ID,
  actual result and remediation without containing tokens, cookies, secrets,
  personal data or exploit-ready production details.
- Every P0 failure blocks staging acceptance; every skipped P0 is a failure of
  the gate.

## Repository security commands

Execute the full
[security verification plan](../06-security-verification.md) and Stage 2 of the
[final QA plan](../07-final-qa-plan.md#stage-2--deterministic-repository-checks).
The following are required candidate gates where supported:

```bash
cd menorah/backend
npm run lint
npm test -- --runInBand
npm audit --omit=dev

cd ../scripts/qa
npm ci
npm run test:release-workflow
npm run test:mongo-identities
npm run test:tunnel-config
npm run test:monitoring
```

Also retain approved secret-history, SAST, dependency, SBOM, container and
configuration-scan results. Record unavailable tools as blocked; do not invent
or suppress a result.

## Authenticated DAST procedure

Current state: **BLOCKED / EXTERNAL EVIDENCE NOT COLLECTED**. The GitHub
`staging-security` environment referenced by the workflow is currently absent.
No DAST variables, secrets, protection rules, reviewer decision or run may be
inferred. This package does not authorize creation of that environment or any
production/provider mutation.

`OWNER ACTION` and security/infrastructure administration must first create a
protected `staging-security` environment, approve its allowed protected ref
policy and independent reviewer requirements, and add only:

- environment variables `DAST_TARGET_URL`, `DAST_TRUSTED_ORIGIN` and
  `DAST_ALLOWED_HOSTS`; and
- environment secrets `DAST_EMAIL` and `DAST_PASSWORD` for a synthetic user;
  the email domain must exactly equal the deployed target's protected
  `MENORAH_STAGING_EMAIL_DOMAIN`.

The exact contracts are in
[the environment matrix](./02-staging-environment-matrix.md#qa-playwright-and-dast-variables).
If the approved environment policy permits only protected default-branch
deployments, do not weaken it for a release branch and do not merge under this
package. DAST remains **BLOCKED / NOT COLLECTED** until a separately authorized
governance action supplies an eligible protected head, after which runtime
identity and all affected evidence must be revalidated.

After the environment exists and the approved workflow head is deployed with
its runtime content proven identical to the frozen runtime SHA, an authorized
operator may run:

```bash
# STAGING-ONLY GitHub workflow trigger; active scan of the approved target.
set -euo pipefail

readonly GH_REPOSITORY='menorahsoftware-cmyk/menorah-mobile-app-'
readonly APPROVED_BRANCH='<protected-branch-allowed-by-staging-security>'
readonly RUNTIME_SHA='4c82121bfa2293a21a831bc490f4101eb4db1213'
: "${APPROVED_WORKFLOW_HEAD_SHA:?Set the externally recorded protected workflow-head SHA}"
readonly APPROVED_WORKFLOW_HEAD_SHA

[[ "${RUNTIME_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${APPROVED_WORKFLOW_HEAD_SHA}" =~ ^[0-9a-f]{40}$ ]]
case "${APPROVED_BRANCH}" in
  *'<'*|*'>'*) echo 'Replace the approved protected-branch placeholder.' >&2; exit 1 ;;
esac
git fetch --prune origin \
  "+refs/heads/${APPROVED_BRANCH}:refs/remotes/origin/${APPROVED_BRANCH}"
test "$(git rev-parse HEAD)" = "${APPROVED_WORKFLOW_HEAD_SHA}"
test "$(git rev-parse "origin/${APPROVED_BRANCH}")" \
  = "${APPROVED_WORKFLOW_HEAD_SHA}"
git merge-base --is-ancestor "${RUNTIME_SHA}" "${APPROVED_WORKFLOW_HEAD_SHA}"
git diff --quiet "${RUNTIME_SHA}..${APPROVED_WORKFLOW_HEAD_SHA}" -- \
  . ':(exclude)docs/production-readiness/staging/**'

# Read-only proof that the required environment now exists. Review protection
# and variable/secret names without printing values.
gh api "repos/${GH_REPOSITORY}/environments/staging-security" \
  --jq '{name,protection_rules,deployment_branch_policy}'

gh workflow run dast.yml \
  --repo "${GH_REPOSITORY}" \
  --ref "${APPROVED_BRANCH}"

RUN_ID="$(
  gh run list \
    --repo "${GH_REPOSITORY}" \
    --workflow dast.yml \
    --branch "${APPROVED_BRANCH}" \
    --event workflow_dispatch \
    --commit "${APPROVED_WORKFLOW_HEAD_SHA}" \
    --limit 1 \
    --json databaseId,headSha \
  | EXPECTED_SHA="${APPROVED_WORKFLOW_HEAD_SHA}" node -e '
      let input = "";
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const runs = JSON.parse(input);
        if (runs.length !== 1 || runs[0].headSha !== process.env.EXPECTED_SHA) {
          process.exit(1);
        }
        process.stdout.write(String(runs[0].databaseId));
      });
    '
)"
test -n "${RUN_ID}"
gh run watch "${RUN_ID}" --repo "${GH_REPOSITORY}" --exit-status
gh run view "${RUN_ID}" --repo "${GH_REPOSITORY}" --log
```

Store the redacted run log in the restricted evidence store, not Git. Confirm
the run's `headSha` equals the externally recorded approved workflow head
before accepting it. The frozen runtime evidence remains applicable only when
the ancestry and docs-only path-diff gates above pass. The workflow must fail
before login/scanning unless:

1. both URLs are exact credential-free HTTPS origins;
2. both hosts are reviewed allowlist members with a full `staging` or
   `security-test` token and are not a Menorah production host;
3. `/health/ready` returns
   `X-Menorah-Deployment-Environment: staging`; and
4. login issues the expected host-only synthetic session cookie.

The active plan excludes payment, payout and LiveKit webhook endpoints, uses
bounded spider/scan settings and fails at Medium-or-higher findings. It
revolves the session through logout and removes temporary credential files.
Because the workflow currently does not upload a separate ZAP report artifact,
retain the complete redacted log and open a tracked evidence-gap action; do not
claim a full report that was not produced.

## Adversarial staging matrix

| Test ID | Boundary and method | Required result | Audit / monitoring evidence | Severity | Result |
| --- | --- | --- | --- | --- | --- |
| `SEC-AUTH-001` | Present user token to admin APIs; admin token where user context is mandatory; counsellor token to user/admin surfaces | Wrong audience/type rejected before object lookup; response does not reveal object existence | Safe authentication/authorization denial; no token in log | P0 | NOT RUN |
| `SEC-AUTH-002` | Expired, malformed, revoked and refresh-replayed credentials | All denied consistently; no successor session on replay | Revocation/replay event and bounded auth signal | P0 | NOT RUN |
| `SEC-AUTH-003` | Reuse sessions after password change, logout-all, suspension, deletion and role removal | Authority ends across API, UI, WebSocket and call ticket paths | Correlated lifecycle and denial evidence | P0 | NOT RUN |
| `SEC-AUTH-004` | Login/reset enumeration, brute-force and rate-limit boundary with bounded synthetic attempts | Responses resist enumeration; rate limiting applies without account lockout abuse | 401/429 metric gaps recorded honestly; safe event evidence | P1 | NOT RUN |
| `SEC-EMAIL-001` | Use QA-owned reserved off-domain recipients across OTP, verification, reset, booking and notification senders; inspect provider-call spy/sandbox inventory | Every backend path rejects before network dispatch unless the recipient domain exactly equals `MENORAH_STAGING_EMAIL_DOMAIN`; no fallback, retry bypass or live/external delivery | Safe domain-boundary denial with no address/content in logs; zero provider requests for rejected cases | P0 | NOT RUN |
| `SEC-MFA-001` | Admin MFA expiry, replay, concurrent challenge completion and bypass attempts | Challenge is atomic, short-lived and required for privileged actions | MFA/admin-MFA failure signal and safe audit | P0 | NOT RUN |
| `SEC-OBJ-001` | Substitute user/counsellor/admin IDs on profiles, bookings, earnings, cases and records | Server rejects every cross-object action regardless of UI | Object-denial audit and authorization signal | P0 | NOT RUN |
| `SEC-OBJ-002` | Enumerate/guess export and file IDs; alter signed URL parameters; retry after expiry/logout | Object/role/expiry checks deny; no data leaked via length/status difference beyond policy | File/export denial with no path/content in logs | P0 | NOT RUN |
| `SEC-ROLE-001` | Direct API execution of support, finance and content forbidden routes | Explicit least-privilege matrix enforced server-side | `admin_permission_denied`; admin permission alert path | P0 | NOT RUN |
| `SEC-BOOK-001` | Tamper amount, currency, discount/free claim, owner, counsellor and status | Server catalog/state machine remains authoritative | Tamper/denial event; no payload leak | P0 | NOT RUN |
| `SEC-BOOK-002` | Race two counsellor accept requests; replay winner; use unpaid/terminal states | One eligible atomic assignment maximum | Both request IDs and final invariant | P0 | NOT RUN |
| `SEC-BOOK-003` | Enumerate unassigned-marketplace previews as eligible, ineligible, suspended and unrelated counsellors; compare API/UI fields and guessed IDs | Only eligible actors see the minimum decision fields; no user identity/contact, emergency data, symptoms, notes, goals, clinical detail, file/media key or stable correlator is exposed before assignment | Bounded preview access/denial events and serialized-field allowlist evidence without payload values | P0 | NOT RUN |
| `SEC-PAY-001` | Invalid/replayed/mismatched webhook cases from provider matrix | No invalid event advances booking/payment/refund/payout; valid duplicate is idempotent | Reconciliation evidence/alert for terminal conflict | P0 | NOT RUN |
| `SEC-PAYOUT-001` | Initiate a sandbox payout as one finance/admin actor; attempt self-approval, single approval, two sessions for one identity and colluding stale sessions | Initiator cannot approve; two distinct currently authorized approvers are required before execution; every identity/role/MFA check is server-side and atomic | Initiation plus two distinct approval identities, self-approval/permission denials and final state; no bank data in evidence | P0 | NOT RUN |
| `SEC-PAYOUT-002` | Replay initiation/approval/execution requests; reuse consumed MFA; race duplicate approval/execution and provider callback/reconciliation events | Idempotency key and state machine allow one intended payout maximum; consumed/stale MFA and every replay are denied; no duplicate provider request or ledger movement | Safe replay/MFA/duplicate denials, provider request inventory and one final reconciliation record | P0 | NOT RUN |
| `SEC-WS-001` | Connect and join guessed rooms as wrong/suspended/deleted/reassigned actor | Authorization repeated at connection and every join; no event/history disclosure | Room denial and bounded authorization signal | P0 | NOT RUN |
| `SEC-CALL-001` | Forge/replay ticket; wrong party; early/late/cancelled/refunded/reassigned booking | Ticket is signed/one-time and state/participant constrained | Call authorization denial signal | P0 | NOT RUN |
| `SEC-SSRF-001` | Submit `http`, localhost, `127.0.0.1`, `::1`, RFC1918, link-local, reserved and metadata targets | Scheme/address rejected before fetch | Safe rejection; target value not logged | P0 | NOT RUN |
| `SEC-SSRF-002` | QA DNS resolves public name to private address; redirect public URL to private/metadata target | Every resolution and redirect hop revalidated; connection blocked | Responder and application evidence | P0 | NOT RUN |
| `SEC-SSRF-003` | Slow body, oversized body, non-image type, MIME/content mismatch and redirect loop | Strict connect/response timeout and size/type limits; partial data removed | Resource limits and safe error | P0 | NOT RUN |
| `SEC-SSRF-004` | Observe QA responder request headers | No application credential, cookie, bearer token or internal header forwarded | Redacted responder capture | P0 | NOT RUN |
| `SEC-UPLOAD-001` | Double extension, traversal name, oversized/non-image/polyglot and unauthorized media access | Content validated; name/path cannot escape; access remains object authorized | Rejection/access audit; no unsafe file execution | P0 | NOT RUN |
| `SEC-CONFIG-001` | Remove or replace each required config with malformed/insecure/placeholder test value in an isolated process | Startup/release preflight fails closed and names field without printing value | Redacted stderr and exit code | P0 | NOT RUN |
| `SEC-SECRET-001` | Inspect browser bundles, mobile resolved config, container env exposure, logs and error responses | No server secret/private key/token; only approved public IDs | Scan report and zero secret-bearing evidence | P0 | NOT RUN |
| `SEC-LOG-001` | Generate auth, booking, payment, chat/call, privacy and exception paths using canary sensitive strings | Tokens, contacts, clinical text, payloads and payment details absent; safe IDs retained | Loki/query evidence and canary inventory | P0 | NOT RUN |
| `SEC-AUDIT-001` | Validate intact chain/checkpoint, tamper a disposable copy, remove checkpoint and force bounded sink write failure | Intact passes; tamper/missing/write failure produces durable evidence and alert | Integrity/pending/write-failure alerts and audit | P0 | NOT RUN |
| `SEC-AUDIT-002` | Fill bounded audit queue in fault-injection fixture; perform planned shutdown | Overflow is explicit; shutdown drains or exits nonzero; no silent loss claim | Queue/write evidence and limitation record | P0 | NOT RUN |
| `SEC-PRIV-001` | Cross-user rights request/case access; deletion versus legal hold/finance/security retention | Authorization enforced; protected records not falsely represented as erased | Rights/hold audit; no payload in logs | P0 | NOT RUN |
| `SEC-PRIV-002` | Grant/remove each privacy-authority permission; attempt rights-case read, export, correction, deletion, hold and retention actions with no grant, wrong grant, stale session and approved grant | Deny by default and require the exact current server-side permission for every action; grant removal ends open-session authority; no broad admin role substitutes for a missing privacy grant | Permission grant/removal plus action success/denial events with safe case IDs; privileged-role-change alert gap remains explicit | P0 | NOT RUN |
| `SEC-DB-001` | Migration order/retry, unique-index race and application startup against unapproved schema | Migration only at approved boundary; duplicate/race constrained; startup does not destructively migrate | Migration/recovery state evidence | P0 | NOT RUN |
| `SEC-PROXY-001` | Spoof forwarded IP/proto/host/origin and access internal listener from untrusted network | Only trusted proxy honored; host/origin validation applies; internal endpoints not exposed | Caddy/API and firewall evidence | P0 | NOT RUN |
| `SEC-HEADERS-001` | Inspect TLS, HSTS on staging-equivalent domain, CSP, framing, MIME sniffing, referrer/cookie flags and CORS | Approved headers/cookies/CORS present without breaking critical journeys | Scanner plus manual browser evidence | P1 | NOT RUN |
| `SEC-DOS-001` | Bounded concurrency/body-size/slow-request tests under approved rate | Service limits resource use, preserves health and recovers | Host/container graphs and response evidence | P1 | NOT RUN |
| `SEC-DOCKER-001` | Exercise Docker metrics gateway allowlist and raw inspect/log/archive/export/mutation paths | Only sanitized project-scoped list/state/one-shot stats allowed; all other routes `403` | Gateway tests and isolated network evidence | P0 | NOT RUN |
| `SEC-SUPPLY-001` | Verify lockfiles, exact image IDs/digests, artifact manifest/checksum and candidate provenance | Running artifacts are immutable and bound to candidate; no moving tag substitutes | Release manifest and checksum | P0 | NOT RUN |
| `SEC-DEEP-001` | Manipulate web/mobile deep links, callback state and target object after login | Scheme/host/path allowlist and post-login object authorization enforced | Safe denial and app-route evidence | P0 | NOT RUN |

The payment-specific vectors are executed from
[07-payment-provider-sandbox-matrix.md](./07-payment-provider-sandbox-matrix.md);
recovery security is executed from
[08-backup-restore-migration-recovery.md](./08-backup-restore-migration-recovery.md).

## Configuration and infrastructure checks

- Confirm MongoDB, Redis, monitoring, dashboards and Docker metrics interfaces
  have no public listener.
- Confirm each service has only intended networks, read-only filesystem where
  designed, dropped capabilities, bounded resources and no Docker socket.
- Confirm the trusted Docker gateway alone has the socket and cannot reach
  unrelated Compose projects through its exposed API.
- Confirm staging egress cannot reach production private ranges and only
  approved sandbox/provider destinations are allowed.
- Confirm TLS/certificate, Caddy routes and Cloudflare staging routes match the
  environment inventory.
- Confirm backups and logs are encrypted/access-controlled and evidence access
  is reviewed.

## Result handling

For each failure, preserve minimal redacted evidence, assign severity/owner and
stop affected testing. A fix creates a new candidate. Rerun the causal case,
the full affected security group and every downstream staging/VAPT/mobile
result impacted by the change. Flaky quarantine is not allowed for
authorization, payment, privacy, configuration, migration or recovery P0s.
