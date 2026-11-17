const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const componentConsumptionSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  plannedQty: {
    type: Number,
    required: true,
    min: 0.001
  },
  consumedQty: {
    type: Number,
    default: 0,
    min: 0
  },
  wastedQty: {
    type: Number,
    default: 0,
    min: 0
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WarehouseLocation',
    default: null
  }
}, { _id: true });

const workOrderSchema = new mongoose.Schema({
  workOrderNumber: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  kitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Kit',
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
    enum: ['ASSEMBLE', 'DISASSEMBLE'],
    default: 'ASSEMBLE',
    index: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
    index: true
  },
  quantityPlanned: {
    type: Number,
    required: true,
    min: 1
  },
  quantityCompleted: {
    type: Number,
    default: 0,
    min: 0
  },
  outputItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  outputLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WarehouseLocation',
    default: null
  },
  componentConsumption: [componentConsumptionSchema],
  startedAt: Date,
  completedAt: Date,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

workOrderSchema.index({ tenantId: 1, workOrderNumber: 1 }, { unique: true });
workOrderSchema.index({ tenantId: 1, status: 1 });

workOrderSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('WorkOrder', workOrderSchema);

