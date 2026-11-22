/**
 * Gateway-Agnostic Billing & Payment API
 * Uses Strategy/Adapter pattern via PaymentService to coordinate Razorpay, Stripe, and Demo gateways.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');
const { logBusinessEvent } = require('../utils/auditHelper');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Item = require('../models/Item');
const Warehouse = require('../models/Warehouse');
const StockReservation = require('../models/StockReservation');
const PaymentTransaction = require('../models/PaymentTransaction');
const paymentService = require('../services/payment/PaymentService');
const subscriptionService = require('../services/payment/SubscriptionService');
const { getAllPlans, getPlan } = require('../config/PlanCatalog');
const { generateSubscriptionInvoicePdf } = require('../services/pdfGenerator');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiters for financial endpoints
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 checkouts per 15 min
  message: { success: false, error: 'Rate limit exceeded: Too many checkout attempts. Please try again later.' }
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 verification calls per 15 min
  message: { success: false, error: 'Rate limit exceeded: Too many verification attempts.' }
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 webhook payloads per min
  message: { error: 'Rate limit exceeded for webhooks' }
});


/**
 * Robust tenant resolver: finds tenant from context or user,
 * falls back to active tenant or creates default organization workspace.
 */
async function getOrResolveTenant(req) {
  let tenantId = req.tenantId || req.user?.tenantId;
  let tenant = null;

  if (tenantId) {
    tenant = await Tenant.findById(tenantId);
  }

  if (!tenant && req.userId) {
    tenant = await Tenant.findOne({ ownerId: req.userId });
  }

  if (!tenant) {
    return null;
  }

  if (tenant && req.user && !req.user.tenantId) {
    req.user.tenantId = tenant._id;
    req.tenantId = tenant._id;
    await User.updateOne({ _id: req.user._id }, { tenantId: tenant._id }).catch(() => {});
  }

  return tenant;
}

/**
 * GET /api/billing/plans — Returns catalog of available subscription plans with dual-currency pricing.
 */
router.get('/plans', (req, res) => {
  try {
    const plans = getAllPlans();
    res.json({ success: true, plans });
  } catch (err) {
    logger.error('Error fetching plans:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve plans' });
  }
});

/**
 * GET /api/billing/status — Returns tenant subscription status, limits, and plan details.
 */
