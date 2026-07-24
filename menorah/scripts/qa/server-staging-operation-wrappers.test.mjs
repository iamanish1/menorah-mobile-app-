import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const deploymentDirectory = fileURLToPath(
  new URL('../../deploy/server-staging/', import.meta.url),
);
const read = (name) => readFileSync(
  path.join(deploymentDirectory, name),
  'utf8',
);
const sources = Object.freeze({
  backup: read('run-consistent-backup.sh'),
  restore: read('run-disposable-restore.sh'),
});
const processAuthoritySource = read('assert-process-authority.sh');
const writerServices = Object.freeze([
  'staging-api-ios',
  'staging-api-android',
  'staging-api-web',
  'staging-api-admin',
  'staging-worker',
  'staging-user-web-app',
]);
const bashPath = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  ].find(existsSync)
  : '/bin/bash';
const posix = (value) => value.replaceAll('\\', '/');

const mockNode = `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${2-}" == "--emit0" ]]; then
  printf '%s\\0%s\\0' \\
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID menorah-server-staging-v1 \\
    MENORAH_SERVER_STAGING_DOTENV_LOAD_COMPLETE safe-dotenv-v1
  exit 0
fi
printf 'assert:%s\\n' "\${2-}" >> "\${MOCK_TRACE}"
`;

const mockRealpath = `#!/usr/bin/env bash
set -euo pipefail
[[ "\${1-}" == "-e" ]] && shift
[[ "\${1-}" == "--" ]] && shift
printf '%s\\n' "$1"
`;

const mockSleep = `#!/usr/bin/env bash
exit 0
`;

const mockDocker = `#!/usr/bin/env bash
set -euo pipefail
trace() { printf '%s\\n' "$1" >> "\${MOCK_TRACE}"; }
service_from_id() { printf '%s' "\${1#id-}"; }
state_file() { printf '%s/%s' "\${MOCK_STATE}" "$1"; }

if [[ "\${1-}" == ps ]]; then
  service=''
  for argument in "$@"; do
    case "\${argument}" in
      label=com.docker.compose.service=*)
        service="\${argument#label=com.docker.compose.service=}" ;;
    esac
  done
  [[ -n "\${service}" ]] || exit 2
  if [[ -f "$(state_file "\${service}")" ]]; then
    printf 'id-%s\\n' "\${service}"
  fi
  exit 0
fi

if [[ "\${1-}" == inspect ]]; then
  id="\${@: -1}"
  service="$(service_from_id "\${id}")"
  state="$(cat "$(state_file "\${service}")")"
  if [[ "$*" == *".State.ExitCode"* ]]; then
    if [[ "\${service}" == staging-mongo-restore-replica-init ]]; then
      printf 'exited|false|0|false|menorah-staging|%s\\n' "\${service}"
    else
      printf '%s|%s|0|false|menorah-staging|%s\\n' \\
        "\${state}" "$([[ "\${state}" == running ]] && echo true || echo false)" \\
        "\${service}"
    fi
  elif [[ "$*" == *".State.Status"* ]]; then
    printf '%s|%s|healthy|menorah-staging|%s\\n' \\
      "\${state}" "$([[ "\${state}" == running ]] && echo true || echo false)" \\
      "\${service}"
  else
    printf 'menorah-staging|%s\\n' "\${service}"
  fi
  exit 0
fi

if [[ "\${1-}" == stop ]]; then
  shift
  for argument in "$@"; do
    [[ "\${argument}" == --time || "\${argument}" == 30 ]] && continue
    service="$(service_from_id "\${argument}")"
    printf exited > "$(state_file "\${service}")"
    trace "stop:\${service}"
  done
  exit 0
fi

if [[ "\${1-}" == start ]]; then
  shift
  for id in "$@"; do
    service="$(service_from_id "\${id}")"
    printf running > "$(state_file "\${service}")"
    trace "start:\${service}"
  done
  exit 0
fi

[[ "\${1-}" == compose ]] || exit 2
operation=''
service=''
for argument in "$@"; do
  case "\${argument}" in
    up|run) operation="\${argument}" ;;
    staging-mongo-restore|staging-mongo-restore-replica-init|\
staging-backup-job|staging-restore-job)
      service="\${argument}" ;;
  esac
done
[[ -n "\${operation}" && -n "\${service}" ]] || exit 2

if [[ "\${operation}" == up ]]; then
  if [[ "\${service}" == staging-mongo-restore ]]; then
    printf running > "$(state_file "\${service}")"
  else
    printf exited > "$(state_file "\${service}")"
  fi
  trace "up:\${service}"
  exit 0
fi

trace "run:\${service}:\${MENORAH_STAGING_ROOTS_ACK-}:\
\${MENORAH_STAGING_BACKUP_ACK-}:\${MENORAH_STAGING_WRITERS_QUIESCED-}:\
\${MENORAH_STAGING_RESTORE_ACK-}:\${MENORAH_STAGING_RESTORE_TARGET-}"
if [[ "\${MOCK_FAIL_JOB-}" == "\${service}" ]]; then
  if [[ "\${service}" == staging-restore-job ]]; then
    printf 'preserve for review\\n' > "\${MOCK_RESTORE_MARKER}"
  fi
  exit 41
fi
`;

