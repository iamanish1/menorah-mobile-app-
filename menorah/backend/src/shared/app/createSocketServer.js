const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const User = require('../../models/User');
const Counsellor = require('../../models/Counsellor');
const Message = require('../../models/Message');
const ChatRoom = require('../../models/ChatRoom');
const chatRoutes = require('../../routes/chat');
const { getPubClient, getSubClient } = require('../../config/redis');
const {
  evaluateAccountAccess: evaluateCounsellorAccountAccess,
} = require('../../services/counsellorVerificationExpiry');
const { verifyAdminToken, verifyUserToken } = require('../../utils/authTokens');
const {
  getCookieToken,
  getWebSessionForRequest,
} = require('../../config/webSessions');

const SOCKET_ENABLED_SERVICES = new Set(['api-ios', 'api-android', 'api-web']);
const DEFAULT_SOCKET_SESSION_REVALIDATION_INTERVAL_MS = 30 * 1000;
const SOCKET_REVALIDATION_CONCURRENCY = 10;

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

const createSocketSessionRevalidator = ({
  UserModel = User,
  evaluateCounsellorAccess = evaluateCounsellorAccountAccess,
} = {}) => async (socket) => {
  const user = await UserModel.findById(socket.userId)
    .select('firstName lastName role isActive sessionVersion')
    .lean();
  if (
    !user
    || !user.isActive
    || user.role !== socket.userRole
    || (socket.sessionVersion || 0) !== (user.sessionVersion || 0)
  ) {
    return false;
  }

  if (user.role === 'counsellor') {
    const professionalAccess = await evaluateCounsellorAccess({
      account: user,
    });
    if (!professionalAccess.allowed) return false;
  }

  return true;
};

const revalidateConnectedSockets = async ({
  io,
  revalidateSocket,
  concurrency = SOCKET_REVALIDATION_CONCURRENCY,
}) => {
  const sockets = [...io.sockets.sockets.values()];
  let cursor = 0;
  const workerCount = Math.min(
    sockets.length,
    Math.max(1, Number.isSafeInteger(concurrency) ? concurrency : 1)
  );

  const worker = async () => {
    while (cursor < sockets.length) {
      const socket = sockets[cursor];
      cursor += 1;
      try {
        if (!await revalidateSocket(socket)) {
          socket.disconnect(true);
        }
      } catch (error) {
        console.error(
          'Socket session revalidation failed closed:',
          error?.code || 'SOCKET_SESSION_REVALIDATION_FAILED'
        );
        socket.disconnect(true);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return sockets.length;
};

const readSocketSessionRevalidationInterval = () => {
  const configured = Number(process.env.SOCKET_SESSION_REVALIDATION_INTERVAL_MS);
  if (!Number.isSafeInteger(configured)) {
    return DEFAULT_SOCKET_SESSION_REVALIDATION_INTERVAL_MS;
  }
  return Math.min(Math.max(configured, 5000), 5 * 60 * 1000);
};

const startSocketSessionRevalidation = ({
  io,
  revalidateSocket,
  intervalMs = readSocketSessionRevalidationInterval(),
}) => {
  let running = false;
  const run = async () => {
    if (running) return 0;
    running = true;
    try {
      return await revalidateConnectedSockets({ io, revalidateSocket });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    run().catch((error) => {
      console.error(
        'Socket session revalidation sweep failed:',
        error?.code || 'SOCKET_SESSION_REVALIDATION_SWEEP_FAILED'
      );
    });
  }, intervalMs);
  timer.unref?.();

  return {
    run,
    stop: () => clearInterval(timer),
  };
};

const attachSocketHandlers = (io) => {
  const revalidateSocket = createSocketSessionRevalidator();

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

      const user = await User.findById(decoded.userId).select('firstName lastName role isActive sessionVersion').lean();
      if (!user || !user.isActive || (decoded.sessionVersion || 0) !== (user.sessionVersion || 0)) {
        return next(new Error('Authentication error: Invalid token'));
      }
      if (webSession && user.role !== webSession.role) {
        return next(new Error('Authentication error: Invalid session origin'));
      }
      if (user.role === 'counsellor') {
        const professionalAccess = await evaluateCounsellorAccountAccess({
          account: user,
        });
        if (!professionalAccess.allowed) {
          return next(new Error('Authentication error: Counsellor approval unavailable'));
        }
      }

      socket.userId = decoded.userId;
      socket.userRole = user.role || 'user';
      socket.userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      socket.sessionVersion = decoded.sessionVersion || 0;
      socket.authTransport = webSession ? 'cookie' : 'bearer';
      return next();
    } catch {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    socket.use(async (_event, next) => {
      try {
        if (!await revalidateSocket(socket)) {
          socket.disconnect(true);
          return;
        }
        next();
      } catch (error) {
        console.error(
          'Socket event authorization failed closed:',
          error?.code || 'SOCKET_EVENT_AUTHORIZATION_FAILED'
        );
        socket.disconnect(true);
      }
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

  return startSocketSessionRevalidation({
    io,
    revalidateSocket,
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

  const sessionRevalidation = attachSocketHandlers(io);

  return {
    io,
    stopSocketSessionRevalidation: sessionRevalidation.stop,
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
  _private: {
    DEFAULT_SOCKET_SESSION_REVALIDATION_INTERVAL_MS,
    createSocketSessionRevalidator,
    readSocketSessionRevalidationInterval,
    revalidateConnectedSockets,
    startSocketSessionRevalidation,
  },
};
