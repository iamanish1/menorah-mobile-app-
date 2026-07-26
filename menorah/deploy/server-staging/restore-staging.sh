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
readonly RECOVERY_ROOT='/opt/menorah-staging/deploy-state/recovery'
readonly LOGS_ROOT='/opt/menorah-staging/logs'
readonly ENV_ROOT='/opt/menorah-staging/env'
readonly APP_ROOT='/opt/menorah-staging/app'
readonly DATABASE='menorah_staging'
readonly REPLICA_SET='menorah-staging-rs'
readonly RESTORE_REPLICA_SET='menorah-staging-restore-rs'
readonly RESTORE_SERVICE='staging-mongo-restore'
readonly RESTORE_LOCK='/opt/menorah-staging/deploy-state/.restore.lock'
readonly RESTORE_SESSION='/opt/menorah-staging/deploy-state/recovery/restore-session'
readonly RESTORE_MARKER='/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json'
readonly RESTORE_REVIEW='/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json'
readonly RESTORE_REVIEW_TEMP="/opt/menorah-staging/deploy-state/recovery/.restore-requires-review.$$.tmp"
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

require_bound_restore_session() {
  session_id="${MENORAH_STAGING_RESTORE_SESSION_ID-}"
  case "${ACTIVE_PROJECT}" in
    "${SERVER_PROJECT}")
      [ "${MENORAH_STAGING_RESTORE_SESSION_ID+x}" = x ] \
        || fail 'server restore requires a wrapper-owned session'
      printf '%s' "${session_id}" \
        | grep -Eq '^[0-9a-f]{40}-[0-9]+$' \
        || fail 'restore session identity is invalid'
      [ -f "${RESTORE_SESSION}" ] && [ ! -L "${RESTORE_SESSION}" ] \
        || fail 'server restore session marker is unavailable'
      [ "$(realpath -e -- "${RESTORE_SESSION}")" = "${RESTORE_SESSION}" ] \
        || fail 'server restore session marker is not canonical'
      session_line_count="$(wc -l < "${RESTORE_SESSION}")"
      [ "${session_line_count}" -eq 1 ] \
        || fail 'server restore session marker must contain one LF record'
      expected_session="restore-session-v1|${SERVER_PROJECT}|${EXPECTED_ENVIRONMENT_ID}|${MENORAH_SERVER_STAGING_RUNTIME_SHA}|${session_id}|target=${RESTORE_SERVICE}"
      [ "$(sed -n '1p' "${RESTORE_SESSION}")" = "${expected_session}" ] \
        || fail 'server restore session marker is not bound to this operation'
      ;;
    "${VALIDATION_PROJECT}")
      [ "${MENORAH_STAGING_RESTORE_SESSION_ID+x}" != x ] \
        || fail 'validation restore must use the bounded direct-rehearsal path'
      [ ! -e "${RESTORE_SESSION}" ] && [ ! -L "${RESTORE_SESSION}" ] \
        || fail 'validation restore is blocked by a stale session marker'
      ;;
  esac
}

require_regular_bundle_member() {
  member="$1"
  path="${BUNDLE}/${member}"
  [ -f "${path}" ] && [ ! -L "${path}" ] \
    || fail "retrieval bundle member is not a regular file: ${member}"
  [ "$(realpath -e -- "${path}")" = "${path}" ] \
    || fail "retrieval bundle member escapes its exact path: ${member}"
}

assert_exact_bundle_members() {
  for member in \
    database.archive.gz.enc \
    database-manifest.json \
    managed-media.tar.gz.enc \
    managed-media-entries.manifest \
    managed-media-manifest.sha256 \
    metadata.json \
    SHA256SUMS \
    signature.hmac-sha256 \
    uploads.tar.gz.enc \
    uploads-entries.manifest \
    uploads-manifest.sha256
  do
    require_regular_bundle_member "${member}"
  done
  unexpected_member="$(
    find "${BUNDLE}" -mindepth 1 -maxdepth 1 \
      ! -name database.archive.gz.enc \
      ! -name database-manifest.json \
      ! -name managed-media.tar.gz.enc \
      ! -name managed-media-entries.manifest \
      ! -name managed-media-manifest.sha256 \
      ! -name metadata.json \
      ! -name SHA256SUMS \
      ! -name signature.hmac-sha256 \
      ! -name uploads.tar.gz.enc \
      ! -name uploads-entries.manifest \
      ! -name uploads-manifest.sha256 \
      -print -quit
  )"
  [ -z "${unexpected_member}" ] \
    || fail 'retrieval bundle contains an unexpected member'
}

