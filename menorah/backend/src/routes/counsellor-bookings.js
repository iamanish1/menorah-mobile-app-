const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Counsellor = require('../models/Counsellor');
const { counsellorAuth } = require('../middleware/auth');

const router = express.Router();

// Helper function to get counselor from user
const getCounsellorFromUser = async (userId) => {
  return await Counsellor.findOne({ user: userId });
};

// @route   GET /api/counsellors/me/bookings/pending
// @desc    Get unassigned bookings available for acceptance
// @access  Private (Counsellor)
router.get('/me/bookings/pending', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    // Allow viewing pending bookings even if temporarily unavailable
    // Only check if counsellor profile exists and is active
    if (!counsellor.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor profile is not active'
      });
    }

    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;

    // Find unassigned bookings (no counsellor, status pending)
    const query = {
      counsellor: null,
      status: 'pending',
      scheduledAt: { $gte: new Date() } // Only future bookings
    };

    // Optional: Filter by counselor's specialization or preferences
    // For now, show all pending bookings

    // Calculate pagination
    const skip = (pageNum - 1) * limitNum;

    // Debug logging
    console.log('Pending bookings query:', JSON.stringify(query, null, 2));
    console.log('Pagination:', { page: pageNum, limit: limitNum, skip });

    // Execute query
    const bookings = await Booking.find(query)
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage gender'
      })
      .sort({ scheduledAt: 1 }) // Earliest first
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count
    const total = await Booking.countDocuments(query);
    
    console.log(`Found ${bookings.length} pending bookings out of ${total} total`);

    // Format response
    const formattedBookings = bookings
      .filter(booking => booking.user) // Filter out bookings with null/undefined users
      .map(booking => ({
        id: booking._id,
        userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
        userEmail: booking.user?.email || '',
        userPhone: booking.user?.phone || '',
        userImage: booking.user?.profileImage,
        userGender: booking.user?.gender,
        sessionType: booking.sessionType,
        sessionDuration: booking.sessionDuration,
        scheduledAt: booking.scheduledAt,
        amount: booking.amount,
        currency: booking.currency,
        paymentStatus: booking.paymentStatus,
        isSubscriptionBooking: booking.isSubscriptionBooking || false,
        paymentMethod: booking.paymentMethod,
        preferences: booking.preferences,
        symptoms: booking.symptoms,
        concerns: booking.concerns,
        goals: booking.goals,
        emergencyContact: booking.emergencyContact,
        createdAt: booking.createdAt
      }));

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Get pending bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/counsellors/me/bookings/:id
// @desc    Get a specific booking by ID
// @access  Private (Counsellor)
router.get('/me/bookings/:id', [
  param('id').isMongoId().withMessage('Invalid booking ID')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const { id } = req.params;

    // Find booking that counselor can access (matching dashboard logic):
    // 1. Assigned to this counselor (any status except cancelled)
    // 2. Unassigned pending/confirmed bookings (available for any counselor)
    let booking = await Booking.findOne({
      _id: id,
      status: { $ne: 'cancelled' }, // Exclude cancelled bookings
      $or: [
        { counsellor: counsellor._id }, // Assigned to this counselor
        { 
          counsellor: null, 
          status: { $in: ['pending', 'confirmed'] } // Unassigned available bookings
        }
      ]
    })
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage gender'
      })
      .lean();

    if (!booking) {
      // If not found with the above criteria, check if booking exists at all
      // This helps with debugging
      const bookingExists = await Booking.findById(id).lean();
      if (bookingExists) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this booking. It may be assigned to another counselor or is not available.'
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Format response
    const formattedBooking = {
      id: booking._id,
      userName: booking.user ? `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User' : 'Unknown User',
      userEmail: booking.user?.email || '',
      userPhone: booking.user?.phone || '',
      userImage: booking.user?.profileImage,
      userGender: booking.user?.gender,
      sessionType: booking.sessionType,
      sessionDuration: booking.sessionDuration,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      symptoms: booking.symptoms,
      concerns: booking.concerns,
      goals: booking.goals,
      emergencyContact: booking.emergencyContact,
      preferences: booking.preferences,
      assignedAt: booking.assignedAt,
      createdAt: booking.createdAt,
      statusHistory: booking.statusHistory
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

// @route   GET /api/counsellors/me/bookings
// @desc    Get counselor's assigned bookings
// @access  Private (Counsellor)
router.get('/me/bookings', [
  query('status').optional().isIn(['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Build query
    const query = { counsellor: counsellor._id };
    if (status) {
      query.status = status;
    }
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const bookings = await Booking.find(query)
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage'
      })
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Booking.countDocuments(query);

    // Format response
    const formattedBookings = bookings
      .filter(booking => booking.user) // Filter out bookings with null/undefined users
      .map(booking => ({
        id: booking._id,
        userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
        userEmail: booking.user?.email || '',
        userPhone: booking.user?.phone || '',
        userImage: booking.user?.profileImage,
      sessionType: booking.sessionType,
      sessionDuration: booking.sessionDuration,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      isSubscriptionBooking: booking.isSubscriptionBooking || false,
      paymentMethod: booking.paymentMethod,
      symptoms: booking.symptoms,
      concerns: booking.concerns,
      goals: booking.goals,
      emergencyContact: booking.emergencyContact,
      assignedAt: booking.assignedAt
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
    console.error('Get counsellor bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/counsellors/me/bookings/:id/accept
// @desc    Counselor accepts/assigns themselves to a booking
// @access  Private (Counsellor)
router.post('/me/bookings/:id/accept', [
  param('id').isMongoId().withMessage('Invalid booking ID')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    // Check if counselor is available to accept bookings
    if (!counsellor.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor account is not active'
      });
    }

    if (!counsellor.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor is currently not available to accept new bookings. Please set your availability to "Available" to accept bookings.'
      });
    }

    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('user', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.counsellor) {
      return res.status(400).json({
        success: false,
        message: 'Booking is already assigned to a counsellor'
      });
    }

    // Allow accepting unassigned bookings that are pending or confirmed
    // (confirmed but unassigned is an edge case that can happen)
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot accept booking with status '${booking.status}'. Only pending or confirmed unassigned bookings can be accepted.`
      });
    }

    // Check if this is an instant session (unassigned pending/confirmed booking)
    // For instant sessions, we skip time-based conflict checks since they can start immediately
    const now = new Date();
    const scheduledTime = new Date(booking.scheduledAt);
    // Instant sessions are unassigned bookings that are pending or confirmed
    const isInstantSession = !booking.counsellor && ['pending', 'confirmed'].includes(booking.status);
    
    if (!isInstantSession) {
      // For scheduled sessions, check availability and time conflicts
      // Get day of week as lowercase string (monday, tuesday, etc.)
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = days[scheduledTime.getDay()];
      const timeString = scheduledTime.toTimeString().slice(0, 5);
      
      // Check if availability exists and has the day
      if (!counsellor.availability || typeof counsellor.availability !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Counsellor availability is not configured'
        });
      }
      
      const daySchedule = counsellor.availability[dayOfWeek];

      if (!daySchedule || !daySchedule.isAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor is not available on this day'
        });
      }

      if (!daySchedule.start || !daySchedule.end) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor working hours are not configured for this day'
        });
      }

      if (timeString < daySchedule.start || timeString > daySchedule.end) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time is outside counsellor\'s working hours'
        });
      }

      // Check for conflicting bookings (only for scheduled sessions)
      const conflictingBooking = await Booking.findOne({
        counsellor: counsellor._id,
        scheduledAt: {
          $gte: new Date(scheduledTime.getTime() - booking.sessionDuration * 60 * 1000),
          $lte: new Date(scheduledTime.getTime() + booking.sessionDuration * 60 * 1000)
        },
        status: { $in: ['pending', 'confirmed', 'in-progress'] },
        _id: { $ne: booking._id }
      });

      if (conflictingBooking) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor has a conflicting booking at this time'
        });
      }
    } else {
      // For instant sessions, only check if counselor has an active in-progress session
      // Multiple instant sessions can be accepted, but only one can be in-progress at a time
      const activeSession = await Booking.findOne({
        counsellor: counsellor._id,
        status: 'in-progress',
        _id: { $ne: booking._id }
      });

      if (activeSession) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor is currently in an active session. Please complete it before accepting a new booking.'
        });
      }
    }

    // Assign counsellor to booking
    booking.counsellor = counsellor._id;
    booking.assignedAt = new Date();
    booking.status = 'confirmed';
    
    // Update amount based on counsellor's rate if not already set
    if (!booking.amount || booking.amount === 0) {
      booking.amount = (counsellor.hourlyRate / 60) * booking.sessionDuration;
      booking.currency = counsellor.currency;
    }

    await booking.save();

    // Emit Socket.IO event (will be handled in server.js)
    if (req.app.get('io') && booking.user) {
      const io = req.app.get('io');
      io.to(`counsellor_${counsellor._id}`).emit('booking_assigned', {
        bookingId: booking._id,
        userId: booking.user._id,
        scheduledAt: booking.scheduledAt
      });
      
      // Notify user
      io.to(`user_${booking.user._id}`).emit('booking_confirmed', {
        bookingId: booking._id,
        counsellorName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Counsellor'
      });
    }

    res.json({
      success: true,
      message: 'Booking accepted successfully',
      data: {
        booking: {
          id: booking._id,
          status: booking.status,
          assignedAt: booking.assignedAt
        }
      }
    });

  } catch (error) {
    console.error('Accept booking error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/counsellors/me/bookings/:id/schedule
// @desc    Counselor schedules/reschedules a session time
// @access  Private (Counsellor)
router.put('/me/bookings/:id/schedule', [
  param('id').isMongoId().withMessage('Invalid booking ID'),
  body('scheduledAt').isISO8601().withMessage('Invalid scheduled date')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const { id } = req.params;
    const { scheduledAt } = req.body;

    const booking = await Booking.findById(id)
      .populate('user', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.counsellor?.toString() !== counsellor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This booking is not assigned to you'
      });
    }

    const scheduledTime = new Date(scheduledAt);
    
    // Check if scheduled time is in the future
    if (scheduledTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled time must be in the future'
      });
    }

    // Check counsellor availability
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[scheduledTime.getDay()];
    const timeString = scheduledTime.toTimeString().slice(0, 5);
    
    // Check if availability exists and has the day
    if (!counsellor.availability || typeof counsellor.availability !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Counsellor availability is not configured'
      });
    }
    
    const daySchedule = counsellor.availability[dayOfWeek];

    if (!daySchedule || !daySchedule.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor is not available on this day'
      });
    }

    if (!daySchedule.start || !daySchedule.end) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor working hours are not configured for this day'
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
      counsellor: counsellor._id,
      scheduledAt: {
        $gte: new Date(scheduledTime.getTime() - booking.sessionDuration * 60 * 1000),
        $lte: new Date(scheduledTime.getTime() + booking.sessionDuration * 60 * 1000)
      },
      status: { $in: ['pending', 'confirmed'] },
      _id: { $ne: booking._id }
    });

    if (conflictingBooking) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor has a conflicting booking at this time'
      });
    }

    // Update scheduled time
    const oldScheduledAt = booking.scheduledAt;
    booking.scheduledAt = scheduledTime;
    await booking.save();

    // Emit Socket.IO event
    if (req.app.get('io') && booking.user) {
      const io = req.app.get('io');
      io.to(`counsellor_${counsellor._id}`).emit('booking_scheduled', {
        bookingId: booking._id,
        scheduledAt: booking.scheduledAt,
        oldScheduledAt
      });
      
      // Notify user
      io.to(`user_${booking.user._id}`).emit('booking_rescheduled', {
        bookingId: booking._id,
        scheduledAt: booking.scheduledAt
      });
    }

    res.json({
      success: true,
      message: 'Session scheduled successfully',
      data: {
        booking: {
          id: booking._id,
          scheduledAt: booking.scheduledAt
        }
      }
    });

  } catch (error) {
    console.error('Schedule booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/counsellors/me/dashboard
// @desc    Get counselor dashboard statistics
// @access  Private (Counsellor)
router.get('/me/dashboard', counsellorAuth, async (req, res) => {
  try {
    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    // Check if counselor is available - only available counselors can see unassigned bookings
    const isCounsellorAvailable = counsellor.isActive && counsellor.isAvailable;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Total bookings - ALL bookings that counselors can work with
    // Includes: assigned to this counselor OR unassigned (only if counselor is available)
    const totalBookings = await Booking.countDocuments({
      $or: [
        { counsellor: counsellor._id }, // Always show assigned bookings
        ...(isCounsellorAvailable ? [{ counsellor: null, status: { $in: ['pending', 'confirmed'] } }] : []) // Only show unassigned if available
      ],
      status: { $ne: 'cancelled' }
    });

    // Upcoming sessions (next 7 days) - ALL available bookings
    const upcomingSessions = await Booking.countDocuments({
      $or: [
        { counsellor: counsellor._id }, // Always show assigned bookings
        ...(isCounsellorAvailable ? [{ counsellor: null, status: 'pending' }] : []) // Only show unassigned if available
      ],
      scheduledAt: { $gte: now, $lte: next7Days },
      status: { $in: ['confirmed', 'pending'] }
    });

    // Pending assignments (unassigned bookings available for any AVAILABLE counselor)
    // For instant sessions, we show all pending bookings regardless of scheduledAt
    // Only show to counselors who are available
    const pendingAssignments = isCounsellorAvailable 
      ? await Booking.countDocuments({
          counsellor: null,
          status: 'pending'
        })
      : 0;

    // Monthly earnings - Calculate total from ALL bookings (not just completed/paid)
    // This shows the total booking amount for the month
    const monthlyBookings = await Booking.find({
      counsellor: counsellor._id,
      scheduledAt: { $gte: startOfMonth, $lte: endOfMonth },
      status: { $ne: 'cancelled' } // Exclude cancelled bookings
    }).select('amount currency').lean();

    const monthlyEarnings = monthlyBookings.reduce((total, booking) => {
      // Sum all booking amounts (not just earnings after commission)
      return total + (booking.amount || 0);
    }, 0);

    // Today's schedule - ALL bookings available for counselors (assigned or unassigned)
    // For instant sessions, we show all available bookings, prioritizing today's scheduled ones
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // Get assigned bookings for today
    const assignedToday = await Booking.find({
      counsellor: counsellor._id,
      scheduledAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['confirmed', 'pending', 'in-progress'] }
    })
      .populate('user', 'firstName lastName profileImage')
      .sort({ scheduledAt: 1 })
      .lean();
    
    // Get all unassigned pending bookings (for instant sessions, these can be started anytime)
    // Only show to counselors who are available
    const unassignedPending = isCounsellorAvailable
      ? await Booking.find({
          counsellor: null,
          status: 'pending'
        })
          .populate('user', 'firstName lastName profileImage')
          .sort({ createdAt: -1 }) // Most recent first for instant sessions
          .lean()
      : [];
    
    // Combine and sort: assigned today's bookings first, then unassigned pending
    const todayBookings = [...assignedToday, ...unassignedPending].sort((a, b) => {
      // If both are assigned, sort by scheduledAt
      if (a.counsellor && b.counsellor) {
        return new Date(a.scheduledAt) - new Date(b.scheduledAt);
      }
      // Unassigned (pending) bookings come after assigned ones
      if (!a.counsellor && b.counsellor) return 1;
      if (a.counsellor && !b.counsellor) return -1;
      // Both unassigned, sort by creation date (newest first for instant sessions)
      const dateA = a.createdAt ? new Date(a.createdAt) : (a._id && typeof a._id.getTimestamp === 'function' ? a._id.getTimestamp() : new Date(0));
      const dateB = b.createdAt ? new Date(b.createdAt) : (b._id && typeof b._id.getTimestamp === 'function' ? b._id.getTimestamp() : new Date(0));
      return dateB.getTime() - dateA.getTime();
    });

    // Recent bookings (last 10) - ALL bookings available for counselors
    // Only show unassigned bookings to available counselors
    const recentBookings = await Booking.find({
      $or: [
        { counsellor: counsellor._id }, // Always show assigned bookings
        ...(isCounsellorAvailable ? [{ counsellor: null, status: { $in: ['pending', 'confirmed'] } }] : []) // Only show unassigned if available
      ],
      status: { $ne: 'cancelled' }
    })
      .populate('user', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      data: {
        counsellorStatus: {
          isActive: counsellor.isActive,
          isAvailable: counsellor.isAvailable,
          message: !counsellor.isActive 
            ? 'Your account is not active. Please contact support.'
            : !counsellor.isAvailable 
            ? 'You are currently not available. Set your availability to "Available" to see and accept new bookings.'
            : 'You are available to accept new bookings.'
        },
        stats: {
          totalBookings,
          upcomingSessions,
          pendingAssignments,
          monthlyEarnings: {
            amount: monthlyEarnings,
            currency: counsellor.currency || 'INR'
          }
        },
        todaySchedule: todayBookings
          .filter(booking => booking.user)
          .map(booking => ({
            id: booking._id.toString(),
            userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
            userImage: booking.user?.profileImage,
            sessionType: booking.sessionType,
            sessionDuration: booking.sessionDuration,
            scheduledAt: booking.scheduledAt,
            status: booking.status,
            isSubscriptionBooking: booking.isSubscriptionBooking || false,
            paymentMethod: booking.paymentMethod
          })),
        recentBookings: recentBookings
          .filter(booking => booking.user)
          .map(booking => ({
            id: booking._id.toString(),
            userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
            userImage: booking.user?.profileImage,
          sessionType: booking.sessionType,
          scheduledAt: booking.scheduledAt,
          status: booking.status,
          amount: booking.amount,
          currency: booking.currency,
          isSubscriptionBooking: booking.isSubscriptionBooking || false,
          paymentMethod: booking.paymentMethod
        }))
      }
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;

