const mongoose = require('mongoose');

const serialAuditSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  serial: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  action: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'],
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } // Immutable - no updatedAt
});

// Compound index: covers lookup by tenant, product, product+serial, and time-ordered history
serialAuditSchema.index({ tenantId: 1, productId: 1, serial: 1, createdAt: -1 });
serialAuditSchema.index({ tenantId: 1, serial: 1 });
serialAuditSchema.index({ productId: 1, serial: 1, createdAt: -1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
serialAuditSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('SerialAudit', serialAuditSchema);
