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
const { authenticateSocketConnection, canJoinRoleRoom, canJoinUserRoom } = require('./src/utils/socketAuth');
const { createCsrfMiddleware } = require('./src/middleware/csrf');
const fs = require('fs');

// Ensure logs directory exists (first-boot and PM2 cluster safety)
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ============================================================
// SENTRY — Initialize before any other code (env-gated)
// ============================================================
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    release:          process.env.npm_package_version
  });
  console.log('🔍 Sentry error tracking enabled');
}

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
const authRoutes           = require('./src/routes/auth');
const userRoutes           = require('./src/routes/users');
const managerRoutes        = require('./src/routes/managers');
const companyRoutes        = require('./src/routes/companies');
const itemRoutes           = require('./src/routes/items');
const stockRoutes          = require('./src/routes/stock');
const reportRoutes         = require('./src/routes/reports');
const reportScheduledRoutes = require('./src/routes/reports-scheduled');
const unitRoutes           = require('./src/routes/units');
const logisticsRoutes      = require('./src/routes/logistics');
const shipmentRoutes       = require('./src/routes/shipments');
const trackingRoutes       = require('./src/routes/tracking');
const settingsRoutes       = require('./src/routes/settings');
const notificationRoutes   = require('./src/routes/notifications');
const warrantyRoutes       = require('./src/routes/warranty');
const setupRoutes          = require('./src/routes/setup');
const ownershipRoutes      = require('./src/routes/ownership');
const inviteRoutes         = require('./src/routes/invites');
const permissionRoutes     = require('./src/routes/permissions');
const gdprRoutes           = require('./src/routes/gdpr');
const onboardingRoutes     = require('./src/routes/onboarding');
const purchaseOrderRoutes  = require('./src/routes/purchase-orders');
const salesOrderRoutes     = require('./src/routes/sales-orders');
const csvExportRoutes      = require('./src/routes/csv-export');
const billingRoutes        = require('./src/routes/billing');
const googleAuthRoutes     = require('./src/routes/google-auth');
const superadminRoutes     = require('./src/routes/superadmin');
const registerTenantRoutes = require('./src/routes/register-tenant');
const twoFactorRoutes      = require('./src/routes/two-factor');
const warehouseRoutes      = require('./src/routes/warehouses');
const stockTransferRoutes  = require('./src/routes/stock-transfers');
const forecastRoutes       = require('./src/routes/forecasts');
const tenantRoutes         = require('./src/routes/tenants');
const activityRoutes       = require('./src/routes/activity');
const dashboardRoutes     = require('./src/routes/dashboard');
const searchRoutes         = require('./src/routes/search');
const transporterRoutes    = require('./src/routes/transporters');
const lotRoutes            = require('./src/routes/lots');
const cycleCountRoutes     = require('./src/routes/cycle-counts');
const reorderRoutes        = require('./src/routes/reorder');
const packageRoutes        = require('./src/routes/packages');
const labelRoutes          = require('./src/routes/labels');
const rmaRoutes            = require('./src/routes/rma');
const sessionRoutes        = require('./src/routes/sessions');
const backupRoutes         = require('./src/routes/backups');
const apiKeyRoutes         = require('./src/routes/apiKeys');
const webhookRoutes        = require('./src/routes/webhooks');
const reservationRoutes     = require('./src/routes/reservations');
const docsRoutes            = require('./src/routes/docs');
const { aiRouter }         = require('./src/ai');
const { resolveTenant }    = require('./src/middleware/tenancy');
const { requireAuth, requireTenantId } = require('./src/middleware/auth');
const { retryFailedBillingEvents } = require('./src/routes/billing');

// Services
const { generateWarrantyNotifications } = require('./src/services/warrantyNotification');
const { startReportScheduler }          = require('./src/services/reportScheduler');
const { verifyEmailConfig }             = require('./src/services/email.service');

const app = express();
const PORT = process.env.PORT || 5001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// In production, invite emails must contain a public URL (not localhost / internal hostnames).
// FRONTEND_BASE_URL is the canonical base used to generate email links.
if (IS_PRODUCTION && !process.env.FRONTEND_BASE_URL) {
  console.error('❌ Missing required environment variable in production: FRONTEND_BASE_URL');
  console.error('Set it to your public site URL, e.g. https://acustock.example.com');
  process.exit(1);
}

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
      scriptSrc:      ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      imgSrc:         ["'self'", 'data:', 'blob:'],
      connectSrc:     ["'self'", 'ws:', 'wss:'],       // Socket.IO WebSocket
      fontSrc:        ["'self'", 'data:'],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: []
    }
  } : false,
  crossOriginEmbedderPolicy: false
}));

