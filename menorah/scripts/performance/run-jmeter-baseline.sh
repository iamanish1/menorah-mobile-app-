#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
test_dir="$repo_root/scripts/performance"
run_id="$(date -u +%Y%m%dT%H%M%SZ)"
results_dir="$test_dir/results/$run_id"

mkdir -p "$results_dir"

docker run --rm \
  --memory=1g \
  --memory-swap=1g \
  -e JVM_XMN=64 \
  -e JVM_XMS=256 \
  -e JVM_XMX=512 \
  -v "$test_dir:/tests" \
  justb4/jmeter:5.5 \
  -n \
  -t /tests/menorah-public-baseline.jmx \
  -l "/tests/results/$run_id/baseline.jtl" \
  -e \
  -o "/tests/results/$run_id/dashboard" \
  -Jthreads="${JMETER_THREADS:-5}" \
  -Jramp_seconds="${JMETER_RAMP_SECONDS:-10}" \
  -Jduration_seconds="${JMETER_DURATION_SECONDS:-60}" \
  -Jdelay_ms="${JMETER_DELAY_MS:-2000}"

printf 'JMeter results: %s\n' "$results_dir"
