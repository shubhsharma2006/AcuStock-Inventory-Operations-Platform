const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { requireAuth } = require('./auth');
const logger = require('../utils/logger');

/**
 * Extracts raw API key from request headers
 */
function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string') {
    return headerKey.trim();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer acu_live_')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Verifies API key and attaches user and tenant context to request
 */
async function authenticateApiKey(rawKey, req) {
  if (!rawKey.startsWith('acu_live_')) {
    return null;
  }

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const apiKey = await ApiKey.findOne({ keyHash, isActive: true }).lean();

  if (!apiKey) {
    return null;
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return { expired: true };
  }

  // Update last used asynchronously without blocking request
  ApiKey.updateOne(
    { _id: apiKey._id },
    {
      $set: {
        lastUsedAt: new Date(),
        lastUsedIp: req.ip || req.connection?.remoteAddress
      }
    }
  ).catch(err => logger.error('Failed to update API key lastUsedAt:', err));

  return apiKey;
}

/**
 * Middleware: Strictly requires a valid developer API key
 */
async function requireApiKey(req, res, next) {
  try {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
      return res.status(401).json({
        success: false,
        error: 'API key is required. Provide via X-API-Key header or Authorization: Bearer acu_live_...',
        code: 'API_KEY_REQUIRED'
      });
    }

    const result = await authenticateApiKey(rawKey, req);
    if (!result) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or revoked API key',
        code: 'INVALID_API_KEY'
      });
    }

    if (result.expired) {
      return res.status(401).json({
        success: false,
        error: 'API key has expired',
        code: 'API_KEY_EXPIRED'
      });
    }

    req.apiKey = result;
    req.tenantId = result.tenantId;
    req.user = {
      _id: result.createdBy,
      role: result.role,
      isApiKey: true,
      apiKeyId: result._id,
      scopes: result.scopes || []
    };

    next();
  } catch (error) {
    logger.error('API key auth error:', error);
    return res.status(500).json({ success: false, error: 'Internal authentication error' });
  }
}

/**
 * Middleware: Accepts either a valid API Key OR standard user JWT authentication
 */
async function requireApiKeyOrAuth(req, res, next) {
  const rawKey = extractApiKey(req);

  if (rawKey) {
    return requireApiKey(req, res, next);
  }

  // Fallback to standard JWT user authentication
  return requireAuth(req, res, next);
}

/**
 * Middleware: Guard to enforce required scopes on API key requests
 */
function requireScope(requiredScope) {
  return (req, res, next) => {
    // Regular logged-in users with ADMIN/SUPER_ADMIN bypass scope limitations
    if (!req.user?.isApiKey) {
      return next();
    }

    const scopes = req.user.scopes || [];
    if (!scopes.includes(requiredScope) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: `API key lacks required scope: ${requiredScope}`,
        code: 'INSUFFICIENT_SCOPE'
      });
    }

    next();
  };
}

module.exports = {
  extractApiKey,
  authenticateApiKey,
  requireApiKey,
  requireApiKeyOrAuth,
  requireScope
};
