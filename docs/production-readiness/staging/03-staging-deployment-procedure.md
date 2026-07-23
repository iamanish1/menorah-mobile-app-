# Staging deployment procedure

Runtime candidate SHA: `4c82121bfa2293a21a831bc490f4101eb4db1213`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

This procedure rehearses the guarded exact-SHA release path on an isolated
production-like staging host. It does not authorize the same commands on a
production host. Production authority and sequencing remain in
[08-release-runbook.md](../08-release-runbook.md).

The runtime identity is frozen to the lowercase 40-character SHA above.
Documentation-only commits do not change that runtime identity; record the
actual docs/PR-head revision externally at execution. The updater must receive
that approved remote-tip SHA for checkout and release markers, while the
ancestry and docs-only path-diff gates below preserve the distinct runtime
evidence identity.

## Change record

Before the window, record:

- approved staging host FQDN/instance ID and isolation evidence;
- candidate branch, frozen runtime SHA and externally recorded full docs/PR-head
  SHA;
- previous staging SHA, if one exists;
- staging-only environment, Cloudflare, data, backup and deploy-state
  references;
- named release, database/recovery, smoke-test and incident owners;
- expected migration, writer-stop and recovery boundaries;
- test alert receiver and responder;
- start/end time, abort authority and evidence location.

Do not put credentials or rendered environment content in the change record.

## STAGING-ONLY Linux commands: host and target guard

**Run only on the approved isolated staging host. Do not run on production.**
Set the non-secret approved-host value from the change record. Environment
files must already exist outside Git with protected permissions.

```bash
set -euo pipefail
umask 077

readonly RUNTIME_SHA='4c82121bfa2293a21a831bc490f4101eb4db1213'
readonly CANDIDATE_BRANCH='release/final-production-readiness'
readonly STAGING_REPO='/srv/menorah-staging/repository'
readonly STAGING_ENV='/etc/menorah-staging/staging.env'
readonly STAGING_CF_ENV='/etc/menorah-staging/cloudflare.env'
readonly STAGING_SENTINEL='/etc/menorah-staging/STAGING_HOST'
readonly APPROVED_STAGING_FQDN='<approved-staging-fqdn>'
readonly APPROVED_COMPOSE_PROJECT='menorah-staging'
: "${APPROVED_PR_HEAD_SHA:?Set the externally recorded final docs/PR-head SHA}"
readonly APPROVED_PR_HEAD_SHA

test "$(hostname -f)" = "${APPROVED_STAGING_FQDN}"
test -f "${STAGING_SENTINEL}"
grep -qx 'MENORAH_STAGING_ONLY' "${STAGING_SENTINEL}"
test -r "${STAGING_ENV}" && test -r "${STAGING_CF_ENV}"
test "$(stat -c '%a' "${STAGING_ENV}")" = '600'
test "$(stat -c '%a' "${STAGING_CF_ENV}")" = '600'
test -d "${STAGING_REPO}/.git"
[[ "${RUNTIME_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${APPROVED_PR_HEAD_SHA}" =~ ^[0-9a-f]{40}$ ]]
readonly FORBIDDEN_PENDING_TOKEN='RUNTIME_CANDIDATE_SHA_''PENDING'
if rg -n "${FORBIDDEN_PENDING_TOKEN}" \
  "${STAGING_REPO}/docs/production-readiness/staging"; then
  echo 'Staging package still contains a pending candidate token.' >&2
  exit 1
fi
cd "${STAGING_REPO}"
```

Replace the FQDN placeholder before execution. If any guard fails, stop; do not
edit the guard on the fly.

## STAGING-ONLY Linux commands: freeze and verify

```bash
git fetch --prune origin \
  "+refs/heads/${CANDIDATE_BRANCH}:refs/remotes/origin/${CANDIDATE_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${CANDIDATE_BRANCH}")" \
  = "${APPROVED_PR_HEAD_SHA}"
test "$(git branch --show-current)" = "${CANDIDATE_BRANCH}"
test "$(git rev-parse HEAD)" = "${APPROVED_PR_HEAD_SHA}"
test -z "$(git status --porcelain)"
git diff --check
git diff --check "${RUNTIME_SHA}..${APPROVED_PR_HEAD_SHA}"
git fsck --no-dangling
git cat-file -e "${RUNTIME_SHA}^{commit}"
git cat-file -e "${APPROVED_PR_HEAD_SHA}^{commit}"
git merge-base --is-ancestor "${RUNTIME_SHA}" "${APPROVED_PR_HEAD_SHA}"
git diff --quiet "${RUNTIME_SHA}..${APPROVED_PR_HEAD_SHA}" -- \
  . ':(exclude)docs/production-readiness/staging/**'
```

