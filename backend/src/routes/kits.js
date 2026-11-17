const express = require('express');
const mongoose = require('mongoose');
const Kit = require('../models/Kit');
const WorkOrder = require('../models/WorkOrder');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const Counter = require('../models/Counter');
const KitService = require('../services/kit.service');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/kits
 * List all kits/bundles
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { type, isActive } = req.query;
    const filter = { tenantId: req.tenantId };
    if (type) filter.type = type.toUpperCase();
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const kits = await Kit.find(filter)
      .populate('parentItemId', 'name sku salesPrice purchasePrice uom')
      .populate('components.itemId', 'name sku salesPrice purchasePrice uom currentWAC')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: kits.length, kits });
  } catch (error) {
    logger.error('Error fetching kits', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/kits
 * Create a new Kit BOM
 */
router.post('/', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const {
      parentItemId,
      type = 'STATIC_BUNDLE',
      name,
      components,
      pricingStrategy = 'SUM_COMPONENTS',
      fixedPrice = 0,
      discountPercent = 0,
      assemblyInstructions,
      estimatedAssemblyMinutes = 0
    } = req.body;

    if (!parentItemId || !name || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ success: false, message: 'parentItemId, name, and at least one component are required.' });
    }

    const parentItem = await Item.findOne({ _id: parentItemId, tenantId: req.tenantId });
    if (!parentItem) {
      return res.status(404).json({ success: false, message: 'Parent item not found' });
    }

    const kit = await Kit.create({
      tenantId: req.tenantId,
      parentItemId,
      type: type.toUpperCase(),
      name: name.trim(),
      components,
      pricingStrategy,
      fixedPrice,
      discountPercent,
      assemblyInstructions,
      estimatedAssemblyMinutes,
      createdBy: req.userId
    });

    // Mark parent item as kit
    parentItem.isKit = true;
    parentItem.kitId = kit._id;
    await parentItem.save();

    res.status(201).json({ success: true, kit });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A kit definition already exists for this parent item.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/kits/:id
 * Retrieve specific kit details & BOM cost rollup
 */
router.get('/:id', requireAuth, validateObjectId('id'), async (req, res) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('parentItemId', 'name sku salesPrice purchasePrice uom currentWAC')
      .populate('components.itemId', 'name sku salesPrice purchasePrice uom currentWAC')
      .lean();

    if (!kit) {
      return res.status(404).json({ success: false, message: 'Kit not found' });
    }

    // Build cost map
    const costMap = new Map();
    (kit.components || []).forEach(c => {
      const item = c.itemId;
      const unitCost = item?.currentWAC || item?.purchasePrice || 0;
      costMap.set(item?._id ? item._id.toString() : c.itemId.toString(), unitCost);
    });

    const bomCost = KitService.calculateBOMCost(kit.components, costMap);

    res.json({ success: true, kit, bomCost });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/kits/:id/availability
 * Check build capacity based on warehouse inventory
 */
router.get('/:id/availability', requireAuth, validateObjectId('id'), async (req, res) => {
  try {
    const { warehouseId, qty = 1 } = req.query;
    const kit = await Kit.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!kit) {
      return res.status(404).json({ success: false, message: 'Kit not found' });
    }

    const componentIds = kit.components.map(c => new mongoose.Types.ObjectId(c.itemId));
    const match = {
      tenantId: new mongoose.Types.ObjectId(req.tenantId),
      productId: { $in: componentIds },
      isDeleted: { $ne: true }
    };
    if (warehouseId) {
      match.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    }

    // Aggregate on-hand stock per component
    const balances = await StockLedger.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$productId',
          qty: {
            $sum: {
              $cond: [
                { $in: ['$type', ['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN']] },
                '$quantity',
                { $multiply: ['$quantity', -1] }
              ]
            }
          }
        }
      }
    ]);

    const stockMap = new Map();
    balances.forEach(b => stockMap.set(b._id.toString(), Math.max(0, b.qty)));

    const availability = KitService.checkComponentAvailability(kit, qty, stockMap);
    res.json({ success: true, kitId: kit._id, kitName: kit.name, ...availability });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/kits/work-orders/list
 * List work orders
 */
router.get('/work-orders/list', requireAuth, async (req, res) => {
  try {
    const { status, warehouseId } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status.toUpperCase();
    if (warehouseId) filter.warehouseId = warehouseId;

    const workOrders = await WorkOrder.find(filter)
      .populate('kitId', 'name type')
      .populate('outputItemId', 'name sku uom')
      .populate('warehouseId', 'name code')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: workOrders.length, workOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/kits/:id/work-orders
 * Create an assembly or disassembly work order
 */
router.post('/:id/work-orders', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('id'), async (req, res) => {
  try {
    const { warehouseId, quantityPlanned = 1, type = 'ASSEMBLE', notes, assignedTo } = req.body;

    const kit = await Kit.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!kit) {
      return res.status(404).json({ success: false, message: 'Kit not found' });
    }

    const workOrderNumber = await Counter.getNextSequence(req.tenantId, 'WORK_ORDER', 'WO', 6);

    const componentConsumption = kit.components.map(c => ({
      itemId: c.itemId,
      plannedQty: c.quantity,
      consumedQty: c.quantity * Number(quantityPlanned)
    }));

    const workOrder = await WorkOrder.create({
      workOrderNumber,
      tenantId: req.tenantId,
      kitId: kit._id,
      warehouseId,
      type: type.toUpperCase(),
      status: 'PLANNED',
      quantityPlanned: Number(quantityPlanned),
      outputItemId: kit.parentItemId,
      componentConsumption,
      assignedTo: assignedTo || null,
      notes,
      createdBy: req.userId
    });

    res.status(201).json({ success: true, workOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/kits/work-orders/:id/start
 * Start work order
 */
router.post('/work-orders/:id/start', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('id'), async (req, res) => {
  try {
    const wo = await WorkOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['DRAFT', 'PLANNED'] } },
      { $set: { status: 'IN_PROGRESS', startedAt: new Date() } },
      { new: true }
    );

    if (!wo) {
      return res.status(404).json({ success: false, message: 'Work order not found or not in startable status' });
    }

    res.json({ success: true, workOrder: wo });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/kits/work-orders/:id/complete
 * Complete work order and post transactions to ledger
 */
router.post('/work-orders/:id/complete', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('id'), async (req, res) => {
  try {
    const result = await KitService.completeWorkOrder(
      req.tenantId,
      req.params.id,
      req.userId,
      req.user?.role || 'ADMIN'
    );
    res.json({ success: true, message: 'Work order completed and inventory updated', ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

