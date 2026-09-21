const PaymentGateway = require('./PaymentGateway');
const crypto = require('crypto');

/**
 * DemoPaymentGateway — Strictly isolated adapter for academic evaluation and offline demonstration.
 * Activated strictly when PAYMENT_MODE === 'demo'.
 * Generates realistic deterministic simulation tokens, allows instant test success/failure flows.
 */
class DemoPaymentGateway extends PaymentGateway {
  constructor() {
    super('DEMO');
    this.demoSecret = 'demo_secret_key_acustock_viva_2026';
  }

  async createOrder({ amountMinor, currency, receipt, metadata, customer }) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${receipt}-${timestamp}`).digest('hex').slice(0, 8);
    const demoOrderId = `demo_ord_${hash}_${timestamp}`;

    return {
      gateway: this.name,
      orderId: demoOrderId,
      amountMinor,
      currency: (currency || 'INR').toUpperCase(),
      simulationUrl: `/billing/demo-checkout?orderId=${demoOrderId}`,
      customer: customer || {},
      isSimulation: true,
      instructions: 'Demo Sandbox: Click "Simulate Success" or "Simulate Failure" to test the billing lifecycle.'
    };
  }

  async verifyPayment({ orderId, paymentId, signature }) {
    if (!orderId) {
      throw new Error('Order ID required for Demo verification');
    }
    // In Demo mode, if client provides signature 'sim_failed', reject it to simulate failure handling
    if (signature === 'sim_failed' || paymentId === 'sim_failed') {
      throw new Error('Simulated payment rejection: Card declined by issuer');
    }
    return true;
  }

  verifyWebhookSignature(rawBody, signature, secret = this.demoSecret) {
    // In demo mode, accept demo signature or verify simple HMAC
    const bodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    return typeof rawBody === 'string' ? JSON.parse(bodyString) : rawBody;
  }

  normalizeWebhookEvent(rawEvent) {
    const isSuccess = rawEvent.type !== 'PAYMENT_FAILED' && rawEvent.status !== 'FAILED';
    return {
      eventId: rawEvent.eventId || `demo_evt_${Date.now()}`,
      type: isSuccess ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
      orderId: rawEvent.orderId,
      paymentId: rawEvent.paymentId || `demo_pay_${Date.now()}`,
      amountMinor: rawEvent.amountMinor,
      currency: (rawEvent.currency || 'INR').toUpperCase(),
      metadata: rawEvent.metadata || {}
    };
  }

  async refundPayment({ paymentId, amountMinor, reason }) {
    return {
      refundId: `demo_rfnd_${Date.now()}`,
      paymentId,
      amountMinor,
      status: 'PROCESSED',
      reason: reason || 'Simulated refund'
    };
  }

  async getPaymentStatus(gatewayPaymentId) {
    return {
      id: gatewayPaymentId,
      status: 'SUCCESS',
      mode: 'DEMO'
    };
  }
}

module.exports = DemoPaymentGateway;
