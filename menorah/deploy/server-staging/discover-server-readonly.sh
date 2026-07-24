#!/usr/bin/env bash
set -u

# This script is intentionally inspection-only. It emits metadata to stdout,
# suppresses command diagnostics, never reads environment values, and never
# creates a file or directory.
exec 2>/dev/null
export LC_ALL=C

section() {
  printf '\n[%s]\n' "$1"
}

unavailable() {
  printf '%s\n' 'unavailable-or-not-permitted'
}

section 'discovery-contract'
printf '%s\n' 'schema=menorah-server-discovery-v1'
printf '%s\n' 'mode=read-only-metadata'
printf '%s\n' 'secret-values=omitted'
printf '%s\n' 'database-content=not-inspected'

section 'host'
if command -v hostname >/dev/null 2>&1; then
  printf 'hostname='
  hostname || unavailable
else
  unavailable
fi
if command -v uname >/dev/null 2>&1; then
  printf 'kernel='
  uname -srm || unavailable
else
  unavailable
fi
if [[ -r /etc/os-release ]]; then
  awk -F= '
    $1 == "ID" || $1 == "VERSION_ID" {
      gsub(/^"|"$/, "", $2);
      printf "%s=%s\n", tolower($1), $2
    }
  ' /etc/os-release
else
  unavailable
fi
if command -v nproc >/dev/null 2>&1; then
  printf 'logical_cpu_count='
  nproc || unavailable
fi
if [[ -r /proc/meminfo ]]; then
  awk '
    $1 == "MemTotal:" { print "memory_total_kib=" $2 }
    $1 == "MemAvailable:" { print "memory_available_kib=" $2 }
  ' /proc/meminfo
fi

section 'disk-filesystems'
if command -v df >/dev/null 2>&1; then
  df -PT
else
  unavailable
fi

section 'mounts'
if command -v findmnt >/dev/null 2>&1; then
  findmnt -rn -o TARGET,SOURCE,FSTYPE,OPTIONS
else
  unavailable
fi

section 'reviewed-root-metadata'
for reviewed_root in \
  /opt/menorah \
  /opt/menorah/data \
  /opt/menorah/backups \
  /opt/menorah/deploy-state \
  /opt/menorah/menorah \
  /opt/menorah-staging \
  /opt/menorah-staging/data \
  /opt/menorah-staging/backups \
  /opt/menorah-staging/deploy-state \
  /opt/menorah-staging/logs \
  /opt/menorah-staging/env \
  /opt/menorah-staging/app
do
  if [[ -e "${reviewed_root}" || -L "${reviewed_root}" ]]; then
    stat -c 'path=%n|type=%F|mode=%a|owner=%u:%g' -- "${reviewed_root}" \
      || printf 'path=%s|metadata=unavailable\n' "${reviewed_root}"
    if command -v findmnt >/dev/null 2>&1; then
      findmnt -rn -T "${reviewed_root}" -o TARGET,SOURCE,FSTYPE,OPTIONS \
        | sed 's/^/mount=/' \
        || true
    fi
  else
    printf 'path=%s|state=absent\n' "${reviewed_root}"
  fi
done

section 'docker-version'
if command -v docker >/dev/null 2>&1; then
  docker version \
    --format 'client={{.Client.Version}}|server={{.Server.Version}}' \
    || unavailable
  docker compose version || unavailable
else
  unavailable
fi

section 'docker-compose-projects'
if command -v docker >/dev/null 2>&1; then
  docker compose ls --all --format json || unavailable
else
  unavailable
fi

section 'docker-containers'
if command -v docker >/dev/null 2>&1; then
  docker ps -a \
    --format 'name={{.Names}}|image={{.Image}}|status={{.Status}}|project={{.Label "com.docker.compose.project"}}|service={{.Label "com.docker.compose.service"}}'
else
  unavailable
fi

section 'docker-published-ports'
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format 'name={{.Names}}|ports={{.Ports}}'
else
  unavailable
fi

