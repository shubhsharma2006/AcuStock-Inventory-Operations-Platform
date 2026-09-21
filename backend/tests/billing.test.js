const test = require('node:test');
const assert = require('node:assert/strict');

const billingRoutes = require('../src/routes/billing');
const Tenant = require('../src/models/Tenant');
const BillingEvent = require('../src/models/BillingEvent');
const Stripe = require('stripe');

test('Stripe subscription statuses normalize to the supported lifecycle', () => {
  assert.equal(billingRoutes.subscriptionStatusFromStripe('active'), 'ACTIVE');
  assert.equal(billingRoutes.subscriptionStatusFromStripe('past_due'), 'PAST_DUE');
  assert.equal(billingRoutes.subscriptionStatusFromStripe('PAST_DUE'), 'PAST_DUE');
  assert.equal(billingRoutes.subscriptionStatusFromStripe('unknown'), 'INCOMPLETE');
});

test('billing event schema requires a unique Stripe event ID', () => {
  const path = BillingEvent.schema.path('stripeEventId');
  assert.equal(path.options.required, true);
  assert.equal(path.options.unique, true);
  assert.ok(BillingEvent.schema.path('status'));
  assert.ok(BillingEvent.schema.path('payload'));
  assert.ok(BillingEvent.schema.path('attempts'));
  assert.ok(BillingEvent.schema.path('nextRetryAt'));
  assert.ok(BillingEvent.schema.path('deadLetterAt'));
});

test('Stripe webhook signatures accept the exact raw payload and reject tampering', () => {
  const stripe = new Stripe('sk_test_release_0_verifier');
  const secret = 'whsec_release_0_test_secret';
  const rawPayload = JSON.stringify({ id: 'evt_signature_1', object: 'event', type: 'invoice.paid', data: { object: {} } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: rawPayload, secret });
  const event = billingRoutes.constructVerifiedWebhookEvent(Buffer.from(rawPayload), signature, secret);
  assert.equal(event.id, 'evt_signature_1');
  assert.throws(
    () => billingRoutes.constructVerifiedWebhookEvent(Buffer.from(rawPayload.replace('invoice.paid', 'invoice.payment_failed')), signature, secret),
    /No signatures found matching the expected signature/
  );
});

test('subscription cancellation resets tenant to the free plan', async () => {
  const originalUpdate = Tenant.findOneAndUpdate;
  let captured;
  Tenant.findOneAndUpdate = async (filter, update) => {
    captured = { filter, update };
    return { _id: 'tenant-a' };
  };

  try {
    const result = await billingRoutes.applyBillingEvent({
      id: 'evt_cancel_1',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_a' } }
    });
    assert.equal(result.tenantId, 'tenant-a');
    assert.deepEqual(captured.filter, { stripeSubscriptionId: 'sub_a' });
    assert.equal(captured.update.$set.plan, 'free');
    assert.equal(captured.update.$set.subscriptionStatus, 'CANCELED');
  } finally {
    Tenant.findOneAndUpdate = originalUpdate;
  }
});

test('payment failure marks the tenant past due', async () => {
  const originalUpdate = Tenant.findOneAndUpdate;
  let captured;
  Tenant.findOneAndUpdate = async (filter, update) => {
    captured = { filter, update };
    return { _id: 'tenant-b' };
  };

  try {
    await billingRoutes.applyBillingEvent({
      id: 'evt_failed_1',
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_b' } }
    });
    assert.deepEqual(captured.filter, { stripeSubscriptionId: 'sub_b' });
    assert.equal(captured.update.$set.subscriptionStatus, 'PAST_DUE');
    assert.equal(captured.update.$set.status, 'PAST_DUE');
  } finally {
    Tenant.findOneAndUpdate = originalUpdate;
  }
});

test('payment failure starts a configurable grace period', async () => {
  const originalUpdate = Tenant.findOneAndUpdate;
  let captured;
  Tenant.findOneAndUpdate = async (filter, update) => {
    captured = { filter, update };
    return { _id: 'tenant-grace' };
  };
  const previousGraceDays = process.env.PAYMENT_GRACE_PERIOD_DAYS;
  process.env.PAYMENT_GRACE_PERIOD_DAYS = '4';

  try {
    await billingRoutes.applyBillingEvent({
      id: 'evt_grace_1',
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_grace' } }
    });
    const graceEnd = captured.update.$set.gracePeriodEndsAt.getTime();
    assert.ok(graceEnd > Date.now() + 3 * 86400000);
    assert.ok(graceEnd <= Date.now() + 4 * 86400000 + 1000);
  } finally {
    Tenant.findOneAndUpdate = originalUpdate;
    process.env.PAYMENT_GRACE_PERIOD_DAYS = previousGraceDays;
  }
});

test('failed billing events become dead-lettered after max attempts', async () => {
  const originalCreate = BillingEvent.create;
  const originalUpdate = BillingEvent.findByIdAndUpdate;
  const previousMaxAttempts = process.env.STRIPE_WEBHOOK_MAX_ATTEMPTS;
  process.env.STRIPE_WEBHOOK_MAX_ATTEMPTS = '1';
  let capturedUpdate;
  BillingEvent.create = async () => ({ _id: 'event-record', attempts: 0 });
  BillingEvent.findByIdAndUpdate = async (_id, update) => {
    capturedUpdate = update;
    return update;
  };

  try {
    await assert.rejects(
      () => billingRoutes.processBillingEvent({
        id: 'evt_bad_1',
        type: 'invoice.payment_failed',
        data: { object: {} }
      }),
      /no subscription ID/
    );
    assert.equal(capturedUpdate.$set.status, 'DEAD_LETTER');
    assert.equal(capturedUpdate.$set.attempts, 1);
    assert.ok(capturedUpdate.$set.deadLetterAt);
  } finally {
    BillingEvent.create = originalCreate;
    BillingEvent.findByIdAndUpdate = originalUpdate;
    process.env.STRIPE_WEBHOOK_MAX_ATTEMPTS = previousMaxAttempts;
  }
});
