const mongoose = require('mongoose');
const Permission = require('../models/permission');
const UserPermission = require('../models/UserPermission');
const { MODULE_REGISTRY, SYSTEM_SECTIONS } = require('../config/modules');
const logger = require('../utils/logger');

// Find section for a given module ID
function getSectionForModule(moduleId) {
  const mod = MODULE_REGISTRY[moduleId];
  if (mod && mod.sectionId) return mod.sectionId;
  for (const sec of SYSTEM_SECTIONS) {
    if (sec.moduleIds.includes(moduleId)) return sec.id;
  }
  return null;
}

/**
 * Resolves the effective module access level for a user within a tenant.
 * Hierarchy:
 *   1. SUPER_ADMIN -> Always FULL_ACCESS
 *   2. User-specific custom override (if not expired)
 *   3. User-specific section override
 *   4. Role-level module access
 *   5. Role-level section disabled list
 *   6. Canonical module default
 *
 * @returns {Promise<{ access: 'HIDDEN' | 'READ_ONLY' | 'FULL_ACCESS', maskFinancials: boolean, disableExport: boolean, appliedPersonaId: string | null }>}
 */
async function resolveEffectiveModuleAccess(tenantId, userId, userRole, moduleId) {
  // 1. SuperAdmin immunity
  if (userRole === 'SUPER_ADMIN') {
    return {
      access: 'FULL_ACCESS',
      maskFinancials: false,
      disableExport: false,
      appliedPersonaId: null,
    };
  }

  const sectionId = getSectionForModule(moduleId);

  // If MongoDB is not connected (e.g. running unit tests without DB daemon), resolve canonically
  let rolePerm = null;
  let userPerm = null;

  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      [rolePerm, userPerm] = await Promise.all([
        Permission.findOne({ tenantId, role: userRole }).maxTimeMS(2000),
        userId ? UserPermission.findOne({ tenantId, userId }).maxTimeMS(2000) : null,
      ]);
    } catch (dbErr) {
      logger.warn('Failed to query permissions from DB, falling back to defaults:', dbErr.message);
    }
  }

  const roleMaskFinancials = rolePerm?.maskFinancials || false;
  const roleDisableExport = rolePerm?.disableExport || false;
  const effectiveMaskFinancials = userPerm?.maskFinancials != null ? userPerm.maskFinancials : roleMaskFinancials;
  const effectiveDisableExport = userPerm?.disableExport != null ? userPerm.disableExport : roleDisableExport;
  const appliedPersonaId = userPerm?.appliedPersonaId || null;

  // 2. Check User-specific module override
  if (userPerm && userPerm.moduleOverrides) {
    const override = userPerm.moduleOverrides.get(moduleId) || (userPerm.moduleOverrides[moduleId]);
    if (override && override.access) {
      // Check expiration
      if (override.expiresAt && new Date(override.expiresAt) < new Date()) {
        logger.info(`User override for module ${moduleId} expired at ${override.expiresAt}, falling back to role default`);
      } else {
        return {
          access: override.access,
          maskFinancials: effectiveMaskFinancials,
          disableExport: effectiveDisableExport,
          appliedPersonaId,
        };
      }
    }
  }

  // 3. Check User-specific section override
  if (sectionId && userPerm && userPerm.sectionOverrides) {
    const secOverride = userPerm.sectionOverrides.get(sectionId) ?? userPerm.sectionOverrides[sectionId];
    if (secOverride === false) {
      return {
        access: 'HIDDEN',
        maskFinancials: effectiveMaskFinancials,
        disableExport: effectiveDisableExport,
        appliedPersonaId,
      };
    }
  }

  // 4. Check Role-level disabled sections
  if (sectionId && rolePerm && Array.isArray(rolePerm.disabledSections)) {
    if (rolePerm.disabledSections.includes(sectionId)) {
      return {
        access: 'HIDDEN',
        maskFinancials: effectiveMaskFinancials,
        disableExport: effectiveDisableExport,
        appliedPersonaId,
      };
    }
  }

  // 5. Check Role-level module access map
  if (rolePerm && rolePerm.moduleAccess) {
    const roleAccess = rolePerm.moduleAccess.get(moduleId) || rolePerm.moduleAccess[moduleId];
    if (roleAccess && ['HIDDEN', 'READ_ONLY', 'FULL_ACCESS'].includes(roleAccess)) {
      return {
        access: roleAccess,
        maskFinancials: effectiveMaskFinancials,
        disableExport: effectiveDisableExport,
        appliedPersonaId,
      };
    }
  }

  // 6. Canonical module default
  const modDef = MODULE_REGISTRY[moduleId];
  const defaultAccess = modDef?.defaultAccess?.[userRole] || 'FULL_ACCESS';

  return {
    access: defaultAccess,
    maskFinancials: effectiveMaskFinancials,
    disableExport: effectiveDisableExport,
    appliedPersonaId,
  };
}

