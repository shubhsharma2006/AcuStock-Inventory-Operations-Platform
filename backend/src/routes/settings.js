const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');
const { invalidatePermissionCache } = require('../middleware/requirePermission');
const ProductionPolicy = require('../models/ProductionPolicy');
const Permission = require('../models/permission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const Tenant = require('../models/Tenant');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

router.use(requireTenantId);
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendPasswordResetByAdminEmail } = require('../services/email.service');

// Helper to generate temporary password
const generateTempPassword = () => {
  // Cryptographically secure random password using Node's crypto module.
  // charset = 62 alphanumeric + 8 symbols = 70 chars
  // 12 random chars → 70^12 ≈ 4.7×10²¹ combinations vs old Math.random (22,500)
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*?';
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes)
    .map(b => charset[b % charset.length])
    .join('');
};

// ============================================================
// PRODUCT SERIAL POLICY ROUTES
// ============================================================

/**
 * GET /api/settings/serial-policies
 * Get all product serial policies
 */
router.get('/serial-policies', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const policies = await ProductionPolicy.find({ tenantId: req.tenantId })
      .populate('productId', 'name shortName')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ updatedAt: -1 });
    res.json(policies);
  } catch (err) {
    logger.error('Error fetching serial policies:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch serial policies' });
  }
});

/**
 * GET /api/settings/serial-policies/:productId
 * Get serial policy for a specific product
 */
router.get('/serial-policies/:productId', requireAuth, async (req, res) => {
  try {
    const policy = await ProductionPolicy.findOne({ 
      productId: req.params.productId,
      tenantId: req.tenantId
    })
      .populate('productId', 'name shortName')
      .populate('updatedBy', 'name');
    
    if (!policy) {
      // Return default policy if none exists
      return res.json({
        productId: req.params.productId,
        serialEnabled: false,
        requireSerialIn: false,
        requireSerialOut: false,
        locked: false
      });
    }
    
    res.json(policy);
  } catch (err) {
    logger.error('Error fetching serial policy:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch serial policy' });
  }
});

/**
 * POST /api/settings/serial-policies
 * Create or update serial policy for a product
 */
router.post('/serial-policies', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { productId, serialEnabled, requireSerialIn, requireSerialOut } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'Product is required' });
    }

    // ── 1. Update / create ProductionPolicy (UI display record) ──────────────
    let policy = await ProductionPolicy.findOne({ 
      productId,
      tenantId: req.tenantId
    });

    if (policy) {
      if (policy.locked) {
        return res.status(400).json({
          message: 'Policy is locked. Cannot modify after stock movement has occurred.',
          code: 'POLICY_LOCKED'
        });
      }
      policy.serialEnabled    = serialEnabled;
      policy.requireSerialIn  = requireSerialIn;
      policy.requireSerialOut = requireSerialOut;
      policy.updatedBy        = req.userId;
      await policy.save();
    } else {
      policy = await ProductionPolicy.create({
        productId,
        serialEnabled,
        requireSerialIn,
        requireSerialOut,
        createdBy: req.userId,
        updatedBy: req.userId,
        tenantId:  req.tenantId
      });
    }

    // ── 2. Sync into Item.serialPolicy — SINGLE SOURCE OF TRUTH for stock ops ─
    const Item = require('../models/Item');
    await Item.findOneAndUpdate(
      { _id: productId, tenantId: req.tenantId },
      {
        'serialPolicy.enableSerial':      !!serialEnabled,
        'serialPolicy.requireSerialOnIN':  !!requireSerialIn,
        'serialPolicy.requireSerialOnOUT': !!requireSerialOut
      }
    );

    const populated = await ProductionPolicy.findOne({ _id: policy._id, tenantId: req.tenantId })
      .populate('productId', 'name shortName');

    logBusinessEvent({
      req,
      action: 'SETTING_CHANGED',
      entityType: 'Item',
      entityId: productId,
      changes: {
        after: {
          serialEnabled: !!serialEnabled,
          requireSerialIn: !!requireSerialIn,
          requireSerialOut: !!requireSerialOut
        },
        summary: `Updated serial policy for item ${populated?.productId?.name || productId}`
      }
    }).catch(() => {});

    res.json({
      message: 'Serial policy saved successfully',
      policy: populated
    });
  } catch (err) {
    logger.error('Error saving serial policy:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to save serial policy' });
  }
});

