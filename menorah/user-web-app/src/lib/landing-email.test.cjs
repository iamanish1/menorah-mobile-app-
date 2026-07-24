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
