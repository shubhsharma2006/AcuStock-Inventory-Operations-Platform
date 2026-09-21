const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

/**
 * logBusinessEvent({ req, action, entityType, entityId, changes, details, severity, targetUser, targetRole })
 *
 * Centralized helper to emit business and inventory audit events.
 * Safe extraction of user context and tenant context.
 * Never throws — guarantees that business operations are never disrupted by logging failures.
 */
async function logBusinessEvent({
  req,
  action,
  entityType = null,
  entityId = null,
  changes = null,
  details = null,
  severity = 'INFO',
  targetUser = null,
  targetRole = null,
  performedBy = null,
  performedByName = null,
  performedByRole = null,
  tenantId = null
}) {
  try {
    const user = req?.user;
    const actorId = performedBy || req?.userId || user?._id || user?.id || null;
    const actorName = performedByName || user?.name || user?.email || (actorId ? 'USER' : 'SYSTEM');
    const actorRole = performedByRole || user?.role || (actorId ? 'USER' : 'SYSTEM');
    const resolvedTenantId = tenantId || req?.tenantId || user?.tenantId || null;

    const ipAddress = req ? (req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for']) : null;
    const userAgent = req ? (req.get ? req.get('User-Agent') : req.headers?.['user-agent']) : null;

    const entry = await AuditLog.logEvent({
      action,
      entityType,
      entityId: entityId || null,
      changes: changes || undefined,
      details: details || undefined,
      severity,
      performedBy: actorId,
      performedByName: actorName,
      performedByRole: actorRole,
      targetUser: targetUser?._id || targetUser || null,
      targetUserName: targetUser?.name || undefined,
      targetUserRole: targetUser?.role || undefined,
      targetRole: targetRole || undefined,
      ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : ipAddress,
      userAgent,
      tenantId: resolvedTenantId
    });

    return entry;
  } catch (err) {
    logger.error('auditHelper.logBusinessEvent failed silently:', { error: err.message, action });
    return null;
  }
}

module.exports = {
  logBusinessEvent
};
