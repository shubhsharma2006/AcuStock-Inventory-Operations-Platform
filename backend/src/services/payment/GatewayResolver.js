const RazorpayGateway = require('./RazorpayGateway');
const StripeGateway = require('./StripeGateway');
const DemoPaymentGateway = require('./DemoPaymentGateway');
const logger = require('../../utils/logger');

class GatewayResolver {
  constructor(options = {}) {
    this.razorpay = new RazorpayGateway(options.razorpay);
    this.stripe = new StripeGateway(options.stripe);
    this.demo = new DemoPaymentGateway();
  }

  /**
   * Resolves appropriate PaymentGateway instance.
   *
   * Resolution Hierarchy:
   * 1. If PAYMENT_MODE === 'demo', strictly returns DemoPaymentGateway.
   * 2. If explicit requestedGateway is passed (e.g. 'stripe' or 'razorpay') and valid, returns it.
   * 3. Currency / Country policy:
   *    - INR -> Razorpay
   *    - USD (or other global currencies) -> Stripe
   *
   * @param {Object} context
   * @param {string} [context.requestedGateway] - 'razorpay' | 'stripe' | 'demo'
   * @param {string} [context.currency] - 'INR' | 'USD'
   * @param {string} [context.country] - 'IN' | 'US' etc.
   * @returns {PaymentGateway}
   */
  resolve(context = {}) {
    const paymentMode = (process.env.PAYMENT_MODE || 'demo').toLowerCase().trim();

    // Security Kill-switch: Production must NEVER allow demo simulation
    if (process.env.NODE_ENV === 'production' && paymentMode !== 'live') {
      throw new Error('FATAL SECURITY VIOLATION: Production environment cannot run with PAYMENT_MODE != "live"');
    }

    // 1. Strict demo mode check
    if (paymentMode === 'demo' || context.requestedGateway === 'demo') {
      logger.info('Payment Gateway Resolved: DEMO (Demo Mode Active)');
      return this.demo;
    }

    const reqGateway = (context.requestedGateway || '').toLowerCase().trim();

    // 2. Explicit gateway request
    if (reqGateway === 'razorpay') {
      return this.razorpay;
    }
    if (reqGateway === 'stripe') {
      return this.stripe;
    }

    // 3. Currency / Geography based policy
    const currency = (context.currency || 'INR').toUpperCase().trim();
    if (currency === 'INR') {
      return this.razorpay;
    }

    return this.stripe;
  }

  /**
   * Directly get a specific gateway by its identifier (useful for webhook routing)
   * @param {string} name - 'razorpay' | 'stripe' | 'demo'
   */
  getGateway(name) {
    const paymentMode = (process.env.PAYMENT_MODE || 'demo').toLowerCase().trim();
    if (process.env.NODE_ENV === 'production' && paymentMode !== 'live') {
      throw new Error('FATAL SECURITY VIOLATION: Production environment cannot run with PAYMENT_MODE != "live"');
    }

    const normalized = (name || '').toLowerCase().trim();
    if (process.env.NODE_ENV === 'production' && normalized === 'demo') {
      throw new Error('FATAL SECURITY VIOLATION: Demo gateway is strictly prohibited in production environment');
    }

    switch (normalized) {
      case 'razorpay':
        return this.razorpay;
      case 'stripe':
        return this.stripe;
      case 'demo':
        return this.demo;
      default:
        throw new Error(`Unsupported payment gateway: "${name}"`);
    }
  }
}

module.exports = GatewayResolver;
