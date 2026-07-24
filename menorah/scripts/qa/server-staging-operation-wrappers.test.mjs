import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
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
const fixtureSha = 'a'.repeat(40);
const fixtureBlob = 'b'.repeat(40);
const cleanBashSentinel = '__menorah_server_staging_clean_bash_v1__';

const mockNode = `#!/usr/bin/env bash
set -euo pipefail
case "\${1##*/}" in
  validate-environment.mjs)
    [[ "\${2-}" == --env && "\${3-}" == "\${MOCK_ENV_FILE}" ]]
    printf 'preflight:environment\\n' >> "\${MOCK_TRACE}"
    [[ "\${MOCK_ENV_FAIL-}" != true ]]
    exit 0
    ;;
  load-environment.mjs)
    [[ "\${2-}" == --emit0 && "\${3-}" == "\${MOCK_ENV_FILE}" ]]
    values=(
      COMPOSE_PROJECT_NAME menorah-staging
      MENORAH_SERVER_STAGING_ENVIRONMENT_ID menorah-server-staging-v1
      MENORAH_SERVER_STAGING_ROOT /opt/menorah-staging
      MENORAH_SERVER_STAGING_APP_ROOT /opt/menorah-staging/app
      MENORAH_SERVER_STAGING_DATA_ROOT /opt/menorah-staging/data
      MENORAH_SERVER_STAGING_BACKUP_ROOT /opt/menorah-staging/backups
      MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT /opt/menorah-staging/deploy-state
      MENORAH_SERVER_STAGING_LOGS_ROOT /opt/menorah-staging/logs
      MENORAH_SERVER_STAGING_ENV_ROOT /opt/menorah-staging/env
      MONGO_DATABASE menorah_staging
      MONGODB_REPLICA_SET_NAME menorah-staging-rs
      MONGODB_RESTORE_REPLICA_SET_NAME menorah-staging-restore-rs
      MENORAH_RUNTIME_CANDIDATE_SHA "\${MOCK_SHA}"
      MENORAH_SERVER_STAGING_RUNTIME_SHA "\${MOCK_SHA}"
      MENORAH_SERVER_STAGING_DOTENV_LOAD_COMPLETE safe-dotenv-v1
    )
    for ((index = 0; index < \${#values[@]}; index += 2)); do
      printf '%s\\0%s\\0' "\${values[index]}" "\${values[index + 1]}"
    done
    exit 0
    ;;
  assert-context.mjs)
    mode="\${2-}"
    for exact in \\
      'COMPOSE_PROJECT_NAME=menorah-staging' \\
      'MENORAH_SERVER_STAGING_ENVIRONMENT_ID=menorah-server-staging-v1' \\
      'MENORAH_SERVER_STAGING_ROOT=/opt/menorah-staging' \\
      'MENORAH_SERVER_STAGING_APP_ROOT=/opt/menorah-staging/app' \\
      'MENORAH_SERVER_STAGING_DATA_ROOT=/opt/menorah-staging/data' \\
      'MENORAH_SERVER_STAGING_BACKUP_ROOT=/opt/menorah-staging/backups' \\
      'MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT=/opt/menorah-staging/deploy-state' \\
      'MENORAH_SERVER_STAGING_LOGS_ROOT=/opt/menorah-staging/logs' \\
      'MENORAH_SERVER_STAGING_ENV_ROOT=/opt/menorah-staging/env' \\
      'MONGO_DATABASE=menorah_staging' \\
      'MONGODB_REPLICA_SET_NAME=menorah-staging-rs' \\
      'MONGODB_RESTORE_REPLICA_SET_NAME=menorah-staging-restore-rs'
    do
      key="\${exact%%=*}"
      expected="\${exact#*=}"
      [[ "\${!key-}" == "\${expected}" ]]
    done
    case "\${mode}" in
      backup)
        [[ "\${MENORAH_STAGING_ROOTS_ACK-}" == MENORAH_STAGING_ROOTS_REVIEWED ]]
        [[ "\${MENORAH_STAGING_BACKUP_ACK-}" == BACKUP_MENORAH_STAGING_SYNTHETIC_DATA ]]
        [[ "\${MENORAH_STAGING_WRITERS_QUIESCED-}" == APPLICATION_WRITERS_STOPPED ]]
        ;;
      restore)
        [[ "\${MENORAH_STAGING_ROOTS_ACK-}" == MENORAH_STAGING_ROOTS_REVIEWED ]]
        [[ "\${MENORAH_STAGING_RESTORE_ACK-}" == RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET ]]
        [[ "\${MENORAH_STAGING_RESTORE_TARGET-}" == staging-mongo-restore ]]
        ;;
      release)
        [[ "\${3-}" == "\${MOCK_SHA}" ]]
        ;;
      *) exit 2 ;;
    esac
    printf 'assert:%s\\n' "\${mode}" >> "\${MOCK_TRACE}"
    ;;
  *) exit 2 ;;
esac
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

const mockGit = `#!/usr/bin/env bash
set -euo pipefail
printf 'git:%s\\n' "$*" >> "\${MOCK_TRACE}"
[[ "\${1-}" == -C ]] && shift 2
case "\${1-}" in
  cat-file)
    [[ "\${2-}" == -e && "\${3-}" == "\${MOCK_SHA}^{commit}" ]]
    ;;
  rev-parse)
    if [[ "\${2-}" == HEAD ]]; then
      printf '%s\\n' "\${MOCK_SHA}"
    else
      [[ "\${2-}" == "\${MOCK_SHA}:"* ]]
      printf '%s\\n' "\${MOCK_BLOB}"
    fi
    ;;
  status)
    if [[ "\${MOCK_GIT_DIRTY-}" == true ]]; then
      printf ' M menorah/deploy/server-staging/wrapper.sh\\n'
    fi
    ;;
  hash-object)
    if [[ "\${MOCK_SCRIPT_TAMPER-}" == true ]]; then
      printf '%040d\\n' 0
    else
      printf '%s\\n' "\${MOCK_BLOB}"
    fi
    ;;
  *) exit 2 ;;
