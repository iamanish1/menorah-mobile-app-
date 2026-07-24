import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  DERIVED_PATHS,
  EXPECTED_CONTEXT,
  EXPECTED_MODE_CONTEXT,
  EXPECTED_RELEASE_IDENTITY,
  STATE_PATHS,
  assertCanonicalExistingPath,
  parseManifest,
  validateContext,
  validateReleaseMetadata,
} from '../../deploy/server-staging/assert-context.mjs';

const read = (name) => readFileSync(
  new URL(`../../deploy/server-staging/${name}`, import.meta.url),
  'utf8',
);

const scriptPath = (name) => fileURLToPath(
  new URL(`../../deploy/server-staging/${name}`, import.meta.url),
);

const shellPath = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Git\\bin\\sh.exe',
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
  ].find(existsSync)
  : '/bin/sh';

const sources = Object.freeze({
  backup: read('backup-staging.sh'),
  restore: read('restore-staging.sh'),
  manifest: read('create-image-manifest.sh'),
  deploy: read('deploy-exact-sha.sh'),
  rollback: read('rollback-recorded.sh'),
  migration: read('run-recorded-migration.sh'),
});

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

test('reviewed staging roots, identities, and state paths are exact', () => {
  assert.deepEqual(EXPECTED_CONTEXT, {
    COMPOSE_PROJECT_NAME: 'menorah-staging',
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID: 'menorah-server-staging-v1',
    MENORAH_STAGING_ROOT: '/opt/menorah-staging',
    MENORAH_STAGING_APP_ROOT: '/opt/menorah-staging/app',
    MENORAH_STAGING_DATA_ROOT: '/opt/menorah-staging/data',
    MENORAH_STAGING_BACKUP_ROOT: '/opt/menorah-staging/backups',
    MENORAH_STAGING_DEPLOY_STATE_ROOT:
      '/opt/menorah-staging/deploy-state',
    MENORAH_STAGING_LOGS_ROOT: '/opt/menorah-staging/logs',
    MENORAH_STAGING_ENV_ROOT: '/opt/menorah-staging/env',
    MENORAH_STAGING_DATABASE: 'menorah_staging',
    MENORAH_STAGING_REPLICA_SET: 'menorah-staging-rs',
    MENORAH_STAGING_ROOTS_ACK: 'MENORAH_STAGING_ROOTS_REVIEWED',
  });
  for (const value of Object.values(STATE_PATHS)) {
    assert.match(value, /^\/opt\/menorah-staging\/deploy-state\//);
    assert.doesNotMatch(value, /^\/opt\/menorah(?:\/|$)/);
  }
  assert.notEqual(STATE_PATHS.deployLock, STATE_PATHS.rollbackLock);
  assert.notEqual(STATE_PATHS.migrationLock, STATE_PATHS.deployLock);
  assert.notEqual(STATE_PATHS.backupLock, STATE_PATHS.restoreLock);
});

test('all mutating contexts require exact roots and an operation acknowledgment', () => {
  for (const mode of Object.keys(EXPECTED_MODE_CONTEXT)) {
    assert.equal(validateContext(environmentFor(mode), {
      mode,
      fsAdapter: canonicalFs,
      checkDerivedPaths: false,
    }), true);
    const withoutAcknowledgment = environmentFor(mode);
    delete withoutAcknowledgment[
      Object.keys(EXPECTED_MODE_CONTEXT[mode])[0]
    ];
    assert.equal(
      captureCode(() => validateContext(withoutAcknowledgment, {
        mode,
        fsAdapter: canonicalFs,
        checkDerivedPaths: false,
      })),
      'operation_ack_mismatch',
    );
  }
});

test('production backup root and production deployment state are rejected', () => {
  const productionBackup = environmentFor('backup');
  productionBackup.MENORAH_STAGING_BACKUP_ROOT = '/opt/menorah/backups';
  assert.equal(
    captureCode(() => validateContext(productionBackup, {
      mode: 'backup',
      fsAdapter: canonicalFs,
      checkDerivedPaths: false,
    })),
    'context_mismatch',
  );

  const productionState = environmentFor('deploy');
  productionState.MENORAH_STAGING_DEPLOY_STATE_ROOT =
    '/opt/menorah/deploy-state';
  assert.equal(
    captureCode(() => validateContext(productionState, {
      mode: 'deploy',
      fsAdapter: canonicalFs,
      checkDerivedPaths: false,
    })),
    'context_mismatch',
  );
});

test('production database and production restore target are rejected', () => {
  const productionDatabase = environmentFor('restore');
  productionDatabase.MENORAH_STAGING_DATABASE = 'menorah';
  assert.equal(
    captureCode(() => validateContext(productionDatabase, {
      mode: 'restore',
      fsAdapter: canonicalFs,
      checkDerivedPaths: false,
    })),
    'context_mismatch',
  );

  const productionTarget = environmentFor('restore');
  productionTarget.MENORAH_STAGING_RESTORE_TARGET = 'mongo-primary';
  assert.equal(
    captureCode(() => validateContext(productionTarget, {
      mode: 'restore',
      fsAdapter: canonicalFs,
      checkDerivedPaths: false,
    })),
    'operation_ack_mismatch',
  );
});

test('ambiguous roots and symlink escapes are rejected', () => {
  assert.equal(
    captureCode(() => assertCanonicalExistingPath(
      '/opt/menorah-staging/backups/',
      '/opt/menorah-staging/backups',
      'backup root',
      canonicalFs,
    )),
    'ambiguous_root',
  );

  const escapingFs = {
    ...canonicalFs,
    realpathSync: (value) => (
      value === '/opt/menorah-staging/backups'
        ? '/opt/menorah/backups'
        : value
    ),
  };
  assert.equal(
    captureCode(() => validateContext(environmentFor('backup'), {
      mode: 'backup',
      fsAdapter: escapingFs,
      checkDerivedPaths: false,
    })),
    'symlink_escape',
  );
});

test('backup and restore remain staging-bound with separate keys and locks', () => {
  assert.match(
    sources.backup,
    /readonly BACKUP_ROOT='\/opt\/menorah-staging\/backups'/,
  );
  assert.match(
    sources.backup,
    /readonly BACKUP_LOCK='\/opt\/menorah-staging\/deploy-state\/\.backup\.lock'/,
  );
  assert.match(
    sources.restore,
    /readonly RESTORE_LOCK='\/opt\/menorah-staging\/deploy-state\/\.restore\.lock'/,
  );
  for (const source of [sources.backup, sources.restore]) {
    assert.match(
      source,
      /\/run\/secrets\/menorah-staging-backup-encryption-key/,
    );
    assert.match(
      source,
      /\/run\/secrets\/menorah-staging-backup-signing-key/,
    );
    assert.doesNotMatch(source, /\/opt\/menorah\/(?:data|backups|deploy-state)/);
  }
  assert.match(
    sources.backup,
    /mongodb:\/\/menorah-staging-backup:.*staging-mongo-primary/s,
  );
  assert.match(sources.backup, /"--db=\$\{DATABASE\}"/);
  assert.match(sources.backup, /getSiblingDB\("menorah_staging"\)/);
  assert.match(sources.backup, /managed-media\.tar\.gz\.enc/);
  assert.match(sources.backup, /managed-media-manifest\.sha256/);
  assert.match(sources.backup, /uploads\.tar\.gz\.enc/);
  assert.match(sources.backup, /uploads-manifest\.sha256/);
  assert.match(sources.restore, /staging-mongo-restore:27017/);
  assert.match(sources.restore, /menorah-staging-restore-rs/);
  assert.match(sources.restore, /RESTORE_MEDIA_ROOT\}\/managed-media/);
  assert.match(sources.restore, /restored-managed-media-manifest\.sha256/);
  assert.match(
    sources.restore,
    /usage: restore-staging\.sh YYYYMMDDTHHMMSSZ/,
  );
  assert.doesNotMatch(sources.restore, /\/LATEST/);
});

