const express = require('express');
const mongoose = require('mongoose');
const InventoryLot = require('../models/InventoryLot');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const { requireAuth, requireRole, requireTenantId, validateObjectId, normalizePaginationQuery } = require('../middleware/auth');
const lotService = require('../services/lot.service');
const { logBusinessEvent } = require('../utils/auditHelper');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/lots
 * List inventory lots with optional filtering and pagination
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { productId, status, nearExpiry, search } = req.query;
    const { page, limit } = normalizePaginationQuery(req.query);

    const filter = { tenantId: req.tenantId };

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      filter.productId = new mongoose.Types.ObjectId(productId);
    }

    if (status) {
      filter.status = status.toUpperCase();
    }

    if (nearExpiry === 'true') {
      const now = new Date();
      const nearExpiryThreshold = new Date(now.getTime() + lotService.NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      filter.status = 'ACTIVE';
      filter.expiryDate = { $gt: now, $lte: nearExpiryThreshold };
    }

    if (search && typeof search === 'string') {
      filter.lotNumber = { $regex: search.trim(), $options: 'i' };
    }

    const total = await InventoryLot.countDocuments(filter);
    const lots = await InventoryLot.find(filter)
      .populate('productId', 'name sku uom category')
      .populate('supplierId', 'name companyName')
      .sort({ expiryDate: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const now = new Date();
    const lotsWithMeta = lots.map((lot) => ({
      ...lot,
      isExpired: new Date(lot.expiryDate) <= now,
      isNearExpiry: new Date(lot.expiryDate) > now && new Date(lot.expiryDate) <= new Date(now.getTime() + lotService.NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      daysUntilExpiry: Math.ceil((new Date(lot.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }));

    return res.json({
      success: true,
      lots: lotsWithMeta,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/lots/availability/:productId
 * Active lots available for allocation for a specific product
 */
router.get('/availability/:productId', requireAuth, validateObjectId, async (req, res) => {
  try {
    const { productId } = req.params;
    const availability = await lotService.getLotAvailability({
      productId,
      tenantId: req.tenantId
    });

    return res.json({
      success: true,
      productId,
      lots: availability
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/lots/:id
 * Get single lot detail including audit timeline
 */
router.get('/:id', requireAuth, validateObjectId, async (req, res) => {
  try {
    const lot = await InventoryLot.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('productId', 'name sku uom trackingMode category')
      .populate('supplierId', 'name companyName phone email')
      .populate('blockedBy', 'name email role')
      .lean();

    if (!lot) {
      return res.status(404).json({ success: false, error: 'Lot not found' });
    }

    // Ledger transactions that touched this lot
    const transactions = await StockLedger.find({
      tenantId: req.tenantId,
      'lotAllocations.lotId': lot._id
    })
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const now = new Date();
    const daysUntilExpiry = Math.ceil((new Date(lot.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return res.json({
      success: true,
      lot: {
        ...lot,
        isExpired: new Date(lot.expiryDate) <= now,
        isNearExpiry: daysUntilExpiry > 0 && daysUntilExpiry <= lotService.NEAR_EXPIRY_DAYS,
        daysUntilExpiry,
        transactions
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/lots/:id/block
 * Administratively block a lot from being allocated
 */
router.post('/:id/block', requireAuth, requireRole(['ADMIN', 'MANAGER']), validateObjectId, async (req, res) => {
  try {
    const { reason } = req.body;
    const lot = await lotService.blockLot({
      lotId: req.params.id,
      reason,
      userId: req.user._id,
      tenantId: req.tenantId
    });

    await logBusinessEvent({
      req,
      action: 'LOT_BLOCKED',
      entityType: 'InventoryLot',
      entityId: lot._id,
      changes: {
        summary: `Lot ${lot.lotNumber} blocked: ${reason || 'Administratively blocked'}`,
        after: { status: 'BLOCKED', blockedReason: lot.blockedReason }
      },
      tenantId: req.tenantId
    });

    return res.json({
      success: true,
      lot,
      message: `Lot ${lot.lotNumber} has been blocked`
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/lots/:id/unblock
 * Unblock a blocked lot
 */
router.post('/:id/unblock', requireAuth, requireRole(['ADMIN', 'MANAGER']), validateObjectId, async (req, res) => {
  try {
    const lot = await lotService.unblockLot({
      lotId: req.params.id,
      userId: req.user._id,
      tenantId: req.tenantId
    });

    await logBusinessEvent({
      req,
      action: 'LOT_UNBLOCKED',
      entityType: 'InventoryLot',
      entityId: lot._id,
      changes: {
        summary: `Lot ${lot.lotNumber} unblocked`,
        after: { status: lot.status }
      },
      tenantId: req.tenantId
    });

    return res.json({
      success: true,
      lot,
      message: `Lot ${lot.lotNumber} has been unblocked`
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
