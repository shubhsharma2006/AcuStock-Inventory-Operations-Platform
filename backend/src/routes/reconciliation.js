const express = require('express');
const mongoose = require('mongoose');
const ReconciliationTask = require('../models/ReconciliationTask');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const Counter = require('../models/Counter');
const StockLedger = require('../models/StockLedger');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/reconciliation
 * List reconciliation tasks with status and warehouse filtering
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, warehouseId, page = 1, limit = 25 } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status.toUpperCase();
    if (warehouseId) filter.warehouseId = warehouseId;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [tasks, total] = await Promise.all([
      ReconciliationTask.find(filter)
        .populate('productId', 'name sku uom salesPrice purchasePrice')
        .populate('warehouseId', 'name code')
        .populate('locationId', 'code label')
        .populate('lotId', 'lotNumber expiryDate')
        .populate('assignedTo', 'name email')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ReconciliationTask.countDocuments(filter)
    ]);

    res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      tasks
    });
  } catch (error) {
    logger.error('Error fetching reconciliation tasks', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/reconciliation/summary
 * Dashboard statistics (pending count, total variance value, etc.)
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const stats = await ReconciliationTask.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(req.tenantId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalVarianceQty: { $sum: '$varianceQty' },
          totalVarianceValue: { $sum: '$varianceValue' }
        }
      }
    ]);

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/reconciliation/:id/approve
 * Approves discrepancy and automatically creates & posts an InventoryAdjustment
 */
router.post('/:id/approve', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('id'), async (req, res) => {
  try {
    const task = await ReconciliationTask.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Reconciliation task not found' });
    }

    if (['APPROVED', 'POSTED'].includes(task.status)) {
      return res.status(400).json({ success: false, message: `Task is already ${task.status}` });
    }

    const adjustmentNumber = await Counter.getNextSequence(req.tenantId, 'ADJUSTMENT', 'ADJ', 6);
    const isPositive = task.varianceQty > 0;
    const reasonCode = isPositive ? 'FOUND' : 'CYCLE_COUNT';

    // 1. Create and post InventoryAdjustment
    const adjustment = await InventoryAdjustment.create({
      adjustmentNumber,
      tenantId: req.tenantId,
      warehouseId: task.warehouseId,
      type: 'CYCLE_COUNT',
      status: 'POSTED',
      items: [{
        productId: task.productId,
        locationId: task.locationId,
        lotId: task.lotId,
        quantityBefore: task.expectedQty,
        adjustmentQty: task.varianceQty,
        quantityAfter: task.countedQty,
        reasonCode,
        reasonNotes: `Cycle count variance reconciliation`,
        unitCost: task.expectedQty > 0 ? (task.varianceValue / Math.abs(task.varianceQty)) : 0
      }],
      totalValueImpact: task.varianceValue,
      approvalRequired: false,
      approvedBy: req.userId,
      approvedAt: new Date(),
      postedToLedgerAt: new Date(),
      notes: `Auto-generated from Reconciliation Task ${task._id}`,
      createdBy: req.userId
    });

    // 2. Post to StockLedger
    await StockLedger.create({
      productId: task.productId,
      warehouseId: task.warehouseId,
      locationId: task.locationId || undefined,
      type: isPositive ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: Math.abs(task.varianceQty),
      reasonCode,
      adjustmentReason: `Cycle Count Reconciled: ${task.cycleCountId}`,
      cycleCountId: task.cycleCountId,
      tenantId: req.tenantId,
      createdBy: req.userId,
      role: req.user?.role || 'ADMIN'
    });

    task.status = 'POSTED';
    task.approvedBy = req.userId;
    task.approvedAt = new Date();
    task.adjustmentId = adjustment._id;
    await task.save();

    res.json({
      success: true,
      message: `Discrepancy reconciled and posted to ledger via Adjustment ${adjustmentNumber}`,
      task,
      adjustment
    });
  } catch (error) {
    logger.error('Error approving reconciliation task', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/reconciliation/:id/reject
 * Reject discrepancy resolution
 */
router.post('/:id/reject', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('id'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const task = await ReconciliationTask.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (task.status === 'POSTED') {
      return res.status(400).json({ success: false, message: 'Cannot reject an already posted task' });
    }

    task.status = 'REJECTED';
    task.rejectionReason = reason.trim();
    await task.save();

    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

