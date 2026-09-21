const Permission = require('../models/permission');
const UserPermission = require('../models/UserPermission');

// In-memory permission cache to avoid redundant database reads on every API call (60s TTL)
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getCacheKey(tenantId, keyType, keyId) {
  return `${tenantId || 'global'}:${keyType}:${keyId}`;
}

function getFromCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setInCache(key, data) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function invalidatePermissionCache(tenantId = null, userId = null, role = null) {
  if (!tenantId && !userId && !role) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (tenantId && key.startsWith(`${tenantId}:`)) {
      if (userId && key.includes(`:user:${userId}`)) cache.delete(key);
      else if (role && key.includes(`:role:${role}`)) cache.delete(key);
      else if (!userId && !role) cache.delete(key);
    } else if (!tenantId) {
      if (userId && key.includes(`:user:${userId}`)) cache.delete(key);
      if (role && key.includes(`:role:${role}`)) cache.delete(key);
    }
  }
}

/**
 * requirePermission
 * Usage: requirePermission('canStockIn')
 * Resolution hierarchy:
 * 1. SUPER_ADMIN -> bypass all
 * 2. User-specific override in UserPermission (if not null) -> allow or deny
 * 3. Role-default permission in Permission -> allow or deny
 */
function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({ message: 'Unauthenticated' });
      }

      // 1. SUPER_ADMIN bypasses all granular permission checks
      if (req.user.role === 'SUPER_ADMIN') {
        return next();
      }

      const tenantId = req.tenantId || req.user.tenantId || null;
      const userId = req.user._id || req.userId;

      // 2. Check User-Level Granular Overrides
      if (userId) {
        const userCacheKey = getCacheKey(tenantId, 'user', userId.toString());
        let userPerm = getFromCache(userCacheKey);

        if (userPerm === null) {
          const userQuery = { userId };
          if (tenantId) userQuery.tenantId = tenantId;
          userPerm = await UserPermission.findOne(userQuery).lean();
          setInCache(userCacheKey, userPerm || {});
        }

        if (userPerm && userPerm[permissionKey] !== null && userPerm[permissionKey] !== undefined) {
          if (userPerm[permissionKey] === true) {
            return next();
          }
          return res.status(403).json({
            message: `Permission denied: ${permissionKey}`
          });
        }
      }

      // 3. Fall back to Role-Level Permissions
      const lookupRole = req.user.role;
      const roleCacheKey = getCacheKey(tenantId, 'role', lookupRole);
      let rolePerm = getFromCache(roleCacheKey);

      if (rolePerm === null) {
        const roleQuery = { role: lookupRole };
        if (tenantId) roleQuery.tenantId = tenantId;
        rolePerm = await Permission.findOne(roleQuery).lean();
        setInCache(roleCacheKey, rolePerm || {});
      }

      if (!rolePerm || !rolePerm[permissionKey]) {
        return res.status(403).json({
          message: `Permission denied: ${permissionKey}`
        });
      }

      next();
    } catch (err) {
      console.error('Permission middleware error:', err);
      res.status(500).json({ message: 'Permission validation failed' });
    }
  };
}

module.exports = requirePermission;
module.exports.invalidatePermissionCache = invalidatePermissionCache;