assert_exact_checksum_manifest() {
  perl -e '
    use strict;
    use warnings;
    my @expected = qw(
      database.archive.gz.enc
      database-manifest.json
      managed-media.tar.gz.enc
      managed-media-entries.manifest
      managed-media-manifest.sha256
      metadata.json
      uploads.tar.gz.enc
      uploads-entries.manifest
      uploads-manifest.sha256
    );
    my $path = shift @ARGV;
    open my $fh, "<", $path or die "checksum manifest unavailable\n";
    for my $expected (@expected) {
      my $line = <$fh>;
      die "checksum record missing\n" unless defined $line;
      die "checksum record is not LF terminated\n"
        unless $line =~ s/\n\z//;
      die "checksum record is invalid\n"
        unless $line =~ m{\A[0-9a-f]{64}  \Q$expected\E\z};
    }
    die "unexpected checksum record\n" if defined <$fh>;
  ' "${BUNDLE}/SHA256SUMS" \
    || fail 'backup checksum manifest is not the exact reviewed file set'
}

validate_regular_directory_archive() {
  archive="$1"
  label="$2"
  listing="${WORK_DIR}/.${label}-archive-members"
  verbose_listing="${WORK_DIR}/.${label}-archive-types"
  tar --quoting-style=escape -tzf "${archive}" > "${listing}" \
    || fail "${label} archive cannot be listed"
  tar --quoting-style=escape -tvzf "${archive}" > "${verbose_listing}" \
    || fail "${label} archive types cannot be listed"
  perl -ne '
    chomp;
    die "ambiguous archive path\n" if /\\/;
    next if $_ eq "." || $_ eq "./";
    die "archive path is not relative\n" unless m{\A\./};
    my $path = substr($_, 2);
    $path =~ s{/\z}{};
    die "archive path is ambiguous\n"
      if $path eq "" || $path =~ m{(?:\A|/)\.\.?(?:/|\z)};
  ' "${listing}" \
    || fail "${label} archive contains an unsafe path"
  awk '
    {
      type = substr($0, 1, 1)
      if (type != "-" && type != "d") exit 1
    }
  ' "${verbose_listing}" \
    || fail "${label} archive contains a link or special entry"
  awk 'seen[$0]++ { exit 1 }' "${listing}" \
    || fail "${label} archive contains a duplicate path"
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
require_bound_restore_session
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
readonly RESTORE_MARKER_TEMP="${RECOVERY_ROOT}/.restore-marker-${STAMP}-$$.json"
case "${BUNDLE}" in
  /opt/menorah-staging/data/backup-retrieval/[0-9]*Z) ;;
  *) fail 'unsafe retrieval bundle path' ;;
esac
case "${WORK_DIR}" in
  /opt/menorah-staging/data/restore/.work-[0-9]*Z) ;;
  *) fail 'unsafe restore work path' ;;
esac
case "${RESTORE_MARKER_TEMP}" in
  /opt/menorah-staging/deploy-state/recovery/.restore-marker-[0-9]*Z-[0-9]*.json) ;;
  *) fail 'unsafe restore marker staging path' ;;
esac
[ -d "${BUNDLE}" ] && [ ! -L "${BUNDLE}" ] \
  || fail 'the explicit retrieval bundle is unavailable'
[ "$(realpath -e -- "${BUNDLE}")" = "${BUNDLE}" ] \
  || fail 'the retrieval bundle escapes staging storage'
assert_exact_bundle_members
[ ! -e "${WORK_DIR}" ] && [ ! -L "${WORK_DIR}" ] \
  || fail 'restore work path already exists'
[ ! -e "${MONGO_CONFIG}" ] && [ ! -L "${MONGO_CONFIG}" ] \
  || fail 'restore configuration path already exists'
[ ! -e "${RESTORE_MARKER_TEMP}" ] && [ ! -L "${RESTORE_MARKER_TEMP}" ] \
  || fail 'restore marker staging path already exists'
[ ! -L "${RESTORE_MARKER}" ] \
  && [ ! -L "${RESTORE_REVIEW}" ] \
  && [ ! -L "${RESTORE_REVIEW_TEMP}" ] \
  || fail 'restore state markers must never be symlinks'
[ ! -e "${RESTORE_REVIEW}" ] \
  || fail 'a prior restore requires review'
[ ! -e "${RESTORE_REVIEW_TEMP}" ] \
  || fail 'a restore review staging path already exists'

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
  rm -f -- \
    "${MONGO_CONFIG}" \
    "${RESTORE_MARKER_TEMP}" \
    "${RESTORE_REVIEW_TEMP}"
  if [ -d "${WORK_DIR}" ]; then
    rm -rf -- "${WORK_DIR}"
  fi
  if [ "${status}" -ne 0 ] && [ -f "${RESTORE_MARKER}" ]; then
    set -C
    if ! : > "${RESTORE_REVIEW_TEMP}" 2>/dev/null; then
      printf '%s\n' \
        'Server-staging restore review marker could not be reserved.' >&2
      status=1
    else
      set +C
      if ! cp -- "${RESTORE_MARKER}" "${RESTORE_REVIEW_TEMP}"; then
        printf '%s\n' \
          'Server-staging restore review marker could not be copied.' >&2
        status=1
      elif ! chmod 600 "${RESTORE_REVIEW_TEMP}"; then
        printf '%s\n' \
          'Server-staging restore review marker could not be restricted.' >&2
        status=1
      elif ! ln -- "${RESTORE_REVIEW_TEMP}" "${RESTORE_REVIEW}"; then
        printf '%s\n' \
          'Server-staging restore review marker could not be published.' >&2
        status=1
      elif ! rm -- "${RESTORE_REVIEW_TEMP}"; then
        printf '%s\n' \
          'Server-staging restore review staging link could not be removed.' >&2
        status=1
      fi
    fi
    set +C
  fi
  rm -f -- "${RESTORE_REVIEW_TEMP}"
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
ln -- "${RESTORE_MARKER_TEMP}" "${RESTORE_MARKER}" \
  || fail 'restore marker could not be reserved atomically'
