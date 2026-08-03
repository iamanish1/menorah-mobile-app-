const express = require('express');
const mongoose = require('mongoose');
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
  getPotentiallyBlockingBookingFilter,
} = require('../utils/bookingAvailability');
const {
  COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  getPublicCounsellorVerificationRequirements,
  readCounsellorVerificationConfig,
} = require('../config/counsellorVerification');
const {
  buildProfessionallyApprovedCounsellorQuery,
  isCounsellorProfessionallyApproved,
} = require('../services/counsellorVerificationPolicy');
const {
  reconcileOne: reconcileCounsellorVerificationExpiry,
} = require('../services/counsellorVerificationExpiry');
const {
  countCompletedSessions,
  countCompletedSessionsByCounsellor,
} = require('../services/counsellorCompletedSessions');

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
const COUNSELLOR_REGISTRATION_TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
});

class CounsellorRegistrationError extends Error {
  constructor(message, { code = 'COUNSELLOR_REGISTRATION_CONFLICT', status = 409 } = {}) {
    super(message);
    this.name = 'CounsellorRegistrationError';
    this.code = code;
    this.status = status;
  }
}

const reconcileElapsedCounsellorForStatus = async (counsellor) => {
  const expiresAt = counsellor?.professionalVerification?.expiresAt;
  if (
    counsellor?.status !== 'approved'
    || !(expiresAt instanceof Date)
    || expiresAt > new Date()
  ) {
    return counsellor;
  }

  await reconcileCounsellorVerificationExpiry({
    counsellorId: counsellor._id,
  });
  return Counsellor.findById(counsellor._id)
    .select(
      'status isActive rejectionReason professionalVerification.legacyReviewRequired '
      + 'professionalVerification.expiresAt'
    )
    .lean();
};

const emailNormalizationOptions = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false,
};
const buildPublicReadyCounsellorQuery = async ({ requireAvailability = false } = {}) => {
  const activeCounsellorUsers = await User.find({
    role: 'counsellor',
    isActive: true,
  }).select('_id').lean();
  return {
    ...buildProfessionallyApprovedCounsellorQuery({ requireAvailability }),
    user: { $in: activeCounsellorUsers.map((user) => user._id) },
  };
};
const comparableId = (value) => String(value?._id || value || '');
const DEFAULT_SPECIALIZATIONS = Object.freeze([
  'Stress',
  'Sleep',
  'Relationships',
  'Work pressure',
  'Anxiety',
  'Depression',
  'Burnout',
  'Self-esteem',
  'Trauma',
  'Grief',
  'Addiction',
  'Career',
  'Family conflict',
]);
const DEFAULT_LANGUAGES = Object.freeze([
  'English',
  'Hindi',
  'Arabic',
  'Malayalam',
  'Tamil',
  'Telugu',
  'Kannada',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
  'Urdu',
]);
const CACHE_VERSION = 'v5';

