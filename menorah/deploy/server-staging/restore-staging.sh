#!/bin/sh
set -eu

umask 077
export LC_ALL=C

readonly SERVER_PROJECT='menorah-staging'
readonly VALIDATION_PROJECT='menorah-server-staging-validation'
readonly EXPECTED_ENVIRONMENT_ID='menorah-server-staging-v1'
readonly EXPECTED_ROOT='/opt/menorah-staging'
readonly DATA_ROOT='/opt/menorah-staging/data'
readonly BACKUP_ROOT='/opt/menorah-staging/backups'
readonly RETRIEVAL_ROOT='/opt/menorah-staging/data/backup-retrieval'
readonly RESTORE_ROOT='/opt/menorah-staging/data/restore'
readonly RESTORE_MEDIA_ROOT='/opt/menorah-staging/data/restore-media'
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly LOGS_ROOT='/opt/menorah-staging/logs'
readonly ENV_ROOT='/opt/menorah-staging/env'
readonly APP_ROOT='/opt/menorah-staging/app'
readonly DATABASE='menorah_staging'
readonly REPLICA_SET='menorah-staging-rs'
readonly RESTORE_REPLICA_SET='menorah-staging-restore-rs'
readonly RESTORE_SERVICE='staging-mongo-restore'
readonly RESTORE_LOCK='/opt/menorah-staging/deploy-state/.restore.lock'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'
readonly ENCRYPTION_KEY_FILE='/run/secrets/menorah-staging-backup-encryption-key'
readonly SIGNING_KEY_FILE='/run/secrets/menorah-staging-backup-signing-key'

fail() {
  printf '%s\n' "Server-staging restore refused: $*" >&2
  exit 1
}

require_exact_directory() {
  actual="$1"
  expected="$2"
  label="$3"
  [ "${actual}" = "${expected}" ] \
    || fail "${label} is not the reviewed staging root"
  [ -d "${actual}" ] && [ ! -L "${actual}" ] \
    || fail "${label} must be an existing non-symlink directory"
  resolved="$(realpath -e -- "${actual}")" \
    || fail "${label} cannot be resolved"
  [ "${resolved}" = "${expected}" ] \
    || fail "${label} resolves outside the reviewed staging root"
}

[ "$#" -eq 1 ] || fail 'usage: restore-staging.sh YYYYMMDDTHHMMSSZ'
readonly STAMP="$1"
printf '%s' "${STAMP}" | grep -Eq '^[0-9]{8}T[0-9]{6}Z$' \
  || fail 'the explicit backup timestamp is invalid'

case "${COMPOSE_PROJECT_NAME-}" in
  "${SERVER_PROJECT}"|"${VALIDATION_PROJECT}") ;;
  *) fail 'unexpected Compose project' ;;
esac
readonly ACTIVE_PROJECT="${COMPOSE_PROJECT_NAME}"
[ "${MENORAH_SERVER_STAGING_ENVIRONMENT_ID+x}" = x ] \
  && [ "${MENORAH_SERVER_STAGING_ENVIRONMENT_ID}" = "${EXPECTED_ENVIRONMENT_ID}" ] \
  || fail 'unexpected environment identity'
[ "${MENORAH_STAGING_ROOTS_ACK+x}" = x ] \
  && [ "${MENORAH_STAGING_ROOTS_ACK}" = 'MENORAH_STAGING_ROOTS_REVIEWED' ] \
  || fail 'staging roots were not explicitly acknowledged'
[ "${MENORAH_STAGING_RESTORE_ACK+x}" = x ] \
  && [ "${MENORAH_STAGING_RESTORE_ACK}" = 'RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET' ] \
  || fail 'explicit staging restore acknowledgment is required'
[ "${MENORAH_STAGING_RESTORE_TARGET+x}" = x ] \
  && [ "${MENORAH_STAGING_RESTORE_TARGET}" = "${RESTORE_SERVICE}" ] \
  || fail 'restore target is not the disposable staging service'
[ "${MENORAH_STAGING_RESTORE_REPLICA_SET+x}" = x ] \
  && [ "${MENORAH_STAGING_RESTORE_REPLICA_SET}" = "${RESTORE_REPLICA_SET}" ] \
  || fail 'restore replica-set identity is invalid'

[ "${MENORAH_STAGING_ROOT+x}" = x ] \
  || fail 'MENORAH_STAGING_ROOT is required'
[ "${MENORAH_STAGING_APP_ROOT+x}" = x ] \
  || fail 'MENORAH_STAGING_APP_ROOT is required'
[ "${MENORAH_STAGING_DATA_ROOT+x}" = x ] \
  || fail 'MENORAH_STAGING_DATA_ROOT is required'
[ "${MENORAH_STAGING_BACKUP_ROOT+x}" = x ] \
  || fail 'MENORAH_STAGING_BACKUP_ROOT is required'
