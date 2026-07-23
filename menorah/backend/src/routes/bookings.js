const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const moment = require('moment');
const Booking = require('../models/Booking');
const Counsellor = require('../models/Counsellor');
const User = require('../models/User');
const { auth, authAny } = require('../middleware/auth');
const { sendBookingConfirmationEmail, sendSessionReminderEmail } = require('../utils/email');
const { sendBookingConfirmationSMS, sendSessionReminderSMS, sendCancellationSMS } = require('../utils/sms');
const {
  getPendingHoldExpiresAt,
  expireStalePendingBookings,
  isBlockingBooking,
} = require('../utils/bookingAvailability');
const {
  isAllowedExternalProvider,
  isSafeHttpsUrl,
  normalizeProvider,
  providerDisplayName,
  resolveCallPolicy
} = require('../services/callPolicyService');
const {
  BookingPricingError,
  assertClientDoesNotControlPricing,
  parseBookingServiceCatalog,
  resolveBookingPrice,
} = require('../services/bookingPricing');
const {
  notifyEligibleCounsellorsOfBooking,
} = require('../services/bookingMarketplaceNotifications');

const router = express.Router();
const SLOT_TAKEN_MESSAGE = 'This time slot was just booked by someone else. Please choose another available slot.';

const SERVER_PRICING_FAILURE_CODES = new Set([
  'COUNSELLOR_PRICING_REQUIRED',
  'INVALID_SERVER_PRICE',
  'INVALID_SERVICE_CATALOG',
  'SERVICE_CATALOG_REQUIRED',
  'UNSUPPORTED_CURRENCY',
]);

const bookingPricingErrorStatus = (error) =>
  SERVER_PRICING_FAILURE_CODES.has(error.code) ? 503 : 400;
const formatVideoCall = (videoCall = {}, { includeHostUrl = false } = {}) => {
  const payload = {
    provider: videoCall.provider,
    joinMode: videoCall.joinMode,
    externalProviderName: videoCall.externalProviderName,
    externalJoinUrl: videoCall.externalJoinUrl,
    region: videoCall.region,
    status: videoCall.status,
    policyReason: videoCall.policyReason,
    lastPolicyCheckAt: videoCall.lastPolicyCheckAt,
    configuredAt: videoCall.configuredAt,
    roomId: videoCall.roomId,
    roomUrl: videoCall.roomUrl
  };

  if (includeHostUrl) {
    payload.externalHostUrl = videoCall.externalHostUrl;
  }

  return payload;
};

const canManageSessionState = (booking, user) => {
  if (user?.role === 'admin') return true;
  const counsellorUserId = booking.counsellor?.user?._id?.toString?.()
    || booking.counsellor?.user?.toString?.();
  return Boolean(counsellorUserId && counsellorUserId === user?._id?.toString());
};

