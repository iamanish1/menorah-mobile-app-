#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

fail() {
  echo "release-script test failed: $*" >&2
  exit 1
}

test_backup_runs_as_host_user() {
  local mock_bin="${TMP_ROOT}/bin"
  local backup_root="${TMP_ROOT}/backups"
  local data_root="${TMP_ROOT}/data"
  local env_file="${TMP_ROOT}/production.env"
  local docker_log="${TMP_ROOT}/docker.log"
  mkdir -p "${mock_bin}" "${backup_root}" "${data_root}/uploads"

  cat > "${env_file}" <<EOF
NODE_ENV=test
MENORAH_BACKUP_ROOT=${backup_root}
MENORAH_DATA_ROOT=${data_root}
BACKUP_REQUIRE_MOUNT=false
BACKUP_REQUIRE_ENCRYPTION=false
BACKUP_PRUNE_AFTER_SUCCESS=false
BACKUP_INTEGRITY_HMAC_KEY=release-script-test-hmac-key-000000000000000001
BACKUP_INTEGRITY_EPOCH_ID=release-script-test-epoch
MENORAH_DEPLOY_STATE_ROOT=${TMP_ROOT}/backup-deploy-state
MONGODB_BACKUP_URI='mongodb://backup.invalid/?replicaSet=menorah-rs&authSource=admin'
MONGODB_REPLICA_SET_NAME=menorah-rs
EOF

  MENORAH_BACKUP_ROOT="${backup_root}" \
  BACKUP_INTEGRITY_HMAC_KEY='release-script-test-hmac-key-000000000000000001' \
  BACKUP_INTEGRITY_EPOCH_ID='release-script-test-epoch' \
    node "${REPO_ROOT}/deploy/ubuntu/backup-integrity-epoch.js" initialize initial-establishment
  MENORAH_BACKUP_ROOT="${backup_root}" \
  BACKUP_INTEGRITY_HMAC_KEY='release-script-test-hmac-key-000000000000000001' \
  BACKUP_INTEGRITY_EPOCH_ID='release-script-test-epoch' \
    node "${REPO_ROOT}/deploy/ubuntu/backup-integrity-epoch.js" activate

  cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "${MOCK_DOCKER_LOG}"
printf '\n' >> "${MOCK_DOCKER_LOG}"
if [[ " $* " == *" run "* ]]; then
  command_text="$*"
  if [[ "${command_text}" =~ --archive=/backups/([^[:space:]]+) ]]; then
    archive="${MENORAH_BACKUP_ROOT}/${BASH_REMATCH[1]}"
    mkdir -p "$(dirname "${archive}")"
    printf 'mock-mongodump-archive' > "${archive}"
    chmod 0600 "${archive}"
  fi
fi
EOF
  cat > "${mock_bin}/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "${mock_bin}/docker" "${mock_bin}/flock"
  PATH="${mock_bin}:${PATH}"
  export PATH

  PATH="${mock_bin}:${PATH}" \
    MOCK_DOCKER_LOG="${docker_log}" \
    PRODUCTION_ENV="${env_file}" \
    "${REPO_ROOT}/deploy/ubuntu/backup-now.sh" manual >/dev/null

  grep -F -- "--user $(id -u):$(id -g)" "${docker_log}" >/dev/null \
    || fail "backup container was not assigned the invoking uid:gid"

  local archive
  archive="$(find "${backup_root}/manual" -type f -name '*.archive.gz' -print -quit)"
  [[ -n "${archive}" && -r "${archive}" ]] \
    || fail "mock backup archive is not readable by the invoking user"
  [[ -f "${archive}.sha256" ]] || fail "backup checksum was not created"
}

test_post_migration_rollback_is_blocked() {
  local state_dir="${TMP_ROOT}/deploy-state"
  local current_sha target_sha output
  mkdir -p "${state_dir}"
  current_sha="$(git -C "${REPO_ROOT}/../" rev-parse HEAD)"
  target_sha="$(git -C "${REPO_ROOT}/../" rev-parse HEAD^)"
  printf '%s\n' "${target_sha}" > "${state_dir}/last-good-sha"
  printf '%s\n' "${current_sha}" > "${state_dir}/migration-applied-sha"

  if output="$(MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" 2>&1)"; then
    fail "rollback unexpectedly proceeded after a migration"
  fi
  grep -F "Code-only rollback is blocked" <<< "${output}" >/dev/null \
    || fail "rollback did not explain the migration compatibility block"
}

test_corrupt_migration_marker_is_rejected() {
  local state_dir="${TMP_ROOT}/corrupt-migration-state"
  local target_sha output
  mkdir -p "${state_dir}"
  target_sha="$(git -C "${REPO_ROOT}/../" rev-parse HEAD^)"
  printf '%s\n' "${target_sha}" > "${state_dir}/last-good-sha"
  printf '%s\n' "not-a-commit-sha" > "${state_dir}/migration-applied-sha"

  if output="$(MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" 2>&1)"; then
    fail "rollback unexpectedly treated a corrupt migration marker as absent"
  fi
  grep -F "Applied migration marker is not a full local commit SHA" <<< "${output}" >/dev/null \
    || fail "rollback did not fail closed on a corrupt migration marker"
}

test_empty_and_symlinked_migration_markers_are_rejected() {
  local state_dir="${TMP_ROOT}/unsafe-migration-state"
  local target_sha output
  mkdir -p "${state_dir}"
  target_sha="$(git -C "${REPO_ROOT}/../" rev-parse HEAD^)"
  printf '%s\n' "${target_sha}" > "${state_dir}/last-good-sha"

  : > "${state_dir}/migration-applied-sha"
  if output="$(MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" 2>&1)"; then
    fail "rollback unexpectedly treated an empty migration marker as absent"
  fi
  grep -F "Applied migration marker is missing, empty, non-regular, or symlinked" \
    <<< "${output}" >/dev/null \
    || fail "rollback did not fail closed on an empty migration marker"

  rm -f -- "${state_dir}/migration-applied-sha"
  ln -s "${state_dir}/missing-migration-target" "${state_dir}/migration-applied-sha"
  if output="$(MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" 2>&1)"; then
    fail "rollback unexpectedly treated a dangling migration-marker symlink as absent"
  fi
  grep -F "Applied migration marker is missing, empty, non-regular, or symlinked" \
    <<< "${output}" >/dev/null \
    || fail "rollback did not fail closed on a symlinked migration marker"
}

test_dangling_recovery_marker_blocks_rollback() {
  local state_dir="${TMP_ROOT}/dangling-recovery-state"
  local target_sha output
  mkdir -p "${state_dir}"
  target_sha="$(git -C "${REPO_ROOT}/../" rev-parse HEAD^)"
  printf '%s\n' "${target_sha}" > "${state_dir}/last-good-sha"
  ln -s "${state_dir}/missing-recovery-target" \
    "${state_dir}/post-migration-recovery-sha"

  if output="$(MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" 2>&1)"; then
    fail "rollback unexpectedly ignored a dangling post-migration recovery marker"
  fi
  grep -F "post-migration release is awaiting guarded recovery" <<< "${output}" >/dev/null \
    || fail "rollback did not fail closed on a dangling recovery marker"
}

test_backup_rejects_database_scoped_oplog_uri() {
  local backup_root="${TMP_ROOT}/scoped-uri-backups"
  local data_root="${TMP_ROOT}/scoped-uri-data"
  local env_file="${TMP_ROOT}/scoped-uri.env"
  local output
  mkdir -p "${backup_root}" "${data_root}"
  cat > "${env_file}" <<EOF
NODE_ENV=test
MENORAH_BACKUP_ROOT=${backup_root}
MENORAH_DATA_ROOT=${data_root}
MENORAH_DEPLOY_STATE_ROOT=${TMP_ROOT}/scoped-uri-deploy-state
BACKUP_REQUIRE_MOUNT=false
BACKUP_REQUIRE_ENCRYPTION=false
BACKUP_INTEGRITY_HMAC_KEY=release-script-test-hmac-key-000000000000000001
BACKUP_INTEGRITY_EPOCH_ID=release-script-test-epoch
MONGODB_BACKUP_URI='mongodb://backup.invalid/menorah?replicaSet=menorah-rs&authSource=admin'
MONGODB_REPLICA_SET_NAME=menorah-rs
EOF

  MENORAH_BACKUP_ROOT="${backup_root}" \
  BACKUP_INTEGRITY_HMAC_KEY='release-script-test-hmac-key-000000000000000001' \
  BACKUP_INTEGRITY_EPOCH_ID='release-script-test-epoch' \
    node "${REPO_ROOT}/deploy/ubuntu/backup-integrity-epoch.js" initialize initial-establishment
  MENORAH_BACKUP_ROOT="${backup_root}" \
  BACKUP_INTEGRITY_HMAC_KEY='release-script-test-hmac-key-000000000000000001' \
  BACKUP_INTEGRITY_EPOCH_ID='release-script-test-epoch' \
    node "${REPO_ROOT}/deploy/ubuntu/backup-integrity-epoch.js" activate

  if output="$(PRODUCTION_ENV="${env_file}" \
    "${REPO_ROOT}/deploy/ubuntu/backup-now.sh" manual 2>&1)"; then
    fail "backup unexpectedly accepted a database-scoped URI with --oplog"
  fi
  grep -F "must not select a database" <<< "${output}" >/dev/null \
    || fail "backup did not explain the full-instance oplog URI requirement"
}

