/**
 * Report Scheduler Service
 *
 * Cron-based report generation. Uses the leader-worker guard pattern
 * already established in index.js (only PM2 worker 0 / non-cluster runs the job).
 *
 * Reports generated:
 *  - daily_summary   : runs every day at 06:00 (configurable via env)
 *  - weekly_low_stock: runs every Monday at 07:00
 */

const mongoose = require('mongoose');
const Report   = require('../models/Report');
const StockLedger = require('../models/StockLedger');
const Item     = require('../models/Item');
const logger   = require('../utils/logger');
const { sendReportEmail } = require('./email.service');

// ── Helpers ────────────────────────────────────────────────────

/**
 * Return ISO date string for "yesterday" in UTC.
 */
function yesterday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Return ISO week string, e.g. "2024-W03".
 */
function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Returns start/end Date range for yesterday (UTC midnight to midnight).
 */
function yesterdayRange() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

const Tenant = require('../models/Tenant');

// ── Report Generators ──────────────────────────────────────────

/**
 * Generate daily summary: total IN/OUT per product for yesterday.
 */
async function generateDailySummary(triggeredBy = 'scheduler', tenantId = null) {
  if (!tenantId) throw new Error('Tenant context is required to generate a daily summary');
  const period = yesterday();
  const { start, end } = yesterdayRange();
  const tenantFilter = { tenantId };

  // Check if already generated for this period
  const existing = await Report.findOne({ type: 'daily_summary', period, ...tenantFilter });
  if (existing && triggeredBy === 'scheduler') {
    logger.info(`📊 Daily summary for ${period} (tenant: ${tenantId || 'global'}) already exists — skipping`);
    return existing;
  }

  const movements = await StockLedger.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, ...tenantFilter } },
    {
      $group: {
        _id: { productId: '$productId', type: '$type' },
        totalQty: { $sum: '$quantity' },
        count:    { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'items',
        let: { productId: '$_id.productId' },
        pipeline: [{
          $match: { $expr: { $and: [
            { $eq: ['$_id', '$$productId'] },
            { $eq: ['$tenantId', tenantId] }
          ] } }
        }],
        as: 'product'
      }
    },
    {
      $project: {
        productId:   '$_id.productId',
        productName: { $arrayElemAt: ['$product.name', 0] },
        type:        '$_id.type',
        totalQty:    1,
        count:       1,
        _id:         0
      }
    },
    { $sort: { productName: 1, type: 1 } }
  ]);

  const summary = {
    date:        period,
    totalIn:     movements.filter(m => m.type === 'IN').reduce((s, m) => s + m.totalQty, 0),
    totalOut:    movements.filter(m => m.type === 'OUT').reduce((s, m) => s + m.totalQty, 0),
    totalTxns:   movements.reduce((s, m) => s + m.count, 0),
    byProduct:   movements
  };

  const report = await Report.findOneAndUpdate(
    { type: 'daily_summary', period, ...tenantFilter },
    { 
      type: 'daily_summary', 
      period, 
      data: summary, 
      generatedBy: triggeredBy, 
      generatedAt: new Date(),
      tenantId: tenantId || undefined
    },
    { upsert: true, new: true }
  );

  logger.info(`📊 Daily summary generated for ${period} (tenant: ${tenantId || 'global'}): ${summary.totalTxns} transactions`);

  // Attempt email delivery (non-blocking)
  try {
    if (typeof sendReportEmail === 'function') {
      await sendReportEmail('daily_summary', summary);
      await Report.findOneAndUpdate({ _id: report._id, tenantId }, { emailSent: true, emailSentAt: new Date() });
    }
  } catch (err) {
    logger.warn(`📧 Report email failed: ${err.message}`);
    await Report.findOneAndUpdate({ _id: report._id, tenantId }, { emailError: err.message });
  }

  return report;
}

/**
 * Generate weekly low-stock report: all items below threshold.
 */
