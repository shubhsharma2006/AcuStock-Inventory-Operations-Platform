/**
 * AcuStock WhatsApp Proactive Notifier
 * 
 * Sends automated WhatsApp notifications to warehouse managers for:
 * 1. Critical safety stock breaches
 * 2. FEFO expiring lot alerts
 * 3. Draft Purchase Order confirmations
 */

const User = require('../../models/User');
const whatsAppClient = require('./whatsapp-client');
const { logAiEvent } = require('../core/audit');
const logger = require('../../utils/logger');

class WhatsAppNotifier {
  /**
   * Dispatch proactive low stock alert to managers of a tenant
   */
  async notifyLowStockAlert({ tenantId, item, currentStock, minStockThreshold }) {
    try {
      if (!tenantId || !item) return;

      // Find managers/admins with phone numbers
      const managers = await User.find({
        tenantId,
        role: { $in: ['ADMIN', 'MANAGER'] },
        phone: { $exists: true, $ne: '' },
        isActive: true
      }).select('name phone role');

      if (!managers.length) {
        return;
      }

      const alertMessage = 
`⚠️ *AcuStock Alert: Low Stock Warning*

📦 Product: *${item.name}*
🔢 Current Stock: *${currentStock}* units
🎯 Safety Level: *${minStockThreshold}* units

💡 *Recommended Action:*
Reply to this message with:
👉 *"Draft PO for ${item.shortName || item.name}"* to generate a replenishment order.`;

      for (const manager of managers) {
        await whatsAppClient.sendTextMessage(manager.phone, alertMessage);
        
        await logAiEvent({
          action: 'AI_RECOMMENDATION_DISPATCHED',
          context: {
            tenantId,
            userId: manager._id,
            userName: manager.name,
            role: manager.role,
            source: 'whatsapp'
          },
          summary: `Dispatched low stock WhatsApp alert for "${item.name}" to ${manager.phone}`,
          metadata: {
            itemId: item._id,
            currentStock,
            minStockThreshold
          }
        });
      }
    } catch (err) {
      logger.error('Failed to dispatch low stock WhatsApp notification:', err.message);
    }
  }

  /**
   * Dispatch expiring lot alert
   */
  async notifyExpiringLotAlert({ tenantId, lotNumber, productName, remainingQty, daysLeft }) {
    try {
      if (!tenantId || !lotNumber) return;

      const managers = await User.find({
        tenantId,
        role: { $in: ['ADMIN', 'MANAGER'] },
        phone: { $exists: true, $ne: '' },
        isActive: true
      }).select('name phone role');

      if (!managers.length) return;

      const alertMessage =
`⏳ *AcuStock FEFO Alert: Lot Expiring Soon*

📦 Product: *${productName}*
🏷️ Lot Number: *${lotNumber}*
🔢 Remaining: *${remainingQty}* units
⏱️ Days Remaining: *${daysLeft} days*

💡 *Recommended Action:*
Prioritize dispatch under FEFO or initiate discount/re-allocation.`;

      for (const manager of managers) {
        await whatsAppClient.sendTextMessage(manager.phone, alertMessage);
      }
    } catch (err) {
      logger.error('Failed to dispatch expiring lot WhatsApp notification:', err.message);
    }
  }

  /**
   * Dispatch shipment dispatch alert to customer/recipient
   */
  async notifyShipmentDispatched({ tenantId, shipment, recipientPhone, trackingUrl }) {
    try {
      if (!tenantId || !recipientPhone) return;

      const carrier = shipment.courier || shipment.carrierType || 'Courier Partner';
      const awb = shipment.awb ? `\n🏷️ AWB / Tracking No: *${shipment.awb}*` : '';
      const trackingLink = trackingUrl ? `\n🔗 Live Tracking: ${trackingUrl}` : '';

      const alertMessage =
`🚚 *AcuStock Dispatch Notification*

Hello *${shipment.customerDetails?.customerName || shipment.customerName || 'Customer'}*,
Your shipment (*${shipment.shipmentNumber || 'Shipment'}*) has been dispatched!

📦 Items: *${shipment.quantity} units* (${shipment.productName || 'Order Items'})
🏢 Carrier: *${carrier}*${awb}${trackingLink}

Thank you for your business!`;

      await whatsAppClient.sendTextMessage(recipientPhone, alertMessage);

      await logAiEvent({
        action: 'AI_RECOMMENDATION_DISPATCHED',
        context: {
          tenantId,
          role: 'SYSTEM',
          source: 'whatsapp'
        },
        summary: `Dispatched shipment dispatched WhatsApp notification to ${recipientPhone} for shipment ${shipment.shipmentNumber || shipment._id}`,
        metadata: {
          shipmentId: shipment._id,
          recipientPhone,
          carrier
        }
      });
    } catch (err) {
      logger.error('Failed to dispatch shipment dispatched WhatsApp notification:', err.message);
    }
  }
}

module.exports = new WhatsAppNotifier();

