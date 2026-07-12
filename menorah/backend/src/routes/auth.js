const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const axios  = require('axios');
const User   = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendOTPEmail, sendPasswordResetEmail } = require('../utils/email');
const { getRedisClient } = require('../config/redis');

const router = express.Router();
const emailNormalizationOptions = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false,
};

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
const PENDING_TTL          = 10 * 60;  // 10 min email OTP expiry
const OTP_RESEND_COOLDOWN  = 60;       // Prevent duplicate delivery from retries/double-clicks
const MAX_OTP_TRIES        = 5;

const pendingRegistrationKey = (email) => `pending:reg:${email}`;
const pendingResendKey = (email) => `pending:reg:resend:${email}`;
const emailVerificationResendKey = (email) => `pending:email-verification:resend:${email}`;

const storePendingReg = async (email, data, { onlyIfAbsent = false } = {}) => {
  const redis   = getRedisClient();
  const otpHash = crypto.createHash('sha256').update(data.otp).digest('hex');
  // Hash the password now so plaintext never touches Redis
  const passwordHash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  const entry = { ...data, otp: otpHash, password: passwordHash, attempts: 0 };
  if (onlyIfAbsent) {
    return redis.set(pendingRegistrationKey(email), JSON.stringify(entry), { EX: PENDING_TTL, NX: true });
  }
  await redis.setEx(pendingRegistrationKey(email), PENDING_TTL, JSON.stringify(entry));
  return 'OK';
};

const getPendingReg = async (email) => {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(pendingRegistrationKey(email));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const updatePendingReg = async (email, updates) => {
  try {
    const redis   = getRedisClient();
    const pending = await getPendingReg(email);
    if (!pending) return;
    const ttl = await redis.ttl(pendingRegistrationKey(email));
    await redis.setEx(pendingRegistrationKey(email), Math.max(ttl, 1), JSON.stringify({ ...pending, ...updates }));
  } catch {}
};

const deletePendingReg = async (email) => {
  try {
    const redis = getRedisClient();
    await Promise.all([
      redis.del(pendingRegistrationKey(email)),
      redis.del(pendingResendKey(email)),
    ]);
  } catch {}
};

const acquireOtpResendCooldown = async (key) => {
  const result = await getRedisClient().set(key, '1', { EX: OTP_RESEND_COOLDOWN, NX: true });
  return result === 'OK';
};

const releaseOtpResendCooldown = async (key) => {
  try { await getRedisClient().del(key); } catch {}
};

const getGoogleClientIds = () => [
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID,
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
]
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const splitGoogleName = (payload = {}) => {
  const givenName = String(payload.given_name || '').trim();
  const familyName = String(payload.family_name || '').trim();
  const fullName = String(payload.name || '').trim();

  if (givenName || familyName) {
    return {
      firstName: givenName || fullName.split(/\s+/)[0] || 'Menorah',
      lastName: familyName || fullName.split(/\s+/).slice(1).join(' ') || 'User'
    };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Menorah',
    lastName: parts.slice(1).join(' ') || 'User'
  };
};

const splitDisplayName = (fullName, fallbackFirst = 'Menorah', fallbackLast = 'User') => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || fallbackFirst,
    lastName: parts.slice(1).join(' ') || fallbackLast
  };
};

const serializeAuthUser = (user) => ({
  id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: user.isPhoneVerified,
  profileImage: user.profileImage,
  role: user.role || 'user',
  kyc: user.kyc,
});

const normalizeAuthRole = (role) => {
  const value = String(role || 'user').trim().toLowerCase();
  if (value === 'counselor') return 'counsellor';
  if (['user', 'counsellor', 'admin'].includes(value)) return value;
  return 'user';
};

