#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MIGRATOR="${REPO_ROOT}/deploy/ubuntu/consolidate-legacy-media.sh"
RUNTIME_PREPARER="${REPO_ROOT}/deploy/ubuntu/prepare-runtime-directories.sh"
TMP_ROOT="$(mktemp -d)"
RELEASE_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
MEDIA_GROUP_ID=2345

[[ "$(id -u)" == "0" ]] || fail_early=true
if [[ "${fail_early:-false}" == "true" ]]; then
  echo "media-transition tests require an isolated root-capable Linux container" >&2
  exit 1
fi
chown 0:"${MEDIA_GROUP_ID}" "${TMP_ROOT}"
chmod 2750 "${TMP_ROOT}"

cleanup() {
  rm -rf -- "${TMP_ROOT}"
}
trap cleanup EXIT

fail() {
  echo "media-transition test failed: $*" >&2
  exit 1
}

run_migration() {
  local data_root="$1"
  local evidence="$2"
  MENORAH_MEDIA_MIGRATION_CONFIRM=CONSOLIDATE_LEGACY_MEDIA_WITH_WRITERS_STOPPED \
  MENORAH_MEDIA_MIGRATION_RELEASE_SHA="${RELEASE_SHA}" \
  MENORAH_DATA_ROOT="${data_root}" \
  MENORAH_MEDIA_MIGRATION_EVIDENCE="${evidence}" \
  MENORAH_MEDIA_GROUP_ID="${MEDIA_GROUP_ID}" \
    bash "${MIGRATOR}"
}

prepare_upload_root() {
  local upload_root="$1"
  chown 100:"${MEDIA_GROUP_ID}" "${upload_root}"
  chmod 2770 "${upload_root}"
}

confirmation_root="${TMP_ROOT}/confirmation/data"
mkdir -p "${confirmation_root}/uploads" "${TMP_ROOT}/confirmation/evidence"
prepare_upload_root "${confirmation_root}/uploads"
if MENORAH_MEDIA_MIGRATION_RELEASE_SHA="${RELEASE_SHA}" \
  MENORAH_DATA_ROOT="${confirmation_root}" \
  MENORAH_MEDIA_MIGRATION_EVIDENCE="${TMP_ROOT}/confirmation/evidence/manifest" \
  MENORAH_MEDIA_GROUP_ID="${MEDIA_GROUP_ID}" \
  bash "${MIGRATOR}" >/dev/null 2>&1; then
  fail "migration accepted no writer-stop confirmation"
fi

empty_root="${TMP_ROOT}/empty/data"
empty_evidence="${TMP_ROOT}/empty/evidence/manifest"
mkdir -p "${empty_root}/uploads" "$(dirname "${empty_evidence}")"
prepare_upload_root "${empty_root}/uploads"
run_migration "${empty_root}" "${empty_evidence}" >/dev/null
grep -Fx 'uniqueObjects=0' "${empty_evidence}" >/dev/null \
  || fail "empty migration did not record zero objects"
(cd "$(dirname "${empty_evidence}")" && sha256sum -c "$(basename "${empty_evidence}").sha256") >/dev/null \
  || fail "empty migration checksum did not verify"

copy_root="${TMP_ROOT}/copy/data"
copy_evidence="${TMP_ROOT}/copy/evidence/manifest"
mkdir -p \
  "${copy_root}/uploads/api-ios/nested" \
  "${copy_root}/uploads/api-web/nested" \
  "${copy_root}/uploads/worker" \
  "$(dirname "${copy_evidence}")"
prepare_upload_root "${copy_root}/uploads"
printf 'same-object' > "${copy_root}/uploads/api-ios/nested/shared.bin"
printf 'same-object' > "${copy_root}/uploads/api-web/nested/shared.bin"
printf 'worker-object' > "${copy_root}/uploads/worker/worker.bin"
run_migration "${copy_root}" "${copy_evidence}" >/dev/null
cmp -s "${copy_root}/uploads/api-ios/nested/shared.bin" "${copy_root}/uploads/nested/shared.bin" \
  || fail "shared legacy object was not copied exactly"
cmp -s "${copy_root}/uploads/worker/worker.bin" "${copy_root}/uploads/worker.bin" \
  || fail "unique legacy object was not copied exactly"
setpriv --reuid=100 --regid=101 --groups="${MEDIA_GROUP_ID}" \
  test -r "${copy_root}/uploads/nested/shared.bin" \
  || fail "backend runtime UID with the reviewed media group cannot read a migrated object"
[[ "$(stat -c '%g:%a' "${copy_root}/uploads/nested")" == "${MEDIA_GROUP_ID}:2770" ]] \
  || fail "migrated canonical directory did not retain setgid media-group access"
