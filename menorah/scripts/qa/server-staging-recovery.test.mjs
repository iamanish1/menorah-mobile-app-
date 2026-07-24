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
  alertmanagerReleasePreflight:
    read('assert-alertmanager-release-preflight.sh'),
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
  productionBackup.MENORAH_SERVER_STAGING_BACKUP_ROOT =
    '/opt/menorah/backups';
  assert.equal(
    captureCode(() => validateContext(productionBackup, {
      mode: 'backup',
      fsAdapter: canonicalFs,
      checkDerivedPaths: false,
    })),
    'context_mismatch',
  );

  const productionState = environmentFor('deploy');
  productionState.MENORAH_SERVER_STAGING_DEPLOY_STATE_ROOT =
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
  productionDatabase.MONGO_DATABASE = 'menorah';
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
      value === '/opt/menorah-staging/deploy-state'
        ? '/opt/menorah/deploy-state'
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
  const firstDeploymentSeedCondition = sources.deploy.indexOf(
    'if [[ -z "${previous_sha}" ]]; then',
    runtimeVerification,
  );
  const seedRun = sources.deploy.indexOf(
    '--exit-code-from staging-seed',
    firstDeploymentSeedCondition,
  );
  const seedAssertion = sources.deploy.indexOf(
    'assert_successful_seed',
    seedRun,
  );
  const deploymentRecord = sources.deploy.indexOf(
    'deployment_record_temp="$(',
    seedAssertion,
  );

  assert.ok(datastoreStart >= 0);
  assert.ok(initializer > datastoreStart);
  assert.ok(migration > initializer);
  assert.ok(recoveryValidation > migration);
  assert.ok(applicationStart > recoveryValidation);
  assert.ok(runtimeVerification > applicationStart);
  assert.ok(firstDeploymentSeedCondition > runtimeVerification);
  assert.ok(seedRun > firstDeploymentSeedCondition);
  assert.ok(seedAssertion > seedRun);
  assert.ok(deploymentRecord > seedAssertion);
  for (const source of [sources.deploy, sources.migration]) {
    assert.match(source, /ps -a -q "\$\{service\}"/);
    assert.match(source, /\.State\.Status/);
    assert.match(source, /staging-mongo-primary/);
    assert.match(source, /staging-mongo-replica-init/);
    assert.match(source, /staging-redis/);
  }
});

test('first deployment seeds once through the bounded profile service', () => {
  const collapsed = sources.deploy.replace(/\\\r?\n\s*/g, ' ');
  assert.match(
    collapsed,
    /if \[\[ -z "\$\{previous_sha\}" \]\]; then\s+compose\s+--profile seed\s+up --no-deps --force-recreate --no-build --pull never\s+--abort-on-container-exit\s+--exit-code-from staging-seed\s+staging-seed\s+assert_successful_seed\s+seed_disposition='created-bounded-synthetic-roster'\s+fi/,
  );
  assert.match(
    sources.deploy,
    /seed_disposition='preserved-existing-bounded-synthetic-roster'\s+if \[\[ -z "\$\{previous_sha\}" \]\]/,
  );
  assert.doesNotMatch(
    collapsed,
    /--profile seed\s+(?:run|up -d)\b/,
  );
  assert.doesNotMatch(
    collapsed,
    /(?:staging-seed|assert_successful_seed)\s*(?:\|\| true|&)/,
  );
  assert.equal(
    [...sources.deploy.matchAll(/--exit-code-from staging-seed/g)].length,
    1,
  );
});

test('seed completion is exact, non-restarting, and inside recovery', () => {
  const assertionStart = sources.deploy.indexOf(
    'assert_successful_seed() {',
  );
  const assertionEnd = sources.deploy.indexOf(
    '\n}\n\n[[ "$#" -eq 1 ]]',
    assertionStart,
  );
  const assertion = sources.deploy.slice(assertionStart, assertionEnd);
  assert.match(assertion, /ps -a -q "\$\{service\}"/);
  assert.match(
    assertion,
    /"\$\{#container_ids\[@\]\}" -eq 1/,
  );
  assert.match(assertion, /\.State\.ExitCode/);
  assert.match(assertion, /\.State\.OOMKilled/);
  assert.match(assertion, /\.RestartCount/);
  assert.match(assertion, /\.HostConfig\.RestartPolicy\.Name/);
  assert.match(
    assertion,
    /exited\|false\|0\|false\|0\|no\|\$\{EXPECTED_PROJECT\}\|\$\{service\}\|False/,
  );

  const trapArm = sources.deploy.indexOf(
    "trap 'status=$?; trap - EXIT; on_exit",
  );
  const seedRun = sources.deploy.indexOf('--exit-code-from staging-seed');
  const recordMove = sources.deploy.indexOf(
    'mv -- "${deployment_record_temp}" "${DEPLOYMENT_RECORD}"',
  );
  const recoveryClear = sources.deploy.indexOf(
    'rm -f -- "${RECOVERY_MARKER}"',
  );
  assert.ok(trapArm >= 0);
  assert.ok(seedRun > trapArm);
  assert.ok(recordMove > seedRun);
  assert.ok(recoveryClear > recordMove);
  assert.match(
    sources.deploy,
    /if \[\[ "\$\{status\}" -ne 0 && "\$\{deployment_succeeded\}" != true \]\]; then\s+stop_application_writers/,
  );
});

