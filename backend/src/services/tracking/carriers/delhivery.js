/**
 * Delhivery Tracking Adapter.
 * Docs: https://track.delhivery.com/api/v1/packages/json/
 * Provides: package milestones and delivery status updates.
 * Requires: DELHIVERY_API_KEY env var.
 */
const logger = require('../../../utils/logger');

const STATUS_MAP = {
  'Dispatched':       'DISPATCHED',
  'In Transit':       'IN_TRANSIT',
  'Out For Delivery': 'OUT_FOR_DELIVERY',
  'Delivered':        'DELIVERED',
  'RTO Initiated':    'RETURNED',
  'RTO Delivered':    'RETURNED',
  'Cancelled':        'CANCELLED'
};

module.exports = {
  name: 'DELHIVERY',
  isConfigured: () => Boolean(process.env.DELHIVERY_API_KEY),

  async fetchTracking(awb) {
    if (!this.isConfigured() || !awb) return null;

    try {
      const url = new URL('https://track.delhivery.com/api/v1/packages/json/');
      url.searchParams.set('waybill', awb);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Token ${process.env.DELHIVERY_API_KEY}` },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const pkg = data?.ShipmentData?.[0]?.Shipment;
      if (!pkg) return null;

      const rawStatus = pkg.Status?.Status || '';
      return {
        status: STATUS_MAP[rawStatus] || 'IN_TRANSIT',
        location: pkg.Status?.Instructions || pkg.Status?.RecipientAddress?.City || 'In Transit Hub',
        geoLocation: null, // Delhivery provides hub milestone text, not live vehicle GPS
        metadata: {
          expectedDelivery: pkg.ExpectedDeliveryDate,
          originCity:       pkg.OriginArea,
          destinationCity:  pkg.DestinationArea
        },
        timestamp: pkg.Status?.StatusDateTime
          ? new Date(pkg.Status.StatusDateTime)
          : new Date()
      };
    } catch (err) {
      logger.warn(`Delhivery tracking failed for AWB ${awb}: ${err.message}`);
      return null;
    }
  }
};
