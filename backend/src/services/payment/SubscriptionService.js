const Tenant = require('../../models/Tenant');
const { getPlan } = require('../../config/PlanCatalog');
const logger = require('../../utils/logger');

class SubscriptionService {
  /**
   * Activates or renews a tenant subscription upon successful payment.
   * Ensures fair expiration math (never penalizes tenants who renew early before expiry).
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.tenantId
   * @param {string} params.planId
   * @param {string} [params.transactionId]
   * @param {number} [params.durationDays=30]
   * @returns {Promise<Object>} Updated tenant
   */
  async activateSubscription({ tenantId, planId, transactionId, durationDays = 30 }) {
    if (!tenantId) throw new Error('tenantId is required to activate subscription');
    const plan = getPlan(planId);
    if (!plan) throw new Error(`Invalid planId: "${planId}"`);

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new Error(`Tenant not found with ID: ${tenantId}`);

    // Fair Renewal Arithmetic:
    // If tenant currently has an active unexpired plan, add duration to that existing expiry.
    // If expired or fresh, base on Date.now().
    const now = Date.now();
    const currentExpiry = tenant.planExpiresAt ? new Date(tenant.planExpiresAt).getTime() : 0;
    const baseTime = Math.max(currentExpiry, now);
    const durationMs = durationDays * 24 * 60 * 60 * 1000;
    const newExpiryDate = new Date(baseTime + durationMs);

    tenant.plan = plan.id;
    tenant.subscriptionStatus = 'ACTIVE';
    tenant.status = 'ACTIVE';
    tenant.planExpiresAt = newExpiryDate;
    tenant.billingUpdatedAt = new Date();
    tenant.limits = {
      maxUsers: plan.limits.maxUsers,
      maxItems: plan.limits.maxItems,
      maxStorage: plan.limits.maxStorage
    };

    await tenant.save();

    logger.info(`Subscription activated: Tenant "${tenant.name}" (${tenant._id}) upgraded to "${plan.name}", valid until ${newExpiryDate.toISOString()}`);

    return {
      success: true,
      tenantId: tenant._id,
      plan: plan.id,
      planName: plan.name,
      subscriptionStatus: tenant.subscriptionStatus,
      planExpiresAt: tenant.planExpiresAt,
      limits: tenant.limits
    };
  }

  /**
   * Cancel or revoke a tenant subscription (e.g. upon refund or explicit cancellation).
   * Resets tenant to free tier defaults with default quota limits.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @returns {Promise<Object>}
   */
  async cancelSubscription(tenantId) {
    if (!tenantId) throw new Error('tenantId is required to cancel subscription');

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new Error(`Tenant not found with ID: ${tenantId}`);

    const freePlan = getPlan('free');
    tenant.plan = 'free';
    tenant.subscriptionStatus = 'CANCELED';
    tenant.planExpiresAt = null;
    tenant.billingUpdatedAt = new Date();
    tenant.limits = {
      maxUsers: freePlan?.limits?.maxUsers || 5,
      maxItems: freePlan?.limits?.maxItems || 100,
      maxStorage: freePlan?.limits?.maxStorage || 256
    };

    await tenant.save();

    logger.info(`Subscription canceled: Tenant "${tenant.name}" (${tenant._id}) reset to free plan`);

    return {
      success: true,
      tenantId: tenant._id,
      plan: 'free',
      subscriptionStatus: tenant.subscriptionStatus,
      limits: tenant.limits
    };
  }

  /**
   * Check if a subscription has passed its expiry date.
   * If past due, updates subscription status to PAST_DUE.
   * @param {Object} tenant
   */
  checkAndEnforceExpiry(tenant) {
    if (!tenant || !tenant.planExpiresAt) return tenant;
    if (tenant.plan === 'free') return tenant;

    if (new Date(tenant.planExpiresAt).getTime() < Date.now()) {
      tenant.subscriptionStatus = 'PAST_DUE';
    }
    return tenant;
  }
}

module.exports = new SubscriptionService();
