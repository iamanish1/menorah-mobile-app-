const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    if (user.isLocked()) {
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

// Optional auth - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (user && user.isActive && !user.isLocked()) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

// Admin auth middleware
const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }
      next();
    });
  } catch (error) {
    next(error);
  }
};

// Counsellor auth middleware
const counsellorAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'counsellor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Counsellor privileges required.'
        });
      }
      next();
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
  counsellorAuth
};
