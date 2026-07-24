const assert = require('node:assert/strict');
const test = require('node:test');

const policies = [
  require('../../user-web-app/scripts/call-origin-policy.cjs'),
  require('../../web-app/scripts/call-origin-policy.cjs'),
];

for (const [index, { readCallOrigins }] of policies.entries()) {
  test(`web call-origin policy ${index + 1} accepts an exact staging LiveKit origin`, () => {
    assert.deepEqual(
      readCallOrigins('wss://calls.staging.example.test', { required: true }),
      [
        'https://calls.staging.example.test',
        'wss://calls.staging.example.test',
      ]
    );
  });

  test(`web call-origin policy ${index + 1} accepts only the exact local staging high port`, () => {
    const environment = {
      MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:
        'menorah-local-staging-v1',
      MENORAH_LOCAL_STAGING_HTTPS_PORT: '28443',
    };
    assert.deepEqual(
      readCallOrigins(
        'wss://calls.staging.localhost:28443',
        { required: true, environment }
      ),
      [
        'https://calls.staging.localhost:28443',
        'wss://calls.staging.localhost:28443',
      ]
    );
    for (const value of [
      'wss://calls.staging.localhost:28444',
      'wss://calls.staging.example.test:28443',
      'wss://calls.menorah.me:28443',
    ]) {
      assert.throws(
        () => readCallOrigins(value, { required: true, environment })
      );
    }
    assert.throws(
      () => readCallOrigins(
        'wss://calls.staging.localhost:28443',
        {
          required: true,
          environment: {
            ...environment,
            MENORAH_LOCAL_STAGING_ENVIRONMENT_ID: 'other',
          },
        }
      )
    );
  });

  test(`web call-origin policy ${index + 1} fails closed`, () => {
    assert.throws(
      () => readCallOrigins(undefined, { required: true }),
      /NEXT_PUBLIC_CALLS_URL is required/
    );
    for (const value of [
      'http://calls.staging.example.test',
      'wss://calls.staging.example.test:8443',
      'wss://calls.staging.example.test/room',
      'wss://calls.staging.example.test?token=secret',
      'wss://calls.staging.example.test.',
    ]) {
      assert.throws(() => readCallOrigins(value, { required: true }));
    }
  });
}
