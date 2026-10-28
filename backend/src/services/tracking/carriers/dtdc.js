/**
 * DTDC Tracking Adapter.
 * Docs: https://blktapis.dtdc.com
 * Requires: DTDC_API_KEY env var.
 */
const logger = require('../../../utils/logger');

module.exports = {
  name: 'DTDC',
  isConfigured: () => Boolean(process.env.DTDC_API_KEY),

  async fetchTracking(awb) {
    if (!this.isConfigured() || !awb) return null;

    try {
      const response = await fetch(
        `https://blktapis.dtdc.com/oms/v1/track/${encodeURIComponent(awb)}`,
        {
          headers: { 'api-key': process.env.DTDC_API_KEY },
          signal: AbortSignal.timeout(8000)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data?.status) return null;

      const r = (data.status || '').toLowerCase();
      const status = r.includes('delivered') ? 'DELIVERED'
        : r.includes('out for') ? 'OUT_FOR_DELIVERY'
        : r.includes('return')  ? 'RETURNED'
        : r.includes('cancel')  ? 'CANCELLED'
        : 'IN_TRANSIT';

      return {
        status,
        location:    data.currentLocation || 'In Transit Hub',
        geoLocation: null, // Milestone only, no live GPS
        metadata:    { lastUpdate: data.updatedAt },
        timestamp:   data.updatedAt ? new Date(data.updatedAt) : new Date()
      };
    } catch (err) {
      logger.warn(`DTDC tracking failed for AWB ${awb}: ${err.message}`);
      return null;
    }
  }
};
