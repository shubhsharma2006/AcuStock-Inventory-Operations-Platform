const crypto = require('crypto');
const GatewayResolver = require('./GatewayResolver');
const subscriptionService = require('./SubscriptionService');
const PaymentTransaction = require('../../models/PaymentTransaction');
const Tenant = require('../../models/Tenant');
const { sendPaymentReceiptEmail } = require('../email.service');
const { getPlan, getPlanPrice } = require('../../config/PlanCatalog');
const logger = require('../../utils/logger');

class PaymentService {
  constructor() {
    this.resolver = new GatewayResolver();
  }

  /**
   * Initiate a checkout session or order.
   * Looks up pricing authoritatively from PlanCatalog — never trusts client amounts!
   */
  async initiateCheckout({ tenantId, planId, currency = 'INR', requestedGateway, customer }) {
    if (!tenantId) throw new Error('tenantId is required');
    if (!planId) throw new Error('planId is required');

    const plan = getPlan(planId);
    if (!plan) throw new Error(`Invalid planId: "${planId}"`);
    if (plan.id === 'free') throw new Error('Cannot checkout free tier');

    const priceInfo = getPlanPrice(planId, currency);
    if (!priceInfo || !priceInfo.amountMinor) {
      throw new Error(`Pricing not configured for plan "${planId}" in currency "${currency}"`);
    }

    // Resolve gateway strategy
    const gateway = this.resolver.resolve({
      requestedGateway,
      currency: priceInfo.currency
    });

    // Generate unique internal transaction ID
    const randomHex = crypto.randomBytes(6).toString('hex');
    const transactionId = `tx_${Date.now()}_${randomHex}`;

    // Create pending normalized transaction record in MongoDB
    const transaction = new PaymentTransaction({
      transactionId,
      tenantId,
      planId: plan.id,
      gateway: gateway.name,
      amountMinor: priceInfo.amountMinor,
      currency: priceInfo.currency,
      status: 'PENDING',
      customerEmail: customer?.email,
      metadata: {
        planName: plan.name,
        requestedGateway: requestedGateway || 'auto',
        customerName: customer?.name
      }
    });

    await transaction.save();

    // Delegate to gateway adapter
    const checkoutResult = await gateway.createOrder({
      amountMinor: priceInfo.amountMinor,
      currency: priceInfo.currency,
      receipt: transactionId,
      metadata: {
        tenantId,
        planId: plan.id,
        planName: plan.name,
        transactionId
      },
      customer
    });

    // Link gateway order ID to our transaction record
    if (checkoutResult.orderId) {
      transaction.gatewayOrderId = checkoutResult.orderId;
      await transaction.save();
    }

    return {
      transactionId,
      plan: {
        id: plan.id,
        name: plan.name,
        amount: priceInfo.amount,
        amountMinor: priceInfo.amountMinor,
        currency: priceInfo.currency
      },
      gateway: gateway.name,
      ...checkoutResult
    };
  }

  /**
   * Verify client-side payment completion callback (e.g. Razorpay modal return or Demo return).
   */
  async verifyClientPayment({ transactionId, orderId, paymentId, signature, gateway: requestedGateway }) {
    const query = transactionId ? { transactionId } : { gatewayOrderId: orderId };
    const transaction = await PaymentTransaction.findOne(query);

    if (!transaction) {
      throw new Error('Transaction record not found');
    }

    // If already marked success (e.g. via fast webhook), return early
    if (transaction.status === 'SUCCESS') {
      return { success: true, transactionId: transaction.transactionId, message: 'Already confirmed' };
    }

    const gateway = this.resolver.getGateway(transaction.gateway);

    try {
      await gateway.verifyPayment({ orderId: orderId || transaction.gatewayOrderId, paymentId, signature });

      // Update transaction status
      transaction.status = 'SUCCESS';
      transaction.gatewayPaymentId = paymentId || transaction.gatewayPaymentId;
      transaction.paidAt = new Date();
      await transaction.save();

      // Activate tenant subscription
      await subscriptionService.activateSubscription({
        tenantId: transaction.tenantId,
        planId: transaction.planId,
        transactionId: transaction.transactionId
      });

      return {
        success: true,
        transactionId: transaction.transactionId,
        status: 'SUCCESS'
      };
    } catch (err) {
      transaction.status = 'FAILED';
      transaction.errorMessage = err.message;
      await transaction.save();
      throw err;
    }
  }

