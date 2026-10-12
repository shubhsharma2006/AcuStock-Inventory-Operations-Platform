/**
 * AcuStock WhatsApp Meta Cloud API Client
 * 
 * Handles sending messages to WhatsApp users. Supports both live Meta Graph API
 * and simulated local logging mode.
 */

const aiConfig = require('../config/ai.config');
const logger = require('../../utils/logger');

class WhatsAppClient {
  constructor() {
    this.apiToken = aiConfig.whatsapp.apiToken;
    this.phoneNumberId = aiConfig.whatsapp.phoneNumberId;
    this.apiVersion = aiConfig.whatsapp.apiVersion;
    this.isLive = Boolean(this.apiToken && this.phoneNumberId);

    if (this.isLive) {
      this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      logger.info('📱 WhatsApp Client initialized with Meta Cloud API');
    } else {
      this.baseUrl = null;
      logger.info('📱 WhatsApp Client initialized in Local Simulation Mode');
    }
  }

  /**
   * Send WhatsApp plain text / formatted markdown message
   * 
   * @param {string} to - Recipient phone number (E.164 without +)
   * @param {string} text - Message text
   * @returns {Promise<Object>} API response or simulated result
   */
  async sendTextMessage(to, text) {
    if (!to || !text) {
      throw new Error('Recipient number and text are required');
    }

    const cleanTo = to.replace(/\D/g, '');

    if (!this.isLive) {
      logger.info(`📱 [WHATSAPP-SIMULATION] To: +${cleanTo}\nMessage:\n${text}\n----------------------`);
      return {
        success: true,
        mode: 'simulated',
        to: cleanTo,
        messageId: `wamid.sim_${Date.now()}`
      };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'text',
          text: {
            preview_url: false,
            body: text
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || `WhatsApp API error ${response.status}`);
      }

      return {
        success: true,
        mode: 'live',
        data
      };
    } catch (err) {
      logger.error(`Failed to send WhatsApp message to ${cleanTo}:`, err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = new WhatsAppClient();
