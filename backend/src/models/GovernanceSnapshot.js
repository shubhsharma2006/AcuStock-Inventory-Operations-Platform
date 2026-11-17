const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

/**
 * GovernanceSnapshot Model
 * Captures immutable policy revision states for Super Admin module governance,
 * enabling full historical audit compliance and 1-click policy rollback.
 */
const GovernanceSnapshotSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    snapshotType: {
      type: String,
      enum: ['ROLE_POLICY_UPDATE', 'USER_OVERRIDE_UPDATE', 'PERSONA_PRESET_APPLIED', 'GOVERNANCE_ROLLBACK'],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    // The target role, personaId, or target userId
    targetType: {
      type: String,
      enum: ['ROLE', 'USER', 'SYSTEM'],
      required: true,
    },
    targetIdentifier: {
      type: String, // e.g. 'USER' (role) or user ID string
      required: true,
    },
    // The exact state payload at the moment of snapshot
    state: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Reason provided by administrator
    reason: {
      type: String,
      default: '',
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    performedByName: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

GovernanceSnapshotSchema.index({ tenantId: 1, createdAt: -1 });
GovernanceSnapshotSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('GovernanceSnapshot', GovernanceSnapshotSchema);