[ "${MENORAH_STAGING_DEPLOY_STATE_ROOT+x}" = x ] \
  || fail 'MENORAH_STAGING_DEPLOY_STATE_ROOT is required'
[ "${MENORAH_STAGING_LOGS_ROOT+x}" = x ] \
  || fail 'MENORAH_STAGING_LOGS_ROOT is required'
[ "${MENORAH_STAGING_ENV_ROOT+x}" = x ] \
  || fail 'MENORAH_STAGING_ENV_ROOT is required'
[ "${MENORAH_STAGING_DATABASE+x}" = x ] \
  && [ "${MENORAH_STAGING_DATABASE}" = "${DATABASE}" ] \
  || fail 'unexpected staging database'
[ "${MENORAH_STAGING_REPLICA_SET+x}" = x ] \
  && [ "${MENORAH_STAGING_REPLICA_SET}" = "${REPLICA_SET}" ] \
  || fail 'unexpected staging source replica set'

require_exact_directory "${MENORAH_STAGING_ROOT}" "${EXPECTED_ROOT}" \
  'filesystem root'
require_exact_directory "${MENORAH_STAGING_APP_ROOT}" "${APP_ROOT}" \
  'application root'
require_exact_directory "${MENORAH_STAGING_DATA_ROOT}" "${DATA_ROOT}" \
  'data root'
require_exact_directory "${MENORAH_STAGING_BACKUP_ROOT}" "${BACKUP_ROOT}" \
  'backup root'
require_exact_directory "${MENORAH_STAGING_DEPLOY_STATE_ROOT}" "${STATE_ROOT}" \
  'deployment-state root'
require_exact_directory "${MENORAH_STAGING_LOGS_ROOT}" "${LOGS_ROOT}" \
  'logs root'
require_exact_directory "${MENORAH_STAGING_ENV_ROOT}" "${ENV_ROOT}" \
  'environment root'
require_exact_directory "${RETRIEVAL_ROOT}" "${RETRIEVAL_ROOT}" \
  'retrieval root'
require_exact_directory "${RESTORE_ROOT}" "${RESTORE_ROOT}" 'restore root'
require_exact_directory "${RESTORE_MEDIA_ROOT}" "${RESTORE_MEDIA_ROOT}" \
  'restore media root'
require_exact_directory "${STATE_ROOT}/recovery" "${STATE_ROOT}/recovery" \
  'recovery-state root'

[ "${MENORAH_SERVER_STAGING_RUNTIME_SHA+x}" = x ] \
  || fail 'MENORAH_SERVER_STAGING_RUNTIME_SHA is required'
printf '%s' "${MENORAH_SERVER_STAGING_RUNTIME_SHA}" \
  | grep -Eq '^[0-9a-f]{40}$' \
  || fail 'runtime SHA must be a full lowercase Git SHA'
[ "${MONGODB_STAGING_RESTORE_URI+x}" = x ] \
  || fail 'MONGODB_STAGING_RESTORE_URI is required'
printf '%s' "${MONGODB_STAGING_RESTORE_URI}" \
  | grep -Eq '^mongodb://menorah-staging-restore:[^[:space:]@/?#]+@staging-mongo-restore:27017/menorah_staging\?replicaSet=menorah-staging-restore-rs&authSource=admin$' \
  || fail 'restore URI is not bound to the disposable staging target'
[ -s "${ENCRYPTION_KEY_FILE}" ] && [ ! -L "${ENCRYPTION_KEY_FILE}" ] \
  || fail 'staging backup encryption key is unavailable'
[ -s "${SIGNING_KEY_FILE}" ] && [ ! -L "${SIGNING_KEY_FILE}" ] \
  || fail 'staging backup signing key is unavailable'

readonly BUNDLE="${RETRIEVAL_ROOT}/${STAMP}"
readonly WORK_DIR="${RESTORE_ROOT}/.work-${STAMP}"
readonly MONGO_CONFIG="${RESTORE_ROOT}/.mongorestore-${STAMP}.yml"
readonly RESTORE_MARKER_TEMP="${RESTORE_ROOT}/.restore-marker-${STAMP}.json"
case "${BUNDLE}" in
  /opt/menorah-staging/data/backup-retrieval/[0-9]*Z) ;;
  *) fail 'unsafe retrieval bundle path' ;;
esac
case "${WORK_DIR}" in
  /opt/menorah-staging/data/restore/.work-[0-9]*Z) ;;
  *) fail 'unsafe restore work path' ;;
esac
[ -d "${BUNDLE}" ] && [ ! -L "${BUNDLE}" ] \
  || fail 'the explicit retrieval bundle is unavailable'
[ "$(realpath -e -- "${BUNDLE}")" = "${BUNDLE}" ] \
  || fail 'the retrieval bundle escapes staging storage'
