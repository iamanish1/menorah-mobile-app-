const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const User = require('../../models/User');
const Counsellor = require('../../models/Counsellor');
const Message = require('../../models/Message');
const ChatRoom = require('../../models/ChatRoom');
const chatRoutes = require('../../routes/chat');
const { getPubClient, getSubClient } = require('../../config/redis');
const { verifyAdminToken, verifyUserToken } = require('../../utils/authTokens');
const {
  getCookieToken,
  getWebSessionForRequest,
} = require('../../config/webSessions');
const { getCounsellorProfileImage } = require('../../utils/chatProfileImage');

const SOCKET_ENABLED_SERVICES = new Set(['api-ios', 'api-android', 'api-web']);

const parseBooleanEnv = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const getServiceRuntime = () => process.env.SERVICE_RUNTIME || 'home';

const resolveSocketRuntime = ({ serviceName, enableSocketsDefault = false } = {}) => {
  const serviceRuntime = getServiceRuntime();
  const supported = SOCKET_ENABLED_SERVICES.has(serviceName);

  if (serviceRuntime === 'cloudrun') {
    return {
      serviceRuntime,
      supported,
      socketEnabled: false,
      socketAdapterEnabled: false
    };
  }

  const socketEnabled = supported && parseBooleanEnv(process.env.ENABLE_SOCKET_IO, enableSocketsDefault);
  const socketAdapterEnabled =
    socketEnabled && parseBooleanEnv(process.env.ENABLE_SOCKET_ADAPTER, true);

  return {
    serviceRuntime,
    supported,
    socketEnabled,
    socketAdapterEnabled
  };
};

const isRoomParticipant = (room, userId) => {
  const id = userId.toString();
  const isUser = room.user?.toString() === id;
  const isCounsellor = room.counsellor?.user?.toString() === id;
  return isUser || isCounsellor;
};

const loadAuthorizedRoom = async (roomId, userId) => {
  const room = await ChatRoom.findById(roomId).populate('counsellor', 'user').lean();
  if (!room || !isRoomParticipant(room, userId)) return null;
  return room;
};

const revalidateSocketSession = async (socket) => {
  try {
    const user = await User.findById(socket.userId)
      .select('isActive isEmailVerified sessionVersion role')
      .lean();
    const valid = Boolean(
      user
      && user.isActive
      && user.isEmailVerified
      && user.role === socket.userRole
      && (user.sessionVersion || 0) === (socket.sessionVersion || 0)
    );
    if (valid) return true;
  } catch (error) {
    console.error('Socket session revalidation error:', error.message);
  }

  socket.emit('session_revoked', { reason: 'session_invalid' });
  socket.disconnect(true);
  return false;
};

const emitPresenceToJoinedChatRooms = (socket, event) => {
  for (const room of socket.rooms) {
    if (typeof room === 'string' && room.startsWith('chat_')) {
      socket.to(room).emit('user_status_changed', event);
    }
  }
};

const getSocketWebSession = (socket) => getWebSessionForRequest({
  headers: socket.handshake.headers || {},
  get(name) {
    return this.headers[String(name || '').toLowerCase()];
  },
});

