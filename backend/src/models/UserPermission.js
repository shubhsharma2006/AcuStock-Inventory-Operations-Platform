const mongoose = require('mongoose');

/**
 * UserPermission Model
 * Provides per-user granular permission overrides within a tenant.
 * Value semantics:
 *   true  -> explicitly granted to user
 *   false -> explicitly denied to user
 *   null  -> inherit from role-level permission default
 */
const UserPermissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },

    // ===== USER MANAGEMENT =====
    canManageAdmins: { type: Boolean, default: null },
    canManageManagers: { type: Boolean, default: null },
    canManageUsers: { type: Boolean, default: null },
    canActivateDeactivateManagers: { type: Boolean, default: null },
    canActivateDeactivateUsers: { type: Boolean, default: null },

    // ===== MASTER DATA - PRODUCTS =====
    canViewProducts: { type: Boolean, default: null },
    canAddProduct: { type: Boolean, default: null },
    canEditProduct: { type: Boolean, default: null },
    canDeleteProduct: { type: Boolean, default: null },
    canDeactivateProduct: { type: Boolean, default: null },
    canChangeSerialPolicy: { type: Boolean, default: null },

    // ===== MASTER DATA - COMPANIES =====
    canViewCompanies: { type: Boolean, default: null },
    canAddCompany: { type: Boolean, default: null },
    canEditCompany: { type: Boolean, default: null },
    canDeleteCompany: { type: Boolean, default: null },

    // ===== MASTER DATA - UNITS =====
    canViewUnits: { type: Boolean, default: null },
    canManageUnits: { type: Boolean, default: null },

    // ===== STOCK OPERATIONS =====
    canStockIn: { type: Boolean, default: null },
    canStockOut: { type: Boolean, default: null },
    canViewStockLedger: { type: Boolean, default: null },
    canEditStock: { type: Boolean, default: false }, // HARD LOCKED - ALWAYS FALSE
    canDeleteStock: { type: Boolean, default: false }, // HARD LOCKED - ALWAYS FALSE

    // ===== REPORTING =====
    canViewAllReports: { type: Boolean, default: null },
    canViewOwnReports: { type: Boolean, default: null },

    // ===== SYSTEM =====
    canAccessSettings: { type: Boolean, default: null },
    canViewAuditLogs: { type: Boolean, default: null },

    // ===== LOGISTICS =====
    canAddLogistics: { type: Boolean, default: null },
    canEditLogistics: { type: Boolean, default: null },
    canDeleteLogistics: { type: Boolean, default: null },
    canManageCompanies: { type: Boolean, default: null },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Enforce immutable business invariants
UserPermissionSchema.pre('save', function (next) {
  this.canEditStock = false;
  this.canDeleteStock = false;
  this.canManageAdmins = false;
  if (typeof next === 'function') next();
});

UserPermissionSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
UserPermissionSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('UserPermission', UserPermissionSchema);
