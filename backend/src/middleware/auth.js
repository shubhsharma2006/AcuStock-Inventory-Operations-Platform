const mongoose = require('mongoose');

/**
 * validateObjectId
 * Middleware: rejects requests where :id is not a valid MongoDB ObjectId.
 * Prevents CastError stack traces from leaking to the client.
 * Usage: router.get('/:id', requireAuth, validateObjectId, handler)
 */
const validateObjectId = (req, res, next) => {
  const id = req.params.id || req.params.productId;
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  next();
};

const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.split(' ')[1];
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

    const user = await User.findById(decoded._id).select('_id role isActive tokenVersion');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        message: 'Account inactive. Contact admin.',
        code: 'ACCOUNT_INACTIVE'
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

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
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
    console.error('Force password reset check error:', err.message);
    next(); // Don't block on error, let main route handle auth
  }
};

/**
 * Serial policy enforcement (per product)
 * action = 'IN' | 'OUT'
 */
const enforceSerialPolicy = (action) => {
  return async (req, res, next) => {
    try {
      const { productId, serialNumbers = [] } = req.body;

      if (!productId) {
        return res.status(400).json({ message: 'Product is required' });
      }

      const Product = require('../models/Product');
      const product = await Product.findById(productId).select('serialPolicy');

      if (!product) {
        return res.status(400).json({ message: 'Invalid product' });
      }

      const policy = product.serialPolicy || { enabled: false };

      // Serial completely disabled
      if (!policy.enabled && serialNumbers.length > 0) {
        return res.status(403).json({
          message: 'Serial numbers are disabled for this product'
        });
      }

      // Stock IN restriction
      if (action === 'IN' && policy.enabled && policy.inStock === false && serialNumbers.length > 0) {
        return res.status(403).json({
          message: 'Serial numbers not allowed for stock IN'
        });
      }

      // Stock OUT restriction
      if (action === 'OUT' && policy.enabled && policy.outStock === false && serialNumbers.length > 0) {
        return res.status(403).json({
          message: 'Serial numbers not allowed for stock OUT'
        });
      }

      next();
    } catch (err) {
      console.error('Serial policy error:', err.message);
      return res.status(500).json({ message: 'Serial policy enforcement failed' });
    }
  };
};

module.exports = {
  requireAuth,
  requireRole,
  checkForcePasswordReset,
  enforceSerialPolicy,
  validateObjectId,
};
