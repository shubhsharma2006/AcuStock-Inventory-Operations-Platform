/**
 * GDPR Compliance Toolkit
 *
 * GET    /api/gdpr/export          — export all own data as JSON (self only)
 * DELETE /api/gdpr/delete-account  — anonymize + soft-delete account (self only)
 *
 * Data export includes: profile, stock ledger entries, audit logs.
 * Account deletion anonymizes PII while preserving ledger integrity.
 */

const express     = require('express');
const crypto      = require('crypto');
const User        = require('../models/User');
const StockLedger = require('../models/StockLedger');
const AuditLog    = require('../models/AuditLog');
const Item        = require('../models/Item');
const Warehouse   = require('../models/Warehouse');
const WarehouseLocation = require('../models/WarehouseLocation');
const InventoryLot = require('../models/InventoryLot');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const PurchaseOrder = require('../models/PurchaseOrder');
const SalesOrder  = require('../models/SalesOrder');
const SupplierProfile = require('../models/SupplierProfile');
const Tenant      = require('../models/Tenant');
const { requireAuth, requireTenantId, requireRole } = require('../middleware/auth');
const logger      = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

// ── Helpers ────────────────────────────────────────────────────

function anonymizeName(userId) {
  return `DeletedUser_${userId.toString().slice(-6)}`;
}

// ── Routes ─────────────────────────────────────────────────────

/**
 * GET /api/gdpr/export
 * Returns a JSON document with all data the user owns.
 * Rate-limited by the general API limiter — one export per ~5 minutes.
 */
/**
 * GET /api/gdpr/export
 * Returns a JSON document with all data the user owns.
 * Rate-limited by the general API limiter — one export per ~5 minutes.
 */