esac
`;

const mockFlock = `#!/usr/bin/env bash
set -euo pipefail
printf 'lock:deploy\\n' >> "\${MOCK_TRACE}"
[[ "\${MOCK_LOCK_UNAVAILABLE-}" != true ]]
`;

const mockRuntimeVerifier = `#!/usr/bin/env bash
set -euo pipefail
[[ "$#" -eq 1 && "$1" == "\${MOCK_MANIFEST}" && -f "$1" ]]
printf 'preflight:runtime\\n' >> "\${MOCK_TRACE}"
[[ "\${MOCK_RUNTIME_FAIL-}" != true ]]
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
\${MENORAH_STAGING_RESTORE_ACK-}:\${MENORAH_STAGING_RESTORE_TARGET-}:\
\${MENORAH_STAGING_BACKUP_SESSION_ID-}:\${MENORAH_STAGING_RESTORE_SESSION_ID-}"
if [[ "\${MOCK_DISAPPEAR_RESTORE-}" == true \
  && "\${service}" == staging-restore-job ]]
then
  rm -f -- "$(state_file staging-mongo-restore)"
fi
if [[ "\${MOCK_FAIL_JOB-}" == "\${service}" ]]; then
  if [[ "\${service}" == staging-restore-job ]]; then
    printf 'preserve for review\\n' > "\${MOCK_RESTORE_MARKER}"
  fi
  exit 41
