/**
 * Demand Forecasting & Statistical Inventory Planning Routes
 * ────────────────────────────────────────────────────────────
 * Production-grade statistical engine implementing:
 * - Average Daily Demand (ADD / ADU) based on 30/60/90-day ledger history
 * - Normal-distribution Safety Stock calculation (95% confidence level, Z=1.65)
 * - Deterministic Reorder Point (ROP) = (LeadTime × ADD) + SafetyStock
 * - Projected Stockout Horizons & Recommended Order Quantities (ROQ)
 *
 * GET /api/forecasts/reorder-recommendations   → All items evaluated against ROP
 * GET /api/forecasts/demand/:productId         → 30-day historical + 14-day projection
 */

const express = require('express');
const mongoose = require('mongoose');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Helper: Calculate standard deviation of an array of numbers
 */
function calculateStdDev(values, mean) {
  if (!values || values.length === 0) return 0;
  const squareDiffs = values.map(val => Math.pow(val - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

// ── GET /api/forecasts/reorder-recommendations ──────────────────────────────
router.get('/reorder-recommendations', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};
    const lookbackDays = Math.min(180, Math.max(14, parseInt(req.query.days) || 60));
    const defaultLeadTimeDays = 7;
    const reviewPeriodDays = 14;
    const zScore95 = 1.65; // 95% service level confidence multiplier

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    // 1. Fetch all items for this tenant
    const items = await Item.find({ ...tenantFilter, isDeleted: { $ne: true } })
      .select('name shortName sku uom lowStockThreshold serialPolicy')
      .lean();

    if (items.length === 0) {
      return res.json({ success: true, recommendations: [], lookbackDays });
    }

    const itemIds = items.map(i => i._id);

    // 2. Fetch current stock balance per item (from ledger)
    const stockBalance = await StockLedger.aggregate([
      { $match: { ...tenantFilter, productId: { $in: itemIds } } },
      {
        $group: {
          _id: '$productId',
          totalIn: {
            $sum: {
              $cond: [{ $in: ['$type', ['IN', 'TRANSFER_IN']] }, '$quantity', 0]
            }
          },
          totalOut: {
            $sum: {
              $cond: [{ $in: ['$type', ['OUT', 'TRANSFER_OUT']] }, '$quantity', 0]
            }
          }
        }
      }
    ]);

    const stockMap = new Map();
    stockBalance.forEach(b => {
      stockMap.set(b._id.toString(), Math.max(0, (b.totalIn || 0) - (b.totalOut || 0)));
    });

    // 3. Aggregate daily OUT consumption over lookback period
    const dailyOutflows = await StockLedger.aggregate([
      {
        $match: {
          ...tenantFilter,
          productId: { $in: itemIds },
          type: { $in: ['OUT', 'TRANSFER_OUT'] },
          createdAt: { $gte: startDate }
        }
      },
      {
        $project: {
          productId: 1,
          quantity: 1,
          dateStr: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          }
        }
      },
      {
        $group: {
          _id: { productId: '$productId', date: '$dateStr' },
          dailyQuantity: { $sum: '$quantity' }
        }
      }
    ]);

    // Group daily consumption per product
    const productDailyOutMap = new Map();
    dailyOutflows.forEach(row => {
      const pId = row._id.productId.toString();
      if (!productDailyOutMap.has(pId)) {
        productDailyOutMap.set(pId, []);
      }
      productDailyOutMap.get(pId).push(row.dailyQuantity);
    });

    // 4. Compute statistical ROP and recommendations
    const recommendations = items.map(item => {
      const pId = item._id.toString();
      const currentStock = stockMap.get(pId) || 0;
      const dailyUsageList = productDailyOutMap.get(pId) || [];

      // Total quantity moved in window
      const totalOutInWindow = dailyUsageList.reduce((acc, q) => acc + q, 0);

      // Average Daily Demand (ADD)
      const add = Number((totalOutInWindow / lookbackDays).toFixed(2));

      // Calculate standard deviation across lookback days (including 0-usage days)
      const zeroDays = Math.max(0, lookbackDays - dailyUsageList.length);
      const allDaysUsage = [...dailyUsageList, ...Array(zeroDays).fill(0)];
      const stdDev = calculateStdDev(allDaysUsage, add);

      // Safety Stock = Z * stdDev * sqrt(LeadTime)
      const safetyStock = Math.ceil(zScore95 * stdDev * Math.sqrt(defaultLeadTimeDays));

      // Reorder Point = (LeadTime * ADD) + SafetyStock
      const leadTimeDemand = add * defaultLeadTimeDays;
      const reorderPoint = Math.max(item.lowStockThreshold || 10, Math.ceil(leadTimeDemand + safetyStock));

      // Days until stockout
      const daysUntilStockout = add > 0 ? Number((currentStock / add).toFixed(1)) : 999;

      // Recommended Order Quantity (ROQ)
      // If below ROP, order enough to cover leadTime + reviewPeriod + safetyStock
      let suggestedOrderQty = 0;
      let urgency = 'HEALTHY';

      if (currentStock <= 0) {
        urgency = 'CRITICAL';
        suggestedOrderQty = Math.ceil((add * (defaultLeadTimeDays + reviewPeriodDays)) + safetyStock);
      } else if (currentStock <= reorderPoint || daysUntilStockout <= defaultLeadTimeDays) {
        urgency = daysUntilStockout <= defaultLeadTimeDays ? 'CRITICAL' : 'WARNING';
        suggestedOrderQty = Math.max(1, Math.ceil((reorderPoint - currentStock) + (add * reviewPeriodDays)));
      }

      return {
        productId: item._id,
        name: item.name,
        shortName: item.shortName,
        sku: item.sku || '—',
        uom: item.uom || 'PCS',
        currentStock,
        averageDailyDemand: add,
        dailyVolatilityStdDev: Number(stdDev.toFixed(2)),
        safetyStock,
        leadTimeDays: defaultLeadTimeDays,
        reorderPoint,
        daysUntilStockout: daysUntilStockout === 999 ? '90+' : daysUntilStockout,
        suggestedOrderQty,
        urgency
      };
    });

    // Sort by urgency: CRITICAL first, then WARNING, then HEALTHY
    const urgencyOrder = { CRITICAL: 0, WARNING: 1, HEALTHY: 2 };
    recommendations.sort((a, b) => {
      const cmp = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (cmp !== 0) return cmp;
      return (a.daysUntilStockout === '90+' ? 999 : Number(a.daysUntilStockout)) -
             (b.daysUntilStockout === '90+' ? 999 : Number(b.daysUntilStockout));
    });

    res.json({
      success: true,
      lookbackDays,
      recommendations
    });
  } catch (err) {
    logger.error('Error generating reorder recommendations:', err);
    res.status(500).json({ success: false, error: 'Failed to compute forecasting recommendations' });
  }
});