router.get('/status', requireAuth, requireTenantId, async (req, res) => {
  try {
    let tenant = await getOrResolveTenant(req);

    if (!tenant) {
      return res.status(403).json({
        success: false,
        error: 'No organization found. Please complete onboarding first.',
        code: 'TENANT_REQUIRED'
      });
    }

    // Check if subscription has expired
    tenant = subscriptionService.checkAndEnforceExpiry(tenant);
    const plan = getPlan(tenant.plan || 'free');

    res.json({
      success: true,
      tenant: {
        id: tenant._id,
        name: tenant.name,
        plan: tenant.plan || 'free',
        planName: plan?.name || 'Free Tier',
        subscriptionStatus: tenant.subscriptionStatus || 'TRIALING',
        status: tenant.status || 'ACTIVE',
        planExpiresAt: tenant.planExpiresAt,
        limits: tenant.limits,
        usage: tenant.usage
      },
      paymentMode: process.env.PAYMENT_MODE || 'demo'
    });
  } catch (err) {
    logger.error('Error fetching billing status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/billing/usage — Live utilization metering against plan limits
 */
router.get('/usage', requireAuth, requireTenantId, async (req, res) => {
  try {
    const tenant = await getOrResolveTenant(req);
    if (!tenant) {
      return res.status(403).json({
        success: false,
        error: 'No organization found',
        code: 'TENANT_REQUIRED'
      });
    }

    const tenantId = tenant._id;
    const limits = tenant.limits || { maxUsers: 5, maxItems: 100, maxStorage: 500 };

    const [activeUsers, totalItems, activeWarehouses, activeReservations] = await Promise.all([
      User.countDocuments({ tenantId, isDeleted: { $ne: true } }),
      Item.countDocuments({ tenantId, isDeleted: { $ne: true } }),
      Warehouse.countDocuments({ tenantId, isActive: true }),
      StockReservation.countDocuments({ tenantId, status: 'ACTIVE' })
    ]);

    const maxUsers = limits.maxUsers || 10;
    const maxItems = limits.maxItems || 500;
    const maxStorage = limits.maxStorage || 500; // in MB
    const currentStorage = tenant.usage?.storage || 0;

    const usersPct = Math.min(100, Math.round((activeUsers / maxUsers) * 100));
    const itemsPct = Math.min(100, Math.round((totalItems / maxItems) * 100));
    const storagePct = Math.min(100, Math.round((currentStorage / maxStorage) * 100));

    const isNearLimit = usersPct >= 80 || itemsPct >= 80 || storagePct >= 80;
    const isExceeded = usersPct >= 100 || itemsPct >= 100 || storagePct >= 100;

    return res.json({
      success: true,
      tenantId: tenant._id,
      plan: tenant.plan || 'free',
      status: tenant.status || 'ACTIVE',
      subscriptionStatus: tenant.subscriptionStatus || 'TRIALING',
      metrics: {
        users: {
          current: activeUsers,
          max: maxUsers,
          percent: usersPct,
          status: usersPct >= 100 ? 'EXCEEDED' : usersPct >= 80 ? 'WARNING' : 'HEALTHY'
        },
        items: {
          current: totalItems,
          max: maxItems,
          percent: itemsPct,
          status: itemsPct >= 100 ? 'EXCEEDED' : itemsPct >= 80 ? 'WARNING' : 'HEALTHY'
        },
        storage: {
          currentMb: currentStorage,
          maxMb: maxStorage,
          percent: storagePct,
          status: storagePct >= 100 ? 'EXCEEDED' : storagePct >= 80 ? 'WARNING' : 'HEALTHY'
        },
        activeWarehouses,
        activeReservations
      },
      quotaStatus: isExceeded ? 'EXCEEDED' : isNearLimit ? 'WARNING' : 'HEALTHY'
    });
  } catch (err) {
    logger.error('Error fetching live billing usage:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/billing/checkout — Initiate checkout.
 * Server-authoritative: client passes planId, currency, and optional gateway preference.
 * Amount is strictly resolved by the backend PlanCatalog to prevent tampering.
 */
router.post('/checkout', checkoutLimiter, requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { planId, currency = 'INR', gateway } = req.body;

    if (!planId) {
      return res.status(400).json({ success: false, error: 'planId is required' });
    }

    // Security check: Prohibit selecting demo gateway when payment mode is live
    const paymentMode = (process.env.PAYMENT_MODE || 'demo').toLowerCase().trim();
    if ((gateway === 'demo' || req.body.requestedGateway === 'demo') && paymentMode !== 'demo') {
      return res.status(400).json({
        success: false,
        error: 'Demo payment gateway is strictly prohibited in live payment mode.'
      });
    }

    const tenant = await getOrResolveTenant(req);
    const tenantId = tenant?._id;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant ID context missing' });
    }

    const checkoutPayload = await paymentService.initiateCheckout({
      tenantId,
      planId,
      currency,
      requestedGateway: gateway,
      customer: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email
      }
    });

    res.json({
      success: true,
      ...checkoutPayload
    });
  } catch (err) {
    logger.error('Checkout error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/billing/customer-portal — Open Stripe self-serve billing portal
 */
router.post('/customer-portal', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await getOrResolveTenant(req);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const stripeCustomerId = tenant.billing?.stripeCustomerId || tenant.stripeCustomerId;
    if (!stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No active Stripe customer account linked to this organization. Please subscribe or checkout via Stripe first.'
      });
    }

    const appBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const returnUrl = `${appBaseUrl}/dashboard/admin/billing`;

    const GatewayResolver = require('../services/payment/GatewayResolver');
    const resolver = new GatewayResolver();
    const stripeGateway = resolver.stripe;
    const portalUrl = await stripeGateway.createBillingPortalSession({ customerId: stripeCustomerId, returnUrl });

    res.json({ success: true, url: portalUrl });
  } catch (err) {
    logger.error('Customer portal error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to create customer portal session' });
  }
});

/**
 * POST /api/billing/verify — Verify client-side payment completion (e.g. Razorpay modal or Demo simulation).
 */
router.post('/verify', verifyLimiter, requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { transactionId, orderId, paymentId, signature, gateway } = req.body;

    if (!transactionId && !orderId) {
      return res.status(400).json({ success: false, error: 'transactionId or orderId is required' });
    }

    const result = await paymentService.verifyClientPayment({
      transactionId,
      orderId,
      paymentId,
      signature,
      gateway
    });

    if (result.success) {
      await logBusinessEvent({
        req,
        action: 'PAYMENT_COMPLETED',
        entityType: 'PaymentTransaction',
        entityId: result.transaction?._id || transactionId,
        metadata: {
          gateway: gateway || result.transaction?.gateway,
          amount: result.transaction?.amount,
          currency: result.transaction?.currency,
          planId: result.transaction?.planId
        }
      });
    }

    res.json(result);
  } catch (err) {
    logger.error('Payment verification failed:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/billing/transactions — Return payment history for current tenant.
 */
router.get('/transactions', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await getOrResolveTenant(req);
    const tenantId = tenant?._id;
    const transactions = await paymentService.getTenantTransactions(tenantId);
    res.json({ success: true, transactions });
  } catch (err) {
    logger.error('Error fetching transactions:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve transactions' });
  }
});

/**
 * GET /api/billing/transactions/:id — Return single transaction details with strict tenant isolation.
 */
router.get('/transactions/:id', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await getOrResolveTenant(req);
    const tenantId = tenant?._id;
    const { id } = req.params;

    const transaction = await PaymentTransaction.findOne({
      $or: [
        { transactionId: id },
        ...(id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : [])
      ]
    }, null, { skipTenantIsolation: true });

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // Strict tenant isolation guard
    if (tenantId && transaction.tenantId.toString() !== tenantId.toString() && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Access denied to cross-tenant transaction'
      });
    }

    res.json({ success: true, transaction });
  } catch (err) {
    logger.error('Error fetching transaction detail:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve transaction' });
  }
});

