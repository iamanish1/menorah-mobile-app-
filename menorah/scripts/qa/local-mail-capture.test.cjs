const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CONFIRMATION,
  clearSyntheticMessages,
  readLatestSyntheticOtp,
  requireConfirmation,
} = require('./local-mail-capture');
const {
  SERVER_STAGING_VALIDATION_CONFIRMATION,
  SERVER_STAGING_VALIDATION_PROJECT,
} = require('./smoke-target-safety');

const confirmedEnv = {
  QA_LOCAL_STAGING_MAIL_CAPTURE_CONFIRM: CONFIRMATION,
};
const confirmedServerEnv = {
  ...confirmedEnv,
  QA_TARGET_ENVIRONMENT: 'staging',
  QA_SERVER_STAGING_VALIDATION_CONFIRM:
    SERVER_STAGING_VALIDATION_CONFIRMATION,
  COMPOSE_PROJECT_NAME: SERVER_STAGING_VALIDATION_PROJECT,
};

test('capture helper requires the exact local synthetic confirmation', () => {
  assert.throws(() => requireConfirmation({}), /exact synthetic OTP/);
  assert.doesNotThrow(() => requireConfirmation(confirmedEnv));
});

test('capture helper rejects recipients outside the synthetic mailbox', () => {
  assert.throws(() => readLatestSyntheticOtp('admin@example.com', {
    env: confirmedEnv,
    execute: () => {
      throw new Error('docker must not run');
    },
  }), /only an exact synthetic recipient/);
});

test('capture helper reads an OTP only from the exact project service', () => {
  const calls = [];
  const execute = (command, args) => {
    calls.push({ command, args });
    return calls.length === 1 ? 'container-id\n' : '123456';
  };

  assert.equal(
    readLatestSyntheticOtp('admin-full-1@mail.staging.localhost', {
      env: confirmedEnv,
      execute,
    }),
    '123456',
  );
  assert.deepEqual(calls[0].args.slice(0, 5), [
    'ps',
    '--filter',
    'label=com.docker.compose.project=menorah-local-staging',
    '--filter',
    'label=com.docker.compose.service=mail-capture',
  ]);
  assert.deepEqual(calls[1].args.slice(0, 3), [
    'exec',
    '-i',
    'container-id',
  ]);
});

test('capture helper selects only the server validation project and mailbox', () => {
  const calls = [];
  const execute = (command, args) => {
    calls.push({ command, args });
    return calls.length === 1 ? 'server-container-id\n' : '654321';
  };

  assert.equal(
    readLatestSyntheticOtp('admin-full-1@mail.staging.menorah.me', {
      env: confirmedServerEnv,
      execute,
    }),
    '654321',
  );
  assert.deepEqual(calls[0].args.slice(0, 5), [
    'ps',
    '--filter',
    'label=com.docker.compose.project=menorah-server-staging-validation',
    '--filter',
    'label=com.docker.compose.service=staging-mail-capture',
  ]);
});

test('capture helper rejects crossed server project and mailbox inputs', () => {
  assert.throws(
    () => readLatestSyntheticOtp(
      'admin-full-1@mail.staging.localhost',
      {
        env: confirmedServerEnv,
        execute: () => {
          throw new Error('docker must not run');
        },
      },
    ),
    /only an exact synthetic recipient/,
  );
  assert.throws(
    () => readLatestSyntheticOtp(
      'admin-full-1@mail.staging.menorah.me',
      {
        env: {
          ...confirmedServerEnv,
          COMPOSE_PROJECT_NAME: 'menorah-local-staging',
        },
        execute: () => {
          throw new Error('docker must not run');
        },
      },
    ),
    /COMPOSE_PROJECT_NAME=menorah-server-staging-validation/,
  );
});

test('capture clear keeps provider credentials inside the container', () => {
  const calls = [];
  const execute = (_command, args) => {
    calls.push(args);
    return calls.length === 1 ? 'container-id\n' : '';
  };

  clearSyntheticMessages({ env: confirmedEnv, execute });

  const serialized = JSON.stringify(calls);
  assert.doesNotMatch(serialized, /MAIL_CAPTURE_API_KEY=/);
  assert.match(serialized, /process\.env\.MAIL_CAPTURE_API_KEY/);
});
