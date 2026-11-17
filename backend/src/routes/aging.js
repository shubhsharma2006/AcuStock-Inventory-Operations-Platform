const express = require('express');
const mongoose = require('mongoose');
const AgingReportService = require('../services/agingReport.service');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * Helper to build inventory snapshot with last movement date
 */
async function getInventorySnapshot(tenantId, warehouseId = null) {
  const match = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
    isDeleted: { $ne: true }
  };
  if (warehouseId) match.warehouseId = new mongoose.Types.ObjectId(warehouseId);

  const balances = await StockLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$productId',
        onHandQty: {
          $sum: {
            $cond: [
              { $in: ['$type', ['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN']] },
              '$quantity',
              { $multiply: ['$quantity', -1] }
            ]
          }
        },
        lastMovementDate: { $max: '$createdAt' }
      }
    },
    { $match: { onHandQty: { $gt: 0 } } }
  ]);

  const productIds = balances.map(b => b._id);
  const items = await Item.find({ _id: { $in: productIds }, tenantId }).lean();
  const itemMap = new Map(items.map(i => [i._id.toString(), i]));

  const now = new Date();
  return balances.map(b => {
    const item = itemMap.get(b._id.toString()) || {};
    const unitCost = item.currentWAC || item.purchasePrice || 0;
    const totalValue = Math.round((b.onHandQty * unitCost) * 100) / 100;
    const daysSinceLastMovement = b.lastMovementDate
      ? Math.floor((now.getTime() - new Date(b.lastMovementDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    return {
      productId: b._id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      onHandQty: b.onHandQty,
      unitCost,
      totalValue,
      lastMovementDate: b.lastMovementDate,
      daysSinceLastMovement,
      agingBucket: AgingReportService.getAgingBucket(daysSinceLastMovement)
    };
  });
}

/**
 * GET /api/reports/aging
 * Inventory aging report categorized by days since last movement
 */
router.get('/aging', requireAuth, async (req, res) => {
  try {
    const { warehouseId } = req.query;
    const items = await getInventorySnapshot(req.tenantId, warehouseId);

    const buckets = {
      '0-30': { count: 0, units: 0, value: 0, items: [] },
      '31-60': { count: 0, units: 0, value: 0, items: [] },
      '61-90': { count: 0, units: 0, value: 0, items: [] },
      '91-180': { count: 0, units: 0, value: 0, items: [] },
      '180+': { count: 0, units: 0, value: 0, items: [] }
    };

    items.forEach(item => {
      const b = buckets[item.agingBucket];
      if (b) {
        b.count++;
        b.units += item.onHandQty;
        b.value = Math.round((b.value + item.totalValue) * 100) / 100;
        b.items.push(item);
      }
    });

    res.json({
      success: true,
      totalItems: items.length,
      buckets
    });
  } catch (error) {
    logger.error('Error generating aging report', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/reports/abc-analysis
 * ABC classification based on cumulative value contribution
 */
router.get('/abc-analysis', requireAuth, async (req, res) => {
  try {
    const { warehouseId } = req.query;
    const items = await getInventorySnapshot(req.tenantId, warehouseId);
    const analysis = AgingReportService.calculateABCClassification(items);
    res.json({ success: true, ...analysis });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/reports/dead-stock
 * Identify items with zero movement past threshold
 */
router.get('/dead-stock', requireAuth, async (req, res) => {
  try {
    const { warehouseId, threshold = 180 } = req.query;
    const items = await getInventorySnapshot(req.tenantId, warehouseId);
    const deadStockReport = AgingReportService.filterDeadStock(items, parseInt(threshold, 10) || 180);
    res.json({ success: true, ...deadStockReport });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/reports/turnover
 * Annualized inventory turnover ratio & DSI
 */
router.get('/turnover', requireAuth, async (req, res) => {
  try {
    const { warehouseId, days = 365 } = req.query;
    const lookbackDays = parseInt(days, 10) || 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    const matchOut = {
      tenantId: new mongoose.Types.ObjectId(req.tenantId),
      type: { $in: ['OUT', 'TRANSFER_OUT'] },
      createdAt: { $gte: startDate },
      isDeleted: { $ne: true }
    };
    if (warehouseId) matchOut.warehouseId = new mongoose.Types.ObjectId(warehouseId);

    // Sum COGS over lookback period
    const cogsAgg = await StockLedger.aggregate([
      { $match: matchOut },
      {
        $lookup: {
          from: 'items',
          localField: 'productId',
          foreignField: '_id',
          as: 'item'
        }
      },
      { $unwind: '$item' },
      {
        $group: {
          _id: null,
          totalCogs: {
            $sum: {
              $multiply: [
                '$quantity',
                { $ifNull: ['$item.currentWAC', { $ifNull: ['$item.purchasePrice', 0] }] }
              ]
            }
          }
        }
      }
    ]);

    const totalCogs = cogsAgg[0]?.totalCogs || 0;
    const items = await getInventorySnapshot(req.tenantId, warehouseId);
    const currentInventoryValue = items.reduce((sum, i) => sum + i.totalValue, 0);

    const turnover = AgingReportService.calculateTurnover(totalCogs, currentInventoryValue);
    res.json({ success: true, lookbackDays, ...turnover });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

