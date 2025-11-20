const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const Counsellor = require('../models/Counsellor');

// Socket.IO instance will be set from server.js to avoid circular dependency
let socketIOInstance = null;
const setSocketIO = (io) => {
  socketIOInstance = io;
};

const router = express.Router();

// Store online users for real-time status (can be moved to Redis in production)
const onlineUsers = new Map();

// @route   GET /api/chat/rooms
// @desc    Get user's chat rooms
// @access  Private
router.get('/rooms', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user's chat rooms from database
    const chatRooms = await ChatRoom.find({
      user: userId,
      isActive: true
    })
      .populate('counsellor', 'user')
      .populate('counsellor.user', 'firstName lastName profileImage')
      .populate('lastMessage.senderId', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .lean();

    // Format response to match frontend expectations
    const formattedRooms = await Promise.all(chatRooms.map(async (room) => {
      const counsellorUser = room.counsellor && room.counsellor.user ? room.counsellor.user : null;
      const counsellorUserId = counsellorUser ? counsellorUser._id.toString() : null;
      const isOnline = counsellorUserId ? onlineUsers.has(counsellorUserId) : false;

      // Determine unread count based on who is viewing
      const roomUserId = room.user ? (typeof room.user === 'object' ? room.user._id.toString() : room.user.toString()) : null;
      const unreadCount = roomUserId === userId.toString()
        ? (room.unreadCount?.user || 0)
        : (room.unreadCount?.counsellor || 0);

      // Build counsellor name safely
      let counsellorName = 'Counsellor';
      if (counsellorUser) {
        const firstName = counsellorUser.firstName || '';
        const lastName = counsellorUser.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName && fullName !== 'undefined undefined') {
          counsellorName = fullName;
        }
      }

      return {
        id: room._id.toString(),
        counsellorName: counsellorName,
        counsellorImage: counsellorUser?.profileImage || null,
        counsellorUserId: counsellorUserId, // Add counselor userId for presence tracking
        lastMessage: room.lastMessage?.content || '',
        lastMessageTime: room.lastMessage?.timestamp || room.updatedAt,
        unreadCount: unreadCount || 0,
        isOnline: isOnline || false
      };
    }));

    res.json({
      success: true,
      data: { chatRooms: formattedRooms }
    });

  } catch (error) {
    console.error('Get chat rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/chat/rooms/:roomId/messages
// @desc    Get messages for a specific chat room
// @access  Private
router.get('/rooms/:roomId/messages', [
  param('roomId').isMongoId().withMessage('Invalid room ID'),
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

    const { roomId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user._id;

    // Verify user has access to this room
    const room = await ChatRoom.findById(roomId)
      .populate('counsellor', 'user')
      .populate('counsellor.user', 'firstName lastName profileImage')
      .populate('user', 'firstName lastName profileImage');
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is part of this room
    const isUser = room.user && room.user._id.toString() === userId.toString();
    let isCounsellor = false;
    
    if (room.counsellor && room.counsellor.user) {
      const counsellorUserId = room.counsellor.user._id.toString();
      isCounsellor = counsellorUserId === userId.toString();
    }

    if (!isUser && !isCounsellor) {
      console.error('Access denied for get messages:', {
        roomId,
        userId: userId.toString(),
        roomUserId: room.user ? room.user._id.toString() : 'null',
        counsellorUserId: room.counsellor && room.counsellor.user ? room.counsellor.user._id.toString() : 'null'
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get messages from database
    const messages = await Message.find({
      room: roomId,
      isDeleted: false
    })
      .populate('sender', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Message.countDocuments({
      room: roomId,
      isDeleted: false
    });

    // Format messages
    const formattedMessages = messages.reverse().map(msg => {
      const sender = msg.sender;
      const isRead = msg.readBy.some(read => read.userId.toString() === userId.toString());

      return {
        id: msg._id.toString(),
        senderId: msg.sender._id.toString(),
        senderName: `${sender.firstName} ${sender.lastName}`,
        senderImage: sender.profileImage || null,
        content: msg.content,
        timestamp: msg.createdAt,
        type: msg.type,
        status: isRead ? 'read' : (msg.status || 'sent'),
        roomId: roomId
      };
    });

    // Reset unread count for this user
    if (isUser) {
      await room.resetUnread('user');
    } else if (isCounsellor) {
      await room.resetUnread('counsellor');
    }

    res.json({
      success: true,
      data: {
        messages: formattedMessages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/chat/rooms/:roomId/messages
// @desc    Send a message in a chat room
// @access  Private
router.post('/rooms/:roomId/messages', [
  param('roomId').isMongoId().withMessage('Invalid room ID'),
  body('content').notEmpty().trim().withMessage('Message content is required'),
  body('type').optional().isIn(['text', 'image', 'file']).withMessage('Invalid message type')
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

    const { roomId } = req.params;
    const { content, type = 'text' } = req.body;
    const userId = req.user._id;

    // Verify room exists and user has access
    const room = await ChatRoom.findById(roomId)
      .populate('counsellor', 'user')
      .populate('counsellor.user', 'firstName lastName profileImage')
      .populate('user', 'firstName lastName profileImage');

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is part of this room
    const isUser = room.user && room.user._id.toString() === userId.toString();
    let isCounsellor = false;
    
    if (room.counsellor && room.counsellor.user) {
      const counsellorUserId = room.counsellor.user._id.toString();
      isCounsellor = counsellorUserId === userId.toString();
    }

    if (!isUser && !isCounsellor) {
      console.error('Access denied for message send:', {
        roomId,
        userId: userId.toString(),
        roomUserId: room.user ? room.user._id.toString() : 'null',
        counsellorUserId: room.counsellor && room.counsellor.user ? room.counsellor.user._id.toString() : 'null'
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Create message
    const message = new Message({
      room: roomId,
      sender: userId,
      content: content.trim(),
      type,
      status: 'sent'
    });

    await message.save();

    // Populate sender for response
    await message.populate('sender', 'firstName lastName profileImage');

    // Update room's last message
    await room.updateLastMessage(content, userId);

    // Increment unread count for the other participant
    if (isUser) {
      await room.incrementUnread('counsellor');
    } else {
      await room.incrementUnread('user');
    }

    // Format response
    const formattedMessage = {
      id: message._id.toString(),
      senderId: message.sender._id.toString(),
      senderName: `${message.sender.firstName} ${message.sender.lastName}`,
      senderImage: message.sender.profileImage || null,
      content: message.content,
      timestamp: message.createdAt,
      type: message.type,
      status: message.status,
      roomId: roomId
    };

    // Emit via Socket.IO for real-time updates
    if (socketIOInstance) {
      socketIOInstance.to(`chat_${roomId}`).emit('new_message', formattedMessage);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message: formattedMessage }
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/chat/rooms/:roomId/messages/:messageId/read
// @desc    Mark a message as read
// @access  Private
router.put('/rooms/:roomId/messages/:messageId/read', [
  param('roomId').isMongoId().withMessage('Invalid room ID'),
  param('messageId').isMongoId().withMessage('Invalid message ID')
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

    const { roomId, messageId } = req.params;
    const userId = req.user._id;

    // Verify room exists and user has access
    const room = await ChatRoom.findById(roomId)
      .populate('counsellor', 'user')
      .populate('counsellor.user', 'firstName lastName profileImage')
      .populate('user', 'firstName lastName profileImage');
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is part of this room
    const isUser = room.user && room.user._id.toString() === userId.toString();
    let isCounsellor = false;
    
    if (room.counsellor && room.counsellor.user) {
      const counsellorUserId = room.counsellor.user._id.toString();
      isCounsellor = counsellorUserId === userId.toString();
    }

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find and mark message as read
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    if (message.room.toString() !== roomId) {
      return res.status(400).json({
        success: false,
        message: 'Message does not belong to this room'
      });
    }

    await message.markAsRead(userId);

    // Emit read receipt via Socket.IO
    if (socketIOInstance) {
      socketIOInstance.to(`chat_${roomId}`).emit('message_read', {
        messageId: messageId,
        readBy: userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Message marked as read'
    });

  } catch (error) {
    console.error('Mark message as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
  }
});

// @route   DELETE /api/chat/rooms/:roomId/messages/:messageId
// @desc    Delete a message
// @access  Private
router.delete('/rooms/:roomId/messages/:messageId', [
  param('roomId').isMongoId().withMessage('Invalid room ID'),
  param('messageId').isMongoId().withMessage('Invalid message ID')
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

    const { roomId, messageId } = req.params;
    const userId = req.user._id;

    // Verify room exists and user has access
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Find message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }

    // Soft delete message
    await message.softDelete(userId);

    // Emit deletion via Socket.IO
    if (socketIOInstance) {
      socketIOInstance.to(`chat_${roomId}`).emit('message_deleted', {
        messageId: messageId,
        deletedBy: userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/chat/rooms/:roomId/typing
// @desc    Send typing indicator
// @access  Private
router.post('/rooms/:roomId/typing', [
  param('roomId').isMongoId().withMessage('Invalid room ID'),
  body('isTyping').isBoolean().withMessage('isTyping must be a boolean')
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

    const { roomId } = req.params;
    const { isTyping } = req.body;
    const userId = req.user._id;

    // Verify room exists and user has access
    const room = await ChatRoom.findById(roomId)
      .populate('counsellor', 'user')
      .populate('user');
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is part of this room
    const isUser = room.user && (typeof room.user === 'object' ? room.user._id.toString() : room.user.toString()) === userId.toString();
    let isCounsellor = false;
    
    if (room.counsellor && room.counsellor.user) {
      const counsellorUserId = typeof room.counsellor.user === 'object' ? room.counsellor.user._id.toString() : room.counsellor.user.toString();
      isCounsellor = counsellorUserId === userId.toString();
    }

    if (!isUser && !isCounsellor) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Emit typing indicator via Socket.IO
    if (socketIOInstance) {
      socketIOInstance.to(`chat_${roomId}`).except(userId.toString()).emit('user_typing', {
        userId: userId.toString(),
        userName: req.user.firstName + ' ' + req.user.lastName,
        isTyping: isTyping,
        roomId: roomId
      });
    }

    res.json({
      success: true,
      message: 'Typing indicator sent'
    });

  } catch (error) {
    console.error('Send typing indicator error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/chat/online-status
// @desc    Get online status of users
// @access  Private
router.get('/online-status', auth, async (req, res) => {
  try {
    const onlineStatus = Array.from(onlineUsers.entries()).map(([userId, data]) => ({
      userId,
      userName: data.userName,
      isOnline: data.isOnline,
      lastSeen: data.lastSeen
    }));

    res.json({
      success: true,
      data: { onlineStatus }
    });

  } catch (error) {
    console.error('Get online status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/chat/available-counsellors
// @desc    Get available counselors for chat
// @access  Private (User only)
router.get('/available-counsellors', auth, async (req, res) => {
  try {
    // Only users can access this endpoint
    if (req.user.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only users can access this endpoint.'
      });
    }

    // Get available counselors for chat
    // For chat, we only require isActive and isAvailable (not isVerified)
    // This allows users to chat with counselors even if they're not fully verified yet
    const availableCounsellors = await Counsellor.find({
      isActive: true,
      isAvailable: true
    })
      .populate('user', 'firstName lastName profileImage')
      .sort({ rating: -1, reviewCount: -1 })
      .lean();

    console.log(`Found ${availableCounsellors.length} available counselors for chat`);

    // Format response
    const formattedCounsellors = availableCounsellors.map(counsellor => {
      const counsellorUser = counsellor.user;
      const counsellorUserId = counsellorUser._id.toString();
      const isOnline = onlineUsers.has(counsellorUserId);

      // Handle specialization - it can be a string or array
      let specializationArray = [];
      if (counsellor.specializations && Array.isArray(counsellor.specializations)) {
        specializationArray = counsellor.specializations;
      } else if (counsellor.specialization) {
        // If it's a string, convert to array
        if (typeof counsellor.specialization === 'string') {
          specializationArray = [counsellor.specialization];
        } else if (Array.isArray(counsellor.specialization)) {
          specializationArray = counsellor.specialization;
        }
      }

      return {
        id: counsellor._id.toString(),
        counsellorId: counsellor._id.toString(),
        name: `${counsellorUser.firstName} ${counsellorUser.lastName}`,
        firstName: counsellorUser.firstName,
        lastName: counsellorUser.lastName,
        profileImage: counsellorUser.profileImage || null,
        specialization: specializationArray,
        rating: counsellor.rating || 0,
        reviewCount: counsellor.reviewCount || 0,
        isOnline: isOnline || false,
        isAvailable: counsellor.isAvailable || false
      };
    });

    res.json({
      success: true,
      data: { counsellors: formattedCounsellors }
    });

  } catch (error) {
    console.error('Get available counselors error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/chat/start
// @desc    Start a chat with an available counselor
// @access  Private (User only)
router.post('/start', [
  body('counsellorId').isMongoId().withMessage('Invalid counsellor ID')
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

    // Only users can start chats
    if (req.user.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only users can start chats.'
      });
    }

    const { counsellorId } = req.body;
    const userId = req.user._id;

    // Verify counselor exists and is available
    const counsellor = await Counsellor.findById(counsellorId)
      .populate('user', 'firstName lastName profileImage');

    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not found'
      });
    }

    if (!counsellor.isActive || !counsellor.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor is not available at the moment'
      });
    }

    // Find or create chat room
    const room = await ChatRoom.findOrCreate(userId, counsellorId, null);

    // Populate room data
    await room.populate('counsellor', 'user');
    await room.populate('counsellor.user', 'firstName lastName profileImage');
    await room.populate('user', 'firstName lastName profileImage');

    // Format response
    const counsellorUserId = counsellor.user._id.toString();
    const formattedRoom = {
      id: room._id.toString(),
      roomId: room._id.toString(),
      counsellorId: counsellor._id.toString(),
      counsellorUserId: counsellorUserId, // Add counselor userId for presence tracking
      counsellorName: (() => {
        const firstName = counsellor.user.firstName || '';
        const lastName = counsellor.user.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        return fullName && fullName !== 'undefined undefined' ? fullName : 'Counsellor';
      })(),
      counsellorImage: counsellor.user.profileImage || null,
      lastMessage: room.lastMessage?.content || '',
      lastMessageTime: room.lastMessage?.timestamp || room.updatedAt,
      unreadCount: room.unreadCount.user || 0,
      isOnline: onlineUsers.has(counsellorUserId) || false
    };

    // Emit notification to counselor via Socket.IO
    if (socketIOInstance) {
      socketIOInstance.to(`counsellor_${counsellorId}`).emit('new_chat_started', {
        roomId: room._id.toString(),
        userId: userId.toString(),
        userName: `${req.user.firstName} ${req.user.lastName}`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Chat started successfully',
      data: { room: formattedRoom }
    });

  } catch (error) {
    console.error('Start chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/chat/counsellor/rooms
// @desc    Get counselor's chat rooms
// @access  Private (Counsellor only)
router.get('/counsellor/rooms', auth, async (req, res) => {
  try {
    // Only counselors can access this endpoint
    if (req.user.role !== 'counsellor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only counselors can access this endpoint.'
      });
    }

    const userId = req.user._id;

    // Find counselor by user ID
    const counsellor = await Counsellor.findOne({ user: userId });
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    // Get counselor's chat rooms
    const chatRooms = await ChatRoom.find({
      counsellor: counsellor._id,
      isActive: true
    })
      .populate('user', 'firstName lastName profileImage')
      .populate('lastMessage.senderId', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .lean();

    // Format response
    const formattedRooms = await Promise.all(chatRooms.map(async (room) => {
      const user = room.user;
      const userIdStr = user._id.toString();
      const isOnline = onlineUsers.has(userIdStr);

      // Determine unread count for counselor
      const unreadCount = room.unreadCount.counsellor || 0;

      return {
        id: room._id.toString(),
        roomId: room._id.toString(),
        userId: userIdStr,
        userName: `${user.firstName} ${user.lastName}`,
        userImage: user.profileImage || null,
        lastMessage: room.lastMessage?.content || '',
        lastMessageTime: room.lastMessage?.timestamp || room.updatedAt,
        unreadCount: unreadCount,
        isOnline: isOnline || false
      };
    }));

    res.json({
      success: true,
      data: { chatRooms: formattedRooms }
    });

  } catch (error) {
    console.error('Get counselor chat rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper function to get or create chat room for a booking
const getOrCreateRoomForBooking = async (userId, counsellorId, bookingId) => {
  return await ChatRoom.findOrCreate(userId, counsellorId, bookingId);
};

module.exports = router;
module.exports.setSocketIO = setSocketIO;
