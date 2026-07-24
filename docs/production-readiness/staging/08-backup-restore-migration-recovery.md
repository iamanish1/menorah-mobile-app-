# Staging backup, restore, migration and recovery

Runtime candidate SHA: `48fb83c248b0e969e699433a8bacdd276ed4311d`

Docs/PR-head revision: resolve with `git rev-parse HEAD` at execution.

Approved Ubuntu/server staging state: **not run**. The completed local Docker
backup/restore/migration result is recorded separately in report 28.

The authoritative control descriptions are
[10-backup-and-restore-runbook.md](../10-backup-and-restore-runbook.md) and
[09-rollback-runbook.md](../09-rollback-runbook.md). This document supplies the
isolated staging rehearsal and evidence matrix. It never authorizes a
production restore.

## Non-negotiable isolation

- Dedicated staging MongoDB replica set, Redis, uploads, backup root and
  deploy-state root.
- Synthetic data only; never restore a production backup or media archive.
- Separate backup, restore-test, coordinated-restore, app and monitoring
  identities.
- A second operator confirms canonical target paths, database identity,
  replica-set name, Compose project/volume labels and absence of production
  routes before any write.
- Writers are stopped and verified before any coordinated restore or uncertain
  migration recovery.
- Never create, edit or delete recovery markers by hand.

## STAGING-ONLY Linux commands: common guard

Run only on the approved isolated staging host:

```bash
set -euo pipefail
umask 077

readonly RUNTIME_SHA='48fb83c248b0e969e699433a8bacdd276ed4311d'
readonly CANDIDATE_BRANCH='release/final-production-readiness'
readonly STAGING_REPO='/srv/menorah-staging/repository'
readonly STAGING_ENV='/etc/menorah-staging/staging.env'
readonly STAGING_CF_ENV='/etc/menorah-staging/cloudflare.env'
readonly STAGING_SENTINEL='/etc/menorah-staging/STAGING_HOST'
readonly APPROVED_STAGING_FQDN='<approved-staging-fqdn>'
readonly APPROVED_COMPOSE_PROJECT='menorah-staging'
: "${APPROVED_PR_HEAD_SHA:?Set the externally recorded deployed docs/PR-head SHA}"
readonly APPROVED_PR_HEAD_SHA

[[ "${RUNTIME_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${APPROVED_PR_HEAD_SHA}" =~ ^[0-9a-f]{40}$ ]]
case "${APPROVED_STAGING_FQDN}" in
  *'<'*|*'>'*) echo 'Replace the approved staging FQDN placeholder.' >&2; exit 1 ;;
esac
test "$(hostname -f)" = "${APPROVED_STAGING_FQDN}"
test -f "${STAGING_SENTINEL}"
grep -qx 'MENORAH_STAGING_ONLY' "${STAGING_SENTINEL}"
test -r "${STAGING_ENV}" && test -r "${STAGING_CF_ENV}"
test "$(stat -c '%a' "${STAGING_ENV}")" = '600'
test "$(stat -c '%a' "${STAGING_CF_ENV}")" = '600'
test "$(git -C "${STAGING_REPO}" branch --show-current)" = "${CANDIDATE_BRANCH}"
test "$(git -C "${STAGING_REPO}" rev-parse HEAD)" = "${APPROVED_PR_HEAD_SHA}"
git -C "${STAGING_REPO}" merge-base --is-ancestor \
  "${RUNTIME_SHA}" "${APPROVED_PR_HEAD_SHA}"
git -C "${STAGING_REPO}" diff --quiet \
  "${RUNTIME_SHA}..${APPROVED_PR_HEAD_SHA}" -- \
  . ':(exclude)docs/**' ':(exclude)menorah/docs/**'
test -z "$(git -C "${STAGING_REPO}" status --porcelain)"

export MENORAH_RELEASE_REPO_ROOT="${STAGING_REPO}"
export PRODUCTION_ENV="${STAGING_ENV}"
export CLOUDFLARE_ENV="${STAGING_CF_ENV}"

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

export COMPOSE_PROJECT_NAME="${APPROVED_COMPOSE_PROJECT}"
export MENORAH_DEPLOY_STATE_ROOT='/srv/menorah-staging/deploy-state'
export MENORAH_DATA_ROOT='/srv/menorah-staging/data'
export MENORAH_BACKUP_ROOT='/srv/menorah-staging/backups'

for target_root in \
  "${MENORAH_DEPLOY_STATE_ROOT}" \
  "${MENORAH_DATA_ROOT}" \
  "${MENORAH_BACKUP_ROOT}"; do
  test -d "${target_root}"
  test "$(realpath -e -- "${target_root}")" = "${target_root}"
done

cd "${STAGING_REPO}"
```

Replace the FQDN placeholder from the approved change record. Do not continue
if the guard, target identity or second-person check fails.

## STAGING-ONLY Linux commands: fresh backup and isolated restore

