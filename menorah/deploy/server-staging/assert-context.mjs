#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIRECTORY = path.dirname(SCRIPT_PATH);

export const EXPECTED_CONTEXT = Object.freeze({
  COMPOSE_PROJECT_NAME: 'menorah-staging',
  MENORAH_SERVER_STAGING_ENVIRONMENT_ID: 'menorah-server-staging-v1',
  MENORAH_STAGING_ROOT: '/opt/menorah-staging',
  MENORAH_STAGING_APP_ROOT: '/opt/menorah-staging/app',
  MENORAH_STAGING_DATA_ROOT: '/opt/menorah-staging/data',
  MENORAH_STAGING_BACKUP_ROOT: '/opt/menorah-staging/backups',
  MENORAH_STAGING_DEPLOY_STATE_ROOT: '/opt/menorah-staging/deploy-state',
  MENORAH_STAGING_LOGS_ROOT: '/opt/menorah-staging/logs',
  MENORAH_STAGING_ENV_ROOT: '/opt/menorah-staging/env',
  MENORAH_STAGING_DATABASE: 'menorah_staging',
  MENORAH_STAGING_REPLICA_SET: 'menorah-staging-rs',
  MENORAH_STAGING_ROOTS_ACK: 'MENORAH_STAGING_ROOTS_REVIEWED',
});

export const DERIVED_PATHS = Object.freeze({
  environmentFile:
    '/opt/menorah-staging/env/server-staging.env',
  composeFile:
    '/opt/menorah-staging/app/menorah/deploy/server-staging/compose.yml',
  releaseState:
    '/opt/menorah-staging/deploy-state/releases',
  backupBundles:
    '/opt/menorah-staging/backups/bundles',
  retrieval:
    '/opt/menorah-staging/data/backup-retrieval',
  restore:
    '/opt/menorah-staging/data/restore',
  restoreMedia:
    '/opt/menorah-staging/data/restore-media',
  uploads:
    '/opt/menorah-staging/data/uploads',
});

export const IDENTITY_RECONCILIATION_MARKER_BASENAME =
  'identity-reconciliation-in-progress-sha';

export const STATE_PATHS = Object.freeze({
  currentSha:
    '/opt/menorah-staging/deploy-state/current-sha',
  lastGoodSha:
    '/opt/menorah-staging/deploy-state/last-good-sha',
  migrationApplied:
    '/opt/menorah-staging/deploy-state/migration-applied-sha',
  migrationInProgress:
    '/opt/menorah-staging/deploy-state/migration-in-progress-sha',
  identityReconciliation:
    '/opt/menorah-staging/deploy-state/'
      + IDENTITY_RECONCILIATION_MARKER_BASENAME,
  deployLock:
    '/opt/menorah-staging/deploy-state/.deploy.lock',
  rollbackLock:
    '/opt/menorah-staging/deploy-state/.rollback.lock',
  migrationLock:
    '/opt/menorah-staging/deploy-state/.migration.lock',
  backupLock:
    '/opt/menorah-staging/deploy-state/.backup.lock',
  restoreLock:
    '/opt/menorah-staging/deploy-state/.restore.lock',
  rollbackInProgress:
    '/opt/menorah-staging/deploy-state/rollback-in-progress-sha',
  recovery:
    '/opt/menorah-staging/deploy-state/post-migration-recovery-sha',
  restoreInProgress:
    '/opt/menorah-staging/deploy-state/recovery/'
      + 'restore-in-progress.json',
  restoreReview:
    '/opt/menorah-staging/deploy-state/recovery/'
      + 'restore-requires-review.json',
});

export const EXPECTED_RELEASE_IDENTITY = Object.freeze({
  schemaVersion: 1,
  composeProject: EXPECTED_CONTEXT.COMPOSE_PROJECT_NAME,
  environmentId:
    EXPECTED_CONTEXT.MENORAH_SERVER_STAGING_ENVIRONMENT_ID,
  filesystemRoot: EXPECTED_CONTEXT.MENORAH_STAGING_ROOT,
  appRoot: EXPECTED_CONTEXT.MENORAH_STAGING_APP_ROOT,
  dataRoot: EXPECTED_CONTEXT.MENORAH_STAGING_DATA_ROOT,
  backupRoot: EXPECTED_CONTEXT.MENORAH_STAGING_BACKUP_ROOT,
  deployStateRoot:
    EXPECTED_CONTEXT.MENORAH_STAGING_DEPLOY_STATE_ROOT,
  logsRoot: EXPECTED_CONTEXT.MENORAH_STAGING_LOGS_ROOT,
  environmentRoot: EXPECTED_CONTEXT.MENORAH_STAGING_ENV_ROOT,
  database: EXPECTED_CONTEXT.MENORAH_STAGING_DATABASE,
  replicaSet: EXPECTED_CONTEXT.MENORAH_STAGING_REPLICA_SET,
});

