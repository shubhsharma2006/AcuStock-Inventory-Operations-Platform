const express = require('express');
const User = require('../models/User');
const { requireAuth, validateObjectId } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

const router = express.Router();

// GET /api/managers - Get all managers (Admin only, paginated)
router.get('/', requireAuth, requirePermission('canManageManagers'), async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const query = {
      role: 'MANAGER',
      isDeleted: { $ne: true }
    };

    const [managers, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query)
    ]);

    // Pagination metadata in headers (keeps response as plain array — backward compatible)
    res.set('X-Total-Count', total);
    res.set('X-Page', page);
    res.set('X-Total-Pages', Math.ceil(total / limit));
    res.set('X-Limit', limit);
    res.json(managers);
  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/managers/:id - Get single manager (Admin only)
router.get('/:id', requireAuth, validateObjectId, requirePermission('canManageManagers'), async (req, res) => {
  try {
    const manager = await User.findOne({ 
      _id: req.params.id, 
      role: 'MANAGER',
      $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }]
    }).select('-password');
    if (!manager) {
      return res.status(404).json({ message: 'Manager not found' });
    }
    res.json(manager);
  } catch (error) {
    console.error('Error fetching manager:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/managers/:id - Update a manager (Admin only)
router.put('/:id', requireAuth, validateObjectId, requirePermission('canManageManagers'), async (req, res) => {
  try {
    const { name, email, isActive } = req.body;
    const { id } = req.params;

    // Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (name !== undefined && name.trim() === '') {
      return res.status(400).json({ message: 'Name cannot be empty' });
    }

    if (email !== undefined) {
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      const existingManager = await User.findOne({ email: email.toLowerCase(), _id: { $ne: id }, role: 'MANAGER' });
      if (existingManager) {
        return res.status(400).json({ message: 'Email already in use by another manager' });
      }
    }

    const manager = await User.findOne({ _id: id, role: 'MANAGER' });
    if (!manager) {
      return res.status(404).json({ message: 'Manager not found' });
    }

    manager.name     = name     !== undefined ? name     : manager.name;
    manager.email    = email    !== undefined ? email.toLowerCase() : manager.email;
    manager.isActive = isActive !== undefined ? isActive : manager.isActive;

    await manager.save();
    res.json({
      id: manager._id,
      name: manager.name,
      email: manager.email,
      isActive: manager.isActive,
      role: manager.role
    });
  } catch (error) {
    console.error('Error updating manager:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/managers/:id - Soft delete a manager (Admin only)
router.delete('/:id', requireAuth, validateObjectId, requirePermission('canManageManagers'), async (req, res) => {
    try {
        const manager = await User.findOne({ _id: req.params.id, role: 'MANAGER' });
        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        manager.isActive  = false;
        manager.isDeleted = true;                              // ← mark as deleted so list queries exclude it
        manager.deletedAt = new Date();
        manager.deletedBy = req.user._id;
        manager.tokenVersion = (manager.tokenVersion || 0) + 1; // Invalidate all active sessions
        await manager.save();

        res.json({ message: 'Manager deleted successfully' });
    } catch (error) {
        console.error('Error deleting manager:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/managers/:id/status - Activate/deactivate a manager (Admin only)
router.put('/:id/status', requireAuth, validateObjectId, requirePermission('canManageManagers'), async (req, res) => {
    const { isActive } = req.body;
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({ message: 'Cannot change your own active status' });
    }

    if (isActive === undefined) {
        return res.status(400).json({ message: 'isActive is a required field' });
    }

    try {
        const manager = await User.findOne({ _id: id, role: 'MANAGER' });
        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        manager.isActive = isActive;
        manager.tokenVersion = (manager.tokenVersion || 0) + 1; // Invalidate all active sessions
        await manager.save();
        res.json({ message: `Manager ${isActive ? 'activated' : 'deactivated'} successfully` });
    } catch (error) {
        console.error('Error updating manager status:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;