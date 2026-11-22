'use strict';

const express = require('express');
const WeightDiscrepancyService = require('../services/logistics/WeightDiscrepancyService');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/weight-discrepancies/webhook
 * Inbound webhook receiving carrier laser DWS scanner measurements.
 */
router.post('/webhook', async (req, res) => {
  try {
    const { awb, shipmentId, chargedWeightKg, billedWeightKg, length, width, height, carrierName, scannedAtHub } = req.body;

    if (!awb && !shipmentId) {
      return res.status(400).json({ message: 'awb or shipmentId is required' });
    }

    const weightKg = Number(billedWeightKg || chargedWeightKg);
    if (!weightKg) {
      return res.status(400).json({ message: 'billedWeightKg is required' });
    }

    const result = await WeightDiscrepancyService.ingestDiscrepancy({
      awb,
      shipmentId,
      carrierBilledWeightKg: weightKg,
      carrierBilledDimensions: {
        length: Number(length) || 15,
        width: Number(width) || 15,
        height: Number(height) || 10
      },
      scannedAtHub,
      carrierName
    });

    res.status(200).json({
      success: true,
      message: 'Carrier weight measurement processed',
      data: result
    });
  } catch (err) {
    logger.error('Weight discrepancy webhook error:', err);
    res.status(500).json({ message: err.message || 'Failed to process weight webhook' });
  }
});

// Tenant-authenticated routes
router.use(requireAuth);
router.use(requireTenantId);

/**
 * GET /api/weight-discrepancies/dashboard
 * Summary KPIs for weight discrepancy & disputes control tower.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const metrics = await WeightDiscrepancyService.getDiscrepancyMetrics(req.tenantId);
    res.json({
      success: true,
      metrics
    });
  } catch (err) {
    logger.error('Discrepancy dashboard error:', err);
    res.status(500).json({ message: 'Failed to retrieve discrepancy metrics' });
  }
});

/**
 * GET /api/weight-discrepancies
 * List weight discrepancies with pagination and filters.
 */
router.get('/', async (req, res) => {
  try {
    const { status, carrier, page, limit } = req.query;
    const result = await WeightDiscrepancyService.listDiscrepancies(req.tenantId, {
      status,
      carrier,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    logger.error('List discrepancies error:', err);
    res.status(500).json({ message: 'Failed to list weight discrepancies' });
  }
});

/**
 * POST /api/weight-discrepancies/dispute
 * File dispute against carrier with photo/scale evidence.
 */
router.post('/dispute', async (req, res) => {
  try {
    const { discrepancyId, merchantRemarks, scalePhotoUrl, dimensionsPhotoUrl, productPhotoUrl } = req.body;

    if (!discrepancyId) {
      return res.status(400).json({ message: 'discrepancyId is required' });
    }

    const result = await WeightDiscrepancyService.fileDispute({
      discrepancyId,
      tenantId: req.tenantId,
      merchantRemarks,
      scalePhotoUrl,
      dimensionsPhotoUrl,
      productPhotoUrl
    });

    res.json({
      success: true,
      message: 'Dispute filed successfully with courier network',
      data: result
    });
  } catch (err) {
    logger.error('File dispute error:', err);
    res.status(400).json({ message: err.message || 'Failed to file dispute' });
  }
});

/**
 * POST /api/weight-discrepancies/accept
 * 1-click acknowledge discrepancy without contesting.
 */
router.post('/accept', async (req, res) => {
  try {
    const { discrepancyId, reason } = req.body;

    if (!discrepancyId) {
      return res.status(400).json({ message: 'discrepancyId is required' });
    }

    const result = await WeightDiscrepancyService.acceptDiscrepancy({
      discrepancyId,
      tenantId: req.tenantId,
      reason
    });

    res.json({
      success: true,
      message: 'Weight discrepancy accepted',
      data: result
    });
  } catch (err) {
    logger.error('Accept discrepancy error:', err);
    res.status(400).json({ message: err.message || 'Failed to accept discrepancy' });
  }
});

module.exports = router;