test_partial_migration_rollback_is_blocked() {
  local state_dir="${TMP_ROOT}/partial-migration-state"
  local target_sha output
  mkdir -p "${state_dir}"
  target_sha="$(git -C "${REPO_ROOT}/../" rev-parse HEAD^)"
  printf '%s\n' "${target_sha}" > "${state_dir}/last-good-sha"
  printf '%s\n' "partial-migration-test" > "${state_dir}/migration-in-progress-sha"

  if output="$(MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" 2>&1)"; then
    fail "rollback unexpectedly proceeded with a partial migration marker"
  fi
  grep -F "migration may be partially applied" <<< "${output}" >/dev/null \
    || fail "rollback did not explain the partial-migration compatibility block"
}

test_partial_identity_reconciliation_rollback_is_blocked() {
  local state_dir="${TMP_ROOT}/partial-identity-state"
  local output
  mkdir -p "${state_dir}"
  printf '%s\n' "0000000000000000000000000000000000000000" \
    > "${state_dir}/mongo-identity-reconciliation-in-progress-sha"

  if output="$(MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" 2>&1)"; then
    fail "rollback unexpectedly proceeded with a partial identity reconciliation marker"
  fi
  grep -F "roles may be partially reconciled" <<< "${output}" >/dev/null \
    || fail "rollback did not explain the partial identity-reconciliation block"
}

test_interrupted_release_rollback_uses_current_artifacts() {
  local fixture_repo="${TMP_ROOT}/rollback-repo"
  local state_dir="${TMP_ROOT}/rollback-state"
  local mock_bin="${TMP_ROOT}/rollback-bin"
  local docker_log="${TMP_ROOT}/rollback-docker.log"
  local env_file="${TMP_ROOT}/rollback-production.env"
  local cloudflare_env="${TMP_ROOT}/rollback-cloudflare.env"
  local predecessor_sha="1111111111111111111111111111111111111111"
  local healthy_sha="2222222222222222222222222222222222222222"
  local interrupted_sha="3333333333333333333333333333333333333333"
  local build_image_id="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  local pinned_image_id="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  local pinned_reference="caddy:2.8-alpine@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  local releases_dir="${state_dir}/releases"
  local manifest="${releases_dir}/${healthy_sha}.images"
  local manifest_digest output

  mkdir -p \
    "${fixture_repo}/menorah/deploy/ubuntu" \
    "${fixture_repo}/menorah/deploy/env" \
    "${mock_bin}" \
    "${releases_dir}"
  cp "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" \
    "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh"
  cat > "${fixture_repo}/menorah/deploy/ubuntu/health-check.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x \
    "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh" \
    "${fixture_repo}/menorah/deploy/ubuntu/health-check.sh"
  : > "${env_file}"
  : > "${cloudflare_env}"

  printf '%s\n' "${predecessor_sha}" > "${state_dir}/last-good-sha"
  printf '%s\n' "${healthy_sha}" > "${state_dir}/current-sha"
  printf '%s\n' "${healthy_sha}" > "${state_dir}/migration-applied-sha"
  printf '%s|%s|%s\n' \
    api-web menorah-api-web:latest "${build_image_id}" > "${manifest}"
  printf '%s|%s|%s\n' \
    reverse-proxy "${pinned_reference}" "${pinned_image_id}" >> "${manifest}"
  manifest_digest="$(sha256sum "${manifest}" | awk '{print $1}')"
  printf '%s  %s\n' "${manifest_digest}" "$(basename "${manifest}")" \
    > "${manifest}.sha256"
  RELEASE_SHA="${healthy_sha}" \
  MANIFEST_PATH="${manifest}" \
  MANIFEST_SHA="${manifest_digest}" \
    node - <<'NODE' > "${releases_dir}/${healthy_sha}.json"
process.stdout.write(`${JSON.stringify({
  releaseSha: process.env.RELEASE_SHA,
  healthStatus: 'passed',
  artifactIdentity: {
    manifestPath: process.env.MANIFEST_PATH,
    manifestSha256: process.env.MANIFEST_SHA,
  },
})}\n`);
NODE

  cat > "${mock_bin}/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "${mock_bin}/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case " $* " in
  *" rev-parse HEAD "*) printf '%s\n' "${MOCK_CURRENT_SHA}" ;;
  *" cat-file -e "*) exit 0 ;;
  *" status --porcelain "*) exit 0 ;;
  *" checkout --detach "*) printf '%s\n' "$*" >> "${MOCK_GIT_LOG}" ;;
  *) echo "unexpected mock git invocation: $*" >&2; exit 90 ;;
esac
EOF
  cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${MOCK_DOCKER_LOG}"
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  if [[ "${3:-}" == "--format" ]]; then
    [[ "${5:-}" == "${MOCK_PINNED_REFERENCE}" ]] || exit 91
    printf '%s\n' "${MOCK_PINNED_IMAGE_ID}"
  fi
  exit 0
fi
if [[ "$1" == "image" && "$2" == "tag" ]]; then
  [[ "${4:-}" != *@sha256:* ]] || exit 92
  exit 0
fi
if [[ "$1" == "inspect" ]]; then
  container="${@: -1}"
  case "${container}" in
    api-web-container) printf 'true|%s\n' "${MOCK_BUILD_IMAGE_ID}" ;;
    reverse-proxy-container) printf 'true|%s\n' "${MOCK_PINNED_IMAGE_ID}" ;;
    *) exit 93 ;;
  esac
  exit 0
fi
if [[ "$1" == "compose" ]]; then
  case " $* " in
    *" ps -q api-web "*) printf '%s\n' api-web-container ;;
    *" ps -q reverse-proxy "*) printf '%s\n' reverse-proxy-container ;;
    *) exit 0 ;;
  esac
  exit 0
fi
echo "unexpected mock docker invocation: $*" >&2
exit 94
EOF
  chmod +x "${mock_bin}/flock" "${mock_bin}/git" "${mock_bin}/docker"

  cp "${releases_dir}/${healthy_sha}.json" "${releases_dir}/${healthy_sha}.json.correct"
  RELEASE_METADATA_PATH="${releases_dir}/${healthy_sha}.json" \
  MISMATCHED_MANIFEST_SHA="dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" \
    node - <<'NODE'
