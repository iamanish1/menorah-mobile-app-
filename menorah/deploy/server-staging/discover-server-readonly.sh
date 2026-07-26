#!/usr/bin/env bash
set -uo pipefail

# This script is intentionally inspection-only. It emits allow-listed metadata
# to stdout, suppresses command diagnostics, never reads environment values,
# and never creates a file or directory.
exec 2>/dev/null
export LC_ALL=C

# The reviewed Ubuntu command supplies a clean environment, and the script
# independently constrains executable lookup before invoking any producer.
readonly DISCOVERY_EXECUTABLE_PATH='/usr/sbin:/usr/bin:/sbin:/bin'
export PATH="${DISCOVERY_EXECUTABLE_PATH}"
hash -r

# A non-interactive Bash may import exported functions before reading stdin.
# Remove every caller-defined function before declaring this script's helpers.
INHERITED_FUNCTION_NAMES=()
mapfile -t INHERITED_FUNCTION_NAMES < <(compgen -A function || :)
for inherited_function_name in "${INHERITED_FUNCTION_NAMES[@]}"; do
  unset -f "${inherited_function_name}"
done
unset INHERITED_FUNCTION_NAMES inherited_function_name
unset BASH_ENV ENV CDPATH GLOBIGNORE

DISCOVERY_INCOMPLETE=0
COMPLETION_EMITTED=0

section() {
  printf '\n[%s]\n' "$1"
}

mark_incomplete() {
  DISCOVERY_INCOMPLETE=1
  printf 'producer=%s|status=unavailable|exit=%s\n' "$1" "$2"
}

finish_on_exit() {
  local exit_status=$?

  trap - EXIT
  if (( COMPLETION_EMITTED == 0 )); then
    section 'completion'
    printf '%s\n' 'discovery=incomplete'
    if (( exit_status == 0 )); then
      exit_status=1
    fi
  fi
  exit "${exit_status}"
}
trap finish_on_exit EXIT

sanitize_metadata() {
  sed -E \
    -e 's#(://[^:/@|[:space:]]+:)[^/@|[:space:]]+@#\1[REDACTED]@#g' \
    -e 's#(//[^/:@|[:space:]]+:)[^/@|[:space:]]+@#\1[REDACTED]@#g' \
    -e 's#([[:alnum:]_.-]*(password|passwd|pwd|secret|token|credential|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)[[:alnum:]_.-]*[[:space:]]*[=:][[:space:]]*)[^|,;[:space:]]+#\1[REDACTED]#Ig' \
    -e 's#(/[^/|[:space:]]*(password|passwd|secret|token|credential)[^/|[:space:]]*/)[^/|[:space:]]+#\1[REDACTED]#Ig' \
    -e 's#(/[^/|[:space:]]*(password|passwd|secret|token|credential)[^/|[:space:]]*)#/[REDACTED]#Ig'
}

emit_sanitized() {
  local input=$1
  local sanitized_output
  local sanitize_status

  sanitized_output="$(printf '%s\n' "${input}" | sanitize_metadata)"
  sanitize_status=$?
  if (( sanitize_status != 0 )); then
    mark_incomplete 'metadata-sanitizer' "${sanitize_status}"
    return 0
  fi
  printf '%s\n' "${sanitized_output}"
}

emit_or_none() {
  local input=$1
  local empty_record=$2

  if [[ -n "${input}" ]]; then
    emit_sanitized "${input}"
  else
    printf '%s\n' "${empty_record}"
  fi
}

capture_command() {
  local destination=$1
  local producer=$2
  local captured_output
  local producer_status
  shift 2

  captured_output="$("$@")"
  producer_status=$?
  printf -v "${destination}" '%s' "${captured_output}"
  if (( producer_status != 0 )); then
    mark_incomplete "${producer}" "${producer_status}"
  fi
  return 0
}

# systemctl communicates with PID 1 over D-Bus. Keep a genuine systemd/D-Bus
# outage nonfatal to the remaining inspection, but fail the overall discovery
# closed once with a reason instead of treating every unavailable unit as an
# invalid name.
capture_systemd_unit_list() {
  local destination=$1
  local captured_output
  local producer_status

  captured_output="$(
    systemctl list-unit-files \
      --type=service \
      --type=timer \
      --no-legend \
      --no-pager
  )"
  producer_status=$?
  printf -v "${destination}" '%s' "${captured_output}"
  if (( producer_status != 0 )); then
    DISCOVERY_INCOMPLETE=1
    printf '%s\n' \
      "producer=systemd-unit-list|status=unavailable|reason=systemd-or-dbus-unavailable|exit=${producer_status}"
  fi
  return 0
}