const PRODUCTION_ROOTS = Object.freeze([
  '/opt/menorah',
  '/opt/menorah/data',
  '/opt/menorah/backups',
  '/opt/menorah/deploy-state',
  '/opt/menorah/menorah',
]);

const VALID_MODES = new Set([
  'backup',
  'restore',
  'manifest',
  'deploy',
  'rollback',
  'migration',
]);

export const EXPECTED_MODE_CONTEXT = Object.freeze({
  backup: Object.freeze({
    MENORAH_STAGING_BACKUP_ACK:
      'BACKUP_MENORAH_STAGING_SYNTHETIC_DATA',
    MENORAH_STAGING_WRITERS_QUIESCED:
      'APPLICATION_WRITERS_STOPPED',
  }),
  restore: Object.freeze({
    MENORAH_STAGING_RESTORE_ACK:
      'RESTORE_MENORAH_STAGING_TO_DISPOSABLE_TARGET',
    MENORAH_STAGING_RESTORE_TARGET:
      'staging-mongo-restore',
    MENORAH_STAGING_RESTORE_REPLICA_SET:
      'menorah-staging-restore-rs',
  }),
  manifest: Object.freeze({
    MENORAH_STAGING_MANIFEST_ACK:
      'RECORD_MENORAH_STAGING_IMMUTABLE_IMAGES',
  }),
  deploy: Object.freeze({
    MENORAH_STAGING_DEPLOY_ACK:
      'DEPLOY_EXACT_MENORAH_STAGING_SHA',
  }),
  rollback: Object.freeze({
    MENORAH_STAGING_ROLLBACK_ACK:
      'ROLLBACK_MENORAH_STAGING_RECORDED_ARTIFACTS',
  }),
  migration: Object.freeze({
    MENORAH_STAGING_MIGRATION_ACK:
      'MIGRATE_MENORAH_STAGING_RECORDED_SHA',
  }),
});

const isFullSha = (value) => /^[0-9a-f]{40}$/.test(value || '');
const isImageId = (value) => /^sha256:[0-9a-f]{64}$/.test(value || '');
const isDigestReference = (value) => (
  typeof value === 'string'
  && value.includes('/menorah-staging/')
  && /@sha256:[0-9a-f]{64}$/.test(value)
  && !/[\s|]/.test(value)
);

const exactEntries = (left, right) => (
  Object.keys(right).every((key) => left?.[key] === right[key])
);

const makeError = (code, message) => Object.assign(new Error(message), {
  code,
});

const assertNoAmbiguousPathSyntax = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw makeError('context_missing', `${label} is required.`);
  }
  if (
    value !== path.posix.normalize(value)
    || !value.startsWith('/')
    || value.endsWith('/')
    || /[*?[\]{}$\\]/.test(value)
    || value.includes('//')
    || value.includes('/./')
    || value.includes('/../')
  ) {
    throw makeError(
      'ambiguous_root',
      `${label} must be one exact canonical absolute path.`,
    );
  }
};

const pathComponents = (absolutePath) => {
  const parts = absolutePath.split('/').filter(Boolean);
  const components = ['/'];
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    components.push(current);
  }
  return components;
};

export const assertCanonicalExistingPath = (
  value,
  expected,
  label,
  fsAdapter = fs,
) => {
  assertNoAmbiguousPathSyntax(value, label);
  if (value !== expected) {
    throw makeError(
      'root_mismatch',
      `${label} is not the reviewed server-staging path.`,
    );
  }
  if (PRODUCTION_ROOTS.includes(value)) {
    throw makeError(
      'production_root',
      `${label} resolves to a production path.`,
    );
  }
  if (!fsAdapter.existsSync(value)) {
    throw makeError(
      'root_missing',
      `${label} must exist before a mutating operation.`,
    );
  }
  for (const component of pathComponents(value)) {
    const stat = fsAdapter.lstatSync(component);
    if (stat.isSymbolicLink()) {
      throw makeError(
        'symlink_root',
        `${label} contains a symbolic-link path component.`,
      );
    }
  }
  const resolved = fsAdapter.realpathSync(value);
  if (resolved !== expected) {
    throw makeError(
      'symlink_escape',
      `${label} resolves outside its exact reviewed path.`,
    );
  }
  const rootStat = fsAdapter.lstatSync(value);
  if (!rootStat.isDirectory()) {
    throw makeError('root_not_directory', `${label} must be a directory.`);
  }
};