const fs = require('fs');
const metadata = JSON.parse(fs.readFileSync(process.env.RELEASE_METADATA_PATH, 'utf8'));
metadata.artifactIdentity.manifestSha256 = process.env.MISMATCHED_MANIFEST_SHA;
fs.writeFileSync(process.env.RELEASE_METADATA_PATH, `${JSON.stringify(metadata)}\n`);
NODE
  if output="$(
    PATH="${mock_bin}:${PATH}" \
    MOCK_CURRENT_SHA="${interrupted_sha}" \
    MOCK_GIT_LOG="${TMP_ROOT}/rollback-git.log" \
    MOCK_DOCKER_LOG="${docker_log}" \
    MOCK_BUILD_IMAGE_ID="${build_image_id}" \
    MOCK_PINNED_IMAGE_ID="${pinned_image_id}" \
    MOCK_PINNED_REFERENCE="${pinned_reference}" \
    MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    PRODUCTION_ENV="${env_file}" \
    CLOUDFLARE_ENV="${cloudflare_env}" \
      "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh" 2>&1
  )"; then
    fail "rollback accepted metadata whose manifest digest did not match verified artifacts"
  fi
  grep -F "Recorded rollback metadata is incomplete" <<< "${output}" >/dev/null \
    || fail "rollback did not explain the metadata/manifest digest mismatch"
  [[ ! -s "${docker_log}" ]] \
    || fail "rollback touched Docker artifacts before rejecting mismatched metadata"
  mv -f "${releases_dir}/${healthy_sha}.json.correct" "${releases_dir}/${healthy_sha}.json"

  output="$(
    PATH="${mock_bin}:${PATH}" \
    MOCK_CURRENT_SHA="${interrupted_sha}" \
    MOCK_GIT_LOG="${TMP_ROOT}/rollback-git.log" \
    MOCK_DOCKER_LOG="${docker_log}" \
    MOCK_BUILD_IMAGE_ID="${build_image_id}" \
    MOCK_PINNED_IMAGE_ID="${pinned_image_id}" \
    MOCK_PINNED_REFERENCE="${pinned_reference}" \
    MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    PRODUCTION_ENV="${env_file}" \
    CLOUDFLARE_ENV="${cloudflare_env}" \
      "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh"
  )" || fail "interrupted pre-migration rollback did not restore the recorded current release"

  grep -F "recorded healthy release before the interrupted attempt" <<< "${output}" >/dev/null \
    || fail "rollback did not select current-sha for the interrupted attempt"
  grep -F "image tag ${build_image_id} menorah-api-web:latest" "${docker_log}" >/dev/null \
    || fail "rollback did not restore the local build image tag"
  if grep -F "image tag ${pinned_image_id} ${pinned_reference}" "${docker_log}" >/dev/null; then
    fail "rollback attempted to tag a digest-pinned image reference"
  fi
  grep -F "image inspect --format {{.Id}} ${pinned_reference}" "${docker_log}" >/dev/null \
    || fail "rollback did not verify the digest-pinned reference"
  [[ "$(tr -d '\r\n' < "${state_dir}/current-sha")" == "${healthy_sha}" ]] \
    || fail "rollback did not retain the recovered current release marker"
}

test_recorded_migration_refuses_tag_drift() {
  local mock_bin="${TMP_ROOT}/migration-bin"
  local state_dir="${TMP_ROOT}/migration-state"
  local env_file="${TMP_ROOT}/migration-production.env"
  local cloudflare_env="${TMP_ROOT}/migration-cloudflare.env"
  local docker_log="${TMP_ROOT}/migration-docker.log"
  local manifest="${state_dir}/candidate.images"
  local image_id="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  local drifted_id="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  local output

  mkdir -p "${mock_bin}" "${state_dir}"
  : > "${env_file}"
  : > "${cloudflare_env}"
  printf 'api-web|menorah-api-web:latest|%s\n' "${image_id}" > "${manifest}"
  (
    cd "${state_dir}"
    sha256sum "$(basename "${manifest}")" > "$(basename "${manifest}").sha256"
  )

  cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${MOCK_DOCKER_LOG}"
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  if [[ "${3:-}" == "--format" ]]; then
    printf '%s\n' "${MOCK_RESOLVED_IMAGE_ID}"
  fi
  exit 0
fi
if [[ "$1" == "compose" ]]; then
  [[ "${MENORAH_MIGRATION_IMAGE_ID:-}" == "${MOCK_RECORDED_IMAGE_ID}" ]] || exit 81
  exit 0
fi
exit 82
EOF
  chmod +x "${mock_bin}/docker"

  printf '%s  unrelated.images\n' "$(sha256sum "${manifest}" | awk '{print $1}')" \
    > "${manifest}.sha256"
  if output="$(
    PATH="${mock_bin}:${PATH}" \
    MOCK_DOCKER_LOG="${docker_log}" \
    MOCK_RESOLVED_IMAGE_ID="${image_id}" \
    MOCK_RECORDED_IMAGE_ID="${image_id}" \
    PRODUCTION_ENV="${env_file}" \
    CLOUDFLARE_ENV="${cloudflare_env}" \
    MENORAH_RELEASE_IMAGE_MANIFEST="${manifest}" \
      bash "${REPO_ROOT}/deploy/ubuntu/run-recorded-migration.sh" 2>&1
  )"; then
    fail "recorded migration helper accepted a checksum naming another manifest"
  fi
  grep -F "exactly the manifest digest and basename" <<< "${output}" >/dev/null \
    || fail "recorded migration helper did not explain checksum/manifest binding"
  (
    cd "${state_dir}"
    sha256sum "$(basename "${manifest}")" > "$(basename "${manifest}").sha256"
  )

  if output="$(
    PATH="${mock_bin}:${PATH}" \
    MOCK_DOCKER_LOG="${docker_log}" \
    MOCK_RESOLVED_IMAGE_ID="${drifted_id}" \
    MOCK_RECORDED_IMAGE_ID="${image_id}" \
    PRODUCTION_ENV="${env_file}" \
    CLOUDFLARE_ENV="${cloudflare_env}" \
    MENORAH_RELEASE_IMAGE_MANIFEST="${manifest}" \
      bash "${REPO_ROOT}/deploy/ubuntu/run-recorded-migration.sh" 2>&1
  )"; then
    fail "recorded migration helper accepted a drifted mutable api-web tag"
  fi
  grep -F "tag drifted after artifact capture" <<< "${output}" >/dev/null \
    || fail "recorded migration helper did not explain tag drift"
  if grep -F "compose " "${docker_log}" >/dev/null; then
    fail "recorded migration helper touched Compose after detecting tag drift"
  fi

  : > "${docker_log}"
  PATH="${mock_bin}:${PATH}" \
  MOCK_DOCKER_LOG="${docker_log}" \
  MOCK_RESOLVED_IMAGE_ID="${image_id}" \
  MOCK_RECORDED_IMAGE_ID="${image_id}" \
  PRODUCTION_ENV="${env_file}" \
  CLOUDFLARE_ENV="${cloudflare_env}" \
  MENORAH_RELEASE_IMAGE_MANIFEST="${manifest}" \
    bash "${REPO_ROOT}/deploy/ubuntu/run-recorded-migration.sh" >/dev/null \
    || fail "recorded migration helper rejected the checksum-bound api-web image"
  grep -F -- "-f ${REPO_ROOT}/deploy/docker-compose.migration.yml" "${docker_log}" >/dev/null \
    || fail "migration did not use the recorded-image Compose override"
  grep -F -- "run --rm --no-deps --pull never api-web node src/database/migrate.js" "${docker_log}" >/dev/null \
    || fail "migration launch was not pull-free and bound to the api-web service"
}

test_mongo_tool_credentials_stay_out_of_argv() {
  local mock_bin="${TMP_ROOT}/mongo-tool-bin"
  local argv_log="${TMP_ROOT}/mongo-tool-argv.log"
  local config_path_log="${TMP_ROOT}/mongo-tool-config-path.log"
  local config_mode_log="${TMP_ROOT}/mongo-tool-config-mode.log"
  local secret_uri='mongodb://backup-user:super-secret-value@mongo-primary:27017/?authSource=admin'

  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/mongodump" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "${MOCK_MONGO_ARGV_LOG}"
config_path=""
for argument in "$@"; do
  if [[ "${argument}" == --config=* ]]; then
    config_path="${argument#--config=}"
  fi
done
[[ -n "${config_path}" && -f "${config_path}" ]] || exit 91
[[ "$(stat -c '%a' "${config_path}")" == "600" ]] || exit 92
grep -F -- "${MONGODB_BACKUP_URI}" "${config_path}" >/dev/null || exit 93
printf '%s\n' "${config_path}" > "${MOCK_MONGO_CONFIG_PATH_LOG}"
printf '%s\n' "$(stat -c '%a' "${config_path}")" > "${MOCK_MONGO_CONFIG_MODE_LOG}"
EOF
  chmod +x "${mock_bin}/mongodump"

  PATH="${mock_bin}:${PATH}" \
  MOCK_MONGO_ARGV_LOG="${argv_log}" \
  MOCK_MONGO_CONFIG_PATH_LOG="${config_path_log}" \
  MOCK_MONGO_CONFIG_MODE_LOG="${config_mode_log}" \
  MONGODB_BACKUP_URI="${secret_uri}" \
    bash "${REPO_ROOT}/deploy/backup/run-mongo-tool-secure.sh" \
      MONGODB_BACKUP_URI mongodump --archive --gzip

  grep -F -- '--config=' "${argv_log}" >/dev/null \
    || fail "MongoDB tool wrapper did not use an ephemeral config argument"
  if grep -F -- "${secret_uri}" "${argv_log}" >/dev/null; then
    fail "MongoDB tool wrapper exposed its credential-bearing URI in argv"
  fi
  [[ "$(< "${config_mode_log}")" == "600" ]] \
    || fail "MongoDB tool wrapper config was not mode 0600"
  [[ ! -e "$(< "${config_path_log}")" ]] \
    || fail "MongoDB tool wrapper did not remove its ephemeral config"
}