// Permissions-Policy: restrict browser features not used by the app
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

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

  let authenticatedUser = null;

  socket.on('authenticate', async () => {
    authenticatedUser = await authenticateSocketConnection(socket);

    if (!authenticatedUser) {
      socket.emit('auth-error', { message: 'Authentication required' });
      socket.disconnect(true);
      return;
    }

    socket.emit('authenticated', {
      ok: true,
      role: authenticatedUser.role,
      tenantId: authenticatedUser.tenantId
    });
  });

  // Join room based on role (admin, manager, user)
  socket.on('join-role', (role) => {
    if (!authenticatedUser) {
      socket.emit('auth-error', { message: 'Authentication required' });
      return;
    }

    const normalizedRole = String(role || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'MANAGER', 'USER'];

    if (!allowedRoles.includes(normalizedRole)) {
      socket.emit('auth-error', { message: 'Invalid role room' });
      return;
    }

    if (!canJoinRoleRoom(authenticatedUser, normalizedRole)) {
      socket.emit('auth-error', { message: 'Insufficient permissions' });
      return;
    }

    const tenantPrefix = authenticatedUser.tenantId ? `tenant-${authenticatedUser.tenantId}:` : '';
    socket.join(`${tenantPrefix}${normalizedRole.toLowerCase()}`);
    if (!IS_PRODUCTION) console.log(`📢 Socket ${socket.id} joined room: ${normalizedRole}`);
  });

  // Join room for specific user
  socket.on('join-user', (userId) => {
    if (!authenticatedUser) {
      socket.emit('auth-error', { message: 'Authentication required' });
      return;
    }

    if (!userId || String(userId).trim() === '') {
      socket.emit('auth-error', { message: 'Invalid user room' });
      return;
    }

    if (!canJoinUserRoom(authenticatedUser, userId)) {
      socket.emit('auth-error', { message: 'Insufficient permissions' });
      return;
    }

    const tenantPrefix = authenticatedUser.tenantId ? `tenant-${authenticatedUser.tenantId}:` : '';
    socket.join(`${tenantPrefix}user-${userId}`);
    if (!IS_PRODUCTION) console.log(`👤 Socket ${socket.id} joined user room: user-${userId}`);
  });

  socket.on('disconnect', () => {
    if (!IS_PRODUCTION) console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Helper function to emit real-time events
global.emitRealTimeUpdate = (event, data, target = 'all') => {
  if (!IS_PRODUCTION) console.log(`📡 Emitting ${event} to ${target}:`, JSON.stringify(data).substring(0, 100));
  const tenantPrefix = data?.tenantId ? `tenant-${data.tenantId}:` : '';
  if (target === 'all') {
    if (tenantPrefix) io.to(`${tenantPrefix}admin`).to(`${tenantPrefix}manager`).to(`${tenantPrefix}user`).emit(event, data);
    else io.emit(event, data);
  } else if (target.startsWith('user-')) {
    io.to(`${tenantPrefix}${target}`).emit(event, data);
  } else {
    io.to(`${tenantPrefix}${target}`).emit(event, data);
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
// CSRF PROTECTION (Double-submit cookie pattern)
// ============================================================
app.use(createCsrfMiddleware({ isProduction: IS_PRODUCTION }));

// ============================================================
// RATE LIMITING
// ============================================================
let rateLimitStore;
if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  const { RedisStore } = require('rate-limit-redis');
  const rateLimitRedis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
  rateLimitStore = new RedisStore({
    sendCommand: (...args) => rateLimitRedis.call(...args)
  });
} else if (IS_PRODUCTION) {
  console.error('REDIS_URL is required in production for distributed rate limiting');
  process.exit(1);
}

// General API rate limit - more permissive for dashboard usage
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 300, // 300 requests per minute per IP (5 requests/second average)
  message: { message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  ...(rateLimitStore ? { store: rateLimitStore } : {}),
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
  legacyHeaders: false,
  ...(rateLimitStore ? { store: rateLimitStore } : {})
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/register-tenant', authLimiter);

// Dedicated MFA rate limiter — 5 attempts per minute per IP
const mfaLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { message: 'Too many 2FA attempts, please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  ...(rateLimitStore ? { store: rateLimitStore } : {})
});
app.use('/api/auth/2fa/authenticate', mfaLimiter);

// Per-user write rate limiter for mutation endpoints (60 writes/min)
const jwt = require('jsonwebtoken');
const userWriteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Write rate limit exceeded. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  ...(rateLimitStore ? { store: rateLimitStore } : {}),
  keyGenerator: (req) => {
    if (req.userId) return `user:${req.userId}`;
    const token = req.cookies?.authToken || (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded?.id || decoded?._id) return `user:${decoded.id || decoded._id}`;
      } catch {}
    }
    return req.ip;
  },
  skip: (req) => {
    return ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || process.env.NODE_ENV === 'development';
  }
});
app.use('/api/', userWriteLimiter);

