'use strict';

/**
 * AcuStock AI Security Context Builder
 * 
 * Extracts and seals authenticated tenant and role context.
 * Invariant: The LLM NEVER supplies tenantId, userId, or role.
 */

const mongoose = require('mongoose');
const Warehouse = require('../../models/Warehouse');

class SecurityContext {
  constructor({ user, tenantId, source = 'web' }) {
    if (!tenantId) {
      throw new Error('SecurityContext: tenantId is strictly required');
    }
    if (!user || !user._id) {
      throw new Error('SecurityContext: valid authenticated user is required');
    }

    this.tenantId = new mongoose.Types.ObjectId(tenantId);
    this.userId = new mongoose.Types.ObjectId(user._id);
    this.role = user.role || 'USER';
    this.assignedWarehouseId = user.assignedWarehouseId ? new mongoose.Types.ObjectId(user.assignedWarehouseId) : null;
    this.userName = user.name || 'User';
    this.userEmail = user.email || '';
    this.source = source; // 'web' | 'whatsapp' | 'api'

    // Freeze instance so downstream tools or LLM handlers cannot mutate security parameters
    Object.freeze(this);
  }

  isAtLeastManager() {
    return ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(this.role);
  }

  isAdmin() {
    return ['ADMIN', 'SUPER_ADMIN'].includes(this.role);
  }

  /**
   * Verifies that a requested warehouseId belongs to the current tenant and
   * that the user has permission to inspect or mutate it.
   */
  async verifyWarehouseAccess(warehouseId) {
    if (!warehouseId) return true;

    // If regular user has an assigned warehouse, restrict to that warehouse
    if (this.role === 'USER' && this.assignedWarehouseId) {
      if (this.assignedWarehouseId.toString() !== warehouseId.toString()) {
        return false;
      }
    }

    const exists = await Warehouse.exists({
      _id: warehouseId,
      tenantId: this.tenantId,
      isActive: true
    });

    return Boolean(exists);
  }
}

/**
 * Creates a SecurityContext from an Express request authenticated by auth middleware
 */
function createSecurityContextFromRequest(req, source = 'web') {
  if (!req.user) {
    throw new Error('Authentication required: req.user is undefined');
  }

  const tenantId = req.user.tenantId || req.user.companyId || req.headers['x-tenant-id'];
  if (!tenantId) {
    throw new Error('Tenant context missing from authenticated session');
  }

  return new SecurityContext({
    user: req.user,
    tenantId,
    source
  });
}

/**
 * Creates a SecurityContext from a validated WhatsApp user record
 */
function createSecurityContextFromUser(user, source = 'whatsapp') {
  const tenantId = user.tenantId || user.companyId;
  if (!tenantId) {
    throw new Error('Tenant context missing from user record');
  }

  return new SecurityContext({
    user,
    tenantId,
    source
  });
}

module.exports = {
  SecurityContext,
  createSecurityContextFromRequest,
  createSecurityContextFromUser
};
