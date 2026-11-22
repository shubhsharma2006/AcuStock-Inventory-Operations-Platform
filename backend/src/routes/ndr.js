'use strict';

const express = require('express');
const NdrService = require('../services/logistics/NdrService');
const Shipment = require('../models/Shipment');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/ndr/webhook
 * Carrier webhook endpoint receiving real-time failed delivery notifications.
 */
router.post('/webhook', async (req, res) => {
  try {
    const { awb, shipmentId, carrier, reason, rawReason, location } = req.body;

    if (!awb && !shipmentId) {
      return res.status(400).json({ message: 'awb or shipmentId is required' });
    }

    const result = await NdrService.ingestNdrEvent({
      shipmentId,
      awb,
      carrier: carrier || 'BIGSHIP',
      rawReason: reason || rawReason || 'Customer unavailable',
      failureLocation: location || 'Destination Delivery Hub'
    });

    res.status(200).json({
      success: true,
      message: 'NDR event ingested and customer notification triggered',
      data: result
    });
  } catch (err) {
    logger.error('NDR Webhook Error:', err);
    res.status(500).json({ message: err.message || 'Failed to ingest NDR event' });
  }
});

// Tenant-authenticated routes
router.use(requireAuth);
router.use(requireTenantId);

/**
 * GET /api/ndr/dashboard
 * Summary KPIs and metrics for operations NDR control tower.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const metrics = await NdrService.getNdrMetrics(req.tenantId);
    res.json({
      success: true,
      metrics
    });
  } catch (err) {
    logger.error('NDR Dashboard Metrics Error:', err);
    res.status(500).json({ message: 'Failed to retrieve NDR metrics' });
  }
});

/**
 * GET /api/ndr/shipments
 * List active NDR shipments with urgency scoring and cutoff countdowns.
 */
router.get('/shipments', async (req, res) => {
  try {
    const { page, limit, carrier, reason } = req.query;
    const result = await NdrService.getPendingNdrs(req.tenantId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      carrier,
      reason
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    logger.error('NDR Shipments Query Error:', err);
    res.status(500).json({ message: 'Failed to retrieve NDR shipments' });
  }
});

/**
 * POST /api/ndr/resolve
 * Operations team or customer submits reattempt or RTO instruction.
 */
router.post('/resolve', async (req, res) => {
  try {
    const {
      shipmentId,
      awb,
      action,
      preferredDate,
      preferredTimeSlot,
      alternateAddress,
      alternatePhone,
      remarks
    } = req.body;

    if (!shipmentId && !awb) {
      return res.status(400).json({ message: 'shipmentId or awb is required' });
    }
    if (!action) {
      return res.status(400).json({ message: 'action is required (REATTEMPT, UPDATE_DETAILS, HOLD_HUB, RTO_IMMEDIATE)' });
    }

    const result = await NdrService.resolveNdr({
      shipmentId,
      awb,
      action,
      preferredDate,
      preferredTimeSlot,
      alternateAddress,
      alternatePhone,
      remarks,
      resolvedBy: req.user?.name || req.user?.email || 'OPERATIONS_USER'
    });

    res.json({
      success: true,
      message: `NDR action '${action}' recorded and pushed to carrier.`,
      data: result
    });
  } catch (err) {
    logger.error('NDR Resolve Error:', err);
    res.status(400).json({ message: err.message || 'Failed to resolve NDR' });
  }
});

/**
 * POST /api/ndr/bulk-action
 * Bulk action across multiple NDR shipments (e.g. bulk reattempt or bulk RTO).
 */
router.post('/bulk-action', async (req, res) => {
  try {
    const { shipmentIds, action, remarks } = req.body;

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      return res.status(400).json({ message: 'shipmentIds array is required' });
    }
    if (!action) {
      return res.status(400).json({ message: 'action is required' });
    }

    const results = [];
    const errors = [];

    for (const id of shipmentIds) {
      try {
        const resItem = await NdrService.resolveNdr({
          shipmentId: id,
          action,
          remarks,
          resolvedBy: req.user?.name || 'BULK_OPERATIONS'
        });
        results.push(resItem);
      } catch (err) {
        errors.push({ shipmentId: id, error: err.message });
      }
    }

    res.json({
      success: true,
      totalProcessed: results.length,
      totalFailed: errors.length,
      results,
      errors
    });
  } catch (err) {
    logger.error('NDR Bulk Action Error:', err);
    res.status(500).json({ message: 'Failed to process bulk NDR action' });
  }
});

module.exports = router;
