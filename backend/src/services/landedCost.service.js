/**
 * Landed Cost Service
 * ─────────────────────────────────────────────────────────────
 * Calculates multi-currency landed costs (freight, duties, insurance, handling)
 * and apportions them across purchase order line items by value, quantity, or weight.
 */

'use strict';

const mongoose = require('mongoose');
const LandedCost = require('../models/LandedCost');
const Item = require('../models/Item');
const ValuationService = require('./valuation.service');
const logger = require('../utils/logger');

class LandedCostService {
  /**
   * Apportion landed cost components across purchase order line items.
   *
   * @param {Array<{ productId: string, quantity: number, unitPrice: number, weight?: number }>} poLines
   * @param {Array<{ type: string, amount: number, apportionMethod?: string }>} components
   * @param {{ exchangeRate?: number, baseCurrency?: string, poCurrency?: string }} options
   */
  static calculateApportionment(poLines = [], components = [], options = {}) {
    const exchangeRate = Number(options.exchangeRate) || 1.0;
    const baseCurrency = (options.baseCurrency || 'INR').toUpperCase();
    const poCurrency = (options.poCurrency || baseCurrency).toUpperCase();

    if (!Array.isArray(poLines) || poLines.length === 0) {
      throw new Error('At least one PO line is required for landed cost apportionment');
    }

    // 1. Calculate totals across lines in base currency
    let totalPoBaseValue = 0;
    let totalPoQuantity = 0;
    let totalPoWeight = 0;

    const enrichedLines = poLines.map(line => {
      const qty = Number(line.quantity) || 0;
      const unitPriceInPo = Number(line.unitPrice) || 0;
      const unitPriceInBase = unitPriceInPo * exchangeRate;
      const lineBaseTotal = qty * unitPriceInBase;
      const lineWeight = (Number(line.weight) || 0) * qty;

      totalPoBaseValue += lineBaseTotal;
      totalPoQuantity += qty;
      totalPoWeight += lineWeight;

      return {
        productId: line.productId,
        poLineQty: qty,
        itemCostInPoCurrency: unitPriceInPo,
        itemCostInBaseCurrency: Math.round(unitPriceInBase * 100) / 100,
        lineBaseTotal,
        weight: lineWeight,
        allocatedLandedCost: 0
      };
    });

    // 2. Total landed cost amount
    const totalLandedCost = components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // 3. Apportion each component according to its method
    for (const component of components) {
      const compAmount = Number(component.amount) || 0;
      if (compAmount <= 0) continue;

      const method = component.apportionMethod || 'BY_VALUE';

      enrichedLines.forEach(line => {
        let ratio = 0;
        if (method === 'BY_QUANTITY') {
          ratio = totalPoQuantity > 0 ? (line.poLineQty / totalPoQuantity) : 0;
        } else if (method === 'BY_WEIGHT' && totalPoWeight > 0) {
          ratio = line.weight / totalPoWeight;
        } else {
          // Default: BY_VALUE
          ratio = totalPoBaseValue > 0 ? (line.lineBaseTotal / totalPoBaseValue) : 0;
        }

        line.allocatedLandedCost += (compAmount * ratio);
      });
    }

    // 4. Calculate total landed unit cost per line
    const finalAllocations = enrichedLines.map(line => {
      const allocatedTotal = Math.round(line.allocatedLandedCost * 100) / 100;
      const perUnitLanded = line.poLineQty > 0 ? (allocatedTotal / line.poLineQty) : 0;
      const totalUnitCost = Math.round((line.itemCostInBaseCurrency + perUnitLanded) * 100) / 100;

      return {
        productId: line.productId,
        poLineQty: line.poLineQty,
        itemCostInPoCurrency: line.itemCostInPoCurrency,
        itemCostInBaseCurrency: line.itemCostInBaseCurrency,
        allocatedLandedCost: allocatedTotal,
        totalUnitCost
      };
    });

    return {
      poCurrency,
      baseCurrency,
      exchangeRate,
      totalLandedCost: Math.round(totalLandedCost * 100) / 100,
      totalPoBaseValue: Math.round(totalPoBaseValue * 100) / 100,
      lineAllocations: finalAllocations
    };
  }

  /**
   * Finalize landed cost and update product cost layers & WAC
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {string|mongoose.Types.ObjectId} landedCostId
   * @param {string|mongoose.Types.ObjectId} userId
   */
  static async finalizeLandedCost(tenantId, landedCostId, userId) {
    const landedCost = await LandedCost.findOne({ _id: landedCostId, tenantId });
    if (!landedCost) {
      throw new Error('Landed cost record not found');
    }

    if (landedCost.status === 'FINALIZED') {
      throw new Error('Landed cost has already been finalized');
    }

    // Update each item's valuation
    for (const alloc of landedCost.lineAllocations) {
      const item = await Item.findOne({ _id: alloc.productId, tenantId });
      if (!item) continue;

      const newReceiptQty = alloc.poLineQty;
      const newLandedUnitCost = alloc.totalUnitCost;

      // Update WAC
      const currentQty = (item.costLayers || []).reduce((sum, l) => sum + (l.quantity || 0), 0);
      item.currentWAC = ValuationService.calculateWAC(currentQty, item.currentWAC, newReceiptQty, newLandedUnitCost);

      // Append new cost layer
      if (!item.costLayers) item.costLayers = [];
      item.costLayers.push({
        quantity: newReceiptQty,
        unitCost: newLandedUnitCost,
        receivedAt: new Date(),
        poId: landedCost.purchaseOrderId
      });

      await item.save();
    }

    landedCost.status = 'FINALIZED';
    landedCost.finalizedAt = new Date();
    await landedCost.save();

    return landedCost;
  }
}

module.exports = LandedCostService;

