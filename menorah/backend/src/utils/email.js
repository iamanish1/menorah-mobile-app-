const axios = require('axios');

const MSG91_EMAIL_URL = 'https://control.msg91.com/api/v5/email/send';

const FROM_EMAIL = process.env.EMAIL_FROM    || 'noreply@menorahhealth.app';
const FROM_NAME  = 'Menorah Health';
const DOMAIN     = process.env.MSG91_EMAIL_DOMAIN || 'menorahhealth.app';

const isConfigured = () => {
  if (!process.env.MSG91_AUTH_KEY || process.env.MSG91_AUTH_KEY.startsWith('REPLACE_')) {
    console.error('❌ MSG91_AUTH_KEY is not set. Email sending is disabled.');
    return false;
  }
  return true;
};

const isDev = process.env.NODE_ENV !== 'production';

// ─── Core send helper ─────────────────────────────────────────────────────
const sendEmail = async (to, subject, html, toName = '') => {
  // In development, log the email to console instead of sending
  if (isDev) {
    console.log('\n📧 ─── DEV EMAIL (not sent) ───────────────────────');
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   (HTML content suppressed — check reset link below if applicable)`);
    console.log('──────────────────────────────────────────────────\n');
    return true;
  }

  if (!isConfigured()) return false;

  const templateId = process.env.MSG91_EMAIL_TEMPLATE_ID;
  if (!templateId || templateId.startsWith('REPLACE_')) {
    console.error('❌ MSG91_EMAIL_TEMPLATE_ID is not set. Email sending is disabled.');
    return false;
  }

  try {
    const { data } = await axios.post(
      MSG91_EMAIL_URL,
      {
        template_id: templateId,
        recipients: [{
          to: [{ email: to, name: toName || to }],
          variables: { body: html, subject },
        }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        domain: DOMAIN,
      },
      {
        headers: {
          authkey: process.env.MSG91_AUTH_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    const success = !data?.hasError && (data?.type === 'success' || data?.status === 'success' || data?.message === 'Email queued successfully');
    if (success) {
      console.log(`✅ Email sent via MSG91 to: ${to}`);
    } else {
      console.error('❌ MSG91 email error:', data);
    }
    return success;
  } catch (error) {
    console.error('❌ MSG91 email error:', error.response?.data ?? error.message);
    return false;
  }
};

// ─── Reset URL builder ────────────────────────────────────────────────────
const buildPasswordResetUrl = (token) => {
  const template  = process.env.PASSWORD_RESET_URL_TEMPLATE?.trim();
  const base      = process.env.PASSWORD_RESET_BASE_URL?.trim();
  const apiBase   = process.env.API_BASE_URL?.trim();
  const scheme    = process.env.MOBILE_APP_SCHEME?.trim() || 'menorah-health://reset-password';

  if (template) {
    return template.includes('{token}')
      ? template.replace('{token}', encodeURIComponent(token))
      : `${template.replace(/\/+$/, '')}?token=${encodeURIComponent(token)}`;
  }
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(token)}`;
  }
  if (apiBase && !/localhost|127\.0\.0\.1/i.test(apiBase)) {
    const cleanBase = apiBase.replace(/\/+$/, '').replace(/\/api$/i, '');
    return `${cleanBase}/api/auth/reset-password?token=${encodeURIComponent(token)}`;
  }
  const sep = scheme.includes('?') ? '&' : '?';
  return `${scheme}${sep}token=${encodeURIComponent(token)}`;
};

// ─── Shared HTML wrapper ──────────────────────────────────────────────────
const layout = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr>
          <td style="background:linear-gradient(135deg,#3d9470 0%,#2d7a5c 100%);padding:28px 32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:0.5px;">Menorah Health</h1>
            <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Your Mental Wellness Partner</p>
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
              © ${new Date().getFullYear()} Menorah Health. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── Email: Verification code ─────────────────────────────────────────────
