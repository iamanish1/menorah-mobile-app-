import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import {
  EXPECTED_CONTEXT,
  EXPECTED_MODE_CONTEXT,
  assertCanonicalExistingPath,
  validateContext,
} from '../../deploy/server-staging/assert-context.mjs';
import {
  parseEnvironmentSource,
} from '../../deploy/server-staging/validate-environment.mjs';

const read = (name) => readFileSync(
  new URL(`../../deploy/server-staging/${name}`, import.meta.url),
  'utf8',
);

const sources = Object.freeze({
  backup: read('backup-staging.sh'),
  restore: read('restore-staging.sh'),
});

const shellPath = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
    'C:\\Program Files\\Git\\bin\\sh.exe',
  ].find(existsSync)
  : '/bin/sh';

const posix = (value) => value.replaceAll('\\', '/');
const shellPathValue = (value) => {
  const normalized = posix(value);
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return drive
    ? `/${drive[1].toLowerCase()}/${drive[2]}`
    : normalized;
};
const shellEnvironment = shellPath
  ? {
    ...process.env,
    PATH: `${path.dirname(shellPath)}${path.delimiter}${process.env.PATH}`,
  }
  : process.env;

const shellFunction = (source, name) => {
  const start = source.indexOf(`${name}() {`);
  assert.ok(start >= 0, `missing shell function ${name}`);
  const closing = source.indexOf('\n}\n', start);
  assert.ok(closing > start, `unterminated shell function ${name}`);
  return source.slice(start, closing + 3);
};