  /**
   * Process incoming webhook event with cryptographic signature validation and atomic idempotency.
   */
  async handleWebhook(gatewayName, rawBody, signature) {
    const gateway = this.resolver.getGateway(gatewayName);

    // 1. Cryptographic signature check
    const rawEvent = gateway.verifyWebhookSignature(rawBody, signature);

    // 2. Normalize to unified event structure
    const normalized = gateway.normalizeWebhookEvent(rawEvent);

    logger.info(`Webhook received [${gateway.name}]: eventId=${normalized.eventId}, type=${normalized.type}`);

    if (normalized.type !== 'PAYMENT_SUCCESS') {
      return { status: 'ignored', reason: `Event type ${normalized.type} does not require action` };
    }

    // 3. Webhook Idempotency Check:
    // Check if this webhook event was already processed
    const existingSuccess = await PaymentTransaction.findOne({
      gateway: gateway.name,
      webhookEventId: normalized.eventId,
      status: 'SUCCESS'
    });

    if (existingSuccess) {
      logger.info(`Idempotent webhook: event ${normalized.eventId} already processed for transaction ${existingSuccess.transactionId}`);
      return { status: 'already_processed', transactionId: existingSuccess.transactionId };
    }

    // Match transaction by transactionId, gatewayOrderId, or gatewayPaymentId
    let transaction = null;
    if (normalized.metadata?.transactionId) {
      transaction = await PaymentTransaction.findOne({ transactionId: normalized.metadata.transactionId });
    }
    if (!transaction && normalized.orderId) {
      transaction = await PaymentTransaction.findOne({ gatewayOrderId: normalized.orderId });
    }
    if (!transaction && normalized.paymentId) {
      transaction = await PaymentTransaction.findOne({ gatewayPaymentId: normalized.paymentId });
    }

    if (!transaction) {
      logger.warn(`Webhook received for unknown transaction: orderId=${normalized.orderId}, paymentId=${normalized.paymentId}`);
      return { status: 'unmatched' };
    }

    // Webhook Fulfillment & Anti-Replay Guard:
    // If transaction is already fulfilled, reject duplicate/replayed webhook
    if (transaction.status === 'SUCCESS') {
      logger.warn(`Webhook rejected: Transaction ${transaction.transactionId} is already fulfilled`);
      throw new Error('Webhook rejected: Transaction already fulfilled');
    }

    // Event Consistency Guard (Amount and Currency verification)
    if (normalized.amountMinor && Number(normalized.amountMinor) !== Number(transaction.amountMinor)) {
      logger.error(`Webhook amount mismatch: expected ${transaction.amountMinor}, got ${normalized.amountMinor}`);
      throw new Error('Webhook rejected: Amount mismatch');
    }
    if (normalized.currency && normalized.currency.toUpperCase() !== transaction.currency.toUpperCase()) {
      logger.error(`Webhook currency mismatch: expected ${transaction.currency}, got ${normalized.currency}`);
      throw new Error('Webhook rejected: Currency mismatch');
    }

    // Atomic idempotency lock: Only one concurrent execution can transition from non-SUCCESS to SUCCESS
    const updated = await PaymentTransaction.findOneAndUpdate(
      { _id: transaction._id, status: { $ne: 'SUCCESS' } },
      {
        $set: {
          status: 'SUCCESS',
          gatewayPaymentId: normalized.paymentId || transaction.gatewayPaymentId,
          webhookEventId: normalized.eventId,
          paidAt: new Date()
        }
      },
      { new: true }
    );

    if (!updated) {
      logger.info(`Concurrent duplicate webhook handled idempotently for ${transaction.transactionId}`);
      return { status: 'already_processed', transactionId: transaction.transactionId };
    }

    // Activate subscription
    await subscriptionService.activateSubscription({
      tenantId: updated.tenantId,
      planId: updated.planId,
      transactionId: updated.transactionId
    });

    // Send Payment Receipt Email to tenant owner
    try {
      const tenantDoc = await Tenant.findById(updated.tenantId).populate('ownerId', 'name email');
      if (tenantDoc?.ownerId?.email) {
        const plan = getPlan(updated.planId);
        const amountFormatted = (updated.amountMinor / 100).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        sendPaymentReceiptEmail({
          to: tenantDoc.ownerId.email,
          name: tenantDoc.ownerId.name || 'Valued Customer',
          planName: plan?.name || updated.planId,
          amountFormatted,
          currency: updated.currency,
          invoiceId: updated.transactionId,
          invoiceDate: new Date().toLocaleDateString()
        }).catch((err) => logger.warn('Payment receipt email failed:', err.message));
      }
    } catch (emailErr) {
      logger.warn('Failed to resolve tenant for payment receipt email:', emailErr.message);
    }

    return {
      status: 'processed',
      transactionId: updated.transactionId
    };
  }

  /**
   * Process a refund for a successful payment transaction.
   * Invokes gateway refund adapter, marks transaction REFUNDED,
   * and revokes tenant subscription (resetting to free tier).
   */
  async processRefund({ transactionId, reason, amountMinor, tenantId }) {
    if (!transactionId) throw new Error('transactionId is required');

    const transaction = await PaymentTransaction.findOne({ transactionId });
    if (!transaction) {
      const err = new Error(`Transaction not found with ID: ${transactionId}`);
      err.statusCode = 404;
      throw err;
    }

    // Tenant isolation verification
    if (tenantId && transaction.tenantId.toString() !== tenantId.toString()) {
      const err = new Error('Forbidden: Cross-tenant refund attempt');
      err.statusCode = 403;
      throw err;
    }

    if (transaction.status === 'REFUNDED') {
      throw new Error('Transaction is already refunded');
    }

    if (transaction.status !== 'SUCCESS') {
      throw new Error(`Cannot refund transaction with status: ${transaction.status}`);
    }

    const gateway = this.resolver.getGateway(transaction.gateway);
    const refundResult = await gateway.refundPayment({
      paymentId: transaction.gatewayPaymentId,
      amountMinor: amountMinor || transaction.amountMinor,
      reason
    });

    transaction.status = 'REFUNDED';
    const currentMeta = transaction.metadata ? Object.fromEntries(transaction.metadata) : {};
    transaction.metadata = {
      ...currentMeta,
      refundedAt: new Date(),
      refundReason: reason || 'Merchant requested refund',
      refundDetails: refundResult
    };
    await transaction.save();

    // Revoke subscription and reset quotas
    await subscriptionService.cancelSubscription(transaction.tenantId);

    logger.info(`Refund processed successfully for transaction ${transactionId}, tenant ${transaction.tenantId} reverted to free tier.`);

    return {
      success: true,
      transactionId: transaction.transactionId,
      status: 'REFUNDED',
      refundResult
    };
  }

  /**
   * Fetch payment transactions for a given tenant.
   */
  async getTenantTransactions(tenantId, limit = 50) {
    return await PaymentTransaction.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}

module.exports = new PaymentService();
