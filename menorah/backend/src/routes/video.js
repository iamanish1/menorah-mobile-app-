const express = require('express');
const { body, param, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/video/create-room
// @desc    Create a video call room for a booking
// @access  Private
router.post('/create-room', [
  body('bookingId').isMongoId().withMessage('Invalid booking ID')
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

    const { bookingId } = req.body;

    // Get booking details
    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: {
          path: 'user',
          select: 'firstName lastName'
        }
      })
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if counsellor is assigned
    if (!booking.counsellor || !booking.counsellor.user) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor not assigned to this booking'
      });
    }

    // Check if user is authorized to join this session
    const isUser = booking.user._id.toString() === req.user._id.toString();
    const isCounsellor = booking.counsellor.user._id.toString() === req.user._id.toString();

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if session is active (confirmed or in-progress)
    if (booking.status !== 'confirmed' && booking.status !== 'in-progress') {
      return res.status(400).json({
        success: false,
        message: 'Session is not active'
      });
    }

    // For instant sessions (in-progress), skip time check
    // For scheduled sessions (confirmed), check if session time is within 15 minutes before or after scheduled time
    if (booking.status === 'confirmed') {
      const now = new Date();
      const sessionTime = new Date(booking.scheduledAt);
      const timeDiff = Math.abs(now - sessionTime) / (1000 * 60); // minutes

      // Check if this is an instant session (recently assigned and scheduled time is in future)
      const assignedTime = booking.assignedAt ? new Date(booking.assignedAt) : null;
      const isRecentlyAssigned = assignedTime && (now.getTime() - assignedTime.getTime()) < 24 * 60 * 60 * 1000; // Within 24 hours
      const isInstantSession = isRecentlyAssigned && sessionTime > now;

      // Only check time for scheduled sessions, not instant sessions
      if (!isInstantSession && timeDiff > 15) {
        return res.status(400).json({
          success: false,
          message: 'Session is not available at this time'
        });
      }
    }

    // Generate room ID
    const roomId = `menorah-${booking._id}`;
    
    // Generate JWT token for Jitsi
    const jitsiToken = generateJitsiToken(roomId, req.user._id.toString());

    // Update booking with room information
    booking.videoCall.roomId = roomId;
    booking.videoCall.roomUrl = `${process.env.JITSI_BASE_URL}/${roomId}`;
    await booking.save();

    res.json({
      success: true,
      data: {
        roomId,
        roomUrl: booking.videoCall.roomUrl,
        jitsiToken,
        sessionType: booking.sessionType,
        counsellorName: booking.counsellor && booking.counsellor.user 
          ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`
          : 'To be assigned',
        userName: `${booking.user.firstName} ${booking.user.lastName}`,
        scheduledAt: booking.scheduledAt,
        duration: booking.sessionDuration
      }
    });

  } catch (error) {
    console.error('Create video room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/video/room/:bookingId
// @desc    Get video call room details
// @access  Private
router.get('/room/:bookingId', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID')
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

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: {
          path: 'user',
          select: 'firstName lastName'
        }
      })
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if counsellor is assigned
    if (!booking.counsellor || !booking.counsellor.user) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor not assigned to this booking'
      });
    }

    // Check if user is authorized
    const isUser = booking.user._id.toString() === req.user._id.toString();
    const isCounsellor = booking.counsellor.user._id.toString() === req.user._id.toString();

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!booking.videoCall.roomId) {
      return res.status(404).json({
        success: false,
        message: 'Video room not created yet'
      });
    }

    // Generate JWT token
    const jitsiToken = generateJitsiToken(booking.videoCall.roomId, req.user._id.toString());

    res.json({
      success: true,
      data: {
        roomId: booking.videoCall.roomId,
        roomUrl: booking.videoCall.roomUrl,
        jitsiToken,
        sessionType: booking.sessionType,
        counsellorName: booking.counsellor && booking.counsellor.user 
          ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`
          : 'To be assigned',
        userName: `${booking.user.firstName} ${booking.user.lastName}`,
        scheduledAt: booking.scheduledAt,
        duration: booking.sessionDuration,
        status: booking.status
      }
    });

  } catch (error) {
    console.error('Get video room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/video/room/:bookingId/join
// @desc    Join a video call room
// @access  Private
router.post('/room/:bookingId/join', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID')
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

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: {
          path: 'user',
          select: 'firstName lastName'
        }
      })
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if counsellor is assigned
    if (!booking.counsellor || !booking.counsellor.user) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor not assigned to this booking'
      });
    }

    // Check if user is authorized
    const isUser = booking.user._id.toString() === req.user._id.toString();
    const isCounsellor = booking.counsellor.user._id.toString() === req.user._id.toString();

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if session is active
    if (booking.status !== 'confirmed' && booking.status !== 'in-progress') {
      return res.status(400).json({
        success: false,
        message: 'Session is not active'
      });
    }

    // Only the counsellor can start the session (move confirmed → in-progress).
    // A user joining while the session is still 'confirmed' means the counsellor
    // has not started yet — return a clear error so the frontend shows a waiting room.
    if (booking.status === 'confirmed') {
      if (isCounsellor) {
        await booking.startSession();

        // Create video room if needed
        if (!booking.videoCall.roomId && booking.sessionType === 'video') {
          const roomId = `menorah-${booking._id}`;
          booking.videoCall.roomId = roomId;
          booking.videoCall.roomUrl = `${process.env.JITSI_BASE_URL}/${roomId}`;
          await booking.save();
        }

        // Notify user that session has started
        if (req.app.get('io')) {
          const io = req.app.get('io');
          const counsellorName = booking.counsellor && booking.counsellor.user
            ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`
            : 'Your Counselor';

          io.to(`user_${booking.user._id}`).emit('session_started', {
            bookingId: booking._id.toString(),
            status: 'in-progress',
            sessionType: booking.sessionType,
            counsellorName,
            scheduledAt: booking.scheduledAt.toISOString(),
            sessionDuration: booking.sessionDuration
          });

          io.to(`user_${booking.user._id}`).emit('booking_status_changed', {
            bookingId: booking._id.toString(),
            status: 'in-progress'
          });
        }
      } else {
        // User tried to join but counsellor hasn't started yet
        return res.status(400).json({
          success: false,
          message: 'Session has not been started by the counsellor yet'
        });
      }
    }

    // If video room doesn't exist, create it
    if (!booking.videoCall.roomId && booking.sessionType === 'video') {
      const roomId = `menorah-${booking._id}`;
      booking.videoCall.roomId = roomId;
      booking.videoCall.roomUrl = `${process.env.JITSI_BASE_URL}/${roomId}`;
      await booking.save();
    }

    // Ensure roomId exists for video sessions
    if (booking.sessionType === 'video' && !booking.videoCall.roomId) {
      return res.status(400).json({
        success: false,
        message: 'Video room not available for this session'
      });
    }

    // Generate JWT token
    const jitsiToken = generateJitsiToken(booking.videoCall.roomId, req.user._id.toString());

    res.json({
      success: true,
      message: 'Joined video room successfully',
      data: {
        roomId: booking.videoCall.roomId,
        roomUrl: booking.videoCall.roomUrl,
        jitsiToken,
        sessionType: booking.sessionType,
        counsellorName: booking.counsellor && booking.counsellor.user 
          ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`
          : 'To be assigned',
        userName: `${booking.user.firstName} ${booking.user.lastName}`,
        scheduledAt: booking.scheduledAt,
        duration: booking.sessionDuration,
        status: booking.status
      }
    });

  } catch (error) {
    console.error('Join video room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/video/room/:bookingId/leave
// @desc    Leave a video call room
// @access  Private
router.post('/room/:bookingId/leave', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID')
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

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: {
          path: 'user',
          select: 'firstName lastName'
        }
      })
      .populate('user', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if counsellor is assigned
    if (!booking.counsellor || !booking.counsellor.user) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor not assigned to this booking'
      });
    }

    // Check if user is authorized
    const isUser = booking.user._id.toString() === req.user._id.toString();
    const isCounsellor = booking.counsellor && booking.counsellor.user._id.toString() === req.user._id.toString();

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only the counsellor completing the session marks it as done.
    // A user leaving the call should never complete the session — they may
    // reconnect, or the counsellor may still be in the call.
    if (booking.status === 'in-progress' && isCounsellor) {
      await booking.complete();

      // Notify user that session has ended
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.to(`user_${booking.user._id}`).emit('booking_status_changed', {
          bookingId: booking._id.toString(),
          status: 'completed'
        });
      }
    }

    res.json({
      success: true,
      message: 'Left video room successfully'
    });

  } catch (error) {
    console.error('Leave video room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/video/room/:bookingId/recording
// @desc    Toggle recording for a video call
// @access  Private
router.post('/room/:bookingId/recording', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID'),
  body('enable').isBoolean().withMessage('Enable must be a boolean')
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

    const { bookingId } = req.params;
    const { enable } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: {
          path: 'user',
          select: 'firstName lastName'
        }
      });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if counsellor is assigned
    if (!booking.counsellor || !booking.counsellor.user) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor not assigned to this booking'
      });
    }

    // Only counsellor can toggle recording
    const isCounsellor = booking.counsellor.user._id.toString() === req.user._id.toString();
    if (!isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Only counsellor can toggle recording'
      });
    }

    // Update recording status
    booking.videoCall.isRecordingEnabled = enable;
    await booking.save();

    res.json({
      success: true,
      message: `Recording ${enable ? 'enabled' : 'disabled'} successfully`
    });

  } catch (error) {
    console.error('Toggle recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper function to generate Jitsi JWT token.
// Returns null when JITSI_APP_ID / JITSI_APP_SECRET are not configured —
// the public meet.jit.si server works without JWT authentication.
const generateJitsiToken = (roomId, userId) => {
  const appId     = process.env.JITSI_APP_ID;
  const appSecret = process.env.JITSI_APP_SECRET;

  if (!appId || !appSecret) return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (60 * 60); // 1 hour

  const header = { alg: 'HS256', typ: 'JWT' };

  const payload = {
    aud: 'jitsi',
    iss: appId,
    sub: process.env.JITSI_BASE_URL,
    room: roomId,
    context: {
      user: {
        id: userId,
        name: 'User',
        moderator: false
      }
    },
    exp,
    nbf: now
  };

  const encodedHeader  = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = require('crypto')
    .createHmac('sha256', appSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

module.exports = router;
