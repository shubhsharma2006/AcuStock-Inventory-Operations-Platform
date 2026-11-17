/**
 * MRP (Material Requirements Planning) Service
 * ─────────────────────────────────────────────────────────────
 * Provides:
 * 1. Recursive Indented Multi-Level BOM Explosion with scrap allowances
 * 2. Net Material Requirements calculation:
 *    Net Deficit = Gross Demand (SOs + Safety Stock) - (On-Hand + Inbound POs + Active WOs)
 * 3. Lead-time back-scheduling for suggested Work Orders and Purchase Orders
 * 4. 1-Click execution converting recommendations into confirmed records
 */

const mongoose = require('mongoose');
const Kit = require('../models/Kit');
const Item = require('../models/Item');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const WorkOrder = require('../models/WorkOrder');
const Counter = require('../models/Counter');
const logger = require('../utils/logger');

class MrpService {
  /**
   * Recursively explodes an item's Bill of Materials down to raw materials.
   * Prevents infinite cycles via visited set.
   */
  async explodeBom(tenantId, parentItemId, requiredQty = 1, currentLevel = 0, visited = new Set()) {
    const parentIdStr = String(parentItemId);
    if (visited.has(parentIdStr)) {
      return null; // Cycle detected
    }
    visited.add(parentIdStr);

    const [parentItem, kit] = await Promise.all([
      Item.findOne({ _id: parentItemId, tenantId }).select('name sku price cost currentStock unit category').lean(),
      Kit.findOne({ parentItemId, tenantId, isActive: true })
        .populate('components.itemId', 'name sku price cost currentStock unit')
        .populate('routingOperations.workCenterId', 'code name hourlyCost')
        .lean()
    ]);

    if (!parentItem) return null;

    if (!kit || !kit.components || kit.components.length === 0) {
      // Leaf raw material
      return {
        level: currentLevel,
        itemId: parentItem._id,
        sku: parentItem.sku,
        name: parentItem.name,
        unit: parentItem.unit || 'pcs',
        unitCost: Number(parentItem.cost || parentItem.price || 0),
        quantityRequired: requiredQty,
        scrapPercent: 0,
        isSubAssembly: false,
        totalCost: Math.round(Number(parentItem.cost || 0) * requiredQty * 100) / 100,
        children: []
      };
    }

    // Assembly / Kit Parent
    const children = [];
    let totalRollupCost = 0;

    for (const comp of kit.components) {
      if (!comp.itemId) continue;

      const scrap = Number(comp.scrapFactorPercent || 0);
      const grossComponentQty = comp.quantity * requiredQty * (1 + scrap / 100);

      const childTree = await this.explodeBom(
        tenantId,
        comp.itemId._id,
        grossComponentQty,
        currentLevel + 1,
        new Set(visited)
      );

      if (childTree) {
        childTree.scrapPercent = scrap;
        totalRollupCost += childTree.totalCost || 0;
        children.push(childTree);
      }
    }

    return {
      level: currentLevel,
      itemId: parentItem._id,
      sku: parentItem.sku,
      name: parentItem.name,
      unit: parentItem.unit || 'pcs',
      unitCost: Number(parentItem.cost || 0),
      quantityRequired: requiredQty,
      scrapPercent: 0,
      isSubAssembly: true,
      manufacturingLeadTimeDays: kit.manufacturingLeadTimeDays || 3,
      routingOperations: kit.routingOperations || [],
      totalCost: Math.round(totalRollupCost * 100) / 100,
      children
    };
  }

