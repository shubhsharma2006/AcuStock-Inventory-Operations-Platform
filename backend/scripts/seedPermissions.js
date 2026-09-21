/**
 * Permission Seeding Script
 * Seeds default permissions for ADMIN, MANAGER, and USER roles.
 * 
 * CORE PRINCIPLES:
 * 1. Admin creates MASTER DATA (Products, Companies, Units, Managers)
 * 2. Manager & User only consume master data
 * 3. Stock is ledger-based, never edited or deleted
 * 4. Serial numbers are product-controlled (Admin only)
 * 5. Every role sees only its own data (isolation)
 * 
 * Run: node scripts/seedPermissions.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Permission = require('../src/models/permission');
const Tenant = require('../src/models/Tenant');

const defaultPermissions = [
    {
        role: 'ADMIN',
        // User Management - Full control
        canManageAdmins: false, // No one manages admins programmatically
        canManageManagers: true,
        canManageUsers: true,
        canActivateDeactivateManagers: true,
        canActivateDeactivateUsers: true,
        
        // Master Data - Products (ADMIN ONLY)
        canViewProducts: true,
        canAddProduct: true,
        canEditProduct: true,
        canDeleteProduct: true,
        canChangeSerialPolicy: true, // CRITICAL - Admin only
        
        // Master Data - Companies (ADMIN ONLY)
        canViewCompanies: true,
        canAddCompany: true,
        canEditCompany: true,
        canDeleteCompany: true,
        
        // Master Data - Units (ADMIN ONLY)
        canViewUnits: true,
        canManageUnits: true,
        
        // Stock Operations
        canStockIn: true,
        canStockOut: true,
        canViewStockLedger: true,
        canEditStock: false,  // ALWAYS FALSE - Ledger immutable
        canDeleteStock: false, // ALWAYS FALSE - Ledger immutable
        
        // Reporting - Full access
        canViewAllReports: true,
        canViewOwnReports: true,
        
        // System
        canAccessSettings: true,
        canViewAuditLogs: true
    },
    {
        role: 'MANAGER',
        // User Management - Users only
        canManageAdmins: false,
        canManageManagers: false,
        canManageUsers: true, // Can add users
        canActivateDeactivateManagers: false,
        canActivateDeactivateUsers: true, // Can activate/deactivate users
        
        // Master Data - View only
        canViewProducts: true,
        canAddProduct: false,
        canEditProduct: false,
        canDeleteProduct: false,
        canChangeSerialPolicy: false, // NEVER for Manager
        
        canViewCompanies: true,
        canAddCompany: false,
        canEditCompany: false,
        canDeleteCompany: false,
        
        canViewUnits: true,
        canManageUnits: false,
        
        // Stock Operations
        canStockIn: true,
        canStockOut: true,
        canViewStockLedger: true, // Own entries only
        canEditStock: false,
        canDeleteStock: false,
        
        // Reporting - Own data only
        canViewAllReports: false,
        canViewOwnReports: true,
        
        // System
        canAccessSettings: false,
        canViewAuditLogs: false
    },
    {
        role: 'USER',
        // User Management - None
        canManageAdmins: false,
        canManageManagers: false,
        canManageUsers: false,
        canActivateDeactivateManagers: false,
        canActivateDeactivateUsers: false,
        
        // Master Data - View only
        canViewProducts: true,
        canAddProduct: false,
        canEditProduct: false,
        canDeleteProduct: false,
        canChangeSerialPolicy: false,
        
        canViewCompanies: true,
        canAddCompany: false,
        canEditCompany: false,
        canDeleteCompany: false,
        
        canViewUnits: true,
        canManageUnits: false,
        
        // Stock Operations - Execute only
        canStockIn: true,
        canStockOut: true,
        canViewStockLedger: true, // Own entries only
        canEditStock: false,
        canDeleteStock: false,
        
        // Reporting - Own data only
        canViewAllReports: false,
        canViewOwnReports: true,
        
        // System
        canAccessSettings: false,
        canViewAuditLogs: false
    }
];

const seedPermissions = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const tenants = await Tenant.find({ isActive: true }).select('_id');
        for (const tenant of tenants) {
            for (const perm of defaultPermissions) {
                await Permission.findOneAndUpdate(
                    { role: perm.role, tenantId: tenant._id },
                    { ...perm, tenantId: tenant._id },
                    { upsert: true, new: true }
                );
                console.log(`✅ Seeded/Updated ${perm.role} permissions for tenant: ${tenant._id}`);
            }
        }

        console.log('\n🎉 Permission seeding complete!');
        console.log('\n📋 Permission Summary:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('ADMIN:   Full control, Master data, All reports');
        console.log('MANAGER: Add users, Stock IN/OUT, Own reports');
        console.log('USER:    Stock IN/OUT only, Own history');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  Stock Edit/Delete: DISABLED for ALL roles (Ledger-based)');
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
};

seedPermissions();
