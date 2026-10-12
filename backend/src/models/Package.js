const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const packageLineItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  serialNumbers: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryLot'
  },
  lotNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  expiryDate: {
    type: Date
  }
}, { _id: true });

const packageSchema = new mongoose.Schema({
  packageNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  salesOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['CREATED', 'PICKED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    default: 'CREATED',
    index: true
  },
  lineItems: [packageLineItemSchema],
  carrier: {
    type: String,
    trim: true
  },
  trackingNumber: {
    type: String,
    trim: true
  },
  weight: {
    type: Number,
    min: 0
  },
  dimensions: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    unit: { type: String, default: 'cm' }
  },
  shippingLabelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShippingLabel'
  },
  shippedAt: {
    type: Date
  },
  deliveredAt: {
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

packageSchema.index({ tenantId: 1, packageNumber: 1 }, { unique: true });
packageSchema.index({ tenantId: 1, salesOrderId: 1, status: 1 });
packageSchema.index({ tenantId: 1, trackingNumber: 1 }, { sparse: true });

packageSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Package', packageSchema);
