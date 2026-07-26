import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const shellPath = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  ].find(existsSync)
  : '/bin/bash';
const guardPath = fileURLToPath(new URL(
  '../../deploy/server-staging/assert-process-authority.sh',
  import.meta.url,
));
const expectedProject = 'menorah-staging';
const guardedScripts = [
  'create-image-manifest.sh',
  'deploy-exact-sha.sh',
  'resume-post-migration.sh',
  'rollback-recorded.sh',
  'run-consistent-backup.sh',
  'run-disposable-restore.sh',
  'run-recorded-migration.sh',
];

const runGuard = (extraEnvironment = {}, project = expectedProject) => (
  spawnSync(
    shellPath,
    [
      '-c',
      'source "$1"; server_staging_assert_process_authority "$2"',
      'server-staging-process-authority-test',
      guardPath,
      expectedProject,
    ],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        COMPOSE_PROJECT_NAME: project,
        ...extraEnvironment,
      },
    },
  )
);

test('process authority accepts only the exact project identity', {
  skip: !shellPath,
}, () => {
  assert.equal(runGuard().status, 0);
  for (const project of ['', 'menorah', 'menorah-production']) {
    const result = runGuard({}, project);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unexpected Compose project/);
  }
});

test('process authority rejects Docker, build, Compose, and Git routing', {
  skip: !shellPath,
}, () => {
  for (const [key, value] of Object.entries({
    DOCKER_HOST: 'tcp://production.invalid:2376',
    BUILDKIT_HOST: 'tcp://production.invalid:1234',
    BUILDX_CONFIG: '/opt/menorah/buildx',
    COMPOSE_FILE: '/opt/menorah/compose.yml',
    COMPOSE_PROFILES: 'production',
    GIT_DIR: '/opt/menorah/.git',
    GIT_WORK_TREE: '/opt/menorah',
  })) {
    const result = runGuard({ [key]: value });
    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, new RegExp(`${key} is set`), key);
  }
});

test('every guarded mutation entrypoint invokes the authority check', () => {
  for (const name of guardedScripts) {
    const source = readFileSync(new URL(
      `../../deploy/server-staging/${name}`,
      import.meta.url,
    ), 'utf8');
    assert.match(source, /assert-process-authority\.sh/, name);
    assert.match(source, /source "\$\{PROCESS_AUTHORITY\}"/, name);
    assert.match(
      source,
      /server_staging_assert_process_authority "\$\{EXPECTED_PROJECT\}"/,
      name,
    );
  }
});
