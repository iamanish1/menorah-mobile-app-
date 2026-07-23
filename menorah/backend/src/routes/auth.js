const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const axios  = require('axios');
const mongoose = require('mongoose');
const User   = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendOTPEmail, sendPasswordResetEmail } = require('../utils/email');
const { getRedisClient } = require('../config/redis');
const { signUserToken } = require('../utils/authTokens');
const { revokeAllSessions } = require('../utils/sessionLifecycle');
const { serializeAuthUser, serializeUserProfile } = require('../serializers/userSerializer');
const {
  PASSWORD_STRENGTH_MESSAGE,
  PASSWORD_STRENGTH_OPTIONS,
} = require('../config/passwordPolicy');
const {
  clearMappedSessionCookie,
  isCookieTransportRequested,
  setSessionCookieForRequest,
} = require('../config/webSessions');
const {
  exchangeAppleAuthorizationCode,
  verifyAppleIdentityToken,
} = require('../services/appleSignInService');
const { encryptAppleRefreshToken } = require('../utils/appleRefreshTokenEncryption');

const router = express.Router();
const emailNormalizationOptions = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false,
};

// ── Pending registration helpers (Redis-backed) ────────────────────────────
// Registration data is stored in Redis instead of process memory so the
// flow works correctly across multiple PM2 workers and Cloud Run instances.
const PENDING_TTL          = 10 * 60;  // 10 min email OTP expiry
const OTP_RESEND_COOLDOWN  = 60;       // Prevent duplicate delivery from retries/double-clicks
const MAX_OTP_TRIES        = 5;

const pendingRegistrationKey = (email) => `pending:reg:${email}`;
const pendingResendKey = (email) => `pending:reg:resend:${email}`;
const emailVerificationKey = (email) => `pending:email-verification:${email}`;
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

const storeEmailVerificationCode = async (email, otp) => {
  const redis = getRedisClient();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  await redis.setEx(emailVerificationKey(email), PENDING_TTL, JSON.stringify({ otp: otpHash, attempts: 0 }));
};

