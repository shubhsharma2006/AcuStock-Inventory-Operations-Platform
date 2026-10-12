const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const inventoryLotSchema = new mongoose.Schema({
  lotNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
    index: true
  },
  initialQty: {
    type: Number,
    required: true,
    min: 0
  },
  remainingQty: {
    type: Number,
    required: true,
    min: 0
  },
  mfgDate: {
    type: Date
  },
  expiryDate: {
    type: Date,
    required: true,
    index: true
  },
  supplierWarrantyExpiry: {
    type: Date
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  supplierBatchNumber: {
    type: String,
    trim: true
  },
  costPrice: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'DEPLETED', 'EXPIRED', 'BLOCKED', 'RECALLED'],
    default: 'ACTIVE',
    index: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  blockedReason: {
    type: String,
    trim: true
  },
  blockedAt: {
    type: Date
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes
inventoryLotSchema.index({ tenantId: 1, productId: 1, status: 1, expiryDate: 1 });
inventoryLotSchema.index({ tenantId: 1, lotNumber: 1 }, { unique: true });
inventoryLotSchema.index({ tenantId: 1, expiryDate: 1 });

inventoryLotSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('InventoryLot', inventoryLotSchema);
