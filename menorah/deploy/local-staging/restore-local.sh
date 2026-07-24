#!/bin/sh
set -eu

umask 077
export LC_ALL=C

readonly EXPECTED_PROJECT='menorah-local-staging'
readonly EXPECTED_ENVIRONMENT_ID='menorah-local-staging-v1'
readonly RETRIEVAL_ROOT='/retrieval'
readonly RESTORE_MEDIA_ROOT='/restore-media'
readonly ENCRYPTION_PASSWORD_FILE='/run/secrets/backup-encryption-password'
readonly INTEGRITY_KEY_FILE='/run/secrets/backup-integrity-hmac-key'

fail() {
  printf '%s\n' "Local staging restore refused: $*" >&2
  exit 1
}

[ "${COMPOSE_PROJECT_NAME:-}" = "${EXPECTED_PROJECT}" ] \
  || fail 'unexpected Compose project'
[ "${MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:-}" = "${EXPECTED_ENVIRONMENT_ID}" ] \
  || fail 'unexpected environment identity'
printf '%s' "${MENORAH_RUNTIME_CANDIDATE_SHA:-}" \
  | grep -Eq '^[0-9a-f]{40}$' \
  || fail 'candidate SHA must be a full lowercase Git SHA'
[ -n "${MONGODB_RESTORE_TEST_URI:-}" ] \
  || fail 'MONGODB_RESTORE_TEST_URI is required'
printf '%s' "${MONGODB_RESTORE_TEST_URI}" \
  | grep -Eq '^mongodb://mongo-restore:27017/menorah\?replicaSet=menorah-restore-rs$' \
  || fail 'restore URI is not bound to the disposable restore replica set'
[ -d "${RETRIEVAL_ROOT}" ] || fail 'retrieval volume is not mounted'
[ -d "${RESTORE_MEDIA_ROOT}" ] || fail 'restore media volume is not mounted'
[ -s "${ENCRYPTION_PASSWORD_FILE}" ] || fail 'backup encryption secret is missing'
[ -s "${INTEGRITY_KEY_FILE}" ] || fail 'backup integrity secret is missing'
[ -s "${RETRIEVAL_ROOT}/LATEST" ] || fail 'retrieval pointer is missing'

readonly STAMP="$(tr -d '\r\n' < "${RETRIEVAL_ROOT}/LATEST")"
printf '%s' "${STAMP}" | grep -Eq '^[0-9]{8}T[0-9]{6}Z$' \
  || fail 'retrieval pointer is invalid'
readonly BUNDLE="${RETRIEVAL_ROOT}/${STAMP}"
readonly WORK_DIR="/tmp/restore-${STAMP}"
readonly MONGO_CONFIG="${WORK_DIR}/mongorestore.yml"

case "${BUNDLE}" in
  /retrieval/[0-9]*T[0-9]*Z) ;;
  *) fail 'unsafe retrieval bundle path' ;;
esac
[ -d "${BUNDLE}" ] || fail 'retrieval bundle does not exist'

cleanup() {
  if [ -d "${WORK_DIR}" ]; then
    rm -rf -- "${WORK_DIR}"
  fi
}
trap cleanup EXIT HUP INT TERM
mkdir -p -- "${WORK_DIR}"

(
  cd "${BUNDLE}"
  sha256sum -c SHA256SUMS >/dev/null
)

perl -MDigest::SHA=hmac_sha256_hex -e '
  use strict;
  use warnings;
  my ($key_path, $expected_path, @paths) = @ARGV;
  open my $key_fh, "<", $key_path or die "integrity key unavailable\n";
  binmode $key_fh;
  local $/;
  my $key = <$key_fh>;
  chomp $key;
  my $payload = "";
  for my $path (@paths) {
    open my $fh, "<", $path or die "signed input unavailable\n";
    binmode $fh;
    $payload .= <$fh>;
  }
  open my $expected_fh, "<", $expected_path or die "signature unavailable\n";
  my $expected = <$expected_fh>;
  chomp $expected;
  die "signature mismatch\n" unless hmac_sha256_hex($payload, $key) eq $expected;
' \
  "${INTEGRITY_KEY_FILE}" \
  "${BUNDLE}/signature.hmac-sha256" \
  "${BUNDLE}/metadata.txt" \
  "${BUNDLE}/media-manifest.sha256" \
  "${BUNDLE}/SHA256SUMS"

grep -Fx "candidate_sha=${MENORAH_RUNTIME_CANDIDATE_SHA}" \
  "${BUNDLE}/metadata.txt" >/dev/null \
  || fail 'backup candidate SHA does not match this restore'
