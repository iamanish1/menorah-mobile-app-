const { test, expect } = require('@playwright/test');
const path = require('path');

const appUrl = process.env.QA_APP_URL || 'https://app.menorah.me';
const evidenceDir = process.env.QA_EVIDENCE_DIR;

const json = (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  headers: {
    'access-control-allow-origin': new URL(route.request().headers().origin || route.request().url()).origin,
    'access-control-allow-credentials': 'true',
  },
  body: JSON.stringify(body),
});

const incompleteUser = {
  id: 'profile-completion-qa-user',
  firstName: 'Onboarding',
  lastName: 'User',
  email: 'onboarding@example.test',
  phone: null,
  isEmailVerified: true,
  isPhoneVerified: false,
  profileCompleted: false,
  role: 'user',
};

const observeConsoleHealth = (page) => {
  const issues = [];
  const requestFailures = [];
  let expectedErrorResponses = 0;
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    issues.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      error: request.failure()?.errorText || 'unknown request failure',
    });
  });
  page.on('response', (response) => {
    if (
      response.status() >= 400
      && (response.url().includes('/socket.io') || response.url().includes('/api/users/profile/complete'))
    ) {
      expectedErrorResponses += 1;
    }
  });

  return () => {
    const unexpectedRequests = requestFailures.filter((failure) => {
      if (failure.url.includes('/socket.io')) return false;
      if (failure.error === 'net::ERR_ABORTED' && failure.url.includes('_rsc=')) return false;
      return true;
    });
    const hasExpectedSocketFailure = requestFailures.some((failure) => failure.url.includes('/socket.io'));
    const unexpectedIssues = issues.filter((issue) => {
      if (/\[Socket\] Connection error|WebSocket connection|socket\.io/i.test(issue)) return false;
      if (hasExpectedSocketFailure && /ERR_SSL_PROTOCOL_ERROR|ERR_FAILED|ERR_CONNECTION_REFUSED/i.test(issue)) return false;
      if (expectedErrorResponses > 0 && /Failed to load resource: the server responded with a status of (404|409)/i.test(issue)) return false;
      return true;
    });

    expect(unexpectedRequests).toEqual([]);
    expect(unexpectedIssues).toEqual([]);
  };
};

const installProfileApi = async (page, { completionFailure } = {}) => {
  let currentUser = { ...incompleteUser };
  const completionRequests = [];
  const unexpected = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('menorah-user-tour-v1', 'qa-complete');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/api/users/me')) {
      await json(route, 200, { success: true, data: { user: currentUser } });
      return;
    }

    if (pathname.endsWith('/api/users/profile/complete') && request.method() === 'PUT') {
      const payload = request.postDataJSON();
      completionRequests.push(payload);

      if (completionFailure) {
        await json(route, completionFailure.status, {
          success: false,
          message: completionFailure.message,
        });
        return;
      }

      currentUser = {
        ...currentUser,
        phone: payload.phone,
        profileCompleted: true,
      };
      await json(route, 200, {
        success: true,
        message: 'Profile completed successfully',
        data: { user: currentUser },
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

    if (pathname.endsWith('/api/counsellors/specializations')) {
      await json(route, 200, { success: true, data: { specializations: [] } });
      return;
    }

    if (pathname.endsWith('/api/counsellors/languages')) {
      await json(route, 200, { success: true, data: { languages: [] } });
      return;
    }

    if (pathname.endsWith('/api/counsellors')) {
      await json(route, 200, {
        success: true,
        data: {
          counsellors: [],
          pagination: { page: 1, limit: 12, total: 0, pages: 0 },
        },
      });
      return;
    }

    unexpected.push(`${request.method()} ${pathname}`);
    await json(route, 404, {
      success: false,
      message: `Unexpected QA request: ${request.method()} ${pathname}`,
    });
  });

  return { completionRequests, unexpected };
};

test('incomplete user completes the phone step and returns to the intended booking page', async ({ page }) => {
  const assertConsoleHealthy = observeConsoleHealth(page);
  const requests = await installProfileApi(page);

  await page.goto(`${appUrl}/bookings/new?qa=profile-completion`, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/complete-profile$/);
  await expect(page).toHaveTitle(/Menorah Health/i);
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
  await expect(page.getByText('Signed in as')).toBeVisible();
  await expect(page.locator('nextjs-portal')).toHaveCount(0);

  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Choose a country code and enter a valid phone number.')).toBeVisible();
  expect(requests.completionRequests).toHaveLength(0);

  if (evidenceDir) {
    await page.screenshot({ path: path.join(evidenceDir, 'profile-completion-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'profile-completion-mobile.png'), fullPage: false });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.getByLabel('Account phone number').fill('50 123 4567');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/\/bookings\/new\?qa=profile-completion$/);
  await expect(page.getByRole('heading', { name: 'Book a Session' })).toBeVisible();
  expect(requests.completionRequests).toEqual([{ phone: '+971501234567' }]);
  expect(requests.unexpected).toEqual([]);
  assertConsoleHealthy();
});

test('duplicate phone remains actionable on the completion form', async ({ page }) => {
  const assertConsoleHealthy = observeConsoleHealth(page);
  const requests = await installProfileApi(page, {
    completionFailure: {
      status: 409,
      message: 'That phone number is already in use.',
    },
  });

  await page.goto(`${appUrl}/complete-profile`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Account phone number').fill('50 123 4567');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/\/complete-profile$/);
  await expect(page.getByText('That phone number is already in use.')).toBeVisible();
  expect(requests.completionRequests).toEqual([{ phone: '+971501234567' }]);
  assertConsoleHealthy();
});

test('stored external return paths are rejected after completion', async ({ page }) => {
  const assertConsoleHealthy = observeConsoleHealth(page);
  const requests = await installProfileApi(page);
  await page.addInitScript(() => {
    window.sessionStorage.setItem('menorah:profile-completion-return-path', '//evil.example/steal');
  });

  await page.goto(`${appUrl}/complete-profile`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Account phone number').fill('50 123 4567');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/\/discover$/);
  expect(new URL(page.url()).origin).toBe(new URL(appUrl).origin);
  expect(requests.completionRequests).toHaveLength(1);
  expect(requests.unexpected).toEqual([]);
  assertConsoleHealthy();
});
