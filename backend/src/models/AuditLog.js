const mongoose = require('mongoose');

/**
 * AuditLog Model - Production Ready
 * Tracks all security-sensitive actions for compliance and auditing
 */
const auditLogSchema = new mongoose.Schema({
  // Action type
  action: {
    type: String,
    enum: [
      // Password Events
      'PASSWORD_CHANGED',
      'PASSWORD_RESET_BY_ADMIN',
      'PASSWORD_RESET_BY_MANAGER',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      
      // Login Events
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGIN_BLOCKED_INACTIVE',
      'LOGIN_BLOCKED_LOCKED',
      'LOGIN_BLOCKED_FORCE_RESET',
      'LOGOUT',
      'FORCE_LOGOUT',
      
      // Account Events
      'ACCOUNT_CREATED',
      'ACCOUNT_ACTIVATED',
      'ACCOUNT_DEACTIVATED',
      'ACCOUNT_DELETED',
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
      
      // Role Events
      'ROLE_CHANGED',
      
      // Session Events
      'SESSION_INVALIDATED',
      'ALL_SESSIONS_INVALIDATED',

      // 2FA Security Events
      '2FA_SETUP_STARTED',
      '2FA_ENABLE_FAILED',
      '2FA_ENABLED',
      '2FA_DISABLED',
      '2FA_LOGIN_FAILED',
      '2FA_LOGIN_SUCCESS',

      // Business & Inventory Events
      'ITEM_CREATED',
      'ITEM_UPDATED',
      'ITEM_DELETED',
      'ITEM_IMPORTED',
      'STOCK_IN',
      'STOCK_OUT',
      'STOCK_ADJUSTED',
      'STOCK_TRANSFER',
      'PO_CREATED',
      'PO_RECEIVED',
      'PO_STATUS_CHANGED',
      'SO_CREATED',
      'SO_DISPATCHED',
      'SO_STATUS_CHANGED',
      'COMPANY_CREATED',
      'COMPANY_UPDATED',
      'COMPANY_DELETED',
      'SHIPMENT_CREATED',
      'SHIPMENT_STATUS_CHANGED',
      'SETTING_CHANGED',
      'PERMISSION_UPDATED',
      'PERMISSION_UPDATE',
      'USER_INVITED',
      'PLAN_UPGRADED',
      'PLAN_DOWNGRADED',
      'WARRANTY_CLAIMED'
    ],
    required: true,
    index: true
  },
  
  // User who performed the action (null for system actions)
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  performedByName: {
    type: String
  },
  performedByRole: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'SYSTEM']
  },
  
  // Target user (for actions performed on other users)
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  targetUserName: {
    type: String
  },
  targetUserRole: {
    type: String
  },
  targetRole: {
    type: String
  },

  // Polymorphic entity reference — links the log to its business source record
  entityType: {
    type: String,
    enum: [
      'Item',
      'StockLedger',
      'PurchaseOrder',
      'SalesOrder',
      'Company',
      'Shipment',
      'StockTransfer',
      'Warranty',
      'Tenant',
      'Permission',
      'User',
      null
    ],
    default: null,
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },

  // Change snapshot — stores before/after diff and summary
  changes: {
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after:  { type: mongoose.Schema.Types.Mixed, default: null },
    summary: { type: String, maxlength: 500 }
  },
  
  // Additional details
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // IP Address and User Agent for security tracking
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  
  // Severity level for filtering
  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'CRITICAL'],
    default: 'INFO'
  },
  
  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false,
    default: null,
    index: true
  }
}, {
  timestamps: false // We manage createdAt manually
});

// Compound indexes for efficient queries
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetUser: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });

// TTL index - Auto delete logs after 1 year (configurable)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

/**
 * Static method to log an audit event
 */
auditLogSchema.statics.logEvent = async function(data) {
  try {
    const payload = {
      ...data,
      tenantId: data.tenantId || null
    };
    const log = new this(payload);
    if (!payload.tenantId) {
      log.$locals = { skipTenantIsolation: true };
    }
    await log.save();
    
    // Also log to console for development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AUDIT] ${data.action}: ${data.targetUserName || 'N/A'} by ${data.performedByName || 'SYSTEM'}`);
    }
    
    return log;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should never break the main flow
    return null;
  }
};

/**
 * Static method to log password change
 */
auditLogSchema.statics.logPasswordChange = async function(targetUser, performedBy, changedBy, req) {
  return this.logEvent({
    action: 'PASSWORD_CHANGED',
    performedBy: performedBy?._id,
    performedByName: performedBy?.name || 'SELF',
    performedByRole: performedBy?.role || targetUser.role,
    targetUser: targetUser._id,
    targetUserName: targetUser.name,
    targetUserRole: targetUser.role,
    details: {
      changedBy: changedBy, // 'SELF', 'ADMIN', 'MANAGER'
      timestamp: new Date()
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.get?.('User-Agent'),
    severity: 'INFO'
  });
};

/**
 * Static method to log password reset by admin/manager
 */
auditLogSchema.statics.logPasswordReset = async function(targetUser, performedBy, req) {
  const isSuperAdmin = performedBy.role === 'SUPER_ADMIN';
  const isAdmin      = performedBy.role === 'ADMIN' || isSuperAdmin;
  const action = isAdmin ? 'PASSWORD_RESET_BY_ADMIN' : 'PASSWORD_RESET_BY_MANAGER';
  return this.logEvent({
    action,
    performedBy: performedBy._id,
    performedByName: performedBy.name,
    performedByRole: performedBy.role,
    targetUser: targetUser._id,
    targetUserName: targetUser.name,
    targetUserRole: targetUser.role,
    details: {
      forceResetRequired: true,
      timestamp: new Date()
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.get?.('User-Agent'),
    severity: 'WARNING'
  });
};

/**
 * Static method to log failed login attempt
 */
auditLogSchema.statics.logFailedLogin = async function(identifier, role, reason, req, tenantId = null) {
  return this.logEvent({
    action: 'LOGIN_FAILED',
    performedByRole: 'SYSTEM',
    details: {
      identifier: identifier,
      role: role,
      reason: reason,
      timestamp: new Date()
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.get?.('User-Agent'),
    tenantId: tenantId || null,
    severity: 'WARNING'
  });
};

/**
 * Static method to log successful login
 */
auditLogSchema.statics.logSuccessfulLogin = async function(user, req) {
  return this.logEvent({
    action: 'LOGIN_SUCCESS',
    performedBy: user._id,
    performedByName: user.name,
    performedByRole: user.role,
    targetUser: user._id,
    targetUserName: user.name,
    targetUserRole: user.role,
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.get?.('User-Agent'),
    tenantId: user.tenantId || null,
    severity: 'INFO'
  });
};

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
auditLogSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('AuditLog', auditLogSchema);
