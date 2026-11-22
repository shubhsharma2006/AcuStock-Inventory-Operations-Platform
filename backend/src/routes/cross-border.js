'use strict';

const express = require('express');
const CrossBorderEngine = require('../services/logistics/CrossBorderEngine');
const CrossBorderShipment = require('../models/CrossBorderShipment');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireAuth);
router.use(requireTenantId);

/**
 * GET /api/cross-border/country-rules
 * Get destination countries customs matrix, de minimis thresholds, and transit times.
 */
router.get('/country-rules', (req, res) => {
  res.json({
    success: true,
    countries: CrossBorderEngine.COUNTRY_RULES,
    carriers: CrossBorderEngine.CARRIER_RATES
  });
});

/**
 * POST /api/cross-border/rate-calculator
 * Compute international freight rates, volumetric weight (div 5000), and duty/tax estimates.
 */
router.post('/rate-calculator', (req, res) => {
  try {
    const { destinationCountry, packages, items, incoterm } = req.body;
    const rates = CrossBorderEngine.calculateShippingRates({
      destinationCountry,
      packages,
      items,
      incoterm
    });

    res.json({
      success: true,
      ...rates
    });
  } catch (err) {
    logger.error('Cross-border rate calculation error:', err);
    res.status(400).json({ message: err.message || 'Failed to calculate international shipping rates' });
  }
});

/**
 * POST /api/cross-border/book
 * Book international shipment, generate CSB-V, and debit logistics freight wallet.
 */
router.post('/book', async (req, res) => {
  try {
    const { carrier, incoterm, exportType, exporterDetails, consigneeDetails, packages, items } = req.body;
    const result = await CrossBorderEngine.bookExportShipment({
      tenantId: req.tenantId,
      carrier,
      incoterm,
      exportType,
      exporterDetails,
      consigneeDetails,
      packages,
      items
    });

    res.json({
      success: true,
      message: `International export booked via ${result.shipment.carrier}! AWB: ${result.awb}, CSB-V: ${result.csbNumber}`,
      ...result
    });
  } catch (err) {
    logger.error('Cross-border booking error:', err);
    res.status(400).json({ message: err.message || 'Failed to book cross-border export' });
  }
});

/**
 * GET /api/cross-border/shipments
 * Retrieve list of international export shipments with status filters.
 */
router.get('/shipments', async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const query = { tenantId: req.tenantId };
    if (status) query.status = status.toUpperCase();

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [shipments, total] = await Promise.all([
      CrossBorderShipment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      CrossBorderShipment.countDocuments(query)
    ]);

    res.json({
      success: true,
      shipments,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (err) {
    logger.error('Cross-border shipments list error:', err);
    res.status(500).json({ message: 'Failed to retrieve cross-border shipments' });
  }
});

/**
 * GET /api/cross-border/commercial-invoice/:id
 * Generate printable Commercial Invoice data payload.
 */
router.get('/commercial-invoice/:id', async (req, res) => {
  try {
    const shipment = await CrossBorderShipment.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Export shipment not found' });
    }

    const payload = CrossBorderEngine.generateCommercialInvoicePayload(shipment);
    res.json({
      success: true,
      payload
    });
  } catch (err) {
    logger.error('Commercial invoice generation error:', err);
    res.status(500).json({ message: 'Failed to generate commercial invoice' });
  }
});

module.exports = router;
