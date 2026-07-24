import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const compose = readFileSync(
  new URL('./compose.yml', import.meta.url),
  'utf8',
);
const dockerfile = readFileSync(
  new URL('./Dockerfile.monitoring-health', import.meta.url),
  'utf8',
);

const upstreamImages = Object.freeze({
  healthProbe:
    'prom/blackbox-exporter:v0.28.0@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc',
  'mongodb-exporter':
    'percona/mongodb_exporter:0.51.0@sha256:852b90b9f38ab489762b8a8b8c074ce852272c2495d725b922bdb5bc7d659e16',
  'redis-exporter':
    'oliver006/redis_exporter:v1.84.0@sha256:7ef8e9c26638158fa4e7ad60df8c7e53d1919986753d6c1d2d1876b6ec38d87b',
  loki:
    'grafana/loki:3.7.3@sha256:70b9f699fc9bb868b62f1cfd4f787dfa50242f1fd92e6089787d5d7daea75fe8',
  alloy:
    'grafana/alloy:v1.18.0@sha256:491b0578c04983fd54fe99b587b6fab4404dc46d0dc16677bd6b00cc1140b308',
});

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serviceBlock = (name) => {
  const match = compose.match(
    new RegExp(
      `^  ${escapePattern(name)}:\\r?\\n([\\s\\S]*?)(?=^  [a-z0-9][a-z0-9-]*:\\r?$|^networks:\\r?$)`,
      'im',
    ),
  );
  assert.ok(match, `missing Compose service ${name}`);
  return match[0];
};

test('monitoring health images retain exact digest-pinned upstream bases', () => {
  assert.ok(
    dockerfile.startsWith(
      '# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e',
    ),
  );
  for (const [target, image] of Object.entries(upstreamImages)) {
    const suffix = target === 'healthProbe' ? ' AS health-probe' : ` AS ${target}`;
    assert.ok(
      dockerfile.includes(`FROM ${image}${suffix}`),
      `missing exact pinned base for ${target}`,
    );
  }
  assert.doesNotMatch(dockerfile, /^RUN /m);
  assert.doesNotMatch(dockerfile, /\b(?:apk|apt-get|curl)\b/);
});

test('minimal derivative images copy only the static BusyBox wget probe', () => {
  const copies = dockerfile.match(
    /^COPY --from=health-probe --chmod=0555 \/bin\/wget \/usr\/local\/bin\/wget$/gm,
  ) ?? [];
  assert.equal(copies.length, 4);

  for (const target of ['mongodb-exporter', 'redis-exporter', 'loki', 'alloy']) {
    const block = serviceBlock(target);
    assert.match(
      block,
      new RegExp(`image: menorah-local-staging/${target}:runtime`),
    );
    assert.match(block, /pull_policy: build/);
    assert.match(block, /dockerfile: Dockerfile\.monitoring-health/);
    assert.match(block, new RegExp(`target: ${target}`));
  }
});

test('all local monitoring processes expose exec-form HTTP healthchecks', () => {
  const expectations = Object.freeze({
    'blackbox-exporter': {
      binary: '/bin/wget',
      endpoint: 'http://127.0.0.1:9115/-/ready',
    },
    'mongodb-exporter': {
      binary: '/usr/local/bin/wget',
      endpoint: 'http://127.0.0.1:9216/metrics',
    },
    'redis-exporter': {
      binary: '/usr/local/bin/wget',
      endpoint: 'http://127.0.0.1:9121/metrics',
    },
    loki: {
      binary: '/usr/local/bin/wget',
      endpoint: 'http://127.0.0.1:3100/ready',
    },
    alloy: {
      binary: '/usr/local/bin/wget',
      endpoint: 'http://127.0.0.1:12345/-/ready',
    },
  });

  for (const [name, { binary, endpoint }] of Object.entries(expectations)) {
    const block = serviceBlock(name);
    assert.match(block, /healthcheck:\r?\n\s+test:\r?\n\s+- CMD\r?$/m);
    assert.ok(block.includes(`- ${binary}`), `${name} must use ${binary}`);
    assert.ok(block.includes(`- ${endpoint}`), `${name} must probe ${endpoint}`);
    assert.doesNotMatch(block, /CMD-SHELL/);
    assert.match(block, /read_only: true/);
    assert.match(block, /cap_drop:\r?\n\s+- ALL/);
    assert.match(block, /security_opt:\r?\n\s+- no-new-privileges:true/);
  }
});

test('Prometheus and Alloy wait for healthy monitoring dependencies', () => {
  const prometheus = serviceBlock('prometheus');
  for (const dependency of [
    'blackbox-exporter',
    'mongodb-exporter',
    'redis-exporter',
    'alloy',
    'loki',
  ]) {
    assert.match(
      prometheus,
      new RegExp(
        `${escapePattern(dependency)}:\\r?\\n\\s+condition: service_healthy`,
      ),
    );
  }

  assert.match(
    serviceBlock('alloy'),
    /loki:\r?\n\s+condition: service_healthy/,
  );
});