// @route   POST /api/bookings
// @desc    Create a new booking
// @access  Private
router.post('/', [
  body('counsellorId')
    .optional({ values: 'falsy' })
    .custom((value) => {
      // Skip validation if value is null, undefined, or empty string
      if (!value || value === null || value === undefined || value === '') {
        return true;
      }
      // If value is provided, it must be a valid MongoId
      return require('mongoose').Types.ObjectId.isValid(value);
    })
    .withMessage('Invalid counsellor ID'),
  body('sessionType').isIn(['video', 'audio', 'chat']).withMessage('Invalid session type'),
  body('sessionDuration').isInt({ min: 15, max: 180 }).withMessage('Session duration must be between 15 and 180 minutes'),
  body('scheduledAt').isISO8601().withMessage('Invalid scheduled date'),
  body('serviceCode').optional({ nullable: true }).isString().isLength({ min: 1, max: 64 }).withMessage('Invalid service code'),
  body('preferences').optional({ nullable: true }).isObject(),
  body('symptoms').optional({ nullable: true }).isArray(),
  body('concerns').optional({ nullable: true }).isString(),
  body('goals').optional({ nullable: true }).isArray(),
  body('emergencyContact').optional({ nullable: true }).isObject()
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    assertClientDoesNotControlPricing(req.body);

    const {
      counsellorId,
      sessionType,
      sessionDuration,
      scheduledAt,
      serviceCode,
      preferences,
      symptoms,
      concerns,
      goals,
      emergencyContact
    } = req.body;

    let counsellor = null;
    let priceQuote;

    // If counsellorId is provided, validate and get counsellor details
    if (counsellorId) {
      counsellor = await Counsellor.findById(counsellorId)
        .populate('user', 'firstName lastName email phone');

      if (!counsellor || !counsellor.isActive || !counsellor.isVerified) {
        return res.status(404).json({
          success: false,
          message: 'Counsellor not found or unavailable'
        });
      }

      // Check if the scheduled time is in the future
      const scheduledTime = new Date(scheduledAt);
      if (scheduledTime <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time must be in the future'
        });
      }

      await expireStalePendingBookings(Booking, { counsellor: counsellorId });

      // Check counsellor availability using their stored timezone
      const tz = counsellor.timezone || 'Asia/Kolkata';
      const tzParts = new Intl.DateTimeFormat('en-US', {
        weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
      }).formatToParts(scheduledTime);
      const dayOfWeek = tzParts.find(p => p.type === 'weekday').value.toLowerCase();
      const hour   = tzParts.find(p => p.type === 'hour').value.padStart(2, '0');
      const minute = tzParts.find(p => p.type === 'minute').value.padStart(2, '0');
      const timeString = `${hour}:${minute}`;
      const daySchedule = counsellor.availability[dayOfWeek];

      if (!daySchedule || !daySchedule.isAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor is not available on this day'
        });
      }

      if (timeString < daySchedule.start || timeString > daySchedule.end) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time is outside counsellor\'s working hours'
        });
      }

      // Check for conflicting bookings. Pending payment bookings only block while
      // their short hold is still alive; confirmed/paid bookings block permanently.
      const possibleConflicts = await Booking.find({
        counsellor: counsellorId,
        scheduledAt: {
          $gte: new Date(scheduledTime.getTime() - sessionDuration * 60 * 1000),
          $lte: new Date(scheduledTime.getTime() + sessionDuration * 60 * 1000)
        },
        status: { $in: ['pending', 'confirmed', 'in-progress'] }
      }).lean();

      const requestedEnd = new Date(scheduledTime.getTime() + sessionDuration * 60 * 1000);
      const conflictingBooking = possibleConflicts.find((booking) => {
        if (!isBlockingBooking(booking)) return false;
        const bookingStart = new Date(booking.scheduledAt);
        const bookingEnd = new Date(bookingStart.getTime() + (booking.sessionDuration || sessionDuration) * 60 * 1000);
        return scheduledTime < bookingEnd && requestedEnd > bookingStart;
      });

      if (conflictingBooking) {
        return res.status(400).json({
          success: false,
          code: conflictingBooking.status === 'pending' ? 'SLOT_PENDING' : 'SLOT_BOOKED',
          message: SLOT_TAKEN_MESSAGE
        });
      }

      priceQuote = resolveBookingPrice({
        clientInput: req.body,
        sessionDuration,
        counsellor: {
          hourlyRate: counsellor.hourlyRate,
          currency: counsellor.currency,
        },
      });
    } else {
      // Check if scheduled time is in the future
      const scheduledTime = new Date(scheduledAt);
      if (scheduledTime <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time must be in the future'
        });
      }

      const serviceCatalog = parseBookingServiceCatalog(
        process.env.BOOKING_SERVICE_CATALOG_JSON
      );
      priceQuote = resolveBookingPrice({
        clientInput: req.body,
        sessionDuration,
        serviceCode,
        serviceCatalog,
      });
    }

    // Check if user has active subscription
    const user = await User.findById(req.user._id);
    let isSubscriptionBooking = false;
    let paymentStatus = 'pending';
    let paymentMethod = 'razorpay';
    let amount = priceQuote.amount;
    let amountMinor = priceQuote.amountMinor;
    let subscriptionAuthorization = null;

    if (user && user.subscription) {
      const now = new Date();
      const startDate = user.subscription.startDate ? new Date(user.subscription.startDate) : null;
      const endDate = user.subscription.endDate ? new Date(user.subscription.endDate) : null;
      const subscriptionActive = user.subscription.isActive === true;
      const subscriptionPlanEligible = user.subscription.plan === 'premium';
      const subscriptionTypeEligible = ['weekly', 'monthly', 'yearly'].includes(
        user.subscription.subscriptionType
      );
      const subscriptionStarted = startDate && startDate <= now;
      const subscriptionNotExpired = endDate && endDate > now;
      if (
        subscriptionActive
        && subscriptionPlanEligible
        && subscriptionTypeEligible
        && subscriptionStarted
        && subscriptionNotExpired
      ) {
        isSubscriptionBooking = true;
        paymentStatus = 'paid';
        paymentMethod = 'subscription';
        amount = 0;
        amountMinor = 0;
        subscriptionAuthorization = {
          kind: 'subscription_entitlement',
          status: 'authorized',
          reference: `${user.subscription.subscriptionType}:${startDate.toISOString()}`,
          authorizedAt: now,
          validUntil: endDate,
        };
      }
    }

    // Create booking
    const scheduledTime = new Date(scheduledAt);
    const booking = new Booking({
      user: req.user._id,
      counsellor: counsellorId || null,
      sessionType,
      sessionDuration,
      scheduledAt: scheduledTime,
      amount,
      amountMinor,
      currency: priceQuote.currency,
      pricing: {
        source: priceQuote.source,
        serviceCode: priceQuote.serviceCode,
        listAmount: priceQuote.amount,
        listAmountMinor: priceQuote.amountMinor,
        currency: priceQuote.currency,
        resolvedAt: new Date(),
      },
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
      bookingAuthorization: subscriptionAuthorization || {
        kind: 'payment',
        status: 'pending',
      },
      status: isSubscriptionBooking ? 'confirmed' : 'pending',
      holdExpiresAt: paymentStatus === 'pending' ? getPendingHoldExpiresAt() : undefined,
      isSubscriptionBooking: isSubscriptionBooking,
      preferences: preferences || {},
      symptoms,
      concerns,
      goals,
      emergencyContact
    });

    if (sessionType === 'video') {
      const policy = resolveCallPolicy({
        user: user || req.user,
        booking,
        req: { headers: req.headers, user: req.user }
      });
      booking.videoCall.provider = policy.provider;
      booking.videoCall.joinMode = policy.joinMode;
      booking.videoCall.region = policy.region;
      booking.videoCall.status = policy.joinMode === 'disabled' ? 'disabled' : 'not_configured';
      booking.videoCall.policyReason = policy.reason;
      booking.videoCall.lastPolicyCheckAt = new Date();
      if (policy.providerName) {
        booking.videoCall.externalProviderName = policy.providerName;
      }
    }

    try {
      await booking.save();
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({
          success: false,
          code: 'SLOT_BOOKED',
          message: SLOT_TAKEN_MESSAGE
        });
      }
      throw error;
    }

    // NOTE: counsellor socket notifications are sent only after payment is confirmed
    // (see payments.js verify-razorpay handler)
    if (paymentStatus === 'paid' && !booking.counsellor && req.app.get('io')) {
      await notifyEligibleCounsellorsOfBooking({
        booking,
        io: req.app.get('io'),
      });
    }

    // Send confirmation notifications only if counsellor is assigned
    if (counsellor) {
      try {
        const bookingDetails = {
          scheduledAt: booking.scheduledAt,
          sessionDuration: booking.sessionDuration,
          sessionType: booking.sessionType,
          counsellorName: `${counsellor.user.firstName} ${counsellor.user.lastName}`
        };

        await sendBookingConfirmationEmail(req.user.email, bookingDetails);
        await sendBookingConfirmationSMS(req.user.phone, bookingDetails);
      } catch (error) {
        console.error('Error sending booking confirmation:', error);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking: {
          id: booking._id,
          counsellorName: counsellor ? `${counsellor.user.firstName} ${counsellor.user.lastName}` : 'To be assigned',
          sessionType: booking.sessionType,
          sessionDuration: booking.sessionDuration,
          scheduledAt: booking.scheduledAt,
          amount: booking.amount,
          currency: booking.currency,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod,
          isSubscriptionBooking: booking.isSubscriptionBooking || false,
          pricingSource: booking.pricing?.source
        }
      }
    });

  } catch (error) {
    if (error instanceof BookingPricingError) {
      return res.status(bookingPricingErrorStatus(error)).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    console.error('Create booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/bookings
// @desc    Get user's bookings
// @access  Private
router.get('/', [
  query('status').optional(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { status, page = 1, limit = 10 } = req.query;

    const validStatuses = ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'expired'];

    // Build query — support comma-separated status list (e.g. "pending,confirmed")
    const dbQuery = { user: req.user._id };
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(s => validStatuses.includes(s));
      if (statuses.length === 1) {
        dbQuery.status = statuses[0];
      } else if (statuses.length > 1) {
        dbQuery.status = { $in: statuses };
      }
    }

    // Never show bookings that are awaiting payment (created but payment not yet completed).
    // These are excluded from all list views — they only exist temporarily while the
    // user is in the Razorpay modal, and are auto-cancelled if payment is abandoned.
    dbQuery.$nor = [{
      status: 'pending',
      paymentStatus: 'pending',
      isSubscriptionBooking: { $ne: true }
    }];

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const bookings = await Booking.find(dbQuery)
      .populate({
        path: 'counsellor',
        select: 'user specialization hourlyRate',
        populate: {
          path: 'user',
          select: 'firstName lastName profileImage'
        }
      })
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Booking.countDocuments(dbQuery);

    // Format response
    const formattedBookings = bookings.map(booking => ({
      id: booking._id,
      counsellorName: booking.counsellor ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}` : 'To be assigned',
      counsellorImage: booking.counsellor ? booking.counsellor.user.profileImage : null,
      specialization: booking.counsellor ? booking.counsellor.specialization : null,
      sessionType: booking.sessionType,
      sessionDuration: booking.sessionDuration,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      isSubscriptionBooking: booking.isSubscriptionBooking || false,
      promo: booking.promo?.code ? {
        code: booking.promo.code,
        discountAmount: booking.promo.discountAmount || 0
      } : undefined,
      videoCall: formatVideoCall(booking.videoCall),
      canBeCancelled: booking.canBeCancelled,
      canBeRescheduled: booking.canBeRescheduled,
      createdAt: booking.createdAt // Add createdAt for date display
    }));

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get booking by ID
// @access  Private
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid booking ID')
], auth, async (req, res) => {
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

    const booking = await Booking.findById(id)
      .populate({
        path: 'counsellor',
        select: 'user specialization hourlyRate',
        populate: {
          path: 'user',
          select: 'firstName lastName email phone profileImage'
        }
      })
      .populate('user', 'firstName lastName email phone')
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns this booking or is the counsellor
    const isUser = booking.user._id.toString() === req.user._id.toString();
    const isCounsellor = booking.counsellor && booking.counsellor.user._id.toString() === req.user._id.toString();
    
    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Format response to match frontend expectations
    const formattedBooking = {
      id: booking._id,
      counsellorName: booking.counsellor ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}` : 'To be assigned',
      counsellorImage: booking.counsellor ? booking.counsellor.user.profileImage || null : null,
      specialization: booking.counsellor ? booking.counsellor.specialization : null,
      sessionType: booking.sessionType,
      sessionDuration: booking.sessionDuration,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      isSubscriptionBooking: booking.isSubscriptionBooking || false,
      promo: booking.promo?.code ? {
        code: booking.promo.code,
        discountAmount: booking.promo.discountAmount || 0
      } : undefined,
      videoCall: formatVideoCall(booking.videoCall, { includeHostUrl: isCounsellor }),
      canBeCancelled: booking.canBeCancelled,
      canBeRescheduled: booking.canBeRescheduled,
      createdAt: booking.createdAt,
    };

    res.json({
      success: true,
      data: { booking: formattedBooking }
    });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/bookings/:id/call-link
// @desc    Configure approved external call link for an assigned session
// @access  Private (admin or assigned counsellor)
router.patch('/:id/call-link', [
  param('id').isMongoId().withMessage('Invalid booking ID'),
  body('provider').isString().trim().notEmpty(),
  body('externalJoinUrl').isString().trim().custom(isSafeHttpsUrl).withMessage('External join URL must be HTTPS'),
  body('externalHostUrl').optional({ nullable: true, checkFalsy: true }).isString().trim().custom(isSafeHttpsUrl).withMessage('External host URL must be HTTPS'),
  body('externalProviderName').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 80 })
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const booking = await Booking.findById(req.params.id)
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: { path: 'user', select: 'firstName lastName phone address country accountRegion region' }
      })
      .populate('user', 'firstName lastName phone address country accountRegion region');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const isAdmin = req.user.role === 'admin';
    const isAssignedCounsellor = booking.counsellor?.user?._id?.toString() === req.user._id.toString();
    if (!isAdmin && !isAssignedCounsellor) {
      return res.status(403).json({ success: false, message: 'Only an admin or assigned counsellor can configure this session link.' });
    }

    const provider = normalizeProvider(req.body.provider, '');
    if (!isAllowedExternalProvider(provider)) {
      return res.status(400).json({ success: false, message: 'Unsupported external provider.' });
    }

    const policy = resolveCallPolicy({ user: booking.user, booking, req: { headers: req.headers, user: req.user } });
    if (policy.provider === 'livekit') {
      return res.status(400).json({ success: false, message: 'External links are only required for external-provider sessions.' });
    }
    if (policy.joinMode === 'disabled') {
      return res.status(403).json({ success: false, message: 'Video calling is disabled until this session region is verified.' });
    }

    booking.videoCall.provider = provider;
    booking.videoCall.joinMode = 'external_link';
    booking.videoCall.region = policy.region;
    booking.videoCall.status = 'ready';
    booking.videoCall.policyReason = policy.reason;
    booking.videoCall.lastPolicyCheckAt = new Date();
    booking.videoCall.externalJoinUrl = req.body.externalJoinUrl.trim();
    booking.videoCall.externalHostUrl = req.body.externalHostUrl ? req.body.externalHostUrl.trim() : undefined;
    booking.videoCall.externalProviderName = req.body.externalProviderName?.trim() || providerDisplayName(provider);
    booking.videoCall.configuredBy = req.user._id;
    booking.videoCall.configuredAt = new Date();
    await booking.save();

    res.json({
      success: true,
      message: 'External session link saved.',
      data: {
        bookingId: booking._id,
        videoCall: formatVideoCall(booking.videoCall, { includeHostUrl: true })
      }
    });
  } catch (error) {
    console.error('Configure booking call link error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   PUT /api/bookings/:id/cancel
// @desc    Cancel a booking
// @access  Private
router.put('/:id/cancel', [
  param('id').isMongoId().withMessage('Invalid booking ID'),
  body('reason').optional().isString()
], auth, async (req, res) => {
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
    const { reason } = req.body;

    const booking = await Booking.findById(id)
      .populate('counsellor', 'user')
      .populate('counsellor.user', 'firstName lastName email phone')
      .populate('user', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user can cancel this booking
    if (booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const isUnpaidHold = booking.status === 'pending' && booking.paymentStatus === 'pending';
    if (!isUnpaidHold && !booking.canBeCancelled) {
      return res.status(400).json({
        success: false,
        message: 'Booking cannot be cancelled at this time'
      });
    }

    // Cancel booking
    await booking.cancel(reason, req.user._id);

    // Send cancellation notifications
    try {
      const sessionDetails = {
        counsellorName: `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`,
        scheduledAt: booking.scheduledAt
      };

      await sendCancellationSMS(booking.user.phone, sessionDetails);
    } catch (error) {
      console.error('Error sending cancellation notification:', error);
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/bookings/:id/start
// @desc    Start a session
// @access  Private
router.put('/:id/start', [
  param('id').isMongoId().withMessage('Invalid booking ID')
], authAny, async (req, res) => {
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

    const booking = await Booking.findById(id)
      .populate('counsellor', 'user')
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (!canManageSessionState(booking, req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned counsellor or an administrator can start this session.'
      });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Session cannot be started. Booking must be confirmed.'
      });
    }

    // For instant sessions, allow starting immediately after assignment
    // For scheduled sessions, check if scheduled time has arrived (with 15 min buffer)
    const scheduledTime = new Date(booking.scheduledAt);
    const now = new Date();
    const timeDiff = scheduledTime.getTime() - now.getTime();
    const fifteenMinutes = 15 * 60 * 1000;
    
    // Check if this is an instant session (recently assigned and scheduled time is in future)
    const assignedTime = booking.assignedAt ? new Date(booking.assignedAt) : null;
    const isRecentlyAssigned = assignedTime && (now.getTime() - assignedTime.getTime()) < 24 * 60 * 60 * 1000; // Within 24 hours
    const isInstantSession = isRecentlyAssigned && scheduledTime > now;
    
    // Allow starting if: scheduled time has passed (with 15 min buffer) OR it's an instant session
    if (!isInstantSession && timeDiff > fifteenMinutes) {
      return res.status(400).json({
        success: false,
        message: `Session cannot be started yet. Scheduled time is ${moment(scheduledTime).format('MMM D, YYYY h:mm A')}.`
      });
    }

    let startCallPolicy = null;
    if (booking.sessionType === 'video') {
      startCallPolicy = resolveCallPolicy({
        user: booking.user,
        booking,
        req: { headers: req.headers, user: req.user }
      });

      if (startCallPolicy.joinMode === 'disabled') {
        booking.videoCall.provider = 'disabled';
        booking.videoCall.joinMode = 'disabled';
        booking.videoCall.region = startCallPolicy.region;
        booking.videoCall.status = 'disabled';
        booking.videoCall.policyReason = startCallPolicy.reason;
        booking.videoCall.lastPolicyCheckAt = new Date();
        await booking.save();
        return res.status(403).json({
          success: false,
          provider: 'disabled',
          joinMode: 'disabled',
          region: startCallPolicy.region,
          status: 'disabled',
          message: 'Video calling is not available until your region is verified.'
        });
      }
    }

    // Start session
    await booking.startSession();

    // Generate video call room URL if it's a video session
    let roomUrl = null;
    if (booking.sessionType === 'video') {
      const policy = startCallPolicy;
      const configuredExternalProvider = policy.joinMode === 'external_link'
        && booking.videoCall.provider
        && !['livekit', 'disabled'].includes(booking.videoCall.provider);
      booking.videoCall.provider = configuredExternalProvider ? booking.videoCall.provider : policy.provider;
      booking.videoCall.joinMode = policy.joinMode;
      booking.videoCall.region = policy.region;
      booking.videoCall.policyReason = policy.reason;
      booking.videoCall.lastPolicyCheckAt = new Date();
      booking.videoCall.status = policy.joinMode === 'disabled'
        ? 'disabled'
        : policy.joinMode === 'external_link'
          ? (booking.videoCall.externalJoinUrl ? 'started' : 'not_configured')
          : 'started';
      await booking.save();
    }

    // Emit Socket.IO events for status change and session started
    if (req.app.get('io')) {
      const io = req.app.get('io');
      
      // Emit general status change event
      io.to(`user_${booking.user._id}`).emit('booking_status_changed', {
        bookingId: booking._id.toString(),
        status: booking.status
      });
      
      // Emit specific session_started event to notify user that counselor is waiting
      const counsellorName = booking.counsellor && booking.counsellor.user ? 
        `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}` : 
        'Your Counselor';
      
      io.to(`user_${booking.user._id}`).emit('session_started', {
        bookingId: booking._id.toString(),
        status: booking.status,
        sessionType: booking.sessionType,
        roomUrl: roomUrl,
        counsellorName: counsellorName,
        scheduledAt: booking.scheduledAt.toISOString(),
        sessionDuration: booking.sessionDuration
      });
      
      if (booking.counsellor) {
        io.to(`counsellor_${booking.counsellor._id}`).emit('booking_status_changed', {
          bookingId: booking._id.toString(),
          status: booking.status
        });
      }
    }

    res.json({
      success: true,
      message: 'Session started successfully',
      data: {
        roomUrl,
        sessionType: booking.sessionType
      }
    });

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/bookings/:id/complete
// @desc    Complete a session
// @access  Private
router.put('/:id/complete', [
  param('id').isMongoId().withMessage('Invalid booking ID')
], authAny, async (req, res) => {
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

    const booking = await Booking.findById(id)
      .populate('counsellor', 'user')
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (!canManageSessionState(booking, req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned counsellor or an administrator can complete this session.'
      });
    }

    if (booking.status !== 'in-progress') {
      return res.status(400).json({
        success: false,
        message: 'Session cannot be completed'
      });
    }

    // Complete session
    await booking.complete();

    // Emit Socket.IO event for status change
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`user_${booking.user._id}`).emit('booking_status_changed', {
        bookingId: booking._id,
        status: booking.status
      });
      if (booking.counsellor) {
        io.to(`counsellor_${booking.counsellor._id}`).emit('booking_status_changed', {
          bookingId: booking._id,
          status: booking.status
        });
      }
    }

    res.json({
      success: true,
      message: 'Session completed successfully'
    });

  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
