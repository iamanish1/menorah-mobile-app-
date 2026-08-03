const { test, expect } = require('@playwright/test');

const appUrl = process.env.QA_COUNSELLOR_WEB_URL || 'https://counsellor.menorah.me';

const json = (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  headers: {
    'access-control-allow-origin': new URL(route.request().headers().origin || route.request().url()).origin,
    'access-control-allow-credentials': 'true',
  },
  body: JSON.stringify(body),
});

const counsellor = {
  id: 'counsellor-emergency-contact-qa',
  firstName: 'Amina',
  lastName: 'Khan',
  email: 'amina@example.test',
  phone: '+971501111111',
  role: 'counsellor',
};

const booking = (id, emergencyContact) => ({
  id,
  userName: id === 'complete-contact' ? 'Samira Client' : 'Partial Client',
  userEmail: 'client@example.test',
  userPhone: '+971502222222',
  userGender: 'female',
  sessionType: 'chat',
  sessionDuration: 60,
  scheduledAt: '2026-08-01T10:00:00.000Z',
  assignedAt: '2026-07-31T09:00:00.000Z',
  status: 'completed',
  amount: 1000,
  currency: 'INR',
  paymentStatus: 'paid',
  emergencyContact,
});

test('counsellor booking detail protects and exposes a complete emergency contact accessibly', async ({ page }, testInfo) => {
  const consoleIssues = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.addInitScript(() => {
    window.__qaCopiedEmergencyPhone = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__qaCopiedEmergencyPhone = value;
        },
      },
    });
  });

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith('/api/users/me')) {
      await json(route, 200, {
        success: true,
        data: { user: counsellor },
      });
      return;
    }

    const detailMatch = pathname.match(/\/api\/counsellors\/me\/bookings\/([^/]+)$/);
    if (detailMatch) {
      const id = decodeURIComponent(detailMatch[1]);
      const emergencyContact = id === 'complete-contact'
        ? {
            name: 'Nadia Client',
            relationship: 'sister',
            phone: '+971 50 123 4567',
          }
        : {
            name: 'Missing Phone',
            relationship: 'friend',
            phone: '',
          };

      await json(route, 200, {
        success: true,
        data: { booking: booking(id, emergencyContact) },
      });
      return;
    }

    await json(route, 404, {
      success: false,
      message: `Unexpected QA request: ${route.request().method()} ${pathname}`,
    });
  });

  await page.goto(`${appUrl}/bookings/complete-contact`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bookings\/complete-contact$/);
  await expect(page).toHaveTitle(/Menorah Counselor/i);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Samira Client' })).toBeVisible();
  await expect(page.locator('[class*="AppLayout-module"][class*="overlay"]')).toHaveCount(0);

  const emergencyRegion = page.getByRole('region', { name: 'Emergency contact' });
  await expect(emergencyRegion).toBeVisible();
  await expect(emergencyRegion.getByText(/For emergencies only\./)).toBeVisible();
  await expect(emergencyRegion).toContainText('Keep these details confidential');
  await expect(emergencyRegion).toContainText('Nadia Client');
  await expect(emergencyRegion).toContainText('sister');
  await expect(emergencyRegion).toContainText('+971 50 123 4567');

  const callLink = emergencyRegion.getByRole('link', {
    name: 'Call emergency contact Nadia Client',
  });
  await expect(callLink).toHaveAttribute('href', 'tel:+971501234567');

  await emergencyRegion.getByRole('button', {
    name: 'Copy emergency contact phone number +971 50 123 4567',
  }).click();
  await expect.poll(() => page.evaluate(() => window.__qaCopiedEmergencyPhone))
    .toBe('+971 50 123 4567');
  await expect(emergencyRegion.getByRole('status')).toHaveText('Phone number copied.');

  const detailHeadings = await page.locator('h3').allTextContents();
  expect(detailHeadings.indexOf('Emergency contact')).toBeGreaterThan(
    detailHeadings.indexOf('User Information')
  );
  expect(detailHeadings.indexOf('Emergency contact')).toBeLessThan(
    detailHeadings.indexOf('Session Details')
  );

  await page.screenshot({
    path: testInfo.outputPath('emergency-contact-desktop.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(emergencyRegion).toBeVisible();

  // AppLayout animates its desktop sidebar margin when the viewport changes.
  // Poll until that responsive transition settles before measuring the small
  // sub-pixel allowance used by its off-canvas fixed sidebar.
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - window.innerWidth
  ))).toBeLessThanOrEqual(4);

  const emergencyBox = await emergencyRegion.boundingBox();
  expect(emergencyBox).not.toBeNull();
  expect(emergencyBox.x).toBeGreaterThanOrEqual(0);
  expect(emergencyBox.x + emergencyBox.width).toBeLessThanOrEqual(390);

  const callBox = await callLink.boundingBox();
  const copyBox = await emergencyRegion.getByRole('button', {
    name: 'Copy emergency contact phone number +971 50 123 4567',
  }).boundingBox();
  expect(callBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(Math.abs(callBox.width - copyBox.width)).toBeLessThanOrEqual(2);

  await emergencyRegion.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('emergency-contact-mobile.png'),
    fullPage: false,
  });

  await page.goto(`${appUrl}/bookings/incomplete-contact`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bookings\/incomplete-contact$/);
  await expect(page.getByRole('heading', { name: 'Partial Client' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Emergency contact' })).toHaveCount(0);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('[class*="AppLayout-module"][class*="overlay"]')).toHaveCount(0);

  const hasSocketFailure = consoleIssues.some((issue) => issue.includes('/socket.io/'))
    || consoleIssues.some((issue) => issue.includes('Socket.IO connection error in useSocket:'));
  const unexpectedConsoleIssues = consoleIssues.filter((issue) => {
    if (issue.includes('/socket.io/')) return false;
    if (issue.includes('Socket.IO connection error in useSocket:')) return false;
    if (hasSocketFailure && issue === 'error: Failed to load resource: net::ERR_FAILED') return false;
    return true;
  });

  // The mocked counsellor has no real-time socket session. Permit only that
  // exact transport failure and fail on all other rendered warnings/errors.
  expect(unexpectedConsoleIssues).toEqual([]);
  expect(pageErrors).toEqual([]);
});
