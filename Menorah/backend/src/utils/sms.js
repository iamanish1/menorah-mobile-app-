const twilio = require('twilio');

// Lazy initialization of Twilio client
let client = null;

const getTwilioClient = () => {
  // Check if Twilio credentials are configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return null;
  }

  // Initialize client only if not already initialized
  if (!client) {
    try {
      client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    } catch (error) {
      console.error('Error initializing Twilio client:', error);
      return null;
    }
  }

  return client;
};

// Send SMS
const sendSMS = async (to, message) => {
  try {
    const twilioClient = getTwilioClient();
    
    // If Twilio is not configured, log warning and return failure
    if (!twilioClient) {
      console.warn('⚠️ Twilio is not configured. SMS sending is disabled.');
      console.warn('To enable SMS, set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env');
      return {
        success: false,
        error: 'Twilio is not configured'
      };
    }

    if (!process.env.TWILIO_PHONE_NUMBER) {
      console.warn('⚠️ TWILIO_PHONE_NUMBER is not set');
      return {
        success: false,
        error: 'Twilio phone number is not configured'
      };
    }

    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    console.log('SMS sent successfully:', result.sid);
    return {
      success: true,
      messageId: result.sid
    };
  } catch (error) {
    console.error('Error sending SMS:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Send verification code via SMS
const sendVerificationSMS = async (phone, code) => {
  const message = `Your Menorah Health verification code is: ${code}. This code will expire in 10 minutes.`;
  return await sendSMS(phone, message);
};

// Send session reminder SMS
const sendSessionReminderSMS = async (phone, sessionDetails) => {
  const message = `Reminder: Your Menorah Health session with ${sessionDetails.counsellorName} is scheduled for ${new Date(sessionDetails.scheduledAt).toLocaleString()}. Please join 5 minutes early.`;
  return await sendSMS(phone, message);
};

// Send booking confirmation SMS
const sendBookingConfirmationSMS = async (phone, bookingDetails) => {
  const message = `Your Menorah Health session with ${bookingDetails.counsellorName} has been confirmed for ${new Date(bookingDetails.scheduledAt).toLocaleString()}. You will receive a reminder 1 hour before.`;
  return await sendSMS(phone, message);
};

// Send cancellation notification SMS
const sendCancellationSMS = async (phone, sessionDetails) => {
  const message = `Your Menorah Health session with ${sessionDetails.counsellorName} scheduled for ${new Date(sessionDetails.scheduledAt).toLocaleString()} has been cancelled. Please contact support if you have any questions.`;
  return await sendSMS(phone, message);
};

// Send rescheduling notification SMS
const sendReschedulingSMS = async (phone, oldSession, newSession) => {
  const message = `Your Menorah Health session has been rescheduled from ${new Date(oldSession.scheduledAt).toLocaleString()} to ${new Date(newSession.scheduledAt).toLocaleString()}.`;
  return await sendSMS(phone, message);
};

// Send emergency contact SMS
const sendEmergencySMS = async (phone, userDetails) => {
  const message = `Emergency: ${userDetails.fullName} has requested immediate assistance. Please contact them at ${userDetails.phone} or respond to this message.`;
  return await sendSMS(phone, message);
};

module.exports = {
  sendSMS,
  sendVerificationSMS,
  sendSessionReminderSMS,
  sendBookingConfirmationSMS,
  sendCancellationSMS,
  sendReschedulingSMS,
  sendEmergencySMS
};
