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
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

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
    const tenantId = req.tenantId;
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const lookbackDays = Math.min(180, Math.max(14, parseInt(req.query.days) || 60));
    const defaultLeadTimeDays = 7;
    const reviewPeriodDays = 14;
    const zScore95 = 1.65; // 95% service level confidence multiplier

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    // 1. Fetch all items for this tenant
    const items = await Item.find({ tenantId, isDeleted: { $ne: true } })
      .select('name shortName sku uom lowStockThreshold serialPolicy')
      .lean();

    if (items.length === 0) {
      return res.json({ success: true, recommendations: [], lookbackDays });
    }

    const itemIds = items.map(i => i._id);

    // 2. Fetch current stock balance per item (from ledger)
    const stockBalance = await StockLedger.aggregate([
      { $match: { tenantId: tenantObjectId, productId: { $in: itemIds } } },
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
          tenantId: tenantObjectId,
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

    const tenantId = req.tenantId;
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const item = await Item.findOne({ _id: productId, tenantId }).select('name sku uom');
    if (!item) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const past30Days = new Date();
    past30Days.setDate(past30Days.getDate() - 30);

    // Fetch daily outflows
    const dailyData = await StockLedger.aggregate([
      {
        $match: {
          tenantId: tenantObjectId,
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

/**
 * Holt-Winters Double Exponential Smoothing with Trend
 * Level: L_t = alpha * Y_t + (1 - alpha) * (L_{t-1} + T_{t-1})
 * Trend: T_t = beta * (L_t - L_{t-1}) + (1 - beta) * T_{t-1}
 * Forecast: F_{t+k} = L_t + k * T_t
 */
function calculateHoltWinters(series = [], options = {}) {
  const alpha = Number(options.alpha) || 0.3;
  const beta = Number(options.beta) || 0.1;
  const horizon = Number(options.horizon) || 14;

  if (series.length < 2) {
    const fallbackVal = series[0] || 0;
    return {
      level: fallbackVal,
      trend: 0,
      forecast: Array(horizon).fill(fallbackVal)
    };
  }

  let level = series[0];
  let trend = series[1] - series[0];

  for (let t = 1; t < series.length; t++) {
    const value = series[t];
    const prevLevel = level;
    level = (alpha * value) + ((1 - alpha) * (prevLevel + trend));
    trend = (beta * (level - prevLevel)) + ((1 - beta) * trend);
  }

  const forecast = [];
  for (let k = 1; k <= horizon; k++) {
    const val = Math.max(0, Math.round((level + (k * trend)) * 100) / 100);
    forecast.push(val);
  }

  return {
    finalLevel: Math.round(level * 100) / 100,
    finalTrend: Math.round(trend * 100) / 100,
    forecast
  };
}

/**
 * Detect weekly or monthly seasonality through lag autocorrelation
 */
function detectSeasonality(series = [], period = 7) {
  if (series.length < period * 2) {
    return { isSeasonal: false, autocorrelation: 0 };
  }

  const n = series.length;
  const mean = series.reduce((s, x) => s + x, 0) / n;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const diff = series[i] - mean;
    denominator += (diff * diff);
    if (i >= period) {
      numerator += (diff * (series[i - period] - mean));
    }
  }

  const r = denominator > 0 ? (numerator / denominator) : 0;
  return {
    isSeasonal: r > 0.45,
    autocorrelation: Math.round(r * 1000) / 1000,
    period
  };
}

/**
 * GET /api/forecasts/advanced/:productId
 * Advanced Holt-Winters demand forecasting with trend, seasonality & confidence intervals
 */
router.get('/advanced/:productId', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { productId } = req.params;
    const { confidence = '95', horizon = 14 } = req.query;

    const zScores = { '90': 1.28, '95': 1.65, '99': 2.33 };
    const zScore = zScores[confidence] || 1.65;

    const item = await Item.findOne({ _id: productId, tenantId }).select('name sku uom salesPrice purchasePrice').lean();
    if (!item) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyDemandAgg = await StockLedger.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          productId: new mongoose.Types.ObjectId(productId),
          type: { $in: ['OUT', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'] },
          createdAt: { $gte: thirtyDaysAgo },
          isDeleted: { $ne: true }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          totalDemand: { $sum: '$quantity' }
        }
      }
    ]);

    const demandMap = new Map();
    dailyDemandAgg.forEach(d => demandMap.set(d._id, d.totalDemand));

    const historicalSeries = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      historicalSeries.push(demandMap.get(key) || 0);
    }

    const hw = calculateHoltWinters(historicalSeries, { horizon: parseInt(horizon, 10) || 14 });
    const seasonality = detectSeasonality(historicalSeries, 7);

    // Standard deviation and confidence bounds
    const mean = historicalSeries.reduce((s, x) => s + x, 0) / historicalSeries.length;
    const stdDev = calculateStdDev(historicalSeries, mean);
    const marginOfError = Math.round((zScore * stdDev) * 100) / 100;

    const projectedTimeline = hw.forecast.map((fc, idx) => {
      const date = new Date();
      date.setDate(date.getDate() + (idx + 1));
      return {
        date: date.toISOString().slice(0, 10),
        forecast: fc,
        upperBound: Math.round((fc + marginOfError) * 100) / 100,
        lowerBound: Math.max(0, Math.round((fc - marginOfError) * 100) / 100)
      };
    });

    res.json({
      success: true,
      product: item,
      method: 'HOLT_WINTERS_DOUBLE_EXPONENTIAL',
      confidenceLevel: `${confidence}%`,
      marginOfError,
      trend: hw.finalTrend,
      seasonality,
      timeline: projectedTimeline
    });
  } catch (err) {
    logger.error('Error generating advanced forecast:', err);
    res.status(500).json({ success: false, error: 'Failed to compute advanced forecast' });
  }
});

module.exports = router;
module.exports.calculateHoltWinters = calculateHoltWinters;
module.exports.detectSeasonality = detectSeasonality;
