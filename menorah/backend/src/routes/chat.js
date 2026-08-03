const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const Counsellor = require('../models/Counsellor');
const { getRedisClient } = require('../config/redis');
const {
  buildProfessionallyApprovedCounsellorQuery,
  isCounsellorProfessionallyApproved,
} = require('../services/counsellorVerificationPolicy');
const {
  filterAuthorizedChatRooms,
  loadChatRoomAuthorization,
  populateChatRoomAuthorizationQuery,
} = require('../services/chatRoomAuthorization');
const { recordSecurityEvent } = require('../utils/securityAudit');
const {
  enqueueUserPushNotification,
} = require('../services/pushNotificationService');

// Socket.IO instance will be set from server.js to avoid circular dependency
let socketIOInstance = null;
const setSocketIO = (io) => {
  socketIOInstance = io;
};

const router = express.Router();

// ─── Redis-backed presence ─────────────────────────────────────────────────
// TTL of 5 min — acts as a safety net if the disconnect event is missed
const PRESENCE_TTL = 300;

const setUserOnline = (userId, userName) => {
  try {
    const redis = getRedisClient();
    redis.setEx(`presence:${userId}`, PRESENCE_TTL, userName || '').catch((err) =>
      console.error('Redis setUserOnline error:', err?.code || 'PRESENCE_WRITE_FAILED')
    );
  } catch {
    // Redis not ready yet (e.g. first connection) — silently ignore
  }
};

const setUserOffline = (userId) => {
  try {
    const redis = getRedisClient();
    redis.del(`presence:${userId}`).catch((err) =>
      console.error('Redis setUserOffline error:', err?.code || 'PRESENCE_DELETE_FAILED')
    );
  } catch {
    // Redis not ready yet — silently ignore
  }
};

const isUserOnline = async (userId) => {
  try {
    const redis = getRedisClient();
    return (await redis.exists(`presence:${userId}`)) === 1;
  } catch {
    return false;
  }
};

const recordChatAuthorizationDenial = (req, reason, roomId) => {
  try {
    recordSecurityEvent('chat_authorization_denied', {
      req,
      user: req.user,
      outcome: 'failure',
      statusCode: 403,
      details: {
        reason,
        resource: 'chat_room',
        targetId: roomId,
      },
    });
    if (req?.res?.locals) req.res.locals.securityAuthorizationLogged = true;
  } catch {
    // Authorization still fails closed if audit output is unavailable.
  }
};

const loadAuthorizedRoomForRequest = async (req, res, roomId) => {
  const { room, access } = await loadChatRoomAuthorization({
    roomId,
    requesterUserId: req.user._id,
  });
  if (!room) {
    res.status(404).json({
      success: false,
      message: 'Chat room not found',
    });
    return null;
  }
  if (!access.allowed) {
    recordChatAuthorizationDenial(req, access.reason, roomId);
    res.status(403).json({
      success: false,
      code: access.reason,
      message: 'Access denied',
    });
    return null;
  }
  return { room, access };
};

const identifierString = (value) => {
  const identifier = value?._id ?? value;
  return identifier?.toString?.() || null;
};

const getChatEventRooms = (room, roomId) => {
  const participantUserIds = [
    identifierString(room?.user),
    identifierString(room?.counsellor?.user),
  ].filter(Boolean);

  return [
    `chat_${roomId}`,
    ...participantUserIds.map((userId) => `user_${userId}`),
  ].filter((roomName, index, roomNames) => roomNames.indexOf(roomName) === index);
};

const emitChatEvent = (io, room, roomId, eventName, payload) => {
  if (!io) return;
  io.to(getChatEventRooms(room, roomId)).emit(eventName, {
    ...payload,
    roomId: roomId.toString(),
  });
};

const getVisiblePresenceUserIds = async (requester) => {
  const requesterId = requester._id.toString();

  if (requester.role === 'user') {
    const rooms = await populateChatRoomAuthorizationQuery(
      ChatRoom.find({ user: requester._id, isActive: true })
    ).lean();
    return filterAuthorizedChatRooms({
      rooms,
      requesterUserId: requester._id,
    })
      .map((room) => room.counsellor?.user?._id?.toString?.())
      .filter(Boolean);
  }

  if (requester.role === 'counsellor') {
    const counsellor = await Counsellor.findOne({ user: requester._id }).select('_id').lean();
    if (!counsellor) return [];

    const rooms = await populateChatRoomAuthorizationQuery(
      ChatRoom.find({ counsellor: counsellor._id, isActive: true })
    ).lean();
    return filterAuthorizedChatRooms({
      rooms,
      requesterUserId: requester._id,
    })
      .map((room) => room.user?._id?.toString?.())
      .filter((userId) => userId && userId !== requesterId);
  }

  return [];
};