  /**
   * Calculates Net Material Requirements across finished goods and raw materials.
   */
  async runMrp(tenantId, options = {}) {
    const { includeSafetyStock = true, horizonDays = 60 } = options;

    const [salesOrders, allItems, purchaseOrders, workOrders] = await Promise.all([
      SalesOrder.find({
        tenantId,
        status: { $in: ['confirmed', 'allocated', 'processing', 'draft'] }
      })
        .populate('items.productId')
        .lean(),
      Item.find({ tenantId, isActive: { $ne: false } }).lean(),
      PurchaseOrder.find({
        tenantId,
        status: { $in: ['sent', 'approved', 'partially_received'] }
      }).lean(),
      WorkOrder.find({
        tenantId,
        status: { $in: ['DRAFT', 'RELEASED', 'IN_PROGRESS'] }
      }).lean()
    ]);

    // 1. Calculate Gross Requirements from open Sales Orders
    const demandMap = new Map(); // itemId -> { grossDemand, earliestNeedDate }

    for (const so of salesOrders) {
      const needDate = so.expectedDeliveryDate || so.createdAt || new Date();
      for (const it of so.items || []) {
        const pId = String(it.productId?._id || it.productId);
        const qty = Number(it.quantity || 0);

        if (!demandMap.has(pId)) {
          demandMap.set(pId, { grossDemand: qty, earliestNeedDate: needDate });
        } else {
          const entry = demandMap.get(pId);
          entry.grossDemand += qty;
          if (new Date(needDate) < new Date(entry.earliestNeedDate)) {
            entry.earliestNeedDate = needDate;
          }
        }
      }
    }

    // 2. Add Safety Stock if requested
    if (includeSafetyStock) {
      for (const item of allItems) {
        const pId = String(item._id);
        const safety = Number(item.minStockAlert || item.safetyStock || 0);
        if (safety > 0) {
          if (!demandMap.has(pId)) {
            demandMap.set(pId, { grossDemand: safety, earliestNeedDate: new Date() });
          } else {
            demandMap.get(pId).grossDemand += safety;
          }
        }
      }
    }

    // 3. Map Inbound PO Supply
    const inboundPoMap = new Map();
    for (const po of purchaseOrders) {
      for (const it of po.items || []) {
        const pId = String(it.productId?._id || it.productId);
        const qty = Number(it.quantity || 0);
        inboundPoMap.set(pId, (inboundPoMap.get(pId) || 0) + qty);
      }
    }

    // 4. Map Active Work Order WIP Supply
    const activeWipMap = new Map();
    for (const wo of workOrders) {
      const pId = String(wo.kitId); // or parent item
      const qty = Number(wo.plannedQty || 0) - Number(wo.completedQty || 0);
      if (qty > 0) {
        activeWipMap.set(pId, (activeWipMap.get(pId) || 0) + qty);
      }
    }

    // 5. Compute Net Deficit for each candidate item
    const requirements = [];
    const suggestedWorkOrders = [];
    const suggestedPurchaseOrders = [];

    // Pre-load all kits to determine if item has a BOM
    const kits = await Kit.find({ tenantId, isActive: true }).lean();
    const kitMap = new Map();
    for (const k of kits) {
      kitMap.set(String(k.parentItemId), k);
    }

    for (const item of allItems) {
      const pId = String(item._id);
      const demandData = demandMap.get(pId);
      const grossDemand = demandData ? demandData.grossDemand : 0;
      const onHand = Number(item.currentStock || 0);
      const inboundPo = inboundPoMap.get(pId) || 0;
      const activeWip = activeWipMap.get(pId) || 0;

      const totalSupply = onHand + inboundPo + activeWip;
      const netDeficit = Math.max(0, grossDemand - totalSupply);

      const hasBom = kitMap.has(pId);
      const needDate = demandData ? demandData.earliestNeedDate : new Date();

      if (grossDemand > 0 || netDeficit > 0) {
        requirements.push({
          itemId: item._id,
          sku: item.sku,
          name: item.name,
          unit: item.unit || 'pcs',
          onHand,
          inboundPo,
          activeWip,
          grossDemand,
          netDeficit,
          hasBom,
          unitCost: Number(item.cost || item.price || 0),
          estimatedCostImpact: Math.round(netDeficit * Number(item.cost || item.price || 0) * 100) / 100
        });

        if (netDeficit > 0) {
          if (hasBom) {
            const kit = kitMap.get(pId);
            const leadDays = kit.manufacturingLeadTimeDays || 3;
            const suggestedStartDate = new Date(needDate);
            suggestedStartDate.setDate(suggestedStartDate.getDate() - leadDays);

            suggestedWorkOrders.push({
              itemId: item._id,
              kitId: kit._id,
              sku: item.sku,
              name: item.name,
              suggestedQty: netDeficit,
              suggestedStartDate,
              needDate,
              leadTimeDays: leadDays,
              estimatedCost: Math.round(netDeficit * Number(item.cost || item.price || 0) * 100) / 100
            });
          } else {
            const leadDays = Number(item.supplierLeadTimeDays || 7);
            const suggestedOrderDate = new Date(needDate);
            suggestedOrderDate.setDate(suggestedOrderDate.getDate() - leadDays);

            suggestedPurchaseOrders.push({
              itemId: item._id,
              sku: item.sku,
              name: item.name,
              suggestedQty: netDeficit,
              suggestedOrderDate,
              needDate,
              leadTimeDays: leadDays,
              unitPrice: Number(item.cost || item.price || 0),
              totalEstimatedCost: Math.round(netDeficit * Number(item.cost || item.price || 0) * 100) / 100
            });
          }
        }
      }
    }

    return {
      runTimestamp: new Date(),
      totalRequirementsEvaluated: requirements.length,
      deficitItemsCount: requirements.filter((r) => r.netDeficit > 0).length,
      requirements,
      suggestedWorkOrders,
      suggestedPurchaseOrders
    };
  }

