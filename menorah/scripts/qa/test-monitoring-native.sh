#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_DIR="$(cd "${SCRIPT_DIR}/../../deploy/monitoring" && pwd)"
LOGGING_DIR="$(cd "${SCRIPT_DIR}/../../deploy/logging" && pwd)"
PROMETHEUS_IMAGE='prom/prometheus:v2.55.1@sha256:2659f4c2ebb718e7695cb9b25ffa7d6be64db013daba13e05c875451cf51b0d3'
BLACKBOX_IMAGE='prom/blackbox-exporter:v0.28.0@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc'
ALERTMANAGER_IMAGE='prom/alertmanager:v0.32.1@sha256:51a825c2a40acc3e338fdd00d622e01ec090f72be2b3ea46be0839cd47a4d286'
BUSYBOX_IMAGE='busybox:1.37.0-glibc@sha256:4279d9b47df4c1b02d80efd8d02cd59b3a8182c1e785a4ff3f6983bee19dc8b0'
NODE_IMAGE='node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2'
ALLOY_IMAGE='grafana/alloy:v1.18.0@sha256:491b0578c04983fd54fe99b587b6fab4404dc46d0dc16677bd6b00cc1140b308'
LOKI_IMAGE='grafana/loki:3.7.3@sha256:70b9f699fc9bb868b62f1cfd4f787dfa50242f1fd92e6089787d5d7daea75fe8'

docker run --rm --network none --entrypoint /bin/promtool \
  -v "${MONITORING_DIR}:/etc/prometheus:ro" \
  "${PROMETHEUS_IMAGE}" \
  check config /etc/prometheus/prometheus.yml

docker run --rm --network none --entrypoint /bin/promtool \
  -v "${MONITORING_DIR}:/etc/prometheus:ro" \
  -w /etc/prometheus \
  "${PROMETHEUS_IMAGE}" \
  test rules alert-rules.test.yml

docker run --rm --network none \
  -v "${MONITORING_DIR}:/config:ro" \
  "${BLACKBOX_IMAGE}" \
  --config.file=/config/blackbox.yml --config.check

docker run --rm --network none --entrypoint /bin/amtool \
  -v "${MONITORING_DIR}:/config:ro" \
  "${ALERTMANAGER_IMAGE}" \
  check-config /config/alertmanager.yml

docker run --rm --network none \
  -v "${LOGGING_DIR}/config.alloy:/etc/alloy/config.alloy:ro" \
  "${ALLOY_IMAGE}" \
  validate /etc/alloy/config.alloy

docker run --rm --network none --entrypoint /usr/bin/loki \
  -v "${LOGGING_DIR}/loki-config.yml:/etc/loki/config.yml:ro" \
  "${LOKI_IMAGE}" \
  -config.file=/etc/loki/config.yml -verify-config

test_backup_metrics_runtime() {
  local fixture_volume="menorah-backup-metrics-contract-$$"
  docker volume create "${fixture_volume}" >/dev/null
  cleanup_backup_metrics_contract() {
    docker volume rm -f "${fixture_volume}" >/dev/null 2>&1 || true
  }
  trap cleanup_backup_metrics_contract EXIT

  docker run --rm --network none -v "${fixture_volume}:/fixture" "${BUSYBOX_IMAGE}" sh -eu -c '
    mkdir -p /fixture/backups/metadata /fixture/attempts /fixture/textfile
    printf "{\"timestamp\":\"20260723T120000Z\"}\n" \
      > /fixture/backups/metadata/latest-success-daily.json
    printf "test-signature\n" \
      > /fixture/backups/metadata/latest-success-daily.json.hmac-sha256
    {
      printf "schema_version=1\n"
      printf "backup_type=daily\n"
      printf "result=0\n"
      printf "timestamp_seconds=1784808000\n"
      printf "service_result=exit-code\n"
      printf "exit_code=exited\n"
      printf "exit_status=1\n"
    } > /fixture/attempts/latest-attempt-daily.status
  '

  docker run --rm --network none \
    -v "${MONITORING_DIR}/export-backup-metrics.sh:/scripts/export-backup-metrics.sh:ro" \
    -v "${fixture_volume}:/fixture" \
    -e BACKUP_ROOT=/fixture/backups \
    -e BACKUP_ATTEMPT_ROOT=/fixture/attempts \
    -e TEXTFILE_DIR=/fixture/textfile \
    "${BUSYBOX_IMAGE}" \
    /bin/sh /scripts/export-backup-metrics.sh

  docker run --rm --network none -v "${fixture_volume}:/fixture:ro" "${BUSYBOX_IMAGE}" \
    grep -F 'menorah_backup_metadata_present{backup_type="daily"} 1' \
    /fixture/textfile/menorah-backup.prom >/dev/null
  docker run --rm --network none -v "${fixture_volume}:/fixture:ro" "${BUSYBOX_IMAGE}" \
    grep -F 'menorah_backup_last_attempt_result{backup_type="daily"} 0' \
    /fixture/textfile/menorah-backup.prom >/dev/null
  docker run --rm --network none -v "${fixture_volume}:/fixture:ro" "${BUSYBOX_IMAGE}" \
    grep -F 'menorah_backup_attempt_metadata_present{backup_type="daily"} 1' \
    /fixture/textfile/menorah-backup.prom >/dev/null

  cleanup_backup_metrics_contract
  trap - EXIT
}

