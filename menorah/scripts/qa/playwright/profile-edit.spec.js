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

test('profile edit omits address and saves the remaining sections', async ({ page }, testInfo) => {
  const consoleIssues = [];
  let addressRequests = 0;
  let submittedProfile;
  let submittedEmergencyContact;

  const qaUser = {
    id: 'profile-edit-qa-user',
    firstName: 'Profile',
    lastName: 'User',
    email: 'profile-qa@example.test',
    phone: '+971501234567',
    isEmailVerified: true,
    isPhoneVerified: true,
    role: 'user',
    dateOfBirth: '2000-01-01',
    gender: 'male',
    preferredLanguage: 'English',
    address: {
      street: '123 Main St',
      city: 'Dubai',
      state: 'Dubai',
      country: 'UAE',
      zipCode: '00000',
    },
    emergencyContact: {
      name: 'Emergency Person',
      relationship: 'Sibling',
      phone: '+971501234567',
    },
  };

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
        data: { user: qaUser },
      });
      return;
    }

    if (pathname.endsWith('/api/users/profile') && request.method() === 'PUT') {
      submittedProfile = request.postDataJSON();
      await json(route, 200, {
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            ...qaUser,
            ...submittedProfile,
          },
        },
      });
      return;
    }

    if (pathname.endsWith('/api/users/emergency-contact') && request.method() === 'PUT') {
      submittedEmergencyContact = request.postDataJSON();
      await json(route, 200, {
        success: true,
        message: 'Emergency contact updated successfully',
        data: { emergencyContact: submittedEmergencyContact },
      });
      return;
    }

    if (pathname.endsWith('/api/users/address')) {
      addressRequests += 1;
      await json(route, 200, {
        success: true,
        data: { address: qaUser.address },
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

  await page.goto(`${appUrl}/profile/edit`, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/profile\/edit$/);
  await expect(page).toHaveTitle(/Menorah/i);
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Emergency Contact' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Address', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Street', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('City', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('State', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Country', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('ZIP code', { exact: true })).toHaveCount(0);

  await page.getByLabel('First name', { exact: true }).fill('Updated');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText('Profile updated successfully!', { exact: true })).toBeVisible();
  expect(submittedProfile).toEqual({
    firstName: 'Updated',
    lastName: 'User',
    dateOfBirth: '2000-01-01',
    gender: 'male',
    preferredLanguage: 'English',
  });
  expect(submittedEmergencyContact).toEqual({
    name: 'Emergency Person',
    relationship: 'Sibling',
    phone: '+971501234567',
  });
  expect(addressRequests).toBe(0);

  await page.screenshot({
    path: testInfo.outputPath('profile-edit-without-address-desktop.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Emergency Contact' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Address', exact: true })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Edit Profile' }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('profile-edit-without-address-mobile.png'),
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
