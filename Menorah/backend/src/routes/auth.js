const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { sendSMS } = require('../utils/sms');

const router = express.Router();

// Generate JWT Token
const generateToken = (userId, role = 'user', fullName = '') => {
  return jwt.sign({ userId, role, fullName }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone').matches(/^\+[1-9]\d{1,14}$/).withMessage('Please provide a valid phone number with country code (e.g., +1234567890)'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('dateOfBirth').isISO8601().withMessage('Please provide a valid date of birth'),
  body('gender').isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Please provide a valid gender')
], async (req, res) => {
  console.log('\n📝 ===== REGISTRATION REQUEST RECEIVED =====');
  console.log('Time:', new Date().toISOString());
  console.log('Request body:', {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    phone: req.body.phone,
    dateOfBirth: req.body.dateOfBirth,
    gender: req.body.gender,
    password: req.body.password ? '***' : 'MISSING'
  });
  
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      console.log('Request body:', req.body);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, phone, password, dateOfBirth, gender } = req.body;
    console.log('✅ Validation passed');

    // Check if user already exists
    console.log('🔍 Checking if user already exists...');
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      console.log('❌ User already exists with email or phone');
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone number already exists'
      });
    }
    console.log('✅ User does not exist, proceeding...');

    // Generate SMS OTP only — email is auto-verified, no email OTP needed
    console.log('🔐 Generating SMS OTP...');
    const phoneVerificationToken = crypto.randomInt(100000, 999999).toString();
    console.log('   SMS OTP code:', phoneVerificationToken);

    // Create user — email is pre-verified (we use SMS OTP as the single factor)
    console.log('👤 Creating user in database...');
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      password,
      dateOfBirth,
      gender,
      isEmailVerified: true,      // auto-verified; SMS OTP is the single verification
      phoneVerificationToken
    });

    await user.save();
    console.log('✅ User created successfully with ID:', user._id);

    // Send SMS OTP
    console.log('\n📱 ===== SENDING SMS OTP =====');
    try {
      await sendSMS(user.phone, `Your Menorah Health verification code is: ${phoneVerificationToken}. Valid for 10 minutes.`);
      console.log('✅ SMS OTP sent successfully!');
    } catch (smsError) {
      console.error('❌ Error sending SMS OTP:', smsError.message);
      // Don't fail registration if SMS fails
    }

    console.log('\n✅ ===== REGISTRATION COMPLETE =====\n');

    // Generate token
    const token = generateToken(user._id, user.role || 'user', `${user.firstName} ${user.lastName}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your phone number.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified
        },
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  console.log('\n🔐 ===== LOGIN REQUEST RECEIVED =====');
  console.log('Time:', new Date().toISOString());
  console.log('Request email:', req.body.email);
  console.log('Request password:', req.body.password ? '***' : 'MISSING');
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    
    // Normalize email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔍 Searching for user with email:', normalizedEmail);

    // Find user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.log('❌ User not found with email:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('✅ User found:', {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      hasPassword: !!user.password,
      passwordLength: user.password ? user.password.length : 0,
      loginAttempts: user.loginAttempts,
      isLocked: user.isLocked()
    });

    // Check if account is locked
    if (user.isLocked()) {
      console.log('🔒 Account is locked');
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts'
      });
    }

    // Check password
    console.log('🔑 Comparing password...');
    console.log('   Input password length:', password.length);
    console.log('   Stored password hash length:', user.password ? user.password.length : 0);
    console.log('   Password hash starts with:', user.password ? user.password.substring(0, 10) : 'N/A');
    
    const isPasswordValid = await user.comparePassword(password);
    console.log('   Password comparison result:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('❌ Password is invalid');
      await user.incLoginAttempts();
      
      // Refresh user to get updated login attempts
      const updatedUser = await User.findById(user._id);
      console.log('   Updated login attempts:', updatedUser.loginAttempts);
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('✅ Password is valid!');
    
    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate token
    const token = generateToken(user._id, user.role || 'user', `${user.firstName} ${user.lastName}`);
    console.log('🎫 Token generated successfully');

    console.log('✅ ===== LOGIN SUCCESSFUL =====\n');

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          profileImage: user.profileImage,
          role: user.role || 'user'
        },
        token
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email', [
  body('code').matches(/^\d{6}$/).withMessage('Verification code must be a 6-digit number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { code } = req.body;

    const user = await User.findOne({ emailVerificationToken: code });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/resend-email-verification
// @desc    Resend email verification code
// @access  Public
router.post('/resend-email-verification', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new verification code
    const emailVerificationToken = crypto.randomInt(100000, 999999).toString();
    user.emailVerificationToken = emailVerificationToken;
    await user.save();

    // Send verification email
    try {
      console.log('📧 Resending verification email to:', user.email);
      const emailSent = await sendVerificationEmail(user.email, emailVerificationToken);
      if (emailSent) {
        res.json({
          success: true,
          message: 'Verification code sent successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send verification email. Please check your SMTP configuration and server logs.'
        });
      }
    } catch (error) {
      console.error('Error sending verification email:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please check your SMTP configuration and server logs.'
      });
    }

  } catch (error) {
    console.error('Resend email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/resend-otp
// @desc    Resend SMS OTP for phone verification
// @access  Public
router.post('/resend-otp', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      // Return success to avoid user enumeration
      return res.json({ success: true, message: 'If an account exists, a new OTP has been sent.' });
    }

    if (user.isPhoneVerified) {
      return res.status(400).json({ success: false, message: 'Phone number is already verified' });
    }

    const phoneVerificationToken = crypto.randomInt(100000, 999999).toString();
    user.phoneVerificationToken = phoneVerificationToken;
    await user.save();

    try {
      await sendSMS(user.phone, `Your Menorah Health verification code is: ${phoneVerificationToken}. Valid for 10 minutes.`);
      console.log('✅ OTP resent to:', user.phone);
    } catch (smsError) {
      console.error('❌ Error resending OTP:', smsError.message);
      return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/auth/test-email
// @desc    Test email configuration (for debugging)
// @access  Public (should be protected in production)
router.post('/test-email', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;
    const testCode = '123456';

    console.log('🧪 Testing email configuration...');
    console.log('Test email:', email);
    console.log('SMTP Config:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      from: process.env.EMAIL_FROM,
      pass: process.env.SMTP_PASS ? '***' : 'MISSING'
    });

    const emailSent = await sendVerificationEmail(email, testCode);
    
    if (emailSent) {
      res.json({
        success: true,
        message: 'Test email sent successfully! Check your inbox.',
        details: {
          recipient: email,
          testCode: testCode,
          smtpHost: process.env.SMTP_HOST,
          smtpPort: process.env.SMTP_PORT
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email. Check server logs for details.',
        troubleshooting: {
          gmail: 'For Gmail, make sure you are using an App Password, not your regular password',
          appPasswordLink: 'https://myaccount.google.com/apppasswords',
          commonIssues: [
            'SMTP_HOST is incorrect',
            'SMTP_PORT is incorrect (587 for TLS, 465 for SSL)',
            'SMTP_USER is incorrect',
            'SMTP_PASS is incorrect or not an App Password',
            '2-factor authentication is not enabled (required for App Passwords)',
            'Firewall is blocking the connection'
          ]
        }
      });
    }
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// @route   POST /api/auth/verify-phone
// @desc    Verify phone number
// @access  Public
router.post('/verify-phone', [
  body('token').notEmpty().withMessage('Verification token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token } = req.body;

    const user = await User.findOne({ phoneVerificationToken: token });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    user.isPhoneVerified = true;
    user.phoneVerificationToken = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Phone number verified successfully'
    });

  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists for that email, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send reset email
    const emailSent = await sendPasswordResetEmail(user.email, resetToken);
    if (!emailSent) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Unable to send reset email right now. Please try again in a moment.'
      });
    }

    res.json({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/auth/reset-password
// @desc    Redirect password reset links into the mobile app
// @access  Public
router.get('/reset-password', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Menorah Health</title>
        </head>
        <body style="font-family: Arial, sans-serif; background: #f5f3eb; padding: 32px; color: #1f2937;">
          <div style="max-width: 420px; margin: 0 auto; background: white; border-radius: 18px; padding: 28px; box-shadow: 0 12px 35px rgba(0,0,0,0.08);">
            <h1 style="margin-top: 0;">Invalid reset link</h1>
            <p>This password reset link is missing a token. Please request a new reset email from the app.</p>
          </div>
        </body>
      </html>
    `);
  }

  const appScheme = process.env.MOBILE_APP_SCHEME?.trim() || 'menorah-health://reset-password';
  const separator = appScheme.includes('?') ? '&' : '?';
  const appUrl = `${appScheme}${separator}token=${encodeURIComponent(token)}`;

  return res.status(200).send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Reset your password</title>
        <meta http-equiv="refresh" content="0;url=${appUrl}" />
      </head>
      <body style="font-family: Arial, sans-serif; background: #f5f3eb; padding: 32px; color: #1f2937;">
        <div style="max-width: 420px; margin: 0 auto; background: white; border-radius: 18px; padding: 28px; box-shadow: 0 12px 35px rgba(0,0,0,0.08);">
          <h1 style="margin-top: 0;">Open Menorah Health</h1>
          <p style="line-height: 1.6;">We're redirecting you to the app so you can choose a new password securely.</p>
          <a href="${appUrl}" style="display: inline-block; margin-top: 8px; background: #314830; color: white; padding: 14px 20px; border-radius: 12px; text-decoration: none; font-weight: 600;">
            Open the app
          </a>
          <p style="margin-top: 18px; color: #6b7280; line-height: 1.6;">
            If the app doesn't open, make sure Menorah Health is installed on this device and request a fresh reset email.
          </p>
        </div>
      </body>
    </html>
  `);
});

// @route   POST /api/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token, password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // In a more complex setup, you might want to blacklist the token
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
