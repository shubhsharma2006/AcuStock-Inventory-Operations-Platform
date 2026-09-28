const mongoose = require('mongoose');

const isValidObjectIdString = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && mongoose.Types.ObjectId.isValid(trimmed);
};

const normalizePaginationQuery = (query = {}) => {
  const page = Number.parseInt(query.page, 10);
  const limit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50
  };
};

/**
 * validateObjectId
 * Middleware: rejects requests where :id is not a valid MongoDB ObjectId.
 * Prevents CastError stack traces from leaking to the client.
 * Usage: router.get('/:id', requireAuth, validateObjectId, handler)
 */
const validateObjectId = (req, res, next) => {
  const id = req.params.id || req.params.productId;
  if (id && !isValidObjectIdString(id)) {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }
  next();
};

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

/**
 * Extract token from Authorization header or HTTP-only cookie
 * Priority: Cookie > Header (for production security)
 */
const getToken = (req) => {
  // First check HTTP-only cookie (most secure)
  if (req.cookies && req.cookies.authToken) {
    return req.cookies.authToken;
  }
  
  // Fallback to Authorization header (for API clients/mobile)
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const token = authorization.split(' ')[1];
    return token && token.trim() ? token.trim() : null;
  }
  
  return null;
};

/**
 * Auth middleware
 * - Verifies JWT from cookie or header
 * - Loads active user
 * - Attaches req.user, req.userId, req.userRole
 */
const requireAuth = async (req, res, next) => {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({ message: 'Authorization token missing or invalid' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject temporary MFA challenge tokens on standard protected APIs
    if (decoded.mfaPending === true || decoded.purpose === 'MFA_AUTHENTICATION') {
      return res.status(401).json({
        message: 'Two-factor authentication verification required',
        code: 'MFA_PENDING'
      });
    }

    const user = await User.findById(decoded._id || decoded.id || decoded.userId).select('_id role isActive tokenVersion tenantId');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        message: 'Account inactive. Contact admin.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    if (decoded.tenantId && user.tenantId && String(decoded.tenantId) !== String(user.tenantId)) {
      return res.status(401).json({
        message: 'Session tenant does not match account membership',
        code: 'TENANT_SESSION_MISMATCH'
      });
    }

    // Resolve tenant after authentication so trusted identity, not a client
    // header, controls tenant context for protected requests.
    const requestedTenantId = req.tenantId;
    const isSystemRequest = req.path.startsWith('/superadmin') || req.path.startsWith('/setup');

    // Workspace Boundary Guard:
    // If request arrived via a specific tenant subdomain or workspace header,
    // verify the authenticated user belongs to that workspace (unless SUPER_ADMIN).
    if (requestedTenantId && user.tenantId && String(requestedTenantId) !== String(user.tenantId) && !isSystemRequest) {
      if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          message: 'Access denied: Your account is registered under another workspace organization.',
          code: 'TENANT_WORKSPACE_MISMATCH'
        });
      }
    }

    if (user.tenantId) {
      const tenant = await Tenant.findById(user.tenantId);
      if (!tenant || !tenant.isActive || ['SUSPENDED', 'CANCELED'].includes(tenant.status)) {
        return res.status(403).json({
          message: 'Organization account is suspended or inactive. Contact support.',
          code: 'TENANT_INACTIVE'
        });
      }
      req.tenant = tenant;
      req.tenantId = user.tenantId;

      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const isBillingOrAuthRecovery = req.path.startsWith('/billing') ||
        req.path.startsWith('/auth/logout') || req.path.startsWith('/auth/refresh');
      const subscriptionStatus = tenant.subscriptionStatus || tenant.status;
      const gracePeriodActive = tenant.gracePeriodEndsAt && tenant.gracePeriodEndsAt > new Date();
      if (isMutation && !isBillingOrAuthRecovery && ['PAST_DUE', 'UNPAID'].includes(subscriptionStatus) && !gracePeriodActive) {
        return res.status(402).json({
          message: 'Subscription payment is past due. Update billing to resume write operations.',
          code: 'SUBSCRIPTION_PAST_DUE'
        });
      }
    } else if (user.role === 'SUPER_ADMIN' && requestedTenantId && req.tenant) {
      // Super-admin tenant access must be explicitly selected by a trusted
      // system operation or tenant-qualified request context.
      if (!req.tenant.isActive || ['SUSPENDED', 'CANCELED'].includes(req.tenant.status)) {
        return res.status(403).json({
          message: 'Organization account is suspended or inactive. Contact support.',
          code: 'TENANT_INACTIVE'
        });
      }
      req.tenantId = requestedTenantId;
    } else if (!isSystemRequest && (process.env.NODE_ENV === 'production' || process.env.REQUIRE_TENANT_CONTEXT === 'true')) {
      return res.status(403).json({
        message: 'A tenant workspace is required for this account.',
        code: 'TENANT_REQUIRED'
      });
    }

    // Check token version for force logout / password change
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ 
        message: 'Session expired. Please login again.',
        code: 'TOKEN_INVALIDATED'
      });
    }

    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;
    if (!req.tenantId) req.tenantId = user.tenantId || null;

    next();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Auth middleware error:', err.message);
    }
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Role-based access control
 * Usage: requireRole(['ADMIN','MANAGER'])
 * SUPER_ADMIN is automatically granted access wherever ADMIN is allowed.
 */