const normalizeLookupValues = (values) => {
  const seen = new Set();
  return values.flat()
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(value => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const mergeLookupCatalog = (defaults, dbValues) => {
  const normalizedDefaults = normalizeLookupValues(defaults);
  const defaultKeys = new Set(normalizedDefaults.map(value => value.toLowerCase()));
  const extras = normalizeLookupValues(dbValues)
    .filter(value => !defaultKeys.has(value.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  return [...normalizedDefaults, ...extras];
};

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
    const query = await buildPublicReadyCounsellorQuery();

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
    sort._id = 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const fetchFromDB = async () => {
      const [counsellors, total] = await Promise.all([
        Counsellor.find(query)
          .populate({
            path: 'user',
            select: 'firstName lastName profileImage role isActive',
            match: { role: 'counsellor', isActive: true },
          })
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Counsellor.countDocuments(query),
      ]);

      const publicCounsellors = counsellors.filter((counsellor) => counsellor.user);
      const completedSessionCounts = await countCompletedSessionsByCounsellor(
        publicCounsellors.map((counsellor) => counsellor._id)
      );
      const formatted = publicCounsellors.map(counsellor => ({
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
        totalSessions: completedSessionCounts.get(counsellor._id.toString()) || 0,
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

    // Approval can expire through time alone, so discovery results must not
    // outlive the exact eligibility query that produced them.
    const data = await fetchFromDB();

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
      const query = await buildPublicReadyCounsellorQuery();
      const plural = await Counsellor.distinct('specializations', query);
      const singular = await Counsellor.distinct('specialization', query);
      return mergeLookupCatalog(DEFAULT_SPECIALIZATIONS, [...plural, ...singular]);
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
      const query = await buildPublicReadyCounsellorQuery();
      const raw = await Counsellor.distinct('languages', query);
      return mergeLookupCatalog(DEFAULT_LANGUAGES, raw);
    });

    res.json({ success: true, data: { languages } });
  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/counsellors/verification-requirements
// @desc    Return the exact approved notice required for counsellor registration
// @access  Public
router.get('/verification-requirements', (_req, res) => {
  const requirements = getPublicCounsellorVerificationRequirements();
  if (!requirements.configured) {
    return res.status(503).json({
      success: false,
      message: 'Counsellor registration is temporarily unavailable.',
    });
  }

  return res.json({
    success: true,
    data: {
      consentVersion: requirements.onboardingConsentVersion,
      noticeUrl: requirements.onboardingNoticeUrl,
    },
  });
});

// @route   GET /api/counsellors/application-status?ticket=xxx
// @desc    Check counsellor application status with an opaque applicant ticket
// @access  Ticket protected
router.get('/application-status', [
  query('ticket').isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Valid status ticket required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Valid status ticket is required' });

    const ticketHash = crypto.createHash('sha256').update(req.query.ticket).digest('hex');

    const pending = await PendingApplication.findOne({ statusLookupTokenHash: ticketHash })
      .select('status rejectionReason linkedCounsellor legacyReviewRequired')
      .lean();
    if (pending) {
      let currentCounsellor = pending.linkedCounsellor
        ? await Counsellor.findById(pending.linkedCounsellor)
          .select(
            'status isActive rejectionReason professionalVerification.legacyReviewRequired '
            + 'professionalVerification.expiresAt'
          )
          .lean()
        : null;
      currentCounsellor = await reconcileElapsedCounsellorForStatus(
        currentCounsellor
      );
      return res.json({
        success: true,
        data: {
          status: currentCounsellor?.status || pending.status,
          rejectionReason:
            currentCounsellor?.rejectionReason || pending.rejectionReason || null,
          isActive: currentCounsellor?.isActive === true,
          requiresFreshApplication: Boolean(
            pending.legacyReviewRequired === true
            || currentCounsellor?.professionalVerification?.legacyReviewRequired === true
            || ['suspended', 'expired'].includes(currentCounsellor?.status)
          ),
        }
      });
    }

    let counsellor = await Counsellor.findOne({ applicationStatusTokenHash: ticketHash })
      .select(
        'status isActive professionalVerification.legacyReviewRequired '
        + 'professionalVerification.expiresAt'
      )
      .lean();
    if (!counsellor) return res.status(404).json({ success: false, message: 'Application status not found' });
    counsellor = await reconcileElapsedCounsellorForStatus(counsellor);

    res.json({
      success: true,
      data: {
        status: counsellor.status,
        rejectionReason: null,
        isActive: counsellor.isActive,
        requiresFreshApplication: Boolean(
          counsellor.professionalVerification?.legacyReviewRequired === true
          || ['suspended', 'expired'].includes(counsellor.status)
        ),
      }
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

    const counsellor = await Counsellor.findOne({
      _id: id,
      ...buildProfessionallyApprovedCounsellorQuery(),
    })
      .populate({
        path: 'user',
        select: 'firstName lastName profileImage role isActive',
        match: { role: 'counsellor', isActive: true },
      })
      .lean();

    if (!counsellor || !counsellor.user) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not found'
      });
    }

    const totalSessions = await countCompletedSessions(counsellor._id);

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
      totalSessions,
      // Only expose non-financial stats — totalEarnings/monthlyEarnings are internal
      stats: {
        completedSessions: totalSessions,
        cancelledSessions: counsellor.stats?.cancelledSessions || 0,
        averageSessionRating: counsellor.stats?.averageSessionRating || 0,
      },
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

    const counsellor = await Counsellor.findById(id).populate('user', 'role isActive');
    if (!counsellor || !isCounsellorProfessionallyApproved(counsellor)) {
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
      scheduledAt: { $gte: rangeStart, $lte: rangeEnd },
      ...getPotentiallyBlockingBookingFilter(),
    }).select(
      'scheduledAt sessionDuration status paymentStatus paymentMethod holdExpiresAt bookingAuthorization'
    ).lean();

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
  body('availability').optional().isObject(),
  body('onboardingConsentAccepted')
    .custom((value) => value === true)
    .withMessage('Counsellor onboarding consent must be explicitly accepted'),
  body('onboardingConsentVersion')
    .isString()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('A valid counsellor onboarding consent version is required'),
  body('reverificationToken')
    .optional()
    .isHexadecimal()
    .isLength({ min: 64, max: 64 })
    .withMessage('A valid re-verification invitation is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }));
      
      return res.status(400).json({
        success: false,
        ...(errors.array().some(error => (error.path || error.param) === 'reverificationToken')
          ? { code: 'REVERIFICATION_AUTHORIZATION_INVALID' }
          : {}),
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
      availability,
      onboardingConsentAccepted,
      onboardingConsentVersion,
      reverificationToken,
    } = req.body;

    const verificationConfig = readCounsellorVerificationConfig();
    if (!verificationConfig.configured) {
      return res.status(503).json({
        success: false,
        message: 'Counsellor registration is temporarily unavailable.'
      });
    }
    if (
      onboardingConsentAccepted !== true
      || onboardingConsentVersion !== verificationConfig.onboardingConsentVersion
    ) {
      return res.status(422).json({
        success: false,
        code: 'COUNSELLOR_ONBOARDING_CONSENT_STALE',
        message: 'The counsellor onboarding consent is missing or no longer current.'
      });
    }

    const defaultAvailability = availability || {
      monday:    { start: '09:00', end: '17:00', isAvailable: true },
      tuesday:   { start: '09:00', end: '17:00', isAvailable: true },
      wednesday: { start: '09:00', end: '17:00', isAvailable: true },
      thursday:  { start: '09:00', end: '17:00', isAvailable: true },
      friday:    { start: '09:00', end: '17:00', isAvailable: true },
      saturday:  { start: '09:00', end: '17:00', isAvailable: false },
      sunday:    { start: '09:00', end: '17:00', isAvailable: false }
    };

    const statusTicket = crypto.randomBytes(32).toString('hex');
    const submittedAt = new Date();
    let application;
    const registrationSession = await mongoose.startSession();
    try {
      await registrationSession.withTransaction(async () => {
        // Resolve and revalidate every identity link from one database snapshot.
        // Applicant input never selects or mutates an existing account by itself.
        // Mongoose does not support parallel operations on one transaction
        // session. Keep identity resolution sequential so every read belongs
        // to the same well-defined snapshot.
        const existingCounsellorUserByEmail = await User.findOne({ email })
          .session(registrationSession);
        const existingCounsellorUserByPhone = await User.findOne({ phone })
          .session(registrationSession);
        const existingCounsellorByLicense = await Counsellor.findOne({ licenseNumber })
          .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
          .session(registrationSession);
        const possibleCounsellorUser = existingCounsellorUserByEmail
          || existingCounsellorUserByPhone;
        const existingCounsellorByUser = possibleCounsellorUser
          ? await Counsellor.findOne({ user: possibleCounsellorUser._id })
            .session(registrationSession)
          : null;
        const identityRecordsExist = Boolean(
          existingCounsellorUserByEmail
          || existingCounsellorUserByPhone
          || existingCounsellorByLicense
          || existingCounsellorByUser
        );
        const identityIsCanonical = Boolean(
          existingCounsellorUserByEmail
          && existingCounsellorUserByPhone
          && existingCounsellorUserByEmail.role === 'counsellor'
          && existingCounsellorUserByPhone.role === 'counsellor'
          && existingCounsellorUserByEmail.isActive === false
          && existingCounsellorUserByPhone.isActive === false
          && existingCounsellorByLicense
          && existingCounsellorByUser
          && comparableId(existingCounsellorUserByEmail)
            === comparableId(existingCounsellorUserByPhone)
          && comparableId(existingCounsellorByLicense)
            === comparableId(existingCounsellorByUser)
          && comparableId(existingCounsellorByLicense.user)
            === comparableId(existingCounsellorUserByEmail)
        );
        const existingVerification = existingCounsellorByLicense?.professionalVerification;
        const isRecoveryCandidate = Boolean(
          identityIsCanonical
          && (
            ['suspended', 'expired'].includes(existingCounsellorByLicense.status)
            || (
              existingCounsellorByLicense.status === 'draft'
              && existingVerification?.legacyReviewRequired === true
            )
          )
        );

        if (
          (identityRecordsExist && !isRecoveryCandidate)
          || (!isRecoveryCandidate && typeof reverificationToken === 'string')
        ) {
          throw new CounsellorRegistrationError(
            'A counsellor application cannot be accepted for the supplied identity.',
            {
              code: typeof reverificationToken === 'string'
                ? 'REVERIFICATION_AUTHORIZATION_INVALID'
                : 'COUNSELLOR_REGISTRATION_CONFLICT',
            }
          );
        }

        const activeApplication = await PendingApplication.findOne({
          $or: [{ email }, { licenseNumber }],
          status: { $in: ['pending', 'draft', 'submitted', 'under_review', 'approved'] },
          legacyReviewRequired: { $ne: true },
        })
          .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
          .session(registrationSession)
          .lean();
        if (activeApplication) {
          throw new CounsellorRegistrationError(
            'An active counsellor application already exists for this identity or declared license.',
            { code: 'COUNSELLOR_APPLICATION_ALREADY_ACTIVE' }
          );
        }

        let previousApplication = null;
        if (isRecoveryCandidate && existingVerification?.application) {
          previousApplication = await PendingApplication.findOne({
            _id: existingVerification.application,
            licenseNumber,
          })
            .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
            .select('_id status linkedUser linkedCounsellor')
            .session(registrationSession)
            .lean();
          if (
            !previousApplication
            || previousApplication.status !== existingCounsellorByLicense.status
            || comparableId(previousApplication.linkedUser)
              !== comparableId(existingCounsellorUserByEmail)
            || comparableId(previousApplication.linkedCounsellor)
              !== comparableId(existingCounsellorByLicense)
          ) {
            throw new CounsellorRegistrationError(
              'A counsellor application cannot be accepted for the supplied identity.',
              { code: 'REVERIFICATION_AUTHORIZATION_INVALID' }
            );
          }
        } else if (isRecoveryCandidate) {
          if (
            existingVerification?.legacyReviewRequired !== true
            || typeof existingVerification?.migrationVersion !== 'string'
            || !existingVerification.migrationVersion
          ) {
            throw new CounsellorRegistrationError(
              'A counsellor application cannot be accepted for the supplied identity.',
              { code: 'REVERIFICATION_AUTHORIZATION_INVALID' }
            );
          }
          previousApplication = await PendingApplication.findOne({
            email,
            phone,
            licenseNumber,
            legacyReviewRequired: true,
            legacyMigrationVersion: existingVerification.migrationVersion,
          })
            .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
            .sort({ createdAt: -1 })
            .select('_id')
            .session(registrationSession)
            .lean();
        } else {
          previousApplication = await PendingApplication.findOne({
            $and: [
              { $or: [{ email }, { licenseNumber }] },
              { $or: [{ status: 'rejected' }, { legacyReviewRequired: true }] },
            ],
          })
            .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
            .sort({ createdAt: -1 })
            .select('_id')
            .session(registrationSession)
            .lean();
        }

        let recoveredCounsellor = null;
        let reverificationAuthorization;
        if (isRecoveryCandidate) {
          if (typeof reverificationToken !== 'string') {
            throw new CounsellorRegistrationError(
              'A counsellor application cannot be accepted for the supplied identity.',
              { code: 'REVERIFICATION_AUTHORIZATION_INVALID' }
            );
          }
          const invitationTokenHash = crypto
            .createHash('sha256')
            .update(reverificationToken)
            .digest('hex');
          recoveredCounsellor = await Counsellor.findOneAndUpdate({
            _id: existingCounsellorByLicense._id,
            status: existingCounsellorByLicense.status,
            user: existingCounsellorUserByEmail._id,
            licenseNumber,
            ...(existingCounsellorByLicense.status === 'draft'
              ? { 'professionalVerification.legacyReviewRequired': true }
              : {}),
            ...(!existingVerification?.application
              ? {
                'professionalVerification.legacyReviewRequired': true,
                'professionalVerification.migrationVersion':
                  existingVerification?.migrationVersion,
              }
              : {}),
            'professionalVerification.reverificationInviteTokenHash': invitationTokenHash,
            'professionalVerification.reverificationInviteIssuedBy': { $type: 'objectId' },
            'professionalVerification.reverificationInviteIssuedAt': {
              $type: 'date',
              $lte: submittedAt,
            },
            'professionalVerification.reverificationInviteExpiresAt': { $gt: submittedAt },
            'professionalVerification.reverificationInviteConsentVersion':
              verificationConfig.onboardingConsentVersion,
          }, {
            $unset: {
              'professionalVerification.reverificationInviteTokenHash': '',
              'professionalVerification.reverificationInviteIssuedBy': '',
              'professionalVerification.reverificationInviteIssuedAt': '',
              'professionalVerification.reverificationInviteExpiresAt': '',
              'professionalVerification.reverificationInviteConsentVersion': '',
            },
          }, { new: false, session: registrationSession })
            .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
            .select([
              '+professionalVerification.reverificationInviteTokenHash',
              '+professionalVerification.reverificationInviteIssuedBy',
              '+professionalVerification.reverificationInviteIssuedAt',
              '+professionalVerification.reverificationInviteExpiresAt',
              '+professionalVerification.reverificationInviteConsentVersion',
            ].join(' '));
          if (!recoveredCounsellor) {
            throw new CounsellorRegistrationError(
              'A counsellor application cannot be accepted for the supplied identity.',
              { code: 'REVERIFICATION_AUTHORIZATION_INVALID' }
            );
          }
          reverificationAuthorization = {
            tokenHash: recoveredCounsellor.professionalVerification
              .reverificationInviteTokenHash,
            issuedBy: recoveredCounsellor.professionalVerification
              .reverificationInviteIssuedBy,
            issuedAt: recoveredCounsellor.professionalVerification
              .reverificationInviteIssuedAt,
            expiresAt: recoveredCounsellor.professionalVerification
              .reverificationInviteExpiresAt,
            consentVersion: recoveredCounsellor.professionalVerification
              .reverificationInviteConsentVersion,
            redeemedAt: submittedAt,
          };
        }

        application = new PendingApplication({
          firstName, lastName, email, phone, dateOfBirth, gender,
          licenseNumber, specialization,
          specializations: specializations || [specialization],
          experience, bio, languages, hourlyRate,
          currency: currency || 'INR',
          education: education || [],
          certifications: certifications || [],
          availability: defaultAvailability,
          statusLookupTokenHash: crypto.createHash('sha256').update(statusTicket).digest('hex'),
          status: 'submitted',
          onboardingConsent: {
            accepted: true,
            version: verificationConfig.onboardingConsentVersion,
            acceptedAt: submittedAt,
            source: recoveredCounsellor
              ? 'counsellor_web_reverification'
              : 'counsellor_web_registration',
          },
          linkedUser: recoveredCounsellor
            ? existingCounsellorUserByEmail._id
            : null,
          linkedCounsellor: recoveredCounsellor
            ? recoveredCounsellor._id
            : null,
          supersedesApplication: previousApplication?._id || null,
          reverificationAuthorization,
          legacyReviewRequired: false,
          statusHistory: [{
            from: 'draft',
            to: 'submitted',
            at: submittedAt,
            actorType: 'applicant',
            actor: null,
            reason: null,
          }],
        });

        await application.save({ session: registrationSession });
      }, COUNSELLOR_REGISTRATION_TRANSACTION_OPTIONS);
    } finally {
      await registrationSession.endSession();
    }

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully. Professional approval and account activation remain separate review steps.',
      data: {
        applicationId: application._id,
        email: application.email,
        status: application.status,
        statusTicket
      }
    });

  } catch (error) {
    if (error instanceof CounsellorRegistrationError) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'COUNSELLOR_APPLICATION_ALREADY_ACTIVE',
        message: 'An active counsellor application already exists for this identity or declared license.',
      });
    }
    console.error('Counsellor registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