test_media_verifier_credentials_stay_out_of_compose_argv() {
  local script expected_assignment

  for script in \
    "${REPO_ROOT}/deploy/ubuntu/backup-now.sh" \
    "${REPO_ROOT}/deploy/ubuntu/restore-latest-backup.sh"; do
    if grep -Eq -- "-e[[:space:]]+[\"']?MEDIA_VERIFY_MONGODB_URI=" "${script}"; then
      fail "$(basename "${script}") exposed its credential-bearing media verification URI in Compose argv"
    fi
    grep -F -- "-e MEDIA_VERIFY_MONGODB_URI" "${script}" >/dev/null \
      || fail "$(basename "${script}") did not use value-free Compose environment inheritance"
  done

  expected_assignment='MEDIA_VERIFY_MONGODB_URI="${MONGODB_BACKUP_URI}"'
  grep -F -- "${expected_assignment}" "${REPO_ROOT}/deploy/ubuntu/backup-now.sh" >/dev/null \
    || fail "backup media verification did not supply its URI through the Compose process environment"
  expected_assignment='MEDIA_VERIFY_MONGODB_URI="${uri}"'
  grep -F -- "${expected_assignment}" "${REPO_ROOT}/deploy/ubuntu/restore-latest-backup.sh" >/dev/null \
    || fail "restore media verification did not supply its URI through the Compose process environment"
}

test_production_smoke_credentials_stay_out_of_docker_argv() {
  local script="${REPO_ROOT}/scripts/qa/run-production-chat-call-smoke.sh"

  if grep -Eq -- "-e[[:space:]]+[\"']?QA_(PASSWORD|FIXTURE_JSON|RUN_ID)=" "${script}"; then
    fail "production chat/call smoke exposed credential or fixture values in Docker argv"
  fi
  if grep -Eq -- "process\.argv[^\n]*fixture_json|node -e[^\n]*\"\$fixture_json\"" "${script}"; then
    fail "production chat/call smoke exposed fixture data in Node argv"
  fi
  grep -F -- 'JSON.parse(process.env.QA_FIXTURE_JSON_TO_VALIDATE)' "${script}" >/dev/null \
    || fail "production chat/call smoke did not validate fixture JSON through process environment"
  for variable in QA_PASSWORD QA_FIXTURE_JSON QA_FIXTURE_ACTION QA_RUN_ID; do
    grep -Eq -- "-e[[:space:]]+${variable}([[:space:]]|\\\\$)" "${script}" \
      || fail "production chat/call smoke did not inherit ${variable} value-free"
  done
}

test_interrupted_rollback_reuses_durable_target() {
  local fixture_repo="${TMP_ROOT}/rollback-retry-repo"
  local state_dir="${TMP_ROOT}/rollback-retry-state"
  local mock_bin="${TMP_ROOT}/rollback-retry-bin"
  local env_file="${TMP_ROOT}/rollback-retry-production.env"
  local cloudflare_env="${TMP_ROOT}/rollback-retry-cloudflare.env"
  local head_file="${TMP_ROOT}/rollback-retry-head"
  local fail_once_file="${TMP_ROOT}/rollback-retry-failed-once"
  local git_log="${TMP_ROOT}/rollback-retry-git.log"
  local docker_log="${TMP_ROOT}/rollback-retry-docker.log"
  local last_good_sha="1111111111111111111111111111111111111111"
  local target_sha="2222222222222222222222222222222222222222"
  local interrupted_sha="3333333333333333333333333333333333333333"
  local image_id="sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  local pinned_reference="caddy:2.8-alpine@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  local releases_dir="${state_dir}/releases"
  local manifest="${releases_dir}/${target_sha}.images"
  local manifest_digest output

  mkdir -p \
    "${fixture_repo}/menorah/deploy/ubuntu" \
    "${fixture_repo}/menorah/deploy/env" \
    "${mock_bin}" \
    "${releases_dir}"
  cp "${REPO_ROOT}/deploy/ubuntu/rollback-last-deploy.sh" \
    "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh"
  cat > "${fixture_repo}/menorah/deploy/ubuntu/health-check.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x \
    "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh" \
    "${fixture_repo}/menorah/deploy/ubuntu/health-check.sh"
  : > "${env_file}"
  : > "${cloudflare_env}"
  printf '%s\n' "${interrupted_sha}" > "${head_file}"
  printf '%s\n' "${last_good_sha}" > "${state_dir}/last-good-sha"
  printf '%s\n' "${target_sha}" > "${state_dir}/current-sha"
  printf '%s\n' "${target_sha}" > "${state_dir}/migration-applied-sha"
  printf 'reverse-proxy|%s|%s\n' "${pinned_reference}" "${image_id}" > "${manifest}"
  manifest_digest="$(sha256sum "${manifest}" | awk '{print $1}')"
  printf '%s  %s\n' "${manifest_digest}" "$(basename "${manifest}")" > "${manifest}.sha256"
  RELEASE_SHA="${target_sha}" \
  MANIFEST_PATH="${manifest}" \
  MANIFEST_SHA="${manifest_digest}" \
    node - <<'NODE' > "${releases_dir}/${target_sha}.json"
process.stdout.write(`${JSON.stringify({
  releaseSha: process.env.RELEASE_SHA,
  healthStatus: 'passed',
  artifactIdentity: {
    manifestPath: process.env.MANIFEST_PATH,
    manifestSha256: process.env.MANIFEST_SHA,
  },
})}\n`);
NODE

  cat > "${mock_bin}/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "${mock_bin}/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case " $* " in
  *" rev-parse HEAD"*) cat "${MOCK_HEAD_FILE}" ;;
  *" cat-file -e "*) exit 0 ;;
  *" status --porcelain"*) exit 0 ;;
  *" checkout --detach "*)
    target="${@: -1}"
    printf '%s\n' "${target}" > "${MOCK_HEAD_FILE}"
    printf '%s\n' "${target}" >> "${MOCK_GIT_LOG}"
    ;;
  *) echo "unexpected mock git invocation: $*" >&2; exit 90 ;;
esac
EOF
  cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${MOCK_DOCKER_LOG}"
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  if [[ "${3:-}" == "--format" ]]; then
    printf '%s\n' "${MOCK_IMAGE_ID}"
  fi
  exit 0
fi
if [[ "$1" == "inspect" ]]; then
  printf 'true|%s\n' "${MOCK_IMAGE_ID}"
  exit 0
fi
if [[ "$1" == "compose" ]]; then
  case " $* " in
    *" up -d "*)
      if [[ ! -e "${MOCK_FAIL_ONCE_FILE}" ]]; then
        : > "${MOCK_FAIL_ONCE_FILE}"
        exit 42
      fi
      ;;
    *" ps -q reverse-proxy "*) printf '%s\n' reverse-proxy-container ;;
    *" ps -q "*) ;;
  esac
  exit 0
