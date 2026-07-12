const express = require('express');
const { query, param, body, validationResult } = require('express-validator');
const Counsellor = require('../models/Counsellor');
const User = require('../models/User');
const PendingApplication = require('../models/PendingApplication');
const { optionalAuth } = require('../middleware/auth');
const { getRedisClient } = require('../config/redis');
const Booking = require('../models/Booking');
const {
  expireStalePendingBookings,
  generateAvailabilityForDate,
} = require('../utils/bookingAvailability');

// ── Regex safety helper ────────────────────────────────────────────────────
// Escapes regex metacharacters to prevent ReDoS via user-supplied search strings
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Redis cache helper ─────────────────────────────────────────────────────
// Falls back to direct DB query transparently if Redis is unavailable.
const withCache = async (key, ttlSeconds, fetchFn) => {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const data = await fetchFn();
    await redis.setEx(key, ttlSeconds, JSON.stringify(data));
    return data;
  } catch {
    return fetchFn();
  }
};

const CACHE_TTL = {
  LIST:           5 * 60,   // 5 min  — counsellor list
  STATIC_LOOKUPS: 30 * 60,  // 30 min — specializations + languages (rarely change)
};

const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/email');
const { sendSMS } = require('../utils/sms');

const router = express.Router();
const emailNormalizationOptions = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false,
};
const publicReadyCounsellorQuery = {
  isActive: true,
  status: 'approved',
};
const CACHE_VERSION = 'v3';

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

    const parsedMinPrice = minPrice !== undefined ? parseFloat(minPrice) : undefined;
    const parsedMaxPrice = maxPrice !== undefined ? parseFloat(maxPrice) : undefined;

    if (
      parsedMinPrice !== undefined &&
      parsedMaxPrice !== undefined &&
      parsedMinPrice > parsedMaxPrice
    ) {
      return res.status(400).json({
        success: false,
        message: 'Minimum price cannot be greater than maximum price'
      });
    }

    // Build query
    const query = { ...publicReadyCounsellorQuery };

    // Collect top-level $or conditions to combine later
    const orConditions = [];

    // Search — escape metacharacters before using in $regex to prevent ReDoS
    if (search) {
      const safeSearch = escapeRegex(search.slice(0, 100)); // cap length
      const matchingUsers = await User.find({
        $or: [
          { firstName: { $regex: safeSearch, $options: 'i' } },
          { lastName:  { $regex: safeSearch, $options: 'i' } },
        ]
      }).select('_id').lean();
      const userIds = matchingUsers.map(u => u._id);

      orConditions.push({
        $or: [
          { specialization:  { $regex: safeSearch, $options: 'i' } },
          { specializations: { $in: [new RegExp(safeSearch, 'i')] } },
          ...(userIds.length ? [{ user: { $in: userIds } }] : []),
        ]
      });
    }

    // Filter by specialization — escape metacharacters
    if (specialization) {
      const safeSpec = escapeRegex(specialization.slice(0, 100));
      orConditions.push({
        $or: [
          { specialization:  { $regex: safeSpec, $options: 'i' } },
          { specializations: { $in: [new RegExp(safeSpec, 'i')] } },
        ]
      });
    }

    // Combine multiple $or blocks with $and so they don't overwrite each other
    if (orConditions.length === 1) {
      query.$or = orConditions[0].$or;
    } else if (orConditions.length > 1) {
      query.$and = orConditions;
    }

    // Filter by language — escape metacharacters
    if (language) {
      query.languages = { $in: [new RegExp(escapeRegex(language.slice(0, 50)), 'i')] };
    }

    // Filter by rating
    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }

    // Filter by price
    if (parsedMinPrice !== undefined || parsedMaxPrice !== undefined) {
      query.hourlyRate = {};
      if (parsedMinPrice !== undefined) query.hourlyRate.$gte = parsedMinPrice;
      if (parsedMaxPrice !== undefined) query.hourlyRate.$lte = parsedMaxPrice;
    }

    // Build sort object — map frontend sort keys to actual MongoDB field names
    const sortFieldMap = { rating: 'rating', price: 'hourlyRate', experience: 'experience' };
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sort = {};
    if (sortBy === 'name') {
      sort['user.firstName'] = sortDirection;
      sort['user.lastName']  = sortDirection;
    } else {
      const field = sortFieldMap[sortBy] || 'rating';
      sort[field] = sortDirection;
    }
    sort.rating = sort.rating || -1;
    sort.reviewCount = -1;
    sort.totalSessions = -1;
    sort._id = 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build a deterministic cache key from the query params.
    // Skip cache for free-text searches (too many unique keys, low reuse value).
    const cacheKey = !search
      ? `counsellors:${CACHE_VERSION}:list:${JSON.stringify({ specialization, language, minRating, minPrice, maxPrice, page, limit, sortBy, sortOrder })}`
      : null;

    const fetchFromDB = async () => {
      const [counsellors, total] = await Promise.all([
        Counsellor.find(query)
          .populate('user', 'firstName lastName profileImage')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Counsellor.countDocuments(query),
      ]);

      const formatted = counsellors.map(counsellor => ({
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
        voiceIntroUrl: counsellor.voiceIntroUrl,
        voiceIntroDurationSeconds: counsellor.voiceIntroDurationSeconds,
        bio: counsellor.bio,
        isAvailable: counsellor.isAvailable,
        totalSessions: counsellor.totalSessions,
      }));

      return {
        counsellors: formatted,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      };
    };

    const data = cacheKey
      ? await withCache(cacheKey, CACHE_TTL.LIST, fetchFromDB)
      : await fetchFromDB();

    res.json({ success: true, data });

  } catch (error) {
    console.error('Get counsellors error:', error);
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
    const specializations = await withCache(`counsellors:${CACHE_VERSION}:specializations`, CACHE_TTL.STATIC_LOOKUPS, async () => {
      const plural = await Counsellor.distinct('specializations', publicReadyCounsellorQuery);
      const seen = new Set();
      return plural.flat()
        .map(s => s.trim())
        .filter(s => {
          if (!s) return false;
          const key = s.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort();
    });

    res.json({ success: true, data: { specializations } });
  } catch (error) {
    console.error('Get specializations error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/counsellors/languages
// @desc    Get all available languages
// @access  Public
router.get('/languages', async (req, res) => {
  try {
    const languages = await withCache(`counsellors:${CACHE_VERSION}:languages`, CACHE_TTL.STATIC_LOOKUPS, async () => {
      const raw = await Counsellor.distinct('languages', publicReadyCounsellorQuery);
      const seen = new Set();
      return raw.flat()
        .map(l => l.trim())
        .filter(l => {
          if (!l) return false;
          const key = l.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort();
    });

    res.json({ success: true, data: { languages } });
  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/counsellors/application-status?email=xxx
// @desc    Check counsellor application status by email (public — used by registration page)
// @access  Public
router.get('/application-status', [
  query('email').isEmail().normalizeEmail().withMessage('Valid email required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Valid email is required' });

    const emailQuery = req.query.email;

    // Check pending/rejected applications first
    const pending = await PendingApplication.findOne({ email: emailQuery }).select('status rejectionReason').lean();
    if (pending) {
      return res.json({
        success: true,
        data: { status: pending.status, rejectionReason: pending.rejectionReason || null, isActive: false }
      });
    }

    // Check approved counsellors (application was approved and User/Counsellor were created)
    const user = await User.findOne({ email: emailQuery, role: 'counsellor' }).select('_id isActive').lean();
    if (!user) return res.status(404).json({ success: false, message: 'No application found for this email' });

    const counsellor = await Counsellor.findOne({ user: user._id }).select('status').lean();
    if (!counsellor) return res.status(404).json({ success: false, message: 'No application found' });

    res.json({
      success: true,
      data: { status: counsellor.status, rejectionReason: null, isActive: user.isActive }
    });
  } catch (error) {
    console.error('Application status check error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
      .populate('user', 'firstName lastName profileImage')
      .lean();

    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not found'
      });
    }

    if (!counsellor.isActive || counsellor.status !== 'approved') {
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
      voiceIntroUrl: counsellor.voiceIntroUrl,
      voiceIntroDurationSeconds: counsellor.voiceIntroDurationSeconds,
      bio: counsellor.bio,
      education: counsellor.education,
      certifications: counsellor.certifications,
      availability: counsellor.availability,
      sessionDuration: counsellor.sessionDuration,
      timezone: counsellor.timezone,
      isAvailable: counsellor.isAvailable,
      totalSessions: counsellor.totalSessions,
      // Only expose non-financial stats — totalEarnings/monthlyEarnings are internal
      stats: counsellor.stats ? {
        completedSessions:    counsellor.stats.completedSessions,
        cancelledSessions:    counsellor.stats.cancelledSessions,
        averageSessionRating: counsellor.stats.averageSessionRating,
      } : undefined,
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
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('date').optional().isISO8601().withMessage('Date must be a valid date'),
  query('duration').optional().isInt({ min: 15, max: 180 }).withMessage('Duration must be between 15 and 180 minutes')
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
    const requestedStartDate = req.query.date || req.query.startDate;
    const requestedEndDate = req.query.date || req.query.endDate || requestedStartDate;
    const duration = req.query.duration ? parseInt(req.query.duration, 10) : undefined;

    if (!requestedStartDate || !requestedEndDate) {
      return res.status(400).json({
        success: false,
        message: 'A date or startDate/endDate is required'
      });
    }

    const counsellor = await Counsellor.findById(id);
    if (!counsellor || !counsellor.isActive || !counsellor.isVerified) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not found'
      });
    }

    await expireStalePendingBookings(Booking, { counsellor: id });

    const timezone = counsellor.timezone || 'Asia/Kolkata';
    const start = new Date(requestedStartDate);
    const end = new Date(requestedEndDate);
    const rangeStart = new Date(start);
    rangeStart.setUTCHours(0, 0, 0, 0);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
    const rangeEnd = new Date(end);
    rangeEnd.setUTCHours(23, 59, 59, 999);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

    const bookings = await Booking.find({
      counsellor: id,
      status: { $in: ['pending', 'confirmed', 'in-progress'] },
      scheduledAt: { $gte: rangeStart, $lte: rangeEnd },
    }).select('scheduledAt sessionDuration status paymentStatus holdExpiresAt').lean();

    const availability = [];
    for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      availability.push(generateAvailabilityForDate({
        counsellor,
        date,
        bookings,
        duration,
      }));
    }

    res.json({
      success: true,
      data: {
        availability,
        date: req.query.date ? availability[0]?.date : undefined,
        timezone,
        holdMinutes: 15,
      }
    });

  } catch (error) {
    console.error('Get counsellor availability error:', error);
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
  body('email').isEmail().normalizeEmail(emailNormalizationOptions).withMessage('Please provide a valid email'),
  body('phone').matches(/^\+[1-9]\d{1,14}$/).withMessage('Please provide a valid phone number with country code'),
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

    // Block if already an active/approved counsellor with this email
    const existingUser = await User.findOne({ email, role: 'counsellor' });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A counsellor account with this email already exists'
      });
    }

    // Block duplicate license numbers already in the approved counsellors
    const existingCounsellor = await Counsellor.findOne({ licenseNumber });
    if (existingCounsellor) {
      return res.status(400).json({
        success: false,
        message: 'A counsellor with this license number already exists'
      });
    }

    // If a previous application exists for this email, replace it (re-apply after rejection)
    await PendingApplication.deleteOne({ email });

    const defaultAvailability = availability || {
      monday:    { start: '09:00', end: '17:00', isAvailable: true },
      tuesday:   { start: '09:00', end: '17:00', isAvailable: true },
      wednesday: { start: '09:00', end: '17:00', isAvailable: true },
      thursday:  { start: '09:00', end: '17:00', isAvailable: true },
      friday:    { start: '09:00', end: '17:00', isAvailable: true },
      saturday:  { start: '09:00', end: '17:00', isAvailable: false },
      sunday:    { start: '09:00', end: '17:00', isAvailable: false }
    };

    const application = new PendingApplication({
      firstName, lastName, email, phone, dateOfBirth, gender,
      licenseNumber, specialization,
      specializations: specializations || [specialization],
      experience, bio, languages, hourlyRate,
      currency: currency || 'INR',
      education: education || [],
      certifications: certifications || [],
      availability: defaultAvailability,
      status: 'pending'
    });

    await application.save();

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully. Your profile is under review by our admin team. You will receive your login credentials once approved.',
      data: { applicationId: application._id, email: application.email }
    });

  } catch (error) {
    console.error('Counsellor registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
