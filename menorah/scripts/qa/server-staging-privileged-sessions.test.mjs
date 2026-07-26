import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  STATE_PATHS,
} from '../../deploy/server-staging/assert-context.mjs';

const deploymentDirectory = new URL(
  '../../deploy/server-staging/',
  import.meta.url,
);
const read = (name) => readFileSync(
  new URL(name, deploymentDirectory),
  'utf8',
);
const posix = (value) => value.replaceAll('\\', '/').replace(
  /^([A-Za-z]):/,
  (_, drive) => `/${drive.toLowerCase()}`,
);
const shellPath = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
    'C:\\Program Files\\Git\\bin\\sh.exe',
  ].find(existsSync)
  : '/bin/sh';
const bashPath = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  ].find(existsSync)
  : '/bin/bash';
const fixtureSha = 'a'.repeat(40);
const toolPath = [
  shellPath && path.dirname(shellPath),
  bashPath && path.dirname(bashPath),
  process.env.PATH,
].filter(Boolean).join(path.delimiter);
const writerInventory = [
  'staging-api-ios',
  'staging-api-android',
  'staging-api-web',
  'staging-api-admin',
  'staging-worker',
  'staging-user-web-app',
].join(',');

const entrypoints = Object.freeze([
  {
    name: 'deploy-exact-sha.sh',
    ackKey: 'MENORAH_STAGING_DEPLOY_ACK',
    ackValue: 'DEPLOY_EXACT_MENORAH_STAGING_SHA',
  },
  {
    name: 'rollback-recorded.sh',
    ackKey: 'MENORAH_STAGING_ROLLBACK_ACK',
    ackValue: 'ROLLBACK_MENORAH_STAGING_RECORDED_ARTIFACTS',
  },
  {
    name: 'resume-post-migration.sh',
    ackKey: 'MENORAH_STAGING_RECOVERY_ACK',
    ackValue: 'RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION',
  },
  {
    name: 'run-recorded-migration.sh',
    ackKey: 'MENORAH_STAGING_MIGRATION_ACK',
    ackValue: 'MIGRATE_MENORAH_STAGING_RECORDED_SHA',
  },
  {
    name: 'create-image-manifest.sh',
    ackKey: 'MENORAH_STAGING_MANIFEST_ACK',
    ackValue: 'RECORD_MENORAH_STAGING_IMMUTABLE_IMAGES',
  },
  { name: 'run-consistent-backup.sh' },
  { name: 'run-disposable-restore.sh' },
]);
const allAckKeys = entrypoints
  .map(({ ackKey }) => ackKey)
  .filter(Boolean);