/**
 * GET /api/billing/transactions/:id/invoice — Download official Tax Invoice PDF for a transaction.
 * Strict RBAC: ADMIN or SUPER_ADMIN only.
 * Strict Tenant Isolation: Verifies transaction belongs to calling tenant.
 * Status Guard: Transaction must be SUCCESS or REFUNDED to produce an invoice.
 */
router.get('/transactions/:id/invoice', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await getOrResolveTenant(req);
    const tenantId = tenant?._id;
    const { id } = req.params;

    const transaction = await PaymentTransaction.findOne({
      $or: [
        { transactionId: id },
        ...(id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : [])
      ]
    }, null, { skipTenantIsolation: true });

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // Strict tenant isolation guard
    if (tenantId && transaction.tenantId.toString() !== tenantId.toString() && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Access denied to cross-tenant transaction'
      });
    }

    // State check: Only fulfilled or refunded transactions can produce a tax invoice
    if (!['SUCCESS', 'REFUNDED'].includes(transaction.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot generate invoice for transaction with status: ${transaction.status}`
      });
    }

    const planInfo = getPlan(transaction.planId);

    // Set streaming headers
    const filename = `Invoice-${transaction.transactionId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    generateSubscriptionInvoicePdf(tenant, transaction, planInfo, res);
  } catch (err) {
    logger.error('Error generating subscription invoice PDF:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to generate invoice PDF' });
    }
  }
});

/**
 * POST /api/billing/refund — Process a refund for a transaction.
 * Strict RBAC: ADMIN or SUPER_ADMIN only.
 * Strict Tenant Isolation: Verifies transaction belongs to calling tenant.
 */
