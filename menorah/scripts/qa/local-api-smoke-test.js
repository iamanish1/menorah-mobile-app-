#!/usr/bin/env node

const {
  CONFIRMATION: LOCAL_MAIL_CAPTURE_CONFIRMATION,
  clearSyntheticMessages,
  readLatestSyntheticOtp,
} = require('./local-mail-capture');
const {
  resolveLocalValidationProfile,
} = require('./smoke-target-safety');

const LOCAL_STAGING_DEFAULTS = {
  apiIos: 'http://127.0.0.1:28080',
  apiAndroid: 'http://127.0.0.1:28081',
  apiWeb: 'http://127.0.0.1:28082',
  apiAdmin: 'http://127.0.0.1:28083',
  worker: 'http://127.0.0.1:28084',
};
const validationProfile = resolveLocalValidationProfile(process.env);
const DEFAULTS = validationProfile.apiTargets || LOCAL_STAGING_DEFAULTS;

const config = {
  apiIos: process.env.QA_API_IOS_URL || DEFAULTS.apiIos,
  apiAndroid: process.env.QA_API_ANDROID_URL || DEFAULTS.apiAndroid,
  apiWeb: process.env.QA_API_WEB_URL || DEFAULTS.apiWeb,
  apiAdmin: process.env.QA_API_ADMIN_URL || DEFAULTS.apiAdmin,
  worker: process.env.QA_WORKER_URL || DEFAULTS.worker,
  adminEmail: process.env.QA_ADMIN_EMAIL,
  normalEmail: process.env.QA_USER_EMAIL,
  adminPassword: process.env.QA_ADMIN_PASSWORD,
  userPassword: process.env.QA_USER_PASSWORD,
  mailCaptureConfirmation:
    process.env.QA_LOCAL_STAGING_MAIL_CAPTURE_CONFIRM,
  runId: Date.now() % 100000,
};

const results = [];

function validateExactLocalTargets(targets = config) {
  for (const [key, expected] of Object.entries(DEFAULTS)) {
    if (targets[key] !== expected) {
      throw new Error(
        `Local API smoke ${key} must target exactly ${expected}`
      );
    }
  }
}

function pushResult(status, name, details = '') {
  results.push({ status, name, details });
  const suffix = details ? ` - ${details}` : '';
  console.log(`${status}: ${name}${suffix}`);
}

async function request(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { ...(options.headers || {}) };
  const init = {
    method: options.method || 'GET',
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs || 10000),
  };

  if (Object.prototype.hasOwnProperty.call(options, 'body')) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  return { url, status: res.status, text };
}

async function expectStatus(name, baseUrl, path, expectedStatuses, options = {}) {
  const expected = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  try {
    const res = await request(baseUrl, path, options);
    if (expected.includes(res.status)) {
      pushResult('PASS', name, `${res.status} ${res.url}`);
      return res;
    }

    pushResult(
      options.blockedOnMismatch ? 'BLOCKED' : 'FAIL',
      name,
      `expected ${expected.join('/')} got ${res.status} ${res.url}`
    );
    return res;
  } catch (error) {
    pushResult(options.blockedOnError ? 'BLOCKED' : 'FAIL', name, error.message);
    return null;
  }
}

async function expectJsonSuccess(name, baseUrl, path, options = {}) {
  try {
    const res = await request(baseUrl, path, options);
    let payload = {};
    try {
      payload = res.text ? JSON.parse(res.text) : {};
    } catch {}

    if (res.status >= 200 && res.status < 300 && payload.success === true) {
      pushResult('PASS', name, `${res.status} ${res.url}`);
      return { res, payload };
    }

    pushResult('FAIL', name, `expected success JSON got ${res.status} ${res.url}`);
    return { res, payload };
  } catch (error) {
    pushResult('FAIL', name, error.message);
    return null;
  }
}

function qaForwardedFor(offset) {
  const third = Math.floor(config.runId / 250) % 250;
  const fourth = ((config.runId + offset) % 250) + 1;
  return { 'X-Forwarded-For': `10.254.${third}.${fourth}` };
}

