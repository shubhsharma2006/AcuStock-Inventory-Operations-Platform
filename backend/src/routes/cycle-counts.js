const express = require('express');
const mongoose = require('mongoose');
const CycleCount = require('../models/CycleCount');
const Item = require('../models/Item');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');
const InventoryLot = require('../models/InventoryLot');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logBusinessEvent } = require('../utils/auditHelper');

const router = express.Router();

/**
 * GET /api/cycle-counts
 * List cycle count audit sessions
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const query = { tenantId };
    if (req.query.warehouseId) query.warehouseId = req.query.warehouseId;
    if (req.query.status) query.status = req.query.status;

    const sessions = await CycleCount.find(query)
      .populate('warehouseId', 'name code location')
      .populate('assignedTo', 'name email role')
      .populate('supervisedBy', 'name email role')
      .populate('reconciledBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching cycle count sessions:', error);
    res.status(500).json({ message: 'Failed to retrieve cycle count sessions' });
  }
});

/**
 * POST /api/cycle-counts
 * Initialize a new cycle count stocktake session
 */
router.post('/', requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });

    const { warehouseId, blindCount = false, assignedTo, notes, productIds } = req.body;
    if (!warehouseId) {
      return res.status(400).json({ message: 'Warehouse selection is required' });
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, tenantId });
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Determine items to audit
    const itemFilter = { tenantId, isActive: true };
    if (Array.isArray(productIds) && productIds.length > 0) {
      itemFilter._id = { $in: productIds };
    }

    const items = await Item.find(itemFilter).lean();
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No active items found for cycle count' });
    }

    // Snapshot expected quantities per product from StockLedger in this warehouse
    const sessionItems = [];
    for (const item of items) {
      const matchFilter = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        productId: new mongoose.Types.ObjectId(item._id),
        warehouseId: new mongoose.Types.ObjectId(warehouseId),
        isDeleted: false
      };

      const ledgerAgg = await StockLedger.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            total: {
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

      const expected = ledgerAgg.length > 0 ? Math.max(0, ledgerAgg[0].total) : 0;

      sessionItems.push({
        productId: item._id,
        sku: item.sku || '',
        productName: item.name,
        expectedQuantity: expected,
        countedQuantity: null,
        variance: 0,
        varianceValue: 0,
        reasonCode: 'NONE',
        notes: ''
      });
    }

    const cycleCount = await CycleCount.create({
      tenantId,
      warehouseId,
      blindCount: Boolean(blindCount),
      items: sessionItems,
      assignedTo: assignedTo || req.user._id,
      supervisedBy: req.user._id,
      status: 'IN_PROGRESS',
      notes: notes || ''
    });

    res.status(201).json(cycleCount);
  } catch (error) {
    console.error('Error creating cycle count session:', error);
    res.status(500).json({ message: error.message || 'Failed to initialize cycle count session' });
  }
});

/**
 * GET /api/cycle-counts/:id
 * Retrieve session details (with blind-count masking if applicable)
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user.tenantId;
    const session = await CycleCount.findOne({ _id: req.params.id, tenantId })
      .populate('warehouseId', 'name code location')
      .populate('assignedTo', 'name email role')
      .populate('supervisedBy', 'name email role')
      .populate('reconciledBy', 'name email')
      .lean();

    if (!session) {
      return res.status(404).json({ message: 'Cycle count session not found' });
    }

    // Mask expected quantities if blind count is enabled and count is not yet reconciled and requester is not Admin/SuperAdmin
    const isPrivileged = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN';
    if (session.blindCount && session.status !== 'RECONCILED' && !isPrivileged) {
      session.items = session.items.map(item => ({
        ...item,
        expectedQuantity: undefined,
        variance: undefined,
        varianceValue: undefined
      }));
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching cycle count session:', error);
    res.status(500).json({ message: 'Failed to fetch session' });
  }
});

/**
 * PUT /api/cycle-counts/:id/counts
 * Submit counted quantities for items
 */