rm -- "${RESTORE_MARKER_TEMP}" \
  || fail 'restore marker staging link could not be removed'
[ ! -e "${RESTORE_MARKER_TEMP}" ] && [ ! -L "${RESTORE_MARKER_TEMP}" ] \
  || fail 'restore marker staging link remains'
[ -f "${RESTORE_MARKER}" ] && [ ! -L "${RESTORE_MARKER}" ] \
  || fail 'restore marker was not published as a regular file'
[ "$(realpath -e -- "${RESTORE_MARKER}")" = "${RESTORE_MARKER}" ] \
  || fail 'restore marker is not canonical'

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
  my $expected = do { local $/; <$expected_fh> };
  die "signature format is invalid\n"
    unless $expected =~ /\A[0-9a-f]{64}\n\z/;
  chomp $expected;
  die "signature mismatch\n"
    unless hmac_sha256_hex($payload, $key) eq $expected;
' \
  "${SIGNING_KEY_FILE}" \
  "${BUNDLE}/signature.hmac-sha256" \
  "${BUNDLE}/metadata.json" \
  "${BUNDLE}/database-manifest.json" \
  "${BUNDLE}/uploads-entries.manifest" \
  "${BUNDLE}/uploads-manifest.sha256" \
  "${BUNDLE}/managed-media-entries.manifest" \
  "${BUNDLE}/managed-media-manifest.sha256" \
  "${BUNDLE}/SHA256SUMS"

assert_exact_checksum_manifest
(
  cd "${BUNDLE}"
  sha256sum --strict -c SHA256SUMS >/dev/null
)

for expected_metadata in \
  "\"composeProject\": \"${ACTIVE_PROJECT}\"" \
  '"environmentId": "menorah-server-staging-v1"' \
  '"filesystemRoot": "/opt/menorah-staging"' \
  '"dataRoot": "/opt/menorah-staging/data"' \
  '"backupRoot": "/opt/menorah-staging/backups"' \
  '"deployStateRoot": "/opt/menorah-staging/deploy-state"' \
  '"database": "menorah_staging"' \
  '"replicaSet": "menorah-staging-rs"' \
  "\"runtimeSha\": \"${MENORAH_SERVER_STAGING_RUNTIME_SHA}\"" \
  "\"createdAt\": \"${STAMP}\"" \
  '"mediaScopes": ["uploads", "managed-media"]' \
  '"mediaEntryManifestFormat": "nul-type-path-v1"' \
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

validate_regular_directory_archive \
  "${WORK_DIR}/uploads.tar.gz" \
  'uploads'
validate_regular_directory_archive \
  "${WORK_DIR}/managed-media.tar.gz" \
  'managed-media'

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
  --stopOnError \
  >/dev/null

find "${RESTORE_MEDIA_ROOT}" -mindepth 1 -maxdepth 1 \
  -exec rm -rf -- {} +
mkdir -- \
  "${RESTORE_MEDIA_ROOT}/uploads" \
  "${RESTORE_MEDIA_ROOT}/managed-media"
tar --no-same-owner --no-same-permissions --delay-directory-restore \
  -C "${RESTORE_MEDIA_ROOT}/uploads" \
  -xzf "${WORK_DIR}/uploads.tar.gz"
tar --no-same-owner --no-same-permissions --delay-directory-restore \
  -C "${RESTORE_MEDIA_ROOT}/managed-media" \
  -xzf "${WORK_DIR}/managed-media.tar.gz"
(
  cd "${RESTORE_MEDIA_ROOT}/uploads"
  find . -mindepth 1 -printf '%y|%p\0' | sort -z
) > "${WORK_DIR}/restored-uploads-entries.manifest"
cmp -s \
  "${BUNDLE}/uploads-entries.manifest" \
  "${WORK_DIR}/restored-uploads-entries.manifest" \
  || fail 'restored uploads do not match their signed entry manifest'
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
  find . -mindepth 1 -printf '%y|%p\0' | sort -z
) > "${WORK_DIR}/restored-managed-media-entries.manifest"
cmp -s \
  "${BUNDLE}/managed-media-entries.manifest" \
  "${WORK_DIR}/restored-managed-media-entries.manifest" \
  || fail 'restored managed media does not match its signed entry manifest'
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

rm -rf -- "${WORK_DIR}"
rm -f -- "${MONGO_CONFIG}" "${RESTORE_MARKER_TEMP}"
rm -f -- "${RESTORE_MARKER}"
rm -f -- "${RESTORE_LOCK}"
printf '%s\n' "Server-staging restore verified: ${STAMP}"
