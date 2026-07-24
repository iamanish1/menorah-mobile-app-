const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  LOCAL_MAIL_CAPTURE_CONFIRMATION,
  PRODUCTION_CONFIRMATION,
  SERVER_STAGING_BROWSER_TARGETS,
  SERVER_STAGING_HOST_RESOLVER_RULES,
  SERVER_STAGING_VALIDATION_CONFIRMATION,
  SERVER_STAGING_VALIDATION_PROJECT,
  SYNTHETIC_DATA_CONFIRMATION,
  requireSyntheticEmail,
  resolveLocalValidationProfile,
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

test('local staging accepts only an exact high HTTPS port on staging localhost', () => {
  assert.deepEqual(
    validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_LOCAL_STAGING_HTTPS_PORT: '28443',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.localhost',
    }, {
      QA_API_WEB_URL: 'https://api-web.staging.localhost:28443',
    }),
    { QA_API_WEB_URL: 'https://api-web.staging.localhost:28443' }
  );
  assert.throws(
    () => validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_LOCAL_STAGING_HTTPS_PORT: '28443',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.localhost',
    }, {
      QA_API_WEB_URL: 'https://api-web.staging.localhost:28444',
    }),
    /exact approved port/
  );
});

test('local staging port cannot authorize external staging hosts', () => {
  assert.throws(
    () => validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'staging',
      QA_LOCAL_STAGING_HTTPS_PORT: '28443',
      QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.example.net',
    }, {
      QA_API_WEB_URL: 'https://api-web.staging.example.net:28443',
    }),
    /requires only \*\.staging\.localhost hosts/
  );
});

test('local staging port selector rejects privileged, malformed, and production use', () => {
  for (const port of ['443', '1023', '65536', 'not-a-port']) {
    assert.throws(
      () => validateSmokeTargets({
        QA_TARGET_ENVIRONMENT: 'staging',
        QA_LOCAL_STAGING_HTTPS_PORT: port,
        QA_STAGING_ALLOWED_HOSTS: 'api-web.staging.localhost',
      }, {
        QA_API_WEB_URL: `https://api-web.staging.localhost:${port}`,
      }),
      /restricted to high-port staging targets/
    );
  }
  assert.throws(
    () => validateSmokeTargets({
      QA_TARGET_ENVIRONMENT: 'production',
      QA_LOCAL_STAGING_HTTPS_PORT: '28443',
      QA_ALLOW_PRODUCTION_SMOKE: PRODUCTION_CONFIRMATION,
      QA_PRODUCTION_CHANGE_REFERENCE: 'approved-change-reference',
    }, {
      QA_API_WEB_URL: 'https://api-web.menorah.me:28443',
    }),
    /restricted to high-port staging targets/
  );
});

const serverValidationEnv = {
  QA_TARGET_ENVIRONMENT: 'staging',
  QA_SERVER_STAGING_VALIDATION_CONFIRM:
    SERVER_STAGING_VALIDATION_CONFIRMATION,
  COMPOSE_PROJECT_NAME: SERVER_STAGING_VALIDATION_PROJECT,
};

test('exact server-staging confirmation selects one bounded validation profile', () => {
  const profile = resolveLocalValidationProfile(serverValidationEnv);
  assert.equal(profile.kind, 'server-staging-validation');
  assert.equal(profile.httpsPort, '38443');
  assert.equal(profile.dockerProject, SERVER_STAGING_VALIDATION_PROJECT);
  assert.equal(profile.mailCaptureService, 'staging-mail-capture');
  assert.equal(profile.syntheticEmailSuffix, '@mail.staging.menorah.me');
  assert.deepEqual(profile.apiTargets, {
    apiIos: 'http://127.0.0.1:38080',
    apiAndroid: 'http://127.0.0.1:38081',
    apiWeb: 'http://127.0.0.1:38082',
    apiAdmin: 'http://127.0.0.1:38083',
    worker: 'http://127.0.0.1:38084',
  });
  assert.match(
    profile.hostResolverRules,
    /MAP api-web\.staging\.menorah\.me 127\.0\.0\.1/,
  );
  assert.equal(
    profile.hostResolverRules,
    SERVER_STAGING_HOST_RESOLVER_RULES,
  );
  assert.deepEqual(
    validateSmokeTargets(serverValidationEnv, {
      ...SERVER_STAGING_BROWSER_TARGETS,
    }),
    SERVER_STAGING_BROWSER_TARGETS,
  );
});

