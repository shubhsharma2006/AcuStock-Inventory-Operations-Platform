/**
 * Ownership & Role Management Routes (SUPER_ADMIN only)
 * ─────────────────────────────────────────────────────
 * POST /api/ownership/promote-admin     → promote a MANAGER to ADMIN
 * POST /api/ownership/demote-admin      → demote an ADMIN to MANAGER
 * POST /api/ownership/transfer          → transfer SUPER_ADMIN status to another user
 * GET  /api/ownership/admins            → list all ADMIN + SUPER_ADMIN accounts
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify, notifyRoles } = require('../services/notificationHelper');

const router = express.Router();

// Middleware: only SUPER_ADMIN can use these routes
const requireSuperAdmin = [requireAuth, requireRole(['SUPER_ADMIN'])];

// ── GET /api/ownership/admins ────────────────────────────────────────────────
// List all admin-level accounts AND managers (for the management UI)
router.get('/admins', requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const admins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
    }).select('name email username role isSuperAdmin isActive lastLogin createdAt')
      .sort({ role: 1, name: 1 });
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/ownership/promote-admin ───────────────────────────────────────
// SUPER_ADMIN promotes a MANAGER to ADMIN
router.post('/promote-admin', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const user = await User.findOne({ _id: userId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return res.status(400).json({ message: 'User is already an Admin or Super Admin' });
    }
    if (user.role !== 'MANAGER') {
      return res.status(400).json({ message: 'Only Managers can be promoted to Admin' });
    }

    user.role         = 'ADMIN';
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Force re-login
    await user.save({ validateModifiedOnly: true });

    // Notify admins + the promoted user
    await notifyRoles(['ADMIN', 'MANAGER'], {
      type:       'admin_promoted',
      title:      'Manager Promoted to Admin',
      message:    `${user.name} has been promoted to Admin by ${req.user.name}`,
      priority:   'HIGH',
      link:       'users',
      relatedModel: 'User',
      relatedId:    user._id,
      createdBy:     req.user._id,
      createdByRole: req.user.role,
      tenantId:      req.tenantId || undefined,
      metadata: { userId: user._id, userName: user.name, promotedBy: req.user.name }
    });

    // Direct notification to the promoted user
    await notify({
      type:       'admin_promoted',
      title:      'You Have Been Promoted!',
      message:    `You have been promoted to Admin by ${req.user.name}. Please log in again.`,
      userId:     user._id,
      targetRole: 'ADMIN',
      priority:   'HIGH',
      link:       'dashboard',
      relatedModel: 'User',
      relatedId:    user._id,
      createdBy:     req.user._id,
      createdByRole: req.user.role,
      tenantId:      req.tenantId || undefined,
      metadata: { promotedBy: req.user.name }
    });

    res.json({
      message: `${user.name} has been promoted to Admin. They must log in again.`,
      user: { id: user._id, name: user.name, role: user.role, email: user.email }
    });
  } catch (err) {
    console.error('Promote error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/ownership/demote-admin ────────────────────────────────────────
// SUPER_ADMIN demotes an ADMIN back to MANAGER
router.post('/demote-admin', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const user = await User.findOne({ _id: userId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isSuperAdmin) {
      return res.status(403).json({ message: 'Super Admin cannot be demoted this way. Use Transfer Ownership first.' });
    }
    if (user.role !== 'ADMIN') {
      return res.status(400).json({ message: 'User is not an Admin' });
    }

    user.role         = 'MANAGER';
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ validateModifiedOnly: true });

    // Notify admins
    await notify({
      type:       'admin_demoted',
      title:      'Admin Demoted to Manager',
      message:    `${user.name} has been demoted to Manager by ${req.user.name}`,
      targetRole: 'ADMIN',
      priority:   'HIGH',
      link:       'users',
      relatedModel: 'User',
      relatedId:    user._id,
      createdBy:     req.user._id,
      createdByRole: req.user.role,
      tenantId:      req.tenantId || undefined,
      metadata: { userId: user._id, userName: user.name, demotedBy: req.user.name }
    });

    // Direct notification to the demoted user
    await notify({
      type:       'admin_demoted',
      title:      'Your Role Has Changed',
      message:    `You have been changed to Manager by ${req.user.name}. Please log in again.`,
      userId:     user._id,
      targetRole: 'MANAGER',
      priority:   'HIGH',
      link:       'dashboard',
      relatedModel: 'User',
      relatedId:    user._id,
      createdBy:     req.user._id,
      createdByRole: req.user.role,
      tenantId:      req.tenantId || undefined,
      metadata: { demotedBy: req.user.name }
    });

    res.json({
      message: `${user.name} has been demoted to Manager. They must log in again.`,
      user: { id: user._id, name: user.name, role: user.role, email: user.email }
    });
  } catch (err) {
    console.error('Demote error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/ownership/transfer ────────────────────────────────────────────
// Transfer SUPER_ADMIN to another ADMIN user.
// Current SUPER_ADMIN becomes a regular ADMIN.
// Requires current SUPER_ADMIN password as confirmation.
router.post('/transfer', requireSuperAdmin, async (req, res) => {
  try {
    const { newOwnerUserId, currentPassword } = req.body;

    if (!newOwnerUserId) return res.status(400).json({ message: 'newOwnerUserId is required' });
    if (!currentPassword) return res.status(400).json({ message: 'Your current password is required to confirm transfer' });

    // Verify current super admin's password
    const currentSA = await User.findById(req.user._id).select('+password');
    const isMatch   = await bcrypt.compare(currentPassword, currentSA.password);
    if (!isMatch) {
      return res.status(403).json({ message: 'Incorrect password. Ownership transfer denied.' });
    }

    // The new owner must exist and be an ADMIN in this tenant
    const newOwner = await User.findOne({ _id: newOwnerUserId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) });
    if (!newOwner) return res.status(404).json({ message: 'New owner user not found' });
    if (newOwner.role !== 'ADMIN') {
      return res.status(400).json({ message: 'New owner must be an existing Admin. Promote them to Admin first.' });
    }
    if (newOwner._id.toString() === currentSA._id.toString()) {
      return res.status(400).json({ message: 'You cannot transfer ownership to yourself' });
    }

    // Perform the transfer
    // 1. Current SUPER_ADMIN → ADMIN
    currentSA.role         = 'ADMIN';
    currentSA.isSuperAdmin = false;
    currentSA.tokenVersion = (currentSA.tokenVersion || 0) + 1;
    await currentSA.save({ validateModifiedOnly: true });

    // 2. New owner → SUPER_ADMIN
    newOwner.role         = 'SUPER_ADMIN';
    newOwner.isSuperAdmin = true;
    newOwner.tokenVersion = (newOwner.tokenVersion || 0) + 1;
    await newOwner.save({ validateModifiedOnly: true });

    // Notify all admins about the ownership transfer
    await notifyRoles(['ADMIN', 'MANAGER'], {
      type:       'ownership_transferred',
      title:      'Ownership Transferred',
      message:    `Super Admin ownership transferred from ${currentSA.name} to ${newOwner.name}`,
      priority:   'CRITICAL',
      link:       'ownership',
      relatedModel: 'User',
      relatedId:    newOwner._id,
      createdBy:     currentSA._id,
      createdByRole: 'SUPER_ADMIN',
      tenantId:      req.tenantId || undefined,
      metadata: {
        previousOwner:   currentSA.name,
        previousOwnerId: currentSA._id,
        newOwner:        newOwner.name,
        newOwnerId:      newOwner._id
      }
    });

    // Direct notification to the new owner
    await notify({
      type:       'ownership_transferred',
      title:      'You Are Now Super Admin',
      message:    `${currentSA.name} transferred Super Admin ownership to you. Please log in again.`,
      userId:     newOwner._id,
      targetRole: 'SUPER_ADMIN',
      priority:   'CRITICAL',
      link:       'dashboard',
      relatedModel: 'User',
      relatedId:    newOwner._id,
      createdBy:     currentSA._id,
      createdByRole: 'SUPER_ADMIN',
      tenantId:      req.tenantId || undefined,
      metadata: { previousOwner: currentSA.name }
    });

    res.json({
      message: `Ownership transferred to ${newOwner.name}. You are now a regular Admin. Both accounts must log in again.`,
      newOwner: { id: newOwner._id, name: newOwner.name, email: newOwner.email }
    });

  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
