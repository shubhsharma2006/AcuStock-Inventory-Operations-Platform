/**
 * Resolves direct web tracking URLs for carrier portals.
 * Enables 1-click package tracking even when carrier API credentials are not configured.
 */
function getCarrierTrackingUrl(carrierType, awb, customPattern) {
  if (!awb || typeof awb !== 'string') return null;
  const cleanAwb = encodeURIComponent(awb.trim());
  if (!cleanAwb) return null;

  // If a custom Transporter trackingUrlPattern is configured on the transporter record
  if (customPattern && typeof customPattern === 'string' && customPattern.trim()) {
    return customPattern.replace(/\{awb\}|\{trackingNumber\}|\{tracking_number\}/gi, cleanAwb);
  }

  switch (carrierType) {
    case 'DELHIVERY':
      return `https://www.delhivery.com/track/package/${cleanAwb}`;
    case 'DTDC':
      return `https://www.dtdc.in/tracking/shipment-tracking.asp?awb=${cleanAwb}`;
    case 'BLUEDART':
      return `https://www.bluedart.com/tracking?trackNumber=${cleanAwb}`;
    case 'PORTER':
      return `https://porter.in/track/${cleanAwb}`;
    default:
      return null;
  }
}

module.exports = { getCarrierTrackingUrl };
