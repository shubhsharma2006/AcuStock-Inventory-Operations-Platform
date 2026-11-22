'use strict';

const express = require('express');
const CodRemittance = require('../models/CodRemittance');
const CodRemittanceService = require('../services/logistics/CodRemittanceService');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireAuth);
router.use(requireTenantId);

/**
 * GET /api/cod-remittance/dashboard
 * Summary financial KPIs for COD cash flow and remittance aging.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const metrics = await CodRemittanceService.getCodMetrics(req.tenantId);
    res.json({
      success: true,
      metrics
    });
  } catch (err) {
    logger.error('COD dashboard error:', err);
    res.status(500).json({ message: 'Failed to retrieve COD metrics' });
  }
});

/**
 * GET /api/cod-remittance/unremitted
 * List delivered COD shipments pending payout from couriers.
 */
router.get('/unremitted', async (req, res) => {
  try {
    const result = await CodRemittanceService.getUnremittedShipments(req.tenantId);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    logger.error('Unremitted shipments error:', err);
    res.status(500).json({ message: 'Failed to retrieve unremitted shipments' });
  }
});

/**
 * GET /api/cod-remittance/remittances
 * List historical courier remittance advice batches.
 */
router.get('/remittances', async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const query = { tenantId: req.tenantId };
    if (status) query.status = status.toUpperCase();

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [remittances, total] = await Promise.all([
      CodRemittance.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      CodRemittance.countDocuments(query)
    ]);

    res.json({
      success: true,
      remittances,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (err) {
    logger.error('List remittances error:', err);
    res.status(500).json({ message: 'Failed to retrieve remittances' });
  }
});

/**
 * POST /api/cod-remittance/upload-advice
 * Ingest and reconcile courier COD advice batch.
 */
router.post('/upload-advice', async (req, res) => {
  try {
    const { carrierName, utrNumber, bankName, accountNumber, transferDate, cycle, rows } = req.body;

    if (!utrNumber || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'utrNumber and non-empty rows array are required' });
    }

    const remittance = await CodRemittanceService.parseRemittanceAdvice({
      tenantId: req.tenantId,
      carrierName,
      utrNumber,
      bankName,
      accountNumber,
      transferDate,
      cycle,
      rows
    });

    res.status(201).json({
      success: true,
      message: 'COD Remittance advice processed and reconciled successfully',
      remittance
    });
  } catch (err) {
    logger.error('Upload remittance error:', err);
    res.status(400).json({ message: err.message || 'Failed to process remittance advice' });
  }
});

/**
 * POST /api/cod-remittance/request-early-cod
 * Request early T+1 settlement for delivered COD shipments.
 */
router.post('/request-early-cod', async (req, res) => {
  try {
    const { shipmentIds, cycle = 'EARLY_T1' } = req.body;

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      return res.status(400).json({ message: 'shipmentIds array is required' });
    }

    const result = await CodRemittanceService.requestEarlyCod({
      tenantId: req.tenantId,
      shipmentIds,
      cycle
    });

    res.json(result);
  } catch (err) {
    logger.error('Request early COD error:', err);
    res.status(400).json({ message: err.message || 'Failed to process early COD payout' });
  }
});

module.exports = router;