const makeFixture = (kind, { failJob = '', existingMarker = false } = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), 'menorah-operation-wrapper-'));
  const mockBin = path.join(root, 'bin');
  const environmentFile = path.join(root, 'env', 'server-staging.env');
  const composeFile = path.join(root, 'app', 'compose.yml');
  const scriptDirectory = path.join(root, 'scripts');
  const stateDirectory = path.join(root, 'deploy-state', 'recovery');
  const stateStore = path.join(root, 'state');
  const trace = path.join(root, 'trace.log');
  const restoreMarker = path.join(stateDirectory, 'restore-in-progress.json');
  const restoreReview = path.join(
    stateDirectory,
    'restore-requires-review.json',
  );
  mkdirSync(mockBin, { recursive: true });
  mkdirSync(path.dirname(environmentFile), { recursive: true });
  mkdirSync(path.dirname(composeFile), { recursive: true });
  mkdirSync(scriptDirectory, { recursive: true });
  mkdirSync(stateDirectory, { recursive: true });
  mkdirSync(stateStore, { recursive: true });
  writeFileSync(environmentFile, 'SAFE_FIXTURE=true\n');
  writeFileSync(composeFile, 'services: {}\n');
  writeFileSync(path.join(scriptDirectory, 'load-environment.mjs'), '');
  writeFileSync(path.join(scriptDirectory, 'assert-context.mjs'), '');
  writeFileSync(
    path.join(scriptDirectory, 'assert-process-authority.sh'),
    processAuthoritySource,
  );
  writeFileSync(trace, '');
  if (existingMarker) {
    writeFileSync(restoreMarker, 'prior restore\n');
  }
  for (const service of writerServices) {
    writeFileSync(path.join(stateStore, service), 'running');
  }

  for (const [name, source] of Object.entries({
    node: mockNode,
    docker: mockDocker,
    realpath: mockRealpath,
    sleep: mockSleep,
  })) {
    const target = path.join(mockBin, name);
    writeFileSync(target, source, { mode: 0o755 });
  }

  let transformed = sources[kind]
    .replaceAll(
      '/opt/menorah-staging/env/server-staging.env',
      posix(environmentFile),
    )
    .replaceAll(
      '/opt/menorah-staging/app/menorah/deploy/server-staging/compose.yml',
      posix(composeFile),
    )
    .replaceAll(
      '/opt/menorah-staging/app/menorah/deploy/server-staging',
      posix(scriptDirectory),
    )
    .replaceAll(
      '/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json',
      posix(restoreMarker),
    )
    .replaceAll(
      '/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json',
      posix(restoreReview),
    );
  const wrapper = path.join(root, `${kind}.sh`);
  writeFileSync(wrapper, transformed, { mode: 0o755 });

  const result = spawnSync(
    bashPath,
    [wrapper, ...(kind === 'restore' ? ['20260724T175050Z'] : [])],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${mockBin}${path.delimiter}${process.env.PATH}`,
        MOCK_FAIL_JOB: failJob,
        MOCK_RESTORE_MARKER: posix(restoreMarker),
        MOCK_STATE: posix(stateStore),
        MOCK_TRACE: posix(trace),
      },
    },
  );
  return {
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    result,
    restoreMarker,
    stateStore,
    trace: readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean),
  };
};

test('wrapper sources pin exact authority and bounded service sets', () => {
  assert.ok(bashPath, 'bash is required for wrapper contract tests');
  for (const source of Object.values(sources)) {
    assert.match(source, /--project-name "\$\{EXPECTED_PROJECT\}"/);
    assert.match(source, /-f "\$\{REVIEWED_COMPOSE_FILE\}"/);
    assert.match(source, /--env-file "\$\{ENV_FILE\}"/);
    assert.match(source, /load-environment\.mjs/);
    assert.match(source, /assert-context\.mjs/);
    assert.match(source, /assert-process-authority\.sh/);
    assert.match(
      source,
      /COMPOSE_PROJECT_NAME="\$\{EXPECTED_PROJECT\}"\nexport COMPOSE_PROJECT_NAME/,
    );
    assert.match(source, /label=com\.docker\.compose\.project=/);
    assert.match(source, /label=com\.docker\.compose\.service=/);
    assert.match(
      source,
      /operation acknowledgments must not be persisted in the environment/,
    );
    assert.doesNotMatch(source, /export MENORAH_STAGING_(?:ROOTS|BACKUP|RESTORE|WRITERS)/);
    assert.doesNotMatch(source, /docker (?:stop|start) \$\(/);
  }
  const declaredWriters = [
    ...sources.backup.matchAll(/^\s{2}(staging-[a-z-]+)$/gm),
  ].map((match) => match[1]);
  assert.deepEqual(declaredWriters, writerServices);
  assert.match(sources.backup, /trap restart_writers EXIT/);
  assert.match(
    sources.backup,
    /docker stop --time 30 "\$\{writer_ids\[@\]\}"/,
  );
  assert.match(sources.backup, /docker start "\$\{stopped_ids\[@\]\}"/);
  assert.match(
    sources.restore,
    /up -d --no-deps --wait --wait-timeout 300[\s\\]*--force-recreate/,
  );
  assert.match(
    sources.restore,
    /up -d --force-recreate "\$\{INITIALIZER_SERVICE\}"/,
  );
  assert.doesNotMatch(
    sources.restore,
    /up -d --no-deps --force-recreate "\$\{INITIALIZER_SERVICE\}"/,
  );
  assert.match(sources.restore, /\.State\.ExitCode/);
  assert.match(sources.restore, /\.State\.OOMKilled/);
  assert.doesNotMatch(
    sources.restore,
    /rm\s+-[^\n]*RESTORE_(?:MARKER|REVIEW)/,
  );
});

test('wrapper health polling uses a bounded arithmetic loop without unused iterators', () => {
  for (const source of Object.values(sources)) {
    assert.doesNotMatch(source, /for attempt in \$\(seq /);
    assert.match(
      source,
      /for \(\(attempt = 0; attempt < 60; attempt \+= 1\)\); do/,
    );
  }
});

test('consistent backup stops, backs up, and restarts exactly six writers', () => {
  const fixture = makeFixture('backup');
  try {
    assert.equal(
      fixture.result.status,
      0,
      fixture.result.stderr || fixture.result.stdout,
    );
    const stops = fixture.trace.filter((line) => line.startsWith('stop:'));
    const starts = fixture.trace.filter((line) => line.startsWith('start:'));
    assert.deepEqual(stops, writerServices.map((name) => `stop:${name}`));
    assert.deepEqual(starts, writerServices.map((name) => `start:${name}`));
    const runIndex = fixture.trace.findIndex(
      (line) => line.startsWith('run:staging-backup-job:'),
    );
    assert.ok(runIndex > fixture.trace.lastIndexOf(stops.at(-1)));
    assert.ok(runIndex < fixture.trace.indexOf(starts[0]));
    assert.match(
      fixture.trace[runIndex],
      /MENORAH_STAGING_ROOTS_REVIEWED:BACKUP_MENORAH_STAGING_SYNTHETIC_DATA:APPLICATION_WRITERS_STOPPED/,
    );
  } finally {
    fixture.cleanup();
  }
});

test('consistent backup failure still restarts the exact stopped writers', () => {
  const fixture = makeFixture('backup', {
    failJob: 'staging-backup-job',
  });
  try {
    assert.equal(fixture.result.status, 41);
    assert.deepEqual(
      fixture.trace.filter((line) => line.startsWith('start:')),
      writerServices.map((name) => `start:${name}`),
    );
    for (const service of writerServices) {
      assert.equal(
        readFileSync(path.join(fixture.stateStore, service), 'utf8'),
        'running',
      );
    }
  } finally {
    fixture.cleanup();
  }
});

test('disposable restore proves initializer exit then stops only its target', () => {
  const fixture = makeFixture('restore');
  try {
    assert.equal(
      fixture.result.status,
      0,
      fixture.result.stderr || fixture.result.stdout,
    );
    assert.deepEqual(
      fixture.trace.filter(
        (line) => /^(?:up|run|stop):/.test(line),
      ).map((line) => line.split(':').slice(0, 2).join(':')),
      [
        'up:staging-mongo-restore',
        'up:staging-mongo-restore-replica-init',
        'run:staging-restore-job',
        'stop:staging-mongo-restore',
      ],
    );
    assert.equal(existsSync(fixture.restoreMarker), false);
  } finally {
    fixture.cleanup();
  }
});

test('restore failure preserves its marker and still stops only the target', () => {
  const fixture = makeFixture('restore', {
    failJob: 'staging-restore-job',
  });
  try {
    assert.equal(fixture.result.status, 41);
    assert.equal(existsSync(fixture.restoreMarker), true);
    assert.deepEqual(
      fixture.trace.filter((line) => line.startsWith('stop:')),
      ['stop:staging-mongo-restore'],
    );
  } finally {
    fixture.cleanup();
  }
});

test('existing restore state refuses all Docker mutation', () => {
  const fixture = makeFixture('restore', { existingMarker: true });
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.match(fixture.result.stderr, /restore is already in progress/);
    assert.deepEqual(fixture.trace, []);
    assert.equal(existsSync(fixture.restoreMarker), true);
  } finally {
    fixture.cleanup();
  }
});
