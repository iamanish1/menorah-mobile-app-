import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptUrl = new URL(
  '../../deploy/server-staging/discover-server-readonly.sh',
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);
const source = readFileSync(scriptUrl, 'utf8');

const executableSource = source
  .split(/\r?\n/)
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

function findUsableBash() {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
          'bash.exe',
        ]
      : ['/bin/bash', '/usr/bin/bash', 'bash'];

  for (const candidate of candidates) {
    if (
      candidate.includes('\\') &&
      !existsSync(candidate)
    ) {
      continue;
    }
    const probe = spawnSync(candidate, ['-c', 'exit 0'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

function toBashPath(pathValue) {
  if (process.platform !== 'win32') {
    return pathValue;
  }
  const normalized = pathValue.replaceAll('\\', '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) {
    return normalized;
  }
  return `/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

test('discovery declares a fail-closed, metadata-only contract', () => {
  assert.match(source, /^#!\/usr\/bin\/env bash\r?$/m);
  assert.match(source, /^set -uo pipefail\r?$/m);
  assert.match(source, /^exec 2>\/dev\/null\r?$/m);
  assert.match(source, /schema=menorah-server-discovery-v1/);
  assert.match(source, /mode=read-only-allow-listed-metadata/);
  assert.match(source, /docker-authority=local-system-daemon/);
  assert.match(source, /secret-values=omitted-or-redacted/);
  assert.match(source, /database-content=not-inspected/);
  assert.match(source, /log-content=not-inspected/);
  assert.match(source, /DISCOVERY_INCOMPLETE=1/);
  assert.match(source, /trap finish_on_exit EXIT/);
  assert.match(
    source,
    /if \(\( DISCOVERY_INCOMPLETE != 0 \)\); then[\s\S]*discovery=incomplete[\s\S]*exit 1/,
  );
  assert.match(source, /discovery=complete/);
});

test('Docker and Compose authority is cleared and pinned to the system socket', () => {
  assert.match(source, /compgen -A variable DOCKER_/);
  assert.match(source, /compgen -A variable COMPOSE_/);
  assert.match(source, /unset "\$\{caller_authority_name\}"/);
  assert.match(
    source,
    /readonly LOCAL_DOCKER_HOST='unix:\/\/\/var\/run\/docker\.sock'/,
  );
  assert.match(source, /export DOCKER_HOST="\$\{LOCAL_DOCKER_HOST\}"/);
  assert.match(source, /unset DOCKER_CONTEXT/);
  assert.match(
    source,
    /command docker --host "\$\{LOCAL_DOCKER_HOST\}" "\$@"/,
  );
  assert.doesNotMatch(
    executableSource,
    /(^|[^\w])docker (?!--host "\$\{LOCAL_DOCKER_HOST\}")/,
  );
});

test('discovery covers collision metadata with allow-listed inspection', () => {
  for (const required of [
    'hostname',
    'uname -srm',
    'nproc',
    'MemTotal:',
    'df -PT',
    'findmnt -rn',
    'ip -o -4 address show',
    'ip -4 route show table all',
    'docker-version',
    'local_docker compose version',
    'docker-compose-projects',
    'docker-projects-from-containers',
    'docker-projects-from-networks',
    'docker-projects-from-volumes',
    'docker-containers',
    'com.docker.compose.project',
    'com.docker.compose.service',
    'local_docker network ls',
    'local_docker network inspect',
    'local_docker volume ls',
    'local_docker volume inspect',
    'docker-container-isolation-metadata',
    'local_docker inspect',
    '.HostConfig.RestartPolicy.Name',
    '.HostConfig.Memory',
    '.HostConfig.NanoCpus',
    '.HostConfig.PidsLimit',
    '.HostConfig.ReadonlyRootfs',
    'range .Mounts',
    'local_docker stats --no-stream',
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

  assert.match(source, /range \.IPAM\.Config/);
  assert.match(source, /\.Subnet/);
  assert.match(source, /\.IPRange/);
  assert.match(source, /\.Gateway/);
  assert.match(source, /mountpoint=\{\{\.Mountpoint\}\}/);
  assert.match(source, /project=\{\{index \.Labels/);
  assert.match(source, /resource_kind=\{\{index \.Labels/);
});

test('Docker output excludes arbitrary labels, ConfigFiles, and environments', () => {
  const composeLabelNames = [
    ...source.matchAll(/com\.docker\.compose\.([a-zA-Z0-9_.-]+)/g),
  ].map((match) => match[1]);

  assert.deepEqual(
    [...new Set(composeLabelNames)].sort(),
    ['network', 'project', 'service', 'volume'],
  );
  assert.doesNotMatch(executableSource, /\{\{\s*json\s+\.Labels\s*\}\}/);
  assert.doesNotMatch(executableSource, /labels=\{\{/);
  assert.doesNotMatch(executableSource, /\.Config\.Env\b|\.Config\.Cmd\b/);
  assert.doesNotMatch(executableSource, /\bConfigFiles\b/);
  assert.doesNotMatch(
    executableSource,
    /\blocal_docker\s+compose\s+ls\b|\bdocker\s+compose\s+ls\b/,
  );
  assert.doesNotMatch(executableSource, /\bdocker\s+exec\b/);
});

test('mount output omits options and secret-like values are redacted', () => {
  assert.doesNotMatch(
    executableSource,
    /findmnt[^\n]*\bOPTIONS\b|mount_options=/,
  );
  for (const secretKind of [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'credential',
    'api[_-]?key',
    'access[_-]?key',
    'private[_-]?key',
    'client[_-]?secret',
  ]) {
    assert.ok(
      source.includes(secretKind),
      `sanitizer does not cover ${secretKind}`,
    );
  }
  assert.match(source, /\[REDACTED\]/);
});

test('discovery contains no filesystem mutator or non-null output file', () => {
  const filesystemMutators =
    /^\s*(?:sudo\s+)?(?:mkdir|mktemp|touch|install|cp|mv|rm|rmdir|chmod|chown|chgrp|truncate|dd|ln|tar|unzip|rsync)\b/m;
  assert.doesNotMatch(executableSource, filesystemMutators);
  assert.doesNotMatch(executableSource, /\b(?:sed|perl)\s+-[^ \n]*i\b/);
  assert.doesNotMatch(executableSource, /\btee\b/);
  assert.doesNotMatch(
    executableSource,
    /(^|[^0-9])>{1,2}\s*(?!\/dev\/null\b)/m,
  );
  assert.doesNotMatch(executableSource, /<<-?\s*['"]?[A-Za-z_]/);
});

test('discovery contains no Docker, service, network, or firewall mutator', () => {
  assert.doesNotMatch(
    executableSource,
    /\b(?:docker|local_docker)\s+(?:compose\s+)?(?:run|create|start|stop|restart|kill|rm|rmi|pull|push|build|tag|rename|update|login|logout|system\s+prune|volume\s+(?:create|rm|prune)|network\s+(?:create|rm|prune|connect|disconnect))\b/,
  );
  assert.doesNotMatch(
    executableSource,
    /\b(?:docker|local_docker)\s+compose\b[^\n]*(?:\bup\b|\bdown\b|\brun\b|\bexec\b|\brestart\b|\bstop\b|\bstart\b|\bpull\b|\bbuild\b|\bcreate\b|\brm\b)/,
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

test('discovery cannot access databases, providers, DNS, logs, or raw secret values', () => {
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
    /\b(?:cat|head|tail|less|more|journalctl)\b/,
  );
  assert.doesNotMatch(executableSource, /\bsystemctl\s+cat\b/);
});

test('current and historical production layouts are inspected by metadata only', () => {
  for (const root of [
    '/opt/menorah/data',
    '/opt/menorah/backups',
    '/opt/menorah/deploy-state',
    '/opt/menorah/menorah-mobile-app-',
    '/opt/menorah/menorah-mobile-app-/menorah',
    '/opt/menorah/menorah',
    '/opt/menorah/menorah/menorah',
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
  assert.match(source, /readlink -f -- "\$\{reviewed_root\}"/);
  assert.doesNotMatch(executableSource, /\bfind\s+\/opt\/menorah/);
  assert.doesNotMatch(executableSource, /\bls\s+.*\/opt\/menorah/);
});

test(
  'failure shims cannot leak canaries and force an incomplete nonzero result',
  { timeout: 30_000 },
  (context) => {
    const bash = findUsableBash();
    if (!bash) {
      context.skip('a usable Bash executable is unavailable');
      return;
    }

    const fixtureRoot = mkdtempSync(
      join(tmpdir(), 'menorah-discovery-shim-'),
    );
    const shimDirectory = join(fixtureRoot, 'bin');
    const canary = 'MENORAH_DISCOVERY_TEST_CANARY_7f9d3a';

    try {
      const mkdirResult = spawnSync(
        bash,
        ['-c', 'mkdir -p -- "$1"', 'discovery-test', toBashPath(shimDirectory)],
        {
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      assert.equal(mkdirResult.status, 0, mkdirResult.stderr);

      const shims = {
        docker: String.raw`#!/usr/bin/env bash
set -u
if [[ "\${1-}" != '--host' || "\${2-}" != 'unix:///var/run/docker.sock' ]]; then
  printf 'authority-token=%s\n' "\${TEST_CANARY}"
  exit 81
fi
shift 2
if [[ "\${DOCKER_HOST-}" != 'unix:///var/run/docker.sock' ]]; then
  printf 'docker-host-token=%s\n' "\${TEST_CANARY}"
  exit 82
fi
for authority_name in DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_CONFIG COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES; do
  if [[ -n "\${!authority_name+x}" ]]; then
    printf 'caller-authority-token=%s\n' "\${TEST_CANARY}"
    exit 83
  fi
done

case "\${1-}:\${2-}" in
  version:--format)
    printf '%s\n' 'client=shim|server=shim'
    ;;
  compose:version)
    printf '%s\n' 'Docker Compose version shim'
    ;;
  compose:ls)
    printf '%s\n' "\${TEST_CANARY}"
    exit 84
    ;;
  ps:-aq)
    ;;
  ps:-a)
    if [[ "$*" == *'ConfigFiles'* || "$*" == *'json .Labels'* ]]; then
      printf '%s\n' "\${TEST_CANARY}"
      exit 85
    fi
    if [[ "$*" == *'{{.Label "com.docker.compose.project"}}'* ]]; then
      printf '%s\n' 'shim-project'
    elif [[ "$*" == *'ports='* ]]; then
      printf '%s\n' 'name=shim-container|ports=127.0.0.1:12345->80/tcp'
    else
      printf '%s\n' 'name=shim-container|image=shim:latest|status=Up|project=shim-project|service=shim-service'
    fi
    ;;
  network:ls)
    if [[ "$*" == *' -q'* ]]; then
      :
    elif [[ "$*" == *'com.docker.compose.project'* ]]; then
      printf '%s\n' 'shim-project'
    else
      printf '%s\n' 'name=shim-network|driver=bridge|scope=local'
    fi
    ;;
  volume:ls)
    if [[ "$*" == *' -q'* ]]; then
      :
    elif [[ "$*" == *'com.docker.compose.project'* ]]; then
      printf '%s\n' 'shim-project'
    else
      printf '%s\n' 'name=shim-volume|driver=local'
    fi
    ;;
  stats:--no-stream)
    printf 'token=%s\n' "\${TEST_CANARY}"
    exit 23
    ;;
  *)
    printf 'unexpected-docker-token=%s\n' "\${TEST_CANARY}"
    exit 86
    ;;