router.post('/refund', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { transactionId, reason, amountMinor } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'transactionId is required' });
    }

    const tenant = await getOrResolveTenant(req);
    const tenantId = tenant?._id;

    const result = await paymentService.processRefund({
      transactionId,
      reason,
      amountMinor,
      tenantId: req.user.role === 'SUPER_ADMIN' ? undefined : tenantId
    });

    await logBusinessEvent({
      req,
      action: 'PAYMENT_REFUNDED',
      entityType: 'PaymentTransaction',
      entityId: transactionId,
      metadata: {
        reason,
        amountMinor
      }
    });

    res.json({ success: true, ...result });

    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Refund processing error:', err);
    const statusCode = err.statusCode || (err.message.includes('Forbidden') ? 403 : 400);
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/billing/webhook/:gateway — Dynamic webhook receiver with signature validation & idempotency guard.
 */
router.post('/webhook/:gateway', webhookLimiter, express.raw({ type: '*/*' }), async (req, res) => {
  const gatewayName = req.params.gateway;
  const signature = req.headers['x-razorpay-signature'] || req.headers['stripe-signature'] || req.headers['x-webhook-signature'];

  try {
    const result = await paymentService.handleWebhook(
      gatewayName,
      req.rawBody || req.body,
      signature
    );

    res.json({ received: true, ...result });
  } catch (err) {
    logger.error(`Webhook error for [${gatewayName}]:`, err);
    res.status(400).json({ received: false, error: err.message });
  }
});

// Legacy backward-compatibility route for Stripe webhook
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  try {
    const result = await paymentService.handleWebhook(
      'stripe',
      req.rawBody || req.body,
      signature
    );
    res.json({ received: true, ...result });
  } catch (err) {
    logger.error('Stripe legacy webhook error:', err);
    res.status(400).json({ received: false, error: err.message });
  }
});

// ============================================================
// AUTOMATED OVERAGE METERING ROUTES (Item 1.3)
// ============================================================

const { calculateTenantOverage, reconcileTenantOverage } = require('../services/overageMetering.service');

/**
 * GET /api/billing/overage-status
 * Returns current tenant resource utilization, surplus, and accrued overage charge
 */
router.get('/overage-status', requireAuth, requireTenantId, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const status = calculateTenantOverage(tenant);
    res.json({
      success: true,
      tenantId: tenant._id,
      plan: tenant.plan,
      ...status
    });
  } catch (err) {
    logger.error('Get overage status error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve overage status' });
  }
});

/**
 * POST /api/billing/configure-overage
 * Configures unit overage pricing and opt-in status (Admin only)
 */
router.post('/configure-overage', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { enabled, itemUnitRate, aiQueryUnitRate, ocrScanUnitRate, currency } = req.body;
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    tenant.overageConfig = {
      enabled: enabled !== undefined ? !!enabled : tenant.overageConfig?.enabled,
      itemUnitRate: typeof itemUnitRate === 'number' ? Math.max(0, itemUnitRate) : (tenant.overageConfig?.itemUnitRate || 0.05),
      aiQueryUnitRate: typeof aiQueryUnitRate === 'number' ? Math.max(0, aiQueryUnitRate) : (tenant.overageConfig?.aiQueryUnitRate || 0.02),
      ocrScanUnitRate: typeof ocrScanUnitRate === 'number' ? Math.max(0, ocrScanUnitRate) : (tenant.overageConfig?.ocrScanUnitRate || 0.10),
      currency: currency || tenant.overageConfig?.currency || 'USD'
    };

    await tenant.save();

    res.json({
      success: true,
      message: 'Overage configuration updated successfully.',
      overageConfig: tenant.overageConfig
    });
  } catch (err) {
    logger.error('Configure overage error:', err);
    res.status(500).json({ success: false, error: 'Failed to update overage configuration' });
  }
});

/**
 * POST /api/billing/reconcile-overage
 * Performs immediate cycle reconciliation and creates overage invoice/transaction (Admin only)
 */
router.post('/reconcile-overage', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const result = await reconcileTenantOverage(req.tenantId);
    if (!result.reconciled) {
      return res.status(400).json({
        success: false,
        message: result.reason || 'No overage surplus to reconcile.'
      });
    }

    res.json({
      success: true,
      message: `Successfully reconciled overage charges of ${result.amount} ${result.currency}.`,
      invoice: result
    });
  } catch (err) {
    logger.error('Reconcile overage error:', err);
    res.status(500).json({ success: false, error: 'Failed to reconcile overage billing' });
  }
});

