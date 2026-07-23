const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  PRODUCTION_CONFIRMATION,
  SYNTHETIC_DATA_CONFIRMATION,
  requireSyntheticEmail,
  validateOptionalSyntheticAdminCredentials,
  validateSmokeTargets,
} = require('./smoke-target-safety');

const qaRoot = __dirname;
const syntheticEnv = {
  QA_EMAIL: 'release.qa+staging@quality.example',
  QA_SYNTHETIC_DATA_CONFIRM: SYNTHETIC_DATA_CONFIRMATION,
};

test('staging targets must be explicit and cannot resolve to production hosts', () => {
  assert.throws(
    () => validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.example.test',
    }, {
      QA_API_WEB_URL: undefined,
    }),
    /there is no default target/
  );
  assert.throws(
    () => validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.example.test',
    }, {
      QA_API_WEB_URL: 'https://api-web.menorah.me/staging',
    }),
    /cannot target production/
  );
  assert.deepEqual(
    validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.example.test',
    }, {
      QA_API_WEB_URL: 'https://api-web.staging.example.test',
    }),
    { QA_API_WEB_URL: 'https://api-web.staging.example.test' }
  );
});

test('staging rejects unapproved hosts and trailing-dot production aliases', () => {
  assert.throws(
    () => validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.example.test',
    }, {
      QA_API_WEB_URL: 'https://unrelated-staging.example.net',
    }),
    /not in QA_STAGING_ALLOWED_HOSTS/
  );
  assert.throws(
    () => validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.example.test',
    }, {
      QA_API_WEB_URL: 'https://api-web.menorah.me.',
    }),
    /trailing-dot alias/
  );
});

test('production targets require an exact confirmation and change reference', () => {
  assert.throws(
    () => validateSmokeTargets({ QA_TARGET_ENVIRONMENT: 'production' }, {
      QA_API_WEB_URL: 'https://api-web.menorah.me',
    }),
    /QA_ALLOW_PRODUCTION_SMOKE/
  );
  assert.deepEqual(
    validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'production',
      QA_ALLOW_PRODUCTION_SMOKE: PRODUCTION_CONFIRMATION,
      QA_PRODUCTION_CHANGE_REFERENCE: 'approved-change-reference',
    }, {
      QA_API_WEB_URL: 'https://api-web.menorah.me',
    }),
    { QA_API_WEB_URL: 'https://api-web.menorah.me' }
  );
});

test('smoke identities require an explicitly confirmed synthetic mailbox', () => {
  assert.throws(() => requireSyntheticEmail({}), /QA_EMAIL/);
  assert.equal(
    requireSyntheticEmail(syntheticEnv),
    syntheticEnv.QA_EMAIL
  );
});

test('optional staging admin login requires a complete synthetic credential pair', () => {
  assert.doesNotThrow(() => validateOptionalSyntheticAdminCredentials({}));
  assert.throws(
    () => validateOptionalSyntheticAdminCredentials({
      QA_ADMIN_EMAIL: 'admin.staging@quality.example',
    }),
    /both synthetic admin credentials/
  );
  assert.doesNotThrow(() => validateOptionalSyntheticAdminCredentials({
    QA_ADMIN_EMAIL: 'admin.staging@quality.example',
    QA_ADMIN_PASSWORD: 'not-a-real-secret',
    QA_SYNTHETIC_DATA_CONFIRM: SYNTHETIC_DATA_CONFIRMATION,
  }));
});

test('active smoke commands reject unsafe configuration before fetch', () => {
  for (const script of ['production-api-smoke.js', 'production-auth-smoke.js']) {
    const result = spawnSync(process.execPath, [resolve(qaRoot, script)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...syntheticEnv,
        QA_TARGET_ENVIRONMENT: 'staging',
        QA_STAGING_ALLOWED_HOSTS: [
          'api-web.staging.example.test',
          'api-ios.staging.example.test',
          'api-android.staging.example.test',
          'api-admin.staging.example.test',
        ].join(','),
        QA_API_BASE: 'https://api-web.menorah.me/api',
        QA_API_WEB_URL: 'https://api-web.menorah.me',
        QA_API_IOS_URL: 'https://api-ios.menorah.me',
        QA_API_ANDROID_URL: 'https://api-android.menorah.me',
        QA_API_ADMIN_URL: 'https://api-admin.menorah.me',
        QA_PASSWORD: 'not-used-because-target-validation-fails',
        QA_PHONE: '+15555550123',
      },
    });
    assert.notEqual(result.status, 0, script);
    assert.match(`${result.stdout}\n${result.stderr}`, /cannot target production/);
  }
});

test('Playwright configuration rejects live targets before launching a browser', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./playwright.config.js')"],
    {
      cwd: qaRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        QA_TARGET_ENVIRONMENT: 'staging',
        QA_STAGING_ALLOWED_HOSTS: [
          'www.staging.example.test',
          'app.staging.example.test',
          'admin.staging.example.test',
          'counsellor.staging.example.test',
        ].join(','),
        QA_WWW_URL: 'https://www.menorah.me',
        QA_APP_URL: 'https://app.menorah.me',
        QA_ADMIN_URL: 'https://admin.menorah.me',
        QA_COUNSELLOR_WEB_URL: 'https://counsellor.menorah.me',
      },
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /cannot target production/);
});

test('active smoke sources contain no developer-specific mailbox literal', () => {
  const sources = ['production-api-smoke.js', 'production-auth-smoke.js']
    .map((file) => readFileSync(resolve(qaRoot, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /tejasamirth\+menorahqa/i);
});