The checkout must already be at the externally recorded approved PR head. Its
runtime content remains bound to the frozen runtime SHA only because the
ancestry and path-diff gates prove that every later change is documentation in
this package. Do not switch to `main`, merge, cherry-pick or replace either SHA
to satisfy this gate.

## STAGING-ONLY Linux commands: fail-closed environment preflight

Run from the repository root. The environment files are sourced only into this
protected shell; never enable shell tracing or print the environment.

```bash
set -a
# shellcheck disable=SC1090
. "${STAGING_ENV}"
# shellcheck disable=SC1090
. "${STAGING_CF_ENV}"
set +a

test "${NODE_ENV:-}" = 'production'
test "${DEPLOYMENT_ENVIRONMENT:-}" = 'staging'
test "${COMPOSE_PROJECT_NAME:-}" = "${APPROVED_COMPOSE_PROJECT}"
test "${MENORAH_DATA_ROOT:-}" = '/srv/menorah-staging/data'
test "${MENORAH_BACKUP_ROOT:-}" = '/srv/menorah-staging/backups'
test "${MENORAH_DEPLOY_STATE_ROOT:-/srv/menorah-staging/deploy-state}" \
  = '/srv/menorah-staging/deploy-state'
test -z "${MENORAH_MIGRATION_IMAGE_ID:-}"
test "${CLOUDFLARE_TUNNEL_TOKEN_FILE:-}" \
  = '/etc/menorah-staging/secrets/cloudflare-tunnel-token'
test -f "${CLOUDFLARE_TUNNEL_TOKEN_FILE}"
test ! -L "${CLOUDFLARE_TUNNEL_TOKEN_FILE}"
test -s "${CLOUDFLARE_TUNNEL_TOKEN_FILE}"
test -r "${CLOUDFLARE_TUNNEL_TOKEN_FILE}"
test "$(readlink -f -- "${CLOUDFLARE_TUNNEL_TOKEN_FILE}")" \
  = '/etc/menorah-staging/secrets/cloudflare-tunnel-token'
test "$(stat -c '%a' "${CLOUDFLARE_TUNNEL_TOKEN_FILE}")" = '440'
test "$(stat -c '%u' "${CLOUDFLARE_TUNNEL_TOKEN_FILE}")" = '65532'

node <<'NODE'
const {
  validateStagingEnvironmentIsolation,
} = require('./menorah/backend/src/config/deploymentEnvironment');
const {
  validateStartupEnv,
} = require('./menorah/backend/src/shared/app/startupValidation');

const isolationErrors = validateStagingEnvironmentIsolation(process.env);
if (isolationErrors.length) {
  throw new Error(
    `Staging isolation validator reported ${isolationErrors.length} error(s); ` +
    'inspect protected configuration without copying values into evidence'
  );
}

const stagingEmailDomain = process.env.MENORAH_STAGING_EMAIL_DOMAIN;
const contactAddress = process.env.CONTACT_TO_EMAIL || '';
const fromValue = process.env.EMAIL_FROM || '';
const fromAngleMatch = fromValue.match(/<([^<>]+)>$/);
const fromAddress = (fromAngleMatch ? fromAngleMatch[1] : fromValue).trim();
const domainOf = (address) => {
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1) : '';
};
if (!stagingEmailDomain ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(stagingEmailDomain) ||
    !stagingEmailDomain.split('.').includes('staging')) {
  throw new Error('MENORAH_STAGING_EMAIL_DOMAIN is not an approved staging DNS name');
}
if (/[<>\s]/.test(contactAddress) ||
    domainOf(contactAddress) !== stagingEmailDomain) {
  throw new Error('CONTACT_TO_EMAIL is not a bare address on the staging email domain');
}
if (domainOf(fromAddress) !== stagingEmailDomain) {
  throw new Error('EMAIL_FROM is not on the staging email domain');
}
if (process.env.CHECKOUT_RETURN_URL !==
    `https://${process.env.APP_DOMAIN}/checkout/return`) {
  throw new Error('CHECKOUT_RETURN_URL does not match the staging app domain');
}

