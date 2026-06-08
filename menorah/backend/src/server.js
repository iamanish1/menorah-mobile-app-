const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ─── Startup validation ────────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  console.error('FATAL: JWT_SECRET is not set or is too short (minimum 64 chars). Aborting.');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('FATAL: MONGODB_URI is not set. Aborting.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  const required = [
    'ALLOWED_ORIGINS',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'MSG91_AUTH_KEY',
    'REDIS_URL',
  ];
  required.forEach((key) => {
    if (!process.env[key]) {
      console.error(`FATAL: Required env var ${key} is missing in production. Aborting.`);
      process.exit(1);
    }
  });
}
// ──────────────────────────────────────────────────────────────────────────

const connectDB = require('./config/database');
const { connectRedis, getRedisClient, getPubClient, getSubClient } = require('./config/redis');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const Counsellor = require('./models/Counsellor');
const Message    = require('./models/Message');
const ChatRoom   = require('./models/ChatRoom');

const authRoutes               = require('./routes/auth');
const userRoutes               = require('./routes/users');
const counsellorRoutes         = require('./routes/counsellors');
const counsellorBookingsRoutes = require('./routes/counsellor-bookings');
const bookingRoutes            = require('./routes/bookings');
const paymentRoutes            = require('./routes/payments');
const chatRoutes               = require('./routes/chat');
const videoRoutes            = require('./routes/video');
const adminRoutes            = require('./routes/admin');
const articleRoutes          = require('./routes/articles');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust nginx proxy — required for correct IP detection behind a reverse proxy.
// Without this, express-rate-limit sees all requests as coming from 127.0.0.1.
app.set('trust proxy', 1);

// ─── CORS ──────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  callback(new Error(`CORS: origin ${origin} not allowed`));
};

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
};
// ──────────────────────────────────────────────────────────────────────────

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  path: '/socket.io/',
  // WebSocket first — polling is fallback only
  transports: ['websocket', 'polling'],
});

// ─── Static middleware (no Redis dependency) ───────────────────────────────
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);
// Raw body middleware — MUST be registered before express.json() so HMAC
// signature verifiers receive the original bytes, not a re-serialised object.
app.use('/api/video/livekit-webhook',     express.raw({ type: '*/*',              limit: '1mb' }));
app.use('/api/payments/razorpay-webhook', express.raw({ type: 'application/json', limit: '1mb' }));

// Reduce global JSON body limit — 1 MB is sufficient for all API routes.
// Upload routes use multipart/form-data (multer) and are not affected.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression());
app.use(process.env.NODE_ENV === 'development' ? morgan('dev') : morgan('combined'));

// Health checks (no rate-limiting — load balancers need these)
// NODE_ENV removed — avoids revealing whether this is a production instance
app.get('/health',     (_req, res) => res.json({ success: true, status: 'OK', timestamp: new Date().toISOString() }));
app.get('/api/health', (_req, res) => res.json({ success: true, status: 'OK', timestamp: new Date().toISOString() }));
app.get('/api/welcome', (_req, res) =>
  res.json({ success: true, message: 'Welcome to Menorah Health API', version: '1.0.0' })
);

// ─── Socket.IO auth middleware ─────────────────────────────────────────────
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error: Token required'));
  try {
    // Algorithm pinned — prevents alg:none and algorithm-confusion attacks
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Check logout blocklist — prevents logged-out users from holding open sockets
    const { isTokenBlocked } = require('./middleware/auth');
    if (await isTokenBlocked(token)) {
      return next(new Error('Authentication error: Token revoked'));
    }

    socket.userId   = decoded.userId;
    socket.userRole = decoded.role || 'user';
    // Do not store userName from token — fetch from DB or derive from userId for display
    socket.userName = '';
    next();
  } catch {
    next(new Error('Authentication error: Invalid token'));
  }
});