[ ! -e "${WORK_DIR}" ] && [ ! -L "${WORK_DIR}" ] \
  || fail 'restore work path already exists'
[ ! -e "${MONGO_CONFIG}" ] && [ ! -L "${MONGO_CONFIG}" ] \
  || fail 'restore configuration path already exists'
[ ! -e "${RESTORE_MARKER_TEMP}" ] && [ ! -L "${RESTORE_MARKER_TEMP}" ] \
  || fail 'restore marker staging path already exists'
[ ! -L "${RESTORE_MARKER}" ] && [ ! -L "${RESTORE_REVIEW}" ] \
  || fail 'restore state markers must never be symlinks'
[ ! -e "${RESTORE_REVIEW}" ] \
  || fail 'a prior restore requires review'

case "${RESTORE_LOCK}" in
  /opt/menorah-staging/deploy-state/.restore.lock) ;;
  *) fail 'unsafe restore lock path' ;;
esac
set -C
: > "${RESTORE_LOCK}" 2>/dev/null \
  || fail 'another staging restore is running or requires lock review'
set +C
chmod 600 "${RESTORE_LOCK}"

cleanup() {
  status="$?"
  trap - EXIT HUP INT TERM
  rm -f -- "${MONGO_CONFIG}" "${RESTORE_MARKER_TEMP}"
  if [ -d "${WORK_DIR}" ]; then
    rm -rf -- "${WORK_DIR}"
  fi
  if [ "${status}" -ne 0 ] && [ -f "${RESTORE_MARKER}" ]; then
    cp -- "${RESTORE_MARKER}" "${RESTORE_REVIEW}" 2>/dev/null || :
  fi
  rm -f -- "${RESTORE_LOCK}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

mkdir -- "${WORK_DIR}"
cat > "${RESTORE_MARKER_TEMP}" <<EOF
{
  "schemaVersion": 1,
  "composeProject": "${ACTIVE_PROJECT}",
  "environmentId": "${EXPECTED_ENVIRONMENT_ID}",
  "filesystemRoot": "${EXPECTED_ROOT}",
  "deployStateRoot": "${STATE_ROOT}",
  "database": "${DATABASE}",
  "sourceReplicaSet": "${REPLICA_SET}",
  "targetService": "${RESTORE_SERVICE}",
  "targetReplicaSet": "${RESTORE_REPLICA_SET}",
  "runtimeSha": "${MENORAH_SERVER_STAGING_RUNTIME_SHA}",
  "backupTimestamp": "${STAMP}"
}
EOF
chmod 600 "${RESTORE_MARKER_TEMP}"
[ ! -e "${RESTORE_MARKER}" ] \
  || fail 'a staging restore is already in progress'
mv -- "${RESTORE_MARKER_TEMP}" "${RESTORE_MARKER}"

(
  cd "${BUNDLE}"
  sha256sum -c SHA256SUMS >/dev/null
)

perl -MDigest::SHA=hmac_sha256_hex -e '
  use strict;
  use warnings;
  my ($key_path, $expected_path, @paths) = @ARGV;
  open my $key_fh, "<", $key_path or die "signing key unavailable\n";
  binmode $key_fh;
  my $key = do { local $/; <$key_fh> };
  chomp $key;
  die "signing key is too short\n" if length($key) < 32;
  my $payload = "";
  for my $path (@paths) {
    open my $fh, "<", $path or die "signed input unavailable\n";
    binmode $fh;
    $payload .= do { local $/; <$fh> };
  }
  open my $expected_fh, "<", $expected_path
    or die "signature unavailable\n";
  my $expected = <$expected_fh>;
  chomp $expected;
  die "signature mismatch\n"
    unless hmac_sha256_hex($payload, $key) eq $expected;
' \
  "${SIGNING_KEY_FILE}" \
  "${BUNDLE}/signature.hmac-sha256" \
  "${BUNDLE}/metadata.json" \
  "${BUNDLE}/database-manifest.json" \
  "${BUNDLE}/uploads-manifest.sha256" \
  "${BUNDLE}/managed-media-manifest.sha256" \
  "${BUNDLE}/SHA256SUMS"

for expected_metadata in \
  '"composeProject": "menorah-staging"' \
  '"environmentId": "menorah-server-staging-v1"' \
  '"filesystemRoot": "/opt/menorah-staging"' \
  '"dataRoot": "/opt/menorah-staging/data"' \
  '"backupRoot": "/opt/menorah-staging/backups"' \
  '"deployStateRoot": "/opt/menorah-staging/deploy-state"' \
  '"database": "menorah_staging"' \
  '"replicaSet": "menorah-staging-rs"' \
  "\"runtimeSha\": \"${MENORAH_SERVER_STAGING_RUNTIME_SHA}\"" \
  '"mediaScopes": ["uploads", "managed-media"]' \
  '"syntheticDataOnly": true' \
  '"consistency": "application-writers-quiesced"'
do
  grep -F -- "${expected_metadata}" "${BUNDLE}/metadata.json" >/dev/null \
    || fail 'backup metadata is not bound to this staging restore'
done

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${BUNDLE}/database.archive.gz.enc" \
  -out "${WORK_DIR}/database.archive.gz" \
  -pass "file:${ENCRYPTION_KEY_FILE}"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${BUNDLE}/uploads.tar.gz.enc" \
  -out "${WORK_DIR}/uploads.tar.gz" \
  -pass "file:${ENCRYPTION_KEY_FILE}"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${BUNDLE}/managed-media.tar.gz.enc" \
  -out "${WORK_DIR}/managed-media.tar.gz" \
  -pass "file:${ENCRYPTION_KEY_FILE}"

escaped_uri="$(
  printf '%s' "${MONGODB_STAGING_RESTORE_URI}" \
    | sed 's/\\/\\\\/g; s/"/\\"/g'
)"
set -C
printf 'uri: "%s"\n' "${escaped_uri}" > "${MONGO_CONFIG}"
set +C
chmod 600 "${MONGO_CONFIG}"
MONGODB_STAGING_RESTORE_URI="${MONGODB_STAGING_RESTORE_URI}" \
  mongosh --nodb --quiet --eval '
    const restored = connect(process.env.MONGODB_STAGING_RESTORE_URI);
    const result = restored.dropDatabase();
    if (result.ok !== 1) {
      throw new Error("disposable staging restore database reset failed");
    }
  ' >/dev/null
