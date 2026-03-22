const nodemailer = require('nodemailer');

const buildPasswordResetUrl = (token) => {
  const configuredTemplate = process.env.PASSWORD_RESET_URL_TEMPLATE?.trim();
  const configuredBaseUrl = process.env.PASSWORD_RESET_BASE_URL?.trim();
  const apiBaseUrl = process.env.API_BASE_URL?.trim();
  const appScheme = process.env.MOBILE_APP_SCHEME?.trim() || 'menorah-health://reset-password';

  if (configuredTemplate) {
    return configuredTemplate.includes('{token}')
      ? configuredTemplate.replace('{token}', encodeURIComponent(token))
      : `${configuredTemplate.replace(/\/+$/, '')}?token=${encodeURIComponent(token)}`;
  }

  if (configuredBaseUrl) {
    const separator = configuredBaseUrl.includes('?') ? '&' : '?';
    return `${configuredBaseUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  if (apiBaseUrl && !/localhost|127\.0\.0\.1/i.test(apiBaseUrl)) {
    const normalizedApiBaseUrl = apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
    return `${normalizedApiBaseUrl}/api/auth/reset-password?token=${encodeURIComponent(token)}`;
  }

  const separator = appScheme.includes('?') ? '&' : '?';
  return `${appScheme}${separator}token=${encodeURIComponent(token)}`;
};

// Create transporter
const createTransporter = () => {
  // Validate SMTP configuration
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ SMTP configuration is missing!');
    console.error('Missing variables:', {
      SMTP_HOST: !process.env.SMTP_HOST ? 'MISSING' : 'OK',
      SMTP_PORT: !process.env.SMTP_PORT ? 'MISSING' : 'OK',
      SMTP_USER: !process.env.SMTP_USER ? 'MISSING' : 'OK',
      SMTP_PASS: !process.env.SMTP_PASS ? 'MISSING' : 'OK',
      EMAIL_FROM: !process.env.EMAIL_FROM ? 'MISSING' : 'OK'
    });
    throw new Error('SMTP configuration is missing');
  }

  const port = parseInt(process.env.SMTP_PORT);
  const isSecure = port === 465;
  const useTLS = port === 587;

  console.log('📧 Creating SMTP transporter with config:', {
    host: process.env.SMTP_HOST,
    port: port,
    secure: isSecure,
    tls: useTLS,
    user: process.env.SMTP_USER,
    from: process.env.EMAIL_FROM
  });

  const transporterConfig = {
    host: process.env.SMTP_HOST,
    port: port,
    secure: isSecure, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Connection timeout and retry options
    connectionTimeout: 15000, // 15 seconds
    greetingTimeout: 15000,
    socketTimeout: 15000,
    // TLS options for port 587
    ...(useTLS && {
      requireTLS: true,
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates in development
      }
    })
  };

  return nodemailer.createTransporter(transporterConfig);
};

// Send verification email
const sendVerificationEmail = async (email, code) => {
  let transporter;
  try {
    console.log('📧 Attempting to send verification email...');
    console.log('Recipient:', email);
    console.log('Verification code:', code);
    
    transporter = createTransporter();
    
    // Test connection first (but don't fail if it doesn't work)
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified successfully');
    } catch (verifyError) {
      console.warn('⚠️ SMTP verification failed, but continuing anyway:', verifyError.message);
      // Continue anyway - some SMTP servers don't support verify()
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Verify Your Email - Menorah Health',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Menorah Health</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Welcome to Menorah Health!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Thank you for registering with Menorah Health. To complete your registration and start your wellness journey, please verify your email address using the code below.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background: white; padding: 20px; border-radius: 10px; display: inline-block; border: 2px solid #667eea;">
                <p style="color: #667eea; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">
                  ${code}
                </p>
              </div>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Enter this 6-digit code in the Menorah Health app to verify your email address.
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              <strong>This code will expire in 10 minutes</strong> for security reasons.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 14px; text-align: center;">
              If you didn't create an account with Menorah Health, please ignore this email.
            </p>
          </div>
        </div>
      `
    };

    console.log('📤 Sending email...');
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Verification email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('Email sent to:', email);
    
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error command:', error.command);
    console.error('Error response:', error.response);
    
    // Provide specific error messages for common issues
    if (error.code === 'EAUTH') {
      console.error('');
      console.error('🔐 SMTP AUTHENTICATION FAILED');
      console.error('This usually means:');
      console.error('  1. Your SMTP_USER or SMTP_PASS is incorrect');
      console.error('  2. For Gmail: You need to use an App Password, not your regular password');
      console.error('  3. For Gmail: Enable 2-factor authentication and generate an App Password');
      console.error('');
      console.error('Gmail App Password setup:');
      console.error('  1. Go to https://myaccount.google.com/apppasswords');
      console.error('  2. Generate a new App Password');
      console.error('  3. Use that 16-character password as SMTP_PASS');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      console.error('');
      console.error('🔌 SMTP CONNECTION FAILED');
      console.error('This usually means:');
      console.error('  1. Your SMTP_HOST is incorrect');
      console.error('  2. Your SMTP_PORT is incorrect');
      console.error('  3. Firewall is blocking the connection');
      console.error('  4. Check your internet connection');
    } else if (error.code === 'EENVELOPE') {
      console.error('');
      console.error('✉️ EMAIL ENVELOPE ERROR');
      console.error('This usually means:');
      console.error('  1. EMAIL_FROM is missing or invalid');
      console.error('  2. Recipient email address is invalid');
    } else {
      console.error('');
      console.error('🔍 Full error stack:', error.stack);
    }
    
    return false;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, token) => {
  try {
    const transporter = createTransporter();
    const resetUrl = buildPasswordResetUrl(token);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Reset Your Password - Menorah Health',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Menorah Health</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              We received a request to reset your password for your Menorah Health account. Tap the button below to open the app and create a new password.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 5px; 
                        display: inline-block;
                        font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              If the button doesn't work, copy and paste this link into your phone browser:
            </p>
            
            <p style="color: #667eea; word-break: break-all; margin-bottom: 20px;">
              ${resetUrl}
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              This link will expire in 10 minutes for security reasons.
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 14px; text-align: center;">
              For security reasons, this link can only be used once.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

// Send booking confirmation email
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Booking Confirmed - Menorah Health',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Menorah Health</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Booking Confirmed!</h2>
            
            <div style="background: white; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
              <h3 style="color: #333; margin-bottom: 15px;">Session Details</h3>
              <p><strong>Date:</strong> ${new Date(bookingDetails.scheduledAt).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${new Date(bookingDetails.scheduledAt).toLocaleTimeString()}</p>
              <p><strong>Duration:</strong> ${bookingDetails.sessionDuration} minutes</p>
              <p><strong>Type:</strong> ${bookingDetails.sessionType}</p>
              <p><strong>Counsellor:</strong> ${bookingDetails.counsellorName}</p>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Your session has been confirmed. Please join the session 5 minutes before the scheduled time.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 14px; text-align: center;">
              Need to reschedule? Please contact us at least 24 hours before your session.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Booking confirmation email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending booking confirmation email:', error);
    return false;
  }
};

// Send session reminder email
const sendSessionReminderEmail = async (email, sessionDetails) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Session Reminder - Menorah Health',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Menorah Health</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Session Reminder</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              This is a friendly reminder about your upcoming session with Menorah Health.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
              <h3 style="color: #333; margin-bottom: 15px;">Session Details</h3>
              <p><strong>Date:</strong> ${new Date(sessionDetails.scheduledAt).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${new Date(sessionDetails.scheduledAt).toLocaleTimeString()}</p>
              <p><strong>Duration:</strong> ${sessionDetails.sessionDuration} minutes</p>
              <p><strong>Type:</strong> ${sessionDetails.sessionType}</p>
              <p><strong>Counsellor:</strong> ${sessionDetails.counsellorName}</p>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Please ensure you have a stable internet connection and are in a quiet, private space for your session.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 14px; text-align: center;">
              If you need to reschedule, please contact us immediately.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Session reminder email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending session reminder email:', error);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendBookingConfirmationEmail,
  sendSessionReminderEmail
};
