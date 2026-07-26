const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');
const ts = require('typescript');

const sourcePath = path.join(__dirname, 'landing-email.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;
const loadedModule = new Module(sourcePath, module);
loadedModule.filename = sourcePath;
loadedModule.paths = module.paths;
loadedModule._compile(compiled, sourcePath);
const { sendSubmissionEmail } = loadedModule.exports;

const originalEnv = process.env;
const originalFetch = global.fetch;
let fetchCalls;
let lastFetchUrl;

const routingEnvironmentKeys = [
  'DEPLOYMENT_ENVIRONMENT',
  'SERVICE_RUNTIME',
  'MENORAH_SYNTHETIC_DATA_ONLY',
  'MENORAH_LOCAL_STAGING_ENVIRONMENT_ID',
  'MENORAH_LOCAL_STAGING_HTTPS_PORT',
  'MENORAH_SERVER_STAGING_ENVIRONMENT_ID',
  'MENORAH_SERVER_STAGING_PROJECT_NAME',
  'MENORAH_SERVER_STAGING_HTTPS_PORT',
  'MENORAH_STAGING_EMAIL_DOMAIN',
  'RESEND_API_URL',
  'RESEND_PROVIDER_ENABLED',
  'RESEND_MODE',
];

const input = {
  subject: 'Synthetic contact',
  source: 'Unit test',
  name: 'Synthetic User',
  email: 'synthetic@mail.staging.example.com',
  idempotencyKey: 'synthetic-contact-1',
  message: 'Synthetic staging message',
};

beforeEach(() => {
  process.env = {
    ...originalEnv,
    RESEND_API_KEY: 'test-resend-key',
    EMAIL_FROM: 'Menorah Staging <noreply@mail.staging.example.com>',
    CONTACT_TO_EMAIL: 'contact@mail.staging.example.com',
  };
  for (const key of routingEnvironmentKeys) {
    delete process.env[key];
  }
  fetchCalls = 0;
  lastFetchUrl = undefined;
  global.fetch = async (url) => {
    fetchCalls += 1;
    lastFetchUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'synthetic-message-id' }),
    };
  };
});

const configureExactRealServerStagingResendSandbox = () => {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SERVICE_RUNTIME: 'server-staging',
    MENORAH_SYNTHETIC_DATA_ONLY: 'true',
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
      'menorah-server-staging-v1',
    MENORAH_SERVER_STAGING_PROJECT_NAME: 'menorah-staging',
    MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
    MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.menorah.me',
    RESEND_PROVIDER_ENABLED: 'true',
    RESEND_MODE: 'sandbox',
    RESEND_API_URL: 'https://api.resend.com/emails',
    RESEND_API_KEY: `re_${'e'.repeat(40)}`,
    EMAIL_FROM:
      'Menorah Staging <noreply@mail.staging.menorah.me>',
    CONTACT_TO_EMAIL: 'contact@mail.staging.menorah.me',
  });
  delete process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID;
  delete process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT;
};

after(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

test('does not call Resend when the contact recipient is missing', async () => {
  delete process.env.CONTACT_TO_EMAIL;

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, false);
  assert.match(result.skippedReason, /CONTACT_TO_EMAIL/);
  assert.equal(fetchCalls, 0);
});

test('does not call Resend for an unsupported deployment environment', async () => {
  process.env.DEPLOYMENT_ENVIRONMENT = 'preview';

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, false);
  assert.match(result.skippedReason, /DEPLOYMENT_ENVIRONMENT/);
  assert.equal(fetchCalls, 0);
});

test('does not call Resend when staging contact email targets a live domain', async () => {
  process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
  process.env.MENORAH_STAGING_EMAIL_DOMAIN = 'mail.staging.example.com';
  process.env.CONTACT_TO_EMAIL = 'contact@gmail.com';

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, false);
  assert.match(result.skippedReason, /not isolated/);
  assert.equal(fetchCalls, 0);
});

