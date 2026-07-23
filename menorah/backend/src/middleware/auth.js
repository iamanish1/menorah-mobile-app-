const crypto = require('crypto');
const User = require('../models/User');
const { getRedisClient } = require('../config/redis');
const {
  evaluateAccountAccess: evaluateCounsellorAccountAccess,
} = require('../services/counsellorVerificationExpiry');
const {
  isTokenVerificationError,
  verifyAdminToken,
  verifyAnyAccessToken,
  verifyUserToken,
} = require('../utils/authTokens');
const { isCurrentSessionToken } = require('../utils/sessionTokenBinding');
const { recordSecurityEvent } = require('../utils/securityAudit');
const { isRecentAdminMfa } = require('../services/payoutPolicy');
const {
  clearSessionCookie,
  getCookieToken,
  getWebSessionForRequest,
} = require('../config/webSessions');

const extractBearerToken = (req) => {
  const header = req.header('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const isTokenBlocked = async (token) => {
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const redis = getRedisClient();
    return !!(await redis.get(`blocked:token:${hash}`));
  } catch {
    if (process.env.NODE_ENV === 'production') {
      return true;
    }
    return false;
  }
};

const loadActiveUserForToken = async (decoded) => {
  if (!decoded?.userId) return null;

  const user = await User.findById(decoded.userId);
  if (!user || !user.isActive) return null;

  if (!isCurrentSessionToken(decoded, user)) return null;

  if (user.role === 'counsellor') {
    try {
      const professionalAccess = await evaluateCounsellorAccountAccess({
        account: user,
      });
      if (!professionalAccess.allowed) return null;
    } catch (error) {
      // Authentication must fail closed when an elapsed approval cannot be
      // reconciled safely. Log only the bounded code, never the profile.
      console.error(
        'Counsellor professional-access reconciliation failed:',
        error?.code || 'COUNSELLOR_EXPIRY_RECONCILIATION_FAILED'
      );
      return null;
    }
  }

  return user;
};

const recordAccessDenial = (req, res, {
  event = 'authentication_denied',
  reason,
  session,
  statusCode,
} = {}) => {
  res.locals.securityAuthorizationLogged = true;
  recordSecurityEvent(event, {
    req,
    user: req.user,
    outcome: 'failure',
    statusCode,
    details: {
      reason,
      transport: session ? 'cookie' : (req.auth?.transport || 'bearer'),
    },
  });
};

const authFailure = (
  req,
  res,
  {
    status = 401,
    message = 'Invalid token.',
    reason = 'invalid_token',
    session,
  } = {}
) => {
  if (session) clearSessionCookie(res, session.role);
  recordAccessDenial(req, res, { reason, session, statusCode: status });
  res.status(status).json({ success: false, message });
  return false;
};

const authorizationFailure = (
  req,
  res,
  {
    code,
    message = 'Access denied.',
    reason = 'insufficient_role',
    session,
  } = {}
) => {
  recordAccessDenial(req, res, {
    event: 'authorization_denied',
    reason,
    session,
    statusCode: 403,
  });
  res.status(403).json({
    success: false,
    ...(code ? { code } : {}),
    message,
  });
  return false;
};

const authenticateToken = async (req, res, token, verifyToken, { optional = false, session = null } = {}) => {
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    if (optional) return null;
    if (isTokenVerificationError(error)) {
      return authFailure(req, res, { reason: 'invalid_or_expired_token', session });
    }
    throw error;
  }

  if (await isTokenBlocked(token)) {
    if (optional) return null;
    return authFailure(req, res, { reason: 'revoked_token', session });
  }

  const user = await loadActiveUserForToken(decoded);
  if (!user) {
    if (optional) return null;
    return authFailure(req, res, { reason: 'account_binding_invalid', session });
  }

  if (session && user.role !== session.role) {
    if (optional) return null;
    return authFailure(req, res, {
      status: 403,
      message: 'Access denied. Session cookie is not valid for this origin.',
      reason: 'session_origin_role_mismatch',
      session,
    });
  }

  req.user = user;
  req.auth = {
    token,
    decoded,
    transport: session ? 'cookie' : 'bearer',
    cookieName: session?.cookieName,
    origin: session?.origin,
    role: session?.role,
  };
  return user;
};