// Serve upload files
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_PATH || './uploads')));

// ============================================================
// LOGGING CONFIGURATION
// ============================================================
// Shared singleton — same instance used by all route files via src/utils/logger.js
const logger = require('./src/utils/logger');

const sendSuccess = (res, statusCode = 200, payload = {}) => {
  return res.status(statusCode).json({
    success: true,
    ...payload
  });
};

const sendError = (res, statusCode = 500, message = 'Internal Server Error', details) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(details ? { details } : {})
  });
};

// Use Morgan for HTTP request logging (skip in test environment, skip health checks)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', { 
    stream: { write: message => logger.info(message.trim()) },
    skip: (req) =>
      req.path === '/api/health' ||
      req.path === '/api/health/live' ||
      req.path === '/api/ready'
  }));
}

// Body parsing middleware
// 100kb is ample for any legitimate JSON payload in this API.
// 10mb was dangerously high — a crafted large body would burn CPU parsing
// before any route handler ran, enabling a cheap DoS attack.
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buffer) => {
    if (req.originalUrl && req.originalUrl.startsWith('/api/billing/webhook')) {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));
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
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '100', 10),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '10', 10),
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

const connectWithRetry = async (attempt = 1) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    logger.info('✅ MongoDB connected');
    logger.info(`📊 Database: ${mongoose.connection.name}`);

    // Verify replica set is available (required for transactions)
    const { checkReplicaSet } = require('./src/utils/checkReplicaSet');
    await checkReplicaSet();

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

      // Start scheduled report generation (daily + weekly)
      startReportScheduler();

      // Check trial expiration reminders (daily)
      const checkTrialExpirations = async () => {
        try {
          const { sendTrialExpiringEmail } = require('./src/services/email.service');
          const Tenant = require('./src/models/Tenant');
          const now = Date.now();
          const sevenDaysAhead = new Date(now + 8 * 24 * 60 * 60 * 1000);

          const tenants = await Tenant.find({
            status: { $in: ['active', 'ACTIVE', 'TRIAL'] },
            trialEndsAt: { $gte: new Date(now), $lte: sevenDaysAhead }
          }).populate('ownerId', 'name email');

          for (const tenant of tenants) {
            if (!tenant.ownerId?.email) continue;
            const daysRemaining = Math.ceil((new Date(tenant.trialEndsAt).getTime() - now) / 86400000);
            if ([7, 3, 1].includes(daysRemaining)) {
              await sendTrialExpiringEmail({
                to: tenant.ownerId.email,
                name: tenant.ownerId.name || 'Admin',
                daysRemaining,
                companyName: tenant.name || 'Your Company',
                upgradeUrl: `${process.env.FRONTEND_BASE_URL || 'https://acustock.com'}/billing`
              }).catch(() => {});
            }
          }
        } catch (err) {
          logger.error('Trial expiration check failed:', err.message);
        }
      };
      checkTrialExpirations();
      setInterval(checkTrialExpirations, 24 * 60 * 60 * 1000);
      logger.info('⏰ Trial expiration reminder cron started');

      // Retry failed Stripe events on the leader only; dead-letter records stop
      // retrying after the configured maximum and remain inspectable.
      const retryBilling = async () => {
        try {
          await retryFailedBillingEvents();
        } catch (err) {
          logger.error('Billing retry worker failed:', err.message);
        }
      };
      retryBilling();
      setInterval(retryBilling, 60 * 1000);

      // Delivery tracking background poller (leader only)
      const { startTrackingPoller } = require('./src/services/tracking/trackingPoller');
      startTrackingPoller();
    } else {
      logger.info(`⏰ Warranty notification cron skipped (worker ${process.env.NODE_APP_INSTANCE})`);
    }

    // Verify email configuration on startup (non-blocking)
    verifyEmailConfig();
  } catch (err) {
    logger.error(`❌ MongoDB connection attempt ${attempt} failed: ${err.message}`);
    if (attempt < 5) {
      const delayMs = 2 ** attempt * 1000;
      logger.info(`⏳ Retrying MongoDB connection in ${delayMs}ms...`);
      setTimeout(() => connectWithRetry(attempt + 1), delayMs);
    } else {
      logger.error('💥 MongoDB connection failed after 5 attempts');
      process.exit(1);
    }
  }
};