const requireRole = (roles = []) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  // SUPER_ADMIN inherits all ADMIN permissions automatically
  const effectiveRoles = allowedRoles.includes('ADMIN')
    ? [...new Set([...allowedRoles, 'SUPER_ADMIN'])]
    : allowedRoles;

  return (req, res, next) => {
    if (!req.user || !req.userRole) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!effectiveRoles.includes(req.userRole)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    next();
  };
};

/**
 * Check if user must reset password before accessing protected routes
 * Allows only password change routes when forcePasswordReset is true
 */
const checkForcePasswordReset = async (req, res, next) => {
  try {
    if (!req.user || !req.userId) {
      return next();
    }
    
    // Allow these routes even when password reset is required
    const allowedPaths = [
      '/auth/change-password',
      '/auth/logout',
      '/auth/me',
      '/settings/profile/password'
    ];
    
    // Check if current path is allowed
    const currentPath = req.path;
    if (allowedPaths.some(path => currentPath.includes(path))) {
      return next();
    }
    
    // Check if user has forcePasswordReset flag
    const user = await User.findById(req.userId).select('forcePasswordReset');
    
    if (user && user.forcePasswordReset) {
      return res.status(403).json({
        message: 'Password reset required. Please change your password before continuing.',
        code: 'FORCE_PASSWORD_RESET',
        forcePasswordReset: true
      });
    }
    
    next();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Force password reset check error:', err.message);
    }
    next(); // Don't block on error, let main route handle auth
  }
};


/**
 * requireTenantId
 * Middleware: rejects any request where req.tenantId has not been resolved.
 * Must be placed AFTER requireAuth (which sets req.tenantId via tenancy middleware).
 * Provides a centralized, explicit fail-closed gate for all tenant-scoped routes.
 *
 * Usage: router.get('/', requireAuth, requireTenantId, handler)
 */
const requireTenantId = (req, res, next) => {
  if (!req.tenantId) {
    return res.status(403).json({
      success: false,
      error: 'Tenant context required',
      code: 'TENANT_REQUIRED'
    });
  }
  next();
};

module.exports = {
  requireAuth,
  requireRole,
  requireTenantId,
  checkForcePasswordReset,
  validateObjectId,
  isValidObjectIdString,
  normalizePaginationQuery,
};
// Note: validateObjectId is a simple middleware to check if :id params are valid MongoDB ObjectIds, preventing CastErrors from reaching the client.