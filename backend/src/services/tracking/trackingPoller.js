/**
 * Tracking Poller Worker.
 * Runs on PM2 leader worker (instance 0) only.
 * Checks active shipments, polls configured carrier APIs, records TrackingEvents,
 * and broadcasts real-time status updates via Socket.IO.
 */
const Shipment = require('../../models/Shipment');
const TrackingEvent = require('../../models/TrackingEvent');
const Tenant = require('../../models/Tenant');
const carriers = require('./carriers');
const logger = require('../../utils/logger');

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ACTIVE_AGE_DAYS = 14;

async function pollTrackingUpdates() {
  try {
    // 1. Fetch tenants that have tracking enabled
    const activeTenants = await Tenant.find({
      'settings.trackingModuleEnabled': { $ne: false },
      'settings.trackingEnabled': { $ne: false },
      isActive: true
    }, { _id: 1, 'settings.trackingCarriers': 1 }).lean();

    if (activeTenants.length === 0) return;

    const tenantMap = new Map(
      activeTenants.map(t => [String(t._id), t.settings?.trackingCarriers || ['PORTER', 'DELHIVERY', 'DTDC', 'BLUEDART']])
    );

    const cutoffDate = new Date(Date.now() - MAX_ACTIVE_AGE_DAYS * 24 * 60 * 60 * 1000);

    // 2. Query active shipments
    const shipments = await Shipment.find({
      tenantId: { $in: Array.from(tenantMap.keys()) },
      status: { $in: ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
      createdAt: { $gte: cutoffDate },
      carrierType: { $in: Object.keys(carriers).filter(k => carriers[k] !== null) },
      $or: [
        { awb: { $exists: true, $ne: '' } },
        { 'porterDetails.tripId': { $exists: true, $ne: '' } }
      ]
    }).limit(100).lean();

    if (shipments.length === 0) return;

    logger.debug(`Tracking poller: evaluating ${shipments.length} candidate shipments`);

    for (const s of shipments) {
      try {
        const allowedCarriers = tenantMap.get(String(s.tenantId)) || [];
        if (!allowedCarriers.includes(s.carrierType)) continue;

        const adapter = carriers[s.carrierType];
        if (!adapter || !adapter.isConfigured()) continue; // Skip unconfigured carriers

        const trackingId = s.carrierType === 'PORTER' ? s.porterDetails?.tripId : s.awb;
        if (!trackingId) continue;

        const result = await adapter.fetchTracking(trackingId);
        if (!result) continue;

        // Save immutable audit event
        await TrackingEvent.create({
          shipmentId:  s._id,
          tenantId:    s.tenantId,
          carrierType: s.carrierType,
          awb:         s.awb,
          status:      result.status,
          location:    result.location,
          geoLocation: result.geoLocation || undefined,
          metadata:    result.metadata,
          recordedAt:  result.timestamp || new Date(),
          source:      'POLL'
        });

        // Update shipment status if changed
        if (result.status && result.status !== s.status) {
          await Shipment.findByIdAndUpdate(s._id, {
            status: result.status,
            $push: {
              statusHistory: {
                status:    result.status,
                timestamp: new Date(),
                notes:     `Auto-updated via ${s.carrierType} API`
              }
            }
          });

          // Broadcast real-time update
          if (global.emitRealTimeUpdate) {
            global.emitRealTimeUpdate('shipment:tracking-update', {
              shipmentId:  String(s._id),
              tenantId:    String(s.tenantId),
              status:      result.status,
              location:    result.location,
              geoLocation: result.geoLocation,
              carrierType: s.carrierType,
              updatedAt:   new Date().toISOString()
            }, 'all');
          }

          logger.info(`Shipment ${s._id} status updated to ${result.status} via ${s.carrierType}`);
        }
      } catch (err) {
        logger.warn(`Tracking poll failed for shipment ${s._id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error('Tracking poller worker error:', { error: err.message, stack: err.stack });
  }
}

function startTrackingPoller() {
  const workerId = Number(process.env.NODE_APP_INSTANCE || 0);
  if (workerId !== 0) {
    logger.debug(`Worker instance ${workerId}: skipping tracking poller`);
    return;
  }

  logger.info('📡 Delivery tracking poller initialized (15-min interval)');
  // Delayed initial run (30s after startup) to let database connections stabilize
  setTimeout(pollTrackingUpdates, 30_000);
  setInterval(pollTrackingUpdates, POLL_INTERVAL_MS);
}

module.exports = { startTrackingPoller, pollTrackingUpdates };
