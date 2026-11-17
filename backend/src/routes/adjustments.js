const express = require('express');
const mongoose = require('mongoose');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const Warehouse = require('../models/Warehouse');
const Counter = require('../models/Counter');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

const REASON_CODES = [
  { code: 'DAMAGE', label: 'Damaged Goods / In-Transit Damage', type: 'WRITE_OFF' },
  { code: 'SCRAP', label: 'Scrap / Unusable Raw Material', type: 'SCRAP' },
  { code: 'THEFT', label: 'Pilferage / Unaccounted Shrinkage', type: 'WRITE_OFF' },
  { code: 'WRITE_OFF', label: 'Commercial Write-Off', type: 'WRITE_OFF' },
  { code: 'FOUND', label: 'Found Inventory / Surplus Stock', type: 'FOUND' },
  { code: 'RECLASSIFICATION', label: 'Condition or SKU Reclassification', type: 'RECLASSIFICATION' },
  { code: 'EXPIRED', label: 'Expired Product / Lot Expiry', type: 'EXPIRED' },
  { code: 'QC_REJECTION', label: 'Quality Control Rejection', type: 'QC_REJECTION' },
  { code: 'CYCLE_COUNT', label: 'Cycle Count Variance Resolution', type: 'CYCLE_COUNT' },
  { code: 'CORRECTION', label: 'Data Entry Correction', type: 'CORRECTION' },
  { code: 'OTHER', label: 'Other Operational Adjustment', type: 'OTHER' }
];

/**
 * GET /api/adjustments/reason-codes
 * Return allowed reason codes and metadata
 */
router.get('/reason-codes', requireAuth, (req, res) => {
  res.json({ success: true, reasonCodes: REASON_CODES });
});

/**
 * GET /api/adjustments
 * List adjustments with status, warehouseId, and date filtering
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, warehouseId, type, page = 1, limit = 25 } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status.toUpperCase();
    if (warehouseId) filter.warehouseId = warehouseId;
    if (type) filter.type = type.toUpperCase();

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [adjustments, total] = await Promise.all([
      InventoryAdjustment.find(filter)
        .populate('warehouseId', 'name code')
        .populate('createdBy', 'name email role')
        .populate('approvedBy', 'name email')
        .populate('items.productId', 'name sku uom salesPrice purchasePrice')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InventoryAdjustment.countDocuments(filter)
    ]);

    res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: adjustments
    });
  } catch (error) {
    logger.error('Error fetching adjustments', { error: error.message });
    res.status(500).json({ success: false, message: 'Server error retrieving adjustments' });
  }
});

/**
 * GET /api/adjustments/:id
 * Retrieve specific adjustment details
 */