```bash
# Creates a staging manual archive using the invoking host UID/GID.
FRESH_BACKUP_STARTED_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
readonly FRESH_BACKUP_STARTED_UTC
bash menorah/deploy/ubuntu/backup-now.sh manual

# Cryptographic/age/ownership health; marker presence alone is insufficient.
bash menorah/deploy/ubuntu/check-backup-health.sh

readonly FRESH_MANUAL_MARKER="${MENORAH_BACKUP_ROOT}/metadata/latest-success-manual.json"
LATEST_MARKER="${FRESH_MANUAL_MARKER}" \
BACKUP_ROOT="${MENORAH_BACKUP_ROOT}" \
STARTED_UTC="${FRESH_BACKUP_STARTED_UTC}" \
node <<'NODE'
const fs = require('fs');
const path = require('path');
const marker = JSON.parse(fs.readFileSync(process.env.LATEST_MARKER, 'utf8'));
const root = fs.realpathSync(process.env.BACKUP_ROOT);
const archive = fs.realpathSync(marker.mongoArchive);
const valid =
  marker.schemaVersion === 3 &&
  marker.artifactType === 'mongodb-full-instance-oplog' &&
  marker.backupType === 'manual' &&
  marker.timestamp >= process.env.STARTED_UTC &&
  marker.encrypted === true &&
  marker.oplog === true &&
  marker.directProductionRestoreAllowed === false &&
  archive.startsWith(`${root}${path.sep}`) &&
  archive.endsWith('.archive.gz.enc') &&
  /^[0-9a-f]{64}$/.test(marker.mongoArchiveSha256 || '');
if (!valid) process.exit(1);
NODE

# Restores the selected staging archive into the disposable restore-test
# container/volume and verifies cleanup. It must not target the live staging DB.
bash menorah/deploy/ubuntu/restore-latest-backup.sh restore-test

bash menorah/deploy/ubuntu/check-backup-health.sh
```

Record archive and media-manifest digests, encryption/signature verification,
host owner/mode/readability, source tools/server/FCV metadata, restore target
identity, document/index/invariant checks, cleanup result and elapsed time.
Never record the encryption or HMAC material.

## Migration execution

The migration must run once through
`menorah/deploy/ubuntu/update-from-git.sh`, after writers stop and using the
checksum-recorded candidate API image. Do not invoke
`run-recorded-migration.sh` independently merely to obtain a passing result.
The guarded staging release in
[03-staging-deployment-procedure.md](./03-staging-deployment-procedure.md)
provides the exact invocation.

Verify:

1. pre-migration schema/index/invariant manifest;
2. writer-stop time and container-state proof;
3. identity-reconciliation marker lifecycle and exact roles;
4. migration-in-progress, applied and post-migration recovery marker ordering;
5. migration output/exit code and recorded image identity;
6. post-migration schema/index/data invariants;
7. application health before writers resume; and
8. completed release metadata and cleared temporary recovery markers.

Idempotency or guarded refusal must be proved by the candidate regression
harness and a reviewed staging scenario. Never manually rerun a migration
against a database whose migration state is uncertain.

## Recovery and interruption matrix

| Test ID | Fault point / scenario | Required action | Required result and evidence | Severity | Result |
| --- | --- | --- | --- | --- | --- |
| `REC-001` | Backup created by container | Inspect host owner/mode/readability and decrypt/signature path | Archive is non-empty, host-readable, protected and verifiable; invoking numeric UID/GID recorded | P0 | NOT RUN |
| `REC-002` | Wrong encryption/HMAC key and altered archive copy | Run verification against disposable copies | Every wrong/tampered input fails before restore; no success marker written | P0 | NOT RUN |
| `REC-003` | Restore-test happy path | Execute `restore-test` command above | Separate labeled container/volume only; data/index/media invariants pass; target destroyed afterward | P0 | NOT RUN |
| `REC-004` | Restore-test target points at app/staging primary or ambiguous URI | Run preflight only | Script refuses before mutation | P0 | NOT RUN |
| `REC-005` | Concurrent backup/deploy/rollback/restore attempts | Start bounded competing operation after first lock is held | Shared deploy and backup locks reject concurrency; first operation remains consistent | P0 | NOT RUN |
| `REC-006` | Failure before writers stop | Preserve phase record and invoke recorded rollback only after review | Predecessor checkout/artifacts recover; no DB restore/migration; retry uses durable target | P0 | NOT RUN |
| `REC-007` | Identity reconciliation interrupted after writers stop | Keep writers stopped; run managed-identity recovery helper | Exact candidate identity set/roles reconciled; changed credential inputs fail closed; marker clears only on full success | P0 | NOT RUN |
| `REC-008` | Migration process interrupted before proven completion | Keep writers stopped and preserve markers | Older-code rollback refused; reviewed forward completion or coordinated restore required | P0 | NOT RUN |
| `REC-009` | Crash in strict proven-applied same-SHA state with applied and recovery markers | Run exact candidate post-migration resume helper | Exact recorded images/media start without build, pull or migration rerun; artifact/health checks pass | P0 | NOT RUN |
| `REC-010` | Failure after migration outside strict resume state | Keep writers stopped | No code rollback; reviewed forward fix or coordinated database/media restore only | P0 | NOT RUN |
| `REC-011` | Rollback interrupted after target selection | Re-run rollback helper | Durable recorded target reused; writers stay stopped on incomplete mutation; no target reselection | P0 | NOT RUN |
| `REC-012` | Image tag moved/pruned or manifest altered | Attempt rollback/resume preflight | Digest/checksum mismatch or unavailable recorded artifact fails closed; no mutable rebuild/pull substitute | P0 | NOT RUN |
| `REC-013` | Managed-media consolidation collision/permission/change | Run candidate transition test and staging rehearsal | No overwrite/delete of predecessor; checksum manifest binds copy; unsafe collision/ref denied | P0 | NOT RUN |
| `REC-014` | Coordinated synthetic full restore | Restore explicit reviewed archive to disposable staging operational target | Writers remain stopped; only approved namespace restored; schema review required before guarded migration/restart | P0 | NOT RUN |
| `REC-015` | Backup/restore age exceeds threshold | Use isolated fixture/time-control supported by test harness | Stale backup/restore evidence alerts; no marker editing | P0 | NOT RUN |
| `REC-016` | RPO/RTO rehearsal | Time synthetic loss, detection, decision, restore, validation and service return | Achieved timings recorded without claiming approval; compare to owner-approved objectives | P0 | NOT RUN |
| `REC-017` | Newly created encrypted/signed backup off-host custody and retrieval | Transfer the complete exact backup set to the approved mounted off-host custody root, retrieve it into a new staging-only intake, and verify every metadata-required artifact and sidecar | No plaintext MongoDB archive transfers; Mongo/uploads/manifest/media-reference digests and checksum sidecars match at source/custody/retrieval; metadata/manifest/media HMAC sidecars verify; mount/receipt and elapsed time are recorded | P0 | NOT RUN |