fi
exit 91
EOF
  chmod +x "${mock_bin}/flock" "${mock_bin}/git" "${mock_bin}/docker"

  if output="$(
    PATH="${mock_bin}:${PATH}" \
    MOCK_HEAD_FILE="${head_file}" \
    MOCK_GIT_LOG="${git_log}" \
    MOCK_DOCKER_LOG="${docker_log}" \
    MOCK_FAIL_ONCE_FILE="${fail_once_file}" \
    MOCK_IMAGE_ID="${image_id}" \
    MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    PRODUCTION_ENV="${env_file}" \
    CLOUDFLARE_ENV="${cloudflare_env}" \
      "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh" 2>&1
  )"; then
    fail "rollback retry fixture unexpectedly passed its injected first startup failure"
  fi
  grep -F "stopping application writers" <<< "${output}" >/dev/null \
    || fail "failed rollback did not enter its writer-safe recovery trap"
  [[ "$(tr -d '\r\n' < "${state_dir}/rollback-in-progress-sha")" == "${target_sha}" ]] \
    || fail "failed rollback did not preserve its durable target"
  [[ "$(tr -d '\r\n' < "${head_file}")" == "${target_sha}" ]] \
    || fail "rollback fixture did not reach the post-checkout failure window"

  PATH="${mock_bin}:${PATH}" \
  MOCK_HEAD_FILE="${head_file}" \
  MOCK_GIT_LOG="${git_log}" \
  MOCK_DOCKER_LOG="${docker_log}" \
  MOCK_FAIL_ONCE_FILE="${fail_once_file}" \
  MOCK_IMAGE_ID="${image_id}" \
  MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
  PRODUCTION_ENV="${env_file}" \
  CLOUDFLARE_ENV="${cloudflare_env}" \
    "${fixture_repo}/menorah/deploy/ubuntu/rollback-last-deploy.sh" >/dev/null \
    || fail "rollback retry did not reuse its durable target"
  [[ ! -e "${state_dir}/rollback-in-progress-sha" ]] \
    || fail "successful rollback retry did not clear its durable target"
  [[ "$(tr -d '\r\n' < "${state_dir}/current-sha")" == "${target_sha}" ]] \
    || fail "successful rollback retry did not atomically retain current-sha"
  if grep -Fx "${last_good_sha}" "${git_log}" >/dev/null; then
    fail "rollback retry switched to last-good after losing its original HEAD discrepancy"
  fi
}

test_release_state_marker_ordering() {
  UPDATE_SCRIPT_PATH="${REPO_ROOT}/deploy/ubuntu/update-from-git.sh" \
  RESUME_SCRIPT_PATH="${REPO_ROOT}/deploy/ubuntu/resume-post-migration-release.sh" \
    node - <<'NODE' || fail "release state markers are not ordered for interruption-safe recovery"
const fs = require('fs');
const update = fs.readFileSync(process.env.UPDATE_SCRIPT_PATH, 'utf8');
const resume = fs.readFileSync(process.env.RESUME_SCRIPT_PATH, 'utf8');

const ordered = (text, fragments) => {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, cursor + 1);
    if (next < 0 || next <= cursor) return false;
    cursor = next;
  }
  return true;
};

const migrationCommit = update.slice(update.indexOf('# Establish durable resume authority'));
if (!ordered(migrationCommit, [
  'write_marker_atomically "${POST_MIGRATION_RECOVERY_MARKER}" "${NEW_SHA}"',
  'write_marker_atomically "${MIGRATION_MARKER}" "${NEW_SHA}"',
  'rm -f -- "${MIGRATION_IN_PROGRESS_MARKER}"',
])) process.exit(1);

const finalization = update.slice(update.lastIndexOf('DEPLOY_PHASE="complete"'));
if (!ordered(finalization, [
  'DEPLOY_PHASE="complete"',
  'write_release_metadata',
  'write_marker_atomically "${LAST_GOOD_SHA_FILE}" "${PREVIOUS_SHA}"',
  'write_marker_atomically "${CURRENT_SHA_FILE}" "${NEW_SHA}"',
  'DEPLOY_SUCCEEDED=true',
  'trap - EXIT',
  'rm -f -- "${BOOTSTRAP_COMPLETE_MARKER}"',
  'rm -f -- "${POST_MIGRATION_RECOVERY_MARKER}"',
])) process.exit(1);

if (!update.includes('&& "${DEPLOY_SUCCEEDED}" != "true"')) process.exit(1);
const adoption = update.slice(update.lastIndexOf('\nensure_reviewed_updater_execution\n'));
if (!ordered(adoption, [
  'ensure_predecessor_artifact_baseline',
  'write_marker_atomically "${CURRENT_SHA_FILE}" "${PREVIOUS_SHA}"',
  'git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"',
])) process.exit(1);
if (!update.includes('verify_running_artifact_manifest "${predecessor_manifest}"')) process.exit(1);
if (!update.includes(
  'read_valid_sha_marker "${MIGRATION_MARKER}" "Applied migration"'
)) process.exit(1);
if (!update.includes(
  'if [[ "${RECORDED_MIGRATION_SHA}" != "${PREVIOUS_SHA}" ]]'
)) process.exit(1);
if (!update.includes(
  'read_valid_sha_marker "${BOOTSTRAP_COMPLETE_MARKER}" "Bootstrap completion"'
)) process.exit(1);
if (!resume.includes(
  'read_valid_sha_marker "${BOOTSTRAP_COMPLETE_MARKER}" "Bootstrap completion"'
)) process.exit(1);
if (!resume.includes('["complete", "recovered-complete"].includes(metadata.phase)')) process.exit(1);
if (!resume.includes('metadata.phase === "migration-running" && metadata.migrationStatus === "running"')) {
  process.exit(1);
}

const resumeFinalization = resume.slice(resume.lastIndexOf('write_marker "${CURRENT_SHA_FILE}"'));
if (!ordered(resumeFinalization, [
  'write_marker "${CURRENT_SHA_FILE}" "${RECOVERY_SHA}"',
  'recovery_succeeded=true',
  'trap - EXIT',
  'rm -f -- "${BOOTSTRAP_COMPLETE_MARKER}"',
  'rm -f -- "${RECOVERY_MARKER}"',
])) process.exit(1);
NODE
}

test_resume_accepts_proven_applied_interruption() {
  local fixture_repo="${TMP_ROOT}/resume-repo"
  local state_dir="${TMP_ROOT}/resume-state"
  local mock_bin="${TMP_ROOT}/resume-bin"
  local env_file="${TMP_ROOT}/resume-production.env"
  local cloudflare_env="${TMP_ROOT}/resume-cloudflare.env"
  local docker_log="${TMP_ROOT}/resume-docker.log"
  local recovery_sha="4444444444444444444444444444444444444444"
  local previous_sha="3333333333333333333333333333333333333333"
  local tree_sha="5555555555555555555555555555555555555555"
  local image_id="sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  local releases_dir="${state_dir}/releases"
  local image_manifest="${releases_dir}/${recovery_sha}.images"
  local media_manifest="${releases_dir}/${recovery_sha}.media-transition.manifest"
  local image_digest media_digest
  local real_git
  local output
  local -a services=(
    landing-page user-web-app web-app admin-panel api-ios api-android api-web api-admin worker
    reverse-proxy livekit cloudflared prometheus alertmanager blackbox-exporter
    mongodb-exporter redis-exporter node-exporter backup-metrics grafana uptime-kuma
    docker-metrics-gateway docker-stats-exporter log-collector loki
  )

  mkdir -p \
    "${fixture_repo}/menorah/deploy/ubuntu" \
    "${fixture_repo}/menorah/deploy/env" \
    "${mock_bin}" \
    "${releases_dir}"
  cp "${REPO_ROOT}/deploy/ubuntu/resume-post-migration-release.sh" \
    "${fixture_repo}/menorah/deploy/ubuntu/resume-post-migration-release.sh"
  cat > "${fixture_repo}/menorah/deploy/ubuntu/health-check.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x \
    "${fixture_repo}/menorah/deploy/ubuntu/resume-post-migration-release.sh" \
    "${fixture_repo}/menorah/deploy/ubuntu/health-check.sh"
  : > "${env_file}"
  : > "${cloudflare_env}"

  printf '%s\n' "${recovery_sha}" > "${state_dir}/post-migration-recovery-sha"
  printf '%s\n' "${recovery_sha}" > "${state_dir}/migration-applied-sha"
  printf '%s\n' "${recovery_sha}" > "${state_dir}/migration-in-progress-sha"
  printf '%s\n' "${previous_sha}" > "${state_dir}/current-sha"
  for service in "${services[@]}"; do
    printf '%s|menorah-%s:recorded|%s\n' "${service}" "${service}" "${image_id}" \
      >> "${image_manifest}"
  done
  image_digest="$(sha256sum "${image_manifest}" | awk '{print $1}')"
  printf '%s  %s\n' "${image_digest}" "$(basename "${image_manifest}")" \
    > "${image_manifest}.sha256"
  cat > "${media_manifest}" <<EOF
schema=1
releaseSha=${recovery_sha}
legacyCopiesRetained=true
uniqueObjects=0
sha256|bytes|relativePath
EOF
  media_digest="$(sha256sum "${media_manifest}" | awk '{print $1}')"
  printf '%s  %s\n' "${media_digest}" "$(basename "${media_manifest}")" \
    > "${media_manifest}.sha256"
  RELEASE_SHA="${recovery_sha}" \
  PREVIOUS_SHA="${previous_sha}" \
  TREE_SHA="${tree_sha}" \
  IMAGE_MANIFEST="${image_manifest}" \
  IMAGE_DIGEST="${image_digest}" \
  MEDIA_MANIFEST="${media_manifest}" \
  MEDIA_DIGEST="${media_digest}" \
    node - <<'NODE' > "${releases_dir}/${recovery_sha}.json"
process.stdout.write(`${JSON.stringify({
  releaseSha: process.env.RELEASE_SHA,
  previousSha: process.env.PREVIOUS_SHA,
  sourceTreeSha: process.env.TREE_SHA,
  phase: 'migration-running',
  migrationStatus: 'running',
  healthStatus: 'pending',
  artifactIdentity: {
    manifestPath: process.env.IMAGE_MANIFEST,
    manifestSha256: process.env.IMAGE_DIGEST,
  },
  mediaTransition: {
    manifestPath: process.env.MEDIA_MANIFEST,
    manifestSha256: process.env.MEDIA_DIGEST,
  },
})}\n`);
NODE

  cat > "${mock_bin}/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "${mock_bin}/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
arguments=" $* "
if [[ "${arguments}" == *"${MOCK_RECOVERY_SHA}:menorah/deploy/ubuntu/resume-post-migration-release.sh"* ]]; then
  "${REAL_GIT}" hash-object "${MOCK_SCRIPT_PATH}"
elif [[ "${arguments}" == *" hash-object "* ]]; then
  "${REAL_GIT}" hash-object "${@: -1}"
elif [[ "${arguments}" == *" rev-parse HEAD^{tree} "* ]]; then
  printf '%s\n' "${MOCK_TREE_SHA}"
elif [[ "${arguments}" == *" rev-parse HEAD "* ]]; then
  printf '%s\n' "${MOCK_RECOVERY_SHA}"
elif [[ "${arguments}" == *" cat-file -e "* ]]; then
  exit 0
elif [[ "${arguments}" == *" status --porcelain "* ]]; then
  exit 0
else
  echo "unexpected mock git invocation: $*" >&2
  exit 90
fi
EOF
  cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${MOCK_DOCKER_LOG}"
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  if [[ "${3:-}" == "--format" ]]; then
    printf '%s\n' "${MOCK_IMAGE_ID}"
  fi
  exit 0
fi
if [[ "$1" == "image" && "$2" == "tag" ]]; then
  exit 0
fi
if [[ "$1" == "inspect" ]]; then
  printf 'true|%s\n' "${MOCK_IMAGE_ID}"
  exit 0
fi
if [[ "$1" == "ps" ]]; then
  exit 0
fi
if [[ "$1" == "compose" ]]; then
  case " $* " in
    *" config --format json "*) printf '%s\n' '{"name":"deploy"}' ;;
    *" ps -q "*)
      service="${@: -1}"
      printf '%s-container\n' "${service}"
      ;;
    *) ;;
  esac
  exit 0