for (const [serviceName, requirePaymentEnv] of [
  ['api-ios', true],
  ['api-android', true],
  ['api-web', true],
  ['api-admin', true],
  ['worker', false],
]) {
  validateStartupEnv({ serviceName, requirePaymentEnv });
}

const exactInternalHosts = new Map([
  ['MONGODB_URI', 'mongo-primary'],
  ['MONGODB_BACKUP_URI', 'mongo-primary'],
  ['MONGODB_PRODUCTION_RESTORE_URI', 'mongo-primary'],
  ['MONGODB_MONITORING_URI', 'mongo-primary'],
  ['MONGODB_RESTORE_TEST_URI', 'mongo-restore-test'],
  ['REDIS_URL', 'redis'],
  ['REDIS_MONITORING_URL', 'redis'],
]);
for (const [name, expectedHost] of exactInternalHosts) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required by the staging target contract`);
  const parsed = new URL(value);
  if (parsed.hostname !== expectedHost) {
    throw new Error(`${name} must target the isolated Compose service ${expectedHost}`);
  }
}
NODE

bash menorah/deploy/ubuntu/validate-compose.sh
bash -n menorah/deploy/ubuntu/first-run.sh
bash -n menorah/deploy/ubuntu/update-from-git.sh
bash -n menorah/deploy/ubuntu/rollback-last-deploy.sh
bash -n menorah/deploy/ubuntu/restore-latest-backup.sh
bash -n menorah/deploy/ubuntu/resume-post-migration-release.sh
bash -n menorah/deploy/ubuntu/recover-managed-mongo-identities.sh
bash -n menorah/scripts/qa/test-release-scripts.sh
bash menorah/scripts/qa/test-release-scripts.sh

docker compose \
  --project-name "${APPROVED_COMPOSE_PROJECT}" \
  --env-file "${STAGING_ENV}" \
  --env-file "${STAGING_CF_ENV}" \
  -f menorah/deploy/docker-compose.production.yml \
  -f menorah/deploy/docker-compose.tunnel.yml \
  config --quiet

docker compose \
  --project-name "${APPROVED_COMPOSE_PROJECT}" \
  --env-file "${STAGING_ENV}" \
  --env-file "${STAGING_CF_ENV}" \
  -f menorah/deploy/docker-compose.production.yml \
  -f menorah/deploy/docker-compose.tunnel.yml \
  config --format json \
  | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const config = JSON.parse(input);
      if (config.name !== "menorah-staging") {
        throw new Error("Rendered Compose project is not menorah-staging");
      }
      const tunnelTokenFile =
        config.secrets?.cloudflare_tunnel_token?.file;
      if (tunnelTokenFile !== process.env.CLOUDFLARE_TUNNEL_TOKEN_FILE) {
        throw new Error("Cloudflare tunnel secret source is not the exact staging token file");
      }
      if (config.services?.cloudflared?.environment?.TUNNEL_TOKEN_FILE !==
          "/run/secrets/cloudflare_tunnel_token") {
        throw new Error("cloudflared token target is not the reviewed secret mount");
      }
      const expected = {
        NODE_ENV: "production",
        DEPLOYMENT_ENVIRONMENT: "staging",
        MENORAH_STAGING_EMAIL_DOMAIN:
          process.env.MENORAH_STAGING_EMAIL_DOMAIN,
        EMAIL_FROM: process.env.EMAIL_FROM,
        CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL,
        CHECKOUT_RETURN_URL: process.env.CHECKOUT_RETURN_URL,
      };
      for (const serviceName of ["api-ios", "api-android", "api-web", "api-admin", "worker"]) {
        const environment = config.services?.[serviceName]?.environment || {};
        for (const [name, value] of Object.entries(expected)) {
          if (environment[name] !== value) {
            throw new Error(
              `${serviceName} ${name} does not match its protected expected value`
            );
          }
        }
      }
      const webArgs = config.services?.["user-web-app"]?.build?.args || {};
      if (webArgs.NEXT_PUBLIC_CALLS_URL !== process.env.LIVEKIT_URL) {
        throw new Error("NEXT_PUBLIC_CALLS_URL is not bound to LIVEKIT_URL");
      }
      for (const serviceName of ["landing-page", "user-web-app"]) {
        const environment = config.services?.[serviceName]?.environment || {};
        if (environment.EMAIL_FROM !== process.env.EMAIL_FROM ||
            environment.CONTACT_TO_EMAIL !== process.env.CONTACT_TO_EMAIL) {
          throw new Error(`${serviceName} staging email sink is not exact`);
        }
      }
    });
  '
```

