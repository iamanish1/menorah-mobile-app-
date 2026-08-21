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
const { signUserToken } = require('../utils/authTokens');
const { revokeAllSessions, disconnectUserSockets } = require('../utils/sessionLifecycle');
const { serializeAuthUser, serializeUserProfile } = require('../serializers/userSerializer');
const { emailNormalizationOptions, normalizeEmail } = require('../utils/emailNormalization');
const { passwordValidator } = require('../utils/passwordPolicy');
const { consumeOtp, replaceOtp } = require('../utils/redisOtp');
const { buildPasswordResetUrl, issuePasswordResetToken } = require('../utils/passwordResetUrl');
const {
  clearMappedSessionCookie,
  isCookieTransportRequested,
  setSessionCookieForRequest,
} = require('../config/webSessions');

const router = express.Router();
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
  privateRelay = false,
  intent = 'signin',
}) => {
  const normalizedEmail = normalizeEmail(email);
  const socialPath = provider === 'apple' ? 'socialAuth.appleSub' : 'socialAuth.googleSub';

  let user = await User.findOne({ [socialPath]: subject });
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

    if (!user.isEmailVerified) {
      const error = new Error('Email verification is required for this social account');
      error.statusCode = 403;
      error.code = 'EMAIL_VERIFICATION_REQUIRED';
      error.publicMessage = 'Email verification is required before you can sign in.';
      // This comes from the linked account in Mongo, never from the provider
      // token/body, so clients can safely start the existing OTP flow.
      error.data = { email: user.email };
      throw error;
    }

    return { user, existingUser: true };
  }

  if (intent !== 'signup') {
    const error = new Error('Social sign-in account was not found');
    error.statusCode = 404;
    error.code = 'ACCOUNT_NOT_FOUND';
    error.data = { nextIntent: 'signup' };
    error.publicMessage = 'No Menorah account is linked to this social identity. Choose sign up to create one.';
    throw error;
  }

  if (!normalizedEmail) {
    const error = new Error('Social auth email is required for a new account');
    error.statusCode = 409;
    error.publicMessage = 'Sign in with an account that shares a verified email, or use email and password first.';
    throw error;
  }

  const existingEmailUser = await User.findOne({ email: normalizedEmail });
  if (existingEmailUser) {
    const error = new Error('Social auth requires explicit account linking');
    error.statusCode = 409;
    error.code = 'SOCIAL_ACCOUNT_LINK_REQUIRED';
    error.publicMessage = 'An account already exists with this email. Sign in with email and password first, then link social sign-in from settings.';
    throw error;
  }

  try {
    user = await User.create({
      email: normalizedEmail,
      phone: null,
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
      profileCompleted: false,
      socialAuth: {
        googleSub: provider === 'google' ? subject : undefined,
        appleSub: provider === 'apple' ? subject : undefined,
        appleEmailPrivateRelay: provider === 'apple' ? Boolean(privateRelay) : undefined
      }
    });
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
  body('password').custom(passwordValidator),
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
    const otpResult = await consumeOtp(getRedisClient(), pendingRegistrationKey(email), otp, MAX_OTP_TRIES);

    if (otpResult.status === 0) {
      return res.status(400).json({ success: false, message: 'Registration session expired. Please register again.' });
    }
    if (otpResult.status === 2 || otpResult.status === 3) {
      return res.status(400).json({ success: false, message: 'Too many failed attempts. Please register again.' });
    }
    if (otpResult.status !== 1 || !otpResult.value) {
      const remaining = otpResult.remaining;
      return res.status(400).json({
        success: false,
        message: remaining > 0 ? `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` : 'Invalid OTP.',
      });
    }

    const pending = otpResult.value;

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
    try {
      await user.save();
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: 'An account with this email or phone number already exists.' });
      }
      throw error;
    }
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

    const newOtp = crypto.randomInt(100000, 999999).toString();
    if (!await replaceOtp(getRedisClient(), pendingRegistrationKey(email), newOtp)) {
      await releaseOtpResendCooldown(resendKey);
      return res.status(400).json({ success: false, message: 'Registration session expired. Please register again.' });
    }

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
    const user = await User.findOne({ email: normalizeEmail(email) }).select('+password +lockUntil');

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

    if (!user.isEmailVerified) {
      await user.resetLoginAttempts();
      clearMappedSessionCookie(req, res);
      return res.status(403).json({
        success: false,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification is required before you can sign in.',
        data: { email: user.email },
      });
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
  body('credential').isString().trim().isLength({ min: 20 }),
  body('intent').optional().isIn(['signin', 'signup']),
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
      profileImage: googleUser.picture || null,
      intent: req.body.intent || 'signin',
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
      ...(error.code ? { code: error.code } : {}),
      ...(error.data ? { data: error.data } : {}),
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
  // Apple only provides the user's email/name on the first authorization.
  // Native clients may serialize the absent values as null on repeat sign-in,
  // which is equivalent to omitting them for an already-linked subject.
  body('email').optional({ values: 'null' }).isEmail().normalizeEmail(emailNormalizationOptions),
  body('fullName').optional({ values: 'null' }).isString().trim().isLength({ max: 120 }),
  body('intent').optional().isIn(['signin', 'signup']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const appleUser = await verifyAppleIdentityToken(req.body.identityToken);
    // Only a signed Apple email claim can create an account. A client-supplied
    // email is intentionally ignored here: accepting it for an unknown Apple
    // subject would let an attacker pre-empt another person's email account.
    // Apple may omit the claim on subsequent authorizations; those still work
    // when the subject is already linked because that lookup happens first.
    const tokenEmail = normalizeEmail(appleUser.email);
    const { firstName, lastName } = splitDisplayName(req.body.fullName, 'Menorah', 'User');
    const { user, existingUser } = await findOrCreateSocialUser({
      provider: 'apple',
      subject: appleUser.sub,
      email: tokenEmail,
      firstName,
      lastName,
      privateRelay: /privaterelay\.appleid\.com$/i.test(tokenEmail),
      intent: req.body.intent || 'signin',
    });

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
    console.error('Apple auth error:', error.message);
    return res.status(error.statusCode || 401).json({
      success: false,
      ...(error.code ? { code: error.code } : {}),
      ...(error.data ? { data: error.data } : {}),
      message: error.publicMessage || 'Apple sign-in failed. Please try again.'
    });
  }
});

