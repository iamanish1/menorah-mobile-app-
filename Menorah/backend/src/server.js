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
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Allow any origin (true allows all origins with credentials)
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  path: '/socket.io/', // Explicitly set the path
  transports: ['polling', 'websocket'], // Allow both transports
});

const PORT = process.env.PORT || 3000;

// Connect to database
connectDB();

// CORS middleware - must be before other middleware
// Allow any origin - configured to accept requests from anywhere
const corsOptions = {
  origin: true, // Allow any origin (true allows all origins with credentials support)
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS requests explicitly
app.options("*", cors(corsOptions));

// Security middleware - configure helmet to work with CORS
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // Disable CSP for API endpoints
  })
);

// Rate limiting - more lenient for development and authenticated users
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'development' ? 1000 : 100), // Higher limit for development
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for authenticated requests in development
  skip: (req) => {
    // In development, skip rate limiting if Authorization header is present (authenticated request)
    if (process.env.NODE_ENV === 'development' && req.header('Authorization')) {
      return true;
    }
    return false;
  },
  // Use a key generator that includes user info if available
  keyGenerator: (req) => {
    // In development, if authenticated, use user-specific key to avoid IP-based limiting
    if (process.env.NODE_ENV === 'development' && req.header('Authorization')) {
      return req.header('Authorization') || req.ip;
    }
    return req.ip;
  },
});
app.use("/api/", limiter);

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

// Welcome endpoint - Public API (no authentication required)
app.get("/api/welcome", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Menorah Health API",
    description:
      "Your trusted platform for mental health and counseling services",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/health",
      welcome: "/api/welcome",
      auth: "/api/auth",
      counsellors: "/api/counsellors",
      bookings: "/api/bookings",
      chat: "/api/chat",
      video: "/api/video",
    },
    documentation:
      "Visit our documentation for more information about available endpoints",
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
    socket.userName = decoded.fullName || '';
    socket.userRole = decoded.role || 'user';
    next();
  } catch (error) {
    return next(new Error("Authentication error: Invalid token"));
  }
});

// Set Socket.IO instance for chat routes (must be after io is created)
chatRoutes.setSocketIO(io);

// Make io accessible to routes
app.set('io', io);

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.userId} (${socket.userName})`);

  // Join user to their personal room
  socket.join(`user_${socket.userId}`);

  // If user is a counsellor, join counsellor room
  if (socket.userRole === 'counsellor' || socket.userRole === 'admin') {
    // Get counsellor ID from user
    const Counsellor = require('./models/Counsellor');
    Counsellor.findOne({ user: socket.userId })
      .then(counsellor => {
        if (counsellor) {
          socket.join(`counsellor_${counsellor._id}`);
          console.log(`Counsellor ${socket.userId} joined room: counsellor_${counsellor._id}`);
        }
      })
      .catch(err => {
        console.error('Error finding counsellor:', err);
      });
  }

  // Handle joining chat rooms
  socket.on("join_room", (roomId) => {
    socket.join(`chat_${roomId}`);
    console.log(`User ${socket.userId} joined chat room: ${roomId}`);

    // Notify others in the room
    socket.to(`chat_${roomId}`).emit("user_joined", {
      userId: socket.userId,
      userName: socket.userName,
      roomId: roomId,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle leaving chat rooms
  socket.on("leave_room", (roomId) => {
    socket.leave(`chat_${roomId}`);
    console.log(`User ${socket.userId} left chat room: ${roomId}`);

    // Notify others in the room
    socket.to(`chat_${roomId}`).emit("user_left", {
      userId: socket.userId,
      userName: socket.userName,
      roomId: roomId,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle sending messages
  socket.on("send_message", (data) => {
    const { roomId, content, type = "text" } = data;

    const message = {
      id: Date.now().toString(),
      senderId: socket.userId,
      senderName: socket.userName,
      content,
      type,
      timestamp: new Date().toISOString(),
      status: "sent",
    };

    // Broadcast message to all users in the room
    io.to(`chat_${roomId}`).emit("new_message", message);

    // Send delivery confirmation to sender
    socket.emit("message_delivered", {
      messageId: message.id,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `Message sent in room ${roomId} by ${socket.userName}: ${content}`
    );
  });

  // Handle typing indicators
  socket.on("typing_start", (roomId) => {
    socket.to(`chat_${roomId}`).emit("user_typing", {
      userId: socket.userId,
      userName: socket.userName,
      isTyping: true,
    });
  });

  socket.on("typing_stop", (roomId) => {
    socket.to(`chat_${roomId}`).emit("user_typing", {
      userId: socket.userId,
      userName: socket.userName,
      isTyping: false,
    });
  });

  // Handle message read receipts
  socket.on("mark_read", (data) => {
    const { roomId, messageId } = data;

    socket.to(`chat_${roomId}`).emit("message_read", {
      messageId,
      readBy: socket.userId,
      readByUserName: socket.userName,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle online status
  socket.on("set_online_status", (isOnline) => {
    // Broadcast online status to relevant users
    socket.broadcast.emit("user_status_changed", {
      userId: socket.userId,
      userName: socket.userName,
      isOnline,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.userId} (${socket.userName})`);

    // Broadcast offline status
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
  console.log(
    `🔗 API Base URL: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}`
  );
  console.log(`🔌 Socket.IO server is ready for real-time connections`);

  // Verify SMTP configuration on startup
  console.log("\n📧 Email Configuration Check:");
  console.log(`   SMTP_HOST: ${process.env.SMTP_HOST || "❌ MISSING"}`);
  console.log(`   SMTP_PORT: ${process.env.SMTP_PORT || "❌ MISSING"}`);
  console.log(`   SMTP_USER: ${process.env.SMTP_USER || "❌ MISSING"}`);
  console.log(
    `   SMTP_PASS: ${
      process.env.SMTP_PASS
        ? "✅ SET (" + process.env.SMTP_PASS.length + " chars)"
        : "❌ MISSING"
    }`
  );
  console.log(`   EMAIL_FROM: ${process.env.EMAIL_FROM || "❌ MISSING"}`);

  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_PORT ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    console.log(
      "\n⚠️  WARNING: SMTP configuration is incomplete! Email sending will fail."
    );
  } else {
    console.log("\n✅ SMTP configuration looks good!");
  }

  // Show CORS configuration
  console.log("\n🌐 CORS Configuration:");
  console.log(`   Allowed Origins: * (Any origin allowed)`);
  console.log(`   Credentials: Enabled`);
  console.log(`   Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`);
  console.log("");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

module.exports = { app, io };
