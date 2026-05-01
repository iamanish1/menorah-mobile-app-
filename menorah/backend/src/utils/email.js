const sgMail = require('@sendgrid/mail');

// ─── Initialisation ────────────────────────────────────────────────────────
let initialised = false;

const initSendGrid = () => {
  if (initialised) return true;
  if (!process.env.SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY is not set. Email sending is disabled.');
    return false;
  }
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  initialised = true;
  return true;
};

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@menorahhealth.app';
const FROM_NAME  = 'Menorah Health';

// ─── Shared send helper ────────────────────────────────────────────────────
const sendEmail = async (to, subject, html) => {
  if (!initSendGrid()) return false;
  try {
    await sgMail.send({ from: { email: FROM_EMAIL, name: FROM_NAME }, to, subject, html });
    console.log(`✅ Email sent via SendGrid to: ${to}`);
    return true;
  } catch (error) {
    const body = error.response?.body;
    console.error('❌ SendGrid error:', body ?? error.message);
    return false;
  }
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const buildPasswordResetUrl = (token) => {
  const configuredTemplate = process.env.PASSWORD_RESET_URL_TEMPLATE?.trim();
  const configuredBaseUrl  = process.env.PASSWORD_RESET_BASE_URL?.trim();
  const apiBaseUrl         = process.env.API_BASE_URL?.trim();
  const appScheme          = process.env.MOBILE_APP_SCHEME?.trim() || 'menorah-health://reset-password';

  if (configuredTemplate) {
    return configuredTemplate.includes('{token}')
      ? configuredTemplate.replace('{token}', encodeURIComponent(token))
      : `${configuredTemplate.replace(/\/+$/, '')}?token=${encodeURIComponent(token)}`;
  }
  if (configuredBaseUrl) {
    const sep = configuredBaseUrl.includes('?') ? '&' : '?';
    return `${configuredBaseUrl}${sep}token=${encodeURIComponent(token)}`;
  }
  if (apiBaseUrl && !/localhost|127\.0\.0\.1/i.test(apiBaseUrl)) {
    const base = apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
    return `${base}/api/auth/reset-password?token=${encodeURIComponent(token)}`;
  }
  const sep = appScheme.includes('?') ? '&' : '?';
  return `${appScheme}${sep}token=${encodeURIComponent(token)}`;
};

// ─── Shared HTML wrapper ────────────────────────────────────────────────────
const layout = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr>
          <td style="background:linear-gradient(135deg,#3d9470 0%,#2d7055 100%);padding:28px 32px;text-align:center;">
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

// ─── Email: Verification code ──────────────────────────────────────────────
const sendVerificationEmail = async (email, code) => {
  console.log(`📧 Sending verification email to ${email} (code: ${code})`);
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 16px;">Welcome to Menorah Health!</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      Thank you for signing up. Enter the code below to verify your email address and complete your registration.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #3d9470;border-radius:12px;padding:20px 40px;">
        <p style="color:#3d9470;font-size:40px;font-weight:700;letter-spacing:12px;margin:0;font-family:'Courier New',monospace;">
          ${code}
        </p>
      </div>
    </div>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 12px;">
      Enter this 6-digit code in the app to verify your email address.
      <strong>It expires in 10 minutes.</strong>
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      If you didn't create a Menorah Health account, you can safely ignore this email.
    </p>
  `);
  return sendEmail(email, 'Verify Your Email – Menorah Health', html);
};

// ─── Email: Password reset ─────────────────────────────────────────────────
const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = buildPasswordResetUrl(token);
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 16px;">Password Reset Request</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      We received a request to reset your Menorah Health account password.
      Tap the button below to open the app and create a new password.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${resetUrl}"
         style="background:#3d9470;color:#fff;padding:14px 32px;text-decoration:none;
                border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
        Reset Password
      </a>
    </div>
    <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="color:#3d9470;font-size:13px;word-break:break-all;margin:0 0 24px;">${resetUrl}</p>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 8px;">
      This link expires in <strong>10 minutes</strong> and can only be used once.
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      If you didn't request a password reset, your password is safe — no action needed.
    </p>
  `);
  return sendEmail(email, 'Reset Your Password – Menorah Health', html);
};

// ─── Email: Booking confirmation ───────────────────────────────────────────
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  const { scheduledAt, sessionDuration, sessionType, counsellorName } = bookingDetails;
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 8px;">Booking Confirmed ✓</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      Great news! Your session has been confirmed. Here are your session details:
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
      Please join your session 5 minutes early. Need to cancel? You can do so at least 24 hours before your session.
    </p>
  `);
  return sendEmail(email, 'Booking Confirmed – Menorah Health', html);
};

// ─── Email: Session reminder ───────────────────────────────────────────────
const sendSessionReminderEmail = async (email, sessionDetails) => {
  const { scheduledAt, sessionDuration, sessionType, counsellorName } = sessionDetails;
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const html = layout(`
    <h2 style="color:#111827;margin:0 0 8px;">Session Reminder</h2>
    <p style="color:#6b7280;line-height:1.6;margin:0 0 24px;">
      This is a friendly reminder about your upcoming Menorah Health session.
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
      Please ensure you have a stable internet connection and are in a quiet, private space.
      If you need to reschedule, please contact us immediately.
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
