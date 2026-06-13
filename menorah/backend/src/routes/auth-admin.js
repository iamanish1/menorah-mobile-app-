const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { adminAuth } = require('../middleware/auth');
const { getRedisClient } = require('../config/redis');

const router = express.Router();

const generateToken = (userId, role = 'admin') => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
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

const serializeAdmin = (user) => ({
  _id: user._id.toString(),
  id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: user.isPhoneVerified,
  profileImage: user.profileImage || null,
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });

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

    await user.resetLoginAttempts();
    const token = generateToken(user._id, user.role);

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: serializeAdmin(user),
        token,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
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

router.post('/logout', adminAuth, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) await blockToken(token);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Admin logout error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
