#!/usr/bin/env node

import http from 'node:http';
import { pathToFileURL } from 'node:url';

const DOCKER_API_URL =
  process.env.DOCKER_API_URL || 'http://docker-metrics-gateway:2375';
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = Number.parseInt(process.env.PORT || '9250', 10);
const COLLECTION_INTERVAL_MS = Number.parseInt(
  process.env.COLLECTION_INTERVAL_MS || '30000',
  10,
);
const REQUEST_TIMEOUT_MS = 5000;
const RESPONSE_LIMIT_BYTES = 16 * 1024 * 1024;
const MAX_CONCURRENCY = 4;

const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const boundedLabel = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 160);

const escapeLabel = (value) =>
  boundedLabel(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('"', '\\"');

const metricLabels = ({ container, project, service }) =>
  `{container="${escapeLabel(container)}",project="${escapeLabel(project)}",service="${escapeLabel(service)}"}`;

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

export const createDockerJsonRequester = ({
  baseUrl = DOCKER_API_URL,
  fetchImpl = fetch,
} = {}) => async (pathname) => {
  const response = await fetchImpl(new URL(pathname, baseUrl), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Docker API returned HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > RESPONSE_LIMIT_BYTES) {
    throw new Error('Docker API response exceeds the size limit');
  }
  const source = await response.text();
  if (Buffer.byteLength(source) > RESPONSE_LIMIT_BYTES) {
    throw new Error('Docker API response exceeds the size limit');
  }
  return JSON.parse(source);
};

const containerIdentity = (summary) => {
  const labels = summary?.Labels || {};
  return {
    container: boundedLabel(
      summary?.Names?.[0]?.replace(/^\//, '')
        || summary?.Id?.slice(0, 12),
    ),
    project: boundedLabel(labels['com.docker.compose.project']),
    service: boundedLabel(labels['com.docker.compose.service']),
  };
};

const memoryValues = (stats) => {
  const usage = finiteNonNegative(stats?.memory_stats?.usage);
  const cache = finiteNonNegative(
    stats?.memory_stats?.stats?.inactive_file
      ?? stats?.memory_stats?.stats?.total_inactive_file,
  );
  return {
    workingSet: Math.max(0, usage - cache),
    limit: finiteNonNegative(stats?.memory_stats?.limit),
  };
};

const startedAtEpoch = (state) => {
  const epoch = Date.parse(state?.StartedAt || '');
  return Number.isFinite(epoch) ? Math.floor(epoch / 1000) : 0;
};

export const collectDockerMetrics = async ({
  requestJson,
  now = Date.now(),
}) => {
  const summaries = await requestJson('/v1/containers');
  if (!Array.isArray(summaries)) {
    throw new Error('Docker API container list is not an array');
  }

  const containers = await mapLimit(summaries, MAX_CONCURRENCY, async (summary) => {
    if (!/^[a-f0-9]{64}$/.test(String(summary?.Id || ''))) {
      throw new Error('Docker API returned an invalid container ID');
    }
    const id = summary.Id;
    const state = await requestJson(`/v1/containers/${id}/state`);
    const running = state?.State?.Running === true;
    const stats = running
      ? await requestJson(`/containers/${id}/stats?stream=false&one-shot=true`)
      : null;
    return {
      identity: containerIdentity(summary),
      running,
      restartCount: finiteNonNegative(state?.RestartCount),
      startedAt: startedAtEpoch(state?.State),
      memory: memoryValues(stats),
    };
  });

  const lines = [
    '# HELP menorah_docker_exporter_collection_success Whether the most recent Docker API collection completed.',
    '# TYPE menorah_docker_exporter_collection_success gauge',
    'menorah_docker_exporter_collection_success 1',
    '# HELP menorah_docker_exporter_last_success_timestamp_seconds Unix timestamp of the latest successful collection.',
    '# TYPE menorah_docker_exporter_last_success_timestamp_seconds gauge',
    `menorah_docker_exporter_last_success_timestamp_seconds ${Math.floor(now / 1000)}`,
    '# HELP menorah_container_running Whether the named Docker container is running.',
    '# TYPE menorah_container_running gauge',
    '# HELP menorah_container_restarts_total Docker restart count for the current named container lifetime.',
    '# TYPE menorah_container_restarts_total counter',
    '# HELP menorah_container_start_time_seconds Unix timestamp when the named container last started.',
    '# TYPE menorah_container_start_time_seconds gauge',
    '# HELP menorah_container_memory_working_set_bytes Current memory usage minus inactive file cache.',
    '# TYPE menorah_container_memory_working_set_bytes gauge',
    '# HELP menorah_container_memory_limit_bytes Memory ceiling reported by Docker stats for the named container.',
    '# TYPE menorah_container_memory_limit_bytes gauge',
  ];

  for (const container of containers.sort((left, right) =>
    left.identity.container.localeCompare(right.identity.container))) {
    const labels = metricLabels(container.identity);
    lines.push(`menorah_container_running${labels} ${container.running ? 1 : 0}`);
    lines.push(`menorah_container_restarts_total${labels} ${container.restartCount}`);
    lines.push(`menorah_container_start_time_seconds${labels} ${container.startedAt}`);
    lines.push(
      `menorah_container_memory_working_set_bytes${labels} ${container.memory.workingSet}`,
    );
    lines.push(
      `menorah_container_memory_limit_bytes${labels} ${container.memory.limit}`,
    );
  }

  return `${lines.join('\n')}\n`;
};

const failureMetrics = (lastSuccessEpoch, failures) => [
  '# HELP menorah_docker_exporter_collection_success Whether the most recent Docker API collection completed.',
  '# TYPE menorah_docker_exporter_collection_success gauge',
  'menorah_docker_exporter_collection_success 0',
  '# HELP menorah_docker_exporter_last_success_timestamp_seconds Unix timestamp of the latest successful collection.',
  '# TYPE menorah_docker_exporter_last_success_timestamp_seconds gauge',
  `menorah_docker_exporter_last_success_timestamp_seconds ${lastSuccessEpoch}`,
  '# HELP menorah_docker_exporter_collection_failures_total Total failed Docker API collections.',
  '# TYPE menorah_docker_exporter_collection_failures_total counter',
  `menorah_docker_exporter_collection_failures_total ${failures}`,
  '',
].join('\n');

export const startServer = ({
  requestJson = createDockerJsonRequester(),
  listenHost = LISTEN_HOST,
  listenPort = LISTEN_PORT,
  collectionIntervalMs = COLLECTION_INTERVAL_MS,
} = {}) => {
  let metrics = failureMetrics(0, 0);
  let lastSuccessEpoch = 0;
  let failures = 0;
  let collecting = false;

  const refresh = async () => {
    if (collecting) return;
    collecting = true;
    try {
      const now = Date.now();
      metrics = await collectDockerMetrics({ requestJson, now });
      lastSuccessEpoch = Math.floor(now / 1000);
    } catch (error) {
      failures += 1;
      metrics = failureMetrics(lastSuccessEpoch, failures);
      console.error(`Docker metrics collection failed (${error?.name || 'Error'}).`);
    } finally {
      collecting = false;
    }
  };

  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/metrics') {
      response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      response.end(metrics);
      return;
    }
    if (request.method === 'GET' && request.url === '/healthz') {
      const fresh =
        lastSuccessEpoch > 0
        && Date.now() / 1000 - lastSuccessEpoch <= (collectionIntervalMs * 3) / 1000;
      response.writeHead(fresh ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: fresh }));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found\n');
  });

  server.listen(listenPort, listenHost);
  void refresh();
  const interval = setInterval(() => void refresh(), collectionIntervalMs);
  server.on('close', () => clearInterval(interval));
  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!Number.isInteger(LISTEN_PORT) || LISTEN_PORT < 1 || LISTEN_PORT > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  if (
    !Number.isInteger(COLLECTION_INTERVAL_MS)
    || COLLECTION_INTERVAL_MS < 5000
    || COLLECTION_INTERVAL_MS > 300000
  ) {
    throw new Error('COLLECTION_INTERVAL_MS must be between 5000 and 300000');
  }
  startServer();
}
