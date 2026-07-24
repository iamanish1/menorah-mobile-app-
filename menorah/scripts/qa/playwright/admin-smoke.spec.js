const { test, expect } = require('@playwright/test');
const {
  CONFIRMATION,
  clearSyntheticMessages,
  readLatestSyntheticOtp,
} = require('../local-mail-capture');

const adminUrl = process.env.QA_ADMIN_URL;
const adminEmail = process.env.QA_ADMIN_EMAIL;
const adminPassword = process.env.QA_ADMIN_PASSWORD;
const localCaptureConfirmation =
  process.env.QA_LOCAL_STAGING_MAIL_CAPTURE_CONFIRM;

test.describe('configured admin smoke', () => {
  test.skip(!(adminEmail && adminPassword), 'Set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD to run admin login smoke.');
  test.use({ trace: 'off', video: 'off', screenshot: 'off' });

  test('real admin login works when credentials are supplied', async ({ page }) => {
    const useLocalCapture = (
      localCaptureConfirmation
      === CONFIRMATION
    );
    if (process.env.QA_LOCAL_STAGING_HTTPS_PORT && !useLocalCapture) {
      throw new Error(
        'Local staging admin smoke requires the exact synthetic OTP capture confirmation'
      );
    }
    if (useLocalCapture) clearSyntheticMessages();

    await page.goto(`${adminUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/email/i).fill(adminEmail);
    await page.getByLabel(/password/i).fill(adminPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    if (useLocalCapture) {
      const codeField = page.getByLabel(/verification code|mfa|code/i);
      await expect(codeField).toBeVisible();
      await expect.poll(
        () => {
          try {
            return readLatestSyntheticOtp(adminEmail);
          } catch {
            return '';
          }
        },
        {
          message: 'wait for the synthetic administrator MFA message',
          timeout: 15000,
        }
      ).toMatch(/^\d{6}$/);
      const otp = readLatestSyntheticOtp(adminEmail);
      await codeField.fill(otp);
      await page.getByRole('button', { name: /verify code/i }).click();
    }

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('body')).toContainText(/dashboard|admin|revenue|users/i);
  });
});