test('server-staging validation rejects missing, crossed, or malformed confirmation', () => {
  assert.throws(
    () => resolveLocalValidationProfile({
      QA_LOCAL_STAGING_HTTPS_PORT: '38443',
    }),
    /requires QA_SERVER_STAGING_VALIDATION_CONFIRM/,
  );
  assert.throws(
    () => resolveLocalValidationProfile({
      QA_SERVER_STAGING_VALIDATION_CONFIRM: 'yes',
    }),
    /must equal USE_EXACT_MENORAH_SERVER_STAGING_VALIDATION/,
  );
  assert.throws(
    () => resolveLocalValidationProfile({
      ...serverValidationEnv,
      QA_LOCAL_STAGING_HTTPS_PORT: '28443',
    }),
    /exact HTTPS port 38443/,
  );
  assert.throws(
    () => resolveLocalValidationProfile({
      ...serverValidationEnv,
      COMPOSE_PROJECT_NAME: 'menorah-local-staging',
    }),
    /COMPOSE_PROJECT_NAME=menorah-server-staging-validation/,
  );
  assert.throws(
    () => resolveLocalValidationProfile({
      ...serverValidationEnv,
      QA_MAIL_CAPTURE_SERVICE: 'mail-capture',
    }),
    /QA_MAIL_CAPTURE_SERVICE=staging-mail-capture/,
  );
  assert.throws(
    () => resolveLocalValidationProfile({
      ...serverValidationEnv,
      QA_TARGET_ENVIRONMENT: 'production',
    }),
    /restricted to QA_TARGET_ENVIRONMENT=staging/,
  );
});

