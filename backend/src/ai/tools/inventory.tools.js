/**
 * AcuStock AI Inventory Tools
 * 
 * Invariant: Context is passed by the backend runtime, NEVER supplied by the LLM.
 * All queries are strictly scoped to context.tenantId.
 */

const mongoose = require('mongoose');
const Item = require('../../models/Item');
const InventoryLot = require('../../models/InventoryLot');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const StockReservation = require('../../models/StockReservation');
const Company = require('../../models/Company');

/**
 * Tool: Query stock level for an item by SKU or Name
 */
async function queryStockLevel(context, { skuOrName, warehouseId = null }) {
  if (!skuOrName || typeof skuOrName !== 'string') {
    return { error: 'Please provide a valid SKU or product name to search.' };
  }

  // Verify warehouse permission if requested
  if (warehouseId) {
    const isAllowed = await context.verifyWarehouseAccess(warehouseId);
    if (!isAllowed) {
      return { error: 'Access denied: You do not have permission to view that warehouse.' };
    }
  }

  const cleanQuery = skuOrName.trim();
  const searchRegex = new RegExp(cleanQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');

  const items = await Item.find({
    tenantId: context.tenantId,
    $or: [
      { sku: searchRegex },
      { name: searchRegex },
      { partNumber: searchRegex }
    ]
  }).limit(5);

  if (!items || items.length === 0) {
    return {
      found: false,
      message: `No products matching "${skuOrName}" were found in your inventory.`
    };
  }

  const results = [];
  for (const item of items) {
    const currentStock = await item.getCurrentStock();
    const availableToPromise = await item.getAvailableToPromise();
    const reservedStock = Math.max(0, currentStock - availableToPromise);

    const itemSummary = {
      id: item._id.toString(),
      name: item.name,
      sku: item.sku,
      category: item.category,
      trackingMode: item.trackingMode,
      unit: item.unit || 'pcs',
      currentStock,
      availableStock: availableToPromise,
      reservedStock,
      threshold: item.lowStockThreshold || 10,
      isLowStock: currentStock <= (item.lowStockThreshold || 10)
    };

    // If batch tracked, include active batch/lots
    if (item.trackingMode === 'BATCH') {
      const activeLots = await InventoryLot.find({
        tenantId: context.tenantId,
        $or: [{ productId: item._id }, { itemId: item._id }],
        status: 'ACTIVE',
        $and: [
          { $or: [{ remainingQty: { $gt: 0 } }, { availableQuantity: { $gt: 0 } }] }
        ]
      })
        .sort({ expiryDate: 1 })
        .limit(5);

      itemSummary.activeBatches = activeLots.map(lot => ({
        batchNumber: lot.lotNumber || lot.batchNumber,
        availableQty: lot.remainingQty !== undefined ? lot.remainingQty : lot.availableQuantity,
        expiryDate: lot.expiryDate ? lot.expiryDate.toISOString().split('T')[0] : 'N/A',
        daysUntilExpiry: lot.expiryDate ? Math.ceil((new Date(lot.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)) : null
      }));
    }

    results.push(itemSummary);
  }

  return {
    found: true,
    count: results.length,
    products: results
  };
}

/**
 * Tool: Check batches/lots expiring within a given window
 */
async function checkExpiringLots(context, { daysAhead = 30, warehouseId = null }) {
  const windowDays = Math.min(365, Math.max(1, parseInt(daysAhead, 10) || 30));
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + windowDays);

  const query = {
    tenantId: context.tenantId,
    status: 'ACTIVE',
    $or: [{ remainingQty: { $gt: 0 } }, { availableQuantity: { $gt: 0 } }],
    expiryDate: { $lte: targetDate }
  };

  if (warehouseId) {
    const isAllowed = await context.verifyWarehouseAccess(warehouseId);
    if (!isAllowed) {
      return { error: 'Access denied: Invalid warehouse.' };
    }
    query.warehouseId = new mongoose.Types.ObjectId(warehouseId);
  }

  const expiringLots = await InventoryLot.find(query)
    .populate('productId', 'name sku trackingMode')
    .populate('supplierId', 'name')
    .sort({ expiryDate: 1 })
    .limit(15);

  if (!expiringLots || expiringLots.length === 0) {
    return {
      found: false,
      message: `No active lots are expiring within the next ${windowDays} days.`
    };
  }

  const now = new Date();
  const lots = expiringLots.map(lot => {
    const expiry = new Date(lot.expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    const prod = lot.productId || lot.itemId;
    return {
      batchNumber: lot.lotNumber || lot.batchNumber,
      itemSku: prod?.sku || 'Unknown',
      itemName: prod?.name || 'Unknown',
      supplier: lot.supplierId?.name || 'Primary Supplier',
      availableQty: lot.remainingQty !== undefined ? lot.remainingQty : lot.availableQuantity,
      expiryDate: expiry.toISOString().split('T')[0],
      daysRemaining: daysLeft,
      isExpired: daysLeft <= 0
    };
  });

  return {
    found: true,
    windowDays,
    count: lots.length,
    lots
  };
}

/**
 * Tool: List items currently below safety stock threshold
 */
async function listLowStockItems(context, { limit = 10 }) {
  const maxLimit = Math.min(25, Math.max(1, parseInt(limit, 10) || 10));

  const items = await Item.find({
    tenantId: context.tenantId
  }).limit(50);

  const lowStock = [];
  for (const item of items) {
    const currentStock = await item.getCurrentStock();
    const threshold = item.lowStockThreshold || 10;
    if (currentStock <= threshold) {
      lowStock.push({
        id: item._id.toString(),
        name: item.name,
        sku: item.sku,
        currentStock,
        threshold,
        deficit: Math.max(0, threshold - currentStock),
        trackingMode: item.trackingMode,
        autoPoEnabled: Boolean(item.autoPoEnabled)
      });
      if (lowStock.length >= maxLimit) break;
    }
  }

  return {
    count: lowStock.length,
    items: lowStock
  };
}

/**
 * Tool: Comprehensive Inventory & Supply Chain Health Analysis
 * Gathers multi-dimensional telemetry across SKUs, safety thresholds,
 * expiring lots, backorders, and returns an executive analysis with recommendations.
 */
async function analyzeInventoryHealth(context) {
  const tenantId = context.tenantId;

  // 1. Total Catalog Count & Breakdown
  const totalItemsCount = await Item.countDocuments({ tenantId });
  const serialItemsCount = await Item.countDocuments({ tenantId, trackingMode: 'SERIAL' });
  const batchItemsCount = await Item.countDocuments({ tenantId, trackingMode: 'BATCH' });

  // 2. Evaluate items for stock health
  const items = await Item.find({ tenantId }).limit(50);
  let lowStockCount = 0;
  let totalDeficit = 0;
  const criticalShortages = [];

  for (const item of items) {
    const currentStock = await item.getCurrentStock();
    const threshold = item.lowStockThreshold || item.minStockThreshold || 10;
    if (currentStock <= threshold) {
      lowStockCount++;
      const deficit = Math.max(0, threshold - currentStock);
      totalDeficit += deficit;
      if (criticalShortages.length < 5) {
        criticalShortages.push({
          name: item.name,
          sku: item.sku || 'N/A',
          currentStock,
          threshold,
          deficit
        });
      }
    }
  }

  // 3. Expiring Lots in 30 days
  const now = new Date();
  const windowDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringLotsCount = await InventoryLot.countDocuments({
    tenantId,
    status: 'ACTIVE',
    remainingQty: { $gt: 0 },
    expiryDate: { $lte: windowDate }
  });

  // 4. Backorder check
  const SalesOrder = mongoose.models.SalesOrder || require('../../models/SalesOrder');
  const openBackordersCount = await SalesOrder.countDocuments({
    tenantId,
    fulfillmentStatus: { $in: ['UNFULFILLED', 'PARTIALLY_FULFILLED'] },
    'items.isBackordered': true
  });

  // Health Score Calculation
  let healthScore = 100;
  if (lowStockCount > 0) healthScore -= Math.min(35, lowStockCount * 5);
  if (expiringLotsCount > 0) healthScore -= Math.min(25, expiringLotsCount * 5);
  if (openBackordersCount > 0) healthScore -= Math.min(20, openBackordersCount * 5);
  healthScore = Math.max(20, healthScore);

  let statusGrade = 'EXCELLENT';
  if (healthScore < 50) statusGrade = 'CRITICAL ATTENTION REQUIRED';
  else if (healthScore < 75) statusGrade = 'MODERATE RISK';
  else if (healthScore < 90) statusGrade = 'GOOD';

  return {
    healthScore,
    statusGrade,
    totalSkus: totalItemsCount,
    trackingBreakdown: {
      serialTracked: serialItemsCount,
      batchTracked: batchItemsCount,
      standard: Math.max(0, totalItemsCount - serialItemsCount - batchItemsCount)
    },
    lowStockItems: lowStockCount,
    totalDeficitUnits: totalDeficit,
    criticalShortages,
    expiringBatchesCount: expiringLotsCount,
    pendingBackordersCount: openBackordersCount,
    actionableRecommendations: [
      lowStockCount > 0
        ? `Generate draft replenishment POs for ${lowStockCount} items currently below safety buffer.`
        : 'Safety buffers are healthy across tracked items.',
      expiringLotsCount > 0
        ? `Accelerate dispatch for ${expiringLotsCount} lots expiring within 30 days under FEFO allocation.`
        : 'Zero lots at risk of near-term expiration.',
      openBackordersCount > 0
        ? `${openBackordersCount} orders have pending backorders requiring vendor purchase orders.`
        : 'All current customer orders are fulfilled or reserved.'
    ]
  };
}

/**
 * Tool: Evaluate reorder recommendations across items using statistical demand velocity
 */
async function queryReorderRecommendations(context, { lookbackDays = 60 }) {
  const tenantObjectId = new mongoose.Types.ObjectId(context.tenantId);
  const lookback = Math.min(180, Math.max(14, Number(lookbackDays) || 60));
  const zScore95 = 1.65;
  const leadTimeDays = 7;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookback);

  const items = await Item.find({
    tenantId: context.tenantId,
    isDeleted: { $ne: true }
  }).select('name shortName sku lowStockThreshold').lean();

  if (!items.length) {
    return { recommendations: [], message: 'No items found in your catalog.' };
  }

  const itemIds = items.map(i => i._id);

  // Stock balances
  const stockBalances = await StockLedger.aggregate([
    { $match: { tenantId: tenantObjectId, productId: { $in: itemIds } } },
    { $group: { _id: '$productId', total: { $sum: '$quantity' } } }
  ]);
  const stockMap = new Map(stockBalances.map(b => [String(b._id), b.total]));

  // Daily demand velocity
  const dailyDemands = await StockLedger.aggregate([
    {
      $match: {
        tenantId: tenantObjectId,
        productId: { $in: itemIds },
        type: { $in: ['STOCK_OUT', 'SALES_ORDER', 'TRANSFER_OUT'] },
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          productId: '$productId',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
        },
        dailyTotal: { $sum: { $abs: '$quantity' } }
      }
    }
  ]);

  const demandMap = new Map();
  dailyDemands.forEach(d => {
    const pid = String(d._id.productId);
    if (!demandMap.has(pid)) demandMap.set(pid, []);
    demandMap.get(pid).push(d.dailyTotal);
  });

  const recommendations = [];

  for (const item of items) {
    const pid = String(item._id);
    const currentStock = Math.max(0, stockMap.get(pid) || 0);
    const dayOuts = demandMap.get(pid) || [];
    const totalOut = dayOuts.reduce((a, b) => a + b, 0);
    const add = totalOut / lookback;

    // Safety Stock & Reorder Point
    const variance = dayOuts.length > 0
      ? dayOuts.reduce((sum, v) => sum + Math.pow(v - add, 2), 0) / lookback
      : 0;
    const stdDev = Math.sqrt(variance);
    const safetyStock = Math.ceil(zScore95 * stdDev * Math.sqrt(leadTimeDays));
    const reorderPoint = Math.ceil((leadTimeDays * add) + safetyStock);

    if (currentStock <= reorderPoint || currentStock <= (item.lowStockThreshold || 10)) {
      const daysOfSupply = add > 0 ? (currentStock / add).toFixed(1) : '99+';
      const recommendedOrderQty = Math.max(reorderPoint * 2 - currentStock, 20);

      recommendations.push({
        id: pid,
        name: item.name,
        sku: item.sku,
        currentStock,
        reorderPoint,
        safetyStock,
        averageDailyDemand: add.toFixed(2),
        daysOfSupply,
        recommendedOrderQty,
        urgency: currentStock <= safetyStock ? 'CRITICAL' : 'REORDER_NOW'
      });
    }
  }

  recommendations.sort((a, b) => (a.urgency === 'CRITICAL' ? -1 : 1));

  return {
    evaluatedCount: items.length,
    criticalCount: recommendations.filter(r => r.urgency === 'CRITICAL').length,
    recommendations: recommendations.slice(0, 10),
    message: recommendations.length > 0
      ? `Found ${recommendations.length} items requiring replenishment.`
      : 'All stock levels are currently healthy and above reorder thresholds.'
  };
}

module.exports = {
  queryStockLevel,
  checkExpiringLots,
  listLowStockItems,
  analyzeInventoryHealth,
  queryReorderRecommendations
};
