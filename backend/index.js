  require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please check your .env file');
  process.exit(1);
}

// Warn about insecure JWT secret in production
if (process.env.NODE_ENV === 'production' && 
    process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
  console.error('❌ SECURITY WARNING: Default JWT_SECRET detected in production!');
  console.error('Generate a new secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

// Import routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const managerRoutes = require('./src/routes/managers');
const companyRoutes = require('./src/routes/companies');
const itemRoutes = require('./src/routes/items');
const stockRoutes = require('./src/routes/stock');
const reportRoutes = require('./src/routes/reports');
const unitRoutes = require('./src/routes/units');
const logisticsRoutes = require('./src/routes/logistics');
const shipmentRoutes = require('./src/routes/shipments');
const settingsRoutes = require('./src/routes/settings');
const notificationRoutes = require('./src/routes/notifications');
const warrantyRoutes     = require('./src/routes/warranty');
const setupRoutes        = require('./src/routes/setup');
const ownershipRoutes    = require('./src/routes/ownership');
const inviteRoutes       = require('./src/routes/invites');

// Services
const { generateWarrantyNotifications } = require('./src/services/warrantyNotification');
const { verifyEmailConfig } = require('./src/services/email.service');

const app = express();
const PORT = process.env.PORT || 5001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Trust the first proxy (nginx) so req.ip returns the real client IP.
// Without this, express-rate-limit sees 127.0.0.1 for every request
// and all users share one rate-limit bucket.
app.set('trust proxy', 1);

// Create HTTP server for both Express and Socket.IO
const server = http.createServer(app);

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================
app.use(helmet({
  // Explicit CSP for production — prevents Helmet's overly-strict default
  // ('default-src self') from blocking frontend JS, Socket.IO WS, and inline styles.
  // In development CSP is disabled entirely for easier debugging.
  contentSecurityPolicy: IS_PRODUCTION ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],   // dashboards use inline scripts
      styleSrc:       ["'self'", "'unsafe-inline'"],   // inline styles used throughout
      imgSrc:         ["'self'", 'data:', 'blob:'],
      connectSrc:     ["'self'", 'ws:', 'wss:'],       // Socket.IO WebSocket
      fontSrc:        ["'self'", 'data:'],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: []
    }
  } : false,
  crossOriginEmbedderPolicy: false
}));

// ── HTTPS Enforcement (Production Only) ──────────────────────
// In production behind Nginx/reverse proxy:
// 1. Redirects HTTP → HTTPS using X-Forwarded-Proto header
// 2. Sets strict HSTS header (1 year, includeSubDomains)
// In development: skipped entirely — no SSL needed locally
if (IS_PRODUCTION) {
  // Redirect HTTP to HTTPS
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });

  // HSTS — tell browsers to always use HTTPS for 1 year
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });
}

const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : [
      'http://localhost:3000', 
      'http://localhost:8080', 
      'http://127.0.0.1:5500', 
      'http://localhost:5500', 
      'http://localhost:5000',
      'http://127.0.0.1:5002',
      'http://localhost:5002',
      'http://127.0.0.1:5003',
      'http://localhost:5003',
      'http://127.0.0.1:5001',
      'http://localhost:5001'
    ];

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ── Cluster adapter: makes Socket.IO emit work across all PM2 workers ──────
// In fork mode or single-instance, this is a no-op.
// In cluster mode, messages are relayed via Node.js IPC so every worker
// can reach every connected socket regardless of which worker accepted it.
if (process.env.NODE_APP_INSTANCE !== undefined) {
  // Running inside PM2 cluster — enable adapter on every worker
  io.adapter(createAdapter());
}

// Store io instance globally for use in routes
global.io = io;