Then execute the complete Stage 2 command set from the
[final QA plan](../07-final-qa-plan.md#stage-2--deterministic-repository-checks).
Do not proceed on any unexplained failure, skipped P0 group, unpinned artifact,
secret exposure, production endpoint or configuration warning.

The two Compose commands deliberately do not save or print the rendered model.
The second streams it into a structural validator because the JSON may contain
secrets. If the isolated staging stack uses external MongoDB or Redis rather
than the Compose services named above, this procedure is **NO-GO** until a
reviewed, independently target-bound validator is implemented; do not delete
the host checks.

## STAGING-ONLY Linux commands: guarded release

The staging environment file must resolve `MENORAH_DATA_ROOT`,
`MENORAH_BACKUP_ROOT` and all runtime endpoints to approved staging resources.
The exported state root below is staging-specific. The updater will perform
its own configuration, backup/restore, artifact, writer-stop, identity,
migration and health guards.

```bash
export MENORAH_RELEASE_REPO_ROOT="${STAGING_REPO}"
export PRODUCTION_ENV="${STAGING_ENV}"
export CLOUDFLARE_ENV="${STAGING_CF_ENV}"
export MENORAH_DEPLOY_STATE_ROOT='/srv/menorah-staging/deploy-state'
export MENORAH_DATA_ROOT='/srv/menorah-staging/data'
export MENORAH_BACKUP_ROOT='/srv/menorah-staging/backups'
export COMPOSE_PROJECT_NAME="${APPROVED_COMPOSE_PROJECT}"
export DEPLOY_BRANCH="${CANDIDATE_BRANCH}"
export DEPLOY_RELEASE_SHA="${APPROVED_PR_HEAD_SHA}"
export DEPLOY_MIGRATION_APPROVED_SHA="${APPROVED_PR_HEAD_SHA}"
export DEPLOY_CHANGE_REFERENCE='<staging-change-reference>'

if [[ "${DEPLOY_CHANGE_REFERENCE}" == *'<'* \
  || "${DEPLOY_CHANGE_REFERENCE}" == *'>'* \
  || "${DEPLOY_CHANGE_REFERENCE}" == *$'\n'* \
  || "${DEPLOY_CHANGE_REFERENCE}" == *$'\r'* ]] \
  || (( ${#DEPLOY_CHANGE_REFERENCE} > 200 )) \
  || [[ ! "${DEPLOY_CHANGE_REFERENCE}" =~ [[:alnum:]] ]]; then
  echo 'Replace DEPLOY_CHANGE_REFERENCE with the approved staging change reference.' >&2
  exit 1
fi

case "${MENORAH_DEPLOY_STATE_ROOT}:${MENORAH_DATA_ROOT}:${MENORAH_BACKUP_ROOT}" in
  /srv/menorah-staging/*:/srv/menorah-staging/*:/srv/menorah-staging/*) ;;
  *) echo 'Refusing non-staging state/data/backup roots.' >&2; exit 1 ;;
esac

readonly CURRENT_SHA_MARKER="${MENORAH_DEPLOY_STATE_ROOT}/current-sha"
readonly BOOTSTRAP_COMPLETE_MARKER="${MENORAH_DEPLOY_STATE_ROOT}/bootstrap-complete-sha"

if [[ ! -e "${CURRENT_SHA_MARKER}" && ! -L "${CURRENT_SHA_MARKER}" \
  && ! -e "${BOOTSTRAP_COMPLETE_MARKER}" && ! -L "${BOOTSTRAP_COMPLETE_MARKER}" ]]; then
  # first-run.sh independently refuses existing containers, non-empty MongoDB
  # or Redis storage, state markers, an unclean checkout, or remote-tip drift.
  export MENORAH_FIRST_RUN_CONFIRM='BOOTSTRAP_EMPTY_HOST'
  bash menorah/deploy/ubuntu/first-run.sh
  unset MENORAH_FIRST_RUN_CONFIRM
fi

for marker in "${CURRENT_SHA_MARKER}" "${BOOTSTRAP_COMPLETE_MARKER}"; do
  test -f "${marker}"
  test ! -L "${marker}"
  test "$(stat -c '%a' "${marker}")" = '600'
  test "$(wc -l < "${marker}")" -eq 1
  grep -qx "${APPROVED_PR_HEAD_SHA}" "${marker}"
done

bash menorah/deploy/ubuntu/update-from-git.sh
```

Do not use `set -x`, place a secret in an exported command, pipe output to a
public log, bypass a failed guard, or run migrations separately. The production
Compose variable name `PRODUCTION_ENV` is used by the candidate scripts; here
it must point to the protected staging-only file.

This guarded block supports an independently proven empty host or a completed
data-only bootstrap for this exact approved PR head. Any other deployment
state is **NO-GO** for this package; use the authoritative existing-host
release/recovery decision path instead of deleting or rewriting markers.

This sequence does not authorize Cloudflare, DNS, firewall, provider, store,
payment live-mode, signing-secret or production mutation. Those resources must
already be dedicated staging resources with independent evidence, or the
release is no-go.

The guarded sequence and recovery markers are defined in
[the production release runbook](../08-release-runbook.md#guarded-release-sequence)
and [the detailed update runbook](../../../menorah/docs/production-update-runbook.md).
Those documents remain authoritative.

## Post-start acceptance

Retain evidence that:

- `current-sha`, `last-good-sha` and completed release metadata bind to the
  approved PR-head deployment SHA, while running content remains equivalent to
  the frozen runtime SHA under the docs-only diff proof;
- no migration, identity-reconciliation, rollback or post-migration recovery
  marker is unexpectedly present;
- every intended container is healthy and no retired container remains;
- local readiness endpoints and external staging-only routes pass;
- Caddy, Tunnel, MongoDB, Redis, worker, monitoring and logging are healthy;
- all Prometheus targets and blackbox probes are present;
- no service exposes a database, cache, dashboard or exporter publicly;
- synthetic booking/payment/call/chat smoke tests pass;
- synthetic OTP/reset/booking/notification email reaches only the protected
  staging domain while reserved off-domain cases make zero provider requests;
  and
- logs contain no credentials, tokens, personal data or prohibited clinical
  content.

Use [functional QA](./05-staging-functional-qa.md),
[security QA](./06-staging-security-qa.md) and
[monitoring validation](./09-monitoring-alert-validation.md) for the detailed
checks.

## Failure routing

- Before writers stop: preserve evidence, allow the guarded script to restore
  the recorded predecessor checkout, diagnose and retry only after review.
- Writers stopped with no migration uncertainty: use only the recorded
  staging rollback path in [09-rollback-runbook.md](../09-rollback-runbook.md).
- Identity-reconciliation marker present: keep writers stopped and use the
  candidate recovery helper.
- Migration in progress or partial mutation uncertain: keep writers stopped;
  do not delete markers or code-roll back. Use reviewed forward completion or
  coordinated staging restore.
- After migration: do not run older code. Resume the exact checksum-bound
  candidate artifacts, or use a reviewed forward fix/coordinated restore.

The executable recovery commands and evidence cases are in
[08-backup-restore-migration-recovery.md](./08-backup-restore-migration-recovery.md).

## Teardown

Teardown is a separate approved staging change. Preserve required evidence and
provider callback records first. Stop the staging Compose project without
deleting volumes:

```bash
# STAGING-ONLY; approved isolated staging host
docker compose \
  --project-name "${APPROVED_COMPOSE_PROJECT}" \
  --env-file "${STAGING_ENV}" \
  --env-file "${STAGING_CF_ENV}" \
  -f menorah/deploy/docker-compose.production.yml \
  -f menorah/deploy/docker-compose.tunnel.yml \
  down
```

Do not add `--volumes`, prune Docker globally, delete backups, or remove
database/storage resources under this procedure.
