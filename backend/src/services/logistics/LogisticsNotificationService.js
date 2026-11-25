'use strict';

const whatsAppClient = require('../../ai/whatsapp/whatsapp-client');
const logger = require('../../utils/logger');

/**
 * Enterprise Multi-Channel Logistics Notification Service (WhatsApp & SMS)
 */
class LogisticsNotificationService {
  /**
   * Format phone number to E.164 standard (defaulting to Indian +91 if 10 digits)
   */
  static cleanPhoneNumber(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10) {
      clean = `91${clean}`;
    } else if (clean.length === 11 && clean.startsWith('0')) {
      clean = `91${clean.slice(1)}`;
    }
    return clean;
  }

  /**
   * Format public or domain-relative URL into accessible deep link
   */
  static formatTrackingLink(trackingUrl) {
    if (!trackingUrl) return 'https://acustock.app/tracking';
    if (trackingUrl.startsWith('http://') || trackingUrl.startsWith('https://')) {
      return trackingUrl;
    }
    const baseUrl = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://acustock.app';
    return `${baseUrl.replace(/\/$/, '')}${trackingUrl.startsWith('/') ? '' : '/'}${trackingUrl}`;
  }

  /**
   * Send Non-Delivery Report (NDR) Delivery Exception Alert with Reschedule Action Link
   */
  static async sendNdrAlert({
    phone,
    customerName = 'Valued Customer',
    awb,
    reference,
    reason = 'Customer Unavailable',
    rtoCutoffHours = 24,
    trackingUrl
  }) {
    const cleanPhone = LogisticsNotificationService.cleanPhoneNumber(phone);
    if (!cleanPhone) {
      logger.warn(`[NOTIFICATIONS] Skipped NDR alert: No valid phone for AWB ${awb}`);
      return { success: false, reason: 'INVALID_PHONE' };
    }

    const actionUrl = LogisticsNotificationService.formatTrackingLink(trackingUrl || `/tracking/${reference || awb}`);

    const whatsAppMessage =
`🚨 *Delivery Exception Alert: Action Required*

Hi *${customerName}*,
We attempted to deliver your shipment (*${reference || awb}* / AWB: *${awb}*), but the delivery could not be completed.

❌ *Courier Reason:* ${reason}
⏳ *Cutoff Time:* Please respond within *${rtoCutoffHours} hours* to avoid Return to Origin (RTO).

👉 *Reschedule Delivery / Update Address Online:*
${actionUrl}

_AcuStock Logistics Automated Tracking_`;

    try {
      const waResult = await whatsAppClient.sendTextMessage(cleanPhone, whatsAppMessage);
      
      // Secondary SMS Fallback Logging
      logger.info(`📲 [SMS-GATEWAY-SIMULATION] To: +${cleanPhone} | "AcuStock Alert: Delivery failed for ${awb} (${reason}). Reschedule delivery within ${rtoCutoffHours}h at ${actionUrl}"`);

      return {
        success: true,
        channel: 'WHATSAPP_PRIMARY',
        phone: cleanPhone,
        messageId: waResult?.messageId || `wamid.sim_${Date.now()}`,
        actionUrl
      };
    } catch (err) {
      logger.error(`[NOTIFICATIONS] Failed to send NDR alert to ${cleanPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send Order Dispatched Confirmation Alert with Live Tracking Link
   */
  static async sendDispatchedAlert({
    phone,
    customerName = 'Valued Customer',
    awb,
    reference,
    carrier = 'Delhivery Express',
    expectedDeliveryDate,
    trackingUrl
  }) {
    const cleanPhone = LogisticsNotificationService.cleanPhoneNumber(phone);
    if (!cleanPhone) return { success: false, reason: 'INVALID_PHONE' };

    const actionUrl = LogisticsNotificationService.formatTrackingLink(trackingUrl || `/tracking/${reference || awb}`);
    const etaText = expectedDeliveryDate
      ? new Date(expectedDeliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'In 2-4 business days';

    const whatsAppMessage =
`📦 *Shipment Dispatched!*

Hi *${customerName}*,
Great news! Your order (*${reference || awb}*) is packed and dispatched via *${carrier}*.

🏷️ *AWB Tracking No:* ${awb}
🗓️ *Estimated Delivery:* ${etaText}

📍 *Live Milestone Tracking:*
${actionUrl}

_Thank you for choosing AcuStock!_`;

    try {
      const waResult = await whatsAppClient.sendTextMessage(cleanPhone, whatsAppMessage);
      logger.info(`📲 [SMS-GATEWAY-SIMULATION] To: +${cleanPhone} | "Your order ${reference || awb} is dispatched via ${carrier}. Track at ${actionUrl}"`);
      return { success: true, channel: 'WHATSAPP_PRIMARY', phone: cleanPhone, messageId: waResult?.messageId };
    } catch (err) {
      logger.error(`[NOTIFICATIONS] Failed to send dispatch alert to ${cleanPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send Out for Delivery Alert with Rider Phone and Verification OTP
   */
  static async sendOutForDeliveryAlert({
    phone,
    customerName = 'Valued Customer',
    awb,
    reference,
    carrier = 'Delhivery',
    riderPhone = '+91 98765 43210',
    otp = '4921'
  }) {
    const cleanPhone = LogisticsNotificationService.cleanPhoneNumber(phone);
    if (!cleanPhone) return { success: false, reason: 'INVALID_PHONE' };

    const whatsAppMessage =
`🚚 *Out for Delivery Today!*

Hi *${customerName}*,
Your package (*${awb}*) is out with our delivery executive.

📞 *Delivery Executive Phone:* ${riderPhone}
🔒 *Secure Delivery OTP:* *${otp}*

_Please share this OTP with the rider only after receiving your package._`;

    try {
      await whatsAppClient.sendTextMessage(cleanPhone, whatsAppMessage);
      return { success: true, channel: 'WHATSAPP_PRIMARY', phone: cleanPhone };
    } catch (err) {
      logger.error(`[NOTIFICATIONS] Failed to send OFD alert to ${cleanPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send Early COD Settlement Confirmation to Merchant
   */
  static async sendEarlyCodSettlementAlert({
    phone,
    merchantName = 'Merchant Partner',
    amount,
    utrNumber,
    cycle = 'EARLY_T1'
  }) {
    const cleanPhone = LogisticsNotificationService.cleanPhoneNumber(phone);
    if (!cleanPhone) return { success: false, reason: 'INVALID_PHONE' };

    const whatsAppMessage =
`💰 *Early COD Payout Transferred!*

Hi *${merchantName}*,
Your ${cycle === 'EARLY_T1' ? 'T+1 Instant' : 'T+2 Accelerated'} COD settlement of *₹${Number(amount).toLocaleString('en-IN')}* has been transferred to your registered bank account.

🏦 *Bank UTR Ref:* ${utrNumber}
⚡ *Status:* Settled & Reconciled

_AcuStock Capital & Liquidity Services_`;

    try {
      await whatsAppClient.sendTextMessage(cleanPhone, whatsAppMessage);
      return { success: true, channel: 'WHATSAPP_PRIMARY', phone: cleanPhone };
    } catch (err) {
      logger.error(`[NOTIFICATIONS] Failed to send COD payout alert to ${cleanPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = LogisticsNotificationService;
