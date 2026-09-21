/**
 * Tenant Ownership & Cross-Tenant Association Guard
 * 
 * Non-enumerating error handling: throws TenantNotFoundError (HTTP 404)
 * so attackers cannot probe resource IDs belonging to other organizations.
 */

class TenantNotFoundError extends Error {
  constructor(entityName = 'Resource') {
    super(`${entityName} not found`);
    this.name = 'TenantNotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND';
  }
}

class TenantAccessError extends Error {
  constructor(message = 'Access denied to organization resource') {
    super(message);
    this.name = 'TenantAccessError';
    this.statusCode = 403;
    this.code = 'TENANT_FORBIDDEN';
  }
}

/**
 * Asserts that a referenced document exists and belongs to the given tenantId.
 * Throws non-enumerating 404 TenantNotFoundError if not found or from another tenant.
 *
 * @param {import('mongoose').Model} Model
 * @param {string|import('mongoose').Types.ObjectId} id
 * @param {string|import('mongoose').Types.ObjectId} tenantId
 * @param {string} entityName
 * @returns {Promise<import('mongoose').Document>}
 */
async function assertTenantOwnership(Model, id, tenantId, entityName = 'Resource') {
  if (!id) return null;
  if (!tenantId) {
    throw new TenantAccessError('Tenant context missing for ownership validation');
  }

  const doc = await Model.findOne({ _id: id, tenantId }).select('_id tenantId');
  if (!doc) {
    throw new TenantNotFoundError(entityName);
  }
  return doc;
}

/**
 * Asserts that two documents or entities belong to the same tenant.
 *
 * @param {Object} docA
 * @param {Object} docB
 * @param {string} relationName
 */
function assertSameTenant(docA, docB, relationName = 'Referenced entities') {
  if (!docA || !docB) return;
  const tenantA = String(docA.tenantId || docA);
  const tenantB = String(docB.tenantId || docB);

  if (tenantA !== tenantB) {
    throw new TenantNotFoundError(relationName);
  }
}

module.exports = {
  TenantNotFoundError,
  TenantAccessError,
  assertTenantOwnership,
  assertSameTenant
};
