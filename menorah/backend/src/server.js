const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { createServer } = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// ─── Startup validation ────────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  console.error("FATAL: JWT_SECRET is not set or is too short (minimum 64 chars). Aborting.");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("FATAL: MONGODB_URI is not set. Aborting.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  const required = [
    "ALLOWED_ORIGINS",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "MSG91_AUTH_KEY",
  ];
  required.forEach((key) => {
    if (!process.env[key]) {
      console.error(`FATAL: Required env var ${key} is missing in production. Aborting.`);
      process.exit(1);
    }
  });
}
// ──────────────────────────────────────────────────────────────────────────

const connectDB = require("./config/database");
const errorHandler = require("./middleware/errorHandler");
const notFound = require("./middleware/notFound");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const counsellorRoutes = require("./routes/counsellors");
const counsellorBookingsRoutes = require("./routes/counsellor-bookings");
const bookingRoutes = require("./routes/bookings");
const paymentRoutes = require("./routes/payments");
const chatRoutes = require("./routes/chat");
const videoRoutes = require("./routes/video");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS configuration ────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOrigin = (origin, callback) => {
  // Allow requests with no origin (mobile apps, curl, server-to-server)
  if (!origin) return callback(null, true);
  if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  callback(new Error(`CORS: origin ${origin} not allowed`));
};

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400,
};
// ──────────────────────────────────────────────────────────────────────────

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  path: "/socket.io/",
  transports: ["polling", "websocket"],
});

// Connect to database
connectDB();

// CORS + preflight
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

// ─── Rate limiting ─────────────────────────────────────────────────────────
const isLocalhost = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return process.env.NODE_ENV !== 'production' &&
    (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');
};

// Strict limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/", apiLimiter);
// ──────────────────────────────────────────────────────────────────────────

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Health check endpoints
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    message: "Menorah Health API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    message: "Menorah Health API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Welcome endpoint
app.get("/api/welcome", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Menorah Health API",
    description: "Your trusted platform for mental health and counseling services",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      counsellors: "/api/counsellors",
      bookings: "/api/bookings",
      chat: "/api/chat",
      video: "/api/video",
    },
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/counsellors", counsellorRoutes);
app.use("/api/counsellors", counsellorBookingsRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/video", videoRoutes);

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error: Token required"));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userName = decoded.fullName || "";
    socket.userRole = decoded.role || "user";
    next();
  } catch (error) {
    return next(new Error("Authentication error: Invalid token"));
  }
});

// Set Socket.IO instance for chat routes
chatRoutes.setSocketIO(io);
app.set("io", io);

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.userId} (${socket.userName})`);

  socket.join(`user_${socket.userId}`);

  if (socket.userRole === "counsellor" || socket.userRole === "admin") {
    const Counsellor = require("./models/Counsellor");
    Counsellor.findOne({ user: socket.userId })
      .then((counsellor) => {
        if (counsellor) {
          socket.join(`counsellor_${counsellor._id}`);
        }
      })
      .catch((err) => console.error("Error finding counsellor:", err));
  }

  socket.on("join_room", (roomId) => {
    socket.join(`chat_${roomId}`);
    socket.to(`chat_${roomId}`).emit("user_joined", {
      userId: socket.userId,
      userName: socket.userName,
      roomId,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("leave_room", (roomId) => {
    socket.leave(`chat_${roomId}`);
    socket.to(`chat_${roomId}`).emit("user_left", {
      userId: socket.userId,
      userName: socket.userName,
      roomId,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("send_message", (data) => {
    const { roomId, content, type = "text" } = data;
    const message = {
      id: Date.now().toString(),
      senderId: socket.userId,
      senderName: socket.userName,
      content,
      type,
      roomId,
      timestamp: new Date().toISOString(),
      status: "sent",
    };
    io.to(`chat_${roomId}`).emit("new_message", message);
    socket.emit("message_delivered", { messageId: message.id, timestamp: new Date().toISOString() });
  });

  socket.on("typing_start", (roomId) => {
    socket.to(`chat_${roomId}`).emit("user_typing", { userId: socket.userId, userName: socket.userName, isTyping: true });
  });

  socket.on("typing_stop", (roomId) => {
    socket.to(`chat_${roomId}`).emit("user_typing", { userId: socket.userId, userName: socket.userName, isTyping: false });
  });

  socket.on("mark_read", ({ roomId, messageId }) => {
    socket.to(`chat_${roomId}`).emit("message_read", {
      messageId,
      readBy: socket.userId,
      readByUserName: socket.userName,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("set_online_status", (isOnline) => {
    socket.broadcast.emit("user_status_changed", {
      userId: socket.userId,
      userName: socket.userName,
      isOnline,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.userId} (${socket.userName})`);
    socket.broadcast.emit("user_status_changed", {
      userId: socket.userId,
      userName: socket.userName,
      isOnline: false,
      timestamp: new Date().toISOString(),
    });
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Menorah Health API server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API Base URL: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}`);
  console.log(`🔌 Socket.IO server is ready for real-time connections`);

  console.log("\n📧 Email (MSG91):", process.env.MSG91_AUTH_KEY ? "✅ Auth key set" : "⚠️  MSG91_AUTH_KEY missing — email sending will fail");
  console.log("📱 SMS (MSG91):", process.env.MSG91_AUTH_KEY ? "✅ Auth key set" : "❌ MSG91_AUTH_KEY missing — OTP sending will fail");

  console.log("\n🌐 CORS Configuration:");
  if (ALLOWED_ORIGINS.length > 0) {
    console.log(`   Allowed Origins: ${ALLOWED_ORIGINS.join(", ")}`);
  } else {
    console.warn("   ⚠️  ALLOWED_ORIGINS not set — all browser origins blocked (mobile apps still work)");
  }
  console.log(`   Credentials: Enabled`);
  console.log("");
});

// Handle port-already-in-use clearly instead of crashing
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nFATAL: Port ${PORT} is already in use.`);
    console.error(`Run this to free it:  npx kill-port ${PORT}`);
    console.error(`Or on Windows:        netstat -ano | findstr :${PORT}  then  taskkill /PID <pid> /F\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => console.log("Process terminated"));
});

module.exports = { app, io };
