const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { adminAuth, requireRecentAdminMfa } = require('../middleware/auth');
const {
  requireAssignedAdminRole,
} = require('../middleware/adminAuthorization');
const { getRedisClient } = require('../config/redis');
const {
  resolveAdminRoleGrant,
} = require('../config/adminPermissions');
const {
  resolvePrivacyAdminGrant,
} = require('../config/privacyAdminPermissions');
const {
  PASSWORD_STRENGTH_MESSAGE,
  PASSWORD_STRENGTH_OPTIONS,
} = require('../config/passwordPolicy');
const { sendOTPEmail, sendVerificationEmail } = require('../utils/email');
const { signAdminToken } = require('../utils/authTokens');
const { revokeAllSessions, disconnectUserSockets } = require('../utils/sessionLifecycle');
const { recordSecurityEvent } = require('../utils/securityAudit');
const {
  adminMfaKey,
  createAdminMfaChallengeRecord,
  consumeAdminMfaChallenge,
} = require('../services/adminMfaChallenge');
const { normalizeEmail, emailNormalizationOptions } = require('../utils/emailNormalization');
const { hashOtp, consumeOtp } = require('../utils/redisOtp');
const {
  clearMappedSessionCookie,
  isCookieTransportRequested,
  setSessionCookieForRequest,
} = require('../config/webSessions');

const router = express.Router();
router.use((_req, res, next) => {
  res.locals.authenticationSubject = 'admin';
  next();
});

const ADMIN_EMAIL_VERIFICATION_TTL_SECONDS = 10 * 60;
const ADMIN_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
const MAX_ADMIN_EMAIL_VERIFICATION_ATTEMPTS = 5;
// Keep this challenge namespace separate from the patient API. The admin API
// must never consume or overwrite an OTP issued for a non-admin account.
const adminEmailVerificationKey = (email) => `pending:admin-email-verification:${email}`;
const adminEmailVerificationResendKey = (email) => `pending:admin-email-verification:resend:${email}`;

const isAdminMfaRequired = () =>
  process.env.ADMIN_MFA_REQUIRED === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.ADMIN_MFA_REQUIRED !== 'false');

const recordAdminLoginAccessDenial = (req, res, user, {
  reason,
  statusCode,
}) => {
  res.locals.securityAuthorizationLogged = true;
  try {
    recordSecurityEvent('admin_permission_denied', {
      req,
      user,
      outcome: 'failure',
      statusCode,
      details: { reason },
    });
  } catch (error) {
    console.error(
      'Admin login authorization audit error:',
      error?.code || error?.name || 'ADMIN_LOGIN_AUTHORIZATION_AUDIT_FAILED'
    );
  }
};

const authorizeAdminLogin = (req, res, user) => {
  const grant = resolveAdminRoleGrant({
    adminId: user?._id,
    env: process.env,
  });
  res.locals.securityActor = user;
  if (!grant.configured) {
    recordAdminLoginAccessDenial(req, res, user, {
      reason: 'admin_role_configuration_invalid',
      statusCode: 503,
    });
    res.status(503).json({
      success: false,
      code: 'ADMIN_ROLE_CONFIGURATION_INVALID',
      message: 'Administration is temporarily unavailable.',
    });
    return false;
  }
  if (!grant.role) {
    recordAdminLoginAccessDenial(req, res, user, {
      reason: 'admin_role_assignment_required',
      statusCode: 403,
    });
    res.status(403).json({
      success: false,
      code: 'ADMIN_ROLE_ASSIGNMENT_REQUIRED',
      message: 'This admin account has no operational role assignment.',
    });
    return false;
  }
  return true;
};

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

const serializeAdmin = (user) => {
  const operationalGrant = resolveAdminRoleGrant({
    adminId: user._id,
    env: process.env,
  });
  const privacyPermissions = operationalGrant.permissions.includes('privacy_access')
    ? resolvePrivacyAdminGrant({
        adminId: user._id,
        env: process.env,
      }).permissions
    : [];
  return {
  _id: user._id.toString(),
  id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  operationalRole: operationalGrant.role,
  operationalPermissions: operationalGrant.permissions,
  privacyPermissions,
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: user.isPhoneVerified,
  profileImage: user.profileImage || null,
  };
};

