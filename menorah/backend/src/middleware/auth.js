const crypto = require('crypto');
const User = require('../models/User');
const { getRedisClient } = require('../config/redis');
const {
  evaluateAccountAccess: evaluateCounsellorAccountAccess,
} = require('../services/counsellorVerificationExpiry');
const { verifyUserToken, verifyAdminToken } = require('../utils/authTokens');
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

  if ((decoded.sessionVersion || 0) !== (user.sessionVersion || 0)) {
    return null;
  }

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

const authFailure = (res, { status = 401, message = 'Invalid token.', session } = {}) => {
  if (session) clearSessionCookie(res, session.role);
  res.status(status).json({ success: false, message });
  return false;
};

const authenticateToken = async (req, res, token, verifyToken, { optional = false, session = null } = {}) => {
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    if (optional) return null;
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return authFailure(res, { session });
    }
    throw error;
  }

  if (await isTokenBlocked(token)) {
    if (optional) return null;
    return authFailure(res, { session });
  }

  const user = await loadActiveUserForToken(decoded);
  if (!user) {
    if (optional) return null;
    return authFailure(res, { session });
  }

  if (session && user.role !== session.role) {
    if (optional) return null;
    return authFailure(res, {
      status: 403,
      message: 'Access denied. Session cookie is not valid for this origin.',
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
      return authFailure(res, {
        status: 403,
        message: 'Access denied. Browser origin is not allowed for this API.',
      });
    }

    const cookieToken = getCookieToken(req, webSession.cookieName);
    if (!cookieToken) {
      if (optional) return null;
      return authFailure(res, {
        message: 'Access denied. No browser session provided.',
        session: webSession,
      });
    }

    return authenticateToken(req, res, cookieToken, verifyToken, { optional, session: webSession });
  }

  const token = extractBearerToken(req);
  if (!token) {
    if (optional) return null;
    res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    return false;
  }

  return authenticateToken(req, res, token, verifyToken, { optional });
};

const authenticateAny = async (req, res, { optional = false } = {}) => {
  const webSession = getWebSessionForRequest(req);
  if (webSession) {
    const cookieToken = getCookieToken(req, webSession.cookieName);
    if (!cookieToken) {
      if (optional) return null;
      return authFailure(res, {
        message: 'Access denied. No browser session provided.',
        session: webSession,
      });
    }

    const verifyToken = webSession.role === 'admin' ? verifyAdminToken : verifyUserToken;
    return authenticateToken(req, res, cookieToken, verifyToken, { optional, session: webSession });
  }

  const token = extractBearerToken(req);

  if (!token) {
    if (optional) return null;
    res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    return false;
  }

  for (const verifyToken of [verifyUserToken, verifyAdminToken]) {
    try {
      return await authenticateToken(req, res, token, verifyToken, { optional });
    } catch (error) {
      if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
        throw error;
      }
    }
  }

  if (optional) return null;
  res.status(401).json({ success: false, message: 'Invalid token.' });
  return false;
};

const auth = async (req, res, next) => {
  try {
    const user = await authenticateWithVerifier(req, res, verifyUserToken);
    if (!user) return;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const authAny = async (req, res, next) => {
  try {
    const user = await authenticateAny(req, res);
    if (!user) return;
    next();
  } catch (error) {
    console.error('Auth-any middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
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
      return res.status(403).json({ success: false, message: 'Access denied. Admin origin required.' });
    }

    const cookieToken = webSession ? getCookieToken(req, webSession.cookieName) : null;
    if (webSession && !cookieToken) {
      return authFailure(res, {
        message: 'Access denied. No browser session provided.',
        session: webSession,
      });
    }

    const user = webSession
      ? await authenticateToken(req, res, cookieToken, verifyAdminToken, { session: webSession })
      : await authenticateWithVerifier(req, res, verifyAdminToken);
    if (!user) return;

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }

    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const requireRecentAdminMfa = (req, res, next) => {
  if (!isRecentAdminMfa(req.auth?.decoded)) {
    return res.status(403).json({
      success: false,
      code: 'ADMIN_MFA_FRESHNESS_REQUIRED',
      message: 'A fresh multi-factor authenticated admin session is required for this action.',
    });
  }
  return next();
};

const counsellorAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user?.role !== 'counsellor' && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Counsellor privileges required.' });
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