  /**
   * 1-Click execution converting MRP recommendations into confirmed Purchase Orders and Work Orders.
   */
  async executeSuggestions(tenantId, { workOrders = [], purchaseOrders = [] }, userId) {
    const createdWOs = [];
    const createdPOs = [];

    // Create Work Orders
    for (const wo of workOrders) {
      const currentYear = new Date().getFullYear();
      const seq = await Counter.getNextSequence(tenantId, 'WORK_ORDER', `WO-${currentYear}`, 4);

      const newWo = new WorkOrder({
        workOrderNumber: seq,
        kitId: wo.kitId,
        plannedQty: wo.suggestedQty,
        scheduledStartDate: wo.suggestedStartDate || new Date(),
        dueDate: wo.needDate || new Date(),
        status: 'RELEASED',
        type: 'ASSEMBLE',
        notes: `Auto-generated via MRP Run. Need Date: ${new Date(wo.needDate).toLocaleDateString()}`,
        createdBy: userId,
        tenantId
      });

      await newWo.save();
      createdWOs.push(newWo);
    }

    // Create Purchase Orders (Procurement)
    if (purchaseOrders.length > 0) {
      const currentYear = new Date().getFullYear();
      const seq = await Counter.getNextSequence(tenantId, 'PURCHASE_ORDER', `PO-${currentYear}`, 4);

      const poItems = purchaseOrders.map((po) => ({
        productId: po.itemId,
        quantity: po.suggestedQty,
        unitPrice: po.unitPrice || 0,
        totalPrice: Math.round(po.suggestedQty * (po.unitPrice || 0) * 100) / 100
      }));

      const totalAmount = poItems.reduce((acc, curr) => acc + curr.totalPrice, 0);

      const newPo = new PurchaseOrder({
        poNumber: seq,
        orderNumber: seq,
        status: 'approved',
        items: poItems,
        totalAmount,
        expectedDeliveryDate: purchaseOrders[0]?.needDate || new Date(),
        notes: `Auto-generated via MRP Requisition. Consolidated ${purchaseOrders.length} raw material deficits.`,
        createdBy: userId,
        tenantId
      });

      await newPo.save();
      createdPOs.push(newPo);
    }

    return {
      success: true,
      message: `Executed MRP run: Created ${createdWOs.length} Work Orders and ${createdPOs.length} Purchase Orders`,
      workOrdersCreated: createdWOs.length,
      purchaseOrdersCreated: createdPOs.length
    };
  }
}

module.exports = new MrpService();