// ─── Socket.IO connection handler ─────────────────────────────────────────
io.on('connection', async (socket) => {
  // Resolve display name from DB to avoid trusting JWT payload
  try {
    const { default: mongoose } = await import('mongoose');
    const User = mongoose.model('User');
    const user = await User.findById(socket.userId).select('firstName lastName').lean();
    if (user) socket.userName = `${user.firstName} ${user.lastName}`;
  } catch { /* non-critical */ }

  socket.join(`user_${socket.userId}`);
  chatRoutes.setUserOnline(socket.userId, socket.userName);

  socket.broadcast.emit('user_status_changed', {
    userId: socket.userId, isOnline: true, timestamp: new Date().toISOString(),
  });

  // Counsellor room join — verify against DB, not just JWT role claim
  if (socket.userRole === 'counsellor' || socket.userRole === 'admin') {
    Counsellor.findOne({ user: socket.userId, isActive: true })
      .then((c) => { if (c) socket.join(`counsellor_${c._id}`); })
      .catch((err) => console.error('Error joining counsellor room:', err));
  }

  // ── join_room — verify membership before joining ──────────────────────
  socket.on('join_room', async (roomId) => {
    try {
      if (!roomId) return;
      const room = await ChatRoom.findById(roomId).populate('counsellor', 'user').lean();
      if (!room) return;

      const userId  = socket.userId.toString();
      const isUser       = room.user?.toString() === userId;
      const isCounsellor = room.counsellor?.user?.toString() === userId;
      if (!isUser && !isCounsellor) return; // silently ignore unauthorised join

      socket.join(`chat_${roomId}`);
      socket.to(`chat_${roomId}`).emit('user_joined', {
        userId, roomId, timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('join_room error:', err.message);
    }
  });

  socket.on('leave_room', (roomId) => {
    if (!roomId) return;
    socket.leave(`chat_${roomId}`);
    socket.to(`chat_${roomId}`).emit('user_left', {
      userId: socket.userId, roomId, timestamp: new Date().toISOString(),
    });
  });

  // ── send_message — persist to DB, verify room membership ────────────
  socket.on('send_message', async (data) => {
    try {
      const { roomId, content, type = 'text' } = data;
      if (!roomId || !content) return;

      // Verify sender belongs to this room
      if (!socket.rooms.has(`chat_${roomId}`)) return;

      // Persist to MongoDB so message survives server restart
      const safeContent = String(content).slice(0, 5000).replace(/<[^>]*>/g, '');
      const msg = await Message.create({
        room:    roomId,
        sender:  socket.userId,
        content: safeContent,
        type:    ['text', 'image', 'file'].includes(type) ? type : 'text',
        status:  'sent',
      });

      await ChatRoom.findByIdAndUpdate(roomId, {
        $set: {
          'lastMessage.content':   msg.content,
          'lastMessage.senderId':  socket.userId,
          'lastMessage.timestamp': msg.createdAt,
          updatedAt:               msg.createdAt,
        },
      });

      const payload = {
        id:         msg._id.toString(),
        senderId:   socket.userId,
        senderName: socket.userName,
        content:    msg.content,
        type:       msg.type,
        roomId,
        timestamp:  msg.createdAt.toISOString(),
        status:     'sent',
      };
      io.to(`chat_${roomId}`).emit('new_message', payload);
      socket.emit('message_delivered', { messageId: msg._id.toString(), timestamp: payload.timestamp });
    } catch (err) {
      console.error('send_message error:', err.message);
    }
  });

  // ── typing / mark_read — validate room membership ─────────────────────
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
      messageId, readBy: socket.userId, timestamp: new Date().toISOString(),
    });
  });

  socket.on('set_online_status', (isOnline) =>
    socket.broadcast.emit('user_status_changed', {
      userId: socket.userId, isOnline, timestamp: new Date().toISOString(),
    })
  );

  socket.on('disconnect', () => {
    chatRoutes.setUserOffline(socket.userId);
    socket.broadcast.emit('user_status_changed', {
      userId: socket.userId, isOnline: false, timestamp: new Date().toISOString(),
    });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nFATAL: Port ${PORT} is already in use.`);
    process.exit(1);
  } else {
    throw err;
  }
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(async () => {
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch {}
    try {
      const { getRedisClient, getPubClient, getSubClient } = require('./config/redis');
      await Promise.allSettled([
        getRedisClient()?.quit(),
        getPubClient()?.quit(),
        getSubClient()?.quit(),
      ]);
      console.log('Redis connections closed');
    } catch {}
    console.log('Process terminated');
    process.exit(0);
  });
  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => { console.error('Forced exit after timeout'); process.exit(1); }, 10_000);
});

// Add SIGINT to the centralised shutdown logic (alongside SIGTERM above)
process.on('SIGINT', async () => {
  const mongoose = require('mongoose');
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});

// ─── Async startup — DB + Redis must be ready before listening ─────────────
// isLocalhost bypass removed — it depended on NODE_ENV which is not a safe
// indicator of internet-accessibility. Rate limiting is always enforced.
const isLocalhost = () => false;

async function startServer() {
  // 1. Connect database
  await connectDB();

  // 2. Connect Redis — graceful degradation if unavailable in dev
  // ENABLE_SOCKET_ADAPTER=false on Cloud Run: REST-only, no WebSocket traffic,
  // so we skip pub/sub clients to avoid wasting 2 Upstash connections.
  const socketAdapterEnabled = process.env.ENABLE_SOCKET_ADAPTER !== 'false';
  let redisReady = false;
  try {
    await connectRedis({ withPubSub: socketAdapterEnabled });
    redisReady = true;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: Redis connection failed in production:', err.message);
      process.exit(1);
    }
    console.warn('⚠️  Redis unavailable — running without Redis (rate limiting in-memory, no Socket.IO clustering):', err.message);
  }

  // 3. Wire Socket.IO Redis adapter (required for multi-process clustering)
  // Skipped on Cloud Run — Cloudflare Worker routes all /socket.io/ to VPS only.
  if (redisReady && socketAdapterEnabled) {
    io.adapter(createAdapter(getPubClient(), getSubClient()));
    console.log('✅ Socket.IO Redis adapter enabled — multi-process chat ready');
  } else if (redisReady) {
    console.log('ℹ️  Socket.IO adapter disabled (ENABLE_SOCKET_ADAPTER=false) — REST-only mode');
  }

  // 4. Rate limiters — Redis store when available, memory fallback for local dev
  const makeRateLimitStore = () =>
    redisReady
      ? { store: new RedisStore({ sendCommand: (...args) => getRedisClient().sendCommand(args) }) }
      : {};

  const authLimiter = rateLimit({
    ...makeRateLimitStore(),
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost,
  });

  const apiLimiter = rateLimit({
    ...makeRateLimitStore(),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalhost,
  });

  // Auth-critical endpoints — tight limit (10 req / 15 min per IP)
  app.use('/api/auth/login',                    authLimiter);
  app.use('/api/auth/register',                 authLimiter);
  app.use('/api/auth/forgot-password',          authLimiter);
  app.use('/api/auth/reset-password',           authLimiter);
  app.use('/api/auth/verify-email-otp',         authLimiter);
  app.use('/api/auth/resend-email-otp',         authLimiter);
  app.use('/api/auth/verify-email',             authLimiter);
  app.use('/api/auth/verify-phone',             authLimiter);
  app.use('/api/auth/resend-email-verification', authLimiter);
  // General API — 300 req / 15 min
  app.use('/api/', apiLimiter);

  // 5. Register API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/counsellors', counsellorRoutes);
  app.use('/api/counsellors', counsellorBookingsRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/video', videoRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/articles', articleRoutes);

  // notFound and errorHandler MUST be registered after all routes
  app.use(notFound);
  app.use(errorHandler);

  chatRoutes.setSocketIO(io);
  app.set('io', io);

  // 6. Start listening
  server.listen(PORT, () => {
    console.log(`\n🚀 Menorah Health API running on port ${PORT}`);
    console.log(`📱 Environment:  ${process.env.NODE_ENV}`);
    console.log(`🔗 API Base URL: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}`);
    console.log(`🔌 Socket.IO:    ready (websocket-first)`);
    console.log(`🗄️  Redis:        ${redisReady ? '✅ connected' : '⚠️  not connected (memory fallback)'}`);
    console.log(`📧 MSG91:        ${process.env.MSG91_AUTH_KEY ? '✅' : '⚠️  MSG91_AUTH_KEY missing'}`);
    console.log(`🌐 CORS origins: ${ALLOWED_ORIGINS.length > 0 ? `${ALLOWED_ORIGINS.length} configured` : '⚠️  none set'}\n`);
  });
}

startServer().catch((err) => {
  console.error('FATAL: Failed to start server:', err);
  process.exit(1);
});

module.exports = { app, io };
