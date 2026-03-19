const mongoose = require('mongoose');

// ============================================================
// NOTIFICATION MODEL — Production-Level
// ============================================================
// Supports:
//  • User-targeted (userId) + Role-broadcast (targetRole) delivery
//  • Category + Priority for filtering & grouping
//  • Relational linking (relatedModel + relatedId) for deep navigation
//  • Creator tracking (createdBy + createdByRole)
//  • TTL auto-cleanup (30 days default, configurable per notification)
//  • Efficient compound indexes for read/unread queries
// ============================================================

const notificationSchema = new mongoose.Schema({
  // ── Targeting ──────────────────────────────────────────────
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
    // null → broadcast to all users with matching targetRole
  },
  targetRole: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'ALL'],
    default: 'ALL'
  },

  // ── Classification ─────────────────────────────────────────
  category: {
    type: String,
    enum: ['STOCK', 'WARRANTY', 'SYSTEM', 'USER', 'SECURITY', 'COMPANY', 'SHIPMENT'],
    default: 'SYSTEM',
    index: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  type: {
    type: String,
    enum: [
      // Stock
      'stock_in', 'stock_out', 'low_stock', 'stock_deleted',
      // User / Auth
      'user_registered', 'user_deactivated', 'user_activated',
      'role_changed', 'password_changed', 'password_reset',
      'failed_login', 'account_locked',
      // Ownership
      'admin_promoted', 'admin_demoted', 'ownership_transferred',
      // Warranty
      'warranty-purchase-expiring', 'warranty-purchase-expired',
      'warranty-seller-expiring',   'warranty-seller-expired',
      'warranty-claim',
      // System
      'system', 'info', 'warning', 'error',
      'order_completed'
    ],
    required: true
  },

  // ── Content ────────────────────────────────────────────────
  icon: {
    type: String,
    default: '🔔'
  },
  title: {
    type: String,
    required: true,
    maxlength: 150
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  link: {
    type: String // Frontend section/page to navigate to (e.g. 'stock', 'users')
  },

  // ── Relational ─────────────────────────────────────────────
  relatedModel: {
    type: String,
    enum: ['Item', 'User', 'StockLedger', 'Warranty', 'Shipment', 'Company', null],
    default: null
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  // ── Read State ─────────────────────────────────────────────
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },

  // ── Creator ────────────────────────────────────────────────
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null = system-generated
  },
  createdByRole: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'SYSTEM', null],
    default: 'SYSTEM'
  },

  // ── Metadata ───────────────────────────────────────────────
  metadata: {
    type: mongoose.Schema.Types.Mixed // Flexible payload (productId, userName, etc.)
  },

  // ── Timestamps ─────────────────────────────────────────────
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }
});

// ── Indexes ──────────────────────────────────────────────────
// TTL: auto-delete expired notifications
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast list queries: user's notifications sorted by time
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Fast list queries: role-broadcast notifications sorted by time
notificationSchema.index({ targetRole: 1, isRead: 1, createdAt: -1 });

// Category filtering
notificationSchema.index({ category: 1, createdAt: -1 });

// ── Static Methods ───────────────────────────────────────────

/**
 * Build the $or query for a user's visible notifications.
 * SUPER_ADMIN also sees ADMIN-targeted notifications.
 */
notificationSchema.statics.buildUserQuery = function(userId, role) {
  const targetRoles = role === 'SUPER_ADMIN'
    ? [role, 'ADMIN', 'ALL']
    : [role, 'ALL'];

  return {
    $or: [
      { userId: userId },
      { targetRole: { $in: targetRoles } }
    ]
  };
};

/**
 * Get unread count for a user.
 */
notificationSchema.statics.getUnreadCount = async function(userId, role) {
  const query = this.buildUserQuery(userId, role);
  query.isRead = false;
  return this.countDocuments(query);
};

/**
 * Create a notification (convenience wrapper).
 */
notificationSchema.statics.createNotification = async function(data) {
  const notification = new this(data);
  await notification.save();
  return notification;
};

module.exports = mongoose.model('Notification', notificationSchema);
