const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const ProductionPolicy = require('../models/ProductionPolicy');
const Permission = require('../models/permission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { logBusinessEvent } = require('../utils/auditHelper');
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
    const policies = await ProductionPolicy.find({ ...(req.tenantId ? { tenantId: req.tenantId } : {}) })
      .populate('productId', 'name shortName')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ updatedAt: -1 });
    res.json(policies);
  } catch (err) {
    console.error('Error fetching serial policies:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
    console.error('Error fetching serial policy:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
        tenantId:  req.tenantId || undefined
      });
    }

    // ── 2. Sync into Item.serialPolicy — SINGLE SOURCE OF TRUTH for stock ops ─
    const Item = require('../models/Item');
    await Item.findOneAndUpdate(
      { _id: productId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) },
      {
        'serialPolicy.enableSerial':      !!serialEnabled,
        'serialPolicy.requireSerialOnIN':  !!requireSerialIn,
        'serialPolicy.requireSerialOnOUT': !!requireSerialOut
      }
    );

    const populated = await ProductionPolicy.findOne({ _id: policy._id, ...(req.tenantId ? { tenantId: req.tenantId } : {}) })
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
    console.error('Error saving serial policy:', err);
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
    const permissions = await Permission.find().sort({ role: 1 });
    res.json(permissions);
  } catch (err) {
    console.error('Error fetching permissions:', err);
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
    
    let permission = await Permission.findOne({ role });
    
    if (!permission) {
      // Create default permissions if not exists
      permission = await Permission.create({
        role,
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
    console.error('Error fetching role permissions:', err);
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
      { role },
      { $set: updates },
      { new: true, upsert: true }
    );
    
    res.json({ 
      message: `${role} permissions updated successfully`,
      permission 
    });
  } catch (err) {
    console.error('Error updating permissions:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
    console.error('Error updating user status:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
    console.error('Error deleting user:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
      tenantId: req.tenantId || undefined,
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
    console.error('Error resetting password:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
      tenantId: req.tenantId || undefined,
      severity: 'WARNING'
    });
    
    res.json({ 
      message: 'User logged out from all sessions',
      userId: user._id 
    });
  } catch (err) {
    console.error('Error forcing logout:', err);
    res.status(500).json({ message: 'Failed to force logout' });
  }
});

/**
 * GET /api/settings/account-stats
 * Get account statistics for admin dashboard
 */
router.get('/account-stats', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};

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
    console.error('Error fetching account stats:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
    }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching profile:', err);
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
        ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
      { _id: req.userId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ message: 'Profile updated', user });
  } catch (err) {
    console.error('Error updating profile:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
      tenantId: req.tenantId || undefined,
      metadata: {
        userId: user._id,
        userName: user.name,
        changedBy: 'SELF'
      }
    });
    
    res.json({ message: 'Password changed successfully. Please login again.' });
  } catch (err) {
    console.error('Error changing password:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
    console.error('Error fetching password info:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
      tenantId: req.tenantId || undefined,
      severity: 'INFO'
    });
    
    res.json({ 
      message: 'Failed attempts reset successfully',
      userId: user._id 
    });
  } catch (err) {
    console.error('Error resetting failed attempts:', err);
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
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
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
    console.error('Error fetching password summary:', err);
    res.status(500).json({ message: 'Failed to fetch password summary' });
  }
});

module.exports = router;
