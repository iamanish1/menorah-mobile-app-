const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User   = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendOTPEmail, sendPasswordResetEmail } = require('../utils/email');
const { getRedisClient } = require('../config/redis');

const router = express.Router();

// ── JWT token generation ───────────────────────────────────────────────────
// Algorithm pinned to HS256.  fullName removed from payload — PII should not
// live in a base64-decoded token visible to anyone who holds it.
const generateToken = (userId, role = 'user') => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ── Pending registration helpers (Redis-backed) ────────────────────────────
// Registration data is stored in Redis instead of process memory so the
// flow works correctly across multiple PM2 workers and Cloud Run instances.
const PENDING_TTL   = 10 * 60;          // 10 min — matches MSG91 OTP expiry
const MAX_OTP_TRIES = 5;

const storePendingReg = async (email, data) => {
  const redis   = getRedisClient();
  const otpHash = crypto.createHash('sha256').update(data.otp).digest('hex');
  // Hash the password now so plaintext never touches Redis
  const passwordHash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  const entry = { ...data, otp: otpHash, password: passwordHash, attempts: 0 };
  await redis.setEx(`pending:reg:${email}`, PENDING_TTL, JSON.stringify(entry));
};

const getPendingReg = async (email) => {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(`pending:reg:${email}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const updatePendingReg = async (email, updates) => {
  try {
    const redis   = getRedisClient();
    const pending = await getPendingReg(email);
    if (!pending) return;
    const ttl = await redis.ttl(`pending:reg:${email}`);
    await redis.setEx(`pending:reg:${email}`, Math.max(ttl, 1), JSON.stringify({ ...pending, ...updates }));
  } catch {}
};

const deletePendingReg = async (email) => {
  try { await getRedisClient().del(`pending:reg:${email}`); } catch {}
};

// Timing-safe OTP check — SHA-256(input) vs stored hash
const checkOTP = (storedHash, inputOtp) => {
  const inputHash = crypto.createHash('sha256').update(inputOtp).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(inputHash, 'hex'));
  } catch { return false; }
};

// ── Logout blocklist helper ────────────────────────────────────────────────
const blockToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await getRedisClient().setEx(`blocked:token:${hash}`, ttl, '1');
  } catch {}
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', [
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 2, max: 50 }),
  body('email').isEmail().normalizeEmail(),
  body('phone').matches(/^\+[1-9]\d{1,14}$/),
  body('password').isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0 })
    .withMessage('Password must be at least 8 characters and include uppercase, lowercase, and a number'),
  body('dateOfBirth').isISO8601(),
  body('gender').isIn(['male', 'female', 'other', 'prefer-not-to-say']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, phone, password, dateOfBirth, gender } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email or phone number already exists' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    await storePendingReg(email, { firstName, lastName, email, phone, password, dateOfBirth, gender, otp });

    const emailSent = await sendOTPEmail(email, otp, `${firstName} ${lastName}`);
    if (!emailSent) {
      await deletePendingReg(email);
      return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
    }

    res.status(200).json({ success: true, message: 'OTP sent to your email. Please verify to complete registration.', data: { email } });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/verify-email-otp
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-email-otp', [
  body('email').isEmail().normalizeEmail(),
  body('otp').matches(/^\d{4,6}$/),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, otp } = req.body;
    const pending = await getPendingReg(email);

    if (!pending) {
      return res.status(400).json({ success: false, message: 'Registration session expired. Please register again.' });
    }

    // OTP attempt limiting — max 5 failed tries
    if (pending.attempts >= MAX_OTP_TRIES) {
      await deletePendingReg(email);
      return res.status(400).json({ success: false, message: 'Too many failed attempts. Please register again.' });
    }

    if (!checkOTP(pending.otp, otp)) {
      await updatePendingReg(email, { attempts: pending.attempts + 1 });
      const remaining = MAX_OTP_TRIES - pending.attempts - 1;
      return res.status(400).json({
        success: false,
        message: remaining > 0 ? `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` : 'Invalid OTP.',
      });
    }

    // Create user — password is already bcrypt-hashed in Redis
    const user = new User({
      firstName: pending.firstName,
      lastName:  pending.lastName,
      email:     pending.email,
      phone:     pending.phone,
      password:  pending.password,  // already hashed; pre-save hook detects and skips re-hashing
      dateOfBirth: pending.dateOfBirth,
      gender:    pending.gender,
      isEmailVerified: true,
    });
    await user.save();
    await deletePendingReg(email);

    const token = generateToken(user._id, user.role || 'user');
    res.json({
      success: true,
      message: 'Email verified. Registration complete.',
      data: {
        user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, isEmailVerified: true, isPhoneVerified: user.isPhoneVerified },
        token,
      },
    });
  } catch (error) {
    console.error('Email OTP verification error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/resend-email-otp
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resend-email-otp', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    const pending = await getPendingReg(email);

    if (!pending) {
      return res.status(400).json({ success: false, message: 'Registration session expired. Please register again.' });
    }

    const newOtp    = crypto.randomInt(100000, 999999).toString();
    const newOtpHash = crypto.createHash('sha256').update(newOtp).digest('hex');
    await updatePendingReg(email, { otp: newOtpHash, attempts: 0 });

    const emailSent = await sendOTPEmail(email, newOtp);
    res.json({ success: emailSent, message: emailSent ? 'OTP resent successfully' : 'Failed to resend OTP' });
  } catch (error) {
    console.error('Resend email OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      const msg = user.role === 'counsellor'
        ? 'Your account is pending admin approval.'
        : 'Account is deactivated. Please contact support.';
      return res.status(401).json({ success: false, message: msg });
    }

    if (user.isLocked()) {
      return res.status(401).json({ success: false, message: 'Account is temporarily locked due to multiple failed login attempts' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await user.resetLoginAttempts();
    const token = generateToken(user._id, user.role || 'user');

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id, firstName: user.firstName, lastName: user.lastName,
          email: user.email, phone: user.phone,
          isEmailVerified: user.isEmailVerified, isPhoneVerified: user.isPhoneVerified,
          profileImage: user.profileImage, role: user.role || 'user',
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/verify-email
// @desc    Verify email with a 6-digit code (stored on User document)
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-email', [
  body('code').matches(/^\d{6}$/),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { code } = req.body;
    const user = await User.findOne({ emailVerificationToken: code });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    const token = generateToken(user._id, user.role || 'user');
    res.json({ success: true, message: 'Email verified successfully', data: { token } });
  } catch (error) {
    console.error('Email verification error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/verify-phone
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-phone', [
  body('phone').matches(/^\+[1-9]\d{1,14}$/),
  body('otp').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { phone, otp } = req.body;
    const { verifyOTP } = require('../utils/sms');
    const result = await verifyOTP(phone, otp);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message || 'Invalid or expired OTP' });
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

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/resend-email-verification
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resend-email-verification', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  // Always return 200 — prevents email-existence enumeration
  try {
    const { email } = req.body;
    const user = await User.findOne({ email, isEmailVerified: false });
    if (user) {
      const code = crypto.randomInt(100000, 999999).toString();
      user.emailVerificationToken = code;
      await user.save();
      const { sendVerificationEmail } = require('../utils/email');
      await sendVerificationEmail(email, code).catch(() => {});
    }
  } catch (error) {
    console.error('Resend email verification error:', error.message);
  }
  res.json({ success: true, message: 'If an unverified account exists for that email, a new code has been sent.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/forgot-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (user) {
      const resetToken  = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.passwordResetToken   = hashedToken;
      user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
      await user.save();
      await sendPasswordResetEmail(user.email, resetToken).catch(() => {});
    }
    // Always return the same message regardless — prevents email-existence enumeration
    res.json({ success: true, message: 'If an account exists for that email, a password reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/auth/reset-password
// @desc    Redirect password reset links to mobile app or web app
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.get('/reset-password', (req, res) => {
  const token      = req.query.token;
  const webAppUrl  = (process.env.WEB_APP_URL || 'https://menorah.me').trim();

  if (!token) {
    return res.redirect(`${webAppUrl}/reset-password?error=missing-token`);
  }

  const userAgent = req.headers['user-agent'] || '';
  const isMobile  = /Android|iPhone|iPad|iPod|Expo|React Native/i.test(userAgent);

  if (isMobile) {
    const appScheme  = (process.env.MOBILE_APP_SCHEME || 'menorah-health://reset-password').trim();
    const sep        = appScheme.includes('?') ? '&' : '?';
    // Use JSON.stringify to safely embed URL values into JavaScript string literals
    // This prevents XSS if the token value ever contains JS metacharacters.
    const appUrl     = `${appScheme}${sep}token=${encodeURIComponent(token)}`;
    const webFallback = `${webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;

    return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset your password</title>
  <script>
    window.location.href = ${JSON.stringify(appUrl)};
    setTimeout(function(){window.location.href=${JSON.stringify(webFallback)};},2000);
  </script>
</head>
<body style="font-family:Arial,sans-serif;background:#f5f3eb;padding:32px;color:#1f2937">
  <div style="max-width:420px;margin:0 auto;background:white;border-radius:18px;padding:28px">
    <h1 style="margin-top:0">Open Menorah Health</h1>
    <p>Opening the app to reset your password...</p>
    <a href=${JSON.stringify(appUrl)} style="background:#314830;color:white;padding:14px 20px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px">Open the app</a>
    <p style="margin-top:18px;color:#6b7280;font-size:14px">App not opening? <a href=${JSON.stringify(webFallback)} style="color:#314830">Reset via browser</a></p>
  </div>
</body>
</html>`);
  }

  return res.redirect(`${webAppUrl}/reset-password?token=${encodeURIComponent(token)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/reset-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0 })
    .withMessage('Password must be at least 8 characters and include uppercase, lowercase, and a number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { token, password } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken:   hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password             = password;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/auth/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      '-password -emailVerificationToken -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil'
    );
    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get current user error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/logout
// @desc    Invalidate the current JWT by adding it to the Redis blocklist
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', auth, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) await blockToken(token);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
