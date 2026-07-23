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
const { verifyUserToken } = require('../../utils/authTokens');
const { isCurrentSessionToken } = require('../../utils/sessionTokenBinding');
const { recordSecurityEvent } = require('../../utils/securityAudit');
const {
  loadChatRoomAuthorization,
} = require('../../services/chatRoomAuthorization');
const {
  getCookieToken,
  getWebSessionForRequest,
} = require('../../config/webSessions');

const SOCKET_ENABLED_SERVICES = new Set(['api-ios', 'api-android', 'api-web']);
const DEFAULT_SOCKET_SESSION_REVALIDATION_INTERVAL_MS = 30 * 1000;
const SOCKET_REVALIDATION_CONCURRENCY = 10;
const MAX_JOINED_CHAT_ROOMS = 100;
const SOCKET_CHAT_DENIAL_AUDIT_INTERVAL_MS = 30 * 1000;

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

const loadAuthorizedRoom = async (
  roomId,
  userId,
  { ChatRoomModel = ChatRoom, now = new Date() } = {}
) => loadChatRoomAuthorization({
  roomId,
  requesterUserId: userId,
  now,
  lean: true,
  ChatRoomModel,
});

const getJoinedChatRoomNames = (socket) => [...socket.rooms]
  .filter((roomName) =>
    typeof roomName === 'string' && roomName.startsWith('chat_')
  )
  .slice(0, MAX_JOINED_CHAT_ROOMS);

const shouldRecordSocketChatDenial = (socket, key, now = Date.now()) => {
  socket.chatDenialAudit = socket.chatDenialAudit || new Map();
  const previous = socket.chatDenialAudit.get(key);
  if (
    previous !== undefined
    && now - previous < SOCKET_CHAT_DENIAL_AUDIT_INTERVAL_MS
  ) return false;

  if (socket.chatDenialAudit.size >= MAX_JOINED_CHAT_ROOMS) {
    const oldest = socket.chatDenialAudit.keys().next().value;
    socket.chatDenialAudit.delete(oldest);
  }
  socket.chatDenialAudit.set(key, now);
  return true;
};

const recordSocketChatAuthorizationDenial = (socket, reason, roomId) => {
  const key = `${reason}:${roomId || 'unknown'}`;
  if (!shouldRecordSocketChatDenial(socket, key)) return;

  try {
    recordSecurityEvent('socket_chat_authorization_denied', {
      req: {
        method: 'SOCKET',
        originalUrl: '/socket.io/chat',
        ip: socket.handshake.address || socket.conn?.remoteAddress,
      },
      user: {
        _id: socket.userId,
        role: socket.userRole,
      },
      outcome: 'failure',
      statusCode: 403,
      details: {
        reason,
        resource: 'chat_room',
        targetId: roomId,
        transport: socket.authTransport,
      },
    });
  } catch {
    // The socket action still fails closed if audit output is unavailable.
  }
};

const authorizeSocketRoom = async (socket, roomId) => {
  if (!/^[a-f0-9]{24}$/i.test(String(roomId || ''))) {
    recordSocketChatAuthorizationDenial(socket, 'CHAT_ROOM_ID_INVALID', roomId);
    return null;
  }

  const authorization = await loadAuthorizedRoom(roomId, socket.userId);
  if (!authorization.access.allowed) {
    recordSocketChatAuthorizationDenial(
      socket,
      authorization.access.reason,
      roomId
    );
    socket.leave(`chat_${roomId}`);
    return null;
  }
  return authorization;
};

const emitPresenceToAuthorizedChatRooms = async (
  socket,
  event,
  roomNames = getJoinedChatRoomNames(socket)
) => {
  await Promise.all(roomNames.map(async (roomName) => {
    const roomId = roomName.slice('chat_'.length);
    if (!await authorizeSocketRoom(socket, roomId)) return;
    socket.to(roomName).emit('user_status_changed', event);
  }));
};

const getSocketWebSession = (socket) => getWebSessionForRequest({
  headers: socket.handshake.headers || {},
  get(name) {
    return this.headers[String(name || '').toLowerCase()];
  },
});