const attachSocketHandlers = (io) => {
  io.use(async (socket, next) => {
    const webSession = getSocketWebSession(socket);
    const token = webSession
      ? getCookieToken({ headers: socket.handshake.headers || {} }, webSession.cookieName)
      : socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: Token required'));

    try {
      const decoded = webSession?.role === 'admin'
        ? verifyAdminToken(token)
        : verifyUserToken(token);
      const { isTokenBlocked } = require('../../middleware/auth');

      if (await isTokenBlocked(token)) {
        return next(new Error('Authentication error: Token revoked'));
      }

      const user = await User.findById(decoded.userId)
        .select('firstName lastName profileImage role isActive isEmailVerified sessionVersion')
        .lean();
      if (!user || !user.isActive || !user.isEmailVerified || (decoded.sessionVersion || 0) !== (user.sessionVersion || 0)) {
        return next(new Error('Authentication error: Invalid token'));
      }
      if (webSession && user.role !== webSession.role) {
        return next(new Error('Authentication error: Invalid session origin'));
      }

      socket.userId = decoded.userId;
      socket.userRole = user.role || 'user';
      socket.sessionVersion = decoded.sessionVersion || 0;
      socket.userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      socket.userProfileImage = user.profileImage || null;
      socket.authTransport = webSession ? 'cookie' : 'bearer';
      return next();
    } catch {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    // Tokens are checked again before every client-originated event. This
    // closes the gap between a password/session revocation and an otherwise
    // long-lived Socket.IO connection.
    socket.use(async (_packet, next) => {
      if (await revalidateSocketSession(socket)) return next();
      return next(new Error('Authentication error: Session revoked'));
    });

    socket.join(`user_${socket.userId}`);
    chatRoutes.setUserOnline(socket.userId, socket.userName);

    if (socket.userRole === 'counsellor' || socket.userRole === 'admin') {
      Counsellor.findOne({ user: socket.userId, isActive: true })
        .then((counsellor) => {
          if (counsellor) socket.join(`counsellor_${counsellor._id}`);
        })
        .catch((err) => console.error('Error joining counsellor room:', err));
    }

    if (socket.userRole === 'admin') {
      socket.join('admin');
    }

    socket.on('join_room', async (roomId) => {
      try {
        if (!roomId) return;
        const room = await loadAuthorizedRoom(roomId, socket.userId);
        if (!room) return;

        const userId = socket.userId.toString();

        socket.join(`chat_${roomId}`);
        socket.to(`chat_${roomId}`).emit('user_joined', {
          userId,
          roomId,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error('join_room error:', err.message);
      }
    });

    socket.on('leave_room', async (roomId) => {
      if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
      if (!await loadAuthorizedRoom(roomId, socket.userId)) return;

      socket.leave(`chat_${roomId}`);
      socket.to(`chat_${roomId}`).emit('user_left', {
        userId: socket.userId,
        roomId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, type = 'text' } = data;
        if (!roomId || !content) return;
        if (!socket.rooms.has(`chat_${roomId}`)) return;
        if (!await loadAuthorizedRoom(roomId, socket.userId)) return;

        const safeContent = String(content).slice(0, 5000).replace(/<[^>]*>/g, '');
        const msg = await Message.create({
          room: roomId,
          sender: socket.userId,
          content: safeContent,
          type: ['text', 'image', 'file'].includes(type) ? type : 'text',
          status: 'sent'
        });

        await ChatRoom.findByIdAndUpdate(roomId, {
          $set: {
            'lastMessage.content': msg.content,
            'lastMessage.senderId': socket.userId,
            'lastMessage.timestamp': msg.createdAt,
            updatedAt: msg.createdAt
          }
        });

        let senderImage = socket.userProfileImage || null;
        if (socket.userRole === 'counsellor') {
          try {
            const counsellor = await Counsellor.findOne({ user: socket.userId })
              .populate('user', 'profileImage')
              .lean();
            senderImage = getCounsellorProfileImage(counsellor) || senderImage;
          } catch (error) {
            // Never let optional avatar lookup prevent a chat message from
            // being delivered. The user-account image remains a safe fallback.
            console.warn('Could not resolve counsellor chat avatar:', error.message);
          }
        }

        const payload = {
          id: msg._id.toString(),
          senderId: socket.userId,
          senderName: socket.userName,
          senderImage,
          content: msg.content,
          type: msg.type,
          roomId,
          timestamp: msg.createdAt.toISOString(),
          status: 'sent'
        };
        io.to(`chat_${roomId}`).emit('new_message', payload);
        socket.emit('message_delivered', {
          messageId: msg._id.toString(),
          timestamp: payload.timestamp
        });
      } catch (err) {
        console.error('send_message error:', err.message);
      }
    });

    socket.on('typing_start', async (roomId) => {
      if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
      if (!await loadAuthorizedRoom(roomId, socket.userId)) return;
      socket.to(`chat_${roomId}`).emit('user_typing', { userId: socket.userId, isTyping: true });
    });

    socket.on('typing_stop', async (roomId) => {
      if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
      if (!await loadAuthorizedRoom(roomId, socket.userId)) return;
      socket.to(`chat_${roomId}`).emit('user_typing', { userId: socket.userId, isTyping: false });
    });

    socket.on('mark_read', async ({ roomId, messageId }) => {
      if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
      if (!await loadAuthorizedRoom(roomId, socket.userId)) return;
      socket.to(`chat_${roomId}`).emit('message_read', {
        messageId,
        readBy: socket.userId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('set_online_status', (isOnline) =>
      emitPresenceToJoinedChatRooms(socket, {
        userId: socket.userId,
        isOnline,
        timestamp: new Date().toISOString()
      })
    );

    socket.on('disconnect', () => {
      chatRoutes.setUserOffline(socket.userId);
      emitPresenceToJoinedChatRooms(socket, {
        userId: socket.userId,
        isOnline: false,
        timestamp: new Date().toISOString()
      });
    });
  });
};

const createSocketServer = ({ server, corsOrigin, serviceName, enableSocketsDefault = false }) => {
  const runtime = resolveSocketRuntime({ serviceName, enableSocketsDefault });

  if (!runtime.socketEnabled) {
    return {
      io: null,
      ...runtime
    };
  }

  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Transport']
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling']
  });

  attachSocketHandlers(io);

  return {
    io,
    ...runtime
  };
};

const attachSocketAdapter = ({ io, redisReady, socketAdapterEnabled }) => {
  if (!io || !redisReady || !socketAdapterEnabled) {
    return false;
  }

  io.adapter(createAdapter(getPubClient(), getSubClient()));
  return true;
};

module.exports = {
  createSocketServer,
  attachSocketAdapter,
  resolveSocketRuntime,
  parseBooleanEnv,
  revalidateSocketSession,
};