// Socket.IO connection handling
io.on('connection', (socket) => {
  if (!IS_PRODUCTION) console.log(`🔌 Client connected: ${socket.id}`);

  // Join room based on role (admin, manager, user)
  socket.on('join-role', (role) => {
    socket.join(role.toLowerCase());
    if (!IS_PRODUCTION) console.log(`📢 Socket ${socket.id} joined room: ${role}`);
  });

  // Join room for specific user
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    if (!IS_PRODUCTION) console.log(`👤 Socket ${socket.id} joined user room: user-${userId}`);
  });

  socket.on('disconnect', () => {
    if (!IS_PRODUCTION) console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Helper function to emit real-time events
global.emitRealTimeUpdate = (event, data, target = 'all') => {
  if (!IS_PRODUCTION) console.log(`📡 Emitting ${event} to ${target}:`, JSON.stringify(data).substring(0, 100));
  if (target === 'all') {
    io.emit(event, data);
  } else if (target.startsWith('user-')) {
    io.to(target).emit(event, data);
  } else {
    // Emit to role rooms (admin, manager, user)
    io.to(target).emit(event, data);
  }
};

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Cookie parser - MUST be before routes for HTTP-only cookie auth
app.use(cookieParser());

// ============================================================
// RATE LIMITING
// ============================================================
// General API rate limit - more permissive for dashboard usage
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 300, // 300 requests per minute per IP (5 requests/second average)
  message: { message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting ONLY in explicit development mode
    return process.env.NODE_ENV === 'development';
  }
});

const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 login attempts per minute per IP
  message: { message: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Serve static frontend files from specific paths
app.use('/admin-css', express.static(path.join(__dirname, '../frontend/admin-dashboard/admin-css')));
app.use('/admin-js', express.static(path.join(__dirname, '../frontend/admin-dashboard/admin-js')));
app.use('/admin-html', express.static(path.join(__dirname, '../frontend/admin-dashboard/admin-html')));
app.use('/shared', express.static(path.join(__dirname, '../frontend/shared')));
app.use('/manager-dashboard', express.static(path.join(__dirname, '../frontend/manager-dashboard')));
app.use('/user-dashboard', express.static(path.join(__dirname, '../frontend/user-dashboard')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));

// Also serve from /frontend path for backward compatibility
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

// ============================================================
// LOGGING CONFIGURATION
// ============================================================
// Shared singleton — same instance used by all route files via src/utils/logger.js
const logger = require('./src/utils/logger');

// Use Morgan for HTTP request logging (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', { 
    stream: { write: message => logger.info(message.trim()) }
  }));
}

// Body parsing middleware
// 100kb is ample for any legitimate JSON payload in this API.
// 10mb was dangerously high — a crafted large body would burn CPU parsing
// before any route handler ran, enabling a cheap DoS attack.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ============================================================
// INPUT SANITIZATION
// ============================================================

// #20 — NoSQL injection prevention.
// express-mongo-sanitize's default middleware tries to reassign req.query,
// but Express 4 makes req.query a read-only getter — that throws
// "Cannot set property query of #<IncomingMessage> which has only a getter".
// We use the library's sanitize() function directly, applying it only to
// req.body and req.params (both are plain writable objects).
const { sanitize: _mongoSanitize } = require('express-mongo-sanitize');
app.use((req, _res, next) => {
  if (req.body)   req.body   = _mongoSanitize(req.body);
  if (req.params) req.params = _mongoSanitize(req.params);
  next();
});

// #19 — Trim leading/trailing whitespace from all string fields in req.body.
// Prevents strings like "  admin  " matching where "admin" is expected,
// and stops users from storing purely-whitespace values in required fields.
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    const trimStrings = (obj) => {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'string') {
          obj[key] = val.trim();
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          trimStrings(val);
        }
      }
    };
    trimStrings(req.body);
  }
  next();
});

// ============================================================
// DATABASE CONNECTION
// ============================================================
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