mongorestore \
  "--config=${MONGO_CONFIG}" \
  "--archive=${WORK_DIR}/database.archive.gz" \
  '--nsInclude=menorah_staging.*' \
  --gzip \
  --drop \
  >/dev/null

find "${RESTORE_MEDIA_ROOT}" -mindepth 1 -maxdepth 1 \
  -exec rm -rf -- {} +
mkdir -- \
  "${RESTORE_MEDIA_ROOT}/uploads" \
  "${RESTORE_MEDIA_ROOT}/managed-media"
tar --no-same-owner -C "${RESTORE_MEDIA_ROOT}/uploads" \
  -xzf "${WORK_DIR}/uploads.tar.gz"
tar --no-same-owner -C "${RESTORE_MEDIA_ROOT}/managed-media" \
  -xzf "${WORK_DIR}/managed-media.tar.gz"
(
  cd "${RESTORE_MEDIA_ROOT}/uploads"
  find . -type f -print0 \
    | sort -z \
    | xargs -0 -r sha256sum
) > "${WORK_DIR}/restored-uploads-manifest.sha256"
cmp -s \
  "${BUNDLE}/uploads-manifest.sha256" \
  "${WORK_DIR}/restored-uploads-manifest.sha256" \
  || fail 'restored uploads do not match their signed manifest'
(
  cd "${RESTORE_MEDIA_ROOT}/managed-media"
  find . -type f -print0 \
    | sort -z \
    | xargs -0 -r sha256sum
) > "${WORK_DIR}/restored-managed-media-manifest.sha256"
cmp -s \
  "${BUNDLE}/managed-media-manifest.sha256" \
  "${WORK_DIR}/restored-managed-media-manifest.sha256" \
  || fail 'restored managed media does not match its signed manifest'

MONGODB_STAGING_RESTORE_URI="${MONGODB_STAGING_RESTORE_URI}" \
  mongosh --nodb --quiet --eval '
    const restored = connect(process.env.MONGODB_STAGING_RESTORE_URI);
    const canonical = (value) => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value).sort().map((key) => [key, canonical(value[key])])
        );
      }
      return value;
    };
    const collections = restored.getCollectionNames().sort().map((name) => ({
      name,
      documentCount: restored.getCollection(name).countDocuments({}),
      indexes: restored.getCollection(name).getIndexes()
        .map(canonical)
        .sort((left, right) => String(left.name).localeCompare(
          String(right.name)
        )),
    }));
    print(JSON.stringify(canonical({
      database: "menorah_staging",
      collections,
    })));
  ' > "${WORK_DIR}/restored-database-manifest.json"
cmp -s \
  "${BUNDLE}/database-manifest.json" \
  "${WORK_DIR}/restored-database-manifest.json" \
  || fail 'restored database counts or indexes differ from the backup'

trap - EXIT HUP INT TERM
rm -rf -- "${WORK_DIR}"
rm -f -- \
  "${MONGO_CONFIG}" \
  "${RESTORE_MARKER}" \
  "${RESTORE_LOCK}"
printf '%s\n' "Server-staging restore verified: ${STAMP}"
