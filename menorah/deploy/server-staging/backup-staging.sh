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
readonly BUNDLE_ROOT='/opt/menorah-staging/backups/bundles'
readonly RETRIEVAL_ROOT='/opt/menorah-staging/data/backup-retrieval'
readonly UPLOAD_ROOT='/opt/menorah-staging/data/uploads'
readonly MANAGED_MEDIA_ROOT='/opt/menorah-staging/data/managed-media'
readonly STATE_ROOT='/opt/menorah-staging/deploy-state'
readonly LOGS_ROOT='/opt/menorah-staging/logs'
readonly ENV_ROOT='/opt/menorah-staging/env'
readonly APP_ROOT='/opt/menorah-staging/app'
readonly DATABASE='menorah_staging'
readonly REPLICA_SET='menorah-staging-rs'
readonly BACKUP_LOCK='/opt/menorah-staging/deploy-state/.backup.lock'
readonly ENCRYPTION_KEY_FILE='/run/secrets/menorah-staging-backup-encryption-key'
readonly SIGNING_KEY_FILE='/run/secrets/menorah-staging-backup-signing-key'

fail() {
  printf '%s\n' "Server-staging backup refused: $*" >&2
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

record_safe_media_tree() {
  root="$1"
  label="$2"
  manifest="$3"
  unsafe_entry="$(
    find "${root}" -mindepth 1 ! -type d ! -type f -print -quit
  )"
  [ -z "${unsafe_entry}" ] \
    || fail "${label} contains a symbolic link or special filesystem entry"
  hard_link="$(
    find "${root}" -mindepth 1 -type f -links +1 -print -quit
  )"
  [ -z "${hard_link}" ] \
    || fail "${label} contains a hard-linked file"
  if ! find "${root}" -mindepth 1 -print0 \
    | perl -0ne 'chomp; exit 1 if /[^\x20-\x7e]/ || /\\/'
  then
    fail "${label} contains a path that cannot be represented safely"
  fi
  (
    cd "${root}"
    find . -mindepth 1 -printf '%y|%p\0' | sort -z
  ) > "${manifest}"
}

publish_latest_atomically() {
  root="$1"
  temporary="$2"
  label="$3"
  [ ! -L "${root}/LATEST" ] \
    || fail "${label} latest pointer must not be a symlink"
  if [ -e "${root}/LATEST" ]; then
    [ -f "${root}/LATEST" ] \
      || fail "${label} latest pointer must be a regular file"
  fi
  [ ! -e "${temporary}" ] && [ ! -L "${temporary}" ] \
    || fail "${label} latest temporary path already exists"
  set -C
  printf '%s\n' "${STAMP}" > "${temporary}"
  set +C
  chmod 600 "${temporary}"
  mv -fT -- "${temporary}" "${root}/LATEST"
}

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
[ "${MENORAH_STAGING_BACKUP_ACK+x}" = x ] \
  && [ "${MENORAH_STAGING_BACKUP_ACK}" = 'BACKUP_MENORAH_STAGING_SYNTHETIC_DATA' ] \
  || fail 'explicit staging backup acknowledgment is required'
[ "${MENORAH_STAGING_WRITERS_QUIESCED+x}" = x ] \
  && [ "${MENORAH_STAGING_WRITERS_QUIESCED}" = 'APPLICATION_WRITERS_STOPPED' ] \
  || fail 'application writers must be explicitly quiesced'

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
  || fail 'unexpected staging replica set'

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
require_exact_directory "${BUNDLE_ROOT}" "${BUNDLE_ROOT}" 'backup bundle root'
require_exact_directory "${RETRIEVAL_ROOT}" "${RETRIEVAL_ROOT}" \
  'retrieval root'
require_exact_directory "${UPLOAD_ROOT}" "${UPLOAD_ROOT}" 'upload root'
require_exact_directory "${MANAGED_MEDIA_ROOT}" "${MANAGED_MEDIA_ROOT}" \
  'managed-media root'

[ "${MENORAH_SERVER_STAGING_RUNTIME_SHA+x}" = x ] \
  || fail 'MENORAH_SERVER_STAGING_RUNTIME_SHA is required'
printf '%s' "${MENORAH_SERVER_STAGING_RUNTIME_SHA}" \
  | grep -Eq '^[0-9a-f]{40}$' \
  || fail 'runtime SHA must be a full lowercase Git SHA'
[ "${MONGODB_STAGING_BACKUP_URI+x}" = x ] \
  || fail 'MONGODB_STAGING_BACKUP_URI is required'
printf '%s' "${MONGODB_STAGING_BACKUP_URI}" \
  | grep -Eq '^mongodb://menorah-staging-backup:[^[:space:]@/?#]+@staging-mongo-primary:27017/menorah_staging\?replicaSet=menorah-staging-rs&authSource=admin$' \
  || fail 'backup URI is not bound to the staging backup identity'
single_line_uri="$(printf '%s' "${MONGODB_STAGING_BACKUP_URI}" | tr -d '\r\n')"
[ "${single_line_uri}" = "${MONGODB_STAGING_BACKUP_URI}" ] \
  || fail 'backup URI must be one line'