fi
exit 91
EOF
  chmod +x "${mock_bin}/flock" "${mock_bin}/git" "${mock_bin}/docker"
  real_git="$(command -v git)"

  run_resume_fixture() {
    PATH="${mock_bin}:${PATH}" \
    REAL_GIT="${real_git}" \
    MOCK_RECOVERY_SHA="${recovery_sha}" \
    MOCK_TREE_SHA="${tree_sha}" \
    MOCK_SCRIPT_PATH="${fixture_repo}/menorah/deploy/ubuntu/resume-post-migration-release.sh" \
    MOCK_DOCKER_LOG="${docker_log}" \
    MOCK_IMAGE_ID="${image_id}" \
    MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    PRODUCTION_ENV="${env_file}" \
    CLOUDFLARE_ENV="${cloudflare_env}" \
    MENORAH_POST_MIGRATION_RECOVERY_CONFIRM=RESUME_RECORDED_RELEASE \
      "${fixture_repo}/menorah/deploy/ubuntu/resume-post-migration-release.sh"
  }

  mv "${media_manifest}.sha256" "${media_manifest}.sha256.saved"
  if output="$(run_resume_fixture 2>&1)"; then
    fail "resume accepted missing media-transition checksum evidence"
  fi
  grep -F "media-transition evidence is incomplete" <<< "${output}" >/dev/null \
    || fail "resume did not explain missing media-transition evidence"
  mv "${media_manifest}.sha256.saved" "${media_manifest}.sha256"
  [[ ! -s "${docker_log}" ]] \
    || fail "resume touched Docker before rejecting missing media evidence"

  cp "${media_manifest}" "${media_manifest}.correct"
  printf 'tampered\n' >> "${media_manifest}"
  if run_resume_fixture >/dev/null 2>&1; then
    fail "resume accepted tampered media-transition evidence"
  fi
  mv "${media_manifest}.correct" "${media_manifest}"
  [[ ! -s "${docker_log}" ]] \
    || fail "resume touched Docker before rejecting tampered media evidence"

  run_resume_fixture >/dev/null \
    || fail "resume rejected the proven-applied three-marker interruption state"

  [[ ! -e "${state_dir}/migration-in-progress-sha" \
    && ! -e "${state_dir}/post-migration-recovery-sha" ]] \
    || fail "successful resume did not clear proven-applied recovery markers"
  [[ "$(tr -d '\r\n' < "${state_dir}/current-sha")" == "${recovery_sha}" ]] \
    || fail "successful resume did not commit the recovered current SHA"
  [[ "$(tr -d '\r\n' < "${state_dir}/last-good-sha")" == "${previous_sha}" ]] \
    || fail "successful resume did not preserve the previous healthy SHA"
  RELEASE_METADATA_PATH="${releases_dir}/${recovery_sha}.json" node -e '
    const fs = require("fs");
    const metadata = JSON.parse(fs.readFileSync(process.env.RELEASE_METADATA_PATH, "utf8"));
    if (metadata.phase !== "recovered-complete"
      || metadata.healthStatus !== "passed"
      || metadata.migrationStatus !== "applied") process.exit(1);
  ' || fail "successful resume did not normalize stale migration metadata"
  if grep -F "src/database/migrate.js" "${docker_log}" >/dev/null; then
    fail "post-migration resume attempted to rerun the migration"
  fi
}

