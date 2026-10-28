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
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Permission = require('../models/permission');
const AuditLog = require('../models/AuditLog');
const Warehouse = require('../models/Warehouse');
const StockTransfer = require('../models/StockTransfer');
const PurchaseOrder = require('../models/PurchaseOrder');
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

// ── 7. POST /api/superadmin/users/:userId/reset-permissions ──
router.post('/users/:userId/reset-permissions', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const user = await User.findOne({ _id: userId, ...tenantFilter });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.customPermissions = new Map();
    user.markModified('customPermissions');
    await user.save({ validateModifiedOnly: true });

    res.json({
      success: true,
      message: `Reset permissions for ${user.email || user.name} back to role defaults`,
    });
  } catch (err) {
    logger.error('SuperAdmin reset permissions error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset permissions' });
  }
});

// ── 8. POST /api/superadmin/users/:userId/force-password-reset ──
router.post('/users/:userId/force-password-reset', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const user = await User.findOne({ _id: userId, ...tenantFilter });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.forcePasswordReset = true;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ validateModifiedOnly: true });

    res.json({
      success: true,
      message: `User ${user.email || user.name} will be prompted to reset password on next login`,
    });
  } catch (err) {
    logger.error('SuperAdmin force password reset error:', err);
    res.status(500).json({ success: false, error: 'Failed to force password reset' });
  }
});

// ── 9. POST /api/superadmin/users/:userId/reset-2fa ──
router.post('/users/:userId/reset-2fa', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const user = await User.findOne({ _id: userId, ...tenantFilter });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.twoFactorEnabled = false;
    user.twoFactorSecretEncrypted = null;
    user.twoFactorPendingSecretEncrypted = null;
    user.twoFactorRecoveryCodes = [];
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ validateModifiedOnly: true });

    res.json({
      success: true,
      message: `2FA disabled and reset for ${user.email || user.name}`,
    });
  } catch (err) {
    logger.error('SuperAdmin reset 2fa error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset 2FA' });
  }
});

// ── 10. POST /api/superadmin/impersonate/exit — Exit Shadow Session (Static route must precede :userId) ──
router.post('/impersonate/exit', requireAuth, async (req, res) => {
  try {
    const backupToken = req.cookies?.originalAdminToken;
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    };

    if (backupToken) {
      try {
        const decoded = jwt.verify(backupToken, process.env.JWT_SECRET);
        res.cookie('authToken', backupToken, {
          ...cookieOpts,
          maxAge: 15 * 60 * 1000 // 15 mins (standard access token)
        });
        res.clearCookie('originalAdminToken', cookieOpts);

        // Audit Log
        try {
          const auditDoc = new AuditLog({
            action: 'IMPERSONATION_ENDED',
            performedBy: decoded._id || req.impersonator?.id || req.userId,
            targetUser: req.userId,
            details: { message: 'SuperAdmin exited shadow session' },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            ...(req.tenantId ? { tenantId: req.tenantId } : {})
          });
          if (!req.tenantId) {
            auditDoc.$locals = { skipTenantIsolation: true };
          }
          await auditDoc.save();
        } catch (_) {}

        return res.json({
          success: true,
          message: 'Exited shadow session successfully',
          role: 'SUPER_ADMIN'
        });
      } catch (tokenErr) {
        logger.warn('Original admin token invalid or expired on exit:', tokenErr);
      }
    }

    // If no valid backup token, verify if caller has SuperAdmin or fallback
    if (req.user && req.user.role === 'SUPER_ADMIN') {
      res.clearCookie('originalAdminToken', cookieOpts);
      return res.json({
        success: true,
        message: 'Exited impersonation mode',
        role: 'SUPER_ADMIN'
      });
    }

    return res.status(400).json({
      success: false,
      error: 'No active shadow session found to restore'
    });
  } catch (err) {
    logger.error('SuperAdmin exit shadow session error:', err);
    res.status(500).json({ success: false, error: 'Failed to exit shadow session' });
  }
});

