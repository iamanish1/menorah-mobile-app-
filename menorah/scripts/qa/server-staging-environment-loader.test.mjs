import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import test from 'node:test';

import {
  COMPLETION_KEY,
  COMPLETION_VALUE,
  parseEnvironment,
} from '../../deploy/server-staging/load-environment.mjs';
import {
  buildValidationEnvironment,
  parseContractKeys,
  serializeEnvironment,
} from '../../deploy/server-staging/generate-validation-environment.mjs';

const execFileAsync = promisify(execFile);
const loaderPath = fileURLToPath(new URL(
  '../../deploy/server-staging/load-environment.mjs',
  import.meta.url,
));
const stagingScriptDirectory = fileURLToPath(new URL(
  '../../deploy/server-staging/',
  import.meta.url,
));

const parseEmission = (stdout) => {
  const fields = Buffer.from(stdout, 'binary').toString('utf8').split('\0');
  assert.equal(fields.pop(), '');
  assert.equal(fields.length % 2, 0);
  return new Map(
    Array.from(
      { length: fields.length / 2 },
      (_, index) => [fields[index * 2], fields[(index * 2) + 1]],
    ),
  );
};

const assertMissing = async (target) => {
  await assert.rejects(access(target), { code: 'ENOENT' });
};

test('valid generated JSON-quoted environments load without value changes', async () => {
  const contractSource = await readFile(
    new URL('../../deploy/env/server-staging.env.example', import.meta.url),
    'utf8',
  );
  const completeGeneratedValues = buildValidationEnvironment({
    candidateSha: 'a'.repeat(40),
    contractKeys: parseContractKeys(contractSource),
  }).values;
  assert.deepEqual(
    Object.fromEntries(
      parseEnvironment(serializeEnvironment(completeGeneratedValues)),
    ),
    completeGeneratedValues,
  );

  const expected = {
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    EMAIL_FROM: 'Menorah Staging <noreply@mail.staging.menorah.me>',
    MULTILINE_VALUE: 'first line\nsecond "quoted" line',
    EMPTY_VALUE: '',
  };
  const source = serializeEnvironment(expected);
  assert.deepEqual(
    Object.fromEntries(parseEnvironment(source)),
    expected,
  );

  const directory = await mkdtemp(
    path.join(tmpdir(), 'menorah-safe-dotenv-valid-'),
  );
  try {
    const envFile = path.join(directory, 'server-staging.env');
    await writeFile(envFile, source, { mode: 0o600 });
    const { stdout } = await execFileAsync(
      process.execPath,
      [loaderPath, '--emit0', envFile],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 },
    );
    const emitted = parseEmission(stdout);
    assert.equal(emitted.get(COMPLETION_KEY), COMPLETION_VALUE);
    emitted.delete(COMPLETION_KEY);
    assert.deepEqual(Object.fromEntries(emitted), expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('shell substitutions and backticks are rejected without execution', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'menorah-safe-dotenv-inert-'),
  );
  try {
    const firstMarker = path.join(directory, 'command-substitution-ran');
    const secondMarker = path.join(directory, 'backtick-ran');
    const sources = [
      'DOLLAR_PAYLOAD=$(touch command-substitution-ran)',
      'BACKTICK_PAYLOAD=`touch backtick-ran`',
    ];
    for (const [index, payload] of sources.entries()) {
      const envFile = path.join(directory, `server-staging-${index}.env`);
      await writeFile(envFile, `${payload}\n`, { mode: 0o600 });
      const error = await execFileAsync(
        process.execPath,
        [loaderPath, '--emit0', envFile],
        {
          cwd: directory,
          encoding: 'buffer',
          maxBuffer: 1024 * 1024,
        },
      ).then(
        () => assert.fail('shell payload unexpectedly loaded'),
        (failure) => failure,
      );
      assert.equal(error.stdout.length, 0);
    }
    await assertMissing(firstMarker);
    await assertMissing(secondMarker);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ordinary dollar text and spaces remain inert literal values', () => {
  assert.deepEqual(
    Object.fromEntries(parseEnvironment([
      'SAFE_LITERAL=Menorah staging value with spaces',
      'DOLLAR_LITERAL=$HOME is not expanded',
      '',
    ].join('\n'))),
    {
      SAFE_LITERAL: 'Menorah staging value with spaces',
      DOLLAR_LITERAL: '$HOME is not expanded',
    },
  );
});

test('invalid, reserved, process-influencing, and duplicate keys are rejected', () => {
  for (const source of [
    'lowercase=value\n',
    'BAD-KEY=value\n',
    'export SAFE=value\n',
    `${COMPLETION_KEY}=forged\n`,
    'PATH=/untrusted/bin\n',
    'BASH_ENV=/tmp/payload\n',
    'LD_PRELOAD=/tmp/payload.so\n',
    'GIT_CONFIG_COUNT=1\n',
    'GIT_DIR=/tmp/untrusted-git-dir\n',
    'DOCKER_HOST=tcp://production-docker.invalid:2376\n',
    'BUILDKIT_HOST=tcp://production-builder.invalid:1234\n',
    'COMPOSE_FILE=/tmp/production-compose.yml\n',
    'COMPOSE_PROJECT_NAME=menorah\n',
    'HTTP_PROXY=http://production-proxy.invalid:8080\n',
    'SSH_AUTH_SOCK=/tmp/untrusted-agent.sock\n',
    'SAFE=first\nSAFE=second\n',
  ]) {
    assert.throws(
      () => parseEnvironment(source),
      { code: 'invalid_server_staging_environment' },
    );
  }
});

test('persistent operation acknowledgements never load from the env file', () => {
  for (const key of [
    'BACKUP_RESTORE_ACKNOWLEDGEMENT',
    'MENORAH_SERVER_STAGING_ALERT_EXERCISE_CONFIRM',
    'MENORAH_STAGING_BACKUP_ACK',
    'MENORAH_STAGING_DEPLOY_ACK',
    'MENORAH_STAGING_MANIFEST_ACK',
    'MENORAH_STAGING_MIGRATION_ACK',
    'MENORAH_STAGING_RESTORE_ACK',
    'MENORAH_STAGING_ROLLBACK_ACK',
    'MENORAH_STAGING_ROOTS_ACK',
    'MENORAH_STAGING_WRITERS_QUIESCED',
  ]) {
    assert.throws(
      () => parseEnvironment(`${key}=forged-persistent-authority\n`),
      { code: 'invalid_server_staging_environment' },
      key,
    );
  }
});

test('malformed quoted values and embedded control separators are rejected', () => {
  for (const source of [
    'SAFE="unterminated\n',
    'SAFE=before\rafter\n',
    'SAFE=value\0SECOND=value\n',
    'SAFE="decoded\\u0000separator"\n',
  ]) {
    assert.throws(
      () => parseEnvironment(source),
      { code: 'invalid_server_staging_environment' },
    );
  }
});

test('CLI failure emits no partial environment or secret value', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'menorah-safe-dotenv-failure-'),
  );
  try {
    const secret = 'must-not-appear-in-loader-errors';
    const envFile = path.join(directory, 'server-staging.env');
    await writeFile(
      envFile,
      `FIRST_SECRET=${secret}\nFIRST_SECRET=duplicate\n`,
      { mode: 0o600 },
    );
    const error = await execFileAsync(
      process.execPath,
      [loaderPath, '--emit0', envFile],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 },
    ).then(
      () => assert.fail('invalid environment unexpectedly loaded'),
      (failure) => failure,
    );
    assert.equal(error.stdout.length, 0);
    assert.doesNotMatch(error.stderr.toString('utf8'), new RegExp(secret));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('all environment-consuming shell scripts use only the safe loader path', async () => {
  for (const name of [
    'create-image-manifest.sh',
    'deploy-exact-sha.sh',
    'resume-post-migration.sh',
    'rollback-recorded.sh',
    'run-consistent-backup.sh',
    'run-disposable-restore.sh',
    'run-recorded-migration.sh',
  ]) {
    const source = await readFile(
      path.join(stagingScriptDirectory, name),
      'utf8',
    );
    assert.match(
      source,
      /node "\$\{ENV_LOADER\}" --emit0 "\$\{ENV_FILE\}"/,
    );
    assert.match(source, /printf -v "\$\{environment_key\}"/);
    assert.match(source, /export "\$\{environment_key\?\}"/);
    assert.match(source, /safe-dotenv-v1/);
    assert.match(
      source,
      /^source "\$\{PROCESS_AUTHORITY\}"$/m,
    );
    assert.doesNotMatch(
      source.replace(/^source "\$\{PROCESS_AUTHORITY\}"$/m, ''),
      /(?:^|\n)\s*(?:source|\.)\s+/,
    );
    assert.doesNotMatch(source, /(?:^|\n)\s*eval\b/);
    assert.doesNotMatch(source, /set\s+-a/);
  }
});
