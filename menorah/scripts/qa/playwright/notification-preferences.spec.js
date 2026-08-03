const { test, expect } = require('@playwright/test');

const appUrl = process.env.QA_APP_URL || 'https://app.menorah.me';

const json = (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  headers: {
    'access-control-allow-origin': new URL(route.request().headers().origin || route.request().url()).origin,
    'access-control-allow-credentials': 'true',
  },
  body: JSON.stringify(body),
});

test('web notification preferences expose and save email only', async ({ page }, testInfo) => {
  let storedEmailPreference = true;
  let submittedPreferences;
  const consoleIssues = [];

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('menorah-user-tour-v1', 'qa-complete');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/api/users/me')) {
      await json(route, 200, {
        success: true,
        data: {
          user: {
            id: 'notification-preferences-qa-user',
            firstName: 'Notification',
            lastName: 'QA',
            email: 'notification-qa@example.test',
            phone: '+910000000000',
            isEmailVerified: true,
            isPhoneVerified: true,
            role: 'user',
            notificationPreferences: {
              email: storedEmailPreference,
              sms: true,
              push: true,
            },
          },
        },
      });
      return;
    }

    if (
      pathname.endsWith('/api/users/notification-preferences')
      && request.method() === 'PUT'
    ) {
      submittedPreferences = request.postDataJSON();
      storedEmailPreference = submittedPreferences.email;
      await json(route, 200, {
        success: true,
        message: 'Notification preferences updated successfully',
        data: {
          notificationPreferences: {
            email: storedEmailPreference,
            sms: true,
            push: true,
          },
        },
      });
      return;
    }

    if (pathname.endsWith('/api/articles')) {
      await json(route, 200, {
        success: true,
        data: {
          articles: [],
          pagination: { page: 1, limit: 1, total: 0, pages: 0 },
        },
      });
      return;
    }

    await json(route, 404, {
      success: false,
      message: `Unexpected QA request: ${request.method()} ${pathname}`,
    });
  });

  await page.goto(`${appUrl}/profile/notifications`, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/profile\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notification Preferences' })).toBeVisible();
  await expect(page.getByText('Email Notifications', { exact: true })).toBeVisible();
  await expect(page.getByText('SMS Notifications', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Push Notifications', { exact: true })).toHaveCount(0);

  const emailToggle = page.getByRole('switch', { name: 'Email Notifications toggle' });
  await expect(emailToggle).toHaveAttribute('aria-checked', 'true');
  await emailToggle.click();
  await expect(emailToggle).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Save Preferences' }).click();

  await expect(page.getByRole('status')).toHaveText('Preferences saved!');
  expect(submittedPreferences).toEqual({ email: false });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('switch', { name: 'Email Notifications toggle' }))
    .toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('SMS Notifications', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Push Notifications', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('notification-preferences-desktop.png'),
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Notification Preferences' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Email Notifications toggle' })).toBeVisible();
  await expect(page.getByText('SMS Notifications', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Push Notifications', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('notification-preferences-mobile.png'),
    fullPage: false,
  });

  const hasExpectedMockSocketFailure = consoleIssues.some((issue) =>
    issue.includes('api-web.menorah.me/socket.io/')
  ) && consoleIssues.some((issue) =>
    issue.includes('[Socket] Connection error (backend may be offline): xhr poll error')
  );
  const unexpectedConsoleIssues = consoleIssues.filter((issue) => {
    if (issue.includes('api-web.menorah.me/socket.io/')) return false;
    if (issue.includes('[Socket] Connection error (backend may be offline): xhr poll error')) return false;
    if (issue.includes('[Socket] Connection error (backend may be offline): Authentication error: Token required')) return false;
    if (hasExpectedMockSocketFailure && issue === 'error: Failed to load resource: net::ERR_FAILED') return false;
    return true;
  });

  // The mocked browser user intentionally has no real socket session. Ignore
  // only its exact local CORS or live "Token required" failure and fail on
  // every other warning or error emitted by the rendered page.
  expect(unexpectedConsoleIssues).toEqual([]);
});