router.put('/:id/counts', requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user.tenantId;
    const { counts, submitForApproval } = req.body;

    if (!Array.isArray(counts)) {
      return res.status(400).json({ message: 'Counts array is required' });
    }

    const session = await CycleCount.findOne({ _id: req.params.id, tenantId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.status === 'RECONCILED' || session.status === 'CANCELLED') {
      return res.status(400).json({ message: `Cannot modify count with status ${session.status}` });
    }

    // Pre-fetch items for cost price to compute monetary variance
    const productIds = session.items.map(i => i.productId);
    const products = await Item.find({ _id: { $in: productIds } }).lean();
    const priceMap = new Map(products.map(p => [p._id.toString(), p.purchasePrice || p.salesPrice || 0]));

    let totalVarianceUnits = 0;
    let totalVarianceValue = 0;

    for (const c of counts) {
      const line = session.items.id(c.itemId || c._id);
      if (line) {
        if (c.countedQuantity !== undefined && c.countedQuantity !== null) {
          line.countedQuantity = Number(c.countedQuantity);
          line.variance = line.countedQuantity - line.expectedQuantity;
          const cost = priceMap.get(line.productId.toString()) || 0;
          line.varianceValue = line.variance * cost;
        }
        if (c.reasonCode) line.reasonCode = c.reasonCode;
        if (c.notes !== undefined) line.notes = c.notes;

        totalVarianceUnits += Math.abs(line.variance || 0);
        totalVarianceValue += Math.abs(line.varianceValue || 0);
      }
    }

    session.totalVarianceUnits = totalVarianceUnits;
    session.totalVarianceValue = totalVarianceValue;

    if (submitForApproval) {
      session.status = 'PENDING_APPROVAL';
    }

    await session.save();
    res.json(session);
  } catch (error) {
    console.error('Error submitting cycle count quantities:', error);
    res.status(500).json({ message: 'Failed to record counts' });
  }
});

/**
 * POST /api/cycle-counts/:id/reconcile
 * Admin/Supervisor signs off: posts immutable StockLedger adjustments
 */
router.post('/:id/reconcile', requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const tenantId = req.tenantId || req.user.tenantId;
    const cycleCount = await CycleCount.findOne({ _id: req.params.id, tenantId }).session(dbSession);

    if (!cycleCount) {
      await dbSession.abortTransaction();
      return res.status(404).json({ message: 'Cycle count session not found' });
    }

    if (cycleCount.status === 'RECONCILED') {
      await dbSession.abortTransaction();
      return res.status(400).json({ message: 'Session is already reconciled' });
    }

    const adjustmentsCreated = [];

    for (const line of cycleCount.items) {
      if (line.countedQuantity === null || line.countedQuantity === undefined) {
        continue;
      }

      const variance = line.countedQuantity - line.expectedQuantity;
      if (variance === 0) continue;

      const isSurplus = variance > 0;
      const adjustType = isSurplus ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      const adjustQty = Math.abs(variance);

      const ledgerEntry = new StockLedger({
        tenantId,
        productId: line.productId,
        warehouseId: cycleCount.warehouseId,
        cycleCountId: cycleCount._id,
        type: adjustType,
        quantity: adjustQty,
        adjustmentReason: line.reasonCode !== 'NONE' ? line.reasonCode : (isSurplus ? 'FOUND_STOCK' : 'SHRINKAGE'),
        condition: 'New',
        role: req.user.role,
        createdBy: req.user._id,
        partyDetails: {
          customerName: `Cycle Count ${cycleCount.countNumber}`,
          customerEmail: req.user.email
        },
        transactionDetails: {
          transactionId: `${cycleCount.countNumber}-${line.sku || 'SKU'}`,
          transactionDate: new Date()
        }
      });

      await ledgerEntry.save({ session: dbSession });
      adjustmentsCreated.push({
        sku: line.sku,
        type: adjustType,
        quantity: adjustQty,
        reason: ledgerEntry.adjustmentReason
      });
    }

    cycleCount.status = 'RECONCILED';
    cycleCount.reconciledAt = new Date();
    cycleCount.reconciledBy = req.user._id;
    await cycleCount.save({ session: dbSession });

    await dbSession.commitTransaction();

    // Log business audit
    await logBusinessEvent({
      tenantId,
      eventType: 'CYCLE_COUNT_RECONCILED',
      entityId: cycleCount._id,
      entityType: 'CycleCount',
      userId: req.user._id,
      details: {
        countNumber: cycleCount.countNumber,
        warehouseId: cycleCount.warehouseId,
        adjustmentsCount: adjustmentsCreated.length,
        adjustments: adjustmentsCreated
      }
    });

    res.json({
      success: true,
      message: `Cycle count reconciled. Created ${adjustmentsCreated.length} ledger adjustments.`,
      cycleCount,
      adjustments: adjustmentsCreated
    });
  } catch (error) {
    await dbSession.abortTransaction();
    console.error('Reconciliation transaction error:', error);
    res.status(500).json({ message: error.message || 'Failed to reconcile cycle count' });
  } finally {
    dbSession.endSession();
  }
});

module.exports = router;