const sendVerificationEmail = async (email, code) => {
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 16px;">Welcome to Menorah Health!</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      Thank you for signing up. Enter the code below to verify your email address.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <div style="display:inline-block;background:#f0f9f4;border:2px solid #2d7a5c;border-radius:12px;padding:20px 40px;">
        <p style="color:#2d7a5c;font-size:40px;font-weight:700;letter-spacing:12px;margin:0;font-family:'Courier New',monospace;">
          ${code}
        </p>
      </div>
    </div>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 12px;">
      Enter this 6-digit code in the app. <strong>It expires in 10 minutes.</strong>
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      If you didn't create a Menorah Health account, you can safely ignore this email.
    </p>
  `);
  return sendEmail(email, 'Verify Your Email – Menorah Health', html);
};

// ─── Email: Password reset ────────────────────────────────────────────────
const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = buildPasswordResetUrl(token);

  // Always log links in dev for easy testing
  if (isDev) {
    const scheme = process.env.MOBILE_APP_SCHEME?.trim() || 'menorah-health://reset-password';
    const sep = scheme.includes('?') ? '&' : '?';
    const deepLink = `${scheme}${sep}token=${encodeURIComponent(token)}`;
    console.log('\n🔑 ─── DEV PASSWORD RESET ────────────────────────');
    console.log(`   Email:     ${email}`);
    console.log(`   HTTP link: ${resetUrl}`);
    console.log(`   Deep link: ${deepLink}`);
    console.log(`   ↑ Paste the deep link in your phone browser (APK must be installed)`);
    console.log('──────────────────────────────────────────────────\n');
  }

  // Production: use dedicated MSG91 template with {{reset_link}} variable
  const templateId = process.env.MSG91_EMAIL_TEMPLATE_ID;
  if (!templateId || templateId.startsWith('REPLACE_')) {
    console.error('❌ MSG91_EMAIL_TEMPLATE_ID not set');
    return false;
  }
  if (!isConfigured()) return false;

  try {
    const { data } = await axios.post(
      MSG91_EMAIL_URL,
      {
        template_id: templateId,
        recipients: [{
          to: [{ email, name: email }],
          variables: { reset_link: resetUrl },
        }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        domain: DOMAIN,
      },
      { headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' } }
    );
    const success = !data?.hasError && (data?.type === 'success' || data?.status === 'success');
    if (success) console.log(`✅ Password reset email sent to: ${email}`);
    else console.error('❌ MSG91 password reset email error:', data);
    return success;
  } catch (err) {
    console.error('❌ MSG91 password reset email error:', err.response?.data ?? err.message);
    return false;
  }
};

// ─── Email: Booking confirmation ──────────────────────────────────────────
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  const { scheduledAt, sessionDuration, sessionType, counsellorName } = bookingDetails;
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 8px;">Booking Confirmed ✓</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">Your session has been confirmed. Here are your details:</p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin:0 0 24px;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Counsellor</span><br>
        <strong style="color:#111827;">${counsellorName}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Date &amp; Time</span><br>
        <strong style="color:#111827;">${dateStr} at ${timeStr}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Duration</span><br>
        <strong style="color:#111827;">${sessionDuration} minutes</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <span style="color:#9ca3af;font-size:13px;">Session Type</span><br>
        <strong style="color:#111827;text-transform:capitalize;">${sessionType}</strong>
      </td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px;margin:0;">
      Please join your session 5 minutes early. You can cancel at least 24 hours before.
    </p>
  `);
  return sendEmail(email, 'Booking Confirmed – Menorah Health', html);
};

// ─── Email: Session reminder ──────────────────────────────────────────────
const sendSessionReminderEmail = async (email, sessionDetails) => {
  const { scheduledAt, sessionDuration, sessionType, counsellorName } = sessionDetails;
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 8px;">Session Reminder</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      Friendly reminder about your upcoming session:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin:0 0 24px;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Counsellor</span><br>
        <strong style="color:#111827;">${counsellorName}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;font-size:13px;">Date &amp; Time</span><br>
        <strong style="color:#111827;">${dateStr} at ${timeStr}</strong>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <span style="color:#9ca3af;font-size:13px;">Session Type</span><br>
        <strong style="color:#111827;text-transform:capitalize;">${sessionType} · ${sessionDuration} min</strong>
      </td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px;margin:0;">
      Ensure you have a stable internet connection and are in a quiet, private space.
    </p>
  `);
  return sendEmail(email, 'Session Reminder – Menorah Health', html);
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendBookingConfirmationEmail,
  sendSessionReminderEmail,
};