[[ "$(stat -c '%g:%a' "${copy_root}/uploads/nested/shared.bin")" == "${MEDIA_GROUP_ID}:640" ]] \
  || fail "migrated canonical file did not retain media-group read access"
[[ -f "${copy_root}/uploads/api-ios/nested/shared.bin" ]] \
  || fail "legacy source was removed"
grep -Fx 'uniqueObjects=2' "${copy_evidence}" >/dev/null \
  || fail "copy manifest has the wrong unique object count"
first_manifest_digest="$(sha256sum "${copy_evidence}" | awk '{print $1}')"
rerun_output="$(run_migration "${copy_root}" "${copy_evidence}")"
grep -F '0 copies' <<< "${rerun_output}" >/dev/null \
  || fail "idempotent rerun unexpectedly copied an existing object"
[[ "$(sha256sum "${copy_evidence}" | awk '{print $1}')" == "${first_manifest_digest}" ]] \
  || fail "idempotent rerun changed deterministic evidence"

cross_root="${TMP_ROOT}/cross/data"
cross_evidence="${TMP_ROOT}/cross/evidence/manifest"
mkdir -p "${cross_root}/uploads/api-ios" "${cross_root}/uploads/api-web" "$(dirname "${cross_evidence}")"
prepare_upload_root "${cross_root}/uploads"
printf 'first' > "${cross_root}/uploads/api-ios/collision.bin"
printf 'second' > "${cross_root}/uploads/api-web/collision.bin"
if run_migration "${cross_root}" "${cross_evidence}" >/dev/null 2>&1; then
  fail "migration accepted different legacy bytes for the same key"
fi
[[ ! -e "${cross_root}/uploads/collision.bin" ]] \
  || fail "cross-source collision caused a partial canonical write"

canonical_root="${TMP_ROOT}/canonical/data"
canonical_evidence="${TMP_ROOT}/canonical/evidence/manifest"
mkdir -p "${canonical_root}/uploads/api-ios" "${canonical_root}/uploads/api-admin" "$(dirname "${canonical_evidence}")"
prepare_upload_root "${canonical_root}/uploads"
printf 'legacy' > "${canonical_root}/uploads/api-ios/conflict.bin"
printf 'canonical-different' > "${canonical_root}/uploads/conflict.bin"
printf 'must-not-copy' > "${canonical_root}/uploads/api-admin/other.bin"
if run_migration "${canonical_root}" "${canonical_evidence}" >/dev/null 2>&1; then
  fail "migration accepted a different canonical destination"
fi
[[ ! -e "${canonical_root}/uploads/other.bin" ]] \
  || fail "canonical collision caused a partial unrelated write"

canonical_access_root="${TMP_ROOT}/canonical-access/data"
canonical_access_evidence="${TMP_ROOT}/canonical-access/evidence/manifest"
mkdir -p \
  "${canonical_access_root}/uploads/api-ios" \
  "${canonical_access_root}/uploads/api-admin" \
  "$(dirname "${canonical_access_evidence}")"
prepare_upload_root "${canonical_access_root}/uploads"
printf 'identical' > "${canonical_access_root}/uploads/api-ios/existing.bin"
printf 'identical' > "${canonical_access_root}/uploads/existing.bin"
printf 'must-not-copy' > "${canonical_access_root}/uploads/api-admin/later.bin"
chown 0:0 "${canonical_access_root}/uploads/existing.bin"
chmod 0600 "${canonical_access_root}/uploads/existing.bin"
if run_migration "${canonical_access_root}" "${canonical_access_evidence}" >/dev/null 2>&1; then
  fail "migration accepted an identical canonical file without media-group access"
fi
[[ ! -e "${canonical_access_root}/uploads/later.bin" ]] \
  || fail "inaccessible canonical file caused a partial unrelated write"

canonical_parent_root="${TMP_ROOT}/canonical-parent/data"
canonical_parent_evidence="${TMP_ROOT}/canonical-parent/evidence/manifest"
mkdir -p \
  "${canonical_parent_root}/uploads/api-ios/nested" \
  "${canonical_parent_root}/uploads/nested" \
  "$(dirname "${canonical_parent_evidence}")"
prepare_upload_root "${canonical_parent_root}/uploads"
printf 'nested-object' > "${canonical_parent_root}/uploads/api-ios/nested/object.bin"
chown 0:"${MEDIA_GROUP_ID}" "${canonical_parent_root}/uploads/nested"
chmod 2700 "${canonical_parent_root}/uploads/nested"
if run_migration "${canonical_parent_root}" "${canonical_parent_evidence}" >/dev/null 2>&1; then
  fail "migration accepted a canonical parent without exact media-group traversal"
