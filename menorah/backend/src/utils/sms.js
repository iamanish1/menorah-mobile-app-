const axios = require('axios');

const MSG91_BASE = 'https://control.msg91.com/api/v5';
const AUTH_KEY = () => process.env.MSG91_AUTH_KEY;
const OTP_TEMPLATE_ID = () => process.env.MSG91_OTP_TEMPLATE_ID;
const SMS_TEMPLATE_ID = () => process.env.MSG91_SMS_TEMPLATE_ID;

// Trigger OTP — MSG91 generates, sends, and manages expiry. We never store it.
const sendOTP = async (mobile) => {
  if (!AUTH_KEY() || !OTP_TEMPLATE_ID()) {
    console.warn('MSG91 not configured. OTP not sent.');
    return { success: false, error: 'MSG91 not configured' };
  }
  try {
    const { data } = await axios.post(
      `${MSG91_BASE}/otp?template_id=${OTP_TEMPLATE_ID()}&mobile=${mobile}&authkey=${AUTH_KEY()}`,
      {},
      { headers: { 'Content-Type': 'application/json' } }
    );
    return { success: data.type === 'success', raw: data };
  } catch (err) {
    console.error('MSG91 sendOTP error:', err.response?.data ?? err.message);
    return { success: false, error: err.message };
  }
};

// Verify OTP submitted by user
const verifyOTP = async (mobile, otp) => {
  if (!AUTH_KEY()) return { success: false, error: 'MSG91 not configured' };
  try {
    const { data } = await axios.post(
      `${MSG91_BASE}/otp/verify?mobile=${mobile}&otp=${otp}&authkey=${AUTH_KEY()}`,
      {},
      { headers: { 'Content-Type': 'application/json' } }
    );
    return { success: data.type === 'success', raw: data };
  } catch (err) {
    console.error('MSG91 verifyOTP error:', err.response?.data ?? err.message);
    return { success: false, error: err.message };
  }
};

// Resend OTP
const resendOTP = async (mobile, retrytype = 'text') => {
  if (!AUTH_KEY()) return { success: false, error: 'MSG91 not configured' };
  try {
    const { data } = await axios.post(
      `${MSG91_BASE}/otp/retry?mobile=${mobile}&authkey=${AUTH_KEY()}&retrytype=${retrytype}`,
      {},
      { headers: { 'Content-Type': 'application/json' } }
    );
    return { success: data.type === 'success', raw: data };
  } catch (err) {
    console.error('MSG91 resendOTP error:', err.response?.data ?? err.message);
    return { success: false, error: err.message };
  }
};

// Generic transactional SMS via MSG91 flow API (session reminders, cancellations etc.)
const sendSMS = async (to, message) => {
  if (!AUTH_KEY()) {
    console.warn('MSG91 not configured. SMS not sent.');
    return { success: false, error: 'MSG91 not configured' };
  }
  try {
    const { data } = await axios.post(
      `${MSG91_BASE}/flow/`,
      {
        template_id: SMS_TEMPLATE_ID(),
        recipients: [{ mobiles: to, message }],
      },
      { headers: { authkey: AUTH_KEY(), 'Content-Type': 'application/json' } }
    );
    return { success: true, raw: data };
  } catch (err) {
    console.error('MSG91 sendSMS error:', err.response?.data ?? err.message);
    return { success: false, error: err.message };
  }
};

const sendVerificationSMS = (phone) => sendOTP(phone);

const sendBookingConfirmationSMS = (phone, details) =>
  sendSMS(phone, `Your session with ${details.counsellorName} on ${new Date(details.scheduledAt).toLocaleString()} is confirmed.`);

const sendCancellationSMS = (phone, details) =>
  sendSMS(phone, `Your session with ${details.counsellorName} on ${new Date(details.scheduledAt).toLocaleString()} has been cancelled.`);

const sendSessionReminderSMS = (phone, details) =>
  sendSMS(phone, `Reminder: Session with ${details.counsellorName} at ${new Date(details.scheduledAt).toLocaleString()}.`);

const sendReschedulingSMS = (phone, oldSession, newSession) =>
  sendSMS(phone, `Your session has been rescheduled from ${new Date(oldSession.scheduledAt).toLocaleString()} to ${new Date(newSession.scheduledAt).toLocaleString()}.`);

const sendEmergencySMS = (phone, userDetails) =>
  sendSMS(phone, `Emergency: ${userDetails.fullName} has requested immediate assistance. Please contact them at ${userDetails.phone}.`);

// ── Email OTP via MSG91 Email OTP API ──────────────────────────────────────
const MSG91_EMAIL_BASE = 'https://control.msg91.com/api/v5/email';

const sendEmailOTP = async (email, name = 'User') => {
  if (!AUTH_KEY()) {
    console.warn('MSG91 not configured. Email OTP not sent.');
    return { success: false, error: 'MSG91 not configured' };
  }
  try {
    const { data } = await axios.post(
      `${MSG91_EMAIL_BASE}/otp`,
      { to: [{ name, email }], otp_length: 6, otp_expiry: 10 },
      { headers: { authkey: AUTH_KEY(), 'Content-Type': 'application/json' } }
    );
    return { success: data.type === 'success', raw: data };
  } catch (err) {
    console.error('MSG91 sendEmailOTP error:', err.response?.data ?? err.message);
    return { success: false, error: err.message };
  }
};

const verifyEmailOTP = async (email, otp) => {
  if (!AUTH_KEY()) return { success: false, error: 'MSG91 not configured' };
  try {
    const { data } = await axios.get(
      `${MSG91_EMAIL_BASE}/otp/verify`,
      { params: { email, otp }, headers: { authkey: AUTH_KEY() } }
    );
    return { success: data.type === 'success', raw: data };
  } catch (err) {
    console.error('MSG91 verifyEmailOTP error:', err.response?.data ?? err.message);
    return { success: false, error: err.message };
  }
};

const resendEmailOTP = async (email) => {
  if (!AUTH_KEY()) return { success: false, error: 'MSG91 not configured' };
  try {
    const { data } = await axios.post(
      `${MSG91_EMAIL_BASE}/otp/resend`,
      { email },
      { headers: { authkey: AUTH_KEY(), 'Content-Type': 'application/json' } }
    );
    return { success: data.type === 'success', raw: data };
  } catch (err) {
    console.error('MSG91 resendEmailOTP error:', err.response?.data ?? err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP,
  sendSMS,
  sendEmailOTP,
  verifyEmailOTP,
  resendEmailOTP,
  sendVerificationSMS,
  sendBookingConfirmationSMS,
  sendCancellationSMS,
  sendSessionReminderSMS,
  sendReschedulingSMS,
  sendEmergencySMS,
};