export const validateContext = (
  environment,
  {
    mode,
    fsAdapter = fs,
    checkDerivedPaths = true,
    requireOperationAck = true,
  } = {},
) => {
  if (!VALID_MODES.has(mode)) {
    throw makeError('mode_invalid', 'A reviewed mutating mode is required.');
  }

  for (const [key, expected] of Object.entries(EXPECTED_CONTEXT)) {
    const value = environment[key];
    if (value === undefined || value === '') {
      throw makeError('context_missing', `${key} is required.`);
    }
    if (value !== expected) {
      throw makeError(
        'context_mismatch',
        `${key} does not match the server-staging identity.`,
      );
    }
  }
  if (requireOperationAck) {
    for (const [key, expected] of Object.entries(
      EXPECTED_MODE_CONTEXT[mode],
    )) {
      if (environment[key] !== expected) {
        throw makeError(
          'operation_ack_mismatch',
          `${key} does not contain the exact staging-only acknowledgment.`,
        );
      }
    }
  }

  for (const key of [
    'MENORAH_STAGING_ROOT',
    'MENORAH_STAGING_APP_ROOT',
    'MENORAH_STAGING_DATA_ROOT',
    'MENORAH_STAGING_BACKUP_ROOT',
    'MENORAH_STAGING_DEPLOY_STATE_ROOT',
    'MENORAH_STAGING_LOGS_ROOT',
    'MENORAH_STAGING_ENV_ROOT',
  ]) {
    assertCanonicalExistingPath(
      environment[key],
      EXPECTED_CONTEXT[key],
      key,
      fsAdapter,
    );
  }

  if (checkDerivedPaths) {
    const derivedByMode = {
      backup: [
        'backupBundles',
        'retrieval',
        'uploads',
      ],
      restore: [
        'retrieval',
        'restore',
        'restoreMedia',
      ],
      manifest: [
        'releaseState',
      ],
      deploy: [
        'releaseState',
      ],
      rollback: [
        'releaseState',
      ],
      migration: [
        'releaseState',
      ],
    };
    for (const key of derivedByMode[mode]) {
      assertCanonicalExistingPath(
        DERIVED_PATHS[key],
        DERIVED_PATHS[key],
        key,
        fsAdapter,
      );
    }
    if (['manifest', 'deploy', 'rollback', 'migration'].includes(mode)) {
      for (const key of ['environmentFile', 'composeFile']) {
        const value = DERIVED_PATHS[key];
        assertNoAmbiguousPathSyntax(value, key);
        if (!fsAdapter.existsSync(value)) {
          throw makeError(
            'required_file_missing',
            `${key} must exist before a mutating operation.`,
          );
        }
        for (const component of pathComponents(value)) {
          if (fsAdapter.lstatSync(component).isSymbolicLink()) {
            throw makeError(
              'symlink_root',
              `${key} contains a symbolic-link path component.`,
            );
          }
        }
        if (fsAdapter.realpathSync(value) !== value) {
          throw makeError(
            'symlink_escape',
            `${key} does not resolve to its reviewed path.`,
          );
        }
        const stat = fsAdapter.lstatSync(value);
        if (!stat.isFile()) {
          throw makeError('required_file_invalid', `${key} must be a file.`);
        }
      }
    }
  }
  return true;
};

export const parseManifest = (source) => {
  if (typeof source !== 'string' || source.length === 0) {
    throw makeError('manifest_empty', 'The image manifest is empty.');
  }
  if (source.includes('\r') || !source.endsWith('\n')) {
    throw makeError(
      'manifest_format',
      'The image manifest must use canonical LF records.',
    );
  }
  const records = source.slice(0, -1).split('\n').map((line) => {
    const fields = line.split('|');
    if (fields.length !== 3) {
      throw makeError(
        'manifest_record_invalid',
        'An image manifest record has an invalid field count.',
      );
    }
    const [service, reference, imageId] = fields;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(service)) {
      throw makeError(
        'manifest_service_invalid',
        'An image manifest service name is invalid.',
      );
    }
    if (!isDigestReference(reference)) {
      throw makeError(
        'production_artifact',
        'Every recorded application image must be a staging digest reference.',
      );
    }
    if (!isImageId(imageId)) {
      throw makeError(
        'manifest_image_id_invalid',
        'An image manifest content ID is invalid.',
      );
    }
    return { service, reference, imageId };
  });
  const services = new Set();
  for (const record of records) {
    if (services.has(record.service)) {
      throw makeError(
        'manifest_service_duplicate',
        'The image manifest contains a duplicate service.',
      );
    }
    services.add(record.service);
  }
  if (!services.has('staging-migrate')) {
    throw makeError(
      'migration_artifact_missing',
      'The staging migration artifact is absent from the manifest.',
    );
  }
  return records;
};

