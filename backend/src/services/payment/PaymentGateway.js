/**
 * PaymentGateway — Base contract for all payment gateway strategies.
 * Defines the unified interface for order creation, verification, webhooks, and refunds.
 */

class PaymentGateway {
  constructor(name) {
    if (new.target === PaymentGateway) {
      throw new TypeError("Cannot construct PaymentGateway instances directly");
    }
    this.name = name;
  }

  /**
   * Create an order / checkout session on the gateway.
   * @param {Object} params
   * @param {number} params.amountMinor - Amount in minor unit (paise / cents)
   * @param {string} params.currency - 'INR' | 'USD'
   * @param {string} params.receipt - Internal transaction reference ID
   * @param {Object} params.metadata - Metadata (tenantId, planId, transactionId)
   * @param {Object} [params.customer] - Customer name / email
   * @returns {Promise<Object>} Gateway checkout payload
   */
  async createOrder(params) {
    throw new Error(`createOrder() not implemented in ${this.name}`);
  }

  /**
   * Verify a client-side payment return (e.g. Razorpay payment signature or redirect).
   * @param {Object} params
   * @param {string} params.orderId
   * @param {string} params.paymentId
   * @param {string} params.signature
   * @returns {Promise<boolean>} True if valid, throws or returns false if invalid
   */
  async verifyPayment(params) {
    throw new Error(`verifyPayment() not implemented in ${this.name}`);
  }

  /**
   * Verify cryptographic signature of an inbound webhook payload.
   * @param {string|Buffer} rawBody
   * @param {string} signature
   * @param {string} secret
   * @returns {Object} Verified raw event
   */
  verifyWebhookSignature(rawBody, signature, secret) {
    throw new Error(`verifyWebhookSignature() not implemented in ${this.name}`);
  }

  /**
   * Normalize gateway-specific webhook events into a unified structure.
   * @param {Object} rawEvent
   * @returns {{ eventId: string, type: 'PAYMENT_SUCCESS'|'PAYMENT_FAILED'|'OTHER', orderId?: string, paymentId?: string, amountMinor?: number, currency?: string, metadata?: Object }}
   */
  normalizeWebhookEvent(rawEvent) {
    throw new Error(`normalizeWebhookEvent() not implemented in ${this.name}`);
  }

  /**
   * Refund a captured payment.
   * @param {Object} params
   * @param {string} params.paymentId
   * @param {number} params.amountMinor
   * @param {string} [params.reason]
   * @returns {Promise<Object>} Refund response
   */
  async refundPayment(params) {
    throw new Error(`refundPayment() not implemented in ${this.name}`);
  }

  /**
   * Query the latest payment status directly from the gateway API.
   * @param {string} gatewayPaymentId
   * @returns {Promise<Object>}
   */
  async getPaymentStatus(gatewayPaymentId) {
    throw new Error(`getPaymentStatus() not implemented in ${this.name}`);
  }
}

module.exports = PaymentGateway;
