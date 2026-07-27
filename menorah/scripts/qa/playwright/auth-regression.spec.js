const { test, expect } = require('@playwright/test');

const urls = {
  app: process.env.QA_APP_URL || 'https://app.menorah.me',
  admin: process.env.QA_ADMIN_URL || 'https://admin.menorah.me',
  counsellor: process.env.QA_COUNSELLOR_WEB_URL || 'https://counsellor.menorah.me',
};

const cspViolationsByPage = new WeakMap();

const assertAuthCsp = (response, url) => {
  expect(response, `expected an HTML response for ${url}`).not.toBeNull();
  const csp = response.headers()['content-security-policy'] || '';
  const parsedUrl = new URL(url);
  const isPatientPortal = parsedUrl.origin === urls.app;
  const isGoogleAuthRoute = isPatientPortal && ['/login', '/register'].includes(parsedUrl.pathname);

  if (isGoogleAuthRoute) {
    // Google Identity Services injects its own stylesheet and writes iframe
    // dimensions through style attributes. This is deliberately limited to
    // the two routes that render the Google button.
    expect(csp, `${url} must allow the GIS stylesheet`).toMatch(/style-src-elem(?=[^;]*'self')(?=[^;]*https:\/\/accounts\.google\.com\/gsi\/style)(?=[^;]*'unsafe-inline')[^;]+/);
    expect(csp, `${url} must allow GIS iframe style attributes`).toMatch(/(?:^|;\s*)style-src-attr 'unsafe-inline'(?:;|$)/);
    expect(csp, `${url} must allow GIS iframe and status endpoints`).toMatch(/(?:frame-src|connect-src)[^;]*https:\/\/accounts\.google\.com\/gsi\//);
    return;
  }

  expect(csp, `${url} must restrict stylesheet elements to self`).toMatch(/(?:^|;\s*)style-src-elem 'self'(?:;|$)/);
  expect(csp, `${url} must reject inline style attributes`).toMatch(/(?:^|;\s*)style-src-attr 'none'(?:;|$)/);
  expect(csp, `${url} must not allow inline style elements`).not.toMatch(/style-src-elem[^;]*'unsafe-inline'/);
};

const gotoAuthPage = async (page, url) => {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assertAuthCsp(response, url);
  return response;
};

const json = (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  headers: {
    'access-control-allow-origin': new URL(route.request().headers().origin || route.request().url()).origin,
    'access-control-allow-credentials': 'true',
  },
  body: JSON.stringify(body),
});

const mockApi = async (page, handler) => {
  await page.route('**/api/**', async (route) => {
    const handled = await handler(route);
    if (!handled) {
      await json(route, 404, { success: false, message: 'Unexpected test request' });
    }
  });
};

const installGoogleStub = async (page) => {
  await page.addInitScript(() => {
    window.google = {
      accounts: {
        id: {
          initialize(options) {
            window.__qaGoogleCallback = options.callback;
          },
          renderButton(parent) {
            const style = document.createElement('style');
            style.id = 'googleidentityservice_button_styles';
            style.textContent = '.qa-google-button { min-height: 40px; }';
            document.head.appendChild(style);
            parent.style.minHeight = '40px';
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Continue with Google';
            button.className = 'qa-google-button';
            button.setAttribute('aria-label', 'Continue with Google');
            button.addEventListener('click', () => {
              window.__qaGoogleCallback?.({ credential: 'QA_GOOGLE_CREDENTIAL' });
            });
            parent.appendChild(button);
          },
        },
      },
    };
  });
};