connectWithRetry();

// Request ID tracing — placed before routes so all handlers can access req.requestId
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  res.setHeader('x-request-id', req.requestId);
  next();
});

// Tenant resolution — reads X-Tenant-ID header / subdomain slug
app.use('/api/', resolveTenant);

// Global auth + tenant guard for all protected API routes (runs before route-level guards)
// Public routes (/api/auth/*) do NOT reach these because they are mounted first and short-circuit.
const UNGUARDED_PREFIXES = [
  '/api/auth/',
  '/api/auth',
  '/api/billing/webhook',
  '/api/setup',
  '/api/ai/whatsapp',
  '/api/docs',
  '/api/v1/docs',
  '/api/health',
];
app.use('/api/', (req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  const isPublic = UNGUARDED_PREFIXES.some(p => path.startsWith(p));
  if (isPublic) return next();
  // Run requireAuth which sets req.user + req.tenantId, then requireTenantId guard
  requireAuth(req, res, (authErr) => {
    if (authErr) return next(authErr);
    next();
  });
});

// Routes
app.use('/api/auth', registerTenantRoutes); // Self-service tenant registration (public)
app.use('/api/auth', googleAuthRoutes);  // Google OAuth (must be before authRoutes)
app.use('/api/auth/2fa', twoFactorRoutes); // Two-Factor Authentication (TOTP)
app.use('/api/auth', authRoutes);
app.use('/api/audit-logs', (req, res, next) => {
  req.url = '/audit-logs' + (req.url === '/' ? '' : req.url);
  authRoutes(req, res, next);
});
app.use('/api/superadmin', superadminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/managers', managerRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reports/scheduled', reportScheduledRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/warranty',      warrantyRoutes);
app.use('/api/setup',         setupRoutes);
app.use('/api/ownership',     ownershipRoutes);
app.use('/api/invites',       inviteRoutes);
app.use('/api/permissions',   permissionRoutes);
app.use('/api/gdpr',          gdprRoutes);
app.use('/api/onboarding',    onboardingRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/sales-orders',    salesOrderRoutes);
app.use('/api/warehouses',      warehouseRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/billing',         billingRoutes);
app.use('/api/forecasts',       forecastRoutes);
app.use('/api/tenants',         tenantRoutes);
app.use('/api/activity',        activityRoutes);
app.use('/api/search',          searchRoutes);
app.use('/api/transporters',    transporterRoutes);
app.use('/api/lots',            lotRoutes);
app.use('/api/cycle-counts',    cycleCountRoutes);
app.use('/api/reorder',         reorderRoutes);
app.use('/api/packages',        packageRoutes);
app.use('/api/labels',          labelRoutes);
app.use('/api/rma',             rmaRoutes);
app.use('/api/sessions',        sessionRoutes);
app.use('/api/backups',         backupRoutes);
app.use('/api/api-keys',        apiKeyRoutes);
app.use('/api/webhooks',        webhookRoutes);
app.use('/api/reservations',    reservationRoutes);
app.use('/api/docs',            docsRoutes);
app.use('/api/ai',              aiRouter);
// CSV exports (mounted at root /api so paths like /api/stock/export/csv work)
app.use('/api', csvExportRoutes);

// ============================================================
// API VERSIONING (/api/v1/ Aliases)
// ============================================================
const v1Routes = [
  ['auth', authRoutes],
  ['users', userRoutes],
  ['managers', managerRoutes],
  ['companies', companyRoutes],
  ['items', itemRoutes],
  ['stock', stockRoutes],
  ['dashboard', dashboardRoutes],
  ['reports', reportRoutes],
  ['units', unitRoutes],
  ['logistics', logisticsRoutes],
  ['shipments', shipmentRoutes],
  ['tracking', trackingRoutes],
  ['settings', settingsRoutes],
  ['notifications', notificationRoutes],
  ['warranty', warrantyRoutes],
  ['purchase-orders', purchaseOrderRoutes],
  ['sales-orders', salesOrderRoutes],
  ['warehouses', warehouseRoutes],
  ['stock-transfers', stockTransferRoutes],
  ['billing', billingRoutes],
  ['forecasts', forecastRoutes],
  ['tenants', tenantRoutes],
  ['activity', activityRoutes],
  ['search', searchRoutes],
  ['transporters', transporterRoutes],
  ['lots', lotRoutes],
  ['cycle-counts', cycleCountRoutes],
  ['reorder', reorderRoutes],
  ['packages', packageRoutes],
  ['labels', labelRoutes],
  ['rma', rmaRoutes],
  ['sessions', sessionRoutes],
  ['backups', backupRoutes],
  ['api-keys', apiKeyRoutes],
  ['webhooks', webhookRoutes],
  ['reservations', reservationRoutes],
  ['docs', docsRoutes],
  ['ai', aiRouter]
];
for (const [prefix, handler] of v1Routes) {
  app.use(`/api/v1/${prefix}`, handler);
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const healthcheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    requestId: req.requestId,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: 'unchecked'
  };

  if (mongoose.connection.readyState === 1) {
    try {
      const pingStart = Date.now();
      await mongoose.connection.db.admin().ping();
      healthcheck.database = 'connected';
      healthcheck.databaseLatencyMs = Date.now() - pingStart;
    } catch (error) {
      healthcheck.status = 'DEGRADED';
      healthcheck.database = 'unreachable';
      healthcheck.databaseError = error.message;
    }
  }

  // Redis health check
  const redisService = require('./src/services/redis.service');
  if (redisService.isRedisConnected && redisService.client) {
    try {
      const rStart = Date.now();
      await redisService.client.ping();
      healthcheck.redis = 'connected';
      healthcheck.redisLatencyMs = Date.now() - rStart;
    } catch {
      healthcheck.redis = 'unreachable';
      healthcheck.status = 'DEGRADED';
    }
  } else if (process.env.REDIS_URL) {
    healthcheck.redis = 'disconnected';
    healthcheck.status = 'DEGRADED';
  } else {
    healthcheck.redis = 'not_configured';
  }
  
  // Include memory usage in development
  if (!IS_PRODUCTION) {
    const memUsage = process.memoryUsage();
    healthcheck.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
    };
  }
  
  res.status(healthcheck.status === 'OK' ? 200 : 503).json(healthcheck);
});

