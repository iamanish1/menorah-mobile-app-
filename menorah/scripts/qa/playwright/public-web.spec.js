const { test, expect } = require('@playwright/test');

const urls = {
  www: process.env.QA_WWW_URL,
  app: process.env.QA_APP_URL,
  admin: process.env.QA_ADMIN_URL,
  counsellor: process.env.QA_COUNSELLOR_WEB_URL,
};

const waitForUsablePage = async (page, url) => {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response, `${url} should return an HTTP response`).toBeTruthy();
  expect(response.status(), `${url} should not 4xx/5xx`).toBeLessThan(400);
  await expect(page.locator('body')).toBeVisible();
};

const expectLoginFields = async (page) => {
  await expect(page.locator('input[type="email"], input[autocomplete="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"], input[autocomplete="current-password"]').first()).toBeVisible();
};

test.describe('configured public web surfaces', () => {
  test('public site loads', async ({ page }) => {
    await waitForUsablePage(page, urls.www);
    await expect(page).toHaveTitle(/Menorah|Health|Wellness/i);
  });

  test('user app loads', async ({ page }) => {
    await waitForUsablePage(page, urls.app);
    await expect(page.locator('body')).toContainText(/Menorah|Welcome|Sign In|Create account/i);
  });

  test('user app login page loads', async ({ page }) => {
    await waitForUsablePage(page, `${urls.app}/login`);
    await expect(page.getByRole('heading', { name: /welcome back|sign in/i })).toBeVisible();
    await expectLoginFields(page);
  });

  test('admin redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(urls.admin, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test('admin login page loads', async ({ page }) => {
    await waitForUsablePage(page, `${urls.admin}/login`);
    await expect(page.getByRole('heading', { name: /admin login/i })).toBeVisible();
    await expectLoginFields(page);
  });

  test('counsellor login page loads', async ({ page }) => {
    let sessionProbeCount = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/users/me') {
        sessionProbeCount += 1;
      }
    });

    await waitForUsablePage(page, `${urls.counsellor.replace(/\/+$/, '')}/login`);
    await expect(
      page.getByRole('heading', { name: /welcome back|sign in/i })
    ).toBeVisible();
    await expectLoginFields(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/login(\?|$)/);
    expect(sessionProbeCount).toBeLessThanOrEqual(1);
  });
});
