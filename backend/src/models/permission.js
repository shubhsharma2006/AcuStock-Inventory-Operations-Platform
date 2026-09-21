

const mongoose = require('mongoose');

/**
 * Permission Schema - Role-Based Access Control
 * 
 * CORE PRINCIPLES:
 * 1. Admin creates MASTER DATA (Products, Companies, Units, Managers)
 * 2. Manager & User only consume master data
 * 3. Stock is ledger-based, never edited or deleted
 * 4. Serial numbers are product-controlled, not user-controlled
 * 5. Every role sees only its own data (isolation)
 * 6. Backend always enforces rules
 */
const PermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['ADMIN', 'MANAGER', 'USER'],
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true
    },

    // ===== USER MANAGEMENT =====
    canManageAdmins: {
      type: Boolean,
      default: false // Only system-level, never enabled
    },
    canManageManagers: {
      type: Boolean,
      default: false // Admin only
    },
    canManageUsers: {
      type: Boolean,
      default: false // Admin & Manager
    },
    canActivateDeactivateManagers: {
      type: Boolean,
      default: false // Admin only
    },
    canActivateDeactivateUsers: {
      type: Boolean,
      default: false // Admin & Manager
    },

    // ===== MASTER DATA - PRODUCTS =====
    canViewProducts: {
      type: Boolean,
      default: true // All roles
    },
    canAddProduct: {
      type: Boolean,
      default: false // Admin only
    },
    canEditProduct: {
      type: Boolean,
      default: false // Admin only
    },
    canDeleteProduct: {
      type: Boolean,
      default: false // Admin only (soft delete)
    },
    canDeactivateProduct: {
      type: Boolean,
      default: false // Admin only
    },
    canChangeSerialPolicy: {
      type: Boolean,
      default: false // Admin only - CRITICAL
    },

    // ===== MASTER DATA - COMPANIES =====
    canViewCompanies: {
      type: Boolean,
      default: true // All roles
    },
    canAddCompany: {
      type: Boolean,
      default: false // Admin only
    },
    canEditCompany: {
      type: Boolean,
      default: false // Admin only
    },
    canDeleteCompany: {
      type: Boolean,
      default: false // Admin only
    },

    // ===== MASTER DATA - UNITS =====
    canViewUnits: {
      type: Boolean,
      default: true // All roles
    },
    canManageUnits: {
      type: Boolean,
      default: false // Admin only
    },

    // ===== STOCK OPERATIONS (LEDGER-BASED) =====
    canStockIn: {
      type: Boolean,
      default: false // Admin, Manager, User
    },
    canStockOut: {
      type: Boolean,
      default: false // Admin, Manager, User
    },
    canViewStockLedger: {
      type: Boolean,
      default: false // All roles (own data only for Manager/User)
    },
    // HARD LOCKED - Never enable these
    canEditStock: {
      type: Boolean,
      default: false // ALWAYS FALSE - Ledger immutable
    },
    canDeleteStock: {
      type: Boolean,
      default: false // ALWAYS FALSE - Ledger immutable
    },

    // ===== REPORTING =====
    canViewAllReports: {
      type: Boolean,
      default: false // Admin only - sees everything
    },
    canViewOwnReports: {
      type: Boolean,
      default: false // Manager & User - own data only
    },

    // ===== SYSTEM =====
    canAccessSettings: {
      type: Boolean,
      default: false // Admin only
    },
    canViewAuditLogs: {
      type: Boolean,
      default: false // Admin only
    },

    // ===== LOGISTICS =====
    canAddLogistics: {
      type: Boolean,
      default: true // Admin & Manager
    },
    canEditLogistics: {
      type: Boolean,
      default: false // Admin only
    },
    canDeleteLogistics: {
      type: Boolean,
      default: false // Admin only
    },
    canManageCompanies: {
      type: Boolean,
      default: true // Admin & Manager can add companies
    },

    // Audit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

/**
 * SAFETY: Only enforce truly critical restrictions
 * Admin has full control over all other permissions
 */
PermissionSchema.pre('save', function (next) {
  // LEDGER IMMUTABILITY - Applies to ALL roles including ADMIN
  // This is the ONLY hard lock - stock entries cannot be edited/deleted (SAP-style)
  this.canEditStock = false;
  this.canDeleteStock = false;
  
  // No one can manage admins except through system
  this.canManageAdmins = false;

  next();
});

PermissionSchema.index({ tenantId: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('Permission', PermissionSchema);