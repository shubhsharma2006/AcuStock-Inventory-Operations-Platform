const express = require('express');
const User = require('../models/User');
const { requireAuth, requireRole, validateObjectId } = require('../middleware/auth');
const { notify } = require('../services/notificationHelper');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/users - Get all users (paginated)
// Admin sees all, Manager sees all users with role USER
router.get('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    // Always exclude soft-deleted users
    let query = { isDeleted: { $ne: true } };

    // Managers can only see active USER-role accounts (not other managers or admins)
    if (req.userRole === 'MANAGER') {
      query.role = 'USER';
    }
    // Admin sees all non-deleted users (no role filter)

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query)
    ]);

    // Pagination metadata in headers (keeps response as plain array — backward compatible)
    res.set('X-Total-Count', total);
    res.set('X-Page', page);
    res.set('X-Total-Pages', Math.ceil(total / limit));
    res.set('X-Limit', limit);
    res.json(users);
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/:id - Get single user
// Data isolation: Manager can only view users they created
router.get('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Data isolation: Manager can only view users they created
    if (req.userRole === 'MANAGER') {
      if (user.role !== 'USER' || user.createdBy?.toString() !== req.userId.toString()) {
        return res.status(403).json({ message: 'Access denied. You can only view users you created.' });
      }
    }
    
    res.json(user);
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/:id - Update a user
router.put('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
      const { name, email, phone, role, isActive } = req.body;
      const { id } = req.params;
  
      // Validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\d{10,15}$/;
      const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'];
  
      if (name !== undefined && name.trim() === '') {
        return res.status(400).json({ message: 'Name cannot be empty' });
      }
  
      if (email !== undefined) {
        if (!emailRegex.test(email)) {
          return res.status(400).json({ message: 'Invalid email format' });
        }
        const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: id } });
        if (existingUser) {
          return res.status(400).json({ message: 'Email already in use by another user' });
        }
      }
  
      if (phone !== undefined) {
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({ message: 'Invalid phone number format (10-15 digits)' });
        }
        const existingUser = await User.findOne({ phone, _id: { $ne: id } });
        if (existingUser) {
          return res.status(400).json({ message: 'Phone number already in use by another user' });
        }
      }
  
      if (role !== undefined && !allowedRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified' });
      }
  
      try {
        const userToUpdate = await User.findById(id);
        if (!userToUpdate) {
          return res.status(404).json({ message: 'User not found' });
        }

    // ⚠️ SUPER_ADMIN PROTECTION: Cannot be touched by anyone except themselves (name/email only)
    if (userToUpdate.isSuperAdmin) {
      if (req.user._id.toString() !== userToUpdate._id.toString()) {
        return res.status(403).json({
          message: 'Super Admin account cannot be modified by other users',
          code: 'SUPER_ADMIN_PROTECTED'
        });
      }
      // Super Admin cannot demote themselves
      if (role && role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          message: 'Super Admin role cannot be changed',
          code: 'SUPER_ADMIN_PROTECTED'
        });
      }
      // Super Admin cannot deactivate themselves
      if (isActive === false) {
        return res.status(403).json({
          message: 'Super Admin account cannot be deactivated',
          code: 'SUPER_ADMIN_PROTECTED'
        });
      }
    }

    // ⚠️ ADMIN PROTECTION: Admins can only be touched by SUPER_ADMIN or themselves
    if (userToUpdate.role === 'ADMIN') {
      const actorIsSuperAdmin = req.user.role === 'SUPER_ADMIN';
      const actorIsSelf       = req.user._id.toString() === userToUpdate._id.toString();

      if (!actorIsSuperAdmin && !actorIsSelf) {
        return res.status(403).json({ 
          message: 'Admin accounts can only be modified by the Super Admin or by the admin themselves',
          code: 'ADMIN_PROTECTED'
        });
      }
      // Non-super-admin admins cannot change their own role or deactivate themselves
      if (!actorIsSuperAdmin) {
        if (isActive === false) {
          return res.status(403).json({ 
            message: 'Admin accounts cannot deactivate themselves',
            code: 'ADMIN_PROTECTED'
          });
        }
        if (role && role !== 'ADMIN') {
          return res.status(403).json({ 
            message: 'Admins cannot change their own role',
            code: 'ADMIN_PROTECTED'
          });
        }
      }
    }

    // Managers can only update users, not other managers or admins
    if (req.user.role === 'MANAGER' && userToUpdate.role !== 'USER') {
      return res.status(403).json({ message: 'Managers can only update users' });
    }
    
    // Only admins (and super admins) can change roles
    if (role && req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ message: 'Only admins can change roles' });
    }

    // Role change validation
    if (role && role !== userToUpdate.role) {
      // If changing to USER role, phone is required
      if (role === 'USER') {
        const finalPhone = phone || userToUpdate.phone;
        if (!finalPhone) {
          return res.status(400).json({ 
            message: 'Cannot change role to User: Phone number is required for User accounts. Please add a phone number first.' 
          });
        }
      }
      
      // If changing to ADMIN or MANAGER role, email is required
      if (role === 'ADMIN' || role === 'MANAGER') {
        const finalEmail = email || userToUpdate.email;
        if (!finalEmail) {
          return res.status(400).json({ 
            message: `Cannot change role to ${role}: Email is required for ${role} accounts. Please add an email first.` 
          });
        }
      }
      
      // Increment tokenVersion to invalidate all existing sessions
      // This forces the user to log in again with their new role
      userToUpdate.tokenVersion = (userToUpdate.tokenVersion || 0) + 1;
    }

    const oldRole = userToUpdate.role;
    const roleChanged = role && role !== oldRole;

    userToUpdate.name = name || userToUpdate.name;
    userToUpdate.email = email || userToUpdate.email;
    userToUpdate.phone = phone || userToUpdate.phone;
    userToUpdate.role = role || userToUpdate.role;
    userToUpdate.isActive = isActive !== undefined ? isActive : userToUpdate.isActive;

    // Use validateModifiedOnly to avoid triggering validation on unchanged fields
    await userToUpdate.save({ validateModifiedOnly: true });
    
    // Emit real-time update for user modification
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('user-update', {
        action: 'updated',
        userId: userToUpdate._id,
        userName: userToUpdate.name,
        userRole: userToUpdate.role,
        timestamp: new Date()
      });
    }
    
    // Include info about role change in response
    const response = userToUpdate.toObject();
    delete response.password; // Never expose password
    
    if (roleChanged) {
      response.roleChanged = true;
      response.previousRole = oldRole;
      response.sessionInvalidated = true;
      response.message = `Role changed from ${oldRole} to ${role}. User will need to log in again to access their new dashboard.`;

      // Notification: role changed
      notify({
        type:       'role_changed',
        title:      'User Role Changed',
        message:    `${userToUpdate.name}'s role changed from ${oldRole} to ${role} by ${req.user.name}`,
        targetRole: 'ADMIN',
        priority:   'HIGH',
        link:       'users',
        relatedModel: 'User',
        relatedId:    userToUpdate._id,
        createdBy:     req.user._id,
        createdByRole: req.user.role,
        metadata: {
          userId:       userToUpdate._id,
          userName:     userToUpdate.name,
          previousRole: oldRole,
          newRole:      role,
          changedBy:    req.user.name
        }
      }).catch(() => {});
    }

    // Notification: user deactivated / activated
    if (isActive !== undefined && isActive !== userToUpdate.isActive) {
      const action = isActive ? 'activated' : 'deactivated';
      notify({
        type:       isActive ? 'user_activated' : 'user_deactivated',
        title:      `User ${isActive ? 'Activated' : 'Deactivated'}`,
        message:    `${userToUpdate.name} (${userToUpdate.role}) has been ${action} by ${req.user.name}`,
        targetRole: 'ADMIN',
        priority:   'MEDIUM',
        link:       'users',
        relatedModel: 'User',
        relatedId:    userToUpdate._id,
        createdBy:     req.user._id,
        createdByRole: req.user.role,
        metadata: { userId: userToUpdate._id, userName: userToUpdate.name, action }
      }).catch(() => {});
    }
    
    res.json(response);
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/users/:id - Soft delete a user (Admin only)
router.delete('/:id', requireAuth, validateObjectId, requireRole(['ADMIN']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // ⚠️ SUPER_ADMIN PROTECTION: Cannot ever be deleted
        if (user.isSuperAdmin) {
          return res.status(403).json({
            message: 'Super Admin account cannot be deleted',
            code: 'SUPER_ADMIN_PROTECTED'
          });
        }

        // ⚠️ ADMIN PROTECTION: Only SUPER_ADMIN can deactivate an admin
        if (user.role === 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
          return res.status(403).json({ 
            message: 'Only Super Admin can deactivate Admin accounts',
            code: 'ADMIN_PROTECTED'
          });
        }

        user.isActive = false;
        await user.save();
        
        // Emit real-time update
        if (global.emitRealTimeUpdate) {
          global.emitRealTimeUpdate('user-update', {
            action: 'deactivated',
            userId: user._id,
            userName: user.name,
            timestamp: new Date()
          });
        }

        // Notification: user deactivated
        notify({
          type:       'user_deactivated',
          title:      'User Deactivated',
          message:    `${user.name} (${user.role}) has been deactivated by ${req.user.name}`,
          targetRole: 'ADMIN',
          priority:   'MEDIUM',
          link:       'users',
          relatedModel: 'User',
          relatedId:    user._id,
          createdBy:     req.user._id,
          createdByRole: req.user.role,
          metadata: { userId: user._id, userName: user.name, deactivatedBy: req.user.name }
        }).catch(() => {});

        res.json({ message: 'User deactivated successfully' });
    } catch (error) {
        logger.error('Error deactivating user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/users/:id/status - Activate/deactivate a user
router.put('/:id/status', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    const { isActive } = req.body;
    const { id } = req.params;

    if (isActive === undefined) {
        return res.status(400).json({ message: 'isActive is a required field' });
    }

    try {
        const userToUpdate = await User.findById(id);
        if (!userToUpdate) {
            return res.status(404).json({ message: 'User not found' });
        }

        // SUPER_ADMIN protection — cannot be deactivated ever
        if (userToUpdate.isSuperAdmin) {
            return res.status(403).json({ message: 'Super Admin account cannot be deactivated', code: 'SUPER_ADMIN_PROTECTED' });
        }

        // ADMIN protection — only SUPER_ADMIN can deactivate an admin
        if (userToUpdate.role === 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Only Super Admin can deactivate an Admin account', code: 'ADMIN_PROTECTED' });
        }

        if (req.user.role === 'MANAGER' && userToUpdate.role !== 'USER') {
            return res.status(403).json({ message: 'Managers can only update users' });
        }

        userToUpdate.isActive = isActive;
        await userToUpdate.save();
        
        // Emit real-time update for user status change
        if (global.emitRealTimeUpdate) {
          global.emitRealTimeUpdate('user-update', {
            action: isActive ? 'activated' : 'deactivated',
            userId: userToUpdate._id,
            userName: userToUpdate.name,
            timestamp: new Date()
          });
        }
        
        res.json({ message: `User ${isActive ? 'activated' : 'deactivated'} successfully` });
    } catch (error) {
        logger.error('Error updating user status:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/users/profile - Update own profile (for logged-in user)
// Users can ONLY update their name. Phone and email are locked (assigned by Admin/Manager).
router.put('/profile', requireAuth, async (req, res) => {
  const { name, password, currentPassword } = req.body;
  
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Users can only update their name
    if (name !== undefined) {
      if (name.trim() === '') {
        return res.status(400).json({ message: 'Name cannot be empty' });
      }
      user.name = name.trim();
    }
    
    // Password change requires current password verification
    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to change password' });
      }
      
      const bcrypt = require('bcryptjs');
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters long' });
      }
      
      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(password, salt);
    }
    
    await user.save();
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;