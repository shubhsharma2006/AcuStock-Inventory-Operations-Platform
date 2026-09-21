const PaymentGateway = require('./PaymentGateway');
const logger = require('../../utils/logger');

class StripeGateway extends PaymentGateway {
  constructor(config = {}) {
    super('STRIPE');
    this.secretKey = config.secretKey || process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = config.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

    if (this.secretKey) {
      try {
        const stripePackage = require('stripe');
        this.stripe = stripePackage(this.secretKey);
      } catch (err) {
        logger.error('Failed to initialize Stripe client:', err);
      }
    } else {
      logger.warn('StripeGateway initialized without STRIPE_SECRET_KEY');
    }
  }

  async createOrder({ amountMinor, currency, receipt, metadata, customer }) {
    if (!this.stripe) {
      throw new Error('Stripe client is not initialized (missing STRIPE_SECRET_KEY)');
    }

    const appBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const planName = metadata?.planName || metadata?.planId || 'AcuStock Subscription';

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment', // One-time charge for billing interval or subscription setup
      line_items: [
        {
          price_data: {
            currency: (currency || 'USD').toLowerCase(),
            product_data: {
              name: `AcuStock — ${planName}`,
              description: `Monthly subscription for organization`,
            },
            unit_amount: amountMinor, // Stripe uses cents (minor units)
          },
          quantity: 1,
        },
      ],
      customer_email: customer?.email || undefined,
      client_reference_id: receipt,
      metadata: {
        tenantId: metadata?.tenantId ? String(metadata.tenantId) : '',
        planId: metadata?.planId ? String(metadata.planId) : '',
        transactionId: metadata?.transactionId ? String(metadata.transactionId) : '',
        receipt: String(receipt || '')
      },
      success_url: `${appBaseUrl}/dashboard/admin/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${appBaseUrl}/dashboard/admin/billing?status=cancelled`,
    });

    return {
      gateway: this.name,
      orderId: session.id,
      checkoutUrl: session.url,
      amountMinor,
      currency: (currency || 'USD').toUpperCase(),
      customer: customer || {}
    };
  }

  async verifyPayment({ orderId }) {
    if (!this.stripe) {
      throw new Error('Stripe client not initialized');
    }
    const session = await this.stripe.checkout.sessions.retrieve(orderId);
    if (session.payment_status === 'paid') {
      return true;
    }
    throw new Error(`Stripe session not paid. Current status: ${session.payment_status}`);
  }

  verifyWebhookSignature(rawBody, signature, secret = this.webhookSecret) {
    if (!this.stripe) {
      throw new Error('Stripe client not initialized');
    }
    if (!secret) {
      throw new Error('Stripe webhook secret is not configured');
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  normalizeWebhookEvent(rawEvent) {
    const eventType = rawEvent.type;
    const sessionOrInvoice = rawEvent.data?.object || {};

    let type = 'OTHER';
    if (eventType === 'checkout.session.completed' || eventType === 'invoice.payment_succeeded') {
      type = 'PAYMENT_SUCCESS';
    } else if (eventType === 'invoice.payment_failed') {
      type = 'PAYMENT_FAILED';
    }

    const metadata = sessionOrInvoice.metadata || {};

    return {
      eventId: rawEvent.id,
      type,
      orderId: sessionOrInvoice.id,
      paymentId: sessionOrInvoice.payment_intent || sessionOrInvoice.id,
      amountMinor: sessionOrInvoice.amount_total || sessionOrInvoice.amount_paid,
      currency: (sessionOrInvoice.currency || 'USD').toUpperCase(),
      metadata
    };
  }

  async refundPayment({ paymentId, amountMinor, reason }) {
    if (!this.stripe) {
      throw new Error('Stripe client not initialized');
    }
    const refundParams = { payment_intent: paymentId };
    if (amountMinor) refundParams.amount = amountMinor;
    if (reason) refundParams.reason = reason;

    return await this.stripe.refunds.create(refundParams);
  }

  async getPaymentStatus(gatewayPaymentId) {
    if (!this.stripe) {
      throw new Error('Stripe client not initialized');
    }
    return await this.stripe.paymentIntents.retrieve(gatewayPaymentId);
  }
}

module.exports = StripeGateway;