const getEmailVerificationCode = async (email) => {
  try {
    const raw = await getRedisClient().get(emailVerificationKey(email));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const updateEmailVerificationCode = async (email, updates) => {
  try {
    const current = await getEmailVerificationCode(email);
    if (!current) return;
    const ttl = await getRedisClient().ttl(emailVerificationKey(email));
    await getRedisClient().setEx(emailVerificationKey(email), Math.max(ttl, 1), JSON.stringify({ ...current, ...updates }));
  } catch {}
};

const deleteEmailVerificationCode = async (email) => {
  try {
    await getRedisClient().del(emailVerificationKey(email));
  } catch {}
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

const selectIfSupported = (query, fields) => (
  typeof query?.select === 'function' ? query.select(fields) : query
);

const sessionIfSupported = (query, session) => (
  session && typeof query?.session === 'function' ? query.session(session) : query
);

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

const findOrCreateSocialUser = async ({
  provider,
  subject,
  email,
  firstName,
  lastName,
  profileImage = null,
  privateRelay = false,
  session = null
}) => {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const socialPath = provider === 'apple' ? 'socialAuth.appleSub' : 'socialAuth.googleSub';

  let user = await sessionIfSupported(
    selectIfSupported(
      User.findOne({ [socialPath]: subject }),
      '+passwordAuthEnabled'
    ),
    session
  );
  if (user && !user.isActive) {
    const error = new Error('Inactive social auth account');
    error.statusCode = 401;
    throw error;
  }

  if (user) {
    if (user.role !== 'user') {
      const error = new Error('Social sign-in is not available for privileged accounts');
      error.statusCode = 403;
      error.publicMessage = 'Use the dedicated admin or counsellor login for this account.';
      throw error;
    }

    return { user, existingUser: true };
  }

  if (!normalizedEmail) {
    const error = new Error('Social auth email is required for a new account');
    error.statusCode = 409;
    error.publicMessage = 'Sign in with an account that shares a verified email, or use email and password first.';
    throw error;
  }

  const existingEmailUser = await sessionIfSupported(
    User.findOne({ email: normalizedEmail }),
    session
  );
  if (existingEmailUser) {
    const error = new Error('Social auth requires explicit account linking');
    error.statusCode = 409;
    error.publicMessage = 'An account already exists with this email. Sign in with email and password first, then link social sign-in from settings.';
    throw error;
  }

  try {
    const fallbackPhone = `${provider}:${subject}`;
    const userDocument = {
      email: normalizedEmail,
      phone: fallbackPhone,
      password: crypto.randomBytes(32).toString('hex'),
      passwordAuthEnabled: false,
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
    };
    if (session) {
      [user] = await User.create([userDocument], { session });
    } else {
      user = await User.create(userDocument);
    }
  } catch (error) {
    if (error.code === 11000) {
      const conflict = new Error('Social auth identity already exists');
      conflict.statusCode = 409;
      conflict.publicMessage = 'This social account is already linked to another Menorah account.';
      throw conflict;
    }
    throw error;
  }

  return { user, existingUser: false };
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

const sendAuthSessionResponse = (req, res, { message, token, role, data = {}, status = 200 }) => {
  const responseData = { ...data };
  let transport = 'bearer';

  if (isCookieTransportRequested(req)) {
    const sessionResult = setSessionCookieForRequest(req, res, { role, token });
    if (!sessionResult.ok) {
      return res.status(sessionResult.status).json({ success: false, message: sessionResult.message });
    }
    transport = 'cookie';
  } else {
    responseData.token = token;
  }

  res.locals.securityActor = data.user;
  res.locals.securitySessionCreated = true;
  res.locals.securitySessionTransport = transport;

  return res.status(status).json({
    success: true,
    message,
    data: responseData,
  });
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
  body('password').isStrongPassword({ ...PASSWORD_STRENGTH_OPTIONS })
    .withMessage(PASSWORD_STRENGTH_MESSAGE),
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

    const token = signUserToken(user);
    return sendAuthSessionResponse(req, res, {
      message: 'Email verified. Registration complete.',
      token,
      role: user.role || 'user',
      data: {
        user: serializeAuthUser(user),
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+password +passwordAuthEnabled +lockUntil');

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

    if (user.role === 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await user.resetLoginAttempts();
    const token = signUserToken(user);

    return sendAuthSessionResponse(req, res, {
      message: 'Login successful',
      token,
      role: user.role || 'user',
      data: {
        user: serializeAuthUser(user),
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
  body('credential').isString().trim().isLength({ min: 20 })
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

    const token = signUserToken(user);
    return sendAuthSessionResponse(req, res, {
      message: existingUser ? 'Login successful' : 'Account created successfully',
      token,
      role: user.role || 'user',
      data: {
        user: {
          ...serializeAuthUser(user),
        },
        isNewUser: !existingUser,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error.message);
    return res.status(error.statusCode || 401).json({
      success: false,
      message: error.publicMessage || 'Google sign-in failed. Please try again.'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/apple
// @desc    Sign in or create a user account with an Apple identity token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/apple', [
  body('identityToken').isString().trim().isLength({ min: 20 }),
  body('authorizationCode').isString().trim().isLength({ min: 20, max: 4096 }),
  body('email').optional().isEmail().normalizeEmail(emailNormalizationOptions),
  body('fullName').optional().isString().trim().isLength({ max: 120 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }
    if (process.env.APPLE_SIGN_IN_ENABLED !== 'true') {
      return res.status(503).json({ success: false, message: 'Apple sign-in is unavailable.' });
    }

    const appleUser = await verifyAppleIdentityToken(req.body.identityToken);
    const clientId = String(appleUser.aud || '').trim();
    const appleTokens = await exchangeAppleAuthorizationCode({
      authorizationCode: req.body.authorizationCode,
      clientId,
      expectedSubject: appleUser.sub,
    });
    const tokenEmail = String(appleUser.email || '').toLowerCase().trim();
    const { firstName, lastName } = splitDisplayName(req.body.fullName, 'Menorah', 'User');
    const session = await mongoose.startSession();
    let socialUserResult;
    try {
      await session.withTransaction(async () => {
        socialUserResult = await findOrCreateSocialUser({
          provider: 'apple',
          subject: appleUser.sub,
          email: tokenEmail,
          firstName,
          lastName,
          privateRelay: /privaterelay\.appleid\.com$/i.test(tokenEmail),
          session,
        });
        const encryptedRefreshToken = encryptAppleRefreshToken(
          appleTokens.refreshToken,
          { userId: socialUserResult.user._id, clientId }
        );
        const credentialUpdate = await User.updateOne(
          {
            _id: socialUserResult.user._id,
            isActive: true,
            'socialAuth.appleSub': appleUser.sub,
          },
          {
            $set: {
              'socialAuth.appleRefreshTokenEncrypted': encryptedRefreshToken,
              'socialAuth.appleClientId': clientId,
            },
          },
          { session }
        );
        if (credentialUpdate.matchedCount !== 1) {
          throw new Error('Apple credential persistence failed');
        }
      });
    } finally {
      await session.endSession();
    }
    const { user, existingUser } = socialUserResult;

    const token = signUserToken(user);
    return sendAuthSessionResponse(req, res, {
      message: existingUser ? 'Login successful' : 'Account created successfully',
      token,
      role: user.role || 'user',
      data: {
        user: serializeAuthUser(user),
        isNewUser: !existingUser,
      },
    });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode)
      && error.statusCode >= 400
      && error.statusCode <= 503
      ? error.statusCode
      : 500;
    const safeCode = typeof error.appleErrorCode === 'string'
      && /^APPLE_[A-Z0-9_]{1,56}$/.test(error.appleErrorCode)
      ? error.appleErrorCode
      : 'APPLE_AUTH_UNEXPECTED';
    console.error('Apple auth error code:', safeCode);
    return res.status(statusCode).json({
      success: false,
      message: error.publicMessage || (
        statusCode >= 500
          ? 'Apple sign-in is temporarily unavailable.'
          : 'Apple sign-in failed. Please try again.'
      )
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/verify-email
// @desc    Verify email with a 6-digit code (stored on User document)
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-email', [
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
  body('code').matches(/^\d{6}$/),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, code } = req.body;
    const verification = await getEmailVerificationCode(email);
    if (!verification) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    if (verification.attempts >= MAX_OTP_TRIES) {
      await deleteEmailVerificationCode(email);
      return res.status(400).json({ success: false, message: 'Too many failed attempts. Please request a new code.' });
    }

    if (!checkOTP(verification.otp, code)) {
      await updateEmailVerificationCode(email, { attempts: verification.attempts + 1 });
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    const user = await User.findOne({ email, isEmailVerified: false });
    if (!user || !user.isActive) {
      await deleteEmailVerificationCode(email);
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();
    await deleteEmailVerificationCode(email);

    if (user.role === 'admin') {
      return res.json({ success: true, message: 'Email verified successfully' });
    }

    const token = signUserToken(user);
    return sendAuthSessionResponse(req, res, {
      message: 'Email verified successfully',
      token,
      role: user.role || 'user',
    });
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
      await storeEmailVerificationCode(email, code);
      user.emailVerificationToken = undefined;
      await user.save();
      const { sendVerificationEmail } = require('../utils/email');
      const emailSent = await sendVerificationEmail(email, code);
      if (!emailSent) {
        await Promise.all([
          deleteEmailVerificationCode(email),
          releaseOtpResendCooldown(resendKey),
        ]);
      }
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
    const user = await User.findOne({ email, isActive: true });
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
    const parsed = new URL(raw);
    const { hostname, port } = parsed;
    const host = port ? `${hostname}:${port}` : hostname;
    const allowedProtocol = parsed.protocol === 'https:'
      || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:');
    if (!ALLOWED_REDIRECT_HOSTS.has(host) || !allowedProtocol) {
      return 'https://menorah.me';
    }
    return raw.replace(/\/$/, '');
  } catch {
    return 'https://menorah.me';
  }
};

router.get('/reset-password', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const destination = new URL('/reset-password', `${safeWebAppUrl()}/`);

  if (token) destination.hash = `token=${encodeURIComponent(token)}`;
  else destination.searchParams.set('error', 'missing-token');

  // New emails link directly to the web app with a fragment. This compatibility
  // route only upgrades old query-string links and prevents their caching.
  return res
    .status(303)
    .set('Cache-Control', 'no-store')
    .set('Referrer-Policy', 'no-referrer')
    .redirect(destination.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/reset-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isStrongPassword({ ...PASSWORD_STRENGTH_OPTIONS })
    .withMessage(PASSWORD_STRENGTH_MESSAGE),
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
      isActive: true,
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password             = password;
    user.passwordAuthEnabled  = true;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    revokeAllSessions(user, { passwordChanged: true });
    await user.save();
    clearMappedSessionCookie(req, res);

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
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({
      success: true,
      data: {
        user: serializeUserProfile(user)
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
    const token = req.auth?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (token) await blockToken(token);
    clearMappedSessionCookie(req, res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/logout-all', auth, async (req, res) => {
  try {
    revokeAllSessions(req.user);
    await req.user.save();

    const token = req.auth?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (token) await blockToken(token);
    clearMappedSessionCookie(req, res);

    res.json({ success: true, message: 'All sessions have been logged out successfully' });
  } catch (error) {
    console.error('Logout all error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
