const { test, expect } = require('@playwright/test');
const {
  SERVER_STAGING_VALIDATION_CONFIRMATION,
  SERVER_STAGING_VALIDATION_PROJECT,
  SYNTHETIC_DATA_CONFIRMATION,
  resolveLocalValidationProfile,
} = require('../smoke-target-safety');

const SERVER_STAGING_USER_EMAIL =
  'user-a@mail.staging.menorah.me';
const SERVER_STAGING_COUNSELLOR_EMAIL =
  'counsellor-approved@mail.staging.menorah.me';
const isServerStagingValidation = (
  process.env.QA_SERVER_STAGING_VALIDATION_CONFIRM
  === SERVER_STAGING_VALIDATION_CONFIRMATION
);

const credentials = {
  user: {
    email: SERVER_STAGING_USER_EMAIL,
    password:
      process.env.MENORAH_SERVER_STAGING_USER_A_PASSWORD,
  },
  counsellor: {
    email: SERVER_STAGING_COUNSELLOR_EMAIL,
    password:
      process.env.MENORAH_SERVER_STAGING_COUNSELLOR_A_PASSWORD,
  },
};

test.use({
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

const assertServerStagingCredentialContract = () => {
  const profile = resolveLocalValidationProfile(process.env);
  if (
    profile.kind !== 'server-staging-validation'
    || process.env.QA_TARGET_ENVIRONMENT !== 'staging'
    || process.env.COMPOSE_PROJECT_NAME
      !== SERVER_STAGING_VALIDATION_PROJECT
    || process.env.QA_SYNTHETIC_DATA_CONFIRM
      !== SYNTHETIC_DATA_CONFIRMATION
  ) {
    throw new Error(
      'Synthetic role smoke requires the exact server-staging validation identity',
    );
  }
  if (!credentials.user.password || !credentials.counsellor.password) {
    throw new Error(
      'Synthetic role smoke requires the generated USER-A and COUNSELLOR-A credentials',
    );
  }
};

const signInAndProveReload = async ({
  page,
  url,
  credential,
  destination,
  authenticatedHeading,
}) => {
  const initialSessionProbe = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/users/me'
    && response.status() < 500
  ));
  await page.goto(`${url.replace(/\/+$/, '')}/login`, {
    waitUntil: 'domcontentloaded',
  });
  await initialSessionProbe;

  const emailField = page.locator(
    'input[type="email"], input[autocomplete="email"]',
  ).first();
  const passwordField = page.locator(
    'input[type="password"], input[autocomplete="current-password"]',
  ).first();
  await emailField.fill(credential.email);
  await passwordField.fill(credential.password);

  const destinationReached = page.waitForURL(destination, {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await passwordField.fill('').catch(() => {});
  await emailField.fill('').catch(() => {});
  await destinationReached;

  await expect(page.getByRole('heading', {
    name: authenticatedHeading,
  })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('heading', {
    name: authenticatedHeading,
  })).toBeVisible();
};

test.describe('server-staging synthetic role sign-in', () => {
  test.skip(
    !isServerStagingValidation,
    'Requires the exact isolated server-staging validation profile.',
  );

  test.beforeAll(() => {
    assertServerStagingCredentialContract();
  });

  test('synthetic user signs in and remains authenticated after reload', async ({
    page,
  }) => {
    await signInAndProveReload({
      page,
      url: process.env.QA_APP_URL,
      credential: credentials.user,
      destination: /\/discover(?:[/?#]|$)/,
      authenticatedHeading: /find your counsellor/i,
    });
  });

  test(
    'synthetic counsellor signs in and remains authenticated after reload',
    async ({ page }) => {
      await signInAndProveReload({
        page,
        url: process.env.QA_COUNSELLOR_WEB_URL,
        credential: credentials.counsellor,
        destination: /\/dashboard(?:[/?#]|$)/,
        authenticatedHeading: /welcome back/i,
      });
    },
  );
});
