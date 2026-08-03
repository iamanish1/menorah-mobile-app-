const SMS_DISABLED_MESSAGE = 'SMS is disabled; Menorah uses Resend email for production verification and notifications.';

const disabledSmsResult = async () => ({
  success: false,
  error: SMS_DISABLED_MESSAGE,
  disabled: true,
});

const sendOTP = disabledSmsResult;
const verifyOTP = disabledSmsResult;
const resendOTP = disabledSmsResult;
const sendSMS = disabledSmsResult;

const sendVerificationSMS = (phone) => sendOTP(phone);

const sendBookingConfirmationSMS = (phone, details) =>
  sendSMS(
    phone,
    `Your session with ${details.counsellorName} on ${new Date(details.scheduledAt).toLocaleString()} is confirmed.`
  );

const sendCancellationSMS = (phone, details) =>
  sendSMS(
    phone,
    `Your session with ${details.counsellorName} on ${new Date(details.scheduledAt).toLocaleString()} has been cancelled.`
  );

const sendSessionReminderSMS = (phone, details) =>
  sendSMS(
    phone,
    `Reminder: Session with ${details.counsellorName} at ${new Date(details.scheduledAt).toLocaleString()}.`
  );

const sendReschedulingSMS = (phone, oldSession, newSession) =>
  sendSMS(
    phone,
    `Your session has been rescheduled from ${new Date(oldSession.scheduledAt).toLocaleString()} to ${new Date(newSession.scheduledAt).toLocaleString()}.`
  );

const sendEmergencySMS = (phone, userDetails) =>
  sendSMS(
    phone,
    `Emergency: ${userDetails.fullName} has requested immediate assistance. Please contact them at ${userDetails.phone}.`
  );

module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP,
  sendSMS,
  sendVerificationSMS,
  sendBookingConfirmationSMS,
  sendCancellationSMS,
  sendSessionReminderSMS,
  sendReschedulingSMS,
  sendEmergencySMS,
};