section 'docker-container-isolation-metadata'
if command -v docker >/dev/null 2>&1; then
  docker ps -aq \
    | while IFS= read -r container_id; do
      [[ "${container_id}" =~ ^[0-9a-f]{12,64}$ ]] || continue
      docker inspect \
        --format 'name={{.Name}}|project={{index .Config.Labels "com.docker.compose.project"}}|service={{index .Config.Labels "com.docker.compose.service"}}|restart={{.HostConfig.RestartPolicy.Name}}|memory_bytes={{.HostConfig.Memory}}|nano_cpus={{.HostConfig.NanoCpus}}|pids_limit={{.HostConfig.PidsLimit}}|read_only={{.HostConfig.ReadonlyRootfs}}|privileged={{.HostConfig.Privileged}}|network_mode={{.HostConfig.NetworkMode}}|pid_mode={{.HostConfig.PidMode}}|ipc_mode={{.HostConfig.IpcMode}}' \
        "${container_id}" \
        || true
      docker inspect \
        --format '{{range .Mounts}}container={{$.Name}}|mount_type={{.Type}}|mount_name={{.Name}}|source={{.Source}}|destination={{.Destination}}|rw={{.RW}}{{println}}{{end}}' \
        "${container_id}" \
        || true
    done
else
  unavailable
fi

section 'docker-networks'
if command -v docker >/dev/null 2>&1; then
  docker network ls \
    --format 'name={{.Name}}|driver={{.Driver}}|scope={{.Scope}}'
  docker network ls -q \
    | while IFS= read -r network_id; do
      [[ "${network_id}" =~ ^[0-9a-f]{12,64}$ ]] || continue
      docker network inspect \
        --format 'name={{.Name}}|driver={{.Driver}}|scope={{.Scope}}|internal={{.Internal}}|attachable={{.Attachable}}|labels={{json .Labels}}{{range .IPAM.Config}}|subnet={{.Subnet}}|gateway={{.Gateway}}{{end}}' \
        "${network_id}" \
        || true
    done
else
  unavailable
fi

section 'docker-volumes'
if command -v docker >/dev/null 2>&1; then
  docker volume ls --format 'name={{.Name}}|driver={{.Driver}}'
  docker volume ls -q \
    | while IFS= read -r volume_name; do
      [[ -n "${volume_name}" && "${volume_name}" != *[[:space:]]* ]] \
        || continue
      docker volume inspect \
        --format 'name={{.Name}}|driver={{.Driver}}|mountpoint={{.Mountpoint}}|scope={{.Scope}}|labels={{json .Labels}}' \
        "${volume_name}" \
        || true
    done
else
  unavailable
fi

section 'docker-resource-usage'
if command -v docker >/dev/null 2>&1; then
  docker stats --no-stream \
    --format 'name={{.Name}}|cpu={{.CPUPerc}}|memory={{.MemUsage}}|memory_percent={{.MemPerc}}|pids={{.PIDs}}'
else
  unavailable
fi

section 'listening-sockets'
if command -v ss >/dev/null 2>&1; then
  ss -H -lntu
else
  unavailable
fi

section 'systemd-unit-names'
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-unit-files \
    --type=service \
    --type=timer \
    --no-legend \
    --no-pager \
    | awk '
      BEGIN { IGNORECASE = 1 }
      $1 ~ /(menorah|docker|containerd|caddy|cloudflared|mongo|redis)/ {
        print "unit=" $1 "|state=" $2
      }
    '
  systemctl list-unit-files \
    --type=service \
    --type=timer \
    --no-legend \
    --no-pager \
    | awk '
      BEGIN { IGNORECASE = 1 }
      $1 ~ /(menorah|docker|containerd|caddy|cloudflared|mongo|redis)/ {
        print $1
      }
    ' \
    | while IFS= read -r unit_name; do
      [[ -n "${unit_name}" && "${unit_name}" != *[[:space:]]* ]] \
        || continue
      systemctl show "${unit_name}" \
        --no-pager \
        --property=Id \
        --property=FragmentPath \
        --property=ActiveState \
        --property=SubState \
        --property=UnitFileState \
        | awk -v unit="${unit_name}" '
          BEGIN { printf "unit=%s", unit }
          /^[A-Za-z]+=/ { printf "|%s", $0 }
          END { printf "\n" }
        ' \
        || true
    done
else
  unavailable
fi

section 'ingress-config-file-metadata'
for ingress_file in \
  /etc/caddy/Caddyfile \
  /etc/cloudflared/config.yml \
  /etc/cloudflared/config.yaml \
  /opt/menorah/menorah/menorah/deploy/caddy/Caddyfile.production \
  /opt/menorah/menorah/menorah/deploy/cloudflare/tunnel-config.yml
do
  if [[ -e "${ingress_file}" || -L "${ingress_file}" ]]; then
    stat -c 'path=%n|type=%F|mode=%a|owner=%u:%g|bytes=%s|modified=%y' \
      -- "${ingress_file}" \
      || printf 'path=%s|metadata=unavailable\n' "${ingress_file}"
  else
    printf 'path=%s|state=absent\n' "${ingress_file}"
  fi
done

section 'completion'
printf '%s\n' 'discovery=complete'
