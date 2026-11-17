const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const landedCostComponentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['FREIGHT', 'CUSTOMS_DUTY', 'INSURANCE', 'HANDLING', 'INSPECTION', 'BROKERAGE', 'OTHER'],
    required: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    uppercase: true,
    trim: true,
    default: 'INR'
  },
  apportionMethod: {
    type: String,
    enum: ['BY_VALUE', 'BY_WEIGHT', 'BY_QUANTITY', 'BY_VOLUME'],
    default: 'BY_VALUE'
  },
  vendorRef: {
    type: String,
    trim: true
  }
}, { _id: true });

const lineAllocationSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  poLineQty: {
    type: Number,
    required: true,
    min: 0.0001
  },
  itemCostInPoCurrency: {
    type: Number,
    required: true,
    min: 0
  },
  itemCostInBaseCurrency: {
    type: Number,
    required: true,
    min: 0
  },
  allocatedLandedCost: {
    type: Number,
    default: 0,
    min: 0
  },
  totalUnitCost: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: true });

const landedCostSchema = new mongoose.Schema({
  landedCostNumber: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  purchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  poCurrency: {
    type: String,
    uppercase: true,
    default: 'INR',
    trim: true
  },
  baseCurrency: {
    type: String,
    uppercase: true,
    default: 'INR',
    trim: true
  },
  exchangeRate: {
    type: Number,
    default: 1.0,
    min: 0.000001
  },
  components: [landedCostComponentSchema],
  totalLandedCost: {
    type: Number,
    default: 0,
    min: 0
  },
  lineAllocations: [lineAllocationSchema],
  status: {
    type: String,
    enum: ['DRAFT', 'FINALIZED'],
    default: 'DRAFT',
    index: true
  },
  finalizedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

landedCostSchema.index({ tenantId: 1, landedCostNumber: 1 }, { unique: true });
landedCostSchema.index({ tenantId: 1, purchaseOrderId: 1 });

landedCostSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('LandedCost', landedCostSchema);