run_release_environment_validator() {
  local script_path="$1"
  local deployment_environment="$2"
  local reset_origin="$3"
  local apple_enabled="$4"
  local apple_bundle_id="${5:-}"
  local apple_team_id="${6:-}"
  local apple_key_id="${7:-}"
  local apple_private_key="${8:-}"
  local node_environment="${9:-production}"
  local reset_template="${10:-}"
  local topology_variant="${11:-valid}"
  local validator

  validator="$(sed -n '/^validate_release_environment() {/,/^}/p' "${script_path}")"
  [[ -n "${validator}" ]] \
    || fail "release environment validator is missing from ${script_path}"

  (
    eval "${validator}"
    NODE_ENV="${node_environment}"
    if [[ "${deployment_environment}" == "__default__" ]]; then
      unset DEPLOYMENT_ENVIRONMENT
    else
      DEPLOYMENT_ENVIRONMENT="${deployment_environment}"
    fi
    ROOT_DOMAIN="staging.example.com"
    WWW_DOMAIN="www.staging.example.com"
    APP_DOMAIN="app.staging.example.com"
    ADMIN_DOMAIN="admin.staging.example.com"
    COUNSELLOR_DOMAIN="counsellor.staging.example.com"
    API_IOS_DOMAIN="api-ios.staging.example.com"
    API_ANDROID_DOMAIN="api-android.staging.example.com"
    API_WEB_DOMAIN="api-web.staging.example.com"
    API_ADMIN_DOMAIN="api-admin.staging.example.com"
    CALLS_DOMAIN="calls.staging.example.com"
    MENORAH_STAGING_ALLOWED_HOSTS=\
"${ROOT_DOMAIN},${WWW_DOMAIN},${APP_DOMAIN},${ADMIN_DOMAIN},${COUNSELLOR_DOMAIN},"\
"${API_IOS_DOMAIN},${API_ANDROID_DOMAIN},${API_WEB_DOMAIN},${API_ADMIN_DOMAIN},${CALLS_DOMAIN}"
    LIVEKIT_URL="wss://${CALLS_DOMAIN}"
    LIVEKIT_API_URL="https://${CALLS_DOMAIN}"
    MENORAH_STAGING_EMAIL_DOMAIN="mail.staging.example.com"
    CONTACT_TO_EMAIL="contact@mail.staging.example.com"
    EMAIL_FROM="Menorah Staging <noreply@mail.staging.example.com>"
    FRONTEND_API_WEB_URL="https://${API_WEB_DOMAIN}/api"
    FRONTEND_API_ADMIN_URL="https://${API_ADMIN_DOMAIN}/api"
    FRONTEND_SOCKET_WEB_URL="https://${API_WEB_DOMAIN}"
    MEDIA_PUBLIC_BASE_URL="https://${API_WEB_DOMAIN}"
    ALLOWED_ORIGINS="https://${WWW_DOMAIN},https://${APP_DOMAIN},https://${ADMIN_DOMAIN},https://${COUNSELLOR_DOMAIN}"
    WEB_SESSION_ORIGINS="https://${WWW_DOMAIN}=user,https://${APP_DOMAIN}=user,https://${COUNSELLOR_DOMAIN}=counsellor,https://${ADMIN_DOMAIN}=admin"
    RAZORPAY_KEY_ID="rzp_test_A1b2C3d4E5f6G7"
    RAZORPAY_X_KEY_ID=""
    NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_A1b2C3d4E5f6G7"
    PASSWORD_RESET_BASE_URL="${reset_origin}"
    CHECKOUT_RETURN_URL="https://${APP_DOMAIN}/checkout/callback"
    PASSWORD_RESET_URL_TEMPLATE="${reset_template}"
    APPLE_SIGN_IN_ENABLED="${apple_enabled}"
    APPLE_IOS_BUNDLE_ID="${apple_bundle_id}"
    APPLE_TEAM_ID="${apple_team_id}"
    APPLE_KEY_ID="${apple_key_id}"
    APPLE_PRIVATE_KEY="${apple_private_key}"

    if [[ "${deployment_environment}" != "staging" ]]; then
      MENORAH_STAGING_EMAIL_DOMAIN=""
      CONTACT_TO_EMAIL="menorahenquiries@gmail.com"
      EMAIL_FROM="Menorah Health <noreply@menorah.me>"
      CHECKOUT_RETURN_URL="https://app.menorah.me/checkout/callback"
    fi

    case "${topology_variant}" in
      valid) ;;
      unset)
        unset \
          MENORAH_STAGING_ALLOWED_HOSTS \
          MENORAH_STAGING_EMAIL_DOMAIN CONTACT_TO_EMAIL EMAIL_FROM \
          ROOT_DOMAIN WWW_DOMAIN APP_DOMAIN ADMIN_DOMAIN COUNSELLOR_DOMAIN \
          API_IOS_DOMAIN API_ANDROID_DOMAIN API_WEB_DOMAIN API_ADMIN_DOMAIN \
          CALLS_DOMAIN LIVEKIT_URL LIVEKIT_API_URL PASSWORD_RESET_BASE_URL \
          CHECKOUT_RETURN_URL \
          FRONTEND_API_WEB_URL FRONTEND_API_ADMIN_URL FRONTEND_SOCKET_WEB_URL \
          MEDIA_PUBLIC_BASE_URL ALLOWED_ORIGINS WEB_SESSION_ORIGINS
        ;;
      production)
        ROOT_DOMAIN="menorah.me"
        WWW_DOMAIN="www.menorah.me"
        APP_DOMAIN="app.menorah.me"
        ADMIN_DOMAIN="admin.menorah.me"
        COUNSELLOR_DOMAIN="counsellor.menorah.me"
        API_IOS_DOMAIN="api-ios.menorah.me"
        API_ANDROID_DOMAIN="api-android.menorah.me"
        API_WEB_DOMAIN="api-web.menorah.me"
        API_ADMIN_DOMAIN="api-admin.menorah.me"
        CALLS_DOMAIN="calls.menorah.me"
        MENORAH_STAGING_ALLOWED_HOSTS="${ROOT_DOMAIN},${WWW_DOMAIN},${APP_DOMAIN},${ADMIN_DOMAIN},${COUNSELLOR_DOMAIN},${API_IOS_DOMAIN},${API_ANDROID_DOMAIN},${API_WEB_DOMAIN},${API_ADMIN_DOMAIN},${CALLS_DOMAIN}"
        LIVEKIT_URL="wss://${CALLS_DOMAIN}"
        LIVEKIT_API_URL="https://${CALLS_DOMAIN}"
        PASSWORD_RESET_BASE_URL="https://${APP_DOMAIN}"
        CHECKOUT_RETURN_URL="https://${APP_DOMAIN}/checkout/callback"
        MENORAH_STAGING_EMAIL_DOMAIN=""
        CONTACT_TO_EMAIL="menorahenquiries@gmail.com"
        EMAIL_FROM="Menorah Health <noreply@menorah.me>"
        FRONTEND_API_WEB_URL="https://${API_WEB_DOMAIN}/api"
        FRONTEND_API_ADMIN_URL="https://${API_ADMIN_DOMAIN}/api"
        FRONTEND_SOCKET_WEB_URL="https://${API_WEB_DOMAIN}"
        MEDIA_PUBLIC_BASE_URL="https://${API_WEB_DOMAIN}"
        ALLOWED_ORIGINS="https://${WWW_DOMAIN},https://${APP_DOMAIN},https://${ADMIN_DOMAIN},https://${COUNSELLOR_DOMAIN}"
        WEB_SESSION_ORIGINS="https://${WWW_DOMAIN}=user,https://${APP_DOMAIN}=user,https://${COUNSELLOR_DOMAIN}=counsellor,https://${ADMIN_DOMAIN}=admin"
        ;;
      alias)
        API_ANDROID_DOMAIN="${API_IOS_DOMAIN}"
        ;;
      staging-substring)
        MENORAH_STAGING_ALLOWED_HOSTS="${MENORAH_STAGING_ALLOWED_HOSTS/${API_IOS_DOMAIN}/api-ios-staging.example.com}"
        API_IOS_DOMAIN="api-ios-staging.example.com"
        ;;
      livekit-url) LIVEKIT_URL="wss://other.staging.example.com" ;;
      livekit-api-url) LIVEKIT_API_URL="https://other.staging.example.com" ;;
      checkout-return)
        if [[ "${deployment_environment}" == "staging" ]]; then
          CHECKOUT_RETURN_URL="https://app.menorah.me/checkout/callback"
        else
          CHECKOUT_RETURN_URL="https://app.staging.example.com/checkout/callback"
        fi
        ;;
      email-domain) MENORAH_STAGING_EMAIL_DOMAIN="mail.menorah.me" ;;
      email-contact) CONTACT_TO_EMAIL="menorahenquiries@gmail.com" ;;
      email-contact-display) CONTACT_TO_EMAIL="Menorah <contact@mail.staging.example.com>" ;;
      email-from) EMAIL_FROM="Menorah Health <noreply@menorah.me>" ;;
      frontend-web) FRONTEND_API_WEB_URL="https://${API_WEB_DOMAIN}" ;;
      frontend-admin) FRONTEND_API_ADMIN_URL="https://${API_WEB_DOMAIN}/api" ;;
      frontend-socket) FRONTEND_SOCKET_WEB_URL="https://${API_ADMIN_DOMAIN}" ;;
      media) MEDIA_PUBLIC_BASE_URL="https://media.staging.example.com" ;;
      allowed-origins)
        ALLOWED_ORIGINS="https://${WWW_DOMAIN},https://${APP_DOMAIN},https://${ADMIN_DOMAIN},https://app.menorah.me"
        ;;
      web-sessions)
        WEB_SESSION_ORIGINS="https://${WWW_DOMAIN}=user,https://${APP_DOMAIN}=user,https://${COUNSELLOR_DOMAIN}=counsellor,https://admin.menorah.me=admin"
        ;;
      razorpay) RAZORPAY_KEY_ID="rzp_live_A1b2C3d4E5f6G7" ;;
      razorpay-x) RAZORPAY_X_KEY_ID="rzp_live_A1b2C3d4E5f6G7" ;;
      razorpay-public) NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_live_A1b2C3d4E5f6G7" ;;
      *)
        fail "unknown release environment topology fixture: ${topology_variant}"
        ;;
    esac
    validate_release_environment
  )
}

