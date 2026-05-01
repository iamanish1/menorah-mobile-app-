const express = require('express');
const { query, param, body, validationResult } = require('express-validator');
const Counsellor = require('../models/Counsellor');
const User = require('../models/User');
const { optionalAuth } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// Generate JWT Token (same as in auth.js)
const generateToken = (userId, role = 'user', fullName = '') => {
  return jwt.sign({ userId, role, fullName }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/email');
const { sendSMS } = require('../utils/sms');

const router = express.Router();

// @route   GET /api/counsellors
// @desc    Get all counsellors with filtering and search
// @access  Public
router.get('/', [
  query('search').optional().isString().trim(),
  query('specialization').optional().isString().trim(),
  query('language').optional().isString().trim(),
  query('minRating').optional().isFloat({ min: 0, max: 5 }),
  query('maxPrice').optional().isFloat({ min: 0 }),
  query('minPrice').optional().isFloat({ min: 0 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('sortBy').optional().isIn(['rating', 'price', 'experience', 'name']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], optionalAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      search,
      specialization,
      language,
      minRating,
      maxPrice,
      minPrice,
      page = 1,
      limit = 10,
      sortBy = 'rating',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {
      isActive: true,
      isAvailable: true,
      isVerified: true
    };

    // Search functionality
    if (search) {
      query.$or = [
        { specialization: { $regex: search, $options: 'i' } },
        { specializations: { $in: [new RegExp(search, 'i')] } },
        { 'user.firstName': { $regex: search, $options: 'i' } },
        { 'user.lastName': { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by specialization
    if (specialization) {
      query.$or = [
        { specialization: { $regex: specialization, $options: 'i' } },
        { specializations: { $in: [new RegExp(specialization, 'i')] } }
      ];
    }

    // Filter by language
    if (language) {
      query.languages = { $in: [new RegExp(language, 'i')] };
    }

    // Filter by rating
    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }

    // Filter by price
    if (minPrice || maxPrice) {
      query.hourlyRate = {};
      if (minPrice) query.hourlyRate.$gte = parseFloat(minPrice);
      if (maxPrice) query.hourlyRate.$lte = parseFloat(maxPrice);
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'name') {
      sort['user.firstName'] = sortOrder === 'asc' ? 1 : -1;
      sort['user.lastName'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const counsellors = await Counsellor.find(query)
      .populate('user', 'firstName lastName email phone profileImage')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Counsellor.countDocuments(query);

    // Format response
    const formattedCounsellors = counsellors.map(counsellor => ({
      id: counsellor._id,
      name: `${counsellor.user.firstName} ${counsellor.user.lastName}`,
      specialization: counsellor.specialization,
      specializations: counsellor.specializations,
      rating: counsellor.rating,
      reviewCount: counsellor.reviewCount,
      experience: counsellor.experience,
      languages: counsellor.languages,
      hourlyRate: counsellor.hourlyRate,
      currency: counsellor.currency,
      profileImage: counsellor.profileImage || counsellor.user.profileImage,
      bio: counsellor.bio,
      isAvailable: counsellor.isAvailable,
      totalSessions: counsellor.totalSessions
    }));

    res.json({
      success: true,
      data: {
        counsellors: formattedCounsellors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get counsellors error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/counsellors/:id
// @desc    Get counsellor by ID
// @access  Public
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid counsellor ID')
], optionalAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const counsellor = await Counsellor.findById(id)
      .populate('user', 'firstName lastName email phone profileImage')
      .lean();

    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not found'
      });
    }

    if (!counsellor.isActive || !counsellor.isVerified) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not available'
      });
    }

    // Format response
    const formattedCounsellor = {
      id: counsellor._id,
      name: `${counsellor.user.firstName} ${counsellor.user.lastName}`,
      specialization: counsellor.specialization,
      specializations: counsellor.specializations,
      rating: counsellor.rating,
      reviewCount: counsellor.reviewCount,
      experience: counsellor.experience,
      languages: counsellor.languages,
      hourlyRate: counsellor.hourlyRate,
      currency: counsellor.currency,
      profileImage: counsellor.profileImage || counsellor.user.profileImage,
      bio: counsellor.bio,
      education: counsellor.education,
      certifications: counsellor.certifications,
      availability: counsellor.availability,
      sessionDuration: counsellor.sessionDuration,
      timezone: counsellor.timezone,
      isAvailable: counsellor.isAvailable,
      totalSessions: counsellor.totalSessions,
      stats: counsellor.stats,
      gallery: counsellor.gallery
    };

    res.json({
      success: true,
      data: { counsellor: formattedCounsellor }
    });

  } catch (error) {
    console.error('Get counsellor error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/counsellors/:id/availability
// @desc    Get counsellor availability for a specific date range
// @access  Public
router.get('/:id/availability', [
  param('id').isMongoId().withMessage('Invalid counsellor ID'),
  query('startDate').isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').isISO8601().withMessage('End date must be a valid date')
], optionalAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const counsellor = await Counsellor.findById(id);
    if (!counsellor || !counsellor.isActive || !counsellor.isVerified) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not found'
      });
    }

    // Generate availability slots for the date range
    const availability = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'lowercase' });
      const daySchedule = counsellor.availability[dayOfWeek];

      if (daySchedule && daySchedule.isAvailable) {
        const slots = generateTimeSlots(daySchedule.start, daySchedule.end, counsellor.sessionDuration);
        availability.push({
          date: date.toISOString().split('T')[0],
          dayOfWeek: dayOfWeek,
          slots: slots
        });
      }
    }

    res.json({
      success: true,
      data: { availability }
    });

  } catch (error) {
    console.error('Get counsellor availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/counsellors/specializations
// @desc    Get all available specializations
// @access  Public
router.get('/specializations', async (req, res) => {
  try {
    const specializations = await Counsellor.distinct('specializations');
    const uniqueSpecializations = [...new Set(specializations.flat())];

    res.json({
      success: true,
      data: { specializations: uniqueSpecializations }
    });

  } catch (error) {
    console.error('Get specializations error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/counsellors/languages
// @desc    Get all available languages
// @access  Public
router.get('/languages', async (req, res) => {
  try {
    const languages = await Counsellor.distinct('languages');
    const uniqueLanguages = [...new Set(languages.flat())];

    res.json({
      success: true,
      data: { languages: uniqueLanguages }
    });

  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/counsellors/register
// @desc    Register a new counselor
// @access  Public
router.post('/register', [
  // User fields
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone').matches(/^\+[1-9]\d{1,14}$/).withMessage('Please provide a valid phone number with country code'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('dateOfBirth').isISO8601().withMessage('Please provide a valid date of birth'),
  body('gender').isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Please provide a valid gender'),
  // Counsellor fields
  body('licenseNumber').trim().notEmpty().withMessage('License number is required'),
  body('specialization').trim().notEmpty().withMessage('Specialization is required'),
  body('experience')
    .customSanitizer((value) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseInt(value, 10);
      return value;
    })
    .isInt({ min: 0 })
    .withMessage('Experience must be a non-negative integer'),
  body('bio').trim().isLength({ min: 50, max: 1000 }).withMessage('Bio must be between 50 and 1000 characters'),
  body('languages').isArray().withMessage('Languages must be an array'),
  body('languages.*')
    .custom((value) => {
      if (typeof value !== 'string') return false;
      return value.trim().length > 0;
    })
    .withMessage('Each language must not be empty'),
  body('hourlyRate')
    .customSanitizer((value) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value);
      return value;
    })
    .isFloat({ min: 0 })
    .withMessage('Hourly rate must be a positive number'),
  body('currency').optional().isString(),
  body('specializations').optional().isArray(),
  body('education').optional().isArray(),
  body('certifications').optional().isArray(),
  body('availability').optional().isObject()
], async (req, res) => {
  try {
    console.log('Registration request received:', {
      email: req.body.email,
      phone: req.body.phone,
      experience: req.body.experience,
      hourlyRate: req.body.hourlyRate,
      languages: req.body.languages
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      const formattedErrors = errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formattedErrors,
        errorDetails: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      dateOfBirth,
      gender,
      licenseNumber,
      specialization,
      specializations,
      experience,
      bio,
      languages,
      hourlyRate,
      currency = 'INR',
      education,
      certifications,
      availability
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone number already exists'
      });
    }

    // Check if license number already exists
    const existingCounsellor = await Counsellor.findOne({ licenseNumber });
    if (existingCounsellor) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor with this license number already exists'
      });
    }

    // Generate verification codes
    const emailVerificationToken = crypto.randomInt(100000, 999999).toString();
    const phoneVerificationToken = crypto.randomInt(100000, 999999).toString();

    // Create user with counsellor role
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      password,
      dateOfBirth,
      gender,
      role: 'counsellor',
      emailVerificationToken,
      phoneVerificationToken
    });

    await user.save();

    // Set default availability if not provided
    const defaultAvailability = availability || {
      monday: { start: '09:00', end: '17:00', isAvailable: true },
      tuesday: { start: '09:00', end: '17:00', isAvailable: true },
      wednesday: { start: '09:00', end: '17:00', isAvailable: true },
      thursday: { start: '09:00', end: '17:00', isAvailable: true },
      friday: { start: '09:00', end: '17:00', isAvailable: true },
      saturday: { start: '09:00', end: '17:00', isAvailable: false },
      sunday: { start: '09:00', end: '17:00', isAvailable: false }
    };

    // Create counsellor profile
    const counsellor = new Counsellor({
      user: user._id,
      licenseNumber,
      specialization,
      specializations: specializations || [specialization],
      experience,
      bio,
      languages,
      hourlyRate,
      currency,
      education: education || [],
      certifications: certifications || [],
      availability: defaultAvailability,
      isVerified: false, // Requires admin verification
      isActive: true,
      isAvailable: true
    });

    await counsellor.save();

    // Send verification emails/SMS
    try {
      await sendVerificationEmail(user.email, emailVerificationToken);
    } catch (error) {
      console.error('Error sending verification email:', error);
    }

    try {
      await sendSMS(user.phone, `Your verification code is: ${phoneVerificationToken}`);
    } catch (error) {
      console.error('Error sending SMS:', error);
    }

    // Generate token
    const token = generateToken(user._id, user.role, `${user.firstName} ${user.lastName}`);

    res.status(201).json({
      success: true,
      message: 'Counsellor registered successfully. Please verify your email and phone. Your profile will be reviewed by admin.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role
        },
        counsellor: {
          id: counsellor._id,
          licenseNumber: counsellor.licenseNumber,
          specialization: counsellor.specialization
        },
        token
      }
    });

  } catch (error) {
    console.error('Counsellor registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper function to generate time slots
const generateTimeSlots = (startTime, endTime, duration) => {
  const slots = [];
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);

  while (start < end) {
    slots.push(start.toTimeString().slice(0, 5));
    start.setMinutes(start.getMinutes() + duration);
  }

  return slots;
};

module.exports = router;