/**
 * Resolves the full map of module permissions for a user (used by /api/permissions/my-modules)
 */
async function resolveAllModulesForUser(tenantId, userId, userRole) {
  if (userRole === 'SUPER_ADMIN') {
    const modules = {};
    for (const key of Object.keys(MODULE_REGISTRY)) {
      modules[key] = 'FULL_ACCESS';
    }
    return {
      modules,
      disabledSections: [],
      maskFinancials: false,
      disableExport: false,
      appliedPersonaId: null,
    };
  }

  let rolePerm = null;
  let userPerm = null;

  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      [rolePerm, userPerm] = await Promise.all([
        Permission.findOne({ tenantId, role: userRole }).maxTimeMS(2000),
        userId ? UserPermission.findOne({ tenantId, userId }).maxTimeMS(2000) : null,
      ]);
    } catch (dbErr) {
      logger.warn('Failed to query all modules from DB, falling back to defaults:', dbErr.message);
    }
  }

  const effectiveMaskFinancials = userPerm?.maskFinancials != null ? userPerm.maskFinancials : (rolePerm?.maskFinancials || false);
  const effectiveDisableExport = userPerm?.disableExport != null ? userPerm.disableExport : (rolePerm?.disableExport || false);
  const appliedPersonaId = userPerm?.appliedPersonaId || null;

  const modules = {};
  const disabledSections = new Set(rolePerm?.disabledSections || []);

  // Incorporate user section overrides
  if (userPerm?.sectionOverrides) {
    for (const [secId, enabled] of userPerm.sectionOverrides.entries ? userPerm.sectionOverrides.entries() : Object.entries(userPerm.sectionOverrides)) {
      if (enabled === false) disabledSections.add(secId);
      if (enabled === true) disabledSections.delete(secId);
    }
  }

  const now = new Date();

  for (const [modId, modDef] of Object.entries(MODULE_REGISTRY)) {
    const secId = modDef.sectionId;

    // Check user override
    let userOverride = null;
    if (userPerm?.moduleOverrides) {
      userOverride = userPerm.moduleOverrides.get ? userPerm.moduleOverrides.get(modId) : userPerm.moduleOverrides[modId];
    }

    if (userOverride && userOverride.access) {
      if (!userOverride.expiresAt || new Date(userOverride.expiresAt) >= now) {
        modules[modId] = userOverride.access;
        continue;
      }
    }

    // Check section disabled
    if (secId && disabledSections.has(secId)) {
      modules[modId] = 'HIDDEN';
      continue;
    }

    // Check role module access
    let roleAccess = null;
    if (rolePerm?.moduleAccess) {
      roleAccess = rolePerm.moduleAccess.get ? rolePerm.moduleAccess.get(modId) : rolePerm.moduleAccess[modId];
    }

    if (roleAccess && ['HIDDEN', 'READ_ONLY', 'FULL_ACCESS'].includes(roleAccess)) {
      modules[modId] = roleAccess;
      continue;
    }

    // Default
    modules[modId] = modDef.defaultAccess?.[userRole] || 'FULL_ACCESS';
  }

  return {
    modules,
    disabledSections: Array.from(disabledSections),
    maskFinancials: effectiveMaskFinancials,
    disableExport: effectiveDisableExport,
    appliedPersonaId,
  };
}

/**
 * Express Middleware to guard routes against disabled or read-only module access.
 */
function requireModuleAccess(moduleId, requiredAccess = 'READ_ONLY') {
  return async (req, res, next) => {
    try {
      if (req.userRole === 'SUPER_ADMIN') return next();

      const { access, maskFinancials, disableExport } = await resolveEffectiveModuleAccess(
        req.tenantId,
        req.userId,
        req.userRole,
        moduleId
      );

      if (access === 'HIDDEN') {
        return res.status(403).json({
          success: false,
          error: `Access Denied: Module '${moduleId}' has been disabled by your organization policy.`,
          code: 'MODULE_DISABLED',
          moduleId,
        });
      }

      if (requiredAccess === 'FULL_ACCESS' && access === 'READ_ONLY') {
        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        if (isMutating) {
          return res.status(403).json({
            success: false,
            error: `Read-Only Access: You do not have permission to modify data in module '${moduleId}'.`,
            code: 'MODULE_READ_ONLY',
            moduleId,
          });
        }
      }

      req.moduleAccess = access;
      req.maskFinancials = maskFinancials;
      req.disableExport = disableExport;

      next();
    } catch (err) {
      logger.error(`requireModuleAccess error on module ${moduleId}:`, err);
      res.status(500).json({ success: false, error: 'Module authorization check failed' });
    }
  };
}

module.exports = {
  resolveEffectiveModuleAccess,
  resolveAllModulesForUser,
  requireModuleAccess,
  getSectionForModule,
};