router.get('/:id', requireAuth, validateObjectId('id'), async (req, res) => {
  try {
    const adjustment = await InventoryAdjustment.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('warehouseId', 'name code address')
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .populate('rejectedBy', 'name email role')
      .populate('items.productId', 'name sku uom salesPrice purchasePrice currentWAC')
      .populate('items.locationId', 'code label type')
      .populate('items.lotId', 'lotNumber expiryDate')
      .lean();

    if (!adjustment) {
      return res.status(404).json({ success: false, message: 'Adjustment not found' });
    }

    res.json({ success: true, adjustment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/adjustments
 * Create a new adjustment (DRAFT or PENDING_APPROVAL)
 */
router.post('/', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const {
      warehouseId,
      type = 'CORRECTION',
      items = [],
      notes,
      submitForApproval = false
    } = req.body;

    if (!warehouseId) {
      return res.status(400).json({ success: false, message: 'warehouseId is required.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required in the adjustment.' });
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, tenantId: req.tenantId });
    if (!warehouse) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }

    // Process items & compute total value impact
    let totalValueImpact = 0;
    const processedItems = [];

    for (const rawItem of items) {
      if (!rawItem.productId || rawItem.adjustmentQty === undefined) {
        return res.status(400).json({ success: false, message: 'Each item must have productId and adjustmentQty' });
      }

      const product = await Item.findOne({ _id: rawItem.productId, tenantId: req.tenantId });
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${rawItem.productId} not found` });
      }

      const unitCost = rawItem.unitCost !== undefined
        ? Number(rawItem.unitCost)
        : (product.currentWAC || product.purchasePrice || 0);

      const qtyBefore = Number(rawItem.quantityBefore || 0);
      const adjQty = Number(rawItem.adjustmentQty);
      const qtyAfter = qtyBefore + adjQty;

      totalValueImpact += (adjQty * unitCost);

      processedItems.push({
        productId: product._id,
        locationId: rawItem.locationId || null,
        lotId: rawItem.lotId || null,
        serialNumbers: Array.isArray(rawItem.serialNumbers) ? rawItem.serialNumbers : [],
        quantityBefore: qtyBefore,
        adjustmentQty: adjQty,
        quantityAfter: qtyAfter,
        reasonCode: rawItem.reasonCode || 'OTHER',
        reasonNotes: rawItem.reasonNotes || '',
        unitCost
      });
    }

    const adjustmentNumber = await Counter.getNextSequence(req.tenantId, 'ADJUSTMENT', 'ADJ', 6);
    const initialStatus = submitForApproval ? 'PENDING_APPROVAL' : 'DRAFT';

    const adjustment = await InventoryAdjustment.create({
      adjustmentNumber,
      tenantId: req.tenantId,
      warehouseId,
      type: type.toUpperCase(),
      status: initialStatus,
      items: processedItems,
      totalValueImpact: Math.round(totalValueImpact * 100) / 100,
      approvalRequired: submitForApproval || Math.abs(totalValueImpact) > 5000,
      notes: notes || '',
      createdBy: req.userId
    });

    await logBusinessEvent({
      req,
      action: 'INVENTORY_ADJUSTMENT_CREATED',
      entityType: 'InventoryAdjustment',
      entityId: adjustment._id,
      details: {
        adjustmentNumber,
        itemCount: processedItems.length,
        totalValueImpact,
        status: initialStatus
      }
    });

    res.status(201).json({ success: true, adjustment });
  } catch (error) {
    logger.error('Error creating adjustment', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/adjustments/:id/submit
 * Transition DRAFT -> PENDING_APPROVAL
 */
router.post('/:id/submit', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('id'), async (req, res) => {
  try {
    const adjustment = await InventoryAdjustment.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!adjustment) {
      return res.status(404).json({ success: false, message: 'Adjustment not found' });
    }

    if (adjustment.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: `Only DRAFT adjustments can be submitted (current status: ${adjustment.status}).` });
    }

    adjustment.status = 'PENDING_APPROVAL';
    await adjustment.save();

    await logBusinessEvent({
      req,
      action: 'INVENTORY_ADJUSTMENT_SUBMITTED',
      entityType: 'InventoryAdjustment',
      entityId: adjustment._id,
      details: { adjustmentNumber: adjustment.adjustmentNumber }
    });

    res.json({ success: true, adjustment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/adjustments/:id/approve
 * Approves adjustment and posts inventory ledger transactions to StockLedger
 */
router.post('/:id/approve', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('id'), async (req, res) => {
  try {
    const adjustment = await InventoryAdjustment.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!adjustment) {
      return res.status(404).json({ success: false, message: 'Adjustment not found' });
    }

    if (!['DRAFT', 'PENDING_APPROVAL'].includes(adjustment.status)) {
      return res.status(400).json({
        success: false,
        message: `Adjustment is already ${adjustment.status}. Cannot approve.`
      });
    }

    // Post to StockLedger for each item
    const ledgerEntries = [];
    for (const item of adjustment.items) {
      const isPositive = item.adjustmentQty > 0;
      const ledgerType = isPositive ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      const absQty = Math.abs(item.adjustmentQty);

      const entry = await StockLedger.create({
        productId: item.productId,
        warehouseId: adjustment.warehouseId,
        locationId: item.locationId || undefined,
        type: ledgerType,
        adjustmentReason: item.reasonNotes || `${adjustment.type}: ${item.reasonCode}`,
        reasonCode: item.reasonCode,
        quantity: absQty,
        serialNumbers: item.serialNumbers || [],
        lotAllocations: item.lotId ? [{
          lotId: item.lotId,
          quantity: absQty
        }] : [],
        tenantId: req.tenantId,
        createdBy: req.userId,
        role: req.user?.role || 'ADMIN'
      });

      ledgerEntries.push(entry);
    }

    adjustment.status = 'POSTED';
    adjustment.approvedBy = req.userId;
    adjustment.approvedAt = new Date();
    adjustment.postedToLedgerAt = new Date();
    await adjustment.save();

    await logBusinessEvent({
      req,
      action: 'INVENTORY_ADJUSTMENT_APPROVED_AND_POSTED',
      entityType: 'InventoryAdjustment',
      entityId: adjustment._id,
      severity: 'HIGH',
      details: {
        adjustmentNumber: adjustment.adjustmentNumber,
        ledgerEntriesCreated: ledgerEntries.length,
        totalValueImpact: adjustment.totalValueImpact
      }
    });

    res.json({
      success: true,
      message: `Adjustment ${adjustment.adjustmentNumber} successfully approved and posted to inventory ledger.`,
      adjustment,
      ledgerEntriesCount: ledgerEntries.length
    });
  } catch (error) {
    logger.error('Error approving adjustment', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/adjustments/:id/reject
 * Reject an adjustment with a reason
 */
router.post('/:id/reject', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('id'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const adjustment = await InventoryAdjustment.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!adjustment) {
      return res.status(404).json({ success: false, message: 'Adjustment not found' });
    }

    if (adjustment.status === 'POSTED') {
      return res.status(400).json({ success: false, message: 'Cannot reject an adjustment that has already been posted to the ledger.' });
    }

    adjustment.status = 'REJECTED';
    adjustment.rejectionReason = reason.trim();
    adjustment.rejectedBy = req.userId;
    adjustment.rejectedAt = new Date();
    await adjustment.save();

    await logBusinessEvent({
      req,
      action: 'INVENTORY_ADJUSTMENT_REJECTED',
      entityType: 'InventoryAdjustment',
      entityId: adjustment._id,
      details: {
        adjustmentNumber: adjustment.adjustmentNumber,
        reason: adjustment.rejectionReason
      }
    });

    res.json({ success: true, adjustment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