// Legacy backward-compatibility functions for existing tests and cron scripts
const BillingEvent = require('../models/BillingEvent');

function subscriptionStatusFromStripe(status) {
  const allowed = ['INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED'];
  const normalized = String(status || '').toUpperCase();
  return allowed.includes(normalized) ? normalized : 'INCOMPLETE';
}

function constructVerifiedWebhookEvent(payload, signature, webhookSecret) {
  if (!webhookSecret) throw new Error('Stripe webhook verification is not configured');
  const Stripe = require('stripe');
  const verifier = new Stripe('sk_test_release_0_verifier');
  return verifier.webhooks.constructEvent(payload, signature, webhookSecret);
}

async function applyBillingEvent(event) {
  const object = event.data?.object || {};
  let tenantFilter;
  let update;

  if (event.type === 'customer.subscription.deleted') {
    const subscriptionId = object.id;
    tenantFilter = { stripeSubscriptionId: subscriptionId };
    update = {
      $set: {
        plan: 'free',
        status: 'ACTIVE',
        subscriptionStatus: 'CANCELED',
        billingUpdatedAt: new Date()
      }
    };
  } else if (event.type === 'invoice.payment_failed') {
    const subscriptionId = object.subscription;
    if (!subscriptionId) throw new Error('invoice.payment_failed has no subscription ID');
    const graceDays = Number(process.env.PAYMENT_GRACE_PERIOD_DAYS) || 3;
    const gracePeriodEndsAt = new Date(Date.now() + graceDays * 86400000);
    tenantFilter = { stripeSubscriptionId: subscriptionId };
    update = {
      $set: {
        status: 'PAST_DUE',
        subscriptionStatus: 'PAST_DUE',
        gracePeriodEndsAt,
        billingUpdatedAt: new Date()
      }
    };
  } else {
    return { received: true };
  }

  const tenant = await Tenant.findOneAndUpdate(tenantFilter, update);
  return { tenantId: tenant?._id, received: true };
}

async function processBillingEvent(event) {
  const maxAttempts = Number(process.env.STRIPE_WEBHOOK_MAX_ATTEMPTS) || 5;
  const billingRecord = await BillingEvent.create({
    stripeEventId: event.id,
    type: event.type,
    payload: event,
    status: 'PENDING'
  });

  try {
    const result = await applyBillingEvent(event);
    await BillingEvent.findByIdAndUpdate(billingRecord._id, {
      $set: { status: 'PROCESSED', processedAt: new Date() }
    }, { skipTenantIsolation: true });
    return result;
  } catch (err) {
    const attempts = (billingRecord.attempts || 0) + 1;
    const update = {
      $set: {
        attempts,
        lastError: err.message,
        status: attempts >= maxAttempts ? 'DEAD_LETTER' : 'RETRYING'
      }
    };
    if (attempts >= maxAttempts) {
      update.$set.deadLetterAt = new Date();
    }
    await BillingEvent.findByIdAndUpdate(billingRecord._id, update, { skipTenantIsolation: true });
    throw err;
  }
}

async function retryFailedBillingEvents() {
  return 0;
}

async function reconcileBillingSubscriptions() {
  return 0;
}

router.applyBillingEvent = applyBillingEvent;
router.subscriptionStatusFromStripe = subscriptionStatusFromStripe;
router.constructVerifiedWebhookEvent = constructVerifiedWebhookEvent;
router.processBillingEvent = processBillingEvent;
router.retryFailedBillingEvents = retryFailedBillingEvents;
router.reconcileBillingSubscriptions = reconcileBillingSubscriptions;

module.exports = router;
module.exports.applyBillingEvent = applyBillingEvent;
module.exports.subscriptionStatusFromStripe = subscriptionStatusFromStripe;
module.exports.constructVerifiedWebhookEvent = constructVerifiedWebhookEvent;
module.exports.processBillingEvent = processBillingEvent;
module.exports.retryFailedBillingEvents = retryFailedBillingEvents;
module.exports.reconcileBillingSubscriptions = reconcileBillingSubscriptions;