// ── 11. POST /api/superadmin/impersonate/:userId — SuperAdmin View As / Shadow Session ──
router.post('/impersonate/:userId', [requireAuth, requireRole(['SUPER_ADMIN'])], async (req, res) => {
  try {
    const { userId } = req.params;
    const { mode = 'FULL' } = req.body;
    const selectedMode = mode === 'READ_ONLY' ? 'READ_ONLY' : 'FULL';

    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.isDeleted) {
      return res.status(404).json({ success: false, error: 'User not found or deleted' });
    }

    if (!targetUser.isActive || targetUser.employmentStatus === 'TERMINATED') {
      return res.status(400).json({ success: false, error: 'Cannot impersonate an inactive or terminated user' });
    }

    if (targetUser.role === 'SUPER_ADMIN' && targetUser._id.toString() !== req.userId.toString()) {
      return res.status(403).json({ success: false, error: 'Cannot impersonate another Super Admin' });
    }

    // Save current SuperAdmin access token into backup cookie if not already set
    const currentToken = req.cookies?.authToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    };

    if (!req.cookies?.originalAdminToken && currentToken) {
      res.cookie('originalAdminToken', currentToken, {
        ...cookieOpts,
        maxAge: 4 * 60 * 60 * 1000 // 4 hours
      });
    }

    // Issue Delegated Impersonation JWT
    const impersonationToken = jwt.sign({
      _id: targetUser._id,
      role: targetUser.role,
      tokenVersion: targetUser.tokenVersion,
      tenantId: targetUser.tenantId || req.tenantId,
      isImpersonated: true,
      impersonationMode: selectedMode,
      originalUserId: req.userId,
      originalRole: req.userRole,
      type: 'access'
    }, process.env.JWT_SECRET, {
      expiresIn: '2h'
    });

    res.cookie('authToken', impersonationToken, {
      ...cookieOpts,
      maxAge: 2 * 60 * 60 * 1000 // 2 hours
    });

    // Enterprise Audit Log
    try {
      const effectiveTenantId = targetUser.tenantId || req.tenantId;
      const auditDoc = new AuditLog({
        action: 'IMPERSONATION_STARTED',
        performedBy: req.userId,
        targetUser: targetUser._id,
        isImpersonated: true,
        impersonatorId: req.userId,
        details: {
          mode: selectedMode,
          targetRole: targetUser.role,
          targetName: targetUser.name,
          targetEmail: targetUser.email,
          impersonatorRole: req.userRole
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {})
      });
      if (!effectiveTenantId) {
        auditDoc.$locals = { skipTenantIsolation: true };
      }
      await auditDoc.save();
    } catch (auditErr) {
      logger.warn('Failed to save impersonation audit log:', auditErr);
    }

    res.json({
      success: true,
      message: `Now viewing as ${targetUser.name} (${targetUser.role}) in ${selectedMode} mode`,
      token: impersonationToken,
      targetUser: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role
      },
      mode: selectedMode
    });
  } catch (err) {
    logger.error('SuperAdmin impersonate error:', err);
    res.status(500).json({ success: false, error: 'Failed to start shadow session' });
  }
});

