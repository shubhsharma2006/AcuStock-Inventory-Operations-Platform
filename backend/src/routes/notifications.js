const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');

const router = express.Router();
router.use(requireTenantId);

// ============================================================
// GET /api/notifications — Paginated list with filtering
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      unreadOnly = 'false',
      category,          // optional: STOCK, WARRANTY, SYSTEM, USER, SECURITY, ...
      priority           // optional: LOW, MEDIUM, HIGH, CRITICAL
    } = req.query;

    const parsedPage  = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const user  = req.user;
    const query = Notification.buildUserQuery(user._id, user.role, req.tenantId);

    if (unreadOnly === 'true') {
      query.isRead = false;
    }
    if (category) {
      query.category = category.toUpperCase();
    }
    if (priority) {
      query.priority = priority.toUpperCase();
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ ...Notification.buildUserQuery(user._id, user.role, req.tenantId), isRead: false })
    ]);

    res.json({
      notifications,
      unreadCount,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// GET /api/notifications/unread-count — Lightweight badge count
// ============================================================
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const unreadCount = await Notification.getUnreadCount(user._id, user.role, req.tenantId);
    res.json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// PATCH /api/notifications/read-all — Bulk mark all as read
// (Must be registered BEFORE /:id/read so Express doesn't
//  treat "read-all" as an :id parameter)
// ============================================================
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const user  = req.user;
    const query = Notification.buildUserQuery(user._id, user.role, req.tenantId);
    query.isRead = false;

    const result = await Notification.updateMany(query, {
      isRead: true,
      readAt: new Date()
    });

    res.json({ message: 'All notifications marked as read', modified: result.modifiedCount });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// PATCH /api/notifications/:id/read — Mark single as read
// Includes ownership check: only the notification's target can mark it read
// ============================================================
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const query = { _id: req.params.id, tenantId: req.tenantId };
    const notification = await Notification.findOne(query);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Ownership check: user must be targeted by this notification
    const user = req.user;
    const isDirectTarget = notification.userId?.toString() === user._id.toString();
    const targetRoles = user.role === 'SUPER_ADMIN'
      ? ['SUPER_ADMIN', 'ADMIN', 'ALL']
      : [user.role, 'ALL'];
    const isRoleTarget = targetRoles.includes(notification.targetRole);

    if (!isDirectTarget && !isRoleTarget) {
      return res.status(403).json({ message: 'Access denied' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// POST /api/notifications — Create a notification (Admin only)
// ============================================================
router.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { type, icon, title, message, targetRole, userId, link, metadata, category, priority } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({ message: 'Type, title, and message are required' });
    }

    const notification = await Notification.create({
      type,
      icon:          icon || getDefaultIcon(type),
      title,
      message,
      targetRole:    targetRole || 'ALL',
      userId,
      link,
      metadata,
      category:      category || 'SYSTEM',
      priority:      priority || 'MEDIUM',
      createdBy:     req.user._id,
      createdByRole: req.user.role,
      tenantId:      req.tenantId
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// DELETE /api/notifications/read — Bulk delete all read notifications (self only)
// ============================================================
router.delete('/read', requireAuth, async (req, res) => {
  try {
    const user  = req.user;
    const query = Notification.buildUserQuery(user._id, user.role, req.tenantId);
    query.isRead = true;

    const result = await Notification.deleteMany(query);
    res.json({ message: 'Read notifications cleared', deleted: result.deletedCount });
  } catch (error) {
    console.error('Error deleting read notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// DELETE /api/notifications/:id — Delete a single notification
// ============================================================
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const query = { _id: req.params.id, tenantId: req.tenantId };
    const notification = await Notification.findOne(query);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Only the notification's owner or an ADMIN may delete it
    const isOwner = notification.userId?.toString() === req.user._id.toString();
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await notification.deleteOne();
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Helper ───────────────────────────────────────────────────
function getDefaultIcon(type) {
  const icons = {
    stock_in: '📦', stock_out: '📤', low_stock: '⚠️',
    user_registered: '👤', order_completed: '✅',
    system: '🔧', info: 'ℹ️', warning: '⚠️', error: '❌'
  };
  return icons[type] || '🔔';
}

module.exports = router;
