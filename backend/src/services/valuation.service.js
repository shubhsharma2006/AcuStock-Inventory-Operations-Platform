/**
 * Valuation Service: Stock Valuation & Inventory Costing Engine
 * ─────────────────────────────────────────────────────────────
 * Implements:
 * 1. Weighted Average Cost (WAC) updating on receipts
 * 2. FIFO (First In First Out) cost layer consumption & COGS computation
 * 3. Standard Costing & Purchase Price Variance (PPV)
 * 4. Multi-item inventory valuation aggregation
 * 5. Full ledger-based valuation reconstruction
 */

'use strict';

const mongoose = require('mongoose');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const logger = require('../utils/logger');

class ValuationService {
  /**
   * Calculate new Weighted Average Cost (WAC) upon new stock receipt.
   * Formula: ((currentQty * currentWAC) + (receiptQty * receiptCost)) / (currentQty + receiptQty)
   *
   * @param {number} currentQty - Current on-hand quantity before receipt
   * @param {number} currentWAC - Current weighted average cost
   * @param {number} receiptQty - Incoming receipt quantity
   * @param {number} receiptCost - Unit cost of incoming receipt
   * @returns {number} New WAC rounded to 4 decimal places
   */
  static calculateWAC(currentQty, currentWAC, receiptQty, receiptCost) {
    const safeCurrentQty = Math.max(0, Number(currentQty) || 0);
    const safeCurrentWAC = Math.max(0, Number(currentWAC) || 0);
    const safeReceiptQty = Math.max(0, Number(receiptQty) || 0);
    const safeReceiptCost = Math.max(0, Number(receiptCost) || 0);

    const totalQty = safeCurrentQty + safeReceiptQty;
    if (totalQty === 0) return 0;

    const totalValue = (safeCurrentQty * safeCurrentWAC) + (safeReceiptQty * safeReceiptCost);
    return Math.round((totalValue / totalQty) * 10000) / 10000;
  }

  /**
   * Consume inventory under FIFO discipline.
   * Depletes the oldest cost layers first and calculates exact Cost of Goods Sold (COGS).
   *
   * @param {Array<{ quantity: number, unitCost: number, receivedAt: Date, poId?: string }>} costLayers
   * @param {number} requestedQty - Quantity to consume
   * @returns {{
   *   consumedQty: number,
   *   cogs: number,
   *   unitCostEquivalent: number,
   *   remainingLayers: Array,
   *   consumedLayers: Array
   * }}
   */
  static consumeFIFO(costLayers = [], requestedQty) {
    let qtyToConsume = Math.max(0, Number(requestedQty) || 0);
    if (qtyToConsume === 0) {
      return {
        consumedQty: 0,
        cogs: 0,
        unitCostEquivalent: 0,
        remainingLayers: [...costLayers],
        consumedLayers: []
      };
    }

    // Sort layers ascending by receivedAt (oldest first)
    const sortedLayers = [...costLayers]
      .filter(l => l && l.quantity > 0)
      .sort((a, b) => new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0));

    let totalCogs = 0;
    let actualConsumedQty = 0;
    const consumedLayers = [];
    const remainingLayers = [];

    for (const layer of sortedLayers) {
      if (qtyToConsume <= 0) {
        remainingLayers.push(layer);
        continue;
      }

      const layerQty = Number(layer.quantity);
      const layerCost = Number(layer.unitCost);

      if (layerQty <= qtyToConsume) {
        // Entire layer is consumed
        const consumedValue = layerQty * layerCost;
        totalCogs += consumedValue;
        actualConsumedQty += layerQty;
        qtyToConsume -= layerQty;

        consumedLayers.push({
          quantity: layerQty,
          unitCost: layerCost,
          receivedAt: layer.receivedAt,
          poId: layer.poId
        });
      } else {
        // Partially consume this layer
        const consumedPortion = qtyToConsume;
        const remainingPortion = layerQty - consumedPortion;
        const consumedValue = consumedPortion * layerCost;

        totalCogs += consumedValue;
        actualConsumedQty += consumedPortion;
        qtyToConsume = 0;

        consumedLayers.push({
          quantity: consumedPortion,
          unitCost: layerCost,
          receivedAt: layer.receivedAt,
          poId: layer.poId
        });

        remainingLayers.push({
          ...layer,
          quantity: remainingPortion
        });
      }
    }

    const unitCostEquivalent = actualConsumedQty > 0
      ? Math.round((totalCogs / actualConsumedQty) * 10000) / 10000
      : 0;

