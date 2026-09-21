/**
 * Plan Limit Enforcement Middleware
 * ───────────────────────────────────────────────────────────────
 * Enforces per-tenant subscription limits before resource creation.
 *
 * Usage:
 *   router.post('/api/items', requireAuth, checkPlanLimits('maxItems'), ...)
 *   router.post('/api/invites', requireAuth, checkPlanLimits('maxUsers'), ...)
 *
 * Supported limit keys (must match Tenant.limits fields):
 *   - 'maxItems'   → counts Item documents for this tenant
 *   - 'maxUsers'   → counts User documents for this tenant
 *   - 'maxCompanies' → counts Company documents (optional future limit)
 *
 * Plan -1 means unlimited (Enterprise plan).
 */

const logger = require('../utils/logger');
const Tenant = require('../models/Tenant');
const QuotaReservation = require('../models/QuotaReservation');

// Map of limit keys to model factories (lazy-loaded to avoid circular deps)
const LIMIT_MODEL_MAP = {
  maxItems: { usageKey: 'items', label: 'items' },
  maxUsers: { usageKey: 'users', label: 'users' },
  maxCompanies: { usageKey: 'companies', label: 'companies' }
};

/**
 * Returns a middleware function that checks if the tenant is below its
 * plan limit for the given resource type before allowing the request to proceed.
 *
 * @param {string} limitKey - One of: 'maxItems', 'maxUsers', 'maxCompanies'
 * @returns {Function} Express middleware
 */
function checkPlanLimits(limitKey) {
  if (!LIMIT_MODEL_MAP[limitKey]) {
    throw new Error(`[checkPlanLimits] Unknown limit key: "${limitKey}". Valid keys: ${Object.keys(LIMIT_MODEL_MAP).join(', ')}`);
  }

  return async function planLimitGuard(req, res, next) {
    // Quota enforcement must never run without a tenant boundary.
    if (!req.tenantId || !req.tenant) {
      return res.status(403).json({
        success: false,
        error: 'Tenant context required for quota enforcement',
        code: 'TENANT_REQUIRED'
      });
    }

    const tenant = req.tenant;
    if (tenant.isActive === false || ['SUSPENDED', 'CANCELED'].includes(tenant.status)) {
      return res.status(403).json({ success: false, error: 'Organization account is inactive', code: 'TENANT_INACTIVE' });
    }
    if (tenant.planExpiresAt && tenant.planExpiresAt <= new Date() && tenant.plan !== 'free') {
      return res.status(402).json({ success: false, error: 'Subscription plan has expired', code: 'PLAN_EXPIRED' });
    }
    const limit = tenant?.limits?.[limitKey];

    // -1 = unlimited (Enterprise plan)
    if (limit === -1 || limit === undefined) {
      return next();
    }

    // No limit configured for this plan — allow
    if (typeof limit !== 'number') {
      return next();
    }

    try {
      const { usageKey, label } = LIMIT_MODEL_MAP[limitKey];
      const usagePath = `usage.${usageKey}`;
      const result = await Tenant.updateOne(
        {
          _id: req.tenantId,
          $expr: { $lt: [{ $ifNull: [`$${usagePath}`, 0] }, limit] }
        },
        { $inc: { [usagePath]: 1 } }
      );

      if (result.modifiedCount !== 1) {
        const currentCount = tenant.usage?.[usageKey] ?? limit;
        logger.warn(`[PlanLimit] Tenant ${req.tenantId} hit ${limitKey} limit: ${currentCount}/${limit}`);
        return res.status(402).json({
          success: false,
          error: `Plan limit reached`,
          code: 'PLAN_LIMIT_EXCEEDED',
          detail: `Your plan allows up to ${limit} ${label}. You currently have ${currentCount}. Upgrade your plan to add more.`,
          limitKey,
          current: currentCount,
          limit
        });
      }

      let reservation;
      try {
        reservation = await QuotaReservation.create({
          tenantId: req.tenantId,
          usageKey,
          expiresAt: new Date(Date.now() + (Number(process.env.QUOTA_RESERVATION_TTL_SECONDS) || 900) * 1000)
        });
      } catch (reservationError) {
        await Tenant.updateOne({ _id: req.tenantId }, { $inc: { [usagePath]: -1 } });
        throw reservationError;
      }

      let released = false;
      const releaseReservation = async () => {
        if (released) return;
        released = true;
        if (res.statusCode < 400) {
          await QuotaReservation.findByIdAndUpdate(reservation._id, {
            $set: { status: 'COMMITTED', committedAt: new Date() }
          });
        } else {
          await Tenant.updateOne({ _id: req.tenantId }, { $inc: { [usagePath]: -1 } });
          await QuotaReservation.findByIdAndUpdate(reservation._id, {
            $set: { status: 'RELEASED', releasedAt: new Date() }
          });
        }
      };
      res.once('finish', releaseReservation);
      res.once('close', releaseReservation);
      next();
    } catch (err) {
      logger.error(`[checkPlanLimits] Error checking ${limitKey} for tenant ${req.tenantId}:`, err.message);
      return next(err);
    }
  };
}

module.exports = checkPlanLimits;