[ -s "${ENCRYPTION_KEY_FILE}" ] && [ ! -L "${ENCRYPTION_KEY_FILE}" ] \
  || fail 'staging backup encryption key is unavailable'
[ -s "${SIGNING_KEY_FILE}" ] && [ ! -L "${SIGNING_KEY_FILE}" ] \
  || fail 'staging backup signing key is unavailable'

case "${BACKUP_LOCK}" in
  /opt/menorah-staging/deploy-state/.backup.lock) ;;
  *) fail 'unsafe backup lock path' ;;
esac
set -C
: > "${BACKUP_LOCK}" 2>/dev/null \
  || fail 'another staging backup is running or requires lock review'
set +C
chmod 600 "${BACKUP_LOCK}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly INCOMPLETE_DIR="${BUNDLE_ROOT}/.incomplete-${STAMP}"
readonly FINAL_DIR="${BUNDLE_ROOT}/${STAMP}"
readonly RETRIEVAL_INCOMPLETE="${RETRIEVAL_ROOT}/.incomplete-${STAMP}"
readonly RETRIEVAL_FINAL="${RETRIEVAL_ROOT}/${STAMP}"
readonly MONGO_CONFIG="${STATE_ROOT}/.backup-mongodump-${STAMP}-$$.yml"
readonly BUNDLE_LATEST_TEMP="${BUNDLE_ROOT}/.LATEST-${STAMP}-$$"
readonly RETRIEVAL_LATEST_TEMP="${RETRIEVAL_ROOT}/.LATEST-${STAMP}-$$"

case "${INCOMPLETE_DIR}" in
  /opt/menorah-staging/backups/bundles/.incomplete-[0-9]*Z) ;;
  *) fail 'unsafe incomplete backup path' ;;
esac
case "${RETRIEVAL_INCOMPLETE}" in
  /opt/menorah-staging/data/backup-retrieval/.incomplete-[0-9]*Z) ;;
  *) fail 'unsafe incomplete retrieval path' ;;
esac
case "${MONGO_CONFIG}" in
  /opt/menorah-staging/deploy-state/.backup-mongodump-[0-9]*Z-[0-9]*) ;;
  *) fail 'unsafe temporary MongoDB configuration path' ;;
esac

cleanup() {
  status="$?"
  trap - EXIT HUP INT TERM
  rm -f -- \
    "${MONGO_CONFIG}" \
    "${BUNDLE_LATEST_TEMP}" \
    "${RETRIEVAL_LATEST_TEMP}"
  if [ -d "${INCOMPLETE_DIR}" ]; then
    rm -rf -- "${INCOMPLETE_DIR}"
  fi
  if [ -d "${RETRIEVAL_INCOMPLETE}" ]; then
    rm -rf -- "${RETRIEVAL_INCOMPLETE}"
  fi
  rm -f -- "${BACKUP_LOCK}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

[ ! -e "${FINAL_DIR}" ] && [ ! -L "${FINAL_DIR}" ] \
  || fail 'backup timestamp already exists'
[ ! -e "${RETRIEVAL_FINAL}" ] && [ ! -L "${RETRIEVAL_FINAL}" ] \
  || fail 'retrieval timestamp already exists'
[ ! -e "${MONGO_CONFIG}" ] && [ ! -L "${MONGO_CONFIG}" ] \
  || fail 'temporary MongoDB configuration already exists'
mkdir -- "${INCOMPLETE_DIR}" "${RETRIEVAL_INCOMPLETE}"

record_safe_media_tree \
  "${UPLOAD_ROOT}" \
  'upload root' \
  "${INCOMPLETE_DIR}/uploads-entries.manifest"
record_safe_media_tree \
  "${MANAGED_MEDIA_ROOT}" \
  'managed-media root' \
  "${INCOMPLETE_DIR}/managed-media-entries.manifest"

escaped_uri="$(
  printf '%s' "${MONGODB_STAGING_BACKUP_URI}" \
    | sed 's/\\/\\\\/g; s/"/\\"/g'
)"
set -C
printf 'uri: "%s"\n' "${escaped_uri}" > "${MONGO_CONFIG}"
set +C
chmod 600 "${MONGO_CONFIG}"

mongodump \
  "--config=${MONGO_CONFIG}" \
  "--db=${DATABASE}" \
  "--archive=${INCOMPLETE_DIR}/database.archive.gz" \
  --gzip \
  >/dev/null

MONGODB_STAGING_BACKUP_URI="${MONGODB_STAGING_BACKUP_URI}" \
  mongosh --nodb --quiet --eval '
    const connection = connect(process.env.MONGODB_STAGING_BACKUP_URI);
    const source = connection.getSiblingDB("menorah_staging");
    const canonical = (value) => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value).sort().map((key) => [key, canonical(value[key])])
        );
      }
      return value;
    };
    const collections = source.getCollectionNames().sort().map((name) => ({
      name,
      documentCount: source.getCollection(name).countDocuments({}),
      indexes: source.getCollection(name).getIndexes()
        .map(canonical)
        .sort((left, right) => String(left.name).localeCompare(
          String(right.name)
        )),
    }));
    print(JSON.stringify(canonical({
      database: "menorah_staging",
      collections,
    })));
  ' > "${INCOMPLETE_DIR}/database-manifest.json"

