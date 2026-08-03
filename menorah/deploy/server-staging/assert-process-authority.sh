#!/usr/bin/env bash

# Source this file only from the exact server-staging checkout. It rejects
# caller-controlled Docker, BuildKit, Compose, and Git routing. The one allowed
# process-level control is the exact reviewed Compose project identity.
server_staging_assert_process_authority() {
  local expected_project="$1" authority_key
  if [[ "${COMPOSE_PROJECT_NAME-}" != "${expected_project}" ]]; then
    printf '%s\n' \
      'Server-staging process authority rejected: unexpected Compose project.' \
      >&2
    return 1
  fi
  for authority_key in \
    ${!DOCKER_@} \
    ${!BUILDKIT_@} \
    ${!BUILDX_@} \
    ${!COMPOSE_@} \
    ${!GIT_@}
  do
    if [[ "${authority_key}" == 'COMPOSE_PROJECT_NAME' ]]; then
      continue
    fi
    printf '%s\n' \
      "Server-staging process authority rejected: ${authority_key} is set." \
      >&2
    return 1
  done
}
