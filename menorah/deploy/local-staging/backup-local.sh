#!/bin/sh
set -eu

umask 077
export LC_ALL=C

readonly EXPECTED_PROJECT='menorah-local-staging'
readonly EXPECTED_ENVIRONMENT_ID='menorah-local-staging-v1'
readonly BACKUP_ROOT='/backups'
readonly RETRIEVAL_ROOT='/retrieval'
readonly UPLOAD_ROOT='/uploads'
readonly ENCRYPTION_PASSWORD_FILE='/run/secrets/backup-encryption-password'
readonly INTEGRITY_KEY_FILE='/run/secrets/backup-integrity-hmac-key'
readonly EXPECTED_BACKUP_METRICS_URL='http://alert-fixture:9101/control/backup'

fail() {
  printf '%s\n' "Local staging backup refused: $*" >&2
  exit 1
}

report_backup_result() {
  backup_result="$1"
  [ "${COMPOSE_PROJECT_NAME:-}" = "${EXPECTED_PROJECT}" ] || return 0
  [ "${MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:-}" = "${EXPECTED_ENVIRONMENT_ID}" ] \
    || return 0
  [ "${MENORAH_LOCAL_STAGING_BACKUP_METRICS_URL:-}" = "${EXPECTED_BACKUP_METRICS_URL}" ] \
    || return 0
  wget \
    --quiet \
    --timeout=5 \
    --tries=1 \
    --output-document=/dev/null \
    --header="Content-Type: application/json" \
    --header="X-Menorah-Compose-Project: ${EXPECTED_PROJECT}" \
    --header="X-Menorah-Environment-Id: ${EXPECTED_ENVIRONMENT_ID}" \
    --post-data="{\"result\":\"${backup_result}\"}" \
    "${EXPECTED_BACKUP_METRICS_URL}" \
    >/dev/null 2>&1 \
    || :
}

backup_exit_handler() {
  backup_exit_code="$1"
  trap - EXIT HUP INT TERM
  set +e
  if command -v cleanup >/dev/null 2>&1; then
    cleanup
  fi
  if [ "${backup_exit_code}" -eq 0 ]; then
    report_backup_result success
  else
    report_backup_result failure
  fi
  exit "${backup_exit_code}"
}

trap 'backup_exit_handler $?' EXIT
trap 'exit 1' HUP INT TERM

[ "${COMPOSE_PROJECT_NAME:-}" = "${EXPECTED_PROJECT}" ] \
  || fail 'unexpected Compose project'
[ "${MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:-}" = "${EXPECTED_ENVIRONMENT_ID}" ] \
  || fail 'unexpected environment identity'
[ "${MENORAH_LOCAL_STAGING_WRITERS_QUIESCED:-}" = 'APPLICATION_WRITERS_STOPPED' ] \
  || fail 'application writers must be explicitly quiesced'
printf '%s' "${MENORAH_RUNTIME_CANDIDATE_SHA:-}" \
  | grep -Eq '^[0-9a-f]{40}$' \
  || fail 'candidate SHA must be a full lowercase Git SHA'
[ -n "${MONGODB_BACKUP_URI:-}" ] || fail 'MONGODB_BACKUP_URI is required'
printf '%s' "${MONGODB_BACKUP_URI}" \
  | grep -Eq '^mongodb://menorah-local-backup:[^[:space:]@/?#]+@mongo-primary:27017/\?replicaSet=menorah-rs&authSource=admin$' \
  || fail 'backup URI is not bound to the local staging replica set'
sanitized_mongodb_backup_uri="$(printf '%s' "${MONGODB_BACKUP_URI}" | tr -d '\r\n')"
[ "${sanitized_mongodb_backup_uri}" = "${MONGODB_BACKUP_URI}" ] \
  || fail 'backup URI must be a single line'
[ -d "${BACKUP_ROOT}" ] || fail 'backup volume is not mounted'
[ -d "${RETRIEVAL_ROOT}" ] || fail 'retrieval volume is not mounted'
[ -d "${UPLOAD_ROOT}" ] || fail 'upload volume is not mounted'
[ -s "${ENCRYPTION_PASSWORD_FILE}" ] || fail 'backup encryption secret is missing'
[ -s "${INTEGRITY_KEY_FILE}" ] || fail 'backup integrity secret is missing'

readonly STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAGING_DIR="${BACKUP_ROOT}/.incomplete-${STAMP}"
readonly FINAL_DIR="${BACKUP_ROOT}/${STAMP}"
readonly RETRIEVAL_STAGING_DIR="${RETRIEVAL_ROOT}/.incomplete-${STAMP}"
readonly RETRIEVAL_FINAL_DIR="${RETRIEVAL_ROOT}/${STAMP}"
readonly MONGO_CONFIG="/tmp/mongodump-${STAMP}.yml"

case "${STAGING_DIR}" in
  /backups/.incomplete-*) ;;
  *) fail 'unsafe backup staging path' ;;