fi
`;

const makeFixture = (
  kind,
  {
    dirtyCheckout = false,
    environmentFailure = false,
    existingMarker = false,
    existingOperationLock = false,
    existingSession = false,
    failJob = '',
    invalidShaMarker = false,
    lockUnavailable = false,
    runtimeFailure = false,
    disappearRestore = false,
    tamperedWrapper = false,
  } = {},
) => {
  const root = mkdtempSync(path.join(tmpdir(), 'menorah-operation-wrapper-'));
  const mockBin = path.join(root, 'bin');
  const environmentFile = path.join(root, 'env', 'server-staging.env');
  const appRoot = path.join(root, 'app');
  const composeFile = path.join(appRoot, 'compose.yml');
  const scriptDirectory = path.join(root, 'scripts');
  const deployStateRoot = path.join(root, 'deploy-state');
  const releaseState = path.join(deployStateRoot, 'releases');
  const stateDirectory = path.join(deployStateRoot, 'recovery');
  const stateStore = path.join(root, 'state');
  const trace = path.join(root, 'trace.log');
  const deployLock = path.join(deployStateRoot, '.deploy.lock');
  const operationLock = path.join(
    deployStateRoot,
    kind === 'backup' ? '.backup.lock' : '.restore.lock',
  );
  const operationSession = path.join(
    stateDirectory,
    kind === 'backup' ? 'backup-session' : 'restore-session',
  );
  const currentShaFile = path.join(deployStateRoot, 'current-sha');
  const manifest = path.join(releaseState, `${fixtureSha}.images`);
  const restoreMarker = path.join(stateDirectory, 'restore-in-progress.json');
  const restoreReview = path.join(
    stateDirectory,
    'restore-requires-review.json',
  );
  mkdirSync(mockBin, { recursive: true });
  mkdirSync(path.dirname(environmentFile), { recursive: true });
  mkdirSync(path.dirname(composeFile), { recursive: true });
  mkdirSync(scriptDirectory, { recursive: true });
  mkdirSync(releaseState, { recursive: true });
  mkdirSync(stateDirectory, { recursive: true });
  mkdirSync(stateStore, { recursive: true });
  writeFileSync(environmentFile, 'SAFE_FIXTURE=true\n');
  writeFileSync(composeFile, 'services: {}\n');
  writeFileSync(path.join(scriptDirectory, 'load-environment.mjs'), '');
  writeFileSync(path.join(scriptDirectory, 'validate-environment.mjs'), '');
  writeFileSync(path.join(scriptDirectory, 'assert-context.mjs'), '');
  writeFileSync(
    path.join(scriptDirectory, 'verify-runtime-services.sh'),
    mockRuntimeVerifier,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(scriptDirectory, 'assert-process-authority.sh'),
    processAuthoritySource,
  );
  writeFileSync(
    currentShaFile,
    invalidShaMarker
      ? `${fixtureSha}\n${fixtureSha}\n`
      : `${fixtureSha}\n`,
  );
  writeFileSync(manifest, 'fixture manifest\n');
  writeFileSync(trace, '');
  if (existingMarker) {
    writeFileSync(restoreMarker, 'prior restore\n');
  }
  if (existingOperationLock) {
    writeFileSync(operationLock, 'prior operation\n');
  }
  if (existingSession) {
    writeFileSync(operationSession, 'stale operation session\n');
  }
  for (const service of writerServices) {
    writeFileSync(path.join(stateStore, service), 'running');
  }

  for (const [name, source] of Object.entries({
    node: mockNode,
    docker: mockDocker,
    flock: mockFlock,
    git: mockGit,
    realpath: mockRealpath,
    sleep: mockSleep,
  })) {
    const target = path.join(mockBin, name);
    writeFileSync(target, source, { mode: 0o755 });
  }

  let transformed = sources[kind]
    .replaceAll(
      'git -C',
      `"${posix(path.join(mockBin, 'git'))}" -C`,
    )
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
      '/opt/menorah-staging/deploy-state/releases',
      posix(releaseState),
    )
    .replaceAll(
      '/opt/menorah-staging/deploy-state/.deploy.lock',
      posix(deployLock),
    )
    .replaceAll(
      `/opt/menorah-staging/deploy-state/${
        kind === 'backup' ? '.backup.lock' : '.restore.lock'
      }`,
      posix(operationLock),
    )
    .replaceAll(
      '/opt/menorah-staging/deploy-state/current-sha',
      posix(currentShaFile),
    )
    .replaceAll(
      '/opt/menorah-staging/deploy-state/recovery/restore-in-progress.json',
      posix(restoreMarker),
    )
    .replaceAll(
      '/opt/menorah-staging/deploy-state/recovery/restore-requires-review.json',
      posix(restoreReview),
    )
    .replaceAll(
      '/opt/menorah-staging/deploy-state',
      posix(deployStateRoot),
    )
    .replaceAll(
      '/opt/menorah-staging/app',
      posix(appRoot),
    );
  const wrapper = path.join(root, `${kind}.sh`);
  writeFileSync(wrapper, transformed, { mode: 0o755 });

  const result = spawnSync(
    bashPath,
    [
      wrapper,
      cleanBashSentinel,
      ...(kind === 'restore' ? ['20260724T175050Z'] : []),
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${mockBin}${path.delimiter}${process.env.PATH}`,
        MOCK_BLOB: fixtureBlob,
        MOCK_ENV_FILE: posix(environmentFile),
        MOCK_ENV_FAIL: environmentFailure ? 'true' : '',
        MOCK_DISAPPEAR_RESTORE: disappearRestore ? 'true' : '',
        MOCK_FAIL_JOB: failJob,
        MOCK_GIT_DIRTY: dirtyCheckout ? 'true' : '',
        MOCK_LOCK_UNAVAILABLE: lockUnavailable ? 'true' : '',
        MOCK_MANIFEST: posix(manifest),
        MOCK_RESTORE_MARKER: posix(restoreMarker),
        MOCK_RUNTIME_FAIL: runtimeFailure ? 'true' : '',
        MOCK_SCRIPT_TAMPER: tamperedWrapper ? 'true' : '',
        MOCK_SHA: fixtureSha,
        MOCK_STATE: posix(stateStore),
        MOCK_TRACE: posix(trace),
      },
    },
  );
  return {
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    deployLock,
    operationLock,
    operationSession,
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
    assert.match(source, /validate-environment\.mjs/);
    assert.match(source, /assert-context\.mjs/);
    assert.match(source, /assert-process-authority\.sh/);
    assert.match(source, /verify-runtime-services\.sh/);
    assert.match(
      source,
      /readonly DEPLOY_LOCK='\/opt\/menorah-staging\/deploy-state\/\.deploy\.lock'/,
    );
    assert.match(source, /exec 9>>"\$\{DEPLOY_LOCK\}"/);
    assert.match(source, /flock -n 9/);
    assert.match(source, /deploy-state\/current-sha/);
    assert.match(source, /git -C "\$\{APP_ROOT\}" rev-parse HEAD/);
    assert.match(
      source,
      /git -C "\$\{APP_ROOT\}" status --porcelain --untracked-files=all/,
    );
    assert.match(source, /git -C "\$\{APP_ROOT\}" hash-object/);
    assert.match(
      source,
      /node "\$\{CONTEXT_ASSERTION\}" release "\$\{current_release_sha\}"/,
    );
    assert.match(
      source,
      /"\$\{RUNTIME_VERIFIER\}" "\$\{manifest\}"/,
    );
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
  for (const source of Object.values(sources)) {
    for (const stateName of [
      'BACKUP_LOCK',
      'BACKUP_SESSION',
      'RESTORE_LOCK',
      'RESTORE_SESSION',
      'RESTORE_MARKER',
      'RESTORE_REVIEW',
    ]) {
      const reference = `"${'${'}${stateName}}"`;
      assert.equal(
        source.split(reference).length - 1 >= 2,
        true,
        `${stateName} must be checked before and under the shared lock`,
      );
    }
  }
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

test('all mutable Docker work follows environment, context, lock, and runtime preflight', () => {
  const backupMutation = sources.backup.indexOf(
    'docker stop --time 30 "${writer_ids[@]}"',
  );
  const restoreMutation = sources.restore.indexOf(
    'compose --profile recovery up -d',
  );
  for (const [source, mutation] of [
    [sources.backup, backupMutation],
    [sources.restore, restoreMutation],
  ]) {
    const lock = source.indexOf('flock -n 9');
    const provenance = source.indexOf(
      'assert_checkout_provenance',
      lock,
    );
    const environment = source.indexOf(
      'node "${ENV_VALIDATOR}" --env "${ENV_FILE}"',
      provenance,
    );
    const context = source.indexOf(
      'node "${CONTEXT_ASSERTION}"',
      environment,
    );
    const runtime = source.indexOf('assert_exact_runtime', lock);
    assert.ok(lock >= 0);
    assert.ok(provenance > lock);
    assert.ok(environment > provenance);
    assert.ok(context > environment);
    assert.ok(runtime > context);
    assert.ok(mutation > runtime);
  }
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
      [
        fixture.result.stderr || fixture.result.stdout,
        `trace=${JSON.stringify(fixture.trace)}`,
      ].join('\n'),
    );
    const stops = fixture.trace.filter((line) => line.startsWith('stop:'));
    const starts = fixture.trace.filter((line) => line.startsWith('start:'));
    assert.deepEqual(stops, writerServices.map((name) => `stop:${name}`));
    assert.deepEqual(starts, writerServices.map((name) => `start:${name}`));
    const runIndex = fixture.trace.findIndex(
      (line) => line.startsWith('run:staging-backup-job:'),
    );
    const environmentIndex = fixture.trace.indexOf(
      'preflight:environment',
    );
    const contextIndex = fixture.trace.indexOf('assert:backup');
    const lockIndex = fixture.trace.indexOf('lock:deploy');
    const gitIndex = fixture.trace.findIndex(
      (line) => line.includes('cat-file -e'),
    );
    const releaseIndex = fixture.trace.indexOf('assert:release');
    const runtimeIndex = fixture.trace.indexOf('preflight:runtime');
    assert.ok(lockIndex >= 0);
    assert.ok(gitIndex > lockIndex);
    assert.ok(environmentIndex > gitIndex);
    assert.ok(contextIndex > environmentIndex);
    assert.ok(releaseIndex > contextIndex);
    assert.ok(runtimeIndex > releaseIndex);
    assert.ok(fixture.trace.indexOf(stops[0]) > runtimeIndex);
    assert.ok(runIndex > fixture.trace.lastIndexOf(stops.at(-1)));
    assert.ok(runIndex < fixture.trace.indexOf(starts[0]));
    assert.match(
      fixture.trace[runIndex],
      /MENORAH_STAGING_ROOTS_REVIEWED:BACKUP_MENORAH_STAGING_SYNTHETIC_DATA:APPLICATION_WRITERS_STOPPED/,
    );
    assert.match(
      fixture.trace[runIndex],
      new RegExp(`:${fixtureSha}-[0-9]+:$`),
    );
    assert.equal(existsSync(fixture.operationSession), false);
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
    assert.equal(existsSync(fixture.operationSession), false);
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
      [
        fixture.result.stderr || fixture.result.stdout,
        `trace=${JSON.stringify(fixture.trace)}`,
      ].join('\n'),
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
    assert.equal(existsSync(fixture.operationSession), false);
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
    assert.equal(existsSync(fixture.operationSession), false);
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

for (const kind of ['backup', 'restore']) {
  test(`${kind} refuses a failed full environment preflight before mutation`, () => {
    const fixture = makeFixture(kind, { environmentFailure: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(
        fixture.result.stderr,
        /full staging environment preflight failed/,
      );
      assert.equal(fixture.trace.at(-1), 'preflight:environment');
      assert.equal(fixture.trace.includes(`assert:${kind}`), false);
      assert.equal(fixture.trace.includes('preflight:runtime'), false);
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test(`${kind} refuses a stale durable session before mutation`, () => {
    const fixture = makeFixture(kind, { existingSession: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(
        fixture.result.stderr,
        new RegExp(`staging ${kind} session is already active`),
      );
      assert.equal(existsSync(fixture.operationSession), true);
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test(`${kind} refuses shared deploy-lock contention before mutation`, () => {
    const fixture = makeFixture(kind, { lockUnavailable: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(
        fixture.result.stderr,
        /another staging deployment, rollback, backup, or restore is running/,
      );
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
      assert.equal(fixture.trace.includes('preflight:runtime'), false);
    } finally {
      fixture.cleanup();
    }
  });

  test(`${kind} refuses a stale operation lock before mutation`, () => {
    const fixture = makeFixture(kind, { existingOperationLock: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(
        fixture.result.stderr,
        new RegExp(`staging ${kind} is already running`),
      );
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
      assert.equal(fixture.trace.includes('preflight:runtime'), false);
    } finally {
      fixture.cleanup();
    }
  });

  test(`${kind} refuses a dirty exact-release checkout before mutation`, () => {
    const fixture = makeFixture(kind, { dirtyCheckout: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(
        fixture.result.stderr,
        new RegExp(`${kind} requires a clean exact-release checkout`),
      );
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test(`${kind} refuses a multi-record current-SHA marker before mutation`, () => {
    const fixture = makeFixture(kind, { invalidShaMarker: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(
        fixture.result.stderr,
        /current release marker must contain exactly one SHA record/,
      );
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test(`${kind} refuses a tampered wrapper before mutation`, () => {
    const fixture = makeFixture(kind, { tamperedWrapper: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(
        fixture.result.stderr,
        new RegExp(`${kind} wrapper is not from the recorded current release`),
      );
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
      assert.equal(fixture.trace.includes('preflight:runtime'), false);
    } finally {
      fixture.cleanup();
    }
  });

  test(`${kind} refuses runtime-manifest drift before mutation`, () => {
    const fixture = makeFixture(kind, { runtimeFailure: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.equal(fixture.trace.includes('preflight:runtime'), true);
      assert.equal(
        fixture.trace.some((line) => /^(?:stop|start|up|run):/.test(line)),
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });
}

test('restore leaves its session when an acquired target disappears', () => {
  const fixture = makeFixture('restore', { disappearRestore: true });
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.match(
      fixture.result.stderr,
      /target disappeared before stopped-state confirmation/,
    );
    assert.equal(existsSync(fixture.operationSession), true);
  } finally {
    fixture.cleanup();
  }
});
