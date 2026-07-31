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

const makeQaUser = (overrides = {}) => ({
  id: 'profile-edit-focused-qa-user',
  firstName: 'Profile',
  lastName: 'User',
  email: 'profile-focused-qa@example.test',
  phone: '+971501234567',
  isEmailVerified: true,
  isPhoneVerified: true,
  role: 'user',
  dateOfBirth: '2000-01-01T00:00:00.000Z',
  gender: 'male',
  preferredLanguage: 'English',
  emergencyContact: {
    name: 'Emergency Person',
    relationship: 'Sibling',
    phone: '+971501234567',
  },
  ...overrides,
});

const installFocusedProfileApi = async (page, {
  user = makeQaUser(),
  emergencyFailure,
  avatarFailure,
} = {}) => {
  const requests = {
    profiles: [],
    emergencyContacts: [],
    addresses: 0,
    avatars: 0,
    unexpected: [],
  };

  await page.addInitScript(() => {
    window.localStorage.setItem('menorah-user-tour-v1', 'qa-complete');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/api/users/me')) {
      await json(route, 200, { success: true, data: { user } });
      return;
    }

    if (pathname.endsWith('/api/users/profile') && request.method() === 'PUT') {
      const contentType = request.headers()['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        requests.avatars += 1;
        if (avatarFailure) {
          await json(route, avatarFailure.status || 500, {
            success: false,
            message: avatarFailure.message,
          });
        } else {
          await json(route, 200, {
            success: true,
            data: {
              user: {
                ...user,
                profileImage: '/icon.png',
              },
            },
          });
        }
        return;
      }

      const payload = request.postDataJSON();
      requests.profiles.push(payload);
      await json(route, 200, {
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            ...user,
            ...payload,
          },
        },
      });
      return;
    }

    if (pathname.endsWith('/api/users/emergency-contact') && request.method() === 'PUT') {
      const payload = request.postDataJSON();
      requests.emergencyContacts.push(payload);
      if (emergencyFailure) {
        await json(route, emergencyFailure.status || 500, {
          success: false,
          message: emergencyFailure.message,
        });
      } else {
        const isClear = !payload.name && !payload.relationship && !payload.phone;
        await json(route, 200, {
          success: true,
          message: 'Emergency contact updated successfully',
          data: {
            emergencyContact: isClear ? null : payload,
          },
        });
      }
      return;
    }

    if (pathname.endsWith('/api/users/address')) {
      requests.addresses += 1;
      await json(route, 200, { success: true, data: { address: {} } });
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

    requests.unexpected.push(`${request.method()} ${pathname}`);
    await json(route, 404, {
      success: false,
      message: `Unexpected QA request: ${request.method()} ${pathname}`,
    });
  });

  return requests;
};

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
    dateOfBirth: '2000-01-01T00:00:00.000Z',
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
        data: {
          emergencyContact: {
            ...submittedEmergencyContact,
            name: 'Saved Emergency',
          },
        },
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
  await expect(page.getByText(/only the counsellor assigned to your booking/i)).toBeVisible();
  await expect(page.getByLabel('Date of birth', { exact: true })).toHaveValue('2000-01-01');
  await expect(page.getByRole('heading', { name: 'Address', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Street', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('City', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('State', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Country', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('ZIP code', { exact: true })).toHaveCount(0);

  await page.getByLabel('First name', { exact: true }).fill('Updated');
  await page.getByLabel('Name', { exact: true }).fill('Emergency Updated');
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
    name: 'Emergency Updated',
    relationship: 'Sibling',
    phone: '+971501234567',
  });
  // The emergency endpoint has a different response shape from profile
  // updates. Its returned contact must be merged into AuthContext and then
  // reflected back into the controlled form.
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Saved Emergency');
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

test('an intentionally blank emergency contact clears the saved contact', async ({ page }) => {
  const requests = await installFocusedProfileApi(page);

  await page.goto(`${appUrl}/profile/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Name', { exact: true }).fill('');
  await page.getByLabel('Relationship', { exact: true }).fill('');
  await page.getByLabel('Phone', { exact: true }).fill('');
  await page.getByLabel('Last name', { exact: true }).fill('Updated');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByRole('status')).toContainText('Profile updated successfully!');
  expect(requests.profiles).toHaveLength(1);
  expect(requests.emergencyContacts).toEqual([{
    name: '',
    relationship: '',
    phone: '',
  }]);
  expect(requests.addresses).toBe(0);
  expect(requests.unexpected).toEqual([]);

  // The API returns null for a cleared contact. Merging that value into the
  // AuthContext causes the form reset effect to keep all three controls blank.
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Relationship', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('');
});

test('a partial emergency contact is rejected inline before either save request', async ({ page }) => {
  const requests = await installFocusedProfileApi(page, {
    user: makeQaUser({ emergencyContact: null }),
  });

  await page.goto(`${appUrl}/profile/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Name', { exact: true }).fill('Only a name');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText('Relationship is required', { exact: true })).toBeVisible();
  await expect(page.getByText('Phone number is required', { exact: true })).toBeVisible();
  expect(requests.profiles).toHaveLength(0);
  expect(requests.emergencyContacts).toHaveLength(0);
  expect(requests.addresses).toBe(0);
  expect(requests.unexpected).toEqual([]);
});

test('an emergency-contact API failure is surfaced without a false success', async ({ page }) => {
  const requests = await installFocusedProfileApi(page, {
    emergencyFailure: {
      status: 503,
      message: 'Emergency contact service unavailable',
    },
  });

  await page.goto(`${appUrl}/profile/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('First name', { exact: true }).fill('Updated');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  const saveError = page.getByRole('alert').filter({
    hasText: 'Personal information was saved, but the emergency contact was not',
  });
  await expect(saveError).toContainText(
    'Personal information was saved, but the emergency contact was not'
  );
  await expect(saveError).toContainText('Emergency contact service unavailable');
  await expect(page.getByText('Profile updated successfully!', { exact: true })).toHaveCount(0);
  expect(requests.profiles).toHaveLength(1);
  expect(requests.emergencyContacts).toHaveLength(1);
  expect(requests.addresses).toBe(0);
  expect(requests.unexpected).toEqual([]);
});

test('avatar upload failures are visible and do not report success', async ({ page }) => {
  const requests = await installFocusedProfileApi(page, {
    avatarFailure: {
      status: 500,
      message: 'Image storage unavailable',
    },
  });

  await page.goto(`${appUrl}/profile/edit`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'profile.png',
    mimeType: 'image/png',
    buffer: Buffer.from('profile-image-qa'),
  });

  await expect(
    page.getByRole('alert').filter({ hasText: 'Image storage unavailable' })
  ).toContainText('Image storage unavailable');
  await expect(page.getByText('Profile photo updated.', { exact: true })).toHaveCount(0);
  expect(requests.avatars).toBe(1);
  expect(requests.profiles).toHaveLength(0);
  expect(requests.emergencyContacts).toHaveLength(0);
  expect(requests.unexpected).toEqual([]);
});
