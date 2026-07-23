const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { adminAuth } = require('../middleware/auth');
const { getRedisClient } = require('../config/redis');
const {
  resolvePrivacyAdminGrant,
} = require('../config/privacyAdminPermissions');
const { sendOTPEmail } = require('../utils/email');
const { signAdminToken } = require('../utils/authTokens');
const { revokeAllSessions } = require('../utils/sessionLifecycle');
const {
  adminMfaKey,
  createAdminMfaChallengeRecord,
  consumeAdminMfaChallenge,
} = require('../services/adminMfaChallenge');
const {
  clearMappedSessionCookie,
  isCookieTransportRequested,
  setSessionCookieForRequest,
} = require('../config/webSessions');

const router = express.Router();

const isAdminMfaRequired = () =>
  process.env.ADMIN_MFA_REQUIRED === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.ADMIN_MFA_REQUIRED !== 'false');

const createAdminMfaChallenge = async (user) => {
  const challengeId = crypto.randomUUID();
  const otp = crypto.randomInt(100000, 999999).toString();

  await createAdminMfaChallengeRecord({
    redis: getRedisClient(),
    challengeId,
    userId: user._id.toString(),
    otp,
  });

  const sent = await sendOTPEmail(user.email, otp, `${user.firstName} ${user.lastName}`);
  if (!sent) {
    await getRedisClient().del(adminMfaKey(challengeId));
    throw new Error('Failed to send admin MFA code');
  }

  return challengeId;
};

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

const sendAdminSessionResponse = (req, res, { message, token, user }) => {
  const data = {
    user: serializeAdmin(user),
    mfaRequired: false,
  };

  let transport = 'bearer';
  if (isCookieTransportRequested(req)) {
    const sessionResult = setSessionCookieForRequest(req, res, { role: 'admin', token });
    if (!sessionResult.ok) {
      return res.status(sessionResult.status).json({ success: false, message: sessionResult.message });
    }
    transport = 'cookie';
  } else {
    data.token = token;
  }

  res.locals.securityActor = user;
  res.locals.securitySessionCreated = true;
  res.locals.securitySessionTransport = transport;

  return res.json({
    success: true,
    message,
    data,
  });
};

const serializeAdmin = (user) => ({
  _id: user._id.toString(),
  id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  privacyPermissions: resolvePrivacyAdminGrant({
    adminId: user._id,
    env: process.env,
  }).permissions,
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: user.isPhoneVerified,
  profileImage: user.profileImage || null,
});

router.post(['/login', '/admin/login'], [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password +lockUntil');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isLocked()) {
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin accounts only.' });
    }

    if (isAdminMfaRequired()) {
      const challengeId = await createAdminMfaChallenge(user);
      return res.json({
        success: true,
        message: 'MFA verification required',
        data: {
          mfaRequired: true,
          challengeId,
        },
      });
    }

    await user.resetLoginAttempts();
    const token = signAdminToken(user);

    return sendAdminSessionResponse(req, res, {
      message: 'Login successful',
      token,
      user,
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post(['/login/mfa', '/admin/login/mfa'], [
  body('challengeId').isUUID(),
  body('otp').matches(/^\d{6}$/),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired MFA challenge' });
    }

    const { challengeId, otp } = req.body;
    const challenge = await consumeAdminMfaChallenge({
      redis: getRedisClient(),
      challengeId,
      otp,
    });
    if (!challenge) {
      return res.status(401).json({ success: false, message: 'Invalid or expired MFA challenge' });
    }

    const user = await User.findById(challenge.userId).select('+lockUntil');
    if (!user || !user.isActive || user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid or expired MFA challenge' });
    }

    await user.resetLoginAttempts();

    const token = signAdminToken(user, { mfaAuthenticatedAt: Date.now() });
    return sendAdminSessionResponse(req, res, {
      message: 'Login successful',
      token,
      user,
    });
  } catch (error) {
    console.error('Admin MFA login error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/me', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      '-password -emailVerificationToken -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil'
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({
      success: true,
      data: { user: serializeAdmin(user) },
    });
  } catch (error) {
    console.error('Get current admin error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post(['/logout', '/admin/logout'], adminAuth, async (req, res) => {
  try {
    const token = req.auth?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (token) await blockToken(token);
    clearMappedSessionCookie(req, res);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Admin logout error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post(['/logout-all', '/admin/logout-all'], adminAuth, async (req, res) => {
  try {
    revokeAllSessions(req.user);
    await req.user.save();

    const token = req.auth?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (token) await blockToken(token);
    clearMappedSessionCookie(req, res);
    return res.json({ success: true, message: 'All sessions have been logged out successfully' });
  } catch (error) {
    console.error('Admin logout all error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