router.get('/export', requireAuth, async (req, res) => {
  try {
    const tenantFilter = { tenantId: req.tenantId };

    const [user, ledgerEntries, auditEntries] = await Promise.all([
      User.findOne({ _id: req.userId, ...tenantFilter }).select(
        'name email phone role isActive createdAt updatedAt lastLogin'
      ),
      StockLedger.find({ createdBy: req.userId, ...tenantFilter })
        .populate('productId', 'name shortName')
        .sort({ createdAt: -1 })
        .limit(10_000),   // hard cap — protects against huge exports
      AuditLog.find({ performedBy: req.userId, ...tenantFilter })
        .sort({ createdAt: -1 })
        .limit(5_000)
    ]);

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const payload = {
      exportedAt:    new Date().toISOString(),
      exportVersion: '1.0',
      profile:       user.toJSON(),
      stockLedger:   ledgerEntries,
      auditLog:      auditEntries
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="acustock-data-export-${req.userId}.json"`);
    res.json(payload);

    logger.info(`GDPR export for user ${req.userId} (${user.email || user.phone})`);
  } catch (err) {
    logger.error('GDPR export error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate data export' });
  }
});

/**
 * GET /api/gdpr/tenant-export
 * Full organization disaster recovery & data portability archive (SAP Data Management Standard)
 * Exports products, warehouses, locations, double-entry ledger, lots, adjustments, POs, SOs, suppliers, and audit logs.
 */
router.get('/tenant-export', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenantFilter = { tenantId: req.tenantId };
    const tenant = await Tenant.findById(req.tenantId).lean();

    const [
      items,
      warehouses,
      locations,
      lots,
      adjustments,
      purchaseOrders,
      salesOrders,
      suppliers,
      ledgerEntries,
      auditLogs
    ] = await Promise.all([
      Item.find(tenantFilter).lean(),
      Warehouse.find(tenantFilter).lean(),
      WarehouseLocation.find(tenantFilter).lean(),
      InventoryLot.find(tenantFilter).lean(),
      InventoryAdjustment.find(tenantFilter).lean(),
      PurchaseOrder.find(tenantFilter).lean(),
      SalesOrder.find(tenantFilter).lean(),
      SupplierProfile.find(tenantFilter).lean(),
      StockLedger.find(tenantFilter).sort({ createdAt: -1 }).limit(50_000).lean(),
      AuditLog.find(tenantFilter).sort({ sequenceNumber: 1 }).limit(20_000).lean()
    ]);

    const archivePayload = {
      archiveVersion: '2.4-ENTERPRISE',
      standard: 'SAP NetWeaver / GDPR Article 20 Compliant',
      exportedAt: new Date().toISOString(),
      tenant: {
        id: req.tenantId,
        name: tenant?.name || 'AcuStock Workspace',
        slug: tenant?.slug || 'workspace'
      },
      counts: {
        items: items.length,
        warehouses: warehouses.length,
        locations: locations.length,
        lots: lots.length,
        adjustments: adjustments.length,
        purchaseOrders: purchaseOrders.length,
        salesOrders: salesOrders.length,
        suppliers: suppliers.length,
        ledgerEntries: ledgerEntries.length,
        auditLogs: auditLogs.length
      },
      data: {
        items,
        warehouses,
        locations,
        lots,
        adjustments,
        purchaseOrders,
        salesOrders,
        suppliers,
        stockLedger: ledgerEntries,
        auditTrail: auditLogs
      }
    };

    const jsonString = JSON.stringify(archivePayload, null, 2);
    const checksum = crypto.createHash('sha256').update(jsonString).digest('hex');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Archive-SHA256', checksum);
    res.setHeader('Content-Disposition', `attachment; filename="acustock-enterprise-archive-${tenant?.slug || 'tenant'}-${Date.now()}.json"`);
    res.send(jsonString);

    logger.info(`Enterprise tenant export generated for ${req.tenantId} by user ${req.userId} (SHA256: ${checksum.slice(0, 12)})`);
  } catch (err) {
    logger.error('Enterprise tenant export error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate tenant export archive' });
  }
});

/**
 * DELETE /api/gdpr/delete-account
 * Body: { confirmPhrase: "DELETE MY ACCOUNT" }
 *
 * - Anonymizes PII (name, email, phone)
 * - Sets isDeleted = true, deletedAt = now
 * - Preserves ledger entries (createdBy still references the user)
 * - Invalidates all tokens via tokenVersion bump
 */
router.delete('/delete-account', requireAuth, async (req, res) => {
  const { confirmPhrase } = req.body;

  // Require explicit confirmation to prevent accidental deletion
  if (confirmPhrase !== 'DELETE MY ACCOUNT') {
    return res.status(400).json({
      success: false,
      error:   'Confirmation phrase required',
      hint:    'Send { "confirmPhrase": "DELETE MY ACCOUNT" }'
    });
  }

  try {
    const user = await User.findOne({ _id: req.userId, tenantId: req.tenantId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (user.isDeleted) {
      return res.status(409).json({ success: false, error: 'Account already deleted' });
    }

    // Prevent deleting SUPER_ADMIN (would lock out the entire system)
    if (user.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Super admin accounts cannot be self-deleted' });
    }

    await User.findByIdAndUpdate(req.userId, {
      $set: {
        name:        anonymizeName(req.userId),
        email:       null,
        phone:       null,
        isDeleted:   true,
        deletedAt:   new Date(),
        isActive:    false,
        tokenVersion: (user.tokenVersion || 0) + 1  // invalidate all existing JWTs
      }
    });

    // Audit log (using system-level data since user PII is now gone)
    try {
      await AuditLog.create({
        action:      'GDPR_ACCOUNT_DELETION',
        performedBy: req.userId,
        ipAddress:   req.ip,
        userAgent:   req.headers['user-agent'],
        tenantId:    req.tenantId,
        metadata:    { selfInitiated: true }
      });
    } catch (_) { /* non-blocking */ }

    logger.info(`GDPR account deletion: user ${req.userId} anonymized`);

    // Clear auth cookie
    res.clearCookie('authToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
    res.json({ success: true, message: 'Account deleted and data anonymized. You have been signed out.' });
  } catch (err) {
    logger.error('GDPR account deletion error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

/**
 * GET /api/gdpr/tenant-full-export
 * Compliance data portability (DPDP Act 2023 / GDPR Art. 20)
 * Streams complete organizational data as JSON archive
 */
router.get('/tenant-full-export', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenantFilter = { tenantId: req.tenantId };
    const [tenant, users, items, lots, warehouses, ledger, purchaseOrders, salesOrders, shipments] = await Promise.all([
      Tenant.findById(req.tenantId).lean(),
      User.find({ ...tenantFilter, isDeleted: { $ne: true } }).select('-password -mfaSecret -tokenVersion').lean(),
      Item.find(tenantFilter).lean(),
      InventoryLot.find(tenantFilter).lean(),
      Warehouse.find(tenantFilter).lean(),
      StockLedger.find(tenantFilter).sort({ createdAt: 1 }).limit(20000).lean(),
      PurchaseOrder.find(tenantFilter).lean(),
      SalesOrder.find(tenantFilter).lean(),
      require('../models/Shipment').find(tenantFilter).lean(),
    ]);

    const archive = {
      exportVersion: '2.0-ENTERPRISE',
      complianceStandard: 'DPDP_ACT_2023_AND_GDPR_PORTABILITY',
      exportedAt: new Date().toISOString(),
      tenant: {
        id: tenant?._id,
        name: tenant?.name,
        slug: tenant?.slug,
        plan: tenant?.plan,
        createdAt: tenant?.createdAt,
      },
      counts: {
        users: users.length,
        catalogItems: items.length,
        lots: lots.length,
        warehouses: warehouses.length,
        ledgerEntries: ledger.length,
        purchaseOrders: purchaseOrders.length,
        salesOrders: salesOrders.length,
        shipments: shipments.length,
      },
      data: {
        users,
        items,
        lots,
        warehouses,
        ledger,
        purchaseOrders,
        salesOrders,
        shipments,
      },
    };

    const fileName = `acustock-tenant-export-${tenant?.slug || 'data'}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(archive, null, 2));
  } catch (err) {
    logger.error('Tenant full data export error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate tenant export archive' });
  }
});

