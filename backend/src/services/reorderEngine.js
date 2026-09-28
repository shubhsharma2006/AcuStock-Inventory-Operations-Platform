const mongoose = require('mongoose');
const Item = require('../models/Item');
const PurchaseOrder = require('../models/PurchaseOrder');
const StockLedger = require('../models/StockLedger');
const Counter = require('../models/Counter');
const { notifyRoles } = require('./notificationHelper');

/**
 * Checks item stock level and automatically triggers a draft PO
 * if stock falls below threshold and auto-PO is enabled.
 *
 * @param {string|ObjectId} itemId
 * @param {string|ObjectId} tenantId
 * @param {string|ObjectId} userId
 * @returns {Promise<Object|null>} The created PurchaseOrder or null
 */
async function checkAndTriggerAutoPo(itemId, tenantId, userId) {
  try {
    if (!tenantId) {
      return null;
    }

    const item = await Item.findOne({ _id: itemId, tenantId });
    if (!item || !item.autoPoEnabled || !item.preferredSupplierId) {
      return null;
    }

    // 1. Calculate current tenant stock
    const matchFilter = {
      productId: new mongoose.Types.ObjectId(itemId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      isDeleted: false
    };

    const stockAgg = await StockLedger.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [{ $in: ['$type', ['IN', 'TRANSFER_IN']] }, '$quantity', { $multiply: ['$quantity', -1] }]
            }
          }
        }
      }
    ]);

    const currentStock = stockAgg.length > 0 ? stockAgg[0].total : 0;
    const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;

    if (currentStock > threshold) {
      return null; // Stock is above reorder point
    }

    // 2. Deduplication check: prevent duplicate draft PO within past 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existingPoFilter = {
      tenantId,
      status: { $in: ['draft', 'approved', 'sent'] },
      'items.product': item._id,
      createdAt: { $gte: sevenDaysAgo }
    };

    const existingPo = await PurchaseOrder.findOne(existingPoFilter);
    if (existingPo) {
      return null; // Active PO already exists
    }

    // 3. Generate PO sequence
    let poNumber;
    try {
      poNumber = await Counter.getNextSequence(tenantId, 'PO', 'PO', 6);
    } catch {
      poNumber = `PO-${Date.now().toString().slice(-6)}`;
    }

    const orderQty = item.reorderQuantity || 20;
    const unitPrice = item.purchasePrice || 0;
    const totalValue = orderQty * unitPrice;

    // 4. Create Draft Purchase Order
    const po = new PurchaseOrder({
      poNumber,
      supplier: item.preferredSupplierId,
      status: 'draft',
      items: [
        {
          product: item._id,
          quantity: orderQty,
          unitPrice,
          receivedQuantity: 0
        }
      ],
      totalValue,
      notes: `Automated reorder: ${item.name} fell to ${currentStock} units (threshold: ${threshold})`,
      createdBy: userId || null,
      tenantId
    });

    await po.save();

    // 5. Notify Admins & Managers
    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'low_stock',
      title: `Auto-PO Draft Created: ${po.poNumber}`,
      message: `Draft PO created for ${item.name} (${currentStock} left in stock). Review and approve.`,
      link: 'purchase-orders',
      priority: 'HIGH',
      tenantId,
      createdBy: userId || null,
      createdByRole: 'SYSTEM',
      metadata: {
        poNumber: po.poNumber,
        productId: item._id,
        currentStock,
        reorderQuantity: orderQty
      }
    }).catch(() => {});

    return po;
  } catch (err) {
    console.error('Error in checkAndTriggerAutoPo:', err);
    return null;
  }
}

module.exports = { checkAndTriggerAutoPo };