// ── GET /api/forecasts/demand/:productId ────────────────────────────────────
router.get('/demand/:productId', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, error: 'Invalid productId' });
    }

    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};
    const item = await Item.findOne({ _id: productId, ...tenantFilter }).select('name sku uom');
    if (!item) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const past30Days = new Date();
    past30Days.setDate(past30Days.getDate() - 30);

    // Fetch daily outflows
    const dailyData = await StockLedger.aggregate([
      {
        $match: {
          ...tenantFilter,
          productId: new mongoose.Types.ObjectId(productId),
          type: { $in: ['OUT', 'TRANSFER_OUT'] },
          createdAt: { $gte: past30Days }
        }
      },
      {
        $project: {
          quantity: 1,
          dateStr: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
        }
      },
      {
        $group: {
          _id: '$dateStr',
          actualOut: { $sum: '$quantity' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const actualMap = new Map();
    dailyData.forEach(d => actualMap.set(d._id, d.actualOut));

    // Build complete 30-day timeline
    const history = [];
    let total30Day = 0;

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const val = actualMap.get(key) || 0;
      history.push({ date: key, demand: val });
      total30Day += val;
    }

    const averageDaily = Number((total30Day / 30).toFixed(2));

    // Build 14-day projection using Exponential Moving Average
    const projection = [];
    let prevForecast = averageDaily;
    const alpha = 0.25; // smoothing constant

    for (let j = 1; j <= 14; j++) {
      const d = new Date();
      d.setDate(d.getDate() + j);
      const key = d.toISOString().slice(0, 10);
      const projectedVal = Math.max(0, Math.round(prevForecast));
      projection.push({ date: key, forecastDemand: projectedVal });
      prevForecast = (alpha * projectedVal) + ((1 - alpha) * prevForecast);
    }

    res.json({
      success: true,
      product: item,
      averageDailyDemand: averageDaily,
      history,
      projection
    });
  } catch (err) {
    logger.error('Error fetching demand forecast:', err);
    res.status(500).json({ success: false, error: 'Failed to compute demand forecast' });
  }
});

module.exports = router;
