const express = require('express');
const mongoose = require('mongoose');
const Item = require('../models/Item');
const PurchaseOrder = require('../models/PurchaseOrder');
const StockLedger = require('../models/StockLedger');
const Company = require('../models/Company');
const Warehouse = require('../models/Warehouse');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logBusinessEvent } = require('../utils/auditHelper');

const router = express.Router();

/**
 * GET /api/reorder/alerts
 * Scans all items across tenant and identifies low-stock items
 */
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const items = await Item.find({ tenantId, isActive: true })
      .populate('preferredSupplierId', 'name email phone')
      .lean();

    const alerts = [];
    let totalEstimatedCost = 0;
    const supplierSet = new Set();

    for (const item of items) {
      const matchFilter = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        productId: new mongoose.Types.ObjectId(item._id),
        isDeleted: false
      };

      const ledgerAgg = await StockLedger.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [
                  { $in: ['$type', ['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN']] },
                  '$quantity',
                  { $multiply: ['$quantity', -1] }
                ]
              }
            }
          }
        }
      ]);

      const currentStock = ledgerAgg.length > 0 ? Math.max(0, ledgerAgg[0].total) : 0;
      const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;

      if (currentStock <= threshold) {
        const reorderQty = item.reorderQuantity || 20;
        const suggestedOrderQty = Math.max(reorderQty, threshold * 2 - currentStock);
        const costPrice = item.purchasePrice || item.salesPrice || 0;
        const estCost = suggestedOrderQty * costPrice;

        totalEstimatedCost += estCost;
        if (item.preferredSupplierId?.name) {
          supplierSet.add(item.preferredSupplierId.name);
        }

        alerts.push({
          productId: item._id,
          name: item.name,
          sku: item.sku || '',
          trackingMode: item.trackingMode,
          currentStock,
          lowStockThreshold: threshold,
          reorderQuantity: reorderQty,
          suggestedOrderQty,
          unitCost: costPrice,
          estimatedCost: estCost,
          autoPoEnabled: Boolean(item.autoPoEnabled),
          preferredSupplier: item.preferredSupplierId
            ? {
                _id: item.preferredSupplierId._id,
                name: item.preferredSupplierId.name,
                email: item.preferredSupplierId.email,
                phone: item.preferredSupplierId.phone
              }
            : null
        });
      }
    }

    res.json({
      alerts,
      summary: {
        totalLowStockCount: alerts.length,
        totalEstimatedCost,
        suppliersCount: supplierSet.size
      }
    });
  } catch (error) {
    console.error('Error fetching reorder alerts:', error);
    res.status(500).json({ message: 'Failed to retrieve reorder alerts' });
  }
});

/**
 * POST /api/reorder/generate-pos
 * Batch generates draft Purchase Orders for selected low-stock items grouped by preferred supplier
 */
router.post('/generate-pos', requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const { selectedItemIds } = req.body;
    if (!Array.isArray(selectedItemIds) || selectedItemIds.length === 0) {
      return res.status(400).json({ message: 'No items selected for procurement generation' });
    }

    const items = await Item.find({
      _id: { $in: selectedItemIds },
      tenantId
    }).populate('preferredSupplierId').lean();

    if (items.length === 0) {
      return res.status(404).json({ message: 'No matching items found' });
    }

    // Default receiving warehouse
    const primaryWarehouse = await Warehouse.findOne({ tenantId, isPrimary: true }) || await Warehouse.findOne({ tenantId });

    // Group items by supplier ID (or 'UNASSIGNED')
    const grouped = new Map();
    for (const item of items) {
      const supplierKey = item.preferredSupplierId?._id ? item.preferredSupplierId._id.toString() : 'UNASSIGNED';
      if (!grouped.has(supplierKey)) {
        grouped.set(supplierKey, {
          supplier: item.preferredSupplierId || { name: 'Direct Sourcing / General Supplier' },
          items: []
        });
      }
      grouped.get(supplierKey).items.push(item);
    }

    const createdPOs = [];

    for (const [key, group] of grouped.entries()) {
      const poItems = group.items.map(item => {
        const qty = item.reorderQuantity || 20;
        const unitPrice = item.purchasePrice || item.salesPrice || 0;
        return {
          productId: item._id,
          quantity: qty,
          unitPrice,
          lineTotal: qty * unitPrice
        };
      });

      const today = new Date();
      const expectedDelivery = new Date(Date.now() + 86400000 * 5); // 5 days lead time default

      const po = await PurchaseOrder.create({
        tenantId,
        supplier: {
          name: group.supplier.name || 'Direct Supplier',
          email: group.supplier.email || '',
          phone: group.supplier.phone || ''
        },
        items: poItems,
        status: 'draft',
        expectedDeliveryDate: expectedDelivery,
        notes: `Automated replenishment PO generated from Reorder Command Hub.`,
        createdBy: req.user._id
      });

      createdPOs.push({
        _id: po._id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        lineCount: po.items.length,
        totalValue: po.totalValue
      });
    }

    // Audit log
    await logBusinessEvent({
      tenantId,
      eventType: 'BULK_PO_GENERATION',
      entityId: createdPOs[0]?._id,
      entityType: 'PurchaseOrder',
      userId: req.user._id,
      details: {
        poCount: createdPOs.length,
        pos: createdPOs
      }
    });

    res.status(201).json({
      success: true,
      message: `Generated ${createdPOs.length} draft purchase orders.`,
      purchaseOrders: createdPOs
    });
  } catch (error) {
    console.error('Error generating bulk POs:', error);
    res.status(500).json({ message: error.message || 'Failed to generate purchase orders' });
  }
});

module.exports = router;
