const { defineConfig, devices } = require('@playwright/test');
const {
  resolveLocalValidationProfile,
  validateOptionalSyntheticAdminCredentials,
  validateSmokeTargets,
} = require('./smoke-target-safety');

const validationProfile = resolveLocalValidationProfile(process.env);
const requestedTargets = {
  ...(validationProfile.browserTargets || {
    QA_WWW_URL: process.env.QA_WWW_URL,
    QA_APP_URL: process.env.QA_APP_URL,
    QA_ADMIN_URL: process.env.QA_ADMIN_URL,
    QA_COUNSELLOR_WEB_URL: process.env.QA_COUNSELLOR_WEB_URL,
  }),
};
for (const key of Object.keys(requestedTargets)) {
  if (process.env[key]) requestedTargets[key] = process.env[key];
}
const targets = validateSmokeTargets(process.env, {
  ...requestedTargets,
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
    ignoreHTTPSErrors: Boolean(validationProfile.httpsPort),
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: validationProfile.hostResolverRules
          ? {
            args: [
              `--host-resolver-rules=${validationProfile.hostResolverRules}`,
            ],
          }
          : undefined,
      },
    },
  ],
});