const portalUrl = (envName, fallbackDomain) => {
  const value = String(process.env[envName] || fallbackDomain).trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

const getRolePortal = (role) => {
  const normalizedRole = normalizeAuthRole(role);
  if (normalizedRole === 'counsellor') {
    return {
      role: 'counsellor',
      redirectUrl: `${portalUrl('COUNSELLOR_DOMAIN', 'counsellor.menorah.me')}/login`,
      redirectLabel: 'Open counsellor portal',
    };
  }
  if (normalizedRole === 'admin') {
    return {
      role: 'admin',
      redirectUrl: `${portalUrl('ADMIN_DOMAIN', 'admin.menorah.me')}/login`,
      redirectLabel: 'Open admin portal',
    };
  }
  return {
    role: 'user',
    redirectUrl: `${portalUrl('APP_DOMAIN', 'app.menorah.me')}/login`,
    redirectLabel: 'Open user app',
  };
};

const getRoleMismatchMessage = (actualRole, expectedRole) => {
  if (expectedRole === 'user' && actualRole === 'counsellor') {
    return 'This looks like a counsellor account. Please sign in through the counsellor portal.';
  }
  if (expectedRole === 'counsellor' && actualRole === 'user') {
    return 'This looks like a regular user account. Please sign in through the user app.';
  }
  return 'This account belongs to a different Menorah portal.';
};

const rejectRoleMismatch = (req, res, user) => {
  if (!req.body?.intendedRole) return false;
  const expectedRole = normalizeAuthRole(req.body.intendedRole);
  const actualRole = normalizeAuthRole(user.role);
  if (actualRole === expectedRole) return false;

  const portal = getRolePortal(actualRole);
  res.status(403).json({
    success: false,
    code: 'ROLE_MISMATCH',
    message: getRoleMismatchMessage(actualRole, expectedRole),
    data: {
      actualRole,
      expectedRole,
      redirectUrl: portal.redirectUrl,
      redirectLabel: portal.redirectLabel,
    },
  });
  return true;
};

const verifyGoogleCredential = async (credential) => {
  const clientIds = getGoogleClientIds();
  if (clientIds.length === 0) {
    throw new Error('Google OAuth is not configured');
  }

  const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
    params: { id_token: credential },
    timeout: 8000
  });
  const payload = response.data || {};

  if (!payload.sub || !payload.email) {
    throw new Error('Google credential is missing required identity fields');
  }
  if (!clientIds.includes(payload.aud)) {
    throw new Error('Google credential audience is not allowed');
  }
  if (String(payload.email_verified) !== 'true') {
    throw new Error('Google account email is not verified');
  }

  return payload;
};

const getAppleAudiences = () => [
  process.env.APPLE_IOS_BUNDLE_ID,
  process.env.APPLE_WEB_SERVICE_ID
]
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const getAppleSigningKey = async (kid) => {
  const response = await axios.get('https://appleid.apple.com/auth/keys', { timeout: 8000 });
  const key = response.data?.keys?.find((candidate) => candidate.kid === kid);
  if (!key) throw new Error('Apple signing key was not found');
  return crypto.createPublicKey({ key, format: 'jwk' });
};

const verifyJwtAsync = (token, getKey, options) =>
  new Promise((resolve, reject) => {
    jwt.verify(token, getKey, options, (error, decoded) => {
      if (error) return reject(error);
      resolve(decoded);
    });
  });

const verifyAppleIdentityToken = async (identityToken) => {
  const audiences = getAppleAudiences();
  if (audiences.length === 0) {
    throw new Error('Apple Sign in is not configured');
  }

  const decodedHeader = jwt.decode(identityToken, { complete: true })?.header;
  if (!decodedHeader?.kid) {
    throw new Error('Apple identity token is missing key id');
  }

  return verifyJwtAsync(
    identityToken,
    async (header, callback) => {
      try {
        const key = await getAppleSigningKey(header.kid);
        callback(null, key);
      } catch (error) {
        callback(error);
      }
    },
    {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: audiences
    }
  );
};