grep -Fx 'synthetic_data_only=true' "${BUNDLE}/metadata.txt" >/dev/null \
  || fail 'backup is not marked synthetic-only'
grep -Fx 'archive_scope=menorah.*' "${BUNDLE}/metadata.txt" >/dev/null \
  || fail 'backup namespace scope is not the reviewed local database'
grep -Fx 'consistency=application_writers_quiesced' \
  "${BUNDLE}/metadata.txt" >/dev/null \
  || fail 'backup was not created with application writers quiesced'

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${BUNDLE}/database.archive.gz.enc" \
  -out "${WORK_DIR}/database.archive.gz" \
  -pass "file:${ENCRYPTION_PASSWORD_FILE}"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${BUNDLE}/media.tar.gz.enc" \
  -out "${WORK_DIR}/media.tar.gz" \
  -pass "file:${ENCRYPTION_PASSWORD_FILE}"

escaped_uri="$(printf '%s' "${MONGODB_RESTORE_TEST_URI}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf 'uri: "%s"\n' "${escaped_uri}" > "${MONGO_CONFIG}"
chmod 600 "${MONGO_CONFIG}"
MONGODB_RESTORE_TEST_URI="${MONGODB_RESTORE_TEST_URI}" \
  mongosh --nodb --quiet --eval '
    const restored = connect(process.env.MONGODB_RESTORE_TEST_URI);
    const result = restored.dropDatabase();
    if (result.ok !== 1) throw new Error("verification database reset failed");
  ' >/dev/null
mongorestore \
  "--config=${MONGO_CONFIG}" \
  "--archive=${WORK_DIR}/database.archive.gz" \
  '--nsInclude=menorah.*' \
  --gzip \
  --drop \
  >/dev/null

[ "$(readlink -f "${RESTORE_MEDIA_ROOT}")" = "${RESTORE_MEDIA_ROOT}" ] \
  || fail 'restore media mount does not resolve to its isolated root'
find "${RESTORE_MEDIA_ROOT}" -mindepth 1 -maxdepth 1 \
  -exec rm -rf -- {} +
tar -C "${RESTORE_MEDIA_ROOT}" -xzf "${WORK_DIR}/media.tar.gz"
(
  cd "${RESTORE_MEDIA_ROOT}"
  find . -type f -print0 \
    | sort -z \
    | xargs -0 -r sha256sum
) > "${WORK_DIR}/restored-media-manifest.sha256"
cmp -s \
  "${BUNDLE}/media-manifest.sha256" \
  "${WORK_DIR}/restored-media-manifest.sha256" \
  || fail 'restored media manifest differs from the backup'

MONGODB_RESTORE_TEST_URI="${MONGODB_RESTORE_TEST_URI}" \
  mongosh --nodb --quiet --eval '
    const restored = connect(process.env.MONGODB_RESTORE_TEST_URI);
    const canonical = (value) => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value).sort().map((key) => [key, canonical(value[key])])
        );
      }
      return value;
    };
    const collectionNames = restored.getCollectionNames().sort();
    if (!collectionNames.includes("migrations") || !collectionNames.includes("users")) {
      throw new Error("required restored collections are missing");
    }
    const collections = collectionNames.map((name) => ({
      name,
      documentCount: restored.getCollection(name).countDocuments({}),
      indexes: restored.getCollection(name).getIndexes()
        .map(canonical)
        .sort((left, right) => String(left.name).localeCompare(String(right.name))),
    }));
    print(JSON.stringify(canonical({ database: "menorah", collections })));
  ' > "${WORK_DIR}/restored-database-manifest.json"
cmp -s \
  "${BUNDLE}/database-manifest.json" \
  "${WORK_DIR}/restored-database-manifest.json" \
  || fail 'restored collection counts or index definitions differ from the backup'

MONGODB_RESTORE_TEST_URI="${MONGODB_RESTORE_TEST_URI}" \
  mongosh --nodb --quiet --eval '
    const restored = connect(process.env.MONGODB_RESTORE_TEST_URI);
    const collections = restored.getCollectionNames();
    let documentCount = 0;
    let indexCount = 0;
    for (const name of collections) {
      documentCount += restored.getCollection(name).countDocuments({});
      indexCount += restored.getCollection(name).getIndexes().length;
    }
    print(JSON.stringify({
      collectionCount: collections.length,
      documentCount,
      indexCount,
      manifestMatch: true,
    }));
  '

trap - EXIT HUP INT TERM
rm -rf -- "${WORK_DIR}"
printf '%s\n' "Local staging restore verified: ${STAMP}"