async function generateWeeklyLowStock(triggeredBy = 'scheduler', tenantId = null) {
  if (!tenantId) throw new Error('Tenant context is required to generate a weekly low-stock report');
  const period = isoWeek();
  const tenantFilter = { tenantId };

  const existing = await Report.findOne({ type: 'weekly_low_stock', period, ...tenantFilter });
  if (existing && triggeredBy === 'scheduler') {
    logger.info(`📊 Weekly low-stock for ${period} (tenant: ${tenantId || 'global'}) already exists — skipping`);
    return existing;
  }

  // Aggregate current stock per item
  const stockAgg = await StockLedger.aggregate([
    { $match: { ...tenantFilter } },
    {
      $group: {
        _id: '$productId',
        currentStock: {
          $sum: {
            $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', { $multiply: ['$quantity', -1] }]
          }
        }
      }
    }
  ]);

  const stockMap = new Map(stockAgg.map(s => [s._id.toString(), Math.max(0, s.currentStock)]));

  const items = await Item.find({ isActive: { $ne: false }, ...tenantFilter }).select('_id name shortName lowStockThreshold');

  const lowStockItems = items
    .map(item => ({
      productId:     item._id,
      name:          item.name,
      shortName:     item.shortName,
      threshold:     item.lowStockThreshold ?? 10,
      currentStock:  stockMap.get(item._id.toString()) ?? 0
    }))
    .filter(item => item.currentStock <= item.threshold)
    .sort((a, b) => a.currentStock - b.currentStock);

  const summary = {
    week:          period,
    generatedAt:   new Date().toISOString(),
    totalLowStock: lowStockItems.length,
    items:         lowStockItems
  };

  const report = await Report.findOneAndUpdate(
    { type: 'weekly_low_stock', period, ...tenantFilter },
    { 
      type: 'weekly_low_stock', 
      period, 
      data: summary, 
      generatedBy: triggeredBy, 
      generatedAt: new Date(),
      tenantId: tenantId || undefined
    },
    { upsert: true, new: true }
  );

  logger.info(`📊 Weekly low-stock report (tenant: ${tenantId || 'global'}): ${lowStockItems.length} items below threshold`);

  try {
    if (typeof sendReportEmail === 'function') {
      await sendReportEmail('weekly_low_stock', summary);
      await Report.findOneAndUpdate({ _id: report._id, tenantId }, { emailSent: true, emailSentAt: new Date() });
    }
  } catch (err) {
    logger.warn(`📧 Report email failed: ${err.message}`);
    await Report.findOneAndUpdate({ _id: report._id, tenantId }, { emailError: err.message });
  }

  return report;
}

// ── Scheduler ─────────────────────────────────────────────────

let _dailyTimer  = null;
let _weeklyTimer = null;

/**
 * Compute ms until the next occurrence of a given UTC hour:minute.
 */
function msUntilNext(targetHour, targetMinute = 0) {
  const now  = new Date();
  const next = new Date();
  next.setUTCHours(targetHour, targetMinute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next - now;
}

/**
 * Start the report scheduler. Must only be called by the leader worker.
 * Safe to call multiple times — idempotent.
 */
function startReportScheduler() {
  if (_dailyTimer) return; // already running

  const DAILY_HOUR  = parseInt(process.env.REPORT_DAILY_HOUR  || '6',  10);
  const WEEKLY_HOUR = parseInt(process.env.REPORT_WEEKLY_HOUR || '7',  10);
  const ONE_DAY_MS  = 24 * 60 * 60 * 1000;
  const ONE_WEEK_MS =  7 * ONE_DAY_MS;

  // Daily summary — fire once at DAILY_HOUR UTC, then every 24h
  const dailyDelay = msUntilNext(DAILY_HOUR);
  _dailyTimer = setTimeout(async function fireDailyReport() {
    try {
      const tenants = await Tenant.find({ status: { $in: ['ACTIVE', 'TRIALING'] } }).select('_id');
      for (const t of tenants) {
        await generateDailySummary('scheduler', t._id);
      }
    } catch (err) { logger.error('Daily report error:', err.message); }
    _dailyTimer = setTimeout(fireDailyReport, ONE_DAY_MS);
  }, dailyDelay);

  // Weekly low-stock — fire on next Monday at WEEKLY_HOUR UTC
  const MONDAY = 1;
  const now = new Date();
  const daysUntilMonday = (MONDAY - now.getUTCDay() + 7) % 7 || 7;
  const weeklyDelay = daysUntilMonday * ONE_DAY_MS + msUntilNext(WEEKLY_HOUR) % ONE_DAY_MS;

  _weeklyTimer = setTimeout(async function fireWeeklyReport() {
    try {
      const tenants = await Tenant.find({ status: { $in: ['ACTIVE', 'TRIALING'] } }).select('_id');
      for (const t of tenants) {
        await generateWeeklyLowStock('scheduler', t._id);
      }
    } catch (err) { logger.error('Weekly report error:', err.message); }
    _weeklyTimer = setTimeout(fireWeeklyReport, ONE_WEEK_MS);
  }, weeklyDelay);

  logger.info(`⏰ Report scheduler started — daily at ${DAILY_HOUR}:00 UTC, weekly low-stock Mondays at ${WEEKLY_HOUR}:00 UTC`);
}

function stopReportScheduler() {
  if (_dailyTimer)  { clearTimeout(_dailyTimer);  _dailyTimer  = null; }
  if (_weeklyTimer) { clearTimeout(_weeklyTimer); _weeklyTimer = null; }
}

module.exports = {
  startReportScheduler,
  stopReportScheduler,
  generateDailySummary,
  generateWeeklyLowStock
};