const authenticateWithVerifier = async (req, res, verifyToken, { optional = false } = {}) => {
  const webSession = getWebSessionForRequest(req);
  if (webSession) {
    if (!['user', 'counsellor'].includes(webSession.role)) {
      if (optional) return null;
      return authorizationFailure(req, res, {
        message: 'Access denied. Browser origin is not allowed for this API.',
        reason: 'browser_origin_role_mismatch',
        session: webSession,
      });
    }

    const cookieToken = getCookieToken(req, webSession.cookieName);
    if (!cookieToken) {
      if (optional) return null;
      return authFailure(req, res, {
        message: 'Access denied. No browser session provided.',
        reason: 'missing_cookie_session',
        session: webSession,
      });
    }

    return authenticateToken(req, res, cookieToken, verifyToken, { optional, session: webSession });
  }

  const token = extractBearerToken(req);
  if (!token) {
    if (optional) return null;
    return authFailure(req, res, {
      message: 'Access denied. No token provided.',
      reason: 'missing_bearer_token',
    });
  }

  return authenticateToken(req, res, token, verifyToken, { optional });
};

const authenticateAny = async (req, res, { optional = false } = {}) => {
  const webSession = getWebSessionForRequest(req);
  if (webSession) {
    const cookieToken = getCookieToken(req, webSession.cookieName);
    if (!cookieToken) {
      if (optional) return null;
      return authFailure(req, res, {
        message: 'Access denied. No browser session provided.',
        reason: 'missing_cookie_session',
        session: webSession,
      });
    }

    const verifyToken = webSession.role === 'admin' ? verifyAdminToken : verifyUserToken;
    return authenticateToken(req, res, cookieToken, verifyToken, { optional, session: webSession });
  }

  const token = extractBearerToken(req);

  if (!token) {
    if (optional) return null;
    return authFailure(req, res, {
      message: 'Access denied. No token provided.',
      reason: 'missing_bearer_token',
    });
  }

  // Verification is completed before any response is written, so a
  // user-audience miss can safely fall through to the admin verifier.
  return authenticateToken(req, res, token, verifyAnyAccessToken, { optional });
};

const sendAuthMiddlewareError = (res, label, error) => {
  console.error(label, error?.code || error?.name || 'AUTH_MIDDLEWARE_FAILURE');
  if (!res.headersSent) {
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const auth = async (req, res, next) => {
  try {
    const user = await authenticateWithVerifier(req, res, verifyUserToken);
    if (!user) return;
    next();
  } catch (error) {
    sendAuthMiddlewareError(res, 'Auth middleware error:', error);
  }
};

const authAny = async (req, res, next) => {
  try {
    const user = await authenticateAny(req, res);
    if (!user) return;
    next();
  } catch (error) {
    sendAuthMiddlewareError(res, 'Auth-any middleware error:', error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    await authenticateWithVerifier(req, res, verifyUserToken, { optional: true });
    next();
  } catch {
    next();
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const webSession = getWebSessionForRequest(req);
    if (webSession && webSession.role !== 'admin') {
      return authorizationFailure(req, res, {
        message: 'Access denied. Admin origin required.',
        reason: 'admin_origin_required',
        session: webSession,
      });
    }

    const cookieToken = webSession ? getCookieToken(req, webSession.cookieName) : null;
    if (webSession && !cookieToken) {
      return authFailure(req, res, {
        message: 'Access denied. No browser session provided.',
        reason: 'missing_cookie_session',
        session: webSession,
      });
    }

    const user = webSession
      ? await authenticateToken(req, res, cookieToken, verifyAdminToken, { session: webSession })
      : await authenticateWithVerifier(req, res, verifyAdminToken);
    if (!user) return;

    if (user.role !== 'admin') {
      return authorizationFailure(req, res, {
        message: 'Access denied. Admin privileges required.',
        reason: 'admin_role_required',
      });
    }

    next();
  } catch (error) {
    sendAuthMiddlewareError(res, 'Admin auth middleware error:', error);
  }
};

const requireRecentAdminMfa = (req, res, next) => {
  if (!isRecentAdminMfa(req.auth?.decoded)) {
    return authorizationFailure(req, res, {
      code: 'ADMIN_MFA_FRESHNESS_REQUIRED',
      message: 'A fresh multi-factor authenticated admin session is required for this action.',
      reason: 'admin_mfa_freshness_required',
    });
  }
  return next();
};

const counsellorAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user?.role !== 'counsellor') {
      return authorizationFailure(req, res, {
        message: 'Access denied. Counsellor privileges required.',
        reason: 'counsellor_role_required',
      });
    }
    next();
  });
};

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
  requireRecentAdminMfa,
  counsellorAuth,
  authAny,
  isTokenBlocked,
  extractBearerToken,
};