// ── 12. GET /api/superadmin/users/:userId/offboarding-impact — Pre-Offboarding Impact Analysis ──
router.get('/users/:userId/offboarding-impact', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const targetUser = await User.findOne({ _id: userId, ...tenantFilter }).select('name email role isActive employmentStatus assignedWarehouseId tenantId').lean();
    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    // Managed Warehouses
    const warehouses = await Warehouse.find({
      $or: [{ managerId: userId }, { _id: targetUser.assignedWarehouseId }],
      isDeleted: { $ne: true }
    }).select('name code managerId').lean();

    // Open Stock Transfers
    const pendingTransfers = await StockTransfer.countDocuments({
      requestedBy: userId,
      status: { $in: ['PENDING', 'DRAFT', 'IN_TRANSIT'] }
    });

    // Open Purchase Orders
    const pendingPOs = await PurchaseOrder.countDocuments({
      createdBy: userId,
      status: { $in: ['DRAFT', 'ORDERED'] }
    });

    // Potential Reassignment Custodians (Active Admins or Managers in same tenant)
    const eligibleCustodians = await User.find({
      _id: { $ne: userId },
      role: { $in: ['ADMIN', 'MANAGER'] },
      isActive: true,
      isDeleted: { $ne: true },
      ...(targetUser.tenantId ? { tenantId: targetUser.tenantId } : {})
    }).select('name email role').lean();

    res.json({
      success: true,
      impact: {
        user: targetUser,
        warehouses,
        pendingTransfersCount: pendingTransfers,
        pendingPOsCount: pendingPOs,
        eligibleCustodians
      }
    });
  } catch (err) {
    logger.error('SuperAdmin offboarding impact error:', err);
    res.status(500).json({ success: false, error: 'Failed to assess offboarding impact' });
  }
});

// ── 13. POST /api/superadmin/users/:userId/offboard — Enterprise Offboarding & Revocation ──
router.post('/users/:userId/offboard', superAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reassignToUserId, reason = 'RESIGNATION' } = req.body;

    if (req.userId.toString() === userId) {
      return res.status(400).json({ success: false, error: 'Self-offboarding is prohibited' });
    }

    const isSuperAdmin = req.user && req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !req.tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };
    const targetUser = await User.findOne({ _id: userId, ...tenantFilter });
    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Super Admin accounts cannot be offboarded' });
    }

    // Verify and execute workload reassignment if a replacement custodian was provided
    let reassignee = null;
    if (reassignToUserId) {
      reassignee = await User.findOne({ _id: reassignToUserId, isActive: true, isDeleted: { $ne: true } });
      if (reassignee) {
        // Reassign warehouse management
        await Warehouse.updateMany({ managerId: targetUser._id }, { managerId: reassignee._id });
        // Reassign pending stock transfers
        await StockTransfer.updateMany(
          { requestedBy: targetUser._id, status: { $in: ['PENDING', 'DRAFT'] } },
          { requestedBy: reassignee._id }
        );
        // Reassign pending purchase orders
        await PurchaseOrder.updateMany(
          { createdBy: targetUser._id, status: { $in: ['DRAFT', 'ORDERED'] } },
          { createdBy: reassignee._id }
        );
      }
    }

    // Terminate user and bump tokenVersion to instantly kill all active sessions/cookies
    targetUser.isActive = false;
    targetUser.employmentStatus = 'TERMINATED';
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    targetUser.assignedWarehouseId = null;
    targetUser.offboardedAt = new Date();
    targetUser.offboardedBy = req.userId;
    targetUser.offboardingReason = reason;
    await targetUser.save({ validateModifiedOnly: true });

    // Enterprise Audit Log
    try {
      const effectiveTenantId = targetUser.tenantId || req.tenantId;
      const auditDoc = new AuditLog({
        action: 'EMPLOYEE_OFFBOARDED',
        performedBy: req.userId,
        targetUser: targetUser._id,
        details: {
          userName: targetUser.name,
          userEmail: targetUser.email,
          userRole: targetUser.role,
          reason,
          reassignedTo: reassignee ? { id: reassignee._id, name: reassignee.name, role: reassignee.role } : null,
          offboardedAt: targetUser.offboardedAt
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {})
      });
      if (!effectiveTenantId) {
        auditDoc.$locals = { skipTenantIsolation: true };
      }
      await auditDoc.save();
    } catch (auditErr) {
      logger.warn('Failed to save offboarding audit log:', auditErr);
    }

    res.json({
      success: true,
      message: `Successfully offboarded ${targetUser.name} and revoked all active sessions.`,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        employmentStatus: targetUser.employmentStatus,
        isActive: targetUser.isActive
      }
    });
  } catch (err) {
    logger.error('SuperAdmin offboard user error:', err);
    res.status(500).json({ success: false, error: 'Failed to offboard user' });
  }
});

module.exports = router;