test('immutable deployment record captures the first-only seed disposition', () => {
  assert.match(
    sources.deploy,
    /SEED_DISPOSITION_VALUE="\$\{seed_disposition\}"/,
  );
  assert.match(
    sources.deploy,
    /seedDisposition: process\.env\.SEED_DISPOSITION_VALUE/,
  );
  assert.match(
    sources.deploy,
    /seed_disposition='preserved-existing-bounded-synthetic-roster'/,
  );
  assert.match(
    sources.deploy,
    /seed_disposition='created-bounded-synthetic-roster'/,
  );
});

test('Alertmanager release preflight is pinned, offline, and redacted', () => {
  const source = sources.alertmanagerReleasePreflight;
  assert.match(
    source,
    /prom\/alertmanager:v0\.32\.1@sha256:51a825c2a40acc3e338fdd00d622e01ec090f72be2b3ea46be0839cd47a4d286/,
  );
  assert.match(source, /--pull never/);
  assert.match(source, /--network none/);
  assert.match(source, /--user '65534:65534'/);
  assert.match(source, /--read-only/);
  assert.match(source, /--cap-drop ALL/);
  assert.match(source, /--security-opt no-new-privileges:true/);
  assert.match(source, /test -r "\$1"/);
  assert.match(source, /\/bin\/amtool check-config "\$1"/);
  assert.match(
    source,
    /node "\$\{ENVIRONMENT_VALIDATOR\}"[\s\S]*--env "\$\{ENV_FILE\}"[\s\S]*--print-alertmanager-source[\s\S]*2>\/dev\/null/,
  );
  assert.match(
    source,
    /\/bin\/amtool check-config "\$1" >\/dev\/null 2>&1/,
  );

  const result = spawnSync(
    shellPath,
    [scriptPath('assert-alertmanager-release-preflight.sh'), 'unexpected'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    'Server-staging Alertmanager release preflight refused: '
      + 'validation failed.\n',
  );
});

test('release authority paths preflight Alertmanager before mutation', () => {
  const invocation = 'bash "${ALERTMANAGER_RELEASE_PREFLIGHT}"';
  const cases = [
    {
      source: sources.deploy,
      mutations: [
        'exec 9>>"${DEPLOY_LOCK}"',
        'compose config --quiet',
        'pull --policy always',
        'staging-mongo-primary \\\n  staging-redis',
      ],
    },
    {
      source: sources.resume,
      mutations: [
        'exec 9>>"${DEPLOY_LOCK}"',
        'compose config --quiet',
        'compose up -d --no-build --pull never --wait --wait-timeout 300',
      ],
    },
    {
      source: sources.rollback,
      mutations: [
        'exec 9>>"${DEPLOY_LOCK}"',
        'exec 8>>"${ROLLBACK_LOCK}"',
        'write_sha_marker \\\n  "${ROLLBACK_MARKER}"',
        '  config --quiet',
        '  up -d --force-recreate',
      ],
    },
    {
      source: sources.migration,
      mutations: [
        'exec 8>>"${MIGRATION_LOCK}"',
        "recovery_sha=''",
        'write_sha_marker \\\n  "${IN_PROGRESS_MARKER}"',
        'compose run --rm --no-deps --pull never staging-migrate',
      ],
    },
    {
      source: sources.manifest,
      mutations: [
        'exec 9>>"${MANIFEST_LOCK}"',
        'CONFIG_TEMP="$(mktemp "${RELEASE_STATE}/.compose-${RELEASE_SHA}.XXXXXX")"',
        '  config --format json > "${CONFIG_TEMP}"',
      ],
    },
  ];
  for (const { source, mutations } of cases) {
    const preflight = source.indexOf(invocation);
    assert.ok(preflight >= 0, 'preflight invocation must be present');
    for (const mutation of mutations) {
      const mutationOffset = source.indexOf(mutation, preflight);
      assert.ok(
        mutationOffset > preflight,
        `mutation must follow preflight: ${mutation}`,
      );
    }
  }

  assert.match(
    sources.runtimeVerifier,
    /bash "\$\{ALERTMANAGER_RELEASE_PREFLIGHT\}"[\s\S]*post-start Alertmanager release preflight failed/,
  );
  for (const source of [
    sources.deploy,
    sources.resume,
    sources.rollback,
  ]) {
    const start = source.indexOf('up -d ');
    const runtimeVerification = source.indexOf(
      'bash "${RUNTIME_VERIFIER}" "${MANIFEST}"',
    );
    assert.ok(start >= 0);
    assert.ok(runtimeVerification > start);
  }
});

test('deployment evidence binds the reviewed Alertmanager contract', () => {
  const expectedFields = [
    ['alertmanagerConfigSha256', 'ALERTMANAGER_CONFIG_SHA256_VALUE'],
    ['alertmanagerReceiver', 'ALERTMANAGER_RECEIVER_VALUE'],
    ['alertmanagerEndpointHost', 'ALERTMANAGER_ENDPOINT_HOST_VALUE'],
    [
      'alertmanagerConfigReviewedAt',
      'ALERTMANAGER_CONFIG_REVIEWED_AT_VALUE',
    ],
    [
      'alertmanagerConfigReviewReference',
      'ALERTMANAGER_CONFIG_REVIEW_REFERENCE_VALUE',
    ],
  ];
  for (const [field, valueVariable] of expectedFields) {
    for (const source of [
      sources.deploy,
      sources.resume,
      sources.rollback,
    ]) {
      assert.match(
        source,
        new RegExp(
          `${field}:[\\s\\n]*process\\.env\\.${valueVariable}`,
        ),
      );
    }
    assert.match(
      sources.migration,
      new RegExp(
        `${field}:[\\s\\n]*process\\.env\\.${valueVariable}`,
      ),
    );
  }
  for (const source of [
    sources.deploy,
    sources.resume,
    sources.rollback,
    sources.migration,
  ]) {
    assert.match(
      source,
      /ALERTMANAGER_CONFIG_REVIEWED_AT_VALUE="\$\{ALERTMANAGER_CONFIG_REVIEWED_AT\}"/,
    );
    assert.match(
      source,
      /ALERTMANAGER_CONFIG_REVIEW_REFERENCE_VALUE="\$\{ALERTMANAGER_CONFIG_REVIEW_REFERENCE\}"/,
    );
    assert.doesNotMatch(source, /ALERTMANAGER_DELIVERY_VERIFIED_AT/);
    assert.doesNotMatch(source, /ALERTMANAGER_DELIVERY_TEST_REFERENCE/);
  }
});

test('runtime verification enforces one exact Alertmanager digest label', () => {
  assert.match(
    sources.runtimeVerifier,
    /com\.menorah\.alertmanager-config-sha256/,
  );
  assert.match(
    sources.runtimeVerifier,
    /"\$\{alertmanager_config_digest_label\}" \\\s+== "\$\{ALERTMANAGER_CONFIG_SHA256\}"/,
  );
  assert.match(
    sources.runtimeVerifier,
    /"\$\{alertmanager_count\}" -eq 1/,
  );
  assert.match(
    sources.runtimeVerifier,
    /Alertmanager runtime config digest label is invalid/,
  );
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

test('first-deployment resume seeds after runtime verification and before evidence', () => {
  const trapArm = sources.resume.indexOf(
    "trap 'status=$?; trap - EXIT; on_exit",
  );
  const runtimeVerification = sources.resume.indexOf(
    'bash "${RUNTIME_VERIFIER}" "${MANIFEST}"',
  );
  const firstDeploymentCondition = sources.resume.indexOf(
    'if [[ "${deployment_record_exists}" != true'
      + ' && -z "${current_sha}" ]]; then',
    runtimeVerification,
  );
  const seedRun = sources.resume.indexOf(
    '--exit-code-from staging-seed',
    firstDeploymentCondition,
  );
  const seedAssertion = sources.resume.indexOf(
    'assert_successful_seed',
    seedRun,
  );
  const deploymentRecord = sources.resume.indexOf(
    'deployment_record_temp="$(',
    seedAssertion,
  );
  const recordMove = sources.resume.indexOf(
    'mv -- "${deployment_record_temp}" "${DEPLOYMENT_RECORD}"',
    deploymentRecord,
  );
  const currentWrite = sources.resume.indexOf(
    'write_sha_marker "${CURRENT_SHA_FILE}"',
    recordMove,
  );
  const recoveryClear = sources.resume.indexOf(
    'rm -f -- "${RECOVERY_MARKER}"',
    currentWrite,
  );

  assert.ok(trapArm >= 0);
  assert.ok(runtimeVerification > trapArm);
  assert.ok(firstDeploymentCondition > runtimeVerification);
  assert.ok(seedRun > firstDeploymentCondition);
  assert.ok(seedAssertion > seedRun);
  assert.ok(deploymentRecord > seedAssertion);
  assert.ok(recordMove > deploymentRecord);
  assert.ok(currentWrite > recordMove);
  assert.ok(recoveryClear > currentWrite);
});

test('post-migration resume preserves the first-only seed invariant', () => {
  const collapsed = sources.resume.replace(/\\\r?\n\s*/g, ' ');
  assert.match(
    collapsed,
    /seed_disposition='preserved-existing-bounded-synthetic-roster'\s+if \[\[ "\$\{deployment_record_exists\}" != true && -z "\$\{current_sha\}" \]\]; then\s+if prior_successful_seed_exists; then\s+:\s+else\s+compose\s+--profile seed\s+up --no-deps --force-recreate --no-build --pull never\s+--abort-on-container-exit\s+--exit-code-from staging-seed\s+staging-seed\s+assert_successful_seed\s+fi\s+seed_disposition='created-bounded-synthetic-roster'\s+fi/,
  );
  assert.equal(
    [...sources.resume.matchAll(/--exit-code-from staging-seed/g)].length,
    1,
  );
  assert.doesNotMatch(
    collapsed,
    /--profile seed\s+(?:run|up -d)\b/,
  );
  assert.doesNotMatch(
    collapsed,
    /(?:staging-seed|assert_successful_seed)\s*(?:\|\| true|&)/,
  );
  assert.match(
    sources.resume,
    /SEED_DISPOSITION_VALUE="\$\{seed_disposition\}"/,
  );
  assert.match(
    sources.resume,
    /seedDisposition: process\.env\.SEED_DISPOSITION_VALUE/,
  );
});

test('resume reuses one exact successful seed and only runs when absent', () => {
  const helperStart = sources.resume.indexOf(
    'prior_successful_seed_exists() {',
  );
  const helperEnd = sources.resume.indexOf(
    '\n}\n\n[[ "$#" -eq 1 ]]',
    helperStart,
  );
  const helper = sources.resume.slice(helperStart, helperEnd);
  assert.match(
    helper,
    /container_output="\$\(compose ps -a -q "\$\{service\}"\)"/,
  );
  assert.match(helper, /\[\[ -n "\$\{container_output\}" \]\] \|\| return 1/);
  assert.match(
    helper,
    /"\$\{#container_ids\[@\]\}" -eq 1 && -n "\$\{container_ids\[0\]\}"/,
  );
  assert.match(helper, /prior synthetic roster seed is ambiguous/);
  assert.match(helper, /assert_successful_seed/);

  const collapsed = sources.resume.replace(/\\\r?\n\s*/g, ' ');
  assert.match(
    collapsed,
    /if prior_successful_seed_exists; then\s+:\s+else\s+compose\s+--profile seed\s+up [\s\S]*?--exit-code-from staging-seed\s+staging-seed\s+assert_successful_seed\s+fi/,
  );
  assert.doesNotMatch(
    collapsed,
    /if prior_successful_seed_exists; then\s+(?:compose|docker|assert_successful_seed)/,
  );
});

test('prior seed acceptance is bound to immutable candidate image evidence', () => {
  assert.match(sources.resume, /load_seed_image_identity\(\) \{/);
  assert.match(
    sources.resume,
    /"\$\{service\}" == 'staging-migrate'/,
  );
  assert.match(
    sources.resume,
    /compose --profile seed config --format json/,
  );
  assert.match(
    sources.resume,
    /seed\.restart !== "no"/,
  );
  assert.match(
    sources.resume,
    /!seed\.profiles\.includes\("seed"\)/,
  );
  assert.match(
    sources.resume,
    /"\$\{rendered_seed_reference\}" == "\$\{migration_reference\}"/,
  );
  assert.match(sources.resume, /\{\{\.Config\.Image\}\}/);
  assert.match(sources.resume, /\{\{\.Image\}\}/);
  assert.match(
    sources.resume,
    /\$\{EXPECTED_SEED_IMAGE_REFERENCE\}\|\$\{EXPECTED_SEED_IMAGE_ID\}\|\$\{EXPECTED_PROJECT\}\|\$\{service\}\|False/,
  );
});

test('resume refuses unsafe or cross-candidate prior seed states', () => {
  const assertionStart = sources.resume.indexOf(
    'assert_successful_seed() {',
  );
  const assertionEnd = sources.resume.indexOf(
    '\n}\n\nprior_successful_seed_exists() {',
    assertionStart,
  );
  const assertion = sources.resume.slice(assertionStart, assertionEnd);
  const validIdentity = [
    'exited',
    'false',
    '0',
    'false',
    '0',
    'no',
    '${EXPECTED_SEED_IMAGE_REFERENCE}',
    '${EXPECTED_SEED_IMAGE_ID}',
    '${EXPECTED_PROJECT}',
    '${service}',
    'False',
  ].join('|');
  assert.ok(assertion.includes(validIdentity));
  for (const unsafeIdentity of [
    validIdentity.replace('exited|false', 'running|true'),
    validIdentity.replace('|0|false|0|no|', '|1|false|0|no|'),
    validIdentity.replace('|0|false|0|no|', '|0|true|0|no|'),
    validIdentity.replace('|false|0|no|', '|false|1|no|'),
    validIdentity.replace('|0|no|', '|0|on-failure|'),
    validIdentity.replace(
      '${EXPECTED_SEED_IMAGE_REFERENCE}',
      'registry.invalid/cross-candidate@sha256:bad',
    ),
    validIdentity.replace(
      '${EXPECTED_SEED_IMAGE_ID}',
      `sha256:${'f'.repeat(64)}`,
    ),
    validIdentity.replace('${EXPECTED_PROJECT}', 'menorah-production'),
    validIdentity.replace('${service}', 'staging-migrate'),
    validIdentity.replace('|False', '|True'),
  ]) {
    assert.notEqual(unsafeIdentity, validIdentity);
  }
  assert.match(
    assertion,
    /\[\[ "\$\{identity\}" == \\\s+"exited[\s\S]*\]\] \\\s+\|\| fail 'synthetic roster seed did not complete exactly once'/,
  );
});

test('existing resume evidence validates seed disposition without replay', () => {
  assert.match(
    sources.resume,
    /const createdSeedDisposition = 'created-bounded-synthetic-roster';/,
  );
  assert.match(
    sources.resume,
    /const preservedSeedDisposition =\s+'preserved-existing-bounded-synthetic-roster';/,
  );
  assert.match(
    sources.resume,
    /record\.previousSha === null\s+&& record\.seedDisposition !== createdSeedDisposition/,
  );
  assert.match(
    sources.resume,
    /record\.previousSha !== null\s+&& record\.seedDisposition !== preservedSeedDisposition/,
  );
  assert.match(
    sources.resume,
    /if \[\[ "\$\{deployment_record_exists\}" != true && -z "\$\{current_sha\}" \]\]/,
  );
  assert.match(
    sources.resume,
    /if \[\[ "\$\{deployment_record_exists\}" != true \]\]; then\s+deployment_record_temp=/,
  );
});

test('resume seed failure remains inside the post-migration recovery boundary', () => {
  const assertionStart = sources.resume.indexOf(
    'assert_successful_seed() {',
  );
  const assertionEnd = sources.resume.indexOf(
    '\n}\n\nprior_successful_seed_exists() {',
    assertionStart,
  );
  const assertion = sources.resume.slice(assertionStart, assertionEnd);
  assert.match(assertion, /ps -a -q "\$\{service\}"/);
  assert.match(
    assertion,
    /"\$\{#container_ids\[@\]\}" -eq 1/,
  );
  assert.match(assertion, /\.State\.ExitCode/);
  assert.match(assertion, /\.State\.OOMKilled/);
  assert.match(assertion, /\.RestartCount/);
  assert.match(assertion, /\.HostConfig\.RestartPolicy\.Name/);
  assert.match(assertion, /\{\{\.Config\.Image\}\}/);
  assert.match(assertion, /\{\{\.Image\}\}/);
  assert.match(
    assertion,
    /exited\|false\|0\|false\|0\|no\|\$\{EXPECTED_SEED_IMAGE_REFERENCE\}\|\$\{EXPECTED_SEED_IMAGE_ID\}\|\$\{EXPECTED_PROJECT\}\|\$\{service\}\|False/,
  );
  assert.match(
    sources.resume,
    /if \[\[ "\$\{status\}" -ne 0 && "\$\{resume_succeeded\}" != true \]\]; then\s+stop_application_writers/,
  );
  assert.match(
    sources.resume,
    /Post-migration resume failed; application writers were stopped and \$\{RECOVERY_MARKER\} remains for review/,
  );
  assert.equal(
    [...sources.resume.matchAll(/rm -f -- "\$\{RECOVERY_MARKER\}"/g)]
      .length,
    1,
  );
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