test('backup and restore accept only the server and validation projects', {
  skip: !shellPath || !existsSync(shellPath),
}, () => {
  for (const [name, args] of [
    ['backup-staging.sh', []],
    ['restore-staging.sh', ['20260724T000000Z']],
  ]) {
    const source = read(name);
    assert.match(source, /readonly SERVER_PROJECT='menorah-staging'/);
    assert.match(
      source,
      /readonly VALIDATION_PROJECT='menorah-server-staging-validation'/,
    );
    assert.match(
      source,
      /"\$\{SERVER_PROJECT\}"\|"\$\{VALIDATION_PROJECT\}"\) ;;/,
    );

    for (const rejectedProject of [
      'menorah',
      'menorah-production',
      'unreviewed-staging-project',
    ]) {
      const result = spawnSync(
        shellPath,
        [scriptPath(name), ...args],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            COMPOSE_PROJECT_NAME: rejectedProject,
          },
        },
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /unexpected Compose project/);
    }

    for (const acceptedProject of [
      'menorah-staging',
      'menorah-server-staging-validation',
    ]) {
      const result = spawnSync(
        shellPath,
        [scriptPath(name), ...args],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            COMPOSE_PROJECT_NAME: acceptedProject,
          },
        },
      );
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stderr, /unexpected Compose project/);
      assert.match(result.stderr, /unexpected environment identity/);
    }
  }
});