test('calls Resend only with the exact reviewed staging email domain', async () => {
  process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
  process.env.MENORAH_STAGING_EMAIL_DOMAIN = 'mail.staging.example.com';

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, true);
  assert.equal(result.recipient, 'contact@mail.staging.example.com');
  assert.equal(fetchCalls, 1);
  assert.equal(lastFetchUrl, 'https://api.resend.com/emails');
});

test('routes only the exact generated local identity to mail capture', async () => {
  process.env.NODE_ENV = 'production';
  process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
  process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID =
    'menorah-local-staging-v1';
  process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT = '28443';
  process.env.MENORAH_STAGING_EMAIL_DOMAIN = 'mail.staging.localhost';
  process.env.RESEND_API_URL = 'http://mail-capture:8025/emails';
  process.env.RESEND_API_KEY = `re_local_${'a'.repeat(40)}`;
  process.env.EMAIL_FROM =
    'Menorah Staging <noreply@mail.staging.localhost>';
  process.env.CONTACT_TO_EMAIL = 'contact@mail.staging.localhost';

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, true);
  assert.equal(lastFetchUrl, 'http://mail-capture:8025/emails');
});

test('routes only exact server-staging validation to internal capture', async () => {
  process.env.NODE_ENV = 'production';
  process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
  process.env.SERVICE_RUNTIME = 'server-staging';
  process.env.MENORAH_SYNTHETIC_DATA_ONLY = 'true';
  process.env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID =
    'menorah-server-staging-v1';
  process.env.MENORAH_SERVER_STAGING_PROJECT_NAME =
    'menorah-server-staging-validation';
  process.env.MENORAH_SERVER_STAGING_HTTPS_PORT = '38443';
  process.env.MENORAH_STAGING_EMAIL_DOMAIN =
    'mail.staging.menorah.me';
  process.env.RESEND_API_URL =
    'http://staging-mail-capture:8025/emails';
  process.env.RESEND_API_KEY =
    `re_server_staging_${'b'.repeat(40)}`;
  process.env.EMAIL_FROM =
    'Menorah Staging <noreply@mail.staging.menorah.me>';
  process.env.CONTACT_TO_EMAIL =
    'contact@mail.staging.menorah.me';

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, true);
  assert.equal(
    lastFetchUrl,
    'http://staging-mail-capture:8025/emails'
  );
});

test('routes the exact real server-staging sandbox to canonical Resend', async () => {
  configureExactRealServerStagingResendSandbox();

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, true);
  assert.equal(result.recipient, 'contact@mail.staging.menorah.me');
  assert.equal(fetchCalls, 1);
  assert.equal(lastFetchUrl, 'https://api.resend.com/emails');
});

test('skips delivery when real server-staging Resend is disabled', async () => {
  configureExactRealServerStagingResendSandbox();
  process.env.RESEND_PROVIDER_ENABLED = 'false';
  for (const key of [
    'RESEND_API_URL',
    'RESEND_API_KEY',
    'RESEND_WEBHOOK_SECRET',
    'EMAIL_FROM',
    'CONTACT_TO_EMAIL',
  ]) {
    delete process.env[key];
  }

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, false);
  assert.match(result.skippedReason, /CONTACT_TO_EMAIL/);
  assert.equal(fetchCalls, 0);
});

test('rejects internal capture for the real server-staging project', async () => {
  configureExactRealServerStagingResendSandbox();
  process.env.RESEND_API_URL =
    'http://staging-mail-capture:8025/emails';
  process.env.RESEND_API_KEY =
    `re_server_staging_${'b'.repeat(40)}`;

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, false);
  assert.match(result.skippedReason, /endpoint is not approved/);
  assert.equal(fetchCalls, 0);
});