export const validateReleaseMetadata = ({
  metadata,
  releaseSha,
  manifestPath,
  manifestSha256,
}) => {
  if (!isFullSha(releaseSha)) {
    throw makeError('release_sha_invalid', 'A full release SHA is required.');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw makeError('metadata_invalid', 'Release metadata must be an object.');
  }
  if (!exactEntries(metadata, EXPECTED_RELEASE_IDENTITY)) {
    throw makeError(
      'release_identity_mismatch',
      'Release metadata is not bound to the server-staging identity.',
    );
  }
  const expectedManifest =
    `${DERIVED_PATHS.releaseState}/${releaseSha}.images`;
  if (
    metadata.releaseSha !== releaseSha
    || !isFullSha(metadata.sourceTreeSha)
    || metadata.manifestPath !== expectedManifest
    || manifestPath !== expectedManifest
    || metadata.manifestSha256 !== manifestSha256
    || !/^[0-9a-f]{64}$/.test(manifestSha256 || '')
  ) {
    throw makeError(
      'release_binding_invalid',
      'Release metadata is not bound to the exact source and manifest.',
    );
  }
  return true;
};

export const validateRecordedRelease = (
  releaseSha,
  { fsAdapter = fs } = {},
) => {
  if (!isFullSha(releaseSha)) {
    throw makeError('release_sha_invalid', 'A full release SHA is required.');
  }
  const releaseDirectory = DERIVED_PATHS.releaseState;
  assertCanonicalExistingPath(
    releaseDirectory,
    releaseDirectory,
    'releaseState',
    fsAdapter,
  );
  const manifestPath = `${releaseDirectory}/${releaseSha}.images`;
  const checksumPath = `${manifestPath}.sha256`;
  const metadataPath = `${releaseDirectory}/${releaseSha}.json`;
  for (const file of [manifestPath, checksumPath, metadataPath]) {
    if (!fsAdapter.existsSync(file)) {
      throw makeError(
        'release_file_missing',
        'Recorded release evidence is incomplete.',
      );
    }
    const stat = fsAdapter.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw makeError(
        'release_file_invalid',
        'Recorded release evidence must be regular non-symlink files.',
      );
    }
    if (fsAdapter.realpathSync(file) !== file) {
      throw makeError(
        'release_file_escape',
        'Recorded release evidence resolves outside staging state.',
      );
    }
  }
  const manifestSource = fsAdapter.readFileSync(manifestPath, 'utf8');
  const records = parseManifest(manifestSource);
  const actualHash = crypto
    .createHash('sha256')
    .update(manifestSource)
    .digest('hex');
  const checksumSource = fsAdapter.readFileSync(checksumPath, 'utf8');
  const checksumMatch = checksumSource.match(
    /^([0-9a-f]{64})  ([0-9a-f]{40}\.images)\n$/,
  );
  if (
    !checksumMatch
    || checksumMatch[1] !== actualHash
    || checksumMatch[2] !== `${releaseSha}.images`
  ) {
    throw makeError(
      'release_checksum_invalid',
      'The recorded image manifest checksum does not match.',
    );
  }
  let metadata;
  try {
    metadata = JSON.parse(fsAdapter.readFileSync(metadataPath, 'utf8'));
  } catch {
    throw makeError(
      'metadata_invalid',
      'Release metadata is not valid JSON.',
    );
  }
  validateReleaseMetadata({
    metadata,
    releaseSha,
    manifestPath,
    manifestSha256: actualHash,
  });
  return { metadata, records, manifestSha256: actualHash };
};

const runCli = () => {
  const [operation, argument, ...extra] = process.argv.slice(2);
  if (extra.length > 0) {
    throw makeError('arguments_invalid', 'Unexpected arguments supplied.');
  }
  if (operation === 'release') {
    validateContext(process.env, {
      mode: 'rollback',
      requireOperationAck: false,
    });
    validateRecordedRelease(argument);
    process.stdout.write('Recorded server-staging release validates.\n');
    return;
  }
  if (argument !== undefined) {
    throw makeError('arguments_invalid', 'Unexpected arguments supplied.');
  }
  validateContext(process.env, { mode: operation });
  process.stdout.write(`Server-staging ${operation} context validates.\n`);
};

if (path.resolve(process.argv[1] || '') === path.resolve(SCRIPT_PATH)) {
  try {
    runCli();
  } catch (error) {
    const code = error?.code || 'context_validation_failed';
    process.stderr.write(
      `Server-staging operation refused [${code}]: ${error.message}\n`,
    );
    process.exitCode = 1;
  }
}

export { isDigestReference, isFullSha };
