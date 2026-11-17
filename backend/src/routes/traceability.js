const express = require('express');
const mongoose = require('mongoose');
const TraceabilityService = require('../services/traceability.service');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/traceability/serial/:serialNumber
 * Get complete end-to-end timeline for a serial number
 */
router.get('/serial/:serialNumber', requireAuth, async (req, res) => {
  try {
    const timeline = await TraceabilityService.getSerialTimeline(req.tenantId, req.params.serialNumber);
    res.json({ success: true, ...timeline });
  } catch (error) {
    logger.error('Error fetching serial timeline', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/traceability/lot/:lotIdOrNumber
 * Get complete lifecycle timeline for an Inventory Lot
 */
router.get('/lot/:lotIdOrNumber', requireAuth, async (req, res) => {
  try {
    const timeline = await TraceabilityService.getLotTimeline(req.tenantId, req.params.lotIdOrNumber);
    res.json({ success: true, ...timeline });
  } catch (error) {
    logger.error('Error fetching lot timeline', { error: error.message });
    res.status(404).json({ success: false, message: error.message });
  }
});

module.exports = router;