test('server-staging validation rejects wrong domains, ports, and host sets', () => {
  for (const [name, value] of [
    ['QA_WWW_URL', 'https://www.staging.localhost:38443'],
    ['QA_APP_URL', 'https://app.staging.menorah.me:28443'],
    ['QA_ADMIN_URL', 'https://admin.menorah.me:38443'],
  ]) {
    assert.throws(
      () => validateSmokeTargets(serverValidationEnv, {
        [name]: value,
      }),
      /approved server-staging validation URL|cannot target production|exact approved port/,
    );
  }
  assert.throws(
    () => validateSmokeTargets({
      ...serverValidationEnv,
      QA_STAGING_ALLOWED_HOSTS:
        'www.staging.menorah.me,app.staging.menorah.me',
    }, {
      QA_WWW_URL: SERVER_STAGING_BROWSER_TARGETS.QA_WWW_URL,
    }),
    /exact approved staging host set/,
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
  assert.throws(() => validateOptionalSyntheticAdminCredentials({
    QA_ADMIN_EMAIL: 'admin-full-1@mail.staging.localhost',
    QA_ADMIN_PASSWORD: 'not-a-real-secret',
    QA_SYNTHETIC_DATA_CONFIRM: SYNTHETIC_DATA_CONFIRMATION,
    QA_LOCAL_STAGING_HTTPS_PORT: '28443',
  }), /internal synthetic OTP capture confirmation/);
  assert.doesNotThrow(() => validateOptionalSyntheticAdminCredentials({
    QA_ADMIN_EMAIL: 'admin-full-1@mail.staging.localhost',
    QA_ADMIN_PASSWORD: 'not-a-real-secret',
    QA_SYNTHETIC_DATA_CONFIRM: SYNTHETIC_DATA_CONFIRMATION,
    QA_LOCAL_STAGING_HTTPS_PORT: '28443',
    QA_LOCAL_STAGING_MAIL_CAPTURE_CONFIRM:
      LOCAL_MAIL_CAPTURE_CONFIRMATION,
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

test('local API smoke accepts only the exact isolated loopback ports', () => {
  const result = spawnSync(
    process.execPath,
    [resolve(qaRoot, 'local-api-smoke-test.js')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        QA_API_WEB_URL: 'https://api-web.menorah.me',
      },
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /must target exactly http:\/\/127\.0\.0\.1:28082/
  );
});

test('local API smoke switches to 38080-38084 only with server confirmation', () => {
  const wrongServerPort = spawnSync(
    process.execPath,
    [resolve(qaRoot, 'local-api-smoke-test.js')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...serverValidationEnv,
        QA_API_WEB_URL: 'http://127.0.0.1:28082',
      },
    }
  );
  assert.notEqual(wrongServerPort.status, 0);
  assert.match(
    `${wrongServerPort.stdout}\n${wrongServerPort.stderr}`,
    /must target exactly http:\/\/127\.0\.0\.1:38082/,
  );

  const missingConfirmation = spawnSync(
    process.execPath,
    [resolve(qaRoot, 'local-api-smoke-test.js')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        QA_API_WEB_URL: 'http://127.0.0.1:38082',
      },
    }
  );
  assert.notEqual(missingConfirmation.status, 0);
  assert.match(
    `${missingConfirmation.stdout}\n${missingConfirmation.stderr}`,
    /must target exactly http:\/\/127\.0\.0\.1:28082/,
  );
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

test('Playwright server-staging profile installs exact Chromium resolver rules', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', [
      "const config = require('./playwright.config.js');",
      'process.stdout.write(JSON.stringify({',
      'targets: [process.env.QA_WWW_URL, process.env.QA_APP_URL,',
      'process.env.QA_ADMIN_URL, process.env.QA_COUNSELLOR_WEB_URL],',
      'launchOptions: config.projects[0].use.launchOptions,',
      '}));',
    ].join(' ')],
    {
      cwd: qaRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...serverValidationEnv,
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.targets, Object.values(
    SERVER_STAGING_BROWSER_TARGETS
  ));
  assert.deepEqual(output.launchOptions.args, [
    `--host-resolver-rules=${SERVER_STAGING_HOST_RESOLVER_RULES}`,
  ]);
});

test('synthetic role Playwright smoke keeps generated credentials out of artifacts', () => {
  const source = readFileSync(
    resolve(qaRoot, 'playwright', 'synthetic-role-smoke.spec.js'),
    'utf8',
  );
  assert.match(
    source,
    /MENORAH_SERVER_STAGING_USER_A_PASSWORD/,
  );
  assert.match(
    source,
    /MENORAH_SERVER_STAGING_COUNSELLOR_A_PASSWORD/,
  );
  assert.match(
    source,
    /test\.use\(\{\s*trace: 'off',\s*video: 'off',\s*screenshot: 'off',\s*\}\)/,
  );
  assert.match(
    source,
    /await passwordField\.fill\(''\)\.catch\(\(\) => \{\}\)/,
  );
  assert.match(
    source,
    /input\[type="email"\], input\[autocomplete="email"\]/,
  );
  assert.match(
    source,
    /input\[type="password"\], input\[autocomplete="current-password"\]/,
  );
  assert.match(
    source,
    /const initialSessionProbe = page\.waitForResponse[\s\S]*?await initialSessionProbe;[\s\S]*?await emailField\.fill/,
  );
  assert.match(source, /pathname === '\/api\/users\/me'/);
  assert.doesNotMatch(
    source,
    /(?:console\.|page\.screenshot|context\.tracing|testInfo\.attach)/,
  );
  assert.doesNotMatch(
    source,
    /toHaveValue\([^)]*(?:password|credential)/i,
  );
});

test('active smoke sources contain no developer-specific mailbox literal', () => {
  const sources = ['production-api-smoke.js', 'production-auth-smoke.js']
    .map((file) => readFileSync(resolve(qaRoot, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /tejasamirth\+menorahqa/i);
});
