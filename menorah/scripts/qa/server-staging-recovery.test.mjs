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
  IDENTITY_RECONCILIATION_MARKER_BASENAME,
  STATE_PATHS,
  assertCanonicalExistingPath,
  parseManifest,
  validateContext,
  validateReleaseMetadata,
} from '../../deploy/server-staging/assert-context.mjs';
import {
  classifyRenderedServices,
  parseLifecycleManifest,
  selectManifestServices,
} from '../../deploy/server-staging/service-lifecycle.mjs';

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
  resume: read('resume-post-migration.sh'),
  runtimeVerifier: read('verify-runtime-services.sh'),
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
  assert.equal(
    IDENTITY_RECONCILIATION_MARKER_BASENAME,
    'identity-reconciliation-in-progress-sha',
  );
  assert.equal(
    STATE_PATHS.identityReconciliation,
    '/opt/menorah-staging/deploy-state/'
      + IDENTITY_RECONCILIATION_MARKER_BASENAME,
  );
  for (const mode of ['deploy', 'rollback', 'migration']) {
    assert.match(
      sources[mode],
      new RegExp(
        `IDENTITY_MARKER='/opt/menorah-staging/deploy-state/`
          + `${IDENTITY_RECONCILIATION_MARKER_BASENAME}'`,
      ),
    );
  }
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

