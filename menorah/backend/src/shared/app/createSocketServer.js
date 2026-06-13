const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const Counsellor = require('../../models/Counsellor');
const Message = require('../../models/Message');
const ChatRoom = require('../../models/ChatRoom');
const chatRoutes = require('../../routes/chat');
const { getPubClient, getSubClient } = require('../../config/redis');

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

const attachSocketHandlers = (io) => {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: Token required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      const { isTokenBlocked } = require('../../middleware/auth');

      if (await isTokenBlocked(token)) {
        return next(new Error('Authentication error: Token revoked'));
      }

      socket.userId = decoded.userId;
      socket.userRole = decoded.role || 'user';
      socket.userName = '';
      return next();
    } catch {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      const { default: mongoose } = await import('mongoose');
      const User = mongoose.model('User');
      const user = await User.findById(socket.userId).select('firstName lastName').lean();
      if (user) socket.userName = `${user.firstName} ${user.lastName}`;
    } catch {
      // Display names are non-critical for socket startup.
    }

    socket.join(`user_${socket.userId}`);
    chatRoutes.setUserOnline(socket.userId, socket.userName);

    socket.broadcast.emit('user_status_changed', {
      userId: socket.userId,
      isOnline: true,
      timestamp: new Date().toISOString()
    });

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
        const room = await ChatRoom.findById(roomId).populate('counsellor', 'user').lean();
        if (!room) return;

        const userId = socket.userId.toString();
        const isUser = room.user?.toString() === userId;
        const isCounsellor = room.counsellor?.user?.toString() === userId;
        if (!isUser && !isCounsellor) return;

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

    socket.on('leave_room', (roomId) => {
      if (!roomId) return;
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

        const payload = {
          id: msg._id.toString(),
          senderId: socket.userId,
          senderName: socket.userName,
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

    socket.on('typing_start', (roomId) => {
      if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
      socket.to(`chat_${roomId}`).emit('user_typing', { userId: socket.userId, isTyping: true });
    });

    socket.on('typing_stop', (roomId) => {
      if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
      socket.to(`chat_${roomId}`).emit('user_typing', { userId: socket.userId, isTyping: false });
    });

    socket.on('mark_read', ({ roomId, messageId }) => {
      if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
      socket.to(`chat_${roomId}`).emit('message_read', {
        messageId,
        readBy: socket.userId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('set_online_status', (isOnline) =>
      socket.broadcast.emit('user_status_changed', {
        userId: socket.userId,
        isOnline,
        timestamp: new Date().toISOString()
      })
    );

    socket.on('disconnect', () => {
      chatRoutes.setUserOffline(socket.userId);
      socket.broadcast.emit('user_status_changed', {
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
      allowedHeaders: ['Content-Type', 'Authorization']
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
  parseBooleanEnv
};