const authenticateSocketHandshake = async (socket, {
  UserModel = User,
  checkTokenBlocked,
  evaluateCounsellorAccess = evaluateCounsellorAccountAccess,
} = {}) => {
  const webSession = getSocketWebSession(socket);
  const transport = webSession ? 'cookie' : 'bearer';
  if (webSession && !['user', 'counsellor'].includes(webSession.role)) {
    return { ok: false, reason: 'unsupported_socket_role', transport };
  }

  const token = webSession
    ? getCookieToken({ headers: socket.handshake.headers || {} }, webSession.cookieName)
    : socket.handshake.auth?.token;

  if (!token) return { ok: false, reason: 'missing_token', transport };

  let decoded;
  try {
    decoded = verifyUserToken(token);
  } catch {
    return { ok: false, reason: 'invalid_or_expired_token', transport };
  }

  try {
    const isBlocked = checkTokenBlocked
      || require('../../middleware/auth').isTokenBlocked;
    if (await isBlocked(token)) {
      return { ok: false, reason: 'revoked_token', transport };
    }

    const user = await UserModel.findById(decoded.userId)
      .select('firstName lastName role isActive sessionVersion')
      .lean();
    if (!user || !user.isActive || !isCurrentSessionToken(decoded, user)) {
      return { ok: false, reason: 'account_binding_invalid', transport };
    }
    if (webSession && user.role !== webSession.role) {
      return { ok: false, reason: 'session_origin_role_mismatch', transport };
    }
    if (user.role === 'counsellor') {
      const professionalAccess = await evaluateCounsellorAccess({
        account: user,
      });
      if (!professionalAccess.allowed) {
        return { ok: false, reason: 'counsellor_access_denied', transport };
      }
    }

    return {
      ok: true,
      decoded,
      transport,
      user,
    };
  } catch {
    return { ok: false, reason: 'authentication_unavailable', transport };
  }
};