const findOrCreateSocialUser = async ({
  provider,
  subject,
  email,
  firstName,
  lastName,
  profileImage = null,
  privateRelay = false
}) => {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const socialPath = provider === 'apple' ? 'socialAuth.appleSub' : 'socialAuth.googleSub';
  const lookup = [{ [socialPath]: subject }];
  if (normalizedEmail) lookup.push({ email: normalizedEmail });

  let user = await User.findOne({ $or: lookup });
  const existingUser = Boolean(user);

  if (user && !user.isActive) {
    const error = new Error('Inactive social auth account');
    error.statusCode = 401;
    throw error;
  }

  if (!user) {
    const safeEmail = normalizedEmail || `${provider}-${subject}@menorah.local`;
    const fallbackPhone = `${provider}:${subject}`;
    user = await User.create({
      email: safeEmail,
      phone: fallbackPhone,
      password: crypto.randomBytes(32).toString('hex'),
      firstName: firstName || 'Menorah',
      lastName: lastName || 'User',
      dateOfBirth: new Date('1970-01-01'),
      gender: 'prefer-not-to-say',
      profileImage,
      role: 'user',
      isActive: true,
      isEmailVerified: Boolean(normalizedEmail),
      isPhoneVerified: false,
      socialAuth: {
        googleSub: provider === 'google' ? subject : undefined,
        appleSub: provider === 'apple' ? subject : undefined,
        appleEmailPrivateRelay: provider === 'apple' ? Boolean(privateRelay) : undefined
      }
    });
    return { user, existingUser };
  }

  user.socialAuth = user.socialAuth || {};
  let changed = false;
  if (provider === 'google' && user.socialAuth.googleSub !== subject) {
    user.socialAuth.googleSub = subject;
    changed = true;
  }
  if (provider === 'apple' && user.socialAuth.appleSub !== subject) {
    user.socialAuth.appleSub = subject;
    user.socialAuth.appleEmailPrivateRelay = Boolean(privateRelay);
    changed = true;
  }
  if (normalizedEmail && !user.isEmailVerified) {
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    changed = true;
  }
  if (profileImage && !user.profileImage) {
    user.profileImage = profileImage;
    changed = true;
  }
  if (changed) await user.save();

  return { user, existingUser };
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
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
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
      const existingRole = normalizeAuthRole(existingUser.role);
      if (existingRole === 'counsellor') {
        const portal = getRolePortal(existingRole);
        return res.status(400).json({
          success: false,
          code: 'ROLE_MISMATCH',
          message: 'This email or phone number is already registered as a counsellor. Please sign in through the counsellor portal.',
          data: {
            actualRole: existingRole,
            expectedRole: 'user',
            redirectUrl: portal.redirectUrl,
            redirectLabel: portal.redirectLabel,
          },
        });
      }
      return res.status(400).json({ success: false, message: 'User with this email or phone number already exists' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const stored = await storePendingReg(
      email,
      { firstName, lastName, email, phone, password, dateOfBirth, gender, otp },
      { onlyIfAbsent: true }
    );

    if (!stored) {
      return res.status(200).json({
        success: true,
        message: 'A verification code was already sent. Check your inbox or wait before requesting another code.',
        data: { email },
      });
    }

    await getRedisClient().setEx(pendingResendKey(email), OTP_RESEND_COOLDOWN, '1');

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
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
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
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isEmailVerified: true,
          isPhoneVerified: user.isPhoneVerified,
          kyc: user.kyc,
        },
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
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
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

    const resendKey = pendingResendKey(email);
    if (!await acquireOtpResendCooldown(resendKey)) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${OTP_RESEND_COOLDOWN} seconds before requesting another code.`,
      });
    }

    const newOtp    = crypto.randomInt(100000, 999999).toString();
    const newOtpHash = crypto.createHash('sha256').update(newOtp).digest('hex');
    await updatePendingReg(email, { otp: newOtpHash, attempts: 0 });

    const emailSent = await sendOTPEmail(email, newOtp);
    if (!emailSent) {
      await releaseOtpResendCooldown(resendKey);
      return res.status(500).json({ success: false, message: 'Failed to resend OTP' });
    }

    res.json({ success: true, message: 'OTP resent successfully' });
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
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
  body('password').notEmpty(),
  body('intendedRole').optional().isIn(['user', 'counsellor', 'counselor']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Use same generic message for missing user AND inactive account —
    // different messages allow attackers to enumerate valid email addresses.
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isLocked()) {
      // Locked message is acceptable — user already proved they know the email exists
      // by successfully registering; revealing lockout doesn't add enumeration risk.
      return res.status(401).json({ success: false, message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await user.resetLoginAttempts();
    if (rejectRoleMismatch(req, res, user)) return;

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
          kyc: user.kyc,
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
// @route   POST /api/auth/google
// @desc    Sign in or create a user account with a Google ID token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/google', [
  body('credential').isString().trim().isLength({ min: 20 }),
  body('intendedRole').optional().isIn(['user', 'counsellor', 'counselor']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const googleUser = await verifyGoogleCredential(req.body.credential);
    const { firstName, lastName } = splitGoogleName(googleUser);
    const { user, existingUser } = await findOrCreateSocialUser({
      provider: 'google',
      subject: googleUser.sub,
      email: googleUser.email,
      firstName,
      lastName,
      profileImage: googleUser.picture || null
    });

    if (rejectRoleMismatch(req, res, user)) return;

    const token = generateToken(user._id, user.role || 'user');
    return res.json({
      success: true,
      message: existingUser ? 'Login successful' : 'Account created successfully',
      data: {
        user: {
          ...serializeAuthUser(user),
        },
        token,
        isNewUser: !existingUser,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error.message);
    return res.status(401).json({ success: false, message: 'Google sign-in failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/apple
// @desc    Sign in or create a user account with an Apple identity token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/apple', [
  body('identityToken').isString().trim().isLength({ min: 20 }),
  body('email').optional().isEmail().normalizeEmail(emailNormalizationOptions),
  body('fullName').optional().isString().trim().isLength({ max: 120 }),
  body('intendedRole').optional().isIn(['user', 'counsellor', 'counselor']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const appleUser = await verifyAppleIdentityToken(req.body.identityToken);
    const tokenEmail = String(appleUser.email || req.body.email || '').toLowerCase().trim();
    const { firstName, lastName } = splitDisplayName(req.body.fullName, 'Menorah', 'User');
    const { user, existingUser } = await findOrCreateSocialUser({
      provider: 'apple',
      subject: appleUser.sub,
      email: tokenEmail,
      firstName,
      lastName,
      privateRelay: /privaterelay\.appleid\.com$/i.test(tokenEmail)
    });

    if (rejectRoleMismatch(req, res, user)) return;

    const token = generateToken(user._id, user.role || 'user');
    return res.json({
      success: true,
      message: existingUser ? 'Login successful' : 'Account created successfully',
      data: {
        user: serializeAuthUser(user),
        token,
        isNewUser: !existingUser,
      },
    });
  } catch (error) {
    console.error('Apple auth error:', error.message);
    return res.status(error.statusCode || 401).json({ success: false, message: 'Apple sign-in failed. Please try again.' });
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

    return res.status(410).json({
      success: false,
      message: 'Phone SMS verification is disabled. Please use email verification.',
    });
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
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
], async (req, res) => {
  // Always return 200 — prevents email-existence enumeration
  try {
    const { email } = req.body;
    const user = await User.findOne({ email, isEmailVerified: false });
    if (user) {
      const resendKey = emailVerificationResendKey(email);
      if (!await acquireOtpResendCooldown(resendKey)) {
        return res.json({ success: true, message: 'If an unverified account exists for that email, a code is already on its way.' });
      }

      const code = crypto.randomInt(100000, 999999).toString();
      user.emailVerificationToken = code;
      await user.save();
      const { sendVerificationEmail } = require('../utils/email');
      const emailSent = await sendVerificationEmail(email, code);
      if (!emailSent) await releaseOtpResendCooldown(resendKey);
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
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
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
// Allowed redirect destination hostnames — prevents open redirect if env var is misconfigured
const ALLOWED_REDIRECT_HOSTS = new Set(['menorah.me', 'www.menorah.me', 'app.menorah.me', 'localhost:3002']);

const safeWebAppUrl = () => {
  const raw = (process.env.WEB_APP_URL || 'https://menorah.me').trim();
  try {
    const { hostname, port } = new URL(raw);
    const host = port ? `${hostname}:${port}` : hostname;
    if (!ALLOWED_REDIRECT_HOSTS.has(host)) {
      return 'https://menorah.me';
    }
    return raw.replace(/\/$/, '');
  } catch {
    return 'https://menorah.me';
  }
};

router.get('/reset-password', (req, res) => {
  const token      = req.query.token;
  const webAppUrl  = safeWebAppUrl();

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
    ).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    // Return same shape as login/register so user.id is always a string on the frontend
    res.json({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          role: user.role,
          profileImage: user.profileImage || null,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          kyc: user.kyc,
          subscription: user.subscription,
          notificationPreferences: user.notificationPreferences,
        }
      }
    });
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