test_release_environment_guards() {
  local script_path invalid_origin topology_variant
  local private_key_begin="-----BEGIN PRIVATE"" KEY-----"
  local private_key_end="-----END PRIVATE"" KEY-----"
  local complete_private_key="${private_key_begin}test-only${private_key_end}"
  local -a scripts=(
    "${REPO_ROOT}/deploy/ubuntu/update-from-git.sh"
    "${REPO_ROOT}/deploy/ubuntu/first-run.sh"
  )
  local -a invalid_staging_origins=(
    "https://app.menorah.me"
    "https://APP.MENORAH.ME"
    "https://app.staging.example.com."
    "https://app.staging.example.com:443"
    "https://app.staging.example.com/reset-password"
    "https://app.staging.example.com?source=test"
    "https://operator@app.staging.example.com"
    "https://app.staging.example.com#reset"
  )
  local -a invalid_staging_topologies=(
    unset
    production
    alias
    staging-substring
    livekit-url
    livekit-api-url
    checkout-return
    email-domain
    email-contact
    email-contact-display
    email-from
    frontend-web
    frontend-admin
    frontend-socket
    media
    allowed-origins
    web-sessions
    razorpay
    razorpay-x
    razorpay-public
  )

  for script_path in "${scripts[@]}"; do
    run_release_environment_validator \
      "${script_path}" "__default__" "https://app.menorah.me" "true" \
      "com.menorah.health.app" "A1B2C3D4E5" "F6G7H8I9J0" "${complete_private_key}" \
      || fail "$(basename "${script_path}") rejected the default production policy"

    if run_release_environment_validator \
      "${script_path}" "production" "https://app.staging.example.com" "true" \
      "com.menorah.health.app" "A1B2C3D4E5" "F6G7H8I9J0" "${complete_private_key}" \
      >/dev/null 2>&1; then
      fail "$(basename "${script_path}") changed the canonical production reset policy"
    fi
    if run_release_environment_validator \
      "${script_path}" "production" "https://app.menorah.me" "true" \
      "com.menorah.health.app" "A1B2C3D4E5" "F6G7H8I9J0" "${complete_private_key}" \
      "production" "" "checkout-return" >/dev/null 2>&1; then
      fail "$(basename "${script_path}") changed the canonical production checkout return policy"
    fi
    if run_release_environment_validator \
      "${script_path}" "production" "https://app.menorah.me" "false" \
      "com.menorah.health.app" "A1B2C3D4E5" "F6G7H8I9J0" "${complete_private_key}" \
      >/dev/null 2>&1; then
      fail "$(basename "${script_path}") allowed Apple sign-in to be disabled in production"
    fi

    run_release_environment_validator \
      "${script_path}" "staging" "https://app.staging.example.com" "false" \
      || fail "$(basename "${script_path}") rejected explicitly disabled staging Apple sign-in"
    run_release_environment_validator \
      "${script_path}" "staging" "https://app.staging.example.com" "true" \
      "com.menorah.health.staging" "A1B2C3D4E5" "F6G7H8I9J0" "${complete_private_key}" \
      || fail "$(basename "${script_path}") rejected complete staging Apple configuration"

    for topology_variant in "${invalid_staging_topologies[@]}"; do
      if run_release_environment_validator \
        "${script_path}" "staging" "https://app.staging.example.com" "false" \
        "" "" "" "" "production" "" "${topology_variant}" >/dev/null 2>&1; then
        fail "$(basename "${script_path}") accepted unsafe staging topology ${topology_variant}"
      fi
    done

    for invalid_origin in "${invalid_staging_origins[@]}"; do
      if run_release_environment_validator \
        "${script_path}" "staging" "${invalid_origin}" "false" >/dev/null 2>&1; then
        fail "$(basename "${script_path}") accepted unsafe staging reset origin ${invalid_origin}"
      fi
    done

    if run_release_environment_validator \
      "${script_path}" "staging" "https://app.staging.example.com" "true" \
      "com.menorah.health.staging" "A1B2C3D4E5" "" "${complete_private_key}" \
      >/dev/null 2>&1; then
      fail "$(basename "${script_path}") accepted incomplete staging Apple configuration"
    fi
    if run_release_environment_validator \
      "${script_path}" "staging" "https://app.staging.example.com" "" \
      >/dev/null 2>&1; then
      fail "$(basename "${script_path}") accepted an implicit staging Apple policy"
    fi
    if run_release_environment_validator \
      "${script_path}" "preview" "https://app.staging.example.com" "false" \
      >/dev/null 2>&1; then
      fail "$(basename "${script_path}") accepted an unsupported deployment environment"
    fi
    if run_release_environment_validator \
      "${script_path}" "staging" "https://app.staging.example.com" "false" \
      "" "" "" "" "development" >/dev/null 2>&1; then
      fail "$(basename "${script_path}") allowed staging without NODE_ENV=production"
    fi
  done
}

test_first_run_requires_literal_confirmation() {
  local output

  if output="$(DEPLOY_BRANCH=release/test \
    DEPLOY_RELEASE_SHA=0000000000000000000000000000000000000000 \
    "${REPO_ROOT}/deploy/ubuntu/first-run.sh" 2>&1)"; then
    fail "bootstrap unexpectedly proceeded without literal empty-host confirmation"
  fi
  grep -F "MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST" <<< "${output}" >/dev/null \
    || fail "bootstrap did not explain its literal confirmation requirement"
}

test_first_run_rejects_abbreviated_sha() {
  local output

  if output="$(MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST \
    DEPLOY_BRANCH=release/test \
    DEPLOY_RELEASE_SHA=abc123 \
    "${REPO_ROOT}/deploy/ubuntu/first-run.sh" 2>&1)"; then
    fail "bootstrap unexpectedly accepted an abbreviated release SHA"
  fi
  grep -F "full 40-character commit SHA" <<< "${output}" >/dev/null \
    || fail "bootstrap did not explain the full-SHA requirement"
}

test_first_run_rejects_partial_bootstrap_state() {
  local state_dir="${TMP_ROOT}/partial-bootstrap-state"
  local output

  mkdir -p "${state_dir}"
  printf '%s\n' "0000000000000000000000000000000000000000" \
    > "${state_dir}/bootstrap-in-progress-sha"
  if output="$(MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST \
    MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    DEPLOY_BRANCH=release/test \
    DEPLOY_RELEASE_SHA=0000000000000000000000000000000000000000 \
    "${REPO_ROOT}/deploy/ubuntu/first-run.sh" 2>&1)"; then
    fail "bootstrap unexpectedly proceeded with partial bootstrap state"
  fi
  grep -F "Deployment state already exists" <<< "${output}" >/dev/null \
    || fail "bootstrap did not explain the partial-state refusal"
}

test_first_run_rejects_dangling_release_state() {
  local state_dir="${TMP_ROOT}/dangling-bootstrap-state"
  local output

  mkdir -p "${state_dir}"
  ln -s "${state_dir}/missing-current-target" "${state_dir}/current-sha"
  if output="$(MENORAH_FIRST_RUN_CONFIRM=BOOTSTRAP_EMPTY_HOST \
    MENORAH_DEPLOY_STATE_ROOT="${state_dir}" \
    DEPLOY_BRANCH=release/test \
    DEPLOY_RELEASE_SHA=0000000000000000000000000000000000000000 \
    "${REPO_ROOT}/deploy/ubuntu/first-run.sh" 2>&1)"; then
    fail "bootstrap unexpectedly ignored dangling deployment state"
  fi
  grep -F "Deployment state already exists" <<< "${output}" >/dev/null \
    || fail "bootstrap did not fail closed on dangling deployment state"
}

test_backup_runs_as_host_user
test_backup_rejects_database_scoped_oplog_uri
test_post_migration_rollback_is_blocked
test_corrupt_migration_marker_is_rejected
test_empty_and_symlinked_migration_markers_are_rejected
test_dangling_recovery_marker_blocks_rollback
test_partial_migration_rollback_is_blocked
test_partial_identity_reconciliation_rollback_is_blocked
test_interrupted_release_rollback_uses_current_artifacts
test_recorded_migration_refuses_tag_drift
test_mongo_tool_credentials_stay_out_of_argv
test_media_verifier_credentials_stay_out_of_compose_argv
test_production_smoke_credentials_stay_out_of_docker_argv
test_interrupted_rollback_reuses_durable_target
test_release_state_marker_ordering
test_resume_accepts_proven_applied_interruption
test_release_environment_guards
test_first_run_requires_literal_confirmation
test_first_run_rejects_abbreviated_sha
test_first_run_rejects_partial_bootstrap_state
test_first_run_rejects_dangling_release_state
echo "Release script safety tests passed."
