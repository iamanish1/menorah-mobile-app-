import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectDockerMetrics,
  createDockerJsonRequester,
} from '../../deploy/monitoring/docker-stats-exporter.mjs';

test('exports bounded container state, restart, and memory metrics', async () => {
  const responses = new Map([
    ['/v1/containers', [{
      Id: 'a'.repeat(64),
      Names: ['/api-ios'],
      State: 'running',
      Labels: {
        'com.docker.compose.project': 'menorah',
        'com.docker.compose.service': 'api-ios',
        secret: 'must-not-be-exported',
      },
    }]],
    [`/v1/containers/${'a'.repeat(64)}/state`, {
      RestartCount: 3,
      State: {
        Running: true,
        StartedAt: '2026-07-23T12:00:00.000Z',
      },
    }],
    [`/containers/${'a'.repeat(64)}/stats?stream=false&one-shot=true`, {
      memory_stats: {
        usage: 1000,
        limit: 4000,
        stats: { inactive_file: 250 },
      },
    }],
  ]);
  const metrics = await collectDockerMetrics({
    requestJson: async (pathname) => structuredClone(responses.get(pathname)),
    now: Date.parse('2026-07-23T12:01:00Z'),
  });

  assert.match(metrics, /menorah_docker_exporter_collection_success 1/);
  assert.match(metrics, /menorah_container_running\{container="api-ios",project="menorah",service="api-ios"\} 1/);
  assert.match(metrics, /# TYPE menorah_container_restarts_total counter/);
  assert.match(metrics, /menorah_container_restarts_total\{[^}]+\} 3/);
  assert.match(metrics, /menorah_container_start_time_seconds\{[^}]+\} 1784808000/);
  assert.match(metrics, /menorah_container_memory_working_set_bytes\{[^}]+\} 750/);
  assert.match(metrics, /menorah_container_memory_limit_bytes\{[^}]+\} 4000/);
  assert.doesNotMatch(metrics, /must-not-be-exported|secret/);
});

test('rejects a short or non-hex container ID before making state requests', async () => {
  await assert.rejects(
    collectDockerMetrics({
      requestJson: async () => [{
        Id: 'short-id',
        Names: ['/invalid'],
        State: 'running',
      }],
    }),
    /invalid container ID/,
  );
});

test('fails closed when Docker returns an oversized response', async () => {
  const requester = createDockerJsonRequester({
    fetchImpl: async () => new Response('[]', {
      status: 200,
      headers: { 'content-length': String(17 * 1024 * 1024) },
    }),
  });
  await assert.rejects(requester('/v1/containers'), /size limit/);
});

test('rejects a malformed Docker container list', async () => {
  await assert.rejects(
    collectDockerMetrics({
      requestJson: async () => ({ unexpected: true }),
    }),
    /container list is not an array/,
  );
});
