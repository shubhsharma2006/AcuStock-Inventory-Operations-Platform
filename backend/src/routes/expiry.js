const express = require('express');
const mongoose = require('mongoose');
const ExpiryAlertService = require('../services/expiryAlert.service');
const InventoryLot = require('../models/InventoryLot');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/expiry/dashboard
 * Summary of expiring lots grouped by urgency tier
 */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const { warehouseId } = req.query;
    const dashboard = await ExpiryAlertService.getExpiryDashboard(req.tenantId, { warehouseId });
    res.json({ success: true, ...dashboard });
  } catch (error) {
    logger.error('Error fetching expiry dashboard', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/expiry/pick-recommendation/:productId
 * FEFO pick order for a product given desired quantity
 */
router.get('/pick-recommendation/:productId', requireAuth, validateObjectId('productId'), async (req, res) => {
  try {
    const { qty = 1, warehouseId } = req.query;
    const filter = {
      tenantId: req.tenantId,
      productId: req.params.productId,
      status: 'ACTIVE',
      remainingQty: { $gt: 0 }
    };
    if (warehouseId) filter.warehouseId = warehouseId;

    const lots = await InventoryLot.find(filter).lean();
    const recommendation = ExpiryAlertService.getFEFOPickRecommendation(lots, Number(qty));

    res.json({ success: true, productId: req.params.productId, ...recommendation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/expiry/process-expired
 * Automatically mark lots with past expiry dates as EXPIRED
 */
router.post('/process-expired', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const now = new Date();
    const result = await InventoryLot.updateMany(
      {
        tenantId: req.tenantId,
        status: 'ACTIVE',
        expiryDate: { $lt: now }
      },
      {
        $set: { status: 'EXPIRED' }
      }
    );

    res.json({
      success: true,
      message: `Processed expired lots: ${result.modifiedCount} updated to EXPIRED status`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

