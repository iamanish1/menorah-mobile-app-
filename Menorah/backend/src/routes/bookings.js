const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const moment = require('moment');
const Booking = require('../models/Booking');
const Counsellor = require('../models/Counsellor');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendBookingConfirmationEmail, sendSessionReminderEmail } = require('../utils/email');
const { sendBookingConfirmationSMS, sendSessionReminderSMS, sendCancellationSMS } = require('../utils/sms');

const router = express.Router();

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
  body('amount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Invalid amount'),
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

    const {
      counsellorId,
      sessionType,
      sessionDuration,
      scheduledAt,
      amount: providedAmount,
      preferences,
      symptoms,
      concerns,
      goals,
      emergencyContact
    } = req.body;

    let counsellor = null;
    let amount = 0;
    let currency = 'INR';

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

      // Check counsellor availability for the scheduled time
      const dayOfWeek = scheduledTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const timeString = scheduledTime.toTimeString().slice(0, 5);
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

      // Check for conflicting bookings
      const conflictingBooking = await Booking.findOne({
        counsellor: counsellorId,
        scheduledAt: {
          $gte: new Date(scheduledTime.getTime() - sessionDuration * 60 * 1000),
          $lte: new Date(scheduledTime.getTime() + sessionDuration * 60 * 1000)
        },
        status: { $in: ['pending', 'confirmed'] }
      });

      if (conflictingBooking) {
        return res.status(400).json({
          success: false,
          message: 'This time slot is already booked'
        });
      }

      // Calculate amount from counsellor's rate
      amount = (counsellor.hourlyRate / 60) * sessionDuration;
      currency = counsellor.currency;
    } else {
      // No counsellor provided - use provided amount or default calculation
      if (providedAmount) {
        amount = providedAmount;
      } else {
        // Default rate calculation: ₹1000 per hour
        amount = (1000 / 60) * sessionDuration;
      }
      
      // Check if scheduled time is in the future
      const scheduledTime = new Date(scheduledAt);
      if (scheduledTime <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time must be in the future'
        });
      }
    }

    // Check if user has active subscription
    const user = await User.findById(req.user._id);
    let isSubscriptionBooking = false;
    let paymentStatus = 'pending';
    let paymentMethod = 'razorpay';
    
    console.log('Checking subscription for user:', req.user._id);
    console.log('User subscription:', user?.subscription);
    
    if (user && user.subscription) {
      const now = new Date();
      const endDate = user.subscription.endDate ? new Date(user.subscription.endDate) : null;
      
      // Check if subscription is active and not expired
      const subscriptionActive = user.subscription.isActive === true;
      const subscriptionNotExpired = endDate && endDate > now;
      
      console.log('Subscription check:', {
        isActive: subscriptionActive,
        endDate: endDate,
        now: now,
        notExpired: subscriptionNotExpired,
        willUseSubscription: subscriptionActive && subscriptionNotExpired
      });
      
      if (subscriptionActive && subscriptionNotExpired) {
        isSubscriptionBooking = true;
        paymentStatus = 'paid';
        paymentMethod = 'subscription';
        // Set amount to 0 for subscription bookings
        amount = 0;
        console.log('Using subscription for booking - amount set to 0');
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
      currency: currency,
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
      isSubscriptionBooking: isSubscriptionBooking,
      preferences: preferences || {},
      symptoms,
      concerns,
      goals,
      emergencyContact
    });

    await booking.save();

    // Emit Socket.IO event for unassigned bookings
    // Only notify AVAILABLE counselors about new unassigned bookings
    if (!counsellor && req.app.get('io')) {
      const io = req.app.get('io');
      const Counsellor = require('../models/Counsellor');
      
      // Find all available and active counselors
      const availableCounsellors = await Counsellor.find({
        isActive: true,
        isAvailable: true
      }).select('_id').lean();
      
      // Notify each available counselor individually
      const bookingNotification = {
        bookingId: booking._id,
        userId: booking.user._id,
        sessionType: booking.sessionType,
        sessionDuration: booking.sessionDuration,
        scheduledAt: booking.scheduledAt,
        amount: booking.amount,
        preferences: booking.preferences,
        createdAt: booking.createdAt
      };
      
      // Emit to each available counselor's room
      availableCounsellors.forEach(counsellor => {
        io.to(`counsellor_${counsellor._id}`).emit('new_booking_available', bookingNotification);
      });
      
      console.log(`Notified ${availableCounsellors.length} available counselor(s) about new booking ${booking._id}`);
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
          isSubscriptionBooking: booking.isSubscriptionBooking || false
        }
      }
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/bookings
// @desc    Get user's bookings
// @access  Private
router.get('/', [
  query('status').optional().isIn(['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']),
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

    // Build query
    const query = { user: req.user._id };
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const bookings = await Booking.find(query)
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
    const total = await Booking.countDocuments(query);

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
      canBeCancelled: booking.canBeCancelled,
      canBeRescheduled: booking.canBeRescheduled
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

    if (!booking.canBeCancelled) {
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
      .populate('counsellor', 'user')
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user can start this session
    const isUser = booking.user._id.toString() === req.user._id.toString();
    const isCounsellor = booking.counsellor.user._id.toString() === req.user._id.toString();

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
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

    // Start session
    await booking.startSession();

    // Generate video call room URL if it's a video session
    let roomUrl = null;
    if (booking.sessionType === 'video') {
      const roomId = `menorah-${booking._id}`;
      roomUrl = `${process.env.JITSI_BASE_URL}/${roomId}`;
      
      booking.videoCall.roomId = roomId;
      booking.videoCall.roomUrl = roomUrl;
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
      .populate('counsellor', 'user')
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user can complete this session
    const isUser = booking.user._id.toString() === req.user._id.toString();
    const isCounsellor = booking.counsellor.user._id.toString() === req.user._id.toString();

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
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
