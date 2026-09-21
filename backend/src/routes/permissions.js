/**
 * Permissions API
 * GET   /api/permissions         — get all role permission documents (ADMIN only)
 * GET   /api/permissions/:role   — get one role's permissions
 * PATCH /api/permissions/:role   — update a role's permissions (ADMIN only)
 *
 * Hard-locked fields (canEditStock, canDeleteStock, canManageAdmins)
 * are enforced at the model pre-save hook — this API cannot override them.
 */

const express    = require('express');
const Permission = require('../models/permission');
const UserPermission = require('../models/UserPermission');
const User       = require('../models/User');
const AuditLog   = require('../models/AuditLog');
const { logBusinessEvent } = require('../utils/auditHelper');
const { requireAuth, requireRole, validateObjectId } = require('../middleware/auth');
const { invalidatePermissionCache } = require('../middleware/requirePermission');
const logger     = require('../utils/logger');

const router = express.Router();

// Fields that are permanently hard-locked regardless of input
const HARD_LOCKED = ['canEditStock', 'canDeleteStock', 'canManageAdmins'];

// Valid roles that have permission documents
const VALID_ROLES = ['ADMIN', 'MANAGER', 'USER'];

// GET /api/permissions — list all role permissions
router.get('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const permissions = await Permission.find({ tenantId: req.tenantId }).sort({ role: 1 });
    res.json({ success: true, permissions });
  } catch (err) {
    logger.error('Error fetching permissions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch permissions' });
  }
});

// GET /api/permissions/me — get current user's active permissions
router.get('/me', requireAuth, async (req, res) => {
  try {
    if (req.userRole === 'SUPER_ADMIN') {
      return res.json({
        success: true,
        role: 'SUPER_ADMIN',
        permissions: {
          role: 'SUPER_ADMIN',
          canManageAdmins: true,
          canManageManagers: true,
          canManageUsers: true,
          canActivateDeactivateManagers: true,
          canActivateDeactivateUsers: true,
          canViewProducts: true,
          canAddProduct: true,
          canEditProduct: true,
          canDeleteProduct: true,
          canChangeSerialPolicy: true,
          canViewCompanies: true,
          canAddCompany: true,
          canEditCompany: true,
          canDeleteCompany: true,
          canViewUnits: true,
          canManageUnits: true,
          canStockIn: true,
          canStockOut: true,
          canViewStockLedger: true,
          canEditStock: false,
          canDeleteStock: false,
          canViewAllReports: true,
          canViewOwnReports: true,
          canAccessSettings: true,
          canViewAuditLogs: true
        }
      });
    }

    const permission = await Permission.findOne({ role: req.userRole, tenantId: req.tenantId });
    if (!permission) {
      return res.status(404).json({ success: false, error: `Permissions not configured for role: ${req.userRole}` });
    }
    res.json({ success: true, role: req.userRole, permissions: permission });
  } catch (err) {
    logger.error('Error fetching my permissions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch permissions' });
  }
});

// GET /api/permissions/:role — get one role
router.get('/:role', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const role = req.params.role.toUpperCase();
  if (role === 'SUPER_ADMIN') {
    return res.json({
      success: true,
      permission: { role: 'SUPER_ADMIN', canManageAdmins: true, canManageUsers: true, canViewAllReports: true }
    });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
  }

  try {
    const permission = await Permission.findOne({ role, tenantId: req.tenantId });
    if (!permission) return res.status(404).json({ success: false, error: 'Permission document not found. Run seed script.' });
    res.json({ success: true, permission });
  } catch (err) {
    logger.error('Error fetching role permission:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch permission' });
  }
});

// PATCH /api/permissions/:role — update toggleable flags
router.patch('/:role', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const role = req.params.role.toUpperCase();
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const updates = req.body;

  // Strip hard-locked fields from input — never allow clients to set them
  for (const field of HARD_LOCKED) {
    delete updates[field];
  }

  // Ensure all remaining fields are boolean
  const sanitized = {};
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== 'boolean') {
      return res.status(400).json({ success: false, error: `Field "${key}" must be a boolean` });
    }
    sanitized[key] = value;
  }

  if (Object.keys(sanitized).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid permission fields provided' });
  }

  try {
    const permission = await Permission.findOneAndUpdate(
      { role, tenantId: req.tenantId },
      { $set: { ...sanitized, updatedBy: req.userId } },
      { new: true, runValidators: true }
    );

    if (!permission) {
      return res.status(404).json({ success: false, error: 'Permission document not found. Run seed script.' });
    }

    // Audit log the permission change
    logBusinessEvent({
      req,
      action: 'PERMISSION_UPDATED',
      entityType: 'Permission',
      entityId: permission._id,
      targetRole: role,
      changes: {
        after: sanitized,
        summary: `Permissions updated for role ${role}`
      },
      severity: 'WARNING'
    }).catch(() => {});

    // Invalidate role cache
    invalidatePermissionCache(req.tenantId, null, role);

    res.json({ success: true, message: `Permissions for ${role} updated`, permission });
  } catch (err) {
    logger.error('Error updating permissions:', err);
    res.status(500).json({ success: false, error: 'Failed to update permissions' });
  }
});