test.describe('authentication regressions', () => {
  test.beforeEach(async ({ page }) => {
    const violations = [];
    cspViolationsByPage.set(page, violations);
    page.on('console', (message) => {
      const text = message.text();
      if (
        message.type() === 'error'
        && /(content security policy|violates the following content security policy|refused to apply (?:inline )?style)/i.test(text)
      ) {
        violations.push(text);
      }
    });
  });

  test.afterEach(async ({ page }) => {
    expect(cspViolationsByPage.get(page) || [], 'auth pages emitted CSP console violations').toEqual([]);
  });

  test('patient login keeps an expected anonymous probe and invalid login on the page', async ({ page }) => {
    let sessionProbes = 0;
    await mockApi(page, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/api/users/me')) {
        sessionProbes += 1;
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      if (pathname.endsWith('/api/auth/login')) {
        await json(route, 401, { success: false, message: 'Invalid email or password' });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.app}/login`);
    await page.getByLabel(/email address/i).fill('nobody@example.com');
    await page.getByLabel(/^password$/i).fill('WrongPass1');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toContainText('Invalid email or password');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await page.waitForTimeout(750);
    expect(sessionProbes, 'login must make exactly one session probe').toBe(1);
  });

  test('failed Google sign-in preserves the server error and sends sign-in intent', async ({ page }) => {
    let sessionProbes = 0;
    let socialIntent;
    await installGoogleStub(page);
    await mockApi(page, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/api/users/me')) {
        sessionProbes += 1;
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      if (pathname.endsWith('/api/auth/google')) {
        socialIntent = route.request().postDataJSON().intent;
        await json(route, 404, {
          success: false,
          code: 'ACCOUNT_NOT_FOUND',
          message: 'No account is linked to this Google sign-in.',
        });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.app}/login`);
    await page.getByRole('button', { name: /continue with google/i }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'No account is linked to this Google sign-in.' })).toContainText('No account is linked to this Google sign-in.');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    expect(socialIntent).toBe('signin');
    expect(sessionProbes, 'failed Google sign-in must not reload or probe again').toBe(1);
  });

  test('unverified patient login enters OTP flow without receiving a session', async ({ page }) => {
    let verificationRequests = 0;
    await mockApi(page, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/api/users/me')) {
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      if (pathname.endsWith('/api/auth/login')) {
        await json(route, 403, {
          success: false,
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Email verification required',
          data: { email: 'pending@example.com' },
        });
        return true;
      }
      if (pathname.endsWith('/api/auth/resend-email-verification')) {
        verificationRequests += 1;
        await json(route, 200, {
          success: true,
          message: 'If an unverified account exists for that email, a new code has been sent.',
        });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.app}/login`);
    await page.getByLabel(/email address/i).fill('pending@example.com');
    await page.getByLabel(/^password$/i).fill('Password1');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/verify-otp(\?|$)/);
    await expect(page.getByRole('heading', { name: /verify your email/i })).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pending_verify_email')))
      .toBe('pending@example.com');
    await expect.poll(() => verificationRequests).toBe(1);
  });

  test('password reset scrubs the capability and enforces the server password policy', async ({ page }) => {
    await mockApi(page, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/api/users/me')) {
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.app}/reset-password?token=TEST_ONLY_TOKEN`);
    await expect(page).toHaveURL(new RegExp(`${urls.app.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/reset-password$`));

    await page.getByLabel(/new password/i).fill('alllowercase1');
    await page.getByLabel(/confirm password/i).fill('alllowercase1');
    await page.getByRole('button', { name: /reset password/i }).click();
    await expect(page.getByText(/uppercase letter/i)).toBeVisible();
  });

  test('admin login preserves a 401 error instead of reloading', async ({ page }) => {
    let sessionProbes = 0;
    await mockApi(page, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/api/auth/me')) {
        sessionProbes += 1;
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      if (pathname.endsWith('/api/auth/admin/login')) {
        await json(route, 401, { success: false, message: 'Invalid admin credentials' });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.admin}/login`);
    await page.getByLabel(/email address/i).fill('nobody@example.com');
    await page.getByLabel(/^password$/i).fill('WrongPass1');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page.getByText('Invalid admin credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await page.waitForTimeout(750);
    expect(sessionProbes, 'admin login must make exactly one session probe').toBe(1);
  });

  test('wrong admin MFA code preserves the challenge and error without reloading', async ({ page }) => {
    let sessionProbes = 0;
    await mockApi(page, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/api/auth/me')) {
        sessionProbes += 1;
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      if (pathname.endsWith('/api/auth/admin/login')) {
        await json(route, 200, {
          success: true,
          message: 'Verification code sent',
          data: { mfaRequired: true, challengeId: 'qa-mfa-challenge' },
        });
        return true;
      }
      if (pathname.endsWith('/api/auth/admin/login/mfa')) {
        await json(route, 401, { success: false, message: 'Invalid verification code' });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.admin}/login`);
    await page.getByLabel(/email address/i).fill('admin@example.com');
    await page.getByLabel(/^password$/i).fill('Password1');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.getByLabel(/verification code/i).fill('000000');
    await page.getByRole('button', { name: /verify code/i }).click();

    await expect(page.getByText('Invalid verification code')).toBeVisible();
    await expect(page.getByLabel(/verification code/i)).toHaveValue('000000');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    expect(sessionProbes, 'wrong MFA must not reload or probe again').toBe(1);
  });

  test('counsellor login preserves a 401 error instead of reloading', async ({ page }) => {
    let sessionProbes = 0;
    await mockApi(page, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/api/users/me')) {
        sessionProbes += 1;
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      if (pathname.endsWith('/api/auth/login')) {
        await json(route, 401, { success: false, message: 'Invalid email or password' });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.counsellor}/login`);
    await page.getByLabel(/email/i).fill('nobody@example.com');
    await page.getByLabel(/^password$/i).fill('WrongPass1');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await page.waitForTimeout(750);
    expect(sessionProbes, 'counsellor login must make exactly one session probe').toBe(1);
  });

  test('patient registration renders under the strict auth-page CSP', async ({ page }) => {
    await mockApi(page, async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/api/users/me')) {
        await json(route, 401, { success: false, message: 'No browser session' });
        return true;
      }
      return false;
    });

    await gotoAuthPage(page, `${urls.app}/register`);
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();
  });

  test('counsellor registration renders under the strict auth-page CSP', async ({ page }) => {
    await mockApi(page, async () => false);

    await gotoAuthPage(page, `${urls.counsellor}/register`);
    await expect(page.getByRole('heading', { name: /counselor registration/i })).toBeVisible();
  });
});
