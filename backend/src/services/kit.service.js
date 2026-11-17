/**
 * Kit, Bundle & Assembly Service
 * ────────────────────────────────
 * Handles Bill of Materials (BOM), component availability checking,
 * cost rollups, and work order assembly/disassembly execution.
 */

'use strict';

const mongoose = require('mongoose');
const Kit = require('../models/Kit');
const WorkOrder = require('../models/WorkOrder');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const logger = require('../utils/logger');

class KitService {
  /**
   * Check component availability and maximum build capacity for a kit.
   *
   * @param {object} kit - Kit model instance or plain object with components
   * @param {number} requestedQty - Desired number of kits to assemble
   * @param {Map<string, number>|Record<string, number>} stockMap - On-hand quantity per component productId
   */
  static checkComponentAvailability(kit, requestedQty = 1, stockMap = new Map()) {
    const safeRequestedQty = Math.max(1, Number(requestedQty) || 1);
    const getStock = (id) => {
      const key = id.toString();
      return stockMap instanceof Map ? (stockMap.get(key) || 0) : (stockMap[key] || 0);
    };

    let maxBuildCapacity = Infinity;
    const componentBreakdown = [];

    for (const comp of (kit.components || [])) {
      const perKitQty = Number(comp.quantity) || 1;
      const totalRequired = perKitQty * safeRequestedQty;
      const onHand = Math.max(0, getStock(comp.itemId));

      const canBuildWithThisComponent = perKitQty > 0 ? Math.floor(onHand / perKitQty) : Infinity;
      if (!comp.isOptional) {
        maxBuildCapacity = Math.min(maxBuildCapacity, canBuildWithThisComponent);
      }

      const shortfallQty = Math.max(0, totalRequired - onHand);

      componentBreakdown.push({
        itemId: comp.itemId,
        quantityPerKit: perKitQty,
        totalRequired,
        availableOnHand: onHand,
        canBuild: canBuildWithThisComponent,
        isOptional: !!comp.isOptional,
        isShortfall: shortfallQty > 0,
        shortfallQty
      });
    }

    if (maxBuildCapacity === Infinity) maxBuildCapacity = 0;

    return {
      requestedQty: safeRequestedQty,
      maxBuildCapacity,
      canFulfillRequested: maxBuildCapacity >= safeRequestedQty,
      components: componentBreakdown
    };
  }

  /**
   * Calculate Bill of Materials (BOM) cost rollup based on item unit costs.
   *
   * @param {Array<{ quantity: number, itemId: string }>} components
   * @param {Map<string, number>|Record<string, number>} costMap
   */
  static calculateBOMCost(components = [], costMap = new Map()) {
    const getCost = (id) => {
      const key = id.toString();
      return costMap instanceof Map ? (costMap.get(key) || 0) : (costMap[key] || 0);
    };

    let totalBomCost = 0;
    const breakdown = components.map(c => {
      const unitCost = Number(getCost(c.itemId)) || 0;
      const lineCost = (Number(c.quantity) || 0) * unitCost;
      totalBomCost += lineCost;
      return {
        itemId: c.itemId,
        quantity: c.quantity,
        unitCost,
        lineCost: Math.round(lineCost * 100) / 100
      };
    });

    return {
      totalBomCost: Math.round(totalBomCost * 100) / 100,
      breakdown
    };
  }

  /**
   * Complete Work Order: posts component consumption and output generation to StockLedger.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {string|mongoose.Types.ObjectId} workOrderId
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {string} userRole
   */
  static async completeWorkOrder(tenantId, workOrderId, userId, userRole = 'ADMIN') {
    const workOrder = await WorkOrder.findOne({ _id: workOrderId, tenantId }).populate('kitId');
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    if (workOrder.status === 'COMPLETED') {
      throw new Error('Work order is already completed');
    }

    if (workOrder.status === 'CANCELLED') {
      throw new Error('Cannot complete a cancelled work order');
    }

    const qty = workOrder.quantityPlanned;
    const ledgerEntries = [];
    const isAssemble = workOrder.type === 'ASSEMBLE';

    // 1. Process component ledger entries
    for (const comp of workOrder.componentConsumption) {
      const compQty = comp.consumedQty > 0 ? comp.consumedQty : (comp.plannedQty * qty);

      const entry = await StockLedger.create({
        productId: comp.itemId,
        warehouseId: workOrder.warehouseId,
        locationId: comp.locationId || undefined,
        type: isAssemble ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
        quantity: compQty,
        reasonCode: 'OTHER',
        adjustmentReason: `Work Order ${workOrder.workOrderNumber} ${isAssemble ? 'Consumption' : 'Disassembly Return'}`,
        tenantId,
        createdBy: userId,
        role: userRole
      });
      ledgerEntries.push(entry);
    }

    // 2. Process output item ledger entry
    const outputEntry = await StockLedger.create({
      productId: workOrder.outputItemId,
      warehouseId: workOrder.warehouseId,
      locationId: workOrder.outputLocationId || undefined,
      type: isAssemble ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: qty,
      reasonCode: 'OTHER',
      adjustmentReason: `Work Order ${workOrder.workOrderNumber} ${isAssemble ? 'Assembly Completion' : 'Disassembly Consumption'}`,
      tenantId,
      createdBy: userId,
      role: userRole
    });
    ledgerEntries.push(outputEntry);

    workOrder.status = 'COMPLETED';
    workOrder.quantityCompleted = qty;
    workOrder.completedAt = new Date();
    await workOrder.save();

    return {
      workOrder,
      ledgerEntriesCount: ledgerEntries.length
    };
  }
}

module.exports = KitService;

