const crypto = require('crypto');
const User = require('../models/User');
const { getRedisClient } = require('../config/redis');
const { verifyUserToken, verifyAdminToken } = require('../utils/authTokens');
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

  return user;
};

const authFailure = (res, {
  status = 401,
  message = 'Invalid token.',
  session,
  code,
  data,
} = {}) => {
  if (session) clearSessionCookie(res, session.role);
  res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(data ? { data } : {}),
  });
  return false;
};

const attachAuthenticatedUser = (req, user, token, decoded, session = null) => {
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

const rejectUnverifiedUser = (res, user, session) => authFailure(res, {
  status: 403,
  message: 'Email verification is required before this account can be used.',
  code: 'EMAIL_VERIFICATION_REQUIRED',
  data: { email: user.email },
  session,
});

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

  if (!user.isEmailVerified) {
    if (optional) return null;
    return rejectUnverifiedUser(res, user, session);
  }

  if (session && user.role !== session.role) {
    if (optional) return null;
    return authFailure(res, {
      status: 403,
      message: 'Access denied. Session cookie is not valid for this origin.',
      session,
    });
  }

  return attachAuthenticatedUser(req, user, token, decoded, session);
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

  // Do not let the first verifier write a 401 response. A valid admin token
  // naturally fails the user audience check, and vice versa.
  let decoded = null;
  for (const verifyToken of [verifyUserToken, verifyAdminToken]) {
    try {
      decoded = verifyToken(token);
      break;
    } catch (error) {
      if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
        throw error;
      }
    }
  }

  if (!decoded) {
    if (optional) return null;
    return authFailure(res);
  }

  if (await isTokenBlocked(token)) {
    if (optional) return null;
    return authFailure(res);
  }

  const user = await loadActiveUserForToken(decoded);
  if (!user) {
    if (optional) return null;
    return authFailure(res);
  }

  if (!user.isEmailVerified) {
    if (optional) return null;
    return rejectUnverifiedUser(res, user);
  }

  return attachAuthenticatedUser(req, user, token, decoded);

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

const counsellorAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user?.role !== 'counsellor' && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Counsellor privileges required.' });
    }
    next();
  });
};

const patientAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user?.role !== 'user') {
      return res.status(403).json({
        success: false,
        code: 'PATIENT_ROLE_REQUIRED',
        message: 'Access denied. Patient account required.',
      });
    }

    next();
  });
};

// Common account-management actions are available to verified patients and
// counsellors. Admin accounts use their dedicated admin surface and must not
// inherit end-user profile or credential mutation endpoints.
const sharedParticipantAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (!['user', 'counsellor'].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        code: 'PARTICIPANT_ROLE_REQUIRED',
        message: 'Access denied. A patient or counsellor account is required.',
      });
    }

    next();
  });
};

const verifiedPatientAuth = async (req, res, next) => {
  await patientAuth(req, res, () => {
    if (req.user.profileCompleted === false) {
      return res.status(403).json({
        success: false,
        code: 'PROFILE_COMPLETION_REQUIRED',
        message: 'Complete your profile before using this feature.',
      });
    }

    next();
  });
};

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
  counsellorAuth,
  patientAuth,
  sharedParticipantAuth,
  verifiedPatientAuth,
  authAny,
  isTokenBlocked,
  extractBearerToken,
};
