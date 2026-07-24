const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CONFIRMATION,
  clearSyntheticMessages,
  readLatestSyntheticOtp,
  requireConfirmation,
} = require('./local-mail-capture');

const confirmedEnv = {
  QA_LOCAL_STAGING_MAIL_CAPTURE_CONFIRM: CONFIRMATION,
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