const functionSource = (source, name) => {
  const start = source.indexOf(`${name}() {`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf('\n}\n', start);
  assert.ok(end > start, `unterminated ${name}`);
  return source.slice(start, end + 3);
};

test('all privileged entrypoints use the exact clean Bash trampoline', () => {
  for (const { name, ackKey } of entrypoints) {
    const source = read(name);
    const shift = source.indexOf('\nshift\n');
    assert.ok(shift > 0, `${name} must shift the internal sentinel`);
    const preamble = source.slice(0, shift + '\nshift\n'.length);
    assert.match(source, /^#!\/bin\/sh\n# shellcheck shell=bash\n/);
    assert.match(preamble, /exec \/usr\/bin\/env -i \\/);
    assert.match(preamble, /PATH=\/usr\/sbin:\/usr\/bin:\/sbin:\/bin \\/);
    assert.match(preamble, /HOME=\/root TMPDIR=\/tmp LC_ALL=C \\/);
    assert.match(preamble, /COMPOSE_PROJECT_NAME=menorah-staging \\/);
    assert.match(
      preamble,
      /\/bin\/bash --noprofile --norc "\$0" \\/,
    );
    assert.doesNotMatch(preamble, /\/usr\/local/);
    assert.doesNotMatch(preamble, /\[\[/);
    const preservedAckAssignments = [
      ...preamble.matchAll(
        /^\s*(MENORAH_STAGING_[A-Z_]+_ACK)=[A-Z_]+ \\$/gm,
      ),
    ].map((match) => match[1]);
    assert.deepEqual(
      [...new Set(preservedAckAssignments)],
      ackKey ? [ackKey] : [],
      `${name} preserves only its exact operation acknowledgment`,
    );
  }
});

test('hostile shell startup authority is absent after every clean re-exec', {
  skip: !shellPath,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'menorah-clean-entrypoint-'));
  const hostileBin = path.join(root, 'hostile-bin');
  const bashEnvironment = path.join(root, 'hostile-bash-env.sh');
  const startupCanary = path.join(root, 'startup-canary');
  const pathCanary = path.join(root, 'path-canary');
  mkdirSync(hostileBin);
  writeFileSync(bashEnvironment, [
    `printf startup > '${posix(startupCanary)}'`,
    'export HOSTILE_STARTUP_SURVIVED=true',
    'docker() { :; }',
    'export -f docker',
    '',
  ].join('\n'));
  for (const command of ['env', 'bash']) {
    const shim = path.join(hostileBin, command);
    writeFileSync(shim, [
      '#!/bin/sh',
      `printf path > '${posix(pathCanary)}'`,
      'exit 91',
      '',
    ].join('\n'));
    chmodSync(shim, 0o755);
  }

  try {
    for (const entrypoint of entrypoints) {
      const source = read(entrypoint.name);
      const shift = source.indexOf('\nshift\n');
      const preamble = source.slice(0, shift + '\nshift\n'.length);
      const harness = path.join(root, `${entrypoint.name}.harness`);
      const ackAssertions = allAckKeys.map((key) => {
        const expected = key === entrypoint.ackKey
          ? entrypoint.ackValue
          : '';
        return `[[ "\${${key}-}" == '${expected}' ]]`;
      });
      writeFileSync(harness, [
        preamble.trimEnd(),
        'set -euo pipefail',
        '[[ "$#" -eq 2 && "$1" == alpha && "$2" == beta ]]',
        '[[ "$PATH" == /usr/sbin:/usr/bin:/sbin:/bin ]]',
        '[[ "$HOME" == /root && "$TMPDIR" == /tmp && "$LC_ALL" == C ]]',
        '[[ "$COMPOSE_PROJECT_NAME" == menorah-staging ]]',
        '[[ "${BASH_ENV+x}" != x && "${ENV+x}" != x ]]',
        '[[ "${HOSTILE_STARTUP_SURVIVED+x}" != x ]]',
        '[[ "$(type -t docker || true)" != function ]]',
        ...ackAssertions,
        "printf 'clean\\n'",
        '',
      ].join('\n'), { mode: 0o755 });
      const environment = {
        PATH: posix(hostileBin),
        HOME: '/hostile-home',
        TMPDIR: '/hostile-tmp',
        LC_ALL: 'C',
        BASH_ENV: posix(bashEnvironment),
        ENV: posix(bashEnvironment),
        HOSTILE_STARTUP_SURVIVED: 'inherited',
        COMPOSE_PROJECT_NAME: 'menorah-production',
        'BASH_FUNC_docker%%': '() { return 0; }',
      };
      for (const { ackKey, ackValue } of entrypoints) {
        if (ackKey) environment[ackKey] = ackValue;
      }
      const result = spawnSync(
        shellPath,
        [posix(harness), 'alpha', 'beta'],
        { encoding: 'utf8', env: environment },
      );
      assert.equal(
        result.status,
        0,
        `${entrypoint.name}: ${result.stderr || result.stdout}`,
      );
      assert.equal(result.stdout, 'clean\n');
      assert.equal(existsSync(startupCanary), false);
      assert.equal(existsSync(pathCanary), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('session publication is same-filesystem, atomic, and no-overwrite', {
  skip: !bashPath,
}, () => {
  for (const kind of ['backup', 'restore']) {
    const source = read(
      kind === 'backup'
        ? 'run-consistent-backup.sh'
        : 'run-disposable-restore.sh',
    );
    const functionName = kind === 'backup'
      ? 'publish_backup_session'
      : 'publish_restore_session';
    const root = mkdtempSync(path.join(tmpdir(), `menorah-${kind}-session-`));
    const recovery = path.join(root, 'recovery');
    const marker = path.join(recovery, `${kind}-session`);
    const harness = path.join(root, 'publish.sh');
    mkdirSync(recovery);
    writeFileSync(marker, 'preexisting-marker\n');
    writeFileSync(harness, [
      '#!/bin/bash',
      'set -euo pipefail',
      "fail() { printf '%s\\n' \"$*\" >&2; exit 97; }",
      'assert_state_absent() { :; }',
      `RECOVERY_ROOT='${posix(recovery)}'`,
      `${kind.toUpperCase()}_SESSION='${posix(marker)}'`,
      `current_release_sha='${fixtureSha}'`,
      "EXPECTED_PROJECT='menorah-staging'",
      "EXPECTED_ENVIRONMENT_ID='menorah-server-staging-v1'",
      `EXPECTED_WRITER_INVENTORY='${writerInventory}'`,
      "RESTORE_SERVICE='staging-mongo-restore'",
      functionSource(source, functionName),
      functionName,
      '',
    ].join('\n'), { mode: 0o755 });
    try {
      const result = spawnSync(
        bashPath,
        [posix(harness)],
        { encoding: 'utf8', env: { PATH: toolPath } },
      );
      assert.equal(result.status, 97);
      assert.match(result.stderr, /could not be reserved atomically/);
      assert.equal(readFileSync(marker, 'utf8'), 'preexisting-marker\n');
      assert.match(
        source,
        new RegExp(`ln -- "\\$\\{temporary\\}" "\\$\\{${kind.toUpperCase()}_SESSION\\}"`),
      );
      assert.doesNotMatch(
        source,
        new RegExp(`mv[^\\n]*\\$\\{${kind.toUpperCase()}_SESSION\\}`),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('inner jobs require exact server sessions and bound operation scope', {
  skip: !shellPath,
}, () => {
  for (const kind of ['backup', 'restore']) {
    const source = read(`${kind}-staging.sh`);
    const functionName = `require_bound_${kind}_session`;
    const sessionKey = `MENORAH_STAGING_${kind.toUpperCase()}_SESSION_ID`;
    const sessionId = `${fixtureSha}-4242`;
    const root = mkdtempSync(path.join(tmpdir(), `menorah-${kind}-binding-`));
    const marker = path.join(root, `${kind}-session`);
    const harness = path.join(root, 'binding.sh');
    const scope = kind === 'backup'
      ? `writers=${writerInventory}`
      : 'target=staging-mongo-restore';
    const exactRecord = [
      `${kind}-session-v1`,
      'menorah-staging',
      'menorah-server-staging-v1',
      fixtureSha,
      sessionId,
      scope,
    ].join('|');
    writeFileSync(marker, `${exactRecord}\n`);
    writeFileSync(harness, [
      '#!/bin/sh',
      'set -eu',
      "fail() { printf '%s\\n' \"$*\" >&2; exit 98; }",
      "SERVER_PROJECT='menorah-staging'",
      "VALIDATION_PROJECT='menorah-server-staging-validation'",
      "EXPECTED_ENVIRONMENT_ID='menorah-server-staging-v1'",
      `MENORAH_SERVER_STAGING_RUNTIME_SHA='${fixtureSha}'`,
      `BACKUP_SESSION='${posix(marker)}'`,
      `RESTORE_SESSION='${posix(marker)}'`,
      `EXPECTED_WRITER_INVENTORY='${writerInventory}'`,
      "RESTORE_SERVICE='staging-mongo-restore'",
      'ACTIVE_PROJECT="$1"',
      `if [ "\${2-}" = exact ]; then ${sessionKey}='${sessionId}'; export ${sessionKey}; fi`,
      functionSource(source, functionName),
      functionName,
      '',
    ].join('\n'), { mode: 0o755 });
    const run = (project, mode) => spawnSync(
      shellPath,
      [posix(harness), project, mode],
      { encoding: 'utf8', env: { PATH: toolPath } },
    );
    try {
      const exactResult = run('menorah-staging', 'exact');
      assert.equal(
        exactResult.status,
        0,
        `${kind}: ${exactResult.stderr || exactResult.stdout}`,
      );
      assert.equal(run('menorah-staging', 'absent').status, 98);
      writeFileSync(marker, `${exactRecord}|unexpected\n`);
      assert.equal(run('menorah-staging', 'exact').status, 98);
      rmSync(marker);
      assert.equal(
        run('menorah-server-staging-validation', 'absent').status,
        0,
      );
      assert.equal(
        run('menorah-server-staging-validation', 'exact').status,
        98,
      );
      if (kind === 'backup') {
        assert.match(
          source,
          new RegExp(`EXPECTED_WRITER_INVENTORY='${writerInventory}'`),
        );
        assert.match(source, /\|writers=\$\{EXPECTED_WRITER_INVENTORY\}/);
      } else {
        assert.match(source, /\|target=\$\{RESTORE_SERVICE\}/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('every host mutator rechecks backup and restore blockers under fd9', () => {
  for (const name of [
    'deploy-exact-sha.sh',
    'rollback-recorded.sh',
    'resume-post-migration.sh',
    'run-recorded-migration.sh',
    'create-image-manifest.sh',
    'run-consistent-backup.sh',
    'run-disposable-restore.sh',
  ]) {
    const source = read(name);
    const mainLock = source.includes('\nacquire_shared_deploy_lock\n')
      ? source.indexOf('\nacquire_shared_deploy_lock\n')
      : source.indexOf('flock -n 9');
    assert.ok(mainLock >= 0, `${name} must acquire/reuse fd9`);
    const underLock = source.slice(mainLock);
    for (const state of [
      'BACKUP_LOCK',
      'BACKUP_SESSION',
      'RESTORE_LOCK',
      'RESTORE_SESSION',
      'RESTORE_MARKER',
      'RESTORE_REVIEW',
    ]) {
      assert.match(
        underLock,
        new RegExp(`"\\$\\{${state}\\}"`),
        `${name} must recheck ${state} under fd9`,
      );
    }
  }
});

test('manifest deploy lock works standalone and with exact inherited fd9', {
  skip: !bashPath,
}, () => {
  const source = read('create-image-manifest.sh');
  const root = mkdtempSync(path.join(tmpdir(), 'menorah-manifest-lock-'));
  const mockBin = path.join(root, 'bin');
  const lock = path.join(root, '.deploy.lock');
  const other = path.join(root, '.other.lock');
  const harness = path.join(root, 'manifest-lock.sh');
  mkdirSync(mockBin);
  writeFileSync(path.join(mockBin, 'flock'), [
    '#!/bin/bash',
    '[[ "$#" -eq 2 && "$1" == -n && "$2" == 9 ]]',
    '[[ "$(realpath -e -- /proc/self/fd/9)" == "$EXPECTED_LOCK" ]]',
    '',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(harness, [
    '#!/bin/bash',
    'set -euo pipefail',
    "fail() { printf '%s\\n' \"$*\" >&2; exit 99; }",
    `DEPLOY_LOCK='${posix(lock)}'`,
    functionSource(source, 'acquire_shared_deploy_lock'),
    'acquire_shared_deploy_lock',
    'realpath -e -- /proc/self/fd/9',
    '',
  ].join('\n'), { mode: 0o755 });
  const environment = {
    PATH: `${mockBin}${path.delimiter}${toolPath}`,
    EXPECTED_LOCK: posix(lock),
  };
  try {
    const standalone = spawnSync(
      bashPath,
      [posix(harness)],
      { encoding: 'utf8', env: environment },
    );
    assert.equal(
      standalone.status,
      0,
      standalone.stderr || standalone.stdout,
    );
    assert.equal(standalone.stdout.trim(), posix(lock));

    const inherited = spawnSync(
      bashPath,
      [
        '-c',
        'exec 9>>"$1"; /bin/bash "$2"',
        'manifest-inherited-lock-test',
        posix(lock),
        posix(harness),
      ],
      { encoding: 'utf8', env: environment },
    );
    assert.equal(
      inherited.status,
      0,
      inherited.stderr || inherited.stdout,
    );
    assert.equal(inherited.stdout.trim(), posix(lock));

    const wrongDescriptor = spawnSync(
      bashPath,
      [
        '-c',
        'exec 9>>"$1"; /bin/bash "$2"',
        'manifest-wrong-lock-test',
        posix(other),
        posix(harness),
      ],
      { encoding: 'utf8', env: environment },
    );
    assert.equal(wrongDescriptor.status, 99);
    assert.match(
      wrongDescriptor.stderr,
      /descriptor 9 is not the staging deployment lock/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore marker publication is same-filesystem and no-overwrite', () => {
  const source = read('restore-staging.sh');
  assert.match(
    source,
    /readonly RECOVERY_ROOT='\/opt\/menorah-staging\/deploy-state\/recovery'/,
  );
  assert.match(
    source,
    /readonly RESTORE_MARKER_TEMP="\$\{RECOVERY_ROOT\}\/\.restore-marker-\$\{STAMP\}-\$\$\.json"/,
  );
  assert.match(
    source,
    /ln -- "\$\{RESTORE_MARKER_TEMP\}" "\$\{RESTORE_MARKER\}"/,
  );
  assert.match(
    source,
    /rm -- "\$\{RESTORE_MARKER_TEMP\}"[\s\\]*\|\| fail 'restore marker staging link could not be removed'/,
  );
  assert.doesNotMatch(
    source,
    /mv[^\n]*"\$\{RESTORE_MARKER_TEMP\}"[^\n]*"\$\{RESTORE_MARKER\}"/,
  );
});

test('session paths are exact reviewed deploy-state paths', () => {
  assert.equal(
    STATE_PATHS.backupSession,
    '/opt/menorah-staging/deploy-state/recovery/backup-session',
  );
  assert.equal(
    STATE_PATHS.restoreSession,
    '/opt/menorah-staging/deploy-state/recovery/restore-session',
  );
  assert.notEqual(STATE_PATHS.backupSession, STATE_PATHS.restoreSession);
});