# Caller-controlled Docker and Compose variables must not select a remote
# daemon, context, TLS endpoint, config directory, or alternate Compose model.
CALLER_AUTHORITY_NAMES=()
mapfile -t CALLER_AUTHORITY_NAMES < <(
  compgen -A variable DOCKER_ || :
  compgen -A variable COMPOSE_ || :
)
for caller_authority_name in "${CALLER_AUTHORITY_NAMES[@]}"; do
  unset "${caller_authority_name}"
done
unset CALLER_AUTHORITY_NAMES caller_authority_name

readonly LOCAL_DOCKER_HOST='unix:///var/run/docker.sock'
export DOCKER_HOST="${LOCAL_DOCKER_HOST}"
unset DOCKER_CONTEXT

readonly PRODUCTION_REPOSITORY_ROOT='/opt/menorah/menorah'

declare -A DISCOVERED_INGRESS_FILES=()
declare -a DISCOVERED_INGRESS_FILE_ORDER=()

record_ingress_file() {
  local ingress_path=$1

  if [[ -z "${DISCOVERED_INGRESS_FILES[${ingress_path}]+x}" ]]; then
    DISCOVERED_INGRESS_FILES["${ingress_path}"]=1
    DISCOVERED_INGRESS_FILE_ORDER+=("${ingress_path}")
  fi
}

