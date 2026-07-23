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
  mkdir -p "${mock_bin}" "${backup_root}" "${data_root}"

  cat > "${env_file}" <<EOF
NODE_ENV=test
MENORAH_BACKUP_ROOT=${backup_root}
MENORAH_DATA_ROOT=${data_root}
BACKUP_REQUIRE_MOUNT=false
BACKUP_REQUIRE_ENCRYPTION=false
BACKUP_PRUNE_AFTER_SUCCESS=false
MONGODB_BACKUP_URI=mongodb://backup.invalid/menorah
EOF

  cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "${MOCK_DOCKER_LOG}"
printf '\n' >> "${MOCK_DOCKER_LOG}"
if [[ " $* " == *" run "* ]]; then
  command_text="$*"
  if [[ "${command_text}" =~ --archive=\"/backups/([^\"]+)\" ]]; then
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

test_backup_runs_as_host_user
test_post_migration_rollback_is_blocked
test_partial_migration_rollback_is_blocked
echo "Release script safety tests passed."
