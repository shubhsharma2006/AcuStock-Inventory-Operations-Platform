/**
 * Blue Dart Tracking Adapter.
 * Docs: https://developer.bluedart.com
 * Requires: BLUEDART_CLIENT_ID + BLUEDART_LICENSE_KEY env vars.
 */
const logger = require('../../../utils/logger');

module.exports = {
  name: 'BLUEDART',
  isConfigured: () => Boolean(process.env.BLUEDART_CLIENT_ID && process.env.BLUEDART_LICENSE_KEY),

  async fetchTracking(awb) {
    if (!this.isConfigured() || !awb) return null;

    // Ready for SOAP/REST integration when developer credentials are provided
    logger.debug(`Blue Dart tracking requested for AWB ${awb}`);
    return null;
  }
};
