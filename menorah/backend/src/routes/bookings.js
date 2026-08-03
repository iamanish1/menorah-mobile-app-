const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Counsellor = require('../models/Counsellor');
const User = require('../models/User');
const { auth, authAny, verifiedPatientAuth } = require('../middleware/auth');
const { sendBookingConfirmationEmail, sendSessionReminderEmail } = require('../utils/email');
const { sendBookingConfirmationSMS, sendSessionReminderSMS, sendCancellationSMS } = require('../utils/sms');
const {
  getPendingHoldExpiresAt,
  expireStalePendingBookings,
  buildBookingConflictQuery,
  isDirectlyCancellableUnpaidHold,
  isBlockingBooking,
  isSessionWithinWorkingHours,
  isUnpaidPaymentHold,
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
const {
  isBookingAuthorizationValid,
} = require('../services/bookingMarketplacePolicy');
const { isBookingPaymentInitiationEnabled } = require('../config/paymentFeatures');
const {
  buildProfessionallyApprovedCounsellorQuery,
  isCounsellorProfessionallyApproved,
} = require('../services/counsellorVerificationPolicy');
const {
  evaluateScheduledSessionAccess,
} = require('../services/sessionAuthorizationPolicy');
const { recordSecurityEvent } = require('../utils/securityAudit');
const { ensureBookingChatRoom } = require('../services/bookingChatRoom');

const router = express.Router();
const SLOT_TAKEN_MESSAGE = 'This time slot was just booked by someone else. Please choose another available slot.';
const DIRECT_BOOKING_TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
});
const directBookingConflict = (code, message) => Object.assign(new Error(message), {
  code,
  isDirectBookingConflict: true,
});

const isMongoTransactionConflict = (error) => Boolean(
  [112, 251].includes(error?.code)
  || (
    typeof error?.hasErrorLabel === 'function'
    && (
      error.hasErrorLabel('TransientTransactionError')
      || error.hasErrorLabel('UnknownTransactionCommitResult')
    )
  )
);

const getPaymentPresentation = (booking) => {
  const explicitReviewRequired = Boolean(
    booking?.paymentMethod === 'razorpay'
    && booking?.paymentStatus !== 'refunded'
    && booking?.bookingAuthorization?.kind === 'payment'
    && booking?.bookingAuthorization?.status === 'needs_review'
  );
  const paidAuthorizationReviewRequired = Boolean(
    booking?.paymentStatus === 'paid'
    && !isBookingAuthorizationValid(booking)
  );
  const reviewRequired = explicitReviewRequired || paidAuthorizationReviewRequired;
  const canResumePayment = Boolean(
    !reviewRequired
    && booking?.status === 'pending'
    && ['pending', 'failed'].includes(booking?.paymentStatus)
    && booking?.paymentMethod === 'razorpay'
    && booking?.bookingAuthorization?.kind === 'payment'
    && booking?.bookingAuthorization?.status === 'pending'
  );
  return {
    paymentReviewRequired: reviewRequired,
    paymentAction: reviewRequired
      ? 'contact_support'
      : canResumePayment
        ? 'resume_payment'
        : null,
    holdExpiresAt: booking?.holdExpiresAt || null,
  };
};

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

const getBookingAccessPresentation = (booking, { includeHostUrl = false } = {}) => {
  const paymentPresentation = getPaymentPresentation(booking);

  if (!paymentPresentation.paymentReviewRequired) {
    return {
      ...paymentPresentation,
      videoCall: formatVideoCall(booking.videoCall, { includeHostUrl }),
      canBeCancelled: isDirectlyCancellableUnpaidHold(booking),
      canBeRescheduled: booking.canBeRescheduled,
    };
  }

  return {
    ...paymentPresentation,
    videoCall: formatVideoCall({
      provider: 'disabled',
      joinMode: 'disabled',
      status: 'disabled',
    }),
    canBeCancelled: false,
    canBeRescheduled: false,
  };
};

const sessionStateDenialResponse = (reason) => {
  if (reason === 'CALL_TOO_EARLY') {
    return {
      statusCode: 409,
      code: reason,
      message: 'The session access window has not opened yet',
    };
  }
  if (reason === 'CALL_TOO_LATE') {
    return {
      statusCode: 410,
      code: reason,
      message: 'The session access window has closed',
    };
  }
  return {
    statusCode: 403,
    code: reason,
    message: 'This session transition is not currently available',
  };
};

