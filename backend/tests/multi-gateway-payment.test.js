const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { PLANS, getPlan, getPlanPrice, getAllPlans } = require('../src/config/PlanCatalog');
const GatewayResolver = require('../src/services/payment/GatewayResolver');
const RazorpayGateway = require('../src/services/payment/RazorpayGateway');
const DemoPaymentGateway = require('../src/services/payment/DemoPaymentGateway');
const subscriptionService = require('../src/services/payment/SubscriptionService');

test('PlanCatalog: provides authoritative pricing in minor units for INR and USD', () => {
  const starter = getPlan('starter');
  assert.ok(starter, 'Starter plan should exist');
  assert.equal(starter.price.INR, 999);
  assert.equal(starter.priceMinor.INR, 99900, 'INR minor unit should be paise');
  assert.equal(starter.price.USD, 29);
  assert.equal(starter.priceMinor.USD, 2900, 'USD minor unit should be cents');

  const inrPrice = getPlanPrice('starter', 'INR');
  assert.equal(inrPrice.amount, 999);
  assert.equal(inrPrice.amountMinor, 99900);
  assert.equal(inrPrice.currency, 'INR');

  const usdPrice = getPlanPrice('starter', 'USD');
  assert.equal(usdPrice.amount, 29);
  assert.equal(usdPrice.amountMinor, 2900);
  assert.equal(usdPrice.currency, 'USD');

  const plans = getAllPlans();
  assert.equal(plans.length, 3, 'Should have Free, Starter, Professional');
});

test('GatewayResolver: resolves Demo gateway when PAYMENT_MODE=demo', () => {
  const prevMode = process.env.PAYMENT_MODE;
  try {
    process.env.PAYMENT_MODE = 'demo';
    const resolver = new GatewayResolver();
    const gateway = resolver.resolve({ currency: 'INR' });
    assert.equal(gateway.name, 'DEMO');

    const gatewayUsd = resolver.resolve({ currency: 'USD' });
    assert.equal(gatewayUsd.name, 'DEMO');
  } finally {
    process.env.PAYMENT_MODE = prevMode;
  }
});

test('GatewayResolver: resolves gateways by currency/country policy when live/test', () => {
  const prevMode = process.env.PAYMENT_MODE;
  try {
    process.env.PAYMENT_MODE = 'test';
    const resolver = new GatewayResolver();

    // INR should resolve to Razorpay
    const inrGateway = resolver.resolve({ currency: 'INR' });
    assert.equal(inrGateway.name, 'RAZORPAY');

    // USD should resolve to Stripe
    const usdGateway = resolver.resolve({ currency: 'USD' });
    assert.equal(usdGateway.name, 'STRIPE');

    // Explicit requested gateway override should be honored
    const explicitStripe = resolver.resolve({ currency: 'INR', requestedGateway: 'stripe' });
    assert.equal(explicitStripe.name, 'STRIPE');

    const explicitRazorpay = resolver.resolve({ currency: 'USD', requestedGateway: 'razorpay' });
    assert.equal(explicitRazorpay.name, 'RAZORPAY');
  } finally {
    process.env.PAYMENT_MODE = prevMode;
  }
});

test('RazorpayGateway: verifies valid HMAC signature and rejects tampering', async () => {
  const secret = 'rzp_test_secret_123456';
  const gateway = new RazorpayGateway({ keyId: 'rzp_test_key', keySecret: secret });

  const orderId = 'order_DA1234567890';
  const paymentId = 'pay_DA9876543210';

  const validSignature = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // Valid verification should resolve true
  const isValid = await gateway.verifyPayment({ orderId, paymentId, signature: validSignature });
  assert.equal(isValid, true);

  // Tampered paymentId should reject with error
  await assert.rejects(
    () => gateway.verifyPayment({ orderId, paymentId: 'pay_TAMPERED', signature: validSignature }),
    /Invalid Razorpay payment signature/
  );
});

test('DemoPaymentGateway: generates deterministic simulation orders and accepts verification', async () => {
  const demo = new DemoPaymentGateway();
  const order = await demo.createOrder({
    amountMinor: 99900,
    currency: 'INR',
    receipt: 'tx_demo_test',
    metadata: { planId: 'starter' }
  });

  assert.equal(order.gateway, 'DEMO');
  assert.ok(order.orderId.startsWith('demo_ord_'));
  assert.equal(order.isSimulation, true);

  // Valid verification passes
  const verified = await demo.verifyPayment({ orderId: order.orderId, paymentId: 'sim_pay_1', signature: 'sim_ok' });
  assert.equal(verified, true);

  // Simulated rejection
  await assert.rejects(
    () => demo.verifyPayment({ orderId: order.orderId, paymentId: 'sim_failed', signature: 'sim_failed' }),
    /Simulated payment rejection/
  );
});

test('SubscriptionService: Fair renewal arithmetic never penalizes early renewal', async () => {
  const now = Date.now();
  const tenDaysFromNow = new Date(now + 10 * 24 * 60 * 60 * 1000);

  // Fake tenant object
  const tenant = {
    _id: 'tenant_test_fair_renewal',
    name: 'Test Tenant',
    plan: 'starter',
    subscriptionStatus: 'ACTIVE',
    planExpiresAt: tenDaysFromNow,
    limits: {},
    save: async function() { return this; }
  };

  const TenantModel = require('../src/models/Tenant');
  const originalFindById = TenantModel.findById;
  TenantModel.findById = async () => tenant;

  try {
    const result = await subscriptionService.activateSubscription({
      tenantId: tenant._id,
      planId: 'professional',
      durationDays: 30
    });

    assert.equal(result.plan, 'professional');
    // The new expiry should be roughly 40 days from now (10 days remaining + 30 new days)
    const expectedApproximateExpiry = tenDaysFromNow.getTime() + 30 * 24 * 60 * 60 * 1000;
    const diff = Math.abs(new Date(result.planExpiresAt).getTime() - expectedApproximateExpiry);
    assert.ok(diff < 1000, `Expected expiry to add onto existing 10 days remaining (diff: ${diff}ms)`);
  } finally {
    TenantModel.findById = originalFindById;
  }
});
