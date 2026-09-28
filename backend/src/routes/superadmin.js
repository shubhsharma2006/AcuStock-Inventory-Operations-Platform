/**
 * SuperAdmin Control Center API Routes
 * ─────────────────────────────────────────────────────────────
 * Requires SUPER_ADMIN (or ADMIN) role.
 * 
 * Features:
 *   1. Activate / Deactivate ANY user, manager, or admin.
 *   2. Per-User ID-based Granular Permission Control (single or multi-user).
 *   3. Active Sessions Monitor — see who is logged in, at what time, role, IP.
 *   4. Instant Session Revocation.
 */

const express = require('express');
const User = require('../models/User');
const Permission = require('../models/permission');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Guard: Only SUPER_ADMIN and ADMIN can access SuperAdmin control center
const superAuth = [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])];

// ── 1. GET /api/superadmin/users — List all system users with session status ──
router.get('/users', superAuth, async (req, res) => {
  try {
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin
      ? (req.query.tenantId ? { tenantId: req.query.tenantId } : {})
      : { tenantId: req.tenantId };

    const users = await User.find({ isDeleted: { $ne: true }, ...tenantFilter })
      .select('name email phone role isActive isSuperAdmin lastLogin createdAt tokenVersion customPermissions')
      .sort({ createdAt: -1 })
      .lean();

    const now = Date.now();
    const formatted = users.map((u) => ({
      ...u,
      // Active session heuristic: logged in within last 24 hours
      isOnline: u.lastLogin ? now - new Date(u.lastLogin).getTime() < 24 * 60 * 60 * 1000 : false,
      hasCustomPermissions: Object.keys(u.customPermissions || {}).length > 0,
    }));

    res.json({ success: true, users: formatted });
  } catch (err) {
    logger.error('SuperAdmin list users error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// ── 2. PUT /api/superadmin/users/:userId/status — Activate / Deactivate ANY user ──
router.put('/users/:userId/status', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isActive boolean is required' });
    }

    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const targetUser = await User.findOne({ _id: userId, ...tenantFilter });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Protection: standard ADMIN cannot deactivate a SUPER_ADMIN
    if (targetUser.isSuperAdmin && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Only a Super Admin can modify another Super Admin' });
    }

    targetUser.isActive = isActive;
    if (!isActive) {
      targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1; // Invalidate session on deactivation
    }
    await targetUser.save({ validateModifiedOnly: true });

    // Audit Log
    try {
      const effectiveTenantId = req.tenantId || targetUser.tenantId;
      const auditDoc = new AuditLog({
        action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        performedBy: req.userId,
        targetUser: userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
      });
      if (!effectiveTenantId) {
        auditDoc.$locals = { skipTenantIsolation: true };
      }
      await auditDoc.save();
    } catch (_) {}

    res.json({
      success: true,
      message: `User ${targetUser.email || targetUser.name} ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: { _id: targetUser._id, isActive: targetUser.isActive },
    });
  } catch (err) {
    logger.error('SuperAdmin toggle status error:', err);
    res.status(500).json({ success: false, error: 'Failed to change user status' });
  }
});

// ── 3. GET /api/superadmin/users/:userId/permissions — Get effective user permissions ──
router.get('/users/:userId/permissions', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const user = await User.findOne({ _id: userId, ...tenantFilter }).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Role default permissions scoped to tenant if present
    const permFilter = user.tenantId ? { tenantId: user.tenantId, role: user.role } : { role: user.role };
    const rolePermission = await Permission.findOne(permFilter).lean() || {};
    const custom = user.customPermissions || {};

    // Merge: role defaults overridden by ID-based custom permissions
    const merged = { ...rolePermission };
    delete merged._id;
    delete merged.__v;

    for (const [key, val] of Object.entries(custom)) {
      merged[key] = val;
    }

    res.json({
      success: true,
      userId: user._id,
      role: user.role,
      roleDefaults: rolePermission,
      customPermissions: custom,
      effectivePermissions: merged,
    });
  } catch (err) {
    logger.error('SuperAdmin get user permissions error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch user permissions' });
  }
});

// ── 4. PATCH /api/superadmin/users/permissions — Per-User ID-based Custom Permissions ──
// Supports single user ({ userId: "..." }) OR multi-user array ({ userIds: ["...", "..."] })
router.patch('/users/permissions', superAuth, async (req, res) => {
  try {
    const { userId, userIds, permissions } = req.body;
    const targetIds = userIds || (userId ? [userId] : []);

    if (!targetIds.length) {
      return res.status(400).json({ success: false, error: 'userId or userIds array is required' });
    }

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, error: 'permissions object is required' });
    }

    // HARD LOCKED fields can never be overridden
    const HARD_LOCKED = ['canEditStock', 'canDeleteStock', 'canManageAdmins'];
    const sanitized = {};

    for (const [key, val] of Object.entries(permissions)) {
      if (HARD_LOCKED.includes(key)) continue;
      if (typeof val === 'boolean') {
        sanitized[key] = val;
      }
    }

    // Apply custom permissions map to each selected user ID
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const users = await User.find({ _id: { $in: targetIds }, ...tenantFilter });
    for (const u of users) {
      const currentMap = u.customPermissions || new Map();
      for (const [key, val] of Object.entries(sanitized)) {
        currentMap.set(key, val);
      }
      u.customPermissions = currentMap;
      u.markModified('customPermissions');
      await u.save({ validateModifiedOnly: true });
    }

    // Audit Log
    try {
      const effectiveTenantId = req.tenantId || users[0]?.tenantId;
      const auditDoc = new AuditLog({
        action: 'CUSTOM_PERMISSIONS_UPDATE',
        performedBy: req.userId,
        targetUsers: targetIds,
        changes: sanitized,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
      });
      if (!effectiveTenantId) {
        auditDoc.$locals = { skipTenantIsolation: true };
      }
      await auditDoc.save();
    } catch (_) {}

    res.json({
      success: true,
      message: `Updated custom permissions for ${users.length} user(s)`,
      updatedUserIds: targetIds,
      appliedPermissions: sanitized,
    });
  } catch (err) {
    logger.error('SuperAdmin set custom permissions error:', err);
    res.status(500).json({ success: false, error: 'Failed to update user permissions' });
  }
});

// ── 5. GET /api/superadmin/active-sessions — Active Logged-In Sessions Monitor ──
router.get('/active-sessions', superAuth, async (req, res) => {
  try {
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin
      ? (req.query.tenantId ? { tenantId: req.query.tenantId } : {})
      : { tenantId: req.tenantId };

    const activeUsers = await User.find({
      isActive: true,
      isDeleted: { $ne: true },
      lastLogin: { $ne: null },
      ...tenantFilter
    })
      .select('name email role isSuperAdmin lastLogin tokenVersion')
      .sort({ lastLogin: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      activeCount: activeUsers.length,
      sessions: activeUsers,
    });
  } catch (err) {
    logger.error('SuperAdmin active sessions error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch active sessions' });
  }
});

// ── 6. POST /api/superadmin/revoke-session/:userId — Instantly revoke session ──
router.post('/revoke-session/:userId', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const user = await User.findOne({ _id: userId, ...tenantFilter });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ validateModifiedOnly: true });

    res.json({
      success: true,
      message: `Session revoked for ${user.email || user.name}`,
    });
  } catch (err) {
    logger.error('SuperAdmin revoke session error:', err);
    res.status(500).json({ success: false, error: 'Failed to revoke session' });
  }
});

module.exports = router;