# Only add bind mounts that are known ingress configuration locations in the
# reviewed production repository. This permits Caddy's active host source to
# be inspected by metadata while avoiding arbitrary bind mounts and secrets.
record_ingress_mount_sources() {
  local mount_lines=$1
  local mount_line
  local mount_container
  local mount_type
  local mount_name
  local mount_source
  local mount_destination
  local mount_rw
  local mount_extra

  while IFS= read -r mount_line; do
    [[ -n "${mount_line}" ]] || continue
    IFS='|' read -r \
      mount_container \
      mount_type \
      mount_name \
      mount_source \
      mount_destination \
      mount_rw \
      mount_extra <<< "${mount_line}"
    [[ -z "${mount_extra}" ]] || continue
    [[ "${mount_container}" == container=* ]] || continue
    [[ "${mount_type}" == 'mount_type=bind' ]] || continue
    [[ "${mount_name}" == mount_name=* ]] || continue
    [[ "${mount_source}" == source=/* ]] || continue
    [[ "${mount_destination}" == destination=* ]] || continue
    [[ "${mount_rw}" == 'rw=true' || "${mount_rw}" == 'rw=false' ]] || continue

    mount_source=${mount_source#source=}
    mount_destination=${mount_destination#destination=}
    case "${mount_destination}" in
      /etc/caddy/Caddyfile)
        case "${mount_source}" in
          "${PRODUCTION_REPOSITORY_ROOT}"/deploy/caddy/Caddyfile|\
          "${PRODUCTION_REPOSITORY_ROOT}"/deploy/caddy/Caddyfile.production)
            record_ingress_file "${mount_source}"
            ;;
        esac
        ;;
      /etc/cloudflared/config.yml|/etc/cloudflared/config.yaml)
        case "${mount_source}" in
          "${PRODUCTION_REPOSITORY_ROOT}"/deploy/cloudflare/tunnel-config.yml)
            record_ingress_file "${mount_source}"
            ;;
        esac
        ;;
    esac
  done <<< "${mount_lines}"
}

for reviewed_ingress_file in \
  /etc/caddy/Caddyfile \
  /etc/cloudflared/config.yml \
  /etc/cloudflared/config.yaml \
  "${PRODUCTION_REPOSITORY_ROOT}"/deploy/caddy/Caddyfile \
  "${PRODUCTION_REPOSITORY_ROOT}"/deploy/caddy/Caddyfile.production \
  "${PRODUCTION_REPOSITORY_ROOT}"/deploy/cloudflare/ingress-manifest.json \
  "${PRODUCTION_REPOSITORY_ROOT}"/deploy/cloudflare/tunnel-config.yml
do
  record_ingress_file "${reviewed_ingress_file}"
done
unset reviewed_ingress_file

local_docker() {
  command docker --host "${LOCAL_DOCKER_HOST}" "$@"
}

section 'discovery-contract'
printf '%s\n' 'schema=menorah-server-discovery-v1'
printf '%s\n' 'mode=read-only-allow-listed-metadata'
printf '%s\n' 'docker-authority=local-system-daemon'
printf '%s\n' 'secret-values=omitted-or-redacted'
printf '%s\n' 'database-content=not-inspected'
printf '%s\n' 'log-content=not-inspected'

section 'host'
host_output=''
capture_command host_output 'hostname' hostname
emit_or_none "hostname=${host_output}" 'hostname=unavailable'

kernel_output=''
capture_command kernel_output 'kernel' uname -srm
emit_or_none "kernel=${kernel_output}" 'kernel=unavailable'

if [[ -r /etc/os-release ]]; then
  os_release_output=''
  # shellcheck disable=SC2016
  capture_command os_release_output 'os-release' awk -F= '
    $1 == "ID" || $1 == "VERSION_ID" {
      gsub(/^"|"$/, "", $2);
      printf "%s=%s\n", tolower($1), $2
    }
  ' /etc/os-release
  emit_or_none "${os_release_output}" 'os-release=unavailable'
else
  mark_incomplete 'os-release' 66
fi

cpu_output=''
capture_command cpu_output 'logical-cpu-count' nproc
emit_or_none "logical_cpu_count=${cpu_output}" 'logical_cpu_count=unavailable'

if [[ -r /proc/meminfo ]]; then
  memory_output=''
  # shellcheck disable=SC2016
  capture_command memory_output 'memory-metadata' awk '
    $1 == "MemTotal:" { print "memory_total_kib=" $2 }
    $1 == "MemAvailable:" { print "memory_available_kib=" $2 }
  ' /proc/meminfo
  emit_or_none "${memory_output}" 'memory=unavailable'
else
  mark_incomplete 'memory-metadata' 66
fi

section 'host-ipv4-addresses'
ipv4_output=''
capture_command ipv4_output 'host-ipv4-addresses' ip -o -4 address show
emit_or_none "${ipv4_output}" 'ipv4-addresses=unavailable'

section 'host-ipv4-routes'
route_output=''
capture_command route_output 'host-ipv4-routes' ip -4 route show table all
emit_or_none "${route_output}" 'ipv4-routes=unavailable'

section 'disk-filesystems'
disk_output=''
capture_command disk_output 'disk-filesystems' df -PT
emit_or_none "${disk_output}" 'disk-filesystems=unavailable'

section 'mounts'
mount_output=''
capture_command mount_output 'mounts' findmnt -rn -o TARGET,SOURCE,FSTYPE
emit_or_none "${mount_output}" 'mounts=unavailable'

section 'reviewed-root-metadata'
for reviewed_root in \
  /opt/menorah \
  /opt/menorah/data \
  /opt/menorah/backups \
  /opt/menorah/deploy-state \
  "${PRODUCTION_REPOSITORY_ROOT}" \
  "${PRODUCTION_REPOSITORY_ROOT}"/deploy \
  "${PRODUCTION_REPOSITORY_ROOT}"/deploy/caddy \
  "${PRODUCTION_REPOSITORY_ROOT}"/deploy/cloudflare \
  /opt/menorah-staging \
  /opt/menorah-staging/data \
  /opt/menorah-staging/backups \
  /opt/menorah-staging/deploy-state \
  /opt/menorah-staging/logs \
  /opt/menorah-staging/env \
  /opt/menorah-staging/app
do
  if [[ -e "${reviewed_root}" || -L "${reviewed_root}" ]]; then
    root_stat_output=''
    capture_command root_stat_output 'reviewed-root-stat' \
      stat -c 'path=%n|type=%F|mode=%a|owner=%u:%g' -- "${reviewed_root}"
    emit_or_none "${root_stat_output}" \
      "path=${reviewed_root}|metadata=unavailable"

    root_resolved_output=''
    capture_command root_resolved_output 'reviewed-root-resolution' \
      readlink -f -- "${reviewed_root}"
    if [[ -n "${root_resolved_output}" ]]; then
      emit_sanitized "path=${reviewed_root}|resolved=${root_resolved_output}"
    else
      printf 'path=%s|resolved=unavailable\n' "${reviewed_root}"
    fi

    root_mount_output=''
    capture_command root_mount_output 'reviewed-root-mount' \
      findmnt -rn -T "${reviewed_root}" -o TARGET,SOURCE,FSTYPE
    if [[ -n "${root_mount_output}" ]]; then
      emit_sanitized "path=${reviewed_root}|mount=${root_mount_output}"
    else
      printf 'path=%s|mount=unavailable\n' "${reviewed_root}"
    fi
  else
    printf 'path=%s|state=absent\n' "${reviewed_root}"
  fi
done

section 'docker-daemon-authority'
if [[ -S /var/run/docker.sock ]]; then
  docker_socket_output=''
  capture_command docker_socket_output 'docker-socket-metadata' \
    stat -c 'path=%n|type=%F|mode=%a|owner=%u:%g' -- /var/run/docker.sock
  emit_or_none "${docker_socket_output}" 'docker-socket=unavailable'
else
  mark_incomplete 'docker-system-socket' 69
fi

section 'docker-version'
docker_version_output=''
capture_command docker_version_output 'docker-version' \
  local_docker version \
  --format 'client={{.Client.Version}}|server={{.Server.Version}}'
emit_or_none "${docker_version_output}" 'docker-version=unavailable'

compose_version_output=''
capture_command compose_version_output 'docker-compose-version' \
  local_docker compose version
emit_or_none "${compose_version_output}" 'docker-compose-version=unavailable'

section 'docker-security-mode'
docker_security_options_output=''
capture_command \
  docker_security_options_output \
  'docker-security-options' \
  local_docker info \
  --format '{{range .SecurityOptions}}{{println .}}{{end}}'
docker_rootless=false
docker_userns=false
docker_seccomp=false
docker_apparmor=false
docker_selinux=false
while IFS= read -r docker_security_option; do
  case "${docker_security_option}" in
    name=rootless) docker_rootless=true ;;
    name=userns) docker_userns=true ;;
    name=seccomp,profile=*) docker_seccomp=true ;;
    name=apparmor) docker_apparmor=true ;;
    name=selinux) docker_selinux=true ;;
    *) ;;
  esac
done <<< "${docker_security_options_output}"
printf '%s\n' \
  "rootless=${docker_rootless}" \
  "userns_remap=${docker_userns}" \
  "seccomp=${docker_seccomp}" \
  "apparmor=${docker_apparmor}" \
  "selinux=${docker_selinux}"
unset \
  docker_security_options_output \
  docker_security_option \
  docker_rootless \
  docker_userns \
  docker_seccomp \
  docker_apparmor \
  docker_selinux

section 'docker-compose-projects'
container_project_output=''
capture_command container_project_output 'docker-projects-from-containers' \
  local_docker ps -a \
  --format '{{.Label "com.docker.compose.project"}}'

network_project_output=''
capture_command network_project_output 'docker-projects-from-networks' \
  local_docker network ls \
  --format '{{.Label "com.docker.compose.project"}}'

volume_project_output=''
capture_command volume_project_output 'docker-projects-from-volumes' \
  local_docker volume ls \
  --format '{{.Label "com.docker.compose.project"}}'

declare -A DISCOVERED_PROJECTS=()
record_projects() {
  local project_lines=$1
  local project_source=$2
  local project_name
  local previous_sources

  while IFS= read -r project_name; do
    [[ -n "${project_name}" ]] || continue
    if [[ ! "${project_name}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
      mark_incomplete 'docker-project-label-validation' 65
      continue
    fi
    previous_sources="${DISCOVERED_PROJECTS[${project_name}]-}"
    if [[ -z "${previous_sources}" ]]; then
      DISCOVERED_PROJECTS["${project_name}"]="${project_source}"
    elif [[ ",${previous_sources}," != *",${project_source},"* ]]; then
      DISCOVERED_PROJECTS["${project_name}"]="${previous_sources},${project_source}"
    fi
  done <<< "${project_lines}"
}
record_projects "${container_project_output}" 'container'
record_projects "${network_project_output}" 'network'
record_projects "${volume_project_output}" 'volume'

if (( ${#DISCOVERED_PROJECTS[@]} == 0 )); then
  printf '%s\n' 'project=none'
else
  for project_name in "${!DISCOVERED_PROJECTS[@]}"; do
    emit_sanitized \
      "project=${project_name}|sources=${DISCOVERED_PROJECTS[${project_name}]}"
  done
fi
unset DISCOVERED_PROJECTS project_name

section 'docker-containers'
container_output=''
capture_command container_output 'docker-containers' \
  local_docker ps -a \
  --format 'name={{.Names}}|image={{.Image}}|status={{.Status}}|project={{.Label "com.docker.compose.project"}}|service={{.Label "com.docker.compose.service"}}'
emit_or_none "${container_output}" 'containers=none-or-unavailable'

section 'docker-published-ports'
published_port_output=''
capture_command published_port_output 'docker-published-ports' \
  local_docker ps -a --format 'name={{.Names}}|ports={{.Ports}}'
emit_or_none "${published_port_output}" 'published-ports=none-or-unavailable'

section 'docker-container-isolation-metadata'
container_id_output=''
capture_command container_id_output 'docker-container-identifiers' \
  local_docker ps -aq
while IFS= read -r container_id; do
  [[ "${container_id}" =~ ^[0-9a-f]{12,64}$ ]] || {
    if [[ -n "${container_id}" ]]; then
      mark_incomplete 'docker-container-identifier-validation' 65
    fi
    continue
  }

  container_isolation_output=''
  capture_command container_isolation_output 'docker-container-isolation' \
    local_docker inspect \
    --format 'name={{.Name}}|project={{index .Config.Labels "com.docker.compose.project"}}|service={{index .Config.Labels "com.docker.compose.service"}}|restart={{.HostConfig.RestartPolicy.Name}}|memory_bytes={{.HostConfig.Memory}}|nano_cpus={{.HostConfig.NanoCpus}}|pids_limit={{.HostConfig.PidsLimit}}|read_only={{.HostConfig.ReadonlyRootfs}}|privileged={{.HostConfig.Privileged}}|network_mode={{.HostConfig.NetworkMode}}|pid_mode={{.HostConfig.PidMode}}|ipc_mode={{.HostConfig.IpcMode}}' \
    "${container_id}"
  emit_or_none "${container_isolation_output}" \
    'container-isolation=unavailable'

  container_mount_output=''
  capture_command container_mount_output 'docker-container-mounts' \
    local_docker inspect \
    --format '{{range .Mounts}}container={{$.Name}}|mount_type={{.Type}}|mount_name={{.Name}}|source={{.Source}}|destination={{.Destination}}|rw={{.RW}}{{println}}{{end}}' \
    "${container_id}"
  emit_or_none "${container_mount_output}" 'container-mounts=none-or-unavailable'
  record_ingress_mount_sources "${container_mount_output}"
done <<< "${container_id_output}"

section 'docker-networks'
network_list_output=''
capture_command network_list_output 'docker-network-list' \
  local_docker network ls \
  --format 'name={{.Name}}|driver={{.Driver}}|scope={{.Scope}}'
emit_or_none "${network_list_output}" 'networks=none-or-unavailable'

network_id_output=''
capture_command network_id_output 'docker-network-identifiers' \
  local_docker network ls -q
while IFS= read -r network_id; do
  [[ "${network_id}" =~ ^[0-9a-f]{12,64}$ ]] || {
    if [[ -n "${network_id}" ]]; then
      mark_incomplete 'docker-network-identifier-validation' 65
    fi
    continue
  }

  network_inspect_output=''
  capture_command network_inspect_output 'docker-network-inspection' \
    local_docker network inspect \
    --format 'name={{.Name}}|driver={{.Driver}}|scope={{.Scope}}|internal={{.Internal}}|attachable={{.Attachable}}|project={{index .Labels "com.docker.compose.project"}}|resource_kind={{index .Labels "com.docker.compose.network"}}{{range .IPAM.Config}}|subnet={{.Subnet}}|ip_range={{.IPRange}}|gateway={{.Gateway}}{{end}}' \
    "${network_id}"
  emit_or_none "${network_inspect_output}" 'network-inspection=unavailable'
done <<< "${network_id_output}"

section 'docker-volumes'
volume_list_output=''
capture_command volume_list_output 'docker-volume-list' \
  local_docker volume ls --format 'name={{.Name}}|driver={{.Driver}}'
emit_or_none "${volume_list_output}" 'volumes=none-or-unavailable'

volume_name_output=''
capture_command volume_name_output 'docker-volume-identifiers' \
  local_docker volume ls -q
while IFS= read -r volume_name; do
  if [[ -z "${volume_name}" ]]; then
    continue
  fi
  if [[ "${volume_name}" == *[[:space:]]* ]]; then
    mark_incomplete 'docker-volume-identifier-validation' 65
    continue
  fi

  volume_inspect_output=''
  capture_command volume_inspect_output 'docker-volume-inspection' \
    local_docker volume inspect \
    --format 'name={{.Name}}|driver={{.Driver}}|mountpoint={{.Mountpoint}}|scope={{.Scope}}|project={{index .Labels "com.docker.compose.project"}}|resource_kind={{index .Labels "com.docker.compose.volume"}}' \
    "${volume_name}"
  emit_or_none "${volume_inspect_output}" 'volume-inspection=unavailable'
done <<< "${volume_name_output}"

section 'docker-resource-usage'
docker_stats_output=''
capture_command docker_stats_output 'docker-stats' \
  local_docker stats --no-stream \
  --format 'name={{.Name}}|cpu={{.CPUPerc}}|memory={{.MemUsage}}|memory_percent={{.MemPerc}}|pids={{.PIDs}}'
emit_or_none "${docker_stats_output}" 'docker-stats=none-or-unavailable'

section 'listening-sockets'
socket_output=''
capture_command socket_output 'listening-sockets' ss -H -lntu
emit_or_none "${socket_output}" 'listening-sockets=unavailable'

section 'systemd-unit-names'
systemd_unit_output=''
capture_systemd_unit_list systemd_unit_output

matching_systemd_units=0
while IFS=$' \t' read -r unit_name unit_state _; do
  [[ -n "${unit_name}" ]] || continue
  case "${unit_name}" in
    *.service|*.timer) ;;
    *) continue ;;
  esac
  case "${unit_name,,}" in
    *menorah*|*docker*|*containerd*|*caddy*|*cloudflared*|*mongo*|*redis*)
      if [[ ! "${unit_name}" =~ ^[a-zA-Z0-9@_.:-]+$ ]]; then
        mark_incomplete 'systemd-unit-name-validation' 65
        continue
      fi
      matching_systemd_units=$((matching_systemd_units + 1))
      emit_sanitized "unit=${unit_name}|state=${unit_state:-unknown}"

      systemd_show_output=''
      capture_command systemd_show_output 'systemd-unit-show' \
        systemctl show \
        --no-pager \
        --property=Id \
        --property=FragmentPath \
        --property=ActiveState \
        --property=SubState \
        --property=UnitFileState \
        -- "${unit_name}"
      emit_or_none "${systemd_show_output}" \
        "unit=${unit_name}|metadata=unavailable"
      ;;
  esac
done <<< "${systemd_unit_output}"
if (( matching_systemd_units == 0 )); then
  printf '%s\n' 'matching-units=none-or-unavailable'
fi

section 'ingress-config-file-metadata'
for ingress_file in "${DISCOVERED_INGRESS_FILE_ORDER[@]}"; do
  if [[ -e "${ingress_file}" || -L "${ingress_file}" ]]; then
    ingress_stat_output=''
    capture_command ingress_stat_output 'ingress-file-stat' \
      stat -c 'path=%n|type=%F|mode=%a|owner=%u:%g|bytes=%s|modified=%y' \
      -- "${ingress_file}"
    emit_or_none "${ingress_stat_output}" \
      "path=${ingress_file}|metadata=unavailable"
  else
    printf 'path=%s|state=absent\n' "${ingress_file}"
  fi
done
unset \
  DISCOVERED_INGRESS_FILES \
  DISCOVERED_INGRESS_FILE_ORDER \
  ingress_file

section 'completion'
COMPLETION_EMITTED=1
if (( DISCOVERY_INCOMPLETE != 0 )); then
  printf '%s\n' 'discovery=incomplete'
  exit 1
fi
printf '%s\n' 'discovery=complete'
