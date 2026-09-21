/**
 * Multi-Tenant Billing Security & Lifecycle Suite
 *
 * Verifies 10 core security controls and lifecycle invariants:
 *  1. Cross-tenant transaction access -> 403 / zero data leakage
 *  2. Non-admin billing attempt -> 403 Forbidden
 *  3. Client price tampering (e.g. ₹1 instead of ₹999) overridden by canonical server-side PlanCatalog
 *  4. Expired/replayed webhook on fulfilled transaction with new event ID -> rejected
 *  5. Webhook amount mismatch -> rejected
 *  6. Webhook currency mismatch -> rejected
 *  7. Demo mode in production environment -> fatal startup violation
 *  8. Refund flow (transitions to REFUNDED and resets tenant quotas/plan to free, rejects cross-tenant refund)
 *  9. Subscription renewal after expiry (fair arithmetic: now + 30 days if expired, expiry + 30 days if active)
 * 10. Concurrent duplicate webhook processing (atomic idempotency lock)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const paymentService = require('../src/services/payment/PaymentService');
const subscriptionService = require('../src/services/payment/SubscriptionService');
const GatewayResolver = require('../src/services/payment/GatewayResolver');
const PaymentTransaction = require('../src/models/PaymentTransaction');
const Tenant = require('../src/models/Tenant');
const { requireRole } = require('../src/middleware/auth');
const billingRouter = require('../src/routes/billing');

// Helper to create mock req, res
function createMocks({ user, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const req = {
    user,
    userId: user?._id,
    userRole: user?.role,
    tenantId: user?.tenantId,
    body,
    params,
    query,
    headers
  };
  const res = {
    statusCode: 200,
    responseBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.responseBody = body;
      return this;
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, wasNextCalled: () => nextCalled };
}

// ─────────────────────────────────────────────────────────────
// 1. Cross-tenant transaction access -> 403 / zero data leakage
// ─────────────────────────────────────────────────────────────
test('Security 1: Cross-tenant transaction access -> 403 / zero data leakage', async () => {
  const tenantAId = new mongoose.Types.ObjectId();
  const tenantBId = new mongoose.Types.ObjectId();
  const txId = 'tx_secret_tenant_a_123';

  // Transaction belongs to Tenant A
  const transactionA = {
    _id: new mongoose.Types.ObjectId(),
    transactionId: txId,
    tenantId: tenantAId,
    planId: 'professional',
    amountMinor: 249900,
    currency: 'INR',
    status: 'SUCCESS'
  };

  const origFindOne = PaymentTransaction.findOne;
  const origFindById = Tenant.findById;

  PaymentTransaction.findOne = async () => transactionA;
  Tenant.findById = async (id) => ({
    _id: id,
    name: 'Tenant B Org',
    plan: 'starter'
  });

  try {
    // Requester belongs to Tenant B
    const { req, res } = createMocks({
      user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', tenantId: tenantBId },
      params: { id: txId }
    });

    // Find the route handler for GET /transactions/:id
    const routeLayer = billingRouter.stack.find(
      s => s.route && s.route.path === '/transactions/:id' && s.route.methods.get
    );
    assert.ok(routeLayer, 'GET /transactions/:id route must be registered');

    // Execute the final route handler
    const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
    await handler(req, res);

    // Verify 403 Forbidden
    assert.equal(res.statusCode, 403, 'Cross-tenant transaction query must return 403 Forbidden');
    assert.equal(res.responseBody.success, false);
    assert.match(res.responseBody.error, /Forbidden: Access denied to cross-tenant transaction/);
    assert.equal(res.responseBody.transaction, undefined, 'Must not leak any transaction details to other tenants');
  } finally {
    PaymentTransaction.findOne = origFindOne;
    Tenant.findById = origFindById;
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Non-admin billing attempt -> 403 Forbidden
// ─────────────────────────────────────────────────────────────
test('Security 2: Non-admin billing attempt -> 403 Forbidden', () => {
  const adminGuard = requireRole(['ADMIN', 'SUPER_ADMIN']);

  // Case A: Regular USER
  const { req: reqUser, res: resUser, wasNextCalled: wasNextCalledUser } = createMocks({
    user: { _id: new mongoose.Types.ObjectId(), role: 'USER' }
  });
  adminGuard(reqUser, resUser, () => {});
  assert.equal(resUser.statusCode, 403, 'Regular user must be rejected with 403 Forbidden');
  assert.equal(wasNextCalledUser(), false);

  // Case B: Warehouse MANAGER
  const { req: reqMgr, res: resMgr, wasNextCalled: wasNextCalledMgr } = createMocks({
    user: { _id: new mongoose.Types.ObjectId(), role: 'MANAGER' }
  });
  adminGuard(reqMgr, resMgr, () => {});
  assert.equal(resMgr.statusCode, 403, 'Manager role must be rejected with 403 Forbidden');
  assert.equal(wasNextCalledMgr(), false);

  // Case C: Legitimate ADMIN
  let adminNextCalled = false;
  const { req: reqAdmin, res: resAdmin } = createMocks({
    user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN' }
  });
  adminGuard(reqAdmin, resAdmin, () => { adminNextCalled = true; });
  assert.equal(adminNextCalled, true, 'Admin role must be permitted');
  assert.equal(resAdmin.statusCode, 200);
});

// ─────────────────────────────────────────────────────────────
// 3. Client price tampering overridden by canonical server PlanCatalog
// ─────────────────────────────────────────────────────────────
test('Security 3: Client price tampering overridden by canonical server-side PlanCatalog', async () => {
  const tenantId = new mongoose.Types.ObjectId();

  let savedTransaction = null;
  const origSave = PaymentTransaction.prototype.save;
  PaymentTransaction.prototype.save = async function() {
    savedTransaction = this;
    return this;
  };

  try {
    // Malicious request attempts to pass amount=1 (₹1) and amountMinor=100
    const result = await paymentService.initiateCheckout({
      tenantId,
      planId: 'starter',
      currency: 'INR',
      amount: 1, // Malicious tamper
      amountMinor: 100, // Malicious tamper
      customer: { email: 'test@acustock.com', name: 'Tester' }
    });

    // Verify canonical pricing is strictly enforced
    assert.equal(result.plan.amount, 999, 'Must charge official catalog amount ₹999');
    assert.equal(result.plan.amountMinor, 99900, 'Must charge official catalog amountMinor 99,900 paise');
    assert.ok(savedTransaction, 'Transaction record must be saved');
    assert.equal(savedTransaction.amountMinor, 99900, 'Saved transaction amountMinor must equal 99,900 paise');
  } finally {
    PaymentTransaction.prototype.save = origSave;
  }
});

// ─────────────────────────────────────────────────────────────
// 4. Expired/replayed webhook on fulfilled transaction with new event ID -> rejected
// ─────────────────────────────────────────────────────────────
test('Security 4: Expired/replayed webhook on fulfilled transaction with new event ID -> rejected', async () => {
  const txId = 'tx_already_fulfilled_123';
  const existingFulfilledTx = {
    _id: new mongoose.Types.ObjectId(),
    transactionId: txId,
    status: 'SUCCESS', // Already fulfilled
    amountMinor: 99900,
    currency: 'INR',
    gateway: 'DEMO',
    gatewayOrderId: 'demo_ord_123',
    webhookEventId: 'evt_original_success'
  };

  const origFindOne = PaymentTransaction.findOne;
  PaymentTransaction.findOne = async (query) => {
    // First query is idempotency check by webhookEventId
    if (query.webhookEventId === 'evt_new_replay_attempt') {
      return null; // Different event ID
    }
    // Matching transaction query
    return existingFulfilledTx;
  };

  try {
    const rawPayload = {
      eventId: 'evt_new_replay_attempt',
      type: 'PAYMENT_SUCCESS',
      orderId: 'demo_ord_123',
      paymentId: 'pay_replay_1',
      amountMinor: 99900,
      currency: 'INR'
    };

    await assert.rejects(
      () => paymentService.handleWebhook('demo', rawPayload, 'test_sig'),
      /Webhook rejected: Transaction already fulfilled/
    );
  } finally {
    PaymentTransaction.findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────
// 5. Webhook amount mismatch -> rejected
// ─────────────────────────────────────────────────────────────
test('Security 5: Webhook amount mismatch -> rejected', async () => {
  const pendingTx = {
    _id: new mongoose.Types.ObjectId(),
    transactionId: 'tx_pending_999',
    status: 'PENDING',
    amountMinor: 99900, // ₹999 expected
    currency: 'INR',
    gateway: 'DEMO',
    gatewayOrderId: 'demo_ord_pending_1'
  };

  const origFindOne = PaymentTransaction.findOne;
  PaymentTransaction.findOne = async (query) => {
    if (query.webhookEventId) return null;
    return pendingTx;
  };

  try {
    const mismatchedPayload = {
      eventId: 'evt_mismatch_amount',
      type: 'PAYMENT_SUCCESS',
      orderId: 'demo_ord_pending_1',
      paymentId: 'pay_tampered_amount',
      amountMinor: 50000, // ₹500 tampered
      currency: 'INR'
    };

    await assert.rejects(
      () => paymentService.handleWebhook('demo', mismatchedPayload, 'test_sig'),
      /Webhook rejected: Amount mismatch/
    );
  } finally {
    PaymentTransaction.findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────
// 6. Webhook currency mismatch -> rejected
// ─────────────────────────────────────────────────────────────
test('Security 6: Webhook currency mismatch -> rejected', async () => {
  const pendingTx = {
    _id: new mongoose.Types.ObjectId(),
    transactionId: 'tx_pending_inr',
    status: 'PENDING',
    amountMinor: 99900,
    currency: 'INR', // INR expected
    gateway: 'DEMO',
    gatewayOrderId: 'demo_ord_pending_curr'
  };

  const origFindOne = PaymentTransaction.findOne;
  PaymentTransaction.findOne = async (query) => {
    if (query.webhookEventId) return null;
    return pendingTx;
  };

  try {
    const mismatchedPayload = {
      eventId: 'evt_mismatch_currency',
      type: 'PAYMENT_SUCCESS',
      orderId: 'demo_ord_pending_curr',
      paymentId: 'pay_tampered_curr',
      amountMinor: 99900,
      currency: 'USD' // USD sent instead of INR
    };

    await assert.rejects(
      () => paymentService.handleWebhook('demo', mismatchedPayload, 'test_sig'),
      /Webhook rejected: Currency mismatch/
    );
  } finally {
    PaymentTransaction.findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────
// 7. Demo mode in production environment -> fatal startup violation
// ─────────────────────────────────────────────────────────────
test('Security 7: Demo mode in production environment -> fatal startup violation', () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origPaymentMode = process.env.PAYMENT_MODE;

  try {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_MODE = 'demo';

    const resolver = new GatewayResolver();

    // Resolving gateway in production with demo mode must immediately throw fatal error
    assert.throws(
      () => resolver.resolve({ currency: 'INR' }),
      /FATAL SECURITY VIOLATION: Production environment cannot run with PAYMENT_MODE != "live"/
    );

    // Explicitly retrieving demo gateway in production must also throw fatal error
    assert.throws(
      () => resolver.getGateway('demo'),
      /FATAL SECURITY VIOLATION/
    );
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.PAYMENT_MODE = origPaymentMode;
  }
});

// ─────────────────────────────────────────────────────────────
// 8. Refund flow transitions to REFUNDED and resets tenant quotas/plan to free
// ─────────────────────────────────────────────────────────────
test('Lifecycle 8: Refund flow transitions to REFUNDED, resets tenant to free plan & quotas, and rejects cross-tenant refund', async () => {
  const tenantAId = new mongoose.Types.ObjectId();
  const tenantBId = new mongoose.Types.ObjectId();
  const txId = 'tx_refundable_123';

  const transaction = {
    _id: new mongoose.Types.ObjectId(),
    transactionId: txId,
    tenantId: tenantAId,
    planId: 'starter',
    gateway: 'DEMO',
    gatewayPaymentId: 'demo_pay_ref_1',
    amountMinor: 99900,
    currency: 'INR',
    status: 'SUCCESS',
    metadata: new Map(),
    save: async function() { return this; }
  };

  const tenant = {
    _id: tenantAId,
    name: 'Acme Corp',
    plan: 'starter',
    subscriptionStatus: 'ACTIVE',
    planExpiresAt: new Date(Date.now() + 30 * 86400000),
    limits: { maxUsers: 15, maxItems: 1000, maxStorage: 2048 },
    save: async function() { return this; }
  };

  const origTxFindOne = PaymentTransaction.findOne;
  const origTenantFindById = Tenant.findById;

  PaymentTransaction.findOne = async () => transaction;
  Tenant.findById = async () => tenant;

  try {
    // 8a. Cross-tenant refund attempt -> 403 Forbidden
    await assert.rejects(
      () => paymentService.processRefund({
        transactionId: txId,
        reason: 'Malicious refund',
        tenantId: tenantBId // Attacker from Tenant B
      }),
      /Forbidden: Cross-tenant refund attempt/
    );

    // 8b. Valid refund by owning tenant
    const result = await paymentService.processRefund({
      transactionId: txId,
      reason: 'Customer requested refund',
      tenantId: tenantAId
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'REFUNDED');
    assert.equal(transaction.status, 'REFUNDED');

    // Verify tenant was downgraded back to free plan and quotas reset
    assert.equal(tenant.plan, 'free');
    assert.equal(tenant.subscriptionStatus, 'CANCELED');
    assert.equal(tenant.planExpiresAt, null);
    assert.equal(tenant.limits.maxUsers, 5);
    assert.equal(tenant.limits.maxItems, 100);
    assert.equal(tenant.limits.maxStorage, 256);
  } finally {
    PaymentTransaction.findOne = origTxFindOne;
    Tenant.findById = origTenantFindById;
  }
});

// ─────────────────────────────────────────────────────────────
// 9. Subscription renewal after expiry preserves fair arithmetic
// ─────────────────────────────────────────────────────────────
test('Lifecycle 9: Subscription renewal preserves fair arithmetic (past expiry vs active)', async () => {
  const origFindById = Tenant.findById;

  try {
    // 9a. Expired subscription: expired 5 days ago. Renewal should start from now (now + 30 days)
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
    const expiredTenant = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Expired Tenant',
      plan: 'free',
      planExpiresAt: fiveDaysAgo,
      limits: {},
      save: async function() { return this; }
    };
    Tenant.findById = async () => expiredTenant;

    const expiredResult = await subscriptionService.activateSubscription({
      tenantId: expiredTenant._id,
      planId: 'starter',
      durationDays: 30
    });

    const expectedFromNow = Date.now() + 30 * 86400000;
    const diffPast = Math.abs(new Date(expiredResult.planExpiresAt).getTime() - expectedFromNow);
    assert.ok(diffPast < 2000, `Expired plan renewal should calculate from now (diff: ${diffPast}ms)`);

    // 9b. Active subscription: expires 15 days in future. Renewal should add 30 days to existing expiry
    const fifteenDaysFuture = new Date(Date.now() + 15 * 86400000);
    const activeTenant = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Active Tenant',
      plan: 'starter',
      planExpiresAt: fifteenDaysFuture,
      limits: {},
      save: async function() { return this; }
    };
    Tenant.findById = async () => activeTenant;

    const activeResult = await subscriptionService.activateSubscription({
      tenantId: activeTenant._id,
      planId: 'starter',
      durationDays: 30
    });

    const expectedFromFuture = fifteenDaysFuture.getTime() + 30 * 86400000;
    const diffFuture = Math.abs(new Date(activeResult.planExpiresAt).getTime() - expectedFromFuture);
    assert.ok(diffFuture < 2000, `Active plan renewal should add to existing expiry (diff: ${diffFuture}ms)`);
  } finally {
    Tenant.findById = origFindById;
  }
});

// ─────────────────────────────────────────────────────────────
// 10. Concurrent duplicate webhook processing (atomic idempotency lock)
// ─────────────────────────────────────────────────────────────
test('Concurrency 10: Concurrent duplicate webhook processing (atomic idempotency lock)', async () => {
  const txId = 'tx_concurrent_lock_test';
  const tenantId = new mongoose.Types.ObjectId();

  const mockTx = {
    _id: new mongoose.Types.ObjectId(),
    transactionId: txId,
    tenantId,
    planId: 'starter',
    gateway: 'DEMO',
    gatewayOrderId: 'demo_ord_concurrent',
    amountMinor: 99900,
    currency: 'INR',
    status: 'PENDING'
  };

  const origFindOne = PaymentTransaction.findOne;
  const origFindOneAndUpdate = PaymentTransaction.findOneAndUpdate;
  const origActivate = subscriptionService.activateSubscription;

  let activationCount = 0;
  subscriptionService.activateSubscription = async () => {
    activationCount++;
    return { success: true };
  };

  PaymentTransaction.findOne = async (query) => {
    if (query.webhookEventId) return null; // Idempotency check initially empty
    return mockTx;
  };

  // Simulate atomic DB behavior: only the first call transitions status from non-SUCCESS to SUCCESS
  let isLocked = false;
  PaymentTransaction.findOneAndUpdate = async (filter, update) => {
    if (filter['status'].$ne === 'SUCCESS') {
      if (!isLocked) {
        isLocked = true; // First worker grabs the lock
        return {
          ...mockTx,
          status: 'SUCCESS',
          webhookEventId: 'evt_concurrent_1'
        };
      } else {
        // Second concurrent worker finds status is already SUCCESS, returns null
        return null;
      }
    }
    return null;
  };

  try {
    const webhookPayload = {
      eventId: 'evt_concurrent_race',
      type: 'PAYMENT_SUCCESS',
      orderId: 'demo_ord_concurrent',
      paymentId: 'pay_concurrent_1',
      amountMinor: 99900,
      currency: 'INR'
    };

    // Run both webhook workers concurrently
    const [res1, res2] = await Promise.all([
      paymentService.handleWebhook('demo', webhookPayload, 'sig_test'),
      paymentService.handleWebhook('demo', webhookPayload, 'sig_test')
    ]);

    // Exactly one must be processed, and one must be already_processed
    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, ['already_processed', 'processed']);

    // Critical assertion: subscription was activated exactly once, never duplicate!
    assert.equal(activationCount, 1, 'Subscription activation must execute exactly once under concurrent webhook load');
  } finally {
    PaymentTransaction.findOne = origFindOne;
    PaymentTransaction.findOneAndUpdate = origFindOneAndUpdate;
    subscriptionService.activateSubscription = origActivate;
  }
});