Safe simulated interruption, marker, lock and artifact cases must first pass:

```bash
cd menorah
bash scripts/qa/test-release-scripts.sh

cd scripts/qa
npm run test:release-workflow
npm run test:mongo-identities
npm run test:media-recovery
npm run test:media-transition
npm run test:backup-lifecycle
```

For full-host interruption cases, use a reviewed two-operator fault-injection
plan. One operator observes the updater's durable phase record; the other
terminates only the identified staging process at the approved point. Do not
use broad `pkill`, stop Docker, hand-write a marker or improvise timing.

## STAGING-ONLY Linux recovery helpers

Invoke a helper only when the matching genuine marker/state exists and the
[rollback runbook decision path](../09-rollback-runbook.md#decide-which-path-applies)
selects it:

```bash
cd "${STAGING_REPO}"

# Pre-migration/schema-compatible recorded-artifact rollback only.
bash menorah/deploy/ubuntu/rollback-last-deploy.sh

# Interrupted candidate-managed MongoDB identity reconciliation only.
bash menorah/deploy/ubuntu/recover-managed-mongo-identities.sh

# Strict exact-SHA proven-applied post-migration resume only.
bash menorah/deploy/ubuntu/resume-post-migration-release.sh
```

Each helper must refuse the wrong state. A refusal is evidence of a guard, not
permission to remove the guard.

## STAGING-ONLY coordinated restore rehearsal

This deliberately destroys the **synthetic operational staging database** and
must have two-person approval. It never uses a production archive. The
`production` script argument below selects the destructive operational-restore
code path; it does not identify or authorize the production deployment tier.
The external staging guards are therefore mandatory.

```bash
# STAGING-ONLY DESTRUCTIVE REHEARSAL.
readonly APPROVED_STAGING_REPLICA_SET='<approved-staging-replica-set>'
readonly STAGING_ARCHIVE='<newly-created-absolute-staging-source-archive.gz.enc>'
readonly REVIEWED_SOURCE_SHA256='<reviewed-lowercase-source-sha256>'
readonly REVIEWED_SANITIZED_SHA256='<reviewed-lowercase-sanitized-sha256>'
readonly REVIEWED_BACKUP_GIT_SHA='<reviewed-lowercase-backup-git-sha>'
readonly REVIEWED_BACKUP_SET_TIMESTAMP='<reviewed-yyyyMMddTHHmmssZ>'
readonly STAGING_CHANGE_REFERENCE='<approved-staging-change-reference>'
readonly APPROVED_OFF_HOST_CUSTODY_ROOT='<approved-mounted-off-host-staging-custody-root>'
readonly TRANSFER_RECEIPT_ID='<approved-transfer-receipt-id>'

case "${APPROVED_STAGING_REPLICA_SET}${STAGING_ARCHIVE}${REVIEWED_SOURCE_SHA256}${REVIEWED_SANITIZED_SHA256}${REVIEWED_BACKUP_GIT_SHA}${REVIEWED_BACKUP_SET_TIMESTAMP}${STAGING_CHANGE_REFERENCE}${APPROVED_OFF_HOST_CUSTODY_ROOT}${TRANSFER_RECEIPT_ID}" in
  *'<'*|*'>'*) echo 'Replace every reviewed-value placeholder.' >&2; exit 1 ;;
esac
[[ "${REVIEWED_SOURCE_SHA256}" =~ ^[0-9a-f]{64}$ ]]
[[ "${REVIEWED_SANITIZED_SHA256}" =~ ^[0-9a-f]{64}$ ]]
[[ "${REVIEWED_BACKUP_GIT_SHA}" =~ ^[0-9a-f]{40}$ ]]
test "${REVIEWED_BACKUP_GIT_SHA}" = "${APPROVED_PR_HEAD_SHA}"
[[ "${REVIEWED_BACKUP_SET_TIMESTAMP}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
[[ "${TRANSFER_RECEIPT_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$ ]]
(( ${#STAGING_CHANGE_REFERENCE} >= 8 && ${#STAGING_CHANGE_REFERENCE} <= 200 ))
[[ "${STAGING_CHANGE_REFERENCE}" != *$'\n'* ]]
[[ "${STAGING_CHANGE_REFERENCE}" != *$'\r'* ]]

test "${MONGODB_REPLICA_SET_NAME:-}" = "${APPROVED_STAGING_REPLICA_SET}"
test "${MONGO_PRIMARY_HOST:-mongo-primary:27017}" = 'mongo-primary:27017'
test -n "${MONGO_RESTORE_USER:-}"
test -n "${MONGODB_PRODUCTION_RESTORE_URI:-}"
test -n "${BACKUP_ENCRYPTION_PASSWORD:-}"
test -n "${BACKUP_INTEGRITY_HMAC_KEY:-}"

BACKUP_ROOT_REAL="$(realpath -e -- "${MENORAH_BACKUP_ROOT}")"
STAGING_ARCHIVE_REAL="$(realpath -e -- "${STAGING_ARCHIVE}")"
readonly BACKUP_ROOT_REAL STAGING_ARCHIVE_REAL

case "${STAGING_ARCHIVE_REAL}" in
  "${BACKUP_ROOT_REAL}"/restore-tests/*)
    echo 'The source archive must not be a restore-test artifact.' >&2
    exit 1
    ;;
  "${BACKUP_ROOT_REAL}"/*.archive.gz.enc) ;;
  *)
    echo 'Archive is not an approved encrypted source archive inside the staging backup root.' >&2
    exit 1
    ;;
esac

test -r "${STAGING_ARCHIVE_REAL}"
test -r "${STAGING_ARCHIVE_REAL}.sha256"
read -r RECORDED_SOURCE_SHA256 _ < "${STAGING_ARCHIVE_REAL}.sha256"
ACTUAL_SOURCE_SHA256="$(sha256sum -- "${STAGING_ARCHIVE_REAL}" | awk '{print $1}')"
test "${RECORDED_SOURCE_SHA256}" = "${REVIEWED_SOURCE_SHA256}"
test "${ACTUAL_SOURCE_SHA256}" = "${REVIEWED_SOURCE_SHA256}"

SOURCE_SET_DIR_REAL="$(
  realpath -e -- "$(dirname "$(dirname "${STAGING_ARCHIVE_REAL}")")"
)"
readonly SOURCE_SET_DIR_REAL
SOURCE_SET_RELATIVE="${SOURCE_SET_DIR_REAL#"${BACKUP_ROOT_REAL}/"}"
readonly SOURCE_SET_RELATIVE
test "${SOURCE_SET_RELATIVE}" = "manual/${REVIEWED_BACKUP_SET_TIMESTAMP}"
test "$(basename "${STAGING_ARCHIVE_REAL}")" \
  = "menorah-mongo-${REVIEWED_BACKUP_SET_TIMESTAMP}.archive.gz.enc"

readonly SOURCE_METADATA_FILE="${SOURCE_SET_DIR_REAL}/metadata/metadata.json"
test -f "${SOURCE_METADATA_FILE}"
test ! -L "${SOURCE_METADATA_FILE}"
test -r "${SOURCE_METADATA_FILE}"
test -f "${SOURCE_METADATA_FILE}.hmac-sha256"
test ! -L "${SOURCE_METADATA_FILE}.hmac-sha256"

SOURCE_METADATA_FILE="${SOURCE_METADATA_FILE}" \
SOURCE_SET_DIR="${SOURCE_SET_DIR_REAL}" \
SOURCE_ARCHIVE="${STAGING_ARCHIVE_REAL}" \
EXPECTED_SOURCE_SHA="${REVIEWED_SOURCE_SHA256}" \
EXPECTED_SET_TIMESTAMP="${REVIEWED_BACKUP_SET_TIMESTAMP}" \
EXPECTED_BACKUP_GIT_SHA="${REVIEWED_BACKUP_GIT_SHA}" \
node <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha256 = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(file);
  input.on('error', reject);
  input.on('data', (chunk) => hash.update(chunk));
  input.on('end', () => resolve(hash.digest('hex')));
});

(async () => {
  const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || '';
  if (Buffer.byteLength(key, 'utf8') < 32) throw new Error();
  const setDir = fs.realpathSync(process.env.SOURCE_SET_DIR);

  const checkedFile = (requested) => {
    const stat = fs.lstatSync(requested);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
    const resolved = fs.realpathSync(requested);
    if (!resolved.startsWith(`${setDir}${path.sep}`)) throw new Error();
    return resolved;
  };

  const verifyHmac = (file) => {
    const sidecar = checkedFile(`${file}.hmac-sha256`);
    const expected = fs.readFileSync(sidecar, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error();
    const actual = crypto
      .createHmac('sha256', key)
      .update(fs.readFileSync(file))
      .digest('hex');
    if (!crypto.timingSafeEqual(
      Buffer.from(actual, 'hex'),
      Buffer.from(expected, 'hex')
    )) throw new Error();
  };

  const metadataFile = checkedFile(process.env.SOURCE_METADATA_FILE);
  const metadataBytes = fs.readFileSync(metadataFile);
  verifyHmac(metadataFile);
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  const valid =
    metadata.schemaVersion === 3 &&
    metadata.artifactType === 'mongodb-full-instance-oplog' &&
    metadata.scope === 'full-instance' &&
    metadata.backupType === 'manual' &&
    metadata.timestamp === process.env.EXPECTED_SET_TIMESTAMP &&
    metadata.encrypted === true &&
    metadata.oplog === true &&
    metadata.deployedReleaseSha === process.env.EXPECTED_BACKUP_GIT_SHA &&
    metadata.directProductionRestoreAllowed === false &&
    metadata.requiredSanitizationNamespace === 'menorah.*';
  if (!valid) throw new Error();

  const required = [
    ['mongoArchive', 'mongoArchiveSha256', 'mongo', false],
    ['uploadsArchive', 'uploadsArchiveSha256', 'uploads', false],
    ['uploadsManifest', 'uploadsManifestSha256', 'metadata', true],
    [
      'mediaReferenceVerification',
      'mediaReferenceVerificationSha256',
      'metadata',
      true,
    ],
  ];

  for (const [pathField, shaField, expectedDirectory, signed] of required) {
    const artifact = checkedFile(metadata[pathField]);
    const relative = path.relative(setDir, artifact).split(path.sep);
    if (relative.length !== 2 || relative[0] !== expectedDirectory) {
      throw new Error();
    }
    const expectedSha = metadata[shaField];
    if (!/^[0-9a-f]{64}$/.test(expectedSha) ||
        await sha256(artifact) !== expectedSha) throw new Error();
    const checksum = checkedFile(`${artifact}.sha256`);
    const match = fs
      .readFileSync(checksum, 'utf8')
      .trim()
      .match(/^([0-9a-f]{64})\s+\*?(.+)$/);
    if (!match || match[1] !== expectedSha ||
        fs.realpathSync(match[2]) !== artifact) throw new Error();
    if (signed) verifyHmac(artifact);
  }

  if (fs.realpathSync(metadata.mongoArchive) !==
      fs.realpathSync(process.env.SOURCE_ARCHIVE) ||
      metadata.mongoArchiveSha256 !== process.env.EXPECTED_SOURCE_SHA) {
    throw new Error();
  }
})().catch(() => process.exit(1));
NODE

# Transfer the complete newly created encrypted/signed backup set to an
# approved mounted off-host custody target. The mount and receipt are approved
# external inputs; this package never invents an object-store or credential.
test -d "${APPROVED_OFF_HOST_CUSTODY_ROOT}"
test ! -L "${APPROVED_OFF_HOST_CUSTODY_ROOT}"
mountpoint -q "${APPROVED_OFF_HOST_CUSTODY_ROOT}"
OFF_HOST_CUSTODY_REAL="$(realpath -e -- "${APPROVED_OFF_HOST_CUSTODY_ROOT}")"
readonly OFF_HOST_CUSTODY_REAL
case "${OFF_HOST_CUSTODY_REAL}" in
  /srv/menorah-staging/*)
    echo 'Off-host custody must not resolve beneath the staging host root.' >&2
    exit 1
    ;;
esac

readonly CUSTODY_TRANSFER_ROOT="${OFF_HOST_CUSTODY_REAL}/${TRANSFER_RECEIPT_ID}"
test ! -e "${CUSTODY_TRANSFER_ROOT}"
test ! -L "${CUSTODY_TRANSFER_ROOT}"
install -d -m 0700 \
  "${CUSTODY_TRANSFER_ROOT}/$(dirname "${SOURCE_SET_RELATIVE}")"
readonly CUSTODY_SET_DIR="${CUSTODY_TRANSFER_ROOT}/${SOURCE_SET_RELATIVE}"
cp --archive --no-clobber -- "${SOURCE_SET_DIR_REAL}" "${CUSTODY_SET_DIR}"

readonly CUSTODY_ARCHIVE="${CUSTODY_SET_DIR}/mongo/$(basename "${STAGING_ARCHIVE_REAL}")"
readonly CUSTODY_METADATA="${CUSTODY_SET_DIR}/metadata/metadata.json"
test "$(sha256sum -- "${CUSTODY_ARCHIVE}" | awk '{print $1}')" \
  = "${REVIEWED_SOURCE_SHA256}"
cmp -- "${SOURCE_METADATA_FILE}" "${CUSTODY_METADATA}"
cmp -- "${SOURCE_METADATA_FILE}.hmac-sha256" \
  "${CUSTODY_METADATA}.hmac-sha256"
if find "${CUSTODY_SET_DIR}/mongo" -maxdepth 1 -type f \
  -name '*.archive.gz' -print -quit | grep -q .; then
  echo 'Plaintext MongoDB archive found in off-host custody transfer.' >&2
  exit 1
fi

# Retrieve into a new staging-only intake directory and verify the retrieved
# bytes against the reviewed digest and already validated signed metadata.
readonly RETRIEVAL_ROOT='/srv/menorah-staging/restore-retrieval'
install -d -m 0700 "${RETRIEVAL_ROOT}"
test "$(realpath -e -- "${RETRIEVAL_ROOT}")" = "${RETRIEVAL_ROOT}"
readonly RETRIEVED_TRANSFER_ROOT="${RETRIEVAL_ROOT}/${TRANSFER_RECEIPT_ID}"
test ! -e "${RETRIEVED_TRANSFER_ROOT}"
test ! -L "${RETRIEVED_TRANSFER_ROOT}"
install -d -m 0700 \
  "${RETRIEVED_TRANSFER_ROOT}/$(dirname "${SOURCE_SET_RELATIVE}")"
readonly RETRIEVED_SET_DIR="${RETRIEVED_TRANSFER_ROOT}/${SOURCE_SET_RELATIVE}"
cp --archive --no-clobber -- "${CUSTODY_SET_DIR}" "${RETRIEVED_SET_DIR}"

readonly RETRIEVED_ARCHIVE="${RETRIEVED_SET_DIR}/mongo/$(basename "${STAGING_ARCHIVE_REAL}")"
readonly RETRIEVED_METADATA="${RETRIEVED_SET_DIR}/metadata/metadata.json"
test "$(sha256sum -- "${RETRIEVED_ARCHIVE}" | awk '{print $1}')" \
  = "${REVIEWED_SOURCE_SHA256}"
cmp -- "${STAGING_ARCHIVE_REAL}" "${RETRIEVED_ARCHIVE}"
cmp -- "${SOURCE_METADATA_FILE}" "${RETRIEVED_METADATA}"
cmp -- "${SOURCE_METADATA_FILE}.hmac-sha256" \
  "${RETRIEVED_METADATA}.hmac-sha256"

SOURCE_SET_DIR="${SOURCE_SET_DIR_REAL}" \
SOURCE_METADATA_FILE="${SOURCE_METADATA_FILE}" \
CUSTODY_SET_DIR="${CUSTODY_SET_DIR}" \
RETRIEVED_SET_DIR="${RETRIEVED_SET_DIR}" \
node <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha256 = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(file);
  input.on('error', reject);
  input.on('data', (chunk) => hash.update(chunk));
  input.on('end', () => resolve(hash.digest('hex')));
});

(async () => {
  const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || '';
  if (Buffer.byteLength(key, 'utf8') < 32) throw new Error();
  const sourceRoot = fs.realpathSync(process.env.SOURCE_SET_DIR);
  const copyRoots = [
    fs.realpathSync(process.env.CUSTODY_SET_DIR),
    fs.realpathSync(process.env.RETRIEVED_SET_DIR),
  ];

  const checkedCopy = (root, relative) => {
    const requested = path.join(root, relative);
    const stat = fs.lstatSync(requested);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
    const resolved = fs.realpathSync(requested);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error();
    return resolved;
  };

  const verifyHmac = (file, sidecar) => {
    const expected = fs.readFileSync(sidecar, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error();
    const actual = crypto
      .createHmac('sha256', key)
      .update(fs.readFileSync(file))
      .digest('hex');
    if (!crypto.timingSafeEqual(
      Buffer.from(actual, 'hex'),
      Buffer.from(expected, 'hex')
    )) throw new Error();
  };

  const sourceMetadata = fs.realpathSync(process.env.SOURCE_METADATA_FILE);
  const metadataRelative = path.relative(sourceRoot, sourceMetadata);
  const metadataBytes = fs.readFileSync(sourceMetadata);
  const sourceMetadataHmac = fs.readFileSync(
    `${sourceMetadata}.hmac-sha256`
  );
  const metadata = JSON.parse(metadataBytes.toString('utf8'));

  for (const root of copyRoots) {
    const copiedMetadata = checkedCopy(root, metadataRelative);
    const copiedMetadataHmac = checkedCopy(
      root,
      `${metadataRelative}.hmac-sha256`
    );
    if (!fs.readFileSync(copiedMetadata).equals(metadataBytes) ||
        !fs.readFileSync(copiedMetadataHmac).equals(sourceMetadataHmac)) {
      throw new Error();
    }
    verifyHmac(copiedMetadata, copiedMetadataHmac);
  }

  const required = [
    ['mongoArchive', 'mongoArchiveSha256', false],
    ['uploadsArchive', 'uploadsArchiveSha256', false],
    ['uploadsManifest', 'uploadsManifestSha256', true],
    ['mediaReferenceVerification', 'mediaReferenceVerificationSha256', true],
  ];

  for (const [pathField, shaField, signed] of required) {
    const sourceArtifact = fs.realpathSync(metadata[pathField]);
    const relative = path.relative(sourceRoot, sourceArtifact);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error();
    }
    const sourceChecksumBytes = fs.readFileSync(`${sourceArtifact}.sha256`);
    const sourceHmacBytes = signed
      ? fs.readFileSync(`${sourceArtifact}.hmac-sha256`)
      : null;

    for (const root of copyRoots) {
      const copiedArtifact = checkedCopy(root, relative);
      const copiedChecksum = checkedCopy(root, `${relative}.sha256`);
      if (await sha256(copiedArtifact) !== metadata[shaField] ||
          !fs.readFileSync(copiedChecksum).equals(sourceChecksumBytes)) {
        throw new Error();
      }
      if (signed) {
        const copiedHmac = checkedCopy(root, `${relative}.hmac-sha256`);
        if (!fs.readFileSync(copiedHmac).equals(sourceHmacBytes)) {
          throw new Error();
        }
        verifyHmac(copiedArtifact, copiedHmac);
      }
    }
  }
})().catch(() => process.exit(1));
NODE

RESTORE_URI_TO_VALIDATE="${MONGODB_PRODUCTION_RESTORE_URI}" \
EXPECTED_RESTORE_USER="${MONGO_RESTORE_USER}" \
EXPECTED_REPLICA_SET="${APPROVED_STAGING_REPLICA_SET}" \
node <<'NODE'
try {
  const uri = new URL(process.env.RESTORE_URI_TO_VALIDATE);
  const valid =
    uri.protocol === 'mongodb:' &&
    uri.hostname === 'mongo-primary' &&
    uri.port === '27017' &&
    uri.pathname === '/' &&
    decodeURIComponent(uri.username) === process.env.EXPECTED_RESTORE_USER &&
    uri.password.length > 0 &&
    uri.searchParams.get('authSource') === 'admin' &&
    uri.searchParams.get('replicaSet') === process.env.EXPECTED_REPLICA_SET &&
    uri.hash === '';
  if (!valid) process.exit(1);
} catch {
  process.exit(1);
}
NODE

readonly -a STAGING_COMPOSE=(
  docker compose
  -p "${APPROVED_COMPOSE_PROJECT}"
  -f "${STAGING_REPO}/menorah/deploy/docker-compose.production.yml"
  --env-file "${STAGING_ENV}"
)

"${STAGING_COMPOSE[@]}" --profile production-restore config --format json |
  EXPECTED_PROJECT="${APPROVED_COMPOSE_PROJECT}" \
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { input += chunk; });
    process.stdin.on("end", () => {
      const model = JSON.parse(input);
      if (model.name !== process.env.EXPECTED_PROJECT ||
          !model.services?.["mongo-primary"] ||
          !model.services?.["production-restore-runner"]) process.exit(1);
    });
  '

mapfile -t MONGO_CONTAINERS < <(
  "${STAGING_COMPOSE[@]}" ps -a -q mongo-primary
)
(( ${#MONGO_CONTAINERS[@]} == 1 ))
readonly MONGO_CONTAINER="${MONGO_CONTAINERS[0]}"

EXPECTED_MONGO_DATA="$(realpath -e -- "${MENORAH_DATA_ROOT}/mongo/primary")"
readonly EXPECTED_MONGO_DATA
test "${EXPECTED_MONGO_DATA}" = '/srv/menorah-staging/data/mongo/primary'

docker inspect "${MONGO_CONTAINER}" |
  EXPECTED_PROJECT="${APPROVED_COMPOSE_PROJECT}" \
  EXPECTED_MONGO_DATA="${EXPECTED_MONGO_DATA}" \
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { input += chunk; });
    process.stdin.on("end", () => {
      const containers = JSON.parse(input);
      if (containers.length !== 1) process.exit(1);
      const container = containers[0];
      const labels = container.Config?.Labels || {};
      const mounts = (container.Mounts || [])
        .filter(mount => mount.Destination === "/data/db");
      const valid =
        container.State?.Running === true &&
        labels["com.docker.compose.project"] === process.env.EXPECTED_PROJECT &&
        labels["com.docker.compose.service"] === "mongo-primary" &&
        mounts.length === 1 &&
        mounts[0].Type === "bind" &&
        mounts[0].RW === true &&
        mounts[0].Source === process.env.EXPECTED_MONGO_DATA;
      if (!valid) process.exit(1);
    });
  '

# The URI remains in the protected environment and is never placed in argv.
"${STAGING_COMPOSE[@]}" --profile production-restore run \
  --rm --no-deps -T \
  -e "EXPECTED_STAGING_REPLICA_SET=${APPROVED_STAGING_REPLICA_SET}" \
  -e 'EXPECTED_STAGING_PRIMARY=mongo-primary:27017' \
  production-restore-runner \
  mongosh --nodb --quiet --eval '
    const target = connect(process.env.MONGODB_PRODUCTION_RESTORE_URI);
    const admin = target.getSiblingDB("admin");
    const hello = admin.runCommand({ hello: 1 });
    if (hello.ok !== 1 ||
        hello.setName !== process.env.EXPECTED_STAGING_REPLICA_SET ||
        hello.isWritablePrimary !== true ||
        hello.primary !== process.env.EXPECTED_STAGING_PRIMARY ||
        hello.me !== process.env.EXPECTED_STAGING_PRIMARY) quit(1);

    const status = admin.runCommand({
      connectionStatus: 1,
      showPrivileges: false
    });
    const actualRoles = (status.authInfo?.authenticatedUserRoles || [])
      .map(({ role, db }) => `${role}@${db}`)
      .sort();
    const approvedRoles = ["dbAdmin@menorah", "readWrite@menorah"].sort();
    if (actualRoles.length !== approvedRoles.length ||
        !actualRoles.every((role, index) => role === approvedRoles[index])) {
      quit(1);
    }

    print(JSON.stringify({
      setName: hello.setName,
      primary: hello.primary,
      isWritablePrimary: hello.isWritablePrimary,
      roles: actualRoles
    }));
  '
```

Pause here. A second operator must compare the FQDN, sentinel, Compose project
and service labels, exact `/srv/menorah-staging/data/mongo/primary` bind,
replica/primary identity, restore roles, signed metadata, reviewed source,
custody and retrieved digests, off-host mount/receipt, synthetic-data
provenance and independently verified staging traffic drain. A path under the
staging backup root alone does not prove that an archive never originated from
production.

Only after that approval:

```bash
export RESTORE_ARCHIVE="${STAGING_ARCHIVE_REAL}"
export RESTORE_CONFIRM_PRODUCTION='RESTORE_PRODUCTION_WITH_DROP'
export RESTORE_TRAFFIC_DRAIN_CONFIRM='DRAINED_PUBLIC_TRAFFIC'
export RESTORE_EXPECTED_ARCHIVE_SHA256="${REVIEWED_SOURCE_SHA256}"
export RESTORE_EXPECTED_SANITIZED_SHA256="${REVIEWED_SANITIZED_SHA256}"
export RESTORE_EXPECTED_CURRENT_SHA="${APPROVED_PR_HEAD_SHA}"
export RESTORE_EXPECTED_BACKUP_GIT_SHA="${REVIEWED_BACKUP_GIT_SHA}"
export RESTORE_CHANGE_REFERENCE="${STAGING_CHANGE_REFERENCE}"

bash "${STAGING_REPO}/menorah/deploy/ubuntu/restore-latest-backup.sh" production

readonly RESTORE_IN_PROGRESS_MARKER="${MENORAH_DEPLOY_STATE_ROOT}/production-restore-in-progress.json"
readonly RESTORE_REVIEW_MARKER="${MENORAH_DEPLOY_STATE_ROOT}/production-restore-requires-review.json"

test ! -e "${RESTORE_IN_PROGRESS_MARKER}"
test -r "${RESTORE_REVIEW_MARKER}"

REVIEW_FILE="${RESTORE_REVIEW_MARKER}" \
EXPECTED_RELEASE_SHA="${APPROVED_PR_HEAD_SHA}" \
EXPECTED_BACKUP_SHA="${REVIEWED_BACKUP_GIT_SHA}" \
EXPECTED_ARCHIVE="${STAGING_ARCHIVE_REAL}" \
EXPECTED_ARCHIVE_SHA="${REVIEWED_SOURCE_SHA256}" \
EXPECTED_SANITIZED_SHA="${REVIEWED_SANITIZED_SHA256}" \
node <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.env.REVIEW_FILE, 'utf8'));
const valid =
  state.status === 'production-restore-requires-schema-review' &&
  state.currentReleaseSha === process.env.EXPECTED_RELEASE_SHA &&
  state.backupReleaseSha === process.env.EXPECTED_BACKUP_SHA &&
  state.archive === process.env.EXPECTED_ARCHIVE &&
  state.archiveSha256 === process.env.EXPECTED_ARCHIVE_SHA &&
  state.sanitizedArchiveSha256 === process.env.EXPECTED_SANITIZED_SHA &&
  state.sanitizedArtifactType === 'menorah-sanitized-restore' &&
  JSON.stringify(state.namespaceAllowlist) === JSON.stringify(['menorah.*']) &&
  state.nonMenorahControlFingerprintBefore ===
    state.nonMenorahControlFingerprintAfter;
if (!valid) process.exit(1);
NODE

for service in api-ios api-android api-web api-admin worker; do
  mapfile -t writer_containers < <(
    "${STAGING_COMPOSE[@]}" ps -a -q "${service}"
  )
  for writer_container in "${writer_containers[@]}"; do
    test "$(docker inspect --format '{{.State.Running}}' "${writer_container}")" \
      = 'false'
  done
done
```

Keep writers stopped and complete the separately recorded schema/migration
review. Then acknowledge only the exact marker-bound inputs:

```bash
readonly STAGING_SCHEMA_REVIEW_REFERENCE='<approved-schema-review-reference>'
case "${STAGING_SCHEMA_REVIEW_REFERENCE}" in
  *'<'*|*'>'*) echo 'Replace the schema-review placeholder.' >&2; exit 1 ;;
esac
(( ${#STAGING_SCHEMA_REVIEW_REFERENCE} >= 8 &&
    ${#STAGING_SCHEMA_REVIEW_REFERENCE} <= 200 ))
[[ "${STAGING_SCHEMA_REVIEW_REFERENCE}" != *$'\n'* ]]
[[ "${STAGING_SCHEMA_REVIEW_REFERENCE}" != *$'\r'* ]]

export RESTORE_RECOVERY_CONFIRM='ACKNOWLEDGE_SCHEMA_AND_MIGRATION_REVIEW'
export RESTORE_RECOVERY_APPROVED_RELEASE_SHA="${APPROVED_PR_HEAD_SHA}"
export RESTORE_RECOVERY_REVIEW_REFERENCE="${STAGING_SCHEMA_REVIEW_REFERENCE}"
export RESTORE_RECOVERY_ARCHIVE_SHA256="${REVIEWED_SOURCE_SHA256}"
export RESTORE_RECOVERY_SANITIZED_SHA256="${REVIEWED_SANITIZED_SHA256}"

bash "${STAGING_REPO}/menorah/deploy/ubuntu/acknowledge-production-restore.sh"

test ! -e "${RESTORE_REVIEW_MARKER}"

for service in api-ios api-android api-web api-admin worker; do
  mapfile -t writer_containers < <(
    "${STAGING_COMPOSE[@]}" ps -a -q "${service}"
  )
  for writer_container in "${writer_containers[@]}"; do
    test "$(docker inspect --format '{{.State.Running}}' "${writer_container}")" \
      = 'false'
  done
done

unset \
  RESTORE_ARCHIVE \
  RESTORE_CONFIRM_PRODUCTION \
  RESTORE_TRAFFIC_DRAIN_CONFIRM \
  RESTORE_EXPECTED_ARCHIVE_SHA256 \
  RESTORE_EXPECTED_SANITIZED_SHA256 \
  RESTORE_EXPECTED_CURRENT_SHA \
  RESTORE_EXPECTED_BACKUP_GIT_SHA \
  RESTORE_CHANGE_REFERENCE \
  RESTORE_RECOVERY_CONFIRM \
  RESTORE_RECOVERY_APPROVED_RELEASE_SHA \
  RESTORE_RECOVERY_REVIEW_REFERENCE \
  RESTORE_RECOVERY_ARCHIVE_SHA256 \
  RESTORE_RECOVERY_SANITIZED_SHA256

export DEPLOY_BRANCH="${CANDIDATE_BRANCH}"
export DEPLOY_RELEASE_SHA="${APPROVED_PR_HEAD_SHA}"
export DEPLOY_MIGRATION_APPROVED_SHA="${APPROVED_PR_HEAD_SHA}"
export DEPLOY_CHANGE_REFERENCE="${STAGING_CHANGE_REFERENCE}"

bash "${STAGING_REPO}/menorah/deploy/ubuntu/update-from-git.sh"
```

The restore script independently verifies the signed restore-test artifact,
namespace allowlist, tool/server versions, writer stop and control-plane
fingerprint. Do not bypass those internal checks or paste digests, credentials
or approvals into this template.

## Exit evidence

The recovery gate passes only with separate evidence for backup, cryptographic
health, encrypted off-host transfer/retrieval, isolated restore, media,
migrations, every interruption state, pre-migration rollback, post-migration
recovery, coordinated restore and achieved RPO/RTO. Prometheus age metrics do
not replace archive verification.
Live-host proof remains a separate `INFRASTRUCTURE ACTION`.
