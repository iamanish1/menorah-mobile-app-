const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { sendOTP, resendOTP } = require('../utils/sms');

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
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, phone, password, dateOfBirth, gender } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone number already exists'
      });
    }

    // Create user — email is pre-verified; SMS OTP is the single verification factor
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      password,
      dateOfBirth,
      gender,
      isEmailVerified: true,
    });

    await user.save();

    // Send OTP via MSG91 (MSG91 manages OTP state — not stored in DB)
    try {
      await sendOTP(user.phone);
    } catch (smsError) {
      console.error('Error sending OTP:', smsError.message);
      // Don't fail registration if OTP send fails
    }

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
    console.error('Registration error:', error.message);
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
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isLocked()) {
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await user.resetLoginAttempts();
    const token = generateToken(user._id, user.role || 'user', `${user.firstName} ${user.lastName}`);

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
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address via 6-digit code
// @access  Public
router.post('/verify-email', [
  body('code').matches(/^\d{6}$/).withMessage('Verification code must be a 6-digit number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { code } = req.body;
    const user = await User.findOne({ emailVerificationToken: code });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.json({ success: true, message: 'Email verified successfully' });

  } catch (error) {
    console.error('Email verification error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified' });
    }

    const emailVerificationToken = crypto.randomInt(100000, 999999).toString();
    user.emailVerificationToken = emailVerificationToken;
    await user.save();

    try {
      const emailSent = await sendVerificationEmail(user.email, emailVerificationToken);
      if (emailSent) {
        res.json({ success: true, message: 'Verification code sent successfully' });
      } else {
        res.status(500).json({ success: false, message: 'Failed to send verification email.' });
      }
    } catch (error) {
      console.error('Error sending verification email:', error.message);
      res.status(500).json({ success: false, message: 'Failed to send verification email.' });
    }

  } catch (error) {
    console.error('Resend email verification error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/auth/resend-otp
// @desc    Resend SMS OTP for phone verification
// @access  Public
router.post('/resend-otp', [
  body('phone').notEmpty().withMessage('Phone number is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) {
      // Return success to avoid user enumeration
      return res.json({ success: true, message: 'If an account exists, a new OTP has been sent.' });
    }

    if (user.isPhoneVerified) {
      return res.status(400).json({ success: false, message: 'Phone number is already verified' });
    }

    const result = await resendOTP(phone);
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/auth/verify-phone
// @desc    Verify phone number via MSG91 OTP
// @access  Public
router.post('/verify-phone', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('otp').matches(/^\d{4,6}$/).withMessage('OTP must be 4-6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { phone, otp } = req.body;

    // Verify with MSG91 — they manage OTP state and expiry
    const { verifyOTP } = require('../utils/sms');
    const result = await verifyOTP(phone, otp);
    if (!result.success) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const user = await User.findOneAndUpdate(
      { phone },
      { isPhoneVerified: true, $unset: { phoneVerificationToken: 1 } },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Phone number verified successfully' });

  } catch (error) {
    console.error('Phone verification error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      // Always return success to avoid user enumeration
      return res.json({ success: true, message: 'If an account exists for that email, a password reset link has been sent' });
    }

    // Generate plain token for the email link
    const resetToken = crypto.randomBytes(32).toString('hex');
    // Store SHA-256 hash in DB — plain token never touches the database
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

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

    res.json({ success: true, message: 'If an account exists for that email, a password reset link has been sent' });

  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { token, password } = req.body;

    // Hash incoming token and compare against stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });

  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get current user error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