test('restore metadata must match the exact allowed active Compose project', () => {
  assert.match(
    sources.restore,
    /"\\"composeProject\\": \\"\$\{ACTIVE_PROJECT\}\\""/,
  );
  assert.doesNotMatch(
    sources.restore,
    /^\s*'?"composeProject": "menorah-staging"'?\s*\\$/m,
  );

  const metadataFor = (composeProject) => JSON.stringify(
    { composeProject },
    null,
    2,
  );
  const expectedMetadataLine = (activeProject) => (
    `"composeProject": "${activeProject}"`
  );
  const metadataMatchesActiveProject = (metadata, activeProject) => (
    metadata.includes(expectedMetadataLine(activeProject))
  );
  const allowedProjects = [
    'menorah-staging',
    'menorah-server-staging-validation',
  ];

  for (const activeProject of allowedProjects) {
    assert.equal(
      metadataMatchesActiveProject(
        metadataFor(activeProject),
        activeProject,
      ),
      true,
    );
    for (const crossProject of [
      ...allowedProjects.filter((project) => project !== activeProject),
      'menorah',
      'menorah-production',
      'unreviewed-staging-project',
    ]) {
      assert.equal(
        metadataMatchesActiveProject(
          metadataFor(crossProject),
          activeProject,
        ),
        false,
      );
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

test('service lifecycle separates runtime, one-shot, and profile services', () => {
  const digest = 'b'.repeat(64);
  const imageId = `sha256:${'c'.repeat(64)}`;
  const backend =
    `registry.example/menorah-staging/backend@sha256:${digest}`;
  const model = {
    name: 'menorah-staging',
    services: {
      'staging-api-web': {
        image: backend,
        restart: 'on-failure:3',
        healthcheck: { test: ['CMD', 'true'] },
      },
      'staging-storage-init': {
        image: `caddy@sha256:${digest}`,
        restart: 'no',
      },
      'staging-media-permissions-init': {
        image: backend,
        restart: 'no',
      },
      'staging-migrate': {
        image: backend,
        restart: 'no',
        profiles: ['migration'],
      },
      'staging-seed': {
        image: backend,
        restart: 'no',
        profiles: ['seed'],
      },
    },
  };
  const manifest = [
    `staging-api-web|${backend}|${imageId}`,
    `staging-migrate|${backend}|${imageId}`,
    '',
  ].join('\n');

  assert.equal(parseLifecycleManifest(manifest).length, 2);
  const plan = Object.fromEntries(
    classifyRenderedServices(model, manifest)
      .map((service) => [service.service, service]),
  );
  assert.equal(plan['staging-api-web'].kind, 'runtime');
  assert.equal(plan['staging-api-web'].health, 'healthy');
  assert.equal(plan['staging-storage-init'].kind, 'oneshot');
  assert.equal(plan['staging-media-permissions-init'].kind, 'oneshot');
  assert.equal(plan['staging-migrate'].kind, 'profile');
  assert.equal(plan['staging-seed'].kind, 'profile');
  assert.equal(plan['staging-migrate'].imageId, imageId);
  assert.equal(plan['staging-seed'].imageId, '');
  assert.deepEqual(
    selectManifestServices(Object.values(plan))
      .map(({ service }) => service)
      .sort(),
    ['staging-api-web', 'staging-migrate'],
  );

  assert.throws(
    () => classifyRenderedServices(
      model,
      `staging-migrate|${backend}|${imageId}\n`,
    ),
    /manifest omits rendered staging artifact: staging-api-web/,
  );
  assert.throws(
    () => classifyRenderedServices(model, [
      `staging-api-web|${backend}|${imageId}`,
      `staging-migrate|registry.example/menorah-staging/backend@sha256:${'d'.repeat(64)}|${imageId}`,
      '',
    ].join('\n')),
    /rendered image differs from the manifest for staging-migrate/,
  );
  for (const extraService of [
    'staging-media-permissions-init',
    'staging-seed',
  ]) {
    assert.throws(
      () => classifyRenderedServices(model, [
        `staging-api-web|${backend}|${imageId}`,
        `staging-migrate|${backend}|${imageId}`,
        `${extraService}|${backend}|${imageId}`,
        '',
      ].join('\n')),
      new RegExp(
        `manifest contains non-runtime staging artifact: ${extraService}`,
      ),
    );
  }
  for (const malformedMigration of [
    {
      image: backend,
      restart: 'on-failure:3',
      profiles: ['migration'],
    },
    {
      image: backend,
      restart: 'no',
      profiles: ['seed'],
    },
  ]) {
    assert.throws(
      () => classifyRenderedServices({
        ...model,
        services: {
          ...model.services,
          'staging-migrate': malformedMigration,
        },
      }, manifest),
      /staging-migrate must be a restart:no migration-profile service/,
    );
  }
  assert.throws(
    () => classifyRenderedServices({
      ...model,
      services: {
        ...model.services,
        'staging-api-web': { image: backend },
      },
    }, manifest),
    /service lifecycle is ambiguous for staging-api-web/,
  );
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
    sources.resume,
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

test('first deployment prepares migration dependencies before migration', () => {
  const datastoreStart = sources.deploy.indexOf(
    "staging-mongo-primary \\\n  staging-redis",
  );
  const initializer = sources.deploy.indexOf(
    "staging-mongo-replica-init\nassert_successful_initializer",
  );
  const migration = sources.deploy.indexOf(
    '"${SCRIPT_DIR}/run-recorded-migration.sh"',
  );
  const recoveryValidation = sources.deploy.indexOf(
    'recovery_sha="$(read_sha_marker',
    migration,
  );
  const applicationStart = sources.deploy.indexOf(
    'compose up -d --no-build --pull never --wait --wait-timeout 300',
    migration,
  );
  const runtimeVerification = sources.deploy.indexOf(
    'bash "${RUNTIME_VERIFIER}" "${MANIFEST}"',
  );

  assert.ok(datastoreStart >= 0);
  assert.ok(initializer > datastoreStart);
  assert.ok(migration > initializer);
  assert.ok(recoveryValidation > migration);
  assert.ok(applicationStart > recoveryValidation);
  assert.ok(runtimeVerification > applicationStart);
  for (const source of [sources.deploy, sources.migration]) {
    assert.match(source, /ps -a -q "\$\{service\}"/);
    assert.match(source, /\.State\.Status/);
    assert.match(source, /staging-mongo-primary/);
    assert.match(source, /staging-mongo-replica-init/);
    assert.match(source, /staging-redis/);
  }
});

test('profile artifacts render explicitly and migration owns recovery state', () => {
  assert.match(sources.manifest, /--profile migration/);
  assert.match(sources.migration, /--profile migration config --format json/);

  const inProgressWrite = sources.migration.lastIndexOf(
    'write_sha_marker \\\n  "${IN_PROGRESS_MARKER}"',
  );
  const migrationRun = sources.migration.lastIndexOf(
    'compose run --rm --no-deps --pull never staging-migrate',
  );
  const recoveryWrite = sources.migration.lastIndexOf(
    'write_sha_marker \\\n  "${RECOVERY_MARKER}"',
  );
  const appliedWrite = sources.migration.lastIndexOf(
    'write_sha_marker \\\n  "${APPLIED_MARKER}"',
  );
  const inProgressClear = sources.migration.lastIndexOf(
    'rm -f -- "${IN_PROGRESS_MARKER}"',
  );

  assert.ok(inProgressWrite >= 0);
  assert.ok(migrationRun > inProgressWrite);
  assert.ok(recoveryWrite > migrationRun);
  assert.ok(appliedWrite > recoveryWrite);
  assert.ok(inProgressClear > appliedWrite);
});

test('a second migration invocation preserves completed deployment state', () => {
  assert.match(
    sources.migration,
    /deployment_record_is_complete\(\) \{/,
  );
  assert.match(
    sources.migration,
    /if deployment_record_is_complete; then\s+recovery_sha='deployment-complete'\s+else\s+write_sha_marker \\\s+"\$\{RECOVERY_MARKER\}"/,
  );
  assert.match(
    sources.migration,
    /successful deployment record disagrees with current release/,
  );
  assert.match(
    sources.migration,
    /successful deployment record is invalid/,
  );
});

test('runtime verification rejects missing, exited, unhealthy, and drifted services', () => {
  assert.match(sources.runtimeVerifier, /ps -a -q "\$\{service\}"/);
  assert.match(
    sources.runtimeVerifier,
    /required runtime service is missing or ambiguous/,
  );
  assert.match(
    sources.runtimeVerifier,
    /"\$\{status\}" == 'running' && "\$\{running\}" == 'true'/,
  );
  assert.match(
    sources.runtimeVerifier,
    /"\$\{health_status\}" == 'healthy'/,
  );
  assert.match(
    sources.runtimeVerifier,
    /"\$\{actual_image_id\}" == "\$\{expected_image_id\}"/,
  );
  assert.match(
    sources.runtimeVerifier,
    /"\$\{service_label\}" == "\$\{service\}"/,
  );
  assert.match(
    sources.runtimeVerifier,
    /"\$\{oneoff_label\}" == 'False'/,
  );
  for (const source of [sources.deploy, sources.rollback, sources.resume]) {
    assert.match(
      source,
      /bash "\$\{RUNTIME_VERIFIER\}" "\$\{MANIFEST\}"/,
    );
  }
});

test('post-migration resume is marker-bound and never reruns migration', () => {
  assert.match(
    sources.resume,
    /RESUME_EXACT_MENORAH_STAGING_SHA_AFTER_MIGRATION/,
  );
  assert.match(sources.resume, /migration-applied-sha/);
  assert.match(sources.resume, /post-migration-recovery-sha/);
  assert.match(
    sources.resume,
    /"\$\{applied_sha\}" == "\$\{RELEASE_SHA\}"/,
  );
  assert.match(
    sources.resume,
    /"\$\{recovery_sha\}" == "\$\{RELEASE_SHA\}"/,
  );
  assert.doesNotMatch(sources.resume, /run-recorded-migration/);

  const applicationStart = sources.resume.indexOf(
    'compose up -d --no-build --pull never --wait --wait-timeout 300',
  );
  const runtimeVerification = sources.resume.indexOf(
    'bash "${RUNTIME_VERIFIER}" "${MANIFEST}"',
  );
  const currentWrite = sources.resume.indexOf(
    'write_sha_marker "${CURRENT_SHA_FILE}"',
  );
  const recoveryClear = sources.resume.indexOf(
    'rm -f -- "${RECOVERY_MARKER}"',
  );
  const inProgressClear = sources.resume.indexOf(
    'rm -f -- "${MIGRATION_IN_PROGRESS}"',
  );
  assert.ok(applicationStart >= 0);
  assert.ok(runtimeVerification > applicationStart);
  assert.ok(currentWrite > runtimeVerification);
  assert.ok(inProgressClear > currentWrite);
  assert.ok(recoveryClear > currentWrite);
  assert.match(sources.resume, /deployment_record_exists=true/);
  assert.match(
    sources.resume,
    /existing successful deployment record is invalid/,
  );
  for (const source of [sources.deploy, sources.resume]) {
    assert.match(source, /stop_application_writers/);
    assert.match(source, /staging-api-ios/);
    assert.match(source, /staging-api-admin/);
    assert.match(source, /staging-worker/);
    assert.match(source, /staging-user-web-app/);
  }
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
    sources.resume,
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