async function main() {
  validateExactLocalTargets();
  console.log('Local API smoke test');
  console.log(`api-ios: ${config.apiIos}`);
  console.log(`api-android: ${config.apiAndroid}`);
  console.log(`api-web: ${config.apiWeb}`);
  console.log(`api-admin: ${config.apiAdmin}`);
  console.log(`worker: ${config.worker}`);
  console.log('');

  await expectStatus('api-ios live health', config.apiIos, '/health/live', 200);
  await expectStatus('api-ios ready health', config.apiIos, '/health/ready', 200);
  await expectStatus('api-ios subscription checkout blocked', config.apiIos, '/api/payments/create-subscription-checkout', 404, {
    method: 'POST',
    body: { subscriptionType: 'monthly' },
  });
  await expectStatus('api-ios subscription verify blocked', config.apiIos, '/api/payments/verify-subscription-payment', 404, {
    method: 'POST',
    body: {
      razorpay_order_id: 'order_test',
      razorpay_payment_id: 'pay_test',
      razorpay_signature: 'sig_test',
      subscriptionType: 'monthly',
    },
  });
  await expectStatus('api-ios subscription status blocked', config.apiIos, '/api/payments/subscription/status', 404);
  await expectStatus('api-ios future subscription order blocked', config.apiIos, '/api/payments/subscription/create-order', 404, {
    method: 'POST',
    body: { subscriptionType: 'monthly' },
  });
  await expectStatus('api-ios future subscription verify blocked', config.apiIos, '/api/payments/subscription/verify', 404, {
    method: 'POST',
    body: { subscriptionType: 'monthly' },
  });
  await expectStatus('api-ios future non-booking payment blocked', config.apiIos, '/api/payments/future-digital-unlock', 404, {
    method: 'POST',
    body: { plan: 'premium' },
  });
  await expectStatus('api-ios booking payment route auth protected', config.apiIos, '/api/payments/booking/create-order', [401, 403], {
    method: 'POST',
    body: { bookingId: '507f1f77bcf86cd799439011' },
  });

  await expectStatus('api-android ready health', config.apiAndroid, '/health/ready', 200);
  await expectStatus('api-android auth router mounted', config.apiAndroid, '/api/auth/me', 401);
  await expectStatus('api-android subscription payment route auth protected', config.apiAndroid, '/api/payments/create-subscription-checkout', [401, 403], {
    method: 'POST',
    body: { subscriptionType: 'monthly' },
  });

  await expectStatus('api-web ready health', config.apiWeb, '/health/ready', 200);
  await expectStatus('api-web auth router mounted', config.apiWeb, '/api/auth/me', 401);
  await expectStatus('api-web public articles reachable', config.apiWeb, '/api/articles', 200);

  await expectStatus('api-admin ready health', config.apiAdmin, '/health/ready', 200);
  await expectStatus('api-admin auth router mounted for admin login', config.apiAdmin, '/api/auth/me', 401);
  await expectStatus('api-admin auth login validates body', config.apiAdmin, '/api/auth/login', 400, {
    method: 'POST',
    headers: qaForwardedFor(1),
    body: {},
  });
  const canRunSeededAuth = (
    config.adminEmail
    && config.normalEmail
    && config.adminPassword
    && config.userPassword
  );
  let adminLogin = null;
  if (canRunSeededAuth) {
    const useLocalMailCapture = (
      config.mailCaptureConfirmation
      === LOCAL_MAIL_CAPTURE_CONFIRMATION
    );
    if (useLocalMailCapture) clearSyntheticMessages();
    adminLogin = await expectJsonSuccess('api-admin seeded admin login succeeds', config.apiAdmin, '/api/auth/login', {
      method: 'POST',
      headers: qaForwardedFor(2),
      body: { email: config.adminEmail, password: config.adminPassword },
    });
    if (
      adminLogin?.payload?.data?.mfaRequired === true
      && adminLogin.payload.data.challengeId
    ) {
      if (useLocalMailCapture) {
        const otp = readLatestSyntheticOtp(config.adminEmail);
        adminLogin = await expectJsonSuccess(
          'api-admin seeded admin MFA succeeds',
          config.apiAdmin,
          '/api/auth/login/mfa',
          {
            method: 'POST',
            headers: qaForwardedFor(3),
            body: {
              challengeId: adminLogin.payload.data.challengeId,
              otp,
            },
          }
        );
      } else {
        pushResult(
          'BLOCKED',
          'api-admin seeded admin MFA succeeds',
          'set the exact local synthetic mail-capture confirmation'
        );
        adminLogin = null;
      }
    }
    await expectStatus('api-admin seeded normal user rejected', config.apiAdmin, '/api/auth/login', 403, {
      method: 'POST',
      headers: qaForwardedFor(4),
      body: { email: config.normalEmail, password: config.userPassword },
    });
  } else {
    pushResult('BLOCKED', 'api-admin seeded admin login succeeds', 'set QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD, QA_USER_EMAIL, and QA_USER_PASSWORD to run');
    pushResult('BLOCKED', 'api-admin seeded normal user rejected', 'set QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD, QA_USER_EMAIL, and QA_USER_PASSWORD to run');
  }
  await expectStatus('api-admin register route absent', config.apiAdmin, '/api/auth/register', 404, {
    method: 'POST',
    headers: qaForwardedFor(4),
    body: {},
  });
  await expectStatus('api-admin forgot password route absent', config.apiAdmin, '/api/auth/forgot-password', 404, {
    method: 'POST',
    headers: qaForwardedFor(5),
    body: {},
  });
  await expectStatus('api-admin email OTP route absent', config.apiAdmin, '/api/auth/verify-email-otp', 404, {
    method: 'POST',
    headers: qaForwardedFor(6),
    body: {},
  });
  if (adminLogin?.payload?.data?.token) {
    await expectStatus('api-admin me returns seeded admin with token', config.apiAdmin, '/api/auth/me', 200, {
      headers: { Authorization: `Bearer ${adminLogin.payload.data.token}` },
    });
  }
  await expectStatus('api-admin base admin route exposed', config.apiAdmin, '/api/admin', [401, 403], {
    blockedOnMismatch: false,
  });
  await expectStatus('api-admin stats route auth protected', config.apiAdmin, '/api/admin/stats', [401, 403], {
    blockedOnMismatch: false,
  });

  await expectStatus('worker ready health', config.worker, '/health/ready', 200, {
    blockedOnError: true,
  });

  await expectStatus('api-ios admin route isolated', config.apiIos, '/api/admin/stats', 404);
  await expectStatus('api-android admin route isolated', config.apiAndroid, '/api/admin/stats', 404);
  await expectStatus('api-web admin route isolated', config.apiWeb, '/api/admin/stats', 404);

  const summary = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { PASS: 0, FAIL: 0, BLOCKED: 0 }
  );

  console.log('');
  console.log(`Summary: PASS: ${summary.PASS} FAIL: ${summary.FAIL} BLOCKED: ${summary.BLOCKED}`);

  if (summary.FAIL > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
