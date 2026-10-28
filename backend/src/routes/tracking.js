/**
 * Delivery Tracking API Routes.
 * Provides capability-gated tracking status, web portal links, and milestone history.
 */
const express = require('express');
const mongoose = require('mongoose');
const Shipment = require('../models/Shipment');
const TrackingEvent = require('../models/TrackingEvent');
const Tenant = require('../models/Tenant');
const Transporter = require('../models/Transporter');
const carriers = require('../services/tracking/carriers');
const { getCarrierTrackingUrl } = require('../services/tracking/carriers/portalLinks');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/tracking/:shipmentId
 * Retrieves tracking capability mode, timeline events, and web portal links
 */
router.get('/:shipmentId', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.shipmentId)) {
      return res.status(400).json({ message: 'Invalid shipment ID' });
    }

    const tenant = await Tenant.findById(req.tenantId, { settings: 1 }).lean();
    const trackingAllowed = Boolean(
      (tenant?.settings?.trackingModuleEnabled ?? true) &&
      (tenant?.settings?.trackingEnabled ?? true)
    );

    const shipment = await Shipment.findOne({
      _id: req.params.shipmentId,
      tenantId: req.tenantId
    })
      .populate('productId', 'name shortName')
      .populate('transporterId', 'name code trackingUrlPattern')
      .lean();

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Step 1: Check tracking identification
    const trackingId = shipment.carrierType === 'PORTER'
      ? shipment.porterDetails?.tripId
      : shipment.awb;

    const adapter = carriers[shipment.carrierType];
    const isApiConfigured = Boolean(adapter && adapter.isConfigured());

    // Step 2: Resolve web portal tracking link
    const portalUrl = getCarrierTrackingUrl(
      shipment.carrierType,
      shipment.awb,
      shipment.transporterId?.trackingUrlPattern
    );

    // If no tracking ID exists at all (Manual / Local dispatch)
    if (!trackingId || !trackingId.trim()) {
      return res.json({
        trackingMode: 'NONE',
        trackingAllowed,
        isApiConfigured: false,
        shipment,
        events: [],
        portalUrl: null,
        hasLiveGps: false,
        carrierType: shipment.carrierType || 'IN_HOUSE'
      });
    }

    // Step 3: Fetch audit events from TrackingEvent collection
    const events = await TrackingEvent.find({
      shipmentId: shipment._id,
      tenantId: req.tenantId
    })
      .sort({ recordedAt: -1 })
      .limit(30)
      .lean();

    // Check if live GPS coordinates are present in any recent event
    const hasLiveGps = events.some(
      e => e.geoLocation && typeof e.geoLocation.lat === 'number' && typeof e.geoLocation.lng === 'number'
    );

    // Step 4: Determine tracking mode
    let trackingMode = 'MANUAL';
    if (isApiConfigured) {
      trackingMode = 'LIVE_API';
    } else if (portalUrl) {
      trackingMode = 'PORTAL_LINK';
    }

    res.json({
      trackingMode,
      trackingAllowed,
      isApiConfigured,
      shipment,
      events,
      portalUrl,
      hasLiveGps,
      carrierType: shipment.carrierType || 'OTHER'
    });
  } catch (err) {
    logger.error('Tracking fetch error:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to retrieve delivery tracking' });
  }
});

/**
 * POST /api/tracking/:shipmentId/poll-now
 * Force a fresh on-demand tracking fetch if carrier API is configured
 */
router.post('/:shipmentId/poll-now', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.shipmentId)) {
      return res.status(400).json({ message: 'Invalid shipment ID' });
    }

    const shipment = await Shipment.findOne({
      _id: req.params.shipmentId,
      tenantId: req.tenantId
    });

    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const adapter = carriers[shipment.carrierType];
    if (!adapter || !adapter.isConfigured()) {
      return res.status(400).json({ message: `Live API is not configured for carrier ${shipment.carrierType}` });
    }

    const trackingId = shipment.carrierType === 'PORTER' ? shipment.porterDetails?.tripId : shipment.awb;
    if (!trackingId) {
      return res.status(400).json({ message: 'No tracking ID available for this shipment' });
    }

    const result = await adapter.fetchTracking(trackingId);
    if (!result) {
      return res.status(502).json({ message: 'Carrier tracking service did not return an update' });
    }

    // Save event
    const event = await TrackingEvent.create({
      shipmentId:  shipment._id,
      tenantId:    shipment.tenantId,
      carrierType: shipment.carrierType,
      awb:         shipment.awb,
      status:      result.status,
      location:    result.location,
      geoLocation: result.geoLocation || undefined,
      metadata:    result.metadata,
      recordedAt:  result.timestamp || new Date(),
      source:      'MANUAL'
    });

    if (result.status && result.status !== shipment.status) {
      shipment.status = result.status;
      shipment.statusHistory.push({
        status:    result.status,
        timestamp: new Date(),
        notes:     `On-demand refresh via ${shipment.carrierType} API`
      });
      await shipment.save();
    }

    res.json({ success: true, event, shipment });
  } catch (err) {
    logger.error('On-demand tracking poll error:', { error: err.message, stack: err.stack, tenantId: req.tenantId });
    res.status(500).json({ message: 'Failed to refresh tracking' });
  }
});

module.exports = router;
