/**
 * Porter Hyperlocal Tracking Adapter.
 * Docs: https://porter.in/api-documentation
 * Provides: status, GPS coordinates (lat/lng) when driver is assigned, driver info.
 * Requires: PORTER_API_KEY env var.
 */
const logger = require('../../../utils/logger');

const STATUS_MAP = {
  ORDER_ACCEPTED:    'DISPATCHED',
  ARRIVED_AT_PICKUP: 'DISPATCHED',
  ORDER_STARTED:     'IN_TRANSIT',
  ORDER_COMPLETED:   'DELIVERED',
  ORDER_CANCELLED:   'CANCELLED'
};

module.exports = {
  name: 'PORTER',
  isConfigured: () => Boolean(process.env.PORTER_API_KEY),

  async fetchTracking(tripId) {
    if (!this.isConfigured() || !tripId) return null;

    try {
      const response = await fetch(
        `https://api.porter.in/v1/orders/${encodeURIComponent(tripId)}/track`,
        {
          headers: {
            'x-api-key': process.env.PORTER_API_KEY,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(8000)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const lat = data?.driver_location?.lat != null ? Number(data.driver_location.lat) : null;
      const lng = data?.driver_location?.lng != null ? Number(data.driver_location.lng) : null;
      const hasValidGps = typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);

      return {
        status: STATUS_MAP[data?.status] || 'IN_TRANSIT',
        geoLocation: hasValidGps ? { lat, lng } : null,
        location: data?.driver_location?.address || (hasValidGps ? `${lat}, ${lng}` : null),
        metadata: {
          driverName:    data?.driver?.name,
          driverPhone:   data?.driver?.mobile,
          vehicleNumber: data?.vehicle?.number,
          eta:           data?.eta
        },
        timestamp: new Date()
      };
    } catch (err) {
      logger.warn(`Porter tracking failed for tripId ${tripId}: ${err.message}`);
      return null;
    }
  }
};
