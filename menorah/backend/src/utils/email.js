const axios = require('axios');
const {
  DEPLOYMENT_ENVIRONMENTS,
  getDeploymentEnvironment,
} = require('../config/deploymentEnvironment');

const RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const FROM_NAME = 'Menorah Health';
const isDev = process.env.NODE_ENV !== 'production';
const CANONICAL_PASSWORD_RESET_BASE_URL = 'https://app.menorah.me';
const DNS_HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EMAIL_LOCAL_PART_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;

const isPlaceholder = (value) =>
  !value || /^REPLACE/i.test(value) || value.includes('replace_with');

const safeErrorResponse = (error) => {
  return {
    message: 'Email delivery provider request failed',
    status: error.response?.status,
    code: error.code,
  };
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isConfigured = () => {
  if (isPlaceholder(process.env.RESEND_API_KEY)) {
    console.error('\u274C RESEND_API_KEY is not set. Email sending is disabled.');
    return false;
  }

  if (isPlaceholder(process.env.EMAIL_FROM)) {
    console.error('\u274C EMAIL_FROM is not set. Email sending is disabled.');
    return false;
  }

  return true;
};

const getBareEmailDomain = (value) => {
  const address = typeof value === 'string' ? value : '';
  const separatorIndex = address.indexOf('@');
  if (
    separatorIndex <= 0
    || separatorIndex !== address.lastIndexOf('@')
    || address !== address.trim()
    || /[<>\s]/.test(address)
  ) {
    return null;
  }

  const localPart = address.slice(0, separatorIndex);
  const domain = address.slice(separatorIndex + 1);
  if (
    !EMAIL_LOCAL_PART_PATTERN.test(localPart)
    || !DNS_HOST_PATTERN.test(domain)
  ) {
    return null;
  }
  return domain;
};

const hasValidStagingEmailDomain = (value) => {
  const domain = String(value || '').trim();
  return (
    DNS_HOST_PATTERN.test(domain)
    && domain.split('.').includes('staging')
  );
};

const canDeliverToStagingRecipient = (recipient) => {
  const stagingDomain = String(
    process.env.MENORAH_STAGING_EMAIL_DOMAIN || ''
  ).trim();
  return (
    hasValidStagingEmailDomain(stagingDomain)
    && getBareEmailDomain(recipient) === stagingDomain
  );
};

const sendEmail = async (to, subject, html) => {
  let deploymentEnvironment;
  try {
    deploymentEnvironment = getDeploymentEnvironment(process.env);
  } catch (_error) {
    console.error('Email delivery environment is invalid. Email sending is disabled.');
    return false;
  }

  if (
    deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING
    && !canDeliverToStagingRecipient(to)
  ) {
    console.error('Staging email recipient is outside the isolated delivery domain.');
    return false;
  }

  if (isDev) {
    console.log('[DEV EMAIL - not sent; recipient, subject, and content suppressed]');
    return true;
  }

  if (!isConfigured()) return false;

  try {
    await axios.post(
      RESEND_EMAIL_URL,
      {
        from: process.env.EMAIL_FROM,
        to: [to],
        subject,
        html,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('\u2705 Email sent via Resend.');
    return true;
  } catch (error) {
    console.error('\u274C Resend email error:', safeErrorResponse(error));
    return false;
  }
};

const buildPasswordResetUrl = (token) => {
  const template = process.env.PASSWORD_RESET_URL_TEMPLATE?.trim();
  const configuredBase = process.env.PASSWORD_RESET_BASE_URL?.trim();
  const deploymentEnvironment = getDeploymentEnvironment(process.env);
  if (
    deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING
    && process.env.NODE_ENV !== 'production'
  ) {
    throw new Error('DEPLOYMENT_ENVIRONMENT=staging requires NODE_ENV=production');
  }

  if (process.env.NODE_ENV === 'production') {
    if (template) {
      throw new Error('PASSWORD_RESET_URL_TEMPLATE must be unset in production');
    }
    if (
      deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.PRODUCTION
      && configuredBase !== CANONICAL_PASSWORD_RESET_BASE_URL
    ) {
      throw new Error(
        `PASSWORD_RESET_BASE_URL must equal ${CANONICAL_PASSWORD_RESET_BASE_URL} in production`
      );
    }
    if (deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.STAGING) {
      validateStagingPasswordResetBaseUrl(configuredBase);
    }
  }

  const base = configuredBase || process.env.WEB_APP_URL?.trim() || 'https://menorah.me';
  const resetBase = template ? template.replace(/\{token\}/g, '') : base;
  return buildPasswordResetUrlFromBase(
    resetBase,
    token,
    deploymentEnvironment
  );
};

const validateStagingPasswordResetBaseUrl = (base) => {
  let parsedBase;
  try {
    parsedBase = new URL(base);
  } catch {
    throw new Error('PASSWORD_RESET_BASE_URL must be a valid HTTPS staging origin');
  }

  if (parsedBase.protocol !== 'https:') {
    throw new Error('PASSWORD_RESET_BASE_URL must use HTTPS in staging');
  }
  if (parsedBase.hostname.toLowerCase().replace(/\.$/, '') === 'app.menorah.me') {
    throw new Error(
      `PASSWORD_RESET_BASE_URL must not use the production origin ${CANONICAL_PASSWORD_RESET_BASE_URL} in staging`
    );
  }
  if (
    parsedBase.username
    || parsedBase.password
    || parsedBase.search
    || parsedBase.hash
    || parsedBase.port
    || base !== parsedBase.origin
  ) {
    throw new Error(
      'PASSWORD_RESET_BASE_URL must be an exact origin without credentials, path, port, query, or fragment'
    );
  }
};

// URL fragments are never sent in the HTTP request, keeping reset tokens out
// of reverse-proxy, CDN, and application access logs.
const buildPasswordResetUrlFromBase = (base, token, deploymentEnvironment) => {
  let parsedBase;
  try {
    parsedBase = new URL(base);
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    parsedBase = new URL('https://menorah.me');
  }
  if (process.env.NODE_ENV === 'production'
    && deploymentEnvironment === DEPLOYMENT_ENVIRONMENTS.PRODUCTION
    && parsedBase.origin !== CANONICAL_PASSWORD_RESET_BASE_URL) {
    throw new Error('Production password reset links must use the canonical mobile app origin');
  }

  const url = new URL('/reset-password', parsedBase);
  url.searchParams.delete('token');
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
};

const normalizeBaseUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
};

const localUrlFromPort = (value, fallbackPort) => {
  const port = String(value || '').match(/:(\d+)$/)?.[1] || fallbackPort;
  return port ? `http://localhost:${port}` : null;
};

const buildCounsellorAppUrl = (path = '/login') => {
  const base =
    normalizeBaseUrl(process.env.FRONTEND_COUNSELLOR_URL) ||
    normalizeBaseUrl(process.env.COUNSELLOR_WEB_BASE_URL) ||
    normalizeBaseUrl(process.env.COUNSELLOR_APP_URL) ||
    (process.env.COUNSELLOR_DOMAIN ? `https://${process.env.COUNSELLOR_DOMAIN}` : null) ||
    localUrlFromPort(process.env.WEB_APP_LOCAL_PORT) ||
    (process.env.NODE_ENV !== 'production' ? localUrlFromPort(process.env.WEB_APP_LOCAL_PORT, '18086') : null) ||
    'https://counsellor.menorah.me';

  return new URL(path, `${base.replace(/\/+$/, '')}/`).toString();
};

const layout = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${FROM_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr>
          <td style="background:linear-gradient(135deg,#3d9470 0%,#2d7a5c 100%);padding:28px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:0;">Menorah Health</h1>
            <p style="color:rgba(255,255,255,0.82);margin:4px 0 0;font-size:13px;">Your Mental Wellness Partner</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              &copy; ${new Date().getFullYear()} Menorah Health. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const otpEmailHtml = (otp, name = '') => {
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';

  return layout(`
    <h2 style="color:#111827;margin:0 0 16px;">${greeting}</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      Welcome to Menorah Health. Use the verification code below to complete your account setup.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <div style="display:inline-block;background:#f0f9f4;border:2px solid #2d7a5c;border-radius:12px;padding:20px 40px;">
        <p style="color:#2d7a5c;font-size:40px;font-weight:700;letter-spacing:12px;margin:0;font-family:'Courier New',monospace;">
          ${escapeHtml(otp)}
        </p>
      </div>
    </div>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 12px;">
      Enter this 6-digit code in the app. <strong>It expires in 10 minutes.</strong>
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      If you did not create a Menorah Health account, you can safely ignore this email.
    </p>
  `);
};

const sendOTPEmail = async (email, otp, name = '') => {
  return sendEmail(
    email,
    'Menorah Health \u2013 Email Verification',
    otpEmailHtml(otp, name)
  );
};

const sendVerificationEmail = async (email, code) => {
  return sendEmail(
    email,
    'Menorah Health \u2013 Email Verification',
    otpEmailHtml(code)
  );
};

const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = buildPasswordResetUrl(token);

  if (isDev) {
    console.log('[DEV PASSWORD RESET] Reset link generated; destination and token suppressed.');
  }

  const safeResetUrl = escapeHtml(resetUrl);
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 16px;">Reset your password</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      We received a request to reset your Menorah Health password. Use the secure link below to choose a new password.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${safeResetUrl}"
         style="background:#2d7a5c;color:#ffffff;text-decoration:none;border-radius:8px;padding:14px 24px;display:inline-block;font-weight:700;">
        Reset Password
      </a>
    </div>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 12px;word-break:break-word;">
      If the button does not work, open this link: <a href="${safeResetUrl}" style="color:#2d7a5c;">${safeResetUrl}</a>
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      If you did not request a password reset, you can safely ignore this email. Your password will not change.
    </p>
  `);

  return sendEmail(email, 'Reset Your Menorah Health Password', html);
};

const sendCounsellorApprovalEmail = async ({ email, name = '', activationToken }) => {
  const activationUrl = buildPasswordResetUrl(activationToken);
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const safeActivationUrl = escapeHtml(activationUrl);

  const html = layout(`
    <h2 style="color:#111827;margin:0 0 16px;">${greeting}</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 20px;">
      Your Menorah counsellor application has been approved. Set a password using the secure, one-time link below.
    </p>
    <div style="text-align:center;margin:28px 0 18px;">
      <a href="${safeActivationUrl}"
         style="background:#2d7a5c;color:#ffffff;text-decoration:none;border-radius:8px;padding:14px 24px;display:inline-block;font-weight:700;">
        Set Password
      </a>
    </div>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 12px;">
      This link expires soon and can only be used once. Your sign-in email is ${escapeHtml(email)}.
    </p>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 12px;word-break:break-word;">
      If the button does not work, open this link: <a href="${safeActivationUrl}" style="color:#2d7a5c;">${safeActivationUrl}</a>
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      If you were not expecting this email, contact Menorah support.
    </p>
  `);

  return sendEmail(email, 'Set up your Menorah counsellor account', html);
};

const sendCounsellorReverificationEmail = async ({ email, name = '', invitationToken }) => {
  const invitationUrl = new URL(buildCounsellorAppUrl('/register'));
  invitationUrl.hash = `reverificationToken=${encodeURIComponent(invitationToken)}`;
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const safeInvitationUrl = escapeHtml(invitationUrl.toString());

  const html = layout(`
    <h2 style="color:#111827;margin:0 0 16px;">${greeting}</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 20px;">
      A Menorah administrator invited you to submit a fresh professional verification application.
      Your professional access remains disabled until a new review is completed.
    </p>
    <div style="text-align:center;margin:28px 0 18px;">
      <a href="${safeInvitationUrl}"
         style="background:#2d7a5c;color:#ffffff;text-decoration:none;border-radius:8px;padding:14px 24px;display:inline-block;font-weight:700;">
        Submit Fresh Application
      </a>
    </div>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 12px;">
      The one-time link expires in 24 hours. You must review and accept the current onboarding notice
      yourself; an administrator cannot do that for you.
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      If you were not expecting this invitation, do not use the link and contact Menorah support.
    </p>
  `);

  return sendEmail(email, 'Menorah counsellor re-verification invitation', html);
};

const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  const { scheduledAt, sessionDuration, sessionType, counsellorName } = bookingDetails;
  const date = new Date(scheduledAt);
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = layout(`
    <h2 style="color:#111827;margin:0 0 8px;">Booking Confirmed</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">Your session has been confirmed. Here are your details:</p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin:0 0 24px;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Counsellor</span><br>
        <strong style="color:#111827;">${escapeHtml(counsellorName)}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Date &amp; Time</span><br>
        <strong style="color:#111827;">${escapeHtml(dateStr)} at ${escapeHtml(timeStr)}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Duration</span><br>
        <strong style="color:#111827;">${escapeHtml(sessionDuration)} minutes</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <span style="color:#9ca3af;font-size:13px;">Session Type</span><br>
        <strong style="color:#111827;text-transform:capitalize;">${escapeHtml(sessionType)}</strong>
      </td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px;margin:0;">
      Please join your session 5 minutes early. You can cancel at least 24 hours before.
    </p>
  `);

  return sendEmail(email, 'Booking Confirmed \u2013 Menorah Health', html);
};

const sendSessionReminderEmail = async (email, sessionDetails) => {
  const { scheduledAt, sessionDuration, sessionType, counsellorName } = sessionDetails;
  const date = new Date(scheduledAt);
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = layout(`
    <h2 style="color:#111827;margin:0 0 8px;">Session Reminder</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      Friendly reminder about your upcoming session:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin:0 0 24px;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Counsellor</span><br>
        <strong style="color:#111827;">${escapeHtml(counsellorName)}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Date &amp; Time</span><br>
        <strong style="color:#111827;">${escapeHtml(dateStr)} at ${escapeHtml(timeStr)}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <span style="color:#9ca3af;font-size:13px;">Session Type</span><br>
        <strong style="color:#111827;text-transform:capitalize;">${escapeHtml(sessionType)} &middot; ${escapeHtml(sessionDuration)} min</strong>
      </td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px;margin:0;">
      Ensure you have a stable internet connection and are in a quiet, private space.
    </p>
  `);

  return sendEmail(email, 'Session Reminder \u2013 Menorah Health', html);
};

module.exports = {
  buildPasswordResetUrl,
  buildCounsellorAppUrl,
  sendOTPEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendCounsellorApprovalEmail,
  sendCounsellorReverificationEmail,
  sendBookingConfirmationEmail,
  sendSessionReminderEmail,
};
