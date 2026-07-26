#!/usr/bin/env bash
set -euo pipefail
umask 077

CONFIRMATION="${MENORAH_MEDIA_MIGRATION_CONFIRM:-}"
RELEASE_SHA="${MENORAH_MEDIA_MIGRATION_RELEASE_SHA:-}"
DATA_ROOT="${MENORAH_DATA_ROOT:-/opt/menorah/data}"
UPLOAD_ROOT="${DATA_ROOT}/uploads"
EVIDENCE_PATH="${MENORAH_MEDIA_MIGRATION_EVIDENCE:-}"
MEDIA_GROUP_ID="${MENORAH_MEDIA_GROUP_ID:-}"
LEGACY_NAMES=(api-ios api-android api-web api-admin worker)

fail() {
  echo "Legacy media consolidation failed: $*" >&2
  exit 1
}

[[ "${CONFIRMATION}" == "CONSOLIDATE_LEGACY_MEDIA_WITH_WRITERS_STOPPED" ]] \
  || fail "MENORAH_MEDIA_MIGRATION_CONFIRM must attest that every writer is stopped"
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] \
  || fail "MENORAH_MEDIA_MIGRATION_RELEASE_SHA must be the reviewed full commit SHA"
[[ "${UPLOAD_ROOT}" == /* && -d "${UPLOAD_ROOT}" && ! -L "${UPLOAD_ROOT}" ]] \
  || fail "the canonical uploads directory must be an existing absolute non-symlink directory"
[[ "${EVIDENCE_PATH}" == /* ]] \
  || fail "MENORAH_MEDIA_MIGRATION_EVIDENCE must be an absolute path"
[[ "${MEDIA_GROUP_ID}" =~ ^[1-9][0-9]*$ \
  && "$(stat -c '%u:%g:%a' "${UPLOAD_ROOT}")" == "100:${MEDIA_GROUP_ID}:2770" ]] \
  || fail "the canonical uploads directory must be uid 100, the media gid, and mode 2770"

upload_resolved="$(realpath -e -- "${UPLOAD_ROOT}")"
upload_lexical="$(realpath -ms -- "${UPLOAD_ROOT}")"
[[ "${upload_resolved}" == "${upload_lexical}" ]] \
  || fail "the canonical uploads path contains a symlinked component"

validate_canonical_directory() {
  local directory="$1"
  local resolved lexical

  [[ -d "${directory}" && ! -L "${directory}" ]] \
    || fail "a canonical media parent is not a regular directory"
  resolved="$(realpath -e -- "${directory}")"
  lexical="$(realpath -ms -- "${directory}")"
  [[ "${resolved}" == "${lexical}" ]] \
    || fail "a canonical media parent contains a symlinked component"
  case "${resolved}/" in
    "${upload_resolved}/"*) ;;
    *) fail "a canonical media parent escaped the uploads root" ;;
  esac
  [[ "$(stat -c '%g:%a' "${directory}")" == "${MEDIA_GROUP_ID}:2770" ]] \
    || fail "a canonical media parent lacks exact setgid media-group access"
}

validate_existing_canonical_file() {
  local target="$1"
  local resolved lexical

  [[ -f "${target}" && ! -L "${target}" ]] \
    || fail "a canonical destination collision is not a regular file"
  resolved="$(realpath -e -- "${target}")"
  lexical="$(realpath -ms -- "${target}")"
  [[ "${resolved}" == "${lexical}" ]] \
    || fail "a canonical destination contains a symlinked path component"
  case "${resolved}" in
    "${upload_resolved}/"*) ;;
    *) fail "a canonical destination escaped the uploads root" ;;
  esac
  [[ "$(stat -c '%g:%a' "${target}")" == "${MEDIA_GROUP_ID}:640" ]] \
    || fail "an existing canonical file lacks exact media-group read access"
}

preflight_canonical_parent_chain() {
  local relative_path="$1"
  local relative_parent current_parent component
  local -a parent_components=()

  relative_parent="$(dirname -- "${relative_path}")"
  current_parent="${UPLOAD_ROOT}"
  if [[ "${relative_parent}" == "." ]]; then
    return 0
  fi
  IFS='/' read -r -a parent_components <<< "${relative_parent}"
  for component in "${parent_components[@]}"; do
    [[ -n "${component}" && "${component}" != "." && "${component}" != ".." ]] \
      || fail "a canonical media path contains an unsafe directory component"
    current_parent="${current_parent}/${component}"
    if [[ -e "${current_parent}" || -L "${current_parent}" ]]; then
      validate_canonical_directory "${current_parent}"
    fi
  done
}

evidence_parent="$(dirname -- "${EVIDENCE_PATH}")"
[[ -d "${evidence_parent}" && ! -L "${evidence_parent}" ]] \
  || fail "the evidence parent must be an existing non-symlink directory"
evidence_parent_resolved="$(realpath -e -- "${evidence_parent}")"
evidence_parent_lexical="$(realpath -ms -- "${evidence_parent}")"
[[ "${evidence_parent_resolved}" == "${evidence_parent_lexical}" ]] \
  || fail "the evidence parent contains a symlinked component"

scan_temporary=""
manifest_temporary=""
records_temporary=""
checksum_temporary=""
cleanup() {
  rm -f -- \
    "${scan_temporary:-}" \
    "${manifest_temporary:-}" \
    "${records_temporary:-}" \
    "${checksum_temporary:-}"
}
trap cleanup EXIT

declare -A selected_sources=()
legacy_file_count=0
duplicate_count=0

# Phase one is read-only. It detects every unsafe node and byte-level collision
# before the first canonical file is created.
for legacy_name in "${LEGACY_NAMES[@]}"; do
  legacy_root="${UPLOAD_ROOT}/${legacy_name}"
  [[ -e "${legacy_root}" ]] || continue
  [[ -d "${legacy_root}" && ! -L "${legacy_root}" ]] \
    || fail "a legacy media root is not a regular directory"
  legacy_resolved="$(realpath -e -- "${legacy_root}")"
  legacy_lexical="$(realpath -ms -- "${legacy_root}")"
  [[ "${legacy_resolved}" == "${legacy_lexical}" ]] \
    || fail "a legacy media root contains a symlinked component"
  scan_temporary="$(mktemp "${evidence_parent}/.media-scan.XXXXXX")"
  if ! find -P "${legacy_root}" -mindepth 1 \
    \( -type l -o \( ! -type d ! -type f \) \) -print0 > "${scan_temporary}"; then
    fail "legacy media traversal failed while checking filesystem node types"
  fi
  if [[ -s "${scan_temporary}" ]]; then
    fail "legacy media contains a symlink or non-regular filesystem node"
  fi
  : > "${scan_temporary}"
  if ! find -P "${legacy_root}" -type f -print0 > "${scan_temporary}"; then
    fail "legacy media traversal failed while enumerating files"
  fi

  while IFS= read -r -d '' source_path; do
    relative_path="${source_path#"${legacy_root}/"}"
    [[ -n "${relative_path}" && "${relative_path}" != "${source_path}" ]] \
      || fail "could not derive a safe legacy relative path"
    [[ "${relative_path}" != *$'\n'* && "${relative_path}" != *$'\r'* \
      && "${relative_path}" != *$'\t'* && "${relative_path}" != *'|'* ]] \
      || fail "legacy media contains a path that cannot be represented safely in evidence"
    target_path="${UPLOAD_ROOT}/${relative_path}"
    preflight_canonical_parent_chain "${relative_path}"
    if [[ -n "${selected_sources["${relative_path}"]:-}" ]]; then
      cmp -s -- "${selected_sources["${relative_path}"]}" "${source_path}" \
        || fail "different legacy files resolve to the same canonical object key"
      duplicate_count=$((duplicate_count + 1))
    else
      selected_sources["${relative_path}"]="${source_path}"
    fi
    if [[ -e "${target_path}" || -L "${target_path}" ]]; then
      validate_existing_canonical_file "${target_path}"
      cmp -s -- "${source_path}" "${target_path}" \
        || fail "a canonical destination contains different bytes for a legacy object key"
    fi
    legacy_file_count=$((legacy_file_count + 1))
  done < "${scan_temporary}"
  rm -f -- "${scan_temporary}"
  scan_temporary=""
done

# Phase two copies only preflighted files. Old per-service files are retained so
# a pre-migration predecessor rollback can still read its original namespace.
copied_count=0
for relative_path in "${!selected_sources[@]}"; do
  source_path="${selected_sources["${relative_path}"]}"
  target_path="${UPLOAD_ROOT}/${relative_path}"
  if [[ -f "${target_path}" && ! -L "${target_path}" ]]; then
    cmp -s -- "${source_path}" "${target_path}" \
      || fail "canonical media changed after preflight"
    validate_existing_canonical_file "${target_path}"
    continue
  fi
  target_parent="$(dirname -- "${target_path}")"
  relative_parent="$(dirname -- "${relative_path}")"
  current_parent="${UPLOAD_ROOT}"
  if [[ "${relative_parent}" != "." ]]; then
    IFS='/' read -r -a parent_components <<< "${relative_parent}"
    for component in "${parent_components[@]}"; do
      [[ -n "${component}" && "${component}" != "." && "${component}" != ".." ]] \
        || fail "a canonical media path contains an unsafe directory component"
      current_parent="${current_parent}/${component}"
      if [[ ! -e "${current_parent}" ]]; then
        mkdir -- "${current_parent}"
        chmod 2770 "${current_parent}"
      fi
      validate_canonical_directory "${current_parent}"
    done
  fi
  target_parent_resolved="$(realpath -e -- "${target_parent}")"
  case "${target_parent_resolved}/" in
    "${upload_resolved}/"*) ;;
    *) fail "a canonical media parent escaped the uploads root" ;;
  esac
  temporary_target="$(mktemp "${target_parent}/.menorah-media.XXXXXX")"
  cp --preserve=mode,timestamps -- "${source_path}" "${temporary_target}"
  chmod 0640 "${temporary_target}"
  mv -n -- "${temporary_target}" "${target_path}"
  [[ ! -e "${temporary_target}" ]] || rm -f -- "${temporary_target}"
  validate_existing_canonical_file "${target_path}"
  cmp -s -- "${source_path}" "${target_path}" \
    || fail "canonical media copy failed byte verification"
  copied_count=$((copied_count + 1))
done

manifest_temporary="$(mktemp "${evidence_parent}/.media-manifest.XXXXXX")"
records_temporary="$(mktemp "${evidence_parent}/.media-records.XXXXXX")"

for relative_path in "${!selected_sources[@]}"; do
  target_path="${UPLOAD_ROOT}/${relative_path}"
  digest="$(sha256sum -- "${target_path}" | awk '{print $1}')"
  size="$(stat -c '%s' -- "${target_path}")"
  printf '%s|%s|%s\n' "${digest}" "${size}" "${relative_path}" >> "${records_temporary}"
done
LC_ALL=C sort -o "${records_temporary}" "${records_temporary}"
{
  printf 'schema=1\n'
  printf 'releaseSha=%s\n' "${RELEASE_SHA}"
  printf 'legacyCopiesRetained=true\n'
  printf 'uniqueObjects=%s\n' "${#selected_sources[@]}"
  printf '%s\n' 'sha256|bytes|relativePath'
  cat "${records_temporary}"
} > "${manifest_temporary}"
chmod 0600 "${manifest_temporary}"
mv -f -- "${manifest_temporary}" "${EVIDENCE_PATH}"
evidence_digest="$(sha256sum "${EVIDENCE_PATH}" | awk '{print $1}')"
checksum_temporary="$(mktemp "${evidence_parent}/.media-manifest-sha.XXXXXX")"
printf '%s  %s\n' "${evidence_digest}" "$(basename "${EVIDENCE_PATH}")" > "${checksum_temporary}"
chmod 0600 "${checksum_temporary}"
mv -f -- "${checksum_temporary}" "${EVIDENCE_PATH}.sha256"
trap - EXIT
cleanup

echo "Legacy media consolidation verified: ${legacy_file_count} source files, ${#selected_sources[@]} unique objects, ${duplicate_count} identical duplicates, ${copied_count} copies."
