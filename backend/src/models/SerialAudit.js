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
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } // Immutable - no updatedAt
});

// Compound index: covers lookup by product, product+serial, and time-ordered history
// in a single efficient index scan instead of two separate single-field indexes.
serialAuditSchema.index({ productId: 1, serial: 1, createdAt: -1 });

module.exports = mongoose.model('SerialAudit', serialAuditSchema);