    return {
      consumedQty: actualConsumedQty,
      cogs: Math.round(totalCogs * 100) / 100,
      unitCostEquivalent,
      remainingLayers,
      consumedLayers,
      unfulfilledQty: qtyToConsume
    };
  }

  /**
   * Calculate Standard Cost Purchase Price Variance (PPV).
   * PPV = (actualCost - standardCost) * qty
   *
   * @param {number} standardCost
   * @param {number} actualCost
   * @param {number} qty
   */
  static calculatePPV(standardCost, actualCost, qty) {
    const sCost = Number(standardCost) || 0;
    const aCost = Number(actualCost) || 0;
    const quantity = Math.max(0, Number(qty) || 0);

    const standardTotal = sCost * quantity;
    const actualTotal = aCost * quantity;
    const ppv = actualTotal - standardTotal;

    return {
      standardCost: sCost,
      actualCost: aCost,
      quantity,
      standardTotal: Math.round(standardTotal * 100) / 100,
      actualTotal: Math.round(actualTotal * 100) / 100,
      ppv: Math.round(ppv * 100) / 100,
      isFavorable: aCost < sCost,
      variancePercentage: sCost > 0 ? Math.round(((aCost - sCost) / sCost) * 10000) / 100 : 0
    };
  }

  /**
   * Get total inventory valuation across products for a tenant.
   * Supports valuationMethod filters ('WAC', 'FIFO', 'STANDARD').
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {object} options
   */
  static async getInventoryValuation(tenantId, options = {}) {
    const { warehouseId, method } = options;
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const matchLedger = {
      tenantId: tenantObjectId,
      isDeleted: { $ne: true }
    };
    if (warehouseId) {
      matchLedger.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    }

    // 1. Fetch current on-hand stock per item from ledger
    const stockBalances = await StockLedger.aggregate([
      { $match: matchLedger },
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
          }
        }
      },
      { $match: { onHandQty: { $gt: 0 } } }
    ]);

    if (!stockBalances || stockBalances.length === 0) {
      return {
        totalInventoryValue: 0,
        totalItemsCount: 0,
        totalUnitsCount: 0,
        items: []
      };
    }

    const productIds = stockBalances.map(b => b._id);
    const itemQuery = { _id: { $in: productIds }, tenantId: tenantObjectId };
    if (method) {
      itemQuery.valuationMethod = method.toUpperCase();
    }

    const items = await Item.find(itemQuery).lean();
    const itemMap = new Map(items.map(i => [i._id.toString(), i]));

    let grandTotalValue = 0;
    let grandTotalUnits = 0;
    const valuationReport = [];

    for (const balance of stockBalances) {
      const item = itemMap.get(balance._id.toString());
      if (!item) continue;

      const qty = balance.onHandQty;
      const vMethod = item.valuationMethod || 'WAC';
      let unitCost = item.currentWAC || item.purchasePrice || 0;
      let totalValue = 0;

      if (vMethod === 'STANDARD') {
        unitCost = item.standardCost || item.purchasePrice || 0;
        totalValue = qty * unitCost;
      } else if (vMethod === 'FIFO') {
        const layers = item.costLayers || [];
        let remainingToValue = qty;
        let fifoSum = 0;

        for (const layer of layers) {
          if (remainingToValue <= 0) break;
          const layerQ = Math.min(layer.quantity, remainingToValue);
          fifoSum += (layerQ * layer.unitCost);
          remainingToValue -= layerQ;
        }

        if (remainingToValue > 0) {
          // If cost layers don't cover entire stock balance, use current purchasePrice as fallback
          fifoSum += (remainingToValue * (item.purchasePrice || 0));
        }

        totalValue = fifoSum;
        unitCost = qty > 0 ? (totalValue / qty) : 0;
      } else {
        // WAC (Default)
        unitCost = item.currentWAC || item.purchasePrice || 0;
        totalValue = qty * unitCost;
      }

      totalValue = Math.round(totalValue * 100) / 100;
      unitCost = Math.round(unitCost * 100) / 100;

      grandTotalValue += totalValue;
      grandTotalUnits += qty;

      valuationReport.push({
        productId: item._id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        onHandQty: qty,
        valuationMethod: vMethod,
        unitCost,
        totalValue,
        baseCurrency: item.baseCurrency || 'INR'
      });
    }

    return {
      totalInventoryValue: Math.round(grandTotalValue * 100) / 100,
      totalItemsCount: valuationReport.length,
      totalUnitsCount: grandTotalUnits,
      items: valuationReport
    };
  }

  /**
   * Recalculate WAC and cost layers for an item by replaying its historical ledger receipts.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {string|mongoose.Types.ObjectId} productId
   */
  static async recalculateItemValuation(tenantId, productId) {
    const item = await Item.findOne({ _id: productId, tenantId });
    if (!item) {
      throw new Error('Product not found for valuation recalculation');
    }

    const receipts = await StockLedger.find({
      tenantId,
      productId,
      type: { $in: ['IN', 'ADJUSTMENT_IN'] },
      isDeleted: { $ne: true }
    }).sort({ createdAt: 1 }).lean();

    let runningQty = 0;
    let runningWAC = item.purchasePrice || 0;
    const newLayers = [];

    for (const receipt of receipts) {
      const receiptQty = Number(receipt.quantity) || 0;
      // Use receipt cost if available or fallback to item.purchasePrice
      const unitCost = Number(receipt.unitCost) || item.purchasePrice || 0;

      runningWAC = this.calculateWAC(runningQty, runningWAC, receiptQty, unitCost);
      runningQty += receiptQty;

      newLayers.push({
        quantity: receiptQty,
        unitCost,
        receivedAt: receipt.createdAt || new Date()
      });
    }

    item.currentWAC = runningWAC;
    if (newLayers.length > 0) {
      item.costLayers = newLayers;
    }
    await item.save();

    return {
      productId: item._id,
      recalculatedWAC: runningWAC,
      totalReceiptsProcessed: receipts.length,
      layersCount: newLayers.length
    };
  }
}

module.exports = ValuationService;