app.get('/api/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1 &&
    (!IS_PRODUCTION || Boolean(process.env.REDIS_URL));
  res.status(ready ? 200 : 503).json({
    status: ready ? 'READY' : 'NOT_READY',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redisRequired: IS_PRODUCTION,
    redisConfigured: Boolean(process.env.REDIS_URL),
    requestId: req.requestId
  });
});

// Standard cloud/Kubernetes health and liveness aliases
app.get('/api/health/live', (req, res) => res.json({ status: 'LIVE', uptime: Math.floor(process.uptime()) }));
app.get('/api/health/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'READY' : 'NOT_READY',
    database: ready ? 'connected' : 'disconnected'
  });
});

// Serve frontend HTML pages (must come after API routes)
// Root redirect to modern frontend web dashboard
app.get('/', (req, res) => {
  res.redirect(process.env.FRONTEND_BASE_URL || 'http://localhost:3000');
});

// Serve login page redirect
app.get('/login', (req, res) => {
  res.redirect(`${process.env.FRONTEND_BASE_URL || 'http://localhost:3000'}/login`);
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return sendError(res, 404, 'API route not found');
  }
  res.redirect(process.env.FRONTEND_BASE_URL || 'http://localhost:3000');
});

// Sentry error handler — must come before any other error middleware
if (Sentry) Sentry.setupExpressErrorHandler(app);

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
    // In development only: expose error details for debugging
    message = err.message;
    details = err.stack;
  }
  // Production: message stays 'Internal Server Error', details stays undefined
  // — never leak stack traces or internal paths to clients

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(details ? { details } : {})
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
