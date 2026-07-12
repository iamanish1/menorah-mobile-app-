const crypto = require('crypto');
const User = require('../models/User');
const { getRedisClient } = require('../config/redis');
const { verifyUserToken, verifyAdminToken } = require('../utils/authTokens');

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

const authenticateWithVerifier = async (req, res, verifyToken, { optional = false } = {}) => {
  const token = extractBearerToken(req);

  if (!token) {
    if (optional) return null;
    res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    return false;
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    if (optional) return null;
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, message: 'Invalid token.' });
      return false;
    }
    throw error;
  }

  if (await isTokenBlocked(token)) {
    if (optional) return null;
    res.status(401).json({ success: false, message: 'Invalid token.' });
    return false;
  }

  const user = await loadActiveUserForToken(decoded);
  if (!user) {
    if (optional) return null;
    res.status(401).json({ success: false, message: 'Invalid token.' });
    return false;
  }

  req.user = user;
  req.auth = { token, decoded };
  return user;
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
    const user = await authenticateWithVerifier(req, res, verifyAdminToken);
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

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
  counsellorAuth,
  isTokenBlocked,
  extractBearerToken,
};