const verifySocialLinkCredential = async ({ provider, providerToken, email, fullName }) => {
  if (provider === 'google') {
    const googleUser = await verifyGoogleCredential(providerToken);
    const { firstName, lastName } = splitGoogleName(googleUser);
    return {
      subject: googleUser.sub,
      email: normalizeEmail(googleUser.email),
      firstName,
      lastName,
      profileImage: googleUser.picture || null,
      privateRelay: false,
    };
  }

  const appleUser = await verifyAppleIdentityToken(providerToken);
  const tokenEmail = normalizeEmail(appleUser.email || email);
  const { firstName, lastName } = splitDisplayName(fullName, 'Menorah', 'User');
  return {
    subject: appleUser.sub,
    email: tokenEmail,
    firstName,
    lastName,
    privateRelay: /privaterelay\.appleid\.com$/i.test(tokenEmail),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/social/link
// @desc    Link a verified OAuth subject after password re-authentication
// @access  Verified patient account
// ─────────────────────────────────────────────────────────────────────────────
router.post('/social/link', [
  body('provider').isIn(['google', 'apple']),
  body('providerToken').isString().trim().isLength({ min: 20 }),
  body('currentPassword').isString().isLength({ min: 1 }),
  body('email').optional({ values: 'null' }).isEmail().normalizeEmail(emailNormalizationOptions),
  body('fullName').optional({ values: 'null' }).isString().trim().isLength({ max: 120 }),
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only patient accounts can link social sign-in.' });
    }

    const { provider, providerToken, currentPassword, email, fullName } = req.body;
    const identity = await verifySocialLinkCredential({ provider, providerToken, email, fullName });
    const socialPath = provider === 'apple' ? 'socialAuth.appleSub' : 'socialAuth.googleSub';
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is no longer active.' });
    }
    if (!await user.comparePassword(currentPassword)) {
      return res.status(400).json({
        success: false,
        code: 'CURRENT_PASSWORD_INCORRECT',
        message: 'Current password is incorrect.',
      });
    }

    const owner = await User.findOne({ [socialPath]: identity.subject }).select('_id');
    if (owner && owner._id.toString() !== user._id.toString()) {
      return res.status(409).json({
        success: false,
        code: 'SOCIAL_IDENTITY_ALREADY_LINKED',
        message: 'This social account is already linked to another Menorah account.',
      });
    }
    if (user.get(socialPath) && user.get(socialPath) !== identity.subject) {
      return res.status(409).json({
        success: false,
        code: 'SOCIAL_PROVIDER_ALREADY_LINKED',
        message: 'A different account for this provider is already linked. Contact support to change it.',
      });
    }

    user.set(socialPath, identity.subject);
    if (provider === 'apple') user.socialAuth.appleEmailPrivateRelay = identity.privateRelay;
    await user.save();
    return res.json({
      success: true,
      message: `${provider === 'google' ? 'Google' : 'Apple'} sign-in linked successfully.`,
      data: { user: serializeUserProfile(user) },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'SOCIAL_IDENTITY_ALREADY_LINKED',
        message: 'This social account is already linked to another Menorah account.',
      });
    }
    console.error('Social account link error:', error.message);
    return res.status(error.statusCode || 401).json({
      success: false,
      message: error.publicMessage || 'Could not link this social account. Please try again.',
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
    // Admin verification is deliberately owned by the api-admin profile and
    // its separate OTP namespace. A public/user API host must never verify an
    // admin account or create an admin-adjacent session path.
    const user = await User.findOne({
      email,
      isEmailVerified: false,
      role: { $ne: 'admin' },
    });
    if (!user || !user.isActive) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    const otpResult = await consumeOtp(getRedisClient(), emailVerificationKey(email), code, MAX_OTP_TRIES);
    if (otpResult.status === 0 || otpResult.status === 2 || otpResult.status === 3) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }
    if (otpResult.status !== 1) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

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
    // Keep admin verification entirely on api-admin. This prevents a code
    // issued by the user-facing API from being usable for an admin account.
    const user = await User.findOne({
      email,
      isEmailVerified: false,
      role: { $ne: 'admin' },
    });
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
    const user = await User.findOne({
      email,
      role: { $in: ['user', 'counsellor'] },
    }).select('+passwordResetToken +passwordResetExpires');
    if (user) {
      const previousResetToken = user.passwordResetToken;
      const previousResetExpires = user.passwordResetExpires;
      const resetToken = issuePasswordResetToken(user);
      const issuedResetTokenHash = user.passwordResetToken;
      await user.save();

      let emailSent = false;
      try {
        emailSent = await sendPasswordResetEmail(user.email, resetToken, { role: user.role });
      } catch (emailError) {
        console.error('Password reset email delivery error:', emailError.message);
      }

      if (!emailSent) {
        const rollbackUpdate = {};
        const rollbackSet = {};
        const rollbackUnset = {};

        if (previousResetToken) rollbackSet.passwordResetToken = previousResetToken;
        else rollbackUnset.passwordResetToken = '';
        if (previousResetExpires) rollbackSet.passwordResetExpires = previousResetExpires;
        else rollbackUnset.passwordResetExpires = '';

        if (Object.keys(rollbackSet).length) rollbackUpdate.$set = rollbackSet;
        if (Object.keys(rollbackUnset).length) rollbackUpdate.$unset = rollbackUnset;

        // Compare-and-swap prevents a failed delivery from overwriting a token
        // issued by a newer concurrent request. Perfect ordering across several
        // simultaneous delivery failures would require a transactional outbox.
        await User.updateOne({
          _id: user._id,
          passwordResetToken: issuedResetTokenHash,
        }, rollbackUpdate).catch((rollbackError) => {
          console.error('Password reset token rollback error:', rollbackError.message);
        });
      }
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
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(400).json({ success: false, message: 'Missing reset token' });
  // The configured URL is HTTPS and points at the verified app domain. It can
  // be handled by a browser, Android App Link, or iOS Universal Link without
  // the API serving inline script/style that conflicts with the API CSP.
  return res.redirect(302, buildPasswordResetUrl(token));
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/reset-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').custom(passwordValidator),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { token, password } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Reject unknown and expired tokens before the intentionally expensive
    // bcrypt operation. The final update below remains the authoritative,
    // atomic claim in case the token expires or is redeemed after this check.
    const resetTokenExists = await User.exists({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      role: { $in: ['user', 'counsellor'] },
    });
    if (!resetTokenExists) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
    // Establish the expiry boundary immediately before the atomic claim. A
    // slow bcrypt operation must not allow a token that expired meanwhile.
    const revokedAt = new Date();
    // Claim and consume the reset token in the same update that changes the
    // password. Parallel requests cannot both redeem the same token.
    const user = await User.findOneAndUpdate({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: revokedAt },
      role: { $in: ['user', 'counsellor'] },
    }, {
      $set: {
        password: passwordHash,
        loginAttempts: 0,
        lastSessionRevokedAt: revokedAt,
        lastPasswordChangeAt: revokedAt,
      },
      $unset: {
        lockUntil: '',
        passwordResetToken: '',
        passwordResetExpires: '',
      },
      $inc: { sessionVersion: 1 },
    }, { new: true });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    clearMappedSessionCookie(req, res);
    disconnectUserSockets(req.app.get('io'), user, 'password_reset');

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
    disconnectUserSockets(req.app.get('io'), req.user, 'logout');
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
    disconnectUserSockets(req.app.get('io'), req.user, 'logout_all');

    res.json({ success: true, message: 'All sessions have been logged out successfully' });
  } catch (error) {
    console.error('Logout all error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
