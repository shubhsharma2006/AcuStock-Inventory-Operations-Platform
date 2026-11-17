const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const reconciliationTaskSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  cycleCountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CycleCount',
    required: true,
    index: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
    index: true
  },
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryLot',
    default: null
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WarehouseLocation',
    default: null
  },
  expectedQty: {
    type: Number,
    required: true
  },
  countedQty: {
    type: Number,
    required: true
  },
  varianceQty: {
    type: Number,
    required: true // countedQty - expectedQty
  },
  varianceValue: {
    type: Number,
    default: 0
  },
  variancePercent: {
    type: Number,
    default: 0
  },
  autoReconciled: {
    type: Boolean,
    default: false,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'AUTO_RECONCILED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'POSTED'],
    default: 'PENDING',
    index: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  adjustmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryAdjustment'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

reconciliationTaskSchema.index({ tenantId: 1, warehouseId: 1, status: 1 });
reconciliationTaskSchema.index({ tenantId: 1, cycleCountId: 1 });

reconciliationTaskSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('ReconciliationTask', reconciliationTaskSchema);