test_docker_stats_runtime_contract() {
  if [[ "$(docker info --format '{{.OSType}}')" != "linux" ]]; then
    echo "Docker stats runtime contract requires a Linux Docker daemon." >&2
    return 1
  fi

  local suffix="$$"
  local network="menorah-monitoring-contract-${suffix}"
  local target="menorah-monitoring-target-${suffix}"
  local outsider="menorah-monitoring-outsider-${suffix}"
  local gateway="menorah-monitoring-gateway-${suffix}"
  local exporter="menorah-monitoring-exporter-${suffix}"

  cleanup_docker_stats_contract() {
    docker rm -f "${exporter:-}" "${gateway:-}" "${target:-}" "${outsider:-}" >/dev/null 2>&1 || true
    docker network rm "${network:-}" >/dev/null 2>&1 || true
  }
  trap cleanup_docker_stats_contract EXIT

  docker network create "${network}" >/dev/null
  docker run -d --name "${target}" --network "${network}" \
    --label com.docker.compose.project=menorah-monitoring-contract \
    --label com.docker.compose.service=runtime-target \
    "${BUSYBOX_IMAGE}" sleep 120 >/dev/null
  docker run -d --name "${outsider}" --network "${network}" \
    --label com.docker.compose.project=other-project \
    --label com.docker.compose.service=outsider \
    "${BUSYBOX_IMAGE}" sleep 120 >/dev/null
  docker run -d --name "${gateway}" --network "${network}" \
    --user 0:0 --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
    -e PORT=2375 \
    -e DOCKER_SOCKET_PATH=/var/run/docker.sock \
    -e DOCKER_COMPOSE_PROJECT=menorah-monitoring-contract \
    -v "${MONITORING_DIR}/docker-metrics-gateway.mjs:/app/docker-metrics-gateway.mjs:ro" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    "${NODE_IMAGE}" node /app/docker-metrics-gateway.mjs \
    >/dev/null
  docker run -d --name "${exporter}" --network "${network}" \
    --user 1000:1000 --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
    -e "DOCKER_API_URL=http://${gateway}:2375" \
    -e PORT=9250 \
    -e COLLECTION_INTERVAL_MS=5000 \
    -v "${MONITORING_DIR}/docker-stats-exporter.mjs:/app/docker-stats-exporter.mjs:ro" \
    "${NODE_IMAGE}" node /app/docker-stats-exporter.mjs \
    >/dev/null

  local observed=false
  local metrics=""
  for _ in $(seq 1 30); do
    if metrics="$(docker run --rm --network "${network}" "${BUSYBOX_IMAGE}" \
      wget -qO- "http://${exporter}:9250/metrics" 2>/dev/null)" \
      && grep -F "container=\"${target}\"" <<< "${metrics}" >/dev/null; then
      observed=true
      break
    fi
    sleep 1
  done
  if [[ "${observed}" != "true" ]]; then
    docker logs "${exporter}" >&2 || true
    echo "Docker stats exporter emitted no metric for ${target}." >&2
    return 1
  fi
  for metric_name in \
    menorah_container_running \
    menorah_container_restarts_total \
    menorah_container_start_time_seconds \
    menorah_container_memory_working_set_bytes \
    menorah_container_memory_limit_bytes; do
    if ! grep -F "${metric_name}{container=\"${target}\"" \
      <<< "${metrics}" >/dev/null; then
      echo "Docker stats exporter omitted ${metric_name} for ${target}." >&2
      return 1
    fi
  done

  local target_id
  target_id="$(docker inspect --format '{{.Id}}' "${target}")"
  local outsider_id
  outsider_id="$(docker inspect --format '{{.Id}}' "${outsider}")"
  assert_gateway_denies() {
    local method="$1"
    local path="$2"
    docker run --rm --network "${network}" "${NODE_IMAGE}" node -e '
      const [base, method, path] = process.argv.slice(1);
      fetch(base + path, { method }).then(async (response) => {
        await response.arrayBuffer();
        if (response.status !== 403) {
          console.error(`${method} ${path} returned ${response.status}, expected 403`);
          process.exit(1);
        }
      }).catch((error) => {
        console.error(error);
        process.exit(1);
      });
    ' "http://${gateway}:2375" "${method}" "${path}"
  }
  assert_gateway_denies GET "/containers/${target_id}/json"
  assert_gateway_denies GET "/containers/${target_id}/logs?stdout=1"
  assert_gateway_denies GET "/containers/${target_id}/archive?path=/"
  assert_gateway_denies GET "/containers/${target_id}/export"
  assert_gateway_denies GET "/containers/json?all=1"
  assert_gateway_denies GET "/v1/containers/${outsider_id}/state"
  assert_gateway_denies GET "/containers/${outsider_id}/stats?stream=false&one-shot=true"
  assert_gateway_denies POST "/containers/${target_id}/stop"

  if [[ "$(docker inspect --format '{{.State.Running}}' "${target}")" != "true" ]]; then
    echo "Docker gateway denial tests altered the target container." >&2
    return 1
  fi

  cleanup_docker_stats_contract
  trap - EXIT
}

test_backup_metrics_runtime
test_docker_stats_runtime_contract