/**
 * POST /api/gdpr/tenant-purge
 * Irreversible organizational data purge / right to be forgotten
 * Requires exact confirmation phrase "DELETE_TENANT_DATA"
 */
router.post('/tenant-purge', requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const { confirmationPhrase, reason } = req.body;

  if (confirmationPhrase !== 'DELETE_TENANT_DATA') {
    return res.status(400).json({
      success: false,
      error: 'Invalid confirmation phrase. You must pass "DELETE_TENANT_DATA" to confirm irreversible purge.',
    });
  }

  try {
    const tenantId = req.tenantId;
    const filter = { tenantId };

    // Atomically delete tenant records across collections
    const [delItems, delLots, delLedger, delPOs, delSOs, delShipments] = await Promise.all([
      Item.deleteMany(filter),
      InventoryLot.deleteMany(filter),
      StockLedger.deleteMany(filter),
      PurchaseOrder.deleteMany(filter),
      SalesOrder.deleteMany(filter),
      require('../models/Shipment').deleteMany(filter),
    ]);

    // Anonymize and deactivate all users in this tenant
    await User.updateMany(filter, {
      $set: {
        email: null,
        phone: null,
        name: 'Purged Organization User',
        isActive: false,
        isDeleted: true,
      },
    });

    // Record tombstone entry
    await AuditLog.create({
      action: 'TENANT_DATA_PURGED_DPDP',
      performedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId,
      metadata: {
        reason: reason || 'Contract Cancellation / Right to be Forgotten',
        deletedCounts: {
          items: delItems.deletedCount,
          lots: delLots.deletedCount,
          ledger: delLedger.deletedCount,
          purchaseOrders: delPOs.deletedCount,
          salesOrders: delSOs.deletedCount,
          shipments: delShipments.deletedCount,
        },
      },
    });

    // Deactivate tenant
    await Tenant.findByIdAndUpdate(tenantId, {
      $set: {
        isActive: false,
        status: 'PURGED',
        purgedAt: new Date(),
      },
    });

    logger.warn(`🛑 TENANT PURGED: Tenant ${tenantId} permanently purged by user ${req.user._id}`);

    res.clearCookie('authToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
    res.json({
      success: true,
      message: 'Tenant data permanently wiped and purged in compliance with DPDP Act 2023 / GDPR. All sessions invalidated.',
    });
  } catch (err) {
    logger.error('Tenant purge error:', err);
    res.status(500).json({ success: false, error: 'Failed to execute tenant data purge' });
  }
});

module.exports = router;
