import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyDockerRequest,
  sanitizeDockerPayload,
} from '../../deploy/monitoring/docker-metrics-gateway.mjs';

const CONTAINER_ID = 'a'.repeat(64);

test('allows only the exact project list, sanitized state, and one-shot stats GETs', () => {
  assert.deepEqual(classifyDockerRequest('GET', '/v1/containers', 'menorah'), {
    kind: 'container-list',
    dockerPath:
      '/containers/json?all=1&filters=%7B%22label%22%3A%5B%22com.docker.compose.project%3Dmenorah%22%5D%7D',
  });
  assert.deepEqual(
    classifyDockerRequest(
      'GET',
      `/containers/${CONTAINER_ID}/stats?stream=false&one-shot=true`,
    ),
    {
      kind: 'container-stats',
      containerId: CONTAINER_ID,
      dockerPath:
        `/containers/${CONTAINER_ID}/stats?stream=false&one-shot=true`,
    },
  );
  assert.deepEqual(
    classifyDockerRequest(
      'GET',
      `/v1/containers/${CONTAINER_ID}/state`,
    ),
    {
      kind: 'container-state',
      containerId: CONTAINER_ID,
      dockerPath: `/containers/${CONTAINER_ID}/json`,
    },
  );
});

test('denies inspect, logs, archive, export, and mutations', () => {
  for (const target of [
    `/containers/${CONTAINER_ID}/json`,
    `/containers/${CONTAINER_ID}/logs?stdout=1`,
    `/containers/${CONTAINER_ID}/archive?path=/`,
    `/containers/${CONTAINER_ID}/export`,
    '/containers/json?all=1',
    '/v1/containers?all=1',
    `/containers/${CONTAINER_ID}/stats?stream=true&one-shot=true`,
    '/containers/json?all=1&limit=1',
  ]) {
    assert.equal(classifyDockerRequest('GET', target), null, target);
  }
  assert.equal(
    classifyDockerRequest('POST', `/containers/${CONTAINER_ID}/stop`),
    null,
  );
});

test('sanitizes list labels and stats fields before returning them', () => {
  const list = sanitizeDockerPayload('container-list', [
    {
      Id: CONTAINER_ID,
      Names: ['/api-ios'],
      State: 'running',
      Labels: {
        'com.docker.compose.project': 'menorah',
        'com.docker.compose.service': 'api-ios',
        secret: 'must-not-cross-the-gateway',
      },
      HostConfig: { NetworkMode: 'secret-network' },
    },
    {
      Id: 'b'.repeat(64),
      Names: ['/other-project'],
      State: 'running',
      Labels: {
        'com.docker.compose.project': 'other',
        'com.docker.compose.service': 'other',
      },
    },
  ], 'menorah');
  const stats = sanitizeDockerPayload('container-stats', {
    memory_stats: {
      usage: 1000,
      limit: 4000,
      stats: { inactive_file: 250, secret_stat: 99 },
    },
    networks: { private: { rx_bytes: 42 } },
  });
  const state = sanitizeDockerPayload('container-state', {
    RestartCount: 3,
    State: {
      Running: true,
      StartedAt: '2026-07-23T12:00:00.000Z',
      ExitCode: 137,
    },
    Config: {
      Env: ['SECRET=must-not-cross-the-gateway'],
    },
  });

  assert.deepEqual(list, [{
    Id: CONTAINER_ID,
    Names: ['/api-ios'],
    State: 'running',
    Labels: {
      'com.docker.compose.project': 'menorah',
      'com.docker.compose.service': 'api-ios',
    },
  }]);
  assert.deepEqual(stats, {
    memory_stats: {
      usage: 1000,
      limit: 4000,
      stats: { inactive_file: 250 },
    },
  });
  assert.deepEqual(state, {
    RestartCount: 3,
    State: {
      Running: true,
      StartedAt: '2026-07-23T12:00:00.000Z',
    },
  });
  assert.doesNotMatch(
    JSON.stringify({ list, state, stats }),
    /secret|private|NetworkMode|ExitCode|Config/,
  );
});