const authorizeCounsellorSessionTransition = ({
  req,
  res,
  booking,
  action,
  allowedStatuses,
}) => {
  const access = evaluateScheduledSessionAccess({
    booking,
    requesterUserId: req.user?._id,
    now: new Date(),
    allowedStatuses,
  });
  const reason = access.allowed && access.participantRole !== 'counsellor'
    ? 'SESSION_COUNSELLOR_REQUIRED'
    : access.reason;

  if (!reason) return access;

  const denial = sessionStateDenialResponse(reason);
  try {
    recordSecurityEvent('call_authorization_denied', {
      req,
      user: req.user,
      outcome: 'failure',
      statusCode: denial.statusCode,
      details: {
        action,
        reason,
        resource: 'booking_session',
        targetId: booking?._id || req.params?.id,
      },
    });
  } catch {
    // Session transitions still fail closed if audit output is unavailable.
  }
  res.locals.securityAuthorizationLogged = true;
  res.status(denial.statusCode).json({
    success: false,
    code: denial.code,
    message: denial.message,
  });
  return null;
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
], verifiedPatientAuth, async (req, res) => {
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
        .populate('user', 'firstName lastName email phone role isActive');

      if (!counsellor || !isCounsellorProfessionallyApproved(counsellor, {
        requireAvailability: true,
      })) {
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
      const daySchedule = counsellor.availability[dayOfWeek];

      if (!daySchedule || !daySchedule.isAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor is not available on this day'
        });
      }

      if (!isSessionWithinWorkingHours({
        scheduledAt: scheduledTime,
        sessionDuration,
        schedule: daySchedule,
        timezone: tz,
      })) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time is outside counsellor\'s working hours'
        });
      }

      // Check for conflicting bookings. Pending payment bookings only block while
      // their short hold is still alive; confirmed/paid bookings block permanently.
      const possibleConflicts = await Booking.find(buildBookingConflictQuery({
        counsellorId,
        scheduledAt: scheduledTime,
        sessionDuration,
      })).lean();

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

    if (paymentStatus === 'pending' && !isBookingPaymentInitiationEnabled()) {
      return res.status(503).json({
        success: false,
        code: 'BOOKING_PAYMENTS_DISABLED',
        message: 'New booking payments are temporarily unavailable.'
      });
    }

    // Prepare an immutable booking payload. Direct bookings construct a fresh
    // document inside each transaction attempt so an aborted callback retry
    // cannot reuse Mongoose document state from the previous attempt.
    const scheduledTime = new Date(scheduledAt);
    const bookingData = {
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
    };
    const createBookingDocument = () => {
      const nextBooking = new Booking(bookingData);

      if (sessionType === 'video') {
        const policy = resolveCallPolicy({
          user: user || req.user,
          booking: nextBooking,
          req: { headers: req.headers, user: req.user }
        });
        nextBooking.videoCall.provider = policy.provider;
        nextBooking.videoCall.joinMode = policy.joinMode;
        nextBooking.videoCall.region = policy.region;
        nextBooking.videoCall.status = policy.joinMode === 'disabled' ? 'disabled' : 'not_configured';
        nextBooking.videoCall.policyReason = policy.reason;
        nextBooking.videoCall.lastPolicyCheckAt = new Date();
        if (policy.providerName) {
          nextBooking.videoCall.externalProviderName = policy.providerName;
        }
      }

      return nextBooking;
    };

    let booking;
    let directBookingSession;
    try {
      if (!counsellor) {
        booking = createBookingDocument();
        await booking.save();
      } else {
        const counsellorAccountId = counsellor.user?._id || counsellor.user;
        directBookingSession = await mongoose.startSession();
        await directBookingSession.withTransaction(async () => {
          const transactionNow = new Date();

          // These writes form an authorization fence. Suspension/expiry and
          // role/deactivation flows update the same documents, so MongoDB
          // serializes those changes against this booking assignment.
          const fencedCounsellor = await Counsellor.findOneAndUpdate({
            _id: counsellor._id,
            ...buildProfessionallyApprovedCounsellorQuery({
              now: transactionNow,
              requireAvailability: true,
            }),
            user: counsellorAccountId,
            hourlyRate: counsellor.hourlyRate,
            currency: counsellor.currency,
          }, {
            $inc: { 'professionalVerification.marketplaceAssignmentFence': 1 },
          }, {
            new: true,
            runValidators: true,
            session: directBookingSession,
          });
          if (!fencedCounsellor) {
            throw directBookingConflict(
              'COUNSELLOR_NOT_ELIGIBLE',
              'Counsellor eligibility or pricing changed before the booking completed.'
            );
          }

          const fencedAccount = await User.findOneAndUpdate({
            _id: counsellorAccountId,
            role: 'counsellor',
            isActive: true,
          }, {
            $inc: { marketplaceAssignmentFence: 1 },
          }, {
            new: true,
            runValidators: true,
            session: directBookingSession,
          });
          if (!fencedAccount) {
            throw directBookingConflict(
              'COUNSELLOR_NOT_ELIGIBLE',
              'The counsellor account changed before the booking completed.'
            );
          }

          if (scheduledTime <= transactionNow) {
            throw directBookingConflict(
              'BOOKING_STATE_CHANGED',
              'The requested booking time is no longer in the future.'
            );
          }

          let transactionDaySchedule;
          try {
            const transactionTimezone = fencedCounsellor.timezone || 'Asia/Kolkata';
            const transactionParts = new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              timeZone: transactionTimezone,
            }).formatToParts(scheduledTime);
            const transactionDay = transactionParts
              .find((part) => part.type === 'weekday')
              ?.value.toLowerCase();
            transactionDaySchedule = fencedCounsellor.availability?.[transactionDay];

            if (!isSessionWithinWorkingHours({
              scheduledAt: scheduledTime,
              sessionDuration,
              schedule: transactionDaySchedule,
              timezone: transactionTimezone,
            })) {
              throw directBookingConflict(
                'COUNSELLOR_SCHEDULE_CHANGED',
                'Counsellor availability changed before the booking completed.'
              );
            }
          } catch (error) {
            if (error?.isDirectBookingConflict) throw error;
            throw directBookingConflict(
              'COUNSELLOR_SCHEDULE_CHANGED',
              'Counsellor availability changed before the booking completed.'
            );
          }

          const transactionQuote = resolveBookingPrice({
            clientInput: req.body,
            sessionDuration,
            counsellor: {
              hourlyRate: fencedCounsellor.hourlyRate,
              currency: fencedCounsellor.currency,
            },
          });
          if (
            transactionQuote.amountMinor !== priceQuote.amountMinor
            || transactionQuote.currency !== priceQuote.currency
          ) {
            throw directBookingConflict(
              'COUNSELLOR_PRICING_CHANGED',
              'Counsellor pricing changed before the booking completed.'
            );
          }

          const transactionConflictQuery = Booking.find(buildBookingConflictQuery({
            counsellorId: counsellor._id,
            scheduledAt: scheduledTime,
            sessionDuration,
          })).session(directBookingSession);
          const transactionConflicts = await transactionConflictQuery.lean();
          const requestedEnd = new Date(
            scheduledTime.getTime() + sessionDuration * 60 * 1000
          );
          const transactionConflict = transactionConflicts.find((candidate) => {
            if (!isBlockingBooking(candidate, transactionNow)) return false;
            const candidateStart = new Date(candidate.scheduledAt);
            const candidateEnd = new Date(
              candidateStart.getTime()
              + (candidate.sessionDuration || sessionDuration) * 60 * 1000
            );
            return scheduledTime < candidateEnd && requestedEnd > candidateStart;
          });
          if (transactionConflict) {
            throw directBookingConflict(
              transactionConflict.status === 'pending' ? 'SLOT_PENDING' : 'SLOT_BOOKED',
              SLOT_TAKEN_MESSAGE
            );
          }

          booking = createBookingDocument();
          await booking.save({ session: directBookingSession });
        }, DIRECT_BOOKING_TRANSACTION_OPTIONS);
      }
    } catch (error) {
      if (error?.isDirectBookingConflict) {
        return res.status(409).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      if (isMongoTransactionConflict(error)) {
        return res.status(409).json({
          success: false,
          code: 'BOOKING_STATE_CHANGED',
          message: 'Counsellor or booking state changed. Please try again.',
        });
      }
      if (error && error.code === 11000) {
        return res.status(409).json({
          success: false,
          code: 'SLOT_BOOKED',
          message: SLOT_TAKEN_MESSAGE
        });
      }
      throw error;
    } finally {
      if (directBookingSession) {
        await directBookingSession.endSession();
      }
    }

    // NOTE: counsellor socket notifications are sent only after payment is confirmed
    // (see payments.js verify-razorpay handler)
    if (paymentStatus === 'paid' && !booking.counsellor && req.app.get('io')) {
      await notifyEligibleCounsellorsOfBooking({
        booking,
        io: req.app.get('io'),
      });
    }

    // Paid promo/subscription bookings are confirmed at creation. Regular
    // Razorpay bookings stay pending here and are notified only after verified
    // payment in payments.js.
    if (counsellor && booking.paymentStatus === 'paid' && booking.status === 'confirmed') {
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
], verifiedPatientAuth, async (req, res) => {
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

    await expireStalePendingBookings(Booking, { user: req.user._id });

    // Build query — support comma-separated status list (e.g. "pending,confirmed")
    const dbQuery = { user: req.user._id };
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(s => validStatuses.includes(s));
      const statusFilter = statuses.length === 1
        ? statuses[0]
        : statuses.length > 1
          ? { $in: statuses }
          : undefined;
      if (statusFilter && statuses.includes('pending')) {
        dbQuery.$or = [
          { status: statusFilter },
          {
            paymentMethod: 'razorpay',
            paymentStatus: { $ne: 'refunded' },
            'bookingAuthorization.kind': 'payment',
            'bookingAuthorization.status': 'needs_review',
          },
        ];
      } else if (statusFilter) {
        dbQuery.status = statusFilter;
      }
    }

    // Keep a live payment hold visible to its owner. They may return after a
    // browser/app interruption to either complete checkout or explicitly
    // cancel the booking and release the held slot.
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
      ...getBookingAccessPresentation(booking),
      isSubscriptionBooking: booking.isSubscriptionBooking || false,
      promo: booking.promo?.code ? {
        code: booking.promo.code,
        discountAmount: booking.promo.discountAmount || 0
      } : undefined,
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

    const chatRoomId = await ensureBookingChatRoom(booking);

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
      ...getBookingAccessPresentation(booking, { includeHostUrl: isCounsellor }),
      isSubscriptionBooking: booking.isSubscriptionBooking || false,
      promo: booking.promo?.code ? {
        code: booking.promo.code,
        discountAmount: booking.promo.discountAmount || 0
      } : undefined,
      createdAt: booking.createdAt,
      chat: chatRoomId ? { roomId: chatRoomId } : undefined,
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
  body('reason').optional().isString().trim().isLength({ max: 500 })
], verifiedPatientAuth, async (req, res) => {
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

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user can cancel this booking
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const now = new Date();
    const cancellationUpdate = {
      $set: {
        status: 'cancelled',
        cancellationReason: reason || null,
        cancelledBy: req.user._id,
        cancelledAt: now,
        'bookingAuthorization.status': 'revoked',
      },
      $push: {
        statusHistory: {
          status: 'cancelled',
          timestamp: now,
          updatedBy: req.user._id,
        },
      },
    };
    const isPaidOrEntitled = booking.paymentStatus === 'paid'
      || booking.paymentMethod === 'subscription'
      || booking.bookingAuthorization?.kind === 'subscription_entitlement';
    if (isPaidOrEntitled) {
      return res.status(409).json({
        success: false,
        code: 'PAID_CANCELLATION_REVIEW_REQUIRED',
        message:
          'Paid or entitled booking cancellation requires manual review. Cancellation and refund eligibility are not determined by this request.'
      });
    }

    const isUnpaidHold = isUnpaidPaymentHold(booking);
    let cancelledBooking;
    if (!isUnpaidHold) {
      return res.status(400).json({
        success: false,
        message: 'Booking cannot be cancelled at this time'
      });
    }
    if (booking.razorpayOrderId) {
      return res.status(409).json({
        success: false,
        code: 'PAYMENT_RECONCILIATION_PENDING',
        message: 'This payment order is still being reconciled. Please wait or contact support.'
      });
    }

    // A booking can be directly released only before any provider order is
    // exposed. Once an order is bound, provider state must be reconciled
    // before cancellation so delayed capture cannot create a paid/cancelled
    // combination.
    cancelledBooking = await Booking.findOneAndUpdate({
      _id: booking._id,
      user: req.user._id,
      status: 'pending',
      paymentStatus: { $in: ['pending', 'failed'] },
      paymentMethod: 'razorpay',
      'bookingAuthorization.kind': 'payment',
      'bookingAuthorization.status': 'pending',
      holdExpiresAt: { $gt: now },
      $or: [
        { razorpayOrderId: { $exists: false } },
        { razorpayOrderId: null },
      ],
    }, {
      ...cancellationUpdate,
      $set: {
        ...cancellationUpdate.$set,
        orderStatus: 'expired',
      },
    }, { new: true, runValidators: true });

    if (!cancelledBooking) {
      const current = await Booking.findById(id)
        .select('status paymentStatus paymentMethod razorpayOrderId bookingAuthorization');
      if (current?.status === 'expired') {
        return res.status(409).json({
          success: false,
          code: 'SLOT_EXPIRED',
          message: 'This unpaid booking hold has expired.'
        });
      }
      if (current?.razorpayOrderId) {
        return res.status(409).json({
          success: false,
          code: 'PAYMENT_RECONCILIATION_PENDING',
          message: 'This payment order is still being reconciled. Please wait or contact support.'
        });
      }
      if (current?.paymentStatus === 'paid') {
        return res.status(409).json({
          success: false,
          code: 'PAID_CANCELLATION_REVIEW_REQUIRED',
          message:
            'Payment completed before cancellation. Manual review is required; cancellation and refund eligibility are not determined by this request.'
        });
      }
      return res.status(409).json({
        success: false,
        code: 'BOOKING_PAYMENT_STATE_CHANGED',
        message: 'The payment state changed while cancellation was requested.'
      });
    }

    // Send cancellation notifications
    try {
      await cancelledBooking.populate([
        {
          path: 'counsellor',
          select: 'user',
          populate: { path: 'user', select: 'firstName lastName' },
        },
        { path: 'user', select: 'phone' },
      ]);
      if (cancelledBooking.counsellor?.user && cancelledBooking.user?.phone) {
        const sessionDetails = {
          counsellorName: `${cancelledBooking.counsellor.user.firstName} ${cancelledBooking.counsellor.user.lastName}`,
          scheduledAt: cancelledBooking.scheduledAt
        };
        await sendCancellationSMS(cancelledBooking.user.phone, sessionDetails);
      }
    } catch (error) {
      console.error('Error sending cancellation notification:', error);
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking: {
          id: cancelledBooking._id,
          status: cancelledBooking.status,
          paymentStatus: cancelledBooking.paymentStatus,
        },
      },
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
      .populate({
        path: 'counsellor',
        select: 'user status isActive professionalVerification',
        populate: {
          path: 'user',
          select: 'firstName lastName role isActive',
        },
      })
      .populate(
        'user',
        'firstName lastName phone address country accountRegion region role isActive'
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const sessionAccess = authorizeCounsellorSessionTransition({
      req,
      res,
      booking,
      action: 'start',
      allowedStatuses: ['confirmed'],
    });
    if (!sessionAccess) return;

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

    const chatRoomId = booking.sessionType === 'chat'
      ? await ensureBookingChatRoom(booking)
      : null;

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
        sessionDuration: booking.sessionDuration,
        ...(chatRoomId ? { roomId: chatRoomId } : {})
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
        sessionType: booking.sessionType,
        ...(chatRoomId ? { roomId: chatRoomId } : {})
      }
    });

  } catch (error) {
    console.error('Start session error:', error?.code || error?.name || 'unknown_error');
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
      .populate({
        path: 'counsellor',
        select: 'user status isActive professionalVerification',
        populate: {
          path: 'user',
          select: 'firstName lastName role isActive',
        },
      })
      .populate(
        'user',
        'firstName lastName role isActive'
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const sessionAccess = authorizeCounsellorSessionTransition({
      req,
      res,
      booking,
      action: 'complete',
      allowedStatuses: ['in-progress'],
    });
    if (!sessionAccess) return;

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
    console.error('Complete session error:', error?.code || error?.name || 'unknown_error');
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