tar -C "${UPLOAD_ROOT}" -czf "${INCOMPLETE_DIR}/uploads.tar.gz" .
(
  cd "${UPLOAD_ROOT}"
  find . -type f -print0 \
    | sort -z \
    | xargs -0 -r sha256sum
) > "${INCOMPLETE_DIR}/uploads-manifest.sha256"
tar -C "${MANAGED_MEDIA_ROOT}" \
  -czf "${INCOMPLETE_DIR}/managed-media.tar.gz" .
(
  cd "${MANAGED_MEDIA_ROOT}"
  find . -type f -print0 \
    | sort -z \
    | xargs -0 -r sha256sum
) > "${INCOMPLETE_DIR}/managed-media-manifest.sha256"

cat > "${INCOMPLETE_DIR}/metadata.json" <<EOF
{
  "schemaVersion": 1,
  "composeProject": "${ACTIVE_PROJECT}",
  "environmentId": "${EXPECTED_ENVIRONMENT_ID}",
  "filesystemRoot": "${EXPECTED_ROOT}",
  "dataRoot": "${DATA_ROOT}",
  "backupRoot": "${BACKUP_ROOT}",
  "deployStateRoot": "${STATE_ROOT}",
  "database": "${DATABASE}",
  "replicaSet": "${REPLICA_SET}",
  "runtimeSha": "${MENORAH_SERVER_STAGING_RUNTIME_SHA}",
  "createdAt": "${STAMP}",
  "mediaScopes": ["uploads", "managed-media"],
  "mediaEntryManifestFormat": "nul-type-path-v1",
  "syntheticDataOnly": true,
  "consistency": "application-writers-quiesced"
}
EOF

openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "${INCOMPLETE_DIR}/database.archive.gz" \
  -out "${INCOMPLETE_DIR}/database.archive.gz.enc" \
  -pass "file:${ENCRYPTION_KEY_FILE}"
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "${INCOMPLETE_DIR}/uploads.tar.gz" \
  -out "${INCOMPLETE_DIR}/uploads.tar.gz.enc" \
  -pass "file:${ENCRYPTION_KEY_FILE}"
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "${INCOMPLETE_DIR}/managed-media.tar.gz" \
  -out "${INCOMPLETE_DIR}/managed-media.tar.gz.enc" \
  -pass "file:${ENCRYPTION_KEY_FILE}"
rm -f -- \
  "${INCOMPLETE_DIR}/database.archive.gz" \
  "${INCOMPLETE_DIR}/uploads.tar.gz" \
  "${INCOMPLETE_DIR}/managed-media.tar.gz"

(
  cd "${INCOMPLETE_DIR}"
  sha256sum \
    database.archive.gz.enc \
    database-manifest.json \
    managed-media.tar.gz.enc \
    managed-media-entries.manifest \
    managed-media-manifest.sha256 \
    metadata.json \
    uploads.tar.gz.enc \
    uploads-entries.manifest \
    uploads-manifest.sha256 \
    > SHA256SUMS
)

perl -MDigest::SHA=hmac_sha256_hex -e '
  use strict;
  use warnings;
  my ($key_path, @paths) = @ARGV;
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
  print hmac_sha256_hex($payload, $key), "\n";
' \
  "${SIGNING_KEY_FILE}" \
  "${INCOMPLETE_DIR}/metadata.json" \
  "${INCOMPLETE_DIR}/database-manifest.json" \
  "${INCOMPLETE_DIR}/uploads-entries.manifest" \
  "${INCOMPLETE_DIR}/uploads-manifest.sha256" \
  "${INCOMPLETE_DIR}/managed-media-entries.manifest" \
  "${INCOMPLETE_DIR}/managed-media-manifest.sha256" \
  "${INCOMPLETE_DIR}/SHA256SUMS" \
  > "${INCOMPLETE_DIR}/signature.hmac-sha256"

chmod 700 "${INCOMPLETE_DIR}"
chmod 600 "${INCOMPLETE_DIR}"/*
mv -- "${INCOMPLETE_DIR}" "${FINAL_DIR}"
cp -a "${FINAL_DIR}/." "${RETRIEVAL_INCOMPLETE}/"
mv -- "${RETRIEVAL_INCOMPLETE}" "${RETRIEVAL_FINAL}"
publish_latest_atomically \
  "${BUNDLE_ROOT}" \
  "${BUNDLE_LATEST_TEMP}" \
  'backup'
publish_latest_atomically \
  "${RETRIEVAL_ROOT}" \
  "${RETRIEVAL_LATEST_TEMP}" \
  'retrieval'

trap - EXIT HUP INT TERM
rm -f -- \
  "${MONGO_CONFIG}" \
  "${BUNDLE_LATEST_TEMP}" \
  "${RETRIEVAL_LATEST_TEMP}" \
  "${BACKUP_LOCK}"
printf '%s\n' "Server-staging backup complete: ${STAMP}"