fi
[[ ! -e "${canonical_parent_root}/uploads/nested/object.bin" ]] \
  || fail "inaccessible canonical parent received a partial write"

find_failure_root="${TMP_ROOT}/find-failure/data"
find_failure_evidence="${TMP_ROOT}/find-failure/evidence/manifest"
find_failure_bin="${TMP_ROOT}/find-failure/bin"
mkdir -p \
  "${find_failure_root}/uploads/api-ios" \
  "$(dirname "${find_failure_evidence}")" \
  "${find_failure_bin}"
prepare_upload_root "${find_failure_root}/uploads"
printf 'must-not-copy' > "${find_failure_root}/uploads/api-ios/omitted.bin"
cat > "${find_failure_bin}/find" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" ${MOCK_FIND_FAILURE_ROOT} "* ]]; then
  echo "injected traversal failure" >&2
  exit 42
fi
exec "${REAL_FIND}" "$@"
EOF
chmod +x "${find_failure_bin}/find"
if PATH="${find_failure_bin}:${PATH}" \
  REAL_FIND="$(command -v find)" \
  MOCK_FIND_FAILURE_ROOT="${find_failure_root}/uploads/api-ios" \
  run_migration "${find_failure_root}" "${find_failure_evidence}" >/dev/null 2>&1; then
  fail "migration ignored a legacy media traversal failure"
fi
[[ ! -e "${find_failure_root}/uploads/omitted.bin" ]] \
  || fail "legacy traversal failure produced an incomplete canonical copy"
[[ ! -e "${find_failure_evidence}" ]] \
  || fail "legacy traversal failure produced misleading completion evidence"

symlink_root="${TMP_ROOT}/symlink/data"
symlink_evidence="${TMP_ROOT}/symlink/evidence/manifest"
mkdir -p "${symlink_root}/uploads/api-ios" "$(dirname "${symlink_evidence}")"
prepare_upload_root "${symlink_root}/uploads"
printf 'outside' > "${TMP_ROOT}/outside.bin"
ln -s "${TMP_ROOT}/outside.bin" "${symlink_root}/uploads/api-ios/link.bin"
if run_migration "${symlink_root}" "${symlink_evidence}" >/dev/null 2>&1; then
  fail "migration accepted a legacy symlink"
fi

runtime_root="${TMP_ROOT}/runtime-preparation"
mkdir -p "${runtime_root}/uploads" "${runtime_root}/grafana"
chown 0:0 "${runtime_root}/uploads" "${runtime_root}/grafana"
chmod 0755 "${runtime_root}/uploads" "${runtime_root}/grafana"
if MENORAH_RUNTIME_DATA_ROOT="${runtime_root}" \
  MENORAH_MEDIA_GROUP_ID="${MEDIA_GROUP_ID}" \
  /bin/sh "${RUNTIME_PREPARER}" >/dev/null 2>&1; then
  fail "runtime directory helper accepted no empty-host confirmation"
fi
MENORAH_RUNTIME_DIRECTORY_PREP_CONFIRM=PREPARE_EMPTY_HOST_RUNTIME_DIRECTORIES \
MENORAH_RUNTIME_DATA_ROOT="${runtime_root}" \
MENORAH_MEDIA_GROUP_ID="${MEDIA_GROUP_ID}" \
  /bin/sh "${RUNTIME_PREPARER}" >/dev/null
while IFS='|' read -r expected_identity expected_mode prepared_path; do
  [[ -d "${prepared_path}" && ! -L "${prepared_path}" ]] \
    || fail "runtime preparation did not create ${prepared_path}"
  [[ "$(stat -c '%u:%g' "${prepared_path}")" == "${expected_identity}" \
    && "$(stat -c '%a' "${prepared_path}")" == "${expected_mode}" ]] \
    || fail "runtime preparation produced unsafe ownership or mode for ${prepared_path}"
done <<EOF
100:${MEDIA_GROUP_ID}|2770|${runtime_root}/uploads
65534:${MEDIA_GROUP_ID}|770|${runtime_root}/prometheus
65534:${MEDIA_GROUP_ID}|770|${runtime_root}/alertmanager
65534:${MEDIA_GROUP_ID}|770|${runtime_root}/monitoring-textfile
472:${MEDIA_GROUP_ID}|770|${runtime_root}/grafana
0:${MEDIA_GROUP_ID}|770|${runtime_root}/alloy
10001:${MEDIA_GROUP_ID}|770|${runtime_root}/loki
EOF

echo "Legacy media transition tests passed."