// ============================================================
// ROLE PERMISSION ROUTES
// ============================================================

/**
 * GET /api/settings/permissions
 * Get all role permissions
 */
router.get('/permissions', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const permissions = await Permission.find({ tenantId: req.tenantId }).sort({ role: 1 });
    res.json(permissions);
  } catch (err) {
    logger.error('Error fetching permissions:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch permissions' });
  }
});

/**
 * GET /api/settings/permissions/:role
 * Get permissions for a specific role
 * ADMIN can fetch any role, MANAGER/USER can fetch their own role only
 */
router.get('/permissions/:role', requireAuth, async (req, res) => {
  try {
    const role = req.params.role.toUpperCase();

    if (!['ADMIN', 'MANAGER', 'USER'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // SUPER_ADMIN and ADMIN can fetch any role's permissions
    // Non-admin users can only fetch their own role permissions
    const isAdminLevel = req.userRole === 'ADMIN' || req.userRole === 'SUPER_ADMIN';
    if (!isAdminLevel && req.userRole !== role) {
      console.log(`[Permissions] Access denied: userRole=${req.userRole}, requested=${role}`);
      return res.status(403).json({ message: 'Can only view your own role permissions' });
    }
    
    let permission = await Permission.findOne({ role, tenantId: req.tenantId });
    
    if (!permission) {
      // Create default permissions if not exists
      permission = await Permission.create({
        role,
        tenantId: req.tenantId,
        canManageAdmins: role === 'ADMIN',
        canManageManagers: role === 'ADMIN',
        canManageUsers: role === 'ADMIN' || role === 'MANAGER',
        canAddProduct: role !== 'USER',
        canEditProduct: role !== 'USER',
        canDeactivateProduct: role === 'ADMIN',
        canAddCompany: role !== 'USER',
        canEditCompany: role !== 'USER',
        canStockIn: true,
        canStockOut: true,
        canEditStock: false,
        canDeleteStock: false,
        canViewAllReports: role !== 'USER',
        canViewOwnReports: true,
        createdBy: req.userId
      });
    }
    
    res.json(permission);
  } catch (err) {
    logger.error('Error fetching role permissions:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch role permissions' });
  }
});

/**
 * PUT /api/settings/permissions/:role
 * Update permissions for a specific role
 */
router.put('/permissions/:role', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const role = req.params.role.toUpperCase();
    if (!['MANAGER', 'USER'].includes(role)) {
      return res.status(400).json({ message: 'Cannot modify ADMIN permissions' });
    }
    
    const allowedFields = [
      'canAddProduct', 'canEditProduct', 'canDeactivateProduct',
      'canAddCompany', 'canEditCompany', 'canManageCompanies',
      'canStockIn', 'canStockOut', 'canEditStock', 'canViewStockLedger',
      'canViewAllReports', 'canViewOwnReports',
      'canManageUsers',
      'canAddLogistics', 'canEditLogistics', 'canDeleteLogistics'
    ];
    
    const updates = {};
    allowedFields.forEach(field => {
      if (typeof req.body[field] === 'boolean') {
        updates[field] = req.body[field];
      }
    });
    
    updates.updatedBy = req.userId;
    
    // Security: Never allow these for non-admin (ledger immutability)
    if (role !== 'ADMIN') {
      updates.canDeleteStock = false; // Ledger immutability
      updates.canManageAdmins = false;
    }
    if (role === 'USER') {
      updates.canManageManagers = false;
      updates.canManageUsers = false;
    }
    
    const permission = await Permission.findOneAndUpdate(
      { role, tenantId: req.tenantId },
      { $set: updates },
      { new: true, upsert: true }
    );
    invalidatePermissionCache(req.tenantId, null, role);
    
    res.json({ 
      message: `${role} permissions updated successfully`,
      permission 
    });
  } catch (err) {
    logger.error('Error updating permissions:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to update permissions' });
  }
});

// ============================================================
// ACCOUNT LIFECYCLE ROUTES
// ============================================================

/**
 * PUT /api/settings/users/:id/status
 * Activate or deactivate a user account
 */
