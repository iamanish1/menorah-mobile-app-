#!/usr/bin/env node

const DEFAULTS = {
  apiWeb: 'https://api-web.menorah.me',
  apiIos: 'https://api-ios.menorah.me',
  apiAndroid: 'https://api-android.menorah.me',
  apiAdmin: 'https://api-admin.menorah.me',
};

const config = {
  apiWeb: (process.env.QA_API_WEB_URL || DEFAULTS.apiWeb).replace(/\/+$/, ''),
  apiIos: (process.env.QA_API_IOS_URL || DEFAULTS.apiIos).replace(/\/+$/, ''),
  apiAndroid: (process.env.QA_API_ANDROID_URL || DEFAULTS.apiAndroid).replace(/\/+$/, ''),
  apiAdmin: (process.env.QA_API_ADMIN_URL || DEFAULTS.apiAdmin).replace(/\/+$/, ''),
  qaEmail: process.env.QA_EMAIL || 'tejasamirth+menorahqa-smoke@gmail.com',
  qaWrongPassword: process.env.QA_WRONG_PASSWORD || `WrongPassword-${Date.now()}-9`,
  adminEmail: process.env.QA_ADMIN_EMAIL,
  adminPassword: process.env.QA_ADMIN_PASSWORD,
};

const results = [];

const redact = (value) =>
  String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [REDACTED_TOKEN]');

const push = (status, name, detail = '') => {
  results.push({ status, name, detail: redact(detail) });
  console.log(`${status}: ${name}${detail ? ` - ${redact(detail)}` : ''}`);
};

const request = async (method, url, body, token) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { response, json, text };
};

const expectStatus = async (name, url, expected, options = {}) => {
  try {
    const { response } = await request(options.method || 'GET', url, options.body, options.token);
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (allowed.includes(response.status)) {
      push('PASS', name, `HTTP ${response.status}`);
    } else {
      push('FAIL', name, `expected ${allowed.join('/')} got HTTP ${response.status}`);
    }
  } catch (error) {
    push('FAIL', name, error.message);
  }
};

const expectJsonSuccess = async (name, url, options = {}) => {
  try {
    const { response, json } = await request(options.method || 'GET', url, options.body, options.token);
    if (response.ok && json?.success === true) {
      push('PASS', name, `HTTP ${response.status}`);
      return json;
    }
    push('FAIL', name, `expected success JSON got HTTP ${response.status}`);
    return null;
  } catch (error) {
    push('FAIL', name, error.message);
    return null;
  }
};

const main = async () => {
  console.log('Menorah production API smoke');

  await expectStatus('api-web /health/ready', `${config.apiWeb}/health/ready`, 200);
  await expectStatus('api-ios /health/ready', `${config.apiIos}/health/ready`, 200);
  await expectStatus('api-android /health/ready', `${config.apiAndroid}/health/ready`, 200);
  await expectStatus('api-admin /health/ready', `${config.apiAdmin}/health/ready`, 200);
  await expectStatus('api-admin unauthenticated /api/auth/me', `${config.apiAdmin}/api/auth/me`, 401);
  await expectStatus('api-web unauthenticated /api/auth/me', `${config.apiWeb}/api/auth/me`, 401);
  await expectStatus('api-web wrong-password login', `${config.apiWeb}/api/auth/login`, 401, {
    method: 'POST',
    body: { email: config.qaEmail, password: config.qaWrongPassword },
  });

  if (config.adminEmail && config.adminPassword) {
    const login = await expectJsonSuccess('api-admin login with env credentials', `${config.apiAdmin}/api/auth/login`, {
      method: 'POST',
      body: { email: config.adminEmail, password: config.adminPassword },
    });
    const token = login?.data?.token;
    if (token) {
      await expectStatus('api-admin authenticated /api/auth/me', `${config.apiAdmin}/api/auth/me`, 200, { token });
      await expectStatus('api-admin logout', `${config.apiAdmin}/api/auth/logout`, 200, { method: 'POST', token });
    }
  } else {
    push('BLOCKED', 'api-admin login with env credentials', 'set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD to run');
  }

  const summary = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`Summary: PASS ${summary.PASS || 0}, FAIL ${summary.FAIL || 0}, BLOCKED ${summary.BLOCKED || 0}`);
  if (summary.FAIL) process.exit(1);
};

main().catch((error) => {
  console.error(redact(error.message || error));
  process.exit(1);
});