test('rejects mutations of the real server-staging Resend sandbox gate', async (t) => {
  const cases = [
    [
      'validation project',
      () => {
        process.env.MENORAH_SERVER_STAGING_PROJECT_NAME =
          'menorah-server-staging-validation';
      },
    ],
    [
      'missing explicit endpoint',
      () => {
        delete process.env.RESEND_API_URL;
      },
    ],
    [
      'capture key',
      () => {
        process.env.RESEND_API_KEY =
          `re_server_staging_${'b'.repeat(40)}`;
      },
    ],
    [
      'provider disabled',
      () => {
        process.env.RESEND_PROVIDER_ENABLED = 'false';
      },
    ],
    [
      'non-sandbox mode',
      () => {
        process.env.RESEND_MODE = 'live';
      },
    ],
    [
      'non-synthetic data',
      () => {
        process.env.MENORAH_SYNTHETIC_DATA_ONLY = 'false';
      },
    ],
    [
      'wrong runtime',
      () => {
        process.env.SERVICE_RUNTIME = 'home';
      },
    ],
    [
      'crossed local selector',
      () => {
        process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID =
          'menorah-local-staging-v1';
      },
    ],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      configureExactRealServerStagingResendSandbox();
      mutate();

      const result = await sendSubmissionEmail(input);

      assert.equal(result.sent, false);
      assert.match(result.skippedReason, /endpoint is not approved/);
      assert.equal(fetchCalls, 0);
    });
  }
});

test('keeps real server-staging sender and recipient on the staging domain', async (t) => {
  const cases = [
    [
      'production recipient',
      'CONTACT_TO_EMAIL',
      'menorahenquiries@gmail.com',
    ],
    [
      'production sender',
      'EMAIL_FROM',
      'Menorah Health <noreply@menorah.me>',
    ],
  ];

  for (const [name, key, value] of cases) {
    await t.test(name, async () => {
      configureExactRealServerStagingResendSandbox();
      process.env[key] = value;

      const result = await sendSubmissionEmail(input);

      assert.equal(result.sent, false);
      assert.match(result.skippedReason, /not isolated/);
      assert.equal(fetchCalls, 0);
    });
  }
});

test('rejects arbitrary or crossed server-staging capture identities', async (t) => {
  const cases = [
    [
      'wrong environment id',
      'MENORAH_SERVER_STAGING_ENVIRONMENT_ID',
      'menorah-server-staging-v2',
    ],
    [
      'arbitrary project',
      'MENORAH_SERVER_STAGING_PROJECT_NAME',
      'menorah-production',
    ],
    [
      'wrong email domain',
      'MENORAH_STAGING_EMAIL_DOMAIN',
      'mail.staging.example.com',
    ],
    [
      'crossed local environment id',
      'MENORAH_LOCAL_STAGING_ENVIRONMENT_ID',
      'menorah-local-staging-v1',
    ],
    [
      'crossed local HTTPS port',
      'MENORAH_LOCAL_STAGING_HTTPS_PORT',
      '28443',
    ],
  ];

  for (const [name, key, value] of cases) {
    await t.test(name, async () => {
      process.env.NODE_ENV = 'production';
      process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
      process.env.SERVICE_RUNTIME = 'server-staging';
      process.env.MENORAH_SYNTHETIC_DATA_ONLY = 'true';
      process.env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID =
        'menorah-server-staging-v1';
      process.env.MENORAH_SERVER_STAGING_PROJECT_NAME =
        'menorah-server-staging-validation';
      process.env.MENORAH_SERVER_STAGING_HTTPS_PORT = '38443';
      process.env.MENORAH_STAGING_EMAIL_DOMAIN =
        'mail.staging.menorah.me';
      process.env.RESEND_API_URL =
        'http://staging-mail-capture:8025/emails';
      process.env.RESEND_API_KEY =
        `re_server_staging_${'b'.repeat(40)}`;
      process.env.EMAIL_FROM =
        'Menorah Staging <noreply@mail.staging.menorah.me>';
      process.env.CONTACT_TO_EMAIL =
        'contact@mail.staging.menorah.me';
      process.env[key] = value;

      const result = await sendSubmissionEmail(input);

      assert.equal(result.sent, false);
      assert.match(result.skippedReason, /endpoint is not approved/);
      assert.equal(fetchCalls, 0);
    });
  }
});

