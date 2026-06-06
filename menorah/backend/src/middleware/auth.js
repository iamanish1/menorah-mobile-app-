const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const User   = require('../models/User');
const { getRedisClient } = require('../config/redis');

// ── Token blocklist helper ─────────────────────────────────────────────────
// Called by logout route; checked on every authenticated request.
// Fails CLOSED in production — if Redis is down, logged-out tokens are rejected
// rather than accepted, preventing session hijack after an admin-initiated logout.
const isTokenBlocked = async (token) => {
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const redis = getRedisClient();
    return !!(await redis.get(`blocked:token:${hash}`));
  } catch {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed — reject the token so an attacker cannot bypass logout
      // by taking Redis offline. Authenticated users will get a 401 and need
      // to log in again once Redis recovers (typically seconds).
      return true;
    }
    return false; // Dev: allow through so local dev works without Redis
  }
};

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    // Verify with algorithm pinned — prevents alg:none and algorithm-confusion attacks
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Check logout blocklist
    if (await isTokenBlocked(token)) {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    const user = await User.findById(decoded.userId).select(
      '-password -emailVerificationToken -passwordResetToken -passwordResetExpires'
    );

    if (!user) {
      // Return same generic message as invalid-token — prevents user-existence enumeration
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (await isTokenBlocked(token)) return next();

    const user = await User.findById(decoded.userId).select(
      '-password -emailVerificationToken -passwordResetToken -passwordResetExpires'
    );
    if (user && user.isActive) req.user = user;
    next();
  } catch {
    next();
  }
};

const adminAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }
    next();
  });
};

const counsellorAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user?.role !== 'counsellor' && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Counsellor privileges required.' });
    }
    next();
  });
};

module.exports = { auth, optionalAuth, adminAuth, counsellorAuth, isTokenBlocked };
