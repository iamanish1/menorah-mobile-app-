const { test, expect } = require('@playwright/test');

const adminUrl = process.env.QA_ADMIN_URL || 'https://admin.menorah.me';
const adminEmail = process.env.QA_ADMIN_EMAIL;
const adminPassword = process.env.QA_ADMIN_PASSWORD;

test.describe('admin production smoke', () => {
  test.skip(!(adminEmail && adminPassword), 'Set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD to run admin login smoke.');

  test('real admin login works when credentials are supplied', async ({ page }) => {
    await page.goto(`${adminUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/email/i).fill(adminEmail);
    await page.getByLabel(/password/i).fill(adminPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('body')).toContainText(/dashboard|admin|revenue|users/i);
  });
});
