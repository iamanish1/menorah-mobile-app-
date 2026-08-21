#!/usr/bin/env node

/*
 * Production auth smoke test.
 *
 * Safety rules:
 * - Never prints OTPs, JWTs, passwords, or raw provider secrets.
 * - Stops after triggering OTP unless QA_OTP is supplied by the operator.
 * - Uses only the configured QA_EMAIL.
 */

const crypto = require('crypto');

const API_BASE = (process.env.QA_API_BASE || 'https://api-web.menorah.me/api').replace(/\/+$/, '');
const QA_EMAIL_PATTERN = /^tejasamirth\+menorahqa-[A-Za-z0-9._-]+@gmail\.com$/;
const QA_EMAIL = process.env.QA_EMAIL || `tejasamirth+menorahqa-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}@gmail.com`;
const QA_PASSWORD = process.env.QA_PASSWORD;
const QA_OTP = process.env.QA_OTP;
const QA_PHONE = process.env.QA_PHONE || `+19${String(Date.now()).slice(-9)}`;

const results = [];

const redact = (value) =>
  String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b\d{6}\b/g, '[REDACTED_OTP]');

const strongWrongPassword = () => `Wrong${crypto.randomBytes(8).toString('hex')}9`;

const record = (name, status, detail = '') => {
  results.push({ name, status, detail: redact(detail) });
};

const request = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    json,
    message: json?.message || response.statusText,
  };
};

const registrationPayload = () => ({
  firstName: 'Menorah',
  lastName: 'QA',
  email: QA_EMAIL,
  phone: QA_PHONE,
  password: QA_PASSWORD,
  dateOfBirth: '1990-01-01',
  gender: 'male',
});

const printResults = () => {
  console.log('\nMenorah production auth smoke results');
  for (const result of results) {
    console.log(`${result.status} ${result.name}${result.detail ? ` - ${result.detail}` : ''}`);
  }
};

const main = async () => {
  if (!QA_PASSWORD) {
    console.error('QA_PASSWORD is required but was not printed.');
    process.exit(2);
  }

  if (!QA_EMAIL_PATTERN.test(QA_EMAIL)) {
    console.error('QA_EMAIL must match tejasamirth+menorahqa-*@gmail.com.');
    process.exit(2);
  }

  const register = await request('POST', '/auth/register', registrationPayload());
  const registerDetail = `HTTP ${register.status}; ${register.message || ''}`;
  if (register.status === 200) {
    record('signup', 'PASS', `${registerDetail}; OTP required`);
  } else if (/already exists/i.test(register.message || '')) {
    record('signup', 'PASS', `${registerDetail}; duplicate account exists`);
    const resend = await request('POST', '/auth/resend-email-otp', { email: QA_EMAIL });
    record('resend email OTP', resend.ok ? 'PASS' : 'FAIL', `HTTP ${resend.status}; ${resend.message || ''}`);
  } else {
    record('signup', 'FAIL', registerDetail);
    printResults();
    process.exit(1);
  }

  if (!QA_OTP) {
    record('OTP verification', 'NOT VERIFIED', 'QA_OTP not supplied; check the approved inbox and rerun with QA_OTP');
    printResults();
    process.exit(3);
  }

  const verify = await request('POST', '/auth/verify-email-otp', { email: QA_EMAIL, otp: QA_OTP });
  record('OTP verification', verify.ok ? 'PASS' : 'FAIL', `HTTP ${verify.status}; ${verify.message || ''}`);

  const login = await request('POST', '/auth/login', { email: QA_EMAIL, password: QA_PASSWORD });
  const token = login.json?.data?.token;
  record('login', login.ok && token ? 'PASS' : 'FAIL', `HTTP ${login.status}; ${login.message || ''}`);

  if (token) {
    const authMe = await request('GET', '/auth/me', null, token);
    record('/api/auth/me', authMe.ok ? 'PASS' : 'FAIL', `HTTP ${authMe.status}; ${authMe.message || ''}`);

    const usersMe = await request('GET', '/users/me', null, token);
    record('/api/users/me', usersMe.ok ? 'PASS' : 'FAIL', `HTTP ${usersMe.status}; ${usersMe.message || ''}`);

    const logout = await request('POST', '/auth/logout', null, token);
    record('logout', logout.ok ? 'PASS' : 'FAIL', `HTTP ${logout.status}; ${logout.message || ''}`);
  }

  const wrongPassword = await request('POST', '/auth/login', {
    email: QA_EMAIL,
    password: strongWrongPassword(),
  });
  record('wrong password', wrongPassword.status === 401 ? 'PASS' : 'FAIL', `HTTP ${wrongPassword.status}`);

  const duplicate = await request('POST', '/auth/register', registrationPayload());
  record('duplicate registration', duplicate.status === 400 ? 'PASS' : 'FAIL', `HTTP ${duplicate.status}; ${duplicate.message || ''}`);

  const forgot = await request('POST', '/auth/forgot-password', { email: QA_EMAIL });
  record('forgot password email', forgot.ok ? 'PASS' : 'FAIL', `HTTP ${forgot.status}; ${forgot.message || ''}`);

  printResults();

  const failed = results.some((result) => result.status === 'FAIL');
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error(redact(error.message || error));
  process.exit(1);
});