test('rejects weak and crossed capture keys for either staging endpoint', async (t) => {
  const cases = [
    [
      'server endpoint with local key',
      'http://staging-mail-capture:8025/emails',
      `re_local_${'a'.repeat(40)}`,
      'server',
    ],
    [
      'server endpoint with weak server key',
      'http://staging-mail-capture:8025/emails',
      're_server_staging_short',
      'server',
    ],
    [
      'local endpoint with server key',
      'http://mail-capture:8025/emails',
      `re_server_staging_${'b'.repeat(40)}`,
      'local',
    ],
  ];

  for (const [name, url, key, identity] of cases) {
    await t.test(name, async () => {
      process.env.NODE_ENV = 'production';
      process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
      process.env.RESEND_API_URL = url;
      process.env.RESEND_API_KEY = key;
      if (identity === 'server') {
        process.env.SERVICE_RUNTIME = 'server-staging';
        process.env.MENORAH_SYNTHETIC_DATA_ONLY = 'true';
        process.env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID =
          'menorah-server-staging-v1';
        process.env.MENORAH_SERVER_STAGING_PROJECT_NAME =
          'menorah-server-staging-validation';
        process.env.MENORAH_SERVER_STAGING_HTTPS_PORT = '38443';
        process.env.MENORAH_STAGING_EMAIL_DOMAIN =
          'mail.staging.menorah.me';
        process.env.EMAIL_FROM =
          'Menorah Staging <noreply@mail.staging.menorah.me>';
        process.env.CONTACT_TO_EMAIL =
          'contact@mail.staging.menorah.me';
      } else {
        process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID =
          'menorah-local-staging-v1';
        process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT = '28443';
        process.env.MENORAH_STAGING_EMAIL_DOMAIN =
          'mail.staging.localhost';
        process.env.EMAIL_FROM =
          'Menorah Staging <noreply@mail.staging.localhost>';
        process.env.CONTACT_TO_EMAIL =
          'contact@mail.staging.localhost';
      }

      const result = await sendSubmissionEmail(input);

      assert.equal(result.sent, false);
      assert.match(result.skippedReason, /endpoint is not approved/);
      assert.equal(fetchCalls, 0);
    });
  }
});

test('never sends either staging capture-key family to canonical Resend', async (t) => {
  for (const apiKey of [
    `re_local_${'a'.repeat(40)}`,
    `re_server_staging_${'b'.repeat(40)}`,
  ]) {
    await t.test(apiKey.split('_').slice(0, 3).join('_'), async () => {
      delete process.env.RESEND_API_URL;
      process.env.RESEND_API_KEY = apiKey;

      const result = await sendSubmissionEmail(input);

      assert.equal(result.sent, false);
      assert.match(result.skippedReason, /endpoint is not approved/);
      assert.equal(fetchCalls, 0);
    });
  }
});

test('rejects a mail-capture override outside the exact local identity', async () => {
  process.env.NODE_ENV = 'production';
  process.env.DEPLOYMENT_ENVIRONMENT = 'production';
  process.env.RESEND_API_URL = 'http://mail-capture:8025/emails';
  process.env.RESEND_API_KEY = `re_local_${'a'.repeat(40)}`;

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, false);
  assert.match(result.skippedReason, /endpoint is not approved/);
  assert.equal(fetchCalls, 0);
});

test('preserves the omitted-selector production-default contract', async () => {
  delete process.env.DEPLOYMENT_ENVIRONMENT;
  process.env.EMAIL_FROM = 'Menorah Health <noreply@menorah.me>';
  process.env.CONTACT_TO_EMAIL = 'menorahenquiries@gmail.com';

  const result = await sendSubmissionEmail(input);

  assert.equal(result.sent, true);
  assert.equal(fetchCalls, 1);
  assert.equal(lastFetchUrl, 'https://api.resend.com/emails');
});