const findUnverifiedActiveAdmin = (email) => User.findOne({
  email: normalizeEmail(email),
  role: 'admin',
  isActive: true,
  isEmailVerified: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/verify-email
// @desc    Verify an admin email address without issuing a session
// @access  Public (admin accounts only)
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

    const email = normalizeEmail(req.body.email);
    // Check the role before consuming the OTP so a request to the admin host
    // can never invalidate a patient or counsellor verification challenge.
    const user = await findUnverifiedActiveAdmin(email);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    const otpResult = await consumeOtp(
      getRedisClient(),
      adminEmailVerificationKey(email),
      req.body.code,
      MAX_ADMIN_EMAIL_VERIFICATION_ATTEMPTS,
    );
    if (otpResult.status !== 1) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    // Verification changes only account state. Admins must begin a new login
    // (and complete MFA when enabled) before any session is issued.
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    return res.json({ success: true, message: 'Email verified successfully. Please sign in.' });
  } catch (error) {
    console.error('Admin email verification error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/resend-email-verification
// @desc    Send an admin email-verification code without account enumeration
// @access  Public (admin accounts only)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resend-email-verification', [
  body('email').isEmail().normalizeEmail(emailNormalizationOptions),
], async (req, res) => {
  const genericResponse = {
    success: true,
    message: 'If an unverified admin account exists for that email, a new code has been sent.',
  };

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.json(genericResponse);

    const email = normalizeEmail(req.body.email);
    const user = await findUnverifiedActiveAdmin(email);
    if (!user) return res.json(genericResponse);

    const redis = getRedisClient();
    const resendKey = adminEmailVerificationResendKey(email);
    const acquired = await redis.set(resendKey, '1', {
      EX: ADMIN_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      NX: true,
    });
    if (acquired !== 'OK') return res.json(genericResponse);

    const code = crypto.randomInt(100000, 999999).toString();
    await redis.setEx(
      adminEmailVerificationKey(email),
      ADMIN_EMAIL_VERIFICATION_TTL_SECONDS,
      JSON.stringify({ otp: hashOtp(code), attempts: 0 }),
    );

    const sent = await sendVerificationEmail(email, code);
    if (!sent) {
      await Promise.all([
        redis.del(adminEmailVerificationKey(email)),
        redis.del(resendKey),
      ]);
    }
  } catch (error) {
    // Preserve the non-enumerating contract while retaining a server-side log
    // that operators can use to investigate email delivery failures.
    console.error('Admin resend email verification error:', error.message);
  }

  return res.json(genericResponse);
});

router.post(['/login', '/admin/login'], [
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
    if (!authorizeAdminLogin(req, res, user)) return;

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
    if (!authorizeAdminLogin(req, res, user)) return;

    // A correct MFA code proves possession of the challenge, not that the
    // account has crossed the email-verification authorization boundary.
    // Consume the one-time challenge but never issue a session here.
    if (!user.isEmailVerified) {
      clearMappedSessionCookie(req, res);
      return res.status(403).json({
        success: false,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification is required before you can sign in.',
        data: { email: user.email },
      });
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

router.get('/me', adminAuth, requireAssignedAdminRole, async (req, res) => {
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

router.put(
  ['/change-password', '/admin/change-password'],
  adminAuth,
  requireAssignedAdminRole,
  requireRecentAdminMfa,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required')
      .isLength({ max: 128 })
      .withMessage('Current password is invalid'),
    body('newPassword')
      .isStrongPassword({ ...PASSWORD_STRENGTH_OPTIONS })
      .withMessage(PASSWORD_STRENGTH_MESSAGE),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const user = await User.findById(req.user._id)
        .select('+password +passwordAuthEnabled');
      if (!user || !user.isActive || user.role !== 'admin') {
        return res.status(404).json({
          success: false,
          message: 'Admin account not found.',
        });
      }

      const currentPasswordValid = await user.comparePassword(req.body.currentPassword);
      if (!currentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect.',
        });
      }
      if (await user.comparePassword(req.body.newPassword)) {
        return res.status(409).json({
          success: false,
          message: 'New password must be different from the current password.',
        });
      }

      user.password = req.body.newPassword;
      user.passwordAuthEnabled = true;
      revokeAllSessions(user, { passwordChanged: true });
      await user.save();

      const token = req.auth?.token || req.header('Authorization')?.replace(/^Bearer\s+/i, '');
      if (token) await blockToken(token);
      clearMappedSessionCookie(req, res);
      res.locals.securitySessionRevoked = user;
      res.locals.securitySessionRevocationAction = 'admin_password_changed';
      return res.json({
        success: true,
        message: 'Password changed. Sign in again on every device.',
      });
    } catch (error) {
      console.error(
        'Admin change password error:',
        error?.code || error?.name || 'ADMIN_PASSWORD_CHANGE_FAILED'
      );
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(['/logout', '/admin/logout'], adminAuth, async (req, res) => {
  try {
    const token = req.auth?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (token) await blockToken(token);
    clearMappedSessionCookie(req, res);
    disconnectUserSockets(req.app.get('io'), req.user, 'admin_logout');
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
    disconnectUserSockets(req.app.get('io'), req.user, 'admin_logout_all');
    return res.json({ success: true, message: 'All sessions have been logged out successfully' });
  } catch (error) {
    console.error('Admin logout all error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
