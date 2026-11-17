/**
 * Inventory Aging, Dead Stock, ABC Analysis & Turnover Service
 * ─────────────────────────────────────────────────────────────
 * Implements:
 * 1. Aging buckets (0-30, 31-60, 61-90, 91-180, 180+ days)
 * 2. ABC Classification based on cumulative value contribution (80/15/5 rule)
 * 3. Inventory Turnover Ratio & Days Sales of Inventory (DSI)
 * 4. Dead Stock identification by inactivity threshold
 */

'use strict';

const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const logger = require('../utils/logger');

class AgingReportService {
  /**
   * Assign aging bucket based on days since last inventory movement.
   *
   * @param {number} days
   * @returns {'0-30'|'31-60'|'61-90'|'91-180'|'180+'}
   */
  static getAgingBucket(days) {
    const d = Math.max(0, Number(days) || 0);
    if (d <= 30) return '0-30';
    if (d <= 60) return '31-60';
    if (d <= 90) return '61-90';
    if (d <= 180) return '91-180';
    return '180+';
  }

  /**
   * Perform ABC Classification on an array of inventory items by value.
   * - Category A: Top items contributing up to 80% of total inventory value
   * - Category B: Next items contributing 80% - 95% of total inventory value
   * - Category C: Remaining items contributing the bottom 5% of total value
   *
   * @param {Array<{ productId: string, totalValue: number }>} items
   */
  static calculateABCClassification(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      return { totalValue: 0, items: [] };
    }

    // Sort descending by totalValue
    const sorted = [...items].sort((a, b) => (Number(b.totalValue) || 0) - (Number(a.totalValue) || 0));
    const grandTotal = sorted.reduce((sum, i) => sum + (Number(i.totalValue) || 0), 0);

    let cumulativeValue = 0;
    const classified = sorted.map(item => {
      const val = Number(item.totalValue) || 0;
      cumulativeValue += val;
      const cumulativePercent = grandTotal > 0 ? (cumulativeValue / grandTotal) * 100 : 0;

      let category = 'C';
      if (cumulativePercent <= 80 || (cumulativePercent - (val / grandTotal * 100) < 80)) {
        category = 'A';
      } else if (cumulativePercent <= 95 || (cumulativePercent - (val / grandTotal * 100) < 95)) {
        category = 'B';
      }

      return {
        ...item,
        cumulativeValue: Math.round(cumulativeValue * 100) / 100,
        cumulativePercent: Math.round(cumulativePercent * 100) / 100,
        abcCategory: category
      };
    });

    return {
      grandTotalValue: Math.round(grandTotal * 100) / 100,
      totalItems: classified.length,
      items: classified
    };
  }

  /**
   * Calculate Inventory Turnover Ratio & Days Sales of Inventory (DSI).
   * Turnover = COGS / Average Inventory Value
   * DSI = 365 / Turnover
   *
   * @param {number} cogs - Cost of Goods Sold over the period
   * @param {number} avgInventoryValue - Average inventory value over the period
   */
  static calculateTurnover(cogs, avgInventoryValue) {
    const safeCogs = Math.max(0, Number(cogs) || 0);
    const safeAvgInv = Math.max(0, Number(avgInventoryValue) || 0);

    if (safeAvgInv === 0) {
      return {
        cogs: safeCogs,
        avgInventoryValue: 0,
        turnoverRatio: 0,
        dsiDays: 0
      };
    }

    const turnoverRatio = Math.round((safeCogs / safeAvgInv) * 100) / 100;
    const dsiDays = turnoverRatio > 0 ? Math.round((365 / turnoverRatio) * 10) / 10 : 0;

    return {
      cogs: safeCogs,
      avgInventoryValue: safeAvgInv,
      turnoverRatio,
      dsiDays
    };
  }

  /**
   * Identify Dead Stock items with no movement beyond the threshold days.
   *
   * @param {Array<{ productId: string, daysSinceLastMovement: number, onHandQty: number, totalValue: number }>} items
   * @param {number} thresholdDays - Default: 180 days
   */
  static filterDeadStock(items = [], thresholdDays = 180) {
    const deadStock = items.filter(
      item => (Number(item.daysSinceLastMovement) || 0) >= thresholdDays && (Number(item.onHandQty) || 0) > 0
    );

    const totalDeadStockValue = deadStock.reduce((sum, i) => sum + (Number(i.totalValue) || 0), 0);
    const totalDeadStockUnits = deadStock.reduce((sum, i) => sum + (Number(i.onHandQty) || 0), 0);

    return {
      thresholdDays,
      totalDeadStockItems: deadStock.length,
      totalDeadStockUnits,
      totalDeadStockValue: Math.round(totalDeadStockValue * 100) / 100,
      deadStock
    };
  }
}

module.exports = AgingReportService;