const singleFileTarGzip = (name, source) => {
  const body = Buffer.from(source);
  const header = Buffer.alloc(512);
  const writeOctal = (offset, length, value) => {
    const encoded = `${value.toString(8).padStart(length - 1, '0')}\0`;
    header.write(encoded, offset, length, 'ascii');
  };
  header.write(name, 0, 100, 'utf8');
  writeOctal(100, 8, 0o600);
  writeOctal(108, 8, 0);
  writeOctal(116, 8, 0);
  writeOctal(124, 12, body.length);
  writeOctal(136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(
    `${checksum.toString(8).padStart(6, '0')}\0 `,
    148,
    8,
    'ascii',
  );
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return gzipSync(Buffer.concat([
    header,
    body,
    padding,
    Buffer.alloc(1024),
  ]));
};

const directoryStat = Object.freeze({
  isDirectory: () => true,
  isFile: () => false,
  isSymbolicLink: () => false,
});

const canonicalFs = Object.freeze({
  existsSync: () => true,
  lstatSync: () => directoryStat,
  realpathSync: (value) => value,
});

const environmentFor = (mode) => ({
  ...EXPECTED_CONTEXT,
  ...EXPECTED_MODE_CONTEXT[mode],
});

const captureCode = (callback) => {
  try {
    callback();
  } catch (error) {
    return error.code;
  }
  assert.fail('validation unexpectedly accepted an unsafe fixture');
};

test('canonical context uses the tracked staging environment names', () => {
  assert.deepEqual(EXPECTED_CONTEXT, {
    COMPOSE_PROJECT_NAME: 'menorah-staging',
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID: 'menorah-server-staging-v1',
    MENORAH_SERVER_STAGING_ROOT: '/opt/menorah-staging',
    MENORAH_SERVER_STAGING_APP_ROOT: '/opt/menorah-staging/app',
    MENORAH_SERVER_STAGING_DATA_ROOT: '/opt/menorah-staging/data',
    MENORAH_SERVER_STAGING_BACKUP_ROOT:
      '/opt/menorah-staging/backups',
    MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT:
      '/opt/menorah-staging/deploy-state',
    MENORAH_SERVER_STAGING_LOGS_ROOT: '/opt/menorah-staging/logs',
    MENORAH_SERVER_STAGING_ENV_ROOT: '/opt/menorah-staging/env',
    MONGO_DATABASE: 'menorah_staging',
    MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
    MONGODB_RESTORE_REPLICA_SET_NAME: 'menorah-staging-restore-rs',
  });
  assert.equal(
    Object.hasOwn(EXPECTED_CONTEXT, 'MENORAH_STAGING_ROOTS_ACK'),
    false,
  );
  for (const mode of ['backup', 'restore']) {
    assert.equal(
      EXPECTED_MODE_CONTEXT[mode].MENORAH_STAGING_ROOTS_ACK,
      'MENORAH_STAGING_ROOTS_REVIEWED',
    );
  }
  for (const mode of ['manifest', 'deploy', 'rollback', 'migration']) {
    assert.equal(
      Object.hasOwn(
        EXPECTED_MODE_CONTEXT[mode],
        'MENORAH_STAGING_ROOTS_ACK',
      ),
      false,
    );
  }
});

test('tracked env example satisfies backup and restore context identity', () => {
  const environmentSource = readFileSync(
    new URL(
      '../../deploy/env/server-staging.env.example',
      import.meta.url,
    ),
    'utf8',
  );
  const tracked = parseEnvironmentSource(
    environmentSource,
    'server-staging.env.example',
  );
  for (const mode of ['backup', 'restore']) {
    assert.equal(validateContext({
      ...tracked,
      COMPOSE_PROJECT_NAME: EXPECTED_CONTEXT.COMPOSE_PROJECT_NAME,
      ...EXPECTED_MODE_CONTEXT[mode],
    }, {
      mode,
      fsAdapter: canonicalFs,
      checkDerivedPaths: false,
    }), true);
  }
  for (const fictionalAlias of [
    'MENORAH_STAGING_ROOT',
    'MENORAH_STAGING_APP_ROOT',
    'MENORAH_STAGING_DATA_ROOT',
    'MENORAH_STAGING_BACKUP_ROOT',
    'MENORAH_STAGING_DEPLOY_STATE_ROOT',
    'MENORAH_STAGING_LOGS_ROOT',
    'MENORAH_STAGING_ENV_ROOT',
    'MENORAH_STAGING_DATABASE',
    'MENORAH_STAGING_REPLICA_SET',
  ]) {
    assert.equal(Object.hasOwn(EXPECTED_CONTEXT, fictionalAlias), false);
  }
});

test('host checks cover only bind-backed context roots', () => {
  const resolved = [];
  const recordingFs = {
    ...canonicalFs,
    realpathSync: (value) => {
      resolved.push(value);
      return value;
    },
  };
  assert.equal(validateContext(environmentFor('backup'), {
    mode: 'backup',
    fsAdapter: recordingFs,
    checkDerivedPaths: false,
  }), true);
  assert.deepEqual(resolved, [
    '/opt/menorah-staging',
    '/opt/menorah-staging/app',
    '/opt/menorah-staging/deploy-state',
    '/opt/menorah-staging/env',
  ]);
  for (const logicalVolumeRoot of [
    '/opt/menorah-staging/data',
    '/opt/menorah-staging/backups',
    '/opt/menorah-staging/logs',
  ]) {
    assert.equal(resolved.includes(logicalVolumeRoot), false);
  }
});

test('unsafe production identities and ambiguous host roots are rejected', () => {
  const productionBackup = environmentFor('backup');
  productionBackup.MENORAH_SERVER_STAGING_BACKUP_ROOT =
    '/opt/menorah/backups';
  assert.equal(captureCode(() => validateContext(productionBackup, {
    mode: 'backup',
    fsAdapter: canonicalFs,
    checkDerivedPaths: false,
  })), 'context_mismatch');

  const productionState = environmentFor('deploy');
  productionState.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT =
    '/opt/menorah/deploy-state';
  assert.equal(captureCode(() => validateContext(productionState, {
    mode: 'deploy',
    fsAdapter: canonicalFs,
    checkDerivedPaths: false,
  })), 'context_mismatch');

  const productionDatabase = environmentFor('restore');
  productionDatabase.MONGO_DATABASE = 'menorah';
  assert.equal(captureCode(() => validateContext(productionDatabase, {
    mode: 'restore',
    fsAdapter: canonicalFs,
    checkDerivedPaths: false,
  })), 'context_mismatch');

  const productionTarget = environmentFor('restore');
  productionTarget.MENORAH_STAGING_RESTORE_TARGET = 'mongo-primary';
  assert.equal(captureCode(() => validateContext(productionTarget, {
    mode: 'restore',
    fsAdapter: canonicalFs,
    checkDerivedPaths: false,
  })), 'operation_ack_mismatch');

  assert.equal(captureCode(() => assertCanonicalExistingPath(
    '/opt/menorah-staging/deploy-state/',
    '/opt/menorah-staging/deploy-state',
    'deploy-state root',
    canonicalFs,
  )), 'ambiguous_root');

  const escapingFs = {
    ...canonicalFs,
    realpathSync: (value) => (
      value === '/opt/menorah-staging/deploy-state'
        ? '/opt/menorah/deploy-state'
        : value
    ),
  };
  assert.equal(captureCode(() => validateContext(
    environmentFor('backup'),
    {
      mode: 'backup',
      fsAdapter: escapingFs,
      checkDerivedPaths: false,
    },
  )), 'symlink_escape');
});

test('backup records safe entry topology and publishes pointers atomically', () => {
  assert.match(sources.backup, /record_safe_media_tree\(\)/);
  assert.match(
    sources.backup,
    /find "\$\{root\}" -mindepth 1 ! -type d ! -type f -print -quit/,
  );
  assert.match(
    sources.backup,
    /find "\$\{root\}" -mindepth 1 -type f -links \+1 -print -quit/,
  );
  assert.match(sources.backup, /uploads-entries\.manifest/);
  assert.match(sources.backup, /managed-media-entries\.manifest/);
  assert.match(sources.backup, /mediaEntryManifestFormat/);
  assert.match(sources.backup, /publish_latest_atomically\(\)/);
  assert.match(
    sources.backup,
    /mv -fT -- "\$\{temporary\}" "\$\{root\}\/LATEST"/,
  );
  assert.doesNotMatch(sources.backup, /cp -- .*LATEST/);
});

test('restore accepts an exact signed bundle and regular-file archives only', () => {
  assert.match(sources.restore, /assert_exact_bundle_members\(\)/);
  assert.match(sources.restore, /assert_exact_checksum_manifest\(\)/);
  assert.match(sources.restore, /sha256sum --strict -c SHA256SUMS/);
  assert.match(sources.restore, /validate_regular_directory_archive\(\)/);
  assert.match(
    sources.restore,
    /type != "-" && type != "d"/,
  );
  assert.match(sources.restore, /archive contains a duplicate path/);
  assert.match(sources.restore, /uploads-entries\.manifest/);
  assert.match(sources.restore, /managed-media-entries\.manifest/);
  assert.match(sources.restore, /signature format is invalid/);
  assert.match(
    sources.restore,
    /\\"createdAt\\": \\"\$\{STAMP\}\\"/,
  );
  assert.match(sources.restore, /--stopOnError/);
});

test('backup media scanner rejects hard links and ambiguous path bytes', {
  skip: !shellPath,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'menorah-media-contract-'));
  const tree = path.join(root, 'tree');
  const harness = path.join(root, 'media-harness.sh');
  const manifest = path.join(root, 'entries.manifest');
  const safeFile = path.join(tree, 'safe.txt');
  mkdirSync(tree);
  writeFileSync(safeFile, 'safe staging bytes\n');
  writeFileSync(harness, [
    '#!/bin/sh',
    'set -eu',
    'fail() { printf "%s\\n" "$*" >&2; exit 1; }',
    shellFunction(sources.backup, 'record_safe_media_tree'),
    'record_safe_media_tree "$1" fixture "$2"',
    '',
  ].join('\n'), { mode: 0o755 });
  const scan = () => spawnSync(
    shellPath,
    [harness, shellPathValue(tree), shellPathValue(manifest)],
    { encoding: 'utf8', env: shellEnvironment },
  );
  try {
    assert.equal(scan().status, 0);

    const hardLink = path.join(tree, 'same-inode.txt');
    linkSync(safeFile, hardLink);
    assert.notEqual(scan().status, 0);
    rmSync(hardLink);

    if (process.platform !== 'win32') {
      const tabbed = path.join(tree, 'tab\tname.txt');
      writeFileSync(tabbed, 'unsafe path\n');
      assert.notEqual(scan().status, 0);
      rmSync(tabbed);
    }

    const nonAscii = path.join(tree, 'non-ascii-\u00e9.txt');
    writeFileSync(nonAscii, 'unsafe path\n');
    assert.notEqual(scan().status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checksum manifest parser rejects extra, missing, and reordered records', {
  skip: !shellPath,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'menorah-checksum-contract-'));
  const bundle = path.join(root, 'bundle');
  const harness = path.join(root, 'checksum-harness.sh');
  mkdirSync(bundle);
  writeFileSync(harness, [
    '#!/bin/sh',
    'set -eu',
    'fail() { printf "%s\\n" "$*" >&2; exit 1; }',
    shellFunction(sources.restore, 'assert_exact_checksum_manifest'),
    'BUNDLE="$1"',
    'assert_exact_checksum_manifest',
    '',
  ].join('\n'), { mode: 0o755 });
  const names = [
    'database.archive.gz.enc',
    'database-manifest.json',
    'managed-media.tar.gz.enc',
    'managed-media-entries.manifest',
    'managed-media-manifest.sha256',
    'metadata.json',
    'uploads.tar.gz.enc',
    'uploads-entries.manifest',
    'uploads-manifest.sha256',
  ];
  const record = (name) => `${'a'.repeat(64)}  ${name}\n`;
  const run = () => spawnSync(
    shellPath,
    [harness, shellPathValue(bundle)],
    { encoding: 'utf8', env: shellEnvironment },
  );
  try {
    writeFileSync(
      path.join(bundle, 'SHA256SUMS'),
      names.map(record).join(''),
    );
    const exactResult = run();
    assert.equal(
      exactResult.status,
      0,
      exactResult.stderr || exactResult.stdout,
    );

    writeFileSync(
      path.join(bundle, 'SHA256SUMS'),
      [...names, 'unexpected.enc'].map(record).join(''),
    );
    assert.notEqual(run().status, 0);

    writeFileSync(
      path.join(bundle, 'SHA256SUMS'),
      names.slice(0, -1).map(record).join(''),
    );
    assert.notEqual(run().status, 0);

    const reordered = [...names];
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    writeFileSync(
      path.join(bundle, 'SHA256SUMS'),
      reordered.map(record).join(''),
    );
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('archive inspector rejects traversal, duplicate, and hard-link entries', {
  skip: !shellPath,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'menorah-archive-contract-'));
  const tree = path.join(root, 'tree');
  const work = path.join(root, 'work');
  const harness = path.join(root, 'archive-harness.sh');
  const safeArchive = path.join(root, 'safe.tar.gz');
  const traversalArchive = path.join(root, 'traversal.tar.gz');
  const duplicateArchive = path.join(root, 'duplicate.tar.gz');
  const hardLinkArchive = path.join(root, 'hard-link.tar.gz');
  mkdirSync(tree);
  mkdirSync(work);
  writeFileSync(path.join(tree, 'safe.txt'), 'safe staging bytes\n');
  writeFileSync(harness, [
    '#!/bin/sh',
    'set -eu',
    'fail() { printf "%s\\n" "$*" >&2; exit 1; }',
    shellFunction(sources.restore, 'validate_regular_directory_archive'),
    'WORK_DIR="$1"',
    'validate_regular_directory_archive "$2" fixture',
    '',
  ].join('\n'), { mode: 0o755 });
  const tar = (command, archive) => spawnSync(
    shellPath,
    [
      '-c',
      command,
      'tar-fixture',
      shellPathValue(tree),
      shellPathValue(archive),
    ],
    { encoding: 'utf8', env: shellEnvironment },
  );
  const inspect = (archive) => spawnSync(
    shellPath,
    [harness, shellPathValue(work), shellPathValue(archive)],
    { encoding: 'utf8', env: shellEnvironment },
  );
  try {
    assert.equal(
      tar('tar -C "$1" -czf "$2" .', safeArchive).status,
      0,
    );
    const safeResult = inspect(safeArchive);
    assert.equal(
      safeResult.status,
      0,
      safeResult.stderr || safeResult.stdout,
    );

    writeFileSync(
      traversalArchive,
      singleFileTarGzip('./../escape.txt', 'escape attempt\n'),
    );
    assert.notEqual(inspect(traversalArchive).status, 0);

    assert.equal(
      tar(
        'tar -C "$1" -czf "$2" ./safe.txt ./safe.txt',
        duplicateArchive,
      ).status,
      0,
    );
    assert.notEqual(inspect(duplicateArchive).status, 0);

    linkSync(
      path.join(tree, 'safe.txt'),
      path.join(tree, 'same-inode.txt'),
    );
    assert.equal(
      tar('tar -C "$1" -czf "$2" .', hardLinkArchive).status,
      0,
    );
    assert.notEqual(inspect(hardLinkArchive).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