const recordSocketAuthenticationDenial = (socket, result) => {
  try {
    recordSecurityEvent('socket_authentication_denied', {
      req: {
        method: 'SOCKET',
        originalUrl: '/socket.io/auth',
        ip: socket.handshake.address || socket.conn?.remoteAddress,
      },
      outcome: 'failure',
      statusCode: 401,
      details: {
        reason: result.reason,
        transport: result.transport,
      },
    });
  } catch {
    console.error('Socket authentication audit failed: SECURITY_AUDIT_UNAVAILABLE');
  }
};

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
    || !isCurrentSessionToken({
      userId: socket.userId,
      role: socket.userRole,
      sessionVersion: socket.sessionVersion,
    }, user)
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
    const authentication = await authenticateSocketHandshake(socket);
    if (!authentication.ok) {
      recordSocketAuthenticationDenial(socket, authentication);
      return next(new Error('Authentication error: Invalid token'));
    }

    const { decoded, transport, user } = authentication;
    socket.userId = decoded.userId;
    socket.userRole = user.role;
    socket.userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    socket.sessionVersion = decoded.sessionVersion;
    socket.authTransport = transport;
    return next();
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
        .catch((error) => console.error(
          'Counsellor socket room lookup failed:',
          error?.code || 'COUNSELLOR_SOCKET_ROOM_LOOKUP_FAILED'
        ));
    }

    if (socket.userRole === 'admin') {
      socket.join('admin');
    }

    socket.on('join_room', async (roomId) => {
      try {
        if (!roomId) return;
        if (getJoinedChatRoomNames(socket).length >= MAX_JOINED_CHAT_ROOMS) {
          recordSocketChatAuthorizationDenial(
            socket,
            'CHAT_ROOM_LIMIT_REACHED',
            roomId
          );
          return;
        }
        if (!await authorizeSocketRoom(socket, roomId)) return;

        const userId = socket.userId.toString();

        socket.join(`chat_${roomId}`);
        socket.to(`chat_${roomId}`).emit('user_joined', {
          userId,
          roomId,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error(
          'Socket chat join failed closed:',
          err?.code || 'SOCKET_CHAT_JOIN_FAILED'
        );
      }
    });

    socket.on('leave_room', async (roomId) => {
      try {
        if (!roomId) return;
        if (!socket.rooms.has(`chat_${roomId}`)) return;
        if (!await authorizeSocketRoom(socket, roomId)) return;
        socket.leave(`chat_${roomId}`);
        socket.to(`chat_${roomId}`).emit('user_left', {
          userId: socket.userId,
          roomId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(
          'Socket chat leave failed closed:',
          error?.code || 'SOCKET_CHAT_LEAVE_FAILED'
        );
      }
    });

    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, type = 'text' } = data;
        if (!roomId || !content) return;
        if (!socket.rooms.has(`chat_${roomId}`)) return;
        if (!await authorizeSocketRoom(socket, roomId)) return;

        const safeContent = String(content)
          .slice(0, 5000)
          .replace(/<[^>]*>/g, '')
          .trim();
        if (!safeContent) return;
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
        console.error(
          'Socket chat send failed closed:',
          err?.code || 'SOCKET_CHAT_SEND_FAILED'
        );
      }
    });

    socket.on('typing_start', async (roomId) => {
      try {
        if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
        if (!await authorizeSocketRoom(socket, roomId)) return;
        socket.to(`chat_${roomId}`).emit('user_typing', { userId: socket.userId, isTyping: true });
      } catch (error) {
        console.error(
          'Socket typing authorization failed closed:',
          error?.code || 'SOCKET_TYPING_AUTHORIZATION_FAILED'
        );
      }
    });

    socket.on('typing_stop', async (roomId) => {
      try {
        if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
        if (!await authorizeSocketRoom(socket, roomId)) return;
        socket.to(`chat_${roomId}`).emit('user_typing', { userId: socket.userId, isTyping: false });
      } catch (error) {
        console.error(
          'Socket typing authorization failed closed:',
          error?.code || 'SOCKET_TYPING_AUTHORIZATION_FAILED'
        );
      }
    });

    socket.on('mark_read', async (data = {}) => {
      try {
        const { roomId, messageId } = data || {};
        if (!roomId || !socket.rooms.has(`chat_${roomId}`)) return;
        if (!await authorizeSocketRoom(socket, roomId)) return;
        if (!/^[a-f0-9]{24}$/i.test(String(messageId || ''))) return;
        const message = await Message.findOne({ _id: messageId, room: roomId });
        if (!message) return;
        await message.markAsRead(socket.userId);
        socket.to(`chat_${roomId}`).emit('message_read', {
          messageId,
          readBy: socket.userId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(
          'Socket read authorization failed closed:',
          error?.code || 'SOCKET_READ_AUTHORIZATION_FAILED'
        );
      }
    });

    socket.on('set_online_status', async (isOnline) =>
      emitPresenceToAuthorizedChatRooms(socket, {
        userId: socket.userId,
        isOnline: isOnline === true,
        timestamp: new Date().toISOString()
      }).catch((error) => {
        console.error(
          'Socket presence authorization failed closed:',
          error?.code || 'SOCKET_PRESENCE_AUTHORIZATION_FAILED'
        );
      })
    );

    socket.on('disconnecting', () => {
      const roomNames = getJoinedChatRoomNames(socket);
      chatRoutes.setUserOffline(socket.userId);
      emitPresenceToAuthorizedChatRooms(socket, {
        userId: socket.userId,
        isOnline: false,
        timestamp: new Date().toISOString()
      }, roomNames).catch((error) => {
        console.error(
          'Socket disconnect presence authorization failed closed:',
          error?.code || 'SOCKET_DISCONNECT_AUTHORIZATION_FAILED'
        );
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
    MAX_JOINED_CHAT_ROOMS,
    authenticateSocketHandshake,
    loadAuthorizedRoom,
    createSocketSessionRevalidator,
    readSocketSessionRevalidationInterval,
    revalidateConnectedSockets,
    shouldRecordSocketChatDenial,
    startSocketSessionRevalidation,
  },
};