esac
case "${RETRIEVAL_STAGING_DIR}" in
  /retrieval/.incomplete-*) ;;
  *) fail 'unsafe retrieval staging path' ;;
esac

cleanup() {
  rm -f -- "${MONGO_CONFIG}"
  if [ -d "${STAGING_DIR}" ]; then
    rm -rf -- "${STAGING_DIR}"
  fi
  if [ -d "${RETRIEVAL_STAGING_DIR}" ]; then
    rm -rf -- "${RETRIEVAL_STAGING_DIR}"
  fi
}

[ ! -e "${FINAL_DIR}" ] || fail 'backup timestamp already exists'
[ ! -e "${RETRIEVAL_FINAL_DIR}" ] || fail 'retrieval timestamp already exists'
mkdir -p -- "${STAGING_DIR}" "${RETRIEVAL_STAGING_DIR}"

escaped_uri="$(printf '%s' "${MONGODB_BACKUP_URI}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf 'uri: "%s"\n' "${escaped_uri}" > "${MONGO_CONFIG}"
chmod 600 "${MONGO_CONFIG}"

mongodump \
  "--config=${MONGO_CONFIG}" \
  --db=menorah \
  "--archive=${STAGING_DIR}/database.archive.gz" \
  --gzip \
  >/dev/null

MONGODB_BACKUP_URI="${MONGODB_BACKUP_URI}" \
  mongosh --nodb --quiet --eval '
    const connection = connect(process.env.MONGODB_BACKUP_URI);
    const source = connection.getSiblingDB("menorah");
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
        .sort((left, right) => String(left.name).localeCompare(String(right.name))),
    }));
    print(JSON.stringify(canonical({ database: "menorah", collections })));
  ' > "${STAGING_DIR}/database-manifest.json"

tar -C "${UPLOAD_ROOT}" -czf "${STAGING_DIR}/media.tar.gz" .
(
  cd "${UPLOAD_ROOT}"
  find . -type f -print0 \
    | sort -z \
    | xargs -0 -r sha256sum
) > "${STAGING_DIR}/media-manifest.sha256"

cat > "${STAGING_DIR}/metadata.txt" <<EOF
schema_version=1
created_at=${STAMP}
compose_project=${COMPOSE_PROJECT_NAME}
environment_id=${MENORAH_LOCAL_STAGING_ENVIRONMENT_ID}
candidate_sha=${MENORAH_RUNTIME_CANDIDATE_SHA}
database=menorah
archive_scope=menorah.*
replica_set=menorah-rs
synthetic_data_only=true
consistency=application_writers_quiesced
EOF

openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "${STAGING_DIR}/database.archive.gz" \
  -out "${STAGING_DIR}/database.archive.gz.enc" \
  -pass "file:${ENCRYPTION_PASSWORD_FILE}"
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "${STAGING_DIR}/media.tar.gz" \
  -out "${STAGING_DIR}/media.tar.gz.enc" \
  -pass "file:${ENCRYPTION_PASSWORD_FILE}"
rm -f -- "${STAGING_DIR}/database.archive.gz" "${STAGING_DIR}/media.tar.gz"

(
  cd "${STAGING_DIR}"
  sha256sum \
    database.archive.gz.enc \
    database-manifest.json \
    media.tar.gz.enc \
    media-manifest.sha256 \
    metadata.txt \
    > SHA256SUMS
)

perl -MDigest::SHA=hmac_sha256_hex -e '
  use strict;
  use warnings;
  my ($key_path, @paths) = @ARGV;
  open my $key_fh, "<", $key_path or die "integrity key unavailable\n";
  binmode $key_fh;
  my $key = do { local $/; <$key_fh> };
  chomp $key;
  my $payload = "";
  for my $path (@paths) {
    open my $fh, "<", $path or die "signed input unavailable\n";
    binmode $fh;
    $payload .= do { local $/; <$fh> };
  }
  print hmac_sha256_hex($payload, $key), "\n";
' \
  "${INTEGRITY_KEY_FILE}" \
  "${STAGING_DIR}/metadata.txt" \
  "${STAGING_DIR}/media-manifest.sha256" \
  "${STAGING_DIR}/SHA256SUMS" \
  > "${STAGING_DIR}/signature.hmac-sha256"

chmod 755 "${STAGING_DIR}"
chmod 644 "${STAGING_DIR}"/*
mv -- "${STAGING_DIR}" "${FINAL_DIR}"
cp -a "${FINAL_DIR}/." "${RETRIEVAL_STAGING_DIR}/"
mv -- "${RETRIEVAL_STAGING_DIR}" "${RETRIEVAL_FINAL_DIR}"
printf '%s\n' "${STAMP}" > "${BACKUP_ROOT}/LATEST"
printf '%s\n' "${STAMP}" > "${RETRIEVAL_ROOT}/LATEST"
chmod 644 "${BACKUP_ROOT}/LATEST" "${RETRIEVAL_ROOT}/LATEST"

rm -f -- "${MONGO_CONFIG}"
printf '%s\n' "Local staging backup complete: ${STAMP}"
