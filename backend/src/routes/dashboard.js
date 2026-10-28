const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Item = require('../models/Item');
const Tenant = require('../models/Tenant');
const Notification = require('../models/Notification');
const PurchaseOrder = require('../models/PurchaseOrder');
const SalesOrder = require('../models/SalesOrder');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/dashboard/bootstrap
 * High-performance consolidated endpoint to hydrate full dashboard state in 1 round trip.
 * Reduces client startup waterfall from 5 requests to 1.
 */
router.get('/bootstrap', requireAuth, requireTenantId, async (req, res) => {
  try {
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};
    const tenantObjectId = req.tenantId && mongoose.Types.ObjectId.isValid(req.tenantId)
      ? new mongoose.Types.ObjectId(req.tenantId)
      : null;

    // Run parallel queries across MongoDB
    const [
      itemStats,
      poCount,
      soCount,
      unreadCount,
      tenantDoc
    ] = await Promise.all([
      // 1. Aggregation for total items, valuation at cost, and low stock count
      Item.aggregate([
        { $match: { isDeleted: { $ne: true }, ...(tenantObjectId ? { tenantId: tenantObjectId } : {}) } },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            valuationCost: { $sum: { $multiply: ['$quantity', { $ifNull: ['$price', 0] }] } },
            totalUnits: { $sum: '$quantity' },
            lowStockCount: {
              $sum: {
                $cond: [{ $lte: ['$quantity', { $ifNull: ['$reorderLevel', 10] }] }, 1, 0]
              }
            }
          }
        }
      ]),

      // 2. Open Purchase Orders count
      PurchaseOrder.countDocuments({
        ...tenantFilter,
        status: { $in: ['draft', 'approved', 'sent', 'partially_received'] }
      }).catch(() => 0),

      // 3. Open Sales Orders count
      SalesOrder.countDocuments({
        ...tenantFilter,
        status: { $in: ['draft', 'confirmed', 'processing', 'partially_shipped'] }
      }).catch(() => 0),

      // 4. Unread notifications for this user
      Notification.countDocuments({
        userId: req.userId,
        isRead: false
      }).catch(() => 0),

      // 5. Tenant info if not already loaded
      req.tenant ? Promise.resolve(req.tenant) : Tenant.findById(req.tenantId).lean()
    ]);

    const stats = itemStats[0] || {
      totalItems: 0,
      valuationCost: 0,
      totalUnits: 0,
      lowStockCount: 0
    };

    return res.json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.userRole,
        isSuperAdmin: req.userRole === 'SUPER_ADMIN',
        isImpersonated: !!req.isImpersonated,
        impersonationMode: req.impersonationMode || null,
        impersonator: req.impersonator || null,
        tenantId: req.tenantId || null
      },
      tenant: tenantDoc ? {
        _id: tenantDoc._id,
        name: tenantDoc.name,
        slug: tenantDoc.slug,
        currency: tenantDoc.currency || 'INR',
        status: tenantDoc.status
      } : null,
      kpiSummary: {
        valuationAtCost: stats.valuationCost || 0,
        totalProducts: stats.totalItems || 0,
        totalStockUnits: stats.totalUnits || 0,
        criticalStockouts: stats.lowStockCount || 0,
        pendingPOsCount: poCount || 0,
        pendingSOsCount: soCount || 0
      },
      unreadNotificationsCount: unreadCount || 0,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Dashboard bootstrap error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to bootstrap dashboard'
    });
  }
});

module.exports = router;