router.put('/users/:id/status', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }
    
    const user = await User.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent deactivating own account
    if (user._id.toString() === req.userId.toString() && !isActive) {
      return res.status(400).json({ message: 'Cannot deactivate your own account' });
    }
    
    // Prevent deactivating other admins — only SUPER_ADMIN can modify admin accounts
    if (user.role === 'ADMIN' && user._id.toString() !== req.userId.toString() && req.userRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Cannot modify other admin accounts' });
    }
    
    user.isActive = isActive;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate existing tokens
    await user.save();
    
    res.json({ 
      message: `Account ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: { _id: user._id, name: user.name, isActive: user.isActive }
    });
  } catch (err) {
    logger.error('Error updating user status:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

/**
 * DELETE /api/settings/users/:id
 * Delete a user account (Admin only) - Soft delete
 */
router.delete('/users/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const user = await User.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent deleting own account
    if (user._id.toString() === req.userId.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    // Prevent deleting admin accounts — only SUPER_ADMIN can delete admins
    if (user.role === 'ADMIN' && req.userRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Cannot delete admin accounts' });
    }
    
    // Soft delete: mark as deleted instead of removing from database
    user.isActive = false;
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = req.userId;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate existing tokens
    await user.save();
    
    res.json({ 
      message: `User "${user.name}" deleted successfully`,
      userId: user._id
    });
  } catch (err) {
    logger.error('Error deleting user:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

/**
 * POST /api/settings/users/:id/reset-password
 * Reset user password (Admin/Manager)
 * Admin can reset any user/manager password
 * Manager can only reset user passwords
 */
router.post('/users/:id/reset-password', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { newPassword, generateTemporary = false } = req.body;
    
    const user = await User.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Manager can only reset USER passwords, not other managers
    if (req.userRole === 'MANAGER' && user.role !== 'USER') {
      return res.status(403).json({ 
        message: 'Managers can only reset passwords for users, not other managers or admins' 
      });
    }
    
    // Cannot reset admin passwords
    if (user.role === 'ADMIN') {
      return res.status(403).json({ 
        message: 'Admin passwords cannot be reset by others. Admin must use forgot password.' 
      });
    }
    
    // Generate or use provided password
    let passwordToSet = newPassword;
    let isTemporary = generateTemporary;
    
    if (generateTemporary || !newPassword) {
      passwordToSet = generateTempPassword();
      isTemporary = true;
    }
    
    if (passwordToSet.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(passwordToSet, salt);
    user.passwordChangedAt = new Date();
    user.passwordChangedBy = req.userRole; // 'ADMIN' or 'MANAGER'
    user.forcePasswordReset = true; // Force user to change password on next login
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate existing tokens
    user.failedLoginAttempts = 0;
    await user.save();
    
    // Log audit event
    await AuditLog.logPasswordReset(user, req.user, req);
    
    // Create notification for admin
    await Notification.create({
      type: 'system',
      icon: '🔐',
      title: 'Password Reset',
      message: `${req.user.name} (${req.userRole}) reset password for ${user.name}`,
      targetRole: 'ADMIN',
      tenantId: req.tenantId,
      metadata: {
        targetUserId: user._id,
        targetUserName: user.name,
        resetBy: req.user._id,
        resetByName: req.user.name
      }
    });
    
    // Return response — temporary password is NEVER included in the API response.
    // It is delivered exclusively via email to prevent it appearing in proxy/Morgan logs.
    const response = { 
      message: isTemporary
        ? 'Password reset successfully. A temporary password has been sent to the user\'s email. User must change it on next login.'
        : 'Password reset successfully. User must change password on next login.',
      userId: user._id,
      forcePasswordReset: true,
      emailSent: !!user.email
    };

    // Send email notification if user has an email address
    if (user.email) {
      sendPasswordResetByAdminEmail({
        to: user.email,
        name: user.name,
        resetByName: req.user.name,
        resetByRole: req.userRole,
        temporaryPassword: isTemporary ? passwordToSet : '(custom password set by admin)'
      }).catch(err => console.error('[Email] Failed to notify user of password reset:', err.message));
    }
    
    res.json(response);
  } catch (err) {
    logger.error('Error resetting password:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

/**
 * POST /api/settings/users/:id/force-logout
 * Force logout user by invalidating all tokens
 */
router.post('/users/:id/force-logout', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const user = await User.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Increment token version to invalidate all existing tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    
    // Log audit event
    await AuditLog.logEvent({
      action: 'FORCE_LOGOUT',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.userRole,
      targetUser: user._id,
      targetUserName: user.name,
      targetUserRole: user.role,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      tenantId: req.tenantId,
      severity: 'WARNING'
    });
    
    res.json({ 
      message: 'User logged out from all sessions',
      userId: user._id 
    });
  } catch (err) {
    logger.error('Error forcing logout:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to force logout' });
  }
});

/**
 * GET /api/settings/account-stats
 * Get account statistics for admin dashboard
 */
router.get('/account-stats', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const tenantFilter = { tenantId: req.tenantId };

    const [totalUsers, activeUsers, totalManagers, activeManagers] = await Promise.all([
      User.countDocuments({ role: 'USER', ...tenantFilter }),
      User.countDocuments({ role: 'USER', isActive: true, ...tenantFilter }),
      User.countDocuments({ role: 'MANAGER', ...tenantFilter }),
      User.countDocuments({ role: 'MANAGER', isActive: true, ...tenantFilter })
    ]);
    
    res.json({
      users: { total: totalUsers, active: activeUsers, inactive: totalUsers - activeUsers },
      managers: { total: totalManagers, active: activeManagers, inactive: totalManagers - activeManagers }
    });
  } catch (err) {
    logger.error('Error fetching account stats:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch account stats' });
  }
});

// ============================================================
// ADMIN PROFILE ROUTES
// ============================================================

/**
 * GET /api/settings/profile
 * Get current admin profile
 */
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ 
      _id: req.userId,
      tenantId: req.tenantId
    }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    logger.error('Error fetching profile:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/settings/profile
 * Update admin profile
 */
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body;

    const updates = {};

    if (name !== undefined) {
      const trimmedName = name.trim().slice(0, 100);
      if (!trimmedName) return res.status(400).json({ message: 'Name cannot be empty' });
      updates.name = trimmedName;
    }

    if (email !== undefined) {
      const trimmedEmail = email.toLowerCase().trim();
      // Basic RFC-5322-lite format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      // Uniqueness check — exclude the current user's own document
      const conflict = await User.findOne({ 
        email: trimmedEmail, 
        _id: { $ne: req.userId },
        tenantId: req.tenantId
      });
      if (conflict) {
        return res.status(409).json({ message: 'Email is already in use by another account' });
      }
      updates.email = trimmedEmail;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided to update' });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.userId, tenantId: req.tenantId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ message: 'Profile updated', user });
  } catch (err) {
    logger.error('Error updating profile:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

/**
 * PUT /api/settings/profile/password
 * Change own password
 */
router.put('/profile/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }
    
    const user = await User.findOne({ 
      _id: req.userId,
      tenantId: req.tenantId
    }).select('+password');
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(newPassword, salt);
    user.passwordChangedAt = new Date();
    user.passwordChangedBy = 'SELF';
    user.forcePasswordReset = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate other sessions
    await user.save();
    
    // Log audit event
    await AuditLog.logPasswordChange(user, user, 'SELF', req);
    
    // Notify admin
    await Notification.create({
      type: 'system',
      icon: '🔑',
      title: 'Password Changed',
      message: `${user.name} (${user.role}) changed their own password`,
      targetRole: 'ADMIN',
      tenantId: req.tenantId,
      metadata: {
        userId: user._id,
        userName: user.name,
        changedBy: 'SELF'
      }
    });
    
    res.json({ message: 'Password changed successfully. Please login again.' });
  } catch (err) {
    logger.error('Error changing password:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// ============================================================
// PASSWORD METADATA ROUTES (Admin Dashboard visibility)
// ============================================================

/**
 * GET /api/settings/users/:id/password-info
 * Get password metadata for a user (NOT the actual password)
 * Returns: last changed date, changed by whom, reset required status
 */
router.get('/users/:id/password-info', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const user = await User.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    }).select(
      'name email phone role passwordChangedAt passwordChangedBy forcePasswordReset failedLoginAttempts isActive'
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Manager can only view USER password info
    if (req.userRole === 'MANAGER' && user.role !== 'USER') {
      return res.status(403).json({ message: 'Managers can only view user password info' });
    }
    
    res.json({
      userId: user._id,
      name: user.name,
      identifier: user.email || user.phone,
      role: user.role,
      isActive: user.isActive,
      passwordChangedAt: user.passwordChangedAt,
      passwordChangedBy: user.passwordChangedBy,
      forcePasswordReset: user.forcePasswordReset || false,
      failedLoginAttempts: user.failedLoginAttempts || 0
    });
  } catch (err) {
    logger.error('Error fetching password info:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch password info' });
  }
});

/**
 * POST /api/settings/users/:id/reset-failed-attempts
 * Reset failed login attempts counter for a user
 */
router.post('/users/:id/reset-failed-attempts', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const user = await User.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.failedLoginAttempts = 0;
    await user.save();
    
    // Log audit event
    await AuditLog.logEvent({
      action: 'FAILED_ATTEMPTS_RESET',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.userRole,
      targetUser: user._id,
      targetUserName: user.name,
      targetUserRole: user.role,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      tenantId: req.tenantId,
      severity: 'INFO'
    });
    
    res.json({ 
      message: 'Failed attempts reset successfully',
      userId: user._id 
    });
  } catch (err) {
    logger.error('Error resetting failed attempts:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to reset failed attempts' });
  }
});

/**
 * GET /api/settings/users/password-summary
 * Get password status summary for all users (Admin dashboard)
 */
router.get('/users/password-summary', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const users = await User.find({ 
      role: { $in: ['MANAGER', 'USER'] }, 
      isActive: true,
      tenantId: req.tenantId
    })
      .select('name email phone role passwordChangedAt passwordChangedBy forcePasswordReset failedLoginAttempts')
      .sort({ role: 1, name: 1 });
    
    const summary = users.map(user => ({
      userId: user._id,
      name: user.name,
      identifier: user.email || user.phone,
      role: user.role,
      passwordChangedAt: user.passwordChangedAt,
      passwordChangedBy: user.passwordChangedBy || 'SYSTEM',
      forcePasswordReset: user.forcePasswordReset || false,
      failedAttempts: user.failedLoginAttempts || 0
    }));
    
    // Calculate stats
    const stats = {
      total: summary.length,
      forceResetRequired: summary.filter(u => u.forcePasswordReset).length,
      changedBySelf: summary.filter(u => u.passwordChangedBy === 'SELF').length,
      changedByAdmin: summary.filter(u => u.passwordChangedBy === 'ADMIN').length,
      changedByManager: summary.filter(u => u.passwordChangedBy === 'MANAGER').length
    };
    
    res.json({ users: summary, stats });
  } catch (err) {
    logger.error('Error fetching password summary:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch password summary' });
  }
});

// ============================================================
// ORGANIZATION & TENANT SETTINGS ROUTES
// ============================================================

/**
 * GET /api/settings/organization
 * Fetch organization profile, inventory preferences, document prefixes, and alerts
 */
router.get('/organization', requireAuth, async (req, res) => {
  try {
    let tenant = await Tenant.findById(req.tenantId).populate('settings.defaultWarehouseId', 'name code');
    if (!tenant) {
      tenant = await Tenant.create({
        _id: req.tenantId,
        name: 'AcuStock Enterprise',
        slug: `tenant-${req.tenantId.toString().slice(-6)}`,
        plan: 'enterprise',
        status: 'ACTIVE',
        settings: {
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          dateFormat: 'DD/MM/YYYY',
          valuationMethod: 'FIFO',
          negativeStockAllowed: false,
          lowStockAlertThreshold: 10,
          invoicePrefix: 'INV-2026-',
          poPrefix: 'PO-2026-',
          transferPrefix: 'TRF-',
          grnPrefix: 'GRN-',
          whatsappAlertsEnabled: false,
          lowStockEmailAlerts: true,
          dailyDigestEnabled: false
        },
        branding: {
          legalName: 'AcuStock Technologies Pvt. Ltd.',
          taxId: '27AABCU9603R1ZM',
          supportEmail: 'operations@acustock.com',
          phone: '+91 98765 43210',
          website: 'https://acustock.com',
          address: {
            street: 'Unit 402, Business Bay, Central Hub',
            city: 'Mumbai',
            state: 'Maharashtra',
            zipCode: '400051',
            country: 'India'
          },
          invoiceTerms: 'Payment due within 30 days of invoice receipt. Standard GST rules apply.'
        }
      });
    }

    res.json(tenant);
  } catch (err) {
    logger.error('Error fetching organization settings:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch organization settings' });
  }
});

/**
 * PUT /api/settings/organization
 * Update organization profile, inventory preferences, prefixes, and alert configuration
 */
router.put('/organization', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { name, branding, settings } = req.body;

    const updates = {};
    if (name && typeof name === 'string') {
      updates.name = name.trim();
    }

    if (branding && typeof branding === 'object') {
      updates.branding = {
        legalName: branding.legalName !== undefined ? String(branding.legalName).trim() : undefined,
        taxId: branding.taxId !== undefined ? String(branding.taxId).trim() : undefined,
        supportEmail: branding.supportEmail !== undefined ? String(branding.supportEmail).trim() : undefined,
        phone: branding.phone !== undefined ? String(branding.phone).trim() : undefined,
        website: branding.website !== undefined ? String(branding.website).trim() : undefined,
        logoUrl: branding.logoUrl !== undefined ? String(branding.logoUrl).trim() : undefined,
        invoiceTerms: branding.invoiceTerms !== undefined ? String(branding.invoiceTerms).trim() : undefined,
        address: branding.address ? {
          street: branding.address.street || '',
          city: branding.address.city || '',
          state: branding.address.state || '',
          zipCode: branding.address.zipCode || '',
          country: branding.address.country || 'India'
        } : undefined
      };
      // Clean undefined keys
      Object.keys(updates.branding).forEach(k => updates.branding[k] === undefined && delete updates.branding[k]);
    }

    if (settings && typeof settings === 'object') {
      updates.settings = {
        timezone: settings.timezone || 'Asia/Kolkata',
        currency: settings.currency || 'INR',
        dateFormat: settings.dateFormat || 'DD/MM/YYYY',
        valuationMethod: ['FIFO', 'WEIGHTED_AVG'].includes(settings.valuationMethod) ? settings.valuationMethod : 'FIFO',
        negativeStockAllowed: typeof settings.negativeStockAllowed === 'boolean' ? settings.negativeStockAllowed : false,
        lowStockAlertThreshold: Number.isFinite(Number(settings.lowStockAlertThreshold)) ? Number(settings.lowStockAlertThreshold) : 10,
        invoicePrefix: settings.invoicePrefix || 'INV-2026-',
        poPrefix: settings.poPrefix || 'PO-2026-',
        transferPrefix: settings.transferPrefix || 'TRF-',
        grnPrefix: settings.grnPrefix || 'GRN-',
        whatsappAlertsEnabled: typeof settings.whatsappAlertsEnabled === 'boolean' ? settings.whatsappAlertsEnabled : false,
        lowStockEmailAlerts: typeof settings.lowStockEmailAlerts === 'boolean' ? settings.lowStockEmailAlerts : true,
        dailyDigestEnabled: typeof settings.dailyDigestEnabled === 'boolean' ? settings.dailyDigestEnabled : false
      };
      if (settings.defaultWarehouseId) {
        updates.settings.defaultWarehouseId = settings.defaultWarehouseId;
      }
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $set: updates },
      { new: true, runValidators: true, upsert: true }
    ).populate('settings.defaultWarehouseId', 'name code');

    // Record Immutable Business Audit Event
    logBusinessEvent({
      req,
      action: 'SETTING_CHANGED',
      entityType: 'Tenant',
      entityId: tenant._id,
      changes: {
        after: updates,
        summary: `Updated organization settings and preferences for ${tenant.name}`
      }
    }).catch(err => logger.error('[Audit] Failed to log organization setting update:', { error: err.message }));

    res.json({
      message: 'Organization settings updated successfully',
      tenant
    });
  } catch (err) {
    logger.error('Error updating organization settings:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to update organization settings' });
  }
});

/**
 * GET /api/settings/tracking
 * Fetch current tenant tracking settings and carrier preferences
 */
router.get('/tracking', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId, { settings: 1, name: 1 }).lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    res.json({
      trackingModuleEnabled: Boolean(tenant.settings?.trackingModuleEnabled ?? true),
      trackingEnabled: Boolean(tenant.settings?.trackingEnabled ?? true),
      trackingCarriers: tenant.settings?.trackingCarriers || ['PORTER', 'DELHIVERY', 'DTDC', 'BLUEDART'],
      trackingPollInterval: tenant.settings?.trackingPollInterval || 15
    });
  } catch (err) {
    logger.error('Error fetching tracking settings:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch tracking settings' });
  }
});

/**
 * PUT /api/settings/tracking
 * Update operational tracking preferences (ADMIN / SUPER_ADMIN)
 */
router.put('/tracking', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    if (tenant.settings?.trackingModuleEnabled === false && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Tracking module is not enabled for your organization subscription' });
    }

    const { trackingEnabled, trackingCarriers, trackingPollInterval } = req.body;

    if (typeof trackingEnabled === 'boolean') {
      tenant.settings.trackingEnabled = trackingEnabled;
    }
    if (Array.isArray(trackingCarriers)) {
      tenant.settings.trackingCarriers = trackingCarriers;
    }
    if (typeof trackingPollInterval === 'number' && trackingPollInterval >= 5) {
      tenant.settings.trackingPollInterval = trackingPollInterval;
    }

    await tenant.save();

    logBusinessEvent({
      req,
      action: 'SETTING_CHANGED',
      entityType: 'Tenant',
      entityId: tenant._id,
      changes: {
        after: { trackingEnabled, trackingCarriers, trackingPollInterval },
        summary: `Updated delivery tracking preferences for ${tenant.name}`
      }
    }).catch(err => logger.error('[Audit] Failed to log tracking setting update:', { error: err.message }));

    res.json({
      success: true,
      settings: {
        trackingModuleEnabled: tenant.settings.trackingModuleEnabled,
        trackingEnabled: tenant.settings.trackingEnabled,
        trackingCarriers: tenant.settings.trackingCarriers,
        trackingPollInterval: tenant.settings.trackingPollInterval
      }
    });
  } catch (err) {
    logger.error('Error updating tracking settings:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to update tracking settings' });
  }
});

/**
 * GET /api/settings/whatsapp
 * Fetch tenant WhatsApp notification settings & Meta Cloud API connectivity status
 */
router.get('/whatsapp', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select('settings');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const aiConfig = require('../ai/config/ai.config');
    const isLiveMetaConfigured = Boolean(aiConfig?.whatsapp?.apiToken && aiConfig?.whatsapp?.phoneNumberId);

    res.json({
      whatsappAlertsEnabled: Boolean(tenant.settings?.whatsappAlertsEnabled ?? false),
      lowStockAlertThreshold: tenant.settings?.lowStockAlertThreshold ?? 10,
      lowStockEmailAlerts: Boolean(tenant.settings?.lowStockEmailAlerts ?? true),
      dailyDigestEnabled: Boolean(tenant.settings?.dailyDigestEnabled ?? false),
      isLiveMetaConfigured,
      phoneNumberId: isLiveMetaConfigured ? aiConfig.whatsapp.phoneNumberId : null,
      apiVersion: aiConfig?.whatsapp?.apiVersion || 'v20.0'
    });
  } catch (err) {
    logger.error('Error fetching whatsapp settings:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to fetch WhatsApp settings' });
  }
});

/**
 * PUT /api/settings/whatsapp
 * Update tenant WhatsApp notification settings (ADMIN / SUPER_ADMIN)
 */
router.put('/whatsapp', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const {
      whatsappAlertsEnabled,
      lowStockAlertThreshold,
      lowStockEmailAlerts,
      dailyDigestEnabled
    } = req.body;

    if (typeof whatsappAlertsEnabled === 'boolean') {
      tenant.settings.whatsappAlertsEnabled = whatsappAlertsEnabled;
    }
    if (typeof lowStockAlertThreshold === 'number' && lowStockAlertThreshold >= 0) {
      tenant.settings.lowStockAlertThreshold = lowStockAlertThreshold;
    }
    if (typeof lowStockEmailAlerts === 'boolean') {
      tenant.settings.lowStockEmailAlerts = lowStockEmailAlerts;
    }
    if (typeof dailyDigestEnabled === 'boolean') {
      tenant.settings.dailyDigestEnabled = dailyDigestEnabled;
    }

    await tenant.save();

    logBusinessEvent({
      req,
      action: 'SETTING_CHANGED',
      entityType: 'Tenant',
      entityId: tenant._id,
      changes: {
        after: { whatsappAlertsEnabled, lowStockAlertThreshold, lowStockEmailAlerts, dailyDigestEnabled },
        summary: `Updated WhatsApp alert settings for ${tenant.name}`
      }
    }).catch(err => logger.error('[Audit] Failed to log whatsapp setting update:', { error: err.message }));

    res.json({
      success: true,
      settings: {
        whatsappAlertsEnabled: tenant.settings.whatsappAlertsEnabled,
        lowStockAlertThreshold: tenant.settings.lowStockAlertThreshold,
        lowStockEmailAlerts: tenant.settings.lowStockEmailAlerts,
        dailyDigestEnabled: tenant.settings.dailyDigestEnabled
      }
    });
  } catch (err) {
    logger.error('Error updating whatsapp settings:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to update WhatsApp settings' });
  }
});

module.exports = router;