esac
`,
        hostname: String.raw`#!/usr/bin/env bash
printf 'host-token=%s\n' "\${TEST_CANARY}"
`,
        ip: String.raw`#!/usr/bin/env bash
case "$*" in
  '-o -4 address show')
    printf '%s\n' '2: eth0 inet 10.23.4.5/24 scope global eth0'
    ;;
  '-4 route show table all')
    printf '%s\n' '10.23.4.0/24 dev eth0 scope link'
    ;;
  *)
    exit 2
    ;;
esac
`,
        findmnt: String.raw`#!/usr/bin/env bash
if [[ "$*" == *'OPTIONS'* ]]; then
  printf '%s\n' "\${TEST_CANARY}"
  exit 91
fi
printf '/srv/secret/%s /dev/shim ext4\n' "\${TEST_CANARY}"
`,
        ss: String.raw`#!/usr/bin/env bash
printf '%s\n' 'tcp LISTEN 0 128 127.0.0.1:32123 0.0.0.0:*'
`,
        systemctl: String.raw`#!/usr/bin/env bash
case "\${1-}" in
  list-unit-files)
    exit 0
    ;;
  *)
    exit 3
    ;;
esac
`,
      };

      for (const [name, body] of Object.entries(shims)) {
        const shimPath = join(shimDirectory, name);
        writeFileSync(shimPath, body.replaceAll('\\${', '${'), 'utf8');
        chmodSync(shimPath, 0o755);
      }

      const inheritedPath =
        process.env.PATH ??
        process.env.Path ??
        (process.platform === 'win32'
          ? 'C:\\Windows\\System32'
          : '/usr/bin:/bin');
      const cleanEnvironment = {
        PATH: inheritedPath,
        HOME: fixtureRoot,
        TMPDIR: fixtureRoot,
        TEMP: fixtureRoot,
        TMP: fixtureRoot,
        TEST_CANARY: canary,
        LC_ALL: 'C',
        DOCKER_HOST: `ssh://token=${canary}@remote.invalid`,
        DOCKER_CONTEXT: `remote-token=${canary}`,
        DOCKER_TLS_VERIFY: '1',
        DOCKER_CERT_PATH: `/tmp/secret/${canary}`,
        DOCKER_CONFIG: `/tmp/credential/${canary}`,
        COMPOSE_FILE: `/tmp/secret/${canary}.yml`,
        COMPOSE_PROJECT_NAME: `token=${canary}`,
        COMPOSE_PROFILES: `secret=${canary}`,
      };
      if (process.platform === 'win32') {
        cleanEnvironment.SystemRoot =
          process.env.SystemRoot ?? 'C:\\Windows';
        cleanEnvironment.WINDIR =
          process.env.WINDIR ?? cleanEnvironment.SystemRoot;
      }

      const result = spawnSync(
        bash,
        [
          '-c',
          'export PATH="$1:$PATH"; exec "$BASH" "$2"',
          'discovery-test',
          toBashPath(shimDirectory),
          toBashPath(scriptPath),
        ],
        {
          encoding: 'utf8',
          env: cleanEnvironment,
          timeout: 30_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );

      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0, result.stdout);
      assert.doesNotMatch(result.stdout, new RegExp(canary, 'g'));
      assert.equal(result.stderr, '');
      assert.match(result.stdout, /\[host-ipv4-addresses\]/);
      assert.match(result.stdout, /10\.23\.4\.5\/24/);
      assert.match(result.stdout, /\[host-ipv4-routes\]/);
      assert.match(result.stdout, /10\.23\.4\.0\/24/);
      assert.match(result.stdout, /\[docker-compose-projects\]/);
      assert.match(result.stdout, /project=shim-project/);
      assert.match(result.stdout, /producer=docker-stats\|status=unavailable\|exit=23/);
      assert.match(result.stdout, /\[REDACTED\]/);
      assert.match(result.stdout, /\[listening-sockets\]/);
      assert.match(result.stdout, /127\.0\.0\.1:32123/);
      assert.match(result.stdout, /\[completion\]\ndiscovery=incomplete\s*$/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  },
);
