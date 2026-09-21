/**
 * Data Scope & Dashboard Privacy Helper
 * ─────────────────────────────────────────────────────────────
 * Enforces strict 4-Role RBAC data isolation and tenant privacy.
 * 
 * Rules:
 *   - SUPER_ADMIN / ADMIN: Sees all records within their tenant.
 *   - MANAGER: Sees records within their team/department or assigned records.
 *   - USER: Strictly restricted to records they created (createdBy) or are assigned to (assignedTo).
 *   - TENANT ISOLATION: Automatically attaches { tenantId } when tenant context exists.
 */

function applyDataScope(req, baseQuery = {}, options = {}) {
  const query = { ...baseQuery };
  const user = req.user;

  // 1. Tenant Isolation
  if (req.tenantId) {
    query.tenantId = req.tenantId;
  }

  // If no authenticated user context, return base query
  if (!user) return query;

  const role = user.role;

  // 2. User-Level Privacy & Isolation
  if (role === 'USER') {
    // Standard user can ONLY access their own records
    const userField = options.userField || 'createdBy';
    const assignedField = options.assignedField || 'assignedTo';

    query.$or = [
      { [userField]: user._id },
      { [assignedField]: user._id },
    ];
  } else if (role === 'MANAGER') {
    // Manager access: can see own records + managed user records
    // If managedUserIds is provided in options, include them
    if (options.managedUserIds && Array.isArray(options.managedUserIds) && options.managedUserIds.length > 0) {
      const userField = options.userField || 'createdBy';
      query[userField] = { $in: [user._id, ...options.managedUserIds] };
    }
  }
  // ADMIN and SUPER_ADMIN have full tenant-wide access

  return query;
}

/**
 * Ensures a single document belongs to the requesting user's scope.
 * Throws 403 Forbidden error if user tries to access another user's private resource.
 */
function verifyResourceScope(req, resource, options = {}) {
  if (!req.user || !resource) return true;

  const role = req.user.role;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;

  const userField = options.userField || 'createdBy';
  const resourceOwnerId = resource[userField]?.toString();
  const currentUserId = req.user._id.toString();

  if (role === 'USER') {
    const assignedField = options.assignedField || 'assignedTo';
    const assignedId = resource[assignedField]?.toString();

    if (resourceOwnerId !== currentUserId && assignedId !== currentUserId) {
      const error = new Error('Forbidden: You do not have permission to view or modify this resource');
      error.statusCode = 403;
      error.code = 'SCOPE_FORBIDDEN';
      throw error;
    }
  }

  return true;
}

module.exports = {
  applyDataScope,
  verifyResourceScope,
};
