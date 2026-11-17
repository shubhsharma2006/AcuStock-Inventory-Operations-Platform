const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const adjustmentItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WarehouseLocation',
    default: null
  },
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryLot',
    default: null
  },
  serialNumbers: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  quantityBefore: {
    type: Number,
    required: true
  },
  adjustmentQty: {
    type: Number,
    required: true
  },
  quantityAfter: {
    type: Number,
    required: true
  },
  reasonCode: {
    type: String,
    enum: [
      'DAMAGE',
      'SCRAP',
      'THEFT',
      'WRITE_OFF',
      'FOUND',
      'RECLASSIFICATION',
      'EXPIRED',
      'QC_REJECTION',
      'CYCLE_COUNT',
      'CORRECTION',
      'OTHER'
    ],
    required: true
  },
  reasonNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  unitCost: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: true });

const inventoryAdjustmentSchema = new mongoose.Schema({
  adjustmentNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'WRITE_OFF',
      'SCRAP',
      'DAMAGE',
      'FOUND',
      'RECLASSIFICATION',
      'QC_REJECTION',
      'EXPIRED',
      'CYCLE_COUNT',
      'CORRECTION',
      'OTHER'
    ],
    default: 'CORRECTION',
    index: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'POSTED'],
    default: 'DRAFT',
    index: true
  },
  items: [adjustmentItemSchema],
  totalValueImpact: {
    type: Number,
    default: 0
  },
  approvalRequired: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  postedToLedgerAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

inventoryAdjustmentSchema.index({ tenantId: 1, adjustmentNumber: 1 }, { unique: true });
inventoryAdjustmentSchema.index({ tenantId: 1, warehouseId: 1, status: 1 });

inventoryAdjustmentSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);

