const { defineConfig, devices } = require('@playwright/test');
const {
  validateOptionalSyntheticAdminCredentials,
  validateSmokeTargets,
} = require('./smoke-target-safety');

const targets = validateSmokeTargets(process.env, {
  QA_WWW_URL: process.env.QA_WWW_URL,
  QA_APP_URL: process.env.QA_APP_URL,
  QA_ADMIN_URL: process.env.QA_ADMIN_URL,
  QA_COUNSELLOR_WEB_URL: process.env.QA_COUNSELLOR_WEB_URL,
});
Object.assign(process.env, targets);
if (process.env.QA_TARGET_ENVIRONMENT === 'staging') {
  validateOptionalSyntheticAdminCredentials(process.env);
}

module.exports = defineConfig({
  testDir: './playwright',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: Boolean(process.env.QA_LOCAL_STAGING_HTTPS_PORT),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