mongoose.connect(process.env.MONGODB_URI, mongoOptions)
  .then(() => {
    logger.info('✅ MongoDB connected');
    logger.info(`📊 Database: ${mongoose.connection.name}`);

    // Warranty notifications: run on startup + every 24 h
    // Wrapped in try/catch so a crash never kills the interval
    // Guard: only PM2 worker 0 (or non-cluster / dev) runs the cron.
    // Without this guard, every PM2 cluster worker would fire the job
    // simultaneously, creating duplicate notifications on each cycle.
    const isLeaderWorker = process.env.NODE_APP_INSTANCE === undefined  // non-PM2 (dev)
                        || process.env.NODE_APP_INSTANCE === '0';        // PM2 worker 0

    if (isLeaderWorker) {
      const safeWarrantyNotify = async () => {
        try {
          await generateWarrantyNotifications();
        } catch (err) {
          logger.error('❌ Warranty notification job crashed:', err.message);
        }
      };
      safeWarrantyNotify();
      setInterval(safeWarrantyNotify, 24 * 60 * 60 * 1000);
      logger.info('⏰ Warranty notification cron started (leader worker)');
    } else {
      logger.info(`⏰ Warranty notification cron skipped (worker ${process.env.NODE_APP_INSTANCE})`);
    }

    // Verify email configuration on startup (non-blocking)
    verifyEmailConfig();
  })
  .catch(err => {
    logger.error('❌ MongoDB connection error:', err.message);
    process.exit(1); // Exit process on database connection failure
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/managers', managerRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/warranty',      warrantyRoutes);
app.use('/api/setup',         setupRoutes);
app.use('/api/ownership',     ownershipRoutes);
app.use('/api/invites',       inviteRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthcheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
  
  // Include memory usage in development
  if (!IS_PRODUCTION) {
    const memUsage = process.memoryUsage();
    healthcheck.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
    };
  }
  
  res.json(healthcheck);
});

// Serve frontend HTML pages (must come after API routes)
// Root redirect to login
app.get('/', (req, res) => {
  res.redirect('/admin-html/login.html');
});

// Serve login page
app.get('/login', (req, res) => {
  res.redirect('/admin-html/login.html');
});

// Serve password reset page (linked from email)
app.get('/reset-password/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-dashboard/admin-html/reset-password.html'));
});

// Serve accept-invite page (linked from invite email)
app.get('/accept-invite', (req, res) => {
  res.redirect(`/admin-html/accept-invite.html${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
});

// 404 handler - for API routes only, serve index.html for other routes
app.use((req, res) => {
  // If it's an API request, return JSON 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API route not found' });
  }
  // For other requests, try to serve the file or redirect to login
  res.redirect('/admin-html/login.html');
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Error:', err);

  let statusCode = err.statusCode || 500;
  let message = 'Internal Server Error';
  let details = undefined;

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = Object.values(err.errors).map(val => val.message);
  } else if (err.name === 'CastError' && err.kind === 'ObjectId') {
    // Handle invalid ObjectId format
    statusCode = 400;
    message = 'Invalid ID format';
    details = `Invalid ID: ${err.value}`;
  } else if (process.env.NODE_ENV === 'development') {
    // In development, provide more details for other errors
    message = err.message;
    details = err.stack;
  }

  res.status(statusCode).json({
    status: 'error',
    message: message,
    details: details
  });
});

// Start server
server.listen(PORT, () => {
  logger.info('============================================');
  logger.info('🚀 AcuStock API Server Started');
  logger.info('============================================');
  logger.info(`📍 Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  logger.info(`🌐 Port: ${PORT}`);
  logger.info(`📊 Health: http://localhost:${PORT}/api/health`);
  logger.info(`🔌 WebSocket: Ready for real-time updates`);
  logger.info('============================================');

  // Setup Socket.IO cluster primary — must be called after listen() on the
  // primary/first worker so IPC channels exist between the Node cluster
  // processes (used by @socket.io/cluster-adapter to relay messages).
  if (process.env.NODE_APP_INSTANCE === '0') {
    setupPrimary();
    logger.info('🔌 Socket.IO cluster primary set up on worker 0');
  }

  // PM2 ready signal
  if (process.send) {
    process.send('ready');
  }
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
const gracefulShutdown = async (signal) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed.');
    
    // Close Socket.IO connections
    io.close(() => {
      logger.info('WebSocket connections closed.');
    });
    
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed.');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing MongoDB connection:', err.message);
      process.exit(1);
    }
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log
});

module.exports = app;
