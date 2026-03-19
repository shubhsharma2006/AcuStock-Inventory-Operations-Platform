/**
 * Centralized Notification Helper
 * ================================
 * Single source of truth for creating notifications + emitting Socket.IO events.
 * Used by ALL routes (stock, auth, ownership, users, etc.) instead of inline
 * Notification.create() calls.
 *
 * Usage:
 *   const { notify } = require('../services/notificationHelper');
 *   await notify({ type: 'stock_in', ... });
 */

const Notification = require('../models/Notification');

// ── Default icons per notification type ──────────────────────
const DEFAULT_ICONS = {
  // Stock
  stock_in:       '📦',
  stock_out:      '📤',
  low_stock:      '⚠️',
  stock_deleted:  '🗑️',
  // User / Auth
  user_registered:  '👤',
  user_deactivated: '🚫',
  user_activated:   '✅',
  role_changed:     '🔄',
  password_changed: '🔑',
  password_reset:   '🔐',
  failed_login:     '🚨',
  account_locked:   '🔒',
  // Ownership
  admin_promoted:        '⬆️',
  admin_demoted:         '⬇️',
  ownership_transferred: '👑',
  // Warranty
  'warranty-purchase-expiring': '🔔',
  'warranty-purchase-expired':  '⚠️',
  'warranty-seller-expiring':   '🔔',
  'warranty-seller-expired':    '⚠️',
  'warranty-claim':             '📋',
  // System
  system:            '🔧',
  info:              'ℹ️',
  warning:           '⚠️',
  error:             '❌',
  order_completed:   '✅'
};

// ── Category auto-detection from type ────────────────────────
const TYPE_TO_CATEGORY = {
  stock_in:       'STOCK',
  stock_out:      'STOCK',
  low_stock:      'STOCK',
  stock_deleted:  'STOCK',

  user_registered:  'USER',
  user_deactivated: 'USER',
  user_activated:   'USER',
  role_changed:     'USER',
  password_changed: 'SECURITY',
  password_reset:   'SECURITY',
  failed_login:     'SECURITY',
  account_locked:   'SECURITY',

  admin_promoted:        'USER',
  admin_demoted:         'USER',
  ownership_transferred: 'SYSTEM',

  'warranty-purchase-expiring': 'WARRANTY',
  'warranty-purchase-expired':  'WARRANTY',
  'warranty-seller-expiring':   'WARRANTY',
  'warranty-seller-expired':    'WARRANTY',
  'warranty-claim':             'WARRANTY',

  system:          'SYSTEM',
  info:            'SYSTEM',
  warning:         'SYSTEM',
  error:           'SYSTEM',
  order_completed: 'SHIPMENT'
};

/**
 * Create a notification and emit a Socket.IO event to the target.
 *
 * @param {Object} opts
 * @param {string}              opts.type          – Notification type enum value (required)
 * @param {string}              opts.title         – Short title (required)
 * @param {string}              opts.message       – Body text (required)
 * @param {string}             [opts.targetRole]   – 'ADMIN' | 'MANAGER' | 'USER' | 'ALL'
 * @param {string|ObjectId}   [opts.userId]        – Target specific user
 * @param {string}             [opts.category]     – Auto-detected from type if omitted
 * @param {string}             [opts.priority]     – 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * @param {string}             [opts.icon]         – Emoji icon (auto-detected from type if omitted)
 * @param {string}             [opts.link]         – Frontend section to navigate to
 * @param {string}             [opts.relatedModel] – 'Item' | 'User' | 'StockLedger' | ...
 * @param {string|ObjectId}   [opts.relatedId]     – The related document's _id
 * @param {string|ObjectId}   [opts.createdBy]     – User who triggered this
 * @param {string}             [opts.createdByRole] – Role of the creator
 * @param {Object}             [opts.metadata]     – Free-form payload
 * @returns {Promise<Object|null>} The saved notification document (or null on error)
 */
async function notify(opts) {
  try {
    const data = {
      type:          opts.type,
      title:         opts.title,
      message:       opts.message,
      targetRole:    opts.targetRole || 'ALL',
      userId:        opts.userId || null,
      category:      opts.category || TYPE_TO_CATEGORY[opts.type] || 'SYSTEM',
      priority:      opts.priority || 'MEDIUM',
      icon:          opts.icon || DEFAULT_ICONS[opts.type] || '🔔',
      link:          opts.link || null,
      relatedModel:  opts.relatedModel || null,
      relatedId:     opts.relatedId || null,
      createdBy:     opts.createdBy || null,
      createdByRole: opts.createdByRole || 'SYSTEM',
      metadata:      opts.metadata || {}
    };

    const notification = await Notification.create(data);

    // ── Emit Socket.IO event ───────────────────────────────
    if (global.emitRealTimeUpdate) {
      const payload = {
        _id:        notification._id,
        type:       notification.type,
        category:   notification.category,
        priority:   notification.priority,
        icon:       notification.icon,
        title:      notification.title,
        message:    notification.message,
        link:       notification.link,
        createdAt:  notification.createdAt,
        metadata:   notification.metadata
      };

      // Emit to specific user room
      if (notification.userId) {
        global.emitRealTimeUpdate('notification', payload, `user-${notification.userId}`);
      }

      // Emit to role room(s)
      const role = notification.targetRole;
      if (role === 'ALL') {
        global.emitRealTimeUpdate('notification', payload, 'all');
      } else if (role) {
        // Lowercase role for Socket.IO room name
        global.emitRealTimeUpdate('notification', payload, role.toLowerCase());
        // If targeting ADMIN, also push to super_admin room
        if (role === 'ADMIN') {
          global.emitRealTimeUpdate('notification', payload, 'super_admin');
        }
      }
    }

    return notification;
  } catch (error) {
    console.error('❌ notificationHelper.notify() error:', error.message);
    return null;
  }
}

/**
 * Send the same notification to multiple roles at once.
 * Convenience wrapper — creates one DB doc per role.
 *
 * @param {string[]} roles   – Array of targetRoles, e.g. ['ADMIN', 'MANAGER']
 * @param {Object}   opts    – Same options as notify() minus targetRole
 * @returns {Promise<Object[]>} Array of saved notifications
 */
async function notifyRoles(roles, opts) {
  const results = [];
  for (const role of roles) {
    const n = await notify({ ...opts, targetRole: role });
    if (n) results.push(n);
  }
  return results;
}

module.exports = { notify, notifyRoles };
