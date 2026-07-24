import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL(
    '../../deploy/server-staging/discover-server-readonly.sh',
    import.meta.url,
  ),
  'utf8',
);

const executableSource = source
  .split(/\r?\n/)
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

test('discovery declares and preserves the metadata-only contract', () => {
  assert.match(source, /^#!\/usr\/bin\/env bash\r?$/m);
  assert.match(source, /^exec 2>\/dev\/null\r?$/m);
  assert.match(source, /schema=menorah-server-discovery-v1/);
  assert.match(source, /mode=read-only-metadata/);
  assert.match(source, /secret-values=omitted/);
  assert.match(source, /database-content=not-inspected/);
  assert.match(source, /discovery=complete/);
});

test('discovery covers collision metadata with value-scoped inspection', () => {
  for (const required of [
    'hostname',
    'uname -srm',
    'nproc',
    'MemTotal:',
    'df -PT',
    'findmnt -rn',
    'docker version',
    'docker compose version',
    'docker compose ls --all --format json',
    'docker ps -a',
    'com.docker.compose.project',
    'com.docker.compose.service',
    'docker network ls',
    'docker network inspect',
    'docker volume ls',
    'docker volume inspect',
    'docker-container-isolation-metadata',
    'docker inspect',
    '.HostConfig.RestartPolicy.Name',
    '.HostConfig.Memory',
    '.HostConfig.NanoCpus',
    '.HostConfig.PidsLimit',
    '.HostConfig.ReadonlyRootfs',
    'range .Mounts',
    'docker stats --no-stream',
    'ss -H -lntu',
    'systemctl list-unit-files',
    'systemctl show',
    '--property=FragmentPath',
    '--property=ActiveState',
    '--property=SubState',
    '--property=UnitFileState',
    'ingress-config-file-metadata',
  ]) {
    assert.ok(
      source.includes(required),
      `read-only discovery is missing ${required}`,
    );
  }
  assert.doesNotMatch(executableSource, /\bdocker\s+exec\b/);
  assert.doesNotMatch(executableSource, /\.Config\.Env\b|\.Config\.Cmd\b/);
  assert.equal(
    (source.match(/\bdocker inspect\b/g) || []).length,
    (source.match(/\bdocker inspect\s+\\\r?\n\s+--format\b/g) || []).length,
    'every container inspection must use a value-scoped format',
  );
  assert.match(source, /range \.IPAM\.Config/);
  assert.match(source, /\.Subnet/);
  assert.match(source, /\.Gateway/);
  assert.match(source, /labels=\{\{json \.Labels\}\}/);
});

test('discovery contains no filesystem mutator or non-null output file', () => {
  const filesystemMutators = /^\s*(?:sudo\s+)?(?:mkdir|mktemp|touch|install|cp|mv|rm|rmdir|chmod|chown|chgrp|truncate|dd|ln|tar|unzip|rsync)\b/m;
  assert.doesNotMatch(executableSource, filesystemMutators);
  assert.doesNotMatch(executableSource, /\b(?:sed|perl)\s+-[^ \n]*i\b/);
  assert.doesNotMatch(executableSource, /\btee\b/);
  assert.doesNotMatch(executableSource, /(^|[^0-9])>{1,2}\s*(?!\/dev\/null\b)/m);
  assert.doesNotMatch(executableSource, /<<-?\s*['"]?[A-Za-z_]/);
});

test('discovery contains no Docker, service, network, or firewall mutator', () => {
  assert.doesNotMatch(
    executableSource,
    /\bdocker\s+(?:compose\s+)?(?:run|create|start|stop|restart|kill|rm|rmi|pull|push|build|tag|rename|update|login|logout|system\s+prune|volume\s+(?:create|rm|prune)|network\s+(?:create|rm|prune|connect|disconnect))\b/,
  );
  assert.doesNotMatch(
    executableSource,
    /\bdocker\s+compose\b[^\n]*(?:\bup\b|\bdown\b|\brun\b|\bexec\b|\brestart\b|\bstop\b|\bstart\b|\bpull\b|\bbuild\b|\bcreate\b|\brm\b)/,
  );
  assert.doesNotMatch(
    executableSource,
    /\bsystemctl\s+(?:start|stop|restart|reload|enable|disable|mask|unmask|daemon-reload)\b/,
  );
  assert.doesNotMatch(
    executableSource,
    /\b(?:ufw|iptables|ip6tables)\b|\bnft\s+(?:add|delete|flush|insert|replace)\b/,
  );
});

test('discovery cannot access databases, providers, DNS, or secret values', () => {
  assert.doesNotMatch(
    executableSource,
    /^\s*(?:mongo|mongosh|mongodump|mongorestore|redis-cli|psql|mysql)\b/m,
  );
  assert.doesNotMatch(
    executableSource,
    /^\s*(?:curl|wget|ssh|scp|sftp|dig|nslookup|host)\b/m,
  );
  assert.doesNotMatch(
    executableSource,
    /\bcloudflared\s+tunnel\b|\b(?:terraform|tofu|wrangler)\b/,
  );
  assert.doesNotMatch(
    executableSource,
    /^\s*(?:printenv|env)\b|\/proc\/[^/\s]+\/environ|docker\s+secret/m,
  );
  assert.doesNotMatch(
    executableSource,
    /\b(?:cat|head|tail|less|more)\s+.*(?:caddy|cloudflared|\.env|secret|token|credential)/i,
  );
});

test('known production and staging roots are inspected by metadata only', () => {
  for (const root of [
    '/opt/menorah/data',
    '/opt/menorah/backups',
    '/opt/menorah/deploy-state',
    '/opt/menorah/menorah',
    '/opt/menorah-staging/data',
    '/opt/menorah-staging/backups',
    '/opt/menorah-staging/deploy-state',
    '/opt/menorah-staging/logs',
    '/opt/menorah-staging/env',
    '/opt/menorah-staging/app',
  ]) {
    assert.ok(source.includes(root), `root metadata is missing ${root}`);
  }
  assert.match(
    source,
    /stat -c 'path=%n\|type=%F\|mode=%a\|owner=%u:%g'/,
  );
  assert.doesNotMatch(executableSource, /\bfind\s+\/opt\/menorah/);
  assert.doesNotMatch(executableSource, /\bls\s+.*\/opt\/menorah/);
});
