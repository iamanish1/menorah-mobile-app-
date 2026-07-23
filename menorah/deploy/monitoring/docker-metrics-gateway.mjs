#!/usr/bin/env node

import http from 'node:http';
import { pathToFileURL } from 'node:url';

const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = Number.parseInt(process.env.PORT || '2375', 10);
const DOCKER_SOCKET_PATH =
  process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
const DOCKER_COMPOSE_PROJECT =
  process.env.DOCKER_COMPOSE_PROJECT || 'menorah';
const REQUEST_TIMEOUT_MS = 5000;
const RESPONSE_LIMIT_BYTES = 16 * 1024 * 1024;
const CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/;
const validComposeProject = (value) =>
  /^[a-z0-9][a-z0-9_.-]{0,62}$/.test(String(value || ''));

const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const boundedString = (value, limit = 160) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, limit);

const exactSearchParams = (url, expected) => {
  const actual = [...url.searchParams.entries()];
  return (
    actual.length === expected.length
    && expected.every(([key, value]) => url.searchParams.get(key) === value)
  );
};

export const classifyDockerRequest = (
  method,
  requestTarget,
  composeProject = DOCKER_COMPOSE_PROJECT,
) => {
  if (method !== 'GET') return null;
  if (!validComposeProject(composeProject)) return null;

  let url;
  try {
    url = new URL(requestTarget, 'http://docker-metrics-gateway.invalid');
  } catch {
    return null;
  }

  if (
    url.pathname === '/v1/containers'
    && exactSearchParams(url, [])
  ) {
    const filters = encodeURIComponent(JSON.stringify({
      label: [`com.docker.compose.project=${composeProject}`],
    }));
    return {
      kind: 'container-list',
      dockerPath: `/containers/json?all=1&filters=${filters}`,
    };
  }

  const statsMatch = url.pathname.match(/^\/containers\/([^/]+)\/stats$/);
  if (
    statsMatch
    && CONTAINER_ID_PATTERN.test(statsMatch[1])
    && exactSearchParams(url, [
      ['stream', 'false'],
      ['one-shot', 'true'],
    ])
  ) {
    return {
      kind: 'container-stats',
      containerId: statsMatch[1],
      dockerPath:
        `/containers/${statsMatch[1]}/stats?stream=false&one-shot=true`,
    };
  }

  const stateMatch = url.pathname.match(
    /^\/v1\/containers\/([^/]+)\/state$/,
  );
  if (
    stateMatch
    && CONTAINER_ID_PATTERN.test(stateMatch[1])
    && exactSearchParams(url, [])
  ) {
    return {
      kind: 'container-state',
      containerId: stateMatch[1],
      dockerPath: `/containers/${stateMatch[1]}/json`,
    };
  }

  return null;
};

export const sanitizeDockerPayload = (
  kind,
  payload,
  composeProject = DOCKER_COMPOSE_PROJECT,
) => {
  if (kind === 'container-list') {
    if (!Array.isArray(payload)) {
      throw new Error('Docker container list is not an array');
    }
    return payload
      .filter((container) =>
        container?.Labels?.['com.docker.compose.project'] === composeProject)
      .map((container) => {
        const labels = container?.Labels || {};
        return {
          Id: boundedString(container?.Id, 64),
          Names: Array.isArray(container?.Names)
            ? container.Names.slice(0, 1).map((name) => boundedString(name))
            : [],
          State: boundedString(container?.State, 32),
          Labels: {
            'com.docker.compose.project': boundedString(
              labels['com.docker.compose.project'],
            ),
            'com.docker.compose.service': boundedString(
              labels['com.docker.compose.service'],
            ),
          },
        };
      });
  }

  if (kind === 'container-stats') {
    return {
      memory_stats: {
        usage: finiteNonNegative(payload?.memory_stats?.usage),
        limit: finiteNonNegative(payload?.memory_stats?.limit),
        stats: {
          inactive_file: finiteNonNegative(
            payload?.memory_stats?.stats?.inactive_file
              ?? payload?.memory_stats?.stats?.total_inactive_file,
          ),
        },
      },
    };
  }

  if (kind === 'container-state') {
    const restartCount = finiteNonNegative(payload?.RestartCount);
    return {
      RestartCount: Number.isInteger(restartCount) ? restartCount : 0,
      State: {
        Running: payload?.State?.Running === true,
        StartedAt: boundedString(payload?.State?.StartedAt, 64),
      },
    };
  }

  throw new Error('Unsupported Docker response kind');
};

const requestDockerJson = ({
  socketPath,
  dockerPath,
  requestImpl = http.request,
}) =>
  new Promise((resolve, reject) => {
    const upstream = requestImpl(
      {
        socketPath,
        path: dockerPath,
        method: 'GET',
        headers: {
          accept: 'application/json',
          host: 'docker',
        },
      },
      (response) => {
        const chunks = [];
        let size = 0;

        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > RESPONSE_LIMIT_BYTES) {
            upstream.destroy(new Error('Docker response exceeds the size limit'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Docker API returned HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(new Error('Docker API returned invalid JSON'));
          }
        });
      },
    );

    upstream.setTimeout(REQUEST_TIMEOUT_MS, () => {
      upstream.destroy(new Error('Docker API request timed out'));
    });
    upstream.on('error', reject);
    upstream.end();
  });

export const startGateway = ({
  listenHost = LISTEN_HOST,
  listenPort = LISTEN_PORT,
  socketPath = DOCKER_SOCKET_PATH,
  composeProject = DOCKER_COMPOSE_PROJECT,
  dockerRequester = requestDockerJson,
} = {}) => {
  let authorizedContainerIds = new Set();
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}\n');
      return;
    }

    const allowed = classifyDockerRequest(
      request.method,
      request.url,
      composeProject,
    );
    if (!allowed) {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end('{"error":"Docker API request denied"}\n');
      return;
    }
    if (
      allowed.containerId
      && !authorizedContainerIds.has(allowed.containerId)
    ) {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end('{"error":"Container is outside the monitored project"}\n');
      return;
    }

    try {
      const payload = await dockerRequester({
        socketPath,
        dockerPath: allowed.dockerPath,
      });
      const sanitized = sanitizeDockerPayload(
        allowed.kind,
        payload,
        composeProject,
      );
      if (allowed.kind === 'container-list') {
        authorizedContainerIds = new Set(
          sanitized.map((container) => container.Id),
        );
      }
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(`${JSON.stringify(sanitized)}\n`);
    } catch (error) {
      if (allowed.kind === 'container-list') authorizedContainerIds.clear();
      console.error(`Docker metrics gateway request failed (${error?.name || 'Error'}).`);
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end('{"error":"Docker metrics collection failed"}\n');
    }
  });

  server.headersTimeout = REQUEST_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = REQUEST_TIMEOUT_MS;
  server.listen(listenPort, listenHost);
  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!Number.isInteger(LISTEN_PORT) || LISTEN_PORT < 1 || LISTEN_PORT > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  if (!validComposeProject(DOCKER_COMPOSE_PROJECT)) {
    throw new Error('DOCKER_COMPOSE_PROJECT must be a bounded Compose project name');
  }
  startGateway();
}
