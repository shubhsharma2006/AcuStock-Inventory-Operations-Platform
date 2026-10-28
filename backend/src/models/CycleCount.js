const mongoose = require('mongoose');

const cycleCountItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  sku: {
    type: String,
    trim: true,
    uppercase: true
  },
  productName: {
    type: String,
    trim: true
  },
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryLot'
  },
  lotNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  expectedQuantity: {
    type: Number,
    required: true,
    default: 0
  },
  countedQuantity: {
    type: Number,
    default: null
  },
  variance: {
    type: Number,
    default: 0
  },
  varianceValue: {
    type: Number,
    default: 0
  },
  reasonCode: {
    type: String,
    enum: ['NONE', 'SHRINKAGE', 'DAMAGED_WRITE_OFF', 'FOUND_IN_AISLE', 'MISPLACED_RETURN', 'INVENTORY_AUDIT'],
    default: 'NONE'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 300
  }
}, { _id: true });

const cycleCountSchema = new mongoose.Schema({
  countNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RECONCILED', 'CANCELLED'],
    default: 'DRAFT',
    index: true
  },
  blindCount: {
    type: Boolean,
    default: false
  },
  items: {
    type: [cycleCountItemSchema],
    validate: {
      validator: (items) => Array.isArray(items) && items.length > 0,
      message: 'Cycle count session must have at least one product line'
    }
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  supervisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  totalVarianceUnits: {
    type: Number,
    default: 0
  },
  totalVarianceValue: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  reconciledAt: {
    type: Date
  },
  reconciledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, { timestamps: true });

cycleCountSchema.pre('validate', async function () {
  if (!this.countNumber) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    this.countNumber = `CC-${today}-${random}`;
  }
});

cycleCountSchema.index({ tenantId: 1, warehouseId: 1, status: 1 });
cycleCountSchema.index({ tenantId: 1, countNumber: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
cycleCountSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('CycleCount', cycleCountSchema);