// ============================================================
// PER-USER PERMISSION OVERRIDES
// ============================================================

// GET /api/permissions/user/:userId — Get a user's effective permissions (merged view)
router.get('/user/:userId', requireAuth, requireRole(['ADMIN']), validateObjectId, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findOne({
      _id: userId,
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
    }).select('name email role tenantId');

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found in this tenant' });
    }

    const [rolePerm, userOverride] = await Promise.all([
      Permission.findOne({ role: targetUser.role, ...(req.tenantId ? { tenantId: req.tenantId } : {}) }).lean(),
      UserPermission.findOne({ userId: targetUser._id, ...(req.tenantId ? { tenantId: req.tenantId } : {}) }).lean()
    ]);

    const effective = {};
    const overrides = {};
    const basePermissions = rolePerm || {};

    // Merge role defaults and overrides
    const allKeys = new Set([
      ...Object.keys(basePermissions),
      ...(userOverride ? Object.keys(userOverride) : [])
    ]);

    const ignoredFields = ['_id', 'role', 'tenantId', 'userId', 'createdAt', 'updatedAt', '__v', 'createdBy', 'updatedBy'];

    for (const key of allKeys) {
      if (ignoredFields.includes(key)) continue;

      const overrideVal = userOverride ? userOverride[key] : undefined;
      const roleVal = basePermissions[key] || false;

      if (overrideVal !== null && overrideVal !== undefined) {
        effective[key] = overrideVal;
        overrides[key] = overrideVal;
      } else {
        effective[key] = roleVal;
      }
    }

    res.json({
      success: true,
      user: targetUser,
      roleDefaults: basePermissions,
      overrides,
      effective
    });
  } catch (err) {
    logger.error('Error fetching user permissions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch user permissions' });
  }
});

// PATCH /api/permissions/user/:userId — Set user-level overrides (ADMIN only)
router.patch('/user/:userId', requireAuth, requireRole(['ADMIN']), validateObjectId, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findOne({
      _id: userId,
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found in this tenant' });
    }

    const updates = req.body || {};

    // Strip hard-locked fields
    for (const field of HARD_LOCKED) {
      delete updates[field];
    }

    // Validate values: boolean or null
    const sanitized = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== null && typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: `Field "${key}" must be a boolean or null (to inherit default)`
        });
      }
      sanitized[key] = value;
    }

    if (Object.keys(sanitized).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid permission fields provided' });
    }

    const userPermission = await UserPermission.findOneAndUpdate(
      { userId: targetUser._id, tenantId: req.tenantId },
      { $set: { ...sanitized, updatedBy: req.userId } },
      { upsert: true, new: true, runValidators: true }
    );

    invalidatePermissionCache(req.tenantId, targetUser._id.toString());

    logBusinessEvent({
      req,
      action: 'PERMISSION_UPDATED',
      entityType: 'User',
      entityId: targetUser._id,
      targetUser: targetUser._id,
      changes: {
        after: sanitized,
        summary: `Updated granular permission overrides for ${targetUser.name || targetUser.email}`
      },
      severity: 'WARNING'
    }).catch(() => {});

    res.json({
      success: true,
      message: `Permission overrides updated for ${targetUser.name || targetUser.email}`,
      userPermission
    });
  } catch (err) {
    logger.error('Error updating user permissions:', err);
    res.status(500).json({ success: false, error: 'Failed to update user permissions' });
  }
});

// DELETE /api/permissions/user/:userId — Reset user to role defaults (ADMIN only)
router.delete('/user/:userId', requireAuth, requireRole(['ADMIN']), validateObjectId, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findOne({
      _id: userId,
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found in this tenant' });
    }

    await UserPermission.deleteOne({
      userId: targetUser._id,
      tenantId: req.tenantId
    });

    invalidatePermissionCache(req.tenantId, targetUser._id.toString());

    logBusinessEvent({
      req,
      action: 'PERMISSION_UPDATED',
      entityType: 'User',
      entityId: targetUser._id,
      targetUser: targetUser._id,
      changes: {
        summary: `Reset granular permission overrides to role defaults for ${targetUser.name || targetUser.email}`
      },
      severity: 'INFO'
    }).catch(() => {});

    res.json({
      success: true,
      message: `Permissions for ${targetUser.name || targetUser.email} reset to role defaults`
    });
  } catch (err) {
    logger.error('Error resetting user permissions:', err);
    res.status(500).json({ success: false, error: 'Failed to reset user permissions' });
  }
});

module.exports = router;
