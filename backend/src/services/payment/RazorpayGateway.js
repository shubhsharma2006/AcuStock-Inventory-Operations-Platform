const crypto = require('crypto');
const PaymentGateway = require('./PaymentGateway');
const logger = require('../../utils/logger');

class RazorpayGateway extends PaymentGateway {
  constructor(config = {}) {
    super('RAZORPAY');
    this.keyId = config.keyId || process.env.RAZORPAY_KEY_ID;
    this.keySecret = config.keySecret || process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = config.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!this.keyId || !this.keySecret) {
      logger.warn('RazorpayGateway initialized without complete API credentials (RAZORPAY_KEY_ID/SECRET)');
    }
  }

  /**
   * Helper to make authenticated HTTPS requests to Razorpay API
   */
  async #request(endpoint, method = 'GET', data = null) {
    if (!this.keyId || !this.keySecret) {
      throw new Error('Razorpay API keys are not configured');
    }

    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const json = await response.json();
    if (!response.ok) {
      const err = new Error(json.error?.description || 'Razorpay API request failed');
      err.code = json.error?.code;
      throw err;
    }
    return json;
  }

  async createOrder({ amountMinor, currency, receipt, metadata, customer }) {
    // Razorpay requires currency in uppercase and amount in paise (minor units)
    const payload = {
      amount: amountMinor,
      currency: (currency || 'INR').toUpperCase(),
      receipt: String(receipt).slice(0, 40), // Razorpay max length 40
      notes: {
        tenantId: metadata?.tenantId ? String(metadata.tenantId) : '',
        planId: metadata?.planId ? String(metadata.planId) : '',
        transactionId: metadata?.transactionId ? String(metadata.transactionId) : ''
      }
    };

    const order = await this.#request('/orders', 'POST', payload);

    return {
      gateway: this.name,
      orderId: order.id,
      amountMinor: order.amount,
      currency: order.currency,
      keyId: this.keyId,
      customer: customer || {}
    };
  }

  async verifyPayment({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) {
      throw new Error('Missing Razorpay verification parameters (orderId, paymentId, signature)');
    }
    if (!this.keySecret) {
      throw new Error('Razorpay key secret is not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );

    if (!isValid) {
      throw new Error('Invalid Razorpay payment signature');
    }

    return true;
  }

  verifyWebhookSignature(rawBody, signature, secret = this.webhookSecret) {
    if (!secret) {
      throw new Error('Razorpay webhook secret is not configured');
    }
    if (!signature) {
      throw new Error('Missing X-Razorpay-Signature header');
    }

    const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyString)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );

    if (!isValid) {
      throw new Error('Invalid Razorpay webhook signature');
    }

    return JSON.parse(bodyString);
  }

  normalizeWebhookEvent(rawEvent) {
    const eventName = rawEvent.event;
    const paymentEntity = rawEvent.payload?.payment?.entity || {};
    const orderEntity = rawEvent.payload?.order?.entity || {};

    let type = 'OTHER';
    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      type = 'PAYMENT_SUCCESS';
    } else if (eventName === 'payment.failed') {
      type = 'PAYMENT_FAILED';
    }

    return {
      eventId: rawEvent.event_id || paymentEntity.id || `rzp_evt_${Date.now()}`,
      type,
      orderId: paymentEntity.order_id || orderEntity.id,
      paymentId: paymentEntity.id,
      amountMinor: paymentEntity.amount || orderEntity.amount,
      currency: paymentEntity.currency || orderEntity.currency,
      metadata: paymentEntity.notes || orderEntity.notes || {}
    };
  }

  async refundPayment({ paymentId, amountMinor, reason }) {
    const payload = {};
    if (amountMinor) payload.amount = amountMinor;
    if (reason) payload.notes = { reason };

    return await this.#request(`/payments/${paymentId}/refund`, 'POST', payload);
  }

  async getPaymentStatus(gatewayPaymentId) {
    return await this.#request(`/payments/${gatewayPaymentId}`, 'GET');
  }
}

module.exports = RazorpayGateway;