// @route   GET /api/chat/rooms
// @desc    Get user's chat rooms
// @access  Private
router.get('/rooms', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user's chat rooms from database
    const chatRooms = await populateChatRoomAuthorizationQuery(
      ChatRoom.find({
        user: userId,
        isActive: true
      })
    )
      .populate('lastMessage.senderId', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .lean();
    const authorizedChatRooms = filterAuthorizedChatRooms({
      rooms: chatRooms,
      requesterUserId: userId,
    });

    // Format response to match frontend expectations
    const formattedRooms = await Promise.all(authorizedChatRooms.map(async (room) => {
      const counsellorUser = room.counsellor && room.counsellor.user ? room.counsellor.user : null;
      const counsellorUserId = counsellorUser ? counsellorUser._id.toString() : null;
      const isOnline = counsellorUserId ? await isUserOnline(counsellorUserId) : false;

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
        lastMessageSenderId: identifierString(room.lastMessage?.senderId),
        unreadCount: unreadCount || 0,
        isOnline: isOnline || false
      };
    }));

    res.json({
      success: true,
      data: { chatRooms: formattedRooms }
    });

  } catch (error) {
    console.error('Get chat rooms error:', error?.code || 'CHAT_ROOM_LIST_FAILED');
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

    const authorizedRoom = await loadAuthorizedRoomForRequest(req, res, roomId);
    if (!authorizedRoom) return;
    const { room, access } = authorizedRoom;
    const isUser = access.participantRole === 'user';
    const isCounsellor = access.participantRole === 'counsellor';

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
    console.error('Get messages error:', error?.code || 'CHAT_MESSAGE_LIST_FAILED');
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
  body('content')
    .isString()
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message content must be between 1 and 5000 characters'),
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

    const authorizedRoom = await loadAuthorizedRoomForRequest(req, res, roomId);
    if (!authorizedRoom) return;
    const { room, access } = authorizedRoom;
    const isUser = access.participantRole === 'user';

    // Strip HTML tags (defense-in-depth against stored XSS if content is ever rendered as HTML)
    const safeContent = content.trim().replace(/<[^>]*>/g, '');
    if (!safeContent) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required',
      });
    }

    // Create message
    const message = new Message({
      room: roomId,
      sender: userId,
      content: safeContent,
      type,
      status: 'sent'
    });

    await message.save();

    // Populate sender for response
    await message.populate('sender', 'firstName lastName profileImage');

    // Update room's last message
    await room.updateLastMessage(safeContent, userId);

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
    emitChatEvent(socketIOInstance, room, roomId, 'new_message', formattedMessage);

    if (!isUser) {
      try {
        await enqueueUserPushNotification({
          user: room.user?._id || room.user,
          eventKey: `chat-message:${message._id}`,
          type: 'message',
          title: 'New message',
          body: 'Open Menorah to view your message.',
          channelId: 'messages',
          data: { roomId: String(roomId) },
        });
      } catch (notificationError) {
        console.error(
          'Queue chat push notification failed:',
          notificationError?.code || 'CHAT_PUSH_ENQUEUE_FAILED'
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message: formattedMessage }
    });

  } catch (error) {
    console.error('Send message error:', error?.code || 'CHAT_MESSAGE_SEND_FAILED');
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

    const authorizedRoom = await loadAuthorizedRoomForRequest(req, res, roomId);
    if (!authorizedRoom) return;
    const { room } = authorizedRoom;

    // Find and mark message as read
    const message = await Message.findOne({ _id: messageId, room: roomId });
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    await message.markAsRead(userId);

    // Emit read receipt via Socket.IO
    emitChatEvent(socketIOInstance, room, roomId, 'message_read', {
      messageId: messageId,
      readBy: userId.toString(),
      readByUserName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Message marked as read'
    });

  } catch (error) {
    console.error('Mark message as read error:', error?.code || 'CHAT_MESSAGE_READ_FAILED');
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

    const authorizedRoom = await loadAuthorizedRoomForRequest(req, res, roomId);
    if (!authorizedRoom) return;
    const { room } = authorizedRoom;

    const message = await Message.findOne({ _id: messageId, room: roomId });
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
    emitChatEvent(socketIOInstance, room, roomId, 'message_deleted', {
      messageId: messageId,
      deletedBy: userId.toString(),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error?.code || 'CHAT_MESSAGE_DELETE_FAILED');
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

    if (!await loadAuthorizedRoomForRequest(req, res, roomId)) return;

    // Emit typing indicator via Socket.IO
    if (socketIOInstance) {
      socketIOInstance.to(`chat_${roomId}`).emit('user_typing', {
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
    console.error('Send typing indicator error:', error?.code || 'CHAT_TYPING_FAILED');
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
    const redis = getRedisClient();
    const visibleUserIds = await getVisiblePresenceUserIds(req.user);
    const onlineStatus = (await Promise.all(
      visibleUserIds.map(async (userId) => {
        const userName = await redis.get(`presence:${userId}`);
        return userName === null ? null : { userId, userName: userName || '', isOnline: true };
      })
    )).filter(Boolean);

    res.json({ success: true, data: { onlineStatus } });
  } catch (error) {
    console.error('Get online status error:', error?.code || 'CHAT_PRESENCE_LIST_FAILED');
    res.status(500).json({ success: false, message: 'Internal server error' });
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

    const availableCounsellors = await Counsellor.find(
      buildProfessionallyApprovedCounsellorQuery({ requireAvailability: true })
    )
      .populate({
        path: 'user',
        select: 'firstName lastName profileImage role isActive',
        match: { role: 'counsellor', isActive: true },
      })
      .sort({ rating: -1, reviewCount: -1 })
      .lean();

    // Format response — skip counsellors whose user document was deleted
    const formattedCounsellors = await Promise.all(
      availableCounsellors
        .filter((counsellor) =>
          counsellor.user != null
          && isCounsellorProfessionallyApproved(counsellor, {
            account: counsellor.user,
            requireAvailability: true,
          })
        )
        .map(async (counsellor) => {
      const counsellorUser = counsellor.user;
      const counsellorUserId = counsellorUser._id.toString();
      const isOnline = await isUserOnline(counsellorUserId);

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
    })
    );

    res.json({
      success: true,
      data: { counsellors: formattedCounsellors }
    });

  } catch (error) {
    console.error(
      'Get available counselors error:',
      error?.code || 'CHAT_COUNSELLOR_LIST_FAILED'
    );
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
      .populate('user', 'firstName lastName profileImage role isActive');

    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor not found'
      });
    }

    if (!isCounsellorProfessionallyApproved(counsellor, { requireAvailability: true })) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor is not available at the moment'
      });
    }

    // Find or create chat room
    const room = await ChatRoom.findOrCreate(userId, counsellorId, null);
    if (!room || room.isActive !== true) {
      return res.status(403).json({
        success: false,
        message: 'Chat is not currently available',
      });
    }

    // Populate room data
    await room.populate({ path: 'counsellor', populate: { path: 'user', select: 'firstName lastName profileImage' } });
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
      isOnline: await isUserOnline(counsellorUserId)
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
    console.error('Start chat error:', error?.code || 'CHAT_START_FAILED');
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
    const counsellor = await Counsellor.findOne({
      user: userId,
      ...buildProfessionallyApprovedCounsellorQuery({
        requireAvailability: false,
      }),
    });
    if (
      !counsellor
      || !isCounsellorProfessionallyApproved(counsellor, {
        account: req.user,
        requireAvailability: false,
      })
    ) {
      return res.status(403).json({
        success: false,
        message: 'Counsellor access is not currently available'
      });
    }

    // Get counselor's chat rooms
    const chatRooms = await populateChatRoomAuthorizationQuery(
      ChatRoom.find({
        counsellor: counsellor._id,
        isActive: true
      })
    )
      .populate('lastMessage.senderId', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .lean();
    const authorizedChatRooms = filterAuthorizedChatRooms({
      rooms: chatRooms,
      requesterUserId: userId,
    });

    // Format response
    const formattedRooms = await Promise.all(authorizedChatRooms.map(async (room) => {
      const user = room.user;
      const userIdStr = user._id.toString();
      const isOnline = await isUserOnline(userIdStr);

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
    console.error(
      'Get counselor chat rooms error:',
      error?.code || 'COUNSELLOR_CHAT_ROOM_LIST_FAILED'
    );
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
module.exports.setSocketIO = setSocketIO;
module.exports.setUserOnline = setUserOnline;
module.exports.setUserOffline = setUserOffline;
module.exports._private = {
  getChatEventRooms,
};