test('backup discovery and cleanup are bounded to exact staging roots', () => {
  assert.doesNotMatch(
    sources.backup,
    /\bfind\s+\/(?:\s|$)|\bfind\s+\/opt\/menorah(?:\s|$)/,
  );
  assert.doesNotMatch(sources.backup, /\bprune\b|--delete|find\s+\/opt\b/i);
  assert.match(
    sources.backup,
    /case "\$\{INCOMPLETE_DIR\}" in\s+\/opt\/menorah-staging\/backups\/bundles/s,
  );
  assert.match(
    sources.restore,
    /find "\$\{RESTORE_MEDIA_ROOT\}" -mindepth 1 -maxdepth 1/,
  );
  assert.doesNotMatch(sources.restore, /\bfind\s+\/(?:\s|$)/);
});

test('release metadata and manifests bind artifacts to staging identity', () => {
  const sha = 'a'.repeat(40);
  const imageDigest = 'b'.repeat(64);
  const imageId = `sha256:${'c'.repeat(64)}`;
  const manifest = [
    `api-web|registry.example/menorah-staging/api-web@sha256:${imageDigest}|${imageId}`,
    `staging-migrate|registry.example/menorah-staging/backend@sha256:${imageDigest}|${imageId}`,
    '',
  ].join('\n');
  assert.equal(parseManifest(manifest).length, 2);

  const manifestPath = `${DERIVED_PATHS.releaseState}/${sha}.images`;
  const manifestSha256 = 'd'.repeat(64);
  assert.equal(validateReleaseMetadata({
    metadata: {
      ...EXPECTED_RELEASE_IDENTITY,
      releaseSha: sha,
      sourceTreeSha: 'e'.repeat(40),
      manifestPath,
      manifestSha256,
    },
    releaseSha: sha,
    manifestPath,
    manifestSha256,
  }), true);
});

test('production and mutable image artifacts cannot satisfy rollback preflight', () => {
  const digest = 'b'.repeat(64);
  const imageId = `sha256:${'c'.repeat(64)}`;
  for (const unsafeManifest of [
    `staging-migrate|registry.example/menorah/backend@sha256:${digest}|${imageId}\n`,
    `staging-migrate|registry.example/menorah-staging/backend:latest|${imageId}\n`,
    `staging-migrate|registry.example/production/backend@sha256:${digest}|${imageId}\n`,
  ]) {
    assert.equal(
      captureCode(() => parseManifest(unsafeManifest)),
      'production_artifact',
    );
  }
});

test('deployment state markers cannot cross into production recovery', () => {
  for (const source of [
    sources.deploy,
    sources.rollback,
    sources.migration,
  ]) {
    assert.match(source, /\/opt\/menorah-staging\/deploy-state/);
    assert.doesNotMatch(source, /MENORAH_DEPLOY_STATE_ROOT/);
    assert.doesNotMatch(
      source,
      /\/opt\/menorah\/deploy-state|production-restore/,
    );
  }
  assert.match(sources.deploy, /post-migration-recovery-sha/);
  assert.match(sources.rollback, /post-migration-recovery-sha/);
  assert.match(sources.rollback, /blocks code rollback/);
});

test('historical rollback is recorded-artifact-only and never builds or pulls', () => {
  const collapsed = sources.rollback.replace(/\\\r?\n\s*/g, ' ');
  assert.match(collapsed, /up -d --force-recreate --no-build --pull never/);
  assert.doesNotMatch(
    collapsed,
    /docker compose[^\n]*(?:\sbuild|\spull)(?:\s|$)/,
  );
  assert.doesNotMatch(sources.rollback, /run-recorded-migration/);
  assert.match(sources.rollback, /TARGET_SHA.*RECORDED_LAST_GOOD/s);
});

test('deploy and migration accept only exact recorded SHAs', () => {
  for (const source of [
    sources.manifest,
    sources.deploy,
    sources.rollback,
    sources.migration,
  ]) {
    assert.match(source, /\^\[0-9a-f\]\{40\}\$/);
    assert.match(source, /rev-parse HEAD/);
    assert.doesNotMatch(source, /\bgit\s+(?:pull|fetch|merge)\b/);
  }
  assert.match(
    sources.migration.replace(/\\\r?\n\s*/g, ' '),
    /run --rm --no-deps --pull never staging-migrate/,
  );
  assert.match(sources.manifest, /immutable release evidence already exists/);
});
